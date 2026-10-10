/* A small confirm dialog in the app's own style, in place of window.confirm, so it can offer more
   than OK and Cancel (Save and leave · Leave without saving · Stay). Escape and a click outside
   pick the cancel choice; the first choice takes the focus. */
import { useRef } from 'react';
import { useEscape } from '../lib/hooks';

interface DialogChoice { label: string; primary?: boolean; run: () => void }

export function Dialog({ title, body, choices, onCancel }: { title: string; body?: string; choices: DialogChoice[]; onCancel: () => void }) {
  const first = useRef<HTMLButtonElement>(null);
  useEscape(onCancel, first);
  return (
    <div className="dialog-scrim" onPointerDown={e => { if (e.target === e.currentTarget) onCancel(); }}>
      <div className="dialog" role="alertdialog" aria-modal="true" aria-labelledby="dialog-title" aria-describedby={body ? 'dialog-body' : undefined}>
        <h2 id="dialog-title">{title}</h2>
        {body && <p id="dialog-body">{body}</p>}
        <div className="dialog-actions">
          {choices.map((c, i) => (
            <button key={c.label} ref={i === 0 ? first : undefined} className={c.primary ? 'btn primary' : 'btn'} onClick={c.run}>{c.label}</button>
          ))}
        </div>
      </div>
    </div>
  );
}
