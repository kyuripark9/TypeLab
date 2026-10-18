import { readdirSync } from 'node:fs';
import react from '@vitejs/plugin-react';
import { defineConfig, type Plugin } from 'vite';

/** The files the opening title card plays from (client/components/Intro.tsx): the saved fonts and the drawing's
    letters. (The own fonts it mixes in are fetched after the app's code, which they would slow on a slow connection.) */
const INTRO_FILE = /(^|\/)client\/fonts\/(intro\/[^/]+\.otf|Lineup\.json)$/;

/** On a browser's first visit, the opening title card's files are fetched alongside the app's code rather than after
    it (on a slow connection the card waited most of a second for them once the code had come): a script at the head of
    the page checks what the card checks (PREFS.introSeen in client/lib/prefs.ts, reduced motion) and preloads each,
    and the card's own fetches take them from there; and it lays the card's paper on the page meanwhile (intro-ahead in
    client/styles.css), so the ruled paper doesn't show for a moment before the card. */
function introPreload(): Plugin {
  return {
    name: 'intro-preload',
    transformIndexHtml(_html, ctx) {
      const urls = ctx.bundle
        ? Object.values(ctx.bundle).filter(f => f.type === 'asset' && f.originalFileNames.some(n => INTRO_FILE.test(n))).map(f => `/${f.fileName}`)
        : [...readdirSync(new URL('client/fonts/intro/', import.meta.url)).filter(f => f.endsWith('.otf')).map(f => `/client/fonts/intro/${f}`), '/client/fonts/Lineup.json'];
      return [{
        tag: 'script', injectTo: 'head-prepend',
        children: `try{if(localStorage.getItem('typelab.intro.seen')!=='1'&&!matchMedia('(prefers-reduced-motion: reduce)').matches){document.documentElement.classList.add('intro-ahead');for(const u of ${JSON.stringify(urls)}){const l=document.createElement('link');l.rel='preload';l.as='fetch';l.crossOrigin='anonymous';l.fetchPriority='high';l.href=u;document.head.appendChild(l)}}}catch{}`
      }];
    }
  };
}

// The Express server (server/index.ts) mounts Vite as middleware in development,
// so the app and the API share one origin and no proxy is needed.
export default defineConfig({
  plugins: [react(), introPreload()],
  build: { outDir: 'dist', emptyOutDir: true }
});
