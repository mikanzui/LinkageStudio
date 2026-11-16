import assert from 'node:assert/strict';
import { beforeEach, test } from 'node:test';
import type { TestContext } from 'node:test';
import type { LocalSaveOutcome, saveLocalFile } from '../src/utils/file-adapter';

Object.assign(globalThis, { __APP_VERSION__: 'g8-local-save-sidecar' });
const { saveProjectLocally } = await import('../src/document/local-save');
const {
  importProject, projectText, projectDesignSignature, markProjectSaved,
  markProjectRecovered, isProjectDirty, useProjectStatus: status,
} = await import('../src/document/project');
const { useMechanismStore: mechanism } = await import('../src/store/mechanism-store');
const { useEditorStore: editor } = await import('../src/store/editor-store');

type Writer = typeof saveLocalFile;
const confirmed = (): LocalSaveOutcome => ({
  status: 'saved', name: 'Captured.slinker', confirmation: 'confirmed-write',
});

// Each writer stays unresolved until the test has performed the intervening action.
function delayedWriter(t: TestContext) {
  const calls: { text: string; name: string }[] = [];
  let resolve!: (outcome: LocalSaveOutcome) => void;
  let reject!: (error: unknown) => void;
  const completion = new Promise<LocalSaveOutcome>((yes, no) => { resolve = yes; reject = no; });
  const write: Writer = (text, name) => { calls.push({ text, name }); return completion; };
  t.after(() => resolve({ status: 'cancelled' }));
  return { calls, write, resolve, reject };
}

mechanism.getState().clearAll();
editor.getState().setMode('create');
const joint = mechanism.getState().addJoint('revolute', { x: 20, y: 30 });
const seed = projectText('Fixture');

beforeEach(() => {
  assert.equal(importProject(seed).ok, true);
  status.setState({ message: 'Existing message', severity: 'status' });
  assert.equal(isProjectDirty(), false);
});

function edit(x = 40) { mechanism.getState().editJoint(joint, { x, y: 30 }); }
function snapshot() {
  return { status: { ...status.getState() }, text: projectText(), name: editor.getState().projectName };
}

test('confirmed write captures requested name/payload and only then marks the current project saved', async (t) => {
  edit();
  const before = snapshot(), writer = delayedWriter(t);
  const operation = saveProjectLocally('Captured', writer.write);
  assert.equal(writer.calls.length, 1);
  const captured = writer.calls[0].text;
  assert.equal(writer.calls[0].name, 'Captured.slinker');
  assert.equal(JSON.parse(captured).projectName, 'Captured');
  assert.deepEqual(snapshot(), before);
  assert.equal(isProjectDirty(), true);
  writer.resolve(confirmed());
  assert.deepEqual(await operation, { outcome: confirmed(), obsolete: false, savedCurrent: true });
  assert.equal(editor.getState().projectName, 'Captured');
  assert.equal(status.getState().sessionId, before.status.sessionId);
  assert.equal(status.getState().savedText, projectDesignSignature(captured));
  assert.equal(status.getState().forceDirty, false);
  assert.equal(isProjectDirty(), false);
});

test('a design edit during a delayed write remains dirty against the captured baseline', async (t) => {
  edit();
  const writer = delayedWriter(t), operation = saveProjectLocally('Fixture', writer.write);
  const captured = writer.calls[0].text;
  edit(80);
  writer.resolve(confirmed());
  const result = await operation;
  assert.equal(result.savedCurrent, false);
  assert.equal(result.obsolete, false);
  assert.equal(status.getState().savedText, projectDesignSignature(captured));
  assert.equal(mechanism.getState().joints[joint].position.x, 80);
  assert.equal(isProjectDirty(), true);
  mechanism.getState().undo();
  assert.equal(isProjectDirty(), false, 'undo reaches the actually written design, not the pre-save baseline');
});

test('a rename during a delayed Save As is not overwritten or marked current', async (t) => {
  const writer = delayedWriter(t), operation = saveProjectLocally('Captured', writer.write);
  editor.getState().setProjectName('Newer rename');
  writer.resolve(confirmed());
  assert.equal((await operation).savedCurrent, false);
  assert.equal(editor.getState().projectName, 'Newer rename');
  assert.equal(status.getState().savedText, projectDesignSignature(writer.calls[0].text));
  assert.equal(isProjectDirty(), true);
});

test('view-only edits during a delayed Save As still permit saved-current without reverting the view', async (t) => {
  edit();
  const writer = delayedWriter(t), operation = saveProjectLocally('Captured', writer.write);
  const camera = { pan: { x: 123, y: -456 }, zoom: 2.5 };
  editor.setState({ camera, showLinks: !editor.getState().showLinks, showRulers: !editor.getState().showRulers });
  const view = JSON.parse(projectText()).viewPreferences;
  assert.notDeepEqual(view, JSON.parse(writer.calls[0].text).viewPreferences);
  writer.resolve(confirmed());
  assert.equal((await operation).savedCurrent, true);
  assert.deepEqual(editor.getState().camera, camera);
  assert.deepEqual(JSON.parse(projectText()).viewPreferences, view);
  assert.equal(isProjectDirty(), false);
});

