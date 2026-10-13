# client: the React editor

React 19 with zustand and react-router, built by Vite. In development the Express server mounts Vite as middleware,
so the app and `/api` share one origin (server/CLAUDE.md). The engine, settings and copy it shows come from
`shared/` (shared/CLAUDE.md, shared/engine/CLAUDE.md).

## State

**`state/editor.ts`** holds one zustand store, `useEditor`, and `actions` beside it, so components import actions
without subscribing.

- The document: `designId` (null until the first save), `name`, `styleId`, `params`. `history` holds JSON snapshots of
  `[styleId, params]` and `hi` the current one (200 kept). `saved` is the JSON of `[name, styleId, params]` at the
  last load or save; `isDirty` compares against it, and `savedName` and `markRenamed` (the header's and My designs'
  renames) read it back in that order, so the order stays.
- Editing: `setParam` changes a value live with no history entry; `commit()` records one undo step if anything
  changed. Every gesture ends with exactly one `commit` (`setOption` does both, for picks). `amend()` folds a later
  write into the newest step (a Points edit and the letters All letters carried it on to undo together).
- The Histories, kept past undo, going with a save (`designInput`, packed) and in the design file, and back with
  `loadDesign`: the font's (`versions`, shared/font-log.ts), the whole design after every undo step (`step`; `amend`
  folds into its version) with what `made` it (a style, traits, a design file); and each letter's (`log`,
  shared/letter-log.ts), the letters whose own settings or drawing a step changed, as each then stood (none for a
  style, traits or a file: a `quiet` step). `stepDesign` reads the design at the newest step off the newest version
  where it is that, rather than parsing the step. `restoreVersion` and `restoreLetter` bring the font or a letter back
  in one undo step (`broughtBack` tells CarryOffer that step is no edit made in Points).
