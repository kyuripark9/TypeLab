/* Right-hand panel: the starting-style filters, or the controls of the open category with a
   live explainer. While a letter is inspected, the sliders are grouped by the parts of that
   letter they shape; pointing at a part name highlights it on the letter. Every control leads with plain language; the typographic term comes second. */
import { useLayoutEffect, useRef } from 'react';
import { actions, letterOf, useEditor } from '../state/editor';
import { StylePanel } from './panel/StylePanel';
import { ControlsPanel } from './panel/ControlsPanel';

export { SEARCH_ID, focusFilters, focusSearch } from './panel/StylePanel';

export function Panel() {
  const category = useEditor(s => s.category), customizing = useEditor(s => !!letterOf(s));
  // a new page starts at its top (a setting found by name scrolls to itself after this)
  const ref = useRef<HTMLElement>(null);
  useLayoutEffect(() => { ref.current?.scrollTo(0, 0); }, [category]);
  return (
    <aside ref={ref} className={customizing ? 'panel customizing' : 'panel'} aria-label={category === 'style' ? 'Find and adjust styles' : 'Controls'} data-guide="panel"
      onPointerLeave={() => { actions.setHot(false); actions.setPart(null); }}>
      {category === 'style' ? <StylePanel /> : <ControlsPanel category={category} />}
    </aside>
  );
}
