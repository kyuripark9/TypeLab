# Source program contract

Source programs select reviewed width and letter-feature assets over the existing weight masters. The registry, evaluator, preview, export, and explicit editor adoption action are connected. Historical source references retain their original interpretation.

## Published coverage

Mainline, Parlance, and Gumdrop publish native-width programs. Hearth and Couture publish feature programs with `H` and `A` crossbars, the `R` leg, and `c` terminal length. Feature controls require single-letter scope and a covered character. They remain unavailable in **All letters** scope.

Vellum, Almanac, Compass, Dispatch, Kernel, Orbital, and Bulwark publish H-only crossbar features. Their other feature regions remain unreviewed. Parlance's H feature asset awaits native-width interactions; Cotton's awaits its new compatible width basis.

Mainline and Parlance cover width coordinates 75 through 150. Earlier 75-through-100 programs remain available to saved designs. Vellum, Almanac, Compass, Dispatch, Kernel, Orbital, and Bulwark also publish H crossbar masters across their complete weight ranges.

All 22 styles publish Solid and Shadow finishes. Shadow retains the exact foreground curves and adds separate ink behind them. Its depth varies from 4% to 12% of cap height. The [finishing design](../../tools/masters/finish-design.md) records the curve tolerance, clearance, review, and remaining materials.

Mainline's feature asset exists but remains unpublished in a program pending width interaction drawings. The registry rejects native width combined with a `base-only` feature asset. The [semantic feature design](semantic-features.md) records the authored coverage, review evidence, and interaction plan.

## Evaluation and loading

`parseSourceProgram` reads the manifest, and `sourceProgramDependencies` lists its pinned assets. Client and server loaders register the base first, validate the dependent assets against that exact base, and mark the program ready only after all dependencies succeed.

`shared/source/instance.ts` interpolates the complete width or weight baseline, applies features, transports saved Points edits, and applies height and placement. A program's optional finishing policy then produces the final ink. The saved and current baselines each use their own program reference and coordinates. Preview, SVG, and OTF consume the same `Glyph.cmds` and advance.

Programs also supply `Glyph.editable`, which Points uses directly when rendered ink has effects. Historical renderers retain their existing tracing behavior when that field is absent.

## Competing representations

| Representation | Benefit | Cost |
| --- | --- | --- |
| Referenced program manifest | Reuses the immutable weight package, permits cached assets, and preserves point identity when a program gains a feature. Width and feature assets remain independently reviewable. | Loading must resolve a small fixed dependency set and validate that its assets share the base. |
| Compiled per-glyph program | A single payload contains every curve, variation cell, feature, form, and component. Evaluation can read one object. | It duplicates the existing base drawings, makes small feature releases large, and requires a separate identity scheme to stop every rebuild invalidating point edits. |

The implemented manifest refers to one master package, at most one width asset, and at most one coordinated feature asset. Dependencies cannot refer to another program. One feature asset owns the reviewed controls and their composition; the manifest cannot assemble unrelated patches.

## Manifest types

```ts
interface WidthMasterRef {
	kind: 'width-masters-v1';
	digest: string;
	fontId: string;
}
interface FeatureMasterRef {
	kind: 'feature-masters-v1';
	digest: string;
	fontId: string;
}
interface SourceProgramData {
	format: 'source-program-v1';
	base: MasterSourceRef;
	width: WidthMasterRef | null;
	features: FeatureMasterRef | null;
	finish?: SourceFinishPolicy;
}

function parseSourceProgram(input: unknown): SourceProgramData;
function sourceProgramDependencies(program: SourceProgramData):
	[MasterSourceRef, ...(WidthMasterRef | FeatureMasterRef)[]];
```

The parser validates supported kinds, SHA-256 strings, and matching font IDs. It rejects unsupported manifest fields and recursive bases. Asset parsers and the registry validate the complete base reference, coordinate domains, glyph coverage, and topology. Published feature programs must cover the base's complete weight range.

Width assets store only non-neutral columns. Their neutral column is the existing master package. Feature assets store only affected glyph endpoint drawings, advances, control coverage, and interaction limits. Authoring recipes retain the attachment and clearance constraints. Neither production asset duplicates the whole base font.

`finish` contains concrete dimensions and curve tolerance for the source finishing evaluator. Its absence remains absent when parsing an old manifest. An old manifest never enables a newly supported control merely because the runtime learned how to interpret that parameter. Alternate forms and marks still require concrete asset contracts.

