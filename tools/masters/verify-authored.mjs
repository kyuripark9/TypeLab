import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { performance } from "node:perf_hooks";
import { gzipSync } from "node:zlib";
import { parseWeightMasters, decodeWeightMasters, interpolateMasters } from "../../shared/source/masters.ts";
import { topology } from "./sources-topology.mjs";
const files = process.argv.slice(2);
if (!files.length) throw new Error("Pass one or more master package paths.");
const results = [];
for (const file of files) {
  const bytes = readFileSync(file), start = performance.now(), data = parseWeightMasters(JSON.parse(bytes));
  const parsed = performance.now(), program = decodeWeightMasters(data), decoded = performance.now();
  const base = interpolateMasters(program, data.defaultWeight);
  const expected = Object.fromEntries(Object.entries(base.glyphs).map(([ch, d]) => [ch, topology(d.contours)]));
  const weights = data.masters.flatMap((m, i) => i ? [0.25, 0.5, 0.75, 1].map((t) => data.masters[i - 1].weight + (m.weight - data.masters[i - 1].weight) * t) : [m.weight]);
  const failures = [];
  for (const weight of weights) for (const [ch, d] of Object.entries(interpolateMasters(program, weight).glyphs)) {
    const actual = topology(d.contours), was = expected[ch];
    if (actual.pieces !== was.pieces || actual.counters !== was.counters) failures.push({ ch, weight, actual, expected: was });
  }
  const min = data.masters[0].weight, max = data.masters.at(-1).weight, times = [];
  for (let i = 0; i < 30; i++) {
    const weight = min + (max - min) * (i + 0.321) / 30, before = performance.now();
    interpolateMasters(program, weight);
    times.push(performance.now() - before);
  }
  times.sort((a, b) => a - b);
  const result = {
    file,
    source: data.source.fontId,
    bytes: bytes.length,
    gzipBytes: gzipSync(bytes).length,
    nodes: Object.values(base.glyphs).reduce((sum, d) => sum + d.contours.reduce((n, c) => n + c.length, 0), 0),
    glyphs: Object.keys(base.glyphs).length,
    checks: weights.length * Object.keys(base.glyphs).length,
    parseMs: parsed - start,
    decodeMs: decoded - parsed,
    interpolationP50Ms: times[15],
    interpolationP95Ms: times[28],
    failures
  };
  console.log(JSON.stringify(result));
  results.push(result);
}
const output = process.env.TYPELAB_VERIFY_REPORT ?? ".audit/masters/sources/serialized-verification.json";
mkdirSync(dirname(output), { recursive: true });
writeFileSync(output, JSON.stringify(results, null, 2));
if (results.some((r) => r.failures.length)) process.exitCode = 1;
