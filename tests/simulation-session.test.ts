import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import type { MechanismState, Joint, Body, Link } from '../src/types';
import { compileMechanism, maximumLinkError } from '../src/core/compile-mechanism';
import { SimulationSession } from '../src/core/simulation-session';
import type { FrameOptions } from '../src/core/simulation-session';

const body = (id: string, ids: string[]): Body => ({ id, name: id, color: '#ff0000', jointIds: ids, showLinks: true, useOutlineCOM: false });
const joint = (id: string, x: number, y: number): Joint => ({ id, type: 'revolute', position: { x, y }, connectedLinkIds: [] });
function graph(joints: Joint[], links: Link[], fixed: string[] = []): MechanismState {
  return { joints: Object.fromEntries(joints.map(j => [j.id, j])), links: Object.fromEntries(links.map(l => [l.id, l])),
    bodies: { base: body('base', fixed) }, baseBodyId: 'base', outlines: {}, images: {}, sliders: {}, colliders: {}, tracers: {} };
}
const link = (id: string, a: string, b: string, length: number): Link => ({ id, jointIds: [a, b], restLength: length, mass: 1 });
const options: FrameOptions = { dt: 1 / 60, gravityEnabled: true, gravityStrength: 250, damping: 1, dragMultiplier: 25, dragDamping: .25, pull: null };
for (const name of ['airer.slinker', 'working-screen.json']) test(`${name}: compilation is pure and preserves all saved rest lengths`, () => {
  const raw = JSON.parse(readFileSync(new URL(`../../../baselines/2026-11-15T18-45-10-493Z-CMbWTX/fixtures/${name}`, import.meta.url), 'utf8'));
  const input: MechanismState = { images: {}, tracers: {}, ...raw };
  const before = JSON.stringify(input); const a = compileMechanism(input), b = compileMechanism(input);
  assert.equal(JSON.stringify(input), before); assert.deepEqual(a, b);
  for (const [id, saved] of Object.entries(raw.links)) assert.deepEqual(a.links[id], saved);
  assert(Object.values(a.joints).some(j => j.hidden));
});
test('unconstrained falling particle follows semi-implicit Euler, independent of link degree', () => {
  const free = graph([joint('a', 0, 0), joint('b', 100, 0), joint('c', 200, 0)], []);
  const redundant = structuredClone(free); redundant.links = { ab: link('ab', 'a', 'b', 100), bc: link('bc', 'b', 'c', 100), ac: link('ac', 'a', 'c', 200) };
  const a = new SimulationSession(free).step(free, options), b = new SimulationSession(redundant).step(redundant, options);
  assert(a.ok && b.ok);
  const subDt = options.dt / 10, expected = options.gravityStrength * subDt * subDt * 55;
  for (const id of ['a', 'b', 'c']) { assert(Math.abs(a.joints[id].position.y - expected) < 1e-10); assert(Math.abs(b.joints[id].position.y - expected) < 1e-10); }
});
for (const count of [1, 2, 4]) test(`${count}-link chain maintains lengths and support over 240 frames`, () => {
  const joints = Array.from({ length: count + 1 }, (_, i) => joint(String(i), i * 100, 0));
  let g = compileMechanism(graph(joints, Array.from({ length: count }, (_, i) => link(String(i), String(i), String(i + 1), 100)), ['0']));
  const session = new SimulationSession(g);
  for (let frame = 0; frame < 240; frame++) {
    const result = session.step(g, { ...options, damping: .5 });
    assert(result.ok, result.ok ? '' : result.error);
    g = { ...g, joints: result.joints };
    assert(maximumLinkError(g.joints, g.links) < 1e-3);
    assert.deepEqual(g.joints['0'].position, { x: 0, y: 0 });
  }
  assert(g.joints[String(count)].position.y > 10);
});
test('rigid collinear body remains rigid under pull without mutating design', () => {
  const g = graph([joint('a', 0, 0), joint('b', 100, 0), joint('c', 200, 0)], [link('ab', 'a', 'b', 100), link('bc', 'b', 'c', 100), link('ac', 'a', 'c', 200)], ['a']);
  g.bodies.arm = body('arm', ['a', 'b', 'c']);
  const original = structuredClone(g); let compiled = compileMechanism(g); const session = new SimulationSession(compiled);
  for (let i = 0; i < 120; i++) {
    const frame = session.step(compiled, { ...options, pull: { linkId: 'bc', grabT: 1, target: { x: 0, y: 200 } } });
    assert(frame.ok, frame.ok ? '' : frame.error); compiled = { ...compiled, joints: frame.joints };
  }
  assert(maximumLinkError(compiled.joints, compiled.links) < 1e-3); assert.deepEqual(g, original);
});
test('zero-rest coincidence is valid and remains coincident under gravity', () => {
  let g = compileMechanism(graph([joint('a', 0, 0), joint('b', 0, 0)], [link('ab', 'a', 'b', 0)], ['a']));
  const s = new SimulationSession(g);
  for (let i = 0; i < 60; i++) { const r = s.step(g, options); assert(r.ok); g = { ...g, joints: r.joints }; }
  assert(Math.hypot(g.joints.b.position.x, g.joints.b.position.y) < 1e-8);
});
test('failed frame preserves source and trial velocities; retry equals a fresh session', () => {
  const g = compileMechanism(graph([joint('a', 0, 0), joint('b', 100, 0)], [link('ab', 'a', 'b', 100)], ['a']));
  const original = structuredClone(g); const session = new SimulationSession(g);
  const fail = session.step(g, { ...options, pull: { linkId: 'ab', grabT: 1, target: { x: NaN, y: 0 } } });
  assert.equal(fail.ok, false); assert.deepEqual(g, original);
  const retried = session.step(g, options), fresh = new SimulationSession(g).step(g, options);
  assert.deepEqual(retried, fresh);
});
test('interleaved projects with identical IDs never share velocity state', () => {
  const a = compileMechanism(graph([joint('a', 0, 0)], []));
  const b = structuredClone(a); b.joints.a.position.y = 200;
  const sa = new SimulationSession(a), sb = new SimulationSession(b);
  let moved = a;
  for (let i = 0; i < 10; i++) { const r = sa.step(moved, options); assert(r.ok); moved = { ...moved, joints: r.joints }; }
  assert.deepEqual(sb.step(b, options), new SimulationSession(b).step(b, options));
  assert.deepEqual(new SimulationSession(a).step(a, options), new SimulationSession(a).step(a, options));
});
test('invalid dt/settings and inconsistent fixed geometry are rejected', () => {
  const g = compileMechanism(graph([joint('a', 0, 0), joint('b', 100, 0)], [link('ab', 'a', 'b', 50)], ['a', 'b']));
  const s = new SimulationSession(g);
  for (const dt of [0, -1, NaN, Infinity, 1]) assert.equal(s.step(g, { ...options, dt }).ok, false);
  assert.equal(s.step(g, options).ok, false);
});
test('closed four-bar loop maintains closure, side lengths and fixed pivots', () => {
  const g = graph([joint('a', 0, 0), joint('b', 100, 0), joint('c', 150, 100), joint('d', 0, 100)],
    [link('ab', 'a', 'b', 100), link('bc', 'b', 'c', Math.hypot(50, 100)), link('cd', 'c', 'd', 150), link('da', 'd', 'a', 100)], ['a', 'd']);
  let current = compileMechanism(g); const session = new SimulationSession(current);
  for (let i = 0; i < 180; i++) {
    const r = session.step(current, { ...options, damping: .5, pull: { linkId: 'bc', grabT: 1, target: { x: 80, y: 150 } } });
    assert(r.ok, r.ok ? '' : r.error); current = { ...current, joints: r.joints };
    assert(maximumLinkError(current.joints, current.links) < 1e-3);
    assert.deepEqual(current.joints.a.position, g.joints.a.position); assert.deepEqual(current.joints.d.position, g.joints.d.position);
  }
});
