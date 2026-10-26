/* A small literal execution of the source materials; full style review belongs to the later testing pass. */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { shape } from '../../shared/engine/boolean';
import { toPolys } from '../../shared/engine/geom';
import type { Cmd } from '../../shared/engine/types';
import { DEFAULTS } from '../../shared/params';
import { compileSourcePattern, parseSourcePatterns, patternSourceInk } from '../../shared/source/patterns';

const policy = parseSourcePatterns(JSON.parse(readFileSync(fileURLToPath(new URL('../authored/source-patterns.json', import.meta.url)), 'utf8')));
const source: Cmd[] = [
  ['M', 0, 0], ['L', 100, 0], ['L', 100, 100], ['L', 0, 100], ['Z'],
  ['M', 30, 30], ['L', 30, 70], ['L', 70, 70], ['L', 70, 30], ['Z'],
  ['M', 130, 20], ['L', 145, 20], ['L', 145, 35], ['L', 130, 35], ['Z']
];
const results = policy.fills.map(fill => {
  const plan = compileSourcePattern(policy, { ...DEFAULTS, fill, module: .5, dotGain: .5, roundness: .3 }, { capHeight: 100, tolerance: .04 });
  const cmds = patternSourceInk(source, plan), ink = shape(toPolys(cmds));
  if (!cmds.length || ink.has(50, 50) || !ink.has(137.5, 27.5) || ink.has(200, 200)) throw new Error(`${fill} did not preserve the literal counter and dot`);
  return { fill, commands: cmds.length, counterEmpty: true, dotPresent: true };
});
process.stdout.write(JSON.stringify(results, null, 2) + '\n');
