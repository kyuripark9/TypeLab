/* The opening title card's fonts, the designs saved in My designs, each made a web font the card sets the name in
   (client/components/Intro.tsx), so it plays in them on any browser's first visit without building a font:
     npm run fonts:intro [-- --db <email>]
   reads each design file in Asset/intro/ (as Export: Design file writes it) and writes the letters the card sets
   (INTRO_CHARS in shared/free-fonts.ts: its capitals, symbols and x), each made one outline as tools/fonts/ui.ts makes
   Lineup's, as client/fonts/intro/<name>.otf,
   and clears the files there of designs no longer in it. With --db it first writes Asset/intro/ afresh from that
   account's designs in data/typelab.db (read only), but for those begun as blackletter, which the card leaves out
   (its letters read as another script). Run it again after a design is saved, renamed or deleted. */
import { mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { buildOTF } from '../../server/export';
import { slug } from '../../shared/design';
import { cmdsContours, drawnCmds, freeFontsWanted, registerFreeFont, unite } from '../../shared/engine';
import { INTRO_CHARS, STYLE_FONTS, parseFontId } from '../../shared/free-fonts';
import { PARAMS_VERSION, sanitizeParams, upgradeParams } from '../../shared/params';
import { ROOT, freeFonts } from '../lib';

const SRC = join(ROOT, 'Asset/intro'), OUT = join(ROOT, 'client/fonts/intro');
const CHARS = new Set(INTRO_CHARS);

const args = process.argv.slice(2), at = args.indexOf('--db');
if (at >= 0) {
  const email = args[at + 1];
  if (!email) throw new Error('--db wants the account\'s email');
  const db = new DatabaseSync(join(ROOT, 'data/typelab.db'), { readOnly: true });
  const user = db.prepare('SELECT id FROM users WHERE email = ?').get(email) as { id: string } | undefined;
  if (!user) throw new Error(`no account ${email}`);
  // the account's designs as My designs lists them, newest first; the database keeps them upgraded to PARAMS_VERSION
  const rows = db.prepare('SELECT name, style_id, params FROM designs WHERE owner = ? ORDER BY updated_at DESC, rowid DESC')
    .all(`user:${user.id}`) as { name: string; style_id: string; params: string }[];
  const black = parseFontId(STYLE_FONTS.blackletter ?? '')?.family;
  rmSync(SRC, { recursive: true, force: true });
  mkdirSync(SRC, { recursive: true });
  const named = new Set<string>();
  for (const r of rows) {
    const params = JSON.parse(r.params);
    if (r.style_id === 'blackletter' || (black && parseFontId(params.freeFont ?? '')?.family === black)) {
      console.log(`${r.name}: begun as blackletter, left out`);
      continue;
    }
    let file = slug(r.name).toLowerCase();
    for (let n = 2; named.has(file); n++) file = `${slug(r.name).toLowerCase()}-${n}`;
    named.add(file);
    writeFileSync(join(SRC, `${file}.typelab.json`), JSON.stringify({ app: 'TypeLab', version: PARAMS_VERSION, name: r.name, styleId: r.style_id, params }, null, 2) + '\n');
  }
  db.close();
}

rmSync(OUT, { recursive: true, force: true });
mkdirSync(OUT, { recursive: true });
for (const f of readdirSync(SRC).filter(f => f.endsWith('.typelab.json')).sort()) {
  const file = JSON.parse(readFileSync(join(SRC, f), 'utf8'));
  // a design file carries the version its settings were written in, as the editor's import reads it
  const params = sanitizeParams(upgradeParams(file.params, typeof file.version === 'number' ? file.version : 1));
  for (const id of freeFontsWanted(params)) registerFreeFont(await freeFonts().load(id));
  // each letter's overlapping pieces made one (a browser fills a web font's overlaps unevenly), the others left blank
  const drawn = new Set<string>();
  const otf = buildOTF(params, file.name, undefined, g => {
    if (!CHARS.has(g.ch)) return [];
    const cmds = drawnCmds(unite(cmdsContours(g.cmds)));
    if (cmds.length) drawn.add(g.ch);
    return cmds;
  });
  const out = join(OUT, f.replace(/\.typelab\.json$/, '.otf'));
  writeFileSync(out, otf);
  // (a letter it doesn't draw the card sets in the interface's face)
  const missing = [...CHARS].filter(ch => !drawn.has(ch)).join('');
  console.log(`${out.slice(ROOT.length + 1)}: ${file.name} (${file.styleId}), ${otf.length} bytes${missing ? `, without ${missing}` : ''}`);
}
