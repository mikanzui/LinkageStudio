import type { Joint, Link, MechanismSpring, SpringAnchor, Vec2 } from '../../types';

export type JointSample = { position: Vec2; velocity: Vec2 };

type Joints = Readonly<Record<string, Joint>>;
type Links = Readonly<Record<string, Link>>;
type Weight = readonly [jointId: string, weight: number];
type Binding = { weights: Weight[]; world?: Vec2 };
type TorsionTopology = { pivotId: string; distalAId: string; distalBId: string };
type TorsionGeometry = TorsionTopology & { pivot: Vec2; a: Vec2; b: Vec2 };

// Legacy unit-particle MOTION tuning, not calibrated SI coefficients.
const LINEAR_SCALE = 0.006;
const TORSION_STIFFNESS_SCALE = 10;
const TORSION_DAMPING_SCALE = 5;
const COINCIDENT_DISTANCE = 1e-9;

function finite(v: Vec2): boolean {
  return !!v && Number.isFinite(v.x) && Number.isFinite(v.y);
}

function fail(spring: MechanismSpring, message: string): never {
  throw new Error(`Spring ${spring.id}: ${message}`);
}

function validateParameters(spring: MechanismSpring): void {
  if (!['linear', 'damper', 'torsional'].includes(spring.kind)) fail(spring, 'invalid kind');
  for (const field of ['stiffness', 'damping', 'restLength', 'prestressDelta'] as const) {
    if (!Number.isFinite(spring[field])) fail(spring, `${field} must be finite`);
  }
  if (spring.stiffness < 0) fail(spring, 'stiffness must be nonnegative');
  if (spring.damping < 0) fail(spring, 'damping must be nonnegative');
  if (spring.kind !== 'torsional' && spring.restLength < 0) {
    fail(spring, 'linear restLength must be nonnegative');
  }
  // Dampers do not use an equilibrium, including the sum of otherwise finite fields.
  if (spring.kind !== 'damper') {
    const equilibrium = spring.restLength + spring.prestressDelta;
    if (!Number.isFinite(equilibrium)) fail(spring, 'equilibrium must be finite');
    if (spring.kind === 'linear' && equilibrium < 0) {
      fail(spring, 'linear equilibrium (restLength + prestressDelta) must be nonnegative');
    }
  }
}

function binding(anchor: SpringAnchor, links: Links): Binding | null {
  if (!anchor) return null;
  if (anchor.type === 'world') {
    return finite(anchor.position) ? { weights: [], world: anchor.position } : null;
  }
  if (anchor.type === 'joint') {
    return typeof anchor.jointId === 'string' && anchor.jointId.length > 0
      ? { weights: [[anchor.jointId, 1]] } : null;
  }
  if (anchor.type !== 'link' || !Number.isFinite(anchor.t) || anchor.t < 0 || anchor.t > 1) return null;
  const link = links[anchor.linkId];
  if (!link || link.jointIds.length !== 2 || link.jointIds.some(id => typeof id !== 'string' || !id)) return null;
  return { weights: [[link.jointIds[0], 1 - anchor.t], [link.jointIds[1], anchor.t]] };
}

export function resolveSpringAnchor(anchor: SpringAnchor, joints: Joints, links: Links): Vec2 | null {
  const resolved = binding(anchor, links);
  if (!resolved) return null;
  if (resolved.world) return { ...resolved.world };
  const position = { x: 0, y: 0 };
  for (const [id, weight] of resolved.weights) {
    const joint = joints[id];
    if (!joint || !finite(joint.position)) return null;
    position.x += joint.position.x * weight;
    position.y += joint.position.y * weight;
  }
  return finite(position) ? position : null;
}

