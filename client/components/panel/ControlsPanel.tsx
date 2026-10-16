/* A page of controls: the explainer, the page's controls (grouped by the parts of an inspected letter), and the steps to the pages beside it. */
import { useLayoutEffect, type ReactNode } from 'react';
import { PINCH_SUBS, SERIF_ARM_SUBS, CATEGORIES, CONTROLS, ROUND_SUBS, WEIGHT_SUBS, controlFor, controlInUse, pagesFor, type ActiveKey, type CategoryId, type ControlKey } from '../../../shared/content';
import type { NumericParam, SubControlDef } from '../../../shared/params';
import { actions, letterOf, useEditor, useFont, useParam } from '../../state/editor';
import { ScopeIcon, letterControls } from '../Inspector';
import { Explainer } from './heads';
import { SliderControl, BarEndsControl, CutControl } from './SliderControl';
import { EachCorner, EachStroke } from './LetterOwn';
import { TerminalControl, StoryControl, type LetterFormKey, FormControl, SerifControl, type SerifFormKey, SerifFormControl, FillControl } from './ShapeControls';

export function ControlsPanel({ category }: { category: Exclude<CategoryId, 'style'> }) {
  const serifs = useParam('serif'), shape = useParam('serifShape'), pointed = shape === 'wedge' || shape === 'diamond', outside = useParam('serifSides') === 'outside';
  const build = useParam('build'), blockForm = useParam('blockForm'), gridRows = useParam('gridRows');
  const pages = pagesFor({ build, blockForm });
  // a page with nothing for these letters isn't offered; one opened anyway (undo back to blocks, a link) gives way to the
  // page before it before it is drawn
  const shown = pages.some(c => c.id === category);
  useLayoutEffect(() => {
    if (!shown) actions.setCategory(CATEGORIES.slice(0, CATEGORIES.findIndex(c => c.id === category)).filter(c => pages.includes(c)).at(-1)!.id);
  }, [shown, category, pages]);
  // the Serifs page has nothing to shape while serifs are off, a wedge or a diamond, already a point, has no tip to finish,
  // and serifs that only reach out of the letter leave none inside it; letters built from blocks or arcs have no
  // skeleton of strokes, so only the controls that shape them show
  const all = (Object.keys(CONTROLS) as ControlKey[]).filter(k => CONTROLS[k].cat === category);
  const keys = all.filter(k => controlInUse(k, { build, blockForm, gridRows }) &&
    (category !== 'serifs' || k === 'serif' || (serifs && !(pointed && k === 'serifTip') && !(outside && k === 'serifInner'))));
  const inspecting = useEditor(s => !!s.inspect);
  // the page opens on its first setting these letters take, so the explainer speaks of one shown here
  const keyList = keys.join();
  useLayoutEffect(() => {
    const ks = keyList.split(',') as ControlKey[];
    if (keyList && !ks.includes(controlFor(useEditor.getState().active))) actions.setActive(ks[0]);
  }, [keyList]);
  const note = build !== 'strokes' && keys.length < all.length
    ? <p className="page-note">Letters built from {build} take only these settings here.</p>
    : category === 'serifs' && !serifs && <p className="page-note">Switch serifs on to shape their tips, their base and where they reach.</p>;
  if (!shown) return null;
  return (
    <div className="controls-page">
      <Explainer />
      {inspecting ? <LetterControls keys={keys} category={category} note={note} /> : <div className="ctl-list">{keys.map(k => <Control key={k} k={k} />)}{note}</div>}
      <PageSteps category={category} pages={pages} />
    </div>
  );
}

/** The foot of every page of controls: the way back and on through the pages in order (those with something to shape
    in these letters), so a design can be made by walking them from Style to the end, where Save and Export take over. */
function PageSteps({ category, pages }: { category: Exclude<CategoryId, 'style'>; pages: typeof CATEGORIES }) {
  const i = pages.findIndex(c => c.id === category), prev = pages[i - 1], next = pages[i + 1];
  const go = (id: CategoryId) => () => actions.setCategory(id);
  const arrow = (d: string) => <svg width="14" height="14" viewBox="0 0 16 16" aria-hidden="true"><path d={d} /></svg>;
  return (
    <nav className="page-steps" aria-label="Pages">
      {prev && <button className="btn ghost small" onClick={go(prev.id)}>{arrow('M10 3 5 8l5 5')}{prev.label}</button>}
      <span className="page-steps-grow" />
      {next
        ? <button className="btn outline small" onClick={go(next.id)}>Next: {next.label}{arrow('m6 3 5 5-5 5')}</button>
        : <>
            <button className="btn outline small" onClick={actions.requestSave}>Save</button>
            <button className="btn primary small" onClick={() => actions.setExportOpen(true)}>Export font</button>
          </>}
    </nav>
  );
}

