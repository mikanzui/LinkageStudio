import { test } from 'node:test';
import assert from 'node:assert/strict';
import { useMechanismStore as mechanism } from '../src/store/mechanism-store';
import { useEditorStore as editor } from '../src/store/editor-store';
import { snapshotMechanism } from '../src/core/compile-mechanism';
import { handleMouseDown, handleMouseMove, handleMouseUp } from '../src/interaction/tool-manager';

const rect = { left: 30, top: 40, width: 800, height: 600 };
const canvas = { getBoundingClientRect: () => rect } as unknown as HTMLCanvasElement;
const event = (x: number, y: number): PointerEvent => {
  const camera = editor.getState().camera;
  return { clientX: rect.left + camera.pan.x + x * camera.zoom, clientY: rect.top + camera.pan.y + y * camera.zoom,
    button: 0, pointerType: 'mouse', shiftKey: false, preventDefault() {} } as PointerEvent;
};
function load(mode: 'lasso' | 'box' = 'lasso') {
  handleMouseUp();
  mechanism.getState().loadState({ joints: {
    inside: { id: 'inside', type: 'revolute', position: { x: 200, y: 200 }, connectedLinkIds: [] },
    outside: { id: 'outside', type: 'revolute', position: { x: 500, y: 500 }, connectedLinkIds: [] },
  }, links: {}, bodies: { base: { id: 'base', name: 'Base', color: '#ff0000', jointIds: [], useOutlineCOM: false, showLinks: true } }, baseBodyId: 'base', outlines: {} });
  editor.getState().setMode('create'); editor.getState().setSelectMode(mode);
  editor.setState({ selectedIds: new Set(['outside']), camera: { zoom: 2, pan: { x: 100, y: 50 } }, excludedBodies: new Set() });
}

test('lasso includes the final release coordinate even without a last move event', () => {
  load(); const before = snapshotMechanism(mechanism.getState()), history = mechanism.getState().past.length;
  handleMouseDown(event(120, 120), canvas); handleMouseMove(event(360, 120), canvas);
  handleMouseUp(event(120, 360), canvas);
  assert.deepEqual([...editor.getState().selectedIds], ['inside']);
  assert.equal(editor.getState().selectionGesture, null);
  assert.deepEqual(snapshotMechanism(mechanism.getState()), before);
  assert.equal(mechanism.getState().past.length, history);
});

test('box uses the actual release corner rather than its stale move sample', () => {
  load('box'); handleMouseDown(event(120, 120), canvas); handleMouseMove(event(150, 150), canvas);
  handleMouseUp(event(300, 300), canvas);
  assert.deepEqual([...editor.getState().selectedIds], ['inside']);
});

for (const next of ['single', 'box'] as const) test('changing lasso to ' + next + ' makes late move/release inert', () => {
  load(); const before = snapshotMechanism(mechanism.getState());
  handleMouseDown(event(120, 120), canvas); handleMouseMove(event(360, 120), canvas);
  editor.getState().setSelectMode(next);
  handleMouseMove(event(120, 360), canvas); handleMouseUp(event(120, 360), canvas);
  assert.equal(editor.getState().selectMode, next);
  assert.deepEqual([...editor.getState().selectedIds], ['outside']);
  assert.equal(editor.getState().selectionGesture, null);
  assert.deepEqual(snapshotMechanism(mechanism.getState()), before);
});

test('changing a lasso to a drawing tool neither resurrects its preview nor draws geometry', () => {
  load(); const before = snapshotMechanism(mechanism.getState());
  handleMouseDown(event(120, 120), canvas); handleMouseMove(event(360, 120), canvas);
  editor.getState().setCreateTool('circle'); assert.equal(editor.getState().selectionGesture, null);
  handleMouseMove(event(120, 360), canvas); handleMouseUp(event(120, 360), canvas);
  assert.equal(editor.getState().selectionGesture, null);
  assert.deepEqual(snapshotMechanism(mechanism.getState()), before);
});

test('oversized freehand selection is bounded and leaves the previous selection/history intact', () => {
  load(); const history = mechanism.getState().past.length;
  handleMouseDown(event(10, 10), canvas);
  for (let i = 1; i <= 2050; i++) handleMouseMove(event(10 + i * 3, 10 + i % 2 * 3), canvas);
  const preview = editor.getState().selectionGesture;
  assert(preview?.kind === 'lasso'); assert.equal(preview.points.length, 2048);
  handleMouseUp(event(10, 300), canvas);
  assert.deepEqual([...editor.getState().selectedIds], ['outside']);
  assert.equal(editor.getState().selectionGesture, null);
  assert.equal(mechanism.getState().past.length, history);
});
