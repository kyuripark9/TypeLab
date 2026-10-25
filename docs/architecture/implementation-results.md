# Implemented outline engine

New designs made from bundled source styles now use the original curves. A version 8 design stores an `outline-v1` interpreter reference and the source file's SHA-256 digest. Version 7 designs keep the legacy renderer. The user's engine-v2 worktree was not changed.

## What ships

All 30 bundled font files have immutable snapshots. The loader verifies the digest and font identity, preserves previous revisions, and reports an unavailable source instead of drawing a substitute alphabet. Preview, Points and font export call the same evaluator.

The supported controls are width, height, lowercase height, stem length, descender length, slant, rotation, reflection, side margins, letter spacing and word spacing. New source designs start Height at 50, which means the original source cap height. Other controls are measured relative to the selected style's original settings.

Height changes use an increasing map of the complete outline. The evaluator splits a cubic where the map changes slope, then transforms each piece exactly. This preserves connected parts and holes. It does not scan for a skeleton or replace the font's letterforms. Reviewed dot relationships for 59 of the 60 bundled i/j glyphs preserve dot dimensions while the surrounding heights change. Serenade j has a swash whose vertical extent overlaps its dot, so it uses the complete-outline map.

Points stores its drawing and the settings at which it was edited. Changing settings maps that drawing back to source coordinates and forward to the new settings. This also works for a newly drawn character absent from the source. A fixed placement frame prevents repeated edits from drifting. Curves split by the height map retain their source segment origins in the geometry API.

The editor exposes the supported controls in navigation, search, traits, style cards and the inspector. It explains the unavailable capabilities. Export writes the current design; it rejects requests for unsupported weight families and generated accents. Source characters that are absent stay absent, with a visible coverage message. Cathedral lacks `− ÷`; Funnies lacks `† ‡`.

The editor also gained document session and edit revision counters. Carried edits cannot apply to a newer gesture or document, including after the 200-step undo history fills. Persistent drawing histories count as unsaved work. A late save response cannot assign one document's ID to another open document.

## Deliberate limits

Weight, alternate letterforms and decorative outline effects are unavailable in this interpreter. Existing legacy designs retain their controls and rendering. The new interpreter's height and width controls transform source geometry; they are not optically designed variation axes.

The automatic weight prototype failed: a two-unit inset introduced a counter in Couture R. Bulwark's nine existing weights are also not directly compatible across the whole font. Relative to weight 700, only 123 to 126 of 127 glyphs have matching node and handle structure; j, parentheses, § and ® need deliberate correspondence work. These are source-authoring tasks, not cases to conceal with contour repair.

The proposed master authoring system in [proposal.md](proposal.md) and [contract.ts](contract.ts) remains a design for adding those capabilities. The production API is in `shared/source/`. This implementation replaces unsafe automatic deformation for new source designs and establishes the pinned geometry, editing and export path needed for reviewed masters later.

## Verification

The source tests check every available character in all 30 snapshots for exact neutral curves and advances, and for finite geometry at combined endpoints. Mainline, Hearth and Couture each contain all 127 supported characters. Focused checks compare filled topology, dot dimensions, dynamic point edits, reset, save round trips and retracing under combined transformations. OTF tests parse actual font bytes and compare all 127 glyphs with preview commands and spacing after export rounding. A fresh worker repeats that comparison through the HTTP API.

Visual review covers the complete initial three alphabets and seven height configurations for each. These checks establish the reviewed cases, not optical quality at every possible setting in every style. The comparison rows are original, Height 0, Height 1, Lowercase height 0, Lowercase height 1, tall lowercase with short extenders, and small lowercase with long extenders.

- [Mainline height comparison](evidence/mainline-new-heights.png)
- [Hearth height comparison](evidence/hearth-new-heights.png)
- [Couture height comparison](evidence/couture-new-heights.png)

Live browser checks at 1440×900 and 390×844 covered actual sliders, point dragging, reset and undo, save, file import, OTF download, responsive style cards and a missing source. The successful workflows produced no console errors. The missing-source check deliberately returned 404 and displayed Retry without replacement letters.

The legacy golden check matched all 384 engine probes and all 713 available free-font probes. It skipped 651 historical probes whose cached font files were absent or differed from the stored fixtures. TypeScript and the production build pass. The build retains its existing large-chunk warning.

The final regression run passed 611 tests, with zero failures and one skipped test, in 70 seconds. Reproduce the source checks and visual specimens with [the source tools](../../tools/authored/README.md).
