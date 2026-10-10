/* Whether a setting changes anything in view, and the note a control shows when it doesn't. */
import { useContext, useEffect, useState } from 'react';
import { isGlyphKey, type GlyphParams, type Params } from '../../../shared/params';
import { sampleText } from '../../lib/preview';
import { reachOf, type Reach } from '../../lib/reach';
import { actions, fontFor, letterOf, useEditor } from '../../state/editor';
import { Quiet } from './heads';

/** What a letter drawn by hand answers: no setting reaches it, and the panel says why once, at the top. */
const DRAWN: Reach = { shows: false, elsewhere: [] };
const reaches = new WeakMap<Params, Map<string, Reach>>();

/** Whether `k` changes what is in view: the inspected letter, or else the letters of the preview. Worked out
    a moment after the settings stop changing, so dragging stays smooth; null until then. */
function useReach(k: keyof Params, skip: boolean): Reach | null {
  const inspect = useEditor(s => s.inspect), letter = useEditor(letterOf);
  const text = useEditor(s => (s.inspect ? '' : sampleText(s.custom)));
  const view = `${k}|${inspect ?? ''}|${letter ?? ''}|${text}`;
  const cached = (p: Params) => reaches.get(p)?.get(view);
  const [r, setR] = useState<{ view: string; reach: Reach } | null>(null);
  useEffect(() => {
    if (skip) return;
    let t: ReturnType<typeof setTimeout> | undefined;
    const show = (reach: Reach) => setR(o => o?.view === view && o.reach.shows === reach.shows && o.reach.elsewhere.join() === reach.elsewhere.join() ? o : { view, reach });
    const work = () => {
      const p = useEditor.getState().params;
      if (inspect && p.outlines[inspect]) return show(DRAWN);
      let reach = cached(p);
      if (!reach) {
        const f = fontFor(p), chars = inspect ? [inspect] : [...new Set(text)].filter(c => f.glyph(c));
        reach = reachOf(p, k, chars, letter);
        if (!reaches.has(p)) reaches.set(p, new Map());
        reaches.get(p)!.set(view, reach);
      }
      show(reach);
    };
    const later = () => { clearTimeout(t); t = setTimeout(work, 150); };
    if (cached(useEditor.getState().params)) work(); else later();
    const stop = useEditor.subscribe((s, o) => { if (s.params !== o.params) later(); });
    return () => { clearTimeout(t); stop(); };
    // `view` holds k, the letter and the text
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [view, skip]);
  return skip || r?.view !== view ? null : r.reach;
}

/** A control's answer to "does this do anything here?": `idle` dims it, `note` says why and where it does show,
    and `quiet` goes to the settings nested in it. */
export function useReachNote(k: keyof Params) {
  const quiet = useContext(Quiet), reach = useReach(k, quiet), idle = !!reach && !reach.shows;
  return { idle, quiet: quiet || idle, note: idle && <ReachNote k={k} reach={reach} /> };
}

/** Under a control that changes nothing in view: what it doesn't change, and up to three letters it does, each opening that letter. */
function ReachNote({ k, reach }: { k: keyof Params; reach: Reach }) {
  const ch = useEditor(s => s.inspect), letter = useEditor(letterOf);
  const own = useEditor(s => !!s.inspect && !letterOf(s) && isGlyphKey(k) && s.params.glyphs[s.inspect]?.[k] !== undefined);
  if (reach === DRAWN) return null;
  if (own && ch) {
    return (
      <p className="reach-note">
        <span>{ch} has its own value here, so this changes only the other letters.</span>
        <button className="link small" onClick={() => actions.shareParam(ch, k as keyof GlyphParams)}>Match the others</button>
      </p>
    );
  }
  const what = !reach.elsewhere.length && !(letter && isGlyphKey(k)) ? 'Changes nothing in this design as it’s set now.'
    : ch ? `Doesn’t change ${ch}.` : 'Doesn’t change the letters shown.';
  return (
    <p className="reach-note">
      <span>{what}{reach.elsewhere.length > 0 && ' Try it on'}</span>
      {reach.elsewhere.map(c => (
        <button key={c} className="reach-ch" title={`Open ${c}`} aria-label={`Open ${c}`} onClick={() => actions.openInspector(c)}>{c}</button>
      ))}
    </p>
  );
}
