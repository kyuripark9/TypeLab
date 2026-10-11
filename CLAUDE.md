# TypeLab: notes for agents

An interactive font design playground: a React editor (`client/`), an Express API (`server/`), and a pure-math font
engine (`shared/engine/`) that both of them run, with the settings (`shared/params/`) and the starting styles and UI
copy (`shared/content/`) beside it. This file routes you; each area's CLAUDE.md holds the detail.

## Commands

The owner's Mac has no system Node: `tools/node.sh <cmd>` runs any command with a suitable Node (fetched into
`.tools/node` once). Prefix every command below with it when `node` is missing.

| What | Command |
| --- | --- |
| All tests, with the engine's golden outlines (about a minute idle, most of it the golden test; longer while other sessions run) | `npm test` |
| One test file | `node --import tsx --test tests/cuts.test.ts` |
| Tests by name (the flag goes before the file; after it, it is ignored) | `node --import tsx --test --test-name-pattern "the slice" tests/cuts.test.ts` |
| Type check (client, server, shared, tests, tools) | `npm run typecheck` |
| Look at letters without the app (read the PNG) | `npm run render -- --style serif --text "Rag" --out .tools/out/x.png` |
| Golden outlines, engine and free fonts (needs `data/free-fonts`; about a minute) | `npm run golden` |
| Accept outlines you meant to change | `npm run golden:update` |
| Full engine output against a git ref (about five minutes; see tools/README.md) | `npm run compare -- [ref] [--free] [--only <style-regex>]` |
| Sliders that stop changing part way | `npm run sweep [-- keys...]` |
| TypeLab's own fonts from their sheets (`Asset/After/<n>.ai` into `fonts/`; `--check` writes nothing) | `npm run fonts:import [-- names...]` |
| A dev server of your own | `PORT=5199 DB_PATH=.tools/test.db npm run dev` |

The owner keeps `npm run dev` running on port 5173 with the real database (`data/typelab.db`). Run your own servers
on another port with their own database, and stop them by PID; never `pkill` by pattern. Other sessions may already
hold 5199 and Chrome's 9333: pick your own (`PORT=52xx DB_PATH=.tools/test-52xx.db`, `CDP_PORT=93xx`); `lsof -i :<port>`
shows whether one is taken. A new `git worktree` has no `node_modules` or `data/free-fonts` (both ignored): symlink
`node_modules` from the main checkout and run golden with `FONTS_DIR=<main checkout>/data/free-fonts`, or the free set
is skipped without failing. For one PID that stops
cleanly, start it as `PORT=5199 DB_PATH=.tools/test.db tools/node.sh node --import tsx server/index.ts &`
(server/CLAUDE.md). Browser checks: `tools/browser/` (client/CLAUDE.md, tools/README.md).

## Verification ladder

| You changed | Run | Done means |
| --- | --- | --- |
| Engine code (`shared/engine/`, the scales in `shared/params/scales.ts`) | `npm test`; `npm run compare` for a refactor | Tests pass and the golden outlines are unchanged, or changed only where you meant and updated in the same commit |
| Free-font code (`free*.ts`, `skin.ts`, `scan.ts`, `restyle.ts`) or a formula they share from `font.ts` | the above, plus `npm run golden` | The free set matches too |
| An own font (a sheet in `Asset/After/`, `tools/fonts/`) | `npm run fonts:import`, look at it (`npm run render -- --style <id> --free`), `npm test`, `npm run golden:update` | Only the letters you meant changed (the import lists them); its golden lines looked at and accepted |
| How a slider maps to geometry | the above, plus `npm run sweep -- <key>` | No new dead eighths |
| A setting's spec, a style preset, pages, copy | `npm test`, `npm run typecheck` | Pages, icons and styles tests pass; changed `style:<id>` golden lines looked at and accepted |
| Client UI | `npm run typecheck`; `npm test` if `client/lib/` or `client/components/SliderIcons.tsx` changed; a browser check | Screenshots at 1440×900 and 390×844 look right, no console errors |
| Server | `npm test` (api, free-fonts, family, params), `npm run typecheck` | Tests pass; old databases still open (server/CLAUDE.md) |
| Tools | run the tool once, `npm run typecheck` (it covers the .ts tools only; the browser `.mjs` and `.sh` tools are checked only by running them) | It does what its header says |

