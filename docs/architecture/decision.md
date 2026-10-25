# Design comparison and decision

Two independent candidates started from the code investigation, reproduced failures, and the user's priority of predictable reshaping of existing styles. A third reviewer compared both complete proposals and type sketches. This is a design assessment, not a performance or correctness result for a new implementation.

Candidate A keeps original outlines and uses authored compatible masters for broad variations. Candidate B keeps the same original outlines but moves their points through authored component cages, attachment rules, and interaction corrections. Both separate source assets, document edits, and final output.

## Comparison

The scores below are the primary reviewer's assessment on a five-point scale.

| Criterion | A: masters | B: component deformations | Reason |
| --- | ---: | ---: | --- |
| Starting drawing and style fidelity | 5 | 5 | Both retain exact source curves at neutral. |
| Meaningful controls and joint limits | 4 | 3 | A makes complete intended shapes explicit; B requires a new deformation language and interaction corrections. |
| Stable edits and saved identity | 4 | 3 | A specifies compatible point edits and legacy source handling more fully. |
| Preview/export and verification | 4 | 4 | Both need current-geometry checks and optical review. Neither has proved the checks yet. |
| Practical first slice and authoring cost | 3 | 3 | A needs master authoring; B needs bindings, frames, attachments, and correction authoring. A small comparison can measure the real cost. |
| API depth and implementation credibility | 3 | 3 | Both hide substantial policy behind a small entry; their asset types must stay out of ordinary UI callers. |
| Total | 23 | 21 | A is the provisional base. |

The independent cross-review also selected A, scoring it 22 against B's 21. It rated A's authoring burden one point worse. That difference is justified: the proposal has not measured the work needed to prepare a complete style. The first transformation prototype must settle that before catalog conversion.

## Synthesis

Use A's original contours, authored variations, stable identities, explicit joint domains, and pinned legacy interpretation as the base.

Take two additions from B:

- Name the relationships the geometry must preserve, including attachments, separation, openings, and tangent direction. Mainline's dot separation and Hearth's top opening become explicit checks.
- Make the evaluated output and its projection observable. Preview, specimen, family, and OTF paths consume the same document interpretation; output hashes and OTF readback expose differences.

Keep B's component cages as a competing authoring prototype and possible tool for generating master candidates or local feature motions. Do not ship a universal cage solver and a universal master system at the same time. If the small prototype establishes that authored cages produce better results at lower authoring cost, revisit the choice before broad migration.

Reject the universal inferred-centerline model for existing styles. Its current representation loses source information before editing, while the intended product starts from those exact designs. Preserve stroke construction for fonts deliberately authored that way.

Reject sampled certification as a claim of continuous safety. Both candidates initially needed stronger treatment of point patches, part overrides, control combinations, effects, and rounding. The synthesized proposal checks the requested instance, uses conservative authored ranges, and separates optical review from geometry validity.

## Costs and unresolved implementation questions

- Most styles need additional type-design work. Limiting the first controls and styles is a deliberate reduction in initial coverage, not a claim that the old capability set is already preserved.
- Geometry predicates need defined tolerances and robust implementations. Named relationships alone do not implement collision or counter checks.
- New point edits can make previously usable ranges invalid. The controller must report that limitation without switching engines, freezing the letter, or silently clamping individual glyphs.
- Curated source identity, legacy appearance preservation, and shared preview/export evaluation are requirements independent of whether masters or cages win the prototype.
- Runtime guard cost and source-package size remain unmeasured. The first complete style supplies realistic performance and storage measurements.

## Verification completed for this proposal

The investigation ran the existing conversion-review tool, inspected its images, reproduced the height failures, and ran bounded control and weight probes. The retained diagnostic script was executed in all documented modes. The TypeScript contract passes a standalone strict type check; it contains no engine implementation. Local links and artifact contents are checked before delivery. No application code or migration files were changed.
