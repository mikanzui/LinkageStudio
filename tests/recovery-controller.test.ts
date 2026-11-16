import test from 'node:test';
import assert from 'node:assert/strict';
import { RecoveryCoordinator } from '../src/document/recovery';
import type { RecoveryDraft, RecoverySnapshot, RecoveryStorage, RecoveryStatus } from '../src/document/recovery';
import { hasActiveInteractions, setInteractionActive, registerInteractionCancellation, cancelInteractions } from '../src/interaction/session';

const tick = () => new Promise<void>(resolve => setImmediate(resolve));
function deferred() { let resolve!: () => void; const promise = new Promise<void>(r => { resolve = r; }); return { promise, resolve }; }
function fixture() {
  const records = new Map<string, RecoveryDraft>(), writes: RecoveryDraft[] = [], removed: string[] = [], statuses: { status: RecoveryStatus; error?: string; generation: number }[] = [];
  let snapshot: RecoverySnapshot = { sessionId: 'a', generation: 0, displayName: 'Project A', text: '{"frame":0}', dirty: true };
  let active = false, closeCount = 0, failure = false, block: ReturnType<typeof deferred> | undefined, conflict = 0;
  const storage: RecoveryStorage = {
    async list() { return [...records.values()]; },
    async read(id) { return structuredClone(records.get(id) ?? null); },
    async write(draft) {
      writes.push(structuredClone(draft)); await block?.promise;
      if (failure) throw new DOMException('Recovery quota exceeded', 'QuotaExceededError');
      if (conflict > 0) { conflict--; records.set(draft.id, { ...draft, revision: draft.revision + 2 }); return false; }
      records.set(draft.id, structuredClone(draft)); return true;
    },
    async remove(id) { removed.push(id); records.delete(id); },
    close() { closeCount++; },
  };
  const coordinator = new RecoveryCoordinator(storage, {
    capture: () => active ? null : { ...snapshot },
    isCurrent: s => !active && s.sessionId === snapshot.sessionId && s.generation === snapshot.generation,
    status: (status, error) => statuses.push({ status, error, generation: snapshot.generation }),
  }, 60_000, () => 1000);
  return { records, writes, removed, statuses, storage, coordinator,
    change: (updates: Partial<RecoverySnapshot>) => { snapshot = { ...snapshot, ...updates, generation: snapshot.generation + 1 }; },
    active: (value: boolean) => { active = value; }, fail: (value: boolean) => { failure = value; },
    block: () => { block = deferred(); return block; }, conflict: (count: number) => { conflict = count; },
    closed: () => closeCount };
}

