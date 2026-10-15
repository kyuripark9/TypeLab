/* What frames every control: its title and scope tag, the folds that open its finer settings, the explainer at the top of
   the page, which control is active (the one pointed at or focused), and the Quiet context that stops nested settings
   repeating their parent's reach note.
   Every control's root is a `.ctl` with `data-ctl={key}`, sub-sliders included (a row of a letter's own values in
   LetterOwn.tsx is a `.ctl` without one). useControlFocus compares `closest('.ctl')`, so a nested slider wins over its
   parent; Inspector.tsx (pickPart) and Chrome.tsx (settings search) find a control by `[data-ctl]`, the search passing
   over one inside an `[inert]` fold. The explainer's root keeps the class `explainer`, which Inspector.tsx measures to
   scroll a control in just under it. */
import { createContext, useLayoutEffect, useRef, type FocusEvent, type PointerEvent, type ReactNode } from 'react';
import { ANATOMY, CATEGORIES, CONTROLS, PART_CONTROL, SUBS, controlFor, type ActiveKey, type CategoryId } from '../../../shared/content';
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

/** What a part of the letter is, and which setting shapes it: one on another page names that page, which a click on
    the part opens. */
function partText(part: string, category: CategoryId) {
  const shapedBy = PART_CONTROL[part as keyof typeof PART_CONTROL];
  const elsewhere = shapedBy && CONTROLS[shapedBy].cat !== category ? CATEGORIES.find(x => x.id === CONTROLS[shapedBy].cat) : null;
  return `${ANATOMY[part as keyof typeof ANATOMY][1]}${shapedBy ? ` Shaped by ${CONTROLS[shapedBy].label}${elsewhere ? ` on the ${elsewhere.label} page` : ''}.` : ''}`;
}

/* The explainer is as tall as the explanation it shows, so pointing at a control whose explanation takes another
   number of lines moves the controls under it. The panel scrolls by as much, keeping the control pointed at where it
   stood (`pointed`, noted as it is pointed at and read once the explanation has changed). Where the panel can't
   scroll so far the controls do move (`moved`, how far), and another one can slide under a pointer that hasn't: it
   takes over only once the pointer has gone further than that from where it pointed (`pointedY`), or the two would
   trade places for as long as the pointer stays. */
let pointed: { key: ActiveKey; el: Element; top: number } | null = null;
let moved = 0, pointedY = 0;
/** How much of a control's top, in px, the explainer may cover: its padding and border above its title (`.ctl`). */
const COVER = 11;

/** The box that scrolls the panel's controls: the panel, or on phones, where the panel runs on down the page, the page. */
function scrollerOf(el: Element): Element {
  const panel = el.closest('.panel');
  return panel && getComputedStyle(panel).overflowY !== 'visible' ? panel : document.scrollingElement ?? document.documentElement;
}

/** Makes `key` the active control as the pointer comes over it, unless the controls have just moved under a pointer
    that hasn't. */
function point(e: PointerEvent, key: ActiveKey) {
  if (moved && Math.abs(e.clientY - pointedY) <= moved) return;
  moved = 0;
  pointedY = e.clientY;
  if (useEditor.getState().active !== key) pointed = { key, el: e.currentTarget, top: e.currentTarget.getBoundingClientRect().top };
  actions.focusControl(key);
}

export function Explainer() {
  const active = useEditor(s => s.active), inspecting = useEditor(s => !!s.inspect), font = useFont();
  const part = useEditor(s => s.inspect ? s.part : null), tips = useEditor(s => s.tips), category = useEditor(s => s.category);
  // a free font's letters have no parts for a diagram to point at, so the diagram drawn with them goes
  const free = useEditor(s => !!s.params.freeFont);
  const c = CONTROLS[controlFor(active)], sub = SUBS[active as keyof typeof SUBS];
  // two levels only, a title and its explanation; a part says which setting shapes it in the explanation
  const [title, text] = part ? [ANATOMY[part][0], partText(part, category)] : [(sub ?? c).friendly, sub?.explain ?? c.explain];
  // the control just pointed at stays where it stood as the explainer takes the new explanation's height: a sticky
  // explainer stays in sight as the controls scroll under it; one that scrolls with them (a short panel) stays in
  // view and the controls move, unless it has already scrolled away. The explainer may cover a control's padding
  // above its title (COVER), but a control whose title it would cover is pushed down instead
  const root = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    const p = pointed, box = root.current;
    pointed = null;
    if (!p || !box || p.key !== active || !p.el.isConnected) return;
    const off = p.el.getBoundingClientRect().top - p.top, s = scrollerOf(p.el), edge = box.getBoundingClientRect().bottom;
    const shown = getComputedStyle(box).position === 'sticky' || edge <= (s === document.scrollingElement ? 0 : s.getBoundingClientRect().top);
    if (off && shown && p.top >= edge - COVER) s.scrollTo({ top: s.scrollTop + off, behavior: 'instant' });
    moved = Math.abs(p.el.getBoundingClientRect().top - p.top);
  }, [active, text]);
  // while inspecting, the large letter on the stage already shows the part, so drop the diagram
  return (
    <div className="explainer" ref={root}>
      {!inspecting && !free && <div className="diagram-box"><Diagram font={font} k={active} /></div>}
      {/* closed, the explanation shows only its title; the title opens it */}
      <div className="ex-text">
        <button className="ex-head" onClick={() => actions.setTips(!tips)} aria-expanded={tips} aria-controls="ex-body"
          title={tips ? 'Hide explanation' : 'Show explanation'}>
          <span className="ex-title">{title}</span>
          <svg className="facet-chevron" width="12" height="12" viewBox="0 0 12 12" aria-hidden="true"><path d="M2.5 7.5 6 4l3.5 3.5" /></svg>
        </button>
        {tips && (
          <div id="ex-body" className="ex-body"><p>{text}</p></div>
        )}
      </div>
    </div>
  );
}

/** Pointing at or focusing a control makes it the active one; a control nested in another wins over its
    parent. While a letter is customized, `data-letter` marks a control that reshapes only that letter. */
export function useControlFocus(key: ActiveKey) {
  const own = (e: PointerEvent | FocusEvent) => (e.target as Element).closest('.ctl') === e.currentTarget;
  const letterOnly = useEditor(s => !!letterOf(s) && isGlyphKey(key));
  return {
    'data-letter': letterOnly || undefined,
    onPointerOver: (e: PointerEvent) => { if (own(e)) point(e, key); },
    // one held back while the controls moved under the pointer takes over as the pointer moves on over it
    onPointerMove: (e: PointerEvent) => { if (moved && own(e)) point(e, key); },
    onFocus: (e: FocusEvent) => { if (own(e)) actions.focusControl(key); }
  };
}

/** Set inside a control that already says it changes nothing in view, so the settings nested in it don't say so again. */
export const Quiet = createContext(false);
