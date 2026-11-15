import type { Body, Joint, Outline, Vec2 } from '../types';
import { computeBodyTransform, localToWorld, worldToLocal } from './body-transform';

export function resolveFrozenOutlines(outlines: Record<string, Outline>, bodies: Record<string, Body>, joints: Record<string, Joint>, frozen: ReadonlyMap<string, Vec2[]>, editingId: string | null = null): Record<string, Outline> {
  const result = { ...outlines };
  for (const outline of Object.values(outlines)) {
    const points = frozen.get(outline.id), body = bodies[outline.bodyId];
    if (!points || !body || outline.id === editingId) continue;
    const transform = computeBodyTransform(body,joints);
    const current = outline.points.map(p=>localToWorld(p,transform));
    if (current.length === points.length && current.every((p,i)=>Math.hypot(p.x-points[i].x,p.y-points[i].y)<1e-9)) continue;
    result[outline.id] = { ...outline, points: points.map((p,i)=>({...outline.points[i],...worldToLocal(p,transform)})) };
  }
  return result;
}
