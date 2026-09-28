/* The design parameters a user edits. Every number is 0..1; the engine maps them to geometry. */

export const TERMINALS = ['flat', 'round', 'sharp', 'angled', 'cut', 'tapered'] as const;
/** The forms each kind of stroke end comes in; the first is the kind as it always looked. */
export const TERMINAL_FORMS = {
  flat: ['plain', 'flared', 'scooped'], round: ['round', 'droplet', 'ball'], sharp: ['pointed', 'clipped'],
  angled: ['outer', 'inner'], cut: ['level', 'notched'], tapered: ['taper', 'brush']
} as const satisfies Record<(typeof TERMINALS)[number], readonly string[]>;
export type TerminalForm = (typeof TERMINAL_FORMS)[keyof typeof TERMINAL_FORMS][number];
const FORM_IDS: readonly string[] = Object.values(TERMINAL_FORMS).flat();
/** The form stroke ends of kind `t` take: `form` when it is one of that kind's, else the kind's first. */
export const formOf = (t: Terminal, form: string): TerminalForm =>
  ((TERMINAL_FORMS[t] as readonly string[]).includes(form) ? form : TERMINAL_FORMS[t][0]) as TerminalForm;
export const SERIF_SHAPES = ['bracketed', 'unbracketed', 'slab', 'wedge'] as const;
/** What the letters are built from: solid ink, a wireframe of every stroke, or a grid of pixels, dots or lines. */
export const FILLS = ['solid', 'wire', 'pixels', 'dots', 'lines'] as const;
/** The lowercase a: two storeys (bowl under a hook) or one (just a bowl). 'auto' lets the personality and cursive settings pick. */
export const STORIES = ['auto', 'double', 'single'] as const;
/** How a bowl meets its stem (b d p q g, the single-storey a): curving out of it, or square, its flat top and bottom running straight into it. */
export const BOWL_JOINS = ['curved', 'square'] as const;
/** The g: its descender hooks back under the bowl from a stem on the right, or drops from the left of the bowl and hooks out to the right. */
export const G_FORMS = ['hook', 'mirrored'] as const;
/** Where the arm and leg of k and K meet: the leg springs from the arm, both meet at the stem, or both meet at the end of a short bar out from it. */
export const K_FORMS = ['arm', 'stem', 'bar'] as const;
/** The dots of i, j and the punctuation. 'auto' squares them unless Roundness or round stroke ends round them off. */
export const DOTS = ['auto', 'square', 'round'] as const;
/** i and l: a plain stem, or a flag at the top and a bar at the foot. 'auto' gives a monospaced sans the bars. */
export const I_FORMS = ['auto', 'plain', 'bars'] as const;
/** The spine of s, S and $: a curve running corner to corner, or level between two tight turns, like two rounded boxes stacked. */
export const S_FORMS = ['curved', 'flat'] as const;
/** Curved stroke ends: stop part way round the curve, or turn onto the nearest level or plumb line and run straight out. */
export const TERMINAL_RUNS = ['curved', 'straight'] as const;
export type Terminal = (typeof TERMINALS)[number];
export type SerifShape = (typeof SERIF_SHAPES)[number];
export type Fill = (typeof FILLS)[number];
export type Story = (typeof STORIES)[number];
export type BowlJoin = (typeof BOWL_JOINS)[number];
export type GForm = (typeof G_FORMS)[number];
export type KForm = (typeof K_FORMS)[number];
export type Dots = (typeof DOTS)[number];
export type IForm = (typeof I_FORMS)[number];
export type SForm = (typeof S_FORMS)[number];
export type TerminalRun = (typeof TERMINAL_RUNS)[number];

