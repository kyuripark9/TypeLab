/* A customized letter's own values, each set beside a small picture of the letter: its joins, stroke ends, corners and strokes. */
import type { ReactNode } from 'react';
import { cmdsBox, cmdsToD, type Glyph } from '../../../shared/engine';
import { isPlainEnd } from '../../../shared/params';
import { letterCorners, letterJoins, letterStrokes, strokeEnds, type CornerInfo, type JoinInfo, type StrokeEndInfo, type StrokeInfo } from '../../lib/drag';
import { OWN_CONTROL, actions, curlOf, endOf, letterOf, paramOf, useEditor, useScopedFont, type OwnKey } from '../../state/editor';
import { NumberField, Range } from './inputs';

/** While a letter is customized, a gap for each of its joins (where a stroke ends in another, or
    turns), each beside a picture of the letter with that join marked: the stroke pulled back from
    the one it meets, on or off the Stencil; while every letter is in sync, a way into customizing. */
export function EachJoin() {
  return <EachList noun="join" items={letterJoins} thumb={(g, joins) => <EndThumb g={g} ends={joins} />}
    row={(g, joins, j) => <JoinSlider key={j.id} g={g} joins={joins} join={j} />} />;
}

/** A letter's own values of one kind, one row per item of `items` (its joins, ends, corners or strokes),
    shown while that letter is customized; while every letter is in sync, the letter in miniature
    (`thumb`) and a way into customizing, since they are set one by one only on a single letter.
    Nothing while no letter is inspected or it has none. */
function EachList<T extends { id: string }>({ noun, items, thumb, row }: {
  noun: string; items: (g: Glyph) => T[]; thumb: (g: Glyph, items: T[]) => ReactNode; row: (g: Glyph, items: T[], item: T) => ReactNode;
}) {
  const ch = useEditor(s => s.inspect), letter = useEditor(letterOf), font = useScopedFont();
  const g = ch ? font.glyph(ch) : null, list = g ? items(g) : [];
  if (!ch || !g || !list.length) return null;
  if (!letter) {
    return (
      <div className="each-end locked">
        {thumb(g, list)}
        <div className="sub-label">{`Each ${noun}`}</div>
        {/* setting them one by one customizes the letter, so the button says what it's for */}
        <button className="btn wide small" title={`Customizes ${ch}: only ${ch} changes`} onClick={() => actions.setScope('letter')}>{`Set each ${noun} of `}{ch}</button>
      </div>
    );
  }
  return (
    <div className="each-end">
      <div className="sub-label">{`Each ${noun}`}</div>
      {list.map(item => row(g, list, item))}
    </div>
  );
}

/** One join's gap beside a picture of the letter with that join marked, and the stroke it pulls back picked out,
    so two joins in one place (an F's arm off its stem, or the stem off the arm) tell apart. */
function JoinSlider({ g, joins, join: { id, label, v: drawn, stroke } }: { g: Glyph; joins: JoinInfo[]; join: JoinInfo }) {
  const hot = useEditor(s => s.hotEnd === id), v = useEditor(s => paramOf(s, 'joinGaps')[id]) ?? drawn;
  return (
    <div className={hot ? 'ctl end hot' : 'ctl end'} title={label}
      onPointerEnter={() => actions.setHotEnd(id)} onPointerLeave={() => actions.setHotEnd(null)}>
      <EndThumb g={g} ends={joins} on={id} stroke={stroke} />
      <EndRow id={id} k="joinGaps" name="Gap" label={label} value={v}
        tip="Left keeps the strokes joined; right pulls this stroke back from the one it meets, opening a gap up to two stems wide" reset="Follow Stencil again" />
    </div>
  );
}

/** While a letter is customized, a length and curl for each of its stroke ends, each shown as a small
    picture of the letter with that end marked; while every letter is in sync, a way into customizing,
    since ends are set one by one only on a single letter. */
export function EachEnd() {
  return <EachList noun="end" items={strokeEnds} thumb={(g, ends) => <EndThumb g={g} ends={ends} />}
    row={(g, ends, e) => <EndSlider key={e.id} g={g} ends={ends} end={e} />} />;
}

/** While a letter is customized, a roundness for each of its corners (where a stroke turns, and the
    corners of its square ends), each beside a picture of the letter with that corner marked; while
    every letter is in sync, a way into customizing, since corners are rounded one by one only on a
    single letter. */
