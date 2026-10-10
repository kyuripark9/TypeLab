/* The app's entry: asks who's signed in (first taking a Google sign-in's result off the address, before the router
   reads it), then routes / and /d/:id to one editor, /designs to My designs, /account to the account settings and
   anything else to Page not found. The sign-in dialog and the opening title card sit over every page, outside
   the router. */
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { Link, RouterProvider, createBrowserRouter } from 'react-router';
import { AuthDialog } from './components/Account';
import { Intro } from './components/Intro';
import { AccountPage } from './pages/AccountPage';
import { EditorPage } from './pages/EditorPage';
import { LibraryPage } from './pages/LibraryPage';
import { auth } from './state/auth';
import './styles.css';

function NotFound() {
  return (
    <div className="message-page">
      <h1>Page not found</h1>
      <p>There’s nothing at this address.</p>
      <div className="row"><Link className="btn primary" to="/">Open the editor</Link></div>
    </div>
  );
}

// before the router reads the address: a Google sign-in may have left its result there
void auth.start();

const router = createBrowserRouter([
  // one editor instance serves both a new design and a saved one, so saving (/ → /d/:id)
  // doesn't remount it
  { element: <EditorPage />, children: [{ index: true, element: null }, { path: 'd/:id', element: null }] },
  { path: 'designs', element: <LibraryPage /> },
  { path: 'account', element: <AccountPage /> },
  { path: '*', element: <NotFound /> }
]);

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <RouterProvider router={router} />
    <AuthDialog />
    <Intro />
  </StrictMode>
);
