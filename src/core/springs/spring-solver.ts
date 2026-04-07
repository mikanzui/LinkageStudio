import type { Joint, Link, MechanismSpring, SpringAnchor, Vec2 } from '../../types';
import {
  equilibriumRestLength,
  linearSpringAccelerationOnB,
  siDampingToSim,
  siStiffnessToSim,
  siTorsionDampingToSim,
  siTorsionStiffnessToSim,
} from './spring-forces';

/** Snap link parameter t to multiples of 1/steps (min 2 steps). */
export function quantizeSpringLinkT(t: number, resolutionSteps: number): number {
  const s = Math.max(2, Math.floor(resolutionSteps));
  const n = Math.round(t * s);
  return Math.max(0, Math.min(1, n / s));
}

/** Torsion springs attach only at link endpoints (pivot joint). */
export function quantizeTorsionSpringLinkT(t: number): number {
  return t < 0.5 ? 0 : 1;
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

/** World-space geometry for one torsion leg: pivot joint, unit vector from pivot toward distal joint. */
export type TorsionLegWorld = {
  pivotJointId: string;
  distalJointId: string;
  px: number;
  py: number;
  ux: number;
  uy: number;
  L: number;
};

export function resolveTorsionLinkLegWorld(
  anchor: SpringAnchor,
  joints: Record<string, Joint>,
  links: Record<string, Link>,
): TorsionLegWorld | null {
  if (anchor.type !== 'link') return null;
  const link = links[anchor.linkId];
  if (!link) return null;
  const j0 = joints[link.jointIds[0]];
  const j1 = joints[link.jointIds[1]];
  if (!j0 || !j1) return null;
  const t = quantizeTorsionSpringLinkT(anchor.t);
  const pivotJointId = t === 0 ? link.jointIds[0] : link.jointIds[1];
  const distalJointId = t === 0 ? link.jointIds[1] : link.jointIds[0];
  const piv = joints[pivotJointId];
  const dist = joints[distalJointId];
  if (!piv || !dist) return null;
  const dx = dist.position.x - piv.position.x;
  const dy = dist.position.y - piv.position.y;
  const L = Math.hypot(dx, dy);
  if (L < 1e-12) return null;
  return {
    pivotJointId,
    distalJointId,
    px: piv.position.x,
    py: piv.position.y,
    ux: dx / L,
    uy: dy / L,
    L,
  };
}

/** Signed angle (rad) from leg A direction to leg B at the shared pivot; null if invalid. */
export function torsionRestAngleFromAnchors(
  anchorA: SpringAnchor,
  anchorB: SpringAnchor,
  joints: Record<string, Joint>,
  links: Record<string, Link>,
): number | null {
  const la = resolveTorsionLinkLegWorld(anchorA, joints, links);
  const lb = resolveTorsionLinkLegWorld(anchorB, joints, links);
  if (!la || !lb || la.pivotJointId !== lb.pivotJointId) return null;
  return Math.atan2(la.ux * lb.uy - la.uy * lb.ux, la.ux * lb.ux + la.uy * lb.uy);
}

export function torsionSpringPivotWorld(
  sp: MechanismSpring,
  joints: Record<string, Joint>,
  links: Record<string, Link>,
): Vec2 | null {
  const la = resolveTorsionLinkLegWorld(sp.anchorA, joints, links);
  const lb = resolveTorsionLinkLegWorld(sp.anchorB, joints, links);
  if (!la || !lb || la.pivotJointId !== lb.pivotJointId) return null;
  return { x: la.px, y: la.py };
}

export function torsionSpringDrawArc(
  sp: MechanismSpring,
  joints: Record<string, Joint>,
  links: Record<string, Link>,
): { cx: number; cy: number; r: number; a0: number; a1: number } | null {
  const la = resolveTorsionLinkLegWorld(sp.anchorA, joints, links);
  const lb = resolveTorsionLinkLegWorld(sp.anchorB, joints, links);
  if (!la || !lb || la.pivotJointId !== lb.pivotJointId) return null;
  const r = Math.max(0.06, Math.min(la.L, lb.L) * 0.38);
  const a0 = Math.atan2(la.uy, la.ux);
  const a1 = Math.atan2(lb.uy, lb.ux);
  return { cx: la.px, cy: la.py, r, a0, a1 };
}

function wrapAngleMinusPiToPi(a: number): number {
  let x = a;
  while (x > Math.PI) x -= 2 * Math.PI;
  while (x < -Math.PI) x += 2 * Math.PI;
  return x;
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
    if (sp.kind !== 'linear' && sp.kind !== 'damper') continue;
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

type TorsionLegSim = TorsionLegWorld & {
  dvx: number;
  dvy: number;
  pvx: number;
  pvy: number;
};

function jointSimState(
  jointId: string,
  joints: Record<string, Joint>,
  q: Float64Array,
  v: Float64Array,
  jointIndex: Map<string, number>,
): { x: number; y: number; vx: number; vy: number } | null {
  const j = joints[jointId];
  if (!j) return null;
  const idx = jointIndex.get(jointId);
  if (idx !== undefined) {
    return { x: q[idx], y: q[idx + 1], vx: v[idx], vy: v[idx + 1] };
  }
  return { x: j.position.x, y: j.position.y, vx: 0, vy: 0 };
}

function resolveTorsionLinkLegSim(
  anchor: SpringAnchor,
  joints: Record<string, Joint>,
  links: Record<string, Link>,
  q: Float64Array,
  v: Float64Array,
  jointIndex: Map<string, number>,
): TorsionLegSim | null {
  if (anchor.type !== 'link') return null;
  const link = links[anchor.linkId];
  if (!link) return null;
  const t = quantizeTorsionSpringLinkT(anchor.t);
  const pivotJointId = t === 0 ? link.jointIds[0] : link.jointIds[1];
  const distalJointId = t === 0 ? link.jointIds[1] : link.jointIds[0];
  const ps = jointSimState(pivotJointId, joints, q, v, jointIndex);
  const ds = jointSimState(distalJointId, joints, q, v, jointIndex);
  if (!ps || !ds) return null;
  const dx = ds.x - ps.x;
  const dy = ds.y - ps.y;
  const L = Math.hypot(dx, dy);
  if (L < 1e-12) return null;
  return {
    pivotJointId,
    distalJointId,
    px: ps.x,
    py: ps.y,
    ux: dx / L,
    uy: dy / L,
    L,
    pvx: ps.vx,
    pvy: ps.vy,
    dvx: ds.vx,
    dvy: ds.vy,
  };
}

/**
 * Torsional spring-damper between two rigid links sharing a pivot.
 * Torque τ = −k(φ − φ_eq) − c(ω₂ − ω₁); applied as tangential acceleration τ/2 at each distal.
 */
export function accumulateTorsionalSpringAccelerations(
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
    if (sp.kind !== 'torsional') continue;
    const legA = resolveTorsionLinkLegSim(sp.anchorA, joints, links, q, v, jointIndex);
    const legB = resolveTorsionLinkLegSim(sp.anchorB, joints, links, q, v, jointIndex);
    if (!legA || !legB || legA.pivotJointId !== legB.pivotJointId) continue;

    const phi = Math.atan2(legA.ux * legB.uy - legA.uy * legB.ux, legA.ux * legB.ux + legA.uy * legB.uy);
    const phiEq = equilibriumRestLength(sp.restLength, sp.prestressDelta);
    const phiErr = wrapAngleMinusPiToPi(phi - phiEq);
    const k = siTorsionStiffnessToSim(sp.stiffness);
    const c = siTorsionDampingToSim(sp.damping);

    const n1x = -legA.uy;
    const n1y = legA.ux;
    const n2x = -legB.uy;
    const n2y = legB.ux;
    const vrx1 = legA.dvx - legA.pvx;
    const vry1 = legA.dvy - legA.pvy;
    const vrx2 = legB.dvx - legB.pvx;
    const vry2 = legB.dvy - legB.pvy;
    const omega1 = (vrx1 * n1x + vry1 * n1y) / legA.L;
    const omega2 = (vrx2 * n2x + vry2 * n2y) / legB.L;
    const omegaRel = omega2 - omega1;

    const tau = -k * phiErr - c * omegaRel;
    const half = tau * 0.5;
    const ax1 = half * n1x;
    const ay1 = half * n1y;
    const ax2 = half * n2x;
    const ay2 = half * n2y;

    const ra = resolveAnchor({ type: 'joint', jointId: legA.distalJointId }, joints, links, q, v, jointIndex);
    const rb = resolveAnchor({ type: 'joint', jointId: legB.distalJointId }, joints, links, q, v, jointIndex);
    const rp = resolveAnchor({ type: 'joint', jointId: legA.pivotJointId }, joints, links, q, v, jointIndex);
    if (!ra || !rb || !rp) continue;

    // Couple on each leg: +F at distal, −F at pivot (zero net force; τ/2 about pivot per leg).
    // Fixed distals naturally skip the +F term, but the shared pivot still receives −(F1+F2)
    // so the free linkage feels the restoring moment relative to grounded legs.
    addAccToResolved(ra, ax1, ay1, outAx, outAy, freeRow);
    addAccToResolved(rb, ax2, ay2, outAx, outAy, freeRow);
    addAccToResolved(rp, -(ax1 + ax2), -(ay1 + ay2), outAx, outAy, freeRow);
  }
}
