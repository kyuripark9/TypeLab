/* The app's addresses: main.tsx's router serves them, and every link and redirect builds them here. Saving a
   new design moves the editor to its address and the leave guard (pages/EditorPage.tsx) lets exactly that move
   through, so both build it with designPath. Bookmarks and shared links point at these, so they never change;
   styles.css also finds the header's My designs link by its address, a[href="/designs"], to hide it on phones. */
import { CONTROLS, SUBS, controlFor, pageOf, type ActiveKey, type CategoryId } from '../../shared/content';

/** The editor with a new design. */
export const NEW_DESIGN = '/';
/** My designs. */
export const DESIGNS = '/designs';
/** The account settings. */
export const ACCOUNT = '/account';
/** Setting a new password from an emailed reset link (`?token=`). */
export const RESET = '/reset';
/** What TypeLab keeps and the terms it's offered on. */
export const PRIVACY = '/privacy';
/** A saved design, open in the editor (`:id` in the router's pattern). */
export const designPath = (id: string) => `/d/${id}`;
/** Whether `path` is a saved design's address. */
export const isDesignPath = (path: string) => path.startsWith(designPath(''));

/** What a link into the editor asks for, each left out unless it does: a starting style, the preview text, the
    page, the control in hand, the highlight on (hot), a letter in the inspector, and Points mode (pen). */
export interface DeepLink { style?: string; text?: string; page?: CategoryId; active?: ActiveKey; hot: boolean; inspect?: string; pen: boolean }
/** A link's query read as a DeepLink: ?style=serif&cat=serifs&active=serifTip&inspect=R&text=Hello&hot=1&pen=1, handy
    for demos. `cat` names a page or a group of them (shape, see pageOf), and an `active` control opens the page it
    is on; a control or page it doesn't know is left out. */
export function readDeepLink(q: URLSearchParams): DeepLink {
  const style = q.get('style'), text = q.get('text'), cat = q.get('cat'), active = q.get('active'), inspect = q.get('inspect');
  const a = active && (active in CONTROLS || active in SUBS) ? active as ActiveKey : undefined;
  const page = cat === 'style' ? 'style' : a ? CONTROLS[controlFor(a)].cat : pageOf(cat);
  return { style: style || undefined, text: text || undefined, page, active: a, hot: !!q.get('hot'), inspect: inspect || undefined, pen: !!q.get('pen') };
}
