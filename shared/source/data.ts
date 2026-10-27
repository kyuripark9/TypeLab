import type { FreeFontData, PackedNode } from '../engine/free';

function object(value: unknown, at: string): Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) throw Error(`${at}: expected an object`);
  return Object.fromEntries(Object.entries(value));
}

function array(value: unknown, at: string): unknown[] {
  if (!Array.isArray(value)) throw Error(`${at}: expected an array`);
  return value;
}

function text(value: unknown, at: string): string {
  if (typeof value !== 'string') throw Error(`${at}: expected a string`);
  return value;
}

function number(value: unknown, at: string): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) throw Error(`${at}: expected a finite number`);
  return value;
}

export function parsePackedNode(value: unknown, at = 'node'): PackedNode {
  const node = array(value, at);
  const x = number(node[0], `${at}.x`), y = number(node[1], `${at}.y`);
  if (node.length === 2) return [x, y];
  if (node.length !== 4 && node.length !== 6) throw Error(`${at}: expected 2, 4, or 6 coordinates`);
  const incoming: [number | null, number | null] = node[2] === null && node[3] === null
    ? [null, null]
    : [number(node[2], `${at}.ix`), number(node[3], `${at}.iy`)];
  if (node.length === 4) return [x, y, ...incoming];
  return [x, y, ...incoming, number(node[4], `${at}.ox`), number(node[5], `${at}.oy`)];
}

/** Parse original outlines at the boundary, without fitting, rounding, or changing their geometry. */
export function parseSourceData(value: unknown, at = 'source'): FreeFontData {
  const data = object(value, at);
  const glyphs: FreeFontData['glyphs'] = {};
  for (const [ch, value] of Object.entries(object(data.glyphs, `${at}.glyphs`))) {
    const glyphAt = `${at}.glyphs[${JSON.stringify(ch)}]`;
    if ([...ch].length !== 1) throw Error(`${glyphAt}: expected one Unicode character`);
    const glyph = array(value, glyphAt);
    if (glyph.length !== 2) throw Error(`${glyphAt}: expected advance and contours`);
    const advance = number(glyph[0], `${glyphAt}.advance`);
    if (advance < 0) throw Error(`${glyphAt}: advance must be nonnegative`);
    const contours = array(glyph[1], `${glyphAt}.contours`).map((value, i) => {
      const contourAt = `${glyphAt}.contours[${i}]`;
      const contour = array(value, contourAt);
      if (!contour.length) throw Error(`${contourAt}: empty contour`);
      return contour.map((node, j) => parsePackedNode(node, `${contourAt}[${j}]`));
    });
    glyphs[ch] = [advance, contours];
  }
  const cap = number(data.cap, `${at}.cap`), xh = number(data.xh, `${at}.xh`), space = number(data.space, `${at}.space`);
  if (!(cap > 0 && xh > 0 && xh < cap && space >= 0)) throw Error(`${at}: expected 0 < x-height < cap height and nonnegative space width`);
  const id = text(data.id, `${at}.id`), family = text(data.family, `${at}.family`);
  if (!id || !family) throw Error(`${at}: font ID and family must be nonempty`);
  return {
    id, family,
    designers: array(data.designers, `${at}.designers`).map((value, i) => text(value, `${at}.designers[${i}]`)),
    copyright: text(data.copyright, `${at}.copyright`),
    license: text(data.license, `${at}.license`),
    licenseUrl: text(data.licenseUrl, `${at}.licenseUrl`),
    ...(data.licenseText === undefined ? {} : { licenseText: text(data.licenseText, `${at}.licenseText`) }),
    cap, xh, space, glyphs,
  };
}
