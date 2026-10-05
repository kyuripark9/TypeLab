/* Live explainer diagrams. Each control gets a small figure drawn with the real glyph engine:
   the demo letters, the affected part highlighted, and a measurement or guide. */
import type { ReactNode } from 'react';
import { CONTROLS, FORM_OPTIONS, controlFor, type ActiveKey, type FormKey } from '../../shared/content';
import { RING_KEYS, applyM, buildFont, buildSerif, cmdsToD, expandStroke, roundContour, serifCup, serifSides, signedArea, termSpec, type Font, type LineItem, type Pt } from '../../shared/engine';
import { DEFAULTS, TERMINAL_FORMS, type BarEnds, type Fill, type SerifInner, type SerifShape, type SerifSide, type SerifTip, type Story, type Terminal, type TerminalForm } from '../../shared/params';
import { n1 } from '../lib/hooks';

export function Diagram({ font, k, W = 340, H = 178 }: { font: Font; k: ActiveKey; W?: number; H?: number }) {
  const hlKey = controlFor(k), ctl = CONTROLS[hlKey];
  const m = font.m, text = ctl.demo, line = font.layout(text, Infinity)[0];
  const hasDesc = /[gjpqy]/.test(text);
  const guides = k === 'xHeight' || k === 'height';
  // a serif's finer shape shows only close up: the diagram then frames the foot of the letters, on a baseline near its bottom edge
  const sf = ctl.zoom ? m.ctx.serif : null, foot = sf ? Math.max(sf.len * 1.2, sf.th * 2.4, m.s * 0.8) + sf.th : 0;
  const top = sf ? foot : Math.max(m.asc, m.cap) + 50, bot = sf ? -foot * 0.2 : hasDesc ? m.desc - 30 : k === 'width' ? -190 : -110;
  const padL = guides ? 64 : sf ? 52 : 22, padR = sf ? 52 : 22;
  const sc = Math.min((H - 18) / (top - bot), (W - padL - padR) / Math.max(1, line.width));
  const ox = padL + (W - padL - padR - line.width * sc) / 2, oy = sf ? H - 30 : (H - (top - bot) * sc) / 2 + top * sc;
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

const terminalPaths = new Map<string, { d: string; box: string }>();
/** A stroke end of `kind`, in its `form` when given (else the kind's first), drawn by the stroke expander. */
export function TerminalIcon({ kind, form }: { kind: Terminal; form?: TerminalForm }) {
  const key = `${kind}:${form ?? ''}`;
  let icon = terminalPaths.get(key);
  if (icon === undefined) {
    const ctx = { thick: 64, thin: 58, stress: 0, k: 0.5523, org: 0, terminal: kind, term: termSpec({ ...DEFAULTS, terminal: kind, terminalForm: form ?? TERMINAL_FORMS[kind][0] }) };
    const ex = expandStroke([['M', -40, -46], ['C', 60, -46, 130, -10, 172, 46]], { s: 'join', e: 'term' }, ctx);
    // the usual frame, grown to take in a drop that reaches past it
    let x1 = 226, y0 = -100, y1 = 90;
    for (const q of ex?.contours[0] ?? []) { x1 = Math.max(x1, q.x + 14); y0 = Math.min(y0, q.y - 14); y1 = Math.max(y1, q.y + 14); }
    icon = { d: ex ? outlineD(ex.contours[0]) : '', box: `-14 ${n1(y0)} ${n1(x1 + 14)} ${n1(y1 - y0)}` };
    terminalPaths.set(key, icon);
  }
  return <svg viewBox={icon.box} width="60" height="46" aria-hidden="true"><path d={icon.d} /></svg>;
}

const serifPaths = new Map<string, string>();
/** A stem's foot and its serif, drawn by the serif builder: the whole foot for the shapes, a closer view of
    one tip for the ways a serif can finish, or of the underside for a flat or cupped base. */
export function SerifIcon({ shape, tip = 'square', cupped = false, view = 'foot' }: { shape: SerifShape; tip?: SerifTip; cupped?: boolean; view?: 'foot' | 'tip' | 'base' }) {
  const key = `${shape}:${tip}:${cupped}:${view}`;
  let d = serifPaths.get(key);
  if (d === undefined) {
    // the closer views draw a heavier serif, so its finish reads at this size
    const th = (view === 'foot' ? 22 : 30) * (({ unbracketed: 0.6, slab: 1.6 } as Record<string, number>)[shape] ?? 1);
    const serif = { len: 62, th, shape, angle: 0.15, tip, tipRound: 0.5, tipSlant: 0.6, cup: cupped ? 1 : 0 }, cup = serifCup(serif);
    const ctx = { thick: 56, thin: 40, stress: 0, k: 0.5523, org: 0, terminal: 'flat', serif };
    const stem = [{ x: 72, y: 150 }, { x: 72, y: cup }, { x: 128, y: cup }, { x: 128, y: 150 }];
    const sf = buildSerif({ x: 100, y: cup, dx: 0, dy: -1, t: 56, type: 'flat' }, 'both', ctx, undefined, cup);
    d = outlineD(stem) + (sf ? outlineD(sf) : '');
    serifPaths.set(key, d);
  }
  if (view === 'tip') return <svg viewBox="92 -78 112 90" width="52" height="42" aria-hidden="true"><path d={d} /></svg>;
  if (view === 'base') return <svg viewBox="0 -76 200 88" width="96" height="42" aria-hidden="true"><path d={d} /></svg>;
  return <svg viewBox="0 -160 200 170" width="52" height="44" aria-hidden="true"><path d={d} /></svg>;
}

/** The foot of a letter with two stems, as of an n, drawn by the serif builder: its serifs on the sides `sides`
    keeps, and the ones that reach in between the stems in the shape `inner`, when that is one of their own. */
export function SerifSidesIcon({ shape, sides = 'both', inner = 'same', large = false }: { shape: SerifShape; sides?: SerifSide; inner?: SerifInner; large?: boolean }) {
  const key = `${shape}:${sides}:${inner}:sides`;
  let d = serifPaths.get(key);
  if (d === undefined) {
    const th = (sh: string) => 15 * (({ unbracketed: 0.6, slab: 1.6 } as Record<string, number>)[sh] ?? 1);
    const serif = { len: 27, th: th(shape), shape, angle: 0.15, inner: inner === 'same' ? null : { shape: inner, th: th(inner), len: 1 } };
    const ctx = { thick: 30, thin: 22, stress: 0, k: 0.5523, org: 0, terminal: 'flat', serif };
    // the two stems hang from a bar, so they read as one letter with an inside
    d = outlineD([{ x: 35, y: 150 }, { x: 35, y: 124 }, { x: 165, y: 124 }, { x: 165, y: 150 }]);
    for (const [x, inward] of [[50, 'b'], [150, 'a']] as const) {
      const keep = serifSides('both', sides, inward);
      const sf = keep && buildSerif({ x, y: 0, dx: 0, dy: -1, t: 30, type: 'flat' }, keep, ctx, undefined, 0, inward);
      d += outlineD([{ x: x - 15, y: 150 }, { x: x - 15, y: 0 }, { x: x + 15, y: 0 }, { x: x + 15, y: 150 }]) + (sf ? outlineD(sf) : '');
    }
    serifPaths.set(key, d);
  }
  return <svg viewBox="0 -150 200 160" width={large ? 65 : 50} height={large ? 52 : 40} aria-hidden="true"><path d={d} /></svg>;
}

/* Fill icons are a real 'a' from the engine, bold and on a coarse grid so the fill reads small. */
const fillPaths = new Map<Fill, { d: string; w: number }>();
export function FillIcon({ fill }: { fill: Fill }) {
  let icon = fillPaths.get(fill);
  if (!icon) {
    const g = buildFont({ ...DEFAULTS, weight: 0.72, xHeight: 0.8, counter: 0.6, fill, module: fill === 'wire' ? 0.4 : fill === 'shadow' ? 0.3 : 0.62 }).glyph('a');
    icon = { d: g?.d ?? '', w: g?.adv ?? 500 };
    fillPaths.set(fill, icon);
  }
  return <svg viewBox={`0 -620 ${n1(icon.w)} 680`} width="46" height="40" aria-hidden="true"><path d={icon.d} /></svg>;
}

/* Storey icons are the engine's two a's, bold enough to read small. */
const storyPaths = new Map<Story, { d: string; w: number }>();
export function StoryIcon({ story }: { story: Story }) {
  let icon = storyPaths.get(story);
  if (!icon) {
    const g = buildFont({ ...DEFAULTS, weight: 0.6, xHeight: 0.8, story }).glyph('a');
    icon = { d: g?.d ?? '', w: g?.adv ?? 500 };
    storyPaths.set(story, icon);
  }
  return <svg viewBox={`0 -620 ${n1(icon.w)} 680`} width="46" height="40" aria-hidden="true"><path d={icon.d} /></svg>;
}

/* Crossbar gap icons: the engine's A with its bar's gap open each way, bold enough to read small. */
const barPaths = new Map<BarEnds, { d: string; box: string }>();
export function BarEndsIcon({ ends }: { ends: BarEnds }) {
  let icon = barPaths.get(ends);
  if (!icon) {
    const f = buildFont({ ...DEFAULTS, weight: 0.6, crossbar: 0.4, barGap: ends === 'through' ? 0.5 : 0.3, barEnds: ends }), g = f.glyph('A');
    icon = { d: g?.d ?? '', box: `0 ${n1(-f.m.cap - 60)} ${n1(g?.adv ?? 600)} ${n1(f.m.cap + 120)}` };
    barPaths.set(ends, icon);
  }
  return <svg viewBox={icon.box} width="46" height="40" aria-hidden="true"><path d={icon.d} /></svg>;
}

/* Letter-shape icons: the letter each option shapes, drawn by the engine in that shape, bold
   enough to read small and framed from descender to ascender. */
const formPaths = new Map<string, { d: string; box: string }>();
export function FormIcon({ k, id }: { k: FormKey; id: string }) {
  const key = `${k}:${id}`;
  let icon = formPaths.get(key);
  if (!icon) {
    const f = buildFont({ ...DEFAULTS, weight: 0.6, xHeight: 0.8, [k]: id }), g = f.glyph(FORM_OPTIONS[k].ch);
    icon = { d: g?.d ?? '', box: `0 ${n1(-f.m.asc - 30)} ${n1(g?.adv ?? 500)} ${n1(f.m.asc - f.m.desc + 60)}` };
    formPaths.set(key, icon);
  }
  return <svg viewBox={icon.box} width="46" height="40" aria-hidden="true"><path d={icon.d} /></svg>;
}
