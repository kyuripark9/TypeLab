/* The TypeLab API. Kept separate from index.ts so tests can mount it on an in-memory database. */
import { randomBytes } from 'node:crypto';
import express, { type NextFunction, type Request, type Response } from 'express';
import { styleById } from '../shared/content';
import { cleanName, slug, type DesignInput } from '../shared/design';
import { isValidParams } from '../shared/params';
import type { DesignStore } from './db';
import { buildOTF, buildSpecimenSVG } from './export';

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

/** The browser's own id, from its cookie; a browser without one is given one. Designs are kept per
    browser, so "My designs" holds only the fonts saved there. */
const OWNER_COOKIE = 'typelab_owner';
function ownerOf(req: Request, res: Response): string {
  const m = new RegExp(`(?:^|;\\s*)${OWNER_COOKIE}=([A-Za-z0-9_-]{16,64})(?:;|$)`).exec(req.headers.cookie ?? '');
  if (m) return m[1];
  const id = randomBytes(18).toString('base64url');
  res.append('Set-Cookie', `${OWNER_COOKIE}=${id}; Path=/; Max-Age=${10 * 365 * 24 * 3600}; HttpOnly; SameSite=Lax`);
  return id;
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
  const app = express();
  app.disable('x-powered-by');
  const api = express.Router();
  api.use(express.json({ limit: '4mb' }));

  api.get('/health', (_req, res) => { res.json({ ok: true }); });

  api.use('/designs', (req, res, next) => { res.locals.owner = ownerOf(req, res); next(); });

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
