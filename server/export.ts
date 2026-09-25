/* Server-side export: the same engine that draws the live preview builds the font files. */
import * as opentypeNs from 'opentype.js';
import { CHARSET, ALL_CHARS, buildFont } from '../shared/engine';
import type { Cmd } from '../shared/engine';
import { TEXTS } from '../shared/content';
import type { Params } from '../shared/params';

// opentype.js is CommonJS: under Node its API sits on the default export
const opentype = ((opentypeNs as unknown as { default?: typeof opentypeNs }).default ?? opentypeNs) as typeof opentypeNs;

const R = Math.round;

function toPath(cmds: Cmd[]) {
  const p = new opentype.Path();
  for (const c of cmds) {
    if (c[0] === 'M') p.moveTo(R(c[1]), R(c[2]));
    else if (c[0] === 'L') p.lineTo(R(c[1]), R(c[2]));
    else if (c[0] === 'C') p.curveTo(R(c[1]), R(c[2]), R(c[3]), R(c[4]), R(c[5]), R(c[6]));
    else p.close();
  }
  return p;
}

/** An installable OpenType (CFF) font with every glyph TypeLab draws. */
export function buildOTF(params: Params, name: string): Buffer {
  const font = buildFont(params), m = font.m;
  const glyphs = [
    new opentype.Glyph({ name: '.notdef', unicode: 0, advanceWidth: 500, path: new opentype.Path() }),
    new opentype.Glyph({ name: 'space', unicode: 32, advanceWidth: R(Math.max(40, m.space + m.track)), path: new opentype.Path() })
  ];
  for (const ch of ALL_CHARS) {
    const g = font.glyph(ch); if (!g) continue;
    glyphs.push(new opentype.Glyph({
      name: 'uni' + ch.charCodeAt(0).toString(16).toUpperCase().padStart(4, '0'),
      unicode: ch.charCodeAt(0),
      advanceWidth: R(Math.max(20, g.adv + m.track)),
      path: toPath(g.cmds)
    }));
  }
  const otf = new opentype.Font({
    familyName: name, styleName: 'Regular', unitsPerEm: 1000,
    ascender: R(Math.max(m.asc, m.cap) + 60), descender: R(m.desc - 40), glyphs
  });
  return Buffer.from(otf.toArrayBuffer());
}

const escapeXml = (s: string) => s.replace(/[<>&"]/g, c => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;' }[c]!));

/** A vector specimen sheet: the name, every character and a pangram. */
export function buildSpecimenSVG(params: Params, name: string): string {
  const font = buildFont(params), m = font.m;
  const rows = [name, CHARSET.upper, CHARSET.lower, CHARSET.digits + ' ' + CHARSET.punct, TEXTS.sentence];
  const lh = Math.max(m.asc, m.cap) - m.desc + 160;
  let body = '', maxW = 0;
  rows.forEach((t, r) => {
    const ln = font.layout(t, Infinity)[0];
    maxW = Math.max(maxW, ln.width);
    const y = R(Math.max(m.asc, m.cap) + 80 + r * lh);
    for (const it of ln.items) { const g = font.glyph(it.ch); if (g) body += `<path transform="translate(${R(it.x)},${y})" d="${g.d}"/>`; }
  });
  const W = R(maxW + 200), H = R(rows.length * lh + 120);
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="-100 0 ${W} ${H}" width="${W / 4}" height="${H / 4}">` +
    `<title>${escapeXml(name)} — TypeLab specimen</title><rect x="-100" width="${W}" height="${H}" fill="#fff"/><g fill="#111">${body}</g></svg>`;
}
