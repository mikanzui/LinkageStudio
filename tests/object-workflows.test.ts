import test from 'node:test';
import assert from 'node:assert/strict';
import type { Joint, MechanismState } from '../src/types';
import { useMechanismStore as store } from '../src/store/mechanism-store';
import { useEditorStore as editor } from '../src/store/editor-store';
import { useSimulationStore as simulation, resetRuntimeForDocument } from '../src/store/simulation-store';
import { importProject, projectText } from '../src/document/project';
import { snapshotMechanism } from '../src/core/compile-mechanism';
import { computeBodyTransform, localToWorld } from '../src/core/body-transform';
import { remapSensorLinks } from '../src/core/sensor-links';
import { mirrorGeometry } from '../src/core/mirror-geometry';
import { selectInRegion } from '../src/interaction/selection-marquee';
import { fitMechanism } from '../src/renderer/viewport';
import { appendBounded, TRACE_POINT_LIMIT, SENSOR_SAMPLE_LIMIT } from '../src/core/time-series';
import { switchMode } from '../src/utils/mode-switch';
import { deleteSelectedEntities } from '../src/utils/delete-selection';
import { numberDraft } from '../src/utils/number-draft';

Object.assign(globalThis, { __APP_VERSION__: 'rebuild-g7-test' });
const joint = (id: string, x: number, y: number): Joint => ({ id, position: { x, y }, type: 'revolute', connectedLinkIds: [] });
function graph(): MechanismState {
  return { joints: { a: joint('a', 10, 20), b: joint('b', 110, 20), c: joint('c', 210, 120) },
    links: { custom: { id: 'custom', jointIds: ['b', 'a'], restLength: 100, mass: 1 } },
    bodies: { base: { id: 'base', name: 'Base', jointIds: ['a'], color: '#f00', showLinks: true, useOutlineCOM: false },
      rod: { id: 'rod', name: 'Rod', jointIds: ['a', 'b'], color: '#0a0', showLinks: true, useOutlineCOM: false },
      other: { id: 'other', name: 'Other', jointIds: ['b', 'c'], color: '#00a', showLinks: true, useOutlineCOM: false } },
    baseBodyId: 'base', outlines: {}, images: {}, sliders: {}, colliders: {}, springs: {},
    tracers: { trace: { id: 'trace', bodyId: 'rod', localPosition: { x: 35, y: 15 }, enabled: true, name: 'Pen' } },
    forceSensors: { sensor: { id: 'sensor', linkId: 'custom', enabled: true, name: 'Load' } } };
}
function load(scene = graph()) {
  assert(importProject(JSON.stringify({ ...scene, version: '0.15.5' })).ok);
  return snapshotMechanism(store.getState());
}

test('cleared legacy node label stays cleared after save/reopen, with exact undo and metadata', () => {
  const scene = graph(); scene.joints.b.label = 'Old handle'; scene.joints.b.mirrored = true;
  const before = load(scene); store.getState().editJointProperties('b', { label: undefined });
  assert.equal(JSON.parse(projectText()).joints.b.label, '');
  store.getState().undo(); assert.deepEqual(snapshotMechanism(store.getState()), before);
  store.getState().redo(); const saved = projectText(); assert(importProject(saved).ok);
  assert.equal(store.getState().joints.b.label, ''); assert.equal(store.getState().joints.b.mirrored, true);
  assert.equal(projectText(), saved);
});

test('sensor regeneration follows endpoint identity and deletion/undo restores definition', () => {
  const before = load(); store.getState().pushHistory(); store.getState().regenerateLinks();
  assert.equal(store.getState().forceSensors.sensor.linkId, 'link_a_b');
  store.getState().undo(); assert.deepEqual(snapshotMechanism(store.getState()), before);
  store.getState().removeJoint('b'); assert.deepEqual(store.getState().forceSensors, {});
  store.getState().undo(); assert.deepEqual(snapshotMechanism(store.getState()), before);
  store.getState().removeBody('rod'); assert.deepEqual(store.getState().forceSensors, {});
  store.getState().undo(); assert.deepEqual(snapshotMechanism(store.getState()), before);
});

