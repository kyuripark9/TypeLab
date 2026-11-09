/* The choices of a picker or a switch that break a card's letters, by what they are drawn from (a font id as
   STYLE_FONTS names it; 'blocks:slots', 'blocks:grid' and 'arcs' for the cards drawn in the engine's own letters) and
   by setting: each as the picker writes it ('true' or 'false' for the Serifs switch, 'kind/form' for a stroke end).
   On a card with serifs of its own, its serifs gave way to the engine's at another tip, base or side, ragged or cracked;
   a mirrored g, a flat s, a cupped base on most cards came out with spurs and slits (npm run breaks, 2026-11-09). The
   panel leaves them out on those letters, the design's own choice kept, and leaves out a control whose every choice
   but the design's own is here (choicesOff, controlOff in content/controls.ts). Measured by tools/breaks.ts: npm run
   breaks, then npm run breaks -- --offs rewrites the table from what it found, with the choices left out by eye
   (OFFS_BY_EYE there: Serifs off on the Didone and Old Style cards, hairline stubs where their serifs were; on on the
   Squircle and Chunky Round cards, an E shut and a ragged W). */
export const FONT_OFFS: Record<string, Record<string, string[]>> = {
  'Mainline:600': { bends: ['round'], serifBase: ['cupped'], apexForm: ['serif'], gForm: ['mirrored'], qForm: ['inside'], sForm: ['flat'] },
  'Parlance:500': { serifBase: ['cupped'], gForm: ['mirrored'], qForm: ['inside'], sForm: ['flat'] },
  'Compass:300': { serifBase: ['cupped'], gForm: ['mirrored'], qForm: ['inside'], sForm: ['flat'] },
  'Cotton:300': { serifBase: ['cupped'], apexForm: ['serif'], gForm: ['mirrored'], qForm: ['inside'], sForm: ['flat'] },
  'Turnpike:500': { serifBase: ['cupped'], gForm: ['mirrored'], qForm: ['inside'], sForm: ['flat'] },
  'Orbital:600': { serif: ['true'], serifBase: ['cupped'], story: ['double'], diagonals: ['arch'], apexForm: ['serif'], gForm: ['mirrored', 'double'], kForm: ['stem'], mForm: ['raised'], qForm: ['inside', 'sweep'], rForm: ['loop'], sForm: ['flat'] },
  'Gumdrop:700': { bowlJoin: ['square'], bends: ['round'], serif: ['true'], diagonals: ['arch'], apexForm: ['serif'], gForm: ['mirrored'], kForm: ['stem'], qForm: ['inside', 'sweep'], sForm: ['flat'], yForm: ['cup'] },
  'Almanac:500': { serif: ['false'], serifTip: ['round', 'pointed', 'angled'], serifBase: ['cupped'], serifSides: ['left', 'right', 'inside', 'outside'], serifInner: ['bracketed', 'unbracketed', 'slab', 'wedge', 'diamond'], apexForm: ['serif'], gForm: ['mirrored'], kForm: ['stem'], qForm: ['inside'], sForm: ['flat'] },
  'Vellum:400': { bends: ['round'], serif: ['false'], serifBase: ['cupped'], serifSides: ['left', 'right', 'inside', 'outside'], serifInner: ['bracketed', 'unbracketed', 'slab', 'wedge', 'diamond'], story: ['single'], apexForm: ['serif'], gForm: ['hook', 'mirrored'], kForm: ['stem'], mForm: ['raised'], qForm: ['crossing', 'inside'], sForm: ['flat'], yForm: ['cup'] },
  'Couture:600': { serif: ['false'], serifBase: ['cupped'], serifInner: ['slab'], gForm: ['mirrored'], mForm: ['raised'], qForm: ['inside'], sForm: ['flat'] },
  'Sonnet:400i': { serif: ['false'], serifTip: ['round', 'pointed', 'angled'], serifBase: ['cupped'], serifSides: ['left', 'right', 'inside', 'outside'], serifInner: ['bracketed', 'unbracketed', 'slab', 'wedge', 'diamond'] },
  'Ballyhoo:400': { serifBase: ['cupped'], serifInner: ['bracketed'], gForm: ['mirrored'], qForm: ['inside'], sForm: ['flat'] },
  'Hearth:600': { serifTip: ['round', 'pointed', 'angled'], serifBase: ['cupped'], serifSides: ['right', 'inside', 'outside'], serifInner: ['bracketed', 'unbracketed', 'slab', 'wedge', 'diamond'], apexForm: ['serif'], gForm: ['mirrored'], kForm: ['stem'], qForm: ['inside'], sForm: ['flat'] },
  'Timber:400': { bends: ['round'], serifTip: ['round', 'pointed', 'angled'], serifBase: ['cupped'], serifSides: ['left', 'right', 'inside'], serifInner: ['bracketed', 'unbracketed', 'slab', 'wedge', 'diamond'], apexForm: ['serif'], gForm: ['mirrored', 'double'], kForm: ['stem'], qForm: ['inside', 'sweep'], sForm: ['flat'] },
  'Kernel:500': { bowlJoin: ['square'], bends: ['round'], serifBase: ['cupped'], diagonals: ['upright'], apexForm: ['serif'], gForm: ['mirrored'], qForm: ['inside', 'sweep'], sForm: ['flat'] },
  'Dispatch:400': { bends: ['round'], serifInner: ['bracketed'], story: ['single'], apexForm: ['serif'], gForm: ['mirrored'], kForm: ['stem', 'bar'], mForm: ['raised'], qForm: ['sweep'], sForm: ['flat'] },
  'Funnies:400': { bends: ['round'], apexForm: ['serif'], gForm: ['mirrored'], kForm: ['stem'], qForm: ['crossing'], sForm: ['flat'], yForm: ['cup'] },
  'Jotter:400': { bowlJoin: ['square'], story: ['double'], apexForm: ['serif'], gForm: ['mirrored'], kForm: ['stem'], mForm: ['raised'], qForm: ['inside'], sForm: ['flat'] },
  'Serenade:400': { serif: ['true'] },
  'Cathedral:400': { serifBase: ['cupped'] },
  'Bulwark:700': { serif: ['true'], serifBase: ['cupped'], story: ['single'], apexForm: ['serif'], gForm: ['mirrored'], kForm: ['stem'], qForm: ['sweep'], sForm: ['flat'] },
  'blocks:slots': { iForm: ['bars'] },
  'blocks:grid': { cellJoin: ['pixel'] },
  'arcs': { terminal: ['sharp/pointed', 'sharp/clipped'] }
};
