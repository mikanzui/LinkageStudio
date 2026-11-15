import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createPointerRuntime } from '../src/interaction/pointer-runtime';
test('each canvas owns its runtime, with no module-level pointer state', () => {
  const a = createPointerRuntime(), b = createPointerRuntime(); a.activePointers.set(1, { x: 1, y: 2 }); a.mode = 'pinch';
  assert.equal(b.activePointers.size, 0); assert.equal(b.mode, 'none');
});
test('active pen ignores palm/finger/mouse and foreign pen endings', () => {
  const s = createPointerRuntime(); s.penId = 10; s.mode = 'interact';
  for (const phase of ['down', 'move', 'up', 'cancel'] as const) {
    assert.equal(s.accepts(11, 'touch', phase), false); assert.equal(s.accepts(1, 'mouse', phase), false); assert.equal(s.accepts(12, 'pen', phase), false);
  }
  assert.equal(s.accepts(10, 'pen', 'move'), true); assert.equal(s.accepts(10, 'pen', 'up'), true);
});
test('unregistered touch moves/endings cannot recreate an abandoned gesture', () => {
  const s = createPointerRuntime(); assert(s.accepts(1, 'touch', 'down'));
  assert.equal(s.accepts(1, 'touch', 'move'), false); s.activePointers.set(1, { x: 0, y: 0 });
  assert(s.accepts(1, 'touch', 'move')); assert.equal(s.accepts(2, 'touch', 'up'), false);
  s.reset(); assert.equal(s.accepts(1, 'touch', 'up'), false);
});
test('pen may take ownership from touch; mouse cannot compete with touch', () => {
  const s = createPointerRuntime(); s.activePointers.set(1, { x: 0, y: 0 }); s.mode = 'pan';
  assert(s.accepts(2, 'pen', 'down')); assert.equal(s.accepts(3, 'mouse', 'down'), false);
});
test('mouse capture blocks touch and only its owner ends the mouse interaction', () => {
  const s = createPointerRuntime(); s.mouseId = 1;
  assert.equal(s.accepts(2, 'touch', 'down'), false); assert.equal(s.accepts(2, 'mouse', 'up'), false); assert(s.accepts(1, 'mouse', 'up'));
});
test('reset clears every gesture cache and enables an independent next interaction', () => {
  const s = createPointerRuntime(); Object.assign(s, { mode: 'pinch', lastPinchDist: 200, lastPinchCenter: { x: 1, y: 2 }, penId: 2, mouseId: 3, touchStartPointerId: 4, touchStartPos: { x: 1, y: 2 }, lastTouchScreen: { x: 1, y: 2 } });
  s.activePointers.set(1, { x: 0, y: 0 }); s.reset();
  const fresh = createPointerRuntime();
  for (const key of ['mode', 'lastPinchDist', 'lastPinchCenter', 'penId', 'mouseId', 'touchStartPointerId', 'touchStartPos', 'lastTouchScreen'] as const) assert.deepEqual(s[key], fresh[key]);
  assert.equal(s.activePointers.size, 0); assert(s.accepts(9, 'touch', 'down'));
});
