# TypeLab: notes for agents

An interactive font design playground: React editor (`client/`), Express API (`server/`), and a pure-math font
engine (`shared/engine/`) that both run. README.md has the full architecture; this is what you need to work here.

## Running things

- No system Node on the owner's Mac. `tools/node.sh <cmd>` runs any command with a suitable Node (fetched into
  `.tools/node` once), e.g. `tools/node.sh npm test`.
- `npm test`: all tests, including the golden outlines (about 20 s). `npm run typecheck`: tsc.
- `npm run render -- --style <id> --text "Rag" --out x.png`: look at letters without the app. Read the PNG.
- `npm run golden`: golden outlines, including the free fonts (needs `data/free-fonts`; about a minute).
- `npm run sweep`: dead zones in sliders.
- The owner keeps `npm run dev` running on port 5173. Run your own servers on another port with their own
  database (`PORT=5199 DB_PATH=.tools/test.db`) and stop them by PID; never `pkill` by pattern.
- Browser checks: `tools/browser/chrome.sh` and `tools/browser/cdp.mjs` (see tools/README.md).

## Where things go

| To change... | Edit |
| --- | --- |
| A setting (default, options, page, label, copy) | `shared/params/spec.ts`, plus its field in `shared/params/model.ts` |
| How a setting draws | `shared/engine/` (`font.ts` is the hub; `glyph.ts` builds one letter; see README's table) |
| A letter's skeleton | `shared/engine/glyphs.ts` (script: `script.ts`, swashes: `swash.ts`, blocks: `blocks.ts`) |
| A starting style's preset | `shared/content/styles.ts` (ids never change: saved designs name them) |
| Pages, picker labels, anatomy copy, settings search | `shared/content/` (`pages.ts`, `controls.ts`, `copy.ts`, `search.ts`) |
| The control panel | `client/components/Panel.tsx` and `client/components/panel/` |
| Editor state, undo, saving | `client/state/editor.ts` |
| API, storage, export | `server/app.ts`, `server/db.ts`, `server/export.ts` |

Adding a setting: its field in `model.ts` (the compiler then asks for its spec), its entry in `spec.ts` in editor
order, the engine code, and an icon in `client/components/SliderIcons.tsx` if it's a slider (a test checks).
If saved designs need reading differently, bump `PARAMS_VERSION` and add the step to `upgradeParams` (`clean.ts`).

## Rules that hold

- The engine is pure: nothing under `shared/` touches the DOM or imports from `client/` or `server/`.
- Every numeric setting is 0..1 and every slider keeps changing the letters all the way to 100: map a value as a
  share of the most it can be, never `value × base` into a clamp (`npm run sweep` finds dead zones).
- A refactor changes no outlines: `npm test` (and `npm run golden` if you touched free-font code: `free*.ts`,
  `skin.ts`, `scan.ts`, `restyle.ts`). Update the golden files (`npm run golden:update`) only for a change you
  meant, after looking at it rendered, and commit them with that change.
- A free font's letters are the font's exactly until a setting moves away from where it was picked (`freeAt`).
- Anything that draws many glyphs renders one memo component per glyph, so slider drags stay smooth.
- Code style: each file opens with a plain-language comment saying what it holds; comments say what and why in
  the design's terms, not the code's. Match the surrounding density. UI: one typeface (Inter), light borders,
  no decorative flourishes.

## Working alongside other sessions

Several Claude sessions often edit this checkout at once, and all history lives on `main` (push straight to it,
no PRs). Before committing, `git diff` each file you touched and stage only your own hunks; check
`git diff --cached --stat` right before `git commit`, and run the tests just before. If a peer's uncommitted edits
sit in a file you changed, commit from the index rather than `git commit -- <path>` (which takes the whole working
file). For a big change, work in a scratch `git worktree` and land it at the end.

`Asset/` holds design source files (Illustrator specimen sheets, logos); they aren't code.
