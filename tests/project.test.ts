import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

Object.assign(globalThis, { __APP_VERSION__: 'rebuild-g1' });
const { importProject, projectText, isProjectDirty, markProjectSaved } = await import('../src/document/project');
const { useMechanismStore: store } = await import('../src/store/mechanism-store');
const { useEditorStore: editor } = await import('../src/store/editor-store');
const fixture = (name: string) => readFileSync(new URL(`../../../baselines/2026-11-15T18-45-10-493Z-CMbWTX/fixtures/${name}`, import.meta.url), 'utf8');

test('failed import preserves document, history and editor state', () => {
  assert(importProject(fixture('airer.slinker')).ok);
  const before = projectText();
  const history = store.getState().past;
  const e = editor.getState();
  assert.equal(importProject('{').ok, false);
  assert.equal(projectText(), before); assert.equal(store.getState().past, history); assert.equal(editor.getState(), e);
});
test('A/B/A import has no stale design-position or selection state', () => {
  for (const name of ['airer.slinker', 'working-screen.json', 'airer.slinker']) {
    editor.setState({ mode: 'simulate', savedPositions: { old: { x: 1, y: 2 } }, selectedIds: new Set(['old']) });
    assert(importProject(fixture(name)).ok);
    assert.equal(editor.getState().mode, 'create'); assert.equal(editor.getState().savedPositions, null);
    assert.equal(editor.getState().selectedIds.size, 0); assert.equal(isProjectDirty(), false);
  }
});
test('commands create/reassign/fix/delete/clear/undo/redo preserve stable IDs and graph', () => {
  store.getState().clearAll(); markProjectSaved();
  const body = store.getState().addBody('Test');
  const a = store.getState().addJoint('revolute', { x: 20, y: 30 }, [body]);
  const b = store.getState().addJoint('revolute', { x: 60, y: 80 }, [body]);
  assert.equal(isProjectDirty(), true);
  store.getState().addJointToBody(a, 'base');
  assert.equal(store.getState().joints[a].type, 'fixed');
  const fixed = projectText();
  store.getState().undo(); assert.equal(store.getState().joints[a].type, 'revolute');
  store.getState().redo(); assert.equal(projectText(), fixed);
  store.getState().removeJoint(b); assert.equal(store.getState().joints[b], undefined);
  store.getState().undo(); assert(store.getState().joints[b]);
  const before = projectText(); store.getState().clearAll(); store.getState().undo(); assert.equal(projectText(), before);
});
test('history snapshots cannot be corrupted by later nested mutations', () => {
  store.getState().clearAll(); const id = store.getState().addJoint('revolute', { x: 1, y: 2 });
  store.getState().pushHistory(); store.getState().joints[id].position.x = 999;
  store.getState().undo(); assert.equal(store.getState().joints[id].position.x, 1);
});
test('coordinate edit is one undoable transaction and rejects non-finite edits', () => {
  store.getState().clearAll(); const id = store.getState().addJoint('revolute', { x: 1, y: 2 });
  store.getState().editJoint(id, { x: 3, y: 4 });
  assert.deepEqual(store.getState().joints[id].position, { x: 3, y: 4 });
  store.getState().undo(); assert.deepEqual(store.getState().joints[id].position, { x: 1, y: 2 });
  const history = store.getState().past;
  store.getState().editJoint(id, { x: NaN, y: 2 }); assert.equal(store.getState().past, history);
  store.getState().updateJointType(id, 'fixed'); assert(store.getState().bodies.base.jointIds.includes(id));
  store.getState().updateJointType(id, 'revolute'); assert(!store.getState().bodies.base.jointIds.includes(id));
});
for (const name of ['airer.slinker', 'working-screen.json']) test(`${name}: editor save/reopen retains original entity data and semantics`, () => {
  const original = JSON.parse(fixture(name)); assert(importProject(fixture(name)).ok);
  const saved = projectText(); const parsed = JSON.parse(saved);
  for (const kind of ['joints', 'links', 'bodies', 'outlines', 'images', 'sliders', 'colliders', 'tracers']) {
    const actual = parsed[kind] ?? {}, expected = original[kind] ?? {};
    assert.deepEqual(Object.keys(actual).sort(), Object.keys(expected).sort(), kind);
    for (const [id, entity] of Object.entries(expected)) for (const [key, value] of Object.entries(entity as object)) assert.deepEqual(actual[id][key], value, `${kind}.${id}.${key}`);
  }
  assert.equal(parsed.sourceVersion, original.version);
  assert(importProject(saved).ok); assert.equal(projectText(), saved); assert.equal(isProjectDirty(), false);
});
test('malformed persisted spring is refused atomically, never silently lost', () => {
  const before = projectText(); const d = JSON.parse(fixture('airer.slinker')); d.springs = { x: { id: 'x' } };
  const outcome = importProject(JSON.stringify(d)); assert.equal(outcome.ok, false);
  assert(outcome.issues.some(issue => issue.severity === 'error' && issue.path === 'springs.x'));
  assert.equal(projectText(), before);
});
