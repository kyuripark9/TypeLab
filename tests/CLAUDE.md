# tests: node:test suites and the golden outlines

Every `*.test.ts` here runs under `node --import tsx --test` (`npm test` runs them all). Tests are type-checked with
the rest (`npm run typecheck`, strict, `noUnusedLocals`), so an unused local in a test fails the type check.

## Running some of them

```sh
tools/node.sh node --import tsx --test tests/cuts.test.ts                                   # one file
tools/node.sh node --import tsx --test --test-name-pattern "the slice" tests/cuts.test.ts    # tests by name
tools/node.sh node --import tsx --test --test-name-pattern "sets each stroke end on its own" "tests/**/*.test.ts"   # by name, everywhere
```

`--test-name-pattern` must come before the files: placed after them it is ignored and the whole file runs. It
matches `describe` and `it` names (a regular expression), and a match on a `describe` runs every test in it. Most
files' outer `describe` lists their setting keys (cuts.test.ts's names `slice` and `stencil`), so take words from an
`it` title. The `it`s in api.test.ts build on the ones before them: select its `describe` (`"designs API"`,
`"accounts API"`, `"Google sign-in"`), not one `it`. Run tests from the repo root (boundaries.test.ts reads `shared/`
relative to it). Drop `tools/node.sh` where `node` is 22.13 or newer.

## The files

| File | Covers |
| --- | --- |
| `engine.test.ts` | The engine as a whole: every style and the `extremes` (settings at their ends and in odd combinations) draw every glyph with finite outlines; spacing, customized letters, layout; the glyph registry (`glyphIds()`, `meta.params`); `expandStroke`'s outputs; basic block letters (every character, a real lowercase, Weight, Contrast, Bowls, Steps) and slot blocks; rotation; sliders that keep changing to 100 |
| `letterforms.test.ts` | The a's storey and spur, bowl joins and overlap, the forms of g k Q R s Y i/l/I/J, dots, diagonals, bends, box bowls, mirroring, crossbar height; descenders, Stem length, tails |
| `ends.test.ts` | Stroke ends: each kind and form and its finer sliders, straight runs, Length and Curl for all ends and each one (terminals, hooks, tails, plain ends such as T's `p0s`) |
| `corners.test.ts` | Each corner's roundness inside and out (O's `0t0` to `0t3`), end corners, the inside corners where strokes meet (t's `0j0` to `0j3`), Joins' crotches against Counters' square corners, Steps, Squareness, Facets |
| `cuts.test.ts` | Stencil (gaps, Position, Rounding), each join opened on its own (F's, A's and M's join ids), the crossbar Gap and Through, the Slice |
| `fills.test.ts` | Pixels and dots on one grid, every fill on every glyph, Outline, Inline, Shadow, and `boolean.ts`'s unions and cuts, and `unite` |
| `weights.test.ts` | Weight, Contrast both ways, Verticals and Horizontals, one stroke's own weight, Pinch |
| `serifs.test.ts` | Where serifs sit (`serifAt`), tips, bases and cups, bracket, balance, sides, inside serifs, tops and arms, the diamond, cleaning saved serif settings |
| `script.test.ts` | Cursive and the script letterforms (`.scr`), Swell, Flourishes (`.sw`, reaching past a letter without widening it) |
| `grid.test.ts` | Construction grids: lines and rounds, the groups and their names (Grid A to T), what is shared, slanted and drawn letters, the 40-line and 28-round limits |
| `params.test.ts` | `sanitizeParams` and `isValidParams`; older settings (a separate reverse contrast, the first Lowercase height scale, blocks before there were basic ones); databases written before `PARAMS_VERSION` 2 and at 2 upgraded once |
| `handles.test.ts` | Every per-letter map in `ID_KEYS` changes its letter across its range (`HandleKey` must list them all) |
| `drag.test.ts` | `client/lib/drag.ts`: which setting a drag moves, the solved value, ends kept in order, handles per control |
| `pen.test.ts` | `client/lib/pen.ts` and `fitOutline`: tracing, drawn letters in `params.outlines`, point edits, Sync all, Mirror, Snap |
| `reach.test.ts` | `client/lib/reach.ts`: whether a setting changes the letters in view, and which letters it would change |
| `pages.test.ts` | Pages and controls: each control on one page, page and control order, links naming a page or group (`pageOf`), Find a setting |
| `icons.test.ts` | Every slider has an icon in `SliderIcons.tsx`, and every icon belongs to a slider |
| `styles.test.ts` | Valid presets; the Style page's cards (solid letters, every Feeling carried, `TAG_FACE` on the page); word spaces in joined-up scripts; v w V W on the baseline, no gap after a curled Q |
| `traits.test.ts` | The Adjust tab's trait steps and the style search |
| `family.test.ts` | `shared/family.ts` and the family `.zip` (`server/export.ts`): weights, members, names and style bits |
| `free-fonts.test.ts` | Every style's free font id (none for one built from blocks); converting a font file as the server does; drawing a design in a free font and moving its letters (skin, restyle, the twin, `formChanged`); the export's notice; the API route; TypeLab's own fonts, and their letters moved whole (Mainline's u drawn in pieces, an l's foot, Gumdrop's round ends) |
| `api.test.ts` | The HTTP API on an in-memory store: designs, accounts, Google sign-in, export, a database from before owners |
| `boundaries.test.ts` | Nothing under `shared/` imports `client/` or `server/` or touches the DOM (a regex: a comment saying `window.` trips it) |
| `golden.test.ts` | The engine's golden outlines; the free fonts' too with `GOLDEN_FREE=1` |

| `stroke-order.test.ts` | Every glyph draws its strokes in the order `tests/stroke-order.txt` keeps (the defaults, each letter form, and the settings that draw strokes of their own), so saved per-letter values stay on their strokes. An order changed on purpose: `UPDATE_STROKE_ORDER=1 node --import tsx --test tests/stroke-order.test.ts` rewrites the file |
| `editor.test.ts` | `client/state/editor.ts` without a browser: a design written in its style's free font and back, a style built from blocks started without one, a customized letter's own values, loading a style over changes, renaming, the 200-step undo limit |

Invariants other files also pin: every handle's id is one a saved design keeps (handles.test.ts); deep links parse,
every nested slider has a place in the panel, and every part a control shapes names a real control (pages.test.ts);
every option setting is tried at its other choices (reach.test.ts); `weightUnscale` undoes `weightScale`
(family.test.ts); `skinFollows` weighs only settings free letters follow, every restyle hands an unmoved letter back
as it is, and the twin's fit undoes `metrics()` (free-fonts.test.ts); an accounts table from before Google sign-in is
upgraded, and `joinGoogle`'s three outcomes (api.test.ts).

## Helpers and fixtures

- `outlines.ts` reads outlines: `contours`, `curves`, `xsOf`, `ysOf` read a glyph's `d` (SVG path data,
  y down) as it is; `pathPts` reads `d` but returns each command's end point back in font units (y up); `coords` reads
  `cmds` (font units, y up). Every other glyph field (strokes, serifs, counters, skeleton, marks)
  is y up. Don't mix the two.
