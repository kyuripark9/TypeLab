/* Slider drag lag: drags each named slider in the app for about 0.6 s and reports how long the drag took and the
   gaps between frames (anything over 100 ms is felt). Chrome on CDP_PORT (tools/browser/chrome.sh), the app on APP.
     APP=5199 node tools/browser/drag-bench.mjs <style> <active-control> <slider label> [label...]
     APP=5199 node tools/browser/drag-bench.mjs didone weight Weight Contrast
   PROF=<dir> also writes a .cpuprofile per slider. Before and after a speed-up, compare golden outlines too
   (npm run golden) so it can't have changed the letters. */
const port = process.env.CDP_PORT ?? 9333, [style, active, ...labels] = process.argv.slice(2);
const sleep = ms => new Promise(r => setTimeout(r, ms));
const list = await (await fetch(`http://127.0.0.1:${port}/json`)).json();
const ws = new WebSocket(list.find(t => t.type === 'page').webSocketDebuggerUrl);
await new Promise(r => ws.onopen = r);
let id = 0; const pend = new Map();
ws.onmessage = e => { const m = JSON.parse(e.data); if (m.id && pend.has(m.id)) { pend.get(m.id)(m); pend.delete(m.id); } };
const send = (method, params = {}) => new Promise(r => { const i = ++id; pend.set(i, r); ws.send(JSON.stringify({ id: i, method, params })); });
const ev = async expr => (await send('Runtime.evaluate', { expression: expr, awaitPromise: true, returnByValue: true })).result?.result?.value;
await send('Page.enable'); await send('Runtime.enable');
await send('Page.addScriptToEvaluateOnNewDocument', { source: `localStorage.setItem('typelab.guide.seen','1');localStorage.setItem('typelab.intro.seen','1');` });
await send('Emulation.setDeviceMetricsOverride', { width: 1440, height: 900, deviceScaleFactor: 1, mobile: false });
await send('Page.navigate', { url: `http://127.0.0.1:${process.env.APP ?? 5288}/?style=${style}&active=${active}` });
await sleep(3000);
const settle = async () => { for (let i = 0; i < 40; i++) { const worst = await ev(`new Promise(r => { let last = performance.now(), worst = 0; const t0 = last; (function f() { const t = performance.now(); worst = Math.max(worst, t - last); last = t; if (t - t0 < 1500) requestAnimationFrame(f); else r(worst); })(); })`); if (worst < 50) return; } console.log('never settled'); };
await settle();
for (const label of labels) {
  const box = await ev(`(() => { const el = document.querySelector('input[type=range][aria-label="${label}"]'); if (!el) return null; el.scrollIntoView({block:'center'}); const r = el.getBoundingClientRect(); return { x: r.x, y: r.y + r.height / 2, w: r.width, v: el.value }; })()`);
  if (!box) { console.log(label, 'not found; ranges:', await ev(`[...document.querySelectorAll('input[type=range]')].map(e => e.getAttribute('aria-label')).join(' | ')`), '; switches:', await ev(`[...document.querySelectorAll('[role=switch],input[type=checkbox]')].map(e => e.getAttribute('aria-label') || e.closest('[data-ctl]')?.dataset.ctl).join(' | ')`)); continue; }
  await settle();
  await ev(`window.__gaps = []; window.__last = performance.now(); window.__on = true; (function f(){ const t = performance.now(); __gaps.push(t - __last); __last = t; if (__on) requestAnimationFrame(f); })(); 1`);
  if (process.env.PROF) { await send('Profiler.enable'); await send('Profiler.setSamplingInterval', { interval: 200 }); await send('Profiler.start'); }
  const x0 = box.x + box.w * (box.v / 100), t0 = Date.now();
  await send('Input.dispatchMouseEvent', { type: 'mousePressed', x: x0, y: box.y, button: 'left', clickCount: 1 });
  for (let i = 1; i <= 30; i++) { await send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: x0 + (i % 15 < 8 ? 1 : -1) * 0 + Math.min(box.w * 0.3, i * 3) * (box.v > 50 ? -1 : 1), y: box.y, button: 'left', buttons: 1 }); await sleep(16); }
  await send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: x0, y: box.y, button: 'left', clickCount: 1 });
  const ms = Date.now() - t0;
  await sleep(1500);
  if (process.env.PROF) { const r = await send('Profiler.stop'); (await import('node:fs')).writeFileSync(process.env.PROF + '/' + label + '.cpuprofile', JSON.stringify(r.result.profile)); }
  const g = await ev(`window.__on = false; __gaps.slice(1)`);
  if (!g) { console.log(label, 'no frames read'); continue; }
  const s = [...g].sort((a, b) => a - b);
  console.log(label.padEnd(14), 'drag', ms, 'ms (ideal ~600)', 'frames', g.length, 'median', s[s.length >> 1].toFixed(0), 'p90', s[Math.floor(s.length * 0.9)].toFixed(0), 'max', s[s.length - 1].toFixed(0), 'gaps>100:', g.filter(x => x > 100).length);
}
ws.close();
