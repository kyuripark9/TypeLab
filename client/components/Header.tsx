import { useEffect, useRef, useState, type ChangeEvent } from 'react';
import { Link } from 'react-router';
import { NAME_MAX, cleanName, slug } from '../../shared/design';
import { sanitizeParams } from '../../shared/params';
import { api, download, errorMessage } from '../lib/api';
import { actions, isDirty, useEditor } from '../state/editor';

/** Logo, linking to `to`. */
export function Brand({ to, title }: { to: string; title: string }) {
  return <Link to={to} className="brand" title={title}><span className="brand-name">TypeLab</span></Link>;
}

export function Header({ onSave, onGuide }: { onSave: () => void; onGuide: () => void }) {
  const name = useEditor(s => s.name), dirty = useEditor(isDirty), saving = useEditor(s => s.saving);
  const canUndo = useEditor(s => s.hi > 0), canRedo = useEditor(s => s.hi < s.history.length - 1);
  return (
    <header className="top">
      <div className="top-left">
        <Brand to="/" title="Start a new design" />
        <input className="doc-name" value={name} maxLength={NAME_MAX} aria-label="Font name" spellCheck={false}
          onChange={e => actions.setName(e.target.value)}
          onBlur={() => actions.setName(cleanName(name))}
          onKeyDown={e => { if (e.key === 'Enter' || e.key === 'Escape') e.currentTarget.blur(); }} />
      </div>
      <div className="top-actions" data-guide="actions">
        <button className="btn ghost icon" onClick={() => actions.travel(-1)} disabled={!canUndo} title="Undo (⌘Z)" aria-label="Undo">
          <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true"><path d="M9 14 4 9l5-5M4 9h10.5a5.5 5.5 0 0 1 0 11H11" strokeLinejoin="round" /></svg>
        </button>
        <button className="btn ghost icon" onClick={() => actions.travel(1)} disabled={!canRedo} title="Redo (⇧⌘Z)" aria-label="Redo">
          <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true"><path d="m15 14 5-5-5-5M20 9H9.5a5.5 5.5 0 0 0 0 11H13" strokeLinejoin="round" /></svg>
        </button>
        <span className="sep" />
        <button className="btn ghost" onClick={onGuide}>Guide</button>
        <Link className="btn ghost" to="/designs">My designs</Link>
        <button className="btn ghost" onClick={onSave} disabled={saving} title="Save (⌘S)">
          {saving ? 'Saving…' : 'Save'}<i className={dirty ? 'dirty on' : 'dirty'} aria-label={dirty ? 'Unsaved changes' : undefined} />
        </button>
        <ExportMenu />
      </div>
    </header>
  );
}

function ExportMenu() {
  const open = useEditor(s => s.exportOpen);
  const [busy, setBusy] = useState<string | null>(null);
  const wrap = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent) => { if (!wrap.current?.contains(e.target as Node)) actions.setExportOpen(false); };
    document.addEventListener('pointerdown', close);
    return () => document.removeEventListener('pointerdown', close);
  }, [open]);

  const serverExport = async (kind: 'otf' | 'svg') => {
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
    const s = useEditor.getState(), name = cleanName(s.name);
    const data = { app: 'TypeLab', version: 1, name, styleId: s.styleId, params: s.params };
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
      actions.replaceParams(sanitizeParams(o.params), typeof o.styleId === 'string' ? o.styleId : undefined);
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
          <button className="exp" role="menuitem" disabled={!!busy} onClick={() => serverExport('otf')}>
            <b>{busy === 'otf' ? 'Building font…' : 'Font file'}</b><span>.otf — install it and use it in any app</span>
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
    </div>
  );
}
