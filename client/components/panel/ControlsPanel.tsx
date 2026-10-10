/* A page of controls: the free-font note, the explainer, the page's controls (grouped by the parts of an inspected letter), and the steps to the pages beside it. */
import { BLOCK_CONTROLS, PINCH_SUBS, SERIF_ARM_SUBS, CATEGORIES, CONTROLS, ROUND_SUBS, WEIGHT_SUBS, type CategoryId, type ControlKey } from '../../../shared/content';
import type { NumericParam } from '../../../shared/params';
import { FREE_FAMILIES, STYLE_FONTS, parseFontId } from '../../../shared/free-fonts';
import { actions, letterOf, useEditor, useFont, useParam } from '../../state/editor';
import { ScopeIcon, letterControls } from '../Inspector';
import { Explainer } from './heads';
import { SliderControl, BarEndsControl, CutControl } from './SliderControl';
import { EachCorner, EachStroke } from './LetterOwn';
import { TerminalControl, StoryControl, type LetterFormKey, FormControl, SerifControl, type SerifFormKey, SerifFormControl, FillControl } from './ShapeControls';

export function ControlsPanel({ category }: { category: Exclude<CategoryId, 'style'> }) {
  const serifs = useParam('serif'), shape = useParam('serifShape'), pointed = shape === 'wedge' || shape === 'diamond', outside = useParam('serifSides') === 'outside';
  const blocks = useParam('build') === 'blocks';
  // the Serifs page has nothing to shape while serifs are off, a wedge or a diamond, already a point, has no tip to finish,
  // and serifs that only reach out of the letter leave none inside it; letters built from blocks have no
  // strokes, so only the controls that shape blocks show
  const all = (Object.keys(CONTROLS) as ControlKey[]).filter(k => CONTROLS[k].cat === category);
  const keys = all.filter(k => (!blocks || BLOCK_CONTROLS.includes(k)) &&
    (category !== 'serifs' || k === 'serif' || (serifs && !(pointed && k === 'serifTip') && !(outside && k === 'serifInner'))));
  const inspecting = useEditor(s => !!s.inspect);
  const note = blocks && keys.length < all.length
    ? <p className="page-note">{keys.length ? 'Letters built from blocks use only these settings here.' : 'Letters built from blocks have nothing to shape here.'} Switch Built from back to Strokes for the rest.</p>
    : category === 'serifs' && !serifs && <p className="page-note">Switch serifs on to shape their tips, their base and where they reach.</p>;
  return (
    <div className="controls-page">
      <FreeLetters />
      <Explainer />
      {inspecting ? <LetterControls keys={keys} category={category} /> : <div className="ctl-list">{keys.map(k => <Control key={k} k={k} />)}{note}</div>}
      <PageSteps category={category} />
    </div>
  );
}

/** A design written in a free font says so on every page of controls, since its letters are drawn as the
    font has them and the settings move them on their skeletons (see freeLetters in shared/engine/free-letters.ts), with the way back to
    letters the settings build; a style that has a free font, not in use, offers it. */
function FreeLetters() {
  const id = useEditor(s => s.params.freeFont), offer = useEditor(s => STYLE_FONTS[s.styleId]), font = useFont();
  const r = parseFontId(id);
  if (r) {
    const by = FREE_FAMILIES[r.family].designers.join(', ');
    return (
      <div className="reach-banner">
        <span>Written in <b>{r.family}</b>{by && ` by ${by}`}, a free font{font.free ? ` (${font.free.license})` : ''} you may change and use. Its letters follow the settings as the built ones do: weight, contrast, width, the heights, the insides, curves, corners, peaks, stroke ends, serifs, dots, joints, stencil, slant, spacing and the fills. A letter picked in a form the font hasn't got (a single-storey a, a mirrored g) is built to its weight and width; reshape any letter in Points.</span>
        <button className="link small" onClick={() => actions.setFreeLetters(false)}>Make my own letters</button>
      </div>
    );
  }
  const o = parseFontId(offer);
  return o && (
    <p className="page-note">
      Want it ready-made? <button className="link small" onClick={() => actions.setFreeLetters(true)}>Use {o.family}</button>, a free font in this style
    </p>
  );
}

/** The foot of every page of controls: the way back and on through the pages in order, so a design
    can be made by walking them from Style to the end, where Save and Export take over. */
