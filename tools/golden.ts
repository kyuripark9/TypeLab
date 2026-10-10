/* Golden outlines: a short hash of every glyph's outline under a fixed set of designs (every starting style,
   and every setting at its ends and in each of its options), kept in tests/golden/outlines.txt.
   tests/golden.test.ts fails when any of them changes and names the designs and letters that moved, so a
   refactor can show it changed nothing and an engine change shows everything it touched.

     npm run golden          check, listing what changed
     npm run golden:update   accept the current outlines as the new golden ones (after looking at them)

   A second set, tests/golden/free-outlines.txt, covers the free fonts' letters (skin.ts, restyle.ts, the twin):
   each style written in its free font, as picked and moved by a few settings. It needs the fonts in
   data/free-fonts (the server keeps them there once asked for; FONTS_DIR points elsewhere), and a font that
   isn't kept, or isn't the same file it was, is left out of the check rather than failed. */
import { createHash } from 'node:crypto';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { ALL_CHARS, buildFont, registerFreeFont, type Cmd } from '../shared/engine';
import { STYLE_FONTS } from '../shared/free-fonts';
import { STYLES, type StyleDef } from '../shared/content';
import { DEFAULTS, FREE_AT_KEYS, SPECS, TERMINAL_FORMS, type Params } from '../shared/params';
import { keptFile } from '../server/free-fonts';
import { ROOT, showContext } from './lib';

export type GoldenSet = 'engine' | 'free';

export const GOLDEN_FILE: Record<GoldenSet, string> = { engine: resolve(ROOT, 'tests/golden/outlines.txt'), free: resolve(ROOT, 'tests/golden/free-outlines.txt') };
const FONTS_DIR = process.env.FONTS_DIR ?? resolve(ROOT, 'data/free-fonts');

/** The designs the outlines are kept for, by name: every starting style, and every setting at its ends (Rotation
    at its quarters too, as both its ends are a half turn) and in each of its options, each tried where it shows
    (see showContext). */
export function engineProbes(): [string, Params][] {
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
  return out;
}

/** The settings a free font's letters are moved by in the free set: each through a different part of the
    machinery (nearer weight, skin, the restyles of ends, serifs, bowls, dots, peaks, corners, joins and stencil,
    the twin's forms). */
const FREE_MOVES: [string, (st: StyleDef) => Partial<Params>][] = [
  ['', () => ({})], ['weight=0.75', () => ({ weight: 0.75 })], ['contrast=0.8', () => ({ contrast: 0.8 })], ['width=0.3', () => ({ width: 0.3 })],
  ['xHeight=0.9', () => ({ xHeight: 0.9 })], ['terminal=round', () => ({ terminal: 'round', terminalForm: 'ball' })],
  ['serif=flip', st => ({ serif: !st.params.serif })], ['squareness=1', () => ({ squareness: 1 })], ['roundness=1', () => ({ roundness: 1 })],
  ['stencil=0.5', () => ({ stencil: 0.5 })], ['gForm=double', () => ({ gForm: 'double' })], ['slant=1', () => ({ slant: 1 })],
  ['dots=square', () => ({ dots: 'square' })], ['apex=1', () => ({ apex: 1 })], ['steps=1', () => ({ steps: 1 })], ['joinRound=1', () => ({ joinRound: 1 })],
  ['innerRound=1', () => ({ innerRound: 1 })], ['barGap=0.6', () => ({ barGap: 0.6 })], ['barEnds=through', () => ({ barGap: 0.6, barEnds: 'through' })],
  ['terminalLength=1', () => ({ terminalLength: 1 })], ['terminalCurl=1', () => ({ terminalCurl: 1 })], ['tail=1', () => ({ tail: 1 })],
  ['aperture=1', () => ({ aperture: 1 })], ['chamfer=1', () => ({ chamfer: 1 })], ['bowlForm=box', () => ({ bowlForm: 'box' })]
];
const FREE_CHARS = 'ABCDEGHKMNOQRSWaegkmnorsty0258&?';
/** Each free font kept in FONTS_DIR, its style's free-set designs, named with a hash of the font's file. */
export function freeProbes(): [string, Params][] {
  const out: [string, Params][] = [];
  for (const st of STYLES) {
    const fid = STYLE_FONTS[st.id], file = fid && keptFile(FONTS_DIR, fid);
    if (!file || !existsSync(file)) continue;
    const text = readFileSync(file, 'utf8');
    registerFreeFont(JSON.parse(text));
    const tag = createHash('sha1').update(text).digest('base64url').slice(0, 6);
    const freeAt = Object.fromEntries(FREE_AT_KEYS.map(k => [k, st.params[k]]));
    for (const [name, move] of FREE_MOVES) {
      const p = { ...st.params, freeFont: fid, freeAt, ...move(st) } as Params;
      out.push([`${st.id}@${tag}${name ? ':' + name : ''}`, p]);
    }
  }
  return out;
}