export function EachCorner() {
  return <EachList noun="corner" items={letterCorners} thumb={(g, corners) => <EndThumb g={g} ends={corners} />}
    row={(g, corners, c) => <CornerSlider key={c.id} g={g} corners={corners} corner={c} />} />;
}

/** While a letter is customized, a weight for each of its strokes, each beside a picture of the letter
    with that stroke picked out; while every letter is in sync, a way into customizing, since strokes
    are weighted one by one only on a single letter. */
export function EachStroke() {
  return <EachList noun="stroke" items={letterStrokes} thumb={g => <StrokeThumb g={g} />}
    row={(g, _, t) => <StrokeSlider key={t.id} g={g} stroke={t} />} />;
}

/** One stroke's weight beside a picture of the letter with that stroke picked out. */
function StrokeSlider({ g, stroke: { id, label } }: { g: Glyph; stroke: StrokeInfo }) {
  const hot = useEditor(s => s.hotEnd === id), v = useEditor(s => paramOf(s, 'strokeWeights')[id] ?? 0.5);
  return (
    <div className={hot ? 'ctl end hot' : 'ctl end'} title={label}
      onPointerEnter={() => actions.setHotEnd(id)} onPointerLeave={() => actions.setHotEnd(null)}>
      <StrokeThumb g={g} on={id} />
      <EndRow id={id} k="strokeWeights" name="Weight" label={label} value={v}
        tip="Left makes this stroke lighter, right heavier; the middle draws it as the design does" reset="Draw it as the design does" />
    </div>
  );
}

/** The letter in miniature with every stroke picked out, or only the stroke `on`. */
function StrokeThumb({ g, on }: { g: Glyph; on?: string }) {
  const t = thumbBox(g);
  if (!t) return null;
  return (
    <svg className="end-thumb" viewBox={t.box.join(' ')} aria-hidden="true">
      <path d={g.d} />
      <path className="on" d={g.strokes.filter(s => s.id && !s.dot && (!on || s.id === on)).map(s => cmdsToD(s.cmds)).join('')} />
    </svg>
  );
}

/** The margin round a letter's miniature, as a share of its larger side, so the dots on its ends fit. */
const THUMB_PAD = 0.16;
/** A dot on an end, corner or join, as a share of that margin: all of them dotted, or the one picked. */
const DOT = { all: 0.7, one: 0.95 };

/** A letter's miniature view box, [x, y, width, height] (y down), with the margin `pad` round it. */
function thumbBox(g: Glyph) {
  const b = cmdsBox(g.cmds);
  if (!b) return null;
  const pad = Math.max(b.x1 - b.x0, b.y1 - b.y0) * THUMB_PAD;
  return { box: [b.x0 - pad, -b.y1 - pad, b.x1 - b.x0 + pad * 2, b.y1 - b.y0 + pad * 2], pad };
}

/** One corner's roundness beside a picture of the letter with that corner marked: where a stroke
    turns, its outside and inside one by one. */
function CornerSlider({ g, corners, corner: { id, label, v, vi: drawn, st } }: { g: Glyph; corners: CornerInfo[]; corner: CornerInfo }) {
  // the slider shows the inside's own value where it has one: set sharper than a wide outside allows, the inside is drawn rounder, but the slider stays where it was put
  const hot = useEditor(s => s.hotEnd === id), own = useEditor(s => paramOf(s, 'innerCorners')[id]), vi = drawn == null ? drawn : own ?? drawn;
  // a corner can be stepped while Steps is on, or once it has a step of its own
  const stepped = useEditor(s => st != null && (paramOf(s, 'steps') > 0 || paramOf(s, 'cornerSteps')[id] != null));
  return (
    <div className={['ctl end', hot && 'hot', stepped && vi != null && 'rows3'].filter(Boolean).join(' ')} title={label}
      onPointerEnter={() => actions.setHotEnd(id)} onPointerLeave={() => actions.setHotEnd(null)}>
      <EndThumb g={g} ends={corners} on={id} />
      {vi == null
        ? <EndRow id={id} k="corners" name="Round" label={label} value={v}
            tip="Left makes the corner sharp; right rounds the end right off" reset="Draw it as the design does" />
        : <>
            <EndRow id={id} k="corners" name="Outside" label={label} value={v}
              tip="Left makes the outside of the turn sharp; right rounds it as far as its sides let it. The inside follows, keeping the stroke even, until it has its own" reset="Draw it as the design does" />
            <EndRow id={id} k="innerCorners" name="Inside" label={label} value={vi}
              tip="Left makes the inside of the turn square; right rounds it wide, thickening the corner. Well under the outside, the stroke thins across the corner, though never to less than half" reset="Follow the outside again" />
          </>}
      {stepped && <EndRow id={id} k="cornerSteps" name="Step" label={label} value={st!}
        tip="Left leaves the corner whole; right cuts a square step out of it, up to nearly the stroke's width" reset="Follow Steps again" />}
    </div>
  );
}

