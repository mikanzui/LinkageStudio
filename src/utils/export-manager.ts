/**
 * Export Manager — shared unit handling and format dispatch for CAD exports.
 *
 * World coordinate convention: 25 world units = 1 cm = 10 mm.
 */

export type ExportUnit = 'mm' | 'cm' | 'm' | 'in';
export type ExportFormat = 'dxf' | 'solidworks';

/** Conversion factor: multiply world-unit value by this to get the target physical unit. */
export function worldToUnit(unit: ExportUnit): number {
  // 1 world unit = 0.4 mm
  switch (unit) {
    case 'mm': return 0.4;
    case 'cm': return 0.04;
    case 'm':  return 0.0004;
    case 'in': return 0.4 / 25.4; // ≈ 0.015748
  }
}

/** Convert a value in millimeters to the target output unit. */
export function mmToUnit(unit: ExportUnit): number {
  switch (unit) {
    case 'mm': return 1;
    case 'cm': return 0.1;
    case 'm':  return 0.001;
    case 'in': return 1 / 25.4;
  }
}

/** DXF $INSUNITS header code for each output unit. */
export function dxfInsUnitsCode(unit: ExportUnit): number {
  switch (unit) {
    case 'in': return 1;
    case 'mm': return 4;
    case 'cm': return 5;
    case 'm':  return 6;
  }
}

export const UNIT_LABELS: Record<ExportUnit, string> = {
  mm: 'Millimeters',
  cm: 'Centimeters',
  m: 'Meters',
  in: 'Inches',
};

export const FORMAT_LABELS: Record<ExportFormat, string> = {
  dxf: 'DXF (AutoCAD R12)',
  solidworks: 'SolidWorks Macro (.swb)',
};

export const FORMAT_EXTENSIONS: Record<ExportFormat, string> = {
  dxf: '.dxf',
  solidworks: '.swb',
};
