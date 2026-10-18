/* My designs: every saved font, its name set in its own letterforms, as cards or as a list, found by
   name and sorted by when it was last edited or by name. The names are drawn as they were saved (lib/name-sample.ts),
   and only one saved without, or before, is built here. */
import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router';
import { styleById } from '../../shared/content';
import { NAME_MAX, cleanName, slug, type Design, type NameSample } from '../../shared/design';
import { api, download, errorMessage } from '../lib/api';
import { useFreeFonts } from '../lib/free';
import { isTyping, useDismiss } from '../lib/hooks';
import { drawName, keptSample } from '../lib/name-sample';
import { useOpeningHolds } from '../lib/opening';
import { PREFS, prefOneOf, writePref } from '../lib/prefs';
import { NEW_DESIGN, PRIVACY, designPath } from '../lib/routes';
import { auth, useAuth } from '../state/auth';
import { actions, fontFor, useEditor, type ToastAction } from '../state/editor';
import { AccountCorner } from '../components/Account';
import { ACTION_TOAST_MS, Toast } from '../components/Chrome';
import { Brand } from '../components/Header';
import { SearchIcon } from '../components/Icons';

const rtf = new Intl.RelativeTimeFormat(undefined, { numeric: 'auto', style: 'short' });
function ago(iso: string) {
  const s = (Date.parse(iso) - Date.now()) / 1000;
  const units: [Intl.RelativeTimeFormatUnit, number][] = [['year', 31536000], ['month', 2592000], ['week', 604800], ['day', 86400], ['hour', 3600], ['minute', 60]];
  for (const [u, n] of units) if (Math.abs(s) >= n) return rtf.format(Math.round(s / n), u);
  return 'just now';
}

type View = 'grid' | 'list';
type Sort = 'recent' | 'name';
const VIEWS: [View, string, string][] = [
  ['grid', 'Cards', 'M3.5 3.5h5v5h-5zM11.5 3.5h5v5h-5zM3.5 11.5h5v5h-5zM11.5 11.5h5v5h-5z'],
  ['list', 'List', 'M3 5h14M3 10h14M3 15h14']
];
const SORTS: [Sort, string][] = [['recent', 'Recent'], ['name', 'Name']];