/** The letter in miniature with its stroke ends (or corners, or joins) dotted, or only the one `on`; `stroke`, the id
    of a stroke to pick out too (the one a join pulls back). */
function EndThumb({ g, ends, on, stroke }: { g: Glyph; ends: { id: string; x: number; y: number }[]; on?: string; stroke?: string }) {
  const t = thumbBox(g);
  if (!t) return null;
  const r = t.pad * (on ? DOT.one : DOT.all);
  return (
    <svg className="end-thumb" viewBox={t.box.join(' ')} aria-hidden="true">
      <path d={g.d} />
      {stroke && <path className="on" d={g.strokes.filter(s => s.id === stroke).map(s => cmdsToD(s.cmds)).join('')} />}
      {ends.filter(e => !on || e.id === on).map(e => <circle key={e.id} cx={e.x} cy={-e.y} r={r} />)}
    </svg>
  );
}

/** One end's length and curl beside a picture of the letter with that end marked. */
function EndSlider({ g, ends, end: { id, label, hook } }: { g: Glyph; ends: StrokeEndInfo[]; end: StrokeEndInfo }) {
  const length = useEditor(s => endOf(s, id, hook)), curl = useEditor(s => curlOf(s, id)), hot = useEditor(s => s.hotEnd === id);
  const plain = isPlainEnd(id);
  return (
    <div className={hot ? 'ctl end hot' : 'ctl end'} title={label}
      onPointerEnter={() => actions.setHotEnd(id)} onPointerLeave={() => actions.setHotEnd(null)}>
      <EndThumb g={g} ends={ends} on={id} />
      <EndRow id={id} k="terminalEnds" name="Length" label={label} value={length}
        tip="Trim the end back, or draw it on, much further than Length goes" reset={hook ? 'Reset its length' : 'Follow Length again'} />
      <EndRow id={id} k="terminalCurls" name="Curl" label={label} value={curl}
        tip="Left straightens the end, then swirls it outward; right curls it on round, into a spiral like a swash" reset={plain ? 'Reset its curl' : 'Follow Curl again'} />
    </div>
  );
}

/** One row for any of a customized letter's own values (OwnKey): a stroke end's length or curl, a corner's outside,
    inside or step, a join's gap or a stroke's weight. Setting it points at the control it belongs to (OWN_CONTROL). */
function EndRow({ id, k, name, label, value, tip, reset }: { id: string; k: OwnKey; name: string; label: string; value: number; tip: string; reset: string }) {
  const own = useEditor(s => { const ch = letterOf(s); return !!ch && s.params.glyphs[ch]?.[k]?.[id] !== undefined; });
  const aria = `${label} ${name.toLowerCase()}`, set = (v: number) => { actions.focusControl(OWN_CONTROL[k]); actions.setEnd(id, v, k); };
  return (
    <>
      <span className="end-name" title={tip}>{name}</span>
      <Range value={value} label={aria} onInput={set} onCommit={actions.commit} onReset={() => actions.resetEnd(id, k)} />
      <NumberField value={value} label={aria} onChange={v => { set(v); actions.commit(); }} />
      <button className="end-reset" disabled={!own} aria-label={`Reset ${aria}`} title={reset} onClick={() => actions.resetEnd(id, k)}>
        <svg width="14" height="14" viewBox="0 0 14 14" aria-hidden="true"><path d="M2.5 7a4.5 4.5 0 1 0 1.3-3.2M2.5 1.8v2.4h2.4" /></svg>
      </button>
    </>
  );
}
