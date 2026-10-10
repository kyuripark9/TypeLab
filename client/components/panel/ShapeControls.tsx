/* The controls that pick a named shape: stroke ends, the a, the letter forms, the serifs (their shape, tips, base, sides and inside ones) and the fill. */
import {
  BOWL_SUBS, CONTROLS, DOT_SUBS, FILL_OPTIONS, FILL_SUBS, FORM_OPTIONS, SERIF_BASE_OPTIONS, SERIF_BASE_SUBS, SERIF_DETAILS, SERIF_INNER_OPTIONS,
  SERIF_INNER_SUBS, SERIF_SHAPE_OPTIONS, SERIF_SIDE_OPTIONS, SERIF_SIZES, SERIF_SUBS, SERIF_TIP_DETAILS, SERIF_TIP_OPTIONS, SERIF_TIP_SUBS,
  STORY_OPTIONS, TERMINAL_DETAILS, TERMINAL_FORM_LABELS, TERMINAL_OPTIONS, TERMINAL_SUBS, controlFor, type FillSubKey, type FormKey,
  type SerifInnerSubKey
} from '../../../shared/content';
import { TERMINAL_FORMS, formOf } from '../../../shared/params';
import { scriptForms } from '../../../shared/engine';
import { actions, useEditor, useParam, useScopedFont } from '../../state/editor';
import { FillIcon, FormIcon, SerifIcon, SerifSidesIcon, StoryIcon, TerminalIcon } from '../Diagram';
import { CtlHead, FoldHead, Fold, Quiet, useControlFocus } from './heads';
import { useReachNote } from './reach';
import { SliderControl } from './SliderControl';
import { EachEnd } from './LetterOwn';

export function TerminalControl({ parts }: { parts?: string[] }) {
  const terminal = useParam('terminal'), form = formOf(terminal, useParam('terminalForm')), run = useParam('terminalRun'), active = useEditor(s => controlFor(s.active) === 'terminal');
  const c = CONTROLS.terminal, forms = TERMINAL_FORMS[terminal], kindLabel = TERMINAL_OPTIONS.find(([id]) => id === terminal)![1];
  const reach = useReachNote('terminal');
  return (
    <div className={['ctl', active && 'active', reach.idle && 'idle'].filter(Boolean).join(' ')} data-ctl="terminal" {...useControlFocus('terminal')}>
      <FoldHead k="terminal" label={c.label} parts={parts} summary={`${kindLabel} · ${TERMINAL_FORM_LABELS[form]}${run === 'straight' ? ' · Straight' : ''}`} />
      {reach.note}
      <Fold k="terminal" quiet={reach.quiet}>
        <div className="opts six" role="radiogroup" aria-label={c.tech}>
          {TERMINAL_OPTIONS.map(([id, label]) => (
            <button key={id} role="radio" aria-checked={terminal === id} className={terminal === id ? 'opt on' : 'opt'}
              onClick={() => actions.setOption('terminal', id)}>
              <TerminalIcon kind={id} /><span>{label}</span>
            </button>
          ))}
        </div>
        <div className="sub-label">{kindLabel} shape</div>
        <div className={forms.length === 3 ? 'opts three' : 'opts two'} role="radiogroup" aria-label={`${kindLabel} shape`}>
          {forms.map(id => (
            <button key={id} role="radio" aria-checked={form === id} className={form === id ? 'opt on' : 'opt'}
              onClick={() => actions.setOption('terminalForm', id)}>
              <TerminalIcon kind={terminal} form={id} /><span>{TERMINAL_FORM_LABELS[id]}</span>
            </button>
          ))}
        </div>
        {TERMINAL_DETAILS[form].map(k => <SliderControl key={k} k={k} def={TERMINAL_SUBS[k]} />)}
        <div className="sub-label">Direction</div>
        <FormOptions k="terminalRun" label="Direction of curved stroke ends" />
        <SliderControl k="terminalLength" def={TERMINAL_SUBS.terminalLength} />
        <SliderControl k="terminalCurl" def={TERMINAL_SUBS.terminalCurl} />
        <EachEnd />
      </Fold>
    </div>
  );
}

