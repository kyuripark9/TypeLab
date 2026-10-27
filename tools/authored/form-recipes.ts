/* Native feature tags are pinned authoring inputs. Labels do not reinterpret legacy shape parameters. */
export interface FormRecipe { style: string; glyph: string; feature: string; id: string; label: string }
const group = (style: string, glyphs: string, feature: string, id: string, label: string): FormRecipe[] =>
  [...glyphs].map(glyph => ({ style, glyph, feature, id, label }));

export const FORM_RECIPES: readonly FormRecipe[] = [
  ...group('Hearth', 'a', 'ss03', 'ss03', 'Alternate'),
  ...group('Hearth', 'g', 'ss01', 'ss01', 'Alternate'),
  ...group('Hearth', 'R', 'ss05', 'ss05', 'Alternate'),
  ...group('Mainline', 'g', 'ss01', 'ss01', 'Alternate 1'),
  ...group('Mainline', 'g', 'ss06', 'ss06', 'Alternate 2'),
  ...group('Mainline', 'g', 'ss07', 'ss07', 'Alternate 3'),
  ...group('Mainline', 'Q', 'ss06', 'ss06', 'Alternate'),
  ...group('Mainline', 'R', 'ss03', 'ss03', 'Alternate'),
  ...group('Parlance', 'gI', 'ss01', 'ss01', 'Alternate'),
  ...group('Cotton', 'a', 'ss01', 'ss01', 'Alternate'),
  ...group('Cotton', 'l', 'ss02', 'ss02', 'Alternate'),
  ...group('Kernel', 'a', 'ss01', 'ss01', 'Simple a'),
  ...group('Kernel', 'g', 'ss02', 'ss02', 'Simple g'),
  ...group('Compass', 'a', 'ss02', 'ss02', 'Double-storey a'),
  ...group('Jotter', 'agIlQR', 'ss01', 'ss01', 'Alternate 1'),
  ...group('Jotter', 'agIlQR', 'ss02', 'ss02', 'Alternate 2'),
  ...group('Boardwalk', 'IlQR', 'ss01', 'ss01', 'Alternate'),
  ...group('Serenade', 'gIlQR', 'ss01', 'ss01', 'Swash'),
  ...group('Vellum', 'Q', 'ss06', 'ss06', 'Long tail'),
];

export const LOCAL_FORM_WEIGHTS: Readonly<Record<string, { light: number; bold: number; blur: number }>> = {
  Boardwalk: { light: -10, bold: 10, blur: 18 },
  Serenade: { light: -6, bold: 6, blur: 14 },
};

/** The forms published to the programs, each under the name the editor shows (the legacy pickers' words). Styles whose
    own letters were redrawn from their upstream font (Jotter, Boardwalk, Serenade) take no upstream alternate: it
    would be another hand's. Alternates too close to their original to read as another shape at text sizes are left
    out (Hearth a ss03; Mainline g ss06, ss07 and Q ss06). */
export interface PublishedForm { style: string; glyph: string; id: string; label: string }
export const PUBLISHED_FORMS: readonly PublishedForm[] = [
  { style: 'Mainline', glyph: 'g', id: 'ss01', label: 'Two-storey' },
  { style: 'Mainline', glyph: 'R', id: 'ss03', label: 'Curved leg' },
  { style: 'Parlance', glyph: 'g', id: 'ss01', label: 'One-storey' },
  { style: 'Parlance', glyph: 'I', id: 'ss01', label: 'Bars' },
  { style: 'Compass', glyph: 'a', id: 'ss02', label: 'Two-storey' },
  { style: 'Cotton', glyph: 'a', id: 'ss01', label: 'One-storey' },
  { style: 'Cotton', glyph: 'l', id: 'ss02', label: 'Plain' },
  { style: 'Vellum', glyph: 'Q', id: 'ss06', label: 'Long tail' },
  { style: 'Hearth', glyph: 'g', id: 'ss01', label: 'Two-storey' },
  { style: 'Hearth', glyph: 'R', id: 'ss05', label: 'Curved leg' },
  { style: 'Kernel', glyph: 'a', id: 'ss01', label: 'One-storey' },
  { style: 'Kernel', glyph: 'g', id: 'ss02', label: 'One-storey' },
];
