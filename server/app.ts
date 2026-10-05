/* The TypeLab API. Kept separate from index.ts so tests can mount it on an in-memory database. */
import { randomBytes } from 'node:crypto';
import express, { type NextFunction, type Request, type Response } from 'express';
import { styleById } from '../shared/content';
import { cleanName, slug, type DesignInput } from '../shared/design';
import { isValidParams } from '../shared/params';
import type { DesignStore } from './db';
import { AccountStore, SESSION_DAYS } from './accounts';
import { cleanEmail, cleanUserName, isEmail, passwordProblem, type User } from '../shared/account';
import { isWeightId, type FamilyRequest } from '../shared/family';
import { buildFamilyZip, buildOTF, buildSpecimenSVG } from './export';

class HttpError extends Error {
  constructor(public status: number, message: string) { super(message); }
}

/** Validate a design body. Params must already be valid: the client never sends partial ones. */
function readDesign(body: unknown): DesignInput {
  const b = (body && typeof body === 'object' ? body : {}) as Record<string, unknown>;
  if (!isValidParams(b.params)) throw new HttpError(400, 'params is missing or has invalid values');
  if (typeof b.styleId !== 'string' || !styleById(b.styleId)) throw new HttpError(400, 'styleId is not a known starting style');
  return { name: cleanName(b.name), styleId: b.styleId, params: b.params };
}

function readExport(body: unknown) {
  const b = (body && typeof body === 'object' ? body : {}) as Record<string, unknown>;
  if (!isValidParams(b.params)) throw new HttpError(400, 'params is missing or has invalid values');
  return { name: cleanName(b.name), params: b.params };
}

/** Which members of a family to build: at least one weight, upright or italic or both. */
function readFamily(body: unknown): FamilyRequest {
  const b = ((body && typeof body === 'object' ? body : {}) as Record<string, unknown>).family as Record<string, unknown> | undefined;
  if (!b || typeof b !== 'object') throw new HttpError(400, 'family is missing');
  const weights = Array.isArray(b.weights) ? [...new Set(b.weights)] : [];
  if (!isWeightId(b.anchor)) throw new HttpError(400, 'family.anchor is not a weight');
  if (!weights.length || !weights.every(isWeightId)) throw new HttpError(400, 'family.weights must name at least one weight');
  if (!b.upright && !b.italic) throw new HttpError(400, 'family needs upright or italic styles');
  return { anchor: b.anchor, weights, upright: !!b.upright, italic: !!b.italic };
}

/** The browser's own id, from its cookie; a browser without one is given one. Designs saved while
    signed out are kept per browser, so "My designs" holds only the fonts saved there. */
const OWNER_COOKIE = 'typelab_owner', SESSION_COOKIE = 'typelab_session';
const cookie = (req: Request, name: string, pattern = '[A-Za-z0-9_-]{16,64}') =>
  new RegExp(`(?:^|;\\s*)${name}=(${pattern})(?:;|$)`).exec(req.headers.cookie ?? '')?.[1];
function browserOf(req: Request, res: Response): string {
  const id = cookie(req, OWNER_COOKIE);
  if (id) return id;
  const fresh = randomBytes(18).toString('base64url');
  res.append('Set-Cookie', `${OWNER_COOKIE}=${fresh}; Path=/; Max-Age=${10 * 365 * 24 * 3600}; HttpOnly; SameSite=Lax`);
  return fresh;
}
/** Whose designs a request sees: the account signed in, else the browser. */
const accountOwner = (u: User) => `user:${u.id}`;

function setSession(req: Request, res: Response, token: string | null) {
  const secure = req.secure ? '; Secure' : '';
  res.append('Set-Cookie', token
    ? `${SESSION_COOKIE}=${token}; Path=/; Max-Age=${SESSION_DAYS * 86400}; HttpOnly; SameSite=Lax${secure}`
    : `${SESSION_COOKIE}=; Path=/; Max-Age=0; HttpOnly; SameSite=Lax${secure}`);
}

const fields = (body: unknown) => (body && typeof body === 'object' ? body : {}) as Record<string, unknown>;

/** Wrong passwords per address and email: after 10 in 15 minutes, sign-in waits out the rest. */
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
  const b = (body && typeof body === 'object' ? body : {}) as Record<string, unknown>;
  if (typeof b.name !== 'string') throw new HttpError(400, 'name is missing');
  return cleanName(b.name);
}

const attachment = (res: Response, file: string, type: string) => {
  res.type(type);
  res.setHeader('Content-Disposition', `attachment; filename="${file}"`);
};

