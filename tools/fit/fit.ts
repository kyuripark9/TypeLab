/* Fit one style's settings to its free font by coordinate descent: the named shapes first (switched only for a
   clear gain), then every numeric setting in halving steps, then spacing. Writes .tools/out/fit/<id>.fit.json.
     node --import tsx tools/fit/fit.ts <style-id>
   Then forms.ts settles the g, Q and a, and apply.ts writes the fits into the styles. Never fit Serifs on or off,
   or the heights of a caps-only font: judge each new preset on a sheet (sheet.ts) before keeping it. */
import { writeFileSync } from 'node:fs';
import { buildFont } from '../../shared/engine';
import { TERMINALS, TERMINAL_FORMS, SERIF_SHAPES, SERIF_TIPS, STORIES, type Params } from '../../shared/params';
import { freeParams, refImages, score, iou, styleOf, SCRATCH } from './lib';

const NUM = ['weight', 'width', 'contrast', 'vWeight', 'hWeight', 'xHeight', 'extenders', 'descender', 'counter', 'aperture', 'crossbar',
  'roundness', 'curve', 'apex', 'terminalLength', 'terminalCurl', 'squareness', 'overlap', 'joinRound', 'tail', 'dotSize',
  'geoHuman', 'softSharp', 'classicFuture', 'playfulFormal',
  'serifSize', 'serifThickness', 'serifAngle', 'serifBracket', 'serifTops', 'serifArms', 'serifArmThickness',
  'terminalFlare', 'terminalSize', 'terminalDepth'] as const;
const ENUM: Record<string, readonly unknown[]> = {
  gForm: ['hook', 'double'], qForm: ['crossing', 'sweep'], serifShape: SERIF_SHAPES, serifTip: SERIF_TIPS, terminal: TERMINALS, story: STORIES,
};

const id = process.argv[2];
const free = buildFont(await freeParams(id)), ref = refImages(free);
const start = { ...styleOf(id).params } as Params;
let p = { ...start } as any, best = score(ref, p);
const log: string[] = [`${id} start score ${best.toFixed(4)} iou ${iou(ref, p).toFixed(3)}`];
console.log(log[0]);
const tryP = (q: any, need = 1e-5) => { try { const s = score(ref, q); if (s < best - need) { best = s; p = q; return true; } } catch { } return false; };
// a choice of shape (terminal, serifs, storey) is only switched for a clear gain: a near tie is the raster's noise, and the style's own choice reads truer
const ENUM_GAIN = 0.01;

// enums first from the style, then numbers, then enums again
const enums = () => {
  for (const k in ENUM) for (const v of ENUM[k]) if (p[k] !== v) {
    const q = { ...p, [k]: v };
    if (k === 'terminal') { for (const f of (TERMINAL_FORMS as any)[v as string]) tryP({ ...q, terminalForm: f }, ENUM_GAIN); } else tryP(q, ENUM_GAIN);
  }
};
enums();
for (let step = 0.16; step >= 0.01; step /= 2) {
  for (let pass = 0; pass < 3; pass++) {
    let moved = false;
    for (const k of NUM) {
      for (const d of [step, -step]) {
        const v = Math.min(1, Math.max(0, p[k] + d)); if (v === p[k]) continue;
        if (tryP({ ...p, [k]: v })) { moved = true; // keep going the same way
          while (true) { const v2 = Math.min(1, Math.max(0, p[k] + d)); if (v2 === p[k] || !tryP({ ...p, [k]: v2 })) break; }
          break; }
      }
    }
    console.log(` step ${step} pass ${pass} score ${best.toFixed(4)}`);
    if (!moved) break;
  }
  enums();
}
const globalP = { ...p };
log.push(`global score ${best.toFixed(4)} iou ${iou(ref, p).toFixed(3)}`); console.log(log.at(-1));

// spacing: match each letter's advance (sidebearings) with letterSpacing / sideBearing
const advErr = (q: any) => { const f = buildFont(q); let e = 0, n = 0; for (const ch in ref) { const g = f.letter(ch).glyph(ch); if (g) { e += Math.abs(g.adv - ref[ch].adv); n++; } } return e / n / f.m.cap; };
let sp = { ...p }, se = advErr(sp);
for (let step = 0.1; step >= 0.005; step /= 2) for (const k of ['letterSpacing', 'sideBearing']) for (const d of [step, -step]) {
  while (true) { const v = Math.min(1, Math.max(0, sp[k] + d)); const q = { ...sp, [k]: v }, e = advErr(q); if (v === sp[k] || e >= se) break; sp = q; se = e; }
}
p = sp; log.push(`spacing error ${(advErr(globalP) * 100).toFixed(1)}% -> ${(se * 100).toFixed(1)}% of cap`); console.log(log.at(-1));

writeFileSync(`${SCRATCH}/${id}.fit.json`, JSON.stringify({ id, log, start, global: { ...p, glyphs: {} }, 
  changed: Object.fromEntries(Object.keys(p).filter(k => JSON.stringify(p[k]) !== JSON.stringify((start as any)[k])).map(k => [k, [(start as any)[k], p[k]]])) }, null, 1));
