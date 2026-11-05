# Authored source tools

Generate immutable source snapshots and the shared source catalog:

```sh
node --import tsx tools/authored/build-sources.ts
node --import tsx tools/authored/build-sources.ts --check
```

The generator copies each `fonts/*.json` file byte for byte to `fonts/sources/<sha256>.json`. It records current font IDs and all previous revisions in `fonts/sources/manifest.json`, then generates `shared/source/catalog.ts`. Run it after deliberately changing a bundled source font. Existing snapshots and revision entries stay available so saved designs can keep using their original source.

`--check` writes nothing and exits 1 if a snapshot, manifest, or catalog needs updating. Both modes reject changes to an existing immutable snapshot. A missing historical snapshot must be restored from version control.

Audit the original geometry and coverage:

```sh
node --import tsx tools/authored/source-audit.ts --out .tools/out/source-audit.json
node --import tsx tools/authored/source-audit.ts fonts/Mainline-600.json fonts/Hearth-600.json fonts/Couture-600.json --out .tools/out/initial-sources.json
```

The audit records exact file hashes and each glyph's geometry hash, contour node counts, handle counts, and structure hash. The structure hash records contour boundaries and handle presence. It does not establish whether the filled outline has a closed counter or connected joins.

Malformed coordinates or partial handles fail validation. Missing required characters produce a report and exit 1. The three initial sources each contain all 127 required characters. The full library currently has four missing characters: Cathedral:400 lacks `−` and `÷`; Funnies:400 lacks `†` and `‡`.

Render the three initial sources and their height edits:

```sh
NODE_OPTIONS=--max-old-space-size=512 node --import tsx tools/authored/review.ts --out .tools/out/authored-review
```

Each source gets a full 127-character specimen and a seven-row height comparison, as SVG and PNG. Every row uses the same scale. SVGs include row labels; the JSON manifest lists the row order for the PNGs. The tool reads pinned source snapshots through the server loader and draws the same compiled glyphs used by preview and export. Review the images before accepting geometry changes.

Publish a combined capability revision after generating its assets:

```sh
node --max-old-space-size=512 --import tsx tools/authored/build-programs.ts \
  --components fonts/components/manifest.json \
  --finish tools/authored/source-finishes.json \
  --spacing tools/authored/source-spacing.json
node --max-old-space-size=384 --import tsx tools/authored/build-previews.ts
```

Alternate letter forms (docs/architecture/source-forms.md): extract `.audit/forms/alternates.json` with `extract-alternates.py --programs fonts/programs/manifest.json --recipes <recipes.json>`, publish with `node --import tsx tools/authored/build-forms.ts` (`--check` verifies), then add them with `build-programs.ts --forms fonts/forms/manifest.json`.

Contrast (docs/architecture/source-contrast.md): `build-programs.ts --contrast tools/authored/source-contrast.json` pins the policy in every style's newest program; `node --import tsx tools/authored/review-contrast.ts [ids] [--res 480]` checks every letter's ink pieces and holes at Contrast's ends.

Inline and Wireframe (docs/architecture/source-inline.md), Ink traps (docs/architecture/source-traps.md) Stencil (docs/architecture/source-stencil.md) the shape controls and stroke ends (docs/architecture/source-shapes.md) and a serif style's own serifs (docs/architecture/source-serifs.md) are the `inline`, `wire`, `traps`, `stencil`, `shapes`, `ends`, `insides`, `serifs` and `pinch` entries of `tools/authored/source-finishes.json`, published with the rest of the finish by `build-programs.ts --finish`. Its `overrides` change the finish for one family by name, a policy set to `null` being left out of that family's programs (Cathedral's `serifs`). Verticals and Horizontals are `build-programs.ts --strokes tools/authored/source-strokes.json`.

Round and square dots (docs/architecture/source-dots.md): measure with `node --import tsx tools/authored/build-dots.ts` (`--report` prints the measures, `--check` verifies `fonts/dots/manifest.json`), then add them with `build-programs.ts --dots fonts/dots/manifest.json`.

Repaired weights (Compass and Kernel, docs/architecture/weight-masters.md): rebuild the package with `sample-masters.ts ... --aligned` (`rebuild-masters.py Compass Kernel`), carry it onto the published basis with `node --import tsx tools/authored/repair-weight-masters.ts <Family> <package.json> <out>`, and publish in the order master-basis-revisions.md gives; marks and forms take `--aligned <families>`.

Additional `--features <asset.json>` arguments can join the same run. Changes are composed in argument order and only the final program for each family is published. Component selection requires the exact current weight and width bases. Historical program files remain immutable. `--check` validates the same result without writing; it is a separate verification step.
