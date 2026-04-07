import { describe, expect, it } from 'vitest';
import { quantizeSpringLinkT, accumulateLinearSpringAccelerations, springEndpointsWorld } from './spring-solver';
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
});