function torsionTopology(spring: MechanismSpring, links: Links): TorsionTopology | null {
  const { anchorA, anchorB } = spring;
  if (spring.kind !== 'torsional' || !anchorA || !anchorB || anchorA.type !== 'link' || anchorB.type !== 'link') return null;
  if (anchorA.linkId === anchorB.linkId || (anchorA.t !== 0 && anchorA.t !== 1) || (anchorB.t !== 0 && anchorB.t !== 1)) return null;
  if (!binding(anchorA, links) || !binding(anchorB, links)) return null;
  const linkA = links[anchorA.linkId];
  const linkB = links[anchorB.linkId];
  const pivotId = linkA.jointIds[anchorA.t];
  const distalAId = linkA.jointIds[1 - anchorA.t];
  const distalBId = linkB.jointIds[1 - anchorB.t];
  if (pivotId !== linkB.jointIds[anchorB.t] || pivotId === distalAId || pivotId === distalBId || distalAId === distalBId) return null;
  return { pivotId, distalAId, distalBId };
}

function validLeg(pivot: Vec2, distal: Vec2): boolean {
  const length = Math.hypot(distal.x - pivot.x, distal.y - pivot.y);
  return Number.isFinite(length) && length > 0;
}

export function torsionGeometry(spring: MechanismSpring, joints: Joints, links: Links): TorsionGeometry | null {
  const topology = torsionTopology(spring, links);
  if (!topology) return null;
  const pivot = joints[topology.pivotId]?.position;
  const a = joints[topology.distalAId]?.position;
  const b = joints[topology.distalBId]?.position;
  if (!finite(pivot) || !finite(a) || !finite(b) || !validLeg(pivot, a) || !validLeg(pivot, b)) return null;
  return { ...topology, pivot: { ...pivot }, a: { ...a }, b: { ...b } };
}

export function validateSpring(spring: MechanismSpring, joints: Joints, links: Links): void {
  validateParameters(spring);
  for (const key of ['anchorA', 'anchorB'] as const) {
    if (!resolveSpringAnchor(spring[key], joints, links)) {
      fail(spring, `${key} has an invalid reference, nonfinite position or link t outside [0,1]`);
    }
  }
  if (spring.kind === 'torsional' && !torsionGeometry(spring, joints, links)) {
    fail(spring, 'torsion requires two distinct incident links at endpoint t=0 or 1, the same pivot and nonzero distinct legs');
  }
}