export interface Params {
  weight: number; width: number; height: number; slant: number; contrast: number;
  xHeight: number; counter: number; aperture: number; crossbar: number;
  roundness: number; curve: number; apex: number; terminal: Terminal;
  /** how far stroke ends reach: 0.5 is the usual length, lower trims them back, higher draws them on */ terminalLength: number;
  /** one letter's ends set one by one, by end id (see isEndId): each overrides terminalLength for that end */ terminalEnds: Record<string, number>;
  /** how stroke ends bend: 0.5 as drawn, lower straightens them and then flares them out, higher
      curls them on round the way they turn */ terminalCurl: number;
  /** one letter's ends bent one by one, by end id: each overrides terminalCurl for that end */ terminalCurls: Record<string, number>;
  /** whether curved stroke ends follow the curve or run straight out (see TERMINAL_RUNS) */ terminalRun: TerminalRun;
  /** the form of the picked kind of stroke end (see TERMINAL_FORMS); one of another kind means its first */ terminalForm: TerminalForm;
  /* The finer shape of each form of stroke end. Each applies only while its form is picked, and
     its default draws the end as before. */
  /** flared: how much the end widens as it finishes */ terminalFlare: number;
  /** rounded: soft corners (0) to a full half circle (1) */ terminalRound: number;
  /** scooped and notched: how deep the end is hollowed */ terminalDepth: number;
  /** droplet and ball: how big the drop is */ terminalSize: number;
  /** sharp: how far the point reaches past the end, 0.5 as usual */ terminalPoint: number;
  /** clipped: how much of the point is cut off */ terminalClip: number;
  /** sharp: where the point sits across the end, 0 on the inner edge, 0.5 in the middle, 1 on the outer */ terminalLean: number;
  /** angled: how steeply the end is cut, 0.5 as usual */ terminalSlope: number;
  /** cut: the cut turned off level or plumb, 0.5 not at all */ terminalTilt: number;
  /** tapered: how fine the tip gets, 0.5 as usual */ terminalTip: number;
  /** tapered: how far back from the tip the taper starts, 0.5 as usual */ terminalTaper: number;
  /** hand-drawn irregularity */ wobble: number;
  /** entry/exit strokes, looped descenders and italic letterforms */ cursive: number;
  /** round curves drawn as squircles */ squareness: number;
  /** curves replaced by straight, cut-off corners (octagonal) */ chamfer: number;
  /** strokes thin out where they join another stroke */ joints: number;
  /** thick horizontals and thin verticals */ reverse: number;
  /** length of ascenders and descenders */ extenders: number;
  /** descenders alone: 0.5 as long as the stem length makes them, lower shorter, higher longer */ descender: number;
  /** double- or single-storey a */ story: Story;
  /** how far a bowl sinks into its stem (b d p q): 1 branches out of it, 0 is a whole o beside it */ overlap: number;
  /** how bowls meet their stems (see BOWL_JOINS) */ bowlJoin: BowlJoin;
  /** the shape of the g (see G_FORMS) */ gForm: GForm;
  /** where the arm and leg of k and K meet (see K_FORMS) */ kForm: KForm;
  /** square or round dots (see DOTS) */ dots: Dots;
  /** how big the dots are: 0.5 as usual */ dotSize: number;
  /** plain i and l, or with a flag and foot (see I_FORMS) */ iForm: IForm;
  /** the spine of s (see S_FORMS) */ sForm: SForm;
  /** length of tails and hooks (Q y j g t f, the comma, cursive exits): 0.5 is the usual length */ tail: number;
  fill: Fill;
  /** size of the pixels, dots or lines, or the wireframe's line weight */ module: number;
  /** gaps where strokes meet, like a stencil */ stencil: number;
  /** a horizontal cut through every letter */ slice: number;
  serif: boolean; serifSize: number; serifThickness: number; serifShape: SerifShape; serifAngle: number;
  letterSpacing: number; wordSpacing: number; sideBearing: number;
  /** blend toward one fixed advance width for every glyph */ mono: number;
  geoHuman: number; softSharp: number; classicFuture: number; playfulFormal: number;
  /** letters customized on their own: each overrides some of the settings above, by character */ glyphs: Record<string, GlyphParams>;
}

/** Settings every letter shares. The heights are the lines all letters stand on, spacing and the
    fills and slice run across a whole line, and the personality macros push the heights too. */
