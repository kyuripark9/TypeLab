# server: the Express API

Express 5 on one port: the API under `/api`, and the React app (Vite middleware in development, `dist/` in
production). Storage is SQLite through Node's built-in `node:sqlite`. Exports are built with the same engine as the
preview (`shared/engine`).

| File | Holds |
| --- | --- |
| `index.ts` | Start-up: reads the environment (and a `.env` at the root), opens the store and the free-font cache, mounts the API, then Vite or `dist/` (`dist/assets/` cached a year as immutable, a file missing there a 404; every other GET the app shell, `no-cache`) |
| `app.ts` | `createApp(store, { google, fonts })`: the headers on every answer (nosniff, no framing, the referrer policy), a log line when a proxy is seen without `TRUST_PROXY`, compression, then every route, the who's-asking middleware, cookies, throttles, errors. Kept apart from index.ts so tests mount it on an in-memory store |
| `db.ts` | `DesignStore`: designs by owner, the schema upgrades, `PARAMS_VERSION` upgrades |
| `accounts.ts` | `AccountStore`: users, scrypt password hashes, sessions |
| `google.ts` | Google sign-in (authorization code with PKCE, no library); `googleFromEnv`; `googleStandIn`, development's stand-in for Google |
| `mail.ts` | Email, for password reset: `mailerFromEnv` (SMTP through nodemailer, `SMTP_URL` and `MAIL_FROM`); `mailStandIn`, development's, which logs each message and shows it at `/dev/mail` |
| `free-fonts.ts` | `FreeFonts`: TypeLab's own fonts read from `fonts/`, the others fetched, converted and kept; each as a web font (`webFont`); `keptFile`, `ownFontFile`, `fontFile` |
| `export.ts` | `buildOTF`, `buildFamilyZip`, `buildSpecimenSVG`, `exportName`; `buildExport`, one route's export (`ExportJob`), and the pieces it is built in (`exportPieces`, `buildPiece`, `joinPieces`: a family's members one a piece) |
| `export-pool.ts`, `export-worker.ts` | `ExportPool`: exports built piece by piece on worker threads, side by side, so the server keeps answering; `Busy` past the ones it takes |
| `opentype.ts` | opentype.js as one module: it is CommonJS, so under Node its API sits on the default export. Import it from here (the server and the tests do), not from `'opentype.js'` |

## API

Bodies are JSON (up to 8 MB: a design brings its Histories). Errors answer `{ error }`.

