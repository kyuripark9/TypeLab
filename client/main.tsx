import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { Link, RouterProvider, createBrowserRouter } from 'react-router';
import { EditorPage } from './pages/EditorPage';
import { LibraryPage } from './pages/LibraryPage';
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

const router = createBrowserRouter([
  // one editor instance serves both a new design and a saved one, so saving (/ → /d/:id)
  // doesn't remount it
  { element: <EditorPage />, children: [{ index: true, element: null }, { path: 'd/:id', element: null }] },
  { path: 'designs', element: <LibraryPage /> },
  { path: '*', element: <NotFound /> }
]);

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <RouterProvider router={router} />
  </StrictMode>
);