test('same sensor source ID with changed endpoints cannot hijack endpoint remapping', () => {
  const g = graph(), old = g.links.custom;
  const result = remapSensorLinks(g.forceSensors!, g.links, {
    custom: { ...old, jointIds: ['a', 'c'] }, replacement: { ...old, id: 'replacement', jointIds: ['a', 'b'] },
  });
  assert.equal(result.sensor.linkId, 'replacement'); assert.equal(g.forceSensors!.sensor.linkId, 'custom');
});

test('sensor commands are single transactions and invalid/no-op operations preserve history', () => {
  load(); const before = snapshotMechanism(store.getState()), history = store.getState().past;
  assert.equal(store.getState().addForceSensor('custom'), 'sensor'); assert.equal(store.getState().past, history);
  assert.throws(() => store.getState().editForceSensor('sensor', { linkId: 'missing' }));
  assert.equal(store.getState().past, history); assert.deepEqual(snapshotMechanism(store.getState()), before);
  store.getState().editForceSensor('sensor', { name: '', enabled: false });
  assert.equal(store.getState().past.length, history.length + 1);
  const saved = projectText(); assert(importProject(saved).ok); assert.equal(projectText(), saved);
  editor.setState({ selectedIds: new Set(['sensor']), mode: 'create' }); deleteSelectedEntities();
  assert.deepEqual(store.getState().forceSensors, {}); store.getState().undo(); assert(store.getState().forceSensors.sensor);
});

test('zero-rest sensor definition remains intact and optional extension metadata survives', () => {
  const g = graph(); g.joints.b.position = { ...g.joints.a.position }; g.links.custom.restLength = 0;
  Object.assign(g.forceSensors!.sensor, { vendor: { annotation: 'keep' } }); load(g);
  const text = projectText(); assert(importProject(text).ok);
  assert.equal(JSON.parse(text).forceModel, 'unit-particle-v1');
  assert.equal(JSON.parse(projectText()).forceSensors.sensor.vendor.annotation, 'keep');
  assert.equal(store.getState().links.custom.restLength, 0);
});

test('unsupported force model refuses complete import without changing the current project', () => {
  load(); const before = projectText(), bad = JSON.parse(before); bad.forceModel = 'unknown-model';
  assert(!importProject(JSON.stringify(bad)).ok); assert.equal(projectText(), before);
});

for (const updates of [{ linkId: 'missing' }, { name: {} }, { enabled: 'yes' }]) {
  test(`malformed sensor import is atomic: ${JSON.stringify(updates)}`, () => {
    load(); const text = projectText(), before = store.getState(), runtime = simulation.getState();
    const bad = JSON.parse(text); Object.assign(bad.forceSensors.sensor, updates);
    assert(!importProject(JSON.stringify(bad)).ok); assert.equal(store.getState(), before);
    assert.equal(simulation.getState(), runtime); assert.equal(projectText(), text);
  });
}

for (const scope of ['selection', 'all'] as const) test(`mirror ${scope} clones sensor dependency and marks new nodes`, () => {
  const source = graph(), frozen = structuredClone(source); let serial = 0;
  const result = mirrorGeometry(source, 'vertical', 0, scope, new Set(['sensor']), () => `new${++serial}`);
  assert.deepEqual(source, frozen);
  const sensors = Object.values(result.graph.forceSensors!); assert.equal(sensors.length, 2);
  const clone = sensors.find(s => s.id !== 'sensor')!; assert.notEqual(clone.linkId, 'custom');
  for (const id of result.graph.links[clone.linkId].jointIds) assert.equal(result.graph.joints[id].mirrored, true);
});

test('disabled sensors are not mirrored by all, but explicit selection retains disabled state', () => {
  const g = graph(); g.forceSensors!.sensor.enabled = false;
  for (const scope of ['all', 'selection'] as const) {
    let serial = 0; const result = mirrorGeometry(g, 'vertical', 0, scope, new Set(['sensor']), () => `copy${++serial}`);
    assert.equal(Object.keys(result.graph.forceSensors!).length, scope === 'all' ? 1 : 2);
    assert(Object.values(result.graph.forceSensors!).every(s => !s.enabled));
  }
});