const r = (v: number) => Math.round(v * 100) / 100;
/** Three base64url characters (18 bits) for one glyph: its outline to a hundredth of a unit, and its spacing. */
function glyphHash(cmds: Cmd[], lsb: number, adv: number): string {
  const text = cmds.map(c => c[0] + c.slice(1).map(v => r(v as number)).join(',')).join('') + `|${r(lsb)}|${r(adv)}`;
  return createHash('sha1').update(text).digest('base64url').slice(0, 3);
}

const charsOf = (set: GoldenSet) => (set === 'engine' ? ALL_CHARS : FREE_CHARS);
/** Every probe's glyph hashes, in the set's character order ('...' where the font has no glyph). */
export function compute(set: GoldenSet = 'engine'): Map<string, string> {
  const out = new Map<string, string>();
  for (const [name, p] of set === 'engine' ? engineProbes() : freeProbes()) {
    const f = buildFont(p);
    let line = '';
    for (const ch of charsOf(set)) {
      const g = f.letter(ch).glyph(ch);
      line += g ? glyphHash(g.cmds, g.lsb, g.adv) : '...';
    }
    out.set(name, line);
  }
  return out;
}

export function write(hashes: Map<string, string>, set: GoldenSet = 'engine') {
  const lines = [`# golden outlines: npm run golden:update rewrites this file; see tools/golden.ts`, `chars ${JSON.stringify(charsOf(set))}`];
  for (const [k, v] of hashes) lines.push(`${k} ${v}`);
  writeFileSync(GOLDEN_FILE[set], lines.join('\n') + '\n');
}

export function read(set: GoldenSet = 'engine'): { chars: string; hashes: Map<string, string> } {
  const lines = readFileSync(GOLDEN_FILE[set], 'utf8').split('\n').filter(l => l && !l.startsWith('#'));
  const chars = JSON.parse(lines[0].slice('chars '.length)) as string;
  const hashes = new Map<string, string>();
  for (const l of lines.slice(1)) { const at = l.lastIndexOf(' '); hashes.set(l.slice(0, at), l.slice(at + 1)); }
  return { chars, hashes };
}

/** What differs between the kept outlines and these: each probe that changed with the letters that did. */
export function diff(now: Map<string, string>, set: GoldenSet = 'engine'): string[] {
  const { chars, hashes: was } = read(set), report: string[] = [];
  const cs = [...chars];
  for (const [k, v] of now) {
    const old = was.get(k);
    // (in the free set, a font kept here and not there, or another file of it, isn't compared)
    if (old === undefined) { if (set === 'engine') report.push(`${k}: new probe`); continue; }
    if (old === v) continue;
    const moved = cs.filter((_, i) => old.slice(i * 3, i * 3 + 3) !== v.slice(i * 3, i * 3 + 3));
    report.push(`${k}: ${moved.length} glyph${moved.length === 1 ? '' : 's'} changed: ${moved.join('')}`);
  }
  if (set === 'engine') for (const k of was.keys()) if (!now.has(k)) report.push(`${k}: probe gone`);
  return report;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  for (const set of ['engine', 'free'] as const) {
    const now = compute(set);
    if (set === 'free' && !now.size) { console.log('free: no free fonts kept in', FONTS_DIR, '(skipped)'); continue; }
    if (process.argv.includes('--update')) { write(now, set); console.log(`${set}: wrote ${now.size} probes to ${GOLDEN_FILE[set]}`); }
    else {
      const d = diff(now, set);
      console.log(d.length ? d.map(l => `${set}: ${l}`).join('\n') : `${set}: all ${now.size} probes match`);
      if (d.length) process.exitCode = 1;
    }
  }
}
