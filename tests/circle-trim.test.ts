import { test } from 'node:test';
import assert from 'node:assert/strict';
import { circlePoints, ngonPoints, trimOutlineEdges, trimShapeOutline } from '../src/core/shape-geometry';
import { useEditorStore as editor } from '../src/store/editor-store';
import { useMechanismStore as mechanism } from '../src/store/mechanism-store';
import { beginGeometry, moveGeometry, finishGeometry } from '../src/interaction/geometry-tools';
import { importProject, projectText } from '../src/document/project';
import { snapshotMechanism } from '../src/core/compile-mechanism';
import type { MechanismState, Vec2 } from '../src/types';

Object.assign(globalThis, { __APP_VERSION__: 'circle-trim-test' });
const p = (x: number, y: number): Vec2 => ({ x, y });
const circle = circlePoints(p(100, 100), p(140, 100));
const crossing = [p(110, 40), p(110, 160)];

test('circle trim removes the whole circle for one boundary cut or a complete crossing', () => {
  for (const stroke of [crossing, [p(110, 40), p(110, 90)],
    [p(100, 40), p(100, 160)], [p(100, 40), p(100, 60), p(100, 100)]]) {
    for (const order of [stroke, [...stroke].reverse()]) {
      assert.deepEqual(trimShapeOutline(circle, true, order, 'circle'), []);
      assert.deepEqual(trimShapeOutline(circle, true, order), [], 'legacy 48-vertex circle');
    }
  }
});

test('circle trim ignores misses, tangencies, inside-only strokes and boundary-only contact', () => {
  for (const stroke of [[p(150, 40), p(150, 160)], [p(140, 40), p(140, 160)],
    [p(90, 90), p(110, 110)], [p(100, 40), p(100, 60)],
    [p(100, 60), p(100, 100)], [p(100, 40), p(100, 60), p(100, 40)]]) {
    assert.equal(trimShapeOutline(circle, true, stroke, 'circle'), null);
  }
});

test('N-gons, open paths and edited noncircular outlines keep segment trimming', () => {
  const polygon = ngonPoints(p(100, 100), p(140, 100), 48);
  const expected = trimOutlineEdges(polygon, true, crossing);
  assert(expected && expected.length > 0, 'control must retain polygon runs');
  assert.deepEqual(trimShapeOutline(polygon, true, crossing, 'ngon'), expected);
  assert.deepEqual(trimShapeOutline(circle, false, crossing, 'circle'), trimOutlineEdges(circle, false, crossing));
  const edited = circle.map((v, i) => i === 10 ? p(v.x + 10, v.y) : v);
  assert.deepEqual(trimShapeOutline(edited, true, crossing, 'circle'), trimOutlineEdges(edited, true, crossing));
});

test('circle recognition survives reversal, reflection, rotation and small/large coordinates', () => {
  for (const scale of [1e-150, 1, 1e150]) for (const reversed of [false, true]) {
    const transform = (v: Vec2) => p((7 - v.x * Math.cos(.7) - v.y * Math.sin(.7)) * scale,
      (-11 - v.x * Math.sin(.7) + v.y * Math.cos(.7)) * scale);
    const points = (reversed ? [...circle].reverse() : circle).map(transform);
    const before = structuredClone(points);
    assert.deepEqual(trimShapeOutline(points, true, crossing.map(transform)), []);
    assert.deepEqual(points, before);
  }
});

test('circle trim rejects invalid/oversized strokes without deleting anything', () => {
  for (const stroke of [[], [p(100, 100)], [p(NaN, 40), p(110, 160)],
    [p(110, 40), p(Infinity, 160)], Array.from({ length: 4097 }, (_, i) => p(110, i))]) {
    assert.equal(trimShapeOutline(circle, true, stroke, 'circle'), null);
  }
});

function load(legacy = false) {
  const graph: MechanismState = {
    joints: {}, links: {}, bodies: {
      base: { id: 'base', name: 'Base', color: '#ff0000', jointIds: [], useOutlineCOM: false, showLinks: true },
      arm: { id: 'arm', name: 'Arm', color: '#00ff00', jointIds: [], useOutlineCOM: false, showLinks: true },
      other: { id: 'other', name: 'Other', color: '#0000ff', jointIds: [], useOutlineCOM: false, showLinks: true },
    }, baseBodyId: 'base', outlines: {
      target: { id: 'target', bodyId: 'arm', name: 'Circle', visible: true, points: structuredClone(circle), ...(legacy ? {} : { primitive: 'circle' as const }) },
      unselected: { id: 'unselected', bodyId: 'arm', name: 'Unselected', visible: true, points: structuredClone(circle), primitive: 'circle' },
      hidden: { id: 'hidden', bodyId: 'arm', name: 'Hidden', visible: false, points: structuredClone(circle), primitive: 'circle' },
      inactive: { id: 'inactive', bodyId: 'other', name: 'Inactive', visible: true, points: structuredClone(circle), primitive: 'circle' },
    }, images: {}, sliders: {}, colliders: {}, tracers: {},
  };
  mechanism.getState().loadState(graph);
  editor.getState().setMode('create');
  editor.setState({ activeBodyIds: new Set(['arm']), selectedIds: new Set(['target']), trimScope: 'selected',
    gridEnabled: false, lockOutlines: true, frozenOutlineWorldPoints: new Map([['target', structuredClone(circle)]]) });
  editor.getState().setCreateTool('trim');
}

