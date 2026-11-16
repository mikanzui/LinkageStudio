import test from 'node:test';
import assert from 'node:assert/strict';
import type { Joint, MechanismState, MechanismSpring } from '../src/types';
import { SimulationSession } from '../src/core/simulation-session';
import { snapshotMechanism, compileMechanism } from '../src/core/compile-mechanism';
import { resolveSpringAnchor } from '../src/core/springs/spring-model';
import { remapSpringAnchors } from '../src/core/spring-anchors';
import { useMechanismStore as store } from '../src/store/mechanism-store';
import { useEditorStore as editor } from '../src/store/editor-store';
import { decodeDocument } from '../src/document/codec';
import { importProject, projectText } from '../src/document/project';
import { switchMode } from '../src/utils/mode-switch';
import { deleteSelectedEntities } from '../src/utils/delete-selection';
import { mirrorGeometry } from '../src/core/mirror-geometry';
import { solveWithForce } from '../src/core/solver/newton-raphson';
import { selectInRegion } from '../src/interaction/selection-marquee';
import { fitMechanism } from '../src/renderer/viewport';

Object.assign(globalThis, { __APP_VERSION__: 'rebuild-g6-test' });
const joint = (id: string, x: number, y: number): Joint => ({ id, position: { x, y }, type: 'revolute', connectedLinkIds: [] });
const spring = (changes: Partial<MechanismSpring> = {}): MechanismSpring => ({ id: 's', name: 'Test Spring', kind: 'linear',
  anchorA: { type: 'world', position: { x: 0, y: 0 } }, anchorB: { type: 'joint', jointId: 'b' },
  stiffness: 4000, damping: 0, restLength: 0, prestressDelta: 0, ...changes });
function graph(): MechanismState {
  return { joints: { a: joint('a', 0, 0), b: joint('b', 100, 0) }, links: {}, bodies: {
    base: { id: 'base', name: 'Base', color: '#f00', jointIds: [], useOutlineCOM: false, showLinks: true },
    rod: { id: 'rod', name: 'Rod', color: '#0a0', jointIds: [], useOutlineCOM: false, showLinks: true },
  }, baseBodyId: 'base', outlines: {}, images: {}, sliders: {}, colliders: {}, tracers: {}, springs: { s: spring() } };
}
const options = { dt: 1 / 60, gravityEnabled: false, gravityStrength: 0, damping: 1, dragMultiplier: 25, dragDamping: .25, pull: null };
const close = (a: number, b: number, tolerance = 1e-6) => assert(Math.abs(a - b) < tolerance, `${a} versus ${b}`);
function stepFor(scene: MechanismState, seconds: number, hz: number) {
  let live = structuredClone(scene); const session = new SimulationSession(live);
  for (let i = 0; i < seconds * hz; i++) {
    const frame = session.step(live, { ...options, dt: 1 / hz });
    assert(frame.ok, frame.ok ? '' : frame.error); live = { ...live, joints: frame.joints };
  }
  return live;
}

for (const hz of [30, 60, 120]) test(`world-anchored oscillator follows independent analytic motion at ${hz}Hz`, () => {
  const scene = graph(), original = structuredClone(scene), live = stepFor(scene, .2, hz);
  close(live.joints.b.position.x, 100 * Math.cos(Math.sqrt(24) * .2), .16);
  close(live.joints.b.position.y, 0); assert.deepEqual(scene, original);
});

function torsionScene() {
  const scene = graph();
  scene.joints = { p: joint('p', 200, 200), a: joint('a', 300, 200), b: joint('b', 200, 350) };
  scene.bodies.base.jointIds = ['p', 'a']; scene.bodies.rod.jointIds = ['p', 'b'];
  scene.links = { pa: { id: 'pa', jointIds: ['p', 'a'], restLength: 100, mass: 1 }, pb: { id: 'pb', jointIds: ['p', 'b'], restLength: 150, mass: 1 } };
  scene.springs = { s: spring({ kind: 'torsional', anchorA: { type: 'link', linkId: 'pa', t: 0 }, anchorB: { type: 'link', linkId: 'pb', t: 0 },
    stiffness: 50000, damping: 40000, restLength: .6 }) };
  return scene;
}
for (const hz of [30, 60, 120]) test(`torsion restores signed angle with unequal legs at ${hz}Hz`, () => {
  const scene = compileMechanism(torsionScene()), live = stepFor(scene, 2, hz);
  const p = live.joints.p.position, b = live.joints.b.position;
  const angle = Math.atan2(b.y - p.y, b.x - p.x);
  assert(Math.abs(angle - .6) < .025, `Restoring error ${angle - .6}`);
  close(Math.hypot(b.x - p.x, b.y - p.y), 150);
  assert.deepEqual(live.joints.p.position, scene.joints.p.position); assert.deepEqual(live.joints.a.position, scene.joints.a.position);
});

