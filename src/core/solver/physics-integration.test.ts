import { describe, expect, it, beforeEach } from 'vitest';
import type { Joint, Link, MechanismSpring } from '../../types';
import { solveWithForce, resetVelocities } from './newton-raphson';

function mkJoint(id: string, type: Joint['type'], x: number, y: number, linkIds: string[] = []): Joint {
  return { id, type, position: { x, y }, connectedLinkIds: linkIds };
}

function mkLink(id: string, a: string, b: string, len: number): Link {
  return { id, jointIds: [a, b], restLength: len, mass: 1 };
}

function simulate(opts: {
  joints: Record<string, Joint>;
  links: Record<string, Link>;
  steps: number;
  gravity?: number;
  damping?: number;
  pull?: { linkId: string | null; grabT: number; target: { x: number; y: number }; simGrabJointId?: string; directJointId?: string | null } | null;
  dragMultiplier?: number;
  dragDamping?: number;
  springs?: Record<string, MechanismSpring>;
}) {
  const { joints, links, steps, gravity = 0, damping = 0.5, pull = null,
    dragMultiplier = 25, dragDamping = 0.15, springs } = opts;
  const fixedIds = new Set(Object.values(joints).filter(j => j.type === 'fixed').map(j => j.id));
  for (let i = 0; i < steps; i++) {
    const r = solveWithForce(
      joints, links,
      { enabled: gravity > 0, strength: gravity },
      pull, damping, dragMultiplier, dragDamping, 1 / 60, fixedIds,
      undefined, undefined, undefined, undefined, undefined,
      springs,
    );
    for (const [id, pos] of r.positions) {
      if (joints[id] && !fixedIds.has(id)) {
        joints[id] = { ...joints[id], position: pos };
      }
    }
  }
}

