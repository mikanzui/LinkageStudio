import type {
  ForceAnalysisResult, Joint, JointReaction, Link, LinkForce, Vec2,
} from '../types';

interface JointSample {
  position: Vec2;
  fixed: boolean;
  applied: Vec2;
}

interface LinkSample {
  a: string;
  b: string;
  zeroRest: boolean;
  correction: Vec2;
  axial: number;
}

function finite(value: number, label: string): number {
  if (!Number.isFinite(value)) throw new RangeError(`${label} must be finite`);
  return value;
}

function vector(value: Vec2, label: string): Vec2 {
  if (value == null || typeof value !== 'object') {
    throw new TypeError(`${label} must be a vector`);
  }
  return { x: finite(value.x, `${label}.x`), y: finite(value.y, `${label}.y`) };
}

function plus(a: Vec2, b: Vec2, label: string): Vec2 {
  return { x: finite(a.x + b.x, label), y: finite(a.y + b.y, label) };
}

function times(v: Vec2, scale: number, label: string): Vec2 {
  return { x: finite(v.x * scale, label), y: finite(v.y * scale, label) };
}

function id(value: string, label: string): void {
  if (typeof value !== 'string' || value.length === 0) {
    throw new TypeError(`${label} must be a nonempty string`);
  }
}

/** Frame-local unit-mass distance corrections, with no cross-frame state. */
export class ForceAccumulator {
  private readonly joints = new Map<string, JointSample>();
  private readonly links = new Map<string, LinkSample>();
  private readonly scale: number;
  private readonly appliedScale: number;
  private readonly reasons: string[];

  constructor(
    joints: Readonly<Record<string, Joint>>,
    links: Readonly<Record<string, Link>>,
    fixed: ReadonlySet<string>,
    subDt: number,
    substeps: number,
    incompleteReasons: readonly string[] = [],
  ) {
    if (finite(subDt, 'subDt') <= 0) throw new RangeError('subDt must be positive');
    if (!Number.isSafeInteger(substeps) || substeps <= 0) {
      throw new RangeError('substeps must be a positive safe integer');
    }
    const denominator = finite(subDt * subDt * substeps, 'force denominator');
    this.scale = finite(1 / denominator, 'force scale');
    if (this.scale <= 0) throw new RangeError('force scale must be positive');
    this.appliedScale = 1 / substeps;
    this.reasons = Array.from(incompleteReasons, reason => {
      if (typeof reason !== 'string') throw new TypeError('limitations must be strings');
      return reason;
    });

    for (const [jointId, joint] of Object.entries(joints)) {
      id(jointId, 'joint id');
      if (!joint || joint.id !== jointId) throw new Error(`Joint id mismatch: ${jointId}`);
      if (joint.mass !== undefined && finite(joint.mass, 'joint mass') < 0) {
        throw new RangeError('joint mass must be nonnegative');
      }
      if (joint.externalForce !== undefined) vector(joint.externalForce, 'external force');
      this.joints.set(jointId, {
        position: vector(joint.position, `joint ${jointId} position`),
        fixed: fixed.has(jointId),
        applied: { x: 0, y: 0 },
      });
    }
    for (const jointId of fixed) {
      if (!this.joints.has(jointId)) throw new Error(`Unknown fixed joint: ${jointId}`);
    }
    for (const [linkId, link] of Object.entries(links)) {
      id(linkId, 'link id');
      if (!link || link.id !== linkId) throw new Error(`Link id mismatch: ${linkId}`);
      if (!Array.isArray(link.jointIds) || link.jointIds.length !== 2) {
        throw new TypeError(`Link ${linkId} must have two endpoints`);
      }
      const [a, b] = link.jointIds;
      if (!this.joints.has(a) || !this.joints.has(b)) {
        throw new Error(`Unknown endpoint on link: ${linkId}`);
      }
      if (finite(link.restLength, 'restLength') < 0) {
        throw new RangeError('restLength must be nonnegative');
      }
      if (finite(link.mass, 'link mass') < 0) throw new RangeError('link mass must be nonnegative');
      this.links.set(linkId, {
        a, b, zeroRest: link.restLength === 0, correction: { x: 0, y: 0 }, axial: 0,
      });
    }
  }

