/* Who's signed in, and the sign-in dialog any page can open. `user` is undefined until the server
   has answered, null when signed out. Google sign-in runs in a popup so the open design stays as it
   is; the popup reports back on a BroadcastChannel, which also tells the other TypeLab tabs when
   someone signs in or out, so every tab shows the same account. */
import { create } from 'zustand';
import type { GoogleResult, User } from '../../shared/account';
import { cleanName } from '../../shared/design';
import { api, type SignedIn } from '../lib/api';
import { actions, useEditor } from './editor';

export type AuthMode = 'signin' | 'signup';
type GoogleIntent = 'signin' | 'link';

interface AuthState {
  user: User | null | undefined;
  /** whether this server offers Google sign-in */
  google: boolean;
  /** the sign-in dialog, while it's open */
  dialog: AuthMode | null;
  /** a Google window is open, waiting for the person to finish there */
  googleWaiting: GoogleIntent | null;
  /** why the last Google sign-in didn't work, shown in the dialog */
  googleError: string;
}

export const useAuth = create<AuthState>(() => ({ user: undefined, google: false, dialog: null, googleWaiting: null, googleError: '' }));

const fonts = (n: number) => `${n} ${n === 1 ? 'font' : 'fonts'}`;

const channel = typeof BroadcastChannel === 'undefined' ? null : new BroadcastChannel('typelab-auth');
/** Tell the other tabs the account changed. */
const notify = () => channel?.postMessage({ type: 'changed' });

/** The email last signed in with here, to fill in next time. */
const EMAIL_KEY = 'typelab.email';
export function lastEmail() {
  try { return localStorage.getItem(EMAIL_KEY) ?? ''; } catch { return ''; }
}
function rememberEmail(email: string | null) {
  try { if (email) localStorage.setItem(EMAIL_KEY, email); else localStorage.removeItem(EMAIL_KEY); } catch { /* storage off */ }
}

export const auth = {
  /** Once, at start-up: take a Google result off the address (after a sign-in that couldn't use a
      popup), listen to the other tabs, and ask who's signed in. */
  async start() {
    const q = new URLSearchParams(location.search), raw = q.get('google');
    let result: GoogleResult | null = null;
    if (raw !== null) {
      q.delete('google');
      history.replaceState(history.state, '', location.pathname + (q.size ? `?${q}` : '') + location.hash);
      try { result = JSON.parse(raw); } catch { /* not ours */ }
    }
    channel?.addEventListener('message', e => {
      const m = e.data as { type: string; result?: GoogleResult };
      if (m.type === 'google' && m.result && useAuth.getState().googleWaiting) void auth.googleDone(m.result);
      // another tab signed in or out: show the same here, closing a sign-in dialog left open
      else void auth.load().then(() => { if (useAuth.getState().user) useAuth.setState({ dialog: null }); });
    });
    await auth.load();
    if (result) await auth.googleDone(result);
  },

  async load() {
    try {
      const { user, google } = await api.me();
      useAuth.setState({ user, google });
    } catch { useAuth.setState({ user: null }); }
  },
  open(mode: AuthMode) { useAuth.setState({ dialog: mode, googleWaiting: null, googleError: '' }); },
  /** A Google window still open keeps waiting: finishing there signs in all the same. */
  close() { useAuth.setState({ dialog: null, googleError: '' }); },

  /** After signing up or in: the fonts this browser saved while signed out are in the account now. */
  signedIn({ user, moved }: SignedIn, isNew: boolean, note = '') {
    useAuth.setState({ user, dialog: null, googleWaiting: null, googleError: '' });
    rememberEmail(user.email);
    notify();
    const hello = isNew ? `Welcome, ${user.name}` : `Signed in as ${user.name}`;
    actions.toast((moved ? `${hello} — ${fonts(moved)} from this browser ${moved === 1 ? 'is' : 'are'} in your account now` : hello) + note);
  },

  /** Sign in with Google, or connect it to the account signed in. A popup keeps this page (and the
      design open in it) as it is; where popups are blocked, the whole page goes and comes back. */
  google(intent: GoogleIntent) {
    const back = location.pathname + location.search, w = 480, h = 640;
    const popup = channel && window.open(api.googleUrl(intent, true, back), 'typelab-google',
      `popup,width=${w},height=${h},left=${Math.round(screenX + (outerWidth - w) / 2)},top=${Math.round(screenY + (outerHeight - h) / 3)}`);
    if (popup) {
      useAuth.setState({ googleWaiting: intent, googleError: '' });
      popup.focus();
    } else location.assign(api.googleUrl(intent, false, back));
  },

  /** How a Google sign-in or connect ended. */
  async googleDone(result: GoogleResult) {
    useAuth.setState({ googleWaiting: null });
    if (!result.ok) {
      if (result.cancelled) return;
      if (useAuth.getState().dialog) useAuth.setState({ googleError: result.error });
      else actions.toast(result.error);
      return;
    }
    // back from a full-page trip the user isn't in the result; it's been loaded already
    const user = result.user ?? (await api.me()).user;
    if (!user) return;
    if (result.intent === 'link') {
      useAuth.setState({ user });
      notify();
      actions.toast(`Google is connected — you can sign in with ${user.google || 'it'} now`);
      return;
    }
    auth.signedIn({ user, moved: result.moved }, result.isNew,
      result.passwordRemoved ? '. Google confirmed this email, so its old password is off; set a new one in Account settings' : '');
  },

  /** Sign out, first saving the open design if it has changes (it's in the account, and out of
      reach once signed out). The open design is put away; a new, unsaved one stays as it is. */
  async signOut(saveFirst: boolean) {
    const s = useEditor.getState();
    if (saveFirst && s.designId) {
      const input = { name: cleanName(s.name), styleId: s.styleId, params: s.params };
      actions.markSaved(await api.updateDesign(s.designId, input), input);
    }
    await api.signOut();
    auth.signedOut('Signed out');
  },

  /** Signed out here, by signing out or by closing the account. */
  signedOut(message: string) {
    if (useEditor.getState().designId) actions.newDesign();
    useAuth.setState({ user: null });
    notify();
    actions.toast(message);
  }
};