export const GLOBAL_KEYS = ['height', 'xHeight', 'extenders', 'descender', 'letterSpacing', 'wordSpacing', 'mono', 'fill', 'module', 'slice',
  'geoHuman', 'softSharp', 'classicFuture', 'playfulFormal', 'glyphs'] as const;
/** A setting one letter can have its own value of. */
export type GlyphKey = Exclude<keyof Params, (typeof GLOBAL_KEYS)[number]>;
export type GlyphParams = Partial<Pick<Params, GlyphKey>>;
export const isGlyphKey = (k: string): k is GlyphKey => k in DEFAULTS && !(GLOBAL_KEYS as readonly string[]).includes(k);

export type NumericParam = { [K in keyof Params]: Params[K] extends number ? K : never }[keyof Params];

export const DEFAULTS: Readonly<Params> = Object.freeze({
  weight: 0.4, width: 0.5, height: 0.5, slant: 0, contrast: 0.05,
  xHeight: 0.5, counter: 0.5, aperture: 0.5, crossbar: 0.5,
  roundness: 0, curve: 0.2, apex: 0.4, terminal: 'flat', terminalLength: 0.5, terminalEnds: Object.freeze({}), terminalCurl: 0.5, terminalCurls: Object.freeze({}), terminalRun: 'curved',
  terminalForm: 'plain', terminalFlare: 0.5, terminalDepth: 0.5, terminalSize: 0.5, terminalRound: 1, terminalPoint: 0.5, terminalClip: 0.5, terminalLean: 0.5, terminalSlope: 0.5, terminalTilt: 0.5, terminalTip: 0.5, terminalTaper: 0.5, wobble: 0, cursive: 0,
  squareness: 0, chamfer: 0, joints: 0, reverse: 0, extenders: 0.5, descender: 0.5, story: 'auto', overlap: 1, bowlJoin: 'curved', gForm: 'hook', kForm: 'arm', dots: 'auto', dotSize: 0.5, iForm: 'auto', sForm: 'curved', tail: 0.5,
  fill: 'solid', module: 0.4, stencil: 0, slice: 0,
  serif: false, serifSize: 0.45, serifThickness: 0.35, serifShape: 'bracketed', serifAngle: 0.2,
  letterSpacing: 0.2, wordSpacing: 0.35, sideBearing: 0.5, mono: 0,
  geoHuman: 0.5, softSharp: 0.5, classicFuture: 0.5, playfulFormal: 0.5, glyphs: Object.freeze({})
});

const PARAM_KEYS = Object.keys(DEFAULTS) as (keyof Params)[];

/** A stroke end's id: the index of its stroke in the glyph, then 's' for its start or 'e' for its end.
    A 'p' in front marks a plain end, one that isn't a styled terminal (the foot of a stem, the tip
    of a leg): it keeps the length and curl it is drawn with unless given its own, so the stroke end
    length and curl leave it alone. */
export const isEndId = (id: string) => /^p?\d{1,2}[se]$/.test(id);
/** How far past its usual length an end reaches, in x-heights (negative trims), at `v` on an end's
    own length scale. The letter's Length spans the lower three quarters of it, an eighth of an
    x-height either way; the last quarter draws one end on as far as a whole x-height. */
export function endReach(v: number) {
  const t = (v - 0.5) * 2;
  return t <= 0 ? 0.12 * t : 0.12 * t + 0.88 * t ** 4;
}
/** The stroke end length on an end's own scale: the value there that reaches as far. */
export function onEndScale(len: number) {
  const want = (len - 0.5) * 0.24;
  if (want <= 0) return len;
  let lo = 0.5, hi = 1;
  for (let i = 0; i < 30; i++) { const v = (lo + hi) / 2; if (endReach(v) < want) lo = v; else hi = v; }
  return (lo + hi) / 2;
}
/** How far one stroke end reaches, on its own scale (see endReach): its own length, else the
    stroke end length, except that the tip of a hook, tail or cursive stroke follows its own
    control instead and sits at the usual length (0.5). */
