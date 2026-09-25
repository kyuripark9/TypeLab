# TypeLab

**Experiment with type.** An interactive font design playground: start from a style, reshape its
structure and personality with plain-language controls, watch every letter update live, and export
a real `.otf` font.

> Don't edit numbers. Design letters.

## Run it

No build step and no dependencies — open `index.html` in a browser (Chrome, Safari, Firefox, Edge).

If you prefer a local server: `python3 -m http.server` and visit <http://localhost:8000>.

## What's inside

| File | Role |
| --- | --- |
| `js/geom.js` | Béziers, polygon clipping, corner rounding, SVG path output |
| `js/stroke.js` | Stroke expander: centerline → outline with contrast (pen model), terminals, miter joins, serifs |
| `js/engine.js` | Parameters → metrics → glyphs; personality macros; text layout; highlight layers |
| `js/glyphs.js` | Parametric skeletons for A–Z, a–z, 0–9 and `.,!?;:'"()-/&@#$%+` |
| `js/config.js` | Starting styles, categories, friendly/technical copy for each control, anatomy glossary |
| `js/diagram.js` | Live explainer diagrams and option icons, drawn with the real engine |
| `js/app.js` | UI: navigation, preview, control panel, glyph inspector, undo/redo, save |
| `js/export.js` | `.otf` (via bundled `vendor/opentype.min.js`), SVG specimen, JSON settings |

### How rendering works

Glyphs are not font files and not CSS transforms. Each glyph is a small function that draws
**skeleton strokes** from shared metrics (cap height, x-height, stem, curve tension, aperture,
crossbar height, apex…). The stroke expander turns skeletons into outlines, so *Weight* really
thickens strokes, *Contrast* thins horizontals, *Width* stretches the skeleton without distorting
stems, and one slider reshapes the whole alphabet coherently.

`slider → state.params → TL.buildFont() → SVG paths` runs entirely in the browser. A full rebuild
of all glyphs takes ~10 ms, so there are no spinners and no server.

### Handy URLs

`index.html?style=serif&cat=shape&active=serif&inspect=R&mode=paragraph` — deep links for demos:
`style`, `cat`, `active`, `inspect`, `mode`, `hot=1` (show highlights).

## Shortcuts

`⌘/Ctrl+Z` undo · `⇧⌘/Ctrl+Z` redo · `⌘/Ctrl+S` save · `Esc` close inspector · `←/→` previous/next glyph ·
double-click a slider to reset it to the starting style's value.
