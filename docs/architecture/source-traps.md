# Source ink traps

Ink traps on the Corners page carve a notch into the inside corner wherever a source style's strokes join: where H's
bar meets its stems, n's shoulder, the crotches of k, v and y, the inner points of M and W. At 50 they are the small
traps of a text face; at 100, the bold wedges of a display face built round them.

They are a finish, like Slice: they change only the finished ink. Points keeps the clean editable drawing, and the
traps follow every edit, weight, width and setting, because they are found on the letter as it stands.

## Policy

Every current program's finish policy (`source-finish-v1`) carries them, published from
`tools/authored/source-finishes.json` with `build-programs.ts --finish`:

```ts
traps: { format: 'source-traps-v1', depth: 0.35, mouth: 0.6, turn: [20, 60], reach: [0.01, 0.04], run: 1.5, apart: 0.9, tolerance: 0.1 }
```

- **`depth`.** How far a notch runs into its join at Ink traps 100, as a share of the thinner stroke meeting there. Two notches on either side of a bar leave it at least half its thickness.
- **`mouth`.** How far along each side the notch's mouth reaches, as a share of its depth.
- **`turn`, `reach`.** What counts as a corner, below.
- **`run`.** How far each side of a corner must run on before turning back, as a multiple of the join's depth.
- **`apart`.** How far apart the swept circles must reach, as a share of the thinner stroke.

`joints` is the setting it reads, as the legacy engine's Ink traps did. A style starts at none whatever its preset's
legacy value, and so does a design adopting the first program with traps: an Ink traps value saved before drew nothing
on a source. The Adjust tab's Cuts choice Ink traps sets 80. Export writes trapped letters with fractional coordinates.

## Construction

`trapSourceInk` (`shared/source/traps.ts`) works on the filled ink, flattened and united (`shared/source/ink.ts`, shared
with Inline and Wire). It runs before the other finishes, so Inline's line, Outline's rim and the patterns follow the
trapped letter.

1. **Corners.** A corner starts at a point turning away from the ink by more than flattening a curve does (4°). It
   counts if it turns 20° within 1% of the cap height, so a tiny rounding is one corner and a grotesque's gentle
   shoulder still counts. It also counts if it turns 60° within 4%, as a rounded crotch does.
2. **Joins, not serifs.** Each side of the corner must run on for 1.5 times the join's depth before turning back
   toward the ink. A serif's corner with its stem fails: the serif's top turns back at its end.
3. **Joins, not kinks.** Circles are grown from the corner in seven directions between its two sides' normals. At a
   join they reach across different strokes, far apart. Where one stroke's edge only kinks, as with Orbital's
   drawn-in E and its a's swelling stem, they all reach the same far side. The spread of their far touches must be at
   least 0.9 of the thinner stroke.
4. **Sizes.** The join's depth is the largest of those circles. The thinner stroke is measured by a circle a little
   way along each side.
5. **The notch.** A wedge from a point on each side, along the contour, to its tip on the corner's bisector. The
   notches are cut together. Where they would split the letter into more pieces than it had, all of the letter's
   notches are halved, up to three times, and then dropped.

Ink traps cost about 2 ms a letter.

## Validation

[tests/source-traps.test.ts](../../tests/source-traps.test.ts) checks:

- **A T.** Both inside corners are carved and the outside left alone, in one piece.
- **Passed over.** A serif's corners, a stroke whose edge kinks, and a plain stroke come back unchanged.
- **Kept whole.** A notch too deep for a thin bar is made shallower, so the letter stays one piece.
- **Programs and defaults.** Every current program pins the policy and the one before doesn't offer it. Letters are
  untrapped as before, a style starts at none, and adoption starts at none with the letters as they were.
- **Every style.** In all 22, at the lightest and heaviest weights, at least three of HEkMvAKyn change, each within
  its ink, in as many pieces, with its advance kept.
- **The slider.** It cuts deeper as it rises, keeps the editable drawing, and comes before Outline, Inline and the
  patterns.
- **Export.** It matches the preview, with fractional points.

All 22 styles were reviewed rendered at Ink traps 100, Mainline and Hearth also at 50, and the Corners page in the
browser.

## Limits

- **Rounded crotches.** Rounded styles (Gumdrop, Cotton) whose crotches are wide curves get traps only at their
  sharp joins, such as H's and M's. A crotch rounded wider than 4% of the cap height can't be told from a bowl's curve.
- **Gentle joins.** A bowl leaving a stem as gently as Mainline's b does at its foot looks like a kink and is passed
  over, so that b is trapped only at its top join.
- **Heaviest weights.** H is passed over at the heaviest weight of Parlance, Hearth and Orbital.
- **Wedges, not thinning.** Ink traps are wedges into the corner. Unlike the legacy engine's thinning, they don't
  narrow a stroke along its length into the join.
- **Optical review.** Combined with Slice, Hand-drawn and Rough edges, they have had no optical review.
