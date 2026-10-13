# tools/

Command-line tools for working on TypeLab without the app open. They write what they make to `.tools/out/`
(git-ignored, `TOOLS_OUT` moves it) unless told otherwise; two write into the repository on purpose:
`golden.ts --update` rewrites `tests/golden/*.txt` and `fit/apply.ts` rewrites `shared/content/styles.ts`. Run
TypeScript ones with `node --import tsx <file>` or the npm script (through `tools/node.sh` when there is no Node).

| Tool | What it's for |
| --- | --- |
| `node.sh` | Node for this project whether or not the machine has it: `tools/node.sh npm test`, or `export PATH="$(tools/node.sh --bin):$PATH"`. Fetches Node 24 into `.tools/node` (checksum checked) when there is no Node 22.13+. It `exec`s the command, so a server started through it has its own PID. |
| `render.ts` | `npm run render -- --style serif --text "Rag" --size 200 --out .tools/out/x.png` (`--out` defaults to `.tools/out/render.png`): text in a design to a PNG (or `.svg`), no browser. `--size` is the cap height in pixels; `--set k=v` changes settings, `--free` writes it in the style's free font, `--params file.json` reads a saved design or a `.typelab.json`, `--sweep key` draws one row per eighth of a slider, `--family` one row per weight of the design's family (`--italic` its italics). |
| `golden.ts` | Golden outlines (`npm run golden`, `npm run golden:update`): a hash of every glyph of every starting style and every setting at its ends and options, kept in `tests/golden/`. `npm test` checks the engine set; `npm run golden` also checks the free fonts kept in `data/free-fonts`. See tests/CLAUDE.md. |
| `compare.ts` | `npm run compare -- [<git-ref>] [--free] [--only <style-regex>]`: builds every glyph of every style (and the defaults) under about 50 setting combinations with the engine at `<ref>` (HEAD by default, checked out into `.tools/compare/<commit>` and kept) and with the working tree, and compares the full output: outline, marks, counters, strokes, skeleton, serifs, spacing, highlights, layout, metrics. Lists each design and the letters that differ and exits 1 if any do. About five minutes (`--free`, the free fonts too: closer to half an hour; `--only` cuts it to seconds); the other commit's dump is kept, so a second run dumps only the working tree. It catches what golden's probes don't reach: run it for any engine refactor. |
| `sweep.ts` | `npm run sweep [-- keys...]`: every slider swept 0 to 1 in eighths on a light and a heavy design, and those basic block letters follow (`BLOCK_CONTROLS.basic` and their nested sliders) on a block design too; reports eighths that barely change the letters (dead zones) and exits 1 for any not listed as known. |
| `fit/` | Fitting a style's preset to its free font: `fit.ts <id>` (coordinate descent on a raster score, to `.tools/out/fit/<id>.fit.json`), `forms.ts` (g, Q, a), `apply.ts` (writes fits into `shared/content/styles.ts`, finding each `style('<id>', ...)` call by text), `sheet.ts` (free font / before / after, to judge). |
| `fonts/` | TypeLab's own fonts from their specimen sheets: `import.ts` (`npm run fonts:import [-- names...]`, `--check` to only report) reads each sheet in `Asset/After/` (`sheet.ts`: the page's outlines and the U+ labels under them) and writes `fonts/<Family>-<weight>.json`; letters keep the side bearings they had, and only letters drawn anew change. `--from <dir>` takes the spacing from `<dir>/<sheet>.json` instead (how they were first made, from the Google fonts the sheets began as). `blocks.ts` (`npm run fonts:blocks`, `--check` to only report) writes Bulwark, the Block card's font, which has no sheet: the engine's basic block letters at `BULWARK`'s settings, each outline copied point for point. |
| `drawn/tidy.ts` | `node --import tsx tools/drawn/tidy.ts design.typelab.json [--out file]`: a design's letters drawn in Points from a scan or a trace, tidied where the scan's blur left the fitter guessing, written to `<name>.tidy.typelab.json` with a line per change: ink traps' joins rounded where a notch meets a stem, hairlines' free ends cut square (or flush on the baseline and cap height), small rounds (under 100 units) redrawn as clean arcs along their two edges, and points marked smooth that still bend made smooth. Big rounds, arches, S-bends and live corners (a radius set in Points) are left. Made for `Asset/ink-trap-display.typelab.json`, the traced Ink Trap Display (Open design file… in the Export window). |
| `scan/scan.ts` | Every style's free font moved by each setting in `VARS`: flags letters that come out broken (area, specks, spikes, growth, contours), one JSON line per font. Fetches fonts not kept yet. |
| `browser/` | `chrome.sh` starts (or with `stop`, stops) a headless Chrome on its own profile; `cdp.mjs` drives it (open a tab, go, click, drag, type, screenshot) over Node's built-in WebSocket; `drag-bench.mjs` measures slider drag lag. |
| `lib.ts` | Shared by the above: a style's settings (in its free font too), loading free fonts from the server's cache, the settings that make a slider show, outlines to polygons, rows of text to SVG or PNG. |

