import type { Joint, Link, MechanismSpring, Vec2 } from '../types';
import { springPolyline } from '../core/spring-geometry';

export function drawSprings(ctx: CanvasRenderingContext2D, springs: Record<string, MechanismSpring>, joints: Record<string, Joint>, links: Record<string, Link>, zoom: number, selected: Set<string>, pending?: Vec2 | null, cursor?: Vec2 | null): void {
  ctx.save(); ctx.lineWidth = 2 / zoom;
  for (const spring of Object.values(springs)) {
    const points = springPolyline(spring, joints, links, zoom);
    if (points.length < 2) continue;
    ctx.strokeStyle = selected.has(spring.id) ? '#1976d2' : spring.kind === 'linear' ? '#a65c00' : spring.kind === 'damper' ? '#00838f' : '#af3687';
    ctx.beginPath(); points.forEach((point, i) => i ? ctx.lineTo(point.x, point.y) : ctx.moveTo(point.x, point.y)); ctx.stroke();
    for (const p of [points[0], points[points.length - 1]]) {
      ctx.beginPath(); ctx.arc(p.x, p.y, 3 / zoom, 0, Math.PI * 2); ctx.stroke();
    }
  }
  if (pending) {
    ctx.strokeStyle = '#1976d2'; ctx.setLineDash([5 / zoom, 4 / zoom]);
    ctx.beginPath(); ctx.arc(pending.x, pending.y, 7 / zoom, 0, Math.PI * 2);
    if (cursor) { ctx.moveTo(pending.x, pending.y); ctx.lineTo(cursor.x, cursor.y); } ctx.stroke();
  }
  ctx.restore();
}