/** Double or single storey. Left on auto, the form the other settings picked shows as chosen. */
export function StoryControl({ parts }: { parts?: string[] }) {
  const single = useScopedFont().eff.singleStory, active = useEditor(s => s.active === 'story');
  const c = CONTROLS.story, current = single ? 'single' : 'double', reach = useReachNote('story');
  return (
    <div className={['ctl', active && 'active', reach.idle && 'idle'].filter(Boolean).join(' ')} data-ctl="story" {...useControlFocus('story')}>
      <CtlHead k="story" label={c.label} parts={parts} />
      {reach.note}
      <div className="opts two" role="radiogroup" aria-label={c.tech}>
        {STORY_OPTIONS.map(([id, label]) => (
          <button key={id} role="radio" aria-checked={current === id} className={current === id ? 'opt on' : 'opt'}
            onClick={() => actions.setOption('story', id)}>
            <StoryIcon story={id} /><span>{label}</span>
          </button>
        ))}
      </div>
      <div className="sub-label">Foot</div>
      <FormOptions k="aForm" label="Foot of the a" />
    </div>
  );
}

export type LetterFormKey = Exclude<FormKey, 'terminalRun' | 'aForm'>;

/** A pick between named shapes of a letter or part, each drawn by the engine. Left on auto, the
    shape the other settings give shows as chosen. */
export function FormControl({ k, parts }: { k: LetterFormKey; parts?: string[] }) {
  const active = useEditor(s => controlFor(s.active) === k), c = CONTROLS[k], box = useParam('bowlForm') === 'box', reach = useReachNote(k);
  return (
    <div className={['ctl', active && 'active', reach.idle && 'idle'].filter(Boolean).join(' ')} data-ctl={k} {...useControlFocus(k)}>
      <CtlHead k={k} label={c.label} parts={parts} />
      {reach.note}
      <FormOptions k={k} label={c.tech} />
      <Quiet.Provider value={reach.quiet}>
        {k === 'dots' && <SliderControl k="dotSize" def={DOT_SUBS.dotSize} />}
        {k === 'bowlForm' && box && <SliderControl k="boxRound" def={BOWL_SUBS.boxRound} />}
      </Quiet.Provider>
    </div>
  );
}

/** The named shapes of `k` as a row of pictured options. */
function FormOptions({ k, label }: { k: FormKey; label: string }) {
  const value = useParam(k), font = useScopedFont(), { options } = FORM_OPTIONS[k];
  const current = value !== 'auto' ? value : k === 'dots' ? (font.m.dotRound >= 0.5 ? 'round' : 'square') : k === 'scriptForm' ? (scriptForms(font.eff) ? 'script' : 'print')
    : font.eff.mono >= 0.5 && !font.eff.serif ? 'bars' : 'plain';
  return (
    <div className={options.length === 3 ? 'opts three' : 'opts two'} role="radiogroup" aria-label={label}>
      {options.map(([id, name]) => (
        <button key={id} role="radio" aria-checked={current === id} className={current === id ? 'opt on' : 'opt'}
          onClick={() => actions.setOption(k, id as never)}>
          <FormIcon k={k} id={id} /><span>{name}</span>
        </button>
      ))}
    </div>
  );
}

export function SerifControl({ parts }: { parts?: string[] }) {
  const p = { serif: useParam('serif'), serifShape: useParam('serifShape') }, active = useEditor(s => controlFor(s.active) === 'serif');
  // the shapes say when they change nothing in view, as for a free font's letters, whose serifs Length still moves
  const c = CONTROLS.serif, reach = useReachNote('serif'), shapes = useReachNote('serifShape');
  return (
    <div className={['ctl', active && 'active', reach.idle && 'idle'].filter(Boolean).join(' ')} data-ctl="serif" {...useControlFocus('serif')}>
      <FoldHead k="serif" label={c.label} parts={parts} shut={!p.serif} summary={SERIF_SHAPE_OPTIONS.find(([id]) => id === p.serifShape)?.[1] ?? ''}
        tools={<button className={p.serif ? 'switch on' : 'switch'} role="switch" aria-checked={p.serif} aria-label="Serifs"
          onClick={() => actions.setOption('serif', !p.serif)}><i /></button>} />
      {reach.note}
      <Fold k="serif" shut={!p.serif} quiet={reach.quiet}>
        <div className={shapes.idle ? 'serif-shapes idle' : 'serif-shapes'}>
          <div className="sub-label">Serif shape</div>
          {shapes.note}
          <div className="opts four" role="radiogroup" aria-label="Serif shape">
            {SERIF_SHAPE_OPTIONS.map(([id, label]) => (
              <button key={id} role="radio" aria-checked={p.serifShape === id} className={p.serifShape === id ? 'opt on' : 'opt'}
                onClick={() => actions.setOption('serifShape', id)}>
                <SerifIcon shape={id} /><span>{label}</span>
              </button>
            ))}
          </div>
        </div>
        {[...SERIF_SIZES, ...SERIF_DETAILS[p.serifShape]].map(k => <SliderControl key={k} k={k} def={SERIF_SUBS[k]} />)}
      </Fold>
    </div>
  );
}