  addDistance(linkId: string, correctionOnA: Vec2, unitAtoB: Vec2): void {
    const link = this.links.get(linkId);
    if (!link) throw new Error(`Unknown link: ${linkId}`);
    const correction = vector(correctionOnA, 'correctionOnA');
    const unit = vector(unitAtoB, 'unitAtoB');
    if (Math.abs(Math.hypot(unit.x, unit.y) - 1) > 1e-6) {
      throw new RangeError('unitAtoB must have unit length');
    }
    const next = plus(link.correction, correction, 'accumulated correction');
    const dot = finite(correction.x * unit.x + correction.y * unit.y, 'axial correction');
    const axial = finite(link.axial + dot, 'accumulated axial correction');
    times(next, this.scale, 'constraint force');
    finite(axial * this.scale, 'axial force');
    // Commit only after all checks so a rejected sample cannot pollute the frame.
    link.correction = next;
    link.axial = axial;
  }

  addApplied(jointId: string, force: Vec2): void {
    const joint = this.joints.get(jointId);
    if (!joint) throw new Error(`Unknown joint: ${jointId}`);
    const next = plus(joint.applied, vector(force, 'applied force'), 'accumulated applied force');
    times(next, this.appliedScale, 'average applied force');
    joint.applied = next;
  }

  finish(positions: ReadonlyMap<string, Vec2>): ForceAnalysisResult {
    for (const [jointId, position] of positions) {
      if (!this.joints.has(jointId)) throw new Error(`Unknown position joint: ${jointId}`);
      vector(position, `joint ${jointId} position`);
    }
    const linkForces = new Map<string, LinkForce>();
    const jointReactions = new Map<string, JointReaction>();
    const contributions = new Map<string, Map<string, Vec2>>();
    for (const [jointId, joint] of this.joints) {
      vector(positions.has(jointId) ? positions.get(jointId)! : joint.position, 'position');
      contributions.set(jointId, new Map());
    }
    let maxLinkForce = 0;
    for (const [linkId, link] of this.links) {
      const forceAtA = times(link.correction, this.scale, 'constraint force');
      const forceAtB = times(forceAtA, -1, 'opposite constraint force');
      const axialForce = link.zeroRest ? null : finite(link.axial * this.scale, 'axial force');
      linkForces.set(linkId, { linkId, axialForce, forceAtA, forceAtB });
      if (axialForce !== null) maxLinkForce = Math.max(maxLinkForce, Math.abs(axialForce));
      for (const [jointId, force] of [[link.a, forceAtA], [link.b, forceAtB]] as const) {
        const entries = contributions.get(jointId)!;
        entries.set(linkId, plus(entries.get(linkId) ?? { x: 0, y: 0 }, force, 'link contribution'));
      }
    }
    let maxJointReaction = 0;
    for (const [jointId, joint] of this.joints) {
      let net = { x: 0, y: 0 };
      const entries: JointReaction['contributions'] = [];
      for (const [linkId, force] of contributions.get(jointId)!) {
        net = plus(net, force, 'net constraint force');
        entries.push({ linkId, force: times(force, joint.fixed ? -1 : 1, 'reaction contribution') });
      }
      const appliedForce = times(joint.applied, this.appliedScale, 'average applied force');
      const reactionForce = joint.fixed
        ? times(plus(net, appliedForce, 'support load'), -1, 'support reaction')
        : net;
      const magnitude = finite(Math.hypot(reactionForce.x, reactionForce.y), 'reaction magnitude');
      maxJointReaction = Math.max(maxJointReaction, magnitude);
      jointReactions.set(jointId, {
        jointId, kind: joint.fixed ? 'support' : 'constraint', reactionForce, magnitude,
        appliedForce, contributions: entries,
      });
    }
    return {
      units: 'model', complete: this.reasons.length === 0, limitations: [...this.reasons],
      linkForces, jointReactions, maxLinkForce, maxJointReaction,
    };
  }
}
