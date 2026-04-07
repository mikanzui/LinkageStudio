import { describe, expect, it } from 'vitest';
import {
  quantizeSpringLinkT,
  accumulateLinearSpringAccelerations,
  accumulateTorsionalSpringAccelerations,
  springEndpointsWorld,
  torsionRestAngleFromAnchors,
} from './spring-solver';
import { solveWithForce, resetVelocities } from '../../core/solver/newton-raphson';
import type { Joint, Link, MechanismSpring } from '../../types';

describe('springEndpointsWorld', () => {
  it('resolves joint and link anchors from joint positions', () => {
    const j1: Joint = { id: 'a', type: 'revolute', position: { x: 0, y: 0 }, connectedLinkIds: [] };
    const j2: Joint = { id: 'b', type: 'revolute', position: { x: 100, y: 0 }, connectedLinkIds: [] };
    const joints = { a: j1, b: j2 };
    const links = { L1: { id: 'L1', jointIds: ['a', 'b'] as [string, string], restLength: 100, mass: 1 } };
    const spring: MechanismSpring = {
      id: 's',
      kind: 'linear',
      anchorA: { type: 'joint', jointId: 'a' },
      anchorB: { type: 'link', linkId: 'L1', t: 0.5 },
      stiffness: 1,
      damping: 0,
      restLength: 0,
      prestressDelta: 0,
    };
    const ends = springEndpointsWorld(spring, joints, links);
    expect(ends).not.toBeNull();
    expect(ends!.a.x).toBe(0);
    expect(ends!.a.y).toBe(0);
    expect(ends!.b.x).toBe(50);
    expect(ends!.b.y).toBe(0);
  });
});

describe('quantizeSpringLinkT', () => {
  it('snaps to grid', () => {
    expect(quantizeSpringLinkT(0.37, 10)).toBeCloseTo(0.4, 5);
    expect(quantizeSpringLinkT(1, 4)).toBe(1);
    expect(quantizeSpringLinkT(0, 100)).toBe(0);
  });

  it('uses at least 2 steps', () => {
    expect(quantizeSpringLinkT(0.2, 1)).toBe(0);
    expect(quantizeSpringLinkT(0.6, 1)).toBe(0.5);
  });
});

describe('accumulateLinearSpringAccelerations', () => {
  it('applies opposite accelerations to two free joints', () => {
    const j1: Joint = { id: 'a', type: 'revolute', position: { x: 0, y: 0 }, connectedLinkIds: [] };
    const j2: Joint = { id: 'b', type: 'revolute', position: { x: 200, y: 0 }, connectedLinkIds: [] };
    const joints = { a: j1, b: j2 };
    const links: Record<string, Link> = {};
    const jointIndex = new Map<string, number>([
      ['a', 0],
      ['b', 2],
    ]);
    const q = new Float64Array([0, 0, 200, 0]);
    const v = new Float64Array(4);
    const outAx = new Float64Array(2);
    const outAy = new Float64Array(2);

    const spring: MechanismSpring = {
      id: 's1',
      kind: 'linear',
      anchorA: { type: 'joint', jointId: 'a' },
      anchorB: { type: 'joint', jointId: 'b' },
      stiffness: 50000,
      damping: 0,
      restLength: 100,
      prestressDelta: 0,
    };

    accumulateLinearSpringAccelerations({ s1: spring }, joints, links, q, v, jointIndex, outAx, outAy);

    // Stretched by 100; strong k maps through SI scale — expect non-zero opposite signs on x
    expect(outAx[0] * outAx[1]).toBeLessThan(0);
    expect(Math.abs(outAx[0] + outAx[1])).toBeLessThan(1e-6);
  });

  it('only moves free joint when other end is fixed (not in DOF map)', () => {
    const jFixed: Joint = { id: 'fix', type: 'fixed', position: { x: 0, y: 0 }, connectedLinkIds: [] };
    const jFree: Joint = { id: 'a', type: 'revolute', position: { x: 100, y: 0 }, connectedLinkIds: [] };
    const joints = { fix: jFixed, a: jFree };
    const jointIndex = new Map<string, number>([['a', 0]]);
    const q = new Float64Array([100, 0]);
    const v = new Float64Array(2);
    const outAx = new Float64Array(1);
    const outAy = new Float64Array(1);

    const spring: MechanismSpring = {
      id: 's1',
      kind: 'linear',
      anchorA: { type: 'joint', jointId: 'fix' },
      anchorB: { type: 'joint', jointId: 'a' },
      stiffness: 100000,
      damping: 0,
      restLength: 0,
      prestressDelta: 0,
    };

    accumulateLinearSpringAccelerations({ s1: spring }, joints, {}, q, v, jointIndex, outAx, outAy);
    expect(outAx[0]).not.toBe(0);
  });

  it('damper (k=0) applies opposite damping acceleration when endpoints move along the bar', () => {
    const j1: Joint = { id: 'a', type: 'revolute', position: { x: 0, y: 0 }, connectedLinkIds: [] };
    const j2: Joint = { id: 'b', type: 'revolute', position: { x: 100, y: 0 }, connectedLinkIds: [] };
    const joints = { a: j1, b: j2 };
    const jointIndex = new Map<string, number>([
      ['a', 0],
      ['b', 2],
    ]);
    const q = new Float64Array([0, 0, 100, 0]);
    const v = new Float64Array([0, 0, 10, 0]);
    const outAx = new Float64Array(2);
    const outAy = new Float64Array(2);

    const spring: MechanismSpring = {
      id: 'd1',
      kind: 'damper',
      anchorA: { type: 'joint', jointId: 'a' },
      anchorB: { type: 'joint', jointId: 'b' },
      stiffness: 0,
      damping: 40,
      restLength: 100,
      prestressDelta: 0,
    };

    accumulateLinearSpringAccelerations({ d1: spring }, joints, {}, q, v, jointIndex, outAx, outAy);
    expect(outAx[1]).toBeLessThan(0);
    expect(outAx[0]).toBeGreaterThan(0);
    expect(Math.abs(outAx[0] + outAx[1])).toBeLessThan(1e-6);
  });
});

