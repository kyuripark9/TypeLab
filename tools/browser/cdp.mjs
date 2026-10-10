/* A small Chrome DevTools Protocol driver over Node's built-in WebSocket, for checking the app in a real browser
   without installing anything. Start Chrome with tools/browser/chrome.sh, then from a script:

     import { openTab } from './tools/browser/cdp.mjs';
     const p = await openTab();                  // first-run tour and splash skipped
     await p.go('http://127.0.0.1:5199/?style=serif&active=weight');
     await p.shot('serif');                      // .tools/out/shots/serif.png
     await p.close();

   Gotchas: a second go() in the same tab can hang on the unsaved-changes guard (open a new tab per URL);
   a dynamic import() of app modules from ev() gets a separate copy of them, so drive state through the UI. */
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
export const PORT = +(process.env.CDP_PORT ?? 9333);
export const SHOTS = process.env.SHOTS ?? resolve(dirname(fileURLToPath(import.meta.url)), '../../.tools/out/shots');
const sleep = ms => new Promise(r => setTimeout(r, ms));
export { sleep };
export async function openTab({ width = 1440, height = 900, mobile = false, skipIntro = true, skipGuide = true } = {}) {
  const t = await (await fetch(`http://127.0.0.1:${PORT}/json/new?about:blank`, { method: 'PUT' })).json();
  const ws = new WebSocket(t.webSocketDebuggerUrl);
  await new Promise(r => ws.addEventListener('open', r));
  let id = 0; const pending = new Map(); const events = [];
  ws.addEventListener('message', m => { const d = JSON.parse(m.data); if (d.id && pending.has(d.id)) { pending.get(d.id)(d); pending.delete(d.id); } else events.push(d); });
  const send = (method, params = {}) => new Promise(r => { const i = ++id; pending.set(i, r); ws.send(JSON.stringify({ id: i, method, params })); });
  await send('Page.enable'); await send('Runtime.enable'); await send('Log.enable');
  await send('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: 1, mobile });
  if (mobile) await send('Emulation.setTouchEmulationEnabled', { enabled: true });
  let pre = '';
  if (skipGuide) pre += "try{localStorage.setItem('typelab.guide.seen','1')}catch{};";
  if (skipIntro) pre += "try{localStorage.setItem('typelab.intro.seen','1')}catch{};";
  if (pre) await send('Page.addScriptToEvaluateOnNewDocument', { source: pre });
  const p = {
    send, events, ws, t,
    async go(url, wait = 2500) { await send('Page.navigate', { url }); await sleep(wait); },
    async ev(expr) { const r = await send('Runtime.evaluate', { expression: expr, awaitPromise: true, returnByValue: true }); if (r.result?.exceptionDetails) return { error: r.result.exceptionDetails.exception?.description }; return r.result?.result?.value; },
    // (a headless tab that isn't in front can hang on a capture: bring it forward, and give up and try once more after 20 s)
    async shot(name, clip) {
      let r;
      for (let i = 0; i < 2 && !r?.result?.data; i++) {
        await send('Page.bringToFront');
        r = await Promise.race([send('Page.captureScreenshot', { format: 'png', ...(clip ? { clip: { ...clip, scale: 1 } } : {}) }), sleep(20000)]);
      }
      if (!r?.result?.data) throw new Error(`screenshot ${name} timed out`);
      mkdirSync(SHOTS, { recursive: true }); writeFileSync(`${SHOTS}/${name}.png`, Buffer.from(r.result.data, 'base64')); return `${SHOTS}/${name}.png`;
    },
    async box(sel) { return p.ev(`(()=>{const e=document.querySelector(${JSON.stringify(sel)}); if(!e) return null; const r=e.getBoundingClientRect(); return {x:r.x,y:r.y,w:r.width,h:r.height}})()`); },
    async click(x, y) { for (const type of ['mouseMoved', 'mousePressed', 'mouseReleased']) await send('Input.dispatchMouseEvent', { type, x, y, button: 'left', clickCount: 1 }); await sleep(300); },
    async clickSel(sel) { const b = await p.box(sel); if (!b) throw new Error('no ' + sel); await p.click(b.x + b.w / 2, b.y + b.h / 2); return b; },
    async clickText(text, sel = 'button,a,[role=menuitem],label') { const b = await p.ev(`(()=>{const e=[...document.querySelectorAll(${JSON.stringify(sel)})].find(e=>e.textContent.trim().startsWith(${JSON.stringify(text)}) && e.getBoundingClientRect().width>0); if(!e) return null; const r=e.getBoundingClientRect(); return {x:r.x,y:r.y,w:r.width,h:r.height}})()`); if (!b) throw new Error('no text ' + text); await p.click(b.x + b.w / 2, b.y + b.h / 2); return b; },
    async drag(x1, y1, x2, y2, steps = 12) { await send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: x1, y: y1 }); await send('Input.dispatchMouseEvent', { type: 'mousePressed', x: x1, y: y1, button: 'left', clickCount: 1 }); for (let i = 1; i <= steps; i++) await send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: x1 + (x2 - x1) * i / steps, y: y1 + (y2 - y1) * i / steps, button: 'left', buttons: 1 }); await send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: x2, y: y2, button: 'left', clickCount: 1 }); await sleep(300); },
    async type(text) { for (const ch of text) { await send('Input.dispatchKeyEvent', { type: 'keyDown', text: ch, key: ch }); await send('Input.dispatchKeyEvent', { type: 'keyUp', key: ch }); } await sleep(200); },
    async key(key, code, keyCode, modifiers = 0) { await send('Input.dispatchKeyEvent', { type: key === 'Enter' ? 'keyDown' : 'rawKeyDown', key, code, windowsVirtualKeyCode: keyCode, modifiers, ...(key === 'Enter' ? { text: '\r' } : {}) }); await send('Input.dispatchKeyEvent', { type: 'keyUp', key, code, windowsVirtualKeyCode: keyCode, modifiers }); await sleep(200); },
    async close() { await fetch(`http://127.0.0.1:${PORT}/json/close/${t.id}`); }
  };
  // auto-accept dialogs, logging them
  ws.addEventListener('message', m => { const d = JSON.parse(m.data); if (d.method === 'Page.javascriptDialogOpening') { p.dialogs = (p.dialogs || []).concat(d.params.message); send('Page.handleJavaScriptDialog', { accept: p.acceptDialogs !== false }); } });
  return p;
}
