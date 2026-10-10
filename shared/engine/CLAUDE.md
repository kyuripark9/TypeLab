# shared/engine: the font engine

Params in, glyph outlines out. Pure math with no DOM: the browser draws the live preview with it and the server
builds exported fonts with it. Coordinates are font units, 1000 to the em, y up, baseline at 0. The settings
themselves (spec, ids, scales) are described in shared/CLAUDE.md.

Code that builds fonts imports `shared/engine` (`index.ts`): importing it registers every glyph (`glyphs/`, then
`script.ts`, then `swash.ts`, which imports `script.ts` itself), and `buildFont` finds no letters without it. A pure
helper such as `resolve` may be imported from its own file.

## From params to an outline

1. `resolve(params)` (`font.ts`) gives `Effective`: DEFAULTS filled in; the personality macros (geoHuman, softSharp,
   classicFuture, playfulFormal) pushed into curve, aperture, contrast, roundness, apex, xHeight, width and
   letterSpacing; Contrast split into the pen's amount and `reverse` (`contrastOf`); and square, classic, bounce,
   singleStory, stressDeg derived.
2. `metrics(e)` (`font.ts`) gives `Metrics` (`m`): every measure the glyph functions draw with, and the pen `m.ctx`.
3. `buildFont(params, from?)` gives a `Font`. `font.glyph(ch)` builds a letter on first ask and keeps it:
   - `pickGlyph`: a letter drawn in Points (`params.outlines[ch]`) is `drawnGlyph`; else a letter already built with
     the same settings (an earlier font `from`, whose params differ only in `outlines`, lends its letters, so dragging
     a point rebuilds one letter); else `fromSettings`.
   - `fromSettings`: a letter with its own settings (`params.glyphs[ch]`) comes from `font.letter(ch)`, a font built
     with them; a design written in a free font that has the letter draws it (`freeGlyph`), or, unless it is a pixel
     font, its twin's (`twinGlyph`) when `formChanged` says it is asked for in another form than the font's;
     otherwise `build: 'blocks'` draws `buildBlock`, and anything else (a letter the free font lacks too) is
     `buildGlyph(variantOf(ch, e), m, ch)`.
   - `variantOf` picks the glyph id: in a script (`scriptForms`) `<ch>.sw` with Flourishes on Swash, else `<ch>.scr`;
     `a.alt` for a single-storey a; `<ch>.cur` from Cursive 0.35 (`CURSIVE_FORMS`); else `ch`.
4. `buildGlyph` (`glyph.ts`) runs its stages in this order:
   1. the glyph function draws centerline strokes on a `Builder` and returns the body width;
   2. `boxQuarters` (`corners.ts`) when Bowls are Box; `weighFillets`; `markTurns` gives each turn its id and radii;
   3. `stretchTerminals` (`ends.ts`): Length, Curl, straight runs, a capital's swash end; the body grows by their reach;
   4. `faceSerifs`, then `cupSerifs` (`serif-sides.ts`), while serifs are on;
   5. `wobbleSkeleton`: Hand-drawn moves the strokes, counters, marks and end homes through one field;
   6. `expandStroke` (`stroke.ts`) on every stroke drawn with a path (not dots, fillets or blobs), weighed by its own
      stroke weight; then each stroke clipped to its `clip` (`clipMade` keeps the points the clip adds);
   7. `endCorners` (`corners.ts`), then `joinCorners` (`joins.ts`), whose fillets join the strokes as part `fillet`;
   8. `markJoins`, `barsThrough` and the stencil pieces (`stencil.ts`);
   9. each stroke's outline finished, in this order: a ring split by `ringOutline`; otherwise clipped a second time,
      cut into its stencil pieces (their cut corners rounded by Rounding), replaced by its bar where one runs through,
      cut under diamond serifs, cut by the through-bar bands, and only then rounded by Roundness (`m.R`); then its
      serifs (`buildSerif`) and its terminal and end marks;
   10. side bearings: the glyph's sb factors times `m.sb`, room for what reaches past the body, `clearStems` under
       diamond serifs;
   11. `placeGlyph`: rotation, mirroring, monospacing, whole fill cells, the shadow's room, bounce and jitter, slant
       about `SLANT_PIVOT` of the x-height, then the slice and the fills on the final outline; it sets `M`, `cmds`, `d`.
5. `font.hl(ch, key)` (`highlight.ts`) is the part of a letter a control shapes, for the explainer and the inspector.

## Files

