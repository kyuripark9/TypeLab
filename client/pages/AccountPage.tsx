/* Account settings: the name shown in the header, the ways to sign in (Google and a password), the
   other browsers signed in, and closing the account. */
import { useEffect, useState, type FormEvent, type ReactNode } from 'react';
import { Link, useNavigate } from 'react-router';
import { PASSWORD_MIN, USER_NAME_MAX } from '../../shared/account';
import { api, errorMessage } from '../lib/api';
import { AccountCorner, GoogleMark } from '../components/Account';
import { Toast } from '../components/Chrome';
import { Brand } from '../components/Header';
import { auth, useAuth } from '../state/auth';
import { actions } from '../state/editor';

export function AccountPage() {
  const user = useAuth(s => s.user);
  useEffect(() => { document.title = 'Account — TypeLab'; }, []);
  return (
    <div className="library account-page">
      <header className="top">
        <div className="top-left"><Brand /></div>
        <div className="top-actions">
          <Link className="btn ghost" to="/designs">My designs</Link>
        </div>
      </header>
      <AccountCorner />
      <main className="lib-main account-main">
        <div className="lib-head"><h1>Account</h1></div>
        {user === undefined ? <p className="lib-loading" role="status">Loading…</p>
          : !user ? (
            <div className="lib-empty">
              <h2>You’re not signed in</h2>
              <p>Sign in to see your account, or create one to keep your fonts on any computer.</p>
              <div className="row">
                <button className="btn primary" onClick={() => auth.open('signin')}>Sign in</button>
                <button className="btn wide" onClick={() => auth.open('signup')}>Create account</button>
              </div>
            </div>
          ) : (
            <>
              <Profile key={user.id} />
              <SignIn />
              <Browsers key={`b-${user.id}`} />
              <Close />
            </>
          )}
      </main>
      <Toast />
    </div>
  );
}

function Section({ title, note, children, danger }: { title: string; note?: string; children: ReactNode; danger?: boolean }) {
  return (
    <section className={danger ? 'acct-section danger' : 'acct-section'}>
      <div className="acct-label"><h2>{title}</h2>{note && <p>{note}</p>}</div>
      <div className="acct-body">{children}</div>
    </section>
  );
}

/** A form whose submit is busy until it settles, with its error shown under it. */
function useSubmit(run: () => Promise<void>) {
  const [busy, setBusy] = useState(false), [error, setError] = useState('');
  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError('');
    try { await run(); } catch (err) { setError(errorMessage(err)); } finally { setBusy(false); }
  };
  return { busy, error, submit };
}

function Profile() {
  const user = useAuth(s => s.user)!;
  const [name, setName] = useState(user.name);
  const { busy, error, submit } = useSubmit(async () => {
    useAuth.setState({ user: await api.renameAccount(name) });
    actions.toast('Name saved');
  });
  return (
    <Section title="Profile" note={`Member since ${new Date(user.createdAt).toLocaleDateString(undefined, { year: 'numeric', month: 'long', day: 'numeric' })}`}>
      <form onSubmit={submit}>
        <label className="field"><span>Name</span><input value={name} maxLength={USER_NAME_MAX} autoComplete="name" onChange={e => setName(e.target.value)} /></label>
        <label className="field"><span>Email</span><input value={user.email} readOnly disabled /></label>
        {error && <p className="form-error" role="alert">{error}</p>}
        <button type="submit" className="btn primary" disabled={busy || !name.trim() || name.trim() === user.name}>{busy ? 'Saving…' : 'Save'}</button>
      </form>
    </Section>
  );
}

/** The ways to sign in: Google, connected or not, and the password, set or not. */
function SignIn() {
  const user = useAuth(s => s.user)!, google = useAuth(s => s.google), waiting = useAuth(s => s.googleWaiting === 'link');
  const [editing, setEditing] = useState(false), [busy, setBusy] = useState(false);
  const disconnect = async () => {
    setBusy(true);
    try {
      useAuth.setState({ user: await api.disconnectGoogle() });
      actions.toast('Google is disconnected — sign in with your email and password');
    } catch (e) { actions.toast(errorMessage(e)); }
    setBusy(false);
  };
  return (
    <Section title="Signing in" note="The ways you can sign in to this account.">
      <div className="acct-methods">
        <div className="acct-method">
          <span className="acct-icon"><GoogleMark /></span>
          <div className="acct-what">
            <b>Google</b>
            <span>{user.google !== null ? `Connected${user.google ? ` as ${user.google}` : ''}`
              : waiting ? 'Finish in the Google window…' : 'Sign in with one click, no password to remember'}</span>
          </div>
          {user.google !== null ? (
            <button className="btn outline" disabled={busy || !user.hasPassword} title={user.hasPassword ? undefined : 'Set a password first, so you can still sign in'} onClick={disconnect}>Disconnect</button>
          ) : google && <button className="btn outline" onClick={() => auth.google('link')}>Connect</button>}
        </div>
        <div className="acct-method">
          <span className="acct-icon">
            <svg viewBox="0 0 18 18" width="18" height="18" aria-hidden="true"><rect x="3.5" y="8" width="11" height="7.5" rx="1.8" /><path d="M6 8V5.8a3 3 0 0 1 6 0V8" /></svg>
          </span>
          <div className="acct-what">
            <b>Password</b>
            <span>{user.hasPassword ? 'Sign in with your email and password' : 'Not set — you sign in with Google'}</span>
          </div>
          {!editing && <button className="btn outline" onClick={() => setEditing(true)}>{user.hasPassword ? 'Change' : 'Set a password'}</button>}
        </div>
        {editing && <Password onDone={() => setEditing(false)} />}
      </div>
    </Section>
  );
}