for (const legacy of [false, true]) test('circle trim is atomic, scoped and undoable after save/reopen; legacy=' + legacy, () => {
  load(legacy);
  assert(importProject(projectText()).ok);
  editor.setState({ activeBodyIds: new Set(['arm']), selectedIds: new Set(['target']), trimScope: 'selected',
    frozenOutlineWorldPoints: new Map([['target', structuredClone(circle)]]) });
  editor.getState().setCreateTool('trim');
  const before = snapshotMechanism(mechanism.getState()), past = mechanism.getState().past.length;
  beginGeometry(crossing[0], false); moveGeometry(crossing[1]); finishGeometry(false);
  assert.deepEqual(snapshotMechanism(mechanism.getState()), before);
  assert.equal(mechanism.getState().past.length, past);
  beginGeometry(crossing[0], false); moveGeometry(crossing[1]); finishGeometry(true);
  assert.equal(mechanism.getState().outlines.target, undefined);
  assert.equal(editor.getState().frozenOutlineWorldPoints.has('target'), false);
  assert.equal(editor.getState().selectedIds.has('target'), false);
  for (const id of ['unselected', 'hidden', 'inactive']) assert.deepEqual(mechanism.getState().outlines[id], before.outlines[id]);
  assert.equal(mechanism.getState().past.length, past + 1);
  const saved = projectText();
  mechanism.getState().undo(); assert.deepEqual(snapshotMechanism(mechanism.getState()), before);
  mechanism.getState().redo(); assert.equal(mechanism.getState().outlines.target, undefined);
  assert(importProject(saved).ok); assert.equal(mechanism.getState().outlines.target, undefined);
});

test('active-body circle trim removes only visible circles in active bodies, in one undo step', () => {
  load(); editor.setState({ trimScope: 'active', selectedIds: new Set() });
  const before = snapshotMechanism(mechanism.getState()), past = mechanism.getState().past.length;
  beginGeometry(crossing[0], false); moveGeometry(crossing[1]); finishGeometry(true);
  assert.deepEqual(Object.keys(mechanism.getState().outlines).sort(), ['hidden', 'inactive']);
  assert.equal(mechanism.getState().past.length, past + 1);
  mechanism.getState().undo(); assert.deepEqual(snapshotMechanism(mechanism.getState()), before);
});

test('drawing identity is added without a second undo action and survives native document encoding', () => {
  load(); editor.getState().setCreateTool('circle');
  const past = mechanism.getState().past.length;
  beginGeometry(p(300, 300), false); moveGeometry(p(340, 300)); finishGeometry(true);
  const id = [...editor.getState().selectedIds][0];
  assert.equal(mechanism.getState().outlines[id].primitive, 'circle');
  assert.equal(mechanism.getState().past.length, past + 1);
  assert(importProject(projectText()).ok);
  assert.equal(mechanism.getState().outlines[id].primitive, 'circle');
});

test('a drawn 48-sided N-gon retains segment trimming after document round-trip', () => {
  load(); editor.setState({ ngonSides: 48 }); editor.getState().setCreateTool('ngon');
  beginGeometry(p(300, 300), false); moveGeometry(p(340, 300)); finishGeometry(true);
  const id = [...editor.getState().selectedIds][0];
  assert.equal(mechanism.getState().outlines[id].primitive, 'ngon');
  assert(importProject(projectText()).ok);
  editor.setState({ selectedIds: new Set([id]), trimScope: 'selected' });
  editor.getState().setCreateTool('trim');
  const before = snapshotMechanism(mechanism.getState());
  beginGeometry(p(310, 240), false); moveGeometry(p(310, 360)); finishGeometry(true);
  assert(mechanism.getState().outlines[id], 'N-gon must not disappear as a whole circle');
  assert.equal(mechanism.getState().outlines[id].closed, false);
  assert(mechanism.getState().outlines[id].points.length < 48);
  mechanism.getState().undo(); assert.deepEqual(snapshotMechanism(mechanism.getState()), before);
});
