/* Everything the engine draws, compared with another commit's: every glyph of every starting style (and the
   defaults) under about fifty designs (MOVES), each hashed in full (outline, marks, counters, strokes, skeleton,
   serif placement, spacing, and the parts thirteen settings highlight), with each design's layout and metrics.
   The golden outlines (tools/golden.ts) keep a short hash of each glyph's outline for a fixed set of probes;
   this checks all the engine hands the app, so a refactor can show it changed nothing at all, and an engine
   change shows every design and letter it reached.

     npm run compare                            the working tree against HEAD
     npm run compare -- 32b1635                 ... against another commit (any git ref)
     npm run compare -- 32b1635 --free          the free fonts kept in data/free-fonts as well
     npm run compare -- --only 'modular|slab'   only the styles whose id matches ('defaults' for the defaults)

   The other commit is checked out into .tools/compare/<commit> (a git worktree, kept for next time, with
   node_modules and data/free-fonts linked in). Each side is dumped by this file in child processes
   (--dump <root> <out>), which import the engine from <root>, both sides at once and in the same slices: a
   design can draw otherwise after others drawn in the same process (the twin's fit of a free font is kept by
   the font, whichever style drew with it first), so each side draws every design after the same ones. The
   commit's dump is kept in .tools/compare/ under the commit, this file's text, the options and the slices, so
   comparing against it again dumps only the working tree. It lists each design and the characters that differ,
   and exits 1 if any do. A whole run takes about five minutes (with --free, closer to half an hour); --only cuts
   it to seconds. */
