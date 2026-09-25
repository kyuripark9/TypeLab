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

Deep links for demos: `/?style=serif&cat=shape&active=serif&inspect=R&mode=paragraph&hot=1`.
