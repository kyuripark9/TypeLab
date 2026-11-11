/* The controls that pick a named shape: stroke ends, the a, the letter forms, the serifs (their shape, tips, base, sides and inside ones) and the fill. */
import {
  BOWL_SUBS, CONTROLS, DOT_SUBS, FILL_OPTIONS, FILL_SUBS, FORM_OPTIONS, SERIF_BASE_OPTIONS, SERIF_BASE_SUBS, SERIF_INNER_OPTIONS,
  SERIF_INNER_SUBS, SERIF_SIDE_OPTIONS, SERIF_TIP_DETAILS, SERIF_TIP_OPTIONS, SERIF_TIP_SUBS,
  STORY_OPTIONS, TERMINAL_DETAILS, TERMINAL_SHAPES, TERMINAL_SUBS, choicesOff, controlFor, subInUse, terminalLabel, type FillSubKey, type FormKey,
  type SerifInnerSubKey
} from '../../../shared/content';
import { GRID_FILLS, formOf, type Terminal, type TerminalForm } from '../../../shared/params';
import { autoIBars } from '../../../shared/engine';
import { actions, useEditor, useHere, useParam, useScopedFont } from '../../state/editor';
import { FillIcon, FormIcon, SerifIcon, SerifSidesIcon, StoryIcon, TerminalIcon } from '../Diagram';
import { CtlHead, FoldHead, Fold, Quiet, useControlFocus } from './heads';
import { useReachNote } from './reach';
import { SliderControl } from './SliderControl';
import { EachEnd } from './LetterOwn';

/** Picks a stroke end's kind and its form together, as one change to undo. */
const pickEnd = (t: Terminal, form: TerminalForm) => { actions.setParam('terminal', t); actions.setParam('terminalForm', form); actions.commit(); };

