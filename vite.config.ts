import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

// The Express server (server/index.ts) mounts Vite as middleware in development,
// so the app and the API share one origin and no proxy is needed.
export default defineConfig({
  plugins: [react()],
  build: { outDir: 'dist', emptyOutDir: true }
});
