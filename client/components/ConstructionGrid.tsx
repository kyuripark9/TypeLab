/* The construction grid in the inspector, like the grid page of a type specimen: the lines and
   circles the letter is built on (engine/grid), drawn through it, and a bar naming the grid and the
   letters that share it. What the letter has in common with its group is drawn in one colour, what
   is its own in another. */
import { useDeferredValue, useMemo } from 'react';
import { gridOf, type Font, type GlyphGrid, type GridGroup } from '../../shared/engine';
import { n1 } from '../lib/hooks';
import { actions, useEditor } from '../state/editor';

/** Far enough, in font units, to run a line off any canvas. */
const FAR = 9000;

/** The grid of `ch` and its group while the construction grid is switched on, else null. The letter's
    own grid follows every change; its group is read from the font a moment ago, so a drag stays smooth. */
export function useGrid(font: Font, ch: string | null) {
  const on = useEditor(s => s.construction), lazy = useDeferredValue(font);
  return useMemo(() => (on && ch ? gridOf(font, ch, lazy) : null), [on, ch, font, lazy]);
}

/** The grid's lines and circles. They sit in the letter's own space (font units, y down), so they go
    inside the group that places the letter; their strokes stay a hairline at any zoom. */
export function GridLines({ grid }: { grid: GlyphGrid }) {
  const cls = (shared: boolean) => (shared ? 'shared' : undefined);
  return (
    <g className="cg" pointerEvents="none" aria-hidden="true"
      transform={grid.slant ? `matrix(1 0 ${(-grid.slant).toFixed(5)} 1 ${n1(-grid.slant * grid.pivot)} 0)` : undefined}>
      {grid.rounds.map((r, i) => <ellipse key={i} className={cls(r.shared)} cx={n1(r.cx)} cy={n1(-r.cy)} rx={n1(r.rx)} ry={n1(r.ry)} />)}
      {grid.lines.map((l, i) => {
        const dx = Math.cos(l.a) * FAR, dy = Math.sin(l.a) * FAR;
        return <line key={i} className={cls(l.shared)} x1={n1(l.x - dx)} y1={n1(-(l.y - dy))} x2={n1(l.x + dx)} y2={n1(-(l.y + dy))} />;
      })}
    </g>
  );
}

/** Under the inspector's header: which grid the letter is on, and the letters drawn on the same one. */
export function GridBar({ ch, font, group }: { ch: string; font: Font; group: GridGroup }) {
  return (
    <div className="grid-bar" role="group" aria-label={`${group.name}: ${group.label}`}>
      <span className="grid-name">{group.name}</span>
      <span className="grid-label">{group.label}</span>
      <div className="grid-chars">
        {group.chars.map(c => {
          const g = font.glyph(c);
          return (
            <button key={c} className={c === ch ? 'cell on' : 'cell'} title={c === ch ? `${c} is on this grid` : `Inspect ${c}, on the same grid`}
              aria-label={c} aria-current={c === ch || undefined} onClick={() => actions.openInspector(c)}>
              <svg viewBox="0 -880 1000 1180" aria-hidden="true"><use href={`#g${c.charCodeAt(0)}`} x={g ? n1((1000 - g.adv) / 2) : 0} /></svg>
            </button>
          );
        })}
      </div>
      <span className="grow" />
      <span className="grid-key shared"><i />Shared with the group</span>
      <span className="grid-key"><i />Only {ch}</span>
    </div>
  );
}
