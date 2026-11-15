import { test } from 'node:test';
import assert from 'node:assert/strict';
import { useEditorStore as editor } from '../src/store/editor-store';
import { useMechanismStore as store } from '../src/store/mechanism-store';
import { deleteSelectedEntities } from '../src/utils/delete-selection';
import { snapshotMechanism } from '../src/core/compile-mechanism';

function rail() {
  store.getState().clearAll(); editor.getState().setMode('create');
  const a = store.getState().addJoint('revolute', { x: 0, y: 0 });
  const b = store.getState().addJoint('revolute', { x: 100, y: 0 });
  const c = store.getState().addJoint('revolute', { x: 50, y: 0 });
  const slider = store.getState().addSlider(a, b, c);
  const barrier = store.getState().addCollider(a, b);
  return { a, b, c, slider, barrier };
}
test('multi-object deletion is exactly one undo/redo command', () => {
  const { a,b,c,slider,barrier } = rail();
  const before = snapshotMechanism(store.getState()), past = store.getState().past.length;
  editor.setState({ selectedIds: new Set([a,b,c,slider,barrier]) });
  deleteSelectedEntities();
  assert.equal(store.getState().past.length, Math.min(past + 1, 50));
  assert.equal(Object.keys(store.getState().joints).length, 0);
  assert.equal(Object.keys(store.getState().colliders).length, 0);
  assert.equal(Object.keys(store.getState().sliders).length, 0);
  store.getState().undo(); assert.deepEqual(snapshotMechanism(store.getState()), before);
  store.getState().redo(); assert.equal(Object.keys(store.getState().joints).length, 0);
});
test('deleting one rail endpoint preserves other joints and removes incident constraints', () => {
  const { a,b,c } = rail();
  const before = snapshotMechanism(store.getState()); store.getState().removeJoint(a);
  assert(store.getState().joints[b]); assert(store.getState().joints[c]);
  assert.equal(Object.keys(store.getState().sliders).length, 0);
  assert.equal(Object.keys(store.getState().colliders).length, 0);
  for (const link of Object.values(store.getState().links)) for (const id of link.jointIds) assert(store.getState().joints[id]);
  store.getState().undo(); assert.deepEqual(snapshotMechanism(store.getState()), before);
});
test('deleting a rail alone retains its three joints and restores with one undo', () => {
  const { a,b,c,slider } = rail(), before = snapshotMechanism(store.getState());
  editor.setState({ selectedIds: new Set([slider]) }); deleteSelectedEntities();
  assert.deepEqual(Object.keys(store.getState().joints).sort(), [a,b,c].sort());
  assert.equal(Object.keys(store.getState().sliders).length, 0);
  store.getState().undo(); assert.deepEqual(snapshotMechanism(store.getState()), before);
});
