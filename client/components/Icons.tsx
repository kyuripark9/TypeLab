/* The navigation's icons: one small line drawing per page, each showing what that page changes
   (a thin and a thick stem for Weight, a rounded corner for Corners, a serifed I for Serifs).
   Drawn on a 20-unit grid in the current text colour; `faint` lines are guides, not the subject. */
import type { ReactNode } from 'react';
import type { CategoryId } from '../../shared/content';

const PAGE: Record<CategoryId, ReactNode> = {
  // a set of styles to pick from
  style: <><rect x="3" y="3" width="6" height="6" rx="1.5" /><rect x="11" y="3" width="6" height="6" rx="1.5" /><rect x="3" y="11" width="6" height="6" rx="1.5" /><rect x="11" y="11" width="6" height="6" rx="1.5" /></>,
  // a face: the mood of the letters
  // a hairline stem beside a heavy one
  weight: <><path d="M5.5 4v12" /><rect x="10" y="4" width="5" height="12" rx=".8" className="solid" /></>,
  // a box leaning over: size and slant
  size: <><rect className="faint" x="4" y="4" width="8.5" height="12" rx=".5" /><path d="M7.5 4H16l-3 12H4.5z" /></>,
  // an h standing on the baseline, its arch reaching the x-height
  heights: <><path className="faint" d="M2.5 16.5h15M2.5 8.5h15" /><path d="M6.5 3.5v13M6.5 12.5a4 4 0 0 1 8 0v4" /></>,
  // a c: the space inside and the open mouth
  insides: <path d="M15.2 6.3a6.5 6.5 0 1 0 0 7.4" />,
  // two stems with the space between them
  spacing: <><path d="M3.5 4v12M16.5 4v12" /><path d="M7 10h6M8.5 8.2 6.7 10l1.8 1.8M11.5 8.2l1.8 1.8-1.8 1.8" /></>,
  // a curve and its two handles
  curves: <><path d="M4 16C4 9.5 9.5 4 16 4" /><path className="faint" d="M4 16V9.5M16 4H9.5" /><circle cx="4" cy="9.5" r="1.3" className="solid" /><circle cx="9.5" cy="4" r="1.3" className="solid" /></>,
  // a corner rounding off its square
  corners: <><path className="faint" d="M4 9V4h5" /><path d="M4 16.5V11a7 7 0 0 1 7-7h5.5" /></>,
  // a stroke finishing in a round end
  ends: <path d="M2.5 6.5H11a3.5 3.5 0 0 1 0 7H2.5" />,
  // an I with bracketed serifs
  serifs: <path d="M4.5 3.5h11v1.8c-2.4 0-3.4.6-3.4 2.2v5c0 1.6 1 2.2 3.4 2.2v1.8h-11v-1.8c2.4 0 3.4-.6 3.4-2.2v-5c0-1.6-1-2.2-3.4-2.2z" />,
  // a capital and a small letter
  letters: <><path d="M2.5 16 6.7 4.5 10.9 16M4.1 12.2h5.2" /><circle cx="14.3" cy="13.3" r="2.7" /><path d="M17 10v6" /></>,
  // a line of joined-up writing
  script: <path d="M2.5 14.5c2.2 0 3.6-3 4.6-6.3.6-2 1.7-3.4 2.6-2.9 1 .5.3 3.3-1.4 5.8-1.2 1.9-1.4 3.9 0 3.9 1.6 0 2.7-3.6 3.7-3.6.8 0 .3 3.1 1.7 3.1 1.2 0 2.2-1.3 3.8-1.3" />,
  // a sparkle
  effects: <><path d="M9 3c.5 3.3 2.2 5 5.5 5.5C11.2 9 9.5 10.7 9 14c-.5-3.3-2.2-5-5.5-5.5C6.8 8 8.5 6.3 9 3z" /><path d="M15 12.5c.2 1.3.9 2 2.2 2.2-1.3.2-2 .9-2.2 2.2-.2-1.3-.9-2-2.2-2.2 1.3-.2 2-.9 2.2-2.2z" /></>
};

export function PageIcon({ id }: { id: CategoryId }) {
  return <svg className="page-icon" width="20" height="20" viewBox="0 0 20 20" aria-hidden="true">{PAGE[id]}</svg>;
}

export function SearchIcon() {
  return <svg className="page-icon" width="16" height="16" viewBox="0 0 20 20" aria-hidden="true"><circle cx="8.5" cy="8.5" r="5.5" /><path d="m12.6 12.6 4.4 4.4" /></svg>;
}