function Password({ onDone }: { onDone: () => void }) {
  const user = useAuth(s => s.user)!, first = !user.hasPassword;
  const [current, setCurrent] = useState(''), [next, setNext] = useState(''), [show, setShow] = useState(false);
  const { busy, error, submit } = useSubmit(async () => {
    useAuth.setState({ user: await api.setPassword(next, first ? undefined : current) });
    actions.toast(first ? 'Password set — you can sign in with it too' : 'Password changed — other browsers are signed out');
    onDone();
  });
  return (
    <form className="acct-password" onSubmit={submit}>
      {/* for password managers, which save the email with the password */}
      <input type="email" value={user.email} autoComplete="username" readOnly tabIndex={-1} aria-hidden="true" className="sr-only" />
      {!first && (
        <label className="field"><span>Current password</span>
          <input type="password" required autoFocus value={current} autoComplete="current-password" onChange={e => setCurrent(e.target.value)} />
        </label>
      )}
      <label className="field">
        <span>{first ? 'Password' : 'New password'}</span>
        <span className="field-row">
          <input type={show ? 'text' : 'password'} required autoFocus={first} minLength={PASSWORD_MIN} value={next} autoComplete="new-password" onChange={e => setNext(e.target.value)} />
          <button type="button" className="field-show" onClick={() => setShow(v => !v)} aria-pressed={show}>{show ? 'Hide' : 'Show'}</button>
        </span>
        <small className={next.length >= PASSWORD_MIN ? 'field-ok' : undefined}>At least {PASSWORD_MIN} characters{first ? '' : ' · signs you out on other browsers'}</small>
      </label>
      {error && <p className="form-error" role="alert">{error}</p>}
      <div className="row">
        <button type="submit" className="btn primary" disabled={busy || next.length < PASSWORD_MIN || (!first && !current)}>
          {busy ? 'Saving…' : first ? 'Set password' : 'Change password'}
        </button>
        <button type="button" className="btn outline" onClick={onDone}>Cancel</button>
      </div>
    </form>
  );
}

/** The other browsers signed in to the account, and signing them out. */
function Browsers() {
  const [others, setOthers] = useState<number | null>(null), [busy, setBusy] = useState(false);
  useEffect(() => { api.otherSessions().then(setOthers, () => setOthers(null)); }, []);
  const end = async () => {
    setBusy(true);
    try {
      await api.endOtherSessions();
      setOthers(0);
      actions.toast('Signed out of the other browsers');
    } catch (e) { actions.toast(errorMessage(e)); }
    setBusy(false);
  };
  return (
    <Section title="Browsers" note="Signing in on a shared computer? Sign it out from here later.">
      <div className="acct-method">
        <div className="acct-what">
          <b>{others === null ? 'This browser' : others === 0 ? 'Only this browser' : `This browser and ${others} other${others === 1 ? '' : 's'}`}</b>
          <span>{others ? 'Signing them out keeps you signed in here.' : 'You’re not signed in anywhere else.'}</span>
        </div>
        <button className="btn outline" disabled={busy || !others} onClick={end}>Sign out others</button>
      </div>
    </Section>
  );
}

function Close() {
  const user = useAuth(s => s.user)!;
  const [open, setOpen] = useState(false), [confirm, setConfirm] = useState('');
  const navigate = useNavigate();
  const { busy, error, submit } = useSubmit(async () => {
    await api.deleteAccount(user.hasPassword ? { password: confirm } : { confirm });
    auth.signedOut('Your account and its fonts are deleted');
    navigate('/');
  });
  return (
    <Section title="Delete account" danger note="Deletes the account and every font saved in it. Download any you want to keep first.">
      {!open ? <button className="btn wide danger-btn" onClick={() => setOpen(true)}>Delete account…</button> : (
        <form onSubmit={submit}>
          {user.hasPassword
            ? <label className="field"><span>Type your password to confirm</span><input type="password" required autoFocus value={confirm} autoComplete="current-password" onChange={e => setConfirm(e.target.value)} /></label>
            : <label className="field"><span>Type <b>{user.email}</b> to confirm</span><input type="email" required autoFocus value={confirm} autoComplete="off" spellCheck={false} onChange={e => setConfirm(e.target.value)} /></label>}
          {error && <p className="form-error" role="alert">{error}</p>}
          <div className="row">
            <button type="submit" className="btn primary danger-btn" disabled={busy || !confirm}>{busy ? 'Deleting…' : 'Delete account and fonts'}</button>
            <button type="button" className="btn wide" onClick={() => { setOpen(false); setConfirm(''); }}>Cancel</button>
          </div>
        </form>
      )}
    </Section>
  );
}
