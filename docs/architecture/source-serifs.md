# Source serif styles' own serifs

A source style drawn with serifs (Almanac, Vellum, Couture, Sonnet, Ballyhoo, Hearth, Timber and Dispatch) can have
its serifs taken off, redrawn in another shape, or reshaped. The Serifs switch takes them off. Another Serif shape
draws that shape in their place, as long and as thick as they were. Length, Thickness, Angle, Bracket, Top serifs, Arm
serifs, Sides and Balance reshape them about the style's own. At the style's own settings the letters are exactly as
drawn.

It is a finish, part of the shape controls ([source shapes](source-shapes.md)): it changes only the finished ink, so
Points keeps the clean editable drawing. The serifs are found on the letter as it stands, so they follow every edit,
weight, width and setting.

## Policy

Every current program's finish policy carries it, published from `tools/authored/source-finishes.json` with
`build-programs.ts --finish`. That file's `overrides` leaves it out of Cathedral's programs: a blackletter's feet are
part of its strokes, not serifs.

```ts
serifs: { format: 'source-serifs-v1', reach: 0.3, across: 5, height: 0.25, side: 0.08, length: [0.25, 1.75],
          thick: [0.3, 2], size: [0.25, 1.4], slope: 0.8, bracket: [0.05, 2.5] }
```

- **Finding.** `reach` is how far past its stroke a serif may reach, as a share of the cap height; `across` is the same
  as a multiple of the stroke's width. `height` is how far it may run along the stroke, from where the stroke's side
  ends to its end, as a share of the cap height. `side` is how long a straight side must be.
- **`length`, `thick`.** Length and Thickness at 0 and 100, as multiples of the serif's own.
- **`size`.** Top serifs and Arm serifs at 0 and 100, as multiples of the serif's own reach and thickness.
- **`slope`.** How far Angle 100 takes a serif's top down toward its tip, as a share of its height there.
- **`bracket`.** Bracket at 0 and 100, as multiples of the height the bracket rises above the serif's tip.

A design adopting the first program with it starts every serif setting at the style's own on a serif style, because
those settings drew nothing there before. A sans keeps the serifs it added; its Top serifs, Sides and Balance start at
the style's own. Export writes reshaped letters with fractional coordinates.

## Finding a serif

`serifHalves` (`shared/source/serifs.ts`) works on the filled ink. A serif is found from the stroke it belongs to:

1. **The stroke's side.** A straight run of the outline at least 8% of the cap height long. It may bow a little along
   its length (a tapering leg), up to 8° in all, but bends at no one point by more than half a degree.
2. **Out round the serif.** From where the side ends, the outline turns out away from the ink, through a bracket if
   there is one, and round the serif. It never reaches back into the stroke, nor further out than `reach`.
3. **Back across the side's line.** It crosses the line of the side, within `height` of where the side ended, onto the
   stroke's end. That end runs on straight under the stroke for nearly a third of its width.
4. **Not a bar or a tail.** A serif reaches at least 2% of the cap height and no more than `across` times its stroke's
   width, so a T's bar or an E's arm doesn't count. Out to its tip its top only falls toward the stroke's end, so a
   hook that dips and rises again (t, j) doesn't count either.

The part of the letter outside the side's line, between where the side ends and the stroke's end, is one half of the
serif. Feet on the baseline, tops of stems, slanted heads (n, l), the serifs of diagonals (x, k, v, A) and the beaks at
the ends of arms (E, F, L, T, Z) are found alike. Each is a foot, a top or an arm's beak by the way its stroke runs.

## Reshaping

`reshapeSerifs` takes every half off, a hair past its outline but not past the stroke's side, so the stroke is cut
cleanly along that line. It then puts back the halves that stay, reshaped. Each point of a half is placed by how far
out from the side it lies and how high above the stroke's end:

- **Length** scales how far out each point lies; **Thickness** scales its height. Top serifs scales a top's halves by
  both, and Arm serifs and its Thickness an arm's beak.
- **Balance** reaches further on one side and less on the other. **Sides** takes off the halves on the sides it
  leaves out: left, right, inside (toward the letter's middle) or outside.
- **Angle** takes each point's height down toward the tip.
- **Bracket** scales the part of the half that rises above the serif's tip, up the stroke. It never flattens it
  entirely, since points laid along one line make the clipping loop.

The stroke's end stays where it is, so a reshaped half still meets its stroke. Each reaches a hair into its stroke so
the two join along more than a line. Specks and hairline spikes left where a cut meets the outline go.

**Another shape.** The halves come off, and the shape is drawn as serifs are added to a sans
([source shapes](source-shapes.md)). It goes only on the ends that had serifs, and only on the sides those serifs
reached to, so a one-sided head serif stays one-sided. Each is as long as the serif it replaces, and as thick as that
serif was partway out (where a tapering one still has body), times Length and Thickness. Under this policy a stroke's end may arch a little between its
corners, as Couture's do once their serifs are off; the end is measured square to its outline there.

Reshaping costs 2–7 ms a letter.

## Validation

[tests/source-serifs.test.ts](../../tests/source-serifs.test.ts) checks:

- **Programs.** Every program but Cathedral's pins the policy. At the style's own settings each serif style draws
  what the program before drew, and that program offers none of the new controls.
- **Finding.** All eight styles' H have eight halves, four feet, four on each side. T's bar isn't one, and a sans
  has none.
- **Off.** Every serif style's H, n and l lose ink and the reach of their feet, in as many pieces, with their advance.
- **Another shape.** Every other shape on Almanac, Couture and Hearth draws serifs where the style's own were.
- **Reshaping.** Length, Thickness, Angle and Bracket move the serifs the way they say. Top serifs moves the tops
  alone, and Arm serifs the beaks of E and not H. Sides keeps one side, and Balance reaches further to one side.
- **On a sans.** Top serifs and Sides apply to added serifs too.
- **Every serif style.** At thirteen strong settings, A, E, H, k, n and x stay finite, keep their advance and don't
  come apart.
- **Cathedral and adoption.** Cathedral is left as drawn. Adoption starts a serif style at its own and keeps a sans's
  added serifs.

Reviewed rendered: serifs off in all eight styles; another shape on Almanac, Couture, Ballyhoo, Hearth and Dispatch;
Length, Thickness, Bracket and Sides on Almanac and Hearth; Angle, Top serifs, Arm serifs and Balance on Vellum and
Couture.

## Limits

- **Bars and curved arms.** Dispatch's long slabs (I, l, f, r, T) reach too far to count, and stay. Arms whose top or
  underside curves into the stroke (Almanac's E and T) have no straight side, so their beaks stay.
- **Couture's j.** Its hook ends pointing out rather than curling back, as long as Couture's serifs, and comes off
  with them.
- **Ends that stay curved.** Another shape needs a flat end, so a serif on a curved end (Couture's l top) is taken off
  but not redrawn.
- **Tips, Base and Inside serifs.** Not offered: a tip's own shape and an arched base aren't separated from the serif.
- **Merging.** Long or large serifs can meet across a narrow counter (an H's inner tops), as drawn serifs would.
- **Optical review.** Combinations with the other shape controls and the effects have had no optical review.
