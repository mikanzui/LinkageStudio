import type { Vec2 } from '../types';

export interface RadialControl { key: string; x: number; y: number; width: number; height: number; angle: number }
export interface RadialLayout { variant: 'orbit' | 'list'; center: Vec2; controls: RadialControl[]; width: number; height: number }
export function controlBounds(control: RadialControl) {
  const angle = control.angle * Math.PI / 180;
  const width = Math.abs(Math.cos(angle)) * control.width + Math.abs(Math.sin(angle)) * control.height;
  const height = Math.abs(Math.sin(angle)) * control.width + Math.abs(Math.cos(angle)) * control.height;
  return { left: control.x - width / 2, right: control.x + width / 2, top: control.y - height / 2, bottom: control.y + height / 2 };
}
export function radialLayout(anchor: Vec2, bodyIds: string[], canAdd: boolean, width: number, height: number, coarse = false): RadialLayout {
  width = Math.max(1, width); height = Math.max(1, height);
  const radius = coarse ? 128 : 100, rowHeight = coarse ? 44 : 32;
  const span = Math.max(0, bodyIds.length - 1) * 40;
  const point = (key: string, degrees: number, body: boolean): RadialControl => {
    const angle = (degrees - 90) * Math.PI / 180, rotation = degrees - 90;
    return { key, x: Math.cos(angle) * radius, y: Math.sin(angle) * radius,
      width: body ? 112 : rowHeight, height: rowHeight,
      angle: body ? rotation > 90 ? rotation - 180 : rotation < -90 ? rotation + 180 : rotation : 0 };
  };
  const controls = bodyIds.map((key, index) => point('body:' + key, 315 - span / 2 + index * 40, true));
  if (canAdd) controls.push(point('__add_body__', 315 + span / 2 + 40, false));
  controls.push(point('__delete__', 135, false), { key: '__close__', x: 0, y: 0, width: rowHeight, height: rowHeight, angle: 0 });
  const bounds = controls.map(controlBounds);
  const left = Math.min(...bounds.map(b => b.left)), right = Math.max(...bounds.map(b => b.right));
  const top = Math.min(...bounds.map(b => b.top)), bottom = Math.max(...bounds.map(b => b.bottom));
  const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value));
  if (bodyIds.length > 6 || right - left + 16 > width || bottom - top + 16 > height) {
    const w = Math.min(240, Math.max(1, width - 16)), h = Math.min(bodyIds.length * rowHeight + rowHeight + 16, Math.max(1, height - 16));
    return { variant: 'list', center: { x: clamp(anchor.x, w / 2 + 8, width - w / 2 - 8), y: clamp(anchor.y, h / 2 + 8, height - h / 2 - 8) }, controls: [], width: w, height: h };
  }
  return { variant: 'orbit', center: { x: clamp(anchor.x, 8 - left, width - 8 - right), y: clamp(anchor.y, 8 - top, height - 8 - bottom) }, controls, width: right - left, height: bottom - top };
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
