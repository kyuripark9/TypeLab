/* A separate registry proves reopening cannot inherit a baseline loaded by the test process. */
import { readFileSync } from 'node:fs';
import { buildFont, packNode } from '../../shared/engine';
import { sanitizeParams } from '../../shared/params';
import { buildOTF } from '../../server/export';
import { FreeFonts } from '../../server/free-fonts';
import { loadSource } from '../../server/sources';

const params = sanitizeParams(JSON.parse(readFileSync(0, 'utf8')));
if (!params.sourceProgram) throw new Error('The reopening fixture needs a pinned source');
loadSource(params.sourceProgram);
const missing = buildFont(params).source;
let refusedExport = false;
try { buildOTF(params, 'Missing saved frame'); }
catch (error) { if (!(error instanceof Error)) throw error; refusedExport = /saved source/.test(error.message); }
const fonts = new FreeFonts(null);
await fonts.ready(params);
const font = buildFont(params), glyph = font.glyph('R');
if (!glyph?.drawn) throw new Error('The saved R was not reopened');
process.stdout.write(JSON.stringify({ missing, refusedExport, ready: font.source,
  drawing: [glyph.adv, glyph.drawn.contours.map(c => c.map(packNode))] }));