test('edit then undo before completion is current when the captured design is restored', async (t) => {
  const writer = delayedWriter(t), operation = saveProjectLocally('Fixture', writer.write);
  edit();
  mechanism.getState().undo();
  writer.resolve(confirmed());
  assert.equal((await operation).savedCurrent, true);
  assert.equal(isProjectDirty(), false);
});

const unconfirmed: { label: string; outcome: LocalSaveOutcome }[] = [
  { label: 'cancel', outcome: { status: 'cancelled' } },
  { label: 'download initiation', outcome: { status: 'saved', name: 'Download.slinker', confirmation: 'download-initiated' } },
  { label: 'reported failure', outcome: { status: 'failed', error: new Error('disk full') } },
];
for (const { label, outcome } of unconfirmed) {
  for (const state of ['clean', 'edited', 'recovered'] as const) {
    test(`${label} leaves ${state} project identity, baseline and dirty state unchanged`, async (t) => {
      if (state === 'edited') edit();
      if (state === 'recovered') markProjectRecovered();
      const before = snapshot(), dirty = isProjectDirty(), writer = delayedWriter(t);
      const operation = saveProjectLocally('Must not rename', writer.write);
      writer.resolve(outcome);
      assert.deepEqual(await operation, { outcome, obsolete: false, savedCurrent: false });
      assert.deepEqual(snapshot(), before);
      assert.equal(isProjectDirty(), dirty);
    });
  }
}

test('recovered matching content remains force-dirty until the confirmed writer completes', async (t) => {
  markProjectRecovered();
  assert.equal(projectDesignSignature(projectText()), status.getState().savedText);
  assert.equal(isProjectDirty(), true);
  const writer = delayedWriter(t), operation = saveProjectLocally('Fixture', writer.write);
  assert.equal(status.getState().forceDirty, true);
  writer.resolve(confirmed());
  assert.equal((await operation).savedCurrent, true);
  assert.equal(status.getState().forceDirty, false);
  assert.equal(isProjectDirty(), false);
});

test('confirmed recovery write does not hide newer design edits', async (t) => {
  markProjectRecovered();
  const writer = delayedWriter(t), operation = saveProjectLocally('Fixture', writer.write);
  edit();
  writer.resolve(confirmed());
  assert.equal((await operation).savedCurrent, false);
  assert.equal(status.getState().savedText, projectDesignSignature(writer.calls[0].text));
  assert.equal(isProjectDirty(), true);
});

test('importing identical bytes starts a fresh session immune to an older confirmed completion', async (t) => {
  const writer = delayedWriter(t), operation = saveProjectLocally('Old session name', writer.write);
  const oldSession = status.getState().sessionId;
  assert.equal(importProject(seed).ok, true);
  assert.notEqual(status.getState().sessionId, oldSession);
  markProjectRecovered();
  const imported = snapshot();
  writer.resolve(confirmed());
  assert.deepEqual(await operation, { outcome: confirmed(), obsolete: true, savedCurrent: false });
  assert.deepEqual(snapshot(), imported);
  assert.equal(isProjectDirty(), true);
});

test('a different imported project and its newer edits survive an older completion', async (t) => {
  const different = JSON.parse(seed);
  different.projectName = 'Imported B';
  different.joints[joint].position.x = 700;
  const writer = delayedWriter(t), operation = saveProjectLocally('Old A', writer.write);
  assert.equal(importProject(JSON.stringify(different)).ok, true);
  edit(900);
  const imported = snapshot();
  writer.resolve(confirmed());
  assert.equal((await operation).obsolete, true);
  assert.deepEqual(snapshot(), imported);
  assert.equal(editor.getState().projectName, 'Imported B');
  assert.equal(isProjectDirty(), true);
});

test('failed import does not change identity or obsolete a pending valid save', async (t) => {
  const session = status.getState().sessionId;
  const writer = delayedWriter(t), operation = saveProjectLocally('Captured', writer.write);
  assert.equal(importProject('{').ok, false);
  assert.equal(status.getState().sessionId, session);
  writer.resolve(confirmed());
  const result = await operation;
  assert.equal(result.obsolete, false);
  assert.equal(result.savedCurrent, true);
  assert.equal(isProjectDirty(), false);
});

test('same-session concurrent save is refused without invoking its writer or changing saved state', async (t) => {
  edit();
  const writer = delayedWriter(t), operation = saveProjectLocally('First', writer.write);
  const before = snapshot();
  let secondCalls = 0;
  const refused = await saveProjectLocally('Second', async () => { secondCalls++; return confirmed(); });
  assert.equal(secondCalls, 0);
  assert.equal(refused.outcome.status, 'failed');
  if (refused.outcome.status === 'failed') assert.match(refused.outcome.error.message, /already in progress/i);
  assert.equal(refused.obsolete, false);
  assert.equal(refused.savedCurrent, false);
  assert.deepEqual(snapshot(), before);
  writer.resolve(confirmed());
  assert.equal((await operation).savedCurrent, true);
  assert.equal(editor.getState().projectName, 'First');
});

