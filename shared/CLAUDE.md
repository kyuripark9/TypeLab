# shared: settings, content, and what client and server share

Everything here runs in the browser and on the server alike, so nothing touches the DOM or imports from `client/` or
`server/` (tests/boundaries.test.ts). The font engine has its own notes in `engine/CLAUDE.md`.

| Path | Holds |
| --- | --- |
| `params/model.ts` | `Params`, the settings a design is: every number 0..1, options, per-letter maps |
| `params/spec.ts` | `SPECS`, one entry per setting, and everything read off it |
| `params/options.ts` | The named choices (`TERMINALS`, `TERMINAL_FORMS`, `SERIF_SHAPES`, `FILLS`, the letter forms...) and `formOf` |
| `params/scales.ts` | The id formats a letter's own values are kept under, and the scales that turn 0..1 into lengths and angles |
| `params/clean.ts` | Reading settings from outside: `PARAMS_VERSION`, `upgradeParams`, `sanitizeParams`, `isValidParams` |
| `content/styles.ts` | The starting styles (`STYLES`), the Style page's cards (`PAGE_STYLES`) and Feeling chips (`FEELINGS`, those `FEELING_MIN` cards carry), `styleById` |
| `content/tags.ts` | Style tags: Category (`StyleGroup`), Classification (`Kind`, `KIND_SECTIONS`), Appearance (`Look`, read off the settings), Feeling (`Mood`, `MOODS`, each with the `card` whose own font names its chip); `styleMatches`, `searchMatches` |
| `content/pages.ts` | The editor's pages (`CATEGORIES`), their groups (`GROUPS`), older page names (`OLD_GROUPS`), `pageOf` |
| `content/controls.ts` | `CONTROLS`, `SUBS` and each control's `*_SUBS`, the pickers' options and finer sliders, `PART_CONTROL`, `controlFor`, `firstControl` |
| `content/copy.ts` | `ANATOMY` (part id to name and definition), `TEXTS` (sample text) |
| `content/search.ts` | Find a setting: `findSettings`, `ALSO` (words people use that the copy doesn't) |
| `free-fonts.ts` | TypeLab's own fonts (`OWN_FAMILIES`) and the Google families (`FREE_FAMILIES`), each style's font (`STYLE_FONTS`), the fonts the own ones replaced (`OLD_FONTS`, `ownFontOf`), font ids, `nearestFont`, `withoutReserved` |
| `family.ts` | A font family: `WEIGHTS`, `FAMILY_STYLES`, `familyMember(s)`, the anchor weight, `ownStyle`, `SLANTED`; lighter weights keep the design's hairline (`keepHairline`) |
| `traits.ts` | The Style page's Adjust tab: `TRAIT_SECTIONS`, `applyTraits`, `traitsKey` |
| `letter-log.ts` | Each letter's record of its own edits, kept with a design beside its settings: `LetterEdit`, `recordEdits`, `withOwn`, `sameOwn`, `packLog`/`cleanLog` (saved packed: a drawing leaves out the settings it was drawn at where the one before it has them), `upgradeLog`, `mergeLogs`; `LOG_KEEP` edits a letter, `LOG_BYTES` a design |
| `font-log.ts` | The font's History, kept with a design beside its settings: `FontVersion` (the whole design after a change, the settings and letters it changed, what made it), `recordVersion`, `sameDesign`, `packVersions`/`cleanVersions` (saved packed: each version only what changed from the one before, the first whole), `upgradeVersions`, `mergeVersions`; `VERSIONS_KEEP`, `VERSIONS_BYTES` |
| `design.ts`, `account.ts` | What client and server exchange: `Design`, `DesignInput`, `cleanName`, `slug`; `User`, `EmailCheck`, `GoogleResult`, the sign-up rules |

## The settings spec

`SPECS` in `params/spec.ts` has exactly one entry per `Params` key, of that key's type; the compiler checks both ways,
so `model.ts` and `spec.ts` change together. An entry is written inline with `num`, `bool`, `option`, `ids`,
`fontSpec` or `value`, which keep `parent`, `global` and `free` as literal types. Each has a `kind` (how `cleanValue`
checks it), a `default`, and:

- `global`: every letter shares it (heights, spacing, fills, the macros). A letter can't own it, and `cleanGlyphs`
  drops a letter's saved value of it on reading, so making a setting global loses what letters were saved with.
- `free`: a free font's letters follow it, as far as it moves from where the font was picked. It joins
  `FREE_AT_KEYS`; `sanitizeParams` fills an older design's `freeAt` with the design's own value; and the free-font code
  has to move the letters for it (engine/CLAUDE.md), checked with `npm run golden` once `FREE_MOVES` in tools/golden.ts
  moves it.
- `control`: a `ControlDef` on a page (`cat`): `label` (short title), `friendly` (plain words, the explainer's title),
  `tech` (the typographer's term: screen readers, search, and the slider's `aria-label`, which
  `tools/browser/drag-bench.mjs` finds it by), `lo`/`hi`, `demo`, `explain`, `type` (which picker; none is a slider),
  `zoom`, `bipolar`, `degrees`, `advanced`, and `off` (an optional slider's value where it does nothing, which gives it
  a switch).
- `sub`: a slider nested under control `parent`. `stencil` and `slice` are each a control and a sub of themselves:
  their Thickness slider shares the key.

Read off it: `PARAM_KEYS`, `DEFAULTS` (frozen), `isGlyphKey`, `FREE_AT_KEYS`, `freeAtOf(p)` (the one way to record
the settings a free font is picked at: the editor, tools/lib.ts, golden and the scan use it), `ID_KEYS` (`IdKey`),
and the types `ControlKey`,
`SubKey`, `SubKeyOf<P>`, `GlobalKey`, `FreeKey`, `NumericParam`; `content/controls.ts` reads `CONTROLS` and the subs.
Order matters: a page shows its controls in `SPECS` order (a shape picker before the sliders that tune it, the
optional ones after, advanced last). Nested sliders follow `SPECS` order only where the panel maps a whole `*_SUBS`
(`FILL_SUBS`, `SERIF_INNER_SUBS`, `STENCIL_SUBS`, `SLICE_SUBS`); elsewhere they follow the lists or hand placement in
step 5 below. tests/pages.test.ts checks only that advanced controls close each page, and bowlForm before squareness,
bends before apex.

## Adding a setting

1. Its field in `params/model.ts`; the compiler then asks for its spec.
2. Its entry in `params/spec.ts`, in editor order. Its default must draw today's letters: saved designs and every
   style lacking the key read the default (`sanitizeParams` fills `DEFAULTS`; `style()` lays params over `DEFAULTS`),
   so golden's `defaults` and `style:` lines must not move when it is added; only `new probe` lines may appear.
3. The engine code that draws it, mapping the value as a share of its range so it changes the letters up to 1.
4. A slider (a control without `type`, or a sub) needs an icon: an entry keyed by the setting in `SLIDER` in
   `client/components/SliderIcons.tsx` (`SLIDER_ICON_KEYS` is read off it; tests/icons.test.ts fails on a slider
   without one, or an entry that isn't a slider).
5. A sub shows only where the panel places it: through `FILL_SUBS`, `SERIF_INNER_SUBS`, `STENCIL_SUBS`, `SLICE_SUBS`,
   `TERMINAL_DETAILS`, `SERIF_SIZES`/`SERIF_DETAILS` or `SERIF_TIP_DETAILS`, or by hand in `Control`
   (`client/components/panel/ControlsPanel.tsx`), `client/components/panel/ShapeControls.tsx`, or `BarEndsControl`
   (`client/components/panel/SliderControl.tsx`). Nothing tests this.
   A sub under a control with no `*_SUBS` yet needs one in `content/controls.ts`, spread into `SUBS` (compile check).
6. An option setting needs its values in `params/options.ts`. A letter-shape picker is `type: 'form'` with a
   `FORM_OPTIONS` entry (compile check); any other picked setting needs its choices in `CHOICES`
   (`client/lib/reach.ts`), or its control is dimmed as changing nothing. Only `type: 'form'` is a generic picker; the
   other types ('options', 'story', 'serif', 'serifForm', 'fill') are bespoke components in ShapeControls.tsx that draw
   fixed keys. A new non-shape picker needs its own component and a branch in `Control`, its labels in a `*_OPTIONS`
   list (content/controls.ts), and those labels in `shapes` in `settingIndex` (content/search.ts), so search finds
   them.
7. `global` and `free` as above. `free: true` also needs the free-font work in engine/CLAUDE.md (`SKIN_KEYS`,
   `restyled`'s cache key, `FORM_LETTERS` for a letter-form setting) and a `FREE_MOVES` entry in tools/golden.ts; then
   `npm run golden`.
   If it shapes letters built from blocks, add it to `BLOCK_CONTROLS` (content/controls.ts), under the Block letters
   it reaches (basic, slots, grid): every other control is hidden while Built from is Blocks, and a page with none of
   them is left out of the navigation (`pagesFor`). If it shapes a definite part, give it a case in `highlightD` or a `RINGS` entry
   (engine/highlight.ts), or the explainer, inspector and preview light nothing up for it.
8. Words people use for it that its copy lacks go in `ALSO` (`content/search.ts`).
9. `npm run typecheck` (the compile checks above are types only; `npm test` runs through tsx and doesn't check them).
   Then `npm test` fails on golden's `new probe` lines for its values (`<key>=0`/`<key>=1` for a number,
   `<key>=true|false` for a switch, `<key>=<option>` for each other option): render them, then `npm run golden:update`.
   Then `npm run sweep -- <key>`. A setting that changes nothing until another is set (a form's finer slider, a cut's
   Position, a script-only setting) needs that context in `showContext` (tools/lib.ts); without it golden probes it
   where it does nothing and the sweep reports it dead.
10. If saved designs need reading differently, bump `PARAMS_VERSION` and add the step to `upgradeParams`.

## Ids and saved formats

These live in saved designs, settings files, links and caches, so they never change: setting keys; option values
(dropping one without a mapping in `cleanValue` resets those designs to the default); style ids; free-font ids
(`'Family:weight'` plus `i` for an italic, `'Roboto:600i'`); and the per-letter ids in `params/scales.ts`: stroke
`'3'`, end `'0s'`/`'p1e'` (`p` a plain end), corner `'0t1'`/`'0sl'`/`'1j0'`, turn `'0t1'`, join `'2e'` or a turn id,
each number one or two digits. `sanitizeParams` silently drops a value whose id doesn't match its test. The first form
of each `TERMINAL_FORMS` kind is its fallback (`formOf`) and the form the Stroke ends trait picks. A drawn letter's
points (`params.outlines`, `Node` in engine/outline.ts) keep their keys too: `x y ix iy ox oy s`, and a live corner's
`r` and `corner` (`'cut'` or `'scoop'`; a round has none), which `cleanDrawn` reads; and a drawing keeps the
settings it was drawn at (`Drawn.at`, every setting but `glyphs` and `outlines`, the letter's own laid in:
`DRAWN_AT_KEYS`, `drawnAtOf`), which `cleanOutlines` reads (one left out stands at its default). The editor's
`setParam('outlines', …)` gives each new drawing its `at`.

## PARAMS_VERSION and the compatibility code that stays

`PARAMS_VERSION` is 5. `sanitizeParams` doesn't upgrade: every reader of stored or imported settings calls
`upgradeParams(src, version)` first (server/db.ts once per database, recorded in `PRAGMA user_version`; the
`.typelab.json` import in `client/components/Header.tsx`, a file without a version being version 1). Version 1
kept the Lowercase height on its first scale (`xHeightFromOld`); version 2 had only slot blocks, so a design (or a
letter) built from blocks then reads `blockForm: 'slots'`; version 3 drawings stood as drawn whatever the settings,
so each reads as drawn at its design's settings (`drawnAtDesign`), where it stands as it did; version 4 grid fills had Size on an even scale of 30 cells in the cap height to 7 and dots their Spread from 0.3 to 1.75 of their size, so a grid fill's Size (`moduleFromOld`) and a dot fill's Spread (`dotGainFromOld`) are read onto today's wider scales (`gridScales`), a drawing's settings too. The Histories hold
settings too: each letter's record (`letter-log.ts`) and the font's versions (`font-log.ts`) are brought up with their
design wherever `upgradeParams` runs (`upgradeLog`, `upgradeVersions`), and their fields (`t`, `keys`, `own`, `drawn`,
`back`, `by`; `letters`, `made`, `base`, `styleId`, `set`, `glyphs`, `outlines`) keep their names.

`isValidParams` accepts only input `sanitizeParams` would leave unchanged (a `freeAt` may lack keys), so the client
always sends complete, current settings or the API answers 400.

Keep, as compatibility: `fromOldContrast` and `contrastFromOld` (a separate `reverse`), the `'outline-inline'` fill
read as `'outline'`, `xHeightFromOld` and `XH_OLD` (engine/font.ts), `freeAt` filled in for older designs, and
`OLD_GROUPS` in `content/pages.ts` (older links' `?cat=structure`, `proportion`, `personality`).

## Content

- **Styles** (`content/styles.ts`): `style(id, group, kinds, name, moods, like, desc, params)`, its params laid over
  `DEFAULTS`. Ids never change and never leave `STYLES`: saved designs and `?style=` links name them, and the API
  refuses a design whose `styleId` isn't known. `PAGE_ORDER` picks the 22 cards (`PAGE_STYLES`), all solid letters,
  each written in one of TypeLab's own fonts: Block (`block`, Category Blocks) in Bulwark, the engine's basic block
  letters made a font (so every setting reaches it as it reaches the other cards; Built from: Blocks gives the block
  letters themselves, plain, slotted or on a grid). Slot Blocks (`slotblocks`) stays in STYLES off the page. Every
  style keys `STYLE_FONTS` but those built from blocks, which no font draws (their card draws the
  engine's letters, `client/components/BuiltText.tsx`). `tools/fit/apply.ts` rewrites a style's params
  object in place, finding `style('<id>',` by text and its params as the first `{` outside quotes: keep that layout,
  with the style's own letters under `glyphs:` inside it. tests/styles.test.ts and tests/free-fonts.test.ts check the
  cards, Feelings and fonts.
- **Pages** (`content/pages.ts`): `CATEGORIES` in navigation order, each with a `hint` (its tooltip) and, all but
  Style, a group; `GROUPS` names the groups Proportions, Shapes and Details. `pageOf` reads a page id, then `OLD_GROUPS`, then a group
  (which opens its first page).
- **Controls** (`content/controls.ts`): `CONTROLS` and `SUBS` come from the specs; `FORM_OPTIONS` (each shape drawn as
  a letter `ch`), the option label lists, `TERMINAL_SHAPES` (every kind and form of stroke end as one list, in
  families; tests/pages.test.ts checks each is there once), `TERMINAL_DETAILS`, `SERIF_SIZES`, `SERIF_DETAILS`,
  `SERIF_TIP_DETAILS`; `BLOCK_CONTROLS` (all that shows while Built from is Blocks, by Block letters), `controlInUse`
  and `pagesFor` (the controls and pages a design's letters take: the navigation, the page steps and Find a setting
  offer only those); `PART_CONTROL`
  (anatomy part to the control that shapes it); `controlFor` (a sub to its parent).
- **Copy and search**: `ANATOMY` in `content/copy.ts` names every part the inspector can point at; `findSettings`
  searches the controls' words, `ALSO`, and the shapes they offer.

## Families, free fonts, traits

- `free-fonts.ts`: `OWN_FAMILIES` are TypeLab's own fonts, one per Style page card (Mainline, Parlance,
  Compass, Cotton, Turnpike, Orbital, Gumdrop, Almanac, Vellum, Couture, Sonnet, Ballyhoo, Hearth, Timber, Kernel,
  Dispatch, Funnies, Jotter, Boardwalk, Serenade, Cathedral, Bulwark): drawn for TypeLab on the sheets in `Asset/After/`
  (`sheet`), each in one weight, upright or (Sonnet) italic, TypeLab's under the SIL Open Font License (`ownLicense`,
  fonts/README.md); `tools/fonts/import.ts` makes them into
  `fonts/`, which the server reads instead of fetching. Bulwark (`blocks`), the Block card's, has no sheet: it is the
  engine's basic block letters at the settings `tools/fonts/blocks.ts` builds them at (`npm run fonts:blocks`), in
  nine weights (`weights`, 100 to 900, each the block letters at that Weight, its card's the 700), so Weight draws it
  from the nearest as a Google family's (a thin 8's waist stays clean, where moving the 700 so far swelled it), and
  its short heavy stroke ends take another kind of end on the stub itself, and Bowls, Corners, Facets and Curves
  reshape its bowls by their rounded corners (`RestyleCtx.stubs`, `restyleBlockBowls` in engine/restyle.ts). They replaced the Google families in `OLD_FONTS`:
  `sanitizeParams` reads a saved id of one as its own font (`ownFontOf`). `FREE_FAMILIES` lists them (`own`,
  `license: null`) with the Google families, each with its weights and italics up to 900, its licence folder (`ofl` or
  `apache`), its reserved names, `grid` for a pixel font (VT323, Silkscreen) that only stretches, and `freeExits` for a
  script whose letters stand apart (Serenade, unlike Boardwalk), whose exit strokes Length and Curl move. `parseFontId`
  accepts only a listed family at a weight it comes in; `nearestFont` is the font a design draws from as Weight and
  Slant move (a family in one weight or only an italic gives that font); `withoutReserved` takes the family's own and
  reserved names out of an exported font's name (OFL; an own font reserves nothing). Own fonts' names are font ids in
  saved designs: never rename one.
- `family.ts`: the nine `WEIGHTS` (Regular at index 3, Bold at 6), their places on the Weight slider (`at`; 0.4 is
  Regular, as Weight 0.4 is the default and a free font's 400), the anchor (`anchorOf`: the weight the design's stems
  read as, the Weight that draws stems as thick with Verticals as drawn, so Weight 65 at Verticals 97 is a Black), and
  `familyMember`. A family steps by stems (Metrics.s): `stemRatio` spreads them evenly from the design's to the lightest
  and heaviest weights' stems, and each member's Weight is solved to draw them (past either end of the slider, its
  Verticals too); each letter's own weight follows, and its own slant leans. A lighter weight keeps the design's
  hairline (`keepHairline`): its Contrast lowered (then its Horizontals raised) till its H's crossbar is as thick as
  the design's, never past `HAIR_MOST` of its own stems, so a Didone's Thin to Medium keep their hairlines; a design
  with less contrast keeps less of it (`HAIR_KEEP`: whole up to a hairline a fifth of the stems, thinned with the stems
  as before from 0.45 of them, a sans or a book face), and a heavier weight is left as it was. The engine's stroked
  letters are read by their measures (Metrics.hT); a free font's (whose skin squeezes a contrasty font's hairlines
  more than hT says) and block letters off the letters themselves, a few H's drawn per weight, kept per params object
  and shared by a weight's upright and italic; a letter's own Contrast and Horizontals move as much. It marks the
  member's params (`drawnFrom`)
  so the engine moves letters drawn in Points from the design to its weight and lean (engine/family-drawn.ts): a copy
  of a member's params draws them unmoved. Italics lean 0.55
  (about 11°) unless the design is slanted past `SLANTED` (0.05) already. `FAMILY_STYLES` names the eighteen styles
  (uprights, then italics) and `ownStyle` the one the design is by itself: the Export window saves any of them, one or several.
- `traits.ts`: each trait's steps set a few settings; `applyTraits` lays them in `TRAITS` order and `traitsKey`
  depends on that order. The Cuts steps set joints, stencil and slice together so they stay exclusive.
