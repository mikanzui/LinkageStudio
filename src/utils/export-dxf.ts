import { buildCadScene, legacyCadGraph, singleLineComment, validateCadScene } from '../core/cad-scene';
import type { CadScene, LegacyCadArguments } from '../core/cad-scene';
import { cadNumber, DXF_UNIT_NOTE, scaleCadNumber, validateCadScale, worldToUnit } from './export-manager';
import type { ExportUnit } from './export-manager';

function hexToACI(hex: string): number {
  const rgb = [1, 3, 5].map(i => parseInt(hex.slice(i, i + 2), 16));
  const palette = [[1, 255, 0, 0], [2, 255, 255, 0], [3, 0, 255, 0], [4, 0, 255, 255],
    [5, 0, 0, 255], [6, 255, 0, 255], [7, 255, 255, 255], [8, 128, 128, 128], [9, 192, 192, 192], [30, 255, 127, 0]];
  let best = 7, distance = Infinity;
  for (const [index, ...color] of palette) {
    const d = color.reduce((sum, channel, i) => sum + (channel - rgb[i]) ** 2, 0);
    if (d < distance) { best = index; distance = d; }
  }
  return best;
}

export function writeDXF(scene: CadScene, unit: ExportUnit): string {
  const scale = worldToUnit(unit);
  validateCadScene(scene);
  validateCadScale(scene, scale);
  const out: string[] = [];
  const p = (code: number, value: string | number) => out.push(String(code), typeof value === 'number' ? cadNumber(value) : value);
  const n = (value: number) => scaleCadNumber(value, scale);
  const point = (xCode: number, point: { x: number; y: number }) => {
    p(xCode, n(point.x)); p(xCode + 10, n(-point.y)); p(xCode + 20, 0);
  };
  p(0, 'SECTION'); p(2, 'HEADER');
  p(9, '$ACADVER'); p(1, 'AC1009');
  p(9, '$LUNITS'); p(70, 2);
  p(9, '$LUPREC'); p(70, 8);
  p(999, `Linkage Studio coordinate unit: ${unit}`); p(999, DXF_UNIT_NOTE);
  for (const warning of scene.warnings) p(999, singleLineComment(warning.message));
  p(0, 'ENDSEC');
  p(0, 'SECTION'); p(2, 'TABLES');
  p(0, 'TABLE'); p(2, 'LTYPE'); p(70, 2);
  p(0, 'LTYPE'); p(2, 'CONTINUOUS'); p(70, 0); p(3, 'Solid'); p(72, 65); p(73, 0); p(40, 0);
  p(0, 'LTYPE'); p(2, 'DASHED'); p(70, 0); p(3, 'Dashed'); p(72, 65); p(73, 2);
  p(40, n(18.75)); p(49, n(12.5)); p(49, n(-6.25));
  p(0, 'ENDTAB');
  const hasZero = scene.layers.some(layer => layer.name === '0');
  p(0, 'TABLE'); p(2, 'LAYER'); p(70, scene.layers.length + (hasZero ? 0 : 1));
  if (!hasZero) { p(0, 'LAYER'); p(2, '0'); p(70, 0); p(62, 7); p(6, 'CONTINUOUS'); }
  for (const layer of scene.layers) {
    p(0, 'LAYER'); p(2, layer.name); p(70, 0); p(62, hexToACI(layer.color)); p(6, 'CONTINUOUS');
  }
  p(0, 'ENDTAB'); p(0, 'ENDSEC');
  p(0, 'SECTION'); p(2, 'ENTITIES');
  for (const entity of scene.entities) {
    p(999, singleLineComment(`${entity.kind} ${entity.sourceId}: ${entity.label}`));
    if (entity.type === 'circle') {
      p(0, 'CIRCLE'); p(8, entity.layer); point(10, entity.center); p(40, n(entity.radius));
    } else if (entity.type === 'line') {
      p(0, 'LINE'); p(8, entity.layer); p(6, entity.construction ? 'DASHED' : 'CONTINUOUS');
      point(10, entity.start); point(11, entity.end);
    } else {
      p(0, 'POLYLINE'); p(8, entity.layer); p(66, 1); p(70, entity.closed ? 1 : 0); point(10, { x: 0, y: 0 });
      for (const vertex of entity.points) { p(0, 'VERTEX'); p(8, entity.layer); point(10, vertex); p(70, 0); }
      p(0, 'SEQEND'); p(8, entity.layer);
    }
  }
  p(0, 'ENDSEC'); p(0, 'EOF');
  return out.join('\n') + '\n';
}

export function exportDXF(...[joints, links, bodies, baseBodyId, outlines, sliders, colliders, showLinksGlobal = true, unit = 'mm']:
  [...LegacyCadArguments, showLinksGlobal?: boolean, unit?: ExportUnit]): string {
  return writeDXF(buildCadScene(legacyCadGraph(joints, links, bodies, baseBodyId, outlines, sliders, colliders), showLinksGlobal), unit);
}
