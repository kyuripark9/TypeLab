/* The Adjust tab's steps that break a card's letters laid over it together, by what the letters are drawn from (a font
   id as STYLE_FONTS names it, as FONT_OFFS keys them) and as sets of steps ('weight:bold', TRAITS order): the fewest
   steps of a Shuffle mix that broke the card that still break it, a piece or a counter lost or gained on two letters or
   more (the soft card at Black and Condensed with Box curves filled its a in and pinched its b, d, g, p and q to
   hairlines; Box with Rough on the Transitional card shut its counters; the serif italic Wide with a Lowercase height
   opened its a's bowl at the stem). A set of one step breaks the card alone (Black on the Block card cuts slits into its
   e, 6 and 9). traitsOn (shared/traits.ts) leaves out the last step of each set picked whole, so the card takes the
   rest. Measured by tools/breaks.ts: npm run breaks -- --shuffle draws the mixes, npm run breaks -- --shuffle-offs adds
   the sets they break to the table. */
export const TRAIT_OFFS: Record<string, string[][]> = {
  'Mainline:600': [
    ['weight:black', 'width:narrow', 'slant:italic', 'curves:box'],
    ['serif:serifs', 'curves:box']
  ],
  'Parlance:500': [
    ['weight:bold', 'serif:serifs', 'curves:box']
  ],
  'Compass:300': [
    ['width:extended', 'curves:box', 'hand:rough'],
    ['weight:black', 'width:extended', 'xHeight:caps', 'serif:serifs'],
    ['weight:black', 'width:normal', 'xHeight:caps', 'serif:serifs', 'hand:rough', 'joined:script']
  ],
  'Cotton:300': [
    ['curves:box', 'hand:rough'],
    ['weight:black', 'width:condensed', 'curves:box']
  ],
  'Orbital:600': [
    ['weight:light', 'curves:box'],
    ['width:narrow', 'serif:serifs'],
    ['width:normal', 'serif:serifs'],
    ['serif:serifs', 'ends:cut'],
    ['curves:box', 'hand:slight'],
    ['weight:regular', 'curves:box'],
    ['width:extended', 'xHeight:medium', 'serif:serifs']
  ],
  'Gumdrop:700': [
    ['xHeight:caps', 'serif:serifs'],
    ['width:condensed', 'serif:serifs']
  ],
  'Almanac:500': [
    ['curves:box', 'hand:rough'],
    ['weight:black', 'width:condensed', 'curves:box']
  ],
  'Vellum:400': [
    ['weight:black', 'curves:box']
  ],
  'Couture:600': [
    ['weight:light', 'xHeight:small', 'hand:rough'],
    ['width:extended', 'hand:rough'],
    ['xHeight:small', 'curves:faceted', 'corners:round', 'hand:rough'],
    ['curves:box', 'hand:rough'],
    ['weight:black', 'spacing:mono', 'curves:box']
  ],
  'Sonnet:400i': [
    ['width:wide', 'corners:round'],
    ['weight:light', 'corners:round', 'hand:rough'],
    ['hand:rough', 'joined:print'],
    ['weight:light', 'width:extended', 'curves:squarish', 'corners:soft'],
    ['width:extended', 'xHeight:large'],
    ['width:wide', 'xHeight:caps'],
    ['xHeight:caps', 'hand:rough'],
    ['weight:thin', 'width:wide', 'slant:steep'],
    ['weight:thin', 'slant:steep', 'joined:print'],
    ['width:wide', 'xHeight:small'],
    ['width:wide', 'slant:steep', 'joined:script'],
    ['weight:thin', 'width:narrow', 'hand:rough'],
    ['weight:thin', 'xHeight:large'],
    ['width:normal', 'slant:steep'],
    ['width:wide', 'slant:upright'],
    ['width:extended', 'xHeight:caps'],
    ['width:wide', 'xHeight:medium'],
    ['width:extended', 'slant:italic', 'xHeight:medium', 'corners:soft'],
    ['weight:light', 'width:wide', 'curves:circle'],
    ['weight:thin', 'slant:upright', 'xHeight:small', 'spacing:mono'],
    ['width:extended', 'xHeight:small'],
    ['width:normal', 'slant:upright'],
    ['weight:thin', 'xHeight:medium']
  ],
  'Ballyhoo:400': [
    ['weight:thin', 'width:extended'],
    ['weight:black', 'width:condensed', 'slant:steep'],
    ['weight:regular', 'width:extended', 'corners:soft', 'ends:angled'],
    ['weight:black', 'width:condensed', 'corners:soft'],
    ['weight:light', 'width:extended', 'ends:sharp'],
    ['weight:light', 'width:extended', 'ends:cut']
  ],
  'Hearth:600': [
    ['weight:black', 'curves:box', 'joined:script'],
    ['curves:box', 'hand:rough'],
    ['weight:black', 'width:condensed', 'slant:italic', 'curves:box']
  ],
  'Timber:400': [
    ['xHeight:small', 'curves:box', 'joined:script'],
    ['width:condensed', 'curves:box'],
    ['weight:black', 'curves:box', 'hand:rough']
  ],
  'Kernel:500': [
    ['weight:thin', 'width:normal', 'curves:box'],
    ['weight:thin', 'width:extended', 'curves:box']
  ],
  'Funnies:400': [
    ['weight:bold', 'curves:box', 'corners:sharp', 'ends:flat'],
    ['weight:black', 'serif:serifs', 'curves:box'],
    ['weight:bold', 'serif:serifs', 'curves:box']
  ],
  'Serenade:400': [
    ['curves:faceted', 'hand:rough'],
    ['weight:light', 'width:condensed', 'slant:italic', 'curves:squarish'],
    ['weight:black'],
    ['weight:bold', 'curves:box', 'corners:soft'],
    ['corners:round', 'hand:rough'],
    ['weight:thin', 'slant:steep', 'corners:soft', 'joined:print'],
    ['width:extended', 'xHeight:caps', 'joined:print'],
    ['weight:bold', 'slant:italic'],
    ['weight:light', 'slant:upright', 'curves:squarish'],
    ['corners:soft', 'hand:rough'],
    ['weight:thin', 'slant:upright'],
    ['slant:italic', 'corners:round', 'joined:print'],
    ['weight:thin', 'width:wide'],
    ['weight:bold', 'width:extended', 'slant:upright'],
    ['weight:bold', 'curves:squarish'],
    ['slant:upright', 'corners:round'],
    ['weight:bold', 'spacing:mono'],
    ['weight:bold', 'width:condensed'],
    ['weight:thin', 'width:extended', 'slant:steep']
  ],
  'Cathedral:400': [
    ['weight:thin', 'width:extended', 'xHeight:medium', 'serif:none', 'curves:faceted'],
    ['width:extended', 'xHeight:small', 'serif:none']
  ],
  'Bulwark:700': [
    ['weight:black'],
    ['xHeight:caps', 'joined:script'],
    ['weight:thin', 'curves:squarish', 'joined:script'],
    ['weight:thin', 'xHeight:medium', 'curves:faceted'],
    ['weight:thin', 'width:normal', 'curves:circle'],
    ['weight:thin', 'xHeight:medium', 'curves:circle'],
    ['weight:thin', 'curves:faceted', 'corners:soft']
  ],
  'blocks:slots': [
    ['weight:thin', 'curves:faceted']
  ],
  'arcs': [
    ['weight:thin'],
    ['xHeight:caps', 'curves:box', 'ends:angled'],
    ['weight:black', 'ends:angled'],
    ['width:wide', 'spacing:mono', 'serif:serifs', 'ends:tapered'],
    ['ends:tapered', 'hand:rough'],
    ['width:wide', 'xHeight:caps', 'curves:squarish'],
    ['width:extended', 'ends:tapered']
  ]
};
