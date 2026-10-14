/* The app's entry: asks who's signed in (first taking a Google sign-in's result off the address, before the router
   reads it), then routes / and /d/:id to one editor, /designs to My designs, /account to the account settings, /reset
   to a new password from an emailed link, /privacy to privacy and terms, and anything else to Page not found (the
   addresses are in lib/routes.ts); a page that breaks shows Something went wrong. The sign-in dialog and the opening
   title card sit over every page, outside the router. */
import { Component, StrictMode, useEffect, type ReactNode } from 'react';
import { createRoot } from 'react-dom/client';
import { Link, RouterProvider, createBrowserRouter } from 'react-router';
import { AuthDialog } from './components/Account';
import { Intro } from './components/Intro';
import { download } from './lib/api';
import { ACCOUNT, DESIGNS, NEW_DESIGN, PRIVACY, RESET, designPath } from './lib/routes';
import { AccountPage } from './pages/AccountPage';
import { EditorPage } from './pages/EditorPage';
import { LibraryPage } from './pages/LibraryPage';
import { PrivacyPage } from './pages/PrivacyPage';
import { ResetPage } from './pages/ResetPage';
import { auth } from './state/auth';
import { designFile, isDirty, useEditor } from './state/editor';
import './styles.css';

function NotFound() {
  useEffect(() => { document.title = 'Page not found — TypeLab'; }, []);
  return (
    <div className="message-page">
      <h1>Page not found</h1>
      <p>There’s nothing at this address.</p>
      <div className="row"><Link className="btn primary" to={NEW_DESIGN}>Open the editor</Link></div>
    </div>
  );
}

/** A page that broke while drawing, in place of the router's own error page: a way back in and, while the open
    design has changes not saved, its design file to keep them (the editor's state outlives the page). */
function Crashed() {
  useEffect(() => { document.title = 'Something went wrong — TypeLab'; }, []);
  let unsaved = false;
  try { unsaved = isDirty(useEditor.getState()); } catch { /* nothing to keep */ }
  const keep = () => { const { file, blob } = designFile(useEditor.getState()); download(file, blob); };
  return (
    <div className="message-page">
      <h1>Something went wrong</h1>
      <p>{unsaved ? 'Keep your changes as a design file, then reload and open it from Export.' : 'Reload the page to carry on.'}</p>
      <div className="row">
        {unsaved && <button type="button" className="btn outline" onClick={keep}>Save design file</button>}
        <button type="button" className="btn primary" onClick={() => location.reload()}>Reload</button>
      </div>
    </div>
  );
}

/** Draws nothing in place of what threw: the sign-in dialog and the title card sit over every page, so one of them
    breaking leaves the page under it working. */
class Quiet extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() { return { failed: true }; }
  render() { return this.state.failed ? null : this.props.children; }
}

// iOS Safari zooms into a field typed in under 16px and stays zoomed; held at its scale there it doesn't, and a pinch
// still zooms (iOS lets it past maximum-scale)
if (/iP(hone|ad|od)/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1))
  document.querySelector('meta[name=viewport]')?.setAttribute('content', 'width=device-width, initial-scale=1, maximum-scale=1');

// before the router reads the address: a Google sign-in may have left its result there
void auth.start();

const router = createBrowserRouter([{ errorElement: <Crashed />, children: [
  // one editor instance serves both a new design and a saved one, so saving (/ → /d/:id)
  // doesn't remount it
  { element: <EditorPage />, children: [{ index: true, element: null }, { path: designPath(':id'), element: null }] },
  { path: DESIGNS, element: <LibraryPage /> },
  { path: ACCOUNT, element: <AccountPage /> },
  { path: RESET, element: <ResetPage /> },
  { path: PRIVACY, element: <PrivacyPage /> },
  { path: '*', element: <NotFound /> }
] }]);

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <RouterProvider router={router} />
    <Quiet><AuthDialog /></Quiet>
    <Quiet><Intro /></Quiet>
  </StrictMode>
);