## Document version 10 and adoption

A saved source program reference pins the program digest and interpreter version. Authored points remain tied to the compatible master basis digest and glyph. Publishing new width or feature data therefore changes the program reference without falsely changing the identity of unchanged source segments.

Version 10 adds `ProgramSourceRef`, with `kind: 'program-v1'`, a SHA-256 digest, and the font ID. The payload uses `format: 'source-program-v1'`. Reading an older document does not replace its `outline-v1` or `masters-v1` reference with a current program.

If a later form changes topology, it needs its own geometry basis. It must not reuse the original master digest for unrelated contour indices. Marks and components likewise need their own authored identity before the editor can carry component-local edits.

`actions.enableProgram()` adopts a compatible program in one undoable step. It resets newly interpreted width and feature axes to neutral and clears their old per-letter overrides. Feature neutral is 0.5. Adoption from `masters-v1` preserves weight settings; adoption from `outline-v1` uses the authored default weight because the old interpreter did not vary weight. Height, unrelated letter settings, and saved `Drawn.at` frames remain intact. Undo restores the entire prior state, and redo restores the adopted state.

When a native width range expands, adoption converts the global and per-letter slider positions to preserve their actual width coordinates. It retains previously supported feature values and initializes only newly covered letters at neutral. Newly enabled finishes start at Solid. Upgrades require the same master basis, retain existing feature coverage, and cannot narrow an existing width range or change an existing finishing policy.

New designs use the published program where available and start newly interpreted controls at neutral. Partial feature coverage remains explicit in `ProgramInfo.featureGlyphs`; enabling a program does not enable unreviewed letters or terminal constructions.

## Saved Points dependencies

Each authored point identifies its master digest, glyph, contour, segment, and curve parameter. That identity survives compatible program revisions, generated height cuts, Pen subdivisions, reversal, and repeated saves. Saved edits move between complete baselines, including the saved feature coordinates and advance.

`designSourceRefs` collects both `Params.sourceProgram` and the references retained by saved `Drawn.at` frames. Client preview and server export call `loadDesignSources` for that set. Missing dependencies leave the design unready, block export, and remain available for retry. A saved frame never silently uses the current program's baseline.

This fixes a fresh-process bug where a Hearth `R` saved with an extended leg reopened with advance 732.448745869 instead of 686. Only the current weight package had loaded; the saved feature program was missing. Loading the full reference set restores the exact preview and export geometry.

## Verification

`tests/source-program.test.ts` covers the manifest and editable projection. `tests/source-controls.test.ts` covers per-letter capability enforcement, adoption, undo, and redo. `tests/source-loading.test.ts` covers dependency validation, retries, and redraw. `tests/source-reopening.test.ts` verifies the saved feature frame in a fresh process and export worker. `tests/width-masters.test.ts` checks Points transport between feature coordinates and preview/export agreement.

The independent Points review passed 32 Hearth and Couture cases combining features, weights, heights, transformed placement, reversal, Pen splits, and repeated saves. Maximum anchor error was `4.55e-13`, cubic-area error was `2.91e-10`, and advance error was zero. The local probe is `.audit/masters/runtime/feature-points-review.mjs`.

The initial width and feature milestone passed 673 tests with one existing skip, TypeScript checking, the production build, and immutable package regeneration. All 384 engine outline probes and 713 available free-font probes matched their saved snapshots; 651 stored free-font probes could not run because the required files were absent or had different hashes. Desktop checks at 1440×900 covered all three width programs and H/R/c feature controls. Phone checks at 390×844 covered Gumdrop's width endpoints and specimen layout. No application console errors occurred.

The expanded-width, broader-H, and Shadow milestone passes 686 tests with one existing skip across 100 suites, plus typecheck, production build, and asset regeneration. The same 384 engine and 713 available free-font probes still match. Shadow passes 7,068 glyph checks across all 22 families. Its production tests compare preview and OTF paths, preserve edited foregrounds through reopening, and exercise explicit adoption and undo. Width adoption compares all 127 characters, including letter overrides and saved Points.

Desktop and phone browser checks cover expanded widths, Shadow size, and a saved design's width upgrade. The visible glyph strip converges after its deferred render, and Style Adjust shows the supported Weight and Shadow choices. No application console errors occurred. Maximum observed frame gaps during the two desktop Shadow drags were 150 ms for Couture and 100 ms for Mainline. These are development-browser observations, not a performance guarantee.