test('excessive spring step budget rejects atomically and preserves subsequent velocity state', () => {
  const scene = graph(), live = new SimulationSession(scene), fresh = new SimulationSession(scene);
  const bad = structuredClone(scene); bad.springs!.s.damping = 1e15;
  const before = structuredClone(bad); const rejected = live.step(bad, options);
  assert(!rejected.ok); assert.match(rejected.error, /stability budget/); assert.deepEqual(bad, before);
  assert.deepEqual(live.step(scene, options), fresh.step(scene, options));
});

test('regeneration preserves reversed custom link fraction, rest and offset with one undo', () => {
  const scene = graph(); scene.bodies.rod.jointIds = ['a', 'b'];
  scene.links = { custom: { id: 'custom', jointIds: ['b', 'a'], restLength: 100, mass: 1 } };
  scene.springs!.s = spring({ anchorA: { type: 'link', linkId: 'custom', t: .25 }, anchorB: { type: 'world', position: { x: 40, y: 20 } }, restLength: 20, prestressDelta: 7 });
  store.getState().loadState(scene);
  const before = snapshotMechanism(store.getState()); store.getState().pushHistory(); store.getState().regenerateLinks();
  const live = store.getState(), anchor = live.springs.s.anchorA;
  assert.equal(anchor.type, 'link'); if (anchor.type === 'link') { assert.equal(anchor.linkId, 'link_a_b'); close(anchor.t, .75); }
  assert.deepEqual(resolveSpringAnchor(anchor, live.joints, live.links), { x: 75, y: 0 });
  assert.equal(live.springs.s.restLength, 20); assert.equal(live.springs.s.prestressDelta, 7);
  store.getState().undo(); assert.deepEqual(snapshotMechanism(store.getState()), before);
});

test('same link ID with a different endpoint pair cannot hijack an anchor', () => {
  const scene = graph(), old = { x: { id: 'x', jointIds: ['a', 'b'] as [string, string], restLength: 100, mass: 1 } };
  const next = { x: { ...old.x, jointIds: ['a', 'c'] as [string, string] }, replacement: { ...old.x, id: 'replacement', jointIds: ['b', 'a'] as [string, string] } };
  const springs = { s: spring({ anchorA: { type: 'link', linkId: 'x', t: .2 } }) };
  const remapped = remapSpringAnchors(springs, old, next, scene.joints);
  assert.deepEqual(remapped.s.anchorA, { type: 'link', linkId: 'replacement', t: .8 });
});

test('joint/body deletion removes dependent springs and undo restores exact attachments', () => {
  store.getState().loadState(torsionScene()); const before = snapshotMechanism(store.getState());
  store.getState().removeJoint('b'); assert.equal(Object.keys(store.getState().springs).length, 0);
  store.getState().undo(); assert.deepEqual(snapshotMechanism(store.getState()), before);
  store.getState().removeBody('rod'); assert.equal(Object.keys(store.getState().springs).length, 0);
  store.getState().undo(); assert.deepEqual(snapshotMechanism(store.getState()), before);
});

test('spring delete and parameter edits are single history operations; invalid edits preserve history', () => {
  store.getState().loadState(graph()); const m = store.getState(), before = snapshotMechanism(m);
  m.editSpring('s', { stiffness: 5000 }); assert.equal(store.getState().springs.s.stiffness, 5000);
  store.getState().undo(); assert.deepEqual(snapshotMechanism(store.getState()), before);
  const history = store.getState().past;
  assert.throws(() => store.getState().editSpring('s', { damping: -1 })); assert.equal(store.getState().past, history);
  editor.setState({ mode: 'create', selectedIds: new Set(['s']) }); deleteSelectedEntities();
  assert.equal(Object.keys(store.getState().springs).length, 0); store.getState().undo(); assert.deepEqual(snapshotMechanism(store.getState()), before);
});

test('reattachment resets natural rest, preserves offset and undoes atomically', () => {
  store.getState().loadState(graph()); const before = snapshotMechanism(store.getState());
  store.getState().editSpring('s', { anchorA: { type: 'world', position: { x: 40, y: 0 } }, prestressDelta: 8 });
  close(store.getState().springs.s.restLength, 60); close(store.getState().springs.s.prestressDelta, 8);
  store.getState().undo(); assert.deepEqual(snapshotMechanism(store.getState()), before);
});

test('legacy world/link spring metadata survives save, reopen, undo and mode restore', () => {
  const scene = torsionScene();
  scene.springs!.world = spring({ id: 'world', name: 'World spring', restLength: 100, anchorB: { type: 'link', linkId: 'pb', t: .25 } });
  const file = { ...scene, version: '0.14.0', futureMetadata: { untouched: 4 } };
  Object.assign(file.springs!.world, { vendor: { label: 'preserve' } });
  assert(importProject(JSON.stringify(file)).ok);
  const saved = projectText(), parsed = JSON.parse(saved);
  assert.equal(parsed.springModel, 'legacy-motion-v1'); assert.deepEqual(parsed.springs, file.springs);
  assert(importProject(saved).ok); assert.equal(projectText(), saved);
  const before = snapshotMechanism(store.getState());
  switchMode('simulate'); switchMode('create'); assert.deepEqual(snapshotMechanism(store.getState()), before);
  store.getState().removeSpring('world'); assert(!JSON.parse(projectText()).springs.world);
  store.getState().undo(); assert.deepEqual(snapshotMechanism(store.getState()), before);
});

