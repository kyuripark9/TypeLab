/* The font's History (shared/font-log.ts), opened from the clock beside undo and redo: the whole design after each
   change, newest first, each drawn small as it was then, what made it and when, the version the design stands as
   marked Now. Picking one brings the whole font back to it, its style, settings and every letter's own, in one undo
   step. Each letter keeps a History of its own in the inspector (LetterHistory.tsx). */
import { memo, useMemo, useRef, useState } from 'react';
import { styleById } from '../../shared/content';
import { buildFont, freeFont, type Font } from '../../shared/engine';
import { sameDesign, type FontVersion } from '../../shared/font-log';
import type { Params } from '../../shared/params';
import { loadFreeFont } from '../lib/free';
import { settingName, someOf, useDrawnRows, useInWindow, when } from '../lib/history';
import { n1, useDismiss } from '../lib/hooks';
import { actions, useEditor, useFont } from '../state/editor';

/** The History button, dimmed until the font has changed, and its menu. */
export function FontHistory() {
  const versions = useEditor(s => s.versions);
  const [open, setOpen] = useState(false);
  const wrap = useRef<HTMLDivElement>(null);
  useDismiss(open, setOpen, wrap, true);
  return (
    <div className="font-history" ref={wrap}>
      <button className="btn ghost icon" aria-label="History" aria-haspopup="menu" aria-expanded={open} disabled={!versions.length}
        title="History: every version of the font, kept with it, to bring back" onClick={() => setOpen(o => !o)}>
        <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true"><path d="M3.9 12a8.1 8.1 0 1 0 2.4-5.7M3.75 3.75v3.3h3.3M12 7.5v4.8l3.15 2.1" strokeLinejoin="round" /></svg>
      </button>
      {open && <VersionsMenu versions={versions} close={() => setOpen(false)} />}
    </div>
  );
}

function VersionsMenu({ versions, close }: { versions: FontVersion[]; close: () => void }) {
  const font = useFont(), styleId = useEditor(s => s.styleId), params = useEditor(s => s.params);
  // newest first, each with whether the design stands as it now; the newest of those is Now
  const rows = useMemo(() => {
    const now = { styleId, params, key: JSON.stringify([styleId, params]) };
    return versions.map((v, i) => ({ v, i, same: sameDesign(v, now) })).reverse();
  }, [versions, styleId, params]);
  const now = rows.find(r => r.same)?.i ?? -1;
  // (on phones the button sits further left)
  const menu = useRef<HTMLDivElement>(null);
  useInWindow(menu);
  const shown = useDrawnRows(rows.length);
  const bring = (v: FontVersion) => {
    if (actions.restoreVersion(v)) actions.toast(`The font is back as it was at ${when(v.t)} · ⌘Z undoes it`);
    close();
  };
  return (
    <div className="popover history-menu" ref={menu} role="menu" aria-label="History">
      <div className="list-head">History</div>
      <div className="history-list">
        {rows.map(({ v, i, same }, k) => <VersionRow key={i} v={v} font={font} draw={k < shown} now={i === now} off={same} onPick={() => bring(v)} />)}
      </div>
    </div>
  );
}

/** What a version is drawn as: the letters it changed on their own, the first two, or a sample. */
const SAMPLE = 'Ag';
const sampleOf = (v: FontVersion) => (v.letters.length && !v.keys.length ? v.letters.slice(0, 2).join('') : SAMPLE);
/** One version of the font: drawn small, at the design's heights so versions compare, what made it, and when;
    pressed, the font is brought back to it. */
const VersionRow = memo(function VersionRow({ v, font, draw, now, off, onPick }: { v: FontVersion; font: Font; draw: boolean; now: boolean; off: boolean; onPick: () => void }) {
  const f = draw ? versionFont(v.params, font) : null, m = font.m, top = Math.max(m.asc, m.cap) + 60, h = top - m.desc + 60, w = h * 1.5;
  let x = 0;
  const paths = f ? [...sampleOf(v)].map((ch, i) => {
    const g = f.glyph(ch), at = x;
    x += g?.adv ?? 0;
    return g && <path key={i} d={g.d} transform={at ? `translate(${n1(at)} 0)` : undefined} />;
  }) : null;
  return (
    <button role="menuitem" className={now ? 'history-row wide now' : 'history-row wide'} disabled={off} onClick={onPick}
      title={off ? 'The font stands so now' : 'Bring the font back to this'}>
      <svg viewBox={`${n1((x - w) / 2)} ${n1(-top)} ${n1(w)} ${n1(h)}`} aria-hidden="true">{paths}</svg>
      <span className="history-what">{whatOf(v)}</span>
      {now ? <span className="history-now">Now</span> : <span className="history-when">{when(v.t)}</span>}
    </button>
  );
});

/** The font a version draws, built once (from the design's, which lends its letters where only drawings differ),
    and again once a free font it was missing arrives. */
const built = new WeakMap<Params, Font>();
function versionFont(p: Params, design: Font): Font {
  if (p === design.params) return design;
  let f = built.get(p);
  if (!f || f.freeMissing.some(id => freeFont(id))) { f = buildFont(p, design); built.set(p, f); }
  for (const id of f.freeMissing) void loadFreeFont(id);
  return f;
}

/** What made a version: the settings for every letter it changed by their names, then the letters it changed on their
    own, a few, then how many more; a style picked, traits, a design file, a version brought back; "As it was" where
    the History notes how the font stood before a change. */
function whatOf(v: FontVersion): string {
  if (v.back !== undefined) return v.letters.length === 1 && !v.keys.length ? `${v.letters[0]} brought back` : 'Brought back';
  if (v.made === 'style') return `Style: ${styleById(v.styleId)?.name ?? 'another'}`;
  if (v.made === 'file') return 'Design file opened';
  if (v.made === 'traits') return 'Traits';
  const l = v.letters, letters = !l.length ? [] : [l.length === 1 ? `Letter ${l[0]}` : `Letters ${l.slice(0, 4).join(' ')}${l.length > 4 ? ` +${l.length - 4}` : ''}`];
  const parts = [...v.keys.flatMap(k => settingName(k) ?? []), ...letters];
  return parts.length ? someOf(parts) : v.keys.length ? 'Settings' : 'As it was';
}
