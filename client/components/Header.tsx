/* The editor's top bar: the logo (Brand, also on the library and account pages), the design's name
   renamed in place, the style it started from, undo and redo, Guide, My designs, Save (asking for a
   name on a first save) and Export, a window in the middle of the screen: the font in any styles of the
   design's family, one or several, a specimen, and settings as .typelab.json out and in. */
import { useEffect, useRef, useState, type ChangeEvent } from 'react';
import { Link, useLocation } from 'react-router';
import { styleById } from '../../shared/content';
import { DEFAULT_NAME, NAME_MAX, cleanName, slug } from '../../shared/design';
import { cleanLog, packLog, upgradeLog } from '../../shared/letter-log';
import { PARAMS_VERSION, sanitizeParams, upgradeParams } from '../../shared/params';
import { anchorOf, FAMILY_STYLES, ownStyle } from '../../shared/family';
import { parseFontId, withoutReserved } from '../../shared/free-fonts';
import { api, download, errorMessage } from '../lib/api';
import { useEscape } from '../lib/hooks';
import { DESIGNS, NEW_DESIGN, designPath } from '../lib/routes';
import { actions, isDirty, savedName, useEditor } from '../state/editor';
import { FamilyPicker, useFamilySamplesAhead } from './Family';

/** Under the export's name, written in a free font: the name it exports under when the font's licence
    reserves part of it (a changed font may not take a reserved name, see withoutReserved). */
function ReservedNote({ name }: { name: string }) {
  const font = parseFontId(useEditor(s => s.params.freeFont));
  const clean = cleanName(name), out = font ? withoutReserved(clean, font.family) : clean;
  return out === clean ? null
    : <p className="export-note">Saves as “{out}”: {font!.family}’s licence reserves its name.</p>;
}

/** Logo: back to the Style page of the design in progress. */
export function Brand() {
  const id = useEditor(s => s.designId), to = id ? designPath(id) : NEW_DESIGN;
  const here = useLocation().pathname === to; // already in the editor: just switch pages, don't navigate
  return <Link to={to} className="brand" title="Back to Style" onClick={e => { if (here) e.preventDefault(); actions.setCategory('style'); }}>
    <span className="brand-name">TypeLab</span>
  </Link>;
}

/** Rename: a design already in the library takes its new name at once, as a file would, so the
    name can't be lost by leaving without pressing Save; a new design keeps it until its first save. */
async function commitName(raw: string) {
  const name = cleanName(raw), s = useEditor.getState();
  actions.setName(name);
  if (!s.designId || savedName(s) === name) return;
  // counted as saved straight away, so leaving the page right after (the click that blurred the
  // field) doesn't ask about it; put back if the server says no
  const id = s.designId, before = actions.markRenamed(name);
  try {
    await api.renameDesign(id, name);
    actions.toast(`Renamed to “${name}”`);
  } catch (e) {
    if (useEditor.getState().designId === id) actions.unrename(before);
    actions.toast(`Couldn’t rename — ${errorMessage(e)}`);
  }
}

interface HeaderProps {
  onSave: () => void; onGuide: () => void;
  /** asking for the name on a design's first save */
  naming: boolean; onNamed: (name: string) => void; onCancelNaming: () => void;
}