| File | Holds |
| --- | --- |
| `index.ts` | The public entry: registers the glyphs, re-exports what the client, server and tools use |
| `font.ts` | The hub: types (Effective, Metrics, Glyph, Font), the glyph table (`defGlyph`, `glyphDefOf`, `glyphIds()`, `hasGlyph`), `resolve`, `metrics` and the formulas it shares, `Builder`, `variantOf`, `buildFont` |
| `glyph.ts` | One letter: `buildGlyph`'s stages, `placeGlyph`, `buildBlock`, `drawnGlyph`, `blankParts()` (the empty parts of a letter not built from strokes) |
| `glyphs/index.ts` | Registers the letter files in order: `upper.ts`, `lower.ts`, `figures.ts`, `punctuation.ts` (punctuation and symbols) |
| `glyphs/shared.ts` | Constructions the letter files share: bowls, the s, shoulders (`arch`), K's arms, upright and arched diagonals, tails and hooks, cursive `entry`/`exitEnd`, dots (`dotK`), `lc` |
| `glyphs/turns.ts` | Strokes that turn at a point (`turnStroke`, `placeTurns`): A M N V W Y Z, v w y z ^, the turns of Q and R; `POINTED`, `peakPast`, `peakCut` |
| `script.ts`, `swash.ts` | Script capitals and joined small letters (`<ch>.scr`); swash letters drawn over them (`<ch>.sw`, bases `d.short`, `z.open`) |
| `blocks.ts` | Block letters: rings of corners on a 224 × 175 grid, y down from the top, each corner of a kind ('o', 'e', 'i', 's'); `BLOCKS`, `blockDims`, `blockRings` |
| `stroke.ts` | The stroke expander: sampling, the pen model, terminals (`termCap`), sides, serifs (`buildSerif`, cups, diamonds) |
| `ends.ts` | Stroke ends drawn on, trimmed, curled, run straight (`stretchTerminals`) |
| `corners.ts` | Turns and square end corners rounded, stepped, or squared in box bowls (`turnsOf`, `markTurns`, `endCorners`) |
| `joins.ts` | Inside corners where strokes cross, filled with fillets (`joinCorners`, `joinR`, `innerFor`, `innerShare`) |
| `stencil.ts` | Stencil gaps at joins and turns, the crossbar Gap, bars run Through |
| `serif-sides.ts` | Which way each stem's serifs reach (Sides, inside serifs), and cupped feet |
| `effects.ts`, `boolean.ts` | The slice and the fills (wire, pixels, dots, lines, inline, outline, shadow); unions and cuts of outlines (`shape`, `combine`) |
| `outline.ts` | Drawn letters (`Node`, `Drawn`), curve fitting (`fitOutline`), `cleanDrawn`; imports only types, as shared/params reads it |
| `grid.ts` | Construction grids and their groups, Grid A to T (`glyphGrid`, `gridGroups`, `gridOf`) |
| `free.ts` | The free-font registry and its packed format |
| `free-letters.ts` | A design's letters drawn from its free font: `freeLetters`, `freeGlyph`, `restyled`, the twin |
| `skin.ts`, `scan.ts` | A free font's letter rigged on its scanned skeleton and moved by the engine's measures; the scan |
| `restyle.ts` | The engine's shapes redrawn on a free font's letter: dots, bowls, ends, serifs, stencil, peaks, corners |
| `highlight.ts` | `highlightD` and `RING_KEYS` |
| `geom.ts`, `types.ts` | Béziers, polygons, corner rounding, path output (`cmdsToD`); points, commands, the pen, marks |

## Shared formulas and constants

A formula or constant two files need lives once and both import it. `metrics()`'s shared pieces sit beside it in
`font.ts`: `serifLen`, `counterScale`, `roundnessR`, `innerRoundR`, `stencilOff`, `bowlK`, `bowlOrg`, `dotRoundOf`,
`cursiveHookR`, the constants `SERIF_SB`, `SLANT_PIVOT`, `CURSIVE_FORMS`, and the helpers `hasSerif`, `variantOf`,
`scriptId`, `swashId`, `scriptForms`, `termSpec`, `quarterK`, `strokeWt`. Elsewhere: `geom.ts` (`inPoly`, `CIRCLE_K`,
`MIN_ROUND`, `SAME_PT`), `shared/params/scales.ts` (`endId`, the id tests, `slantDeg`, `joinGap`, `barCut`,
`endReach`), `stroke.ts` (`STEP_DEPTH`), `joins.ts` (`innerShare`), `glyphs/turns.ts` (`POINTED`, `peakPast`,
`peakCut`), `skin.ts` (`FORM_LETTERS`, `descK`), `restyle.ts` (`HOOK_LETTERS`, `OPEN_LETTERS`, `added`).

