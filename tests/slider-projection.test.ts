import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { Joint, Vec2 } from '../src/types';
import { projectSlider } from '../src/core/solver/slider-projection';
function project(points: Vec2[], free: boolean[], repeats = 1) {
  const ids = ['a', 'b', 'c'], index = new Map<string, number>(); const positions: number[] = [];
  const joints: Record<string, Joint> = {};
  ids.forEach((id, i) => { joints[id] = { id, type: free[i] ? 'revolute' : 'fixed', position: { ...points[i] }, connectedLinkIds: [] }; if (free[i]) { index.set(id, positions.length); positions.push(points[i].x, points[i].y); } });
  const buffer = new Float64Array(positions); const before = structuredClone(joints);
  for (let i = 0; i < repeats; i++) projectSlider({ id: 's', jointIdA: 'a', jointIdB: 'b', jointIdC: 'c', t: .5 }, joints, index, buffer);
  assert.deepEqual(joints, before);
  return ids.map(id => index.has(id) ? { x: buffer[index.get(id)!], y: buffer[index.get(id)! + 1] } : joints[id].position);
}
for (const x of [-50, 25, 50, 100, 150]) test(`fixed horizontal rail, B x=${x} clamps and projects exactly`, () => {
  const p = project([{ x: 0, y: 0 }, { x, y: 25 }, { x: 100, y: 0 }], [false, true, false]);
  assert.deepEqual(p, [{ x: 0, y: 0 }, { x: Math.max(0, Math.min(100, x)), y: 0 }, { x: 100, y: 0 }]);
});
test('fixed rotated rail has rotation-invariant projection and clamp', () => {
  const p = project([{ x: 0, y: 0 }, { x: 20, y: 80 }, { x: 100, y: 100 }], [false, true, false]);
  assert(Math.abs(p[1].x - 50) < 1e-10 && Math.abs(p[1].y - 50) < 1e-10);
});
test('fixed B on a free rail applies lever-arm weighted correction and retains B', () => {
  const p = project([{ x: 0, y: 10 }, { x: 25, y: 0 }, { x: 100, y: 10 }], [true, false, true], 30);
  const cross = (p[2].x - p[0].x) * (p[1].y - p[0].y) - (p[2].y - p[0].y) * (p[1].x - p[0].x);
  assert(Math.abs(cross) < 1e-8); assert.deepEqual(p[1], { x: 25, y: 0 });
});
test('one fixed rail endpoint uses only available inverse mass', () => {
  const p = project([{ x: 0, y: 0 }, { x: 25, y: 5 }, { x: 100, y: 0 }], [false, false, true], 30);
  const cross = p[2].x * p[1].y - p[2].y * p[1].x;
  assert(Math.abs(cross) < 1e-8); assert.deepEqual(p[0], { x: 0, y: 0 }); assert.deepEqual(p[1], { x: 25, y: 5 });
});
test('all fixed and degenerate rails remain unchanged and finite', () => {
  const fixed = [{ x: 0, y: 0 }, { x: 25, y: 5 }, { x: 100, y: 0 }]; assert.deepEqual(project(fixed, [false, false, false]), fixed);
  const zero = [{ x: 0, y: 0 }, { x: 25, y: 5 }, { x: 0, y: 0 }]; assert.deepEqual(project(zero, [true, true, true]), zero);
});