- One letter: while `scope` is `'letter'` (the inspector's Only <letter>), `letterOf(s)` is the inspected letter and a
  setting a letter can own goes into `params.glyphs[ch]` (`withGlyph`; global ones still go to the top level). A
  letter with no values of its own has no entry. `paramOf`/`useParam` read the value a control shows. `setEnd` and
  `resetEnd` set a customized letter's own values by id; `OwnKey` lists those maps and `OWN_CONTROL` the control each
  belongs to.
- Fonts: `fontFor(params)` builds one `Font` per params object (a WeakMap), lending the last build's letters where
  only the drawings differ, and fetches the free fonts a build is missing. `useFont()` is the design's font;
  `useScopedFont()` is the font controls act on (the inspected letter's own while customizing).
- Free fonts: `loadStyle` starts a style in its free font (`freeFont`, `freeAt`, and letter and word spacing at their
  defaults, where the engine adds nothing to the font's own spacing), and the font's letters are the design's to
  shape: there is no switch to letters built from the settings (only Blocks styles and designs saved before free fonts
  have those). When a free font arrives, the open design gets a fresh params object so it draws again.
- The Style page: filters (`groups`, `moods`, `query`), the finder (`finder`: ask what kind of letters first),
  traits (`traits`, `adjustedParams`, cached per style and trait set), and `picked`: while the design's params still
  equal the JSON picked on the Style page, trait changes re-apply to it.
- Saving: `designInput(s)` is what a save sends; EditorPage registers its save flow with `onSaveRequest`, and
  `actions.requestSave()` reaches it from anywhere (the panel's last page).
- UI: `category`, `active`, `hot`, `inspect`, `penMode`, `construction`, `mirror`, `snap`, `folded`, `tips`,
  `switchedOn`, `part`, `hotEnd`, `toast`, `navOpen`, `exportOpen`, `stylePanelOpen` (the phone's sheet).

**`state/auth.ts`**: `useAuth` with `user` (undefined until the server answers, null when signed out), `google`
(whether the server offers it), the sign-in `dialog`, `googleWaiting`. Google sign-in runs in a popup that reports on
the BroadcastChannel `'typelab-auth'` (`{ type: 'google', result }`); without a popup the result comes back in
`?google=`, which `auth.start()` takes off the address before the router is created (`main.tsx`). Tabs also post
`{ type: 'changed' }` on sign-in and sign-out. Treat `undefined` as unknown, never as signed out.

## Map

| Path | Holds |
| --- | --- |
| `main.tsx` | The router: one `EditorPage` serves `/` and `/d/:id` (a pathless layout route, so a first save doesn't remount it), `/designs`, `/account`, Page not found. A data router (`createBrowserRouter`), as the leave guard's `useBlocker` needs. `AuthDialog` and `Intro` sit outside it, so they use no router hooks |
| `pages/EditorPage.tsx` | Loading the design in the address, `useSave` (a first save of an Untitled font asks for a name; a 404 on update saves it as new), `useShortcuts`, `useLeaveGuard`, `useDeepLinks` |
| `pages/LibraryPage.tsx` | My designs: cards or list, search, sort, rename, duplicate, download; a delete waits `ACTION_TOAST_MS` for Undo and is sent on `pagehide` |
| `pages/AccountPage.tsx` | Name, Google and password, other browsers, closing the account |
| `components/Header.tsx` | Logo, the design's name, undo and redo, History (`FontHistory.tsx`), Guide, My designs, Save, and Export, a window in the middle of the screen (`exportOpen`): the styles of the design's family to save fill it (one as an `.otf`, several as one `.zip`; the design's own picked each time it opens), and a side beside them holds the font's name and Download, and at its foot three small buttons: All letters (the specimen `.svg`) and Design file (`.typelab.json`), which leave the window open, and Open design file…; errors show beside their buttons, since a toast sits under the window (one column on phones) |
| `components/Chrome.tsx` | `Nav` (pages, Find a setting on ⌘K; both only what the letters take, `pagesFor`, so blocks have no Serifs), `GlyphStrip` (one memo `StripCell` per glyph), `Toast` |
| `components/Stage.tsx` | The Type something bar; on the Style page the Help me choose / Browse all switch, the finder and the style cards (each in its free font as a web font, or, for a style built from blocks, which has none, in the engine's letters: `BuiltText.tsx`; 48 px in the list, 32 px and two lines in the grid), and the foot with Customize; elsewhere the preview and the inspector |
| `components/Finder.tsx` | The style finder's one question, what kind of letters (the Category); its answer is the `groups` filter, and the way back to the question sits over the cards it leaves (`FinderBack`) |
| `components/Preview.tsx`, `GlyphDefs.tsx` | The live preview, every letter a `<use>` of `#g<code>` defined once in GlyphDefs, with highlights `#h<code>` |
| `components/Inspector.tsx` | One letter, large: its parts live, drags through `lib/drag.ts`, a click on a part scrolls to its setting (opening the page it's on), Parts/Points, All letters/Only <letter> (and Reset, and History: `LetterHistory.tsx`; in Points by shape: All letters carries each edit on to the letters shaped the same way, and the banner names those shaped as the picked points, `useMates`), the construction grid toggle, and a one-line banner over the canvas for what those switches don't say; `letterControls` |
| `components/PenCanvas.tsx` | Points mode: Selection, the tool a letter opens with (whole shapes: a box, standing as turned as they are (`Frame`; turned while picked, else `turnOf`), scales them along its sides by its handles and turns them from just outside a corner, Illustrator's cursors drawn as SVG here, a knob inside each corner rounds them all, ⌥-click on a knob cycles round, cut, scooped; ⌥-drag copies, the bar's W, H, turn and Weight; ⌘C ⌘X ⌘V carry shapes between letters, in place; the tool picked stays from letter to letter), Direct selection, Pen, Convert point, the Shape tool (strokes as thick as the letter's, boxes, rounds, polygons), Corners (round, cut or scoop the picked corners or every one, outside and inside apart; a picked corner's handle drags its radius), Overlaps (Merge, Cut out, Break apart with a Gap), Mirror, Snap (`SNAPS`); the bar's actions on what is picked (`ACTS`: the flips, Reverse direction, Delete), each one checked under ⋯ a button on the bar, dimmed where it doesn't apply (the flips until changed, and every one on a touch screen; `PREFS.penActions`) and all of them under ⋯ (`ActMenu`), its menus kept inside the window (`useInWindow`); after each edit `CarryOffer.tsx` finds the other letters shaped the same way there, and the letter's own other places (`lib/carry.ts`): with All letters it carries the edit on to them at once, in the edit's undo step (`actions.amend`), and with Only <letter> offers it as a pill in the canvas's bottom right corner, opening to a card of the letters by kind (close matches of the letter's kind picked, each a toggle drawn with the change in, hovered one shown large); the last change applied stays there on every letter while the page is open, to review (`useApplied`), and unanswered offers come back with their letter (`bases`) |
| `components/ConstructionGrid.tsx` | The grid drawn through the inspected letter and the bar naming its group |
| `components/FontHistory.tsx` | History, the clock beside undo and redo (on phones too, where those are hidden), dimmed till the font changes: the whole font after each change, newest first, each drawn small as Ag (or the letters it changed on their own) in that version (`versionFont`, built from the design's font), what made it and when, Now marked; a pick is `restoreVersion` |
| `components/LetterHistory.tsx` | History, in the inspector's head while the letter has a record (a clock button, so the head keeps to one line): how the letter stood after each edit, newest first, each drawn small as it would stand in the design now (from the design's font, a few rows a frame), what made it and when, the one it stands as marked Now, the font's own letter at the foot; a pick is `restoreLetter` (or Reset). The menu moves right where it would run out of the window |
| `components/Panel.tsx`, `panel/` | The right-hand panel (below) |
| `components/Diagram.tsx` | The explainer's live diagrams; its icon caches last the session and depend only on their props |
| `components/Family.tsx`, `Account.tsx`, `Guide.tsx`, `Intro.tsx`, `Dialog.tsx` | The Export window's styles of the family, each a toggle with its sample, rows named by weight alone (`FamilyPicker`; a design with letters drawn in Points draws its samples in a deferred render, as moving them to every weight takes a moment the first time, and `useFamilySamplesAhead`, in the header's Export button, moves them ahead while the editor is idle); the sign-in dialog and account button; the first-run tour; the opening title card (one SVG: the name scrambled, settled and cut through the own fonts, but the blackletter, and the latest saved fonts (`api.listDesigns`, drawn by `fontFor`, none begun as blackletter) over guide lines at each font's heights, each cut's letters coming in a way of their own (`CUTS`: its motion, an ink or orange ground, larger, rows of the name over the window, slammed down), then drawn in capitals from the logo's points (Lineup's, `client/fonts/Lineup.json`) as the pen shows them and filled, then the wordmark, the logo in Lineup over the very letters drawn); the confirm dialog |
| `components/SliderIcons.tsx`, `Icons.tsx`, `Resizer.tsx` | One icon per slider (`SLIDER_ICON_KEYS`, tested); the pages' icons; the draggable borders between panels |
| `lib/api.ts` | Every `/api` request (routes in server/app.ts) |
| `lib/free.ts` | Fetching and registering free fonts (`loadFreeFont`), `useFreeFonts`, the cards' web fonts (`useWebFont`, `fontStyle`: an own font from the server's file as a `FontFace` named `TypeLab <Family>`, a Google one by its stylesheet; `webFont`, the opening title card's, resolves null for one that didn't come) |
| `lib/drag.ts` | Which setting a drag on a part moves and the value that brings the part to the pointer (`dragSpec`, `solver`, `towardMore`); pure, tests/drag.test.ts |
| `lib/pen.ts` | The pen's pure operations on contours (copies, whole units), tracing (`traceOf`), strokes (`strokeContour`, `strokeWidth`), live corners (`cornersAt` tells outside from inside by the ink in the turn, `setCorners`, `cornerHandle`), shapes and their holes (`shapesOf`, `wholeShapes`), `mergeShapes`, `cutShapes`, `breakShapes` (fillets joining strokes go), picked points as one (`transformAnchors` with `turnAbout`/`scaleAbout`/`scaleAlong`, the box along turned axes `boxAlong`, how far shapes stand turned `turnOf`, run back where a flip would make ink a hole; `pickedBox`), weight (`thicknessOf` across the ink, `thicken` keeping the points, a lone bar only across, `setWeight` tried again till it reads as asked), Mirror, snapping; tests/pen.test.ts |
| `lib/carry.ts` | A change to one letter's points carried to the others: `changesOf` (against the letter as it was: the stretches that moved, each corner rounded where it stands, and a contour moved, turned, resized or taken away whole, as the Selection tool does; contours added and a letter moved whole carry nothing), `placesOf` (where another letter has that old shape, a little wider or taller allowed; `close` when the outline round it matches too, or a whole contour sits as high, the i's dot and the j's), `carryLetter` (the same points moved by as much, else the new stretch or contour put in; a corner only rounded in place; with `own`, the changed letter's other places, an n's other foot, not where it was made, `madeAt`; where a letter has the shape only mirrored, the change `flipped` left for right, turned or top for bottom, `mirrored`, never picked for you: a b's bowl in a d, ( in ), n in u; then allowing 1.5× the difference, `rough`, also only offered: a hand-drawn font's counters; a counter or dot moved, turned or resized as it was (`affine`) also goes to those doing the same though shaped otherwise, `rolesIn`, rough: a script's counters; a shape added is placed by the outline nearest its middle, close only about as high; where a letter has close places, only those get the change); pure, tests/carry.test.ts |
| `lib/history.ts` | What the two Histories share: `when`, `settingName`, `someOf`, `useDrawnRows` (a few pictures a frame, so a menu opens at once), `useInWindow` |
| `lib/reach.ts` | Whether a setting changes the letters in view (`reachOf`); tests/reach.test.ts |
| `lib/preview.ts` | The sample text, the characters on screen (`useVisibleChars`), ink boxes |
| `lib/prefs.ts`, `lib/routes.ts` | Below |
| `lib/hooks.ts` | `n1`, `useSize`, `isTyping` (every keyboard shortcut's text-field check), `useEscape`, `useDismiss`, `DRAWER_QUERY`, `PHONE_QUERY` |
| `lib/guide-labels.ts` | The guide lines and their labels (`guideLines`, `stackLabels`), shared by the inspector and the pen |

The panel (`components/Panel.tsx`, then `panel/`): `StylePanel.tsx` (the Style page's Filter and Adjust tabs; on
phones a sheet over the cards, opened from Filter in the stage's bar, as under them it would come after every card),
`ControlsPanel.tsx` (a page of controls, only its own: while a letter is inspected, those shaping its parts lead under
Parts of <letter>; `Control` picks the component for each key), `ShapeControls.tsx` (stroke ends, the a, letter forms,
serifs, fill), `SliderControl.tsx` (a slider with its number box, the crossbar's ends, Stencil and Slice), `inputs.tsx`, `LetterOwn.tsx` (a customized letter's own values), `heads.tsx` (titles, folds,
the explainer, which control is active), `reach.tsx` (the "changes nothing here" note, worked out 150 ms after the
params stop changing). A nested slider shows only where `Control` or `ShapeControls.tsx` places it
(shared/CLAUDE.md, Adding a setting).

## Preferences and addresses

`lib/prefs.ts` holds every `localStorage` key (`PREFS`) and the only code that touches storage (`readPref`,
`writePref`, `prefFlag`, `setPrefFlag`, `prefOneOf`, `prefJson`), each wrapped against storage being off. Browsers
keep these: never rename a key or change how its value is written. `tools/browser/cdp.mjs` sets `typelab.guide.seen`
and `typelab.intro.seen` by name.

`lib/routes.ts` holds the addresses (`NEW_DESIGN`, `DESIGNS`, `ACCOUNT`, `designPath`, `isDesignPath`); every link
and redirect builds them there. They never change: bookmarks point at them, the leave guard lets exactly the first
save's move to `designPath(id)` through, and styles.css hides the header's My designs link on phones by
`a[href="/designs"]`.

## Performance

- Anything that draws many glyphs renders one memo component per glyph (`GlyphDef`, `StripCell`) with stable props,
  so a deferred render can stop between glyphs for the next slider move. Glyphs on screen take the live font, the
  rest `useDeferredValue`'s.
- Fonts are built once per params object, and caches key on identity (`fontFor`, `adjustedParams`, reach.tsx's).
  Never mutate params; never build a new params object during render where a cached one would do.
- Measure drags with `tools/browser/drag-bench.mjs`, and check `npm run golden` is unchanged by a speed-up.

## DOM contracts

Code and tools find elements by these; renaming one means updating every reader.

- Controls: each control's root is a `.ctl` with `data-ctl={key}` (sub-sliders too). The inspector's `pickPart` finds
  `[data-ctl]` inside `.panel` and measures `.explainer` to scroll under it; Find a setting (Chrome.tsx) skips any
  inside `[inert]` and flashes `.found` for 1600 ms, as long as the CSS animation. `data-letter` marks a control that
  reshapes only the customized letter.
- A slider's range has `aria-label` = its spec's `tech`, not its visible label (Contrast's is `Contrast · Reverse
  contrast`); `drag-bench.mjs` matches it exactly.
- The tour's targets are `data-guide` attributes: `stage` and `type` (Stage), `panel` (Panel), `nav` and `strip`
  (Chrome), `inspector` and `scope` (Inspector), `actions` (Header). Nothing tests that each target exists.
- Glyph paths are `#g<charCode>`, highlights `#h<charCode>` (only for characters on screen); the preview's glyphs
  carry `data-c` for clicks.
- Phone CSS hides `.top-actions [aria-label=Undo]`, `[aria-label=Redo]`, `.guide-btn` and `a[href="/designs"]`.
- `data-scope` and `data-mode` on the inspector's toggles are styled; `.style-tabs [aria-selected=true]` takes focus,
  and `.sheet-btn` (the phone's Filter) when the sheet closes.
- `Resizer` finds `:scope > .nav`, `.panel`, `.strip`, `.top` inside `.editor`; its sizes are `--nav-w`, `--panel-w`,
  `--strip-h`, kept per browser.
- `DRAWER_QUERY` (`lib/hooks.ts`) is `styles.css`'s 1180px drawer width and `PHONE_QUERY` its 760px phone width;
  Escape in dialogs (`useEscape`) and claiming popovers (`useDismiss`) is caught in the capture phase so the editor's
  own Escape stays quiet.

## CSS

`styles.css` is the one stylesheet, in sections that each open with a `---------- name` comment. Colours, radii,
gaps and shadows are tokens on `:root` (`--paper`, `--surface`, `--well`, `--ink*`, `--line*`, `--accent*`,
`--sync*`, `--custom*`, `--warn*`, `--danger*`, `--sheet`, `--raise`, `--shadow`, `--radius*`, `--pill`, `--gap`, `--ui`,
`--mono`, `--display`, `--t-*`); use them, not literals. The design system is the Soren portfolio template's
(soren-template.framer.website). Type: one face for every word, Switzer (`--ui`, from Fontshare in `index.html`),
headings, buttons and tags included, on a scale of seven sizes (`--t-xs` 11px, `-s` 12, `-m` 13, `-base` 14, `-l` 16,
`-xl` 20, `-2xl` 24; a new rule takes a step, never a literal) in three weights (400 to read, 500 for names and what
you press, 600 for headings); Chivo Mono (`--mono`, Google Fonts) only for numbers, rule by rule, and in capitals for
the small name over a group (section heads, the nav's page groups, menu heads, field labels: the shared rule after
`:root` lists them; a letter named in one keeps its case in a `<span className="ch">`, as "Parts of a" isn't
"Parts of A"); Lineup (`--display`, `client/fonts/Lineup.otf`, written by `npm run fonts:ui` from
`Asset/lineup.typelab.json`, one weight, never bolded) only for the logo, in capitals, the header's and the opening's
(which draws it first from `client/fonts/Lineup.json`, its capitals' outlines, written with it): the design was drawn
for capitals, and its small letters run into each other. The Feeling names are the one exception, each in an own
font (`.feel`). Labels drawn in the canvases and diagrams take `--t-xs` too. Text runs at a line height of 1.45,
headings at 1.25.
Colours are a type specimen sheet's: black ink on light ivory paper (`#f7f2e9`), paler ivory sheets, warm greys,
a warm grey like its construction lines (`#e6ddd0`) for hairlines, tags and tracks, and its point markers' orange
(`#cc4516`, deep enough for white on it) as the one accent. Sheets, cards, tiles and menus are square and flat
(`--radius`, `-l`, `-xl` are 0; only what floats casts `--shadow`); what you press is a pill (`--radius-s`, `--pill`);
a section head is an orange square, its name and a hairline (`.group-head`); no decorative flourishes. An edit's scope
is coloured through `var(--accent…)` and the sliders' `--fill`: `.inspector`, `.preview` and the settings panel set
them to `--sync` (every letter changes, the orange), and the `.customizing` wrappers and `.ctl[data-letter]` to the
blue `--custom` (one letter alone); elsewhere the accent is the same orange. Class
prefixes: `.pv-` preview, `.i-` inspector canvas, `.pen-`, `.d-` diagrams, `.ex-` explainer text, `.ctl-`, `.lib-`,
`.acct-`. Some class names are built at runtime (`lib-${view}`,
`resize-${side}`, Diagram's arguments, and the `x`/`y` class Resizer puts on `body` while dragging), so search for the
bare word before deleting a rule.
Widths: 1280px, 1180px (the drawer), 760px (phones), 640px, 600px. `prefers-reduced-motion` turns every transition
and animation off, so time UI with JS timers, never `transitionend`.

## Checking in a browser

1. Run a server of your own, never the owner's 5173:
   `PORT=5199 DB_PATH=.tools/test.db tools/node.sh node --import tsx server/index.ts &`, noting its PID. Other sessions
   may hold 5199 and 9333: pick your own port and `CDP_PORT`, and pass the same `CDP_PORT` (and `APP` for
   drag-bench) to the scripts.
2. `tools/browser/chrome.sh` starts a headless Chrome on `CDP_PORT` (9333) with its own profile; set `CHROME` off
   macOS.
3. From a script: `const p = await openTab()` (from `tools/browser/cdp.mjs`; it marks the tour and the title card as
   seen), `await p.go('http://127.0.0.1:5199/?style=serif&active=weight')`, `await p.shot('name')` (to
   `.tools/out/shots/`), `p.close()`. Open a fresh tab per URL: a second `go()` can hang on the unsaved-changes guard.
   Phones: `openTab({ width: 390, height: 844, mobile: true })`. Drive state through the UI; an `import()` from `ev()`
   gets a separate copy of the app's modules.
4. Read the screenshots. Console errors: `p.events` holds every CDP event since the tab opened; look for
   `Runtime.exceptionThrown`, `Runtime.consoleAPICalled` with `params.type === 'error'`, and `Log.entryAdded` with
   `params.entry.level === 'error'`.
5. Stop the server with `kill <pid>` and Chrome with `tools/browser/chrome.sh stop` (same `CDP_PORT`).

Deep links set up a view directly: `?style`, `text`, `cat` (a page, a group, or an older name), `active` (a control
or nested slider; it opens its page), `inspect`, `hot`, `pen` (`useDeepLinks` in EditorPage). A first visit without
a query string starts the tour.
