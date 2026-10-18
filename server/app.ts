/* The TypeLab API. Kept separate from index.ts so tests can mount it on an in-memory database. */
import { randomBytes, timingSafeEqual } from 'node:crypto';
import compression from 'compression';
import express, { type NextFunction, type Request, type Response, type Router } from 'express';
import { styleById } from '../shared/content';
import { cleanName, cleanSample, type DesignInput } from '../shared/design';
import { cleanVersions, packVersions } from '../shared/font-log';
import { cleanLog } from '../shared/letter-log';
import { isValidParams, type Params } from '../shared/params';
import { FREE_FAMILIES, INTRO_CHARS, parseFontId } from '../shared/free-fonts';
import type { DesignStore } from './db';
import { AccountStore, RESET_MINUTES, SESSION_DAYS } from './accounts';
import type { Mail, Mailer } from './mail';
import { AUTH_CHANNEL, GOOGLE_RESULT_PARAM, cleanEmail, cleanUserName, isEmail, passwordProblem, type GoogleIntent, type GoogleResult, type User } from '../shared/account';
import { pkce, type GoogleAuth } from './google';
import { familyMember, familyMembers, isWeightId, type FamilyRequest, type MemberRequest, type WeightId } from '../shared/family';
import type { ExportJob } from './export';
import { Busy, ExportPool } from './export-pool';
import { FreeFonts } from './free-fonts';

class HttpError extends Error {
  constructor(public status: number, message: string) { super(message); }
}

const fields = (body: unknown) => (body && typeof body === 'object' ? body : {}) as Record<string, unknown>;

/** Validate a design body. Params must already be valid: the client never sends partial ones. The letters' record of
    their edits, the font's History and the name's sample are only kept, so what of them doesn't read is dropped rather
    than refused. */
function readDesign(body: unknown): DesignInput {
  const b = fields(body);
  if (!isValidParams(b.params)) throw new HttpError(400, 'This design has settings TypeLab can’t read');
  if (typeof b.styleId !== 'string' || !styleById(b.styleId)) throw new HttpError(400, 'This design’s style isn’t one TypeLab knows');
  const sample = cleanSample(b.sample);
  return { name: cleanName(b.name), styleId: b.styleId, params: b.params, ...(b.log === undefined ? {} : { log: cleanLog(b.log) }),
    ...(b.versions === undefined ? {} : { versions: packVersions(cleanVersions(b.versions)) }), ...(sample ? { sample } : {}) };
}

/** An export's design and name, and whether its fonts take the accented letters too (`accents`, off unless true). */
function readExport(body: unknown) {
  const b = fields(body);
  if (!isValidParams(b.params)) throw new HttpError(400, 'This design has settings TypeLab can’t read');
  if (b.accents !== undefined && typeof b.accents !== 'boolean') throw new HttpError(400, 'accents must be true or false');
  return { name: cleanName(b.name), params: b.params, accents: b.accents === true };
}

/** Which members of a family to build: at least one style, each a weight upright or italic. A request in the
    older shape, weights each upright, italic or both (`{ weights, upright, italic }`), names the same styles. */
function readFamily(body: unknown): FamilyRequest {
  const b = fields(body).family as Record<string, unknown> | undefined;
  if (!b || typeof b !== 'object') throw new HttpError(400, 'family is missing');
  if (!isWeightId(b.anchor)) throw new HttpError(400, 'family.anchor is not a weight');
  const styles = Array.isArray(b.styles) ? b.styles.map(fields)
    : Array.isArray(b.weights) ? b.weights.flatMap(weight => [...(b.upright ? [{ weight, italic: false }] : []), ...(b.italic ? [{ weight, italic: true }] : [])])
    : [];
  if (!styles.length || !styles.every(s => isWeightId(s.weight) && typeof s.italic === 'boolean')) throw new HttpError(400, 'family.styles must name at least one style, each a weight and italic true or false');
  return { anchor: b.anchor, styles: styles.map(s => ({ weight: s.weight as WeightId, italic: s.italic as boolean })) };
}

