/* Accounts in the app: the sign-in dialog (create an account or sign in), and the button at the
   right end of every header, Sign in while signed out and the account's initial once signed in. */
import { useEffect, useRef, useState, type FormEvent } from 'react';
import { Link, useLocation, useNavigate } from 'react-router';
import { PASSWORD_MIN, USER_NAME_MAX } from '../../shared/account';
import { api, errorMessage } from '../lib/api';
import { auth, useAuth, type AuthMode } from '../state/auth';
import { actions, isDirty, useEditor } from '../state/editor';
import { Dialog } from './Dialog';

/** Escape closes, and the focus goes back where it was. */
function useEscape(onClose: () => void) {
  useEffect(() => {
    const was = document.activeElement as HTMLElement | null;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      e.preventDefault();
      e.stopPropagation();
      onClose();
    };
    addEventListener('keydown', onKey, true);
    return () => { removeEventListener('keydown', onKey, true); was?.focus?.(); };
  }, [onClose]);
}

/** Open from anywhere with auth.open(); rendered once, beside the router. */
export function AuthDialog() {
  const mode = useAuth(s => s.dialog);
  return mode ? <AuthForm key={mode} mode={mode} /> : null;
}

function AuthForm({ mode }: { mode: AuthMode }) {
  const signup = mode === 'signup';
  const [name, setName] = useState(''), [email, setEmail] = useState(''), [password, setPassword] = useState('');
  const [show, setShow] = useState(false), [busy, setBusy] = useState(false), [error, setError] = useState('');
  useEscape(auth.close);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      auth.signedIn(signup ? await api.signUp({ name, email, password }) : await api.signIn({ email, password }), signup);
    } catch (err) {
      setError(errorMessage(err));
      setBusy(false);
    }
  };

  return (
    <div className="dialog-scrim" onPointerDown={e => { if (e.target === e.currentTarget) auth.close(); }}>
      <form className="dialog auth" role="dialog" aria-modal="true" aria-labelledby="auth-title" onSubmit={submit}>
        <button type="button" className="btn ghost icon small auth-close" aria-label="Close" onClick={auth.close}>
          <svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true"><path d="m4 4 8 8M12 4l-8 8" /></svg>
        </button>
        <h2 id="auth-title">{signup ? 'Create your account' : 'Sign in to TypeLab'}</h2>
        <p>{signup
          ? 'Your fonts are kept in your account, so you can open, edit and download them on any computer.'
          : 'Your saved fonts are waiting in your account.'}</p>
        {signup && (
          <label className="field">
            <span>Name <i>optional</i></span>
            <input value={name} maxLength={USER_NAME_MAX} autoComplete="name" onChange={e => setName(e.target.value)} />
          </label>
        )}
        <label className="field">
          <span>Email</span>
          <input type="email" required value={email} autoComplete="email" autoFocus spellCheck={false} onChange={e => setEmail(e.target.value)} />
        </label>
        <label className="field">
          <span>Password</span>
          <span className="field-row">
            <input type={show ? 'text' : 'password'} required minLength={signup ? PASSWORD_MIN : undefined} value={password}
              autoComplete={signup ? 'new-password' : 'current-password'} onChange={e => setPassword(e.target.value)} />
            <button type="button" className="field-show" onClick={() => setShow(v => !v)} aria-pressed={show}>{show ? 'Hide' : 'Show'}</button>
          </span>
          {signup && <small>At least {PASSWORD_MIN} characters</small>}
        </label>
        {error && <p className="form-error" role="alert">{error}</p>}
        <button type="submit" className="btn primary auth-submit" disabled={busy}>
          {busy ? (signup ? 'Creating account…' : 'Signing in…') : signup ? 'Create account' : 'Sign in'}
        </button>
        <p className="auth-switch">
          {signup ? 'Already have an account?' : 'New to TypeLab?'}{' '}
          <button type="button" onClick={() => auth.open(signup ? 'signin' : 'signup')}>{signup ? 'Sign in' : 'Create an account'}</button>
        </p>
      </form>
    </div>
  );
}

/** The header's account button and its menu. */
export function AccountButton() {
  const user = useAuth(s => s.user);
  const [open, setOpen] = useState(false), [confirm, setConfirm] = useState(false);
  const wrap = useRef<HTMLDivElement>(null);
  const navigate = useNavigate(), path = useLocation().pathname;

  useEffect(() => {
    if (!open) return;
    const close = (e: PointerEvent) => { if (!wrap.current?.contains(e.target as Node)) setOpen(false); };
    const esc = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false); };
    document.addEventListener('pointerdown', close);
    document.addEventListener('keydown', esc);
    return () => { document.removeEventListener('pointerdown', close); document.removeEventListener('keydown', esc); };
  }, [open]);

  if (user === undefined) return null;
  if (!user) return <button className="btn ghost" onClick={() => auth.open('signin')}>Sign in</button>;

  const signOut = async (saveFirst: boolean) => {
    setConfirm(false);
    try {
      await auth.signOut(saveFirst);
      // the design that was open is in the account, out of reach now
      if (path.startsWith('/d/')) navigate('/', { replace: true });
    } catch (e) { actions.toast(`Couldn’t sign out — ${errorMessage(e)}`); }
  };
  const askSignOut = () => {
    setOpen(false);
    const s = useEditor.getState();
    if (s.designId && isDirty(s)) setConfirm(true); else void signOut(false);
  };

  return (
    <div className="account" ref={wrap}>
      <button className="avatar" aria-label={`Account: ${user.name}`} title={user.email} aria-expanded={open} aria-haspopup="menu" onClick={() => setOpen(o => !o)}>
        {[...user.name.trim()][0]?.toUpperCase() ?? '?'}
      </button>
      {open && (
        <div className="popover account-menu" role="menu">
          <div className="account-who"><b>{user.name}</b><span>{user.email}</span></div>
          <Link role="menuitem" to="/designs" onClick={() => setOpen(false)}>My designs</Link>
          <Link role="menuitem" to="/account" onClick={() => setOpen(false)}>Account settings</Link>
          <button role="menuitem" onClick={askSignOut}>Sign out</button>
        </div>
      )}
      {confirm && (
        <Dialog title="Save before signing out?" body="This design has changes you haven’t saved. It’s kept in your account, so once you sign out it opens only after signing in again."
          onCancel={() => setConfirm(false)}
          choices={[
            { label: 'Save and sign out', primary: true, run: () => void signOut(true) },
            { label: 'Don’t save', run: () => void signOut(false) },
            { label: 'Cancel', run: () => setConfirm(false) }
          ]} />
      )}
    </div>
  );
}
