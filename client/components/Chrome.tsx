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
      onClick={() => { actions.setCategory(id); actions.setNavOpen(false); }}>
      <span className="nav-label">{label}</span>
    </button>
  );
  return (
    <nav className="nav" aria-label="Design categories" data-guide="nav">
      {NAV.map(row => 'group' in row ? (
        <div key={row.group} className="nav-group" role="group" aria-label={GROUPS[row.group]}>
          {/* a group's name opens its first page, unless one of its pages is open already */}
          <button className={row.pages.some(p => p.id === category) ? 'nav-item open' : 'nav-item'}
            onClick={() => { if (!row.pages.some(p => p.id === category)) { actions.setCategory(row.pages[0].id); actions.setNavOpen(false); } }}>
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
  const scroller = useRef<HTMLDivElement>(null), groups = useRef<(HTMLDivElement | null)[]>([]);
  // what lies past each edge: the arrows show only where there's more, and the right one names the next group
  const [edges, setEdges] = useState<{ back: boolean; next: string | null; more: boolean }>({ back: false, next: null, more: false });
  const measure = () => {
    const el = scroller.current;
    if (!el) return;
    const right = el.scrollLeft + el.clientWidth;
    const ahead = groups.current.findIndex(g => g && g.offsetLeft >= right - 8);
    setEdges({ back: el.scrollLeft > 4, more: right < el.scrollWidth - 4, next: ahead >= 0 ? STRIP_GROUPS[ahead][0] : null });
  };
  useEffect(() => {
    const el = scroller.current;
    if (!el) return;
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    // a mouse wheel scrolls the strip sideways, the only way it goes
    const wheel = (e: WheelEvent) => { if (Math.abs(e.deltaY) > Math.abs(e.deltaX)) { el.scrollLeft += e.deltaY; e.preventDefault(); } };
    el.addEventListener('wheel', wheel, { passive: false });
    return () => { ro.disconnect(); el.removeEventListener('wheel', wheel); };
  }, []);
  useEffect(() => {
    if (inspect) cells.current.get(inspect)?.scrollIntoView({ block: 'nearest', inline: 'center', behavior: 'smooth' });
  }, [inspect]);
  /** Forward: to the start of the next group out of sight, or on by most of a view; back: by most of a view. */
  const go = (d: 1 | -1) => {
    const el = scroller.current;
    if (!el) return;
    const right = el.scrollLeft + el.clientWidth;
    const g = d > 0 ? groups.current.find(x => x && x.offsetLeft >= right - 8) : null;
    el.scrollTo({ left: g ? g.offsetLeft - 12 : el.scrollLeft + d * el.clientWidth * 0.8, behavior: 'smooth' });
  };
  return (
    <footer className="strip" aria-label="Glyphs" data-guide="strip">
      {edges.back && (
        <button className="strip-arrow back" aria-label="Scroll the glyphs back" title="Back" onClick={() => go(-1)}>
          <svg width="14" height="14" viewBox="0 0 16 16" aria-hidden="true"><path d="M10 3 5 8l5 5" /></svg>
        </button>
      )}
      {edges.more && (
        <button className="strip-arrow next" aria-label={edges.next ? `Show ${edges.next}` : 'Show more glyphs'} onClick={() => go(1)}>
          {edges.next && <span>{edges.next}</span>}
          <svg width="14" height="14" viewBox="0 0 16 16" aria-hidden="true"><path d="m6 3 5 5-5 5" /></svg>
        </button>
      )}
      <div className="strip-scroll" ref={scroller} onScroll={measure}>
      {STRIP_GROUPS.map(([label, chars], gi) => (
        <div key={label} className="strip-group" ref={el => { groups.current[gi] = el; }}>
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
      </div>
    </footer>
  );
}

export function Toast() {
  const toast = useEditor(s => s.toast);
  const [show, setShow] = useState(false);
  useEffect(() => {
    if (!toast) return;
    setShow(true);
    // a toast with a button (Undo, Customize) stays long enough to reach it
    const t = setTimeout(() => setShow(false), toast.action ? 6000 : 2400);
    return () => clearTimeout(t);
  }, [toast]);
  const action = toast?.action;
  return (
    <div className={['toast', show && 'show', action && 'has-action'].filter(Boolean).join(' ')} role="status" aria-live="polite">
      <span>{toast?.msg}</span>
      {action && <button className="toast-action" tabIndex={show ? 0 : -1} onClick={() => { setShow(false); action.run(); }}>{action.label}</button>}
    </div>
  );
}