export function LibraryPage() {
  const [designs, setDesigns] = useState<Design[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState('');
  // the layout and order picked last are kept per browser, as a convenience
  const [view, setView] = useState<View>(() => prefOneOf(PREFS.designsView, ['grid', 'list'], 'grid'));
  const [sort, setSort] = useState<Sort>(() => prefOneOf(PREFS.designsSort, ['recent', 'name'], 'recent'));
  const search = useRef<HTMLInputElement>(null);
  const navigate = useNavigate();
  const user = useAuth(s => s.user), userId = user === undefined ? undefined : user?.id ?? null;

  const load = () => {
    setError(null);
    api.listDesigns().then(setDesigns).catch(e => setError(errorMessage(e)));
  };
  useEffect(() => { document.title = 'My designs — TypeLab'; }, []);
  // signing in or out changes whose fonts these are
  useEffect(() => { if (userId !== undefined) load(); }, [userId]);
  // / finds a font, as it finds a setting in the editor
  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      if (e.key === '/' && !e.metaKey && !e.ctrlKey && !e.altKey && !isTyping(e.target)) { e.preventDefault(); search.current?.focus(); }
    };
    addEventListener('keydown', key);
    return () => removeEventListener('keydown', key);
  }, []);

  const pickView = (v: View) => { setView(v); writePref(PREFS.designsView, v); };
  const pickSort = (v: Sort) => { setSort(v); writePref(PREFS.designsSort, v); };

  // the latest save — a new design or the last one edited — is marked so it's easy to find again
  const recentId = designs?.reduce<Design | null>((a, d) => (!a || d.updatedAt > a.updatedAt ? d : a), null)?.id;
  const q = query.trim().toLowerCase();
  const shown = designs && designs
    .filter(d => !q || d.name.toLowerCase().includes(q) || (styleById(d.styleId)?.name.toLowerCase().includes(q) ?? false))
    .sort(sort === 'name'
      ? (a, b) => a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: 'base' })
      : (a, b) => (a.updatedAt < b.updatedAt ? 1 : a.updatedAt > b.updatedAt ? -1 : 0));

  const startNew = () => { actions.newDesign(); navigate(NEW_DESIGN); };

  const duplicate = async (d: Design) => {
    try {
      // the list leaves out each design's record of its letters' edits and its History: the copy takes the ones saved
      const { log, versions } = await api.getDesign(d.id);
      const copy = await api.createDesign({ name: cleanName(`${d.name} copy`), styleId: d.styleId, params: d.params, log, versions });
      setDesigns(list => list && [copy, ...list]);
      actions.toast(`Duplicated “${d.name}”`);
    } catch (e) { actions.toast(`Couldn’t duplicate — ${errorMessage(e)}`); }
  };

  // a delete waits while its toast offers Undo, and reaches the server only once that Undo is gone (the toast
  // stays ACTION_TOAST_MS); leaving the page sends any that are still waiting
  const pending = useRef(new Map<string, { timer: ReturnType<typeof setTimeout>; undo: ToastAction }>());
  const reallyDelete = async (d: Design) => {
    pending.current.delete(d.id);
    try {
      await api.deleteDesign(d.id);
      if (useEditor.getState().designId === d.id) actions.newDesign();
    } catch (e) {
      setDesigns(list => list && [...list, d]);
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
        setDesigns(list => list && [...list, d]);
      }
    };
    pending.current.set(d.id, { timer: setTimeout(() => void reallyDelete(d), ACTION_TOAST_MS), undo });
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

  const count = designs?.length ?? 0;
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
          <div className="lib-title">
            <h1>My designs</h1>
            {count > 0 && <p>{count} {count === 1 ? 'font' : 'fonts'}</p>}
          </div>
          {count > 0 && (
            <div className="lib-tools">
              <label className="lib-search">
                <SearchIcon />
                <input ref={search} type="search" value={query} placeholder="Find a font" aria-label="Find a font" spellCheck={false}
                  onChange={e => setQuery(e.target.value)} onKeyDown={e => { if (e.key === 'Escape') { setQuery(''); e.currentTarget.blur(); } }} />
                {!query && <kbd aria-hidden="true">/</kbd>}
              </label>
              <div className="view-toggle lib-sort" role="radiogroup" aria-label="Sort by">
                {SORTS.map(([id, label]) => (
                  <button key={id} role="radio" aria-checked={sort === id} className={sort === id ? 'on' : undefined} onClick={() => pickSort(id)}>{label}</button>
                ))}
              </div>
              <div className="view-toggle" role="radiogroup" aria-label="Layout">
                {VIEWS.map(([id, label, d]) => (
                  <button key={id} role="radio" aria-checked={view === id} aria-label={label} title={label}
                    className={view === id ? 'on' : undefined} onClick={() => pickView(id)}>
                    <svg viewBox="0 0 20 20" width="16" height="16" aria-hidden="true">
                      <path d={d} fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
        {user === null && designs !== null && (
          <div className="lib-signin">
            <svg className="lib-signin-icon" width="20" height="20" viewBox="0 0 20 20" aria-hidden="true"><path d="M6 15.5h8.5a3.5 3.5 0 0 0 .4-7 5 5 0 0 0-9.6 1.2A2.9 2.9 0 0 0 6 15.5Z" /></svg>
            <p><b>{count ? 'Saved in this browser only.' : 'Fonts you save stay in this browser only.'}</b> Create a free account to keep them and open them on any computer.</p>
            <button className="btn ghost" onClick={() => auth.open('signin')}>Sign in</button>
            <button className="btn outline" onClick={() => auth.open('signup')}>Create account</button>
          </div>
        )}
        {error ? (
          <div className="lib-empty">
            <h2>Couldn’t load your designs</h2><p>{error}</p>
            <button className="btn wide" onClick={load}>Try again</button>
          </div>
        ) : !shown ? (
          <div className={`lib-${view} lib-loading`} role="status" aria-label="Loading">
            {[0, 1, 2, 3].map(i => <div key={i} className="lib-card"><span className="lib-open" /><span className="lib-meta"><i /><i /></span></div>)}
          </div>
        ) : count === 0 ? (
          <div className="lib-empty">
            <h2>No saved fonts yet</h2>
            <p>Fonts you save in the editor appear here.</p>
            <button className="btn primary" onClick={startNew}>Start designing</button>
          </div>
        ) : shown.length === 0 ? (
          <div className="lib-empty">
            <h2>No fonts match “{query.trim()}”</h2>
            <button className="btn wide" onClick={() => { setQuery(''); search.current?.focus(); }}>Clear search</button>
          </div>
        ) : (
          <div className={`lib-${view}`}>
            {shown.map(d => <DesignCard key={d.id} d={d} list={view === 'list'} recent={d.id === recentId && count > 1} onDownload={() => downloadFont(d)} onDuplicate={() => duplicate(d)} onDelete={() => remove(d)} onRename={n => rename(d, n)} />)}
          </div>
        )}
        <footer className="lib-foot"><Link to={PRIVACY}>Privacy &amp; terms</Link></footer>
      </main>
      <Toast />
    </div>
  );
}

function DesignCard({ d, list, recent, onDownload, onDuplicate, onDelete, onRename }: { d: Design; list: boolean; recent: boolean; onDownload: () => void; onDuplicate: () => void; onDelete: () => void; onRename: (name: string) => void }) {
  const [editing, setEditing] = useState(false);
  const style = styleById(d.styleId)?.name;
  useFreeFonts();
  // its name in its letters as it was saved; one saved without it (or before samples) has its letters built here,
  // once the opening title card lets go of them (lib/opening.ts: the card covers the page, and every card's built as
  // the list came stalled its first steps), and the sample drawn from them is kept with it, once its free font, if it
  // is written in one, has come
  const holds = useOpeningHolds(), saved = d.sample?.name === d.name ? d.sample : null;
  const f = saved || holds ? null : fontFor(d.params);
  const drawn = useMemo(() => (f ? drawName(f, d.name) : null), [f, d.name]);
  useEffect(() => {
    const s = f && drawn && keptSample(f, drawn);
    if (s) api.saveSample(d.id, s, d.updatedAt).catch(() => {});
  }, [f, drawn, d.id, d.updatedAt]);
  const sample = saved ?? drawn;
  return (
    <article className="lib-card">
      <Link to={designPath(d.id)} className="lib-open" aria-label={`Open ${d.name}`}>
        {sample && <NameArt s={sample} wrap={!list} />}
      </Link>
      <div className="lib-meta">
        {editing
          ? <RenameField name={d.name} onDone={n => { setEditing(false); if (n !== null) onRename(n); }} />
          : <h3 title={`${d.name} — double-click to rename`} onDoubleClick={() => setEditing(true)}>{d.name}</h3>}
        <p>
          {style && <span title={`Started from ${style}`}>{style}</span>}
          <span title={`${recent ? 'Your latest save · ' : ''}Edited ${new Date(d.updatedAt).toLocaleString()}`}>{recent ? <mark className="lib-recent">{ago(d.updatedAt)}</mark> : ago(d.updatedAt)}</span>
        </p>
      </div>
      <div className="lib-actions">
        <button className="btn icon small" aria-label={`Download ${d.name} (.otf)`} title="Download font (.otf)" onClick={onDownload}>
          <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true"><path d="M8 2.5v8M4.5 7 8 10.5 11.5 7M3 13.5h10" /></svg>
        </button>
        <CardMenu name={d.name} onRename={() => setEditing(true)} onDuplicate={onDuplicate} onDelete={onDelete} />
      </div>
    </article>
  );
}

/** A font's name set in itself (lib/name-sample.ts), as large as fits the box: on a card on the lines a card sets it
    on, in the list on one line, flush left. */
function NameArt({ s, wrap }: { s: NameSample; wrap: boolean }) {
  const { box, at } = (wrap && s.card) || s.list;
  return (
    <svg viewBox={box.join(' ')} preserveAspectRatio={wrap ? 'xMidYMid meet' : 'xMinYMid meet'} aria-hidden="true">
      {at.map(([ch, x, y], i) => <path key={i} d={s.glyphs[ch]} transform={`translate(${x},${y})`} />)}
    </svg>
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

/** The ⋯ button on a card, holding Rename, Duplicate and Delete. */
function CardMenu({ name, onRename, onDuplicate, onDelete }: { name: string; onRename: () => void; onDuplicate: () => void; onDelete: () => void }) {
  const [open, setOpen] = useState(false);
  const wrap = useRef<HTMLDivElement>(null);
  useDismiss(open, setOpen, wrap);

  const pick = (fn: () => void) => () => { setOpen(false); fn(); };
  return (
    <div className="lib-more" ref={wrap}>
      <button className="btn icon small" aria-label={`More actions for ${name}`} title="More actions" aria-expanded={open} aria-haspopup="menu" onClick={() => setOpen(o => !o)}>
        <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true"><path d="M3.5 8h.01M8 8h.01M12.5 8h.01" /></svg>
      </button>
      {open && (
        <div className="popover lib-menu" role="menu">
          <button role="menuitem" onClick={pick(onRename)}>Rename</button>
          <button role="menuitem" onClick={pick(onDuplicate)}>Duplicate</button>
          <button role="menuitem" className="danger" onClick={pick(onDelete)}>Delete</button>
        </div>
      )}
    </div>
  );
}
