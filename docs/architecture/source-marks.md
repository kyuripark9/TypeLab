# Source accents

Source accents use a separate `source-marks-v1` asset. The asset pins the exact weight basis, width grid, and component bindings. It does not add contours to those base assets or overwrite an original sheet.

The compiler covers the existing 134-character `ACCENTED` inventory, including 53 Latin-1 characters and dotless `ı`. It uses each style's pinned upstream font where that font supplies the mark. Missing marks are local drawings made from that same style's punctuation. These local drawings have explicit provenance and need optical review; they are not upstream instances.

## Composition contract

Each recipe names its base letter, any components to omit, and an optional mark. Dotless `ı` uses `i` with its declared `tittle` component omitted. The same omission applies to `ì í î ï ī`. An accented character shares the base letter's parameters and saved Points. The initial editing action opens that base letter; it does not freeze a composed outline into a second independent copy.

A mark has an explicit attachment port. The port is a convex combination of declared `{contour, segment, t}` positions on the pinned base. Every weight and width cell stores compatible mark contours in coordinates relative to that port, plus an optional advance increase for side marks. Gaps and overlap are part of the drawing. Runtime does not search for stems, dots, tops, feet, or nearby contours.

The base follows the ordinary saved-edit, weight, width, height, and component pipeline. The mark is then placed at the port on that shaped, edited base. Its local dimensions remain authored rather than stretching with x-height. The complete composite receives pose, Mono spacing, and the selected finish once. A saved Mono frame must be unspaced before resolving an edited port. If an edit removes the port's provenance, the declared nominal port supplies its position.

The four attachment labels distinguish above marks, detached marks below, attached cedillas or ogoneks, and side carons. Attached marks use the base ink's winding and an authored overlap. A user can still edit the base away from a connection; arbitrary edits do not carry an automatic join guarantee.

## Runtime

A program pins its marks as `marks: {kind: 'source-marks-v1', digest, fontId}`, beside its width masters and components, which the marks require. The marks are not one of the program's loading dependencies: the browser never fetches them. The server registers them on demand (`loadSourceMarks` in `server/sources.ts`) when an export asks for accented letters, after checking that they name the program's exact base, width, and component assets.

`Font.accent(ch)` composes an accented character. The base letter comes from `font.letter(base)`, so it carries the letter's own settings and saved Points exactly as `font.glyph(base)` draws it. The mark for the current weight and width is posed with the letter's matrix about its port. The composite then receives the font's Mono spacing and finish, like any glyph. `accentGlyph` in `shared/engine/accents.ts` hands a source's accents to `Font.accent`, so the specimen, single font, and family exports share one path. Exported accents take the precise finish of their letter.

The Export window shows the accented-letters switch for any program that pins marks. Older program revisions keep their saved interpretation: they have no marks, the switch stays hidden, and the API refuses `accents: true` for them.

## Source coverage

None of the 22 bundled sheets contains the accented inventory. Twenty-one styles have pinned upstream fonts; all 21 contain all 53 Latin-1 accented characters.

| Upstream coverage | Styles |
| --- | --- |
| All 134 characters | Mainline, Parlance, Couture, Hearth, Vellum, Almanac, Compass, Dispatch, Kernel, Orbital, Sonnet, Cotton, Jotter, Turnpike, Ballyhoo, Boardwalk, Serenade, Timber |
| 105 characters | Funnies |
| 59 characters | Gumdrop |
| 58 characters | Cathedral |
| No upstream font | Bulwark |

Upstream coverage does not imply that a mark is already a separate contour. Many cedillas and ogoneks are fused into their letter. The compiler records whether it used a composite component, a detached outline, or a standalone upstream mark aligned to an attached drawing. If no usable mark exists, it uses an explicit local construction.

Variable fonts supply their real weight instances. Static font weights bracket intermediate requested weights. The compiler places exact common subdivisions on compatible contours before interpolation. Single-weight families retain their upstream mark shape across weight, with placement following the changing base. The asset labels those marks `fixed`.

Native width is read only inside the original font's width domain. Other width columns keep the mark's optical dimensions and move its position with the authored base. Local fallback drawings use the style's grave, caret, tilde, degree sign, period, hyphen, parenthesis, comma, or apostrophe. The resulting curves and ports are stored in the asset, so none of those construction choices run in the application.

## Reconstruction

`tools/authored/mark-bases.json` pins every base, width, and component dependency. `tools/authored/mark-recipes.json` contains the character-to-base inventory and local construction policy. `tools/masters/upstream.json` pins the upstream files and their SHA-256 digests. Download those files with the existing upstream fetch tool, or provide its already populated cache.

```sh
python3 tools/authored/extract-marks.py \
  --input tools/authored/mark-bases.json \
  --upstream-dir .tools/master-upstream \
  --out .audit/marks

node --max-old-space-size=512 --import tsx tools/authored/build-marks.ts \
  --input .audit/marks --out fonts/marks
```

The extractor accepts `--style Mainline` or a comma-separated subset. It writes one candidate and one extraction-evidence file per family. The publisher parses each candidate, checks exact dependencies, all weight and width knots, port indices, omitted component IDs, and compatible contour and handle layouts. It validates every selected candidate before writing. Existing content-addressed files are never replaced. The manifest records each byte hash, coverage, locally drawn marks, and fixed-weight marks.

Use the same publisher command with `--check` to verify that the current candidates reproduce the published assets. Program linkage and neutral preview-font generation happen after publication, through the common program and preview tools.

## Corrections from the first review

Rendering all 134 characters in the 22 styles found three extraction faults, now fixed in the extractor:

- **Cathedral's accented i.** UnifrakturMaguntia has no dotless `ı`, so the extractor measured its dotted `i` and aligned TypeLab's dotless stem with the top of the upstream dot. That sank í, ì, î, and ï about 170 units into the stem, where they read as t and r. Without a dotless `i`, the upstream body now leaves out contours standing wholly above 90% of its x-height.
- **Bulwark's acute and grave.** The block letters' grave is a rounded lozenge, the same shape when turned about, so the local acute and grave could not be told apart, and the double acute looked like a dieresis. Where a style's grave runs no longer one way than across, the local acute, grave, and double acute are its apostrophe leaned right or left.

- **Gumdrop's ĺ.** Fredoka has no precomposed `ĺ`, and the first mark lookup covering `l` and the combining acute holds an anchor halfway down the stem. The acute hung off the stem and the letter read as a t. A GPOS anchor that would set an above mark into its letter's ink is no longer used; the authored port placement applies instead.

Fredoka's I accents are wider than its I and overhang neighbouring capitals. The upstream design does the same, so Gumdrop keeps it.

## Validation status

`tests/source-accents.test.ts` composes every character in every current program. It checks finite output, the advance, the letter kept point for point, each mark's position (above, below, or beside), and the dotless `i` removing only the tittle. It also checks that Points edits, per-letter weight, x-height, weight and width extremes, slant, mirroring, and rotation carry through, that Mono and the finishes apply, and that export includes accents only on request for programs with marks. Compatible endpoint curves alone still do not prove intermediate topology, optical quality, adjacent-letter clearance, or arbitrary edited-port behavior.

The next visual gate should include all characters at neutral, weight and width endpoints, then mixed height/width cases. Enlarged specimens must include `Å å ï Ľ ď Ç ç Ą ą ģ` and Bulwark's locally drawn marks. Runtime validation must cover edited, split, reversed, and deleted attachment spans; shared base edits; dotless suppression; non-neutral spacing and pose; save/reopen; and the same composition in preview, specimen SVG, and exported fonts.