| Method | Path | Does |
| --- | --- | --- |
| GET | `/api/health` | `{ ok: true }` |
| GET | `/api/auth/me` | `{ user, google, reset }`: the account signed in (null when none), and whether Google sign-in and password reset are offered |
| POST | `/api/auth/check` | `{ email }` → `{ exists, password, google }`, the sign-in dialog's first step |
| POST | `/api/auth/signup` | `{ email, password, name? }` → 201 `{ user, moved }`, signed in |
| POST | `/api/auth/login` | `{ email, password }` → `{ user, moved }`, signed in |
| POST | `/api/auth/logout` | 204, this browser signed out |
| PATCH | `/api/auth/me` | `{ name }` → `{ user }` |
| DELETE | `/api/auth/me` | `{ password }`, or `{ confirm: email }` on an account with no password → 204; the account and its fonts deleted |
| POST | `/api/auth/password` | `{ current, next }` → `{ user }`, other browsers signed out; `{ next }` alone sets a first password on an account without one |
| GET | `/api/auth/sessions` | `{ others }`: how many other browsers are signed in |
| DELETE | `/api/auth/sessions` | 204, the other browsers signed out |
| POST | `/api/auth/reset` | `{ email }` → 204 whether or not it has an account; when it does, a link to `/reset?token=` is emailed (503 without mail, 502 when sending fails) |
| POST | `/api/auth/reset/confirm` | `{ token, password }` → `{ user, moved }`: the password set, the email marked verified, every browser signed out and this one in; 400 for a token used, expired or unknown |
| GET | `/api/auth/google` | `?intent=signin` or `link`, `popup=1`, `back=/path` → a redirect to Google, which returns to `/api/auth/google/callback` |
| DELETE | `/api/auth/google` | → `{ user }`, Google disconnected (needs a password set) |
| GET | `/api/designs` | The owner's designs, newest first |
| POST | `/api/designs` | `{ name, styleId, params, log?, versions? }` → 201, the design |
| GET, PUT, PATCH, DELETE | `/api/designs/:id` | Read; replace (`{ name, styleId, params, log?, versions? }`); rename (`{ name }`); delete (204) |
| GET | `/api/free-fonts/:id` | A free font's letters (`FreeFontData`): an own font's from `fonts/` (`no-cache`, its ETag answers), any other fetched from Google Fonts the first time; 502 when that fails |
| GET | `/api/free-fonts/:id/font.otf` | One of TypeLab's own fonts as an OpenType file, for the style cards' web fonts (`fontFileUrl`); 404 for any other |
| POST | `/api/export/otf` | `{ name, params, member?, accents? }` → an `.otf`: the design as it is, installed as Regular, or with `member: { anchor, weight, italic }` that member of its family, as the family's `.zip` has it (`<slug>-<Style>.otf`); `accents: true` adds the accented letters (`ACCENTED`, below) |
| POST | `/api/export/family` | `{ name, params, family: { anchor, styles: [{ weight, italic }] }, accents? }` → a `.zip` of those members, each with the accented letters when `accents: true` (the older `{ anchor, weights, upright, italic }` still reads) |
| POST | `/api/export/svg` | `{ name, params, accents? }` → an SVG specimen, with rows of the accented letters when `accents: true` |

Designs and exports take `params` only when `isValidParams` holds (complete, current-version settings, every value
in range), and a design's `styleId` must be a known style (`styleById`). Add a route to `client/lib/api.ts` when you
add it here. An `HttpError` sends its message, written for the person asking (a 502 when a free font couldn't be
fetched, logged where that was caught; a 503 when too many exports wait); anything else is logged and answered with a
generic 500 (Express 5 passes async throws to the error handler). An unknown `/api` path is a JSON 404.

Exports are built on worker threads (`ExportPool`, `export-pool.ts`, running `export-worker.ts`): a family's members
take up to a second or two a font where a free font's letters move, and on the main thread every request would wait.
The route loads the free fonts the design and its members draw from (`FreeFonts.wanted`) and hands them to the pool
with the job (`ExportJob`). The pool cuts it into pieces (`exportPieces` in export.ts: each member of a family a
piece, and its licence and name one more; any other export whole), the workers build them side by side
(`buildPiece`: a member's font deflated as its file of the `.zip`), and `joinPieces` writes the `.zip` around them on
the main thread, which takes no time; the exports in hand take turns at the workers, so one font asked for during a
family starts at the next free worker. A worker is sent each free font once and keeps its rigged letters from piece
to piece, so a font's second export is quicker. There is a worker for each core but one, up to four
(`availableParallelism`), and at most that many exports and eight more are in hand; past that the route answers 503.
An 18-style family in an own font takes some 6 to 10 seconds the first time on two or three workers, 3 to 4 after
(three times that on one).

## Owners and accounts

- Every design row has an `owner`: the browser's id from the `typelab_owner` cookie (18 random bytes, 24 base64url
  characters, kept ten years), or `user:<account id>` while signed in. base64url has no `:`, so the two never meet.
  Every design query filters by owner, and another owner's design answers 404.
- The who's-asking middleware (browser, user, token, owner on `res.locals`) runs only for `/designs` and `/auth`. A
  new route elsewhere that needs the owner or the user goes into that list.
