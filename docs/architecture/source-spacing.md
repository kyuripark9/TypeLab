# Source monospacing

A program's optional `source-spacing-v1` policy enables Mono. Programs without that policy retain their existing geometry and disabled Mono control. New source styles and explicit adoption start at Mono 0.

The shared cell is the widest advance in the current global authored font, after width and side-bearing changes, including its original space. It does not grow to fit control handles, flourishes, or arbitrary edits. This preserves an originally equal-advance family at its neutral settings. Letters with their own width, weight, side-bearing, or Points edits inherit the parent font's cell.

For amount `t`, a letter with original advance `a` moves horizontally by `(cell - a) × t / 2`, and its advance becomes `a + (cell - a) × t`. At 0 the drawing is unchanged. At 1 its advance is exactly the shared cell. This placement runs after pose and component Size, before finishing. It translates every anchor and handle equally, leaving curves, radii, and vertical coordinates unchanged.

Space and NBSP approach the same cell. Shadow extends nonempty glyph advances; the spaces acquire the same extension progressively with Mono, so their finished advances agree at full Mono. Empty custom glyphs receive that extension too. Tracking and the existing encoded advance floors apply afterward in both preview and export.

Equal advances do not imply tight optical spacing. An unusually wide letter, an edited outline, a rotated glyph, or a flourish may extend beyond its cell. The program preserves those shapes instead of squeezing them to fit. Word spacing fades out as Mono approaches 1; letter spacing remains a shared addition.

Fully equalizing advances cannot be inverted from the rendered result. A Points drawing therefore retains a `source-mono-v1` spacing frame with its original advance, resulting advance, and horizontal shift. Before moving saved edits through a different weight, width, pose, or component Size, the evaluator removes that recorded spacing. It applies the current spacing afterward. The parser preserves and validates the frame, and Points, construction handles, and carried edits keep it when saving.

At full Mono, editing a letter's advance cannot break the shared cell. The edit is retained in its proportional advance and becomes visible as Mono is reduced. Turning Mono off restores that proportional advance and removes the spacing translation.

`tools/masters/prototype-source-spacing.ts` checks neutral identity, equal-advance identity, translation, full-Mono edits, serialized reopening, and proportional restoration on a literal drawing. It and TypeScript compilation pass. Whole-font specimens, combinations with every finish and pose, and installed-font comparisons remain for the deferred testing pass.
