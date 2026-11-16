import test from 'node:test';
import assert from 'node:assert/strict';
import type { MechanismState, Joint, Vec2 } from '../src/types';
import { SimulationSession } from '../src/core/simulation-session';
import { compileMechanism } from '../src/core/compile-mechanism';
import { solveWithForce } from '../src/core/solver/newton-raphson';

const joint = (id: string, x: number, y: number): Joint => ({ id, type: 'revolute', position: { x, y }, connectedLinkIds: [] });
function rod(): MechanismState {
  return { joints: { a: joint('a', 0, 0), b: joint('b', 0, 100) }, links: { ab: { id: 'ab', jointIds: ['a', 'b'], restLength: 100, mass: 1 } },
    bodies: { base: { id: 'base', name: 'Base', color: '#f00', jointIds: ['a'], useOutlineCOM: false, showLinks: true },
      rod: { id: 'rod', name: 'Rod', color: '#0a0', jointIds: ['a', 'b'], useOutlineCOM: false, showLinks: true } },
    baseBodyId: 'base', outlines: {}, images: {}, sliders: {}, colliders: {}, tracers: {}, springs: {}, forceSensors: {} };
}
const options = { dt: 1 / 60, gravityEnabled: true, gravityStrength: 250, damping: 1, dragMultiplier: 25, dragDamping: .25, pull: null, analysis: true };
const near = (a: number, b: number, tolerance = 1e-6) => assert(Math.abs(a - b) <= tolerance, `${a} versus ${b}`);

for (const passes of [1, 3, 6, 12]) for (const substeps of [1, 10, 24]) test(`static support balances gravity independent of ${passes} passes / ${substeps} substeps`, () => {
  const graph = compileMechanism(rod()), session = new SimulationSession(graph);
  const frame = session.step(graph, { ...options, constraintPasses: passes, substeps });
  assert(frame.ok, frame.ok ? '' : frame.error);
  const analysis = frame.result.forceAnalysis!;
  assert.equal(analysis.units, 'model'); assert.equal(analysis.complete, true);
  near(analysis.linkForces.get('ab')!.axialForce!, 250, 2.5);
  near(analysis.jointReactions.get('a')!.reactionForce.y, -250, 2.5);
  near(analysis.jointReactions.get('b')!.reactionForce.y, -250, 2.5);
  near(analysis.jointReactions.get('b')!.appliedForce.y, 250);
  assert.deepEqual(frame.joints.a.position, graph.joints.a.position);
  near(frame.joints.b.position.y, 100);
});

test('recording force analysis leaves every motion/velocity result bit-identical', () => {
  const source = compileMechanism(rod()); source.joints.b.position = { x: 60, y: 80 };
  let a = structuredClone(source), b = structuredClone(source);
  const left = new SimulationSession(a), right = new SimulationSession(b);
  for (let i = 0; i < 120; i++) {
    const f = left.step(a, { ...options, analysis: false }), g = right.step(b, options);
    assert(f.ok && g.ok); assert.deepEqual(f.joints, g.joints);
    assert.deepEqual(f.result.positions, g.result.positions); assert.deepEqual(f.result.forceVectors, g.result.forceVectors);
    a = { ...a, joints: f.joints }; b = { ...b, joints: g.joints };
  }
});

test('all-fixed spring still reports equal/opposite support loads with no free particles', () => {
  const graph = rod(); graph.joints.b.position = { x: 10, y: 0 }; graph.links = {}; graph.bodies.base.jointIds = ['a', 'b'];
  graph.springs = { s: { id: 's', kind: 'linear', anchorA: { type: 'joint', jointId: 'a' }, anchorB: { type: 'joint', jointId: 'b' }, stiffness: 100, damping: 0, restLength: 5, prestressDelta: 0 } };
  const frame = new SimulationSession(graph).step(graph, options); assert(frame.ok);
  near(frame.result.forceAnalysis!.jointReactions.get('a')!.reactionForce.x, -3);
  near(frame.result.forceAnalysis!.jointReactions.get('b')!.reactionForce.x, 3);
  assert.equal(frame.result.forceVectors.length, 2, 'Applied spring vectors remain visible when every joint is fixed');
  for (const vector of frame.result.forceVectors) near(vector.magnitude!, 3);
});

test('all-fixed external loads remain visible with analysis disabled', () => {
  const graph = rod(); graph.bodies.base.jointIds = ['a', 'b']; graph.joints.a.externalForce = { x: 3, y: 4 };
  const frame = new SimulationSession(graph).step(graph, { ...options, analysis: false }); assert(frame.ok);
  assert.equal(frame.result.forceVectors.length, 1); near(frame.result.forceVectors[0].magnitude!, 5);
  assert.equal(frame.result.forceAnalysis, undefined);
});