- Signing in or up moves the browser's designs to the account (`moveAll`) and answers how many (`moved`).
- Passwords are scrypt hashes (`scrypt$salt$hash`); an empty password means none (an account made with Google). A
  sign-in is 32 random bytes as a 43-character token in the `typelab_session` cookie (HttpOnly, SameSite=Lax, Secure
  behind TLS), stored only as its SHA-256, for 90 days. The cookie patterns in app.ts fix those lengths: changing one
  orphans every browser's designs or signs everyone out.
- Throttles, per 15 minutes: 10 wrong passwords per address and email; 60 email checks per address; 5 reset emails per address and per email.
- Password reset: `startReset` keeps a 32-byte token's SHA-256 in `resets` for `RESET_MINUTES` (60), one per account; `takeReset` uses it up. The emailed link is built from `PUBLIC_URL` (index.ts offers no reset in production without it), as one built from the request's Host could send the token to another site. A reset proves the email, so it marks it verified (`verifyEmail`).
- Google: a random state and a PKCE verifier ride in the 10-minute `typelab_google` cookie (Path
  `/api/auth/google`, which must cover the callback). The redirect URI is `PUBLIC_URL` when set, else the address
  asked on, and must be the same at both ends. Signing in goes to the account Google is connected to, else the one
  with its email, connecting it (a password account nobody has verified loses its password and its other sessions
  first), else a new account without a password. The popup posts `{ type: 'google', result }` on the
  BroadcastChannel `AUTH_CHANNEL` (`'typelab-auth'`); the full-page fallback carries the result in
  `?GOOGLE_RESULT_PARAM=` (`?google=`). Both names live in `shared/account.ts`, which the server and the client
  (`client/state/auth.ts`, `client/lib/api.ts`) import, with `GoogleIntent`.
- Without Google's keys, development (any `NODE_ENV` but `production`) signs in with `googleStandIn`: index.ts
  mounts its account picker at `STAND_IN_PATH` (`/dev/google`), whose two made-up accounts (`mina@stand-in.test`,
  `jun@stand-in.test`) come back through the real callback, PKCE and all. Their `.test` emails can't match a real
  account, so picking one never takes a real account's password off. Production without keys offers no Google.

## Database compatibility

One SQLite file holds designs, users and sessions. Older databases must keep opening, so this code stays:

- `designs.owner` is added when missing, and `adopt()` gives rows with no owner to whoever lists or opens designs
  first.
- `users.google_sub`, `google_email` and `email_verified` are added when missing.
- `PRAGMA user_version` records the `PARAMS_VERSION` the stored params are written in; `upgrade()` runs
  `upgradeParams` over every row once, in a transaction (0 means version 1).
- Every row's params pass `sanitizeParams` on the way out.
- `designs.log` and `designs.versions` (the letters' records and the font's History) are added when missing (null:
  none). `upgrade()` brings them up with their design (`upgradeLog`, `upgradeVersions`); they pass `cleanLog` and
  `cleanVersions` on the way out, the list of designs leaves them out, and a PUT without one keeps the one stored.

Test any schema change against a database in the old shape (tests/params.test.ts and the `design storage` test in
tests/api.test.ts build one).

## The free-font cache

TypeLab's own fonts are part of the repository, in `fonts/<Family>-<weight>.json` (`ownFontFile`): `load(id)` reads
one from there, never fetching. The rest: `FreeFonts(dir)` keeps fonts in memory and, when `dir` is set, as JSON
files there: `dirname(DB_PATH)/free-fonts` (`data/free-fonts` by default; none for `DB_PATH=:memory:`). `load(id)`
takes only ids `parseFontId` accepts, runs one fetch per id at a time and forgets a failed one so the next call
retries. A kept file is reused only when it has
`licenseText` and its heights look right (`cap > 300`, `xh > 150`); otherwise the font is fetched again from the
Google Fonts CSS API (which answers with TrueType), converted (`convertFont`: 1000 to the em, quadratics made
cubic) and its licence fetched from github.com/google/fonts. `keptFile` names the files, and `tools/golden.ts` reads
them by the same name. The file format is the engine's `FreeFontData` (shared/engine/free.ts): changing it means
throwing the kept files away. `ready(...params)` registers every free font the settings draw from before an export.