import { spawn, execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, lstatSync, mkdirSync, readdirSync, readFileSync, realpathSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { availableParallelism } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { parseArgs } from 'node:util';

const SELF = fileURLToPath(import.meta.url);
const ROOT = resolve(dirname(SELF), '..');
const WORK = resolve(ROOT, '.tools/compare');
/** Where the server keeps the free fonts (as tools/lib.ts's FONTS_DIR, which this file can't import: it loads
    the engine of the working tree, and a dump loads only the engine of its own checkout). */
const FONTS_DIR = process.env.FONTS_DIR ?? resolve(ROOT, 'data/free-fonts');

type Design = Record<string, unknown>;

/** Per-letter values on a few letters, for the moves' 'glyphs' design: joins opened, corners rounded and stepped,
    a stroke weighted, an end drawn out and curled, forms of their own. */
const glyphOver = { glyphs: {
  A: { joinGaps: { '0t0': 1, '1s': 0.5 }, corners: { '0t0': 1 } }, R: { rForm: 'loop', cornerSteps: { '0t0': 1 }, strokeWeights: { 0: 1 } },
  e: { mirror: 'mirrored', terminalEnds: { '0e': 1 }, terminalCurls: { '0e': 0 } }, n: { innerCorners: { '1t0': 1 }, weight: 0.9 }, K: { joinGaps: { '1s': 1 } },
  k: { joinGaps: { '1s': 1, '2s': 1 } }, y: { joinGaps: { '1s': 1 } }, g: { gForm: 'double' } } };
/** The settings each style is drawn under, by name ('' as it is): the cuts, the corners, the pen, the forms, every
    kind of stroke end and fill, serifs, script, blocks, and each end of the main sliders. */
const MOVES: [string, Design][] = [
  ['', {}], ['stencil=0.4', { stencil: 0.4 }], ['stencil=0.8,pos,round', { stencil: 0.8, stencilPos: 1, stencilRound: 1 }], ['barGap=0.6', { barGap: 0.6 }],
  ['barGap=0.6,through', { barGap: 0.6, barEnds: 'through' }], ['glyphs', glyphOver], ['wobble=1', { wobble: 1 }], ['mono=1', { mono: 1 }], ['slant=1', { slant: 1 }],
  ['rotation=0.3', { rotation: 0.3 }], ['slice=0.5', { slice: 0.5, slicePos: 0.3, sliceRound: 1 }], ['steps=1', { steps: 1 }], ['innerRound=1', { innerRound: 1 }],
  ['joinRound=1', { joinRound: 1 }], ['roundness=1', { roundness: 1 }], ['squareness=1', { squareness: 1 }], ['chamfer=1', { chamfer: 1 }], ['pinch=1', { pinch: 1, pinchPos: 0.2 }],
  ['joints=1', { joints: 1 }], ['cursive=1', { cursive: 1 }], ['script,swash,swell', { scriptForm: 'script', flourish: 'swash', swell: 1 }],
  ['serif=on,cupped,round', { serif: true, serifBase: 'cupped', serifTip: 'round', serifSides: 'inside', serifInner: 'wedge' }], ['serif=on,diamond', { serif: true, serifShape: 'diamond', serifTip: 'angled', serifBalance: 1, serifTops: 0, serifArms: 1, serifArmLean: 1 }],
  ['contrast=0', { contrast: 0 }], ['contrast=1', { contrast: 1, vWeight: 1, hWeight: 0 }], ['weight=0', { weight: 0 }], ['weight=1', { weight: 1 }], ['width=0', { width: 0 }], ['width=1', { width: 1 }],
  ['xHeight=0,ext=1', { xHeight: 0, extenders: 1, descender: 0 }], ['blocks', { build: 'blocks', roundness: 0.6, joinRound: 0.5 }], ['blocks,heavy', { build: 'blocks', weight: 1, width: 0 }],
  ['forms', { story: 'single', aForm: 'spur', kForm: 'bar', iForm: 'bars', sForm: 'flat', diagonals: 'arch', bends: 'round', yForm: 'cup', qForm: 'sweep', rForm: 'loop', bowlForm: 'box', bowlJoin: 'square', dots: 'round', terminalRun: 'straight' }],
  ['upright', { diagonals: 'upright', qForm: 'inside', gForm: 'mirrored' }], ['term=ball', { terminal: 'round', terminalForm: 'ball', terminalSize: 1 }], ['term=brush', { terminal: 'tapered', terminalForm: 'brush', terminalTip: 1, terminalTaper: 1 }],
  ['term=notched', { terminal: 'cut', terminalForm: 'notched', terminalTilt: 1, terminalDepth: 1 }], ['term=clipped', { terminal: 'sharp', terminalForm: 'clipped', terminalPoint: 1, terminalClip: 1, terminalLean: 1 }],
  ['term=inner', { terminal: 'angled', terminalForm: 'inner', terminalSlope: 1 }], ['term=flared', { terminal: 'flat', terminalForm: 'flared', terminalFlare: 1 }], ['term=scooped', { terminal: 'flat', terminalForm: 'scooped', terminalLength: 1, terminalCurl: 0 }],
  ['tail=1,aperture=1', { tail: 1, aperture: 1, counter: 0, crossbar: 1, overlap: 0, apex: 1 }],
  ...(['wire', 'pixels', 'dots', 'lines', 'inline', 'outline', 'shadow'].map(f => [`fill=${f}`, { fill: f, module: 0.6 }] as [string, Design])),
  ['personality', { geoHuman: 0, softSharp: 1, classicFuture: 1, playfulFormal: 0 }],
];
/** The settings whose highlighted part (Font.hl) is hashed with each glyph. */
const HL = ['weight', 'crossbar', 'terminal', 'serif', 'apex', 'counter', 'roundness', 'stencil', 'tail', 'aperture', 'cursive', 'overlap', 'xHeight'];
const LAYOUT_TEXT = 'Hamburg fonts Qy';

/** `v` with every object's keys in order, so the same output hashes the same however it was put together. */
const canon = (v: unknown): unknown => Array.isArray(v) ? v.map(canon)
  : v && typeof v === 'object' ? Object.fromEntries(Object.keys(v as object).sort().map(k => [k, canon((v as Record<string, unknown>)[k])])) : v;
const sha = (s: string) => createHash('sha1').update(s).digest('hex').slice(0, 16);
/** An error a design or glyph threw, on one line. */
const thrown = (e: unknown) => 'THROW ' + String(e).replace(/\s+/g, ' ').slice(0, 80);

/* ---------- one side's dump (run in a child process) ---------- */

/** Every design one checkout's dump covers, by name, built from that checkout's own styles and settings. */
async function designsOf(root: string, free: boolean, only: RegExp | null): Promise<[string, Design][]> {
  const load = (f: string) => import(pathToFileURL(join(root, f)).href);
  const [{ STYLES }, { DEFAULTS, FREE_AT_KEYS }, { STYLE_FONTS }] = await Promise.all([load('shared/content/index.ts'), load('shared/params/index.ts'), load('shared/free-fonts.ts')]);
  const styles = (STYLES as { id: string; params: Design }[]).filter(st => !only || only.test(st.id));
  const named = (base: string, mn: string) => (mn ? `${base}:${mn}` : base);
  const out: [string, Design][] = [];
  for (const st of styles) for (const [mn, mv] of MOVES) out.push([named(st.id, mn), { ...st.params, ...mv }]);
  if (!only || only.test('defaults')) for (const [mn, mv] of MOVES) out.push([named('defaults', mn), { ...DEFAULTS, ...mv }]);
  if (free) for (const st of styles) {
    const fid = STYLE_FONTS[st.id] as string | undefined;
    if (!fid || !(existsSync(keptFile(fid)) || existsSync(ownFile(root, fid)))) continue;
    const freeAt = Object.fromEntries((FREE_AT_KEYS as string[]).map(k => [k, st.params[k]]));
    for (const [mn, mv] of MOVES) out.push([named(`free:${st.id}`, mn), { ...st.params, freeFont: fid, freeAt, ...mv }]);
  }
  return out;
}

/** A free font's file's name (as server/free-fonts.ts's keptFile names it). */
const fileName = (id: string) => id.replace(/[^A-Za-z0-9]+/g, '-') + '.json';
/** The file a free font is kept in. */
const keptFile = (id: string) => join(FONTS_DIR, fileName(id));
/** Where a checkout keeps TypeLab's own fonts (part of the commit, so its dump's key needn't name them). */
const ownFile = (root: string, id: string) => join(root, 'fonts', fileName(id));
/** Every .json file in a folder, in name order. */
const jsonIn = (dir: string) => (existsSync(dir) ? readdirSync(dir).filter(f => f.endsWith('.json')).sort().map(f => join(dir, f)) : []);
/** Every free font kept in FONTS_DIR. */
const keptFonts = () => jsonIn(FONTS_DIR);

/** Writes to `out` a line for each design's layout and metrics ('#layout'; '#font' with the error if the design
    can't be built) and for each of its glyphs: the design, the character and a hash of all of it. Slice `i/n` takes every n-th design from the i-th. On stdout it says how
    many designs it has ('of <n>'), then '+' for each one done, for the progress line. */
async function dump(root: string, out: string, free: boolean, only: RegExp | null, slice: [number, number]) {
  const E = await import(pathToFileURL(join(root, 'shared/engine/index.ts')).href);
  // every kept font, registered before anything is drawn, so a design draws the same whichever slice it is in
  // (a setting can reach for another weight or the italic of a style's font)
  if (free) for (const f of [...keptFonts(), ...jsonIn(join(root, 'fonts'))]) E.registerFreeFont(JSON.parse(readFileSync(f, 'utf8')));
  const lines: string[] = [];
  const mine = (await designsOf(root, free, only)).filter((_, k) => k % slice[1] === slice[0]);
  process.stdout.write(`of ${mine.length}\n`);
  for (const [name, p] of mine) {
    process.stdout.write('+\n');
    let f;
    try { f = E.buildFont(p); } catch (e) { lines.push(`${name}\t#font\t${thrown(e)}`); continue; }
    const m = f.m;
    lines.push(`${name}\t#layout\t${sha(JSON.stringify(f.layout(LAYOUT_TEXT, Infinity)) + JSON.stringify(canon(m.p)) + [m.s, m.cap, m.xh, m.asc, m.desc, m.space, m.track].join(','))}`);
    for (const ch of E.ALL_CHARS as string) {
      let s: string;
      try {
        const g = f.letter(ch).glyph(ch);
        if (!g) s = 'null';
        else {
          // Glyph.corners and GlyphMeta.parts are left out: older commits have them, and nothing draws them
          const { M, corners: _corners, ...rest } = g as Record<string, unknown>;
          const meta = { ...(rest.meta as Record<string, unknown> ?? {}) };
          delete meta.parts;
          s = JSON.stringify(canon({ ...rest, meta, M, hl: HL.map(k => f.hl(ch, k)) }));
        }
      } catch (e) { s = thrown(e); }
      lines.push(`${name}\t${ch}\t${sha(s)}`);
    }
  }
  writeFileSync(out, lines.join('\n') + '\n');
}

/* ---------- comparing two sides ---------- */

const git = (...args: string[]) => execFileSync('git', ['-C', ROOT, ...args], { encoding: 'utf8' }).trim();

/** A checkout of `commit` under .tools/compare, made once and kept, with the packages and free fonts linked in. */
function checkout(commit: string): string {
  const dir = join(WORK, commit.slice(0, 12));
  let head = '';
  try { head = execFileSync('git', ['-C', dir, 'rev-parse', 'HEAD'], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim(); } catch { /* not a checkout yet */ }
  if (head !== commit || !existsSync(join(dir, '.git'))) {
    if (existsSync(dir)) rmSync(dir, { recursive: true, force: true });
    git('worktree', 'prune');
    mkdirSync(WORK, { recursive: true });
    git('worktree', 'add', '--quiet', '--detach', dir, commit);
  }
  const link = (to: string, at: string) => {
    if (!existsSync(to)) return;
    try { lstatSync(at); return; } catch { /* missing: link it */ }
    mkdirSync(dirname(at), { recursive: true });
    symlinkSync(realpathSync(to), at);
  };
  link(resolve(ROOT, 'node_modules'), join(dir, 'node_modules'));
  link(FONTS_DIR, join(dir, 'data/free-fonts'));
  return dir;
}

/** How many designs the dumps under way have, and have done: shown on one line while they run, in a terminal, once
    every one of them has said how many it has. */
const progress = { of: 0, done: 0, waiting: 0, shown: 0 };
function showProgress() {
  if (!process.stderr.isTTY || progress.waiting || Date.now() - progress.shown < 500) return;
  progress.shown = Date.now();
  process.stderr.write(`\r  ${progress.done} of ${progress.of} designs dumped `);
}

/** Dumps checkout `root` into `out`, in `jobs` child processes at once; resolves when all are done. */
function dumpIn(root: string, out: string, free: boolean, only: string | undefined, jobs: number): Promise<void>[] {
  return Array.from({ length: jobs }, (_, i) => new Promise<void>((done, fail) => {
    const args = ['--import', 'tsx', SELF, '--dump', root, `${out}.${i}`, '--slice', `${i}/${jobs}`, ...(free ? ['--free'] : []), ...(only ? ['--only', only] : [])];
    const child = spawn(process.execPath, args, { cwd: ROOT, stdio: ['ignore', 'pipe', 'inherit'] });
    progress.waiting++;
    let rest = '';
    child.stdout.setEncoding('utf8').on('data', (text: string) => {
      const lines = (rest + text).split('\n');
      rest = lines.pop()!;
      for (const l of lines) { if (l === '+') progress.done++; else if (l.startsWith('of ')) { progress.of += +l.slice(3); progress.waiting--; } }
      showProgress();
    });
    child.on('error', fail)
      .on('exit', code => (code === 0 ? done() : fail(new Error(`dumping ${root} (slice ${i}/${jobs}) failed with exit code ${code}`))));
  }));
}

/** The slices of a dump put back together in the order the designs were listed, removing the slice files. */
function joinSlices(out: string, jobs: number): string {
  const blocks = Array.from({ length: jobs }, (_, i) => {
    const text = readFileSync(`${out}.${i}`, 'utf8');
    rmSync(`${out}.${i}`);
    const byDesign: string[][] = [];
    let last = '';
    for (const l of text.split('\n')) {
      if (!l) continue;
      const name = l.slice(0, l.indexOf('\t'));
      if (name !== last) { byDesign.push([]); last = name; }
      byDesign[byDesign.length - 1].push(l);
    }
    return byDesign;
  });
  const lines: string[] = [];
  for (let k = 0; ; k++) {
    const b = blocks[k % jobs][Math.floor(k / jobs)];
    if (!b) break;
    lines.push(...b);
  }
  return lines.join('\n') + '\n';
}

/** A dump read back: each design's hashes by character, in the order written. */
function read(text: string): Map<string, Map<string, string>> {
  const out = new Map<string, Map<string, string>>();
  for (const l of text.split('\n')) {
    if (!l) continue;
    const [name, ch, hash] = l.split('\t');
    if (!out.has(name)) out.set(name, new Map());
    out.get(name)!.set(ch, hash);
  }
  return out;
}

/** What differs between the two dumps: each design that changed, with the characters that did. */
function diff(base: Map<string, Map<string, string>>, now: Map<string, Map<string, string>>): string[] {
  const report: string[] = [];
  for (const [name, hs] of now) {
    const was = base.get(name);
    if (!was) { report.push(`${name}: only in the working tree`); continue; }
    const moved = [...new Set([...hs.keys(), ...was.keys()])].filter(ch => hs.get(ch) !== was.get(ch));
    // (the layout, '#layout', and a font that couldn't be built, '#font', named apart from the characters)
    const named = moved.filter(ch => ch.length > 1), chars = moved.filter(ch => ch.length === 1).join('');
    if (moved.length) report.push(`${name}: ${moved.length} differ: ${[...named, chars].filter(Boolean).join(' ')}`);
  }
  for (const name of base.keys()) if (!now.has(name)) report.push(`${name}: only in the base`);
  return report;
}

async function compare(ref: string, free: boolean, only: string | undefined) {
  const t0 = Date.now();
  if (only) new RegExp(only); // a pattern that doesn't parse stops here, before anything is dumped
  const commit = git('rev-parse', '--verify', `${ref}^{commit}`);
  // each side's designs shared out among the same number of child processes (half the cores, at most 4, as a dump
  // of the free fonts holds a gigabyte or so)
  const jobs = Math.max(1, Math.min(4, Math.floor(availableParallelism() / 2)));
  // the base's dump is kept by commit and by what made it: this file, the options, the slices and the fonts it drew
  const fonts = free ? keptFonts().map(f => readFileSync(f, 'utf8')).join('\n') : '';
  const key = sha([readFileSync(SELF, 'utf8'), free, only ?? '', jobs, fonts].join('\n')).slice(0, 10);
  mkdirSync(WORK, { recursive: true });
  const baseFile = join(WORK, `${commit.slice(0, 12)}-${key}.tsv`), nowFile = join(WORK, `working-${process.pid}.tsv`);
  const cached = existsSync(baseFile);
  console.log(`compare: ${ref}${commit.startsWith(ref) ? '' : ` (${commit.slice(0, 7)})`}${cached ? ', dumped before,' : ''} against the working tree${free ? ', with the free fonts' : ''}${only ? `, styles matching /${only}/` : ''}`);
  const runs = dumpIn(ROOT, nowFile, free, only, jobs);
  if (!cached) runs.push(...dumpIn(checkout(commit), baseFile, free, only, jobs));
  await Promise.all(runs);
  if (process.stderr.isTTY) process.stderr.write('\r\x1b[K');
  if (!cached) writeFileSync(baseFile, joinSlices(baseFile, jobs));
  const now = read(joinSlices(nowFile, jobs)), base = read(readFileSync(baseFile, 'utf8'));
  const report = diff(base, now);
  const glyphs = [...now.values()].reduce((n, hs) => n + hs.size, 0), secs = Math.round((Date.now() - t0) / 1000);
  const took = secs >= 60 ? `${Math.floor(secs / 60)}m ${secs % 60}s` : `${secs}s`;
  for (const l of report) console.log(l);
  console.log(`${report.length ? `${report.length} design${report.length === 1 ? '' : 's'} differ` : '0 differences'} in ${now.size} designs, ${glyphs} glyphs and layouts (${took})`);
  if (report.length) process.exitCode = 1;
}

const { values: a, positionals } = parseArgs({
  allowPositionals: true,
  options: { dump: { type: 'boolean', default: false }, free: { type: 'boolean', default: false }, only: { type: 'string' }, slice: { type: 'string', default: '0/1' } }
});
if (a.dump) {
  const [root, out] = positionals;
  const [i, n] = a.slice!.split('/').map(Number);
  await dump(resolve(root), resolve(out), a.free!, a.only ? new RegExp(a.only) : null, [i, n]);
} else {
  try { await compare(positionals[0] ?? 'HEAD', a.free!, a.only); }
  catch (e) { console.error(String((e as Error).message ?? e)); process.exitCode = 2; }
}
