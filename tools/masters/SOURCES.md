# Rebuild the source-derived masters

Run these commands from the repository root. Run one authoring process at a time.

1. Download the pinned original fonts and licenses.

   ```sh
   python3 tools/masters/fetch-upstream.py
   ```

   The downloader checks each file against `upstream.json`. It rejects a mismatched file instead of replacing it. Use `--check` to verify an existing download without network access.

2. Build the five families whose originals supply one weight.

   ```sh
   node --max-old-space-size=512 --import tsx tools/masters/author-ambient.mjs
   ```

   To rebuild one family, append `Ballyhoo`, `Timber`, `Serenade`, `Boardwalk`, or `Cathedral`. Set `TYPELAB_MASTER_UPSTREAM` to use a different download directory.

   The script writes packages, geometry reports, and full-character specimens under `.audit/masters/sources/single`. It stops if a geometry check fails.

3. Build Bulwark from its existing authored weights.

   ```sh
   node --max-old-space-size=512 --import tsx tools/masters/author-bulwark.mjs
   ```

   This script writes its package, report, and specimens under `.audit/masters/sources`. The package includes weights 100 through 700. The report checks every glyph at weight increments of 25.

4. Check the serialized packages with the runtime parser and interpolator.

   ```sh
   node --max-old-space-size=512 --import tsx tools/masters/verify-authored.mjs .audit/masters/sources/single/*-masters.json .audit/masters/sources/Bulwark-masters.json
   ```

   The report includes topology failures, package sizes, and interpolation timings. A topology failure sets a nonzero exit status.

5. Inspect each PNG or SVG specimen before publishing the corresponding package. Check the uppercase and lowercase alphabets, numbers, and punctuation at every displayed weight.

6. Pass the accepted JSON packages to the repository's master packer. Keep the historical files in `fonts/` unchanged.

7. Check the published catalog through the production loader, evaluator, and exporter.

   ```sh
   node --max-old-space-size=512 --import tsx tools/masters/verify-catalog.mjs
   ```

   This check combines weight and height extremes, verifies separated dots, and measures edits on dense glyphs. The report keeps existing microscopic source components separate from geometry failures.

See [the ambient deformation design](ambient-design.md) for the geometry checks and the limits of the new weight ranges.
