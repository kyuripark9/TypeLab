# shared/engine: the font engine

Params in, glyph outlines out. Pure math with no DOM: the browser draws the live preview with it and the server
builds exported fonts with it. Coordinates are font units, 1000 to the em, y up, baseline at 0. The settings
themselves (spec, ids, scales) are described in shared/CLAUDE.md.

Code that builds fonts imports `shared/engine` (`index.ts`): importing it registers every glyph (`glyphs/`), and
`buildFont` finds no letters without it. A pure helper such as `resolve` may be imported from its own
file.

## From params to an outline

1. `resolve(params)` (`font.ts`) gives `Effective`: DEFAULTS filled in; the personality macros (geoHuman, softSharp,
   classicFuture, playfulFormal) pushed into curve, aperture, contrast, roundness, apex, xHeight, width and
   letterSpacing; Contrast split into the pen's amount and `reverse` (`contrastOf`); and square, classic, bounce,
   singleStory, stressDeg derived.
2. `metrics(e)` (`font.ts`) gives `Metrics` (`m`): every measure the glyph functions draw with, and the pen `m.ctx`.
3. `buildFont(params, from?)` gives a `Font`. `font.glyph(ch)` builds a letter on first ask and keeps it:
   - `pickGlyph`: a letter drawn in Points (`params.outlines[ch]`) is `drawnLetter` (`family-drawn.ts`): `drawnGlyph`
     while the letter's settings are those it was drawn at (`Drawn.at`), else moved from them (`movedDrawn`); in a
     family member (`drawnFrom`, set by `familyMember` in shared/family.ts) moved from the design, or from its own
     `at` where that isn't the design's; then the effects its `at` was without (slice, fill, rough edges) run on it
     (`withEffects`, `drawnEffects` in glyph.ts), those it was drawn under being in its points; else a letter already built with
     the same settings (an earlier font `from`, whose params differ only in `outlines`, lends its letters, so dragging
     a point rebuilds one letter); else `fromSettings`.
   - `fromSettings`: a letter with its own settings (`params.glyphs[ch]`) comes from `font.letter(ch)`, a font built
     with them; a design written in a free font that has the letter draws it (`freeGlyph`), or, unless it is a pixel
     font, its twin's (`twinGlyph`) when `formChanged` says it is asked for in another form than the font's;
     otherwise `build: 'blocks'` draws `buildBlock` (basic block letters, slot blocks or grid letters, by `blockForm`), and anything
     else (a letter the free font lacks too) is
     `buildGlyph(variantOf(ch, e), m, ch)`.
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
| `ends.ts` | Stroke ends drawn on, trimmed, curled, run straight (`stretchTerminals`); drops, points, flares and slants no bigger than the letter has room for (`fitEnds`, `ROOM_KEEP`, shared with restyle.ts) |
| `corners.ts` | Turns and square end corners rounded, stepped, or squared in box bowls (`turnsOf`, `markTurns`, `endCorners`) |
| `joins.ts` | Inside corners where strokes cross, filled with fillets (`joinCorners`, `joinR`); how Joins and Counters split the inside corners by how wide they are, Joins the crotches and Counters the square ones (`innerShare`, `crotchShare`, `innerFor`, `crotchFor`), turns' insides too (`markTurns`) |
| `stencil.ts` | Stencil gaps at joins and turns, the crossbar Gap, bars run Through |
| `serif-sides.ts` | Which way each stem's serifs reach (Sides, inside serifs), and cupped feet |
| `rough.ts` | Rough edges (`roughen`): the ink made one (only contours whose boxes overlap; a fill that draws its cells apart is taken as it is), its corners rounded, walked in short steps and each pushed out or in by smooth noise of where it lies, no further than `ROOM` of the ink or space across from it, drawn again as a smooth curve (`smoothLoop`) |
| `effects.ts`, `boolean.ts` | The slice and the fills (wire, pixels, hexagons, dots, blobs, liquid, halftone, lines, inline, outline, shadow; the grid ones are `GRID_FILLS`, and Spread, `dotGain`, sizes their cells: pixels apart as squares or grown together on a grid of middles and seams, hexagons traced on whole-number corners, halftone dots sized by the ink round them; dots all one size (`DOTS_SPREAD` in shared/params/scales.ts, specks to dots well into one another), blobs a field of soft balls all one size, beads strung on necks pulled between a stroke's dots up to two cells apart along its ink (`NECK_SHARE` of a dot thick, `NECK_STEPS`), drawn by marching squares; the liquid balls of many sizes (`liquidSize`, a hash of the cell) drawn the same way and running together through necks, no further across a counter than `LIQUID_TAKE` of it (`dotRoom`); grown dots and liquid take whole cells more room where their ink reaches past half a letter's margin (`placeGlyph`); Size is `gridCells` cells in the cap height, 40 to 6: coarser, a lowercase letter's curves come apart); unions and cuts of outlines (`shape`, `combine`), and a letter's overlapping contours made one with its curves kept (`unite`), or one outline's ink cut out of another's the same way (`cutOut`, the pen's Cut out and Break apart; the two share `inkOf`, and `unite`'s results are the free fonts', so check `npm run golden` after touching it) |
| `outline.ts` | Drawn letters (`Node`, `Drawn`), curve fitting (`fitOutline`), `cleanDrawn`; live corners: a corner point's radius `r` and kind (`corner`: round, cut or scoop), drawn by `drawnCmds` (which draws a contour with none exactly as before) with the point left where the corner is (`cornerTurn`, `cornerRoom`); imports only types, as shared/params reads it |
| `grid.ts` | Construction grids and their groups, Grid A to T (`glyphGrid`, `gridGroups`, `gridOf`); each round keeps the arcs of curve it was read off (`GridRound.arcs`, as the grid reads the letter, upright); `sameLine` and `sameRound`, which the inspector finds a dragged line or circle in the group's other letters by |
| `free.ts` | The free-font registry and its packed format |
| `free-letters.ts` | A design's letters drawn from its free font: `freeLetters`, `freeGlyph`, `restyled`, the twin |
| `skin.ts`, `scan.ts` | A free font's letter rigged on its scanned skeleton and moved by the engine's measures (`skinMove`), or, a letter drawn in Points, as a drawing of straight edges and rounds (`skinEdges`: edges moved whole, or bent where their stroke narrows; stroke ends, edges on the letter's lines and the far side of a bar on one kept; corners met again; rounds carried with their corner or stretched; every corner, round and handle held short of the outline across from it (`reach`); long curves cut first; null where it still crosses); the scan, which a family's members ask of every letter they restyle, so its hot paths are written for speed and give exactly what the plain ways gave: the distance down each column worked out from the nearest paper above and below, the thinning's neighbours read as one byte off tables (`SIMPLE`, `COUNT`) and its heap in typed arrays, `nearestOn` through square buckets (`nearIndex`; `nearestAll` is the walk past every point it stands for) |
| `family-drawn.ts` | Letters drawn in Points as the settings move (`drawnLetter`): from the settings a drawing was drawn at (`Drawn.at`, as a design of its own: `atDesign`), or, in a family's other members, from the design (found by the member's params object: `drawnFrom`, `drawnDesign`); rigged from that design (`RigLetters`: its drawn letters and its h p x n H), moved by `skinEdges` as far toward the new measures as their edges don't cross, in eighths, or by `skinMove`, whichever keeps it most as drawn and goes furthest (`keptMove`: how much more its outline turns than the drawing's, the edges' shortfall in eighths or in ink counted too; a letter of bars and corners keeps its edges, one traced off a font's curves is moved as the font's are), spaced and leaned (`movedDrawn`). Settings that reshape a letter (curves, corners, ends, forms) don't reach a drawing; the effects it was drawn without (slice, fill, rough edges) run on it (`withEffects`), while one it was drawn under stays in its points whatever it is set to now |
| `lines.ts` | A letter's straight strokes read off its outline (`lineSkeleton`): straight edges facing each other across the ink a stroke apart paired, their middle lines run on to where they cross, the skeleton a letter of them alone is drawn on at its lighter weights; a stroke run level along a line, and a slab along its face, kept there as it thins (`FLUSH`) |
| `slabs.ts` | A slab serif's slabs read off a letter's outline (`slabsOf`): a stroke's end cut across (its face) run out past its sides in a tab either side or one (a flag, a beak), and the letter without them, each stroke's sides run on to its face |
| `restyle.ts` | The engine's shapes redrawn on a free font's letter: dots, bowls, ends, serifs, stencil, peaks, corners |
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
`peakCut`), `skin.ts` (`FORM_LETTERS`, `descK`, `sameMeasures`), `free-letters.ts` (`mapDrawn`, `inkX`; a free letter's room is read by `inkSpan`, its curves' true reach), `restyle.ts` (`HOOK_LETTERS`, `OPEN_LETTERS`, `added`).

Some code repeats or mirrors another's, because sharing would change results (a shared helper takes its sums in
another order) or because it works in other units. Copies with their sums in another order: `effects.ts` `within`
and `skin.ts` `inPoly` (of `geom.ts` `inPoly`); `dotK` (`glyphs/shared.ts`) and `skinMeasures`' `dot`. Mirrors:
`metrics()`' `asc` and `skinMeasures`' `asc`; `joinGap`/`barCut` (`shared/params/scales.ts`) and `restyleStencil`,
which rescales them to a free font's cap height; the heights in `moveMap` (`skin.ts`) and `restyled`
(`free-letters.ts`); `serifTh` and `diamondK`, which undoes it; `cap()` and `squareEnd` (`stroke.ts`). Each end names
the other in a comment, except `geom.ts` `inPoly` and `joinGap`/`barCut`, which don't name their copies: grep for the
name before changing them. If you change one end, change the other, then run golden and compare.

