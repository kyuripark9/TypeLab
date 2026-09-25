/* The frame around the stage: category navigation, glyph strip and toast. */
import { useDeferredValue, useEffect, useRef, useState } from 'react';
import { CATEGORIES, styleById } from '../../shared/content';
import { CHARSET } from '../../shared/engine';
import { n1 } from '../lib/hooks';
import { actions, useEditor, useFont } from '../state/editor';

export function Nav() {
  const category = useEditor(s => s.category), style = useEditor(s => styleById(s.styleId));
  return (
    <nav className="nav" aria-label="Design categories">
      <div className="nav-title">Design</div>
      {CATEGORIES.map(c => (
        <button key={c.id} className={c.id === category ? 'nav-item on' : 'nav-item'} aria-current={c.id === category ? 'page' : undefined}
          onClick={() => actions.setCategory(c.id)}>
          <span className="nav-label">{c.label}</span>
        </button>
      ))}
      <div className="nav-foot"><span>Based on</span><b>{style?.name}</b></div>
    </nav>
  );
}

const GROUPS: [string, string][] = [['Uppercase', CHARSET.upper], ['Lowercase', CHARSET.lower], ['Figures', CHARSET.digits], ['Punctuation', CHARSET.punct]];

export function GlyphStrip() {
  // the strip is off-screen detail: let it lag a frame behind while sliders move
  const font = useDeferredValue(useFont());
  const inspect = useEditor(s => s.inspect);
  const cells = useRef(new Map<string, HTMLButtonElement>());
  useEffect(() => {
    if (inspect) cells.current.get(inspect)?.scrollIntoView({ block: 'nearest', inline: 'center', behavior: 'smooth' });
  }, [inspect]);
  return (
    <footer className="strip" aria-label="Glyphs">
      {GROUPS.map(([label, chars]) => (
        <div key={label} className="strip-group">
          <span className="strip-label">{label}</span>
          {[...chars].map(ch => {
            const c = ch.charCodeAt(0), g = font.glyph(ch);
            return (
              <button key={c} className={ch === inspect ? 'cell on' : 'cell'} title={`Inspect ${ch}`}
                ref={el => { if (el) cells.current.set(ch, el); else cells.current.delete(ch); }}
                onClick={() => actions.openInspector(ch)}>
                <svg viewBox="0 -880 1000 1180" aria-hidden="true"><use href={`#g${c}`} x={g ? n1((1000 - g.adv) / 2) : 0} /></svg>
              </button>
            );
          })}
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
