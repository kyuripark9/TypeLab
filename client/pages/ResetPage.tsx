/* Setting a new password from the link a forgotten password emails (/reset?token=…): the new password, which signs
   this browser in and goes on to My designs. The token is taken out of the address as the page opens, so it isn't
   left in the history; a link that has expired or was used asks for a new one from the sign-in dialog. */
import { useEffect, useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router';
import { PASSWORD_MIN } from '../../shared/account';
import { api, errorMessage } from '../lib/api';
import { DESIGNS, RESET } from '../lib/routes';
import { Toast } from '../components/Chrome';
import { Brand } from '../components/Header';
import { auth } from '../state/auth';

export function ResetPage() {
  const navigate = useNavigate();
  const [token] = useState(() => new URLSearchParams(location.search).get('token') ?? '');
  const [password, setPassword] = useState(''), [show, setShow] = useState(false);
  const [busy, setBusy] = useState(false), [error, setError] = useState('');
  useEffect(() => {
    document.title = 'New password — TypeLab';
    if (location.search) navigate(RESET, { replace: true });
  }, [navigate]);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      auth.signedIn(await api.confirmReset(token, password), false, ' · your new password is set');
      navigate(DESIGNS);
    } catch (err) { setError(errorMessage(err)); }
    setBusy(false);
  };

  return (
    <div className="library">
      <header className="top"><div className="top-left"><Brand /></div></header>
      <main className="lib-main reset-main">
        <div className="lib-head"><h1>Set a new password</h1></div>
        {token ? (
          <form className="reset-form" onSubmit={submit}>
            <label className="field">
              <span>New password</span>
              <span className="field-row">
                <input type={show ? 'text' : 'password'} required autoFocus minLength={PASSWORD_MIN} value={password} autoComplete="new-password"
                  onChange={e => setPassword(e.target.value)} />
                <button type="button" className="field-show" onClick={() => setShow(v => !v)} aria-pressed={show}>{show ? 'Hide' : 'Show'}</button>
              </span>
              <small className={password.length >= PASSWORD_MIN ? 'field-ok' : undefined}>At least {PASSWORD_MIN} characters · signs you out on other browsers</small>
            </label>
            {error && <p className="form-error" role="alert">{error}</p>}
            <div className="row">
              <button type="submit" className="btn primary" disabled={busy || password.length < PASSWORD_MIN}>{busy ? 'Saving…' : 'Set password and sign in'}</button>
              {error && <button type="button" className="btn outline" onClick={() => auth.open('signin')}>Ask for a new link</button>}
            </div>
          </form>
        ) : (
          <div className="lib-empty">
            <h2>This link is missing its code</h2>
            <p>Open the link from the email again, or ask for a new one from Sign in.</p>
            <div className="row"><button className="btn primary" onClick={() => auth.open('signin')}>Sign in</button></div>
          </div>
        )}
      </main>
      <Toast />
    </div>
  );
}
