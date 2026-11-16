import type { Vec2 } from '../types';

export interface RadialControl { key: string; x: number; y: number; width: number; height: number; angle: number }
export interface RadialLayout { variant: 'orbit' | 'list'; center: Vec2; controls: RadialControl[]; width: number; height: number; radius: number }
export function controlBounds(control: RadialControl) {
  const angle = control.angle * Math.PI / 180;
  const width = Math.abs(Math.cos(angle)) * control.width + Math.abs(Math.sin(angle)) * control.height;
  const height = Math.abs(Math.sin(angle)) * control.width + Math.abs(Math.cos(angle)) * control.height;
  return { left: control.x - width / 2, right: control.x + width / 2, top: control.y - height / 2, bottom: control.y + height / 2 };
}
export function radialLayout(anchor: Vec2, bodyIds: string[], canAdd: boolean, width: number, height: number, coarse = false, bodyWidths: number[] = []): RadialLayout {
  width = Math.max(1, width); height = Math.max(1, height);
  const rowHeight = coarse ? 44 : 20;
  const span = Math.min(250, Math.max(32, (bodyIds.length - 1) * 32));
  const baseRadius = coarse ? 128 : bodyIds.length <= 1 ? 56 : 74;
  const maxPill = Math.max(64, ...bodyWidths);
  const pitch = span / Math.max(1, bodyIds.length - 1) * Math.PI / 180;
  // Retain the compact fork orbit for ordinary names, expanding only for crowded labels.
  const radius = bodyIds.length > 12 || maxPill > (coarse ? 128 : 100)
    ? Math.max(baseRadius, maxPill / 2 - rowHeight / 2 + rowHeight / (2 * Math.sin(pitch / 2))) : baseRadius;
  const point = (key: string, degrees: number, controlWidth: number, controlHeight: number, distance = radius): RadialControl => {
    const angle = (degrees - 90) * Math.PI / 180;
    const rotation = Math.atan2(Math.sin(angle), Math.cos(angle)) * 180 / Math.PI;
    return { key, x: Math.cos(angle) * distance, y: Math.sin(angle) * distance,
      width: controlWidth, height: controlHeight,
      angle: key.startsWith('body:') ? rotation > 90 || rotation < -90 ? rotation + 180 : rotation : 0 };
  };
  const controls = bodyIds.map((key, index) => point('body:' + key, 315 - span / 2 + (bodyIds.length > 1 ? index / (bodyIds.length - 1) * span : 0), bodyWidths[index] ?? 64, rowHeight));
  if (canAdd) controls.push(point('__add_body__', 315 + span / 2 + 32, rowHeight, rowHeight));
  const deleteSize = coarse ? 44 : 30;
  controls.push(point('__delete__', 135, deleteSize, deleteSize, radius + 8));
  const bounds = controls.map(controlBounds);
  const ring = radius + 27;
  const left = Math.min(-ring, ...bounds.map(b => b.left)), right = Math.max(ring, ...bounds.map(b => b.right));
  const top = Math.min(-ring, ...bounds.map(b => b.top)), bottom = Math.max(ring, ...bounds.map(b => b.bottom));
  const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value));
  if (bodyIds.length > 24 || right - left + 16 > width || bottom - top + 16 > height) {
    const listRow = coarse ? 44 : 32;
    const w = Math.min(240, Math.max(1, width - 16)), h = Math.min(bodyIds.length * listRow + listRow + 16, Math.max(1, height - 16));
    return { variant: 'list', center: { x: clamp(anchor.x, w / 2 + 8, width - w / 2 - 8), y: clamp(anchor.y, h / 2 + 8, height - h / 2 - 8) }, controls: [], width: w, height: h, radius };
  }
  return { variant: 'orbit', center: { x: clamp(anchor.x, 8 - left, width - 8 - right), y: clamp(anchor.y, 8 - top, height - 8 - bottom) }, controls, width: right - left, height: bottom - top, radius };
}
export function radialHit(layout: RadialLayout, point: Vec2): string | null {
  if (layout.variant !== 'orbit') return null;
  for (const control of layout.controls) {
    const dx = point.x - layout.center.x - control.x, dy = point.y - layout.center.y - control.y;
    const angle = -control.angle * Math.PI / 180;
    if (Math.abs(dx * Math.cos(angle) - dy * Math.sin(angle)) <= control.width / 2
      && Math.abs(dx * Math.sin(angle) + dy * Math.cos(angle)) <= control.height / 2) return control.key;
  }
  return null;
}
