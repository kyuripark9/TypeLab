/* The app's addresses: main.tsx's router serves them, and every link and redirect builds them here. Saving a
   new design moves the editor to its address and the leave guard (pages/EditorPage.tsx) lets exactly that move
   through, so both build it with designPath. Bookmarks and shared links point at these, so they never change;
   styles.css also finds the header's My designs link by its address, a[href="/designs"], to hide it on phones. */

/** The editor with a new design. */
export const NEW_DESIGN = '/';
/** My designs. */
export const DESIGNS = '/designs';
/** The account settings. */
export const ACCOUNT = '/account';
/** A saved design, open in the editor (`:id` in the router's pattern). */
export const designPath = (id: string) => `/d/${id}`;
/** Whether `path` is a saved design's address. */
export const isDesignPath = (path: string) => path.startsWith(designPath(''));
