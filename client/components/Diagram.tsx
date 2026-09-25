/* Live explainer diagrams. Each control gets a small figure drawn with the real glyph engine:
   the demo letters, the affected part highlighted, and a measurement or guide. */
import type { ReactNode } from 'react';
import { CONTROLS, controlFor, type ActiveKey } from '../../shared/content';
import { RING_KEYS, applyM, buildSerif, cmdsToD, expandStroke, roundContour, signedArea, type Font, type LineItem, type Pt } from '../../shared/engine';
import type { SerifShape, Terminal } from '../../shared/params';
import { n1 } from '../lib/hooks';

export function Diagram({ font, k, W = 340, H = 178 }: { font: Font; k: ActiveKey; W?: number; H?: number }) {
  const hlKey = controlFor(k), ctl = CONTROLS[hlKey];
  const m = font.m, text = ctl.demo, line = font.layout(text, Infinity)[0];
  const hasDesc = /[gjpqy]/.test(text);
  const guides = k === 'xHeight' || k === 'height';
  const top = Math.max(m.asc, m.cap) + 50, bot = hasDesc ? m.desc - 30 : k === 'width' ? -190 : -110;
  const padL = guides ? 64 : 22, padR = 22;
  const sc = Math.min((H - 18) / (top - bot), (W - padL - padR) / Math.max(1, line.width));
  const ox = padL + (W - padL - padR - line.width * sc) / 2, oy = (H - (top - bot) * sc) / 2 + top * sc;
  const X = (x: number) => n1(ox + x * sc), Y = (y: number) => n1(oy - y * sc);
  const body = (it: LineItem, x: number, y: number): [number, number] => {
    const p = applyM(font.glyph(it.ch)!.M, x, y);
    return [X(it.x + p[0]), Y(p[1])];
  };
  const items = line.items.filter(it => font.glyph(it.ch));

  const under: ReactNode[] = [], over: ReactNode[] = [];
  const hline = (key: string, y: number, cls: string, label?: string) => under.push(
    <g key={key}>
      <line className={cls} x1={guides ? 8 : 0} x2={W} y1={Y(y)} y2={Y(y)} />
      {label && <text className="d-label" x={8} y={Y(y) - 4}>{label}</text>}
    </g>
  );
  hline('base', 0, 'd-guide', guides ? 'Baseline' : undefined);
  if (k === 'xHeight') {
    under.push(<rect key="band" className="d-band" x={0} width={W} y={Y(m.xh)} height={n1(m.xh * sc)} />);
    hline('cap', m.cap, 'd-guide', 'Cap height');
    hline('xh', m.xh, 'd-guide hot', 'x-height');
  }
  if (k === 'height') {
    hline('cap', m.cap, 'd-guide hot', 'Cap height');
    hline('xh', m.xh, 'd-guide', 'x-height');
  }

  // spacing bands
  const band = (key: string, x0: number, x1: number) => under.push(
    <rect key={key} className="d-band strong" x={X(Math.min(x0, x1))} width={n1(Math.abs(x1 - x0) * sc)} y={Y(top - 40)} height={n1((top - 40 - bot - 10) * sc)} />
  );
  if (k === 'letterSpacing') items.forEach((it, i) => {
    const nx = items[i + 1];
    if (nx) band(`g${i}`, it.x + it.adv - font.glyph(it.ch)!.rsb, nx.x + font.glyph(nx.ch)!.lsb);
  });
  if (k === 'wordSpacing') line.items.forEach((it, i) => { if (it.ch === ' ') band(`w${i}`, it.x, it.x + it.adv); });
  if (k === 'sideBearing' || k === 'mono') items.forEach((it, i) => {
    const g = font.glyph(it.ch)!;
    band(`l${i}`, it.x, it.x + g.lsb);
    band(`r${i}`, it.x + it.adv - g.rsb, it.x + it.adv);
  });

  const dim = (key: string, a: [number, number], b: [number, number], cls: string) => {
    const dx = b[0] - a[0], dy = b[1] - a[1], l = Math.hypot(dx, dy) || 1, nx = -dy / l * 4, ny = dx / l * 4;
    over.push(
      <g key={key} className={cls}>
        <line x1={a[0]} y1={a[1]} x2={b[0]} y2={b[1]} />
        <line x1={n1(a[0] - nx)} y1={n1(a[1] - ny)} x2={n1(a[0] + nx)} y2={n1(a[1] + ny)} />
        <line x1={n1(b[0] - nx)} y1={n1(b[1] - ny)} x2={n1(b[0] + nx)} y2={n1(b[1] + ny)} />
      </g>
    );
  };
  const it0 = items[0], g0 = it0 && font.glyph(it0.ch)!;
  if (it0 && g0) {
    if (k === 'weight') dim('w', body(it0, 0, m.xh * 0.42), body(it0, m.s, m.xh * 0.42), 'd-dim light');
    if (k === 'width') dim('w', body(it0, 0, -95), body(it0, g0.bodyW, -95), 'd-dim');
    if (k === 'height') { const x = X(it0.x) - 12; dim('h', [x, Y(0)], [x, Y(m.cap)], 'd-dim'); }
    if (k === 'contrast') {
      dim('v', body(it0, 0, m.cap / 2), body(it0, m.s, m.cap / 2), 'd-dim light');
      dim('h', body(it0, g0.bodyW / 2, m.cap + m.os - m.hT), body(it0, g0.bodyW / 2, m.cap + m.os), 'd-dim light');
    }
    if (k === 'slant') {
      const cx = it0.x + g0.adv / 2, y0 = -70, y1 = m.cap + 90;
      over.push(<line key="a0" className="d-axis ghost" x1={X(cx)} x2={X(cx)} y1={Y(y0)} y2={Y(y1)} />);
      over.push(<line key="a1" className="d-axis" x1={X(cx + m.slant * (y0 - m.xh * 0.4))} x2={X(cx + m.slant * (y1 - m.xh * 0.4))} y1={Y(y0)} y2={Y(y1)} />);
    }
  }

  const ring = RING_KEYS[hlKey];
  return (
    <svg className="diagram" viewBox={`0 0 ${W} ${H}`} width={W} height={H} role="img" aria-label={`${ctl.tech} diagram`}>
      {under}
      <g transform={`translate(${n1(ox)},${n1(oy)}) scale(${sc.toFixed(5)})`}>
        <g className="d-ink">{items.map((it, i) => <path key={i} d={font.glyph(it.ch)!.d} transform={`translate(${n1(it.x)},0)`} />)}</g>
        <g className={ring ? 'd-ring' : 'd-hl'} strokeWidth={ring ? n1(1.6 / sc) : undefined}>
          {items.map((it, i) => <path key={i} d={font.hl(it.ch, hlKey)} transform={`translate(${n1(it.x)},0)`} />)}
        </g>
      </g>
      {over}
    </svg>
  );
}

