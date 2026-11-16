import type { CadScene } from '../core/cad-scene';

export type ExportUnit = 'mm' | 'cm' | 'm' | 'in';
export type ExportFormat = 'dxf' | 'solidworks';

export function assertExportUnit(unit: ExportUnit): void {
  if (unit !== 'mm' && unit !== 'cm' && unit !== 'm' && unit !== 'in') throw new Error('Unsupported CAD unit; choose mm, cm, m or in.');
}
export function mmToUnit(unit: ExportUnit): number {
  assertExportUnit(unit);
  return { mm: 1, cm: 0.1, m: 0.001, in: 1 / 25.4 }[unit];
}
export function worldToUnit(unit: ExportUnit): number {
  assertExportUnit(unit);
  return { mm: 0.4, cm: 0.04, m: 0.0004, in: 0.4 / 25.4 }[unit];
}
/** R2000+ only: the R12 writer deliberately does not emit $INSUNITS. */
export function dxfInsUnitsCode(unit: ExportUnit): number {
  assertExportUnit(unit);
  return { mm: 4, cm: 5, m: 6, in: 1 }[unit];
}

/** Round-trip decimal representation, without rounding small nonzero geometry to zero. */
export function cadNumber(value: number): string {
  if (!Number.isFinite(value)) throw new Error('CAD numbers must be finite.');
  if (value === 0) return '0';
  const text = String(value);
  if (!/[eE]/.test(text)) return text;
  const [mantissa, exponent] = text.toLowerCase().split('e');
  const sign = mantissa.startsWith('-') ? '-' : '';
  const unsigned = mantissa.replace('-', '');
  const [integer, fraction = ''] = unsigned.split('.');
  const digits = integer + fraction;
  const decimal = integer.length + Number(exponent);
  if (decimal <= 0) return sign + '0.' + '0'.repeat(-decimal) + digits;
  if (decimal >= digits.length) return sign + digits + '0'.repeat(decimal - digits.length);
  return sign + digits.slice(0, decimal) + '.' + digits.slice(decimal);
}
export function scaleCadNumber(value: number, scale: number): number {
  if (!Number.isFinite(value) || !Number.isFinite(scale) || scale <= 0) throw new Error('CAD geometry and scale must be finite.');
  const scaled = value * scale;
  if (!Number.isFinite(scaled) || (value !== 0 && scaled === 0)) throw new Error('CAD unit conversion overflow or underflow.');
  return scaled;
}

/** Reject representational loss instead of emitting a zero-length edge after conversion. */
export function validateCadScale(scene: CadScene, scale: number): void {
  const point = (p: { x: number; y: number }) => ({ x: scaleCadNumber(p.x, scale), y: scaleCadNumber(p.y, scale) });
  const edge = (a: { x: number; y: number }, b: { x: number; y: number }) => {
    const start = point(a), end = point(b);
    if (start.x === end.x && start.y === end.y) throw new Error('CAD unit conversion loses segment precision.');
  };
  for (const entity of scene.entities) {
    if (entity.type === 'circle') { point(entity.center); scaleCadNumber(entity.radius, scale); }
    else if (entity.type === 'line') edge(entity.start, entity.end);
    else {
      const edges = entity.closed ? entity.points.length : entity.points.length - 1;
      for (let i = 0; i < edges; i++) edge(entity.points[i], entity.points[(i + 1) % entity.points.length]);
    }
  }
}

export const DXF_UNIT_NOTE = 'R12 coordinates use the selected unit. R12 has no standard insertion-unit metadata; explicitly choose the same unit when importing.';
export const UNIT_LABELS: Record<ExportUnit, string> = { mm: 'Millimeters', cm: 'Centimeters', m: 'Meters', in: 'Inches' };
export const FORMAT_LABELS: Record<ExportFormat, string> = { dxf: 'DXF (AutoCAD R12)', solidworks: 'SolidWorks Macro (.swb)' };
export const FORMAT_EXTENSIONS: Record<ExportFormat, string> = { dxf: '.dxf', solidworks: '.swb' };