export function Header({ onSave, onGuide, naming, onNamed, onCancelNaming }: HeaderProps) {
  const name = useEditor(s => s.name), dirty = useEditor(isDirty), saving = useEditor(s => s.saving);
  const canUndo = useEditor(s => s.hi > 0), canRedo = useEditor(s => s.hi < s.history.length - 1);
  const navOpen = useEditor(s => s.navOpen);
  return (
    <header className="top">
      <div className="top-left">
        {/* shown only while the window is too narrow for the page menu to sit beside the preview */}
        <button className="btn ghost icon nav-toggle" aria-label="Pages" title="Pages" aria-expanded={navOpen} onClick={() => actions.setNavOpen(!navOpen)}>
          <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true"><path d="M4 7h16M4 12h16M4 17h16" /></svg>
        </button>
        <Brand />
        <label className="doc-name-wrap" title="Rename">
          <input className="doc-name" value={name} maxLength={NAME_MAX} aria-label="Font name" spellCheck={false}
            onChange={e => actions.setName(e.target.value)}
            onBlur={() => void commitName(name)}
            onKeyDown={e => { if (e.key === 'Enter' || e.key === 'Escape') e.currentTarget.blur(); }} />
          <svg className="doc-name-pen" viewBox="0 0 16 16" width="13" height="13" aria-hidden="true"><path d="M10.5 3.5l2 2L6 12H4v-2z" /></svg>
        </label>
        <BasedOn />
      </div>
      <div className="top-actions" data-guide="actions">
        <button className="btn ghost icon" onClick={() => actions.travel(-1)} disabled={!canUndo} title="Undo (⌘Z)" aria-label="Undo">
          <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true"><path d="M9 14 4 9l5-5M4 9h10.5a5.5 5.5 0 0 1 0 11H11" strokeLinejoin="round" /></svg>
        </button>
        <button className="btn ghost icon" onClick={() => actions.travel(1)} disabled={!canRedo} title="Redo (⇧⌘Z)" aria-label="Redo">
          <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true"><path d="m15 14 5-5-5-5M20 9H9.5a5.5 5.5 0 0 0 0 11H13" strokeLinejoin="round" /></svg>
        </button>
        <span className="sep" />
        <button className="btn ghost guide-btn" onClick={onGuide}>Guide</button>
        <Link className="btn ghost" to={DESIGNS}>My designs</Link>
        <div className="save-wrap">
          <button className="btn outline" onClick={onSave} disabled={saving} title="Save (⌘S)">
            {saving ? 'Saving…' : 'Save'}<i className={dirty ? 'dirty on' : 'dirty'} aria-label={dirty ? 'Unsaved changes' : undefined} />
          </button>
          {naming && <NamePrompt onDone={onNamed} onCancel={onCancelNaming} />}
        </div>
        <ExportButton />
      </div>
    </header>
  );
}

/** The style the design started from, after its name: a click goes back to the styles to pick another. */
function BasedOn() {
  const style = useEditor(s => styleById(s.styleId));
  if (!style) return null;
  return (
    <button className="based-on" title={`Based on ${style.name}. Pick another style`} onClick={() => { actions.setCategory('style'); actions.setNavOpen(false); }}>
      from <b>{style.name}</b>
    </button>
  );
}

/** The name offered to a design still Untitled: from its style. */
const suggestedName = (styleId: string) => `My ${styleById(styleId)?.name ?? 'font'}`;

/** "Name your font": asked on a design's first save, so the library doesn't fill with Untitled fonts.
    It starts from the style the design is based on. */
function NamePrompt({ onDone, onCancel }: { onDone: (name: string) => void; onCancel: () => void }) {
  const [value, setValue] = useState(() => suggestedName(useEditor.getState().styleId));
  const wrap = useRef<HTMLFormElement>(null), input = useRef<HTMLInputElement>(null);
  useEffect(() => {
    input.current?.select();
    const close = (e: PointerEvent) => { if (!wrap.current?.contains(e.target as Node)) onCancel(); };
    const esc = (e: KeyboardEvent) => { if (e.key === 'Escape') { e.stopPropagation(); onCancel(); } };
    document.addEventListener('pointerdown', close);
    addEventListener('keydown', esc, true);
    return () => { document.removeEventListener('pointerdown', close); removeEventListener('keydown', esc, true); };
  }, [onCancel]);
  return (
    <form ref={wrap} className="popover name-prompt" aria-label="Name your font" onSubmit={e => { e.preventDefault(); onDone(cleanName(value)); }}>
      <label htmlFor="name-prompt">Name your font</label>
      <input id="name-prompt" ref={input} value={value} maxLength={NAME_MAX} spellCheck={false} onChange={e => setValue(e.target.value)} />
      <p>It’s also the name the font installs under.</p>
      <div className="name-prompt-actions">
        <button type="button" className="btn ghost small" onClick={onCancel}>Cancel</button>
        <button type="submit" className="btn primary small">Save</button>
      </div>
    </form>
  );
}

