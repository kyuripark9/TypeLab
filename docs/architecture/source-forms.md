# Source letter forms

A form is a complete drawing of one letter, chosen in place of the original. It has its own weight and width masters and its own point identities. A change from a two-storey g to a one-storey g never interpolates their incompatible contours. The original letter remains the default. The legacy `aForm`, `gForm`, `iForm`, `qForm`, `rForm` and `story` values keep their meanings for generated letters.

## Published forms

Twelve forms in seven styles, from the pinned upstream fonts' stylistic sets:

| Style | Letter | Upstream | Label |
| --- | --- | --- | --- |
| Mainline | g | Roboto ss01 | Two-storey |
| Mainline | R | Roboto ss03 | Curved leg |
| Parlance | g | Open Sans `g.salt` (ss01) | One-storey |
| Parlance | I | Open Sans `I.salt` (ss01) | Bars |
| Compass | a | Poppins ss02 | Two-storey |
| Cotton | a | Nunito ss01 | One-storey |
| Cotton | l | Nunito ss02 | Plain |
| Vellum | Q | EB Garamond `Q.long` (ss06) | Long tail |
| Hearth | g | Roboto Slab ss01 | Two-storey |
| Hearth | R | Roboto Slab ss05 | Curved leg |
| Kernel | a | IBM Plex Mono ss01 | One-storey |
| Kernel | g | IBM Plex Mono ss02 | One-storey |

Labels use the legacy pickers' words. Cotton's own l already has a tail, so its alternate is the plain one.

The following were left out:

- **Jotter, Boardwalk and Serenade.** Their own letters were redrawn from Caveat, Pacifico and Great Vibes; an upstream alternate there would be another hand's. They need new drawings.
- **Near-duplicates.** Hearth a ss03 and Mainline g ss06, g ss07 and Q ss06 are too close to their originals to read as another shape at text sizes.

`tools/authored/form-recipes.ts` lists both the extracted and the published set.

## Data

Each form is an immutable `glyph-form-masters-v1` asset in `fonts/forms/<sha256>.json`:

```ts
{
  format: 'glyph-form-masters-v1',
  base: MasterSourceRef,
  width: WidthMasterRef,
  glyph: string,
  columns: [{ width, masters: [{ weight, drawing: [advance, PackedNode[][]] }] }],
  provenance: MasterProvenance[],
  notes: string[]
}
```

Columns cover every width column of the program, the neutral one included, and each column covers every base weight knot. `parseGlyphForm` checks the exact base and width references, the grid, finite drawings and point-for-point compatibility. A program names its choices inline: `forms: [{ glyph, id, label, ref }]`. The catalog therefore carries them, so the panel can list them without loading anything. Loading a form needs its program's exact weight and width packages first. The browser fetches a form only when a design picks it or the Letters page shows it; `/api/sources/:digest` serves it.

## Selection and Points

`Params.sourceForms[glyph]` holds the picked `GlyphFormRef`; an absent entry is the original. A form is drawn only where its bases are the design program's. A stale selection after a basis change draws the original. `programUpgrade` refuses a newer program that drops a form the design's program offers.

`outlines[glyph]` always holds the drawing of the form in use. Its `at.sourceForms` records the form it was drawn on. `actions.setSourceForm` makes one undo step:

- It moves the current drawing into `Params.sourceFormEdits` under `formEditKey(glyph, form)`, which is `<digest or original>:<glyph>`.
- It brings back the drawing kept for the form picked, if there is one.

Pen, carry, reset, export, the Histories and family export therefore keep working on `outlines` unchanged. `sourceFormEdits` is left out of `Drawn.at` (`DRAWN_AT_KEYS`) but kept whole in the font's History. `designSourceDependencies` loads the picked forms and the forms that saved drawings were made on.

In the evaluator (`shared/source/instance.ts`), a form stands in for the original drawing before proportions, pose, spacing and finishes. Its points carry the form's digest as their authored identity, so a Points edit moves with the form through weight and width changes by the existing edit transport. A drawing made on a form other than the one picked (a letter's History brought it back) stands as drawn. A form takes none of the original letter's dot binding, components or reviewed features: Hearth's R leg control is unavailable while its R uses Curved leg. Mono's cell includes picked forms.

Accents on a form use the original letter's mark ports, moved by how far the form's ink stands from the original's. Above and below marks follow the ink's centre and top or bottom; side and attached marks follow its right edge.

## Authoring

1. `python3 -I tools/authored/extract-alternates.py --upstream .tools/master-upstream --programs fonts/programs/manifest.json --recipes <FORM_RECIPES as JSON> --out .audit/forms/alternates.json` extracts every native weight knot and width cell, with the paired original, from the pinned fonts. Static weights between two files are mixed from compatible drawings; `--aligned Compass,Kernel` charts those drawings from their corners and extremes (source-marks.md), and `build-forms.ts --style Compass,Kernel` publishes only those families' forms from a candidate extracted for them alone.
2. `node --import tsx tools/authored/build-forms.ts` fits each published form to its style and writes `fonts/forms/` and its manifest (`--check` verifies).
   - **Across.** An affine map takes the upstream original's ink to the style's own original in each cell; the alternate is moved the same way, and its advance is the style's original plus the upstream difference.
   - **Up.** Heights go through the foot, baseline, x-height or cap height, and an ascender's top. Extra length (Cotton's taller l) goes into the middle of the stretch, where a stem runs straight.
   - **Contours** turn the way the style's do.
   - **Local widths.** A width the upstream font lacks is drawn by the family's local width field applied to the alternate's own ink and space (`tools/authored/local-width-masters.ts`), as far as the paired original letter widens there. This covers Mainline and Parlance at 125 and 150, and every column of the local-width families.
   - **Cuts.** One set of exact cuts keeps all cells compatible.
   - **Precision.** Coordinates are kept to a thousandth of a unit; the twelve forms take 1.6 MB.
3. `node --import tsx tools/authored/build-programs.ts --forms fonts/forms/manifest.json` adds the forms to each style's newest program; `build-previews.ts` then regenerates the previews.

## Validation

[tests/source-forms.test.ts](../../tests/source-forms.test.ts) checks:

- Every form on its grid. At the design's own settings, the letter equals the form's neutral drawing.
- The x-height (or top) and foot at weight and width extremes and their mixes, and other letters unchanged.
- A Points edit riding through a weight change, and the original and form drawings swapped and restored in the editor, each pick one undo step.
- A drawing from another form standing as drawn.
- Saved settings: reading, refusal and older settings without the keys.
- Dependencies, accents placed clear of the form's ink, OTF export, and the Letters page and capability gates.

All twelve forms were reviewed rendered at Lightest, Original and Heaviest, at the narrowest and widest widths, and in the browser's Letters page at desktop and phone sizes.

Optical review of the local widths at the extremes is deferred, as for the base letters. So is a form's own mark ports, which would replace the moved original ports.