/** The page's controls while a letter is inspected: those that shape its parts first, named by the parts, then the rest
    of the page. Each page shows only its own, so the letter's settings on other pages are a click on its part away. */
function LetterControls({ keys, category, note }: { keys: ControlKey[]; category: Exclude<CategoryId, 'style'>; note: ReactNode }) {
  const ch = useEditor(s => s.inspect)!, font = useFont(), customizing = useEditor(s => !!letterOf(s));
  const hand = useEditor(s => !!s.params.outlines[ch]);
  const g = font.glyph(ch);
  const rows = g ? letterControls(g, ch, font.letter(ch).params.serif).filter(r => keys.includes(r.key)) : [];
  const rest = keys.filter(k => !rows.some(r => r.key === k));
  return (
    <div className="ctl-list">
      {customizing && <div className="scope-note"><ScopeIcon id="letter" /><span>Only {ch} changes. Settings tagged <em>Whole font</em> still change every letter.</span></div>}
      {hand && (
        <div className="reach-banner">
          <span>{`${ch} was edited in Points: weight, contrast, width, heights, crossbar and slant move it, and its shape stays as you drew it.`}</span>
          <button className="link small" onClick={() => actions.syncLetter(ch)}>{`Reset ${ch}`}</button>
        </div>
      )}
      {rows.length > 0 && <div className="list-head">Parts of <span className="ch">{ch}</span></div>}
      {rows.map(r => <Control key={r.key} k={r.key} parts={r.parts} />)}
      {rows.length > 0 && rest.length > 0 && <div className="list-head">More {CATEGORIES.find(c => c.id === category)?.label.toLowerCase()}</div>}
      {rest.map(k => <Control key={k} k={k} />)}
      {note}
    </div>
  );
}

/** The sliders nested under a few sliders (their *_SUBS in shared/content/controls.ts, in spec order), and what follows
    them there: a customized letter's own values, or where the crossbars' Gap opens. The other nested sliders are
    placed by their control's own component (ShapeControls.tsx, and CutControl and BarEndsControl in
    SliderControl.tsx): a nested slider shows only where the panel places it (tests/pages.test.ts checks each is). */
const NESTED: Partial<Record<ControlKey, { subs?: Record<string, SubControlDef>; more?: ReactNode }>> = {
  roundness: { subs: ROUND_SUBS, more: <EachCorner /> },
  weight: { subs: WEIGHT_SUBS, more: <EachStroke /> },
  pinch: { subs: PINCH_SUBS },
  serifArms: { subs: SERIF_ARM_SUBS },
  crossbar: { more: <BarEndsControl /> }
};

/** The component that draws control `k`. A `type` names one component: 'options' is the stroke ends
    (TerminalControl), 'story' the a, 'serif' the serif switch and shapes, 'fill' the fill, and each of
    those draws its one key whatever `k` is; 'form' is any letter-shape picker (it needs a FORM_OPTIONS
    entry), 'serifForm' the four finer serif choices. A control with no type is a slider; a few keys nest
    sliders or a letter's own values below theirs, and Stencil and Slice are cuts with a switch. */
function Control({ k, parts }: { k: ControlKey; parts?: string[] }) {
  const c = CONTROLS[k], n = NESTED[k];
  if (c.type === 'options') return <TerminalControl parts={parts} />;
  if (c.type === 'story') return <StoryControl parts={parts} />;
  if (c.type === 'form') return <FormControl k={k as LetterFormKey} parts={parts} />;
  if (n) {
    return (
      <SliderControl k={k as NumericParam & ControlKey} def={c} parts={parts}>
        {Object.entries(n.subs ?? {}).map(([s, d]) => <SliderControl key={s} k={s as NumericParam & ActiveKey} def={d} />)}
        {n.more}
      </SliderControl>
    );
  }
  if (k === 'stencil' || k === 'slice') return <CutControl k={k} parts={parts} />;
  if (c.type === 'serif') return <SerifControl parts={parts} />;
  if (c.type === 'serifForm') return <SerifFormControl k={k as SerifFormKey} />;
  if (c.type === 'fill') return <FillControl />;
  return <SliderControl k={k as NumericParam & ControlKey} def={c} parts={parts} />;
}