/* ---- small static previews for option buttons */
const outlineD = (pts: Pt[]) => cmdsToD(roundContour(signedArea(pts) < 0 ? pts.slice().reverse() : pts, 0));

const terminalPaths = new Map<Terminal, string>();
export function TerminalIcon({ kind }: { kind: Terminal }) {
  let d = terminalPaths.get(kind);
  if (d === undefined) {
    const ctx = { thick: 64, thin: 58, stress: 0, k: 0.5523, org: 0, terminal: kind };
    const ex = expandStroke([['M', -40, -46], ['C', 60, -46, 130, -10, 172, 46]], { s: 'join', e: 'term' }, ctx);
    d = ex ? outlineD(ex.contours[0]) : '';
    terminalPaths.set(kind, d);
  }
  return <svg viewBox="-14 -100 240 190" width="60" height="46" aria-hidden="true"><path d={d} /></svg>;
}

const serifPaths = new Map<SerifShape, string>();
export function SerifIcon({ shape }: { shape: SerifShape }) {
  let d = serifPaths.get(shape);
  if (d === undefined) {
    const ctx = { thick: 56, thin: 40, stress: 0, k: 0.5523, org: 0, terminal: 'flat',
      serif: { len: 62, th: 22 * (({ unbracketed: 0.6, slab: 1.6 } as Record<string, number>)[shape] ?? 1), shape, angle: 0.15 } };
    const stem = [{ x: 72, y: 150 }, { x: 72, y: 0 }, { x: 128, y: 0 }, { x: 128, y: 150 }];
    const sf = buildSerif({ x: 100, y: 0, dx: 0, dy: -1, t: 56, type: 'flat' }, 'both', ctx);
    d = outlineD(stem) + (sf ? outlineD(sf) : '');
    serifPaths.set(shape, d);
  }
  return <svg viewBox="0 -160 200 170" width="52" height="44" aria-hidden="true"><path d={d} /></svg>;
}
