/* Who's signed in, and the sign-in dialog any page can open. `user` is undefined until the server
   has answered, null when signed out. */
import { create } from 'zustand';
import type { User } from '../../shared/account';
import { cleanName } from '../../shared/design';
import { api, type SignedIn } from '../lib/api';
import { actions, useEditor } from './editor';

export type AuthMode = 'signin' | 'signup';

interface AuthState {
  user: User | null | undefined;
  /** the sign-in dialog, while it's open */
  dialog: AuthMode | null;
}

export const useAuth = create<AuthState>(() => ({ user: undefined, dialog: null }));

const fonts = (n: number) => `${n} ${n === 1 ? 'font' : 'fonts'}`;

export const auth = {
  async load() {
    try { useAuth.setState({ user: await api.me() }); } catch { useAuth.setState({ user: null }); }
  },
  open(mode: AuthMode) { useAuth.setState({ dialog: mode }); },
  close() { useAuth.setState({ dialog: null }); },

  /** After signing up or in: the fonts this browser saved while signed out are in the account now. */
  signedIn({ user, moved }: SignedIn, isNew: boolean) {
    useAuth.setState({ user, dialog: null });
    const hello = isNew ? `Welcome, ${user.name}` : `Signed in as ${user.name}`;
    actions.toast(moved ? `${hello} — ${fonts(moved)} from this browser ${moved === 1 ? 'is' : 'are'} in your account now` : hello);
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
    if (useEditor.getState().designId) actions.newDesign();
    useAuth.setState({ user: null });
    actions.toast('Signed out');
  }
};