function PageSteps({ category }: { category: Exclude<CategoryId, 'style'> }) {
  const i = CATEGORIES.findIndex(c => c.id === category), prev = CATEGORIES[i - 1], next = CATEGORIES[i + 1];
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

/** The inspected letter's sliders, named by the parts they shape, then the rest of the category. */
function LetterControls({ keys, category }: { keys: ControlKey[]; category: Exclude<CategoryId, 'style'> }) {
  const ch = useEditor(s => s.inspect)!, font = useFont(), customizing = useEditor(s => !!letterOf(s));
  const hand = useEditor(s => !!s.params.outlines[ch]);
  const g = font.glyph(ch), free = !hand && g?.drawn && font.free ? font.free.family : null, drawn = hand || !!free;
  const rows = g ? letterControls(g, ch, font.letter(ch).params.serif) : [];
  const rest = keys.filter(k => !rows.some(r => r.key === k));
  return (
    <div className="ctl-list">
      {customizing && <div className="scope-note"><ScopeIcon id="letter" /><span>Only {ch} changes. Settings tagged <em>Whole font</em> still change every letter.</span></div>}
      {drawn && (
        <div className="reach-banner">
          <span>{free ? `${ch} comes from ${free}: weight, contrast, width, heights, crossbar, serifs, slant and fills change it, and Points reshapes it.` : `${ch} is drawn by hand, so these settings don’t change it.`}</span>
          <button className="link small" onClick={() => (free ? actions.setFreeLetters(false) : actions.undrawLetter(ch))}>{free ? 'Make my own letters' : 'Back to settings'}</button>
        </div>
      )}
      <div className="list-head">Parts of {ch}</div>
      {rows.map(r => <Control key={r.key} k={r.key} parts={r.parts} />)}
      {rest.length > 0 && <div className="list-head">More {CATEGORIES.find(c => c.id === category)?.label.toLowerCase()}</div>}
      {rest.map(k => <Control key={k} k={k} />)}
    </div>
  );
}

/** The component that draws control `k`. A `type` names one component: 'options' is the stroke ends
    (TerminalControl), 'story' the a, 'serif' the serif switch and shapes, 'fill' the fill, and each of
    those draws its one key whatever `k` is; 'form' is any letter-shape picker (it needs a FORM_OPTIONS
    entry), 'serifForm' the four finer serif choices. A control with no type is a slider; a few keys nest
    sliders or a letter's own values below theirs, and Stencil and Slice are cuts with a switch. */
function Control({ k, parts }: { k: ControlKey; parts?: string[] }) {
  const c = CONTROLS[k];
  if (c.type === 'options') return <TerminalControl parts={parts} />;
  if (c.type === 'story') return <StoryControl parts={parts} />;
  if (c.type === 'form') return <FormControl k={k as LetterFormKey} parts={parts} />;
  if (k === 'roundness') {
    return (
      <SliderControl k={k} def={c} parts={parts}>
        <SliderControl k="joinRound" def={ROUND_SUBS.joinRound} />
        <SliderControl k="innerRound" def={ROUND_SUBS.innerRound} />
        <EachCorner />
      </SliderControl>
    );
  }
  if (k === 'weight') {
    return (
      <SliderControl k={k} def={c} parts={parts}>
        <SliderControl k="vWeight" def={WEIGHT_SUBS.vWeight} />
        <SliderControl k="hWeight" def={WEIGHT_SUBS.hWeight} />
        <EachStroke />
      </SliderControl>
    );
  }
  if (k === 'pinch') {
    return (
      <SliderControl k={k} def={c} parts={parts}>
        <SliderControl k="pinchPos" def={PINCH_SUBS.pinchPos} />
      </SliderControl>
    );
  }
  if (k === 'serifArms') {
    return (
      <SliderControl k={k} def={c} parts={parts}>
        <SliderControl k="serifArmThickness" def={SERIF_ARM_SUBS.serifArmThickness} />
        <SliderControl k="serifArmLean" def={SERIF_ARM_SUBS.serifArmLean} />
      </SliderControl>
    );
  }
  if (k === 'crossbar') {
    return (
      <SliderControl k={k} def={c} parts={parts}>
        <BarEndsControl />
      </SliderControl>
    );
  }
  if (k === 'stencil' || k === 'slice') return <CutControl k={k} parts={parts} />;
  if (c.type === 'serif') return <SerifControl parts={parts} />;
  if (c.type === 'serifForm') return <SerifFormControl k={k as SerifFormKey} />;
  if (c.type === 'fill') return <FillControl />;
  return <SliderControl k={k as NumericParam & ControlKey} def={c} parts={parts} />;
}
