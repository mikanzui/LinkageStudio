import type { Joint, Link, MechanismSpring, SpringAnchor, Vec2 } from '../../types';
import {
  equilibriumRestLength,
  linearSpringAccelerationOnB,
  siDampingToSim,
  siStiffnessToSim,
} from './spring-forces';

/** Snap link parameter t to multiples of 1/steps (min 2 steps). */
export function quantizeSpringLinkT(t: number, resolutionSteps: number): number {
  const s = Math.max(2, Math.floor(resolutionSteps));
  const n = Math.round(t * s);
  return Math.max(0, Math.min(1, n / s));
}

/** World-space endpoints using current `joint.position` (editor / post-sim state). */
export function springEndpointsWorld(
  spring: MechanismSpring,
  joints: Record<string, Joint>,
  links: Record<string, Link>,
): { a: Vec2; b: Vec2 } | null {
  const resolve = (anchor: SpringAnchor): Vec2 | null => {
    if (anchor.type === 'joint') {
      const j = joints[anchor.jointId];
      return j ? { x: j.position.x, y: j.position.y } : null;
    }
    const link = links[anchor.linkId];
    if (!link) return null;
    const j0 = joints[link.jointIds[0]];
    const j1 = joints[link.jointIds[1]];
    if (!j0 || !j1) return null;
    const t = Math.max(0, Math.min(1, anchor.t));
    return {
      x: j0.position.x + t * (j1.position.x - j0.position.x),
      y: j0.position.y + t * (j1.position.y - j0.position.y),
    };
  };
  const a = resolve(spring.anchorA);
  const b = resolve(spring.anchorB);
  if (!a || !b) return null;
  return { a, b };
}

interface Resolved {
  x: number;
  y: number;
  vx: number;
  vy: number;
  /** If set, acceleration is added to this free-DOF row index (start of x in q). */
  idx?: number;
  /** Link endpoint split: push fraction (1-t) to idxA, t to idxB */
  split?: { idxA?: number; idxB?: number; t: number };
}

function resolveAnchor(
  anchor: SpringAnchor,
  joints: Record<string, Joint>,
  links: Record<string, Link>,
  q: Float64Array,
  v: Float64Array,
  jointIndex: Map<string, number>,
): Resolved | null {
  if (anchor.type === 'joint') {
    const j = joints[anchor.jointId];
    if (!j) return null;
    const idx = jointIndex.get(anchor.jointId);
    if (idx === undefined) {
      return { x: j.position.x, y: j.position.y, vx: 0, vy: 0 };
    }
    return { x: q[idx], y: q[idx + 1], vx: v[idx], vy: v[idx + 1], idx };
  }
  const link = links[anchor.linkId];
  if (!link) return null;
  const j0 = joints[link.jointIds[0]];
  const j1 = joints[link.jointIds[1]];
  if (!j0 || !j1) return null;
  const t = Math.max(0, Math.min(1, anchor.t));
  const i0 = jointIndex.get(link.jointIds[0]);
  const i1 = jointIndex.get(link.jointIds[1]);
  const x0 = i0 !== undefined ? q[i0] : j0.position.x;
  const y0 = i0 !== undefined ? q[i0 + 1] : j0.position.y;
  const x1 = i1 !== undefined ? q[i1] : j1.position.x;
  const y1 = i1 !== undefined ? q[i1 + 1] : j1.position.y;
  const vx0 = i0 !== undefined ? v[i0] : 0;
  const vy0 = i0 !== undefined ? v[i0 + 1] : 0;
  const vx1 = i1 !== undefined ? v[i1] : 0;
  const vy1 = i1 !== undefined ? v[i1 + 1] : 0;
  const om = 1 - t;
  return {
    x: x0 + t * (x1 - x0),
    y: y0 + t * (y1 - y0),
    vx: vx0 * om + vx1 * t,
    vy: vy0 * om + vy1 * t,
    split: { idxA: i0, idxB: i1, t },
  };
}

function addAccToResolved(
  r: Resolved,
  dax: number,
  day: number,
  outAx: Float64Array,
  outAy: Float64Array,
  freeRow: (idx: number) => number,
) {
  if (r.split) {
    const { idxA, idxB, t } = r.split;
    const om = 1 - t;
    if (idxA !== undefined) {
      const row = freeRow(idxA);
      if (row >= 0) {
        outAx[row] += dax * om;
        outAy[row] += day * om;
      }
    }
    if (idxB !== undefined) {
      const row = freeRow(idxB);
      if (row >= 0) {
        outAx[row] += dax * t;
        outAy[row] += day * t;
      }
    }
    return;
  }
  if (r.idx !== undefined) {
    const row = freeRow(r.idx);
    if (row >= 0) {
      outAx[row] += dax;
      outAy[row] += day;
    }
  }
}

/**
 * Per free joint row index i (0..n-1), add spring acceleration contributions into outAx/outAy.
 * jointIndex maps joint id → start index in q (2*i style).
 */
export function accumulateLinearSpringAccelerations(
  springs: Record<string, MechanismSpring>,
  joints: Record<string, Joint>,
  links: Record<string, Link>,
  q: Float64Array,
  v: Float64Array,
  jointIndex: Map<string, number>,
  outAx: Float64Array,
  outAy: Float64Array,
): void {
  const freeRow = (qIdx: number) => qIdx / 2;

  for (const sp of Object.values(springs)) {
    if (sp.kind !== 'linear') continue;
    const ra = resolveAnchor(sp.anchorA, joints, links, q, v, jointIndex);
    const rb = resolveAnchor(sp.anchorB, joints, links, q, v, jointIndex);
    if (!ra || !rb) continue;

    const pA: Vec2 = { x: ra.x, y: ra.y };
    const pB: Vec2 = { x: rb.x, y: rb.y };
    const vA: Vec2 = { x: ra.vx, y: ra.vy };
    const vB: Vec2 = { x: rb.vx, y: rb.vy };
    const LEq = equilibriumRestLength(sp.restLength, sp.prestressDelta);
    const k = siStiffnessToSim(sp.stiffness);
    const c = siDampingToSim(sp.damping);

    const accB = linearSpringAccelerationOnB(pA, pB, vA, vB, k, c, LEq);
    const accA = { ax: -accB.ax, ay: -accB.ay };

    addAccToResolved(rb, accB.ax, accB.ay, outAx, outAy, freeRow);
    addAccToResolved(ra, accA.ax, accA.ay, outAx, outAy, freeRow);
  }
}