function dist(a: { x: number; y: number }, b: { x: number; y: number }): number {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

// ── Gravity ────────────────────────────────────────────────────────

describe('gravity physics', () => {
  beforeEach(() => resetVelocities());

  it('pendulum falls to vertical under gravity', () => {
    const joints: Record<string, Joint> = {
      f: mkJoint('f', 'fixed', 200, 100, ['l']),
      r: mkJoint('r', 'revolute', 350, 100, ['l']),
    };
    const links: Record<string, Link> = { l: mkLink('l', 'f', 'r', 150) };

    simulate({ joints, links, steps: 300, gravity: 250, damping: 0.3 });

    expect(joints.r.position.y).toBeGreaterThan(200);
    const len = dist(joints.f.position, joints.r.position);
    expect(len).toBeCloseTo(150, 0);
  });

  it('two-link chain falls with end below middle', () => {
    const joints: Record<string, Joint> = {
      f: mkJoint('f', 'fixed', 200, 100, ['l1']),
      m: mkJoint('m', 'revolute', 300, 100, ['l1', 'l2']),
      e: mkJoint('e', 'revolute', 400, 100, ['l2']),
    };
    const links: Record<string, Link> = {
      l1: mkLink('l1', 'f', 'm', 100),
      l2: mkLink('l2', 'm', 'e', 100),
    };

    simulate({ joints, links, steps: 300, gravity: 250, damping: 0.3 });

    expect(joints.m.position.y).toBeGreaterThan(150);
    expect(joints.e.position.y).toBeGreaterThan(joints.m.position.y - 50);
  });

  it('free-floating link falls uniformly', () => {
    const joints: Record<string, Joint> = {
      a: mkJoint('a', 'revolute', 200, 100, ['l']),
      b: mkJoint('b', 'revolute', 300, 100, ['l']),
    };
    const links: Record<string, Link> = { l: mkLink('l', 'a', 'b', 100) };

    simulate({ joints, links, steps: 120, gravity: 250 });

    expect(joints.a.position.y).toBeGreaterThan(200);
    expect(joints.b.position.y).toBeGreaterThan(200);
  });

  it('no gravity → pendulum stays static', () => {
    const joints: Record<string, Joint> = {
      f: mkJoint('f', 'fixed', 200, 100, ['l']),
      r: mkJoint('r', 'revolute', 350, 100, ['l']),
    };
    const links: Record<string, Link> = { l: mkLink('l', 'f', 'r', 150) };

    simulate({ joints, links, steps: 60, gravity: 0, damping: 0.99 });

    expect(joints.r.position.x).toBeCloseTo(350, 0);
    expect(joints.r.position.y).toBeCloseTo(100, 0);
  });
});

// ── Constraint projection ──────────────────────────────────────────

describe('constraint projection', () => {
  beforeEach(() => resetVelocities());

  it('preserves link length after gravity simulation', () => {
    const joints: Record<string, Joint> = {
      f: mkJoint('f', 'fixed', 200, 100, ['l']),
      r: mkJoint('r', 'revolute', 350, 100, ['l']),
    };
    const links: Record<string, Link> = { l: mkLink('l', 'f', 'r', 150) };

    simulate({ joints, links, steps: 300, gravity: 250, damping: 0.3 });

    const len = dist(joints.f.position, joints.r.position);
    expect(Math.abs(len - 150)).toBeLessThan(2);
  });

  it('preserves link lengths in a chain under spring + gravity', () => {
    const joints: Record<string, Joint> = {
      f: mkJoint('f', 'fixed', 0, 0, ['l1']),
      m: mkJoint('m', 'revolute', 100, 0, ['l1', 'l2']),
      e: mkJoint('e', 'revolute', 200, 0, ['l2']),
    };
    const links: Record<string, Link> = {
      l1: mkLink('l1', 'f', 'm', 100),
      l2: mkLink('l2', 'm', 'e', 100),
    };
    const spring: MechanismSpring = {
      id: 's1', kind: 'linear',
      anchorA: { type: 'joint', jointId: 'f' },
      anchorB: { type: 'joint', jointId: 'e' },
      stiffness: 150, damping: 12, restLength: 100, prestressDelta: 0,
    };

    simulate({ joints, links, steps: 300, gravity: 250, damping: 0.5, springs: { s1: spring } });

    const len1 = dist(joints.f.position, joints.m.position);
    const len2 = dist(joints.m.position, joints.e.position);
    expect(Math.abs(len1 - 100)).toBeLessThan(3);
    expect(Math.abs(len2 - 100)).toBeLessThan(3);
  });
});

// ── Drag force ─────────────────────────────────────────────────────

describe('drag force', () => {
  beforeEach(() => resetVelocities());

  it('pulls a pendulum joint toward the drag target', () => {
    const joints: Record<string, Joint> = {
      f: mkJoint('f', 'fixed', 200, 200, ['l']),
      r: mkJoint('r', 'revolute', 200, 350, ['l']),
    };
    const links: Record<string, Link> = { l: mkLink('l', 'f', 'r', 150) };
    const pull = { linkId: 'l', grabT: 1.0, target: { x: 400, y: 200 } };

    simulate({ joints, links, steps: 120, gravity: 250, damping: 0.3, pull });

    expect(joints.r.position.x).toBeGreaterThan(250);
  });

  it('directJointId pulls a free joint without a link reference', () => {
    const joints: Record<string, Joint> = {
      f: mkJoint('f', 'fixed', 0, 0, ['l']),
      r: mkJoint('r', 'revolute', 100, 0, ['l']),
    };
    const links: Record<string, Link> = { l: mkLink('l', 'f', 'r', 100) };
    const pull = {
      linkId: null as string | null, grabT: 0,
      target: { x: 0, y: 100 },
      directJointId: 'r',
      simGrabJointId: 'r',
    };

    simulate({ joints, links, steps: 60, gravity: 0, damping: 0.5, pull });

    expect(joints.r.position.y).toBeGreaterThan(30);
  });
});

// ── Linear springs ─────────────────────────────────────────────────

describe('linear spring physics', () => {
  beforeEach(() => resetVelocities());

  it('spring across two links folds the chain toward the anchor', () => {
    // 2-link chain with slight bend so it can fold; spring rest < chain reach
    const joints: Record<string, Joint> = {
      f: mkJoint('f', 'fixed', 0, 0, ['l1']),
      m: mkJoint('m', 'revolute', 95, 30, ['l1', 'l2']),
      e: mkJoint('e', 'revolute', 195, 5, ['l2']),
    };
    const links: Record<string, Link> = {
      l1: mkLink('l1', 'f', 'm', 100),
      l2: mkLink('l2', 'm', 'e', 100),
    };
    const spring: MechanismSpring = {
      id: 's1', kind: 'linear',
      anchorA: { type: 'joint', jointId: 'f' },
      anchorB: { type: 'joint', jointId: 'e' },
      stiffness: 150, damping: 12, restLength: 50, prestressDelta: 0,
    };

    const startDist = dist(joints.f.position, joints.e.position);
    simulate({ joints, links, steps: 300, gravity: 0, damping: 0.5, springs: { s1: spring } });

    const finalDist = dist(joints.f.position, joints.e.position);
    expect(finalDist).toBeLessThan(startDist - 10);
  });

  it('spring pushes two free joints apart when compressed', () => {
    // Two free joints 20 apart with spring rest = 100, no link between them
    const joints: Record<string, Joint> = {
      a: mkJoint('a', 'revolute', 90, 0, []),
      b: mkJoint('b', 'revolute', 110, 0, []),
    };
    const links: Record<string, Link> = {};
    const spring: MechanismSpring = {
      id: 's1', kind: 'linear',
      anchorA: { type: 'joint', jointId: 'a' },
      anchorB: { type: 'joint', jointId: 'b' },
      stiffness: 200, damping: 5, restLength: 100, prestressDelta: 0,
    };

    const startDist = dist(joints.a.position, joints.b.position);
    simulate({ joints, links, steps: 120, gravity: 0, damping: 0.8, springs: { s1: spring } });
    const endDist = dist(joints.a.position, joints.b.position);

    expect(endDist).toBeGreaterThan(startDist + 10);
  });

  it('spring at rest produces no motion', () => {
    const joints: Record<string, Joint> = {
      f: mkJoint('f', 'fixed', 0, 0, ['l']),
      r: mkJoint('r', 'revolute', 100, 0, ['l']),
    };
    const links: Record<string, Link> = { l: mkLink('l', 'f', 'r', 100) };
    const spring: MechanismSpring = {
      id: 's1', kind: 'linear',
      anchorA: { type: 'joint', jointId: 'f' },
      anchorB: { type: 'joint', jointId: 'r' },
      stiffness: 150, damping: 12, restLength: 100, prestressDelta: 0,
    };

    simulate({ joints, links, steps: 60, gravity: 0, damping: 0.99, springs: { s1: spring } });

    expect(joints.r.position.x).toBeCloseTo(100, 0);
    expect(joints.r.position.y).toBeCloseTo(0, 0);
  });

  // Issue #14: link midpoint anchor exercises split weights in resolveAnchor inside spring accumulation.
  it('link-anchored linear spring settles to finite positions after many steps (#14)', () => {
    const joints: Record<string, Joint> = {
      f: mkJoint('f', 'fixed', 0, 0, ['l1']),
      m: mkJoint('m', 'revolute', 80, 15, ['l1', 'l2']),
      e: mkJoint('e', 'revolute', 160, -10, ['l2']),
    };
    const links: Record<string, Link> = {
      l1: mkLink('l1', 'f', 'm', 80),
      l2: mkLink('l2', 'm', 'e', 80),
    };
    const spring: MechanismSpring = {
      id: 'mid',
      kind: 'linear',
      anchorA: { type: 'joint', jointId: 'f' },
      anchorB: { type: 'link', linkId: 'l2', t: 0.5 },
      stiffness: 140,
      damping: 18,
      restLength: 45,
      prestressDelta: 0,
    };

    simulate({ joints, links, steps: 220, gravity: 0, damping: 0.55, springs: { mid: spring } });

    const assertFiniteJoint = (j: Joint) => {
      expect(Number.isFinite(j.position.x)).toBe(true);
      expect(Number.isFinite(j.position.y)).toBe(true);
      expect(Math.abs(j.position.x) + Math.abs(j.position.y)).toBeLessThan(1e6);
    };
    assertFiniteJoint(joints.f);
    assertFiniteJoint(joints.m);
    assertFiniteJoint(joints.e);

    expect(Math.abs(dist(joints.f.position, joints.m.position) - 80)).toBeLessThan(3);
    expect(Math.abs(dist(joints.m.position, joints.e.position) - 80)).toBeLessThan(3);
  });
});

// ── Damper (k=0) ───────────────────────────────────────────────────

describe('damper physics (k=0)', () => {
  beforeEach(() => resetVelocities());

  it('damper resists stretching velocity between two free joints', () => {
    // Two free joints moving apart; damper between them should slow separation
    const mkSetup = () => {
      const joints: Record<string, Joint> = {
        a: mkJoint('a', 'revolute', 0, 0, []),
        b: mkJoint('b', 'revolute', 50, 0, []),
      };
      const links: Record<string, Link> = {};
      return { joints, links };
    };

    // Give both an initial push apart via a compressed spring (1 frame), then remove it
    const undamped = mkSetup();
    const kickSpring: MechanismSpring = {
      id: 'kick', kind: 'linear',
      anchorA: { type: 'joint', jointId: 'a' },
      anchorB: { type: 'joint', jointId: 'b' },
      stiffness: 500, damping: 0, restLength: 200, prestressDelta: 0,
    };
    simulate({ joints: undamped.joints, links: undamped.links, steps: 5, gravity: 0, damping: 0.99, springs: { kick: kickSpring } });
    // Then coast without any spring
    simulate({ joints: undamped.joints, links: undamped.links, steps: 60, gravity: 0, damping: 0.99 });
    const undampedDist = dist(undamped.joints.a.position, undamped.joints.b.position);

    resetVelocities();

    const damped = mkSetup();
    simulate({ joints: damped.joints, links: damped.links, steps: 5, gravity: 0, damping: 0.99, springs: { kick: kickSpring } });
    // Then coast WITH damper
    const damper: MechanismSpring = {
      id: 'd1', kind: 'damper',
      anchorA: { type: 'joint', jointId: 'a' },
      anchorB: { type: 'joint', jointId: 'b' },
      stiffness: 0, damping: 80, restLength: 50, prestressDelta: 0,
    };
    simulate({ joints: damped.joints, links: damped.links, steps: 60, gravity: 0, damping: 0.99, springs: { d1: damper } });
    const dampedDist = dist(damped.joints.a.position, damped.joints.b.position);

    // Damper should have slowed the separation
    expect(dampedDist).toBeLessThan(undampedDist - 5);
  });
});

// ── Torsion springs ────────────────────────────────────────────────

describe('torsion spring physics', () => {
  beforeEach(() => resetVelocities());

  it('restores a deflected V-shape back toward rest angle (fixed pivot)', () => {
    const joints: Record<string, Joint> = {
      p: mkJoint('p', 'fixed', 0, 0, ['L1', 'L2']),
      a: mkJoint('a', 'revolute', 70.7, -70.7, ['L1']),
      b: mkJoint('b', 'revolute', 0, 100, ['L2']),
    };
    const links: Record<string, Link> = {
      L1: mkLink('L1', 'p', 'a', 100),
      L2: mkLink('L2', 'p', 'b', 100),
    };
    const spring: MechanismSpring = {
      id: 'ts', kind: 'torsional',
      anchorA: { type: 'link', linkId: 'L1', t: 0 },
      anchorB: { type: 'link', linkId: 'L2', t: 0 },
      stiffness: 20, damping: 4, restLength: Math.PI / 2, prestressDelta: 0,
    };

    const startAx = joints.a.position.x;
    const startAy = joints.a.position.y;
    simulate({ joints, links, steps: 120, gravity: 0, damping: 0.5, springs: { ts: spring } });

    const moved = Math.abs(joints.a.position.x - startAx) + Math.abs(joints.a.position.y - startAy);
    expect(moved).toBeGreaterThan(5);
  });

  it('works with one grounded leg (free pivot + free distal A, fixed distal B)', () => {
    const joints: Record<string, Joint> = {
      p: mkJoint('p', 'revolute', 0, 0, ['L1', 'L2']),
      a: mkJoint('a', 'revolute', 100, 0, ['L1']),
      b: mkJoint('b', 'fixed', 0, 100, ['L2']),
    };
    const links: Record<string, Link> = {
      L1: mkLink('L1', 'p', 'a', 100),
      L2: mkLink('L2', 'p', 'b', 100),
    };
    const spring: MechanismSpring = {
      id: 'ts', kind: 'torsional',
      anchorA: { type: 'link', linkId: 'L1', t: 0 },
      anchorB: { type: 'link', linkId: 'L2', t: 0 },
      stiffness: 20, damping: 4, restLength: 0, prestressDelta: 0,
    };

    const startPy = joints.p.position.y;
    const startAy = joints.a.position.y;
    simulate({ joints, links, steps: 120, gravity: 0, damping: 0.5, springs: { ts: spring } });

    const totalMoved = Math.abs(joints.p.position.y - startPy) + Math.abs(joints.a.position.y - startAy)
      + Math.abs(joints.p.position.x) + Math.abs(joints.a.position.x - 100);
    expect(totalMoved).toBeGreaterThan(3);
  });

  it('torsion at rest angle produces no motion', () => {
    const joints: Record<string, Joint> = {
      p: mkJoint('p', 'fixed', 0, 0, ['L1', 'L2']),
      a: mkJoint('a', 'revolute', 100, 0, ['L1']),
      b: mkJoint('b', 'revolute', 0, 100, ['L2']),
    };
    const links: Record<string, Link> = {
      L1: mkLink('L1', 'p', 'a', 100),
      L2: mkLink('L2', 'p', 'b', 100),
    };
    const spring: MechanismSpring = {
      id: 'ts', kind: 'torsional',
      anchorA: { type: 'link', linkId: 'L1', t: 0 },
      anchorB: { type: 'link', linkId: 'L2', t: 0 },
      stiffness: 20, damping: 4, restLength: Math.PI / 2, prestressDelta: 0,
    };

    simulate({ joints, links, steps: 60, gravity: 0, damping: 0.99, springs: { ts: spring } });

    expect(joints.a.position.x).toBeCloseTo(100, 0);
    expect(joints.a.position.y).toBeCloseTo(0, 0);
    expect(joints.b.position.x).toBeCloseTo(0, 0);
    expect(joints.b.position.y).toBeCloseTo(100, 0);
  });
});
