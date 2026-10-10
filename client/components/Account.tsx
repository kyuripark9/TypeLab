/* Accounts in the app: the sign-in dialog (create an account or sign in, with an email or with
   Google), and the account button in the bottom-left corner of every page, Sign in while signed
   out and the account's initial and name once signed in. */
import { useEffect, useRef, useState, type FormEvent, type KeyboardEvent as KeyEvent } from 'react';
import { Link, useLocation, useNavigate } from 'react-router';
import { PASSWORD_MIN, USER_NAME_MAX } from '../../shared/account';
import { api, errorMessage } from '../lib/api';
import { auth, lastEmail, useAuth, type AuthMode } from '../state/auth';
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

/** Google's "G", as its sign-in buttons carry it. */
export function GoogleMark() {
  return (
    <svg className="google-mark" viewBox="0 0 18 18" width="18" height="18" aria-hidden="true">
      <path fill="#4285F4" d="M17.64 9.2c0-.64-.06-1.25-.16-1.84H9v3.48h4.84a4.14 4.14 0 0 1-1.8 2.72v2.26h2.92c1.7-1.57 2.68-3.88 2.68-6.62Z" />
      <path fill="#34A853" d="M9 18c2.43 0 4.47-.8 5.96-2.18l-2.92-2.26c-.8.54-1.84.86-3.04.86-2.34 0-4.32-1.58-5.03-3.7H.96v2.33A9 9 0 0 0 9 18Z" />
      <path fill="#FBBC05" d="M3.97 10.72A5.4 5.4 0 0 1 3.68 9c0-.6.1-1.18.29-1.72V4.95H.96A9 9 0 0 0 0 9c0 1.45.35 2.83.96 4.05l3.01-2.33Z" />
      <path fill="#EA4335" d="M9 3.58c1.32 0 2.5.45 3.44 1.35l2.58-2.58A9 9 0 0 0 .96 4.95l3.01 2.33C4.68 5.16 6.66 3.58 9 3.58Z" />
    </svg>
  );
}

function GoogleButton() {
  return (
    <button type="button" className="btn wide auth-google" onClick={() => auth.google('signin')}>
      <GoogleMark />Continue with Google
    </button>
  );
}

/** Open from anywhere with auth.open(); rendered once, beside the router. */
export function AuthDialog() {
  const mode = useAuth(s => s.dialog);
  return mode ? <AuthForm key={mode} mode={mode} /> : null;
}

/** The dialog asks for the email first, then for what that email needs: its password, a name and
    password for a new account, or Google for an account made with it. So nobody has to know
    beforehand whether they have an account, and switching between the two loses nothing typed. */
type Step = 'email' | 'password' | 'create' | 'google';

/** Each step's words: its heading (the email step's by how the dialog was opened) and its submit
    button, idle and while busy. The Google step has no submit button, only Google's. */
const STEP_TEXT: Record<Step, { title: string | Record<AuthMode, string>; submit?: string; busy?: string }> = {
  email: { title: { signin: 'Sign in to TypeLab', signup: 'Create your account' }, submit: 'Continue', busy: 'Checking…' },
  password: { title: 'Welcome back', submit: 'Sign in', busy: 'Signing in…' },
  create: { title: 'Create your account', submit: 'Create account', busy: 'Creating account…' },
  google: { title: 'Welcome back' }
};

