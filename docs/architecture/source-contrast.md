# Source contrast

Contrast on the Weight page changes how much a source style's thick and thin strokes differ, using only the style's own weights. A weight master family is point compatible, so a letter can take its points' widths from one weight and their heights from another. Type designers use this to draw contrast masters. Upright strokes get their thickness across, from the widths; level strokes get theirs up and down, from the heights.

- **Higher.** The heights come from a lighter weight, so the crossbars, arms, serifs and the tops and feet of bowls thin while the stems stay.
- **Reversed.** The heights come from a heavier weight, so the level strokes thicken toward and past the stems.

The widths stay the weight's own, and so does the spacing, since advances come with the widths. Every point keeps its identity, so Points edits ride Contrast as they ride Weight, and nothing is drawn outside the authored weights.

## Policy

Every current program carries `contrast: { format: 'source-contrast-v1', reach: 0.33 }`, published from `tools/authored/source-contrast.json` with `build-programs.ts --contrast`. `contrastWeights` (`shared/source/contrast.ts`) turns the slider into the two weights:

- At the style's own Contrast (`freeAt.contrast`), both are the weight in use.
- At either end, the widths and heights are `reach` of the style's weight range apart. Within the slider the distance is in proportion.
- **Room.** The heights move first, as far as the range allows: lighter for Higher, heavier for Reversed. Where the weight in use is too near that end of the range, the widths go the other way by the rest. Contrast at the lightest weight therefore thickens the stems, and Reversed at the heaviest thins them. The slider changes the letters all the way along at any weight.
- **Limit.** `reach` keeps the two weights near enough to mix. Heights from the lightest weight on a heaviest weight's widths opened Parlance's d, h and q bowls at their stems and kinked Compass's s. Half the range (the first programs' reach) broke nothing, but at its ends it read as a different, cruder font: at Superellipse's Light 300 with Contrast at Reversed, heights from 500 thickened every bar, bowl top and tail end (the y's and g's to blobs) over hairline stems, and with all four Weight-page sliders at their left ends it was taken for broken letters (2026-11-04). A third of the range draws the same kind of contrast, milder at the ends.
- **Stacked.** Verticals and Horizontals move the same two weights, and the three sliders add up: the first programs let them stand the whole range apart, where Parlance's bowls tore at their stems. Programs with `source-strokes-v2` hold them no more than `apart` (a third of the range) apart however they stack: past it, both weights are drawn back toward the weight in use by the same share (`heldApart`), so neither moves the other way from the Weight slider; past that, a slider pushing further only shifts the two about the weight in use, never further apart.

`variedFont` evaluates the weight and width masters, and the reviewed features, at both weights and mixes them with `mixAxes`. Alternate forms (`formDrawing`) and accent marks (`composedAccent`) use `mixDrawn` the same way. The cap height and x-height come from the heights' weight.

`sourceStyleParams` keeps the style's preset Contrast as its own. `adoptProgram` starts a design adopting its first contrast policy at that value, because a Contrast saved before then drew nothing. `programUpgrade` refuses a program without the policy or with a further reach. A design taking up a milder reach keeps the weights its Contrast, Verticals and Horizontals drew (`rescaled`: each slider's distance from the style's own grows by the old reach over the new), as far as the new reach goes; past it, and where stacked sliders stood further apart than the new program holds them, they draw as far as it allows. Saved designs keep their program, and so the first reach, until they take up the newer one ("Update style capabilities"). On the Adjust tab a source offers Reversed, Lower (half way down), Original and Higher (half way up). A family's members keep the design's Contrast about their own weight.

## Validation

[tests/source-contrast.test.ts](../../tests/source-contrast.test.ts) checks:

- **Policy and Original.** Every program has the policy, and the style's own Contrast draws exactly what the program before it drew.
- **The weights.** `contrastWeights` moves by its rules and keeps changing all the way along.
- **Widths and spacing.** Higher keeps Mainline's widths and advances point for point, and its H's crossbar thins (to 0.65); Reversed thickens it.
- **Whole letters.** In all 22 styles, at both ends of Contrast and the ends of Weight and Width, letters keep their contours and point counts with finite coordinates.
- **Edits, forms and marks.** A Points edit carries to Higher and back exactly, and forms and marks take both weights.
- **Gates and adoption.** The gates, adoption from the program before contrast, and adoption from the half-range reach keeping Mainline's letters as they were (a Contrast, a letter's own Contrast, Verticals, Horizontals), a Contrast past the milder reach taken to its end.
- **Adjust and families.** The Adjust choices, and a family member.

All 22 styles were reviewed rendered at Reversed, Original and High. Couture, Sonnet, Ballyhoo, Compass and Parlance were also reviewed at the weight extremes.

Every letter of every style was then checked for ink pieces and counters, on a raster, against its own at each end of Contrast, Weight and Width. What remained were differences of a pinhole or two that the masters themselves draw at extremes, and nothing visible. The check is `tools/authored/review-contrast.ts`. Couture's and Sonnet's hairlines are too fine for it even at `--res 480`, so they were reviewed by eye.

## Limits

- **Reversed range.** Reversed reaches only as far as the heaviest weight's horizontals. Styles whose heaviest horizontals are still thinner than the stems in use get lower contrast, not reversed.
- **Verticals and Horizontals.** These move the same two weights ([source shapes](source-shapes.md)). At the lightest or heaviest weight a slider's Lighter or Heavier end has no lighter or heavier drawing to take: there it moves the other weight the other way, so it keeps changing the letters, relatively lighter or heavier rather than lighter or heavier.
- **Heights.** The heights' weight brings its own vertical proportions, which are usually the same.
- **Optical review.** Mixed with Width extremes and per-letter Contrast, Contrast has had no optical review.