test('fractional numeric damping below 0.1 percent is applied rather than silently disabled', () => {
  const graph = rod(); graph.bodies.base.jointIds = []; graph.joints.a.type = 'revolute';
  const velocities = new Map<string, Vec2>([['a', { x: 10, y: 0 }], ['b', { x: 10, y: 0 }]]);
  solveWithForce(graph.joints, graph.links, { enabled: false, strength: 0 }, null, .9995, 25, .25, 1 / 60,
    new Set(), undefined, {}, [], {}, new Map(), graph.bodies, undefined, velocities);
  for (const value of velocities.values()) near(value.x, 10 * Math.pow(.9995, 1 / 60), 1e-9);
});

test('existing external joint load participates in motion and fixed support balance', () => {
  const graph = compileMechanism(rod()); graph.joints.b.externalForce = { x: 0, y: 50 };
  const frame = new SimulationSession(graph).step(graph, options); assert(frame.ok);
  near(frame.result.forceAnalysis!.linkForces.get('ab')!.axialForce!, 300, 3);
  near(frame.result.forceAnalysis!.jointReactions.get('a')!.reactionForce.y, -300, 3);
});

for (const count of [2, 3, 5]) test(`free fall is topology invariant with ${count} visible joints and derived braces`, () => {
  let graph = rod(); graph.joints = Object.fromEntries(Array.from({ length: count }, (_, i) => [`j${i}`, joint(`j${i}`, i * 20, i % 2 * 30)]));
  graph.links = {}; graph.bodies.base.jointIds = []; graph.bodies.rod.jointIds = Object.keys(graph.joints);
  graph = compileMechanism(graph, { completeVisiblePairs: true });
  const original = structuredClone(graph.joints), session = new SimulationSession(graph);
  for (let i = 0; i < 60; i++) {
    const frame = session.step(graph, options); assert(frame.ok, frame.ok ? '' : frame.error); graph = { ...graph, joints: frame.joints };
  }
  for (const id of Object.keys(graph.joints)) near(graph.joints[id].position.y - original[id].position.y, 125, 1.25);
});

for (const hz of [30, 60, 120]) test(`pendulum period and thirty-period energy at ${hz}Hz`, () => {
  const theta = .05, length = 100, gravity = 250, expectedPeriod = 2 * Math.PI * Math.sqrt(length / gravity);
  const graph = compileMechanism(rod()); graph.joints.b.position = { x: length * Math.sin(theta), y: length * Math.cos(theta) };
  let joints = structuredClone(graph.joints), previous = theta, maxEnergyError = 0;
  const velocities = new Map<string, Vec2>(), crossings: number[] = [], energy = gravity * length * (1 - Math.cos(theta));
  for (let i = 1; i <= 30 * expectedPeriod * hz; i++) {
    const result = solveWithForce(joints, graph.links, { enabled: true, strength: gravity }, null, 1, 25, .25, 1 / hz,
      graph.fixedIds, undefined, {}, [], {}, new Map(), graph.bodies, undefined, velocities);
    const position = result.positions.get('b')!;
    joints = { ...joints, b: { ...joints.b, position } };
    const angle = Math.atan2(position.x, position.y), velocity = velocities.get('b')!;
    if (previous > 0 && angle <= 0) crossings.push((i - 1 + previous / (previous - angle)) / hz);
    previous = angle;
    const actualEnergy = .5 * (velocity.x ** 2 + velocity.y ** 2) + gravity * (length - position.y);
    maxEnergyError = Math.max(maxEnergyError, Math.abs(actualEnergy / energy - 1));
  }
  assert(crossings.length >= 29);
  const period = (crossings[crossings.length - 1] - crossings[0]) / (crossings.length - 1);
  assert(Math.abs(period / expectedPeriod - 1) < .02, `Period ${period}, expected ${expectedPeriod}`);
  assert(maxEnergyError < .02, `Energy error ${maxEnergyError}`);
});

test('partial contact analysis is identified rather than certified as complete', () => {
  const graph = compileMechanism(rod()); graph.joints.c = joint('c', 100, 0); graph.joints.b.position = { x: 0, y: 0 }; graph.links = {};
  graph.sliders = { s: { id: 's', jointIdA: 'a', jointIdB: 'b', jointIdC: 'c', t: 0 } };
  const frame = new SimulationSession(graph).step(graph, { ...options, gravityEnabled: false }); assert(frame.ok);
  assert.equal(frame.result.forceAnalysis!.complete, false); assert.match(frame.result.forceAnalysis!.limitations.join(' '), /Slider/);
});

test('rejected analysis step does not contaminate session state', () => {
  const graph = compileMechanism(rod()), session = new SimulationSession(graph), fresh = new SimulationSession(graph);
  const bad = session.step(graph, { ...options, constraintPasses: 0 }); assert(!bad.ok);
  assert.deepEqual(session.step(graph, options), fresh.step(graph, options));
});
