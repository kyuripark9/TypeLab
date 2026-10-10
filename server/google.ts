/* Sign in with Google: the OAuth authorization-code flow with PKCE, with no library. The browser is
   sent to Google with a random state and a code challenge; Google sends it back with a code, which
   is traded here (with the client secret and the verifier) for an ID token naming the person.
   The token comes straight from Google over TLS, so its claims are read without checking its
   signature, as OpenID Connect allows for a token taken from the token endpoint itself. */
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