for (const failure of ['reported', 'rejected Error', 'rejected non-Error', 'synchronous throw'] as const) {
  test(`${failure} failure preserves baseline and releases the session lock for retry`, async (t) => {
    markProjectRecovered();
    const before = snapshot(), writer = delayedWriter(t), error = new Error('writer failed');
    const throwing: Writer = () => { throw error; };
    const operation = saveProjectLocally('Failed name', failure === 'synchronous throw' ? throwing : writer.write);
    if (failure === 'reported') writer.resolve({ status: 'failed', error });
    if (failure === 'rejected Error') writer.reject(error);
    if (failure === 'rejected non-Error') writer.reject('writer failed');
    const result = await operation;
    assert.equal(result.outcome.status, 'failed');
    if (result.outcome.status === 'failed') {
      assert(result.outcome.error instanceof Error);
      assert.equal(result.outcome.error.message, 'writer failed');
    }
    assert.equal(result.savedCurrent, false);
    assert.deepEqual(snapshot(), before);
    let retryCalls = 0;
    const retry = await saveProjectLocally('Retry', async () => { retryCalls++; return confirmed(); });
    assert.equal(retryCalls, 1);
    assert.equal(retry.savedCurrent, true);
    assert.equal(isProjectDirty(), false);
  });
}

for (const { label, outcome } of unconfirmed) {
  test(`${label} releases the session lock for a confirmed retry`, async (t) => {
    const writer = delayedWriter(t), operation = saveProjectLocally('First', writer.write);
    writer.resolve(outcome);
    await operation;
    let calls = 0;
    const retry = await saveProjectLocally('Retry', async () => { calls++; return confirmed(); });
    assert.equal(calls, 1);
    assert.equal(retry.savedCurrent, true);
    assert.equal(isProjectDirty(), false);
  });
}

test('new session may save while old writer is pending; old completion cannot unlock the new session', async (t) => {
  const oldWriter = delayedWriter(t), oldOperation = saveProjectLocally('Old', oldWriter.write);
  assert.equal(importProject(seed).ok, true);
  const newWriter = delayedWriter(t), newOperation = saveProjectLocally('New', newWriter.write);
  assert.equal(newWriter.calls.length, 1);
  const before = snapshot();
  oldWriter.resolve(confirmed());
  assert.equal((await oldOperation).obsolete, true);
  assert.deepEqual(snapshot(), before);
  let refusedCalls = 0;
  const refused = await saveProjectLocally('Third', async () => { refusedCalls++; return confirmed(); });
  assert.equal(refusedCalls, 0);
  assert.equal(refused.outcome.status, 'failed');
  newWriter.resolve(confirmed());
  assert.equal((await newOperation).savedCurrent, true);
  assert.equal(editor.getState().projectName, 'New');
  assert.equal(isProjectDirty(), false);
});

test('old completion after the new session has saved cannot overwrite its confirmed baseline', async (t) => {
  const writer = delayedWriter(t), oldOperation = saveProjectLocally('Old', writer.write);
  assert.equal(importProject(seed).ok, true);
  edit(300);
  assert.equal((await saveProjectLocally('New', async () => confirmed())).savedCurrent, true);
  const before = snapshot();
  writer.resolve(confirmed());
  assert.equal((await oldOperation).obsolete, true);
  assert.deepEqual(snapshot(), before);
  assert.equal(isProjectDirty(), false);
});

test('project design signature ignores only view preferences and derived adjacency, not name or geometry', () => {
  const base = projectText(), altered = JSON.parse(base);
  altered.viewPreferences = { camera: { pan: { x: 5, y: 9 }, zoom: 10 } };
  altered.joints[joint].connectedLinkIds = ['derived-only'];
  assert.equal(projectDesignSignature(JSON.stringify(altered)), projectDesignSignature(base));
  altered.projectName = 'Renamed';
  assert.notEqual(projectDesignSignature(JSON.stringify(altered)), projectDesignSignature(base));
  altered.projectName = JSON.parse(base).projectName;
  altered.joints[joint].position.x++;
  assert.notEqual(projectDesignSignature(JSON.stringify(altered)), projectDesignSignature(base));
});

test('markProjectSaved uses the supplied captured text, rather than replacing it with current text', () => {
  const captured = projectText();
  edit();
  markProjectRecovered();
  markProjectSaved(captured);
  assert.equal(status.getState().savedText, projectDesignSignature(captured));
  assert.equal(status.getState().forceDirty, false);
  assert.equal(isProjectDirty(), true);
});
