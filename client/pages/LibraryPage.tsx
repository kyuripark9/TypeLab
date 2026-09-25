/* My designs: every saved font, previewed in its own letterforms. */
import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router';
import { styleById } from '../../shared/content';
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
  const openId = useEditor(s => s.designId);
  const navigate = useNavigate();

  const load = () => {
    setError(null);
    api.listDesigns().then(setDesigns).catch(e => setError(errorMessage(e)));
  };
  useEffect(() => { document.title = 'My designs — TypeLab'; load(); }, []);

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
        <div className="top-left"><Brand to={openId ? `/d/${openId}` : '/'} /></div>
        <div className="top-actions">
          <Link className="btn ghost" to={openId ? `/d/${openId}` : '/'}>Back to editor</Link>
          <button className="btn primary" onClick={startNew}>New design</button>
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
            <p>Shape a typeface in the editor, then press <b>Save</b> — it will appear here.</p>
            <button className="btn primary" onClick={startNew}>Start designing</button>
          </div>
        ) : (
          <div className="lib-grid">
            {designs.map(d => <DesignCard key={d.id} d={d} onDuplicate={() => duplicate(d)} onDelete={() => remove(d)} />)}
          </div>
        )}
      </main>
      <Toast />
    </div>
  );
}

function DesignCard({ d, onDuplicate, onDelete }: { d: Design; onDuplicate: () => void; onDelete: () => void }) {
  const f = fontFor(d.params), ln = f.layout('Ag', Infinity)[0], sample = f.layout('Hamburgefonstiv', Infinity)[0];
  const pad = (1500 - ln.width) / 2, spad = Math.max(0, (9000 - sample.width) / 2);
  return (
    <article className="lib-card">
      <Link to={`/d/${d.id}`} className="lib-open" aria-label={`Open ${d.name}`}>
        <svg className="lib-big" viewBox={`${-pad} -900 1500 1150`} aria-hidden="true">
          {ln.items.map((it, i) => <path key={i} d={f.glyph(it.ch)!.d} transform={`translate(${n1(it.x)},0)`} />)}
        </svg>
        <svg className="lib-sample" viewBox={`${-spad} -900 ${Math.max(9000, sample.width)} 1150`} aria-hidden="true">
          {sample.items.map((it, i) => <path key={i} d={f.glyph(it.ch)!.d} transform={`translate(${n1(it.x)},0)`} />)}
        </svg>
      </Link>
      <div className="lib-meta">
        <h3 title={d.name}>{d.name}</h3>
        <div className="lib-actions">
          <button className="btn ghost small" onClick={onDuplicate}>Duplicate</button>
          <button className="btn ghost small danger" onClick={onDelete}>Delete</button>
        </div>
        <p title={new Date(d.updatedAt).toLocaleString()}>{styleById(d.styleId)?.name ?? 'Custom'} · edited {ago(d.updatedAt)}</p>
      </div>
    </article>
  );
}
