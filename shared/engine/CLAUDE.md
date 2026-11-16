# shared/engine: the font engine

Params in, glyph outlines out. Pure math with no DOM: the browser draws the live preview with it and the server
builds exported fonts with it. Coordinates are font units, 1000 to the em, y up, baseline at 0. The settings
themselves (spec, ids, scales) are described in shared/CLAUDE.md.

The engine builds letters itself only for designs no font draws: the block and arc cards, and a design built from
strokes (the logo's face, Lineup, is one). The 22 cards written in TypeLab's own fonts are source styles: their
letters are the font's own drawings at several weights and widths, moved point for point by the interpreter in
`shared/source/` (`sourceInstance`, called first by `buildFont`). Nothing here reads a skeleton off a finished outline
or redraws parts of one: the code that did (the free-font path: `skin.ts`, `scan.ts`, `restyle.ts`, `free-letters.ts`
and their helpers) was removed on 2026-11-16, with the designs written in a font without a source program.

Code that builds fonts imports `shared/engine` (`index.ts`): importing it registers every glyph (`glyphs/`), and
`buildFont` finds no letters without it. A pure helper such as `resolve` may be imported from its own
file.

## From params to an outline

1. `resolve(params)` (`font.ts`) gives `Effective`: DEFAULTS filled in; the personality macros (geoHuman, softSharp,
   classicFuture, playfulFormal) pushed into curve, aperture, contrast, roundness, apex, xHeight, width and
   letterSpacing; Contrast split into the pen's amount and `reverse` (`contrastOf`); and square, classic, bounce,
   singleStory, stressDeg derived.
2. `metrics(e)` (`font.ts`) gives `Metrics` (`m`): every measure the glyph functions draw with, and the pen `m.ctx`.
   Verticals weigh the stems, and Horizontals the bars, from 0.6 to 1.6 times as heavy (`SIDE_WEIGH`, the block
   letters' range; from a quarter to two and a half times, an arc letter's bowls came out three times as heavy at the
   top and foot as at the sides).
3. `buildFont(params, from?)` gives a `Font`. `font.glyph(ch)` builds a letter on first ask and keeps it:
   - a source style (`params.sourceProgram`) draws every letter with `source.glyph(ch)` (shared/source/instance.ts),
     its Points drawings included; the rest of this list is for designs the engine builds.
   - `pickGlyph`: a letter drawn in Points (`params.outlines[ch]`) is `drawnLetter` (`drawn-letter.ts`): the drawing
     as it stands (`drawnGlyph`), leaned as far as the slant has moved from the one it was drawn at (`Drawn.at`), with
     the effects its `at` was without (slice, fill, rough edges) run on it (`withEffects`, `drawnEffects` in
     glyph.ts), those it was drawn under being in its points. No other setting reaches a drawing: nothing guesses at
     its strokes to thicken or reshape them, and Inline, which needs middle lines, leaves it solid. Else a letter
     already built with the same settings (an earlier font `from`, whose params differ only in `outlines`, lends its
     letters, so dragging a point rebuilds one letter); else `fromSettings`.
   - `fromSettings`: a letter with its own settings (`params.glyphs[ch]`) comes from `font.letter(ch)`, a font built
     with them; otherwise `build: 'blocks'` draws `buildBlock` (basic block letters, slot blocks or grid letters, by
     `blockForm`), `build: 'arcs'` draws `buildArc`, and anything else is `buildGlyph(variantOf(ch, e), m, ch)`.
   - `variantOf` picks the glyph id: `a.alt` for a single-storey a; `<ch>.cur` from Cursive 0.35 (`CURSIVE_FORMS`);
     else `ch`. The engine writes no joined script of its own: scripts are the script fonts'.
4. `buildGlyph` (`glyph.ts`) runs its stages in this order:
   1. the glyph function draws centerline strokes on a `Builder` and returns the body width;
   2. `boxQuarters` (`corners.ts`) when Bowls are Box; `weighFillets`; `markTurns` gives each turn its id and radii;
   3. `stretchTerminals` (`ends.ts`): Length, Curl, straight runs; the body grows by their reach. Curl is gentle, as
      on TypeLab's own fonts: the end's last stretch (`CURL_REACH` of the x-height, never back past where another stroke
      meets it, the leg of a y on its tail) turns up to `CURL_BEND` either way, its share of as far as it has room to
      (`curlCrowd`: the letter's centerlines, and the corners of its tip read against the pen's width there,
      `CORNER_KEEP`); Length draws on its share of its room the same way; on Chamfer's straight cuts the stretch bends
      as one curve;
   4. `faceSerifs`, then `cupSerifs` (`serif-sides.ts`), while serifs are on;
   5. `wobbleSkeleton`: Hand-drawn moves the strokes, counters, marks and end homes through one field;
   6. `expandStroke` (`stroke.ts`) on every stroke drawn with a path (not dots, fillets or blobs), weighed by its own
      stroke weight; `fitEnds` (`ends.ts`) draws again smaller any drop, point, flare or slant that comes nearer the
      rest of the letter than its end cut plain would (`ROOM_KEEP`), and `cap` leaves a level bar's end cut across under
      a point, hollow, notch or drop; then each stroke clipped to its `clip` (`clipMade` keeps the points the clip adds);
   7. `endCorners` (`corners.ts`), then `joinCorners` (`joins.ts`), whose fillets join the strokes as part `fillet`;
   8. `markJoins`, `barsThrough` and the stencil pieces (`stencil.ts`);
   9. each stroke's outline finished, in this order: a ring split by `ringOutline`; otherwise clipped a second time,
      cut into its stencil pieces (their cut corners rounded by Rounding), replaced by its bar where one runs through,
      cut under diamond serifs, cut by the through-bar bands, and only then rounded by Roundness (`m.R`); then its
      serifs (`buildSerif`) and its terminal and end marks;
   10. side bearings: the glyph's sb factors times `m.sb`, room for what reaches past the body, `clearStems` under
       diamond serifs;
   11. `placeGlyph`: rotation, mirroring, monospacing, whole fill cells, the shadow's room, bounce and jitter, slant
       about `SLANT_PIVOT` of the x-height, then the slice, the fills and rough edges (`roughen`) on the final outline;
       it sets `M`, `cmds`, `d`.
5. `font.hl(ch, key)` (`highlight.ts`) is the part of a letter a control shapes, for the explainer and the inspector.
6. `font.layout(text, maxWidth)` sets lines: each character at its advance plus Letter spacing (`m.track`), and the
   word space `m.space`.

## Files

| File | Holds |
| --- | --- |
| `index.ts` | The public entry: registers the glyphs, re-exports what the client, server and tools use (`ACCENTED` and `accentGlyph` too, for the server's exports) |
| `font.ts` | The hub: types (Effective, Metrics, Glyph, Font), the glyph table (`defGlyph`, `glyphDefOf`, `glyphIds()`, `hasGlyph`), `resolve`, `metrics` and the formulas it shares, `Builder`, `variantOf`, `buildFont` |
| `glyph.ts` | One letter: `buildGlyph`'s stages (`strokesGlyph`, which also draws an export's accent marks from a glyph function never put in the table), `placeGlyph`, `buildBlock`, `drawnGlyph`, `blankParts()` (the empty parts of a letter not built from strokes) |
| `accents.ts` | An exported font's accented letters, export only (`ACCENTED`, `accentGlyph`; server/export.ts asks for them): each its letter as the font draws it and a mark, the design's own where it has one (its grave turned about for the acute, the i's dot, its comma and apostrophe) and else drawn by its pen (`strokesGlyph`, the hooks below in quarter turns so Facets cut them); sized by the x-height or, flatter, the cap height, weighed by the stems as drawn, over the letter's ink as far as the i's dot stands over its stem, centred along the stems' lean, wound as the letter's ink; a dieresis's dots kept apart and inside their letter's advance (smaller on a heavy or narrow letter, ï; a heavy script's full stop, standing in for a dot run into its stem, no bigger than a dot); each keeps its letter's advance but ď ľ ť Ľ, whose apostrophe, clear of the letter's ink at its own heights, is drawn smaller and closer or the advance widened as far as it needs to clear a tall letter after it (`caronMark`); ı is the i with its dot taken off |
| `glyphs/index.ts` | Registers the letter files in order: `upper.ts`, `lower.ts`, `figures.ts`, `punctuation.ts` (punctuation and symbols) |
| `glyphs/shared.ts` | Constructions the letter files share: bowls, the s, shoulders (`arch`), K's arms, upright and arched diagonals, tails and hooks, cursive `entry`/`exitEnd`, dots (`dotK`), `lc` |
| `glyphs/turns.ts` | Strokes that turn at a point (`turnStroke`, `placeTurns`): A M N V W Y Z, v w y z ^, the turns of Q and R; `POINTED`, `peakPast`, `peakCut` |
| `arcs.ts` | Arc letters (the Arcs card, `build: 'arcs'`), after the OTHER specimen: each letter a few cuts of one circle (`Cut`: an ellipse's centre, half-axes, turn and the angles it runs between, in units of the O's half-height at the stroke's middle, y from the middle of the capitals, or of the o's from the middle of the x-height), drawn a quarter at a time as centreline cubics through `strokesGlyph`, so Weight, Contrast, Pinch, Curves, Facets, Stroke ends and the effects reach them. Capitals and figures are `ARC_LETTERS` (O E R measured, `SPECIMEN`; the rest `DRAWN`, each body as wide as its cuts reach, `measured`; T's and H's bars kept to a bar so they read in words); the small letters (`LOWER`) and the punctuation and symbols (`MARKS`) are functions of where the ascender, descender, x-height and a dot fall in units (`Reach`, `Zones`), built by `letterOf`, with helpers for halves (`tallL`/`tallR`), arches, hooks (`hookDown`, never shallower than `HOOK_LEAST`), gentle arcs through two points (`through`), V's and chevrons (`vee`, `chevron`), turned or scaled cuts (`turned`, `scaled`) and dots (`Drawn.dots`, a full stop's size `DOT`). Width stretches every cut across (`m.ws`), Squareness lengthens the quarters' handles, Length runs each end on round its own circle or cuts it back (`lengthened`; the stages after are asked for no length), and `shaped` moves cuts for Crossbar height (a capital's `crossbar` part; the e draws its own bar), Openness (a cut's `open` ends, `OPEN_RUN`/`CLOSE_RUN`) and Bowl overlap (a stem's `apart`). Heavier than `S_LIGHT` the letters widen by `GROW` a unit of stroke; a round loop (a cut `LOOP_SPAN` or more round) narrower than keeps `OPEN` of a stroke inside it grows rounder (`plumped`), a narrow one (`narrowLoop`: a leg's, a tail's, a bar's) runs less far round instead (`unlooped`). Letters are spaced from their own ink in the band they stand in (`spaced`: `SPACE_WHITE`, `SPACE_DEEP`, `SPACE_LEAST`), marks keep their drawn room. Their controls are `ARC_CONTROLS` (shared/content/controls.ts) |
| `basic-blocks.ts` | Basic block letters (`blockForm: 'basic'`, the default; Bulwark, the Block card's font, is made of them): plain block letters, every character a lowercase included, rings of corners y up from the baseline measured from the design (`V` upright, `B` level, `D` slanted strokes; counters a share of the cap height times Width), each corner of a kind ('o' Roundness, 'b'/'k' a bowl's outside and inside by Bowls, 'c' Counters, 'i' Joins, 's' sharp); Contrast, Peaks, Steps, Crossbar height (`barY`) and Openness (`open`) reach them too, and lone bars (dashes, + = #, frames) keep `LONE` of the stems at any contrast (`L`); `BASIC`, `basicDims`, `basicRound`, `basicRings` |
| `blocks.ts` | Slot blocks (the Slot Blocks card, `blockForm: 'slots'`): rings of corners on a 224 × 175 grid, y down from the top, each corner of a kind ('o', 'e', 'i', 's'); the lowercase are small capitals; Contrast thins the level walls, Inner space sizes the slots and closed counters (`g`, `Sc`, `cx`), Openness how deep the slots and open sides run (`S`, `dS`, `open`), Crossbar height moves each letter's bar or waist as a share of its own room (`bar`, `spine`), Counters rounds the corners inside, and I J M Q and the dots have their forms (`forms`, `dotR`, `dotK`); every move is 0 at the slider's middle, so saved designs draw as they did; `BLOCKS`, `blockDims`, `blockRings` |
| `block-corners.ts` | What the slot and grid blocks share: Steps notch an outside square corner and Ink traps carve a wedge into a corner inside, each cut into the corner's round as roundContour draws it (sampled, Facets and all) so it grows from nothing and, scaled to the room the corner's sides leave it, all the way (`cutCorners`; corners marked `outer`/`join` by each kind); Stencil cuts the slot blocks' closed counters open (`stencilCounters`); Facets is roundContour's `cut` |
| `grid-blocks.ts` | Grid letters (the Grid Blocks card, `blockForm: 'grid'`): each character filled and empty cells of a grid five high (`GRID`, rows from the top as `'#'`/`'.'` strings), upper and lower case alike tall; the cells' edges followed into rings, every corner rounded by Roundness, and filled cells meeting only at a corner joined through a neck between empty cells round right round; b d p q on a stem a cell past their bowl, and look-alikes (o b d p q, g 9 q, 6 G, 5 S) at least two cells apart; Weight moves every edge out or in (`GROW`), Verticals and Horizontals (and Contrast) the upright and level edges apart (`gx`, `gy`), Width the cells' width; Joins fills the necks, Cell joins makes them nodes, straight diagonals or corners only touching (pixels), Counters rounds the corners inside, Stencil draws every cell a tile, Dots and its Size a lone cell; the letter forms are other cells (`GRID_FORMS`); Grid rows: seven puts the capitals on seven cells and composes the small letters from ascender, x-height and descender rows (`small`, `stretch`), each height the nearest whole cells to the stroke letters'; `gridCells`, `gridDims`, `gridRings` |
| `grid-seven.ts` | The seven-row grid's letters: capitals, figures and the marks drawn anew (`GRID7`, the rest GRID's five rows stretched), the small letters as ascender, x-height and descender rows with their four- and six-row x-heights and one-row descenders where taking out or doubling a row would spoil them (`SMALL7`, `Small`), and the letter forms (`GRID7_FORMS`) |
| `stroke.ts` | The stroke expander: sampling, the pen model, terminals (`termCap`), sides, serifs (`buildSerif`, cups, diamonds) |
| `ends.ts` | Stroke ends drawn on, trimmed, curled, run straight (`stretchTerminals`); drops, points, flares and slants no bigger than the letter has room for (`fitEnds`, `ROOM_KEEP`) |
| `corners.ts` | Turns and square end corners rounded, stepped, or squared in box bowls (`turnsOf`, `markTurns`, `endCorners`) |
| `joins.ts` | Inside corners where strokes cross, filled with fillets (`joinCorners`, `joinR`); how Joins and Counters split the inside corners by how wide they are, Joins the crotches and Counters the square ones (`innerShare`, `crotchShare`, `innerFor`, `crotchFor`), turns' insides too (`markTurns`) |
| `stencil.ts` | Stencil gaps at joins and turns, the crossbar Gap, bars run Through |
| `serif-sides.ts` | Which way each stem's serifs reach (Sides, inside serifs), and cupped feet |
| `rough.ts` | Rough edges (`roughen`): the ink made one (only contours whose boxes overlap; a fill that draws its cells apart is taken as it is), its corners rounded, walked in short steps and each pushed out or in by smooth noise of where it lies, no further than `ROOM` of the ink or space across from it, drawn again as a smooth curve (`smoothLoop`) |
| `effects.ts`, `boolean.ts` | The slice and the fills (wire, pixels, hexagons, dots, blobs, liquid, halftone, lines, inline, outline, shadow; the grid ones are `GRID_FILLS`, and Spread, `dotGain`, sizes their cells: pixels apart as squares or grown together on a grid of middles and seams, hexagons traced on whole-number corners, halftone dots sized by the ink round them; dots all one size (`DOTS_SPREAD` in shared/params/scales.ts, specks to dots well into one another), blobs a field of soft balls all one size, beads strung on necks pulled between a stroke's dots up to two cells apart along its ink (`NECK_SHARE` of a dot thick, `NECK_STEPS`), drawn by marching squares; the liquid balls of many sizes (`liquidSize`, a hash of the cell) drawn the same way and running together through necks, no further across a counter than `LIQUID_TAKE` of it (`dotRoom`); grown dots and liquid take whole cells more room where their ink reaches past half a letter's margin (`placeGlyph`); Size is `gridCells` cells in the cap height, 40 to 6: coarser, a lowercase letter's curves come apart); unions and cuts of outlines (`shape`, `combine`), and a letter's overlapping contours made one with its curves kept (`unite`), or one outline's ink cut out of another's the same way (`cutOut`, the pen's Cut out and Break apart; the two share `inkOf`, and `unite`'s results are the free fonts', so check `npm run golden` after touching it) |
| `outline.ts` | Drawn letters (`Node`, `Drawn`), curve fitting (`fitOutline`), `cleanDrawn`; live corners: a corner point's radius `r` and kind (`corner`: round, cut or scoop), drawn by `drawnCmds` (which draws a contour with none exactly as before) with the point left where the corner is (`cornerTurn`, `cornerRoom`); imports only types, as shared/params reads it |
| `grid.ts` | Construction grids and their groups, Grid A to T (`glyphGrid`, `gridGroups`, `gridOf`); each round keeps the arcs of curve it was read off (`GridRound.arcs`, as the grid reads the letter, upright); `sameLine` and `sameRound`, which the inspector finds a dragged line or circle in the group's other letters by |
| `free.ts` | A font's letters as they travel and are kept (`FreeFontData`, `PackedNode`) and the registry of them: the format of `fonts/` and of a source's drawings |
| `drawn-letter.ts` | A letter drawn in Points in a design the engine builds (`drawnLetter`): as drawn, leaned with the slant, its later effects run on it |
| `highlight.ts` | `highlightD` and `RING_KEYS` |
| `geom.ts`, `types.ts` | Béziers, polygons, corner rounding, path output (`cmdsToD`); points, commands, the pen, marks |

## Shared formulas and constants

A formula or constant two files need lives once and both import it. `metrics()`'s shared pieces sit beside it in
`font.ts`: `serifLen`, `counterScale`, `roundnessR`, `innerRoundR`, `stencilOff`, `bowlK`, `bowlOrg`, `dotRoundOf`,
`cursiveHookR`, the constants `SERIF_SB`, `SLANT_PIVOT`, `CURSIVE_FORMS`, and the helpers `hasSerif`, `variantOf`,
`termSpec`, `quarterK`, `strokeWt`. Elsewhere: `geom.ts` (`inPoly`, `CIRCLE_K`,
`MIN_ROUND`, `SAME_PT`, `cmdsBox`, `toPolys`), `shared/params/scales.ts` (`endId`, `isPlainEnd`, the id tests,
`slantDeg`, `rotationOf`, `weightUnscale` beside `weightScale`, `xHeightOfRatio` beside `xHeightRatio`, `joinGap`,
`barCut`, `endReach`), `stroke.ts` (`STEP_DEPTH`), `joins.ts` (`innerShare`, `crotchShare`), `glyphs/turns.ts` (`POINTED`, `peakPast`,
`peakCut`).

Some code repeats or mirrors another's, because sharing would change results (a shared helper takes its sums in
another order) or because it works in other units. A copy with its sums in another order: `effects.ts` `within`
(of `geom.ts` `inPoly`). Mirrors: `serifTh` and `diamondK`, which undoes it; `cap()` and `squareEnd` (`stroke.ts`).
Each end names the other in a comment, except `geom.ts` `inPoly`, which doesn't name its copy: grep for the name
before changing it. If you change one end, change the other, then run golden and compare.

## TypeLab's own fonts

`free.ts` holds a font as `FreeFontData` (1000 to the em, y up, glyphs as packed anchor points): TypeLab's own, kept
in `fonts/` by `tools/fonts/import.ts`. The server reads them to serve each card's web font (server/free-fonts.ts),
and a source's drawings travel in the same form. `Params.freeFont` names the font a design is written in and
`Params.freeAt` the settings its letters stand for; both are read by the source interpreter, never here. A design
with a `freeFont` and no `sourceProgram` has nothing to draw its font with and is built as the engine builds its
preset; no card starts one.

## Glossary

| Term | Meaning |
| --- | --- |
| Params | The user's settings (`shared/params/model.ts`): numbers 0..1, options, `glyphs[ch]` (a letter's own), `outlines[ch]` (drawn letters), `freeFont`, `freeAt` |
| Effective (`e`, `m.p`, `font.eff`) | Params after `resolve`. `e.contrast` is the pen's amount (`contrastOf` gives 0.05..1; the classicFuture macro can push it down to 0), not the slider; read raw Params where the slider value is meant |
| Metrics (`m`) | Measures from `metrics(e)`: `s` stem, `thin` hairline and bars, `hT` a horizontal stroke's thickness, `tDir(dx, dy)` thickness by direction, `cap`, `xh`, `asc`, `desc` (negative), `os` overshoot, `ws` width scale, `W(base, cls)` body width ('r' round, 'c' classically narrow) |
| more Metrics | `k`, `org` quarter-turn tension and organic share; `sb` a stem's side bearing; `track`, `space`; `slant` (a tangent), `rot` (radians clockwise); `R` Roundness radius; `innerR` Counters radius; `dotRound`; `bar`, `apex`, `ap`, `cnt` (-1..1), `sq`, `cur`, `wob`; `cell`, `gap`, `gapOff`, `gapRound`, `sliceY`, `sliceH`, `sliceRound`; `serif` (on or off); `monoAdv` the advance monospacing pulls toward; `qpt(x0, y0, x1, y1, mode, u)` the point and tangent at `u` along a quarter turn, drawn with the pen's tension |
| PenCtx (`m.ctx`, `pen`) | What the stroke expander knows: thick, thin, stress, k, org, terminal and its `term` (TermSpec), serif spec, chamfer, joints, reverse, pinch, wobble, dropLow |
| Builder (`g`, `b`) | What a glyph function draws on: `path`, `line`, `stem`, `dot`, `fillet`, `blob`, `counter`, `mark`; `strokes`, `reachL`/`reachR`, `sb` |
| glyph table, `def` | `defGlyph(id, sb, fn, meta)` registers a glyph: `sb` side-bearing factors (1 a stem, about .55 round, .25 diagonal), `fn(g, m)` returns the body width, `meta.params` the controls the inspector shows first |
| glyph id | The character, or a form of it: `a.alt`, `f.cur`, `y.cur`. `buildGlyph` takes the id; `g.ch` is the character |
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
| cell | The fill grid's size (`m.cell`, for `GRID_FILLS`); advances and tracking snap to it for all but lines. Hexagons are `cell` across their flats and the halftone's rows are hexagons' rows. Not the client's strip `.cell`, nor `scan.ts`'s ink Grid |
| wobble | Hand-drawn: one smooth displacement field per glyph, seeded by its char code |
| freeAt | The settings a source style's letters stand for as drawn (`Params.freeAt`); the interpreter moves them as far as the settings move from there |
| drawn | A letter drawn in Points (`params.outlines`), or a source's as placed (`Glyph.drawn`). In a design the engine builds the settings don't reshape it: it only leans with the slant from the settings it was drawn at (`Drawn.at`) |
| live corner | A drawn point with a radius (`Node.r`, and `Node.corner` unless a round): it stays at the corner and `drawnCmds` rounds, cuts or scoops the outline there, at most half of each side |
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
- Every character of `CHARSET` has a glyph, a `BASIC` block and `GRID` cells; every non-lowercase one has a `BLOCKS`
  entry (the slot blocks' lowercase fall back to their capitals).
- Most modules `font.ts` loads import values back from it (`glyph.ts` and its stages, `drawn-letter.ts`): they may
  use those values only inside functions, never at module load. `stroke.ts` imports values
  only from `geom.ts` (types aside), so the client's diagrams (`client/components/Diagram.tsx`) can
  call it with a PenCtx of their own. `term` is optional: left out, terminals are drawn with the expander's default
  `TERM`, so a PenCtx that draws styled terminals sets it with `termSpec`.
- Outline points are tracked by identity from `expandStroke` to placement (`endCorners`, `clipMade`, the stencil's
  `drawn` sets): clipping and splitting keep the original Pt objects; never copy them in between.
- Outlines wind anticlockwise with clockwise holes; `combine` returns them so, and the fills rely on it.
- Fills, the slice and rough edges run last, on the placed outline, so a grid lines up across a line.
- A grid fill at Spread 0.5 draws exactly as it did before Spread: pixels and hexagons keep their traced outline
  there (`gain === 0.5`), dots and lines their sizes times exactly 1.
- Grid names come from the order of `SETS` and `KINDS` in `grid.ts`; the inspector shows them and tests pin them.
- Every numeric setting keeps changing the letters to 1: map as a share of the range (`weighed`, `push`), and keep
  piecewise maps around 0.5 continuous.

## Floating-point order is behaviour

Golden compares outlines to a hundredth of a unit, and compare compares the full output. Reordering arithmetic
(`a + b + c` against `a + (b + c)`), swapping a local copy for a shared helper with its sums in another order, or
`Math.hypot` for a square root moves points by tiny amounts, and tiny amounts flip decisions made near a threshold:
an inside test on an edge, a turn at 0.2 rad, a clip on a slanted half-plane (`buildGlyph` clips a stroke a second
time as it finishes the outline, and dropping that clip changes K, k and y). Treat any such edit as a behaviour
change and verify it.

## How to verify

- `npm test`: unit tests and the engine's golden outlines (every style, every setting at its ends and options).
- `npm run typecheck`: `npm test` runs through tsx, which doesn't check types; the compile checks (spec against
  model, `SUBS`, `FORM_OPTIONS`) fail only here.
- `npm run golden`: the same golden outlines on their own, listing what changed. They cover the letters the engine
  builds; the source styles have their own tests (tests/source-*.test.ts).
- `npm run compare -- [ref]`: every glyph of every style under about 50 setting combinations, built at a git ref
  (HEAD by default) and in the working tree, compared in full (outline, marks, counters, strokes, skeleton, serifs,
  spacing, highlights, layout, metrics); `--only <regex>` a few styles. It catches what
  golden's probes don't reach. Use it for any refactor.
- `UPDATE_STROKE_ORDER=1 node --import tsx --test tests/stroke-order.test.ts`: only when a glyph's stroke order
  changes on purpose (it moves saved per-letter values; see the invariants).
- `npm run render -- --style <id> --set k=v --text "..."`: look at what changed; `--free` for the style as its card starts it (its source drawings),
  `--sweep <key>` for a row per eighth.
- `npm run sweep -- <key>`: dead zones in a slider.
- Accept golden changes (`npm run golden:update`) only for a change you meant, after looking at it rendered, and
  commit the golden files with it.

## Known drift left in place

Fixing these changes the letters the engine builds; leave them unless asked.

- Some glyphs draw a conditional stroke before others: `entry()` in the cursive i j m n p r u and `y.cur`; the a's
  exit stem (`if (r) footStem`, under Cursive) before its bowl; and the square-join fillets in `arch()`, in u, and in
  `branchBowl()` ahead of the a's spur. Their later strokes' ids shift with Cursive, Bowl joins and the wireframe
  fill. Don't add more.
