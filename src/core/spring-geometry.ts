import type { Joint, Link, MechanismSpring, Vec2 } from '../types';
import { resolveSpringAnchor, torsionGeometry } from './springs/spring-model';
import { distToSegment } from './math/vec2';

export function springPolyline(spring: MechanismSpring, joints: Record<string, Joint>, links: Record<string, Link>, zoom: number): Vec2[] {
  if (spring.kind === 'torsional') {
    const geometry = torsionGeometry(spring, joints, links);
    if (!geometry) return [];
    const { pivot, a, b } = geometry;
    const start = Math.atan2(a.y - pivot.y, a.x - pivot.x);
    const end = Math.atan2(b.y - pivot.y, b.x - pivot.x);
    const delta = Math.atan2(Math.sin(end - start), Math.cos(end - start));
    const radius = Math.max(12 / zoom, Math.min(Math.hypot(a.x - pivot.x, a.y - pivot.y), Math.hypot(b.x - pivot.x, b.y - pivot.y)) * .25);
    return Array.from({ length: 33 }, (_, i) => ({ x: pivot.x + radius * Math.cos(start + delta * i / 32), y: pivot.y + radius * Math.sin(start + delta * i / 32) }));
  }
  const a = resolveSpringAnchor(spring.anchorA, joints, links), b = resolveSpringAnchor(spring.anchorB, joints, links);
  if (!a || !b) return [];
  const dx = b.x - a.x, dy = b.y - a.y, length = Math.hypot(dx, dy);
  if (length < 1e-10) return [a, b];
  const amplitude = Math.min(5 / zoom, length / 8);
  const point = (t: number, offset = 0) => ({ x: a.x + dx * t - dy / length * offset, y: a.y + dy * t + dx / length * offset });
  if (spring.kind === 'damper') return [a, point(.3), point(.3, -amplitude), point(.7, -amplitude), point(.7, amplitude), point(.3, amplitude), point(.3), b];
  return [a, point(.15), ...Array.from({ length: 12 }, (_, i) => point(.2 + i * .6 / 11, i % 2 ? -amplitude : amplitude)), point(.85), b];
}

export function hitTestSpring(point: Vec2, springs: Record<string, MechanismSpring>, joints: Record<string, Joint>, links: Record<string, Link>, zoom: number): string | null {
  for (const spring of Object.values(springs).reverse()) {
    const points = springPolyline(spring, joints, links, zoom);
    if (points.some((p, i) => i > 0 && distToSegment(point, points[i - 1], p) <= 9 / zoom)) return spring.id;
  }
  return null;
}
