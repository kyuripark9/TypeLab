# Source stencil

Stencil on the Effects page cuts a source style's letters apart where their strokes join, as if cut from a sheet, and
opens every counter so nothing would float loose in the plate. Gap width is the Stencil slider. Position slides each
join's gap out along its stroke. Rounding rounds the corners the cuts make.

It is a finish, like Slice: it changes only the finished ink. Points keeps the clean editable drawing, and the cuts
follow every edit, weight, width and setting, because they are found on the letter as it stands.

## Policy

Every current program's finish policy (`source-finish-v1`) carries it, published from
`tools/authored/source-finishes.json` with `build-programs.ts --finish`:

```ts
stencil: { format: 'source-stencil-v1', gap: 0.15, offset: 1.5, point: 120, span: 2, serif: 0.25,
           turn: [20, 60], reach: [0.01, 0.04], run: 1.5, apart: 0.9, tolerance: 0.1 }
```

- **`gap`.** The gap's width at Stencil 100, as a share of the cap height.
- **`offset`.** How far Position 100 slides a join's gap along its stroke, as a multiple of the stroke's thickness.
- **`point`.** The least turn, in degrees, of a corner where two strokes come to a point; that corner is cut down the point.
- **`span`.** How far a cut may run to cross its stroke, as a multiple of the join's depth.
- **`serif`.** The longest stroke, as a share of the cap height, that ends where its host ends and still counts as a serif.
- **`turn`, `reach`, `run`, `apart`.** What counts as a join, as for [ink traps](source-traps.md).

A style starts at none, and so does a design adopting the first program with Stencil: a value saved before drew nothing
on a source. The Adjust tab's Cuts choice Stencil sets 15. Export writes stencilled letters with fractional coordinates.

## Construction

`stencilSourceInk` (`shared/source/stencil.ts`) works on the filled ink after ink traps and before the texture, Slice
and the fills. It finds joins with ink traps' finder (`shared/source/joins.ts`). There, a corner drawn as a few sharp
turns close together, such as Bulwark's chamfers, counts as one.

1. **A stroke running into another.** The stroke is cut across, parallel to its host's edge, so a gap beside a stem
   stands upright and one beside a bar lies level.
   - **The host:** the thicker stroke, or, when they are as thick, the more upright.
   - **Position:** the gap sits beside the host at Position 0. Position slides it out along the joining stroke by up to
     1.5 times the stroke's thickness.
2. **Two strokes coming to a point.** v, w, y, the inside of M and A's top are cut down the point's bisector. Such a
   corner turns 120° or more, and neither stroke is 1.3 times as thick as the other.
3. **Serifs and stubs are left.** A stroke ending where its host ends counts as a serif if it is shorter than a quarter
   of the cap height, or if it stands out on both sides of the host (another corner faces it across the host).
   - **Cut:** E's top arm runs on, one-sided, so it is cut; so is L's foot.
   - **Left:** T's bar stands out both sides, so T keeps its stem; so do Dispatch's long foot serifs.
   - **Stubs:** a corner where either stroke runs under 15% of the cap height is left alone.
4. **Square to the page.** Every cut runs upright or level, whichever is nearer its own direction, and keeps its own
   direction only where a straight cut can't cross the stroke within its span.
5. **Counters opened.** A counter still closed after the joins' cuts (O, o, 0, and Gumdrop's rounded joins) is cut at its
   two shortest straight crossings. The second is at least 120° round the counter from the first. Level cuts across the
   top or foot are liked a little better, as are cuts across the middle of a flat side. This repeats up to three times.
6. **Clean-up.** A speck of ink smaller than 3% of the cap height square, left between two cuts, goes.
7. **Rounding.** Near the cuts the ink is opened (shrunk, then grown back) by up to half the gap, which rounds only the
   corners the cuts made.

Stencil costs 2–4 ms a letter.

## Validation

[tests/source-stencil.test.ts](../../tests/source-stencil.test.ts) checks:

- **An H.** The bar is cut from both stems, the gaps upright beside them, in three pieces.
- **Position and Rounding.** Position slides the gap out, and Rounding takes the cut corners' ink.
- **Counters and points.** A box ring is opened at its top and foot into two pieces, and a V is cut down its point.
- **Left alone.** A stem with two-sided slab serifs, a plain stroke and an empty drawing come back as they were.
- **Programs and defaults.** Every current program pins the policy and the one before doesn't offer it, its letters
  uncut. A style starts at none, and adoption starts at none with the letters as they were.
- **Every style.** In all 22, at the lightest and heaviest weights, every counter of `ABDOPRabdeopq08` is opened, within
  the ink, with each advance kept.
- **Order.** The editable drawing is kept, the fills draw the cut ink, and the cuts are found on trapped ink.
- **Export.** It matches the preview, with fractional points.

All 22 styles were reviewed rendered at Stencil 30; Mainline and Hearth also at Position 100, Rounding 100 and Stencil
100; Dispatch, Timber and Bulwark close up.

## Limits

- **Long beak serifs.** Dispatch's long beak serifs at the ends of E's arms and T's bar are cut from their bars.
- **Joined script.** Jotter, Boardwalk and Serenade come apart at many of their crossings.
- **Rounded joins.** Styles whose joins are wide curves (Gumdrop, Timber's n) are cut only where a counter needs opening.
- **Slanted styles.** In the slanted styles a cut is square to the page, not to the slant.
- **Optical review.** Combined with Slice, Hand-drawn and Rough edges, Stencil has had no optical review.