Some code repeats or mirrors another's, because sharing would change results (a shared helper takes its sums in
another order) or because it works in other units. Copies with their sums in another order: `effects.ts` `within`
and `skin.ts` `inPoly` (of `geom.ts` `inPoly`); `dotK` (`glyphs/shared.ts`) and `skinMeasures`' `dot`. Mirrors:
`metrics()`' `asc` and `skinMeasures`' `asc`; `joinGap`/`barCut` (`shared/params/scales.ts`) and `restyleStencil`,
which rescales them to a free font's cap height; the heights in `moveMap` (`skin.ts`) and `restyled`
(`free-letters.ts`); `serifTh` and `diamondK`, which undoes it; `cap()` and `squareEnd` (`stroke.ts`). Each end names
the other in a comment, except `geom.ts` `inPoly` and `joinGap`/`barCut`, which don't name their copies: grep for the
name before changing them. If you change one end, change the other, then run golden and compare.

## The free-font path

A design with `freeFont` set draws its letters from a Google font instead of building them.

1. `free.ts`: the server converts a font into `FreeFontData` (1000 to the em, y up, glyphs as packed anchor points);
   the browser (`client/lib/free.ts`) and the server register it with `registerFreeFont` before drawing, and
   `onFreeFont` tells listeners. The same format is the server's cache in `data/free-fonts/*.json`: changing
   `PackedNode` or `FreeFontData` means throwing those files away.
2. `free-letters.ts`: `freeLetters` compares where the font was picked (`pick`, from `{ ...params, ...params.freeAt }`)
   with what is asked (`now`). `want` is the family's nearest weight, and its italic past half of a 12° lean
   (`nearestFont`); until it is registered the font is `freePending`, and `freeMissing` / `freeFontsWanted` say what
   to fetch. Placement effects (fill, mirror, monospacing, bounce, slant, rotation, wobble, slice) count only as far as
   they move from the pick.
3. `skin.ts` with `scan.ts`: `skinRig` hangs every outline sample (a `Bone`) on the letter's scanned skeleton;
   `skinMove` moves it by the change in `skinMeasures` from `pick` to `now` (stem, bar, width, x-height, crossbar, serif
   length, Stem length, Inner space, dots, Pinch, Ink traps) and returns `rig.contours` itself when nothing moved. A
   pixel font (`FREE_FAMILIES[family].grid`) is never rigged, only stretched.
4. `restyle.ts`: `restyled` (in `free-letters.ts`) redraws the engine's shapes on the moved outline in a fixed order,
   Dots, Bowls, Ends, Serifs, Stencil, Peaks, Corners, each only where its settings differ from the pick, each handing
   back the very same array when nothing it follows moved. Results are cached by the contours and a key of every
   setting the steps read.
5. The twin: `formChanged` says a letter is asked for in a form the font hasn't got (another build, script or not,
   cursive, swash capitals, the a's storeys, a `FORM_LETTERS` setting); `twinGlyph` draws the engine's own letter at
   the settings the font reads as (`twinFit`: weight, contrast, x-height, width, serifs), moved as far as the design
   moves from the pick.
6. `freeGlyph` sizes the letter to the design, gives it side bearings, places it with `placeGlyph`, and keeps the
   placed outline as `Glyph.drawn`, so Points opens with the font's own points.

A setting the free-font code compares between `pick` and `now` must be `free: true` in `shared/params/spec.ts` (or
`freeAt` never records it), in `skin.ts` `SKIN_KEYS` where it applies (so `skinFollows`, which `client/lib/reach.ts`
asks, answers right), and in `restyled`'s cache key if a restyle reads it; give it a `FREE_MOVES` entry in
tools/golden.ts, or the free set never moves it. Never mutate `rig.contours`, what
`skinMove` returns, or the rings `inkRings` returns: results are cached by array identity.

## Glossary

