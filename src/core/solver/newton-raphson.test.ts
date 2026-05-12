import { describe, expect, it } from 'vitest';
import type { Joint, Link } from '../../types';
import { solve } from './newton-raphson';

function mkJoint(id: string, type: Joint['type'], x: number, y: number, linkIds: string[] = []): Joint {
  return { id, type, position: { x, y }, connectedLinkIds: linkIds };
}

function mkLink(id: string, a: string, b: string, len: number): Link {
  return { id, jointIds: [a, b], restLength: len, mass: 1 };
}

describe('kinematic solve() Newton–Raphson driver', () => {
  it('two-bar triangle mechanism converges for a driven crank angle', () => {
    // O fixed, crank OA = 40, coupler AB = 30, rocker OB = 50 (3R triangle).
    const joints: Record<string, Joint> = {
      O: mkJoint('O', 'fixed', 0, 0, ['OA', 'OB']),
      A: mkJoint('A', 'revolute', 40, 0, ['OA', 'AB']),
      B: mkJoint('B', 'revolute', 40, 30, ['AB', 'OB']),
    };
    const links: Record<string, Link> = {
      OA: mkLink('OA', 'O', 'A', 40),
      AB: mkLink('AB', 'A', 'B', 30),
      OB: mkLink('OB', 'O', 'B', 50),
    };
    const fixedIds = new Set(['O']);
    const targetAngle = Math.PI / 4;

    const r = solve(
      joints,
      links,
      { fixedJointId: 'O', drivenJointId: 'A', targetAngle },
      fixedIds,
    );

    expect(r.converged).toBe(true);
    expect(r.residual).toBeLessThan(1e-4);

    const posA = r.positions.get('A');
    const posB = r.positions.get('B');
    expect(posA).toBeDefined();
    expect(posB).toBeDefined();
    if (!posA || !posB) return;

    expect(Math.atan2(posA.y, posA.x)).toBeCloseTo(targetAngle, 2);

    expect(Math.hypot(posA.x, posA.y)).toBeCloseTo(40, 4);
    expect(Math.hypot(posB.x - posA.x, posB.y - posA.y)).toBeCloseTo(30, 4);
    expect(Math.hypot(posB.x, posB.y)).toBeCloseTo(50, 4);
  });
});