describe('torsionRestAngleFromAnchors', () => {
  it('returns π/2 for perpendicular links sharing a pivot', () => {
    const p: Joint = { id: 'p', type: 'revolute', position: { x: 0, y: 0 }, connectedLinkIds: [] };
    const ja: Joint = { id: 'a', type: 'revolute', position: { x: 1, y: 0 }, connectedLinkIds: [] };
    const jb: Joint = { id: 'b', type: 'revolute', position: { x: 0, y: 1 }, connectedLinkIds: [] };
    const joints = { p, a: ja, b: jb };
    const links: Record<string, Link> = {
      L1: { id: 'L1', jointIds: ['p', 'a'], restLength: 1, mass: 1 },
      L2: { id: 'L2', jointIds: ['p', 'b'], restLength: 1, mass: 1 },
    };
    const phi = torsionRestAngleFromAnchors(
      { type: 'link', linkId: 'L1', t: 0 },
      { type: 'link', linkId: 'L2', t: 0 },
      joints,
      links,
    );
    expect(phi).toBeCloseTo(Math.PI / 2, 5);
  });
});

describe('accumulateTorsionalSpringAccelerations', () => {
  it('produces non-zero accelerations when angle differs from rest', () => {
    const p: Joint = { id: 'p', type: 'revolute', position: { x: 0, y: 0 }, connectedLinkIds: [] };
    const ja: Joint = { id: 'a', type: 'revolute', position: { x: 1, y: 0 }, connectedLinkIds: [] };
    const jb: Joint = { id: 'b', type: 'revolute', position: { x: 0, y: 1 }, connectedLinkIds: [] };
    const joints = { p, a: ja, b: jb };
    const links: Record<string, Link> = {
      L1: { id: 'L1', jointIds: ['p', 'a'], restLength: 1, mass: 1 },
      L2: { id: 'L2', jointIds: ['p', 'b'], restLength: 1, mass: 1 },
    };
    const jointIndex = new Map<string, number>([
      ['p', 0],
      ['a', 2],
      ['b', 4],
    ]);
    const q = new Float64Array([0, 0, 1, 0, 0, 1]);
    const v = new Float64Array(6);
    const outAx = new Float64Array(3);
    const outAy = new Float64Array(3);

    const spring: MechanismSpring = {
      id: 't1',
      kind: 'torsional',
      anchorA: { type: 'link', linkId: 'L1', t: 0 },
      anchorB: { type: 'link', linkId: 'L2', t: 0 },
      stiffness: 50000,
      damping: 0,
      restLength: 0,
      prestressDelta: 0,
    };

    accumulateTorsionalSpringAccelerations({ t1: spring }, joints, links, q, v, jointIndex, outAx, outAy);
    const sumX = outAx[0] + outAx[1] + outAx[2];
    const sumY = outAy[0] + outAy[1] + outAy[2];
    expect(Math.abs(sumX)).toBeLessThan(1e-5);
    expect(Math.abs(sumY)).toBeLessThan(1e-5);
    expect(Math.abs(outAx[1]) + Math.abs(outAx[2]) + Math.abs(outAy[1]) + Math.abs(outAy[2])).toBeGreaterThan(1e-6);
  });

  it('applies torque at free pivot when both distals are fixed (grounded feet)', () => {
    const p: Joint = { id: 'p', type: 'revolute', position: { x: 0, y: 0 }, connectedLinkIds: [] };
    const ja: Joint = { id: 'a', type: 'fixed', position: { x: 100, y: 0 }, connectedLinkIds: [] };
    const jb: Joint = { id: 'b', type: 'fixed', position: { x: 0, y: 100 }, connectedLinkIds: [] };
    const joints = { p, a: ja, b: jb };
    const links: Record<string, Link> = {
      L1: { id: 'L1', jointIds: ['p', 'a'], restLength: 100, mass: 1 },
      L2: { id: 'L2', jointIds: ['p', 'b'], restLength: 100, mass: 1 },
    };
    const jointIndex = new Map<string, number>([['p', 0]]);
    const q = new Float64Array([0, 0]);
    const v = new Float64Array(2);
    const outAx = new Float64Array(1);
    const outAy = new Float64Array(1);

    const spring: MechanismSpring = {
      id: 't2',
      kind: 'torsional',
      anchorA: { type: 'link', linkId: 'L1', t: 0 },
      anchorB: { type: 'link', linkId: 'L2', t: 0 },
      stiffness: 50000,
      damping: 0,
      restLength: 0,
      prestressDelta: 0,
    };

    accumulateTorsionalSpringAccelerations({ t2: spring }, joints, links, q, v, jointIndex, outAx, outAy);
    expect(Math.abs(outAx[0]) + Math.abs(outAy[0])).toBeGreaterThan(1e-3);
  });

  it('still drives the free linkage when the other torsion leg is grounded', () => {
    const p: Joint = { id: 'p', type: 'revolute', position: { x: 0, y: 0 }, connectedLinkIds: [] };
    const ja: Joint = { id: 'a', type: 'revolute', position: { x: 100, y: 0 }, connectedLinkIds: [] };
    const jb: Joint = { id: 'b', type: 'fixed', position: { x: 0, y: 100 }, connectedLinkIds: [] };
    const joints = { p, a: ja, b: jb };
    const links: Record<string, Link> = {
      L1: { id: 'L1', jointIds: ['p', 'a'], restLength: 100, mass: 1 },
      L2: { id: 'L2', jointIds: ['p', 'b'], restLength: 100, mass: 1 },
    };
    const jointIndex = new Map<string, number>([
      ['p', 0],
      ['a', 2],
    ]);
    const q = new Float64Array([0, 0, 100, 0]);
    const v = new Float64Array(4);
    const outAx = new Float64Array(2);
    const outAy = new Float64Array(2);

    const spring: MechanismSpring = {
      id: 't3',
      kind: 'torsional',
      anchorA: { type: 'link', linkId: 'L1', t: 0 },
      anchorB: { type: 'link', linkId: 'L2', t: 0 },
      stiffness: 50000,
      damping: 0,
      restLength: 0,
      prestressDelta: 0,
    };

    accumulateTorsionalSpringAccelerations({ t3: spring }, joints, links, q, v, jointIndex, outAx, outAy);
    expect(Math.abs(outAx[0]) + Math.abs(outAy[0]) + Math.abs(outAx[1]) + Math.abs(outAy[1])).toBeGreaterThan(1e-3);
  });
});

