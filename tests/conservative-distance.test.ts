import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import type { MechanismState, Vec2 } from '../src/types';
import { compileMechanism } from '../src/core/compile-mechanism';
import { SimulationSession } from '../src/core/simulation-session';
import { solveWithForce } from '../src/core/solver/newton-raphson';

const options = { dt: 1 / 60, gravityEnabled: true, gravityStrength: 250, damping: 1, dragMultiplier: 25, dragDamping: .25, pull: null, analysis: true };
function pendulum(angle = 1.2): MechanismState {
  return { joints: {
    a: { id: 'a', type: 'fixed', position: { x: 0, y: 0 }, connectedLinkIds: ['rod'] },
    b: { id: 'b', type: 'revolute', position: { x: 100 * Math.sin(angle), y: 100 * Math.cos(angle) }, connectedLinkIds: ['rod'] },
  }, links: { rod: { id: 'rod', jointIds: ['a', 'b'], restLength: 100, mass: 1 } },
    bodies: { base: { id: 'base', name: 'Base', jointIds: ['a'], color: '#f00', showLinks: true, useOutlineCOM: false } },
    baseBodyId: 'base', outlines: {}, images: {}, tracers: {}, sliders: {}, colliders: {}, springs: {} };
}

for (const dt of [1 / 120, 1 / 30, .1]) test(`large-angle pendulum preserves energy with bounded ordinary substeps at dt=${dt}`, () => {
  const scene = pendulum(), fixed = new Set(['a']), velocities = new Map<string, Vec2>();
  let joints = scene.joints; const initialEnergy = 250 * (100 - joints.b.position.y);
  for (let time = 0; time < 30; time += dt) {
    const result = solveWithForce(joints, scene.links, { enabled: true, strength: 250 }, null, 1, 25, .25, dt,
      fixed, undefined, {}, [], {}, new Map(), scene.bodies, undefined, velocities);
    const p = result.positions.get('b')!, v = velocities.get('b')!;
    const energy = .5 * (v.x * v.x + v.y * v.y) + 250 * (100 - p.y);
    assert(Math.abs(energy / initialEnergy - 1) < .02);
    assert(Math.abs(Math.hypot(p.x, p.y) - 100) < 1e-7);
    assert(Math.abs(p.x * v.x + p.y * v.y) < 1e-6, 'Velocity stays tangent');
    joints = { ...joints, b: { ...joints.b, position: p } };
  }
});

test('both RATTLE constraint impulses are included in measured momentum balance', () => {
  const scene = pendulum(.6); scene.joints.b.externalForce = { x: 12, y: -5 };
  const velocities = new Map<string, Vec2>([['b', { x: 8, y: -3 }]]), initial = { ...velocities.get('b')! };
  const result = solveWithForce(scene.joints, scene.links, { enabled: true, strength: 250 }, null, 1, 25, .25, 1 / 60,
    new Set(['a']), undefined, {}, [], {}, new Map(), scene.bodies, undefined, velocities, {}, { analysis: true });
  const reaction = result.forceAnalysis!.jointReactions.get('b')!;
  for (const axis of ['x', 'y'] as const) assert(Math.abs((velocities.get('b')![axis] - initial[axis]) * 60
    - reaction.appliedForce[axis] - reaction.reactionForce[axis]) < 1e-6);
});

test('a rejected conservative projection does not commit velocities', () => {
  const scene = pendulum(0), velocities = new Map<string, Vec2>([['b', { x: 1e8, y: 0 }]]), before = structuredClone(velocities);
  assert.throws(() => solveWithForce(scene.joints, scene.links, { enabled: true, strength: 250 }, null, 1, 25, .25, .1,
    new Set(['a']), undefined, {}, [], {}, new Map(), scene.bodies, undefined, velocities), /Conservative constraint/);
  assert.deepEqual(velocities, before);
});

for (const name of ['airer.slinker', 'working-screen.json']) for (const dt of [1 / 60, 1 / 30, 1 / 12]) {
  test(`${name}: zero damping remains usable at dt=${dt} without the rejected gravity refinement`, () => {
    const raw = JSON.parse(readFileSync(new URL(`../../../baselines/2026-11-15T18-45-10-493Z-CMbWTX/fixtures/${name}`, import.meta.url), 'utf8'));
    let graph = compileMechanism({ images: {}, tracers: {}, ...raw }); const before = structuredClone(graph), session = new SimulationSession(graph);
    for (let i = 0; i < 3; i++) {
      const frame = session.step(graph, { ...options, dt }); assert(frame.ok, frame.ok ? '' : frame.error);
      graph = { ...graph, joints: frame.joints };
    }
    for (const id of before.fixedIds) assert.deepEqual(graph.joints[id].position, before.joints[id].position);
    assert(Object.values(graph.joints).every(j => Number.isFinite(j.position.x) && Number.isFinite(j.position.y)));
  });
}
