# Source Inline and Wire

The Fill control's Inline and Wireframe choices on the source styles. They complete the Fill control's options: every
current program now offers all twelve fills.

- **Inline** cuts a line down the middle of every stroke. It runs on through joins and stops short of stroke ends and
  corners. A rim of ink stays either side, and hairlines and dots stay whole.
- **Wireframe** draws each of the letter's drawn contours as a thin ring. Where two contours overlap, both rings show,
  like a letter's construction lines.

Both are finishes: they change only the finished ink. Points keeps the clean editable drawing, edits show through
them, and they work at every weight, width and setting, because they are drawn from the letter as it stands.

## Policy

Every current program's finish policy (`source-finish-v1`) carries both, published from
`tools/authored/source-finishes.json` with `build-programs.ts --finish`:

```ts
inline: { format: 'source-inline-v1', width: [0.12, 0.45], angle: [95, 150], rim: 0.006, tolerance: 0.1 }
wire:   { format: 'source-wire-v1',   line: [0.006, 0.04], tolerance: 0.1 }
```

- **`width`.** The inline's width as a share of the stroke it runs down, at Size 0 and 100.
- **`angle`.** The two pruning angles, below.
- **`rim`.** The least ink kept either side of the line, and the finest line cut, as shares of the cap height.
- **`line`.** The ring's width as a share of the cap height, at Size 0 and 100.

`sourceFinishFills` offers them where the policy has them. `sourceFinishExtends` keeps them in every later program.
The program before them doesn't offer them, and the editor refuses them there as it does any unoffered fill. Export
writes both with fractional coordinates (`sourceFinishPrecision`), as it does Outline and the patterns.

## Construction

`inlineSourceInk` (`shared/source/inline.ts`) works on the letter's filled ink, its contours flattened within the
tolerance and united. A source has no skeleton, so the middle of the strokes comes from the ink itself.

1. **Circles.** From points along every edge, a circle is grown inside the ink touching the edge there, until it
   touches the edge again (a shrinking-ball medial axis). Its centre is a point of the stroke's middle, and its radius
   half the stroke's thickness. At each inside corner of a join, the circle's direction sweeps round the corner, which
   carries the middle of one stroke into the next.
2. **Pruning.** At a circle's centre, the angle between its two touch points tells a stroke from a corner. Across a
   stroke it is 180°, in a join above 120°, and at a corner 180° less the corner's own angle: a right angle's 90°, the
   sharp corner of a diagonal cut level 135°.
   - Circles under 95° are left out, except those swept round a join's inside corner. A thin bar running into a thick
     stem touches only the bar's own two corners.
   - A line's ends are then trimmed of circles under 150° that shrink as they go, which are a corner's, not a join's.
   - A circle whose line would be finer than half the rim, or leave less than the rim either side, is left out. So
     hairlines stay whole.
3. **Lines.** Neighbouring centres along an edge make a line, which runs on round the contour's start. Through a join,
   where the circles swell, the line keeps the width of the strokes either side. Each line is thinned to the centres
   it needs and drawn as the hull of circles of the Size's share of each radius. Lines shorter than their own width,
   such as a dot's, are dropped.
4. **The cut.** The lines are united, kept within the ink less its rim, and cut from the ink.

`wireSourceInk` offsets each drawn contour by half the line either side (Clipper's joined ends) and unites the rings.

Inline costs about 10–20 ms a letter, about as much as Outline.

## Validation

[tests/source-inline.test.ts](../../tests/source-inline.test.ts) checks:

- **A stem.** One line down the middle, short of the stem's ends, at the Size's share of its width, the rim kept.
- **Joins.** A thin bar running into a thick stem makes one line, in either winding, and a stroke cut level across a
  diagonal keeps ink in its sharp corner.
- **Kept whole.** Hairlines, dots and tiny drawings.
- **Wire.** Rings round every contour, crossings included.
- **Programs.** Every current program pins both. The one before doesn't offer them, and solid letters are unchanged.
- **Every style.** In all 22, at Size 0 with the lightest weight and Size 100 with the heaviest, letters are finite
  with their advances kept. Every cut lies in the ink with the rim round it, and most letters get a line.
- **Points.** Wire in every style keeps the editable drawing, and a Points edit moves the inline with it.
- **Adjust, errors and export.** Inline and Wireframe on the Adjust tab, their error messages, and export matching
  the preview to 0.01 units.

All 22 styles were reviewed rendered at Size 50, and Mainline, Couture, Cotton and Serenade at the lightest weight
with Size 0 and 100. Mainline, Ballyhoo and Cathedral were also reviewed at the heaviest weight with Size 100.

## Limits

- **Serifs.** Thick enough serifs carry the line along themselves too, as their shape's middle does. At the heaviest
  weights with Size 100, Ballyhoo's and Cathedral's lines are busy.
- **Steps at joins.** The line's width follows each stroke, so where a thin stroke joins a thick one the line steps
  or flares.
- **Proportional width.** Unlike the legacy inline, the line is a share of each stroke rather than one width, so a
  high-contrast style's thinner strokes carry thinner lines.
- **Optical review.** Inline and Wire combined with the other effects (Slice, Hand-drawn, Rough edges) have had no
  optical review.