/** Stroke ends: every shape in one list, in its families, then the sliders that fine-tune the shape picked. */
export function TerminalControl({ parts }: { parts?: string[] }) {
  const terminal = useParam('terminal'), form = formOf(terminal, useParam('terminalForm')), run = useParam('terminalRun'), active = useEditor(s => controlFor(s.active) === 'terminal');
  const c = CONTROLS.terminal;
  const reach = useReachNote('terminal');
  // (the shapes that break this design's letters left out, choicesOff; a family left with none goes)
  const here = useHere(), off = choicesOff(here, 'terminal'), runsOff = choicesOff(here, 'terminalRun');
  const groups = TERMINAL_SHAPES.map(g => ({ ...g, shapes: g.shapes.filter(sh => !off.has(`${sh.terminal}/${sh.form}`)) })).filter(g => g.shapes.length);
  return (
    <div className={['ctl', active && 'active', reach.idle && 'idle'].filter(Boolean).join(' ')} data-ctl="terminal" {...useControlFocus('terminal')}>
      <FoldHead k="terminal" label={c.label} parts={parts} summary={`${terminalLabel(terminal, form)}${run === 'straight' ? ' · Runs straight' : ''}`} />
      {reach.note}
      <Fold k="terminal" quiet={reach.quiet}>
        <div role="radiogroup" aria-label={c.tech}>
          {groups.map(g => (
            <div key={g.label} role="group" aria-label={g.label}>
              <div className="sub-label">{g.label}</div>
              <div className="opts three">
                {g.shapes.map(sh => {
                  const on = terminal === sh.terminal && form === sh.form;
                  return (
                    <button key={sh.form} role="radio" aria-checked={on} className={on ? 'opt on' : 'opt'} onClick={() => pickEnd(sh.terminal, sh.form)}>
                      <TerminalIcon kind={sh.terminal} form={sh.form} /><span>{sh.label}</span>
                    </button>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
        {/* (less those a font's letters leave out, subInUse: a round end's Roundness cut the Chunky Round's c short) */}
        {TERMINAL_DETAILS[form].filter(k => subInUse(k, here)).map(k => <SliderControl key={k} k={k} def={TERMINAL_SUBS[k]} />)}
        {/* (one direction left, the other off on the card's letters, there is nothing to pick: the label goes with it) */}
        {FORM_OPTIONS.terminalRun.options.filter(([id]) => !runsOff.has(id)).length > 1 && <>
          <div className="sub-label">Direction</div>
          <FormOptions k="terminalRun" label="Direction of curved stroke ends" />
        </>}
        <SliderControl k="terminalLength" def={TERMINAL_SUBS.terminalLength} />
        <SliderControl k="terminalCurl" def={TERMINAL_SUBS.terminalCurl} />
        <EachEnd />
      </Fold>
    </div>
  );
}

/** Double or single storey. Left on auto, the form the other settings picked shows as chosen; grid letters draw a
    double-storey a until single is picked, and have no foot to choose. */
export function StoryControl({ parts }: { parts?: string[] }) {
  const font = useScopedFont(), grid = font.eff.build === 'blocks' && font.eff.blockForm === 'grid', active = useEditor(s => s.active === 'story');
  const single = grid ? font.eff.story === 'single' : font.eff.singleStory;
  const c = CONTROLS.story, current = single ? 'single' : 'double', reach = useReachNote('story'), off = choicesOff(useHere(), 'story');
  return (
    <div className={['ctl', active && 'active', reach.idle && 'idle'].filter(Boolean).join(' ')} data-ctl="story" {...useControlFocus('story')}>
      <CtlHead k="story" label={c.label} parts={parts} />
      {reach.note}
      {/* (one storey left, the other breaking the card's letters, there is nothing to pick: only the Foot shows) */}
      {STORY_OPTIONS.filter(([id]) => !off.has(id)).length > 1 && <div className="opts two" role="radiogroup" aria-label={c.tech}>
        {STORY_OPTIONS.filter(([id]) => !off.has(id)).map(([id, label]) => (
          <button key={id} role="radio" aria-checked={current === id} className={current === id ? 'opt on' : 'opt'}
            onClick={() => actions.setOption('story', id)}>
            <StoryIcon story={id} grid={grid} /><span>{label}</span>
          </button>
        ))}
      </div>}
      {!grid && <>
        <div className="sub-label">Foot</div>
        <FormOptions k="aForm" label="Foot of the a" />
      </>}
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
  const value = useParam(k), font = useScopedFont(), off = choicesOff(useHere(), k), options = FORM_OPTIONS[k].options.filter(([id]) => !off.has(id));
  // letters built from slot or grid blocks are pictured in their own blocks
  const build = useParam('build'), blockForm = useParam('blockForm'), blocks = build === 'blocks' && blockForm !== 'basic' ? blockForm : undefined;
  // the option 'auto' stands for, as the engine picks it
  // (slot and grid blocks draw their own shapes on auto, neither option's, so none shows as picked; but the slot
  // blocks' I on auto is their plain one)
  const current = value !== 'auto' ? value : blocks ? (blocks === 'slots' && k === 'iForm' ? 'plain' : value) : k === 'dots' ? (font.m.dotRound >= 0.5 ? 'round' : 'square')
    : k === 'iForm' ? (autoIBars(font.eff) ? 'bars' : 'plain') : value;
  return (
    <div className={options.length === 3 ? 'opts three' : 'opts two'} role="radiogroup" aria-label={label}>
      {options.map(([id, name]) => (
        <button key={id} role="radio" aria-checked={current === id} className={current === id ? 'opt on' : 'opt'}
          onClick={() => actions.setOption(k, id as never)}>
          <FormIcon k={k} id={id} blocks={blocks} /><span>{name}</span>
        </button>
      ))}
    </div>
  );
}

/** The Serifs switch. The serifs keep the design's own shape: the shape picker, with Length, Thickness, Angle and
    Bracket, is off the panel, as on a card with serifs of its own, or a script's, another shape broke its letters and a
    step off its own size broke its serifs (npm run breaks; params/spec.ts). */
export function SerifControl({ parts }: { parts?: string[] }) {
  const on = useParam('serif'), active = useEditor(s => controlFor(s.active) === 'serif');
  const c = CONTROLS.serif, reach = useReachNote('serif');
  return (
    <div className={['ctl', active && 'active', reach.idle && 'idle'].filter(Boolean).join(' ')} data-ctl="serif" {...useControlFocus('serif')}>
      <div className="ctl-top">
        <CtlHead k="serif" label={c.label} parts={parts} />
        <div className="ctl-tools">
          <button className={on ? 'switch on' : 'switch'} role="switch" aria-checked={on} aria-label="Serifs"
            onClick={() => actions.setOption('serif', !on)}><i /></button>
        </div>
      </div>
      {reach.note}
    </div>
  );
}

export type SerifFormKey = 'serifTip' | 'serifBase' | 'serifSides' | 'serifInner';
/** A finer choice on the Serifs page, the tips, the base, the sides the serifs reach to or the shape of the ones
    inside the letter: each option drawn on a serif of the design's own shape, then the sliders of the picked one. */
export function SerifFormControl({ k }: { k: SerifFormKey }) {
  const shape = useParam('serifShape'), tip = useParam('serifTip'), base = useParam('serifBase'), sides = useParam('serifSides'), inner = useParam('serifInner');
  const active = useEditor(s => controlFor(s.active) === k), c = CONTROLS[k], reach = useReachNote(k);
  // (the choices that break this design's letters left out, choicesOff: a card's own serifs gave way to the engine's;
  // and the sliders letters drawn from a font leave out, subInUse)
  const here = useHere(), off = choicesOff(here, k), keep = ([id]: readonly [string, string]) => !off.has(id);
  const shown = (s: string) => subInUse(s, here);
  return (
    <div className={['ctl', active && 'active', reach.idle && 'idle'].filter(Boolean).join(' ')} data-ctl={k} {...useControlFocus(k)}>
      <CtlHead k={k} label={c.label} />
      {reach.note}
      <Quiet.Provider value={reach.quiet}>
        {k === 'serifTip' ? (
          <>
            <div className="opts four" role="radiogroup" aria-label={c.tech}>
              {SERIF_TIP_OPTIONS.filter(keep).map(([id, label]) => (
                <button key={id} role="radio" aria-checked={tip === id} className={tip === id ? 'opt on' : 'opt'} onClick={() => actions.setOption('serifTip', id)}>
                  <SerifIcon shape={shape} tip={id} view="tip" /><span>{label}</span>
                </button>
              ))}
            </div>
            {SERIF_TIP_DETAILS[tip].filter(shown).map(s => <SliderControl key={s} k={s} def={SERIF_TIP_SUBS[s]} />)}
          </>
        ) : k === 'serifSides' ? (
          <div className="opts five" role="radiogroup" aria-label={c.tech}>
            {SERIF_SIDE_OPTIONS.filter(keep).map(([id, label]) => (
              <button key={id} role="radio" aria-checked={sides === id} className={sides === id ? 'opt on' : 'opt'} onClick={() => actions.setOption('serifSides', id)}>
                <SerifSidesIcon shape={shape} sides={id} /><span>{label}</span>
              </button>
            ))}
          </div>
        ) : k === 'serifInner' ? (
          <>
            <div className="opts three" role="radiogroup" aria-label={c.tech}>
              {SERIF_INNER_OPTIONS.filter(keep).map(([id, label]) => (
                <button key={id} role="radio" aria-checked={inner === id} className={inner === id ? 'opt on' : 'opt'} onClick={() => actions.setOption('serifInner', id)}>
                  <SerifSidesIcon shape={shape} sides={sides === 'outside' ? 'both' : sides} inner={id} large /><span>{label}</span>
                </button>
              ))}
            </div>
            {(Object.keys(SERIF_INNER_SUBS) as SerifInnerSubKey[]).filter(shown).map(s => <SliderControl key={s} k={s} def={SERIF_INNER_SUBS[s]} />)}
          </>
        ) : (
          <>
            <div className="opts two" role="radiogroup" aria-label={c.tech}>
              {SERIF_BASE_OPTIONS.filter(keep).map(([id, label]) => (
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
            {/* (Spread only where the fill is drawn on a grid of cells) */}
            {(Object.keys(FILL_SUBS) as FillSubKey[]).filter(k => k !== 'dotGain' || GRID_FILLS.includes(fill))
              .map(k => <SliderControl key={k} k={k} def={FILL_SUBS[k]} />)}
          </div>
        </div>
      </Fold>
    </div>
  );
}
