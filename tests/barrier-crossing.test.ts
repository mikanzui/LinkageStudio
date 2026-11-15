import { test } from 'node:test';
import assert from 'node:assert/strict';
import { sweptBarrierCrossing } from '../src/core/solver/barrier-crossing';
import type { Vec2, SweptBarrierCrossing } from '../src/core/solver/barrier-crossing';

const v = (x: number, y: number): Vec2 => ({ x, y });
type Sweep = [Vec2, Vec2, Vec2, Vec2, Vec2, Vec2];
const staticSweep: Sweep = [v(1, 2), v(1, -2), v(0, 0), v(0, 0), v(4, 0), v(4, 0)];
const quadraticSweep: Sweep = [v(.5, .1875), v(-.5, -.3125), v(0, 0), v(0, 0), v(1, 0), v(1, 1)];

function close(actual: number, expected: number, tolerance = 1e-12): void {
  assert(Math.abs(actual - expected) <= tolerance, `${actual} != ${expected}`);
}

function hit(sweep: Sweep, time: number, segmentT: number, normal: Vec2): SweptBarrierCrossing {
  const result = sweptBarrierCrossing(...sweep);
  assert(result);
  close(result.time, time);
  close(result.segmentT, segmentT);
  close(result.normal.x, normal.x);
  close(result.normal.y, normal.y);
  close(Math.hypot(result.normal.x, result.normal.y), 1);
  return result;
}

test('static rail: continuous crossing, unit ordered normal and both travel directions', () => {
  hit(staticSweep, .5, .25, v(0, 1));
  hit([staticSweep[1], staticSweep[0], ...staticSweep.slice(2)] as Sweep, .5, .25, v(0, 1));
  hit([staticSweep[0], staticSweep[1], v(4, 0), v(4, 0), v(0, 0), v(0, 0)], .5, .75, v(0, -1));
});

test('translated rail crosses a stationary point in relative coordinates', () => {
  hit([v(1, 0), v(1, 0), v(0, -2), v(0, 2), v(4, -2), v(4, 2)], .5, .25, v(0, 1));
});

test('rotating rail intersects at its interpolated finite geometry', () => {
  hit([v(.5, .5), v(.5, .5), v(0, 0), v(0, 0), v(2, 0), v(0, 2)], .5, .5, v(-Math.SQRT1_2, Math.SQRT1_2));
});

test('quadratic roots are chronological; a later out-of-segment root is not used', () => {
  const length = Math.hypot(1, .25);
  hit(quadraticSweep, .25, .25, v(-.25 / length, 1 / length));
});

test('two valid side changes in one step return the first, despite matching end sides', () => {
  const length = Math.hypot(1, .25);
  hit([v(1, .1875), v(0, .1875), ...quadraticSweep.slice(2)] as Sweep,
    .25, .75, v(-.25 / length, 1 / length));
});

test('combined point and endpoint translation preserves a rotating-rail collision', () => {
  const shifted = quadraticSweep.map((p, i) => {
    const translation = i % 2 === 0 ? v(-7, 13) : v(21, -4);
    return v(p.x + translation.x, p.y + translation.y);
  }) as Sweep;
  const length = Math.hypot(1, .25);
  hit(shifted, .25, .25, v(-.25 / length, 1 / length));
});

test('skip an early root outside the segment, then return the later finite crossing', () => {
  const length = Math.hypot(1, .75);
  hit([v(1.5, .1875), v(.5, .6875), ...quadraticSweep.slice(2)] as Sweep,
    .75, .75, v(-.75 / length, 1 / length));
});

test('high-speed sweep can end beyond an endpoint after an interior collision', () => {
  hit([v(-1, 2), v(5, -2), ...staticSweep.slice(2)] as Sweep, .5, .5, v(0, 1));
  hit([v(1, 1e12), v(1, -1e12), ...staticSweep.slice(2)] as Sweep, .5, .25, v(0, 1));
});

test('a genuine endpoint bypass is not a supporting-line collision', () => {
  assert.equal(sweptBarrierCrossing(v(3, 2), v(9, -2), ...staticSweep.slice(2) as [Vec2, Vec2, Vec2, Vec2]), null);
  assert.equal(sweptBarrierCrossing(v(-3, 2), v(-1, -2), ...staticSweep.slice(2) as [Vec2, Vec2, Vec2, Vec2]), null);
});

test('exact spatial endpoints and a simple root at the end of the step count', () => {
  for (const x of [0, 4]) {
    hit([v(x, 1), v(x, -1), ...staticSweep.slice(2)] as Sweep, .5, x / 4, v(0, 1));
  }
  hit([v(1, 2), v(1, 0), ...staticSweep.slice(2)] as Sweep, 1, .25, v(0, 1));
});

test('a start touch moving away or remaining on the line is not a crossing', () => {
  for (const end of [v(1, 1), v(1, -1), v(2, 0)]) {
    assert.equal(sweptBarrierCrossing(v(1, 0), end, ...staticSweep.slice(2) as [Vec2, Vec2, Vec2, Vec2]), null);
  }
});

test('ignoring a start touch does not discard a genuine later quadratic crossing', () => {
  const length = Math.hypot(1, .5);
  hit([v(1, 0), v(0, .5), ...quadraticSweep.slice(2)] as Sweep, .5, .5, v(-.5 / length, 1 / length));
});

test('tangential quadratic contact has no side change, even at a segment endpoint', () => {
  for (const s of [.5, 1]) {
    assert.equal(sweptBarrierCrossing(v(s, .25), v(s - 1, s - .75), ...quadraticSweep.slice(2) as [Vec2, Vec2, Vec2, Vec2]), null);
  }
});