export type SerifFormKey = 'serifTip' | 'serifBase' | 'serifSides' | 'serifInner';
/** A finer choice on the Serifs page, the tips, the base, the sides the serifs reach to or the shape of the ones
    inside the letter: each option drawn on a serif of the design's own shape, then the sliders of the picked one. */
export function SerifFormControl({ k }: { k: SerifFormKey }) {
  const shape = useParam('serifShape'), tip = useParam('serifTip'), base = useParam('serifBase'), sides = useParam('serifSides'), inner = useParam('serifInner');
  const active = useEditor(s => controlFor(s.active) === k), c = CONTROLS[k], reach = useReachNote(k);
  return (
    <div className={['ctl', active && 'active', reach.idle && 'idle'].filter(Boolean).join(' ')} data-ctl={k} {...useControlFocus(k)}>
      <CtlHead k={k} label={c.label} />
      {reach.note}
      <Quiet.Provider value={reach.quiet}>
        {k === 'serifTip' ? (
          <>
            <div className="opts four" role="radiogroup" aria-label={c.tech}>
              {SERIF_TIP_OPTIONS.map(([id, label]) => (
                <button key={id} role="radio" aria-checked={tip === id} className={tip === id ? 'opt on' : 'opt'} onClick={() => actions.setOption('serifTip', id)}>
                  <SerifIcon shape={shape} tip={id} view="tip" /><span>{label}</span>
                </button>
              ))}
            </div>
            {SERIF_TIP_DETAILS[tip].map(s => <SliderControl key={s} k={s} def={SERIF_TIP_SUBS[s]} />)}
          </>
        ) : k === 'serifSides' ? (
          <div className="opts five" role="radiogroup" aria-label={c.tech}>
            {SERIF_SIDE_OPTIONS.map(([id, label]) => (
              <button key={id} role="radio" aria-checked={sides === id} className={sides === id ? 'opt on' : 'opt'} onClick={() => actions.setOption('serifSides', id)}>
                <SerifSidesIcon shape={shape} sides={id} /><span>{label}</span>
              </button>
            ))}
          </div>
        ) : k === 'serifInner' ? (
          <>
            <div className="opts three" role="radiogroup" aria-label={c.tech}>
              {SERIF_INNER_OPTIONS.map(([id, label]) => (
                <button key={id} role="radio" aria-checked={inner === id} className={inner === id ? 'opt on' : 'opt'} onClick={() => actions.setOption('serifInner', id)}>
                  <SerifSidesIcon shape={shape} sides={sides === 'outside' ? 'both' : sides} inner={id} large /><span>{label}</span>
                </button>
              ))}
            </div>
            {(Object.keys(SERIF_INNER_SUBS) as SerifInnerSubKey[]).map(s => <SliderControl key={s} k={s} def={SERIF_INNER_SUBS[s]} />)}
          </>
        ) : (
          <>
            <div className="opts two" role="radiogroup" aria-label={c.tech}>
              {SERIF_BASE_OPTIONS.map(([id, label]) => (
                <button key={id} role="radio" aria-checked={base === id} className={base === id ? 'opt on' : 'opt'} onClick={() => actions.setOption('serifBase', id)}>
                  <SerifIcon shape={shape} tip={tip} cupped={id === 'cupped'} view="base" /><span>{label}</span>
                </button>
              ))}
            </div>
            {base === 'cupped' && <SliderControl k="serifCup" def={SERIF_BASE_SUBS.serifCup} />}
          </>
        )}
      </Quiet.Provider>
    </div>
  );
}

export function FillControl() {
  const fill = useEditor(s => s.params.fill), active = useEditor(s => controlFor(s.active) === 'fill');
  const c = CONTROLS.fill, solid = fill === 'solid';
  return (
    <div className={active ? 'ctl active' : 'ctl'} data-ctl="fill" {...useControlFocus('fill')}>
      <FoldHead k="fill" label={c.label} summary={FILL_OPTIONS.find(([id]) => id === fill)![1]} />
      <Fold k="fill">
        <div className="opts four" role="radiogroup" aria-label={c.tech}>
          {FILL_OPTIONS.map(([id, label]) => (
            <button key={id} role="radio" aria-checked={fill === id} className={fill === id ? 'opt on' : 'opt'}
              onClick={() => actions.setOption('fill', id)}>
              <FillIcon fill={id} /><span>{label}</span>
            </button>
          ))}
        </div>
        <div className={solid ? 'reveal' : 'reveal open'} inert={solid}>
          <div>
            {(Object.keys(FILL_SUBS) as FillSubKey[]).map(k => <SliderControl key={k} k={k} def={FILL_SUBS[k]} />)}
          </div>
        </div>
      </Fold>
    </div>
  );
}
