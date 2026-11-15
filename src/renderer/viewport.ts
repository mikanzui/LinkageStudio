import type { MechanismState, Vec2, CameraState } from '../types';
import { computeBodyTransform, localToWorld } from '../core/body-transform';
export const MIN_ZOOM = .01;
export const MAX_ZOOM = 10;
export const clampZoom = (zoom: number) => Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, zoom));

export function fitMechanism(graph: MechanismState, width: number, height: number, padding = 72): CameraState {
  const ids = new Set(Object.values(graph.bodies).filter(b => b.id !== graph.baseBodyId).flatMap(b => b.jointIds));
  const fixedOnly = new Set(graph.bodies[graph.baseBodyId]?.jointIds.filter(id => !ids.has(id)) ?? []);
  const points: Vec2[] = Object.values(graph.joints).filter(j => !j.hidden && !fixedOnly.has(j.id)).map(j => j.position);
  for (const o of Object.values(graph.outlines)) {
    const body = graph.bodies[o.bodyId];
    if (o.visible && body && body.id !== graph.baseBodyId) points.push(...o.points.map(p => localToWorld(p, computeBodyTransform(body, graph.joints))));
  }
  const finite = points.filter(p => Number.isFinite(p.x) && Number.isFinite(p.y));
  if (!finite.length) return { pan: { x: width / 2, y: height / 2 }, zoom: 1 };
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const p of finite) { minX = Math.min(minX, p.x); minY = Math.min(minY, p.y); maxX = Math.max(maxX, p.x); maxY = Math.max(maxY, p.y); }
  const zoom = clampZoom(Math.min(Math.max(1, width - padding * 2) / Math.max(100, maxX - minX), Math.max(1, height - padding * 2) / Math.max(100, maxY - minY), 2));
  return { zoom, pan: { x: width / 2 - (minX + maxX) * zoom / 2, y: height / 2 - (minY + maxY) * zoom / 2 } };
}
