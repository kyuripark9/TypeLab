/* The interface's own logo face: the logo is set in a design made in TypeLab, Lineup, exported by the same engine as
   any font:
     npm run fonts:ui [-- design.typelab.json] [--out client/fonts/Lineup.otf]
   reads the design file (Export: Design file; by default Asset/lineup.typelab.json) and writes its letters, each made
   one outline, as one .otf that client/styles.css loads as "TypeLab Lineup", and beside it (Lineup.json) its
   capitals' outlines, the .otf's own, which the opening title card draws from their points before the wordmark, set
   in the .otf, takes over (client/components/Intro.tsx). Run it again after the design changes; every other word is
   Manrope (or the titles' serif). */
import { readFileSync, writeFileSync } from 'node:fs';
import { buildOTF } from '../../server/export';
import { buildFont, cmdsContours, drawnCmds, unite, type Cmd, type Node, type PackedNode } from '../../shared/engine';
import { sanitizeParams, upgradeParams } from '../../shared/params';

const args = process.argv.slice(2);
const at = args.indexOf('--out');
const out = at >= 0 ? args[at + 1] : 'client/fonts/Lineup.otf';
const src = args.find((a, i) => !a.startsWith('--') && args[i - 1] !== '--out') ?? 'Asset/lineup.typelab.json';

const file = JSON.parse(readFileSync(src, 'utf8'));
// a design file carries the version its settings were written in, as the editor's import reads it
const params = sanitizeParams(upgradeParams(file.params, typeof file.version === 'number' ? file.version : 1));

/** A letter's outline as one ink: the engine's overlapping pieces (a stem, a bowl run into it, each serif) made one,
    every curve kept as drawn (`unite`, as a free font's letters are). A browser fills a web font's overlapping
    pieces unevenly (Lineup's A came out with its bar hollow where it crosses the legs), and the opening's drawing
    would show the edges inside the ink. */
function united(cmds: Cmd[]): Node[][] {
  return unite(cmdsContours(cmds));
}

const otf = buildOTF(params, file.name ?? 'Lineup', undefined, g => drawnCmds(united(g.cmds)));
writeFileSync(out, otf);
console.log(`${out}: ${file.name} (${file.styleId}), ${otf.length} bytes`);

// the capitals as the opening draws them: each point, with the handles it comes in and goes out by where it curves,
// rounded and spaced as the .otf has them (server/export.ts), so the drawing and the wordmark are the same letters
const R = Math.round, font = buildFont(params), glyphs: Record<string, [number, PackedNode[][]]> = {};
for (const ch of 'ABCDEFGHIJKLMNOPQRSTUVWXYZ') {
  const g = font.glyph(ch);
  if (g) glyphs[ch] = [R(Math.max(20, g.adv + font.m.track)), united(g.cmds).map(con => con.map((n): PackedNode => {
    const i = n.ix !== undefined ? [R(n.ix), R(n.iy!)] as const : [null, null] as const;
    return n.ox !== undefined ? [R(n.x), R(n.y), ...i, R(n.ox), R(n.oy!)] : n.ix !== undefined ? [R(n.x), R(n.y), ...i] : [R(n.x), R(n.y)];
  }))];
}
const letters = out.replace(/\.otf$/, '') + '.json', json = JSON.stringify({ cap: R(font.m.cap), xh: R(font.m.xh), glyphs });
writeFileSync(letters, json + '\n');
console.log(`${letters}: its capitals' outlines, ${json.length} bytes`);