| Term | Meaning |
| --- | --- |
| Params | The user's settings (`shared/params/model.ts`): numbers 0..1, options, `glyphs[ch]` (a letter's own), `outlines[ch]` (drawn letters), `freeFont`, `freeAt` |
| Effective (`e`, `m.p`, `font.eff`) | Params after `resolve`. `e.contrast` is the pen's amount (`contrastOf` gives 0.05..1; the classicFuture macro can push it down to 0), not the slider; read raw Params where the slider value is meant |
| Metrics (`m`) | Measures from `metrics(e)`: `s` stem, `thin` hairline and bars, `hT` a horizontal stroke's thickness, `tDir(dx, dy)` thickness by direction, `cap`, `xh`, `asc`, `desc` (negative), `os` overshoot, `ws` width scale, `W(base, cls)` body width ('r' round, 'c' classically narrow) |
| more Metrics | `k`, `org` quarter-turn tension and organic share; `sb` a stem's side bearing; `track`, `space`; `slant` (a tangent), `rot` (radians clockwise); `R` Roundness radius; `innerR` Counters radius; `dotRound`; `bar`, `apex`, `ap`, `cnt` (-1..1), `sq`, `cur`, `wob`; `cell`, `gap`, `gapOff`, `gapRound`, `sliceY`, `sliceH`, `sliceRound`; `serif` (on or off); `monoAdv` the advance monospacing pulls toward; `qpt(x0, y0, x1, y1, mode, u)` the point and tangent at `u` along a quarter turn, drawn with the pen's tension |
| PenCtx (`m.ctx`, `pen`) | What the stroke expander knows: thick, thin, stress, k, org, terminal and its `term` (TermSpec), serif spec, chamfer, joints, reverse, pinch, swell, wobble, dropLow |
| Builder (`g`, `b`) | What a glyph function draws on: `path`, `line`, `stem`, `dot`, `fillet`, `blob`, `counter`, `mark`; `strokes`, `reachL`/`reachR`, `sb`, `joins` |
| glyph table, `def` | `defGlyph(id, sb, fn, meta)` registers a glyph: `sb` side-bearing factors (1 a stem, about .55 round, .25 diagonal), `fn(g, m)` returns the body width, `meta.params` the controls the inspector shows first |
| glyph id | The character, or a form of it: `a.alt`, `f.cur`, `y.cur`, `<ch>.scr`, `<ch>.sw`; `d.short` and `z.open` are swash bases never picked. `buildGlyph` takes the id; `g.ch` is the character |
| Cmd | A path command: `['M',x,y]`, `['L',x,y,opts?]`, `['C',...,opts?]`, `['hv',x,y,opts?]` (or `'vh'`), `['Z']`. Outlines use only M, L, C, Z |
| `hv`, `vh` | A quarter (super)ellipse leaving level and arriving plumb, or the reverse; `u0`/`u1` draw part of it |
| command options | `w` a weight ('thin', 'thick', 0..1), `even` (no easing in), `turn` (TurnR at its start), `u0`/`u1` |
| StrokeOpts | `s`/`e` EndType, `part`, `w`, `ws`/`we` tapers, `scale` (a lighter pen, no serifs), `clip`, `counter`, `serifS`/`serifE`, `serifScale`, `pen: 'pointed'`, `miter`, `endRoom` |
| EndType | `'term'` styled terminal, `'flat'`, `'h'` cut level, `'v'` cut plumb, `'join'` buried in another stroke (`T`, `H`, `J` in glyphs/shared.ts) |
| part | A stroke's anatomy name (stem, bowl, crossbar, arm, tail, entry, fillet, drawn...). It drives behaviour: the crossbar's Gap, stencil and run-through (`isBar`: crossbar, bar), tail and entry ends (ends.ts), fillets (glyph.ts), what a control highlights (highlight.ts), and the inspector's names and drags (`ANATOMY`, `PART_CONTROL`, client/lib/drag.ts). Arm serifs go by an end's direction (`serifPlace`), not by part |
| stroke id | A stroke's index in the order its glyph function drew it (`String(si)`); dots, fillets and blobs count too |
| end id | `${si}s` or `${si}e`, with `p` in front for a plain end (a stem's foot): `0s`, `p1e` |
| turn id | `${si}t${k}`: turn k along stroke si's centerline, numbered by `turnsOf` (a change of direction over 0.2 rad) |
| corner id | A turn id, an end's corner (`0sl`, `0er`: the stroke, its start or end, the left or right side looking out of it), or `${si}j${k}`, the k-th inside corner where stroke si meets a later stroke |
| join id | `${si}s`/`${si}e` for an end that runs into another stroke, or a turn id; keys `joinGaps` |
| ID_KEYS | The per-letter maps keyed by these ids: strokeWeights, terminalEnds, terminalCurls, corners, innerCorners (turns only), cornerSteps, joinGaps |
| Mark | A point on a placed glyph: `terminal`, `end`, `join`, `corner`, `apex`, `vertex`, `overlap`, `tail`, `exit`, `entry`; with `id`, `r` (an end's radius), `hook`, `home` (where an end sat before its own length and curl, or a corner's turn point), `v` (a corner's outside roundness, or a join's gap, each on its own control's scale), `vi`/`st` (a turn's inside roundness, a corner's step), `dx`/`dy` (the way a join's gap opens) |
| TurnR | `{ o, i, step? }`: a turn's outline radii outside and inside, and optionally a square step cut out of the outside instead, as a value on the Steps scale (a share of the deepest step; `STEP_DEPTH` makes it a depth), unlike `Pt.step` |
| Pt flags | `smooth` (a sampled curve point, never a corner), `sharp` (never rounded), `r` (a forced radius), `step` (a depth in font units) |
| fillet | A filled quarter round in an inside corner where strokes meet (part `fillet`); dropped where a stencil or a through bar cuts that join, and never drawn in the wireframe fill |
| Expanded | `expandStroke`'s result: contours, `loop` (a ring, two contours, no ends), ends, `endCorners` (the outline's own Pt objects), skeleton, thickness |
| serifAt | Where each serif in `Glyph.serifs` sits: `foot`, `top` or `arm`; the two arrays run in parallel |
| SerifSides | `'a'` toward −x (or −y), `'b'` toward +x, `'both'`, or null |
| Glyph | `strokes`, `serifs`, `serifAt`, `counters`, `marks`, `skeleton`, `meta`, `bodyW`, `lsb`, `rsb`, `adv`, `M`, `cmds` (placed, y up), `d` (SVG, y down, to 0.1), `drawn?` |
| Unplaced, `blankParts()` | A glyph before `placeGlyph`; the empty parts a block, drawn or free letter has. A new Glyph field such letters leave empty goes in `blankParts` |
| `font.letter(ch)` | The font a letter is drawn from: one built from `{ ...params, ...glyphs[ch], glyphs: {} }` when it has its own settings |
| hl, RING_KEYS | `font.hl(ch, key)` is the SVG path of what control `key` shapes; keys in `RING_KEYS` light rings round marks instead of strokes |
| cell | The fill grid's size (`m.cell`); advances and tracking snap to it for pixels and dots. Not the client's strip `.cell`, nor `scan.ts`'s ink Grid |
| wobble | Hand-drawn: one smooth displacement field per glyph, seeded by its char code; `Builder.joins` pins it where script letters meet |
| freeAt, pick, now | The settings a free font was picked at; `fl.pick` and `fl.now` are those and the asked-for ones, resolved |
| skin, rig | A free font's letter moved on its skeleton; the rig is the letter prepared for that (`SkinRig`: contours, bones, ctx, stem, bar) |
| restyle | Redrawing one of the engine's shapes on a free font's letter where the settings ask for another than the font's |
| twin | The engine's own letter at the settings a free font reads as, for forms the font hasn't got. (The pen's mirror partner in PenCanvas is also called twin; unrelated) |
| skeleton (scan) | A scanned letter's middle lines as a graph: a node with one edge is a free end, three or more a join |
| drawn | A letter drawn in Points (`params.outlines`), or a free font's as placed (`Glyph.drawn`); the settings don't shape it |
| construction grid | A letter's level, upright and diagonal lines and its circles; groups Grid A to T, named set × kind (capitals A–D, lowercase E–H, figures I–L, punctuation M–P, symbols Q–T) |

## Invariants

- **Stroke order is saved data.** Every per-letter id starts with a stroke index, and saved designs keep a letter's
  own values under those ids. Never reorder strokes in a glyph function or insert one before others; draw a new
  stroke last, and a stroke drawn only under some settings last of all. corners, cuts and ends tests pin some ids.
- Built ids must match the tests in `shared/params/scales.ts` (one or two digits each); `sanitizeParams` silently
  drops saved values whose ids don't.
- Turns are numbered the same way in `glyphs/turns.ts` (every interior point of a turned stroke is a turn),
  `markTurns`, and `markJoins`. Anything that edits a skeleton between them (ends, cups, wobble) must not add or
  remove a change of direction over 0.2 rad.
- `tail` and `exit` marks sit within a unit of their stroke's drawn tip (compute them with `m.qpt` on the same
  quarter); `ends.ts` and `boxQuarters` find them by position.
