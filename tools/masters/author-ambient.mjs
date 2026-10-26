import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { decodeFreeFont } from "../../shared/engine/free.ts";
import { drawnCmds } from "../../shared/engine/outline.ts";
import { cmdsToD } from "../../shared/engine/geom.ts";
import { sourceForFont } from "../../shared/source/catalog.ts";
import { parseWeightMasters } from "../../shared/source/masters.ts";
import { loadSource } from "../../server/sources.ts";
import { buildFont } from "../../shared/engine/index.ts";
import { styleById } from "../../shared/content/index.ts";
import { freeAtOf } from "../../shared/params/index.ts";
import { rowsPNG, rowsSVG } from "../lib.ts";
import { topology } from "./sources-topology.mjs";
import { meshMasters, strokeMasters } from "./ambient-mesh.mjs";
const cases = [
  ["Ballyhoo", -20, 18, 30],
  ["Timber", -18, 16, 30],
  ["Serenade", -6, 6, 14],
  ["Boardwalk", -10, 10, 18],
  ["Cathedral", -9, 9, 18]
].filter(([family]) => !process.argv[2] || family === process.argv[2]);
const out = ".audit/masters/sources/single";
mkdirSync(out, { recursive: true });
const upstreamDir = process.env.TYPELAB_MASTER_UPSTREAM ?? ".tools/master-upstream";
const upstream = JSON.parse(readFileSync("tools/masters/upstream.json"));
const mix = (a, b, t) => a.map((c, i) => c.map((n, j) => Object.fromEntries(Object.keys(n).map((k) => [k, n[k] + (b[i][j][k] - n[k]) * t]))));
const sameTopology = (a, b) => a.pieces === b.pieces && a.counters === b.counters;
const pack = (n) => [n.x, n.y, n.ix, n.iy, n.ox, n.oy].map((v) => Math.round(v * 1e5) / 1e5);
for (const [family, light, bold, blur] of cases) {
  const raw = JSON.parse(readFileSync(`fonts/${family}-400.json`));
  if (family === "Cathedral") {
    const transform = (c, sx, sy, tx, ty) => c.map((n) => n.map((v, i) => v === null ? null : v * (i % 2 ? sy : sx) + (i % 2 ? ty : tx)));
    const bar = transform(raw.glyphs["="][1][0], 1, 1, 0, 108), dot = raw.glyphs[":"][1][0];
    raw.glyphs["\u2212"] = [raw.glyphs["="][0], [bar]];
    raw.glyphs["\xF7"] = [raw.glyphs["="][0], [bar, ...[207, 467].map((y) => transform(dot, 0.55, 0.55, 211 - 101.5 * 0.55, y - 74.5 * 0.55))]];
    raw.glyphs["\\"] = [raw.glyphs["/"][0], raw.glyphs["/"][1].map(c => transform(c, -1, 1, raw.glyphs["/"][0], 0))];
  }
  const font = decodeFreeFont(raw), source = sourceForFont(raw.id);
  const origin = upstream.families.find((f) => f.styles.includes(family)), original = origin.files.find((f) => f.file.endsWith(".ttf"));
  const license = origin.files.find((f) => f.file.endsWith("OFL.txt") || f.file.endsWith("LICENSE.txt"));
  const metadata = {
    ...raw,
    designers: [...origin.designers, "TypeLab"],
    copyright: original.copyright,
    license: original.license,
    licenseUrl: license.url,
    licenseText: readFileSync(`${upstreamDir}/${license.file}`, "utf8")
  };
  const masters = [300, 400, 500].map((weight) => ({ weight, data: { ...metadata, glyphs: {} } }));
  const records = [], failures = [];
  let done = 0;
  for (const [ch, glyph] of Object.entries(font.glyphs)) {
    if (!glyph.contours.length) {
      for (const m of masters) m.data.glyphs[ch] = [glyph.adv, []];
      continue;
    }
    const result = "/\\".includes(ch) ? strokeMasters(glyph.contours, [light, 0, bold]) : meshMasters(glyph.contours, [light, 0, bold], { grid: 48, blur });
    const was = topology(glyph.contours), base = topology(result.base);
    const checks = [];
    for (let index = 0; index < result.masters.length; index++) {
      const m = result.masters[index];
      masters[index].data.glyphs[ch] = [Math.round((glyph.adv + m.advanceDelta) * 1e5) / 1e5, m.contours.map((c) => c.map(pack))];
      if (m.minJacobian < 0.05) failures.push({ ch, reason: "fold margin", amount: m.amount, minJ: m.minJacobian });
      if (index === 1) continue;
      for (const t of [0.25, 0.5, 0.75, 1]) {
        const shape = topology(mix(result.base, m.contours, t));
        const check = { amount: m.amount, t, ...shape, same: sameTopology(base, shape) };
        checks.push(check);
        if (!check.same) failures.push({ ch, reason: "topology", base, ...check });
      }
    }
    if (!sameTopology(was, base)) failures.push({ ch, reason: "subdivision topology measurement", was, base });
    records.push({ ch, nodes: result.nodes, was, base, minJ: result.masters.map((m) => m.minJacobian), checks });
    if (++done % 20 === 0) console.log(`${family}: ${done}/${Object.keys(font.glyphs).length} glyphs`);
  }
  const data = parseWeightMasters({
    format: "weight-masters-v1",
    source,
    defaultWeight: 400,
    masters,
    provenance: [{ family: origin.family, url: original.url, revision: upstream.revision, sha256: original.sha256 }],
    notes: [
      "The original family supplies one weight. The 300 and 500 drawings are newly authored local weight variants, not upstream weights.",
      `Whole-ink ambient deformation with gradient regularization 0.005, blur ${blur}, endpoint amounts ${light}/${bold}, and an exact common triangular subdivision at 48 units.`,
      "Slash and backslash use a positive affine stretch across the stroke direction, at80% and120%, to preserve the smooth diagonal sides.",
      "All endpoint and intermediate triangle Jacobians are positive; shared global maps preserve component relationships and counters. The neutral master retains the exact subdivided source curves, rounded to 0.00001 font unit.",
      "Y extent and left ink edge stay fixed; advance follows the change in ink width. The intentionally narrow range was reviewed with the complete available character set.",
      ...family === "Cathedral" ? ["The original omits minus and divide. Minus reuses the lower equals bar shifted up108 units. Divide adds two copies of the lower colon dot scaled55%, centered at (211,207) and (211,467); both use the equals advance.", "The original backslash slopes in the same direction as the slash and has a127-unit advance for a674-unit outline. The new backslash mirrors the slash within its585-unit advance."] : []
    ]
  });
  writeFileSync(`${out}/${family}-report.json`, JSON.stringify({ family, light, bold, blur, records, failures }, null, 2));
  if (failures.length) throw new Error(`${family}: ${failures.length} geometry checks failed; inspect the report before publishing.`);
  writeFileSync(`${out}/${family}-masters.json`, JSON.stringify(data));
  loadSource(source);
  const style = styleById("grotesque"), baseFont = buildFont({ ...style.params, height: 0.5, freeAt: freeAtOf(style.params), sourceProgram: source });
  const texts = ["ABCDEFGHIJKLMNOPQRSTUVWXYZ", "abcdefghijklmnopqrstuvwxyz", `0123456789.,:;\u2026!\xA1?\xBF'"\u2018\u2019\u201C\u201D\u201A\u201E\u2039\u203A\xAB\xBB`, "()[]{}-\u2013\u2014_/\\|\xB7\u2022&@#$\xA2\u20AC\xA3\xA5%+\u2212\xD7\xF7=<>\xB1~^*\xB0\xA9\xAE\u2122\xA7\xB6\u2020\u2021`"];
  const rows = [];
  for (const m of data.masters) {
    const rendered = decodeFreeFont(m.data), display = {
      ...baseFont,
      advance(ch) {
        return rendered.glyphs[ch]?.adv ?? rendered.space;
      },
      layout(text) {
        let x = 0;
        const items = [...text].map((ch) => {
          const adv = rendered.glyphs[ch]?.adv ?? rendered.space, item = { ch, adv, x };
          x += adv;
          return item;
        });
        return [{ items, width: x }];
      },
      letter() {
        return display;
      },
      glyph(ch) {
        const g = baseFont.glyph(ch), d = rendered.glyphs[ch];
        if (!d) return g;
        const cmds = drawnCmds(d.contours);
        return { ...g, adv: d.adv, drawn: d, cmds, d: cmdsToD(cmds) };
      }
    };
    for (const text of texts) rows.push({ font: display, text, label: `${family} ${m.weight}` });
  }
  writeFileSync(`${out}/${family}-review.svg`, rowsSVG(rows, 42));
  writeFileSync(`${out}/${family}-review.png`, rowsPNG(rows, 42));
  console.log(JSON.stringify({ family, glyphs: records.length, failures, nodes: records.reduce((n, r) => n + r.nodes, 0), minJ: Math.min(...records.flatMap((r) => r.minJ)) }));
}
