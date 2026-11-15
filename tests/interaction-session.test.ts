import { test } from 'node:test';
import assert from 'node:assert/strict';
import { cancelInteractions, registerInteractionCancellation } from '../src/interaction/session';
import { useMechanismStore } from '../src/store/mechanism-store';

test('interaction cancellation reaches mounted owners, and unmount removes callbacks', () => {
  const calls: number[] = [], a = registerInteractionCancellation(() => calls.push(1));
  const b = registerInteractionCancellation(() => calls.push(2));
  cancelInteractions(); assert.deepEqual(calls, [1,2]); a(); cancelInteractions();
  assert.deepEqual(calls, [1,2,2]); b(); cancelInteractions(); assert.deepEqual(calls, [1,2,2]);
});
test('history and document boundaries cancel capture before replacing state', () => {
  const store = useMechanismStore;
  let calls = 0;
  const dispose = registerInteractionCancellation(() => calls++);
  try {
    store.getState().undo(); store.getState().redo(); store.getState().clearAll();
    const state = store.getState();
    store.getState().loadState({ joints: {}, links: {}, bodies: state.bodies, baseBodyId: state.baseBodyId, outlines: {} });
    assert.equal(calls, 4);
  } finally { dispose(); }
});
