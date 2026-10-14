/* Starts TypeLab on one port: the API plus the React app.
   Development: Vite runs inside this server as middleware (with hot reload).
   Production (`npm run build` then `npm start`): serves the built files from dist/.
   It reads from the environment, or from a .env file at the root: PORT (5173), NODE_ENV (`production`
   serves dist/), DB_PATH (data/typelab.db; the free fonts are kept beside it, in free-fonts/) and
   TRUST_PROXY here, PUBLIC_URL in app.ts, GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET in google.ts (without
   them, development signs in with a stand-in for Google and production offers no Google), and SMTP_URL and MAIL_FROM
   in mail.ts (without them, or in production without PUBLIC_URL, development shows the password reset's mail at
   /dev/mail and production offers no reset). */
import { existsSync } from 'node:fs';
import { createServer } from 'node:http';
import { dirname, resolve } from 'node:path';
import express from 'express';
import { createApp } from './app';
import { ExportPool } from './export-pool';
import { STAND_IN_PATH, googleFromEnv, googleStandIn } from './google';
import { DesignStore } from './db';
import { FreeFonts } from './free-fonts';
import { STAND_IN_MAIL_PATH, mailStandIn, mailerFromEnv } from './mail';

const root = resolve(import.meta.dirname, '..');
// settings kept out of the code, such as the Google sign-in keys, can sit in a .env file
try { process.loadEnvFile(resolve(root, '.env')); } catch { /* none */ }
const port = Number(process.env.PORT) || 5173;
const prod = process.env.NODE_ENV === 'production';

const dbFile = process.env.DB_PATH || resolve(root, 'data/typelab.db');
const store = new DesignStore(dbFile);
// free fonts are fetched once and kept beside the database
const fonts = new FreeFonts(dbFile === ':memory:' ? null : resolve(dirname(dbFile), 'free-fonts'));
// Google itself when its keys are set; else, in development only, a stand-in to try the sign-in with
const google = googleFromEnv(), standIn = google || prod ? null : googleStandIn();
// a reset's link is built from PUBLIC_URL in production, never from the address a request names, which anyone can set
let mail = mailerFromEnv();
if (mail && prod && !process.env.PUBLIC_URL) {
  console.warn('Password reset is off: set PUBLIC_URL to the site\'s address so its emailed links point there.');
  mail = null;
}
const mailIn = mail || prod ? null : mailStandIn();
// fonts are exported on worker threads, one fewer than the cores (at most 4) unless EXPORT_WORKERS says how many: each
// holds a few hundred MB at its busiest, so a host short of memory sets fewer
const workers = Math.floor(Number(process.env.EXPORT_WORKERS));
const exportPool = new ExportPool(workers >= 1 ? workers : undefined);
const app = createApp(store, { google: google ?? standIn, mail: mail ?? mailIn, fonts, exports: exportPool });
if (standIn) app.get(STAND_IN_PATH, (req, res) => { res.type('html').send(standIn.chooser(req.query.state)); });
if (mailIn) app.get(STAND_IN_MAIL_PATH, (_req, res) => { res.type('html').send(mailIn.page()); });
// behind a proxy that ends HTTPS (most hosts), so sign-in cookies are marked Secure and sign-in
// attempts are counted per visitor rather than per proxy
if (process.env.TRUST_PROXY) app.set('trust proxy', 1);
const server = createServer(app);

if (prod) {
  const dist = resolve(root, 'dist');
  if (!existsSync(resolve(dist, 'index.html'))) {
    console.error('No production build found. Run `npm run build` first.');
    process.exit(1);
  }
  // what the build writes in assets/ is named by its contents, so a browser keeps it for good; one not there (a tab
  // left open across a new build asking for the old script) is a 404, not the app shell
  app.use('/assets', express.static(resolve(dist, 'assets'), { immutable: true, maxAge: '1y' }), (_req, res) => { res.status(404).end(); });
  app.use(express.static(dist, { index: false, maxAge: '1h' }));
  // client-side routes (/, /d/:id, /designs, /account) and any other GET load the app shell, which shows its
  // own Page not found for an address it doesn't know. It is asked after each time, so a new build reaches everyone
  app.use((req, res, next) => {
    if (req.method !== 'GET' && req.method !== 'HEAD') return next();
    res.setHeader('Cache-Control', 'no-cache');
    res.sendFile(resolve(dist, 'index.html'));
  });
} else {
  const { createServer: createVite } = await import('vite');
  const vite = await createVite({ root, appType: 'spa', server: { middlewareMode: true, hmr: { server } } });
  app.use(vite.middlewares);
}

server.listen(port, () => {
  console.log(`TypeLab ${prod ? '' : '(dev) '}running at http://localhost:${port}`);
  if (standIn) console.log('Google sign-in: a stand-in (set GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET for Google itself)');
  if (mailIn) console.log(`Mail: a stand-in, shown at ${STAND_IN_MAIL_PATH} (set SMTP_URL and MAIL_FROM to send it)`);
});

const shutdown = () => { server.close(); store.close(); process.exit(0); };
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
