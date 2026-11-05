# Source strokes and shapes

These controls work on the source styles' letters as they stand: Verticals and Horizontals, and the shape controls on
the Curves, Corners, Weight and Serifs pages. Each is measured from the style's own setting (its `freeAt`), so at the
style's own value it draws exactly what the program before it drew. Moved toward either end, it changes the letters
the way the control's name says.

## Verticals and Horizontals

Verticals and Horizontals (`vWeight`, `hWeight`) move the two weights that [Contrast](source-contrast.md) mixes:
Verticals the weight the widths come from, Horizontals the weight the heights come from. Each reaches up to half the
style's weight range either way, about the style's own. Where one runs out of authored weights, the other goes the
other way by the rest, so the uprights and the level strokes keep drawing apart all the way along.

They are pinned as a program policy, `strokes: { format: 'source-strokes-v1', reach: 0.5 }`. It is published from
`tools/authored/source-strokes.json` with `build-programs.ts --strokes`, and works with `strokeAxes` in
`shared/source/contrast.ts`. They are part of a drawing's frame, like Weight and Contrast, so Points edits ride them.

## The shape controls

These are a finish (`source-shapes-v1` in the finish policy): `shapeSourceInk` in `shared/source/shapes.ts`. They run
before ink traps, stencil, the texture, Slice and the fills, and change only the finished ink, so Points keeps the
clean editable drawing.

```ts
shapes: { format: 'source-shapes-v1', square: 6, box: [24, 4], facet: 0.04, round: 0.06, step: 0.5, peak: 0.5,
          pinch: [0.6, 0.18], serif: [0.8, 0.55], tolerance: 0.1 }
pinch: { format: 'source-pinch-v1', depth: 0.985, reach: 0.18 }
```

The waist's own policy, `source-pinch-v1`, lets Pinch 100 take all but a thread of a stroke. A program without it keeps
the shape policy's `pinch`, 60% of the stroke at 100; a design adopting the program with it has its Pinch scaled
(by 0.6 / 0.985 above the style's own) so its waist is as deep as it was.

| Control | What it draws |
| --- | --- |
| Squareness | **Squareness:** each round bowl and counter (O, o, 0, Q, 8, and the counters of a, g) is drawn as a superellipse in its own box. The exponent runs from a circle at 0, through the contour's own shape (estimated from how much of its box it fills), to `square` at 100. Every point moves, handles too, so curves stay curves. A contour qualifies only if it is nearly all curve, near convex, and fills 60–97% of its box, so stems, B's straight side and S are left. If squaring would cut a bowl apart at a hairline, it steps back by halves. |
| Bowls, Corners | **Bowls:** Box draws the same contours as boxes, with an exponent of 24 to 4 as Corners rises. |
| Facets | **Facets:** every curve is cut into the fewest straight pieces within up to 4% of the cap height. |
| Roundness | **Roundness:** sharp outer corners are rounded, up to 6% of the cap height and never more than half the stroke. A source's own Roundness is 0, its corners as drawn. On a Pixels or Hexagons fill, Roundness keeps rounding the pattern's cells ("Pattern corners"). |
| Joins, Counters | **Joins and Counters:** the inside corners of joins (found as for [ink traps](source-traps.md)) and of counters are filled round. |
| Steps | **Steps:** a square step is cut into each sharp outer corner, up to half the stroke. |
| Peaks | **Peaks:** toward Flat, points sharper than 80° are cut flat, up to half the stroke deep. Toward Pointed, flat tops are carried back to the point their sides meet at. |
| Bends | **Bends:** Round rounds each sharp inside corner where a stroke turns, and the outer corner across the stroke from it, as at the turns of Z, N, M and V. |
| Pinch, Position | **Pinch:** the strokes narrow toward a level line (Position, as a share of the cap height) and swell out again over 18% of the cap height either way, to a point at 100 (a thread of 3–4% of the stroke, so the letter holds together). Each point of the outline moves level by the level part of a push toward its stroke's middle, so upright sides (stems, bowls' sides) narrow fully, slanting ones less, and level strokes (bars, the tops of bowls) keep their thickness; a bar on the waist runs on to meet its thinner stems. A stroke's half-width is the middle of the circles read along its outline within two stroke widths, so a read that fails at a kink, or shrinks toward an end, or swells at a join, takes the stroke's. Cut ends stay where they are cut (square or with rounded corners), and so do dots; a level cut narrows with its stroke. A join's corner goes where its two thinner sides meet, no further than half the ink they share. A letter whose strokes meet right on the line, drawn to a point, is drawn again with its joins held, then shallower, till it holds together. |
| Serifs (shape, Length, Thickness, Angle, Bracket) | **Serifs:** on a style drawn without serifs, a foot is set across every flat end of an upright stroke. The shape is slab, bracketed, unbracketed, wedge or diamond. Length reaches up to 0.8 of the stroke's width either side, Thickness up to 0.55 of it, Angle slopes the top toward the tip, and Bracket curves a bracketed foot into the stroke. With the serif policy, Top serifs sizes those on top, Sides keeps one side's, and Balance reaches further to one side. On a style drawn with serifs, these reshape its own ([source serifs](source-serifs.md)). |

### Stroke ends

The Stroke ends picker draws its forms on every flat stroke end of the style: a straight edge between two outer corners
near square, as wide as the stroke behind it. It uses its own policy, `ends: { format: 'source-ends-v1', reach: 1.6,
bulge: 0.45 }`. A shape reaches back along the stroke up to 1.6 times its width, short of where the stroke turns, and
swells or cuts across it up to 0.45 of it. The style's own form, and Flat, draw the ends as they are.