A visible change is done only once you have looked at it rendered (`npm run render`, or a screenshot).

## Rules that hold everywhere

- Nothing under `shared/` touches the DOM or imports from `client/` or `server/` (tests/boundaries.test.ts).
- Every numeric setting is 0..1, and every slider keeps changing the letters all the way to 100: map a value as a
  share of the most it can be, never `value × base` into a clamp (`npm run sweep` finds dead zones).
- A refactor changes no outlines. Floating-point order is behaviour: summing in another order, or swapping a local
  copy for a shared helper, can move points (shared/engine/CLAUDE.md).
- What users have saved never changes shape: setting keys, option values, style ids, free-font ids (own fonts' names included), the stroke, end,
  corner, join and turn ids, `localStorage` keys, and the addresses `/`, `/d/:id`, `/designs`, `/account`. When saved
  settings must be read differently, bump `PARAMS_VERSION` and add the step to `upgradeParams`
  (`shared/params/clean.ts`). Compatibility code (old columns, old option names, older contrast) stays.
- A glyph function keeps its strokes in their order and adds a new one after them: saved designs key a letter's own
  values by stroke index.
- A free font's letters are the font's exactly until a setting moves away from where it was picked (`freeAt`).
- Params objects are never mutated; every change makes a new one. Fonts are built once per params object.
- Anything that draws many glyphs renders one memo component per glyph, so slider drags stay smooth.
- Code style: each file opens with a plain-language comment saying what it holds; comments say what and why in the
  design's terms, not the code's. Match the surrounding density. UI: one typeface (Inter), light borders, no
  decorative flourishes.

## Where things go

| To change... | Edit | Detail |
| --- | --- | --- |
| A setting (default, options, page, label, explainer copy) | `shared/params/spec.ts`, its field in `model.ts` | shared/CLAUDE.md |
| How a setting draws | `shared/engine/` (`font.ts` metrics, `glyph.ts` stages) | shared/engine/CLAUDE.md |
| A letter's skeleton | `shared/engine/glyphs/` (`upper.ts`, `lower.ts`, `figures.ts`, `punctuation.ts`; `shared.ts`, `turns.ts`) | shared/engine/CLAUDE.md |
| Script letters, swashes | `shared/engine/script.ts` (`<ch>.scr`), `swash.ts` (`<ch>.sw`) | shared/engine/CLAUDE.md |
| Block letters (*Built from: Blocks*) | `shared/engine/blocks.ts`: corner outlines, y down, no skeleton; their Style page card is `slotblocks` (Blocks) | shared/engine/CLAUDE.md |
| Fills and the slice | `shared/engine/effects.ts`, `boolean.ts` | shared/engine/CLAUDE.md |
| The construction grid | `shared/engine/grid.ts`, `client/components/ConstructionGrid.tsx` | shared/engine/CLAUDE.md |
| Points mode: tracing, drawn letters, pen tools | `shared/engine/outline.ts`, `client/lib/pen.ts`, `client/components/PenCanvas.tsx` | client/CLAUDE.md |
| A free font's letters under the settings | `shared/engine/free-letters.ts`, `skin.ts`, `scan.ts`, `restyle.ts` | shared/engine/CLAUDE.md |
| Which free font a style is written in; families, licences | `shared/free-fonts.ts` | shared/CLAUDE.md |
| TypeLab's own fonts (the Style page's 21): their names, sheets and letters | `OWN_FAMILIES` in `shared/free-fonts.ts`; `Asset/After/<n>.ai`; `tools/fonts/`; `fonts/` (generated) | shared/CLAUDE.md, tools/README.md |
| A starting style's preset | `shared/content/styles.ts` (ids never change; `tools/fit/apply.ts` rewrites presets) | shared/CLAUDE.md |
| Pages, groups, pickers, anatomy copy, settings search | `shared/content/` (`pages.ts`, `controls.ts`, `copy.ts`, `search.ts`) | shared/CLAUDE.md |
| Style tags and Feelings; the Adjust tab's traits | `shared/content/tags.ts`; `shared/traits.ts` | shared/CLAUDE.md |
| Font family export | `shared/family.ts`, `client/components/Family.tsx`, `server/export.ts` | shared/CLAUDE.md |
| A page or route | `client/main.tsx`, `client/lib/routes.ts`, `client/pages/` | client/CLAUDE.md |
| Editor state, undo, saving, demo deep links | `client/state/editor.ts`, `client/pages/EditorPage.tsx` (`useDeepLinks`) | client/CLAUDE.md |
| The look of anything | `client/styles.css` (one sheet; tokens on `:root`) | client/CLAUDE.md |
| The control panel | `client/components/Panel.tsx`, `client/components/panel/` | client/CLAUDE.md |
| The Style page: cards, finder, filters, traits | `client/components/Stage.tsx`, `Finder.tsx`, `BuiltText.tsx`, `panel/StylePanel.tsx` | client/CLAUDE.md |
| The inspector and dragging a letter's parts | `client/components/Inspector.tsx`, `client/lib/drag.ts` | client/CLAUDE.md |
| Header and export menu; nav, glyph strip, toast; the tour; sign-in | `Header.tsx`; `Chrome.tsx`; `Guide.tsx`; `Account.tsx` and `client/state/auth.ts` | client/CLAUDE.md |
| The "changes nothing here" note | `client/lib/reach.ts`, `client/components/panel/reach.tsx` | client/CLAUDE.md |
| What a browser remembers | `client/lib/prefs.ts` (every `localStorage` key) | client/CLAUDE.md |
| API calls from the browser | `client/lib/api.ts` (routes in `server/app.ts`) | server/CLAUDE.md |
| API routes, accounts, sessions, Google sign-in | `server/app.ts`, `server/accounts.ts`, `server/google.ts` | server/CLAUDE.md |
| Storage and its upgrades | `server/db.ts` | server/CLAUDE.md |
| Fetching and caching free fonts | `server/free-fonts.ts` | server/CLAUDE.md |
| Font files, the family .zip, the specimen | `server/export.ts` | server/CLAUDE.md |
| Tests, their helpers, the golden files | `tests/` | tests/CLAUDE.md |
| Command-line tools and environment variables | `tools/` | tools/README.md |