/** Which member of its family a single font file is, if one is named; without one it is the design as it is. */
function readMember(body: unknown): MemberRequest | null {
  const all = fields(body);
  if (all.member === undefined) return null;
  const b = fields(all.member);
  if (!isWeightId(b.anchor) || !isWeightId(b.weight) || typeof b.italic !== 'boolean') throw new HttpError(400, 'member needs an anchor, a weight and italic true or false');
  return { anchor: b.anchor, weight: b.weight, italic: b.italic };
}

// the cookies: this browser's id, its sign-in token, and a Google sign-in in progress
const OWNER_COOKIE = 'typelab_owner', SESSION_COOKIE = 'typelab_session', GOOGLE_COOKIE = 'typelab_google';
/* What a browser id and a session token must look like to be read from their cookies. A browser id is 18
   random bytes, 24 base64url characters (browserOf); a session token is 32 random bytes, 43 characters
   (AccountStore.startSession). Made longer or shorter than its pattern admits, a browser id would orphan
   every browser's designs and a token would sign everyone out. base64url has no ':', so a browser's id
   never reads as an account's `user:<id>` owner. */
const BROWSER_ID = '[A-Za-z0-9_-]{16,64}', SESSION_TOKEN = '[A-Za-z0-9_-]{40,64}';
const cookie = (req: Request, name: string, pattern: string) =>
  new RegExp(`(?:^|;\\s*)${name}=(${pattern})(?:;|$)`).exec(req.headers.cookie ?? '')?.[1];
/** The browser's own id, from its cookie; a browser without one is given one. Designs saved while
    signed out are kept per browser, so "My designs" holds only the fonts saved there. */
function browserOf(req: Request, res: Response): string {
  const id = cookie(req, OWNER_COOKIE, BROWSER_ID);
  if (id) return id;
  const fresh = randomBytes(18).toString('base64url');
  res.append('Set-Cookie', `${OWNER_COOKIE}=${fresh}; Path=/; Max-Age=${10 * 365 * 24 * 3600}; HttpOnly; SameSite=Lax`);
  return fresh;
}
/** Whose designs a request sees: the account signed in, else the browser. */
const accountOwner = (u: User) => `user:${u.id}`;

/** Who's asking, as createApp's middleware puts it on res.locals for /designs and /auth: the browser, the
    account signed in on it and that sign-in's token (both or neither), and whose designs it sees. */
interface Who { browser: string; owner: string; user: User | null; token?: string }
const who = (res: Response) => res.locals as Who;

function setSession(req: Request, res: Response, token: string | null) {
  const secure = req.secure ? '; Secure' : '';
  res.append('Set-Cookie', token
    ? `${SESSION_COOKIE}=${token}; Path=/; Max-Age=${SESSION_DAYS * 86400}; HttpOnly; SameSite=Lax${secure}`
    : `${SESSION_COOKIE}=; Path=/; Max-Age=0; HttpOnly; SameSite=Lax${secure}`);
}

/** The site's own address: PUBLIC_URL when set, else the one this was asked on (development: index.ts offers password
    reset in production only with PUBLIC_URL, as a link built from the Host header could point anywhere). */
const siteUrl = (req: Request) => process.env.PUBLIC_URL?.replace(/\/+$/, '') || `${req.protocol}://${req.get('host')}`;
/** Where Google sends the browser back to. */
const redirectUri = (req: Request) => `${siteUrl(req)}/api/auth/google/callback`;