Checking the app in a browser: run a test server on its own port and database, so the dev server on 5173 and the
owner's designs are left alone (`PORT=5199 DB_PATH=.tools/test.db tools/node.sh node --import tsx server/index.ts &`),
stop it by its PID, and open a fresh tab per URL (the editor's unsaved-changes guard can hang a second navigation).
`openTab()` marks the first-run tour and the opening title card as seen. More in client/CLAUDE.md.

## Environment variables

| Variable | Read by | Default | Does |
| --- | --- | --- | --- |
| `PORT` | `server/index.ts` | 5173 | The server's port |
| `NODE_ENV` | `server/index.ts` | | `production` serves `dist/` instead of running Vite |
| `DB_PATH` | `server/index.ts` | `data/typelab.db` | The database; free fonts are kept in `free-fonts/` beside it; `:memory:` keeps nothing on disk |
| `TRUST_PROXY` | `server/index.ts` | | Set behind an HTTPS proxy: sign-in cookies get Secure, throttles count each visitor |
| `PUBLIC_URL` | `server/app.ts` | the address asked on | The site's address for Google's redirect |
| `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` | `server/google.ts` | | Both set: Google sign-in is offered. Without them, development signs in with a stand-in for Google (`/dev/google`, two made-up accounts) and production offers none |
| `TOOLS_OUT` | `lib.ts` | `.tools/out` | Where tools write |
| `FONTS_DIR` | `lib.ts` (golden, render, scan, fit) | `data/free-fonts` | Where the free fonts from Google Fonts are kept (the server's cache); TypeLab's own are always read from `fonts/` |
| `SHEETS` | `fonts/import.ts` | `Asset/After` | Where the own fonts' specimen sheets are |
| `GOLDEN_FREE` | `tests/golden.test.ts` | | Set: `npm test` checks the free set too (`npm run golden` always does) |
| `VARS` | `scan/scan.ts` | a list of extremes | Space-separated settings to move each font by, `key=value[,key=value]` |
| `SLICE` | `scan/scan.ts` | `0/1` | `i/n`: scan the i-th of n shares of the fonts, to run several at once |
| `OUT_FILE` | `scan/scan.ts` | `.tools/out/scan.jsonl` | Where the scan writes |
| `CDP_PORT` | `browser/chrome.sh`, `browser/cdp.mjs` | 9333 | Chrome's DevTools port |
| `CHROME` | `browser/chrome.sh` | the macOS Google Chrome app | The Chrome binary; set it on Linux |
| `SHOTS` | `browser/cdp.mjs` | `.tools/out/shots` | Where screenshots go |
| `APP` | `browser/drag-bench.mjs` | 5199 | The app's port |
| `PROF` | `browser/drag-bench.mjs` | | A directory: writes a `.cpuprofile` per slider there |

The server also loads a `.env` file at the root (git-ignored); the tools don't.