Adding a setting touches several of these: follow the checklist in shared/CLAUDE.md.

## Working alongside other sessions

Several Claude sessions often edit this checkout at once, and all history lives on `main` (push straight to it,
no PRs). Before committing, `git diff` each file you touched and stage only your own hunks; check
`git diff --cached --stat` right before `git commit`, and run the tests just before. If a peer's uncommitted edits
sit in a file you changed, commit from the index rather than `git commit -- <path>` (which takes the whole working
file). For a big change, work in a scratch `git worktree` and land it at the end.

`Asset/` holds design source files (Illustrator specimen sheets, logos); they aren't code. `Asset/After/<n>.ai` are the
sheets TypeLab's own fonts are imported from (tools/fonts/import.ts).

## The nested docs

Claude Code loads a folder's CLAUDE.md when you work in it.

- `shared/engine/CLAUDE.md`: the pipeline from params to an outline, the file map, shared formulas, the free-font
  path, a glossary, the invariants (stroke order and ids above all), and how to verify.
- `shared/CLAUDE.md`: the settings spec, ids, `PARAMS_VERSION`; styles, pages, controls, copy; families, free
  fonts, traits.
- `client/CLAUDE.md`: the state model, a component map, performance rules, DOM contracts, CSS conventions, browser
  checks.
- `server/CLAUDE.md`: the API, ownership and accounts, database compatibility, the free-font cache, export,
  environment variables, test servers.
- `tests/CLAUDE.md`: what each test file covers, the helpers, the golden files, fixtures.
- `tools/README.md`: each tool, and every environment variable the tools and the server read.
- `README.md`: the human-facing overview and the architecture.
