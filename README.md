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
On a host that ends HTTPS in a proxy in front of the app (most do), set `TRUST_PROXY=1` so sign-in
cookies are marked Secure and wrong-password limits count each visitor rather than the proxy.
Every environment variable the server and the tools read is listed in `tools/README.md`.

### Sign in with Google (optional)

The sign-in dialog offers **Continue with Google** once the server has Google OAuth keys:

1. In the [Google Cloud console](https://console.cloud.google.com/apis/credentials), create an
   **OAuth client ID** of type *Web application* (set up the consent screen first if asked; the
   scopes needed are `openid`, `email` and `profile`).
2. Under *Authorized redirect URIs* add `http://localhost:5173/api/auth/google/callback`, and the
   same path on your real address when you deploy (e.g. `https://typelab.example.com/api/auth/google/callback`).
3. Put the keys in a `.env` file at the project root (it's git-ignored), then restart the server:

   ```sh
   GOOGLE_CLIENT_ID=1234-abc.apps.googleusercontent.com
   GOOGLE_CLIENT_SECRET=GOCSPX-...
   # optional: the site's public address, when it differs from the one requests arrive on
   PUBLIC_URL=https://typelab.example.com
   ```

Other scripts: `npm test` (engine and API tests, and the golden outlines), `npm run typecheck`,
`npm run render` (text in a design to a PNG, no browser needed), `npm run golden` / `golden:update`,
`npm run sweep` (sliders that stop changing part way). One test file runs with
`node --import tsx --test tests/cuts.test.ts`, and tests by name with
`node --import tsx --test --test-name-pattern "the slice" tests/cuts.test.ts` (the pattern before the file).
No Node on the machine? `tools/node.sh npm test` fetches one into `.tools/`. See `tools/README.md`.

Working on the code with an AI agent: `CLAUDE.md` and the `CLAUDE.md` in each folder are written for it.

## Architecture

```
client/   React 19 + TypeScript (Vite): the editor, the design library and the account page
server/   Express 5 + TypeScript: REST API, SQLite storage, free-font cache, font export
shared/   used by both sides: the font engine (engine/), the settings and their specs (params/),
          starting styles, pages and UI copy (content/), free fonts, font families, traits
tests/    node:test suites for the engine, the settings, the client's pure logic and the API,
          and the golden outlines
tools/    command-line tools: render text to PNG, golden outlines, slider sweep, preset fitting,
          free-font scan, own fonts from their sheets, browser checks, a Node bootstrap (see tools/README.md)
fonts/    TypeLab's own fonts, imported from their sheets in Asset/After/ (generated: npm run fonts:import)
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
and builds exported fonts on the server. A full rebuild of every glyph takes a few milliseconds.

| File | Role |
| --- | --- |
| `index.ts` | The entry point: importing it registers every glyph |
| `font.ts` | The hub: params → `resolve()` → metrics; the glyph table, the `Builder` glyphs draw on, the formulas the metrics share with other files, and `buildFont` (letters on demand, layout) |
| `glyph.ts` | Building one letter: skeleton → turns and ends → serif sides → wobble → pen → corners and joins → stencil → serifs, then placed with its spacing, slant, slice and fill; block letters and drawn ones |
| `glyphs/` | Parametric skeletons: `upper.ts`, `lower.ts`, `figures.ts`, `punctuation.ts` (punctuation and symbols), the constructions they share (`shared.ts`), and strokes that turn at a point (`turns.ts`) |
| `script.ts` | Script capitals and joined small letters |
| `stroke.ts` | Centerline → outline: pen-model contrast, terminals, serifs |
| `ends.ts`, `corners.ts`, `joins.ts`, `stencil.ts`, `serif-sides.ts` | Stroke ends (length, curl, straight runs), corners and steps, inside-corner fillets, stencil gaps, which way serifs reach and cupped serifs |
| `effects.ts`, `boolean.ts` | Whole-outline effects (the slice; the wireframe, pixel, hexagon, dot, blob, halftone, line, inline, outline and shadow fills, and how far a grid fill's cells spread), and the unions and cuts they need |
| `rough.ts` | Rough edges: the finished outline's edges wandering in and out, as worn print does, on any fill |
| `blocks.ts` | Block letters: solid rounded blocks with their counters cut in as slots (*Built from: Blocks*) |
| `grid-blocks.ts` | Grid letters: every character cells on a grid five high, all corners round, strokes meeting at a corner joined through a neck (*Block letters: Grid*) |
| `outline.ts` | Letters drawn by hand with the pen: anchor points and bézier handles, and the curve fitting that traces a generated letter into them |
| `grid.ts` | Construction grids: the lines and circles a letter is built on, and the groups of letters that share a grid |
| `free.ts`, `free-letters.ts` | Free fonts' letters: registered fonts, and a design's letters drawn from its free font (nearest weight, the twin for other forms) |
| `skin.ts`, `scan.ts`, `restyle.ts` | Free fonts' letters moved by the settings: hung on their scanned skeletons and moved by the engine's own measures, then restyled where a setting asks for the engine's shapes |
| `highlight.ts` | The part of a glyph a setting shapes, for the explainer and the inspector |
| `geom.ts`, `types.ts` | Béziers, polygon clipping, corner rounding, SVG path output; shared types |

Every starting style can also be written in a ready-made font (`shared/free-fonts.ts` names one per style),
except those built from blocks, which no font draws. The 22 on the Style page are TypeLab's own fonts, drawn for
it and free to use, change and share with no licence: each was drawn on a specimen sheet (`Asset/After/<n>.ai`),
which `npm run fonts:import` (`tools/fonts/`) turns into the outlines the engine draws, kept in `fonts/`; Block's,
Bulwark, is the engine's block letters made a font (`npm run fonts:blocks`), so serifs, stroke ends, letter forms
and the rest reach it as they reach the other cards. The other styles use a free
font from Google Fonts (SIL Open Font License or Apache 2.0): the server fetches it the first time it's
asked for, converts it (`server/free-fonts.ts`) and keeps it in `data/free-fonts/`; an export made from
one carries the font's copyright notice and licence, and never its name. A design
remembers the settings its font was picked at (`freeAt`), and as the settings move from them the font's
letters move too: heavier or lighter is the family's nearer weight, slanting past half an italic's lean
takes the italic, and slant, rotation, mirroring, monospacing, spacing, the slice and the fills apply on top.
The rest of the way in weight, and contrast, width, x-height, crossbar height, stem length, inner space,
dot size, pinch, ink traps and the serifs' size, move the letters on their skeletons
(`shared/engine/skin.ts`): each outline is sampled, every sample hung on the middle of its stroke, and the
settings move those middles and thicken or thin the strokes round them by the same measures the engine
builds its own letters with, keeping the font's heights. Where a setting asks for one of the engine's own
shapes (its dots, bowls, stroke ends, serifs, stencil gaps, peaks or corners), that shape is drawn onto the
font's letter (`shared/engine/restyle.ts`), and a letter asked for in a form the font hasn't got (a
single-storey a, a script's letters) is the engine's own, drawn at the settings the font reads as. Unmoved,
the letters are the font's exactly. A pixel font's letters (VT323, Silkscreen) would lose their grid on their
skeletons, so they only stretch and take the family's own weights. Points opens its letters with the font's
own anchor points.

Beyond weight, width and contrast, the pen model also does squircle bowls (*Squareness*),
faceted octagonal curves (*Facets*), reverse contrast and ink traps, and glyph assembly
can cut stencil gaps where one stroke joins another. The fills run last, on the glyph's final
outline, so a pixel, hexagon or dot grid stays aligned across a whole line: advances and tracking snap
to the grid. *Spread* shrinks a grid's cells apart or grows them until they run together, and *Rough
edges*, last of all, lets the edges of whatever the fill drew wander like worn print.

Some letters also come in named shapes: a single- or double-storey a, with or without a spur at its foot, a hooked or mirrored g,
a k whose arm and leg meet at the arm, the stem or a short bar, i and l with a flag and foot,
square or round dots, barred I and J, A V W with one side upright, a cup-shaped Y, a Q whose tail
runs from inside its bowl, an R whose bowl loops back into its leg, box bowls (straight sides, corners
round outside, from sharp to twice the stroke wide, and square inside), strokes that turn in a round bend like bent wire (A M N V W Z), and bowls and arches that curve out of their stems or run flat into them.
Every corner has a roundness of its own, from sharp through round outside and square inside to round
both ways: where a stroke turns, the centerline keeps a sharp corner and the outline rounds its outside
and inside by their own radii, and the square ends of strokes round their two corners. Where one
stroke meets another, each inside corner their outlines leave (under the arm of an r, beside the
crossbar of a t, in the crotch of a y) is a corner too, filled with a fillet that follows both strokes'
edges. The two sliders under Roundness split the inside corners by how wide they are: *Joins* fills the
narrow crotches (an n's, a K's, a y's, the point inside a V), *Counters* rounds the square and open corners
(an H's, a t's, an L's). A customized letter can set each corner one by one.
Curved stroke ends can follow the curve or turn and run straight out, level or plumb.

Serifs have a page of their own. A shape (bracketed, unbracketed, slab, wedge, or the blackletter diamond)
sets their length, thickness and angle, and a bracketed one how far its curve runs up the stem. Their tips are cut square,
rounded, drawn out to a point or cut on a slant, and their base is flat or cupped: the stroke is drawn
short by the height of the cup and the serif arches up to it, so its tips stay on the line. *Sides*
keeps the serifs on stems to the left or the right only, or to the sides that face into the letter or
out of it: a side faces in where more of the letter stands beside the stem on the same line (the right
of an n's first stem, both sides of an m's middle one, neither side of an I). *Inside serifs* gives
the ones that reach in a shape, length and thickness of their own, apart from the ones that reach out.
*Balance* reaches further to one side, and the serifs on top of stems and across the ends of arms are
sized apart from the feet.

Letters can also be *built from blocks* instead of strokes: each capital, figure and punctuation mark is a
solid block with its counters cut in as narrow slots, drawn as outlines of corners that each carry their
own radius. Weight closes the slots up, Roundness rounds the corners and slot ends, Joins the small
inside curves, and the lowercase become small capitals. Or they are *grid letters*: cells on a grid five high,
both cases as tall, every corner rounded and strokes that meet at a corner joined through a narrow neck, so the
empty cells read as round nodes.

### Client (`client/`)

- `main.tsx` routes `/` and `/d/:id` to one editor (`pages/EditorPage.tsx`), `/designs` to My designs
  (`pages/LibraryPage.tsx`) and `/account` to the account page (`pages/AccountPage.tsx`); the addresses are in
  `lib/routes.ts`. `state/auth.ts` holds who's signed in and opens the sign-in dialog (`components/Account.tsx`)
  from any page.
- `state/editor.ts`: a zustand store holding the open design, undo history, dirty tracking and UI state.
  Fonts are memoized per params object, so each change is built exactly once.
- `components/GlyphDefs.tsx`: each glyph is defined once as `<path id="g65">` and reused with
  `<use>` by the preview and the glyph strip. Glyphs on screen update immediately; the rest follow in
  a deferred render, so dragging stays at 60 fps.
- `components/Panel.tsx` and `components/panel/`: the right-hand panel. Controls are read off `CONTROLS` and
  `SUBS` (`shared/content/controls.ts`); `ControlsPanel.tsx`'s `Control` picks the component for each, and
  nested sliders are placed there or in `ShapeControls.tsx`. A control that changes nothing in view says so
  (`panel/reach.tsx`, `lib/reach.ts`).
- `components/Stage.tsx`, `Inspector.tsx`, `PenCanvas.tsx`, `Header.tsx`, `Chrome.tsx`,
  `Guide.tsx`: the stage with the style cards and the preview, the glyph inspector, the pen,
  the top bar and the Export window, the page navigation and glyph strip, and the first-run tour.
- `lib/`: the API client (`api.ts`), free fonts in the browser (`free.ts`), dragging a letter's parts
  (`drag.ts`), the pen's operations (`pen.ts`), whether a setting reaches the letters in view (`reach.ts`), the
  preview's text (`preview.ts`), everything the browser remembers (`prefs.ts`), the addresses (`routes.ts`),
  small hooks (`hooks.ts`) and the guide lines' labels (`guide-labels.ts`).
- `styles.css`: the one stylesheet, its colours and sizes as tokens on `:root`.
- The editor's pages are listed in `shared/content/pages.ts` (`CATEGORIES`), and each control names the page it
  is on (its `control` in `shared/params/spec.ts`). Proportions, Shapes and Details are groups (`GROUPS`): their
  pages (Weight, Heights, Corners, Stroke ends, Serifs, Letters…) sit under them in the navigation.
  Pages run from the broadest settings to the finest, and a page shows its controls in the order they are listed
  in `CONTROLS`.

### API (`server/`)

| Method | Path | |
| --- | --- | --- |
| `POST` | `/api/auth/check` | `{ email }` → `{ exists, password, google }`, the sign-in dialog's first step |
| `POST` | `/api/auth/signup` | `{ email, password, name? }` → signs in, `{ user, moved }` |
| `POST` | `/api/auth/login` | `{ email, password }` → signs in, `{ user, moved }` |
| `POST` | `/api/auth/logout` | signs this browser out |
| `GET` | `/api/auth/me` | `{ user, google }`: who's signed in (null for nobody), and whether Google sign-in is offered |
| `PATCH` | `/api/auth/me` | rename the account, `{ name }` |
| `DELETE` | `/api/auth/me` | close the account and its fonts: `{ password }`, or `{ confirm: email }` on an account with no password |
| `POST` | `/api/auth/password` | `{ current, next }`, signing other browsers out; `{ next }` alone sets a first password on a Google account |
| `GET` / `DELETE` | `/api/auth/sessions` | how many other browsers are signed in · sign them out |
| `GET` | `/api/auth/google` | `?intent=signin` or `link`, `&popup=1&back=/path` → off to Google; it returns to `/api/auth/google/callback` |
| `DELETE` | `/api/auth/google` | disconnect Google (needs a password set) |
| `GET` | `/api/designs` | list saved designs, newest first |
| `POST` | `/api/designs` | create `{ name, styleId, params }` |
| `GET` / `PUT` / `PATCH` / `DELETE` | `/api/designs/:id` | read · update `{ name, styleId, params }` · rename `{ name }` · delete |
| `GET` | `/api/free-fonts/:id` | a free font's letters, as the engine draws them (TypeLab's own from `fonts/`, others fetched from Google Fonts the first time) |
| `GET` | `/api/free-fonts/:id/font.otf` | one of TypeLab's own fonts as an OpenType file, for the style cards |
| `POST` | `/api/export/otf` | `{ name, params }` → OpenType font file |
| `POST` | `/api/export/family` | `{ name, params, family }` → .zip of fonts |
| `POST` | `/api/export/svg` | `{ name, params }` → SVG specimen |
| `GET` | `/api/health` | liveness check |

Designs live in SQLite through Node's built-in `node:sqlite`, so there are no native modules to
compile. Every parameter is validated on the server (`shared/params/`, each one against its spec): numbers must be 0–1 and
options must be known values.

Anyone can design and save without an account: designs saved signed out belong to the browser
(an HttpOnly `typelab_owner` cookie). Signing up or in moves that browser's designs into the account,
and from then on the account's designs open on any browser signed in to it. Passwords are stored only
as scrypt hashes (`server/accounts.ts`), a sign-in is a random token in an HttpOnly, SameSite=Lax
`typelab_session` cookie (the database keeps only its SHA-256) lasting 90 days, and ten wrong passwords
in 15 minutes from one address for one email pause sign-in for that pair. There is no password reset by email.

Google sign-in (`server/google.ts`) is the authorization-code flow with PKCE and a random state,
both kept for the browser in a 10-minute HttpOnly cookie. It runs in a popup so the open design stays
put, and the popup reports back on a `BroadcastChannel` (falling back to a full-page trip when popups
are blocked). A Google account signs in to the account it's connected to, else to the account with its
(Google-verified) email, connecting it, else to a new account with no password. Because nothing checks
the email someone signs up with, joining such an account through Google switches its password off and
signs its other browsers out, so an account set up in someone else's name can't keep watching it.

## Shortcuts

`⌘/Ctrl+Z` undo · `⇧⌘/Ctrl+Z` or `⌘/Ctrl+Y` redo · `⌘/Ctrl+S` save · `⌘/Ctrl+K` find a setting · `/` search
styles on the Style page, designs on My designs, settings elsewhere · `Esc` close inspector or menu · `←/→`
previous/next glyph in the inspector · double-click a slider to reset it to the starting style's value (while
customizing a letter, to the value the other letters share).

In the glyph inspector, drag the letter itself: a stroke to change the weight, a crossbar, counter or
serif to reshape it, a guide line to move the x-height, cap height or extenders, and the advance box's
right edge to change the width. Like the sliders, a drag reshapes every letter, and it is one undo step.
Pointing at a part shows its grab handle and which way does what; pointing at a slider shows handles
wherever the letter can be dragged to make the same change.

To customize one letter, switch the inspector from **All letters** to **Only R**: sliders and
drags then reshape just that letter, which keeps its own values when the rest of the design changes (a dot
marks it in the glyph strip, and its own values are tagged *Custom*). Heights, spacing and fills
are tagged *Whole font*: every letter sits on the same lines, so they stay shared.
**Reset R** puts the letter back in step with the rest. Per-letter settings are saved with the design
(`params.glyphs`) and exported with the font.

To draw a letter point by point, switch the inspector from **Parts** to **Points**. The letter shows
as anchor points and bézier handles, traced from its outline with points on the curves' extremes, and
the tools work like a vector editor's: **Direct selection** (`A`) drags points, handles and curves (Shift-click or
drag a box to pick several, arrows nudge by one unit, Shift by ten, Alt-drag a handle to break a smooth
point, double-click a point to switch corner ↔ smooth); the **Pen** (`P`) adds a point where it clicks the
outline, deletes a point it clicks, and draws new shapes (click for corners, drag for curves, click the
first point to close); **Convert point** (`⇧C`) switches corner ↔ smooth or pulls out new handles; the
**Shape** tool adds a rectangle (`M`), ellipse (`L`), rounded rectangle, triangle, hexagon or star. The bar
below types exact coordinates and the width; points snap to whole units, and with *Snap* to the guide
lines, other points, centers, midpoints, the outline, crossings and tangents. **Mirror** moves a point's
partner across the letter's middle the other way. **All letters / Only R** works here too, by shape: with All
letters, picking points names the letters shaped the same way there ("Same shape in b h k l"), and an edit goes
on to them as soon as it is done, in the same undo step (the pill in the corner names them, and puts any back);
with Only R, the edit changes the letter in view alone, and after it those letters are offered, each drawn with
the change in, to make it in them too. `⌘`-scroll zooms, Space-drag pans, `⌘0` fits the letter.
The first edit makes the letter a drawing, saved with the design (`params.outlines`) with the settings it
was drawn at: it keeps the shape you give it, and weight, contrast, width, the heights, crossbar, inner space
and slant still move it as they move from those, for all letters or only this one. **Reset** gives it back to
the font. **History** (the clock beside it) keeps every version of the letter its edits made, with Only R or in
Points, a Reset too, saved with the design: newest first, each drawn small, and picking one brings the letter back
to it in one undo step. The **History** beside undo and redo does the same for the whole font: every change, to
every letter or one, a style picked or a design file opened, each drawn small as it was; picking one brings the whole
font back to it.

**Construction grid**, in the inspector's header, draws the letter as an outline on the grid it is
built on, like the grid pages of a type specimen: its straight edges carried on across the canvas,
the level and upright lines its curves turn on, and the circles and ellipses its corners and bowls
are arcs of. Letters built the same way share a grid, named in the bar under the header: Grid A to D
are the capitals (straight strokes, diagonals, stems and curves, round), E to H the lowercase, I to L
the figures, M to P the punctuation, Q to T the symbols. The bar lists the letters on the same grid (click one to inspect
it); lines and circles the letter has in common with its group are drawn in one colour, its own in
another. The grid follows the letter as it is dragged, and shows in Points mode too.

Deep links for demos: `/?style=serif&cat=serifs&active=serifTip&inspect=R&text=Hello&hot=1` (add `&pen=1` for Points).
`cat` names a page, or a group to open its first page (`proportion`, which older links used for Heights, still opens Heights); an `active` control opens the page it is on; `text` sets
the sample text. A visit that arrives on a link with a query skips the first-run tour.