/** The email a forgotten password sends: the link that sets a new one, and what to do if it wasn't asked for. */
function resetMail(to: string, name: string, link: string): Mail {
  const html = (t: string) => t.replace(/[<>&"]/g, c => `&#${c.charCodeAt(0)};`);
  const hours = RESET_MINUTES === 60 ? 'an hour' : `${RESET_MINUTES} minutes`;
  return {
    to,
    subject: 'Reset your TypeLab password',
    text: `Hi ${name},\n\nSomeone, hopefully you, asked to reset the password of the TypeLab account for ${to}. To set a new one, open this link within ${hours}:\n\n${link}\n\nIf it wasn’t you, ignore this email: your password stays as it is.\n\nTypeLab`,
    html: `<p>Hi ${html(name)},</p><p>Someone, hopefully you, asked to reset the password of the TypeLab account for ${html(to)}. To set a new one, open this link within ${hours}:</p>`
      + `<p><a href="${html(link)}">Set a new password</a></p><p>If it wasn’t you, ignore this email: your password stays as it is.</p><p>TypeLab</p>`
  };
}

/** Back to a page with how Google sign-in went, for the page to show and take out of the address. */
function withResult(back: string, result: GoogleResult) {
  const url = new URL(back, 'http://x');
  url.searchParams.set(GOOGLE_RESULT_PARAM, JSON.stringify(result.ok ? { ...result, user: undefined } : result));
  return url.pathname + url.search + url.hash;
}

/** Where to come back to after Google: a path on this site, never another site. */
const backPath = (v: unknown) => (typeof v === 'string' && /^\/(?![/\\])/.test(v) && v.length < 500 ? v : '/');

/** A Google sign-in in progress, kept in a short-lived cookie for the browser that started it. */
interface GoogleFlow { state: string; verifier: string; intent: GoogleIntent; popup: boolean; back: string }

function readFlow(req: Request): GoogleFlow | null {
  try {
    const f = JSON.parse(Buffer.from(cookie(req, GOOGLE_COOKIE, '[A-Za-z0-9_-]{1,2000}') ?? '', 'base64url').toString());
    return typeof f.state === 'string' && typeof f.verifier === 'string' ? { ...f, back: backPath(f.back) } : null;
  } catch { return null; }
}

const sameString = (a: string, b: string) => a.length === b.length && timingSafeEqual(Buffer.from(a), Buffer.from(b));

/** The page the Google popup lands on: it tells every TypeLab tab how it went (the message client/state/auth.ts
    listens for), and closes. */
function popupPage(result: GoogleResult, back: string) {
  const data = JSON.stringify(result).replace(/</g, '\\u003c');
  const said = result.ok ? (result.intent === 'link' ? 'Google is connected.' : 'You’re signed in.') : result.cancelled ? 'Sign-in cancelled.' : result.error;
  const html = (t: string) => t.replace(/[<>&"]/g, c => `&#${c.charCodeAt(0)};`);
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>TypeLab</title>
<style>body{margin:0;min-height:100vh;display:grid;place-items:center;background:#fef5ec;color:#201f1d;font:500 15px/1.5 Manrope,system-ui,sans-serif}main{text-align:center;padding:24px}a{color:inherit;font-weight:600}</style></head>
<body><main><p>${html(said)}</p><p><a href="${html(back)}">Back to TypeLab</a></p></main>
<script>try{new BroadcastChannel('${AUTH_CHANNEL}').postMessage({type:'google',result:${data}})}catch(e){}window.close()</script></body></html>`;
}

/** Tries per key within a window: after `max` in `windowMs` (15 minutes) the key waits out the rest of it.
    `throttle` counts wrong passwords per address and email (10); `lookups` counts every email check per address (60). */
class Throttle {
  private fails = new Map<string, { n: number; since: number }>();
  constructor(private max = 10, private windowMs = 15 * 60e3) {}
  check(key: string) {
    const f = this.fails.get(key);
    if (f && Date.now() - f.since > this.windowMs) this.fails.delete(key);
    else if (f && f.n >= this.max) throw new HttpError(429, 'Too many tries. Wait a few minutes, then try again');
  }
  fail(key: string) {
    const f = this.fails.get(key);
    if (f) f.n++; else this.fails.set(key, { n: 1, since: Date.now() });
    if (this.fails.size > 10000) this.fails.clear();
  }
  clear(key: string) { this.fails.delete(key); }
}

function readName(body: unknown): string {
  const b = fields(body);
  if (typeof b.name !== 'string') throw new HttpError(400, 'name is missing');
  return cleanName(b.name);
}

const attachment = (res: Response, file: string, type: string) => {
  res.type(type);
  res.setHeader('Content-Disposition', `attachment; filename="${file}"`);
};

/** What the route groups share: where designs and accounts are kept, Google sign-in and the mail password resets
    are sent by when this server offers them, the free fonts, and the workers exports are built on. */
interface Ctx { store: DesignStore; accounts: AccountStore; google: GoogleAuth | null; mail: Mailer | null; fonts: FreeFonts; exports: ExportPool }

/** The signed-in account, or 401. */
function me(res: Response): User {
  const { user } = who(res);
  if (!user) throw new HttpError(401, 'Sign in first');
  return user;
}

/** Sign this browser in, bringing along the fonts it saved while signed out. */
function signIn({ store, accounts }: Ctx, req: Request, res: Response, user: User) {
  const { token, browser } = who(res);
  if (token) accounts.endSession(token);
  setSession(req, res, accounts.startSession(user.id));
  const moved = store.moveAll(browser, accountOwner(user));
  return { user, moved };
}

/** The existing account a Google sign-in goes to, connecting Google to it: the one that Google account is
    connected to, else the one with its email. null when there's neither, and a new account is made. */
export function joinGoogle(accounts: AccountStore, linked: User | null, g: { sub: string; email: string }): { user: User; passwordRemoved: boolean } | null {
  if (linked) return { user: accounts.linkGoogle(linked.id, g)!, passwordRemoved: false };
  const found = accounts.withEmail(g.email);
  if (!found) return null;
  // Nothing proved that whoever signed up with this email and a password owns it; Google just
  // did. Their password is switched off and any browser on it signed out, so an account
  // someone set up in another person's name can't be read through after they move in.
  const removed = !found.verified && found.user.hasPassword;
  if (removed) { accounts.clearPassword(found.user.id); accounts.endAllSessions(found.user.id); }
  return { user: accounts.linkGoogle(found.user.id, g)!, passwordRemoved: removed };
}

/** Signing up and in with an email and password, and the account itself: its name, its password, the
    other browsers signed in to it, and closing it. */
function accountRoutes(api: Router, ctx: Ctx) {
  const { store, accounts, google, mail } = ctx, throttle = new Throttle(), lookups = new Throttle(60), resets = new Throttle(5);

  // who's signed in, and whether this server offers Google sign-in and password reset
  api.get('/auth/me', (_req, res) => { res.json({ user: who(res).user, google: !!google, reset: !!mail }); });

  /** The sign-in dialog's first step: whether this email has an account, and how it signs in. */
  api.post('/auth/check', (req, res) => {
    const email = cleanEmail(fields(req.body).email);
    if (!isEmail(email)) throw new HttpError(400, 'Enter a valid email address');
    lookups.check(req.ip ?? '');
    lookups.fail(req.ip ?? '');
    res.json(accounts.check(email));
  });

  api.post('/auth/signup', async (req, res) => {
    const b = fields(req.body), email = cleanEmail(b.email);
    if (!isEmail(email)) throw new HttpError(400, 'Enter a valid email address');
    const problem = passwordProblem(b.password);
    if (problem) throw new HttpError(400, problem);
    const user = await accounts.create(email, cleanUserName(b.name, email), b.password as string);
    if (!user) throw new HttpError(409, 'There’s already an account with this email. Sign in instead');
    res.status(201).json(signIn(ctx, req, res, user));
  });

  api.post('/auth/login', async (req, res) => {
    const b = fields(req.body), email = cleanEmail(b.email), key = `${req.ip}|${email}`;
    if (!email || typeof b.password !== 'string' || !b.password) throw new HttpError(400, 'Enter your email and password');
    throttle.check(key);
    const user = await accounts.verify(email, b.password);
    if (!user) {
      throttle.fail(key);
      const has = accounts.check(email);
      if (has.exists && !has.password) throw new HttpError(401, 'This account signs in with Google');
      throw new HttpError(401, 'That email and password don’t match an account');
    }
    throttle.clear(key);
    res.json(signIn(ctx, req, res, user));
  });

  /** Forgot the password: email a link that sets a new one. Answered the same whether or not the email has an
      account; at most five asked for in 15 minutes per address and per email. */
  api.post('/auth/reset', async (req, res) => {
    if (!mail) throw new HttpError(503, 'Password reset isn’t set up on this server');
    const email = cleanEmail(fields(req.body).email), ip = `ip:${req.ip}`;
    if (!isEmail(email)) throw new HttpError(400, 'Enter a valid email address');
    resets.check(ip);
    resets.check(email);
    resets.fail(ip);
    resets.fail(email);
    const started = accounts.startReset(email);
    if (started) {
      const link = `${siteUrl(req)}/reset?${new URLSearchParams({ token: started.token })}`;
      try { await mail.send(resetMail(email, started.user.name, link)); } catch (e) {
        console.error(e);
        throw new HttpError(502, 'Couldn’t send the email. Try again in a moment');
      }
    }
    res.status(204).end();
  });

  /** A reset link used: the new password set, every browser signed out of the account, and this one signed in. The
      email is the holder's now, as the link reached them there. */
  api.post('/auth/reset/confirm', async (req, res) => {
    const b = fields(req.body), problem = passwordProblem(b.password);
    if (problem) throw new HttpError(400, problem);
    const user = typeof b.token === 'string' && b.token.length <= 64 ? accounts.takeReset(b.token) : null;
    if (!user) throw new HttpError(400, 'This link has expired or was used already. Ask for a new one');
    await accounts.setPassword(user.id, b.password as string);
    accounts.verifyEmail(user.id);
    accounts.endAllSessions(user.id);
    res.json(signIn(ctx, req, res, accounts.get(user.id)!));
  });

  api.post('/auth/logout', (req, res) => {
    const { token } = who(res);
    if (token) accounts.endSession(token);
    setSession(req, res, null);
    res.status(204).end();
  });

  api.patch('/auth/me', (req, res) => {
    const user = me(res);
    res.json({ user: accounts.rename(user.id, cleanUserName(fields(req.body).name, user.email)) });
  });

  /** Change the password, or set a first one on an account made with Google. A change signs the
      other browsers out. */
  api.post('/auth/password', async (req, res) => {
    const user = me(res), b = fields(req.body);
    if (user.hasPassword && (typeof b.current !== 'string' || !(await accounts.checkPassword(user.id, b.current)))) throw new HttpError(403, 'Your current password isn’t right');
    const problem = passwordProblem(b.next);
    if (problem) throw new HttpError(400, problem);
    await accounts.setPassword(user.id, b.next as string);
    if (user.hasPassword) accounts.endOtherSessions(user.id, who(res).token!);
    res.json({ user: accounts.get(user.id) });
  });

  /** How many other browsers are signed in, and signing them all out. */
  api.get('/auth/sessions', (_req, res) => { res.json({ others: accounts.otherSessions(me(res).id, who(res).token!) }); });
  api.delete('/auth/sessions', (_req, res) => {
    accounts.endOtherSessions(me(res).id, who(res).token!);
    res.status(204).end();
  });

  /** Close the account and delete every font saved in it: confirmed with the password, or with the
      email typed out on an account that has none. */
  api.delete('/auth/me', async (req, res) => {
    const user = me(res), b = fields(req.body);
    if (!user.hasPassword) {
      if (cleanEmail(b.confirm) !== user.email) throw new HttpError(403, 'Type your email exactly to confirm');
    } else if (typeof b.password !== 'string' || !(await accounts.checkPassword(user.id, b.password))) throw new HttpError(403, 'Your password isn’t right');
    store.deleteAll(accountOwner(user));
    accounts.delete(user.id);
    setSession(req, res, null);
    res.status(204).end();
  });
}

/** Signing in with Google, and connecting it to an account or disconnecting it. */
function googleRoutes(api: Router, ctx: Ctx) {
  const { accounts, google } = ctx;

  /** Disconnect Google, which needs a password to sign in with instead. */
  api.delete('/auth/google', (_req, res) => {
    const user = me(res);
    if (!user.hasPassword) throw new HttpError(400, 'Set a password first, so you can still sign in');
    res.json({ user: accounts.unlinkGoogle(user.id) });
  });

  /** Start signing in with (or connecting) Google: off to Google, with the way back in a cookie. */
  api.get('/auth/google', (req, res) => {
    const intent = req.query.intent === 'link' ? 'link' : 'signin', popup = req.query.popup === '1', back = backPath(req.query.back);
    const fail = (error: string) => (popup ? res.type('html').send(popupPage({ ok: false, error }, back)) : res.redirect(303, withResult(back, { ok: false, error })));
    if (!google) return void fail('Google sign-in isn’t set up on this server');
    if (intent === 'link' && !who(res).user) return void fail('Sign in first');
    const { verifier, challenge } = pkce(), state = randomBytes(18).toString('base64url');
    const flow: GoogleFlow = { state, verifier, intent, popup, back };
    res.append('Set-Cookie', `${GOOGLE_COOKIE}=${Buffer.from(JSON.stringify(flow)).toString('base64url')}; Path=/api/auth/google; Max-Age=600; HttpOnly; SameSite=Lax${req.secure ? '; Secure' : ''}`);
    res.redirect(303, google.authUrl({ redirectUri: redirectUri(req), state, challenge }));
  });

  /** Google sends the browser back here. Sign in to the account it's connected to, else to the
      account with its email (connecting it), else to a new account. */
  api.get('/auth/google/callback', async (req, res) => {
    const flow = readFlow(req);
    res.append('Set-Cookie', `${GOOGLE_COOKIE}=; Path=/api/auth/google; Max-Age=0; HttpOnly; SameSite=Lax`);
    const finish = (result: GoogleResult) => {
      if (flow?.popup) res.type('html').send(popupPage(result, flow.back));
      else res.redirect(303, withResult(flow?.back ?? '/', result));
    };
    const q = req.query;
    if (!google || !flow || typeof q.state !== 'string' || !sameString(q.state, flow.state)) return finish({ ok: false, error: 'That Google sign-in timed out. Try again' });
    if (typeof q.code !== 'string') return finish({ ok: false, cancelled: q.error === 'access_denied', error: 'Google sign-in didn’t finish' });
    let profile;
    try { profile = await google.exchange({ code: q.code, verifier: flow.verifier, redirectUri: redirectUri(req) }); } catch (e) {
      console.error(e);
      return finish({ ok: false, error: 'Couldn’t reach Google. Try again' });
    }
    const email = cleanEmail(profile.email), linked = accounts.byGoogle(profile.sub);
    if (!profile.emailVerified || !isEmail(email)) return finish({ ok: false, error: 'Google hasn’t confirmed that account’s email yet' });
    const g = { sub: profile.sub, email };

    if (flow.intent === 'link') {
      const { user } = who(res);
      if (!user) return finish({ ok: false, error: 'Sign in first' });
      if (linked && linked.id !== user.id) return finish({ ok: false, error: 'That Google account is already connected to another TypeLab account' });
      return finish({ ok: true, intent: 'link', user: accounts.linkGoogle(user.id, g)! });
    }

    const joined = joinGoogle(accounts, linked, g);
    if (joined) return finish({ ok: true, intent: 'signin', isNew: false, passwordRemoved: joined.passwordRemoved, ...signIn(ctx, req, res, joined.user) });
    const user = await accounts.create(email, cleanUserName(profile.name, email), null, g);
    if (!user) return finish({ ok: false, error: 'Couldn’t make the account. Try again' });
    finish({ ok: true, intent: 'signin', isNew: true, passwordRemoved: false, ...signIn(ctx, req, res, user) });
  });
}

/** The designs whoever's asking has saved: listed, opened, saved, renamed, given their name's sample and deleted. */
function designRoutes(api: Router, { store }: Ctx) {
  api.get('/designs', (_req, res) => { res.json(store.list(who(res).owner)); });

  api.post('/designs', (req, res) => {
    res.status(201).json(store.create(readDesign(req.body), who(res).owner));
  });

  api.get('/designs/:id', (req, res) => {
    const d = store.get(req.params.id, who(res).owner);
    if (!d) throw new HttpError(404, 'Design not found');
    res.json(d);
  });

  api.put('/designs/:id', (req, res) => {
    const d = store.update(req.params.id, readDesign(req.body), who(res).owner);
    if (!d) throw new HttpError(404, 'Design not found');
    res.json(d);
  });

  api.patch('/designs/:id', (req, res) => {
    const d = store.rename(req.params.id, readName(req.body), who(res).owner);
    if (!d) throw new HttpError(404, 'Design not found');
    res.json(d);
  });

  // the name's sample, drawn on My designs or as the design opened from it as saved at `updatedAt` (it had none, or
  // the engine has moved its letters since); refused where it has been saved or renamed since
  api.put('/designs/:id/sample', (req, res) => {
    const b = fields(req.body), sample = cleanSample(b.sample), { owner } = who(res);
    if (!sample || typeof b.updatedAt !== 'string') throw new HttpError(400, 'sample and updatedAt are missing or don’t read');
    if (store.setSample(req.params.id, sample, b.updatedAt, owner)) { res.status(204).end(); return; }
    throw store.get(req.params.id, owner) ? new HttpError(409, 'This design has been saved since') : new HttpError(404, 'Design not found');
  });

  api.delete('/designs/:id', (req, res) => {
    if (!store.delete(req.params.id, who(res).owner)) throw new HttpError(404, 'Design not found');
    res.status(204).end();
  });
}

/** Free fonts' letters, and the exports: a font, a family and a specimen sheet. */
function fontRoutes(api: Router, { fonts, exports }: Ctx) {
  /** Build an export on a worker, from the free fonts the design and `more` (its family's members) are written in,
      and send it as a download; or answer that those fonts couldn't be fetched, or that too many exports wait. */
  const send = async (res: Response, job: ExportJob, ...more: Params[]) => {
    let wanted;
    try { wanted = await fonts.wanted(job.params, ...more); } catch (e) { console.error(e); throw new HttpError(502, 'Couldn’t fetch the free font this design is written in. Try again in a moment.'); }
    let built;
    try { built = await exports.run(job, wanted); } catch (e) {
      if (e instanceof Busy) throw new HttpError(503, 'TypeLab is busy building other fonts. Try again in a minute.');
      throw e;
    }
    attachment(res, built.file, built.type);
    res.send(built.data);
  };

  // a free font's letters, as the engine draws them (TypeLab's own from fonts/, any other fetched from Google Fonts
  // the first time). An own font is asked after each time (its ETag answers), as an import can change it
  api.get('/free-fonts/:id', async (req, res) => {
    const ref = parseFontId(req.params.id);
    if (!ref) throw new HttpError(404, 'No such free font');
    let data;
    try { data = await fonts.load(req.params.id); } catch (e) { console.error(e); throw new HttpError(502, 'Couldn’t fetch the font from Google Fonts'); }
    res.setHeader('Cache-Control', FREE_FAMILIES[ref.family].own ? 'no-cache' : 'public, max-age=86400');
    res.json(data);
  });

  // one of TypeLab's own fonts as an OpenType file: whole, for the browser to set a style's name in (fontFileUrl), or
  // cut to the letters the opening title card sets (introFontUrl), so a first visit fetches little before it plays
  const ownFile = (cut?: string) => async (req: Request<{ id: string }>, res: Response) => {
    const ref = parseFontId(req.params.id);
    if (!ref || !FREE_FAMILIES[ref.family].own) throw new HttpError(404, 'No such font');
    const file = await fonts.file(req.params.id, cut);
    res.setHeader('Cache-Control', 'no-cache');
    res.type('font/otf').send(file);
  };
  api.get('/free-fonts/:id/font.otf', ownFile());
  api.get('/free-fonts/:id/intro.otf', ownFile(INTRO_CHARS));

  // one font file: the design as it is, or one member of its family (the weight and italic picked), named for it
  api.post('/export/otf', async (req, res) => {
    const { name, params, accents } = readExport(req.body), pick = readMember(req.body);
    const member = pick && familyMember(params, pick.anchor, pick.weight, pick.italic);
    await send(res, { kind: 'otf', name, params, member: pick, accents }, ...(member ? [member.params] : []));
  });

  api.post('/export/family', async (req, res) => {
    const { name, params, accents } = readExport(req.body), family = readFamily(req.body);
    await send(res, { kind: 'family', name, params, family, accents }, ...familyMembers(params, family).map(f => f.params));
  });

  api.post('/export/svg', async (req, res) => {
    const { name, params, accents } = readExport(req.body);
    await send(res, { kind: 'svg', name, params, accents });
  });
}

export function createApp(store: DesignStore, { google = null, mail = null, fonts = new FreeFonts(null), exports = new ExportPool() }: { google?: GoogleAuth | null; mail?: Mailer | null; fonts?: FreeFonts; exports?: ExportPool } = {}) {
  const ctx: Ctx = { store, accounts: new AccountStore(store.db), google, mail, fonts, exports };
  const app = express();
  app.disable('x-powered-by');
  // every answer, the app's files too (index.ts mounts them after this): no reading a file as a type it isn't sent
  // as, no showing the editor framed inside another site, and only this site's address passed on to the sites it
  // links to
  app.use((_req, res, next) => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('X-Frame-Options', 'DENY');
    res.setHeader('Content-Security-Policy', "frame-ancestors 'none'");
    res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
    next();
  });
  // a proxy in front (X-Forwarded-For) with TRUST_PROXY unset: every visitor then reads as the proxy, so the sign-in
  // throttles count them all as one and cookies go without Secure. Said once, in the server's log
  let warned = false;
  app.use((req, _res, next) => {
    if (!warned && req.headers['x-forwarded-for'] && !req.app.get('trust proxy')) {
      warned = true;
      console.warn('Requests arrive through a proxy but TRUST_PROXY is not set: set TRUST_PROXY=1 so each visitor is told apart and sign-in cookies are Secure.');
    }
    next();
  });
  // the app's script, its fonts and the letters' JSON go about a third the size
  app.use(compression());
  const api = express.Router();
  // (a design brings its letters' record and its History with it)
  api.use(express.json({ limit: '8mb' }));

  api.get('/health', (_req, res) => { res.json({ ok: true }); });

  // who's asking: the browser always, and the account when one is signed in on it. Only /designs and
  // /auth get these; a route elsewhere that needs the owner or the user must be added to the list
  api.use(['/designs', '/auth'], (req, res, next) => {
    const w = who(res);
    w.browser = browserOf(req, res);
    const token = cookie(req, SESSION_COOKIE, SESSION_TOKEN), user = token ? ctx.accounts.userFor(token) : null;
    if (token && !user) setSession(req, res, null); // expired or signed out elsewhere
    w.token = user ? token : undefined;
    w.user = user;
    w.owner = user ? accountOwner(user) : w.browser;
    next();
  });

  accountRoutes(api, ctx);
  googleRoutes(api, ctx);
  designRoutes(api, ctx);
  fontRoutes(api, ctx);

  api.use((_req, _res) => { throw new HttpError(404, 'No such API route'); });

  // Express 5 forwards thrown and rejected errors here. An HttpError's message is written for the person asking (a
  // fetch that failed has been logged where it was caught); anything else is logged and said in general terms
  api.use((err: unknown, _req: Request, res: Response, _next: NextFunction) => {
    const e = err as { status?: number; type?: string; message?: string };
    const status = err instanceof HttpError ? err.status : e.type === 'entity.parse.failed' ? 400 : e.status && e.status < 500 ? e.status : 500;
    const said = err instanceof HttpError || status < 500;
    if (!said) console.error(err);
    res.status(status).json({ error: !said ? 'Something went wrong on the server' : e.type === 'entity.parse.failed' ? 'The request isn’t valid JSON' : e.message });
  });

  app.use('/api', api);
  return app;
}
