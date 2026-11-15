import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { Joint, Vec2 } from '../src/types';
import { solveWithForce } from '../src/core/solver/newton-raphson';
const joint = (id: string, x: number, y: number, fixed = false): Joint => ({ id, type: fixed ? 'fixed' : 'revolute', position: { x, y }, connectedLinkIds: [] });
function run(point: Vec2, velocity: Vec2, moving = false) {
  const joints = { a: joint('a', 0, moving ? -10 : 0, !moving), c: joint('c', 100, moving ? -10 : 0, !moving), p: joint('p', point.x, point.y) };
  const velocities = new Map<string, Vec2>([['p', velocity]]);
  if (moving) { velocities.set('a', { x: 0, y: 1200 }); velocities.set('c', { x: 0, y: 1200 }); }
  const sides = new Map([['wall:p', Math.sign(point.y - joints.a.position.y)]]);
  return solveWithForce(joints, {}, { enabled: false, strength: 0 }, null, 1, 25, .25, 1 / 60,
    new Set(moving ? [] : ['a', 'c']), undefined, {}, [], { wall: { id: 'wall', jointIdA: 'a', jointIdC: 'c', bodyIds: ['target'] } },
    sides, { target: { jointIds: ['p'] } }, undefined, velocities).positions;
}
test('high speed point cannot tunnel through static finite barrier', () => {
  const result = run({ x: 50, y: -10 }, { x: 0, y: 20000 });
  assert(result.get('p')!.y <= 0); assert.deepEqual(result.get('a'), { x: 0, y: 0 }); assert.deepEqual(result.get('c'), { x: 100, y: 0 });
});
test('swept crossing is blocked even when prediction ends past an endpoint', () => {
  const result = run({ x: -50, y: -10 }, { x: 120000, y: 24000 });
  assert(result.get('p')!.y <= 0);
});
test('genuine path around finite endpoint can cross supporting line', () => {
  const result = run({ x: 150, y: -10 }, { x: 0, y: 2000 });
  assert(result.get('p')!.y > 0);
});
test('translating barrier pushes a stationary point without passing through it', () => {
  const result = run({ x: 50, y: 0 }, { x: 0, y: 0 }, true);
  assert(result.get('p')!.y >= result.get('a')!.y);
});