## The free-font path

A design with `freeFont` set draws its letters from a free font instead of building them: one of TypeLab's own
(`fonts/`) or a Google font.

1. `free.ts`: a font as `FreeFontData` (1000 to the em, y up, glyphs as packed anchor points): TypeLab's own as
   `tools/fonts/import.ts` wrote it into `fonts/`, a Google font as the server converts it; the browser
   (`client/lib/free.ts`) and the server register it with `registerFreeFont` before drawing, and `onFreeFont` tells
   listeners. The same format is the server's cache in `data/free-fonts/*.json`: changing `PackedNode` or
   `FreeFontData` means throwing those files away and importing the own fonts again.
2. `free-letters.ts`: `freeLetters` compares where the font was picked (`pick`, from `{ ...params, ...params.freeAt }`)
   with what is asked (`now`). `want` is the family's nearest weight, and its italic past half of a 12° lean
   (`nearestFont`); until it is registered the font is `freePending`, and `freeMissing` / `freeFontsWanted` say what
   to fetch. Placement effects (fill, mirror, monospacing, bounce, slant, rotation, wobble, slice) count only as far as
   they move from the pick.
3. `skin.ts` with `scan.ts`: `skinRig` first makes the letter's overlapping pieces one outline (`unite` in
   `boolean.ts`: the same ink and curves; many fonts, TypeLab's own among them, draw a stem whole and run a bowl into
   it, and the edges inside the ink, moved as stroke sides, came out as notches and spurs at the joins), keeps that as
   `rig.contours`, and hangs every outline sample (a `Bone`) on the letter's scanned skeleton; `strokeEnds` finds where
   the outline turns back across a stroke (a cap, a round end, a serif's end). `skinMove` moves it by the change in
   `skinMeasures` from `pick` to `now` (stem, bar, width, x-height, crossbar, serif length, Stem length, Inner space,
   dots, Pinch, Ink traps): each side by its stroke's middle (half its thickness in from the edge, not the skeleton
   point, which forks out to a square end's corners), each end carried with the two sides it joins, so a cap stays as
   wide as its stroke and a round end round, but a ball (`ballEnd`: an end much thicker than the neck it hangs from, a
   Didone's a c r y g, its comma) carried with the point it hangs from and made smaller or larger round it, unturned,
   as far as the outline's heavy strokes thin or thicken (`ballK`); and returns `rig.contours` itself when nothing
   moved. How much each
   edge's stroke thickens is `weighsOf`: by the way it runs (upright by the upright pen's weight, `SkinMeasures.v`,
   which reversed contrast thins; level by the bars', which Weight alone, lighter, draws no heavier than the stems but
   as far as the font's are, `freeLetters`: a heavy design's raised Horizontals would draw Orbital's, Gumdrop's and
   Timber's lighter bars twice their stems), and in a font with much contrast (its hairline, `rig.ref()`, a
   small share of its stem) by how thick the stroke is, between hairline and stem, so a Didone's balls and swells
   thicken as its stems do while its hairlines follow the bars. An edge grows into a counter (or toward another
   stroke, `Bone.gap`) by at most `OPEN` of the room, so heavier letters keep their counters; a heavier letter's serif
   goes out with its stem's edge and thickens away from its line, and a longer one stops short of the serif it faces.
   Serifs are found on stems ending at a line (`serifReach`): thin ones, gone a little way in, and slabs as tall as a
   fifth of the capitals' height with a square top (a wood type's, a typewriter's). Specks a move pinches off are
   dropped (`SPECK`). A lighter weight (the stems themselves drawn thinner: `MoveMap.lighter`) is drawn again from a
   skeleton of its own (`thinSkeleton`: a coarser grid, `THIN_CELL`; short strokes running on through a join kept,
   `skeleton(…, through)`, a d's stem below its bowl; and a stub where a stroke's middle turns but its ink runs on
   straight, `withStubs`, an n's stem above its arch, a p's above its bowl, an a's foot, in a serif font one run up under
   a flag standing out one way, a slab p's whose bowl leaves it at the x-height; and a serif's foot drawn level,
   `withFeet`, in a font standing its stems on serifs (`fontSerifed`, its n's or H's): where the skeleton forks from a
   stem's middle round a bracket out to tips on a line, turns from a stem into a serif running one way (an n's right
   foot, a y's arm), or runs up into a slab and stops (a v's arms, not a ball touching the line, `BALL_FOOT`, a fat
   face's r's; or stops a stub short of a join, an upright stem
   running on past it, a slab u's or d's foot below its bowl, `Foot.side` as a flag's; its serifs out past the stem's
   side on the line or a round up it, an A's leg leaning out over its slab; or a hairline serif's corner with an arm
   running on along the line, `FOOT_HAIR`, a Didone's E, L, B, its arm run level in to the corner), one level stroke
   along each serif, out as far as the
   ink runs along the line, the stem run down to the line; a vertex standing on a line, in a sans font
   any, in a serif font one where a hairline meets a heavy stroke (`VERTEX_HAIR`, a fat face's v, w, M, a Didone's A
   and V; a book face's, its counter's foot cut flat, stays as it was), drawn again where the strokes' middles, run on
   straight, meet within the vertex's own end (its cut on the line staying, its corners going in with the strokes, its
   join's crotches read as far out as before and from where it was, `ThinReads.vertices`; the runs in left out of the
   whole check, `vrun`; withFeet runs this alone for a font without serifs); a corner where a stem turns
   into an arm along a line, its hairline serif left out of the skeleton (`CORNER_HAIR`, a fat face's E, L, B, D, on
   an edge or at a ring's node), the stem run on to the line, the serif level out, the arm level in; a flag atop a stem whose arch or bowl joins it further down
   than the join's round reaches the line (an n's, an r's, a g's ear, an a's foot) the same, with a stub on from the
   line to the join, the foot reaching across the stem's own width (`Foot.side`); a slab as thick as its stem is one, `FOOT_THIN`,
   `FOOT_REACH`; kept on copies of the rig, `footRig`, that only the lighter weights move on: thin serifs' feet from
   stems 0.6 of the design's, slabs' from 0.4, `FOOT_UNDER`, so a Bold keeps its brackets), read once a letter
   (`thinReads`: each point's own half thickness with the joins' bulges taken out, a short stroke between two joins no
   thicker than the strokes leaving them, and each join's stem run straight through it, `straightThrough`, a join a
   short stroke off it going with it, a K's arms meeting its stem). `thinMoves` moves each side in to where a round along its middle as thick as the
   stroke is now ends (`weighsOf`; a high-contrast font's sides by their own reading across, never thinner than its
   hairline as the weight keeps it, `hairKept`), a side by a join or a crotch along a ray to those rounds' ink (read
   only when a round could stop it, `stops`, through `pointGrid`/`inBand`), a crotch where its two strokes' edges
   cross nearest the join (`crossing`; a foot's own corner nearer its line than the join is none), an edge cut across its stroke and facing the way it runs staying (a stem's
   square foot on a line, `FLAT_END`), a level foot's samples in along their normals to its shape as the move thins it
   (`intoFoot`, `byFoot`: its stem's round run down to the line, each serif a band as thick as it is now standing on its
   edge, a serif's straight edges out past its stem's side among them whichever middle they read, and a straight edge it
   stands on along its line staying there past the foot, an E's arm's top, `footRound`, a contrasty font's no thicker than its hairline), so its edge on the line stays, its bracket comes
   down, and its serifs' ends, cut across them, stay and come down with their edges, a flag's top past its stem's side
   pinned to that side's corner (`pins`, which `moveRing` puts where they say); a dot made smaller about its middle,
   one with corners (a square, a diamond) pinned there point by point, as its sides moved in alone crossed at its
   corners and left a sliver; `moveRing` carries each stroke end by its turn alone (`endsOf`, `EndRun.ca`/`cb`:
   a j's tail's curve goes in as a side), a corner's round whole (`carryFillets`, but a serif's bracket on a level
   foot, a round inside running on from a stroke's end, an r's arm under its ear, or outside running into a ball, a fat
   face's r's arm), and sets a zero-thickness point
   where its neighbours meet (`pinPoints`). Joins its stems thin to under `REBUILD_BELOW` of themselves, no serif on
   them, are drawn again from the strokes along the skeleton (`rebuildJoins`, within `JOIN_REACH` but for the stroke
   ends out past them, the moved outline kept where it keeps within `JOIN_GIVE` of them, never past the letter's ink,
   `letterInk`). A letter of straight strokes about as thick as each other in a font without serifs (Gumdrop's A, E, M, N,
   W, w, z; a grotesque's E, L, Z) is first drawn as those strokes alone, read off its sides (`linedRig`, `lineSkeleton`
   in `lines.ts`: the middle of a heavy one's ink, a w's one bar notched above and below, isn't its strokes'), each
   free end cut as the design's is, square or aslant, or round, its joins' rounds no thicker than the thinnest stroke
   there (but a stroke running on through), a turn's outside cornered as the design's is, mitred or round as round for
   the stroke's thickness (`roundAt`); a stroke whose sides run on out past another's is read crossing it (a #'s bars),
   and two whose middles meet a little past a corner the design cuts square or blunt meet there brought in between them
   (a squared N's, M's and W's, a pointed V's). A stroke run level along one of the letter's lines keeps its side there
   as it thins, and a stroke ending at one goes with it (`FLUSH`: an E's arms and its stem's ends); so does a point two
   strokes turn at whose ink runs out to a line, brought no further off it than its corner now reaches (an M's flat
   vertex on the baseline). Two strokes crossing at as little as `MEET_SIN` meet past the ink up to `CORNER` times as far
   as their corner reaches (a monospace W's narrow points, cut flat on the baseline). A wood type, its
   slabs short blocks a tab either side of its n's and H's feet (`fontSlabbed`, Timber), has its letters read with its
   slabs (`slabsOf` in `slabs.ts`) as strokes along their faces kept there, its strokes' sides off its outline without
   them, its sides' ink read only where both sides run and a thin stroke read inside much thicker ones dropped
   (`buried`); a letter of it not so drawn is moved without its slabs and each laid back over it (`slabRig`).
   Every letter of a font of heavy, even strokes without serifs (`fontStroked`: low contrast, stems over `STROKED_HEAVY`
   of its capitals' and from a weight whose stems are `STROKED_UNDER` of its own down, Orbital, Bulwark, or over
   `ROUND_HEAVY` with no square ends at every lighter weight, Gumdrop) is drawn as its strokes too, on the
   skeleton its ink's middle reads, evened out (`SMOOTH`), parted where it bends tighter than it is thick, and no stub into
   a corner drawn; a free end the design cuts straight across (`capAhead`) cut so, its tail tapering or turning into the
   cut's corner left off (`TAPER`, `TAPER_TURN`); failing `whole`, it is moved as any letter is. Crumbs (`CRUMB`) go. A letter that comes out broken (`whole`: its outlines and counters, a pinhole
   opened where strokes cross aside, and ink along its strokes' middles) is mended with those strokes laid over it
   (`thinStrokes`, each run on at its free end to the moved letter's ink, but a foot's stem, which ends on its line;
   none of them, nor the middles `whole` reads, past a foot's edge, where `keepHeights`' lift, keeping a round's
   overshoot, would take them), or else drawn as those strokes alone within
   its ink, its dots as moved, or else moved again on a skeleton keeping its strokes that end round (`roundRig`,
   `skeleton(…, round)`: a heavy w's feet and middle peak), then thinned only as far as keeps it whole, in eighths. A heavier weight reads and moves
   as before. A pixel font
   (`FREE_FAMILIES[family].grid`) is never rigged, only stretched.
4. `restyle.ts`: `restyled` (in `free-letters.ts`) redraws the engine's shapes on the moved outline in a fixed order,
   Overlap, Dots, Bowls, Ends, Cursive, Serifs, Stencil, Peaks, Corners, each only where its settings differ from
   the pick, each handing back the very same array when nothing it follows moved. Results are cached by the contours and
   a key of every setting the steps read. Overlap parts a b d p q's bowl from an upright stem as the font's own o
   (`bowlStem`, `OVERLAP_LETTERS`); Cursive adds the engine's exit and entry flicks to the lowercase (`EXIT_LETTERS`,
   `ENTRY_LETTERS`); Peaks reshapes only `PEAK_LETTERS` with straight sides (`hasPeaks`; skinFollows reports no others);
   Corners rounds a run of corners a hair apart as one (a blackletter's points, `TIP_GAP`; inside corners only where
   their sides close in the ink, past a hairline's notch `NOTCH_GAP`, turning on as `MERGE_KEEP` asks) and each corner,
   outside or in, as a share of what its room allows, so Roundness, Joins and Counters keep rounding to 100. An inside
   corner goes to Joins or Counters by its width as the engine's (`innerShare`) where it is a narrow crotch or a square
   corner of upright and level strokes; any other wholly to Counters where it faces a counter (`facesCounter`: a ring
   round one, or paper running on between ink as a channel) and to Joins where it is a notch opening out (a
   blackletter's heads and feet, an X's crotches). Its round reaches as far as the side runs straight or curving round
   its way (`BEND_ON`), half way to a rounded neighbour or most of the way to another, is drawn clear of other ink (the
   triangle it is drawn in, `fits`), and fills no more than `HOLE_FILL` of a counter it rings; sides are read along
   their own stretch (`sideTo`) and spurs of no width dropped first (`despike`). Ends restyles only the free ends standing
   where the engine's letter of the same character has a styled end on a curving stroke (`endSpots`, `SPOT_NEAR`; on a
   cursive design its italic letters' too), each of a stroke that curves (`END_TURN`) and no serif's or beak's prong
   (a stem's foot, a crossbar's end and a Didone's s's beak keep theirs), drawn again from no further back than the
   stroke runs alone (`widthAcross`, `ALONE_TURN`) and stepped further back where the line across it runs into a ball;
   an end cut on a slant is told from one another stroke meets by which way the outline turns where its short side
   stops. In a font of block letters (`blocks`, Bulwark: `RestyleCtx.stubs`) an end that stands out shorter than an
   end needs (an r's square arm) is drawn again from just short of where it leaves its stem (`STUB_WIDE`), and a
   straight heavy tail whose side turns off at once (a y's) from nearer its tip ('short'); and its bowls, which turn in
   corners, are reshaped by those corners (`restyleBlockBowls`, in place of Bowls' ovals): each round between two
   straights grown or shrunk as basic-blocks.ts's Corners asks (the inside's the outside's less the stroke), as round
   as half of each straight apex to apex lets it be for Oval, cut straight by Facets, fuller by Curves and Squareness;
   the stems' square corners have no round to change. In a script whose letters stand apart (`freeExits`, Serenade), a small letter's exit stroke is an end too
   (`exit`: the hairline, thinner than `EXIT_THIN` of the font's stems, rising out of the right of the letter): Length
   draws it shorter or longer by a share of its run (`EXIT_LEN`), Curl turns most of it (`EXIT_BACK`) back over the
   letter or out flat, and no kind of end reshapes it, as the engine's own exits end plain. A ball or drop of the
   font's own (`BALL_NECK`, round all the way: `straightRun`) is no stroke's two sides: the stroke runs on into it at
   its neck's width along its skeleton (`runOn`), and a new drop is as big as the font's ball (`DROP_OF_BALL`). Each end is as big as the letter has room for (`fittedEnd`, `roomFor`, `roomAround`): a drop,
   point, flare or slant reaches no nearer the rest of the letter than the font's own end did (`ROOM_KEEP`), nor
   further past its stroke than `REACH_X` of the x-height, its slider a share of that (`reachT`), drawn back along its
   stroke (`END_CUTS`) and curled less where even the least of it would come too near; an end with no room still is
   left as the font draws it, so a heavy C never closes into an O. Length and Curl alone carry the font's own end
   (`carryEnd`: every outline point moved by its place beside the skeleton, smoothed and drawn again as a fine curve
   by `smoothLine`, run on straight past its tip, the end past its shorter side carried whole) by their share of as far
   as it has room for at the ends of their sliders (`carriedEnd`). Drawn longer, the stroke stretches from nothing at
   S; drawn shorter, it is cut back, not squeezed (squeezed, the inside of a curve folds into a flag), and the end is
   carried back along it as wide as the stroke where it now meets it. A taper runs back its share of all the way the stroke runs alone past Taper length's middle.
   Stencil cuts each join from where the stroke's edges leave the host's ink (read off it, as a heavy join's skeleton
   sits off its middle), moves a gap out only on a stroke leaving steeply, and keeps a gap only where every piece stays
   solid ink and it lands on no other join, narrowing it down to `GAP_LEAST` of Stencil's first, as the engine's
   `stencilPieces` does. A stroke that runs on along its host before leaving it (a heavy R's leg, a K's, a y's arm) and
   a bar on a slanted host (an A's) are cut square across where they run on alone instead (`aloneCut`: no wider than
   Stencil times the stroke's thickness, leaving a solid piece); a ring with only a short tail (`TAIL_SHORT`, a Q's) is
   cut down its middle as an O, never opened where the tail leaves it.
   A serif's length is held to most of half the room beside it, read from past its stroke's own edge (a face can read a
   unit narrower than the stroke, and the room came out nothing: an R's, an N's, a K's feet went bare).
   Serifs also squares off an upright stroke's round end on a line (`roundTip` in
   `scan.ts`) to stand a serif on it; Bowls draws box bowls as round as the Bowls' Corners slider (`boxRound`) asks.
5. The twin: `formChanged(ch, asked, picked)` says a letter is asked for in a form the font hasn't got (another build,
   the a's storeys, a `FORM_LETTERS` setting; the Letter a left on auto keeps the font's own form, and a font is written
   in its own letters, script or print, whatever Cursive asks; a family `ownForms` (Cathedral, Serenade, Boardwalk,
   Sonnet: their twins look nothing like them) takes no other form; round Bends only in a font whose V or v comes to a
   straight point, `fontVertexed`); `twinGlyph` draws the engine's own
   letter at the settings the font reads as (`twinFit`: the weight and contrast whose stems and bars match the font's
   own, read off its n and H by `fontLook` with the design's Verticals and Horizontals counted, its x-height, width,
   serifs, and its stems' lean as slant), moved as far as the design moves from the pick.
6. `freeGlyph` sizes the letter to the design, gives it side bearings, places it with `placeGlyph`, and keeps the placed
   outline as `Glyph.drawn`, so Points opens with the font's own points (its overlapping pieces made one; with an effect
   on, `Glyph.fx`, Points traces the outline the effect draws instead, so an edit keeps it). An unmoved
   letter is spaced by the font's own outline, the united one leaving out a speck under a unit square. A parted bowl and
   Cursive's flicks get the room they reach out into; the engine's serifs get room only on a letter they were set on;
   a monospaced font with Monospace lowered loses the
   padding its narrow letters stand in; and Hand-drawn moves the letter through the engine's field (`wobbler` in
   `glyph.ts`), its long straight sides split so they bend.

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
| freeAt, pick, now | The settings a free font was picked at; `fl.pick` and `fl.now` are those and the asked-for ones, resolved |
| skin, rig | A free font's letter moved on its skeleton; the rig is the letter prepared for that (`SkinRig`: contours, its overlapping pieces united; bones; ends, each stroke end's run of samples; ctx, stem, bar) |
| restyle | Redrawing one of the engine's shapes on a free font's letter where the settings ask for another than the font's |
| twin | The engine's own letter at the settings a free font reads as, for forms the font hasn't got. (The pen's mirror partner in PenCanvas is also called twin; unrelated) |
| skeleton (scan) | A scanned letter's middle lines as a graph: a node with one edge is a free end, three or more a join |
| drawn | A letter drawn in Points (`params.outlines`), or a free font's as placed (`Glyph.drawn`); the settings don't reshape it, but they move a drawing from the settings it was drawn at (`Drawn.at`), and a family's other weights and italics move it (`family-drawn.ts`) |
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
- Most modules `font.ts` loads import values back from it (`glyph.ts` and its stages, `free-letters.ts`, `skin.ts`,
  `restyle.ts`): they may use those values only inside functions, never at module load. `stroke.ts` imports values
  only from `geom.ts` (types aside), so restyle.ts and the client's diagrams (`client/components/Diagram.tsx`) can
  call it with a PenCtx of their own. `term` is optional: left out, terminals are drawn with the expander's default
  `TERM`, so a PenCtx that draws styled terminals sets it with `termSpec`.
- Outline points are tracked by identity from `expandStroke` to placement (`endCorners`, `clipMade`, the stencil's
  `drawn` sets): clipping and splitting keep the original Pt objects; never copy them in between.
- Outlines wind anticlockwise with clockwise holes; `combine` returns them so, and the fills rely on it.
- Fills, the slice and rough edges run last, on the placed outline, so a grid lines up across a line. A new effect
  in `placeGlyph` needs the same neutralizing in `freeLetters`, or a free font's letters change as soon as it is
  picked (Spread and Rough edges need none: no font has them, so they aren't `free` and reach its letters as set).
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
  model, `SUBS`, `FORM_OPTIONS`, `SAME_WITHIN` covering `SkinMeasures`) fail only here.
- `npm run golden`: also the free-font set (needs `data/free-fonts`), for anything the free-font path reads. If it
  prints `free: no free fonts kept in … (skipped)`, the free set wasn't checked; `npm run render -- --style <id>
  --free` fetches a style's font into `data/free-fonts`.
- `npm run compare -- [ref]`: every glyph of every style under about 50 setting combinations, built at a git ref
  (HEAD by default) and in the working tree, compared in full (outline, marks, counters, strokes, skeleton, serifs,
  spacing, highlights, layout, metrics); `--free` adds the free fonts, `--only <regex>` a few styles. It catches what
  golden's probes don't reach. Use it for any refactor. Designs are drawn in a fixed order on both sides: the twin's
  fit of a free font is cached by the font alone, so a design can draw otherwise after another style used that font.
- `UPDATE_STROKE_ORDER=1 node --import tsx --test tests/stroke-order.test.ts`: only when a glyph's stroke order
  changes on purpose (it moves saved per-letter values; see the invariants).
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
