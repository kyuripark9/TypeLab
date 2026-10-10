/* Sliders: a setting's slider with its number box, the crossbars' Gap and where it opens, and the Stencil and Slice cuts. */
import type { ReactNode } from 'react';
import { BAR_END_OPTIONS, CROSSBAR_SUBS, CONTROLS, SLICE_SUBS, STENCIL_SUBS, controlFor, type ActiveKey } from '../../../shared/content';
import type { NumericParam } from '../../../shared/params';
import { actions, isOn, useEditor, useParam } from '../../state/editor';
import { BarEndsIcon } from '../Diagram';
import { CtlHead, Quiet, useControlFocus } from './heads';
import { useReachNote } from './reach';
import { EachJoin } from './LetterOwn';
import { NumberField, Range } from './inputs';

interface SliderDef { label: string; tech: string; lo?: string; hi?: string; bipolar?: boolean; degrees?: boolean; advanced?: boolean; off?: number }

/** A slider. An optional one (with an `off` value) has a switch; switched off, its slider folds away.
    `children` follow the slider inside its control, like the corners under Roundness. `holdsOn`
    marks the amount of a control switched on above it (a stencil's thickness): using it keeps that open.
    `icon` names its drawing when that isn't `k`'s own (Stencil's Thickness shares the key `stencil`). */
export function SliderControl({ k, def, parts, children, holdsOn, icon = k }: { k: NumericParam & ActiveKey; def: SliderDef; parts?: string[]; children?: ReactNode; holdsOn?: boolean; icon?: string }) {
  const value = useParam(k), active = useEditor(s => s.active === k);
  const optional = def.off !== undefined, on = useEditor(s => !optional || isOn(s, k, def.off!));
  // using the slider keeps it open, even dragged all the way to its off value
  const keep = () => { if (optional || holdsOn) actions.keepOn(k); };
  const reach = useReachNote(k);
  const cls = ['ctl', def.bipolar && 'bipolar', active && 'active', !on && 'off', reach.idle && 'idle'].filter(Boolean).join(' ');
  const nested = children && <Quiet.Provider value={reach.quiet}>{children}</Quiet.Provider>;
  return (
    <div className={cls} data-ctl={k} {...useControlFocus(k)}>
      <div className="ctl-top">
        <CtlHead k={k} label={def.label} parts={parts} advanced={def.advanced} icon={icon} />
        <div className="ctl-tools">
          {on && <NumberField value={value} label={def.tech} degrees={def.degrees} onChange={v => { keep(); actions.focusControl(k); actions.setParam(k, v); actions.commit(); }} />}
          {optional && (
            <button className={on ? 'switch on' : 'switch'} role="switch" aria-checked={on} aria-label={def.label}
              onClick={() => { actions.focusControl(k); actions.switchControl(k, !on, def.off!); }}><i /></button>
          )}
        </div>
      </div>
      {reach.note}
      <div className={on ? 'reveal open' : 'reveal'} inert={!on}>
        <div>
          {/* its label is the setting's `tech`, which tools/browser/drag-bench.mjs finds the slider by */}
          <Range
            value={value}
            label={def.tech}
            steps={def.degrees ? 360 : 100}
            onInput={v => {
              // the middle is sticky: near 50 snaps onto the dot; a turn snaps onto the quarter turns
              const q = Math.round(v * 4) / 4;
              if (def.degrees ? Math.abs(v - q) * 360 <= 3 : Math.abs(v - 0.5) <= 0.03) v = def.degrees ? q : 0.5;
              keep();
              actions.focusControl(k);
              actions.setParam(k, v);
            }}
            onCommit={actions.commit}
            onReset={() => { keep(); actions.resetParam(k); }}
          />
          <div className="ctl-ends"><span>{def.lo}</span><span>{def.hi}</span></div>
          {optional && nested}
        </div>
      </div>
      {!optional && nested}
    </div>
  );
}

/** The crossbars' Gap and where it opens: at the bar's ends, or above and below it with the bar run
    through the strokes it meets. Picking a way while the bars are joined opens a gap to show it. */
export function BarEndsControl() {
  const ends = useParam('barEnds'), gap = useParam('barGap');
  return (
    <>
      <div className="sub-label">Ends</div>
      <div className="opts two" role="radiogroup" aria-label="Crossbar gap">
        {BAR_END_OPTIONS.map(([id, label]) => (
          <button key={id} role="radio" aria-checked={ends === id} className={ends === id ? 'opt on' : 'opt'}
            onClick={() => { actions.focusControl('barGap'); actions.setParam('barEnds', id); if (!gap) actions.setParam('barGap', 0.4); actions.commit(); }}>
            <BarEndsIcon ends={id} /><span>{label}</span>
          </button>
        ))}
      </div>
      <SliderControl k="barGap" def={CROSSBAR_SUBS.barGap} />
    </>
  );
}

/** Stencil and Slice: a switch, then how thick the cut is, where it runs and how round its corners are. */
export function CutControl({ k, parts }: { k: 'stencil' | 'slice'; parts?: string[] }) {
  const c = CONTROLS[k], subs = k === 'stencil' ? STENCIL_SUBS : SLICE_SUBS;
  const on = useEditor(s => isOn(s, k, c.off!)), active = useEditor(s => controlFor(s.active) === k), reach = useReachNote(k);
  const cls = ['ctl', active && 'active', !on && 'off', reach.idle && 'idle'].filter(Boolean).join(' ');
  return (
    <div className={cls} data-ctl={k} {...useControlFocus(k)}>
      <div className="ctl-top">
        <CtlHead k={k} label={c.label} parts={parts} icon={k} />
        <div className="ctl-tools">
          <button className={on ? 'switch on' : 'switch'} role="switch" aria-checked={on} aria-label={c.label}
            onClick={() => { actions.focusControl(k); actions.switchControl(k, !on, c.off!); }}><i /></button>
        </div>
      </div>
      {reach.note}
      <div className={on ? 'reveal open' : 'reveal'} inert={!on}>
        <div>
          <Quiet.Provider value={reach.quiet}>
            {(Object.keys(subs) as (keyof typeof subs)[]).map(s => <SliderControl key={s} k={s} def={subs[s]} holdsOn={s === k} icon={s === k ? `${k}Gap` : s} />)}
          </Quiet.Provider>
        </div>
      </div>
      {k === 'stencil' && <EachJoin />}
    </div>
  );
}