test('tracer reassignment preserves world point; enable/name/position changes undo once', () => {
  const before = load(), m = store.getState();
  const point = () => { const s = store.getState(), t = s.tracers.trace; return localToWorld(t.localPosition, computeBodyTransform(s.bodies[t.bodyId], s.joints)); };
  const original = point(); m.editTracer('trace', { bodyId: 'other' });
  assert(Math.hypot(point().x - original.x, point().y - original.y) < 1e-10);
  store.getState().undo(); assert.deepEqual(snapshotMechanism(store.getState()), before);
  store.getState().toggleTracerEnabled('trace'); assert(!store.getState().tracers.trace.enabled);
  store.getState().undo(); assert.deepEqual(snapshotMechanism(store.getState()), before);
  const past = store.getState().past; assert.throws(() => store.getState().editTracer('trace', { localPosition: { x: NaN, y: 0 } }));
  assert.equal(store.getState().past, past); assert.deepEqual(snapshotMechanism(store.getState()), before);
});

test('all tracer command entry points validate before history and clone coordinate inputs', () => {
  load(); const before = store.getState().past;
  assert.throws(() => store.getState().addTracer('missing', { x: 0, y: 0 }));
  assert.throws(() => store.getState().addTracer('rod', { x: Infinity, y: 0 }));
  assert.throws(() => store.getState().updateTracerBody('trace', 'missing'));
  assert.equal(store.getState().past, before);
  store.getState().removeTracer('missing'); store.getState().updateTracerBody('missing', 'rod');
  assert.equal(store.getState().past, before);
  const point = { x: 12, y: 23 }, id = store.getState().addTracer('rod', point); point.x = 400;
  assert.equal(store.getState().tracers[id].localPosition.x, 12);
  const moved = { x: 24, y: 28 }; store.getState().moveTracer(id, moved); moved.y = 900;
  assert.equal(store.getState().tracers[id].localPosition.y, 28);
  store.getState().moveTracer(id, { x: NaN, y: 2 }); assert.equal(store.getState().tracers[id].localPosition.x, 24);
});

test('sensor box/lasso inclusion follows midpoint, enabled state and owner exclusion', () => {
  const g = graph(), center = { x: 60, y: 20 };
  for (const region of [{ kind: 'box' as const, start: { x: 59, y: 19 }, end: { x: 61, y: 21 } },
    { kind: 'lasso' as const, points: [{ x: 59, y: 19 }, { x: 61, y: 19 }, { x: 61, y: 21 }, { x: 59, y: 21 }] }]) {
    assert(selectInRegion(g, region, new Set()).has('sensor'));
    assert(!selectInRegion(g, region, new Set(['rod'])).has('sensor'));
    g.forceSensors!.sensor.enabled = false; assert(!selectInRegion(g, region, new Set()).has('sensor')); g.forceSensors!.sensor.enabled = true;
  }
  assert.equal(center.x, (g.joints.a.position.x + g.joints.b.position.x) / 2);
});

test('Fit includes enabled distant tracer but not disabled tracer', () => {
  const g = graph(); g.tracers.trace.localPosition = { x: 2000, y: 700 };
  const point = localToWorld(g.tracers.trace.localPosition, computeBodyTransform(g.bodies.rod, g.joints));
  const fit = fitMechanism(g, 1000, 800), screen = { x: point.x * fit.zoom + fit.pan.x, y: point.y * fit.zoom + fit.pan.y };
  assert(screen.x >= 72 - 1e-9 && screen.x <= 928 + 1e-9); assert(screen.y >= 72 - 1e-9 && screen.y <= 728 + 1e-9);
  g.tracers.trace.enabled = false; assert(fitMechanism(g, 1000, 800).zoom > fit.zoom);
});

test('series limits include one, preserve caller arrays and reject invalid limits', () => {
  const a = [1, 2]; assert.deepEqual(appendBounded(a, 3, 1), [3]); assert.deepEqual(a, [1, 2]);
  assert.deepEqual(appendBounded(a, 3, 2), [2, 3]);
  for (const limit of [0, -1, .5, NaN, Infinity]) assert.throws(() => appendBounded(a, 3, limit));
});

