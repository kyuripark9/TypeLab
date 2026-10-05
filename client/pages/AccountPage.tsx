/* Account settings: the name shown in the header, the password, and closing the account. */
import { useEffect, useState, type FormEvent, type ReactNode } from 'react';
import { Link, useNavigate } from 'react-router';
import { PASSWORD_MIN, USER_NAME_MAX } from '../../shared/account';
import { api, errorMessage } from '../lib/api';
import { AccountButton } from '../components/Account';
import { Toast } from '../components/Chrome';
import { Brand } from '../components/Header';
import { auth, useAuth } from '../state/auth';
import { actions, useEditor } from '../state/editor';

export function AccountPage() {
  const user = useAuth(s => s.user);
  useEffect(() => { document.title = 'Account — TypeLab'; }, []);
  return (
    <div className="library account-page">
      <header className="top">
        <div className="top-left"><Brand /></div>
        <div className="top-actions">
          <Link className="btn ghost" to="/designs">My designs</Link>
          <AccountButton />
        </div>
      </header>
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
              <Password />
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
        <button type="submit" className="btn primary" disabled={busy || name.trim() === user.name}>{busy ? 'Saving…' : 'Save'}</button>
      </form>
    </Section>
  );
}

function Password() {
  const [current, setCurrent] = useState(''), [next, setNext] = useState('');
  const { busy, error, submit } = useSubmit(async () => {
    await api.changePassword(current, next);
    setCurrent('');
    setNext('');
    actions.toast('Password changed — other browsers are signed out');
  });
  return (
    <Section title="Password" note="Changing it signs you out everywhere else.">
      <form onSubmit={submit}>
        <label className="field"><span>Current password</span><input type="password" required value={current} autoComplete="current-password" onChange={e => setCurrent(e.target.value)} /></label>
        <label className="field">
          <span>New password</span>
          <input type="password" required minLength={PASSWORD_MIN} value={next} autoComplete="new-password" onChange={e => setNext(e.target.value)} />
          <small>At least {PASSWORD_MIN} characters</small>
        </label>
        {error && <p className="form-error" role="alert">{error}</p>}
        <button type="submit" className="btn primary" disabled={busy}>{busy ? 'Changing…' : 'Change password'}</button>
      </form>
    </Section>
  );
}

function Close() {
  const [open, setOpen] = useState(false), [password, setPassword] = useState('');
  const navigate = useNavigate();
  const { busy, error, submit } = useSubmit(async () => {
    await api.deleteAccount(password);
    if (useEditor.getState().designId) actions.newDesign();
    useAuth.setState({ user: null });
    actions.toast('Your account and its fonts are deleted');
    navigate('/');
  });
  return (
    <Section title="Delete account" danger note="Deletes the account and every font saved in it. Download any you want to keep first.">
      {!open ? <button className="btn wide danger-btn" onClick={() => setOpen(true)}>Delete account…</button> : (
        <form onSubmit={submit}>
          <label className="field"><span>Type your password to confirm</span><input type="password" required autoFocus value={password} autoComplete="current-password" onChange={e => setPassword(e.target.value)} /></label>
          {error && <p className="form-error" role="alert">{error}</p>}
          <div className="row">
            <button type="submit" className="btn primary danger-btn" disabled={busy}>{busy ? 'Deleting…' : 'Delete account and fonts'}</button>
            <button type="button" className="btn wide" onClick={() => { setOpen(false); setPassword(''); }}>Cancel</button>
          </div>
        </form>
      )}
    </Section>
  );
}