- `api.test.ts` mounts `createApp` on `DesignStore(':memory:')` at a random port; `browser()` is a client with its own
  cookie jar; a stand-in `GoogleAuth` names a person per code and checks the PKCE verifier. The `it`s of each
  `describe` run in order and build on the designs and accounts the earlier ones made.
- `free-fonts.test.ts` builds a small font with opentype.js (`fontFile()`: an H, an o of quadratic curves, a space)
  and stands in for Google Fonts (`googleFonts()`), so nothing is fetched.
- `params.test.ts` and api.test.ts's `design storage` write a database in an older shape into a temporary directory
  and open it with `DesignStore`; keep those shapes as they are when the schema grows.

## The golden files

`tests/golden/outlines.txt` (the engine set) and `tests/golden/free-outlines.txt` (the free set) hold three base64url
characters per glyph: a SHA-1 of its placed outline to a hundredth of a unit, with its left side bearing and advance.
`tools/golden.ts` computes them.

- Engine probes: `style:<id>` for every style, `defaults`, `<key>=<value>` for every setting at its ends and in each
  option (tried where it shows), the stroke-end forms, a `glyphs` probe with letters of their own, block probes (basic and slots),
  and stencil, crossbar-gap and join-gap probes on ten styles. `npm test` checks them.
- Free probes: `<style>@<hash of the font file>[:<move>]`, each style in its free font as picked and moved by a
  few settings. TypeLab's own fonts are always there (`fonts/`); the Google ones need to be in `data/free-fonts`
  (`FONTS_DIR`). `npm run golden` checks them, or `npm test` with `GOLDEN_FREE=1`. A font that isn't kept, or whose
  file changed (an own font imported again), drops out of the check silently: after an import, `golden:update`.
- What golden misses: letter and word spacing (layout only), marks, counters, skeletons, highlights, metrics, and
  per-letter values beyond its probes. `npm run compare` covers those.

Update them (`npm run golden:update`) only for a change you meant, after looking at it rendered, and commit them with
that change. Renaming a setting key, an option or a style id shows as `new probe` and `probe gone`. A failure names
each probe and the letters that moved.