| Form | What it draws |
| --- | --- |
| Flared | The end widens. |
| Scooped | The end is hollowed by an arc. |
| Round | Both corners rounded, a semicircle at Roundness 100. |
| Droplet, Ball | A ball at a curving stroke's end (c, a, f, r, y), never a stem's foot. |
| Pointed | A point, with Lean moving it across the end. |
| Clipped | A point with its tip cut flat. |
| Slant out, Slant in | The end cut on a slant, back on the stroke's inner or outer side. |
| Level | The end re-cut at Tilt. |
| Notched | A V cut into the end, then tilted. |
| Taper | The stroke narrows into its end. |
| Brush | The stroke narrows on one side only. |

Each form's own sliders shape it. Direction, Curl, and the values of each end alone have no construction here and are
not shown. Length stays for a letter alone where the program authors it.

### Inner space and Openness

Inner space and Openness have their own policy, `insides: { format: 'source-insides-v1', counter: [0.75, 1.18],
open: 0.9, close: 0.3 }`.

- **Inner space.** Every closed counter (O, B, D, 8, a, e, g) is scaled about its own middle, from 0.75 at 0 to 1.18
  at 100. Larger counters thin the strokes round them and smaller ones thicken them. Each piece loses only its own
  counters, so the a inside @ stays, and a counter grown so far it would cut a stroke halves back. Open counters (n, u,
  h) stay as drawn.
- **Openness.** The free ends of curving strokes (c, e, a, s) are cut back along their sides by up to 0.9 of their
  width, opening the letter. Toward Closed they are run on straight by up to 0.3 of it. Stems' flat feet are left
  alone, and so are round ends.

Every corner shape is bounded by the straight run of the edges either side and by the thickness of the strokes. Pieces
added to the ink must overlap it, so none comes loose. Corner cuts that would split a stroke shrink toward their
corners by halves until it holds. A letter with nothing to change keeps its curves exactly.

Older programs don't offer these controls. A design adopting the first program with them starts each at the style's
own value, because a value saved before drew nothing; its Roundness starts at 0, the corners as drawn, except on a Pixels
or Hexagons fill, where it already rounded the pattern. The Adjust tab's Corners choices (Sharp, Soft, Round) now apply. Export writes shaped
letters with fractional coordinates.

## Validation

[tests/source-shapes.test.ts](../../tests/source-shapes.test.ts) checks:

- **Programs.** Every program pins both policies. At the style's own settings the letters are exactly what the program
  before drew, and that program doesn't offer the controls.
- **Verticals and Horizontals.** `strokeAxes` moves and overflows, Verticals thickens and thins Mainline's stems, and
  Horizontals thickens E's arms.
- **Curves.** Squareness squares O and leaves S, Box boxes O, and Facets cuts every curve into lines, finer lower down.
- **Corners.** Roundness, Steps, Joins, Counters, Peaks and Bends each change what they should. A rounded style
  (Gumdrop) sharpens.
- **Pinch and serifs.** Pinch narrows H at the waist and leaves it elsewhere; every program pins the pinch policy; an
  l takes about half at 50 and comes to a thread at 100 about its middle (the program before, 40%); an H's bar on the
  waist keeps its thickness and an E's middle arm its end; an O's side narrows smoothly toward the waist at 50, at 100
  and at the heaviest weights; a design adopting the policy keeps as deep a waist. Serifs give l a foot in each shape
  with its advance kept, and a serif style keeps its own.
- **Stroke ends.** Every form changes the style's flat ends, the style's own form draws them as they are, balls go on
  c and not l, and each form's sliders move it.
- **Inner space and Openness.** Small counters add ink to O and large ones take it, the a in @ stays, n is drawn as it
  was, and Openness opens and closes c.
- **Every style.** In all 22 at strong settings of every control (Pinch at four heights), letters are finite, keep
  their advance and don't come apart.
- **Adoption and export.** Adoption starts at the style's own with the letters as they were, the editable drawing is
  kept, and export matches the preview.

All the controls were reviewed rendered on Mainline (Squareness, Bowls, Facets, Bends and Serifs also close up), and
Squareness, Box and Serifs on Gumdrop, Compass and Orbital.

## Limits

- **Curves.** The "Geometric or organic curves" control is not offered on sources. The styles' curves are stored as
  many short segments, so reshaping handles changes nothing visible, and no honest construction was found.
- **Squareness reach.** Squareness leaves styles with no round contours unchanged: Bulwark, Funnies, Boardwalk,
  Cathedral and Serenade.
- **Openness.** Ends run on straight to close a letter, not along the stroke's curve, so the closed end of the slider
  is kept small.
- **Inner space.** Counters are scaled whole, not shaped: a bowl's counter grows evenly, not where its stroke is
  thickest.
- **Stroke ends.** End shapes need a flat end, so round ends (Gumdrop's) and ends cut into curves keep their own.
  Pointed, Round and the rest reach every stem's foot as well as the free ends.
- **Serifs.** Serifs are added only where a stroke ends flat and near level, so round ends (Gumdrop), curved strokes
  (c, s) and slanted cuts (x) stay bare. Before the serif policy a serif style's own serifs can't be removed or
  reshaped; with it they can ([source serifs](source-serifs.md)). Tips, Base and Inside serifs are not offered, and Arm
  serifs reaches only a serif style's own beaks.
- **Sharpening.** Roundness only rounds, from the corners as drawn: a rounded style's corners can't be sharpened.
- **Steps and Pinch.** At small sizes Steps reads as notches. Pinch keeps level strokes as they are, so a style's
  S spine or e bar on the waist hardly thins. Where an arm meets its stem on the waist (K, k), the join slides down
  the stem as both thin, which at 100 leaves the arm on a thread. Pinch costs about 1.4 times what the first
  construction did (3 ms a letter on Mainline).
- **Optical review.** Combinations of these controls, and with the effects, have had no optical review.
