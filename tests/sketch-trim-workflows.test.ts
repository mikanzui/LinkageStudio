import { test } from 'node:test';
import assert from 'node:assert/strict';
import { useEditorStore as editor } from '../src/store/editor-store';
import { useMechanismStore as mechanism } from '../src/store/mechanism-store';
import { beginGeometry, moveGeometry, finishGeometry, commitOutline } from '../src/interaction/geometry-tools';
import { projectText, importProject } from '../src/document/project';
import { snapshotMechanism } from '../src/core/compile-mechanism';
import { computeBodyTransform, localToWorld } from '../src/core/body-transform';
import type { Vec2 } from '../src/types';

Object.assign(globalThis, { __APP_VERSION__: '17.1.0' });
const p = (x: number, y: number): Vec2 => ({ x, y });
function load() {
  mechanism.getState().loadState({ joints: {
    a: { id: 'a', type: 'revolute', position: p(100, 100), connectedLinkIds: ['rod'] },
    b: { id: 'b', type: 'revolute', position: p(200, 100), connectedLinkIds: ['rod'] },
  }, links: { rod: { id: 'rod', jointIds: ['a', 'b'], restLength: 100, mass: 1 } }, bodies: {
    base: { id: 'base', name: 'Base', color: '#ff0000', jointIds: [], useOutlineCOM: false, showLinks: true },
    arm: { id: 'arm', name: 'Arm', color: '#00ff00', jointIds: ['a', 'b'], useOutlineCOM: false, showLinks: true },
  }, baseBodyId: 'base', outlines: {} });
  editor.getState().setMode('create'); editor.setState({ activeBodyIds: new Set(['arm']), gridEnabled: false,
    lockOutlines: true, frozenOutlineWorldPoints: new Map(), trimScope: 'selected' });
}
function drawLine(a: Vec2, b: Vec2) {
  editor.getState().setCreateTool('outline'); editor.setState({ outlinePoints: [a, b] }); commitOutline();
  return [...editor.getState().selectedIds][0];
}
function drawCircle() {
  editor.getState().setCreateTool('circle'); beginGeometry(p(300, 300), false); moveGeometry(p(380, 300)); finishGeometry(true);
  return [...editor.getState().selectedIds][0];
}
function world(id: string) {
  const m = mechanism.getState(), outline = m.outlines[id], frame = computeBodyTransform(m.bodies[outline.bodyId], m.joints);
  return outline.points.map(point => localToWorld(point, frame));
}

for (const method of ['power', 'closest'] as const) test(method + ' intersection trim has exact one-step undo, preserved mechanics and saved/open arcs', () => {
  load(); const id = drawCircle(), boundary = drawLine(p(300, 200), p(300, 400));
  editor.getState().select(id); editor.getState().setCreateTool('trim'); editor.setState({ trimMode: method });
  const before = snapshotMechanism(mechanism.getState()), history = mechanism.getState().past.length;
  beginGeometry(p(method === 'power' ? 370 : 380, 300), false);
  if (method === 'power') moveGeometry(p(390, 300));
  assert(editor.getState().trimPreview.length > 0);
  assert.deepEqual(snapshotMechanism(mechanism.getState()), before, 'Preview does not mutate the design');
  finishGeometry(true);
  const after = snapshotMechanism(mechanism.getState());
  assert.equal(after.outlines[id].closed, false); assert.equal(after.outlines[id].primitive, 'circle');
  assert(world(id).every(p => p.x <= 300 + 1e-7));
  assert.deepEqual(after.outlines[boundary], before.outlines[boundary]);
  assert.deepEqual(after.joints, before.joints); assert.deepEqual(after.links, before.links); assert.deepEqual(after.bodies, before.bodies);
  assert.equal(mechanism.getState().past.length, history + 1); assert.deepEqual(editor.getState().trimPreview, []);
  const saved = projectText();
  mechanism.getState().undo(); assert.deepEqual(snapshotMechanism(mechanism.getState()), before);
  mechanism.getState().redo(); assert.deepEqual(snapshotMechanism(mechanism.getState()), after);
  assert(importProject(saved).ok); assert.deepEqual(mechanism.getState().outlines[id], after.outlines[id]);
  assert(world(id).every(p => p.x <= 300 + 1e-7));
});

test('cancel and concurrent document changes cannot commit a stale trim snapshot', () => {
  load(); const id = drawCircle(); drawLine(p(300, 200), p(300, 400));
  editor.getState().select(id); editor.getState().setCreateTool('trim');
  const before = snapshotMechanism(mechanism.getState()), history = mechanism.getState().past.length;
  beginGeometry(p(370, 300), false); moveGeometry(p(390, 300)); finishGeometry(false);
  assert.deepEqual(snapshotMechanism(mechanism.getState()), before); assert.equal(mechanism.getState().past.length, history);
  beginGeometry(p(370, 300), false); moveGeometry(p(390, 300));
  mechanism.getState().addBody('New body');
  const concurrent = snapshotMechanism(mechanism.getState()), changedHistory = mechanism.getState().past.length;
  finishGeometry(true);
  assert.deepEqual(snapshotMechanism(mechanism.getState()), concurrent); assert.equal(mechanism.getState().past.length, changedHistory);
});

test('two-point outlines create usable open sketch lines in one history action and round-trip', () => {
  load(); const history = mechanism.getState().past.length, id = drawLine(p(250, 200), p(350, 200));
  assert.equal(mechanism.getState().outlines[id].closed, false); assert.equal(mechanism.getState().past.length, history + 1);
  const expected = world(id); assert(importProject(projectText()).ok); assert.deepEqual(world(id), expected);
});

test('explicit extension and Shift-Power extension alter only an open endpoint, with undo', () => {
  for (const shift of [false, true]) {
    load(); const id = drawLine(p(250, 200), p(350, 200)); drawLine(p(400, 150), p(400, 250));
    editor.getState().select(id); editor.getState().setCreateTool('trim'); editor.setState({ trimMode: shift ? 'power' : 'extend' });
    const before = snapshotMechanism(mechanism.getState());
    beginGeometry(p(345, shift ? 190 : 200), shift); if (shift) moveGeometry(p(345, 210)); finishGeometry(true);
    assert.deepEqual(world(id), [p(250, 200), p(400, 200)]);
    mechanism.getState().undo(); assert.deepEqual(snapshotMechanism(mechanism.getState()), before);
  }
});
