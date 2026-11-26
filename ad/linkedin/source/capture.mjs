/* slides.html into the files LinkedIn takes: each slide as a 2160×2700 PNG (1080×1350 at twice the pixels) in
   ../slides/, and all of them as one PDF for a document (carousel) post. The PDF is made of the slide pictures
   themselves (as JPEG, to keep it small), not printed from the page: a print draws the soft shadows under the
   screenshots as solid grey blocks over the text beside them. Needs a headless Chrome on CDP_PORT
   (tools/browser/chrome.sh) and macOS's sips.

     CDP_PORT=9371 tools/node.sh node ad/linkedin/source/capture.mjs [only-slide-numbers...] */
import { execFileSync } from 'node:child_process';
import { mkdirSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { openTab, sleep } from '../../../tools/browser/cdp.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const OUT = resolve(HERE, '../slides');
mkdirSync(OUT, { recursive: true });
const only = process.argv.slice(2).map(Number);

const p = await openTab({ width: 1080, height: 1350, skipIntro: false, skipGuide: false });
await p.send('Emulation.setDeviceMetricsOverride', { width: 1080, height: 1350, deviceScaleFactor: 2, mobile: false });
await p.go(pathToFileURL(resolve(HERE, 'slides.html')).href, 1500);
await p.ev('document.fonts.ready.then(() => 1)');
const fonts = await p.ev(`(${() => ['Manrope', 'Gambetta', 'Geist Mono', 'Just Me Again Down Here', 'TypeLab Lineup']
  .map(f => f + ': ' + document.fonts.check(`500 20px "${f}"`)).join(', ')})()`);
console.log(fonts);
// the slides one at a time, the page's gaps and margins away
await p.ev(`document.body.style.cssText = 'padding:0;gap:0;display:block;background:none'`);
const n = await p.ev('document.querySelectorAll(".slide").length');
for (let i = 0; i < n; i++) {
  if (only.length && !only.includes(i + 1)) continue;
  await p.ev(`document.querySelectorAll('.slide').forEach((s, j) => s.style.display = j === ${i} ? '' : 'none'); window.scrollTo(0, 0)`);
  await sleep(250);
  const r = await p.send('Page.captureScreenshot', { format: 'png' });
  const file = resolve(OUT, `TypeLab-${String(i + 1).padStart(2, '0')}.png`);
  writeFileSync(file, Buffer.from(r.result.data, 'base64'));
  console.log(file);
}
await p.close?.();
if (!only.length) {
  // the PDF: one page per slide picture, exactly as the PNGs look
  const tmp = resolve(HERE, '.pdf-pages');
  rmSync(tmp, { recursive: true, force: true }); mkdirSync(tmp);
  const pngs = readdirSync(OUT).filter(f => /^TypeLab-\d+\.png$/.test(f)).sort();
  for (const f of pngs) execFileSync('sips', ['-s', 'format', 'jpeg', '-s', 'formatOptions', '90', resolve(OUT, f), '--out', resolve(tmp, f.replace('.png', '.jpg'))], { stdio: 'ignore' });
  writeFileSync(resolve(tmp, 'pages.html'), `<!doctype html><meta charset="utf-8"><style>@page { size: 1080px 1350px; margin: 0 } * { margin: 0 } img { display: block; width: 1080px; height: 1350px; break-after: page }</style>`
    + pngs.map(f => `<img src="${f.replace('.png', '.jpg')}">`).join(''));
  const q = await openTab({ width: 1080, height: 1350, skipIntro: false, skipGuide: false });
  await q.go(pathToFileURL(resolve(tmp, 'pages.html')).href, 1500);
  await q.ev('Promise.all([...document.images].map(i => i.decode())).then(() => 1)');
  const r = await q.send('Page.printToPDF', { printBackground: true, preferCSSPageSize: true, marginTop: 0, marginBottom: 0, marginLeft: 0, marginRight: 0 });
  const pdf = resolve(HERE, '../TypeLab-LinkedIn-carousel.pdf');
  writeFileSync(pdf, Buffer.from(r.result.data, 'base64'));
  await q.close?.();
  rmSync(tmp, { recursive: true, force: true });
  console.log(pdf);
}
process.exit(0);
