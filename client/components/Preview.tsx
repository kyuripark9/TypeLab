import type { CSSProperties, MouseEvent, ReactNode } from 'react';
import { RING_KEYS, type Font, type Line } from '../../shared/engine';
import { n1 } from '../lib/hooks';
import { useBlocks } from '../lib/preview';
import { actions, hlKeyOf, useEditor, useFont } from '../state/editor';

/** The large live preview. Glyph shapes come from <GlyphDefs>; this lays them out. */
export function Preview({ width }: { width: number }) {
  const font = useFont(), blocks = useBlocks(), hl = useEditor(hlKeyOf);
  if (width <= 0) return <div className="preview" />;
  const m = font.m, topU = Math.max(m.asc, m.cap) + 70, LH = topU - m.desc + 150;

  const pick = (e: MouseEvent) => {
    const g = (e.target as Element).closest('[data-c]');
    if (g) actions.openInspector(String.fromCharCode(Number(g.getAttribute('data-c'))));
  };

  return (
    <div className="preview" onClick={pick}>
      {blocks.map((b, bi) => {
        const sc = b.size / 1000, lines = font.layout(b.text, width / sc);
        const H = n1((lines.length * LH + 40) * sc);
        return (
          <svg key={bi} className={b.sub ? 'pv sub' : 'pv'} width={width} height={H} viewBox={`0 0 ${width} ${H}`}
            style={{ '--sw': n1(1.6 / sc) } as CSSProperties}>
            <g transform={`scale(${sc})`}>
              {lines.map((ln, i) => <PreviewLine key={i} line={ln} y={n1(topU + i * LH)} font={font} hl={hl} topU={topU} LH={LH} widthU={width / sc} />)}
            </g>
          </svg>
        );
      })}
    </div>
  );
}

function PreviewLine({ line, y, font, hl, topU, LH, widthU }: { line: Line; y: number; font: Font; hl: string | null; topU: number; LH: number; widthU: number }) {
  const m = font.m, out: ReactNode[] = [];
  const band = (key: string, x: number, w: number) => out.push(<rect key={key} className="pv-band" x={n1(x)} y={n1(y - m.cap)} width={n1(Math.max(0, w))} height={n1(m.cap)} />);
  if (hl === 'xHeight' || hl === 'height') {
    const gy = n1(y - (hl === 'height' ? m.cap : m.xh));
    out.push(<line key="guide" className="pv-guide" x1={0} x2={n1(widthU)} y1={gy} y2={gy} />);
    out.push(<line key="base" className="pv-guide base" x1={0} x2={n1(widthU)} y1={y} y2={y} />);
  }
  const ring = hl && RING_KEYS[hl];
  line.items.forEach((it, j) => {
    const g = font.glyph(it.ch);
    if (hl === 'wordSpacing' && it.ch === ' ') band(`w${j}`, it.x, it.adv);
    if (!g) return;
    const c = it.ch.charCodeAt(0);
    if (hl === 'sideBearing') { band(`l${j}`, it.x, g.lsb); band(`r${j}`, it.x + it.adv - g.rsb, g.rsb); }
    if (hl === 'letterSpacing') {
      const nx = line.items[j + 1], g2 = nx && font.glyph(nx.ch);
      if (nx && g2) band(`t${j}`, it.x + it.adv - g.rsb, nx.x + g2.lsb - (it.x + it.adv - g.rsb));
    }
    out.push(
      <g key={j} className="gl" data-c={c} transform={`translate(${n1(it.x)},${y})`}>
        <rect x={0} y={n1(-topU + 40)} width={n1(it.adv)} height={n1(LH - 80)} />
        <use href={`#g${c}`} />
        {hl && <use className={ring ? 'pv-ring' : 'pv-hl'} href={`#h${c}`} />}
      </g>
    );
  });
  return <>{out}</>;
}