for (const change of [{ kind: 'unknown' }, { anchorA: { type: 'world', position: { x: null, y: 0 } } }, { damping: -1 }, { name: {} }]) {
  test(`malformed spring rejects complete import ${JSON.stringify(change)}`, () => {
    const before = projectText(), file = graph(); Object.assign(file.springs!.s, change);
    assert.equal(decodeDocument(JSON.stringify(file)).ok, false); assert.equal(importProject(JSON.stringify(file)).ok, false); assert.equal(projectText(), before);
  });
}

test('undamped spring energy stays within 2% over thirty analytic periods', () => {
  const scene = graph(), velocities = new Map<string, { x: number; y: number }>();
  let joints = structuredClone(scene.joints), maximum = 0;
  const energy = .5 * 24 * 100 ** 2, duration = 30 * 2 * Math.PI / Math.sqrt(24);
  for (let i = 0; i < duration * 60; i++) {
    const result = solveWithForce(joints, scene.links, { enabled: false, strength: 0 }, null, 1, 25, .25, 1 / 60,
      new Set(), undefined, {}, [], {}, new Map(), scene.bodies, undefined, velocities, scene.springs);
    joints = Object.fromEntries(Object.entries(joints).map(([id, j]) => [id, { ...j, position: result.positions.get(id) ?? j.position }]));
    const v = velocities.get('b')!, p = joints.b.position;
    maximum = Math.max(maximum, Math.abs((.5 * (v.x ** 2 + v.y ** 2) + .5 * 24 * (p.x ** 2 + p.y ** 2)) / energy - 1));
  }
  assert(maximum < .02, `Energy error ${maximum}`);
});

for (const stiffness of [100, 10000, 1000000]) for (const dt of [1 / 120, 1 / 30, .1]) {
  test(`spring stiffness ${stiffness} at supported dt ${dt} remains bounded`, () => {
    let scene = graph(); scene.springs!.s.stiffness = stiffness; scene.springs!.s.restLength = 50;
    scene.springs!.s.damping = 2 * Math.sqrt(stiffness * .006) / .006;
    const session = new SimulationSession(scene);
    for (let i = 0; i < Math.ceil(1 / dt); i++) {
      const result = session.step(scene, { ...options, dt }); assert(result.ok, result.ok ? '' : result.error);
      scene = { ...scene, joints: result.joints };
      assert(scene.joints.b.position.x >= 49.9 && scene.joints.b.position.x <= 100);
      close(scene.joints.b.position.y, 0);
    }
  });
}

for (const axis of ['horizontal', 'vertical'] as const) test(`mirror ${axis} preserves original springs and reflects torsion rest/offset`, () => {
  const scene = torsionScene(); scene.springs!.s.prestressDelta = .1;
  scene.springs!.world = spring({ id: 'world', anchorB: { type: 'link', linkId: 'pb', t: .25 } });
  const original = structuredClone(scene); let id = 0;
  const mirrored = mirrorGeometry(scene, axis, 500, 'all', new Set(), () => `copy${id++}`).graph;
  assert.deepEqual(scene, original); assert.deepEqual(mirrored.springs!.s, scene.springs!.s);
  const copy = Object.values(mirrored.springs!).find(s => s.id !== 's' && s.kind === 'torsional')!;
  assert(copy); close(copy.restLength, -.6); close(copy.prestressDelta, -.1);
  const world = Object.values(mirrored.springs!).find(s => s.id !== 'world' && s.kind === 'linear')!;
  const a = resolveSpringAnchor(world.anchorA, mirrored.joints, mirrored.links)!;
  assert.deepEqual(a, axis === 'vertical' ? { x: 1000, y: 0 } : { x: 0, y: 1000 });
  const b = resolveSpringAnchor(world.anchorB, mirrored.joints, mirrored.links)!;
  assert.deepEqual(b, axis === 'vertical' ? { x: 800, y: 237.5 } : { x: 200, y: 762.5 });
});

test('spring marquee selection honors body exclusion; world anchors participate in fit', () => {
  const scene = graph(); scene.bodies.rod.jointIds = ['b'];
  const region = { kind: 'box' as const, start: { x: 20, y: -10 }, end: { x: 80, y: 10 } };
  assert(selectInRegion(scene, region, new Set()).has('s'));
  assert(!selectInRegion(scene, region, new Set(['rod'])).has('s'));
  scene.springs!.s.anchorA = { type: 'world', position: { x: -500, y: 0 } };
  const camera = fitMechanism(scene, 1000, 800);
  for (const x of [-500, 100]) assert(x * camera.zoom + camera.pan.x > 0 && x * camera.zoom + camera.pan.x < 1000);
});
