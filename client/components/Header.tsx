import { useEffect, useRef, useState, type ChangeEvent } from 'react';
import { Link, useLocation } from 'react-router';
import { styleById } from '../../shared/content';
import { DEFAULT_NAME, NAME_MAX, cleanName, slug } from '../../shared/design';
import { PARAMS_VERSION, sanitizeParams, upgradeParams } from '../../shared/params';
import { api, download, errorMessage } from '../lib/api';
import { actions, isDirty, useEditor } from '../state/editor';
import { FamilyDialog } from './Family';

/** Logo: back to the Style tab of the design in progress. */
export function Brand() {
  const id = useEditor(s => s.designId), to = id ? `/d/${id}` : '/';
  const here = useLocation().pathname === to; // already in the editor: just switch tabs, don't navigate
  return <Link to={to} className="brand" title="Back to Style" onClick={e => { if (here) e.preventDefault(); actions.setCategory('style'); }}>
    <span className="brand-name">TypeLab</span>
  </Link>;
}

/** Rename: a design already in the library takes its new name at once, as a file would, so the
    name can't be lost by leaving without pressing Save; a new design keeps it until its first save. */
async function commitName(raw: string) {
  const name = cleanName(raw), s = useEditor.getState();
  actions.setName(name);
  if (!s.designId) return;
  const [savedName] = JSON.parse(s.saved) as [string];
  if (savedName === name) return;
  // counted as saved straight away, so leaving the page right after (the click that blurred the
  // field) doesn't ask about it; put back if the server says no
  const before = s.saved, id = s.designId;
  actions.markRenamed(name);
  try {
    await api.renameDesign(id, name);
    actions.toast(`Renamed to “${name}”`);
  } catch (e) {
    if (useEditor.getState().designId === id) useEditor.setState({ saved: before });
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
        <Link className="btn ghost" to="/designs">My designs</Link>
        <div className="save-wrap">
          <button className="btn outline" onClick={onSave} disabled={saving} title="Save (⌘S)">
            {saving ? 'Saving…' : 'Save'}<i className={dirty ? 'dirty on' : 'dirty'} aria-label={dirty ? 'Unsaved changes' : undefined} />
          </button>
          {naming && <NamePrompt onDone={onNamed} onCancel={onCancelNaming} />}
        </div>
        <ExportMenu />
      </div>
    </header>
  );
}

/** "Name your font": asked on a design's first save, so the library doesn't fill with Untitled fonts.
    It starts from the style the design is based on. */
function NamePrompt({ onDone, onCancel }: { onDone: (name: string) => void; onCancel: () => void }) {
  const style = useEditor(s => styleById(s.styleId));
  const [value, setValue] = useState(() => `My ${style?.name ?? 'font'}`);
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

function ExportMenu() {
  const open = useEditor(s => s.exportOpen);
  const [busy, setBusy] = useState<string | null>(null), [family, setFamily] = useState(false);
  const wrap = useRef<HTMLDivElement>(null);

  // the name the font installs under, on top of the menu: a design still Untitled is offered one
  // from its style, as on its first save, and takes it once something is exported
  const [draft, setDraft] = useState(''), touched = useRef(false);
  useEffect(() => {
    if (!open) return;
    const s = useEditor.getState();
    setDraft(cleanName(s.name) === DEFAULT_NAME ? `My ${styleById(s.styleId)?.name ?? 'font'}` : s.name);
    touched.current = false;
  }, [open]);
  const takeName = () => { if (cleanName(draft) !== cleanName(useEditor.getState().name)) void commitName(draft); };

  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent) => { if (!wrap.current?.contains(e.target as Node)) actions.setExportOpen(false); };
    document.addEventListener('pointerdown', close);
    return () => document.removeEventListener('pointerdown', close);
  }, [open]);

  const serverExport = async (kind: 'otf' | 'svg') => {
    takeName();
    const s = useEditor.getState(), name = cleanName(s.name);
    setBusy(kind);
    try {
      const blob = await api.exportFile(kind, { name, params: s.params });
      download(kind === 'otf' ? `${slug(name)}.otf` : `${slug(name)}-specimen.svg`, blob);
      actions.toast(kind === 'otf' ? 'Font exported — open the .otf to install it' : 'Specimen exported');
      actions.setExportOpen(false);
    } catch (e) {
      actions.toast(`Export failed: ${errorMessage(e)}`);
    } finally {
      setBusy(null);
    }
  };

  const exportJSON = () => {
    takeName();
    const s = useEditor.getState(), name = cleanName(s.name);
    const data = { app: 'TypeLab', version: PARAMS_VERSION, name, styleId: s.styleId, params: s.params };
    download(`${slug(name)}.typelab.json`, new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' }));
    actions.toast('Settings exported');
    actions.setExportOpen(false);
  };

  const importJSON = async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    try {
      const o = JSON.parse(await file.text());
      if (!o || typeof o !== 'object' || !o.params || typeof o.params !== 'object') throw new Error();
      actions.replaceParams(sanitizeParams(upgradeParams(o.params, typeof o.version === 'number' ? o.version : 1)), typeof o.styleId === 'string' ? o.styleId : undefined);
      if (typeof o.name === 'string') actions.setName(cleanName(o.name));
      actions.toast('Settings imported');
      actions.setExportOpen(false);
    } catch {
      actions.toast('That file isn’t a TypeLab settings file');
    }
  };

  return (
    <div className="export" ref={wrap}>
      <button className="btn primary" aria-expanded={open} aria-haspopup="menu" onClick={() => actions.setExportOpen(!open)}>Export</button>
      {open && (
        <div className="popover" role="menu">
          <label className="exp-name">
            <span>Font name</span>
            <input value={draft} maxLength={NAME_MAX} spellCheck={false}
              onChange={e => { touched.current = true; setDraft(e.target.value); }}
              onBlur={() => { if (touched.current) takeName(); }}
              onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); takeName(); } }} />
          </label>
          <button className="exp" role="menuitem" disabled={!!busy} onClick={() => serverExport('otf')}>
            <b>{busy === 'otf' ? 'Building font…' : 'Font file'}</b><span>.otf — install it and use it in any app</span>
          </button>
          <button className="exp" role="menuitem" disabled={!!busy} onClick={() => { takeName(); actions.setExportOpen(false); setFamily(true); }}>
            <b>Font family…</b><span>.zip — more weights and an italic, installed as one family</span>
          </button>
          <button className="exp" role="menuitem" disabled={!!busy} onClick={() => serverExport('svg')}>
            <b>{busy === 'svg' ? 'Building specimen…' : 'Specimen'}</b><span>.svg — vector sheet of every glyph</span>
          </button>
          <button className="exp" role="menuitem" onClick={exportJSON}>
            <b>Settings</b><span>.json — reopen this design anywhere</span>
          </button>
          <label className="exp import" role="menuitem">
            <b>Import settings…</b><span>Load a .typelab.json file</span>
            <input type="file" accept=".json,application/json" hidden onChange={importJSON} />
          </label>
        </div>
      )}
      {family && <FamilyDialog onClose={() => setFamily(false)} />}
    </div>
  );
}
