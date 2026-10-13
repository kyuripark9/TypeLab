/* Write Bulwark, the Block card's font, from the engine's basic block letters: `node --import tsx tools/fonts/blocks.ts`
   (`npm run fonts:blocks`; `--check` writes nothing and reports what would change). Unlike TypeLab's other own fonts
   it has no specimen sheet: its letters are basic-blocks.ts's, built at BULWARK below (the Block card's settings
   before it was written in a font of its own) and kept in fonts/ as they were drawn, so that later changes to the
   block letters don't reach designs written in it. Each outline is copied point for point, its lines and curves as
   they are, to whole units. */
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { ALL_CHARS, buildFont, packNode, type Cmd, type FreeFontData, type Node } from '../../shared/engine';
import { OWN_FAMILIES, fontId } from '../../shared/free-fonts';
import { DEFAULTS, type Params } from '../../shared/params';
import { ownFontFile } from '../../server/free-fonts';

/** The settings Bulwark's letters are built at: the basic block letters, heavy and a little wide, box bowls with
    softly rounded corners. */
export const BULWARK: Params = { ...DEFAULTS, build: 'blocks', blockForm: 'basic', weight: 0.7, width: 0.6, bowlForm: 'box', boxRound: 0.55, xHeight: 0.76 };

const R = Math.round;
/** A glyph's path commands (font units, y up) as contours of anchor points with their handles. */
function contoursOf(cmds: Cmd[]): Node[][] {
  const out: Node[][] = [];
  let con: Node[] = [];
  const close = () => {
    // (a contour drawn back to its start ends on its first point: one point, with the handle it came in by)
    const a = con[0], z = con[con.length - 1];
    if (con.length > 1 && a.x === z.x && a.y === z.y) { if (z.ix !== undefined) { a.ix = z.ix; a.iy = z.iy; } con.pop(); }
    if (con.length > 1) out.push(con);
    con = [];
  };
  for (const [op, ...v] of cmds) {
    if (op === 'M') { if (con.length) close(); con.push({ x: R(v[0]), y: R(v[1]) }); }
    else if (op === 'L') con.push({ x: R(v[0]), y: R(v[1]) });
    else if (op === 'C') {
      const p = con[con.length - 1];
      p.ox = R(v[0]); p.oy = R(v[1]);
      con.push({ x: R(v[4]), y: R(v[5]), ix: R(v[2]), iy: R(v[3]) });
    } else if (op === 'Z') close();
  }
  if (con.length) close();
  // (handles that rounding laid on their anchors are none)
  for (const c of out) for (const n of c) {
    if (n.ix === n.x && n.iy === n.y) { delete n.ix; delete n.iy; }
    if (n.ox === n.x && n.oy === n.y) { delete n.ox; delete n.oy; }
  }
  return out;
}

const family = 'Bulwark', own = OWN_FAMILIES[family], id = fontId({ family, weight: own.weight, italic: own.italic });
const font = buildFont(BULWARK), glyphs: FreeFontData['glyphs'] = {};
for (const ch of ALL_CHARS) {
  const g = font.glyph(ch);
  if (g) glyphs[ch] = [R(g.adv), contoursOf(g.cmds).map(c => c.map(packNode))];
}
const data: FreeFontData = {
  id, family, designers: ['TypeLab'], copyright: '', license: '', licenseUrl: '',
  cap: R(font.m.cap), xh: R(font.m.xh), space: R(font.advance(' ')), glyphs
};
const file = ownFontFile(id), was = existsSync(file) ? JSON.parse(readFileSync(file, 'utf8')) as FreeFontData : null;
const changed = Object.keys(glyphs).filter(ch => JSON.stringify(glyphs[ch]) !== JSON.stringify(was?.glyphs[ch]));
console.log(`${id}: ${Object.keys(glyphs).length} letters, cap ${data.cap}, x-height ${data.xh}; ${was ? `changed: ${changed.join('') || 'none'}` : 'new'}`);
if (!process.argv.includes('--check')) writeFileSync(file, JSON.stringify(data));
