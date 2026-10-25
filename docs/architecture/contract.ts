/* Proposed domain contract, not a running replacement engine. Parsing establishes IDs and geometry invariants. */
type Id<Kind extends string> = string & { readonly __kind: Kind };
export type GlyphId = Id<'glyph'>;
export type FormId = Id<'form'>;
export type PointId = Id<'point'>;
export type FeatureId = Id<'feature'>;
export type Revision = Id<'document-revision'>;
export type GestureId = Id<'gesture'>;
export type ControlId = Id<'control'>;
export type MasterId = Id<'master'>;

export interface Point { readonly x: number; readonly y: number }
export interface BezierNode {
	readonly id: PointId;
	readonly on: Point;
	readonly incoming: Point | null;
	readonly outgoing: Point | null;
}
export interface Outline {
	readonly contours: readonly (readonly BezierNode[])[];
	readonly advance: number;
}
export interface SourceRef { readonly digest: string; readonly interpreter: string }
export interface Feature { readonly id: FeatureId; readonly points: readonly PointId[] }
export type Relation =
	| { readonly kind: 'attached'; readonly a: FeatureId; readonly b: FeatureId; readonly minimumOverlap: number }
	| { readonly kind: 'separate'; readonly a: FeatureId; readonly b: FeatureId; readonly minimumGap: number }
	| { readonly kind: 'open'; readonly opening: FeatureId; readonly minimumGap: number }
	| { readonly kind: 'tangent'; readonly a: FeatureId; readonly b: FeatureId; readonly maximumAngle: number };

// Asset-internal types. UI callers receive capabilities and handles, not this representation.
export interface GlyphForm {
	readonly neutral: MasterId;
	readonly masters: ReadonlyMap<MasterId, Outline>;
	readonly features: ReadonlyMap<FeatureId, Feature>;
	readonly relations: readonly Relation[];
}
export interface Axis { readonly control: ControlId; readonly neutral: number }
export interface VariationCell {
	readonly vertices: readonly [MasterId, MasterId, ...MasterId[]];
}
export interface LocalMotion {
	readonly feature: FeatureId;
	readonly control: ControlId;
	readonly deltas: ReadonlyMap<MasterId, ReadonlyMap<PointId, Point>>;
}
export interface VariationProgram {
	readonly axes: readonly Axis[];
	readonly locations: ReadonlyMap<MasterId, ReadonlyMap<ControlId, number>>;
	readonly cells: readonly VariationCell[];
	readonly localMotions: readonly LocalMotion[];
}
// The source parser checks dimensions, correspondence, shared cell boundaries,
// and reviewed joint domains. Samples are evidence, not proof of every pose.
export interface OutlineStyle {
	readonly source: SourceRef;
	readonly unitsPerEm: number;
	readonly glyphs: ReadonlyMap<GlyphId, ReadonlyMap<FormId, GlyphForm>>;
	readonly requiredGlyphs: readonly GlyphId[];
	readonly variation: VariationProgram;
}
export type Target =
	| { readonly kind: 'font' }
	| { readonly kind: 'glyph'; readonly glyph: GlyphId; readonly form: FormId }
	| { readonly kind: 'feature'; readonly glyph: GlyphId; readonly form: FormId; readonly feature: FeatureId };
export interface Setting { readonly target: Target; readonly control: ControlId; readonly value: number }
export interface GlyphOverride {
	readonly glyph: GlyphId;
	readonly form: FormId;
	readonly program: GlyphForm;
}
declare const documentType: unique symbol;
export interface DesignDocument {
	readonly [documentType]: true;
	readonly revision: Revision;
	readonly source: SourceRef;
}
// The document module privately owns resolved immutable sources, schema,
// settings, overrides, effects, and history. Parsing creates this domain value.
export type Command =
	| { readonly kind: 'set'; readonly setting: Setting }
	| { readonly kind: 'inherit'; readonly target: Target; readonly control: ControlId }
	| { readonly kind: 'select-form'; readonly glyph: GlyphId; readonly form: FormId }
	| { readonly kind: 'move-point'; readonly glyph: GlyphId; readonly form: FormId;
		readonly point: PointId; readonly delta: Point }
	| { readonly kind: 'split-curve'; readonly glyph: GlyphId; readonly form: FormId;
		readonly after: PointId; readonly fraction: number }
	| { readonly kind: 'replace-glyph'; readonly override: GlyphOverride };
export type Capability =
	| { readonly kind: 'available'; readonly target: Target; readonly control: ControlId;
		readonly current: number; readonly intervals: readonly (readonly [number, number])[] }
	| { readonly kind: 'unavailable'; readonly target: Target; readonly control: ControlId;
		readonly reason: 'not-authored' | 'unsupported-combination' | 'edited-geometry-limit' };
export type Issue =
	| { readonly kind: 'geometry'; readonly glyph: GlyphId; readonly relation: Relation; readonly message: string }
	| { readonly kind: 'invalid-outline'; readonly glyph: GlyphId; readonly message: string }
	| { readonly kind: 'unsupported'; readonly target: Target; readonly message: string }
	| { readonly kind: 'stale-revision' };
export interface CompiledGlyph { readonly ink: Outline; readonly visible: Outline }
export type OutputProfile = 'editor' | 'otf';
export interface CompiledFont {
	readonly revision: Revision;
	readonly source: SourceRef;
	readonly profile: OutputProfile;
	readonly glyphs: ReadonlyMap<GlyphId, CompiledGlyph>;
	readonly artifactHash: string;
}
export type CompileResult =
	| { readonly kind: 'ready'; readonly font: CompiledFont }
	| { readonly kind: 'invalid'; readonly issues: readonly [Issue, ...Issue[]] };
declare const acceptedEdit: unique symbol;
export interface AcceptedEdit {
	readonly [acceptedEdit]: true;
	readonly base: Revision;
	readonly gesture: GestureId;
	readonly preview: CompiledFont;
}
export type EditResult =
	| { readonly kind: 'accepted'; readonly edit: AcceptedEdit }
	| { readonly kind: 'rejected'; readonly issues: readonly [Issue, ...Issue[]] };
export interface EditorSession {
	snapshot(): DesignDocument;
	capabilities(target: Target): readonly Capability[];
	beginGesture(): GestureId;
	// Every preview starts from the gesture's immutable base, not the previous frame.
	preview(gesture: GestureId, command: Command): Promise<EditResult>;
	// Accept only the latest preview validated for every affected glyph.
	commit(edit: AcceptedEdit): DesignDocument | { readonly kind: 'stale-revision' };
	cancel(gesture: GestureId): void;
	undo(): DesignDocument;
	redo(): DesignDocument;
	// Include durable history. A successful save marks the captured revision only.
	serialize(): { readonly revision: Revision; readonly bytes: Uint8Array };
	markSaved(revision: Revision): void;
}
export interface SourceCatalog {
	// Resolve this immutable digest. No newer-source or generic-letter fallback.
	read(ref: SourceRef): Promise<Uint8Array | null>;
}
export type OpenResult =
	| { readonly kind: 'ready'; readonly editor: EditorSession }
	// A legacy adapter retains the pinned interpreter and existing editing rules.
	| { readonly kind: 'legacy'; readonly editor: EditorSession }
	| { readonly kind: 'missing-source'; readonly source: SourceRef }
	| { readonly kind: 'invalid'; readonly message: string };
export declare function openDesign(input: unknown, catalog: SourceCatalog): Promise<OpenResult>;
export declare function compileFont(document: DesignDocument, profile: OutputProfile): CompileResult;