/** Export, in the header: opens the Export window (so does the last page of controls, through exportOpen). */
function ExportButton() {
  const open = useEditor(s => s.exportOpen);
  useFamilySamplesAhead();
  return <>
    <button className="btn primary" aria-haspopup="dialog" aria-expanded={open} onClick={() => actions.setExportOpen(true)}>Export</button>
    {open && <ExportDialog onClose={() => actions.setExportOpen(false)} />}
  </>;
}

/** The file a font download saves as: one style's .otf, or the family's .zip. */
const fontFile = (name: string, styles: readonly { style: string }[]) =>
  styles.length === 1 ? `${slug(name)}-${styles[0].style.replace(/ /g, '')}.otf` : `${slug(name)}-family.zip`;

/** The Export window's small icons: a download, an upload, and the tick a finished download shows. */
const ICONS = {
  down: 'M8 2.5v8M4.5 7 8 10.5 11.5 7M3 13.5h10',
  up: 'M8 10.5v-8M4.5 6 8 2.5 11.5 6M3 13.5h10',
  done: 'M3.5 8.5 6.5 11.5 12.5 4.5'
};
const Glyph = ({ d }: { d: keyof typeof ICONS }) =>
  <svg className="export-icon" width="16" height="16" viewBox="0 0 16 16" aria-hidden="true"><path d={ICONS[d]} /></svg>;

/** The Export window, in the middle of the screen: the styles of the design's family to save fill it (one as an .otf,
    several as the family's fonts in one .zip); beside them, the font's name and Download, and at the foot the other
    files in a few words each: every letter as an .svg, the design file out, and a design file in. */
