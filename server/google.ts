/* Sign in with Google: the OAuth authorization-code flow with PKCE, with no library. The browser is
   sent to Google with a random state and a code challenge; Google sends it back with a code, which
   is traded here (with the client secret and the verifier) for an ID token naming the person.
   The token comes straight from Google over TLS, so its claims are read without checking its
   signature, as OpenID Connect allows for a token taken from the token endpoint itself.
   In development without Google's keys, a stand-in takes Google's place (googleStandIn): a page on
   this server to pick one of two made-up accounts, so the whole sign-in can be tried locally. */
import { createHash, randomBytes } from 'node:crypto';

export interface GoogleProfile { sub: string; email: string; emailVerified: boolean; name: string }

export interface GoogleAuth {
  /** Where to send the browser to pick a Google account. */
  authUrl(p: { redirectUri: string; state: string; challenge: string }): string;
  /** The person the code returned to the redirect belongs to. */
  exchange(p: { code: string; verifier: string; redirectUri: string }): Promise<GoogleProfile>;
}

/** A PKCE pair: the verifier stays with the browser's flow, the challenge goes to Google. */
export function pkce() {
  const verifier = randomBytes(32).toString('base64url');
  return { verifier, challenge: createHash('sha256').update(verifier).digest('base64url') };
}

const AUTH = 'https://accounts.google.com/o/oauth2/v2/auth', TOKEN = 'https://oauth2.googleapis.com/token';
const ISSUERS = ['https://accounts.google.com', 'accounts.google.com'];

function googleAuth(clientId: string, clientSecret: string): GoogleAuth {
  return {
    authUrl({ redirectUri, state, challenge }) {
      const q = new URLSearchParams({
        client_id: clientId, redirect_uri: redirectUri, response_type: 'code', scope: 'openid email profile',
        state, code_challenge: challenge, code_challenge_method: 'S256',
        // someone signed in to two Google accounts gets to choose which
        prompt: 'select_account'
      });
      return `${AUTH}?${q}`;
    },

    async exchange({ code, verifier, redirectUri }) {
      const res = await fetch(TOKEN, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({ code, client_id: clientId, client_secret: clientSecret, redirect_uri: redirectUri, grant_type: 'authorization_code', code_verifier: verifier }),
        signal: AbortSignal.timeout(10e3)
      });
      const body = await res.json().catch(() => ({})) as { id_token?: string; error?: string };
      if (!res.ok || !body.id_token) throw new Error(`Google turned the sign-in down (${body.error ?? res.status})`);
      const claims = JSON.parse(Buffer.from(body.id_token.split('.')[1] ?? '', 'base64url').toString()) as Record<string, unknown>;
      if (!ISSUERS.includes(claims.iss as string) || claims.aud !== clientId || !(Number(claims.exp) * 1000 > Date.now()) || typeof claims.sub !== 'string' || typeof claims.email !== 'string') {
        throw new Error('Google’s answer didn’t check out');
      }
      return { sub: claims.sub, email: claims.email, emailVerified: claims.email_verified === true, name: typeof claims.name === 'string' ? claims.name : '' };
    }
  };
}

/** Google sign-in when GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET are set, else none. */
export function googleFromEnv(env = process.env): GoogleAuth | null {
  const id = env.GOOGLE_CLIENT_ID?.trim(), secret = env.GOOGLE_CLIENT_SECRET?.trim();
  return id && secret ? googleAuth(id, secret) : null;
}

/** Where the stand-in's account picker is served (server/index.ts mounts it in development only). */
export const STAND_IN_PATH = '/dev/google';

/** The stand-in's made-up accounts. Their emails are under .test, a name no real address has, so
    signing in with one never lands in (or takes the password off) a real account in the database. */
const STAND_IN_PEOPLE: Record<string, GoogleProfile> = {
  mina: { sub: 'stand-in-mina', email: 'mina@stand-in.test', emailVerified: true, name: 'Mina' },
  jun: { sub: 'stand-in-jun', email: 'jun@stand-in.test', emailVerified: true, name: 'Jun' }
};

/** A stand-in for Google, for development without its keys: authUrl sends the browser to this
    server's account picker (`chooser`), whose links come back to the redirect as Google would, with a
    code naming the account; exchange checks the PKCE verifier against the challenge as Google does.
    The way back is the one authUrl was given, kept by state, never one taken from the address. */
export function googleStandIn(): GoogleAuth & { chooser(state: unknown): string } {
  const flows = new Map<string, { redirectUri: string; challenge: string; at: number }>();
  const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');
  return {
    authUrl({ redirectUri, state, challenge }) {
      // forget sign-ins left unfinished, as Google's 10-minute cookie would
      for (const [k, f] of flows) if (Date.now() - f.at > 600e3) flows.delete(k);
      flows.set(state, { redirectUri, challenge, at: Date.now() });
      return `${STAND_IN_PATH}?${new URLSearchParams({ state })}`;
    },

    async exchange({ code, verifier, redirectUri }) {
      const [who, state] = code.split('.'), flow = flows.get(state ?? ''), person = STAND_IN_PEOPLE[who];
      flows.delete(state ?? '');
      if (!flow || !person || flow.redirectUri !== redirectUri || createHash('sha256').update(verifier).digest('base64url') !== flow.challenge) {
        throw new Error('The stand-in for Google turned the sign-in down');
      }
      return person;
    },

    chooser(state) {
      const flow = typeof state === 'string' ? flows.get(state) : undefined;
      const back = (q: Record<string, string>) => esc(`${flow!.redirectUri}?${new URLSearchParams({ ...q, state: state as string })}`);
      const body = !flow ? '<p>This sign-in has expired. Close this window and try again.</p>'
        : `<p>to continue to TypeLab</p>${Object.entries(STAND_IN_PEOPLE).map(([id, p]) =>
          `<a class="who" href="${back({ code: `${id}.${state}` })}"><span class="initial">${esc(p.name[0])}</span><span><b>${esc(p.name)}</b><small>${esc(p.email)}</small></span></a>`).join('')}
<a class="cancel" href="${back({ error: 'access_denied' })}">Cancel</a>`;
      return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Choose an account</title><style>
body{margin:0;min-height:100vh;display:grid;place-items:center;background:#f3f4f4;color:#1f2424;font:14px/1.45 Inter,system-ui,sans-serif}
main{width:min(360px,calc(100vw - 32px));background:#fff;border:1px solid #e3e5e5;border-radius:12px;padding:24px 0 14px}
.note{margin:0 24px 16px;padding:6px 10px;border-radius:6px;background:#f3f4f4;color:#5c6363;font-size:12px}
h1{margin:0 24px 2px;font-size:20px;font-weight:600}p{margin:0 24px 16px;color:#5c6363}
.who{display:flex;gap:12px;align-items:center;padding:12px 24px;border-top:1px solid #eceeee;color:inherit;text-decoration:none}
.who:hover{background:#f7f8f8}.who small{display:block;color:#5c6363}
.initial{width:32px;height:32px;border-radius:50%;background:#2f5fd0;color:#fff;display:grid;place-items:center;font-weight:600}
.cancel{display:inline-block;margin:10px 24px 0;color:#2f5fd0;text-decoration:none}
</style></head><body><main>
<div class="note">A stand-in for Google, in development only. Set GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET to use Google itself.</div>
<h1>Choose an account</h1>
${body}
</main></body></html>`;
    }
  };
}
