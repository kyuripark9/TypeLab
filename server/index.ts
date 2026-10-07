/* Starts TypeLab on one port: the API plus the React app.
   Development: Vite runs inside this server as middleware (with hot reload).
   Production (`npm run build` then `npm start`): serves the built files from dist/. */
import { existsSync } from 'node:fs';
import { createServer } from 'node:http';
import { resolve } from 'node:path';
import express from 'express';
import { createApp } from './app';
import { googleFromEnv } from './google';
import { DesignStore } from './db';

const root = resolve(import.meta.dirname, '..');
// settings kept out of the code, such as the Google sign-in keys, can sit in a .env file
try { process.loadEnvFile(resolve(root, '.env')); } catch { /* none */ }
const port = Number(process.env.PORT) || 5173;
const prod = process.env.NODE_ENV === 'production';

const dbFile = process.env.DB_PATH || resolve(root, 'data/typelab.db');
const store = new DesignStore(dbFile);
const app = createApp(store, { google: googleFromEnv() });
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
  app.use(express.static(dist, { index: false, maxAge: '1h' }));
  // client-side routes (/, /designs, /d/:id) all load the app shell
  app.use((req, res, next) => (req.method === 'GET' ? res.sendFile(resolve(dist, 'index.html')) : next()));
} else {
  const { createServer: createVite } = await import('vite');
  const vite = await createVite({ root, appType: 'spa', server: { middlewareMode: true, hmr: { server } } });
  app.use(vite.middlewares);
}

server.listen(port, () => {
  console.log(`TypeLab ${prod ? '' : '(dev) '}running at http://localhost:${port}`);
});

const shutdown = () => { server.close(); store.close(); process.exit(0); };
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
