/* Numeric labels describe the stored coordinate without changing its interpretation. */
export interface NumberScale { origin: number; units: number; precision?: number }

export const PERCENT_SCALE: NumberScale = { origin: 0, units: 100 };

/** Source poses retain their original quarter-turn range and saved neutral frame. Positive UI angles are clockwise. */
export function rotationScale(sourceBaseline: number | null): NumberScale {
  return sourceBaseline === null ? { origin: .5, units: 360 }
    : { origin: sourceBaseline, units: -90, precision: 2 };
}

export function numberAt(value: number, scale: NumberScale): number {
  const factor = 10 ** (scale.precision ?? 0), rounded = Math.round((value - scale.origin) * scale.units * factor) / factor;
  return rounded === 0 ? 0 : rounded;
}

export function valueAt(number: number, scale: NumberScale): number {
  const factor = 10 ** (scale.precision ?? 0), rounded = Math.round(number * factor) / factor;
  return Math.max(0, Math.min(1, rounded / scale.units + scale.origin));
}
