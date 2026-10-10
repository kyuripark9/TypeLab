/* What frames every control: its title and scope tag, the folds that open its finer settings, the explainer, and focus on a control found by name. */
import { createContext, type FocusEvent, type PointerEvent, type ReactNode } from 'react';
import { ANATOMY, CONTROLS, PART_CONTROL, SUBS, controlFor, type ActiveKey } from '../../../shared/content';
import { isGlyphKey, type Params } from '../../../shared/params';
import { actions, letterOf, useEditor, useFont } from '../../state/editor';
import { Diagram } from '../Diagram';
import { SliderIcon } from '../SliderIcons';

/** A control's short title. While a letter is inspected, the parts it shapes follow in grey and each one can be pointed at. */
export function CtlHead({ k, label, parts, advanced, icon }: { k: keyof Params; label: string; parts?: string[]; advanced?: boolean; icon?: string }) {
  const part = useEditor(s => s.part);
  const inspect = useEditor(s => s.inspect), letter = useEditor(letterOf);
  const own = useEditor(s => !!s.inspect && isGlyphKey(k) && s.params.glyphs[s.inspect]?.[k] !== undefined);
  const tag = scopeTag(inspect, letter, own, k);
  return (
    <div className="ctl-head">
      <span className="ctl-label">{icon && <SliderIcon k={icon} />}{label}{advanced && <em>Advanced</em>}{tag && <em className={tag.own ? 'own' : undefined} title={tag.title}>{tag.text}</em>}</span>
      {!!parts?.length && (
        <span className="ctl-parts">
          {parts.map(p => (
            <span key={p} className={p === part ? 'part on' : 'part'}
              onPointerEnter={() => actions.setPart(p)} onPointerLeave={() => actions.setPart(null)}>{ANATOMY[p][0]}</span>
          ))}
        </span>
      )}
    </div>
  );
}
/** While a letter is inspected: whether it has its own value of `k`, and while edits go to that
    letter, which controls still change every letter. */
function scopeTag(inspect: string | null, letter: string | null, own: boolean, k: keyof Params) {
  if (!inspect) return null;
  if (own) {
    return { own: true, text: 'Custom', title: letter ? `Only ${inspect} has this value. Double-click the slider to sync it with the other letters.` : `${inspect} keeps its own value when this changes` };
  }
  return letter && !isGlyphKey(k) ? { own: false, text: 'Whole font', title: `Every letter shares this setting, so it changes all of them even while customizing ${letter}` } : null;
}

/** The long controls, whose settings fold away under their heading. */
type FoldKey = 'terminal' | 'serif' | 'fill';

/** A long control's heading: its title, then a chevron that folds the rest of it away. Folded, it
    names the current choice. `tools` sit before the chevron (the serif switch); while `shut` (serifs
    switched off) there is nothing to fold, so the chevron hides. */
export function FoldHead({ k, label, parts, summary, tools, shut }: { k: FoldKey; label: string; parts?: string[]; summary: string; tools?: ReactNode; shut?: boolean }) {
  const folded = useEditor(s => s.folded.includes(k));
  return (
    <div className="ctl-top fold-head">
      <CtlHead k={k} label={label} parts={parts} />
      <div className="ctl-tools">
        {folded && !shut && <span className="fold-sum">{summary}</span>}
        {tools}
        <button className="fold-btn" disabled={shut} aria-expanded={!folded && !shut} aria-controls={`fold-${k}`}
          aria-label={`${folded ? 'Show' : 'Hide'} ${label.toLowerCase()} settings`} title={folded ? 'Show settings' : 'Hide settings'}
          onClick={() => actions.toggleFold(k)}>
          <svg className="facet-chevron" width="12" height="12" viewBox="0 0 12 12" aria-hidden="true"><path d="M2.5 7.5 6 4l3.5 3.5" /></svg>
        </button>
      </div>
    </div>
  );
}

/** The body under a FoldHead, open unless folded or `shut`; `quiet` while its control changes nothing in view. */
export function Fold({ k, shut, quiet = false, children }: { k: FoldKey; shut?: boolean; quiet?: boolean; children: ReactNode }) {
  const open = !useEditor(s => s.folded.includes(k)) && !shut;
  return (
    <div className={open ? 'reveal fold open' : 'reveal fold'} id={`fold-${k}`} inert={!open}>
      <div><div className="fold-body"><Quiet.Provider value={quiet}>{children}</Quiet.Provider></div></div>
    </div>
  );
}

export function Explainer() {
  const active = useEditor(s => s.active), inspecting = useEditor(s => !!s.inspect), font = useFont();
  const part = useEditor(s => s.inspect ? s.part : null), tips = useEditor(s => s.tips);
  // a free font's letters have no parts for a diagram to point at, so the diagram drawn with them goes
  const free = useEditor(s => !!s.params.freeFont);
  const c = CONTROLS[controlFor(active)], sub = SUBS[active as keyof typeof SUBS];
  const shapedBy = part && PART_CONTROL[part];
  // two levels only, a title and its explanation; a part says which setting shapes it in the explanation
  const [title, text] = part
    ? [ANATOMY[part][0], `${ANATOMY[part][1]}${shapedBy ? ` Shaped by ${CONTROLS[shapedBy].label}.` : ''}`]
    : [(sub ?? c).friendly, c.explain];
  // while inspecting, the large letter on the stage already shows the part, so drop the diagram
  return (
    <div className={inspecting ? 'explainer compact' : 'explainer'}>
      {!inspecting && !free && <div className="diagram-box"><Diagram font={font} k={active} /></div>}
      {/* closed, the explanation shows only its title; the title opens it */}
      <div className={tips ? 'ex-text open' : 'ex-text'}>
        <button className="ex-head" onClick={() => actions.setTips(!tips)} aria-expanded={tips} aria-controls="ex-body"
          title={tips ? 'Hide explanation' : 'Show explanation'}>
          <span className="ex-title">{title}</span>
          <svg className="facet-chevron" width="12" height="12" viewBox="0 0 12 12" aria-hidden="true"><path d="M2.5 7.5 6 4l3.5 3.5" /></svg>
        </button>
        {tips && <p id="ex-body">{text}</p>}
      </div>
    </div>
  );
}

/** Pointing at or focusing a control makes it the active one. Nested controls (serif
    sub-sliders) win over their parent. */
/** Also marks a control that, while a letter is customized, reshapes only that letter. */
export function useControlFocus(key: ActiveKey) {
  const own = (e: PointerEvent | FocusEvent) => (e.target as Element).closest('.ctl') === e.currentTarget;
  const letterOnly = useEditor(s => !!letterOf(s) && isGlyphKey(key));
  return {
    'data-letter': letterOnly || undefined,
    onPointerOver: (e: PointerEvent) => { if (own(e)) actions.focusControl(key); },
    onFocus: (e: FocusEvent) => { if (own(e)) actions.focusControl(key); }
  };
}

/** Set inside a control that already says it changes nothing in view, so the settings nested in it don't say so again. */
export const Quiet = createContext(false);
