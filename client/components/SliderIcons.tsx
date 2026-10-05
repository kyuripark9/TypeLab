/* The sliders' icons: one small line drawing beside each slider's name, showing what it changes
   (a wide box for Width, a filled stroke widening at its end for Flare). Drawn on a 20-unit grid in
   the current text colour; `faint` lines are the letter around it or the shape before, `solid` is filled. */
import type { ReactNode } from 'react';

const SLIDER: Record<string, ReactNode> = {
  // —— Weight & contrast
  // a hairline stem beside a heavy one
  weight: <><path className="faint" d="M5 4v12" /><rect className="solid" x="9.5" y="4" width="6" height="12" rx=".8" /></>,
  // an H with heavy stems and a thin bar
  vWeight: <><path className="faint" d="M7 10h6" /><rect className="solid" x="3.5" y="3.5" width="3.5" height="13" rx=".6" /><rect className="solid" x="13" y="3.5" width="3.5" height="13" rx=".6" /></>,
  // an H with thin stems and a heavy bar
  hWeight: <><path className="faint" d="M4.5 3.5v13M15.5 3.5v13" /><rect className="solid" x="4.5" y="8.2" width="11" height="3.6" rx=".6" /></>,
  // an O, heavy at the sides and thin at top and bottom
  contrast: <path className="solid" fillRule="evenodd" d="M10 3a6.5 7 0 1 1 0 14 6.5 7 0 1 1 0-14zm0 1.4a2.6 5.6 0 1 0 0 11.2 2.6 5.6 0 1 0 0-11.2z" />,
  // a stem thinned to a waist on a line
  pinch: <><path className="faint" d="M2.5 10h15" /><path d="M5.5 3.5h9L11 10l3.5 6.5h-9L9 10z" /></>,
  // a waist and the arrow moving it up and down
  pinchPos: <><path d="M3.5 3.5h7L8 10l2.5 6.5h-7L6 10z" /><path d="M15 4v12M13.3 5.7 15 4l1.7 1.7M13.3 14.3 15 16l1.7-1.7" /></>,

  // —— Size & slant
  // stretched sideways
  width: <><rect className="faint" x="6.5" y="4" width="7" height="12" rx=".5" /><path d="M2.5 10h15M5 7.5 2.5 10 5 12.5M15 7.5l2.5 2.5-2.5 2.5" /></>,
  // stretched upward
  height: <><rect className="faint" x="4" y="6.5" width="12" height="7" rx=".5" /><path d="M10 2.5v15M7.5 5 10 2.5 12.5 5M7.5 15l2.5 2.5 2.5-2.5" /></>,
  // a stem leaning off the upright, with the angle between
  slant: <><path className="faint" d="M5 16.5V3.5M3 16.5h14" /><path d="M5 16.5 11 3.5M5 9.2a3.4 3.4 0 0 0 2.6-.7" /></>,
  // a box turning about its middle
  rotation: <><rect className="faint" x="6" y="6" width="8" height="8" rx=".5" /><path d="M16.2 7.5A6.8 6.8 0 1 0 17 11" /><path d="M16.6 4.4v3.3h-3.3" /></>,

  // —— Heights
  // an x growing up to a higher line
  xHeight: <><path className="faint" d="M2.5 16.5h15M2.5 8.5h15" /><path d="M4 8.5l6 8M10 8.5l-6 8M14.5 16.5v-8M13 10l1.5-1.5L16 10" /></>,
  // one stroke reaching up past the x-height, one down below the baseline
  extenders: <><path className="faint" d="M2.5 7h15M2.5 13h15" /><path d="M7 13V2.5M13 7v10.5" /></>,
  // a j and its hook
  tail: <><circle className="solid" cx="12" cy="3.6" r="1.2" /><path d="M12 7v7c0 2.2-1.4 3.5-3.6 3.5-1 0-2-.3-2.9-.9" /></>,
  // an H's bar between its stems
  crossbar: <><path className="faint" d="M5 3.5v13M15 3.5v13" /><path d="M5 9h10M8.8 5.7 10 4.5l1.2 1.2M8.8 12.3l1.2 1.2 1.2-1.2" /></>,
  // a p below the baseline
  descender: <><path className="faint" d="M2.5 12.5h15" /><path d="M6 6v12" /><ellipse cx="9.7" cy="9.25" rx="3.7" ry="3.25" /></>,

  // —— Inner space
  // an o and the space inside it
  counter: <><circle cx="10" cy="10" r="7" /><circle className="faint" cx="10" cy="10" r="3.6" /><path d="M10 6.4v1.2M10 12.4v1.2M6.4 10h1.2M12.4 10h1.2" /></>,
  // a c and how wide its mouth opens
  aperture: <><path d="M14 5.6a6.5 6.5 0 1 0 0 8.8" /><path className="faint" d="M16.5 6v8" /><path d="M15.3 7.2 16.5 6l1.2 1.2M15.3 12.8 16.5 14l1.2-1.2" /></>,

  // —— Spacing
  // two stems with the space between them
  letterSpacing: <><path d="M3.5 4v12M16.5 4v12" /><path d="M7 10h6M8.5 8.2 6.7 10l1.8 1.8M11.5 8.2l1.8 1.8-1.8 1.8" /></>,
  // two words and the gap between
  wordSpacing: <><rect className="solid" x="1.5" y="8" width="3.5" height="4" rx=".8" /><rect className="solid" x="15" y="8" width="3.5" height="4" rx=".8" /><path d="M7 10h6M8.6 8.4 7 10l1.6 1.6M11.4 8.4 13 10l-1.6 1.6" /></>,
  // an i and an m in cells of the same width
  mono: <><path className="faint" d="M2.5 4v12M10 4v12M17.5 4v12" /><circle className="solid" cx="6.25" cy="6.5" r="1" /><path d="M6.25 9v6M11.6 15V9.5M11.6 11.2a1.4 1.4 0 0 1 2.8 0V15M14.4 11.2a1.4 1.4 0 0 1 2.8 0V15" /></>,
  // the margins either side of a letter
  sideBearing: <><path className="faint" d="M2.5 3.5v13M17.5 3.5v13" /><rect x="6.5" y="6" width="7" height="8" rx="1" /><path d="M2.5 10h2.5M15 10h2.5" /></>,

  // —— Build & curves
  // a fuller pen curve over a compass arc
  curve: <><path className="faint" d="M4 16A12 12 0 0 1 16 4" /><path d="M4 16C4 8.5 8.5 4 16 4" /></>,
  // a circle squaring off
  squareness: <><circle className="faint" cx="10" cy="10" r="6.5" /><rect x="3.5" y="3.5" width="13" height="13" rx="4.5" /></>,
  // a circle cut into straight sides
  chamfer: <><circle className="faint" cx="10" cy="10" r="6.5" /><path d="M7.3 3.5h5.4l3.8 3.8v5.4l-3.8 3.8H7.3l-3.8-3.8V7.3z" /></>,
  // a bowl running into its stem
  overlap: <><path d="M5.5 3v14" /><circle cx="10" cy="11.5" r="5" /></>,
  // a box bowl: round outside corners, square inside
  boxRound: <><rect x="3" y="3.5" width="14" height="13" rx="4.5" /><rect className="faint" x="7" y="7.5" width="6" height="5" /></>,

  // —— Corners
  // a corner rounding off its square
  roundness: <><path className="faint" d="M4 9V4h5" /><path d="M4 16.5V11a7 7 0 0 1 7-7h5.5" /></>,
  // a T whose bar curves into its stem underneath
  joinRound: <><path d="M3 4.5h14M3 8h3a3 3 0 0 1 3 3v5.5M17 8h-3a3 3 0 0 0-3 3v5.5" /></>,
  // a square letter with round corners inside
  innerRound: <><rect x="3" y="3" width="14" height="14" rx="1" /><rect x="7" y="7" width="6" height="6" rx="2.6" /></>,
  // an A cut flat across the top
  apex: <><path className="faint" d="M8.2 4 10 1.6 11.8 4" /><path d="M3.5 16.5 8.2 4h3.6l4.7 12.5" /></>,
  // a corner cut into a square step
  steps: <><path className="faint" d="M4 8V4h4" /><path d="M4 16.5V8h4V4h8.5" /></>,
  // a V carved out where its strokes meet
  joints: <path className="solid" d="M3 4h4l2.4 6.3L10 8.2l.6 2.1L13 4h4l-5 12.5H8z" />,

  // —— Serifs
  // an I with long feet
  serifSize: <><path className="faint" d="M10 4v12" /><path d="M3.5 4h13M3.5 16h13" /></>,
  // an I with heavy feet
  serifThickness: <><path className="faint" d="M10 6v8" /><rect className="solid" x="4" y="3" width="12" height="3" rx=".5" /><rect className="solid" x="4" y="14" width="12" height="3" rx=".5" /></>,
  // a foot whose top slopes into the stem
  serifAngle: <><path d="M10 3.5v9M4 16.5h12V15l-4.5-2.5h-3L4 15z" /></>,
  // a foot curving up into its stem
  serifBracket: <path d="M8 3.5v8c0 2.5-1.5 3.5-4.5 3.5v1.5h13V15c-3 0-4.5-1-4.5-3.5v-8" />,
  // an I whose serifs reach further to one side
  serifBalance: <><path className="faint" d="M5 3.5h10M5 16.5h10" /><path d="M12.5 3.5v13M3 3.5h12M3 16.5h12" /></>,
  // an I whose top serif grows
  serifTops: <><path className="faint" d="M10 5.5v11M6.5 16.5h7" /><path d="M3.5 4.2h13" /><path d="M3.5 2v4.4M16.5 2v4.4" /></>,
  // an E with serifs across the ends of its arms
  serifArms: <><path className="faint" d="M5 3.5v13M5 3.5h9M5 10h6.5M5 16.5h9" /><path d="M14 3.5v3.5M14 16.5V13" /></>,
  // the serifs on an E's arms made heavy
  serifArmThickness: <><path className="faint" d="M5 3.5v13M5 3.5h9M5 10h6M5 16.5h9" /><rect className="solid" x="12.5" y="3" width="3" height="5" rx=".5" /><rect className="solid" x="12.5" y="12" width="3" height="5" rx=".5" /></>,
  // the serifs on an E's arms leaning out
  serifArmLean: <><path className="faint" d="M5 3.5v13M5 10h6M14 4v4.5M14 16v-4.5" /><path d="M5 4h9l2.2 4.5M5 16h9l2.2-4.5" /></>,
  // a foot with round tips
  serifTipRound: <><path className="faint" d="M10 3.5v9" /><path d="M5 12.5h10a2 2 0 0 1 0 4H5a2 2 0 0 1 0-4z" /></>,
  // a foot with its tips cut on a slant
  serifTipSlant: <><path className="faint" d="M10 3.5v9" /><path d="M5.5 12.5h9l2.5 4H3z" /></>,
  // a foot arching up underneath
  serifCup: <><path className="faint" d="M10 3.5v9" /><path d="M3 12.5h14v4c-2-1.6-4.6-2.3-7-2.3s-5 .7-7 2.3z" /></>,
  // a stem whose foot reaches further into the letter
  serifInnerSize: <><path className="faint" d="M7 3.5v13M3.5 16.5H7" /><path d="M7 16.5h9.5M14.5 14.5l2 2-2 2" /></>,
  // a stem whose foot is heavier into the letter
  serifInnerThickness: <><path className="faint" d="M7 3.5v11M3.5 16.5H7" /><rect className="solid" x="7" y="14.5" width="9" height="3" rx=".5" /></>,

  // —— Stroke ends
  // a stroke running on
  terminalLength: <><path d="M3 10h9" /><path className="faint" d="M12 10h5" /><path d="M10.5 7.5 13 10l-2.5 2.5" /></>,
  // a stroke curling round
  terminalCurl: <path d="M4 16.5V9a5 5 0 0 1 10 0c0 2.3-1.6 3.8-3.6 3.8-1.4 0-2.4-.9-2.4-2.2" />,
  // a stroke widening as it ends
  terminalFlare: <path d="M3 8.5h8l5.5-3.5v10L11 11.5H3z" />,
  // an end hollowed out
  terminalDepth: <path d="M3 6.5h13c-1.6 1-2.4 2.2-2.4 3.5s.8 2.5 2.4 3.5H3" />,
  // a stroke ending in a ball
  terminalSize: <><path d="M3 10h7" /><circle cx="13" cy="10" r="3.5" /><circle className="faint" cx="13" cy="10" r="5" /></>,
  // an end rounding from its square
  terminalRound: <><path className="faint" d="M12 6.5h4.5v7H12" /><path d="M3 6.5h9a3.5 3.5 0 0 1 0 7H3" /></>,
  // an end drawn to a point
  terminalPoint: <path d="M3 6.5h9l5 3.5-5 3.5H3" />,
  // a point with its tip cut off
  terminalClip: <><path d="M3 6.5h9l3.8 2.6v1.8L12 13.5H3" /><path className="faint" d="M15.8 9.1 17.2 10l-1.4.9" /></>,
  // a point moved toward one edge
  terminalLean: <path d="M3 6.5h13.5L12 13.5H3" />,
  // an end cut at an angle
  terminalSlope: <><path className="faint" d="M15.5 6.5v7" /><path d="M3 6.5h12.5l-3 7H3" /></>,
  // a stem whose cut tilts off the level
  terminalTilt: <><path className="faint" d="M6.5 5.5h7" /><path d="M6.5 16.5V7l7-3v12.5" /></>,
  // a stroke tapering to a blunt or fine tip
  terminalTip: <><path d="M3 6h6l7.5 3v2L9 14H3" /><circle className="faint" cx="16.5" cy="10" r="2.2" /></>,
  // a stroke tapering over a long way
  terminalTaper: <><path d="M3 7h3l11 3-11 3H3" /><path className="faint" d="M6 16.5h11M6 15.5v2M17 15.5v2" /></>,

  // —— Letters
  // an i's dot growing
  dotSize: <><path d="M10 9.5v7" /><circle className="solid" cx="10" cy="5" r="2" /><circle className="faint" cx="10" cy="5" r="3.2" /></>,

  // —— Script
  // a u with a stroke leading on to the next letter
  cursive: <path d="M3 7v4.5a3 3 0 0 0 6 0V7v6c0 1.6 1 2.5 2.4 2.5 2 0 3.6-1.6 5.1-4" />,
  // a wobbly stem beside a ruled one
  wobble: <><path className="faint" d="M5 3.5v13" /><path d="M12 3.5c-1.4 2.1 1.7 3.6.4 6.3s1.3 4.1-.1 6.7" /></>,
  // a T whose bar curls out into a flourish
  swash: <path d="M17 4H6.5C4.3 4 3 5.3 3 6.8 3 8 3.9 8.8 5 8.8M11.5 4v12.5" />,

  // —— Effects
  // grid size: a grid of dots
  module: <><circle className="solid" cx="5" cy="5" r="1.6" /><circle className="solid" cx="10" cy="5" r="1.6" /><circle className="solid" cx="15" cy="5" r="1.6" /><circle className="solid" cx="5" cy="10" r="1.6" /><circle className="solid" cx="10" cy="10" r="1.6" /><circle className="solid" cx="15" cy="10" r="1.6" /><circle className="solid" cx="5" cy="15" r="1.6" /><circle className="solid" cx="10" cy="15" r="1.6" /><circle className="solid" cx="15" cy="15" r="1.6" /></>,
  // an H's bar stopped short of its stems
  barGap: <><path d="M4.5 3.5v13M15.5 3.5v13M7.5 10h5" /></>,
  // an O cut into two halves
  stencil: <path d="M12 3.82a6.5 6.5 0 0 1 0 12.36M8 16.18a6.5 6.5 0 0 1 0-12.36" />,
  // the gap between two strokes widening
  stencilGap: <><rect className="solid" x="1.5" y="7" width="3.5" height="6" rx=".6" /><rect className="solid" x="15" y="7" width="3.5" height="6" rx=".6" /><path d="M7 10h6M8.6 8.4 7 10l1.6 1.6M11.4 8.4 13 10l-1.6 1.6" /></>,
  // a corner's gap moved out along the stroke
  stencilPos: <><path d="M4 3.5v6M4 12.5v4h12.5" /><path className="faint" d="M7 12V7M5.6 8.4 7 7l1.4 1.4" /></>,
  // a gap whose cut corners round
  stencilRound: <><path d="M2.5 6.5h4a2.5 2.5 0 0 1 2.5 2.5v2a2.5 2.5 0 0 1-2.5 2.5h-4M17.5 6.5h-4A2.5 2.5 0 0 0 11 9v2a2.5 2.5 0 0 0 2.5 2.5h4" /></>,
  // an O cut through by a level line
  slice: <path d="M3.82 8a6.5 6.5 0 0 1 12.36 0M16.18 12a6.5 6.5 0 0 1-12.36 0" />,
  // the cut growing taller
  sliceGap: <><rect className="solid" x="3" y="2.5" width="14" height="4" rx=".6" /><rect className="solid" x="3" y="13.5" width="14" height="4" rx=".6" /><path d="M10 8.5v3M8.9 9.4 10 8.3l1.1 1.1M8.9 10.6l1.1 1.1 1.1-1.1" /></>,
  // the cut moving up the letters
  slicePos: <><path d="M3 3.5h9v5H3zM3 11.5h9v5H3z" /><path className="faint" d="M15.5 6v8M14 7.5 15.5 6 17 7.5M14 12.5l1.5 1.5 1.5-1.5" /></>,
  // a cut whose corners round
  sliceRound: <path d="M3.5 2.5v4a2.5 2.5 0 0 0 2.5 2.5h8a2.5 2.5 0 0 0 2.5-2.5v-4M3.5 17.5v-4A2.5 2.5 0 0 1 6 11h8a2.5 2.5 0 0 1 2.5 2.5v4" />
};

/** Every slider that has a drawing. */
export const SLIDER_ICON_KEYS = Object.keys(SLIDER);

export function SliderIcon({ k }: { k: string }) {
  if (!(k in SLIDER)) return null;
  return <svg className="ctl-icon" width="18" height="18" viewBox="0 0 20 20" aria-hidden="true">{SLIDER[k]}</svg>;
}
