/* My designs: every saved font, previewed in its own letterforms. */
import { useEffect, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router';
import type { Design } from '../../shared/design';
import { api, errorMessage } from '../lib/api';
import { n1 } from '../lib/hooks';
import { actions, fontFor, useEditor } from '../state/editor';
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

  const load = () => {
    setError(null);
    api.listDesigns().then(setDesigns).catch(e => setError(errorMessage(e)));
  };
  useEffect(() => { document.title = 'My designs — TypeLab'; load(); }, []);

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

  const remove = async (d: Design) => {
    if (!window.confirm(`Delete “${d.name}”? This can’t be undone.`)) return;
    try {
      await api.deleteDesign(d.id);
      setDesigns(list => list && list.filter(x => x.id !== d.id));
      if (useEditor.getState().designId === d.id) actions.newDesign();
      actions.toast(`Deleted “${d.name}”`);
    } catch (e) { actions.toast(`Couldn’t delete — ${errorMessage(e)}`); }
  };

  return (
    <div className="library">
      <header className="top">
        <div className="top-left"><Brand /></div>
        <div className="top-actions">
          <button className="btn primary" onClick={startNew}><svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true"><path d="M8 3v10M3 8h10" /></svg>New design</button>
        </div>
      </header>
      <main className="lib-main">
        <div className="lib-head">
          <h1>My designs</h1>
          {designs && designs.length > 0 && <p>{designs.length} saved {designs.length === 1 ? 'font' : 'fonts'}</p>}
        </div>
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
            {designs.map(d => <DesignCard key={d.id} d={d} recent={d.id === recentId} onDuplicate={() => duplicate(d)} onDelete={() => remove(d)} />)}
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

function DesignCard({ d, recent, onDuplicate, onDelete }: { d: Design; recent: boolean; onDuplicate: () => void; onDelete: () => void }) {
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
        <h3 title={d.name}>{d.name}</h3>
        <CardMenu name={d.name} onDuplicate={onDuplicate} onDelete={onDelete} />
        <p title={new Date(d.updatedAt).toLocaleString()}>Edited {ago(d.updatedAt)}</p>
      </div>
    </article>
  );
}

/** The ⋯ button on a card, holding Duplicate and Delete. */
function CardMenu({ name, onDuplicate, onDelete }: { name: string; onDuplicate: () => void; onDelete: () => void }) {
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
          <button role="menuitem" onClick={pick(onDuplicate)}>Duplicate</button>
          <button role="menuitem" className="danger" onClick={pick(onDelete)}>Delete</button>
        </div>
      )}
    </div>
  );
}
