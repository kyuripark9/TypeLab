/* The frame around the stage: category navigation, glyph strip and toast. */
import { useDeferredValue, useEffect, useRef, useState } from 'react';
import { CATEGORIES, GROUPS, styleById, type CategoryId, type GroupId } from '../../shared/content';
import { CHARSET } from '../../shared/engine';
import { n1 } from '../lib/hooks';
import { actions, useEditor, useFont } from '../state/editor';

/** The navigation's rows: a page on its own, or a group with its pages under it. */
type NavRow = { id: CategoryId; label: string } | { group: GroupId; pages: { id: CategoryId; label: string }[] };
const NAV: NavRow[] = [];
for (const c of CATEGORIES) {
  const last = NAV[NAV.length - 1];
  if (!c.group) NAV.push(c);
  else if (last && 'group' in last && last.group === c.group) last.pages.push(c);
  else NAV.push({ group: c.group, pages: [c] });
}

export function Nav() {
  const category = useEditor(s => s.category), style = useEditor(s => styleById(s.styleId));
  const page = ({ id, label }: { id: CategoryId; label: string }, sub = false) => (
    <button key={id} className={['nav-item', sub && 'sub', id === category && 'on'].filter(Boolean).join(' ')} aria-current={id === category ? 'page' : undefined}
      onClick={() => actions.setCategory(id)}>
      <span className="nav-label">{label}</span>
    </button>
  );
  return (
    <nav className="nav" aria-label="Design categories" data-guide="nav">
      {NAV.map(row => 'group' in row ? (
        <div key={row.group} className="nav-group" role="group" aria-label={GROUPS[row.group]}>
          {/* a group's name opens its first page, unless one of its pages is open already */}
          <button className={row.pages.some(p => p.id === category) ? 'nav-item open' : 'nav-item'}
            onClick={() => { if (!row.pages.some(p => p.id === category)) actions.setCategory(row.pages[0].id); }}>
            <span className="nav-label">{GROUPS[row.group]}</span>
          </button>
          <div className="nav-sub">{row.pages.map(p => page(p, true))}</div>
        </div>
      ) : page(row))}
      <div className="nav-foot"><span>Based on</span><b>{style?.name}</b></div>
    </nav>
  );
}

const STRIP_GROUPS: [string, string][] = [['Uppercase', CHARSET.upper], ['Lowercase', CHARSET.lower], ['Figures', CHARSET.digits], ['Punctuation', CHARSET.punct]];

export function GlyphStrip() {
  // the strip is off-screen detail: let it lag a frame behind while sliders move
  const font = useDeferredValue(useFont());
  const inspect = useEditor(s => s.inspect), custom = useEditor(s => s.params.glyphs), drawn = useEditor(s => s.params.outlines);
  const cells = useRef(new Map<string, HTMLButtonElement>());
  useEffect(() => {
    if (inspect) cells.current.get(inspect)?.scrollIntoView({ block: 'nearest', inline: 'center', behavior: 'smooth' });
  }, [inspect]);
  return (
    <footer className="strip" aria-label="Glyphs" data-guide="strip">
      {STRIP_GROUPS.map(([label, chars]) => (
        <div key={label} className="strip-group">
          <span className="strip-label">{label}</span>
          <div className="strip-cells">
            {[...chars].map(ch => {
              const c = ch.charCodeAt(0), g = font.glyph(ch);
              return (
                <button key={c} className={['cell', ch === inspect && 'on', (custom[ch] || drawn[ch]) && 'custom'].filter(Boolean).join(' ')}
                  title={drawn[ch] ? `Inspect ${ch} (drawn by hand)` : custom[ch] ? `Inspect ${ch} (customized)` : `Inspect ${ch}`}
                  ref={el => { if (el) cells.current.set(ch, el); else cells.current.delete(ch); }}
                  onClick={() => actions.openInspector(ch)}>
                  <svg viewBox="0 -880 1000 1180" aria-hidden="true"><use href={`#g${c}`} x={g ? n1((1000 - g.adv) / 2) : 0} /></svg>
                </button>
              );
            })}
          </div>
        </div>
      ))}
    </footer>
  );
}

export function Toast() {
  const toast = useEditor(s => s.toast);
  const [show, setShow] = useState(false);
  useEffect(() => {
    if (!toast) return;
    setShow(true);
    const t = setTimeout(() => setShow(false), 2400);
    return () => clearTimeout(t);
  }, [toast]);
  return <div className={show ? 'toast show' : 'toast'} role="status" aria-live="polite">{toast?.msg}</div>;
}
