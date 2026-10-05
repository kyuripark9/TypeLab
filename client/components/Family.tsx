/* Export a font family: the design drawn again at the weights picked, upright, italic or both, each
   its own font file under the design's name, downloaded together as a .zip. Every weight shows a
   sample in the font it will be, so the steps between them can be judged before downloading. */
import { useEffect, useMemo, useRef, useState } from 'react';
import { cleanName, slug } from '../../shared/design';
import { familyMember, SLANTED, WEIGHTS, weightIdOf, type FamilyMember, type WeightId } from '../../shared/family';
import { api, download, errorMessage } from '../lib/api';
import { n1 } from '../lib/hooks';
import { actions, fontFor, useEditor } from '../state/editor';

const SAMPLE = 'Hamburgefonstiv';

/** The weights picked at first: the design's own and the one a reader would reach for beside it. */
const startWeights = (anchor: WeightId): WeightId[] =>
  anchor === 'bold' ? ['regular', 'bold'] : WEIGHTS.findIndex(w => w.id === anchor) > 6 ? ['regular', anchor] : [anchor, 'bold'];

const withAnchor = (ids: WeightId[], anchor: WeightId) => ids.includes(anchor) ? ids : [...ids, anchor];

export function FamilyDialog({ onClose }: { onClose: () => void }) {
  const params = useEditor(s => s.params), name = cleanName(useEditor(s => s.name));
  const designItalic = params.slant >= SLANTED;
  const [anchor, setAnchor] = useState<WeightId>(() => weightIdOf(params.weight));
  const [weights, setWeights] = useState<WeightId[]>(() => startWeights(weightIdOf(params.weight)));
  const [upright, setUpright] = useState(true), [italic, setItalic] = useState(true);
  const [busy, setBusy] = useState(false);
  const first = useRef<HTMLSelectElement>(null);

  useEffect(() => {
    const was = document.activeElement as HTMLElement | null;
    first.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      e.preventDefault();
      e.stopPropagation();
      onClose();
    };
    addEventListener('keydown', onKey, true);
    return () => { removeEventListener('keydown', onKey, true); was?.focus?.(); };
  }, [onClose]);

  // every weight upright and italic, built once per design and naming, for the samples
  const rows = useMemo(() => WEIGHTS.map(w => ({
    ...w, upright: familyMember(params, anchor, w.id, false), italic: familyMember(params, anchor, w.id, true)
  })), [params, anchor]);

  const toggle = (id: WeightId) => setWeights(ws => ws.includes(id) ? ws.filter(w => w !== id) : [...ws, id]);
  const count = weights.length * ((upright ? 1 : 0) + (italic ? 1 : 0));
  const drawn = Object.keys(params.outlines);

  const build = async () => {
    setBusy(true);
    try {
      const blob = await api.exportFamily({ name, params, family: { anchor, weights, upright, italic } });
      download(`${slug(name)}-family.zip`, blob);
      actions.toast(`Family exported — ${count} fonts; unzip and open them to install`);
      onClose();
    } catch (e) {
      actions.toast(`Export failed: ${errorMessage(e)}`);
      setBusy(false);
    }
  };

  return (
    <div className="dialog-scrim" onPointerDown={e => { if (e.target === e.currentTarget && !busy) onClose(); }}>
      <div className="dialog family" role="dialog" aria-modal="true" aria-labelledby="family-title">
        <h2 id="family-title">Font family</h2>
        <p>Draw “{name}” in more weights and an italic. Each is its own font file, and they install together as one family.</p>

        <div className="family-opts">
          <label className="family-field">
            <span>This design is</span>
            <select ref={first} value={anchor} onChange={e => {
              const a = e.target.value as WeightId;
              setAnchor(a);
              setWeights(ws => ws.includes(a) ? ws : [...ws, a]);
            }}>
              {WEIGHTS.map(w => <option key={w.id} value={w.id}>{w.name} · {w.cls}</option>)}
            </select>
          </label>
          <div className="family-field">
            <span>Styles</span>
            <div className="chips">
              <button type="button" className={upright ? 'chip on' : 'chip'} aria-pressed={upright} onClick={() => setUpright(!upright)}>Upright</button>
              <button type="button" className={italic ? 'chip on' : 'chip'} aria-pressed={italic} onClick={() => setItalic(!italic)}>Italic</button>
            </div>
          </div>
          <div className="family-quick">
            <button type="button" className="btn ghost small" onClick={() => setWeights(startWeights(anchor))}>Two weights</button>
            <button type="button" className="btn ghost small" onClick={() => setWeights(withAnchor(['light', 'regular', 'medium', 'bold'], anchor))}>Light to Bold</button>
            <button type="button" className="btn ghost small" onClick={() => setWeights(WEIGHTS.map(w => w.id))}>All nine</button>
          </div>
        </div>

        <ul className="family-list" aria-label="Weights">
          {rows.map(r => {
            const on = weights.includes(r.id);
            return (
              <li key={r.id} className={on ? 'family-row on' : 'family-row'}>
                <label className="family-pick">
                  <input type="checkbox" checked={on} onChange={() => toggle(r.id)} />
                  <b>{r.name}</b>
                  <span>{r.cls}{r.id === anchor && ' · this design'}</span>
                </label>
                <div className={upright && italic ? 'family-samples two' : 'family-samples'}>
                  {upright && <Sample member={r.upright} label={r.upright.style} />}
                  {italic && <Sample member={r.italic} label={r.italic.style} />}
                  {!upright && !italic && <span className="family-none">Pick Upright, Italic or both</span>}
                </div>
              </li>
            );
          })}
        </ul>

        {(drawn.length > 0 || designItalic) && (
          <p className="family-note">
            {designItalic && <>The design is slanted, so its italics keep that slant and the uprights stand it up. </>}
            {drawn.length > 0 && <>{drawn.slice(0, 6).join(' ')}{drawn.length > 6 && ' …'} {drawn.length === 1 ? 'is' : 'are'} drawn by hand in Points mode, so {drawn.length === 1 ? 'it looks' : 'they look'} the same in every weight.</>}
          </p>
        )}

        <div className="dialog-actions family-actions">
          <span className="family-count">{count ? `${count} font${count === 1 ? '' : 's'} · .otf in a .zip` : 'Nothing picked yet'}</span>
          <button className="btn" onClick={onClose} disabled={busy}>Cancel</button>
          <button className="btn primary" onClick={build} disabled={busy || !count}>{busy ? 'Building family…' : 'Download family'}</button>
        </div>
      </div>
    </div>
  );
}

/** One member's sample, drawn by the font it exports as. */
function Sample({ member, label }: { member: FamilyMember; label: string }) {
  const f = fontFor(member.params), ln = f.layout(SAMPLE, Infinity)[0];
  // room on the right for an italic's lean
  const w = Math.max(4000, ln.width + 300);
  return (
    <svg className="family-sample" viewBox={`-60 -900 ${w} 1150`} preserveAspectRatio="xMinYMid meet" role="img" aria-label={label}>
      <title>{label}</title>
      {ln.items.map((it, i) => { const g = f.glyph(it.ch); return g && <path key={i} d={g.d} transform={`translate(${n1(it.x)},0)`} />; })}
    </svg>
  );
}