describe('torsion spring integration via solveWithForce', () => {
  it('restores a deflected V-shape back toward rest angle', () => {
    resetVelocities();
    // Fixed pivot at origin, two free distals forming a 90° V
    const pivot: Joint = { id: 'p', type: 'fixed', position: { x: 0, y: 0 }, connectedLinkIds: ['L1', 'L2'] };
    // Rest: A at (100,0), B at (0,100) → rest angle = π/2
    // Deflected: rotate A down to (70.7, -70.7) → angle ≈ 135° from A→B
    const ja: Joint = { id: 'a', type: 'revolute', position: { x: 70.7, y: -70.7 }, connectedLinkIds: ['L1'] };
    const jb: Joint = { id: 'b', type: 'revolute', position: { x: 0, y: 100 }, connectedLinkIds: ['L2'] };
    const joints: Record<string, Joint> = { p: pivot, a: ja, b: jb };
    const links: Record<string, Link> = {
      L1: { id: 'L1', jointIds: ['p', 'a'], restLength: 100, mass: 1 },
      L2: { id: 'L2', jointIds: ['p', 'b'], restLength: 100, mass: 1 },
    };
    const fixedIds = new Set(['p']);
    const restAngle = Math.PI / 2;
    const spring: MechanismSpring = {
      id: 'ts',
      kind: 'torsional',
      anchorA: { type: 'link', linkId: 'L1', t: 0 },
      anchorB: { type: 'link', linkId: 'L2', t: 0 },
      stiffness: 20,
      damping: 4,
      restLength: restAngle,
      prestressDelta: 0,
    };
    const springs = { ts: spring };
    const startAx = ja.position.x;
    const startAy = ja.position.y;

    for (let i = 0; i < 120; i++) {
      const r = solveWithForce(
        joints, links, { enabled: false, strength: 0 }, null,
        0.5, 1, 0, 1 / 60, fixedIds,
        undefined, undefined, undefined, undefined, undefined,
        springs,
      );
      for (const [id, pos] of r.positions) {
        if (joints[id] && !fixedIds.has(id)) {
          joints[id] = { ...joints[id], position: pos };
        }
      }
    }

    // A should have moved from (70.7, -70.7) toward (100, 0) (its rest direction)
    const movedAx = joints.a.position.x;
    const movedAy = joints.a.position.y;
    const dxFromStart = Math.abs(movedAx - startAx) + Math.abs(movedAy - startAy);
    expect(dxFromStart).toBeGreaterThan(5);
  });
});
