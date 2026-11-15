import type { Vec2 } from '../../types';

export type { Vec2 } from '../../types';

export interface SweptBarrierCrossing {
  time: number;
  segmentT: number;
  normal: Vec2;
}

const EPSILON = 64 * Number.EPSILON;

/**
 * First side-changing contact in (0, 1], including finite-segment endpoints.
 * Start touches have no incoming side and are ignored. The normal is the unit
 * left normal of A -> C, independent of travel direction or permitted-side policy.
 */
export function sweptBarrierCrossing(
  pointFrom: Vec2,
  pointTo: Vec2,
  aFrom: Vec2,
  aTo: Vec2,
  cFrom: Vec2,
  cTo: Vec2,
): SweptBarrierCrossing | null {
  const inputs = [pointFrom, pointTo, aFrom, aTo, cFrom, cTo];
  if (inputs.some(p => !Number.isFinite(p.x) || !Number.isFinite(p.y))) return null;

  const d0 = { x: cFrom.x - aFrom.x, y: cFrom.y - aFrom.y };
  const d1 = { x: cTo.x - aTo.x, y: cTo.y - aTo.y };
  const r0 = { x: pointFrom.x - aFrom.x, y: pointFrom.y - aFrom.y };
  const r1 = { x: pointTo.x - aTo.x, y: pointTo.y - aTo.y };
  const dScale = Math.max(Math.abs(d0.x), Math.abs(d0.y), Math.abs(d1.x), Math.abs(d1.y));
  const rScale = Math.max(Math.abs(r0.x), Math.abs(r0.y), Math.abs(r1.x), Math.abs(r1.y));
  if (!(dScale > 0) || !(rScale > 0) || !Number.isFinite(dScale) || !Number.isFinite(rScale)) return null;

  // Independent relative-coordinate scales avoid overflow/underflow in the
  // quadratic without losing a short rail during a long point sweep.
  d0.x /= dScale; d0.y /= dScale;
  d1.x /= dScale; d1.y /= dScale;
  r0.x /= rScale; r0.y /= rScale;
  r1.x /= rScale; r1.y /= rScale;
  const dx = d1.x - d0.x, dy = d1.y - d0.y;
  const rx = r1.x - r0.x, ry = r1.y - r0.y;
  let a = dx * ry - dy * rx;
  let b = d0.x * ry - d0.y * rx + dx * r0.y - dy * r0.x;
  let c = d0.x * r0.y - d0.y * r0.x;
  const coefficientScale = Math.max(Math.abs(a), Math.abs(b), Math.abs(c));
  if (coefficientScale === 0) return null;
  a /= coefficientScale; b /= coefficientScale; c /= coefficientScale;
  let roots: number[];
  if (Math.abs(a) <= EPSILON) {
    if (Math.abs(b) <= EPSILON) return null;
    roots = [-c / b];
  } else {
    const discriminant = b * b - 4 * a * c;
    const discriminantTolerance = EPSILON * (b * b + Math.abs(4 * a * c));
    // A double root touches the supporting line but never changes side.
    if (discriminant <= discriminantTolerance) return null;
    const q = -0.5 * (b + (b < 0 ? -1 : 1) * Math.sqrt(discriminant));
    roots = [q / a, c / q].sort((x, y) => x - y);
  }

  for (const root of roots) {
    if (!Number.isFinite(root) || root <= EPSILON || root > 1 + EPSILON) continue;
    const time = Math.min(1, root);
    const derivative = b + 2 * a * time;
    if (Math.abs(derivative) <= EPSILON * (Math.abs(b) + Math.abs(2 * a * time))) continue;
    const x = d0.x + dx * time, y = d0.y + dy * time;
    const length = Math.hypot(x, y);
    if (length <= EPSILON) continue;
    const px = ((r0.x + rx * time) * rScale) / dScale;
    const py = ((r0.y + ry * time) * rScale) / dScale;
    const segmentT = (px * x + py * y) / (length * length);
    if (!Number.isFinite(segmentT) || segmentT < -EPSILON || segmentT > 1 + EPSILON) continue;
    return {
      time,
      segmentT: Math.max(0, Math.min(1, segmentT)),
      normal: { x: -y / length, y: x / length },
    };
  }
  return null;
}
