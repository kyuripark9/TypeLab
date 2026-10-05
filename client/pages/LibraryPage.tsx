/* My designs: every saved font, previewed in its own letterforms. */
import { useEffect, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router';
import { NAME_MAX, cleanName, slug, type Design } from '../../shared/design';
import { api, download, errorMessage } from '../lib/api';
import { n1 } from '../lib/hooks';
import { auth, useAuth } from '../state/auth';
import { actions, fontFor, useEditor, type ToastAction } from '../state/editor';
import { AccountCorner } from '../components/Account';
import { Toast } from '../components/Chrome';
import { Brand } from '../components/Header';

const rtf = new Intl.RelativeTimeFormat(undefined, { numeric: 'auto' });
function ago(iso: string) {
  const s = (Date.parse(iso) - Date.now()) / 1000;
  const units: [Intl.RelativeTimeFormatUnit, number][] = [['year', 31536000], ['month', 2592000], ['week', 604800], ['day', 86400], ['hour', 3600], ['minute', 60]];
  for (const [u, n] of units) if (Math.abs(s) >= n) return rtf.format(Math.round(s / n), u);
  return 'just now';
}

export function LibraryPage() {
  const [designs, setDesigns] = useState<Design[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const navigate = useNavigate();
  const user = useAuth(s => s.user), userId = user === undefined ? undefined : user?.id ?? null;

  const load = () => {
    setError(null);
    api.listDesigns().then(setDesigns).catch(e => setError(errorMessage(e)));
  };
  useEffect(() => { document.title = 'My designs — TypeLab'; }, []);
  // signing in or out changes whose fonts these are
  useEffect(() => { if (userId !== undefined) load(); }, [userId]);

  // the latest save — a new design or the last one edited — gets a badge so it's easy to find again
  const recentId = designs?.reduce<Design | null>((a, d) => (!a || d.updatedAt > a.updatedAt ? d : a), null)?.id;

  const startNew = () => { actions.newDesign(); navigate('/'); };

  const duplicate = async (d: Design) => {
    try {
      const copy = await api.createDesign({ name: `${d.name} copy`.slice(0, 60), styleId: d.styleId, params: d.params });
      setDesigns(list => list && [copy, ...list]);
      actions.toast(`Duplicated “${d.name}”`);
    } catch (e) { actions.toast(`Couldn’t duplicate — ${errorMessage(e)}`); }
  };

  // a delete waits a few seconds, while its toast offers Undo, before it reaches the server; leaving
  // the page sends any that are still waiting
  const pending = useRef(new Map<string, { timer: ReturnType<typeof setTimeout>; undo: ToastAction }>());
  const byNewest = (list: Design[]) => [...list].sort((a, b) => (a.updatedAt < b.updatedAt ? 1 : a.updatedAt > b.updatedAt ? -1 : 0));
  const reallyDelete = async (d: Design) => {
    pending.current.delete(d.id);
    try {
      await api.deleteDesign(d.id);
      if (useEditor.getState().designId === d.id) actions.newDesign();
    } catch (e) {
      setDesigns(list => list && byNewest([...list, d]));
      actions.toast(`Couldn’t delete — ${errorMessage(e)}`);
    }
  };
  const remove = (d: Design) => {
    setDesigns(list => list && list.filter(x => x.id !== d.id));
    const undo: ToastAction = {
      label: 'Undo',
      run: () => {
        const p = pending.current.get(d.id);
        if (!p) return;
        clearTimeout(p.timer);
        pending.current.delete(d.id);
        setDesigns(list => list && byNewest([...list, d]));
      }
    };
    pending.current.set(d.id, { timer: setTimeout(() => void reallyDelete(d), 6000), undo });
    actions.toast(`Deleted “${d.name}”`, undo);
  };
  useEffect(() => {
    const flush = () => {
      for (const [id, p] of pending.current) {
        clearTimeout(p.timer);
        void api.deleteDesign(id).catch(() => {});
        if (useEditor.getState().designId === id) actions.newDesign();
        // an Undo can't reach a page that's gone
        if (useEditor.getState().toast?.action === p.undo) useEditor.setState({ toast: null });
      }
      pending.current.clear();
    };
    addEventListener('pagehide', flush);
    return () => { removeEventListener('pagehide', flush); flush(); };
  }, []);

  const downloadFont = async (d: Design) => {
    try {
      download(`${slug(d.name)}.otf`, await api.exportFile('otf', { name: d.name, params: d.params }));
      actions.toast(`Downloaded “${d.name}” — open the .otf to install it`);
    } catch (e) { actions.toast(`Couldn’t download — ${errorMessage(e)}`); }
  };

  const rename = async (d: Design, raw: string) => {
    const name = cleanName(raw);
    if (name === d.name) return;
    try {
      const r = await api.renameDesign(d.id, name);
      setDesigns(list => list && list.map(x => (x.id === r.id ? r : x)));
      // the same design open in the editor takes the new name too
      if (useEditor.getState().designId === r.id) actions.markRenamed(r.name);
      actions.toast(`Renamed to “${r.name}”`);
    } catch (e) { actions.toast(`Couldn’t rename — ${errorMessage(e)}`); }
  };

  return (
    <div className="library">
      <header className="top">
        <div className="top-left"><Brand /></div>
        <div className="top-actions">
          <button className="btn primary" onClick={startNew}><svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true"><path d="M8 3v10M3 8h10" /></svg>New design</button>
        </div>
      </header>
      <AccountCorner />
      <main className="lib-main">
        <div className="lib-head">
          <h1>My designs</h1>
          {designs && designs.length > 0 && <p>{designs.length} saved {designs.length === 1 ? 'font' : 'fonts'}{user ? ' in your account' : ''}</p>}
        </div>
        {user === null && (
          <div className="lib-signin">
            <div>
              <b>{designs?.length ? 'These fonts are saved in this browser only' : 'Fonts you save are kept in this browser only'}</b>
              <p>Create a free account to keep them safe and open, edit and download them on any computer. Fonts saved here come along.</p>
            </div>
            <button className="btn primary" onClick={() => auth.open('signup')}>Create account</button>
            <button className="btn ghost" onClick={() => auth.open('signin')}>Sign in</button>
          </div>
        )}
        {error ? (
          <div className="lib-empty">
            <h2>Couldn’t load your designs</h2><p>{error}</p>
            <button className="btn wide" onClick={load}>Try again</button>
          </div>
        ) : !designs ? (
          <p className="lib-loading" role="status">Loading…</p>
        ) : designs.length === 0 ? (
          <div className="lib-empty">
            <h2>No saved designs yet</h2>
            <button className="btn primary" onClick={startNew}>Start designing</button>
          </div>
        ) : (
          <div className="lib-grid">
            {designs.map(d => <DesignCard key={d.id} d={d} recent={d.id === recentId} onDownload={() => downloadFont(d)} onDuplicate={() => duplicate(d)} onDelete={() => remove(d)} onRename={n => rename(d, n)} />)}
            <button className="lib-new" onClick={startNew}>
              <span className="lib-new-icon"><svg width="22" height="22" viewBox="0 0 22 22" aria-hidden="true"><path d="M11 4v14M4 11h14" /></svg></span>
              <b>New design</b>
            </button>
          </div>
        )}
      </main>
      <Toast />
    </div>
  );
}

function DesignCard({ d, recent, onDownload, onDuplicate, onDelete, onRename }: { d: Design; recent: boolean; onDownload: () => void; onDuplicate: () => void; onDelete: () => void; onRename: (name: string) => void }) {
  const [editing, setEditing] = useState(false);
  const f = fontFor(d.params), ln = f.layout('Ag', Infinity)[0], sample = f.layout('Hamburgefonstiv', Infinity)[0];
  const pad = (1500 - ln.width) / 2, spad = Math.max(0, (9000 - sample.width) / 2);
  return (
    <article className={recent ? 'lib-card recent' : 'lib-card'}>
      <Link to={`/d/${d.id}`} className="lib-open" aria-label={`Open ${d.name}`}>
        {recent && <span className="lib-badge">{d.createdAt === d.updatedAt ? 'Recently added' : 'Recently edited'}</span>}
        <svg className="lib-big" viewBox={`${-pad} -900 1500 1150`} aria-hidden="true">
          {ln.items.map((it, i) => <path key={i} d={f.glyph(it.ch)!.d} transform={`translate(${n1(it.x)},0)`} />)}
        </svg>
        <svg className="lib-sample" viewBox={`${-spad} -900 ${Math.max(9000, sample.width)} 1150`} aria-hidden="true">
          {sample.items.map((it, i) => <path key={i} d={f.glyph(it.ch)!.d} transform={`translate(${n1(it.x)},0)`} />)}
        </svg>
      </Link>
      <div className="lib-meta">
        {editing
          ? <RenameField name={d.name} onDone={n => { setEditing(false); if (n !== null) onRename(n); }} />
          : <h3 title={d.name}>{d.name}</h3>}
        <CardMenu name={d.name} onDownload={onDownload} onRename={() => setEditing(true)} onDuplicate={onDuplicate} onDelete={onDelete} />
        <p title={new Date(d.updatedAt).toLocaleString()}>Edited {ago(d.updatedAt)}</p>
      </div>
    </article>
  );
}

/** A card's name, being edited: Enter or leaving the field keeps it, Escape puts the old one back. */
function RenameField({ name, onDone }: { name: string; onDone: (name: string | null) => void }) {
  const [value, setValue] = useState(name);
  const done = useRef(false);
  const finish = (n: string | null) => { if (!done.current) { done.current = true; onDone(n); } };
  return (
    <input className="lib-rename" value={value} maxLength={NAME_MAX} aria-label="Font name" spellCheck={false} autoFocus
      onFocus={e => e.target.select()} onChange={e => setValue(e.target.value)} onBlur={() => finish(value)}
      onKeyDown={e => { if (e.key === 'Enter') finish(value); else if (e.key === 'Escape') finish(null); }} />
  );
}

/** The ⋯ button on a card, holding Download font, Rename, Duplicate and Delete. */
function CardMenu({ name, onDownload, onRename, onDuplicate, onDelete }: { name: string; onDownload: () => void; onRename: () => void; onDuplicate: () => void; onDelete: () => void }) {
  const [open, setOpen] = useState(false);
  const wrap = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const close = (e: PointerEvent) => { if (!wrap.current?.contains(e.target as Node)) setOpen(false); };
    const esc = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false); };
    document.addEventListener('pointerdown', close);
    document.addEventListener('keydown', esc);
    return () => { document.removeEventListener('pointerdown', close); document.removeEventListener('keydown', esc); };
  }, [open]);

  const pick = (fn: () => void) => () => { setOpen(false); fn(); };
  return (
    <div className="lib-actions" ref={wrap}>
      <button className="btn icon small" aria-label={`More actions for ${name}`} title="More actions" aria-expanded={open} aria-haspopup="menu" onClick={() => setOpen(o => !o)}>
        <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true"><path d="M3.5 8h.01M8 8h.01M12.5 8h.01" /></svg>
      </button>
      {open && (
        <div className="popover lib-menu" role="menu">
          <button role="menuitem" onClick={pick(onDownload)}>Download font (.otf)</button>
          <button role="menuitem" onClick={pick(onRename)}>Rename</button>
          <button role="menuitem" onClick={pick(onDuplicate)}>Duplicate</button>
          <button role="menuitem" className="danger" onClick={pick(onDelete)}>Delete</button>
        </div>
      )}
    </div>
  );
}
