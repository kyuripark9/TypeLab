`serif-masters.ts` transfers real upstream weight drawings onto TypeLab's edited source curves. It matches contour order, direction and starting node, then uses monotone arc correspondence where a source edit changed the node count. The source's curves, rather than a replacement upstream font, define the neutral master. Runtime code only interpolates the resulting compatible drawings.

The reviewed ranges are Couture 500–700, Sonnet 400–500, Vellum 400–600 and Almanac 400–600. Wider experimental ranges exposed join failures. The narrower ranges provide roughly 21–36% more ink in H and o between endpoints. Playfair's math operators, slashes and daggers have fixed upstream strokes; Couture's degree sign and Sonnet's bullet also remain fixed.

To reproduce a package, obtain the files at the exact revision, URLs and SHA-256 digests recorded in its provenance. Run the extractor against that pinned inventory, then the authoring tool. For example:

```sh
python3 tools/masters/fetch-upstream.py
python3 tools/authored/extract-masters.py --inventory tools/masters/upstream.json --style Couture --out .audit/masters/couture/Couture-extracted.json --weights 500,600,700
node --max-old-space-size=512 --import tsx tools/authored/serif-masters.ts fonts/Couture-600.json .audit/masters/couture/Couture-extracted.json .audit/masters/couture/Couture.package.json 500,600,700
```

Use `Sonnet-400i.json`, `Vellum-400.json` and `Almanac-500.json` for the other source files. Extraction verifies the font hashes. Packaging retains TypeLab and upstream notices and designer credits. Each run writes a package, SVG/PNG specimens, and a report covering every glyph at the endpoints and quarter intervals.

The geometry repairs are explicit authoring recipes:

- Couture `*`: collapse each near-center petal tip to a point seven units from the center. This removes two tiny self-crossing source islands and keeps six petals.
- Sonnet `b` and `p`: move the lower inner bowl attachment tip seven units right. The small crossing holes disappear while the intended bowl counter stays open. The yen stem join moves five units left to fill a three-square-unit hole. The `a` bowl moves five units right per 100 weight units to retain stem contact.
- Vellum `W` and `m`: preserve the original positive gap between explicitly selected serif tip groups as the stems thicken. This prevents the edited wide serifs from closing the open spaces.
- Almanac requires no repairs.

Previous `outline-v1` snapshots are unchanged. New neutral geometry differs only at the declared Couture and Sonnet repairs. The audit's enlarged before/after sheets are in `.audit/masters/couture/*-repair-review.png`; ordinary specimens are beside each package. Dense checking covered 10,405 glyph instances with zero counter/component changes, including every ten weight units across each full font and every single weight unit for the repaired glyphs. This finite sampling is a regression check, not a proof for every possible interpolated coordinate.
