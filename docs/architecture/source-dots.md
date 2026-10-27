# Source dots

The Dots control on the Letters page offers a source style's own dots (Original) and round or square ones drawn in their place. It reshapes every bound dot: i and j tittles, the dots of `. : ; … ! ¡ ? ¿ · • ÷`, and the dots of a diaeresis or dot above. A style is offered only the shapes its own dots are not, so Original is never repeated under another name. The legacy `dots` values keep their meanings for generated letters.

## Published policies

Every current program carries a `source-dots-v1` policy:

| Offers | Styles |
| --- | --- |
| Square | Mainline, Parlance, Couture, Vellum, Almanac, Compass, Kernel, Orbital, Sonnet, Cotton, Funnies, Turnpike, Ballyhoo |
| Round | Hearth, Dispatch, Bulwark, Timber |
| Round and Square | Gumdrop, Jotter, Boardwalk, Cathedral, Serenade |

- **Soft corners.** Square dots in styles with soft corners have rounded corners, as a share of half the shorter side: Cotton, Funnies 0.5, Orbital 0.45, Gumdrop, Kernel 0.25. Every other square is sharp.
- **Leaning styles.** In the leaning styles a dot is shaped upright and then leaned with the letters, so a square becomes a parallelogram. The lean is measured from each style's `!`: Sonnet 15°, Boardwalk 13.5°, Serenade 26.5°, Jotter 34°.
- **Mark dots.** Cathedral's marks follow in 12 of the 17 dotted characters; the others are not drawn as dots.

## Data

The policy sits inline in the program, beside its pinned component bindings:

```ts
{
  format: 'source-dots-v1',
  shapes: ['round', 'square'],   // offered besides Original
  corner: 0,                     // a square's corner radius, share of half its shorter side
  overshoot: 0.037,              // how far a round dot on the baseline dips, share of its height
  slant: 0,                      // the letters' lean in degrees; dots are shaped upright, then leaned
  baseline: ['.:dot', ...],      // bindings whose dot stands on the baseline
  marks: 'ÄËÏÖÜŸ...'             // accented letters whose mark is all dots
}
```

`Params.dots` keeps its options. On a source, `auto` is the style's own dots, and `round` or `square` draw that shape where the program offers it; any other value draws Original. `sourceStyleParams` starts a style at `auto`. `adoptProgram` also starts at `auto` a design adopting its first dot policy, because a Dots value saved before then drew the style's own dots. `programUpgrade` refuses a program that drops a shape the previous one offered.

## Construction

`shapeSourceDots` (`shared/source/dots.ts`) runs in `variedFont`, after the weight, width and feature masters and before proportions, edits, Size and pose. It replaces each bound contour with `dotShapeContour`:

- **Same ink.** The shape has the dot's area and its proportions, held to at most 5:4 either way so a long dab doesn't become a dash. It sits at the dot's centre.
- **Baseline.** A dot standing on the baseline keeps its foot there. A square's foot sits on the baseline. A round one dips as far as the dot did for its height, or, where the dot was square enough to stand flat, by the policy's overshoot.
- **Same points.** The shape keeps the dot's point count and turns the same way. Each side takes as many points as the dot had in that direction, and the start is rotated to the dot's own first point. A rounded corner needs eight points; a dot with fewer draws a superellipse as round at 45° as that corner.

Because the point count and contour index stay the same, the dot keeps its component identity and its authored point identities. A change of Dots therefore behaves like a change of weight for Points edits. `evaluated` treats Dots as part of a drawing's frame, and `transportEdits` moves each edited point by how far its source point moved between the two shapes. A moved dot becomes square where it was moved; switching back returns the drawing exactly. Size scales the shaped dot about its own anchor. Accented letters reshape the mark contours named in `marks` after the mark is drawn for the weight and width.

## Authoring

1. `node --import tsx tools/authored/build-dots.ts` measures each style's newest program at every weight and width cell and writes `fonts/dots/manifest.json`. `--report` prints the measures and `--check` verifies the manifest.
   - **Offered shapes.** A shape is offered unless the style's median dot is already within 4% of it, measured as the furthest the two outlines run apart over the dot's size. `OWN_SHAPES` records Dispatch's rounded squares, which fall just short of that measure.
   - **Baseline.** A dot stands on the baseline when its foot is within a sixth of its height of it at every cell.
   - **Overshoot.** The median dip of the style's own round baseline dots; where it has none, twice the o's dip for its height.
   - **Corners and lean.** `DOT_CORNERS` holds the soft corners, chosen by eye. The lean is the `!` stroke's, between a third and five sixths of its height.
   - **Mark dots.** The letters with U+0307 or U+0308 whose mark contours are compact and fill most of their box in every cell.
2. `node --import tsx tools/authored/build-programs.ts --dots fonts/dots/manifest.json` adds each policy to its style's newest program, whose weight, width and component bases must match those measured. `build-previews.ts` then regenerates the previews.

## Validation

[tests/source-dots.test.ts](../../tests/source-dots.test.ts) checks:

- **Policies.** The shapes each style offers, and which styles lean.
- **Original.** Original draws exactly what the program before dots drew.
- **Every offered shape, in every style, at the weight and width extremes.** Every bound dot keeps its point counts, and its body contours and advance are unchanged. A round dot fills π/4 of its upright box and a square fills all of it. A baseline dot keeps its foot, and the i's tittle stays clear above its stem.
- **Construction.** Point count, turn, ink, and the foot of a dot on the baseline.
- **Marks.** Diaeresis and dot-above marks take the shape; other marks are unchanged.
- **Points edits.** Edits carry to Square and back exactly.
- **Size.** Size grows a square dot.
- **Gates and adoption.** The capability gates, Letters page offers, unoffered values, and adoption from the program before dots.

All 22 styles were reviewed rendered at Original, Round and Square. The Letters page was checked in the browser at desktop and phone sizes, with the whole font and with i edited alone.

## Limits

- **Optical review.** Dots at mixed heights and with Size at its ends are not optically reviewed yet.
- **Marks.** A mark's dots take the shape but not Size.
- **Fixed parts.** Comma tails, the body of `?` and `!`, and the bars of `÷` keep their drawn shape.
