import { useEffect, useRef, useState, type ChangeEvent } from 'react';
import { Link } from 'react-router';
import { NAME_MAX, cleanName, slug } from '../../shared/design';
import { sanitizeParams } from '../../shared/params';
import { api, download, errorMessage } from '../lib/api';
import { actions, isDirty, useEditor } from '../state/editor';

/** Logo and tagline; a link back to the editor when `to` is given. */
export function Brand({ to }: { to?: string }) {
  const inner = <><span className="brand-name">TypeLab</span><span className="brand-tag">Experiment with type.</span></>;
  return to ? <Link to={to} className="brand" title="Back to the editor">{inner}</Link> : <div className="brand">{inner}</div>;
}

export function Header({ onSave, onGuide }: { onSave: () => void; onGuide: () => void }) {
  const name = useEditor(s => s.name), dirty = useEditor(isDirty), saving = useEditor(s => s.saving);
  const canUndo = useEditor(s => s.hi > 0), canRedo = useEditor(s => s.hi < s.history.length - 1);
  return (
    <header className="top">
      <div className="top-left">
        <Brand />
        <span className="sep" />
        <input className="doc-name" value={name} maxLength={NAME_MAX} aria-label="Font name" spellCheck={false}
          onChange={e => actions.setName(e.target.value)}
          onBlur={() => actions.setName(cleanName(name))}
          onKeyDown={e => { if (e.key === 'Enter' || e.key === 'Escape') e.currentTarget.blur(); }} />
      </div>
      <div className="top-actions" data-guide="actions">
        <button className="btn ghost icon" onClick={() => actions.travel(-1)} disabled={!canUndo} title="Undo (⌘Z)">
          <svg viewBox="0 0 20 20" width="16" height="16" aria-hidden="true"><path d="M7.5 4 3.5 8l4 4M4 8h7.5a4.5 4.5 0 0 1 0 9H9" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" /></svg>
          <span>Undo</span>
        </button>
        <button className="btn ghost icon" onClick={() => actions.travel(1)} disabled={!canRedo} title="Redo (⇧⌘Z)">
          <svg viewBox="0 0 20 20" width="16" height="16" aria-hidden="true"><path d="M12.5 4l4 4-4 4M16 8H8.5a4.5 4.5 0 0 0 0 9H11" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" /></svg>
          <span>Redo</span>
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
