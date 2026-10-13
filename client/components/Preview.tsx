/* The large live preview: the text set in the design, line by line, each letter a <use> of its path in
   GlyphDefs (#g65, by char code; GlyphDefs must be mounted for anything to show) and, while the pointer is on
   the controls, for a moment and until a value is changed there (`faded`), of the active control's highlight (#h65),
   with the guides or spacing bands that control is about, each keyed by the control so its fade starts over. Clicking a letter opens it in the inspector. */
import type { CSSProperties, MouseEvent, ReactNode } from 'react';
import type { ControlKey } from '../../shared/content';
import { RING_KEYS, type Font, type Line } from '../../shared/engine';
import { n1 } from '../lib/hooks';
import { overhang, sampleText } from '../lib/preview';
import { actions, hlKeyOf, useEditor, useFont } from '../state/editor';

/** The preview's text at the preview's size, laid out to `width` px. */
export function Preview({ width }: { width: number }) {
  const font = useFont(), text = useEditor(s => sampleText(s.custom)), size = useEditor(s => s.size), hl = useEditor(hlKeyOf);
  if (width <= 0) return <div className="preview" />;
  const m = font.m, topU = Math.max(m.asc, m.cap) + 70, LH = topU - m.desc + 150;

  const pick = (e: MouseEvent) => {
    const g = (e.target as Element).closest('[data-c]');
    if (g) actions.openInspector(String.fromCharCode(Number(g.getAttribute('data-c'))));
  };

  const sc = size / 1000;
  // flourishes and tails can reach far out of the letters' boxes: the lines are set in from the
  // edges and the svg grows, as far as they reach, so none of the ink is cut off
  let lines = font.layout(text, width / sc), o = overhang(font, lines, width / sc, topU - 40, LH - topU);
  if (o.l + o.r > 0) { lines = font.layout(text, Math.max(width / sc / 2, width / sc - o.l - o.r)); o = overhang(font, lines, width / sc - o.l, topU - 40, LH - topU); }
  const H = n1((lines.length * LH + 40 + o.t + o.b) * sc);
  return (
    <div className="preview" onClick={pick}>
      <svg width={width} height={H} viewBox={`0 0 ${width} ${H}`} style={{ '--sw': n1(1.6 / sc), '--edge': n1(1 / sc) } as CSSProperties}>
        <g transform={`translate(${n1(o.l * sc)} ${n1(o.t * sc)}) scale(${sc})`}>
          {lines.map((ln, i) => <PreviewLine key={i} line={ln} y={n1(topU + i * LH)} font={font} hl={hl} topU={topU} LH={LH} widthU={width / sc} />)}
        </g>
      </svg>
    </div>
  );
}

function PreviewLine({ line, y, font, hl, topU, LH, widthU }: { line: Line; y: number; font: Font; hl: ControlKey | null; topU: number; LH: number; widthU: number }) {
  const m = font.m, out: ReactNode[] = [];
  const band = (key: string, x: number, w: number) => out.push(<rect key={key + hl} className="pv-band" x={n1(x)} y={n1(y - m.cap)} width={n1(Math.max(0, w))} height={n1(m.cap)} />);
  if (hl === 'xHeight' || hl === 'height') {
    const gy = n1(y - (hl === 'height' ? m.cap : m.xh));
    out.push(<line key={'guide' + hl} className="pv-guide" x1={0} x2={n1(widthU)} y1={gy} y2={gy} />);
    out.push(<line key={'base' + hl} className="pv-guide base" x1={0} x2={n1(widthU)} y1={y} y2={y} />);
  }
  const ring = hl && RING_KEYS[hl];
  line.items.forEach((it, j) => {
    const g = font.glyph(it.ch);
    if (hl === 'wordSpacing' && it.ch === ' ') band(`w${j}`, it.x, it.adv);
    if (!g) return;
    const c = it.ch.charCodeAt(0);
    if (hl === 'sideBearing' || hl === 'mono') { band(`l${j}`, it.x, g.lsb); band(`r${j}`, it.x + it.adv - g.rsb, g.rsb); }
    if (hl === 'letterSpacing') {
      const nx = line.items[j + 1], g2 = nx && font.glyph(nx.ch);
      if (nx && g2) band(`t${j}`, it.x + it.adv - g.rsb, nx.x + g2.lsb - (it.x + it.adv - g.rsb));
    }
    out.push(
      <g key={j} className="gl" data-c={c} transform={`translate(${n1(it.x)},${y})`}>
        <rect x={0} y={n1(-topU + 40)} width={n1(it.adv)} height={n1(LH - 80)} />
        <use href={`#g${c}`} />
        {hl && <use key={hl} className={ring ? 'pv-ring' : 'pv-hl'} href={`#h${c}`} />}
      </g>
    );
  });
  return <>{out}</>;
}
