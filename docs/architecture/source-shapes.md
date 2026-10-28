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
```

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
| Pinch, Position | **Pinch:** every stroke is drawn in toward its middle round a height (Position, as a share of the cap height), up to 60% of its half-thickness, over 18% of the cap height either way. |
| Serifs (shape, Length, Thickness, Angle, Bracket) | **Serifs:** on a style drawn without serifs, a foot is set across every flat end of an upright stroke. The shape is slab, bracketed, unbracketed, wedge or diamond. Length reaches up to 0.8 of the stroke's width either side, Thickness up to 0.55 of it, Angle slopes the top toward the tip, and Bracket curves a bracketed foot into the stroke. |

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
- **Pinch and serifs.** Pinch narrows H at the waist and leaves it elsewhere. Serifs give l a foot in each shape with
  its advance kept, and a serif style keeps its own.
- **Every style.** In all 22 at strong settings of every control, letters are finite, keep their advance and don't
  come apart.
- **Adoption and export.** Adoption starts at the style's own with the letters as they were, the editable drawing is
  kept, and export matches the preview.

All the controls were reviewed rendered on Mainline (Squareness, Bowls, Facets, Bends and Serifs also close up), and
Squareness, Box and Serifs on Gumdrop, Compass and Orbital.

## Limits

- **Curves.** The "Geometric or organic curves" control is not offered on sources. The styles' curves are stored as
  many short segments, so reshaping handles changes nothing visible, and no honest construction was found.
- **Squareness reach.** Squareness leaves styles with no round contours unchanged: Bulwark, Funnies, Boardwalk,
  Cathedral and Serenade.
- **Serifs.** Serifs are added only where a stroke ends flat and near level, so round ends (Gumdrop), curved strokes
  (c, s) and slanted cuts (x) stay bare. A serif style's own serifs can't be removed or reshaped, and its Serifs switch
  changes nothing. Tips, Base, Sides, Inside serifs, Balance, Top serifs and Arm serifs are not offered.
- **Sharpening.** Roundness only rounds, from the corners as drawn: a rounded style's corners can't be sharpened.
- **Steps and Pinch.** At small sizes Steps reads as notches. Pinch thins every stroke at the height, curves included.
- **Optical review.** Combinations of these controls, and with the effects, have had no optical review.
