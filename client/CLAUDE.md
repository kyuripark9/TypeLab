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
  changed. Every gesture ends with exactly one `commit` (`setOption` does both, for picks).
- One letter: while `scope` is `'letter'` (the inspector's Customize), `letterOf(s)` is the inspected letter and a
  setting a letter can own goes into `params.glyphs[ch]` (`withGlyph`; global ones still go to the top level). A
  letter with no values of its own has no entry. `paramOf`/`useParam` read the value a control shows. `setEnd` and
  `resetEnd` set a customized letter's own values by id; `OwnKey` lists those maps and `OWN_CONTROL` the control each
  belongs to.
- Fonts: `fontFor(params)` builds one `Font` per params object (a WeakMap), lending the last build's letters where
  only the drawings differ, and fetches the free fonts a build is missing. `useFont()` is the design's font;
  `useScopedFont()` is the font controls act on (the inspected letter's own while customizing).
- Free fonts: `loadStyle` starts a style in its free font (`freeFont`, `freeAt`, and letter and word spacing at their
  defaults, where the engine adds nothing to the font's own spacing); `setFreeLetters` switches between the free font
  and built letters, swapping the spacing back and forth. When a free font arrives, the open design gets a fresh
  params object so it draws again.
- The Style page: filters (`groups`, `moods`, `query`), the finder (`finder`: ask what kind of letters first),
  traits (`traits`, `adjustedParams`, cached per style and trait set), and `picked`: while the design's params still
  equal the JSON picked on the Style page, trait changes re-apply to it.
- Saving: `designInput(s)` is what a save sends; EditorPage registers its save flow with `onSaveRequest`, and
  `actions.requestSave()` reaches it from anywhere (the panel's last page).
- UI: `category`, `active`, `hot`, `inspect`, `penMode`, `construction`, `mirror`, `snap`, `folded`, `tips`,
  `switchedOn`, `part`, `hotEnd`, `toast`, `navOpen`, `exportOpen`.

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
| `components/Header.tsx` | Logo, the design's name, undo and redo, Guide, My designs, Save, and Export, a window in the middle of the screen (`exportOpen`): the styles of the design's family to save fill it (one as an `.otf`, several as one `.zip`; the design's own picked each time it opens), and a side beside them holds the font's name and Download, and at its foot three small buttons: All letters (the specimen `.svg`) and Design file (`.typelab.json`), which leave the window open, and Open design file…; errors show beside their buttons, since a toast sits under the window (one column on phones) |
| `components/Chrome.tsx` | `Nav` (pages, Find a setting on ⌘K), `GlyphStrip` (one memo `StripCell` per glyph), `Toast` |
| `components/Stage.tsx` | The Type something bar; on the Style page the Help me choose / Browse all switch, the finder and the style cards (each in its free font as a web font, or, for a style built from blocks, which has none, in the engine's letters: `BuiltText.tsx`; 48 px in the list, 32 px and two lines in the grid), and the foot with Customize; elsewhere the preview and the inspector |
| `components/Finder.tsx` | The style finder's one question, what kind of letters (the Category); its answer is the `groups` filter, and the way back to the question sits over the cards it leaves (`FinderBack`) |
| `components/Preview.tsx`, `GlyphDefs.tsx` | The live preview, every letter a `<use>` of `#g<code>` defined once in GlyphDefs, with highlights `#h<code>` |
| `components/Inspector.tsx` | One letter, large: its parts live, drags through `lib/drag.ts`, Shape/Points, Sync all/Customize, the construction grid toggle; `letterControls` |
| `components/PenCanvas.tsx` | Points mode: Selection (whole shapes: a box scales them by its handles and turns them from just outside a corner, ⌥-drag copies, the bar's W, H, turn, Weight and flips; ⌘C ⌘X ⌘V carry shapes between letters, in place; the tool picked stays from letter to letter), Direct selection, Pen, Convert point, the Shape tool (strokes as thick as the letter's, boxes, rounds, polygons), Corners (round, cut or scoop the picked corners or every one, outside and inside apart; a picked corner's handle drags its radius), Overlaps (Merge, Cut out, Break apart with a Gap), Sync all, Mirror, Snap (`SNAPS`); after each edit `CarryOffer.tsx` offers the same change to the other letters shaped the same way there (`lib/carry.ts`): close matches of the letter's kind picked, each letter a toggle drawn with the change in, hovered one shown large |
| `components/ConstructionGrid.tsx` | The grid drawn through the inspected letter and the bar naming its group |
| `components/Panel.tsx`, `panel/` | The right-hand panel (below) |
| `components/Diagram.tsx` | The explainer's live diagrams; its icon caches last the session and depend only on their props |
| `components/Family.tsx`, `Account.tsx`, `Guide.tsx`, `Intro.tsx`, `Dialog.tsx` | The Export window's styles of the family, each a toggle with its sample, rows named by weight alone (`FamilyPicker`; a design with letters drawn in Points draws its samples in a deferred render, as moving them to every weight takes a moment the first time); the sign-in dialog and account button; the first-run tour; the opening title card; the confirm dialog |
| `components/SliderIcons.tsx`, `Icons.tsx`, `Resizer.tsx` | One icon per slider (`SLIDER_ICON_KEYS`, tested); the pages' icons; the draggable borders between panels |
| `lib/api.ts` | Every `/api` request (routes in server/app.ts) |
| `lib/free.ts` | Fetching and registering free fonts (`loadFreeFont`), `useFreeFonts`, the cards' web fonts (`useWebFont`, `fontStyle`: an own font from the server's file as a `FontFace` named `TypeLab <Family>`, a Google one by its stylesheet) |
| `lib/drag.ts` | Which setting a drag on a part moves and the value that brings the part to the pointer (`dragSpec`, `solver`, `towardMore`); pure, tests/drag.test.ts |
| `lib/pen.ts` | The pen's pure operations on contours (copies, whole units), tracing (`traceOf`), strokes (`strokeContour`, `strokeWidth`), live corners (`cornersAt` tells outside from inside by the ink in the turn, `setCorners`, `cornerHandle`), shapes and their holes (`shapesOf`, `wholeShapes`), `mergeShapes`, `cutShapes`, `breakShapes` (fillets joining strokes go), picked points as one (`transformAnchors` with `turnAbout`/`scaleAbout`, run back where a flip would make ink a hole; `pickedBox`), weight (`thicknessOf` across the ink, `thicken` keeping the points, a lone bar only across, `setWeight` tried again till it reads as asked), Sync all, Mirror, snapping; tests/pen.test.ts |
| `lib/carry.ts` | A change to one letter's points carried to the others: `changesOf` (the stretches that changed, against the letter as it was), `placesOf` (where another letter has that old shape, a little wider or taller allowed; `close` when the outline round it matches too), `carryLetter` (the same points moved by as much, else the new stretch put in); pure, tests/carry.test.ts |
| `lib/reach.ts` | Whether a setting changes the letters in view (`reachOf`); tests/reach.test.ts |
| `lib/preview.ts` | The sample text, the characters on screen (`useVisibleChars`), ink boxes |
| `lib/prefs.ts`, `lib/routes.ts` | Below |
| `lib/hooks.ts` | `n1`, `useSize`, `isTyping` (every keyboard shortcut's text-field check), `useEscape`, `useDismiss`, `DRAWER_QUERY` |
| `lib/guide-labels.ts` | The guide lines and their labels (`guideLines`, `stackLabels`), shared by the inspector and the pen |

The panel (`components/Panel.tsx`, then `panel/`): `StylePanel.tsx` (the Style page's Filter and Adjust tabs),
`ControlsPanel.tsx` (a page of controls; `Control` picks the component for each key), `ShapeControls.tsx` (stroke
ends, the a, letter forms, serifs, fill), `SliderControl.tsx` (a slider with its number box, the crossbar's ends,
Stencil and Slice), `inputs.tsx`, `LetterOwn.tsx` (a customized letter's own values), `heads.tsx` (titles, folds,
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
- `data-scope` and `data-mode` on the inspector's toggles are styled; `.style-tabs [aria-selected=true]` takes focus.
- `Resizer` finds `:scope > .nav`, `.panel`, `.strip`, `.top` inside `.editor`; its sizes are `--nav-w`, `--panel-w`,
  `--strip-h`, kept per browser.
- `DRAWER_QUERY` (`lib/hooks.ts`) is `styles.css`'s 1180px drawer width; Escape in dialogs (`useEscape`) and
  claiming popovers (`useDismiss`) is caught in the capture phase so the editor's own Escape stays quiet.

## CSS

`styles.css` is the one stylesheet, in sections that each open with a `---------- name` comment. Colours, radii,
gaps and shadows are tokens on `:root` (`--paper`, `--surface`, `--well`, `--ink*`, `--line*`, `--accent*`,
`--custom*`, `--danger*`, `--sheet`, `--raise`, `--shadow`, `--radius*`, `--gap`); use them, not literals. One
typeface (Inter), light borders, white sheets floating on grey paper, no decorative flourishes. Anything that belongs
to one letter alone is coloured through `var(--accent…)`: the `.customizing` wrappers and `.ctl[data-letter]` swap
the accent to the orange `--custom`. Class prefixes: `.pv-` preview, `.i-` inspector canvas, `.pen-`, `.d-` diagrams,
`.ex-` explainer text, `.ctl-`, `.lib-`, `.acct-`. Some class names are built at runtime (`lib-${view}`,
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
