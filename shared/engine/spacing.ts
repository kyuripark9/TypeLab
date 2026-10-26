/* Source preview pen steps and installed font advances use the same representable width. */
export function encodedAdvance(advance: number, tracking: number, space = false): number {
  return Math.round(Math.max(space ? 40 : 20, advance + tracking));
}