export function createApp(store: DesignStore) {
  const accounts = new AccountStore(store.db), throttle = new Throttle();
  const app = express();
  app.disable('x-powered-by');
  const api = express.Router();
  api.use(express.json({ limit: '4mb' }));

  api.get('/health', (_req, res) => { res.json({ ok: true }); });

  // who's asking: the browser always, and the account when one is signed in on it
  api.use(['/designs', '/auth'], (req, res, next) => {
    res.locals.browser = browserOf(req, res);
    const token = cookie(req, SESSION_COOKIE, '[A-Za-z0-9_-]{40,64}'), user = token ? accounts.userFor(token) : null;
    if (token && !user) setSession(req, res, null); // expired or signed out elsewhere
    res.locals.token = user ? token : undefined;
    res.locals.user = user;
    res.locals.owner = user ? accountOwner(user) : res.locals.browser;
    next();
  });

  /** The signed-in account, or 401. */
  const me = (res: Response): User => {
    if (!res.locals.user) throw new HttpError(401, 'Sign in first');
    return res.locals.user;
  };
  /** Sign this browser in, bringing along the fonts it saved while signed out. */
  const signIn = (req: Request, res: Response, user: User) => {
    if (res.locals.token) accounts.endSession(res.locals.token);
    setSession(req, res, accounts.startSession(user.id));
    const moved = store.moveAll(res.locals.browser, accountOwner(user));
    return { user, moved };
  };

  api.get('/auth/me', (_req, res) => { res.json({ user: res.locals.user }); });

  api.post('/auth/signup', async (req, res) => {
    const b = fields(req.body), email = cleanEmail(b.email);
    if (!isEmail(email)) throw new HttpError(400, 'Enter a valid email address');
    const problem = passwordProblem(b.password);
    if (problem) throw new HttpError(400, problem);
    const user = await accounts.create(email, cleanUserName(b.name, email), b.password as string);
    if (!user) throw new HttpError(409, 'There’s already an account with this email. Sign in instead');
    res.status(201).json(signIn(req, res, user));
  });

  api.post('/auth/login', async (req, res) => {
    const b = fields(req.body), email = cleanEmail(b.email), key = `${req.ip}|${email}`;
    if (!email || typeof b.password !== 'string' || !b.password) throw new HttpError(400, 'Enter your email and password');
    throttle.check(key);
    const user = await accounts.verify(email, b.password);
    if (!user) { throttle.fail(key); throw new HttpError(401, 'That email and password don’t match an account'); }
    throttle.clear(key);
    res.json(signIn(req, res, user));
  });

  api.post('/auth/logout', (req, res) => {
    if (res.locals.token) accounts.endSession(res.locals.token);
    setSession(req, res, null);
    res.status(204).end();
  });

  api.patch('/auth/me', (req, res) => {
    const user = me(res);
    res.json({ user: accounts.rename(user.id, cleanUserName(fields(req.body).name, user.email)) });
  });

  api.post('/auth/password', async (req, res) => {
    const user = me(res), b = fields(req.body);
    if (typeof b.current !== 'string' || !(await accounts.checkPassword(user.id, b.current))) throw new HttpError(403, 'Your current password isn’t right');
    const problem = passwordProblem(b.next);
    if (problem) throw new HttpError(400, problem);
    await accounts.setPassword(user.id, b.next as string);
    accounts.endOtherSessions(user.id, res.locals.token);
    res.status(204).end();
  });

  /** Close the account and delete every font saved in it. */
  api.delete('/auth/me', async (req, res) => {
    const user = me(res), b = fields(req.body);
    if (typeof b.password !== 'string' || !(await accounts.checkPassword(user.id, b.password))) throw new HttpError(403, 'Your password isn’t right');
    store.deleteAll(accountOwner(user));
    accounts.delete(user.id);
    setSession(req, res, null);
    res.status(204).end();
  });

  api.get('/designs', (_req, res) => { res.json(store.list(res.locals.owner)); });

  api.post('/designs', (req, res) => {
    res.status(201).json(store.create(readDesign(req.body), res.locals.owner));
  });

  api.get('/designs/:id', (req, res) => {
    const d = store.get(req.params.id, res.locals.owner);
    if (!d) throw new HttpError(404, 'Design not found');
    res.json(d);
  });

  api.put('/designs/:id', (req, res) => {
    const d = store.update(req.params.id, readDesign(req.body), res.locals.owner);
    if (!d) throw new HttpError(404, 'Design not found');
    res.json(d);
  });

  api.patch('/designs/:id', (req, res) => {
    const d = store.rename(req.params.id, readName(req.body), res.locals.owner);
    if (!d) throw new HttpError(404, 'Design not found');
    res.json(d);
  });

  api.delete('/designs/:id', (req, res) => {
    if (!store.delete(req.params.id, res.locals.owner)) throw new HttpError(404, 'Design not found');
    res.status(204).end();
  });

  api.post('/export/otf', (req, res) => {
    const { name, params } = readExport(req.body);
    attachment(res, `${slug(name)}.otf`, 'font/otf');
    res.send(buildOTF(params, name));
  });

  api.post('/export/family', (req, res) => {
    const { name, params } = readExport(req.body), family = readFamily(req.body);
    attachment(res, `${slug(name)}-family.zip`, 'application/zip');
    res.send(buildFamilyZip(params, name, family));
  });

  api.post('/export/svg', (req, res) => {
    const { name, params } = readExport(req.body);
    attachment(res, `${slug(name)}-specimen.svg`, 'image/svg+xml');
    res.send(buildSpecimenSVG(params, name));
  });

  api.use((_req, _res) => { throw new HttpError(404, 'No such API route'); });

  // Express 5 forwards thrown and rejected errors here
  api.use((err: unknown, _req: Request, res: Response, _next: NextFunction) => {
    const e = err as { status?: number; type?: string; message?: string };
    const status = err instanceof HttpError ? err.status : e.type === 'entity.parse.failed' ? 400 : e.status && e.status < 500 ? e.status : 500;
    if (status >= 500) console.error(err);
    res.status(status).json({ error: status >= 500 ? 'Something went wrong on the server' : e.message });
  });

  app.use('/api', api);
  return app;
}
