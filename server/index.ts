/* Starts TypeLab on one port: the API plus the React app.
   Development: Vite runs inside this server as middleware (with hot reload).
   Production (`npm run build` then `npm start`): serves the built files from dist/. */
import { existsSync } from 'node:fs';
import { createServer } from 'node:http';
import { resolve } from 'node:path';
import express from 'express';
import { createApp } from './app';
import { DesignStore } from './db';

const root = resolve(import.meta.dirname, '..');
const port = Number(process.env.PORT) || 5173;
const prod = process.env.NODE_ENV === 'production';

const store = new DesignStore(process.env.DB_PATH || resolve(root, 'data/typelab.db'));
const app = createApp(store);
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