## Export

`buildOTF`: a CFF font at 1000 units per em with `.notdef`, space, no-break space and every character of
`ALL_CHARS` (named `uniXXXX`, one UTF-16 code unit each), advances never below 20 (a space 40), each letter in the
engine's outline unless the caller passes another (`outline`: tools/fonts/ui.ts writes the logo font's overlapping
pieces made one). Regular, Italic, Bold and Bold Italic share one family name; other weights get a family of their
own plus the typographic names.
Written in a free font from Google Fonts, it carries the font's copyright notice and full licence, and its name loses
the font's own and reserved names (`withoutReserved`); TypeLab's own fonts carry theirs the same way, as `load` lays
`ownLicense` (TypeLab's notice, and the Open Font License from `fonts/OFL.txt`) into each as it reads it, and `webFont`
writes it into the cards' web fonts too. `buildFamilyZip` builds every `familyMember` into `<slug>/<slug>-<Style>.otf`
(and `LICENSE.txt` for a Google font), through the same pieces the pool builds side by side, one after another.
`buildSpecimenSVG` sets the name, every character and a pangram. Every export route first loads the free fonts the
design and its members need (`FreeFonts.wanted`), or answers 502, and builds on a worker (above).

Asked for with `accents`, the fonts and the specimen also have the accented letters (`ACCENTED`, `accentGlyph` in
shared/engine/accents.ts: Latin-1's, Latin Extended-A's for Central and Eastern Europe, Turkish and the Baltic
languages, Romanian's commas below, and ı), after the rest, each as wide as its letter (ď ľ ť Ľ a little wider where
their apostrophe needs the room before a tall letter); they leave the font's line spacing as it was. They are export only: the preview, `ALL_CHARS` and the golden outlines don't have them.

## Environment

`index.ts` loads `.env` from the root first (git-ignored).

| Variable | Default | Does |
| --- | --- | --- |
| `PORT` | 5173 | The port |
| `NODE_ENV` | | `production` serves `dist/` (after `npm run build`) instead of Vite |
| `DB_PATH` | `data/typelab.db` | The database; free fonts are kept in `free-fonts/` beside it; `:memory:` keeps nothing |
| `TRUST_PROXY` | | Set behind an HTTPS proxy: cookies get Secure and throttles count each visitor |
| `PUBLIC_URL` | | The site's address for Google's redirect, when it differs from the one requests arrive on |
| `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` | | Both set: Google sign-in is offered. Without them, development signs in with a stand-in for Google and production offers none |
| `SMTP_URL`, `MAIL_FROM` | | Both set (and `PUBLIC_URL` in production): password reset is offered, its email sent through that SMTP server from that address. Without them development shows the mail at `/dev/mail` and production offers no reset |
| `EXPORT_WORKERS` | one fewer than the cores, at most 4 | How many worker threads build exports side by side; each holds a few hundred MB at its busiest |

tools/README.md lists the tools' variables too.

## Running a test server

The owner's dev server runs on 5173 against `data/typelab.db`, their real designs. Never start a server on that
port or that database. Start your own on another port with its own database, and stop it by PID:

```sh
PORT=5199 DB_PATH=.tools/test.db tools/node.sh node --import tsx server/index.ts &
echo $!            # the server's PID (tools/node.sh execs node); later: kill <pid>
```

`npm run dev` with the same variables also works and restarts on server changes, but its PID is npm's. Never
`pkill` by pattern. With `.tools/test.db`, free fonts are kept in `.tools/free-fonts` and fetched from Google the
first time; copy `data/free-fonts/*.json` there to skip that. tests/api.test.ts and tests/free-fonts.test.ts mount
`createApp` on `DesignStore(':memory:')` with a stand-in Google and stand-in font fetches, so they need no network.
