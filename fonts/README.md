# fonts/

TypeLab's own fonts: the 22 the Style page's cards are written in (`OWN_FAMILIES` in `shared/free-fonts.ts`), drawn
for TypeLab and free to use, change and share, with no licence. Each file is a font as the engine draws it
(`FreeFontData`, `shared/engine/free.ts`: 1000 units to the em, y up), named `<Family>-<weight>[i].json`.

They are generated: `npm run fonts:import` reads each font's specimen sheet in `Asset/After/` and writes its file here
(tools/README.md), and `npm run fonts:blocks` writes Bulwark, the Block card's, from the engine's basic block letters.
Change a font by changing its sheet and importing it again, not by editing these files.