test('parallel, collinear, no-real-root and outside-time paths do not collide', () => {
  for (const [from, to] of [[v(1, 2), v(3, 2)], [v(-1, 0), v(5, 0)], [v(1, 2), v(1, 1)], [v(1, -1), v(1, -2)]]) {
    assert.equal(sweptBarrierCrossing(from, to, ...staticSweep.slice(2) as [Vec2, Vec2, Vec2, Vec2]), null);
  }
  assert.equal(sweptBarrierCrossing(v(.5, 1), v(-.5, .5), ...quadraticSweep.slice(2) as [Vec2, Vec2, Vec2, Vec2]), null);
});

test('spatial and temporal near-misses outside tolerance are not clamped into collisions', () => {
  for (const x of [-1e-8, 4 + 1e-8]) {
    assert.equal(sweptBarrierCrossing(v(x, 1), v(x, -1), ...staticSweep.slice(2) as [Vec2, Vec2, Vec2, Vec2]), null);
  }
  for (const [from, to] of [[v(1, 1), v(1, 1e-8)], [v(1, -1e-8), v(1, -1)]]) {
    assert.equal(sweptBarrierCrossing(from, to, ...staticSweep.slice(2) as [Vec2, Vec2, Vec2, Vec2]), null);
  }
});

test('zero-length barriers and a rail collapsing exactly at contact are rejected', () => {
  assert.equal(sweptBarrierCrossing(v(0, 1), v(0, -1), v(0, 0), v(0, 0), v(0, 0), v(0, 0)), null);
  assert.equal(sweptBarrierCrossing(v(0, 1), v(0, 1), v(-1, 0), v(1, 0), v(1, 0), v(-1, 0)), null);
});

test('an initially or finally collapsed rail may still cross while nondegenerate', () => {
  hit([v(.25, 1), v(.25, -1), v(0, 0), v(0, 0), v(0, 0), v(2, 0)], .5, .25, v(0, 1));
  hit([v(.25, 1), v(.25, -1), v(0, 0), v(0, 0), v(2, 0), v(0, 0)], .5, .25, v(0, 1));
});

test('all nonfinite coordinate inputs are rejected', () => {
  for (let index = 0; index < 6; index++) for (const axis of ['x', 'y'] as const) {
    for (const value of [NaN, Infinity, -Infinity]) {
      const sweep = structuredClone(staticSweep);
      sweep[index] = { ...sweep[index], [axis]: value };
      assert.equal(sweptBarrierCrossing(...sweep), null);
    }
  }
});

test('translation, rotation and positive scale preserve contact parameters and rotate the normal', () => {
  const angle = .731, cos = Math.cos(angle), sin = Math.sin(angle);
  const base = sweptBarrierCrossing(...quadraticSweep);
  assert(base);
  for (const scale of [1e-150, 1e-9, 1, 1e9, 1e150]) {
    for (const offset of [v(0, 0), v(17, -31)]) {
      const transformed = quadraticSweep.map(p => v(
        scale * (cos * p.x - sin * p.y + offset.x),
        scale * (sin * p.x + cos * p.y + offset.y),
      )) as Sweep;
      hit(transformed, base.time, base.segmentT,
        v(cos * base.normal.x - sin * base.normal.y, sin * base.normal.x + cos * base.normal.y));
    }
  }
});

test('exact endpoint crossings remain valid under translated rotations', () => {
  for (let i = 0; i < 1000; i++) {
    const cos = Math.cos(i * .123), sin = Math.sin(i * .123);
    const sweep = [v(0, 2), v(0, -2), ...staticSweep.slice(2)].map(p =>
      v(cos * p.x - sin * p.y + 17, sin * p.x + cos * p.y - 31)) as Sweep;
    hit(sweep, .5, 0, v(-sin, cos));
  }
});

test('stable quadratic retains a small positive root without subtractive cancellation', () => {
  const small = 1e-10;
  const sweep = [v(.5, .5 * small), v(-.5, -.5 * small), ...quadraticSweep.slice(2)] as Sweep;
  const result = sweptBarrierCrossing(...sweep);
  assert(result);
  close(result.time, small, 1e-20);
  close(result.segmentT, .5 - small);
});

test('nearly linear quadratic uses scaled tolerance rather than an absolute cutoff', () => {
  hit([v(1, 2), v(1, -2), v(0, 0), v(0, 0), v(4, 0), v(4, 1e-16)], .5, .25, v(0, 1));
  hit([v(1, 2e-100), v(1, -2e-100), ...staticSweep.slice(2)] as Sweep, .5, .25, v(0, 1));
});

test('small quadratic coefficients do not underflow when finding genuine roots', () => {
  const sweep = quadraticSweep.map(p => v(p.x, p.y * 1e-200)) as Sweep;
  hit(sweep, .25, .25, v(-.25e-200, 1));
});

test('the function is deterministic and never mutates source vectors', () => {
  const sweep = structuredClone(quadraticSweep);
  const before = structuredClone(sweep);
  sweep.forEach(Object.freeze);
  Object.freeze(sweep);
  const first = sweptBarrierCrossing(...sweep);
  assert.deepEqual(sweptBarrierCrossing(...sweep), first);
  assert.deepEqual(sweep, before);
  assert(first);
  for (const source of sweep) assert.notEqual(first.normal, source);
  assert.deepEqual(sweptBarrierCrossing(...sweep), sweptBarrierCrossing(...before));
});
