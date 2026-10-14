# fonts/

TypeLab's own fonts: the 22 the Style page's cards are written in (`OWN_FAMILIES` in `shared/free-fonts.ts`), drawn
for TypeLab. Each file is a font as the engine draws it (`FreeFontData`, `shared/engine/free.ts`: 1000 units to the em,
y up), named `<Family>-<weight>[i].json`.

## Licence

Copyright 2026 TypeLab, under the SIL Open Font License, Version 1.1 (`OFL.txt`): free to use, change and share,
commercially too, and to sell what is made with them, though not a font by itself. The files here hold only the
letters: the server lays the notice and the licence's text into each font as it reads it (`ownLicense` in
shared/free-fonts.ts, server/free-fonts.ts), so the letters it serves, the web fonts the cards are set in and every
export carry them.

## Making them

They are generated: `npm run fonts:import` reads each font's specimen sheet in `Asset/After/` and writes its file here
(tools/README.md), and `npm run fonts:blocks` writes Bulwark, the Block card's, from the engine's basic block letters,
in nine weights (100 to 900, the block letters at each Weight), so Weight draws it from the nearest as built.
Change a font by changing its sheet and importing it again, not by editing these files.
