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

Other scripts: `npm test` (engine and API tests), `npm run typecheck`.

## Architecture

```
client/   React 19 + TypeScript (Vite): the editor and the design library
server/   Express 5 + TypeScript: REST API, SQLite storage, font export
shared/   used by both sides: the font engine, parameter model, UI copy
tests/    node:test suites for the engine and the API
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
| `blocks.ts` | Block letters: solid rounded blocks with their counters cut in as slots (*Built from: Blocks*) |
| `outline.ts` | Letters drawn by hand with the pen: anchor points and bézier handles, and the curve fitting that traces a generated letter into them |
| `grid.ts` | Construction grids: the lines and circles a letter is built on, and the groups of letters that share a grid |
| `free.ts` | Free fonts' letters: a design written in one (*Ready-made* on the Style page) draws them as the font has them, once registered |
| `skin.ts` | Free fonts' letters moved by the settings: each outline hung on its skeleton, which the settings move and thicken by the engine's own measures |

Every starting style can also be written in a free font from Google Fonts (`shared/free-fonts.ts`
names one per style; all are under the SIL Open Font License or Apache 2.0). The server fetches a font
the first time it's asked for, converts it (`server/free-fonts.ts`) and keeps it in `data/free-fonts/`;
an export made from it carries the font's copyright notice and licence, and never its name. A design
remembers the settings its font was picked at (`freeAt`), and as the settings move from them the font's
letters move too: heavier or lighter is the family's nearer weight, slanting past half an italic's lean
takes the italic, and slant, rotation, mirroring, spacing, slice and the fills (but Inline) apply on top.
The rest of the way in weight, and contrast, width, x-height, crossbar height and the serifs' size, move
the letters on their skeletons (`shared/engine/skin.ts`): each outline is sampled, every sample hung on
the middle of its stroke, and the settings move those middles and thicken or thin the strokes round them
by the same measures the engine builds its own letters with, keeping the font's heights; unmoved, the
letters are the font's exactly. Points opens its letters with the font's own anchor points.

Beyond weight, width and contrast, the pen model also does squircle bowls (*Squareness*),
faceted octagonal curves (*Chamfer*), reverse contrast and ink-trap joints, and glyph assembly
can cut stencil gaps where one stroke joins another. The fills run last, on the glyph's final
outline, so a pixel or dot grid stays aligned across a whole line: advances and tracking snap
to the grid.

Some letters also come in named shapes: a single- or double-storey a, with or without a spur at its foot, a hooked or mirrored g,
a k whose arm and leg meet at the arm, the stem or a short bar, i and l with a flag and foot,
square or round dots, barred I and J, A V W with one side upright, a cup-shaped Y, a Q whose tail
runs from inside its bowl, an R whose bowl loops back into its leg, box bowls (straight sides, corners
round outside, from sharp to twice the stroke wide, and square inside), strokes that turn in a round bend like bent wire (A M N V W Z), and bowls and arches that curve out of their stems or run flat into them.
Every corner has a roundness of its own, from sharp through round outside and square inside to round
both ways: where a stroke turns, the centerline keeps a sharp corner and the outline rounds its outside
and inside by their own radii, and the square ends of strokes round their two corners. Where one
stroke meets another, each inside corner their outlines leave (under the arm of an r, beside the
crossbar of a t, in the crotch of a y) is a corner too, rounded by *Joins* with a fillet that follows
both strokes' edges. A customized letter can set each corner one by one.
Curved stroke ends can follow the curve or turn and run straight out, level or plumb.

Serifs have a page of their own. A shape (bracketed, unbracketed, slab or wedge) sets their length,
thickness and angle, and a bracketed one how far its curve runs up the stem. Their tips are cut square,
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
inside curves, and the lowercase become small capitals.

### Client (`client/`)

- `state/editor.ts`: a zustand store holding the open design, undo history, dirty tracking and UI state.
  Fonts are memoized per params object, so each change is built exactly once.
- `components/GlyphDefs.tsx`: each glyph is defined once as `<path id="g65">` and reused with
  `<use>` by the preview and the glyph strip. Glyphs on screen update immediately; the rest follow in
  a deferred render, so dragging stays at 60 fps.
- `pages/EditorPage.tsx` (`/` and `/d/:id`), `pages/LibraryPage.tsx` (`/designs`) and
  `pages/AccountPage.tsx` (`/account`). `state/auth.ts` holds who's signed in and opens the sign-in
  dialog (`components/Account.tsx`) from any page.
- The editor's pages are listed in `shared/content.ts` (`CATEGORIES`), and each control names the page it
  is on. Structure, Proportion and Shape are groups: their pages (Weight & contrast, Heights, Corners,
  Stroke ends, Serifs, Letters…) sit under them in the navigation. Pages run from the broadest settings
  to the finest, and a page shows its controls in the order they are listed in `CONTROLS`.

### API (`server/`)

| Method | Path | |
| --- | --- | --- |
| `POST` | `/api/auth/check` | `{ email }` → `{ exists, password, google }`, the sign-in dialog's first step |
| `POST` | `/api/auth/signup` | `{ email, password, name? }` → signs in, `{ user, moved }` |
| `POST` | `/api/auth/login` | `{ email, password }` → signs in, `{ user, moved }` |
| `POST` | `/api/auth/logout` | signs this browser out |
| `GET` / `PATCH` / `DELETE` | `/api/auth/me` | who's signed in · rename `{ name }` · close the account and its fonts `{ password }` |
| `POST` | `/api/auth/password` | `{ current, next }`, signing other browsers out; `{ next }` alone sets a first password on a Google account |
| `GET` / `DELETE` | `/api/auth/sessions` | how many other browsers are signed in · sign them out |
| `GET` | `/api/auth/google` | `?intent=signin\|link&popup=1&back=/path` → off to Google; it returns to `/api/auth/google/callback` |
| `DELETE` | `/api/auth/google` | disconnect Google (needs a password set) |
| `GET` | `/api/designs` | list saved designs, newest first |
| `POST` | `/api/designs` | create `{ name, styleId, params }` |
| `GET` / `PUT` / `DELETE` | `/api/designs/:id` | read, update, delete |
| `POST` | `/api/export/otf` | `{ name, params }` → OpenType font file |
| `POST` | `/api/export/family` | `{ name, params, family }` → .zip of fonts |
| `POST` | `/api/export/svg` | `{ name, params }` → SVG specimen |
| `GET` | `/api/health` | liveness check |

Designs live in SQLite through Node's built-in `node:sqlite`, so there are no native modules to
compile. Every parameter is validated on the server (`shared/params.ts`): numbers must be 0–1 and
options must be known values.

Anyone can design and save without an account: designs saved signed out belong to the browser
(an HttpOnly `typelab_owner` cookie). Signing up or in moves that browser's designs into the account,
and from then on the account's designs open on any browser signed in to it. Passwords are stored only
as scrypt hashes (`server/accounts.ts`), a sign-in is a random token in an HttpOnly, SameSite=Lax
`typelab_session` cookie (the database keeps only its SHA-256) lasting 90 days, and ten wrong passwords
in 15 minutes for one email pause sign-in for it. There is no password reset by email yet.

Google sign-in (`server/google.ts`) is the authorization-code flow with PKCE and a random state,
both kept for the browser in a 10-minute HttpOnly cookie. It runs in a popup so the open design stays
put, and the popup reports back on a `BroadcastChannel` (falling back to a full-page trip when popups
are blocked). A Google account signs in to the account it's connected to, else to the account with its
(Google-verified) email, connecting it, else to a new account with no password. Because nothing checks
the email someone signs up with, joining such an account through Google switches its password off and
signs its other browsers out, so an account set up in someone else's name can't keep watching it.

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
marks it in the glyph strip, and its own values are tagged *Custom*). Heights, spacing and fills
are tagged *Whole font*: every letter sits on the same lines, so they stay shared.
**Re-sync R** puts the letter back in sync. Per-letter settings are saved with the design
(`params.glyphs`) and exported with the font.

To draw a letter point by point, switch the inspector from **Shape** to **Points**. The letter shows
as anchor points and bézier handles, traced from its outline with points on the curves' extremes, and
the tools work like a vector editor's: **Direct selection** (`A`) drags points, handles and curves (Shift-click or
drag a box to pick several, arrows nudge by one unit, Shift by ten, Alt-drag a handle to break a smooth
point, double-click a point to switch corner ↔ smooth); the **Pen** (`P`) adds a point where it clicks the
outline, deletes a point it clicks, and draws new shapes (click for corners, drag for curves, click the
first point to close); **Convert point** (`⇧C`) switches corner ↔ smooth or pulls out new handles. The bar
below types exact coordinates and the width; points snap to whole units, and with *Snap* to the guide
lines and other points. `⌘`-scroll zooms, Space-drag pans, `⌘0` fits the letter. **Reverse direction**
turns a contour inside another into a hole (or back). The first edit makes the letter a drawing, saved
with the design (`params.outlines`) and exported as it is: the settings no longer shape it until
**Back to settings**.

**Construction grid**, in the inspector's header, draws the letter as an outline on the grid it is
built on, like the grid pages of a type specimen: its straight edges carried on across the canvas,
the level and upright lines its curves turn on, and the circles and ellipses its corners and bowls
are arcs of. Letters built the same way share a grid, named in the bar under the header: Grid A to D
are the capitals (straight strokes, diagonals, stems and curves, round), E to H the lowercase, I to L
the figures, M to P the punctuation. The bar lists the letters on the same grid (click one to inspect
it); lines and circles the letter has in common with its group are drawn in one colour, its own in
another. The grid follows the letter as it is dragged, and shows in Points mode too.

Deep links for demos: `/?style=serif&cat=serifs&active=serifTip&inspect=R&mode=paragraph&hot=1` (add `&pen=1` for Points).
`cat` names a page, or a group to open its first page; an `active` control opens the page it is on.