test('only a committed recovery write produces updated status, independently of file-save state', async () => {
  const f = fixture(), gate = f.block();
  try {
    const pending = f.coordinator.flush(); await tick(); assert.equal(f.writes.length, 1);
    assert.equal(f.statuses.at(-1)!.status, 'writing'); assert.equal(f.records.size, 0);
    gate.resolve(); await pending; assert.equal(f.statuses.at(-1)!.status, 'updated');
    assert.equal(f.records.get('a')!.text, '{"frame":0}'); assert.equal(f.records.get('a')!.revision, 1);
  } finally { f.coordinator.dispose(); }
});
test('one pending slot coalesces intermediate edits without overlapping writes', async () => {
  const f = fixture(), gate = f.block();
  try {
    const first = f.coordinator.flush(); await tick();
    f.change({ text: 'middle' }); const middle = f.coordinator.flush();
    f.change({ text: 'latest' }); const latest = f.coordinator.flush(); await tick();
    assert.equal(f.writes.length, 1); gate.resolve(); await Promise.all([first, middle, latest]);
    assert.deepEqual(f.writes.map(d => d.text), ['{"frame":0}', 'latest']);
    assert.equal(f.records.get('a')!.text, 'latest'); assert.equal(f.records.get('a')!.revision, 2);
    assert.equal(f.statuses.filter(s => s.status === 'updated').length, 1);
  } finally { f.coordinator.dispose(); }
});
test('replacing the project cannot overwrite the new session or publish old completion', async () => {
  const f = fixture(), gate = f.block();
  try {
    const first = f.coordinator.flush(); await tick(); f.change({ sessionId: 'b', text: 'project B' }); const next = f.coordinator.flush();
    gate.resolve(); await Promise.all([first, next]);
    assert.equal(f.records.get('a')!.text, '{"frame":0}'); assert.equal(f.records.get('b')!.text, 'project B');
    assert.equal(f.statuses.filter(s => s.status === 'updated').length, 1);
  } finally { f.coordinator.dispose(); }
});
test('quota failure preserves prior recovery and a subsequent valid write can retry', async () => {
  const f = fixture();
  try {
    await f.coordinator.flush(); f.change({ text: 'new' }); f.fail(true); await f.coordinator.flush();
    assert.equal(f.records.get('a')!.text, '{"frame":0}'); assert.equal(f.statuses.at(-1)!.status, 'unavailable');
    assert.match(f.statuses.at(-1)!.error!, /quota/);
    f.fail(false); await f.coordinator.flush(); assert.equal(f.records.get('a')!.text, 'new'); assert.equal(f.statuses.at(-1)!.status, 'updated');
  } finally { f.coordinator.dispose(); }
});
test('a failure from a replaced snapshot does not overwrite current recovery status', async () => {
  const f = fixture(), gate = f.block();
  try {
    const pending = f.coordinator.flush(); await tick(); f.change({ sessionId: 'b', text: 'B' }); f.fail(true);
    gate.resolve(); await pending; assert(!f.statuses.some(s => s.status === 'unavailable'));
  } finally { f.coordinator.dispose(); }
});
test('controller seeds persisted revisions after a remount and retries one concurrent revision conflict', async () => {
  const f = fixture(); f.records.set('a', { id: 'a', displayName: 'Old', text: 'old', revision: 8, updatedAt: 1, formatVersion: 1 });
  try {
    f.conflict(1); await f.coordinator.flush(); assert.deepEqual(f.writes.map(d => d.revision), [9, 12]);
    assert.equal(f.records.get('a')!.revision, 12); assert.equal(f.statuses.at(-1)!.status, 'updated');
  } finally { f.coordinator.dispose(); }
});
test('repeated revision conflicts are bounded and never claim updated status', async () => {
  const f = fixture();
  try { f.conflict(3); await f.coordinator.flush(); assert.equal(f.writes.length, 2); assert.equal(f.statuses.at(-1)!.status, 'unavailable'); }
  finally { f.coordinator.dispose(); }
});
test('a confirmed clean snapshot removes only its current session draft', async () => {
  const f = fixture();
  try {
    await f.coordinator.flush(); f.records.set('other', { ...f.records.get('a')!, id: 'other' });
    f.change({ dirty: false }); await f.coordinator.flush(); assert(!f.records.has('a')); assert(f.records.has('other'));
    assert.equal(f.statuses.at(-1)!.status, 'idle');
  } finally { f.coordinator.dispose(); }
});
test('explicit discard waits for an in-flight write before removing its record', async () => {
  const f = fixture(), gate = f.block();
  try {
    const pending = f.coordinator.flush(); await tick(); const discard = f.coordinator.discard('a');
    assert.equal(f.removed.length, 0); gate.resolve(); await Promise.all([pending, discard]); assert(!f.records.has('a'));
  } finally { f.coordinator.dispose(); }
});
test('active document gestures defer recovery rather than persisting transient geometry', async () => {
  const f = fixture();
  try {
    f.active(true); await f.coordinator.flush(); assert.equal(f.writes.length, 0); assert.equal(f.statuses.at(-1)!.status, 'pending');
    f.active(false); await f.coordinator.flush(); assert.equal(f.writes.length, 1);
  } finally { f.coordinator.dispose(); }
});
test('dispose cancels queued work and ignores an already-started completion', async () => {
  const f = fixture(), gate = f.block();
  const pending = f.coordinator.flush(); await tick(); f.change({ text: 'later' }); const next = f.coordinator.flush();
  f.coordinator.dispose(); const count = f.statuses.length; gate.resolve(); await Promise.all([pending, next]);
  assert.equal(f.writes.length, 1); assert.equal(f.statuses.length, count); assert.equal(f.closed(), 1);
  await f.coordinator.flush(); f.coordinator.notify(); assert.equal(f.writes.length, 1);
});
test('display-only recovery names are bounded without modifying saved project text', async () => {
  const f = fixture();
  try {
    f.change({ displayName: 'x'.repeat(1000), text: 'full project text' }); await f.coordinator.flush();
    assert.equal(f.records.get('a')!.displayName.length, 256); assert.equal(f.records.get('a')!.text, 'full project text');
  } finally { f.coordinator.dispose(); }
});
test('interaction ownership is per canvas and cancellation can release its lease', () => {
  const a = Symbol(), b = Symbol(); setInteractionActive(a, true); setInteractionActive(b, true);
  const unregister = registerInteractionCancellation(() => setInteractionActive(a, false));
  try { cancelInteractions(); assert(hasActiveInteractions()); setInteractionActive(b, false); assert(!hasActiveInteractions()); }
  finally { unregister(); setInteractionActive(a, false); setInteractionActive(b, false); }
});
