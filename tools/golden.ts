/* Golden outlines: a short hash of every glyph's outline under a fixed set of designs (every starting style,
   and every setting at its ends and in each of its options), kept in tests/golden/outlines.txt.
   tests/golden.test.ts fails when any of them changes and names the designs and letters that moved, so a
   refactor can show it changed nothing and an engine change shows everything it touched.

     npm run golden          check, listing what changed
     npm run golden:update   accept the current outlines as the new golden ones (after looking at them)

   These are the letters the engine builds itself (strokes, blocks, arcs). The source styles' letters are checked by
   their own tests (tests/source-*.test.ts) against the published drawings. */
import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { ALL_CHARS, buildFont, type Cmd } from '../shared/engine';
import { STYLES } from '../shared/content';
import { DEFAULTS, SPECS, TERMINAL_FORMS, type Params } from '../shared/params';
import { oneAtATime, ROOT, showContext } from './lib';

export const GOLDEN_FILE = resolve(ROOT, 'tests/golden/outlines.txt');

/** The designs the outlines are kept for, by name: every starting style, and every setting at its ends (Rotation
    at its quarters too, as both its ends are a half turn) and in each of its options, each tried where it shows
    (see showContext). */
function engineProbes(): [string, Params][] {
  const out: [string, Params][] = STYLES.map(s => [`style:${s.id}`, s.params]);
  out.push(['defaults', { ...DEFAULTS }]);
  for (const k of Object.keys(DEFAULTS) as (keyof Params)[]) {
    const spec = SPECS[k] as { kind: string; options?: readonly unknown[] }, d = DEFAULTS[k];
    const values = spec.kind === 'number' ? (k === 'rotation' ? [0, 0.25, 0.75, 1] : [0, 1]) : spec.kind === 'boolean' ? [!d]
      : spec.kind === 'option' && k !== 'terminalForm' ? spec.options!.filter(v => v !== d) : [];
    for (const v of values) out.push([`${k}=${v}`, { ...DEFAULTS, ...showContext(k), [k]: v }]);
  }
  // the stroke end forms under their own kinds, a letter of its own, and blocks
  for (const [t, forms] of Object.entries(TERMINAL_FORMS))
    for (const f of forms.slice(1)) out.push([`terminal=${t},terminalForm=${f}`, { ...DEFAULTS, terminal: t, terminalForm: f } as Params]);
  out.push(['glyphs', { ...DEFAULTS, glyphs: { a: { weight: 1, story: 'single' }, R: { rForm: 'loop', corners: { '0t0': 1 } }, e: { mirror: 'mirrored' } } }]);
  out.push(['blocks,weight=1,roundness=1', { ...DEFAULTS, build: 'blocks', weight: 1, roundness: 1 }]);
  out.push(['blocks=slots,weight=1,roundness=1', { ...DEFAULTS, build: 'blocks', blockForm: 'slots', weight: 1, roundness: 1 }]);
  out.push(['blocks=grid,weight=1,roundness=1', { ...DEFAULTS, build: 'blocks', blockForm: 'grid', weight: 1, roundness: 1 }]);
  out.push(['blocks=grid,weight=0,width=0', { ...DEFAULTS, build: 'blocks', blockForm: 'grid', weight: 0, width: 0, roundness: 0.5 }]);
  // the slot and grid blocks' settings at their ends: contrast, slots and counters, bars, cut corners and the stencil
  const slots = { ...DEFAULTS, build: 'blocks', blockForm: 'slots', weight: 0.6, roundness: 1, joinRound: 0.5 } as Params;
  const grid = { ...DEFAULTS, build: 'blocks', blockForm: 'grid', roundness: 1 } as Params;
  out.push(['slots,contrast=1,counter=1,aperture=1,crossbar=1', { ...slots, contrast: 1, counter: 1, aperture: 1, crossbar: 1 }]);
  out.push(['slots,contrast=0,counter=0,aperture=0,crossbar=0', { ...slots, contrast: 0, counter: 0, aperture: 0, crossbar: 0, weight: 1 }]);
  out.push(['slots,steps=1,joints=1,chamfer=0.5,innerRound=1', { ...slots, steps: 1, joints: 1, chamfer: 0.5, innerRound: 1 }]);
  out.push(['slots,stencil=0.6,stencilPos=1,stencilRound=1', { ...slots, stencil: 0.6, stencilPos: 1, stencilRound: 1 }]);
  out.push(['grid,contrast=1,vWeight=1,joinRound=1,steps=1', { ...grid, contrast: 1, vWeight: 1, joinRound: 1, steps: 1 }]);
  out.push(['grid,diagonal,joints=1,chamfer=1,innerRound=1', { ...grid, cellJoin: 'diagonal', joints: 1, chamfer: 1, roundness: 0.3, innerRound: 1 }]);
  out.push(['grid,pixel,contrast=0,hWeight=1', { ...grid, cellJoin: 'pixel', contrast: 0, hWeight: 1, roundness: 0 }]);
  out.push(['grid,stencil=0.7,stencilRound=1', { ...grid, stencil: 0.7, stencilRound: 1, weight: 0.7 }]);
  out.push(['slots,forms', { ...slots, iForm: 'bars', jForm: 'cup', mForm: 'raised', qForm: 'sweep', dots: 'round', dotSize: 1 }]);
  out.push(['grid,forms', { ...grid, story: 'single', kForm: 'bar', iForm: 'bars', jForm: 'cup', mForm: 'raised', qForm: 'inside', rForm: 'loop', yForm: 'cup', sForm: 'flat', dots: 'square', dotSize: 0 }]);
  // the arc letters at their ends: Length run on round the circle and cut back, squared off, stretched and heavy
  out.push(['arcs,terminalLength=1,squareness=1,width=1', { ...DEFAULTS, build: 'arcs', terminalLength: 1, squareness: 1, width: 1 }]);
  out.push(['arcs,terminalLength=0,weight=1,width=0', { ...DEFAULTS, build: 'arcs', terminalLength: 0, weight: 1, width: 0, terminal: 'round' }]);
  // the settings only basic blocks follow, at their ends
  out.push(['blocks,contrast=1,steps=1,box', { ...DEFAULTS, build: 'blocks', contrast: 1, steps: 1, bowlForm: 'box', apex: 1, innerRound: 1, joinRound: 1 }]);
  out.push(['blocks,weight=0,contrast=0', { ...DEFAULTS, build: 'blocks', weight: 0, contrast: 0, apex: 0, xHeight: 1, extenders: 1, descender: 1 }]);
  out.push(['blocks,crossbar=0,aperture=0', { ...DEFAULTS, build: 'blocks', crossbar: 0, aperture: 0, weight: 1 }]);
  out.push(['blocks,crossbar=1,aperture=1', { ...DEFAULTS, build: 'blocks', crossbar: 1, aperture: 1, contrast: 1 }]);
  // the cuts on styles of other builds: stencil gaps, crossbar gaps and a letter's own join gaps clip strokes
  // on slants (K k y), on serifs and on blackletter's diamonds, which the defaults alone don't reach
  const joinGaps = { K: { joinGaps: { '1s': 1 } }, k: { joinGaps: { '1s': 1, '2s': 1 } }, y: { joinGaps: { '1s': 1 } }, A: { joinGaps: { '0t0': 1, '1s': 0.5 } } };
  for (const id of ['serif', 'didone', 'grotesque', 'woodtype', 'industrial', 'typewriter', 'blackletter']) {
    const st = STYLES.find(s => s.id === id)!.params;
    out.push([`style:${id},stencil=0.4`, { ...st, stencil: 0.4 }]);
    out.push([`style:${id},barGap=0.6,through`, { ...st, barGap: 0.6, barEnds: 'through' }]);
    out.push([`style:${id},stencil=0.8,joinGaps`, { ...st, stencil: 0.8, stencilPos: 1, stencilRound: 1, glyphs: { ...st.glyphs, ...joinGaps } }]);
  }
  return out;
}