- A glyph function returns its body width; anything reaching past it goes through `tailEnd`, `exitMark` or `entry`.
- `meta.params` entries are control keys (the inspector casts them unchecked). A new `part` needs `ANATOMY`
  (`shared/content/copy.ts`) and `PART_CONTROL` (`shared/content/controls.ts`) entries to show in the inspector.
- Every character of `CHARSET` has a glyph; every non-lowercase one has a `BLOCKS` entry (the lowercase fall back to
  their capitals).
- Most modules `font.ts` loads import values back from it (`glyph.ts` and its stages, `free-letters.ts`, `skin.ts`,
  `restyle.ts`): they may use those values only inside functions, never at module load. `stroke.ts` imports values
  only from `geom.ts` (types aside), so restyle.ts and the client's diagrams (`client/components/Diagram.tsx`) can
  call it with a PenCtx of their own. `term` is optional: left out, terminals are drawn with the expander's default
  `TERM`, so a PenCtx that draws styled terminals sets it with `termSpec`.
- Outline points are tracked by identity from `expandStroke` to placement (`endCorners`, `clipMade`, the stencil's
  `drawn` sets): clipping and splitting keep the original Pt objects; never copy them in between.
- Outlines wind anticlockwise with clockwise holes; `combine` returns them so, and the fills rely on it.
- Fills and the slice run last, on the placed outline, so a grid lines up across a line. A new effect in
  `placeGlyph` needs the same neutralizing in `freeLetters`, or a free font's letters change as soon as it is picked.
