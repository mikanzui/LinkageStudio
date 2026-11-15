import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { MechanismState, Joint } from '../src/types';
import { fitMechanism } from '../src/renderer/viewport';
import { screenToWorld, worldToScreen, applyCamera, resetCamera } from '../src/renderer/camera';
import { visibleTicks } from '../src/renderer/ticks';
const joint = (id: string, x: number, y: number): Joint => ({ id, type: 'revolute', position: { x, y }, connectedLinkIds: [] });
const graph: MechanismState = { joints: { a: joint('a', 0, 0), b: joint('b', 100, 200), ground: joint('ground', 100000, 0) },
  links: {}, bodies: { base: { id: 'base', name: 'Base', color: '#f00', jointIds: ['a', 'ground'], useOutlineCOM: false, showLinks: true },
    arm: { id: 'arm', name: 'Arm', color: '#0f0', jointIds: ['a', 'b'], useOutlineCOM: false, showLinks: true } },
  baseBodyId: 'base', outlines: {}, images: {}, sliders: {}, colliders: {}, tracers: {} };
test('fit excludes Base-only ground rails while retaining shared fixed pivots', () => {
  const c = fitMechanism(graph, 404, 900);
  const a = worldToScreen(graph.joints.a.position, c), b = worldToScreen(graph.joints.b.position, c);
  for (const p of [a, b]) assert(p.x >= 72 && p.x <= 404 - 72 && p.y >= 72 && p.y <= 900 - 72);
  assert(c.zoom >= 1);
});
test('screen/world conversions preserve CSS-space coordinates at any backing DPI', () => {
  const camera = { pan: { x: 47, y: -100 }, zoom: .37 }, p = { x: 123.5, y: -88.2 };
  const back = screenToWorld(worldToScreen(p, camera), camera);
  assert(Math.hypot(back.x - p.x, back.y - p.y) < 1e-10);
  const calls: number[][] = [], ctx = { setTransform: (...args: number[]) => calls.push(args) } as unknown as CanvasRenderingContext2D;
  applyCamera(ctx, camera, 2); resetCamera(ctx, 2);
  assert.deepEqual(calls, [[.74, 0, 0, .74, 94, -200], [2, 0, 0, 2, 0, 0]]);
});
test('empty fit returns a finite centered view', () => {
  const c = fitMechanism({ ...graph, joints: {}, bodies: {} }, 404, 900);
  assert.deepEqual(c, { zoom: 1, pan: { x: 202, y: 450 } });
});
test('tick iteration is bounded under huge coordinates and invalid ranges', () => {
  assert.deepEqual(visibleTicks(0, 10, 2, 100), [0, 2, 4, 6, 8, 10]);
  assert(visibleTicks(1e300, 1e300, 25, 10).length <= 10);
  assert(visibleTicks(-1e300, 1e300, 25, 50).length <= 50);
  for (const step of [0, -1, NaN, Infinity]) assert.deepEqual(visibleTicks(0, 100, step, 50), []);
});
