# TypeLab

**Experiment with type.** An interactive font design playground: start from a style, reshape its
structure and personality with plain-language controls, watch every letter update live, save designs
to your library, and export a real `.otf` font.

> Don't edit numbers. Design letters.

## Run it

You need **Node.js 22.13 or newer** (the LTS installer from <https://nodejs.org> is fine).

```sh
npm install
npm run dev        # http://localhost:5173, with hot reload
```

For production:

```sh
npm run build      # builds the React app into dist/
npm start          # serves the app and the API on http://localhost:5173
```

Set `PORT` to change the port and `DB_PATH` to put the database somewhere other than `data/typelab.db`.

Other scripts: `npm test` (engine and API tests), `npm run typecheck`.

## Architecture

```
client/   React 19 + TypeScript (Vite): the editor and the design library
server/   Express 5 + TypeScript: REST API, SQLite storage, font export
shared/   used by both sides: the font engine, parameter model, UI copy
tests/    node:test suites for the engine and the API
legacy/   the original single-page vanilla JS version, kept for reference
```

One Node process serves everything. In development, Vite runs inside the Express server as
middleware, so the app and `/api` share an origin with no proxy or CORS setup.

### The font engine (`shared/engine`)

Glyphs are not font files and not CSS transforms. Each glyph is a small function that draws
**skeleton strokes** from shared metrics (cap height, x-height, stem, curve tension, aperture,
crossbar, apex…). A stroke expander turns skeletons into outlines, so *Weight* really thickens
strokes, *Contrast* thins horizontals and *Width* stretches the skeleton without distorting stems.
One slider reshapes the whole alphabet coherently.

The engine is pure math with no DOM, so **the same code** draws the live preview in the browser
and builds exported fonts on the server. A full rebuild of every glyph takes about 4 ms.

| File | Role |
| --- | --- |
| `geom.ts` | Béziers, polygon clipping, corner rounding, SVG path output |
| `stroke.ts` | Centerline → outline: pen-model contrast, terminals, joins, serifs |
| `font.ts` | Params → metrics → glyphs; personality macros; text layout; highlight layers |
| `glyphs.ts` | Parametric skeletons for A–Z, a–z, 0–9 and `.,!?;:'"()-/&@#$%+` |
| `effects.ts` | Whole-outline effects: the slice cut, and the wireframe, pixel, dot and line fills |

Beyond weight, width and contrast, the pen model also does squircle bowls (*Squareness*),
faceted octagonal curves (*Chamfer*), reverse contrast and ink-trap joints, and glyph assembly
can cut stencil gaps where one stroke joins another. The fills run last, on the glyph's final
outline, so a pixel or dot grid stays aligned across a whole line: advances and tracking snap
to the grid.

Some letters also come in named shapes: a single- or double-storey a, a hooked or mirrored g,
a k whose arm and leg meet at the arm, the stem or a short bar, i and l with a flag and foot,
square or round dots, and bowls and arches that curve out of their stems or run flat into them.
Curved stroke ends can follow the curve or turn and run straight out, level or plumb.

### Client (`client/`)

- `state/editor.ts`: a zustand store holding the open design, undo history, dirty tracking and UI state.
  Fonts are memoized per params object, so each change is built exactly once.
- `components/GlyphDefs.tsx`: each glyph is defined once as `<path id="g65">` and reused with
  `<use>` by the preview and the glyph strip. Glyphs on screen update immediately; the rest follow in
  a deferred render, so dragging stays at 60 fps.
- `pages/EditorPage.tsx` (`/` and `/d/:id`) and `pages/LibraryPage.tsx` (`/designs`).

### API (`server/`)

| Method | Path | |
| --- | --- | --- |
| `GET` | `/api/designs` | list saved designs, newest first |
| `POST` | `/api/designs` | create `{ name, styleId, params }` |
| `GET` / `PUT` / `DELETE` | `/api/designs/:id` | read, update, delete |
| `POST` | `/api/export/otf` | `{ name, params }` → OpenType font file |
| `POST` | `/api/export/svg` | `{ name, params }` → SVG specimen |
| `GET` | `/api/health` | liveness check |

Designs live in SQLite through Node's built-in `node:sqlite`, so there are no native modules to
compile. Every parameter is validated on the server (`shared/params.ts`): numbers must be 0–1 and
options must be known values.

There are no user accounts: the library belongs to whoever runs the server.

## Shortcuts

`⌘/Ctrl+Z` undo · `⇧⌘/Ctrl+Z` redo · `⌘/Ctrl+S` save · `Esc` close inspector or menu ·
`←/→` previous/next glyph · double-click a slider to reset it to the starting style's value.

In the glyph inspector, drag the letter itself: a stroke to change the weight, a crossbar, counter or
serif to reshape it, a guide line to move the x-height, cap height or extenders, and the advance box's
right edge to change the width. Like the sliders, a drag reshapes every letter, and it is one undo step.
Pointing at a part shows its grab handle and which way does what; pointing at a slider shows handles
wherever the letter can be dragged to make the same change.

To customize one letter, switch the inspector from **Sync all** to **Customize R**: sliders and
drags then reshape just that letter, which keeps its own values when the rest of the design changes (a dot
marks it in the glyph strip, and its own values are tagged *Custom*). Heights, spacing, fills and
personality are tagged *Whole font*: every letter sits on the same lines, so they stay shared.
**Re-sync R** puts the letter back in sync. Per-letter settings are saved with the design
(`params.glyphs`) and exported with the font.

Deep links for demos: `/?style=serif&cat=shape&active=serif&inspect=R&mode=paragraph&hot=1`.