function ExportDialog({ onClose }: { onClose: () => void }) {
  const params = useEditor(s => s.params);
  const [busy, setBusy] = useState<'fonts' | 'svg' | null>(null);
  // the other file just downloaded, ticked for a moment: the window stays open for the font after it
  const [done, setDone] = useState<'svg' | 'json' | null>(null);
  // what went wrong, said in the window beside the buttons that tried it: a toast would sit under the window
  const [error, setError] = useState<{ at: 'fonts' | 'files'; text: string } | null>(null);
  const failed = (at: 'fonts' | 'files') => error?.at === at && <p className="export-error" role="alert">{error.text}</p>;
  useEffect(() => {
    if (!done) return;
    const t = setTimeout(() => setDone(null), 2400);
    return () => clearTimeout(t);
  }, [done]);
  const go = useRef<HTMLButtonElement>(null), file = useRef<HTMLInputElement>(null);
  useEscape(onClose, go);

  // the name the fonts install under: a design still Untitled is offered one from its style, as on its first
  // save, and takes it once something is exported
  const [draft, setDraft] = useState(() => {
    const s = useEditor.getState();
    return cleanName(s.name) === DEFAULT_NAME ? suggestedName(s.styleId) : s.name;
  });
  const touched = useRef(false);
  const takeName = () => { if (cleanName(draft) !== cleanName(useEditor.getState().name)) void commitName(draft); };

  // the styles to save, by the names they install under: at first the design's own, the weight its stems read as,
  // italic when it leans; the family's other weights spread from it
  const anchor = anchorOf(params);
  const [picked, setPicked] = useState(() => [ownStyle(params, anchor).style]);
  const styles = FAMILY_STYLES.filter(f => picked.includes(f.style));

  const saveFonts = async () => {
    takeName();
    const s = useEditor.getState(), name = cleanName(s.name);
    setBusy('fonts'); setError(null);
    try {
      if (styles.length === 1) {
        const [f] = styles;
        download(fontFile(name, styles), await api.exportFile('otf', { name, params: s.params, member: { anchor, weight: f.weight, italic: f.italic } }));
        actions.toast(`${name} ${f.style} exported — open the .otf to install it`);
      } else {
        download(fontFile(name, styles), await api.exportFamily({ name, params: s.params, family: { anchor, styles: styles.map(f => ({ weight: f.weight, italic: f.italic })) } }));
        actions.toast(`${styles.length} fonts exported — unzip them and open each to install`);
      }
      onClose();
    } catch (e) {
      setError({ at: 'fonts', text: `Export failed: ${errorMessage(e)}` });
      setBusy(null);
    }
  };

  const saveSpecimen = async () => {
    takeName();
    const s = useEditor.getState(), name = cleanName(s.name);
    setBusy('svg'); setError(null);
    try {
      download(`${slug(name)}-specimen.svg`, await api.exportFile('svg', { name, params: s.params }));
      setDone('svg');
    } catch (e) {
      setError({ at: 'files', text: `Export failed: ${errorMessage(e)}` });
    }
    setBusy(null);
  };

  const exportJSON = () => {
    takeName();
    const s = useEditor.getState(), name = cleanName(s.name);
    const data = { app: 'TypeLab', version: PARAMS_VERSION, name, styleId: s.styleId, params: s.params, log: packLog(s.log) };
    download(`${slug(name)}.typelab.json`, new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' }));
    setDone('json'); setError(null);
  };

  const importJSON = async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    try {
      const o = JSON.parse(await file.text());
      if (!o || typeof o !== 'object' || !o.params || typeof o.params !== 'object') throw new Error();
      const version = typeof o.version === 'number' ? o.version : 1;
      // the letters' record of their edits that came with it joins the open design's
      actions.replaceParams(sanitizeParams(upgradeParams(o.params, version)), typeof o.styleId === 'string' ? o.styleId : undefined, cleanLog(upgradeLog(o.log, o.params, version)));
      if (typeof o.name === 'string') actions.setName(cleanName(o.name));
      actions.toast('Design file opened');
      onClose();
    } catch {
      setError({ at: 'files', text: 'That isn’t a TypeLab design file' });
    }
  };

  const n = styles.length;
  return (
    <div className="dialog-scrim" onPointerDown={e => { if (e.target === e.currentTarget && !busy) onClose(); }}>
      <div className="dialog export" role="dialog" aria-modal="true" aria-labelledby="export-title">
        <div className="export-head">
          <h2 id="export-title">Export</h2>
          <button type="button" className="btn ghost icon" aria-label="Close" title="Close (Esc)" onClick={onClose}>
            <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true"><path d="M6 6l12 12M18 6 6 18" /></svg>
          </button>
        </div>
        <section className="export-styles" aria-labelledby="export-styles">
          <h3 id="export-styles">Styles</h3>
          <FamilyPicker params={params} anchor={anchor} picked={picked} onPick={setPicked} />
        </section>
        {/* on phones this side lets its parts into the window's one column: the name over the styles, the rest under */}
        <div className="export-side">
          <div className="export-named">
            <label className="export-name">
              <span>Font name</span>
              <input value={draft} maxLength={NAME_MAX} spellCheck={false}
                onChange={e => { touched.current = true; setDraft(e.target.value); }}
                onBlur={() => { if (touched.current) takeName(); }}
                onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); takeName(); } }} />
            </label>
            <ReservedNote name={draft} />
          </div>
          <div className="export-send">
            <button ref={go} type="button" className="btn primary" disabled={!!busy || !n} onClick={saveFonts}>
              <Glyph d="down" />
              {busy === 'fonts' ? 'Building…' : !n ? 'Pick a style' : n > 1 ? `Download ${n} fonts` : 'Download font'}
            </button>
            {failed('fonts')}
          </div>
          {/* the other files, which leave the window open for the font */}
          <div className="export-more">
            <button type="button" className="btn ghost small" disabled={!!busy} onClick={saveSpecimen}>
              <Glyph d={done === 'svg' ? 'done' : 'down'} />
              {busy === 'svg' ? 'Building…' : done === 'svg' ? 'Downloaded' : <span>All letters<span className="export-ext"> (.svg)</span></span>}
            </button>
            <button type="button" className="btn ghost small" disabled={!!busy} onClick={exportJSON}>
              <Glyph d={done === 'json' ? 'done' : 'down'} />
              {done === 'json' ? 'Downloaded' : <span>Design file<span className="export-ext"> (.json)</span></span>}
            </button>
            <button type="button" className="btn ghost small" disabled={!!busy} onClick={() => file.current?.click()}>
              <Glyph d="up" /><span>Open<span className="export-long"> design</span> file…</span>
            </button>
            <input ref={file} type="file" accept=".json,application/json" hidden onChange={importJSON} />
            {failed('files')}
          </div>
        </div>
      </div>
    </div>
  );
}