export const endLength = (p: Pick<Params, 'terminalLength'> & { terminalEnds?: Record<string, number> }, id: string, hook = false) =>
  p.terminalEnds?.[id] ?? (hook ? 0.5 : onEndScale(p.terminalLength));
/** How one stroke end bends (see terminalCurl): its own curl, else the stroke end curl, except
    that a plain end (see isEndId) stays as drawn (0.5). */
export const endCurl = (p: { terminalCurl?: number; terminalCurls?: Record<string, number> }, id: string) =>
  p.terminalCurls?.[id] ?? (id.startsWith('p') ? 0.5 : p.terminalCurl ?? 0.5);

/** A valid value for setting `k`, or undefined. Numbers are clamped to 0..1. */
function cleanValue(k: keyof Params, v: unknown): unknown {
  const d = DEFAULTS[k];
  if (k === 'terminalEnds' || k === 'terminalCurls') {
    if (!v || typeof v !== 'object' || Array.isArray(v)) return undefined;
    const out: Record<string, number> = {};
    for (const [id, x] of Object.entries(v)) if (isEndId(id) && typeof x === 'number' && Number.isFinite(x)) out[id] = Math.min(1, Math.max(0, x));
    return out;
  }
  if (typeof d === 'number') return typeof v === 'number' && Number.isFinite(v) ? Math.min(1, Math.max(0, v)) : undefined;
  if (typeof d === 'boolean') return typeof v === 'boolean' ? v : undefined;
  const opts: Partial<Record<keyof Params, readonly unknown[]>> = { terminal: TERMINALS, terminalForm: FORM_IDS, serifShape: SERIF_SHAPES, fill: FILLS, story: STORIES,
    bowlJoin: BOWL_JOINS, gForm: G_FORMS, kForm: K_FORMS, dots: DOTS, iForm: I_FORMS, sForm: S_FORMS, terminalRun: TERMINAL_RUNS };
  return opts[k]?.includes(v) ? v : undefined;
}

/** Per-letter overrides: one character per key, only settings a letter can own, no empty entries. */
function cleanGlyphs(v: unknown): Record<string, GlyphParams> {
  const out: Record<string, GlyphParams> = {};
  if (!v || typeof v !== 'object' || Array.isArray(v)) return out;
  for (const [ch, ov] of Object.entries(v)) {
    if ([...ch].length !== 1 || !ov || typeof ov !== 'object') continue;
    const g: Record<string, unknown> = {};
    for (const [k, x] of Object.entries(ov)) {
      const c = isGlyphKey(k) ? cleanValue(k, x) : undefined;
      if (c !== undefined) g[k] = c;
    }
    for (const e of ['terminalEnds', 'terminalCurls']) if (g[e] && !Object.keys(g[e] as object).length) delete g[e];
    if (Object.keys(g).length) out[ch] = g as GlyphParams;
  }
  return out;
}

/**
 * Turn untrusted input (an imported file, a request body) into valid Params.
 * Unknown keys are dropped, missing or invalid values fall back to the defaults and
 * numbers are clamped to 0..1, so the engine never sees NaN or an unknown option.
 */
export function sanitizeParams(input: unknown): Params {
  const src = (input && typeof input === 'object' ? input : {}) as Record<string, unknown>;
  const out = { ...DEFAULTS } as Record<string, unknown>;
  for (const k of PARAM_KEYS) {
    const c = k === 'glyphs' ? cleanGlyphs(src[k]) : cleanValue(k, src[k]);
    if (c !== undefined) out[k] = c;
  }
  return out as unknown as Params;
}

/** True when `input` is already fully valid (used by the API to reject bad bodies loudly). */
export function isValidParams(input: unknown): input is Params {
  if (!input || typeof input !== 'object') return false;
  const src = input as Record<string, unknown>;
  const clean = sanitizeParams(input) as unknown as Record<string, unknown>;
  return PARAM_KEYS.every(k => typeof clean[k] === 'object' ? JSON.stringify(src[k]) === JSON.stringify(clean[k]) : src[k] === clean[k]);
}
