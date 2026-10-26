import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { decodeFreeFont, packNode } from "../../shared/engine/free.ts";
import { sourceForFont } from "../../shared/source/catalog.ts";
import { parseWeightMasters, decodeWeightMasters, interpolateMasters } from "../../shared/source/masters.ts";
import { topology } from "./sources-topology.mjs";
import { drawnCmds } from "../../shared/engine/outline.ts";
import { cmdsToD } from "../../shared/engine/geom.ts";
import { rowsPNG, rowsSVG } from "../lib.ts";
import { loadSource } from "../../server/sources.ts";
import { buildFont } from "../../shared/engine/index.ts";
import { styleById } from "../../shared/content/index.ts";
import { freeAtOf } from "../../shared/params/index.ts";
import { ownLicense } from "../../shared/free-fonts.ts";
const output = process.env.TYPELAB_MASTER_OUT ?? ".audit/masters/sources";
mkdirSync(output, { recursive: true });
const files = Array.from({ length: 7 }, (_, i) => JSON.parse(readFileSync(`fonts/Bulwark-${(i + 1) * 100}.json`)));
const license = ownLicense();
const licenseText = `${license.lines.join("\n")}\n\n${readFileSync("fonts/OFL.txt", "utf8").trim()}`;
function compatible(contours, ch, weight) {
  const out = contours.map((c) => c.map((n) => ({ ...n })));
  if (ch === "j" && weight >= 600) out[0].push({ ...out[0][0] });
  if ("()".includes(ch) && weight >= 500) out[0] = [...out[0].slice(0, 4), { ...out[0][3] }, out[0][4], { ...out[0][4] }, ...out[0].slice(5)];
  return out.map((c) => c.map((n, i) => {
    const p = c[(i + c.length - 1) % c.length], q = c[(i + 1) % c.length];
    const incoming = p.ox !== void 0 || n.ix !== void 0, outgoing = n.ox !== void 0 || q.ix !== void 0;
    return {
      ...n,
      ix: incoming ? n.ix ?? n.x : p.x + (n.x - p.x) * 2 / 3,
      iy: incoming ? n.iy ?? n.y : p.y + (n.y - p.y) * 2 / 3,
      ox: outgoing ? n.ox ?? n.x : n.x + (q.x - n.x) / 3,
      oy: outgoing ? n.oy ?? n.y : n.y + (q.y - n.y) / 3
    };
  }));
}
const masters = files.map((raw, i) => {
  const weight = (i + 1) * 100, font = decodeFreeFont(raw);
  const left = font.glyphs["\u2039"].contours[0].map((n) => ({ ...n }));
  if (weight >= 600) {
    const inset = weight === 600 ? [230, 207, 278] : [234, 212, 274];
    left[1].y = inset[0];
    left[2].x = inset[1];
    left[3].y = inset[2];
  }
  const mirror = (c, width) => c.map((n) => ({ x: width - n.x, y: n.y })).reverse();
  const small = left.map((n) => ({ x: 34 + (n.x - 34) * 190 / 213, y: n.y }));
  const double = [small, small.map((n) => ({ x: n.x + 214, y: n.y }))];
  font.glyphs["\u2039"].contours = [left];
  font.glyphs["\u203A"].contours = [mirror(left, 281)];
  font.glyphs["\xAB"].contours = double;
  font.glyphs["\xBB"].contours = double.map((c) => mirror(c, 472)).reverse();
  const glyphs = Object.fromEntries(Object.entries(font.glyphs).map(([ch, d]) => [ch, [d.adv, compatible(d.contours, ch, weight).map((c) => c.map(packNode))]]));
  return { weight, data: { ...raw, id: "Bulwark:700", designers: ["TypeLab"], copyright: license.copyright,
    license: license.license, licenseUrl: license.licenseUrl, licenseText, glyphs } };
});
const data = parseWeightMasters({ format: "weight-masters-v1", source: sourceForFont("Bulwark:700"), defaultWeight: 700, masters, provenance: [], notes: [
  "Derived from TypeLab authored Bulwark drawings100\u2013700. Weights800/900 have lost or added counters and are excluded.",
  "Correspondence retains geometry by giving every segment explicit cubic controls, inserting collapsed segments at the j terminal and parenthesis corners, and retaining all source contours.",
  "Repaired single guillemet inner notches at600/700. Double guillemets use two190-unit-wide copies of the single chevron with24-unit gap, within the unchanged472-unit advance; this removes the existing overlap and spurious counter at400\u2013700.",
  "The default700 drawing intentionally includes these punctuation repairs. The historical outline source remains unchanged."
] });
const program = decodeWeightMasters(data), base = interpolateMasters(program, 700), failures = [], records = [];
for (let weight = 100; weight <= 700; weight += 25) {
  const font = interpolateMasters(program, weight);
  for (const [ch, d] of Object.entries(font.glyphs)) {
    const actual = topology(d.contours), expected = topology(base.glyphs[ch].contours);
    const same = actual.pieces === expected.pieces && actual.counters === expected.counters;
    records.push({ weight, ch, ...actual, same });
    if (!same) failures.push({ weight, ch, actual, expected });
  }
}
writeFileSync(join(output, "Bulwark-master-report.json"), JSON.stringify({ records, failures }, null, 2));
if (failures.length) throw new Error(`Bulwark: ${failures.length} geometry checks failed; inspect the report before publishing.`);
writeFileSync(join(output, "Bulwark-masters.json"), JSON.stringify(data));
loadSource(data.source);
const style = styleById("grotesque"), baseFont = buildFont({ ...style.params, height: 0.5, freeAt: freeAtOf(style.params), sourceProgram: data.source });
const rows = [], texts = ["ABCDEFGHIJKLMNOPQRSTUVWXYZ", "abcdefghijklmnopqrstuvwxyz", `0123456789.,:;\u2026!\xA1?\xBF'"\u2018\u2019\u201C\u201D\u201A\u201E\u2039\u203A\xAB\xBB`, "()[]{}-\u2013\u2014_/\\|\xB7\u2022&@#$\xA2\u20AC\xA3\xA5%+\u2212\xD7\xF7=<>\xB1~^*\xB0\xA9\xAE\u2122\xA7\xB6\u2020\u2021`"];
for (const weight of [100, 400, 700]) {
  const font = interpolateMasters(program, weight), display = {
    ...baseFont,
    advance(ch) {
      return font.glyphs[ch]?.adv ?? font.space;
    },
    layout(text) {
      let x = 0;
      const items = [...text].map((ch) => {
        const adv = font.glyphs[ch]?.adv ?? font.space, item = { ch, adv, x };
        x += adv;
        return item;
      });
      return [{ items, width: x }];
    },
    letter() {
      return display;
    },
    glyph(ch) {
      const g = baseFont.glyph(ch), d = font.glyphs[ch];
      if (!d) return g;
      const cmds = drawnCmds(d.contours);
      return { ...g, adv: d.adv, drawn: d, cmds, d: cmdsToD(cmds) };
    }
  };
  for (const text of texts) rows.push({ font: display, text, label: `Bulwark ${weight}` });
}
writeFileSync(join(output, "Bulwark-master-review.png"), rowsPNG(rows, 42));
writeFileSync(join(output, "Bulwark-master-review.svg"), rowsSVG(rows, 42));
console.log(JSON.stringify({ checks: records.length, failures }));
