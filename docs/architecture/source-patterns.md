# Source pattern materials

Source programs opt into a pinned `source-patterns-v1` policy inside their finish policy. Older programs retain their existing fill list and behavior. Adding fills keeps the numeric ranges and budgets unchanged; `sourcePatternsExtend` checks that contract during adoption.

The pattern stage receives the final editable face after proportions, pose, and optional Slice. It produces final ink for preview and export. Points continue to edit the face, and patterns leave advances and font bounds unchanged.

Each connected filled component gets its own lattice. Its origin is inside the ink, and its pitch is `min(capHeight, componentMinorExtent × 4) × Size`, where the published Size range is 0.04–0.18. This gives small punctuation several cells instead of letting a global lattice miss it. The entire material is intersected with the normalized source using nonzero fill, including its counters. There is no solid-outline fallback.

| Material | Construction | Controls |
| --- | --- | --- |
| Pixels | Square cells with optional circular corner fillets | Size, Spread, Roundness |
| Hexagons | Staggered hexagonal cells with optional corner fillets | Size, Spread, Roundness |
| Dots | Circular cells on a square lattice | Size, Spread |
| Halftone | Staggered circles scaled by the square root of local ink coverage | Size, Spread |
| Lines | Horizontal bands | Size, Spread |
| Blobs | Equal soft beads that form regular necks as Spread increases | Size, Spread |
| Liquid | Soft beads with fixed per-cell size and position variation | Size, Spread |

Blobs and Liquid sample compact-support fields at 12 intervals per cell. Spread lowers a fixed field's threshold from 0.746 to 0.2 over the published range, so seed positions and radii do not jump when Spread changes. The seed at the component's ink anchor stays centered. Marching squares produces closed contours, which are smoothed, flattened, and passed through the same source intersection as the geometric cells. This sampled material is the definition of the effect; it is not a precision claim about an analytic metaball surface.

Source and generated curves are flattened to one quarter of the finish tolerance and clipped on a 0.00001-unit grid. The initial policy permits 16,384 cells and 131,072 accounted points per glyph. Runtime also caps field samples, boundary work, and intersection candidates. Invalid or over-budget drawings raise `SourceEffectError` so the editor can retain the editable design and offer recovery. A source component that cannot retain any ink is rejected instead of silently disappearing.

Implementation checks are deliberately limited in this pass. `tools/masters/prototype-patterns.ts` executes all seven materials on a literal counter plus a detached mark. `tools/masters/prototype-organic-patterns.ts` checks three Spread positions on one field. Both and TypeScript compilation pass. All-style visual quality, endpoint combinations, performance, edited Points, and preview/export comparisons remain for the deferred testing pass.