export function evaluateSpringForces(
  springs: Readonly<Record<string, MechanismSpring>>,
  links: Links,
  sample: (jointId: string) => JointSample | undefined,
): Map<string, Vec2> {
  const forces = new Map<string, Vec2>();
  const samples = new Map<string, JointSample>();

  const read = (id: string, spring: MechanismSpring): JointSample => {
    const cached = samples.get(id);
    if (cached) return cached;
    const value = sample(id);
    if (!value || !finite(value.position) || !finite(value.velocity)) {
      fail(spring, `joint ${id} has a missing or nonfinite position/velocity sample`);
    }
    const copy = { position: { ...value.position }, velocity: { ...value.velocity } };
    samples.set(id, copy);
    return copy;
  };
  const add = (id: string, force: Vec2, spring: MechanismSpring): void => {
    const previous = forces.get(id) ?? { x: 0, y: 0 };
    const next = { x: previous.x + force.x, y: previous.y + force.y };
    if (!finite(force) || !finite(next)) fail(spring, `nonfinite force at joint ${id}`);
    forces.set(id, next);
  };
  const resolve = (anchor: SpringAnchor, spring: MechanismSpring): Binding & JointSample => {
    const resolved = binding(anchor, links);
    if (!resolved) fail(spring, 'invalid anchor reference, position or link t outside [0,1]');
    const position = { x: 0, y: 0 };
    const velocity = { x: 0, y: 0 };
    if (resolved.world) return { ...resolved, position: { ...resolved.world }, velocity };
    for (const [id, weight] of resolved.weights) {
      const current = read(id, spring);
      position.x += current.position.x * weight;
      position.y += current.position.y * weight;
      velocity.x += current.velocity.x * weight;
      velocity.y += current.velocity.y * weight;
    }
    if (!finite(position) || !finite(velocity)) fail(spring, 'nonfinite interpolated anchor state');
    return { ...resolved, position, velocity };
  };

  for (const spring of Object.values(springs)) {
    validateParameters(spring);
    if (spring.kind === 'torsional') {
      const topology = torsionTopology(spring, links);
      if (!topology) fail(spring, 'invalid torsion links/pivot/endpoints');
      const pivot = read(topology.pivotId, spring);
      const a = read(topology.distalAId, spring);
      const b = read(topology.distalBId, spring);
      const ax = a.position.x - pivot.position.x;
      const ay = a.position.y - pivot.position.y;
      const bx = b.position.x - pivot.position.x;
      const by = b.position.y - pivot.position.y;
      const la = Math.hypot(ax, ay);
      const lb = Math.hypot(bx, by);
      if (!(la > 0) || !(lb > 0) || !Number.isFinite(la) || !Number.isFinite(lb)) {
        fail(spring, 'torsion requires finite nonzero legs');
      }
      const na = { x: -ay / la, y: ax / la };
      const nb = { x: -by / lb, y: bx / lb };
      const omegaA = ((a.velocity.x - pivot.velocity.x) * na.x + (a.velocity.y - pivot.velocity.y) * na.y) / la;
      const omegaB = ((b.velocity.x - pivot.velocity.x) * nb.x + (b.velocity.y - pivot.velocity.y) * nb.y) / lb;
      const angle = Math.atan2(ax / la * (by / lb) - ay / la * (bx / lb), ax / la * (bx / lb) + ay / la * (by / lb));
      const delta = angle - (spring.restLength + spring.prestressDelta);
      const error = Math.atan2(Math.sin(delta), Math.cos(delta));
      const tau = -spring.stiffness * TORSION_STIFFNESS_SCALE * error
        - spring.damping * TORSION_DAMPING_SCALE * (omegaB - omegaA);
      const fa = { x: -tau * na.x / la, y: -tau * na.y / la };
      const fb = { x: tau * nb.x / lb, y: tau * nb.y / lb };
      if (![omegaA, omegaB, error, tau].every(Number.isFinite)) fail(spring, 'nonfinite torsion state or torque');
      add(topology.distalAId, fa, spring);
      add(topology.distalBId, fb, spring);
      add(topology.pivotId, { x: -fa.x - fb.x, y: -fa.y - fb.y }, spring);
      continue;
    }

    const a = resolve(spring.anchorA, spring);
    const b = resolve(spring.anchorB, spring);
    const dx = b.position.x - a.position.x;
    const dy = b.position.y - a.position.y;
    const length = Math.hypot(dx, dy);
    const dv = { x: b.velocity.x - a.velocity.x, y: b.velocity.y - a.velocity.y };
    if (!Number.isFinite(length) || !finite(dv)) fail(spring, 'nonfinite separation or relative velocity');
    let force: Vec2;
    if (length <= COINCIDENT_DISTANCE) {
      // No defined spring axis: only the isotropic, dissipative coincidence limit.
      force = { x: spring.damping * LINEAR_SCALE * dv.x, y: spring.damping * LINEAR_SCALE * dv.y };
    } else {
      const nx = dx / length;
      const ny = dy / length;
      const elastic = spring.kind === 'damper' ? 0 : spring.stiffness * LINEAR_SCALE * (length - (spring.restLength + spring.prestressDelta));
      const magnitude = elastic + spring.damping * LINEAR_SCALE * (dv.x * nx + dv.y * ny);
      force = { x: magnitude * nx, y: magnitude * ny };
    }
    if (!finite(force)) fail(spring, 'nonfinite linear force');
    for (const [id, weight] of a.weights) add(id, { x: force.x * weight, y: force.y * weight }, spring);
    for (const [id, weight] of b.weights) add(id, { x: -force.x * weight, y: -force.y * weight }, spring);
  }
  return forces;
}
