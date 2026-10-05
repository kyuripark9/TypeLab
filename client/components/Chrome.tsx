/* The frame around the stage: category navigation, glyph strip and toast. */
import { useDeferredValue, useEffect, useRef, useState, type KeyboardEvent } from 'react';
import { CATEGORIES, GROUPS, controlFor, findSettings, styleById, type CategoryId, type GroupId, type SettingHit } from '../../shared/content';
import { Link } from 'react-router';
import { CHARSET } from '../../shared/engine';
import { n1 } from '../lib/hooks';
import { actions, useEditor, useFont } from '../state/editor';
import { PageIcon, SearchIcon } from './Icons';

/** The navigation's rows: a page on its own, or a group's name with its pages under it. */
type NavRow = { id: CategoryId; label: string; hint: string } | { group: GroupId; pages: { id: CategoryId; label: string; hint: string }[] };
const NAV: NavRow[] = [];
for (const c of CATEGORIES) {
  const last = NAV[NAV.length - 1];
  if (!c.group) NAV.push(c);
  else if (last && 'group' in last && last.group === c.group) last.pages.push(c);
  else NAV.push({ group: c.group, pages: [c] });
}

const SEARCH_ID = 'setting-search';
const FIND_KEY = /Mac|iPhone|iPad/.test(navigator.platform) ? '⌘K' : 'Ctrl K';
/** Put the cursor in Find a setting (⌘K), opening the page menu first where it is a drawer. */
export function focusSettingSearch() {
  const focus = () => {
    const el = document.getElementById(SEARCH_ID) as HTMLInputElement | null;
    el?.focus();
    el?.select();
  };
  // a closed drawer can't take focus until it has opened
  if (matchMedia('(max-width: 1180px)').matches && !useEditor.getState().navOpen) { actions.setNavOpen(true); requestAnimationFrame(focus); }
  else focus();
}

/** Open the page a setting is on and bring the setting into view: unfold the control it sits in,
    scroll to it, and flash it once so the eye finds it. A nested slider that its control's current
    shape doesn't show (Flare while ends are Rounded), or that is switched off, brings up its control instead. */
function openSetting(h: SettingHit) {
  const parent = controlFor(h.key);
  if (useEditor.getState().folded.includes(parent)) actions.toggleFold(parent, true);
  actions.setCategory(h.page, h.key);
  actions.setNavOpen(false);
  requestAnimationFrame(() => requestAnimationFrame(() => {
    // a slider folded away (Stencil's Position while Stencil is off) gives way to the control it sits in
    const el = [h.key, parent].map(k => document.querySelector<HTMLElement>(`.panel [data-ctl="${k}"]`)).find(x => x && !x.closest('[inert]'));
    if (!el) return;
    el.scrollIntoView({ block: 'center', behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' });
    el.classList.remove('found');
    void el.offsetWidth;
    el.classList.add('found');
    setTimeout(() => el.classList.remove('found'), 1600);
  }));
}

export function Nav() {
  const category = useEditor(s => s.category), style = useEditor(s => styleById(s.styleId));
  const [query, setQuery] = useState(''), [pick, setPick] = useState(0);
  const hits = query.trim() ? findSettings(query) : null;
  const list = useRef<HTMLDivElement>(null);
  useEffect(() => { list.current?.querySelector('.on')?.scrollIntoView({ block: 'nearest' }); }, [pick]);
  const choose = (h: SettingHit) => { setQuery(''); openSetting(h); (document.activeElement as HTMLElement | null)?.blur(); };
  const onKey = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Escape') { e.stopPropagation(); if (query) setQuery(''); else e.currentTarget.blur(); }
    if (!hits?.length) return;
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') { e.preventDefault(); setPick(p => (p + (e.key === 'ArrowDown' ? 1 : -1) + hits.length) % hits.length); }
    else if (e.key === 'Enter') { e.preventDefault(); choose(hits[Math.min(pick, hits.length - 1)]); }
  };
  const page = ({ id, label, hint }: { id: CategoryId; label: string; hint: string }) => (
    <button key={id} className={id === category ? 'nav-item on' : 'nav-item'} aria-current={id === category ? 'page' : undefined} title={hint}
      onClick={() => { actions.setCategory(id); actions.setNavOpen(false); }}>
      <PageIcon id={id} />
      <span className="nav-label">{label}</span>
    </button>
  );
  const pageName = (id: CategoryId) => CATEGORIES.find(c => c.id === id)!.label;
  return (
    <nav className="nav" aria-label="Design categories" data-guide="nav">
      <label className="nav-search">
        <SearchIcon />
        <input id={SEARCH_ID} type="search" placeholder="Find a setting" value={query} autoComplete="off" spellCheck={false}
          role="combobox" aria-expanded={!!hits} aria-controls="setting-hits" aria-autocomplete="list"
          aria-activedescendant={hits?.length ? `hit-${Math.min(pick, hits.length - 1)}` : undefined}
          onChange={e => { setQuery(e.target.value); setPick(0); }} onKeyDown={onKey} />
        {!query && <kbd aria-hidden="true">{FIND_KEY}</kbd>}
      </label>
      {hits ? (
        <div className="nav-hits" id="setting-hits" role="listbox" aria-label="Settings found" ref={list}>
          {hits.length ? hits.map((h, i) => (
            <button key={h.key} id={`hit-${i}`} role="option" aria-selected={i === pick} className={i === pick ? 'nav-hit on' : 'nav-hit'}
              onPointerEnter={() => setPick(i)} onClick={() => choose(h)}>
              <PageIcon id={h.page} />
              <span className="nav-hit-text">
                <span className="nav-label">{h.parent ? <><span className="nav-hit-parent">{h.parent}</span> › </> : null}{h.label}{h.option && <span className="nav-hit-parent"> · {h.option}</span>}</span>
                {/* the page, unless the setting is named after it */}
                {pageName(h.page) !== (h.parent ?? h.label) && <span className="nav-hit-page">{pageName(h.page)}</span>}
              </span>
            </button>
          )) : <p className="nav-empty">No setting matches “{query.trim()}”. Try a word like bold, italic, serif or spacing.</p>}
        </div>
      ) : (
        <div className="nav-pages">
          {NAV.map(row => 'group' in row ? (
            <div key={row.group} className="nav-group" role="group" aria-labelledby={`nav-${row.group}`}>
              <div className="nav-group-name" id={`nav-${row.group}`}>{GROUPS[row.group]}</div>
              {row.pages.map(page)}
            </div>
          ) : page(row))}
        </div>
      )}
      {/* phones: the header has no room for it, so it sits at the foot of the drawer */}
      <Link className="nav-item nav-designs" to="/designs"><span className="nav-label">My designs</span></Link>
      <div className="nav-foot"><span>Based on</span><b>{style?.name}</b></div>
    </nav>
  );
}

const STRIP_GROUPS: [string, string][] = [['Uppercase', CHARSET.upper], ['Lowercase', CHARSET.lower], ['Figures', CHARSET.digits], ['Punctuation', CHARSET.punct], ['Symbols', CHARSET.symbols]];

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