test('runtime series are finite, bounded, cloned and monotonically sampled', () => {
  resetRuntimeForDocument(); const s = simulation.getState(), point = { x: 2, y: 3 };
  s.recordTrace('a', point); s.recordTracerTrace('trace', point); point.x = 100;
  assert.equal(simulation.getState().pathTraces.get('a')![0].x, 2);
  assert.equal(simulation.getState().tracerPaths.get('trace')![0].x, 2);
  for (let i = 0; i <= TRACE_POINT_LIMIT; i++) { s.recordTrace('a', { x: i, y: 0 }); s.recordTracerTrace('trace', { x: i, y: 0 }); }
  for (let i = 0; i <= SENSOR_SAMPLE_LIMIT; i++) s.recordForceSensorData('sensor', i, i + 1);
  assert.equal(simulation.getState().pathTraces.get('a')!.length, TRACE_POINT_LIMIT);
  assert.equal(simulation.getState().tracerPaths.get('trace')!.length, TRACE_POINT_LIMIT);
  const samples = simulation.getState().forceSensorData.get('sensor')!; assert.equal(samples.length, SENSOR_SAMPLE_LIMIT); assert.equal(samples[0].time, 1);
  s.recordForceSensorData('sensor', 0, 1); s.recordForceSensorData('sensor', SENSOR_SAMPLE_LIMIT, 20); s.recordForceSensorData('sensor', Infinity, 0);
  s.recordTrace('a', { x: NaN, y: 0 }); assert.equal(simulation.getState().forceSensorData.get('sensor'), samples);
});

test('document reset and A/B/A clear all sample/driver ownership without altering physics', () => {
  load(); const s = simulation.getState(); s.setGravityStrength(123); s.toggleTracing('a'); s.setDriver('a', 'custom', 'motor');
  s.recordTrace('a', { x: 1, y: 2 }); s.recordTracerTrace('trace', { x: 1, y: 2 }); s.recordForceSensorData('sensor', 0, 1);
  resetRuntimeForDocument(); const clean = simulation.getState();
  assert.equal(clean.gravityStrength, 123); assert.equal(clean.trackedJointIds.size, 0); assert.equal(clean.driverJointId, null);
  for (const key of ['pathTraces', 'tracerPaths', 'forceSensorData'] as const) assert.equal(clean[key].size, 0);
  const text = projectText(); for (const value of [text, JSON.stringify(graph()), text]) {
    simulation.getState().toggleTracing('old'); simulation.getState().recordForceSensorData('old', 1, 12);
    assert(importProject(value).ok); assert.equal(simulation.getState().forceSensorData.size, 0); assert.equal(simulation.getState().trackedJointIds.size, 0);
  }
});

test('locked-outline mode cycles restore design without adding authored history', () => {
  const g = graph(); g.outlines.shape = { id: 'shape', bodyId: 'rod', name: 'Shape', visible: true, points: [{ x: 0, y: 0 }, { x: 80, y: 0 }, { x: 10, y: 20 }] };
  const before = load(g), past = store.getState().past;
  for (let i = 0; i < 10; i++) { switchMode('simulate'); switchMode('create'); }
  assert.deepEqual(snapshotMechanism(store.getState()), before); assert.equal(store.getState().past, past);
  assert.equal(simulation.getState().solverResult, null);
});

test('numeric presentation removes float artefacts; finite settings reject invalid ranges', () => {
  assert.equal(numberDraft(75.00000000000001), '75'); assert.equal(numberDraft(Infinity), '');
  for (const [setter, key, good, invalid] of [
    ['setSpeed', 'speed', 1, [0, 6, NaN]], ['setDamping', 'damping', .5, [-1, 1.01, Infinity]],
    ['setDragDamping', 'dragDamping', .25, [-1, 2, NaN]], ['setGravityStrength', 'gravityStrength', 250, [-1, Infinity]],
    ['setDragMultiplier', 'dragMultiplier', 25, [-1, NaN]],
  ] as const) {
    simulation.getState()[setter](good); for (const value of invalid) simulation.getState()[setter](value);
    assert.equal(simulation.getState()[key], good);
  }
});