- Grid names come from the order of `SETS` and `KINDS` in `grid.ts`; the inspector shows them and tests pin them.
- Every numeric setting keeps changing the letters to 1: map as a share of the range (`weighed`, `push`), and keep
  piecewise maps around 0.5 continuous.

## Floating-point order is behaviour

Golden compares outlines to a hundredth of a unit, and compare (planned) compares the full output. Reordering arithmetic
(`a + b + c` against `a + (b + c)`), swapping a local copy for a shared helper with its sums in another order, or
`Math.hypot` for a square root moves points by tiny amounts, and tiny amounts flip decisions made near a threshold:
an inside test on an edge, a turn at 0.2 rad, a clip on a slanted half-plane (`buildGlyph` clips a stroke a second
time as it finishes the outline, and dropping that clip changes K, k and y). Treat any such edit as a behaviour
change and verify it.

## How to verify

- `npm test`: unit tests and the engine's golden outlines (every style, every setting at its ends and options).
- `npm run typecheck`: `npm test` runs through tsx, which doesn't check types; the compile checks (spec against
  model, `SUBS`, `FORM_OPTIONS`, `SAME_WITHIN` covering `SkinMeasures`) fail only here.
- `npm run golden`: also the free-font set (needs `data/free-fonts`), for anything the free-font path reads. If it
  prints `free: no free fonts kept in … (skipped)`, the free set wasn't checked; `npm run render -- --style <id>
  --free` fetches a style's font into `data/free-fonts`.
- `npm run compare` (planned): every glyph of every style under about 50 setting combinations, built at a git ref and
  in the working tree, compared in full (outline, marks, counters, strokes, skeleton, serifs, spacing, highlights,
  layout, metrics). It catches what golden's probes don't reach. Use it for any refactor.
- `npm run render -- --style <id> --set k=v --text "..."`: look at what changed; `--free` for the free font,
  `--sweep <key>` for a row per eighth.
- `npm run sweep -- <key>`: dead zones in a slider.
- Accept golden changes (`npm run golden:update`) only for a change you meant, after looking at it rendered, and
  commit the golden files with it.

## Known drift left in place

Fixing these changes saved designs' letters or the free fonts' output; leave them unless asked.

- `skin.ts` `BARS.A.move` is 0.26, the arched A's; the symmetric A moves its bar 0.36.
- `skin.ts` `ROUND` has 5 and lacks 6, ¢, €, © and ®, which the engine draws round.
- Some glyphs draw a conditional stroke before others: `entry()` in the cursive i j m n p r u and `y.cur`; the a's
  exit stem (`if (r) footStem`, under Cursive) before its bowl; and the square-join fillets in `arch()`, in u, and in
  `branchBowl()` ahead of the a's spur. Their later strokes' ids shift with Cursive, Bowl joins and the wireframe
  fill. Don't add more.
