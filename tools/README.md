# tools/

Command-line tools for working on TypeLab without the app open. They write what they make to `.tools/out/`
(git-ignored) unless told otherwise. Run TypeScript ones with `node --import tsx <file>` or the npm script.

| Tool | What it's for |
| --- | --- |
| `node.sh` | Node for this project whether or not the machine has it: `tools/node.sh npm test`, or `export PATH="$(tools/node.sh --bin):$PATH"`. Fetches Node 24 into `.tools/node` (checksum checked) when there is no Node 22.13+. |
| `render.ts` | `npm run render -- --style serif --text "Rag" --size 200 --out x.png`: text in a design to a PNG (or `.svg`), no browser. `--set k=v` changes settings, `--free` writes it in the style's free font, `--params file.json` reads a saved design, `--sweep key` draws one row per eighth of a slider. |
| `golden.ts` | Golden outlines (`npm run golden`, `npm run golden:update`): a hash of every glyph of every starting style and every setting at its ends and options, kept in `tests/golden/`. `npm test` checks the engine set; `npm run golden` also checks the free fonts kept in `data/free-fonts`. |
| `sweep.ts` | `npm run sweep [-- keys...]`: every slider swept 0 to 1 in eighths; reports eighths that barely change the letters (dead zones). |
| `fit/` | Fitting a style's preset to its free font: `fit.ts <id>` (coordinate descent on a raster score), `forms.ts` (g, Q, a), `apply.ts` (writes fits into `shared/content/styles.ts`), `sheet.ts` (free font / before / after, to judge). |
| `scan/scan.ts` | Every free font moved by each setting in `VARS`: flags letters that come out broken (area, specks, spikes, contours). `SLICE=i/n` runs a share of the fonts. |
| `browser/` | `chrome.sh` starts a headless Chrome on its own profile (`CDP_PORT`, default 9333); `cdp.mjs` drives it (open a tab, go, click, drag, type, screenshot) over Node's built-in WebSocket; `drag-bench.mjs` measures slider drag lag. |
| `lib.ts` | Shared by the above: a style's settings, loading free fonts from the server's cache, outlines to polygons, rows of text to SVG or PNG. |

Checking the app in a browser: run a test server on its own port and database, so the dev server on 5173 and
your designs are left alone (`PORT=5199 DB_PATH=.tools/test.db npm run dev`), stop it by its PID, and open a
fresh tab per URL (the editor's unsaved-changes guard can hang a second navigation).
