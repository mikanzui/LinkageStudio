import type { Body, Joint, Vec2 } from '../types';
import { sub, add, rotate } from './math/vec2';

export interface BodyTransform {
  origin: Vec2;
  angle: number;
}

/**
 * Compute a rigid body's reference frame from its joint positions.
 * Origin = centroid of all joints in the body.
 * Angle = direction from centroid to first joint (reference direction).
 * For 0 joints: origin (0,0), angle 0.
 * For 1 joint: origin = that joint, angle 0.
 */
export function computeBodyTransform(
  body: Body,
  joints: Record<string, Joint>,
): BodyTransform {
  const positions: Vec2[] = [];
  for (const jid of body.jointIds) {
    const j = joints[jid];
    if (j) positions.push(j.position);
  }

  if (positions.length === 0) {
    return { origin: { x: 0, y: 0 }, angle: 0 };
  }

  if (positions.length === 1) {
    return { origin: positions[0], angle: 0 };
  }

  // Centroid
  let cx = 0, cy = 0;
  for (const p of positions) { cx += p.x; cy += p.y; }
  cx /= positions.length;
  cy /= positions.length;
  const origin = { x: cx, y: cy };

  if (body.frame && body.frame.jointIds.every(id => body.jointIds.includes(id))) {
    const [a, b] = body.frame.jointIds.map(id => joints[id]?.position);
    if (a && b && Math.hypot(b.x - a.x, b.y - a.y) > 1e-10) {
      return { origin, angle: Math.atan2(b.y - a.y, b.x - a.x) + body.frame.angleOffset };
    }
  }

  // Angle from centroid to first joint
  const dx = positions[0].x - cx;
  const dy = positions[0].y - cy;
  const angle = Math.atan2(dy, dx);

  return { origin, angle };
}

/** Initialize a stable pair without changing the legacy frame at the saved pose. */
export function stabilizeBodyFrame(body: Body, joints: Record<string, Joint>): Body {
  const withoutFrame = () => { const next = { ...body }; delete next.frame; return next; };
  if (body.frame && body.frame.jointIds.every(id => body.jointIds.includes(id) && joints[id])) {
    const [a,b] = body.frame.jointIds.map(id => joints[id].position);
    if (Math.hypot(b.x-a.x,b.y-a.y) > 1e-10) return body;
  }
  const first = body.jointIds.find(id => joints[id]);
  if (!first) return body.frame ? withoutFrame() : body;
  const a = joints[first].position;
  let farthest = first, separation = 0;
  for (const id of body.jointIds) {
    const b = joints[id]?.position;
    if (!b) continue;
    const d = Math.hypot(b.x-a.x,b.y-a.y);
    if (d > separation) { separation = d; farthest = id; }
  }
  if (separation <= 1e-10) return body.frame ? withoutFrame() : body;
  const b = joints[farthest].position;
  return { ...body, frame: { jointIds: [first, farthest], angleOffset: computeBodyTransform(body,joints).angle - Math.atan2(b.y-a.y,b.x-a.x) } };
}

/** Convert a local-frame point to world coordinates. */
export function localToWorld(localPt: Vec2, transform: BodyTransform): Vec2 {
  const rotated = rotate(localPt, transform.angle);
  return add(transform.origin, rotated);
}

/** Convert a world point to local-frame coordinates. */
export function worldToLocal(worldPt: Vec2, transform: BodyTransform): Vec2 {
  const relative = sub(worldPt, transform.origin);
  return rotate(relative, -transform.angle);
}

function polygonMoments(points: Vec2[]) {
  const origin = points[0] ?? { x: 0, y: 0 };
  let area2 = 0, mx = 0, my = 0;
  // A translated triangle fan avoids catastrophic cancellation far from the origin.
  for (let i = 1; i < points.length - 1; i++) {
    const ax = points[i].x - origin.x, ay = points[i].y - origin.y;
    const bx = points[i+1].x - origin.x, by = points[i+1].y - origin.y;
    const cross = ax*by - ay*bx;
    area2 += cross; mx += (ax+bx)*cross; my += (ay+by)*cross;
  }
  return { origin, area2, mx, my };
}

export function polygonArea(points: Vec2[]): number {
  return Math.abs(polygonMoments(points).area2 / 2);
}

export function polygonCentroid(points: Vec2[]): Vec2 {
  if (!points.length) return { x: 0, y: 0 };
  const { origin, area2, mx, my } = polygonMoments(points);
  if (Math.abs(area2) < 2e-10) {
    let x = 0, y = 0;
    for (const p of points) { x += (p.x-origin.x)/points.length; y += (p.y-origin.y)/points.length; }
    return { x: origin.x+x, y: origin.y+y };
  }
  return { x: origin.x+mx/(3*area2), y: origin.y+my/(3*area2) };
}
