/** User-facing clarification for overlays / panels — matches `formatForce` (model-scaled labels, ~N equivalents). */
export const FORCE_READOUT_LABEL_HINT =
  'Displayed “N / kN” values are solver model units scaled for readability, not strict SI calibrated to masses in the file.';

export type ForceUnit = 'N' | 'kN';

/** Format a force value (in sim units) for display. */
export function formatForce(simForce: number, unit: ForceUnit = 'N'): string {
  const abs = Math.abs(simForce);
  let valStr: string;
  let suffix: string;

  if (unit === 'kN' || abs >= 1000) {
    valStr = (abs / 1000).toFixed(abs >= 10000 ? 0 : 1);
    suffix = 'kN';
  } else {
    if (abs >= 100) valStr = abs.toFixed(0);
    else if (abs >= 10) valStr = abs.toFixed(1);
    else valStr = abs.toFixed(2);
    suffix = 'N';
  }
  
  // Pad the numeric part to 5 characters (e.g. " 9.81", "123.4", "   45", " 0.50")
  valStr = valStr.padStart(5, ' ');
  return `${simForce < 0 ? '-' : ''}${valStr} ${suffix}`;
}

/**
 * Interpolate between two hex colours by factor t ∈ [0, 1].
 * Used for the tension/compression colour gradient.
 */
function lerpColor(a: string, b: string, t: number): string {
  const ra = parseInt(a.slice(1, 3), 16), ga = parseInt(a.slice(3, 5), 16), ba2 = parseInt(a.slice(5, 7), 16);
  const rb = parseInt(b.slice(1, 3), 16), gb = parseInt(b.slice(3, 5), 16), bb = parseInt(b.slice(5, 7), 16);
  const r = Math.round(ra + (rb - ra) * t);
  const g = Math.round(ga + (gb - ga) * t);
  const bl = Math.round(ba2 + (bb - ba2) * t);
  return `rgb(${r},${g},${bl})`;
}

/**
 * Map an axial force value to a colour on the compression–neutral–tension gradient.
 *
 * Blue (#2196F3) = compression (negative), Grey (#888) = zero, Red (#F44336) = tension (positive).
 *
 * @param axialForce  Signed force value.
 * @param maxForce    The value at which colour is fully saturated. Values beyond are clamped.
 */
export function forceToColor(axialForce: number, maxForce: number): string {
  if (maxForce < 1e-10) return '#888888';
  const t = Math.max(-1, Math.min(1, axialForce / maxForce));
  if (t < 0) {
    // compression: grey → blue
    return lerpColor('#888888', '#2196F3', -t);
  }
  // tension: grey → red
  return lerpColor('#888888', '#F44336', t);
}
