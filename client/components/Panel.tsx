/* Right-hand panel: on the Style page, its Filter and Adjust tabs (on phones, a sheet over the cards);
   elsewhere the controls of the open category with a live explainer. While a letter is inspected, the sliders are grouped by the parts of
   that letter they shape; pointing at a part name highlights it on the letter. Every control is titled
   in plain words; the typographer's term (`tech` in shared/params/spec.ts) names it for screen readers
   and settings search. The pieces, in panel/:
     StylePanel.tsx     the Style page's Filter and Adjust tabs
     ControlsPanel.tsx  a page of controls, and `Control`, which picks the component for each key
     ShapeControls.tsx  the pickers of named shapes (stroke ends, the a, letter forms, serifs, fill)
     SliderControl.tsx  a slider with its number box, the crossbar's ends, Stencil and Slice
     inputs.tsx         the range and the number box every slider row uses
     LetterOwn.tsx      a customized letter's own values (each join, end, corner and stroke)
     heads.tsx          a control's title, scope tag and fold, the explainer, which control is active
     reach.tsx          whether a setting changes the letters in view, and the note when it doesn't */
import { useLayoutEffect, useRef } from 'react';
import { actions, letterOf, useEditor } from '../state/editor';
import { closeStyleSheet, StylePanel } from './panel/StylePanel';
import { ControlsPanel } from './panel/ControlsPanel';

export { closeStyleSheet, focusFilters, focusStyleSearch } from './panel/StylePanel';

export function Panel() {
  const category = useEditor(s => s.category), customizing = useEditor(s => !!letterOf(s));
  const style = category === 'style', sheet = useEditor(s => s.stylePanelOpen) && style;
  // a new page starts at its top (a setting found by name scrolls to itself after this)
  const ref = useRef<HTMLElement>(null);
  useLayoutEffect(() => { ref.current?.scrollTo(0, 0); }, [category]);
  // the Style page's panel is a sheet on phones, shown only while open (styles.css)
  const cls = style ? (sheet ? 'panel styles open' : 'panel styles') : customizing ? 'panel customizing' : 'panel';
  return (
    <>
      <aside ref={ref} className={cls} aria-label={style ? 'Find and adjust styles' : 'Controls'} data-guide="panel"
        onPointerLeave={() => { actions.setHot(false); actions.setPart(null); }}>
        {style ? <StylePanel /> : <ControlsPanel category={category} />}
      </aside>
      {sheet && <div className="sheet-scrim" onClick={closeStyleSheet} />}
    </>
  );
}
