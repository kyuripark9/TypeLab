# Ambient weight drawings

Ballyhoo, Timber, Serenade, Boardwalk, and Cathedral each originate from a font with one authored weight. Their new 300 and 500 masters are local variations around the existing 400 drawing. Those numbers identify the local range. They do not claim that upstream authors designed these weights.

The generator moves the entire plane around a glyph. Every contour uses the same map, so overlapping components move together. The map comes from a blurred image of the glyph's filled ink. A regularized gradient gives a bounded velocity, which the generator integrates to make lighter and heavier endpoints.

Each glyph uses a regular triangular grid with a 48-unit spacing. The generator splits the original cubic curves exactly where they cross grid edges. Within each triangle, a single affine map transforms all curve controls. This preserves each curve under the piecewise affine map and gives every master identical point correspondence. It avoids moving a long handle independently across several different deformations.

Slash and backslash use a positive affine stretch across the long stroke direction. Their endpoint widths are 80 and 120 percent of the source. This keeps their diagonal sides smooth while they change weight.

For each triangle, the determinant during interpolation is a quadratic in the interpolation amount. The generator checks both endpoints and any interior minimum. It rejects a determinant below 0.05. The map is fixed outside the glyph's padded bounds, apart from the final positive vertical scale and translation. Positive triangles therefore keep the plane from folding through the entire continuous range. The final coordinates are rounded to 0.00001 font unit.

The generator also compares the filled component and counter counts at eight intermediate weights per glyph. Those checks use the same nonzero fill interpretation as the application. The neutral drawing preserves the source curves through exact subdivision, followed by the same coordinate rounding. The displayed endpoints preserve the original vertical extent and left ink edge. Advance width follows the change in ink width.

These constraints preserve geometry, but they do not prove typographic quality. The ranges remain narrow and each package has a full-character specimen for visual review. A new range requires new specimens and geometry checks.

Cathedral's original has 125 characters. Its new minus copies the lower equals bar and moves it up 108 units. Divide adds two copies of the lower colon dot, scaled to 55 percent, with centers at `(211, 207)` and `(211, 467)`. Both use the equals advance. The original backslash slopes in the same direction as the slash and extends far outside its advance. The new backslash mirrors the slash within its 585-unit advance. These repairs belong to the new master package.

Bulwark uses its existing authored weights instead of the ambient method. Its generator inserts collapsed segments and explicit cubic controls where the original point representations differ. It repairs the collapsing inner notches in the 600 and 700 guillemets and separates the double guillemets. The unchanged advance contains two 190-unit chevrons with a 24-unit gap. The package excludes 800 and 900 because their original registered symbol loses a counter and other glyphs develop extra counters.

The downloader records the original family, pinned Google Fonts revision, source URL, and SHA-256 digest. Each generated ambient package carries the original copyright and full license text. Roboto Slab uses Apache 2.0. The other downloaded families in this inventory use their included SIL Open Font License text.

The published weights no longer use these mesh drawings. Cutting at triangle edges kept each curve exact under its piece's map, but neighbouring pieces moved by different maps, so every cut became a small kink and straight edges zigzagged. A later repair of each family's newest base moves the default drawing's points by the same field directly, with each point's handles moved by the field's linear map there, keeps straight edges straight and moves short corners whole (`tools/masters/smooth-masters.ts`, [weight masters](../../docs/architecture/weight-masters.md#smoothed-local-variants)). The original packages stay published for saved designs.