const r = (v: number) => Math.round(v * 100) / 100;
/** Three base64url characters (18 bits) for one glyph: its outline to a hundredth of a unit, and its spacing. */
export function glyphHash(cmds: Cmd[], lsb: number, adv: number): string {
  const text = cmds.map(c => c[0] + c.slice(1).map(v => r(v as number)).join(',')).join('') + `|${r(lsb)}|${r(adv)}`;
  return createHash('sha1').update(text).digest('base64url').slice(0, 3);
}

/** Every probe's glyph hashes, in ALL_CHARS order ('...' where the font has no glyph): only those `only` takes, when
    given. */
export function compute(only?: (name: string) => boolean): Map<string, string> {
  const out = new Map<string, string>();
  for (const [name, p] of engineProbes()) {
    if (only && !only(name)) continue;
    const f = buildFont(p);
    let line = '';
    for (const ch of ALL_CHARS) {
      const g = f.letter(ch).glyph(ch);
      line += g ? glyphHash(g.cmds, g.lsb, g.adv) : '...';
    }
    out.set(name, line);
  }
  return out;
}

/** Writes these hashes as the golden file, under its character order. */
function write(hashes: Map<string, string>) {
  const lines = [`# golden outlines: npm run golden:update rewrites this file; see tools/golden.ts`, `chars ${JSON.stringify(ALL_CHARS)}`];
  for (const [k, v] of hashes) lines.push(`${k} ${v}`);
  writeFileSync(GOLDEN_FILE, lines.join('\n') + '\n');
}

/** The golden file as kept: its character order and each probe's hashes. */
function read(): { chars: string; hashes: Map<string, string> } {
  const lines = readFileSync(GOLDEN_FILE, 'utf8').split('\n').filter(l => l && !l.startsWith('#'));
  const chars = JSON.parse(lines[0].slice('chars '.length)) as string;
  const hashes = new Map<string, string>();
  for (const l of lines.slice(1)) { const at = l.lastIndexOf(' '); hashes.set(l.slice(0, at), l.slice(at + 1)); }
  return { chars, hashes };
}

/** What differs between the kept outlines and these: each probe that changed with the letters that did. */
export function diff(now: Map<string, string>): string[] {
  const { chars, hashes: was } = read(), report: string[] = [];
  const cs = [...chars];
  for (const [k, v] of now) {
    const old = was.get(k);
    if (old === undefined) { report.push(`${k}: new probe`); continue; }
    if (old === v) continue;
    const moved = cs.filter((_, i) => old.slice(i * 3, i * 3 + 3) !== v.slice(i * 3, i * 3 + 3));
    report.push(`${k}: ${moved.length} glyph${moved.length === 1 ? '' : 's'} changed: ${moved.join('')}`);
  }
  for (const k of was.keys()) if (!now.has(k)) report.push(`${k}: probe gone`);
  return report;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const update = process.argv.includes('--update');
  await oneAtATime('golden', () => {
    const now = compute();
    if (update) { write(now); console.log(`wrote ${now.size} probes to ${GOLDEN_FILE}`); return; }
    const d = diff(now);
    console.log(d.length ? d.join('\n') : `all ${now.size} probes match`);
    if (d.length) process.exitCode = 1;
  });
}
