/* The editor, for a new design (/) or a saved one (/d/:id). */
import { useCallback, useEffect, useState } from 'react';
import { Link, useBlocker, useNavigate, useParams, useSearchParams } from 'react-router';
import { CATEGORIES, CONTROLS, SERIF_SUBS, type ActiveKey, type CategoryId } from '../../shared/content';
import { cleanName } from '../../shared/design';
import { ApiError, api, errorMessage } from '../lib/api';
import { isTyping } from '../lib/hooks';
import { actions, isDirty, useEditor, type PreviewMode } from '../state/editor';
import { GlyphStrip, Nav, Toast } from '../components/Chrome';
import { GlyphDefs } from '../components/GlyphDefs';
import { Header } from '../components/Header';
import { Panel } from '../components/Panel';
import { Stage } from '../components/Stage';

type Status = 'ready' | 'loading' | 'missing' | 'error';

export function EditorPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [status, setStatus] = useState<Status>('ready');
  const [loadError, setLoadError] = useState('');

  // load the design named in the URL (or start fresh on /)
  useEffect(() => {
    const s = useEditor.getState();
    if (!id) {
      if (s.designId) actions.newDesign();
      setStatus('ready');
      return;
    }
    if (s.designId === id) { setStatus('ready'); return; }
    let live = true;
    setStatus('loading');
    api.getDesign(id)
      .then(d => { if (live) { actions.loadDesign(d); setStatus('ready'); } })
      .catch(e => { if (live) { setLoadError(errorMessage(e)); setStatus(e instanceof ApiError && e.status === 404 ? 'missing' : 'error'); } });
    return () => { live = false; };
  }, [id]);

  const save = useSave();
  useShortcuts(save);
  useLeaveGuard();
  useDeepLinks();

  const name = useEditor(s => s.name);
  useEffect(() => { document.title = `${cleanName(name)} — TypeLab`; }, [name]);

  if (status === 'missing' || status === 'error') {
    return (
      <div className="message-page">
        <h1>{status === 'missing' ? 'This design doesn’t exist' : 'Couldn’t open this design'}</h1>
        <p>{status === 'missing' ? 'It may have been deleted.' : loadError}</p>
        <div className="row">
          <Link className="btn primary" to="/designs">My designs</Link>
          <button className="btn wide" onClick={() => { actions.newDesign(); navigate('/'); }}>Start a new design</button>
        </div>
      </div>
    );
  }

  return (
    <div className="editor">
      <Header onSave={save} />
      <Nav />
      <Stage />
      <Panel />
      <GlyphStrip />
      <GlyphDefs />
      <Toast />
      {status === 'loading' && <div className="loading" role="status">Opening design…</div>}
    </div>
  );
}

/** Save to the server: create on first save, update afterwards. */
function useSave() {
  const navigate = useNavigate();
  return useCallback(async () => {
    const s = useEditor.getState();
    if (s.saving) return;
    const input = { name: cleanName(s.name), styleId: s.styleId, params: s.params };
    actions.setSaving(true);
    try {
      let d;
      try {
        d = s.designId ? await api.updateDesign(s.designId, input) : await api.createDesign(input);
      } catch (e) {
        // deleted from another tab? keep the work by saving it as a new design
        if (!(e instanceof ApiError && e.status === 404 && s.designId)) throw e;
        d = await api.createDesign(input);
      }
      actions.markSaved(d, input);
      if (d.id !== s.designId) navigate(`/d/${d.id}`, { replace: true });
      actions.toast('Saved to your designs');
    } catch (e) {
      actions.toast(`Couldn’t save — ${errorMessage(e)}`);
    } finally {
      actions.setSaving(false);
    }
  }, [navigate]);
}

function useShortcuts(save: () => void) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const mod = e.metaKey || e.ctrlKey, typing = isTyping(e.target), s = useEditor.getState();
      if (mod && e.key.toLowerCase() === 'z' && !typing) { e.preventDefault(); actions.travel(e.shiftKey ? 1 : -1); }
      else if (mod && e.key.toLowerCase() === 'y' && !typing) { e.preventDefault(); actions.travel(1); }
      else if (mod && e.key.toLowerCase() === 's') { e.preventDefault(); save(); }
      else if (e.key === 'Escape') { if (s.exportOpen) actions.setExportOpen(false); else actions.closeInspector(); }
      else if (s.inspect && !typing && (e.target as HTMLInputElement).type !== 'range' && (e.key === 'ArrowLeft' || e.key === 'ArrowRight')) {
        e.preventDefault();
        actions.stepInspector(e.key === 'ArrowLeft' ? -1 : 1);
      }
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [save]);
}

/** Warn before losing unsaved changes, both on tab close and on in-app navigation. */
function useLeaveGuard() {
  const dirty = useEditor(isDirty);
  useEffect(() => {
    if (!dirty) return;
    const warn = (e: BeforeUnloadEvent) => { e.preventDefault(); };
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [dirty]);

  const blocker = useBlocker(({ nextLocation }) => {
    const s = useEditor.getState();
    return isDirty(s) && nextLocation.pathname !== `/d/${s.designId}`;
  });
  useEffect(() => {
    if (blocker.state !== 'blocked') return;
    if (window.confirm('You have unsaved changes. Leave without saving?')) {
      actions.newDesign(); // drop the edits so they don't reappear later
      blocker.proceed();
    } else blocker.reset();
  }, [blocker]);
}

/** ?style=serif&cat=shape&active=serif&inspect=R&mode=paragraph&hot=1 — handy for demos. */
function useDeepLinks() {
  const [q] = useSearchParams();
  useEffect(() => {
    const style = q.get('style'), mode = q.get('mode'), cat = q.get('cat'), active = q.get('active'), inspect = q.get('inspect');
    if (style) actions.loadStyle(style);
    if (mode && ['sentence', 'alphabet', 'paragraph', 'custom'].includes(mode)) actions.setMode(mode as PreviewMode);
    if (cat && CATEGORIES.some(c => c.id === cat)) {
      const a = active && (active in CONTROLS || active in SERIF_SUBS) ? active as ActiveKey : undefined;
      actions.setCategory(cat as CategoryId, a);
    }
    if (q.get('hot')) actions.setHot(true);
    if (inspect) actions.openInspector(inspect);
    // run once on arrival
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
}