function AuthForm({ mode }: { mode: AuthMode }) {
  const google = useAuth(s => s.google), waiting = useAuth(s => s.googleWaiting === 'signin'), googleError = useAuth(s => s.googleError);
  const [step, setStep] = useState<Step>('email'), [hasGoogle, setHasGoogle] = useState(false);
  const [email, setEmail] = useState(lastEmail), [name, setName] = useState(''), [password, setPassword] = useState('');
  const [show, setShow] = useState(false), [caps, setCaps] = useState(false), [forgot, setForgot] = useState(false);
  const [busy, setBusy] = useState(false), [error, setError] = useState('');
  const passwordRef = useRef<HTMLInputElement>(null);
  useEscape(auth.close);

  const go = (next: Step) => {
    setStep(next);
    setError('');
    setPassword('');
    setForgot(false);
    useAuth.setState({ googleError: '' });
  };

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      if (step === 'email') {
        const has = await api.checkEmail(email);
        setHasGoogle(has.google);
        go(!has.exists ? 'create' : has.password ? 'password' : 'google');
      } else if (step === 'password') auth.signedIn(await api.signIn({ email, password }), false);
      else if (step === 'create') auth.signedIn(await api.signUp({ name, email, password }), true);
    } catch (err) {
      setError(errorMessage(err));
      if (step === 'password') passwordRef.current?.select();
    }
    setBusy(false);
  };

  const capsKey = (e: KeyEvent<HTMLInputElement>) => setCaps(e.getModifierState('CapsLock'));
  const text = STEP_TEXT[step], title = typeof text.title === 'string' ? text.title : text.title[mode];
  const message = error || googleError;
  const or = <div className="auth-or" role="separator"><span>or</span></div>;

  return (
    <div className="dialog-scrim" onPointerDown={e => { if (e.target === e.currentTarget) auth.close(); }}>
      <form className="dialog auth" role="dialog" aria-modal="true" aria-labelledby="auth-title" onSubmit={submit} noValidate={step !== 'email'}>
        <button type="button" className="btn ghost icon small auth-close" aria-label="Close" onClick={auth.close}>
          <svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true"><path d="m4 4 8 8M12 4l-8 8" /></svg>
        </button>
        <h2 id="auth-title">{title}</h2>

        {step === 'email' ? (
          <>
            <p>{mode === 'signup'
              ? 'Keep your fonts in an account, to open, edit and download them on any computer.'
              : 'Your saved fonts open on any computer you sign in on.'}</p>
            {google && <><GoogleButton />{or}</>}
            <label className="field">
              <span>Email</span>
              <input type="email" name="email" required value={email} autoComplete="username email" autoFocus spellCheck={false}
                onChange={e => setEmail(e.target.value)} onFocus={e => e.currentTarget.select()} />
            </label>
          </>
        ) : (
          <div className="auth-email">
            <span title={email}>{email}</span>
            <button type="button" onClick={() => go('email')}>Change</button>
            {/* for password managers, which save the email with the password */}
            <input type="email" name="email" value={email} autoComplete="username" readOnly tabIndex={-1} aria-hidden="true" className="sr-only" />
          </div>
        )}

        {step === 'create' && (
          <label className="field">
            <span>Name <i>optional</i></span>
            <input value={name} maxLength={USER_NAME_MAX} autoComplete="name" autoFocus onChange={e => setName(e.target.value)} />
          </label>
        )}

        {(step === 'password' || step === 'create') && (
          // a div, not a label: a label would hand clicks on "Password" to the Forgot button in it
          <div className="field">
            <span className="field-head">
              <label htmlFor="auth-password">Password</label>
              {step === 'password' && <button type="button" className="field-link" onClick={() => setForgot(f => !f)} aria-expanded={forgot}>Forgot it?</button>}
            </span>
            <span className="field-row">
              <input ref={passwordRef} id="auth-password" type={show ? 'text' : 'password'} name="password" value={password} autoFocus={step === 'password'}
                autoComplete={step === 'create' ? 'new-password' : 'current-password'} onChange={e => setPassword(e.target.value)} onKeyDown={capsKey} onKeyUp={capsKey} />
              <button type="button" className="field-show" onClick={() => setShow(v => !v)} aria-pressed={show}>{show ? 'Hide' : 'Show'}</button>
            </span>
            {caps && <small className="field-warn">Caps Lock is on</small>}
            {step === 'create' && <small className={password.length >= PASSWORD_MIN ? 'field-ok' : undefined}>At least {PASSWORD_MIN} characters</small>}
          </div>
        )}

        {forgot && (
          <p className="auth-note">{google
            ? 'If this email is a Google account, continue with Google to get back in, then set a new password in Account settings.'
            : 'TypeLab can’t email a reset link yet. Signed in on another computer, you can change the password in Account settings there.'}</p>
        )}

        {step === 'google' && <p className="auth-note">This account signs in with Google{google ? '.' : ', which isn’t available on this server right now.'}</p>}

        {message && <p className="form-error" role="alert">{message}</p>}

        {step !== 'google' && (
          <button type="submit" className="btn primary auth-submit"
            disabled={busy || (step === 'email' ? !email.trim() : step === 'create' ? password.length < PASSWORD_MIN : !password)}>
            {busy ? text.busy : text.submit}
          </button>
        )}
        {google && (step === 'google' || (step === 'password' && (hasGoogle || forgot))) && <>{step !== 'google' && or}<GoogleButton /></>}
        {waiting && <p className="auth-wait" role="status">Finish signing in in the Google window.</p>}

        {step === 'email' && (
          <p className="auth-switch">{mode === 'signup' ? 'Have an account already? Enter its email to sign in.' : 'New here? Enter your email to make an account.'}</p>
        )}
      </form>
    </div>
  );
}

/** The account button and its menu, which opens upward: at the foot of the editor's page menu,
    and on pages without one in the corner by itself (AccountCorner). */
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
  if (!user) return (
    <button className="account-row signin" onClick={() => auth.open('signin')}>
      <svg className="page-icon" viewBox="0 0 20 20" width="18" height="18" aria-hidden="true"><circle cx="10" cy="7" r="3.25" /><path d="M3.75 16.5c.8-3 3.2-4.5 6.25-4.5s5.45 1.5 6.25 4.5" /></svg>
      <span className="nav-label">Sign in</span>
    </button>
  );

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
      <button className="account-row" title={user.email} aria-expanded={open} aria-haspopup="menu" onClick={() => setOpen(o => !o)}>
        <span className="avatar" aria-hidden="true">{[...user.name.trim()][0]?.toUpperCase() ?? '?'}</span>
        <span className="nav-label">{user.name}</span>
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

/** The account button on a page without the editor's page menu: alone in the bottom-left corner. */
export function AccountCorner() {
  return <div className="account-corner"><AccountButton /></div>;
}
