/* The editor, for a new design (/) or a saved one (/d/:id). */
import { useCallback, useEffect, useState } from 'react';
import { Link, useBlocker, useNavigate, useParams, useSearchParams } from 'react-router';
import { CONTROLS, SUBS, controlFor, pageOf, type ActiveKey } from '../../shared/content';
import { DEFAULT_NAME, cleanName } from '../../shared/design';
import { ApiError, api, errorMessage } from '../lib/api';
import { isTyping } from '../lib/hooks';
import { auth, useAuth } from '../state/auth';
import { actions, isDirty, useEditor } from '../state/editor';
import { GlyphStrip, Nav, Toast, focusSettingSearch } from '../components/Chrome';
import { Dialog } from '../components/Dialog';
import { GlyphDefs } from '../components/GlyphDefs';
import { Guide, guideSeen } from '../components/Guide';
import { Header } from '../components/Header';
import { Panel, focusSearch } from '../components/Panel';
import { Resizer } from '../components/Resizer';
import { Stage } from '../components/Stage';

type Status = 'ready' | 'loading' | 'missing' | 'error';

export function EditorPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [status, setStatus] = useState<Status>('ready');
  const [loadError, setLoadError] = useState('');
  // first visit gets the tour, unless it arrived on a deep link
  const [guide, setGuide] = useState(() => !guideSeen() && !window.location.search);

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
  // a design's first save asks for its name, unless it already has one of its own
  const [naming, setNaming] = useState(false);
  const requestSave = useCallback(() => {
    const s = useEditor.getState();
    if (!s.designId && cleanName(s.name) === DEFAULT_NAME) setNaming(true);
    else void save();
  }, [save]);
  useShortcuts(requestSave);
  const leave = useLeaveGuard(save);
  useDeepLinks();

  const name = useEditor(s => s.name), category = useEditor(s => s.category), navOpen = useEditor(s => s.navOpen);
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
    <div className={navOpen ? 'editor nav-open' : 'editor'}>
      <Header onSave={requestSave} onGuide={() => { actions.setTips(true); setGuide(true); }}
        naming={naming} onNamed={n => { setNaming(false); actions.setName(n); void save(); }} onCancelNaming={() => setNaming(false)} />
      <Nav />
      {navOpen && <div className="nav-scrim" onClick={() => actions.setNavOpen(false)} />}
      <Stage />
      <Panel />
      <Resizer side="nav" />
      <Resizer side="panel" />
      {category !== 'style' && <><GlyphStrip /><Resizer side="strip" /></>}
      <GlyphDefs />
      <Toast />
      {status === 'loading' && <div className="loading" role="status">Opening design…</div>}
      {guide && status === 'ready' && <Guide onClose={() => setGuide(false)} />}
      {leave}
    </div>
  );
}

/** Save to the server: create on first save, update afterwards. Resolves to whether it saved;
    `stay` keeps the address as it is, for a save on the way out to another page. */
function useSave() {
  const navigate = useNavigate();
  return useCallback(async ({ stay = false } = {}): Promise<boolean> => {
    const s = useEditor.getState();
    if (s.saving) return false;
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
      if (d.id !== s.designId && !stay) navigate(`/d/${d.id}`, { replace: true });
      // saved while signed out, a design is kept only in this browser; its first save says so
      if (!s.designId && useAuth.getState().user === null) actions.toast('Saved in this browser', { label: 'Keep it in an account', run: () => auth.open('signup') });
      else actions.toast('Saved to your designs');
      return true;
    } catch (e) {
      actions.toast(`Couldn’t save — ${errorMessage(e)}`);
      return false;
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
      else if (mod && e.key.toLowerCase() === 'k') { e.preventDefault(); focusSettingSearch(); }
      // / finds a style on the Style page, and a setting on the others
      else if (e.key === '/' && !mod && !typing) { e.preventDefault(); if (s.category === 'style') focusSearch(); else focusSettingSearch(); }
      else if (e.key === 'Escape') { if (s.navOpen) actions.setNavOpen(false); else if (s.exportOpen) actions.setExportOpen(false); else actions.closeInspector(); }
      else if (s.inspect && !typing && (e.target as HTMLInputElement).type !== 'range' && (e.key === 'ArrowLeft' || e.key === 'ArrowRight')) {
        e.preventDefault();
        actions.stepInspector(e.key === 'ArrowLeft' ? -1 : 1);
      }
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [save]);
}

/** Warn before losing unsaved changes, both on tab close (the browser's own prompt, the only one
    allowed there) and on in-app navigation, where a dialog offers to save on the way out. Returns
    that dialog, while it's open. */
function useLeaveGuard(save: (o?: { stay?: boolean }) => Promise<boolean>) {
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
  const stay = useCallback(() => blocker.reset?.(), [blocker]);
  if (blocker.state !== 'blocked') return null;
  return (
    <Dialog title="Save your changes?" body="This design has changes you haven’t saved yet." onCancel={stay}
      choices={[
        { label: 'Save and leave', primary: true, run: async () => { if (await save({ stay: true })) blocker.proceed?.(); else blocker.reset?.(); } },
        // drop the edits so they don't reappear later
        { label: 'Leave without saving', run: () => { actions.newDesign(); blocker.proceed?.(); } },
        { label: 'Stay', run: stay }
      ]} />
  );
}

/** ?style=serif&cat=serifs&active=serifTip&inspect=R&text=Hello&hot=1&pen=1 — handy for demos. `cat` names
    a page or a group of them (shape); an `active` control opens the page it is on. */
function useDeepLinks() {
  const [q] = useSearchParams();
  useEffect(() => {
    const style = q.get('style'), text = q.get('text'), cat = q.get('cat'), active = q.get('active'), inspect = q.get('inspect');
    if (style) actions.loadStyle(style);
    if (text) actions.setCustom(text);
    const a = active && (active in CONTROLS || active in SUBS) ? active as ActiveKey : undefined;
    const page = cat === 'style' ? 'style' : a ? CONTROLS[controlFor(a)].cat : pageOf(cat);
    if (page) actions.setCategory(page, a);
    if (q.get('hot')) actions.setHot(true);
    if (inspect) actions.openInspector(inspect);
    if (q.get('pen')) actions.setPenMode(true);
    // run once on arrival
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
}
