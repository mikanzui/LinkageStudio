import assert from 'node:assert/strict';
import test from 'node:test';
import type { Joint, Link, MechanismSpring, SpringAnchor, Vec2 } from '../src/types';
import { evaluateSpringForces, resolveSpringAnchor, torsionGeometry, validateSpring } from '../src/core/springs/spring-model';
import type { JointSample } from '../src/core/springs/spring-model';

function near(actual: number, expected: number, tolerance = 1e-10): void {
  assert.ok(Number.isFinite(actual), `nonfinite result ${actual}`);
  assert.ok(Math.abs(actual - expected) <= tolerance * Math.max(1, Math.abs(expected)), `${actual} != ${expected}`);
}

function vector(actual: Vec2 | undefined, expected: Vec2): void {
  assert.ok(actual, 'missing force/point');
  near(actual.x, expected.x);
  near(actual.y, expected.y);
}

const jointAnchor = (jointId: string): SpringAnchor => ({ type: 'joint', jointId });
const linkAnchor = (linkId: string, t: number): SpringAnchor => ({ type: 'link', linkId, t });
const worldAnchor = (x: number, y: number): SpringAnchor => ({ type: 'world', position: { x, y } });
const joint = (id: string, x: number, y: number, fixed = false): Joint => ({
  id, type: fixed ? 'fixed' : 'revolute', position: { x, y }, connectedLinkIds: [],
});
const link = (id: string, a: string, b: string): Link => ({ id, jointIds: [a, b], restLength: 1, mass: 1 });
const spring = (overrides: Partial<MechanismSpring> = {}): MechanismSpring => ({
  id: 's', kind: 'linear', anchorA: jointAnchor('a'), anchorB: jointAnchor('b'),
  stiffness: 100, damping: 0, restLength: 10, prestressDelta: 0, ...overrides,
});
const samples = (joints: Record<string, Joint>, velocities: Record<string, Vec2> = {}): Record<string, JointSample> =>
  Object.fromEntries(Object.entries(joints).map(([id, j]) => [id, {
    position: j.position, velocity: velocities[id] ?? { x: 0, y: 0 },
  }]));

function evaluate(s: MechanismSpring, state: Record<string, JointSample | undefined>, links: Record<string, Link> = {}): Map<string, Vec2> {
  return evaluateSpringForces({ [s.id]: s }, links, id => state[id]);
}

function totalForce(forces: Map<string, Vec2>): Vec2 {
  return [...forces.values()].reduce((v, f) => ({ x: v.x + f.x, y: v.y + f.y }), { x: 0, y: 0 });
}

function moment(forces: Map<string, Vec2>, state: Record<string, JointSample>, origin: Vec2 = { x: 0, y: 0 }): number {
  return [...forces].reduce((sum, [id, f]) => {
    const p = state[id].position;
    return sum + (p.x - origin.x) * f.y - (p.y - origin.y) * f.x;
  }, 0);
}

function power(forces: Map<string, Vec2>, state: Record<string, JointSample>): number {
  return [...forces].reduce((sum, [id, f]) => sum + f.x * state[id].velocity.x + f.y * state[id].velocity.y, 0);
}

function torsion(la = 1, lb = 1): { s: MechanismSpring; joints: Record<string, Joint>; links: Record<string, Link> } {
  return {
    s: spring({ kind: 'torsional', anchorA: linkAnchor('pa', 0), anchorB: linkAnchor('bp', 1), stiffness: 0.2, restLength: 0 }),
    joints: { p: joint('p', 0, 0), a: joint('a', la, 0), b: joint('b', 0, lb) },
    links: { pa: link('pa', 'p', 'a'), bp: link('bp', 'b', 'p') },
  };
}

for (const [label, length, expected] of [['stretch', 15, 3], ['compression', 5, -3], ['equilibrium', 10, 0]] as const) {
  test(`linear ${label} has exact legacy sign and magnitude`, () => {
    const state = samples({ a: joint('a', 0, 0), b: joint('b', length, 0) });
    const f = evaluate(spring(), state);
    vector(f.get('a'), { x: expected, y: 0 });
    vector(f.get('b'), { x: -expected, y: 0 });
    vector(totalForce(f), { x: 0, y: 0 });
    near(moment(f, state), 0);
  });
}

test('linear equilibrium is rest plus signed prestress, not rest alone', () => {
  const state = samples({ a: joint('a', 0, 0), b: joint('b', 10, 0) });
  vector(evaluate(spring({ restLength: 8, prestressDelta: 2 }), state).get('a'), { x: 0, y: 0 });
  vector(evaluate(spring({ restLength: 12, prestressDelta: -2 }), state).get('a'), { x: 0, y: 0 });
  vector(evaluate(spring({ restLength: 8, prestressDelta: 1 }), state).get('a'), { x: 0.6, y: 0 });
});

test('linear forces rotate with the axis and conserve moment about an arbitrary origin', () => {
  const state = samples({ a: joint('a', 7, -11), b: joint('b', 16, 1) });
  const f = evaluate(spring(), state);
  vector(f.get('a'), { x: 1.8, y: 2.4 });
  vector(f.get('b'), { x: -1.8, y: -2.4 });
  vector(totalForce(f), { x: 0, y: 0 });
  near(moment(f, state, { x: -23, y: 44 }), 0);
});

test('axial damping is dissipative and ignores perpendicular relative motion', () => {
  const state = samples({ a: joint('a', 0, 0), b: joint('b', 10, 0) }, {
    a: { x: -2, y: 9 }, b: { x: 3, y: -4 },
  });
  const f = evaluate(spring({ stiffness: 0, damping: 20 }), state);
  vector(f.get('a'), { x: 0.6, y: 0 });
  vector(f.get('b'), { x: -0.6, y: 0 });
  near(power(f, state), -3);
});

test('common translation produces no linear damping force', () => {
  const state = samples({ a: joint('a', -1, -1), b: joint('b', 5, 7) }, {
    a: { x: 123, y: -98 }, b: { x: 123, y: -98 },
  });
  for (const f of evaluate(spring({ damping: 80 }), state).values()) vector(f, { x: 0, y: 0 });
});

test('damper ignores all finite stiffness, rest and prestress values in its force', () => {
  const state = samples({ a: joint('a', 0, 0), b: joint('b', 10, 0) }, { b: { x: -5, y: 100 } });
  const s = spring({ kind: 'damper', damping: 20 });
  const expected = evaluate(s, state);
  const huge = spring({ ...s, stiffness: Number.MAX_VALUE, restLength: Number.MAX_VALUE, prestressDelta: Number.MAX_VALUE });
  assert.doesNotThrow(() => validateSpring(huge, { a: joint('a', 0, 0), b: joint('b', 10, 0) }, {}));
  assert.deepEqual(evaluate(huge, state), expected);
  vector(expected.get('a'), { x: -0.6, y: 0 });
  near(power(expected, state), -3);
  vector(evaluate(spring({ ...s, prestressDelta: -1000 }), state).get('a'), { x: -0.6, y: 0 });
});

test('fractional anchors interpolate velocity and distribute forces barycentrically', () => {
  const joints = { a0: joint('a0', 0, 0), a1: joint('a1', 4, 0), b0: joint('b0', 1, 6), b1: joint('b1', 1, 10) };
  const links = { a: link('a', 'a0', 'a1'), b: link('b', 'b0', 'b1') };
  const state = samples(joints, { a0: { x: 0, y: -1 }, a1: { x: 0, y: 3 }, b0: { x: 0, y: 2 }, b1: { x: 0, y: 6 } });
  const s = spring({ anchorA: linkAnchor('a', 0.25), anchorB: linkAnchor('b', 0.5), restLength: 3, damping: 10 });
  const f = evaluate(s, state, links);
  // A=(1,0), vA=(0,0); B=(1,8), vB=(0,4). F=100*.006*5+10*.006*4=3.24.
  vector(f.get('a0'), { x: 0, y: 2.43 });
  vector(f.get('a1'), { x: 0, y: 0.81 });
  vector(f.get('b0'), { x: 0, y: -1.62 });
  vector(f.get('b1'), { x: 0, y: -1.62 });
  vector(totalForce(f), { x: 0, y: 0 });
  near(moment(f, state, { x: 12, y: -34 }), 0);
  const damping = evaluate({ ...s, stiffness: 0 }, state, links);
  near(power(damping, state), -0.96);
});

test('fixed joints remain in the force map for full force and moment conservation', () => {
  const state = samples({ a: joint('a', 0, 0, true), b: joint('b', 15, 0) });
  const f = evaluate(spring(), state);
  assert.equal(f.size, 2);
  vector(f.get('a'), { x: 3, y: 0 });
  vector(totalForce(f), { x: 0, y: 0 });
  near(moment(f, state), 0);
});

test('world anchor is immobile and its omitted reaction is explicit in net joint force', () => {
  const s = spring({ anchorA: worldAnchor(0, 0), restLength: 0, damping: 10 });
  const state = samples({ b: joint('b', 3, 4) }, { b: { x: 3, y: 4 } });
  const f = evaluate(s, state);
  assert.equal(f.size, 1);
  vector(f.get('b'), { x: -1.98, y: -2.64 });
  vector(totalForce(f), { x: -1.98, y: -2.64 });
  const reversed = evaluate({ ...s, anchorA: jointAnchor('b'), anchorB: worldAnchor(0, 0) }, state);
  assert.deepEqual(reversed, f);
});

test('two world anchors return no joint reactions and never call sample', () => {
  const s = spring({ anchorA: worldAnchor(1, 2), anchorB: worldAnchor(5, 8) });
  assert.equal(evaluateSpringForces({ s }, {}, () => { throw new Error('unexpected sample'); }).size, 0);
});

test('endpoint link weights and shared-joint contributions add without overwriting', () => {
  const state = samples({ a: joint('a', 0, 0), b: joint('b', 15, 0), c: joint('c', 0, 15) });
  const s1 = spring({ anchorA: linkAnchor('ab', 0), anchorB: linkAnchor('ab', 1) });
  const s2 = spring({ id: 'other', anchorB: jointAnchor('c') });
  const f = evaluateSpringForces({ s1, s2 }, { ab: link('ab', 'a', 'b') }, id => state[id]);
  vector(f.get('a'), { x: 3, y: 3 });
  vector(f.get('b'), { x: -3, y: 0 });
  vector(f.get('c'), { x: 0, y: -3 });
  vector(totalForce(f), { x: 0, y: 0 });
});

for (const distance of [0, 1e-12]) {
  test(`separation ${distance} skips elasticity and gives finite dissipative coincidence damping`, () => {
    const state = samples({ a: joint('a', 0, 0), b: joint('b', distance, 0) }, { b: { x: 3, y: 4 } });
    const f = evaluate(spring({ stiffness: Number.MAX_VALUE, damping: 20 }), state);
    vector(f.get('a'), { x: 0.36, y: 0.48 });
    vector(f.get('b'), { x: -0.36, y: -0.48 });
    near(power(f, state), -3);
    vector(totalForce(f), { x: 0, y: 0 });
    const staticState = samples({ a: joint('a', 0, 0), b: joint('b', distance, 0) });
    for (const force of evaluate(spring(), staticState).values()) vector(force, { x: 0, y: 0 });
  });
}

for (const [la, lb] of [[1, 1], [2, 5], [5, 2]]) {
  test(`torsion ${la}/${lb} legs receive opposing moments and restore the relative angle`, () => {
    const { s, joints, links } = torsion(la, lb);
    const state = samples(joints);
    const f = evaluate(s, state, links);
    // theta=pi/2, effective k=2, tau=-pi, not two same-sign distal torques.
    vector(f.get('a'), { x: 0, y: Math.PI / la });
    vector(f.get('b'), { x: Math.PI / lb, y: 0 });
    vector(f.get('p'), { x: -Math.PI / lb, y: -Math.PI / la });
    const torqueA = la * f.get('a')!.y;
    const torqueB = -lb * f.get('b')!.x;
    near(torqueA, Math.PI);
    near(torqueB, -Math.PI);
    assert.ok(torqueB / (lb * lb) - torqueA / (la * la) < 0, 'relative acceleration must reduce positive angle error');
    vector(totalForce(f), { x: 0, y: 0 });
    near(moment(f, state, { x: 37, y: -23 }), 0);
  });
}

test('torsion equilibrium includes signed offset and permits signed rest angles', () => {
  const { s, joints, links } = torsion(2, 5);
  const equilibrium = { ...s, restLength: -0.25, prestressDelta: Math.PI / 2 + 0.25 };
  assert.doesNotThrow(() => validateSpring(equilibrium, joints, links));
  for (const force of evaluate(equilibrium, samples(joints), links).values()) vector(force, { x: 0, y: 0 });
});

for (const [la, lb] of [[1, 1], [2, 5], [5, 2]]) {
  test(`torsion damping ${la}/${lb} has exact negative relative-angular power`, () => {
    const { s, joints, links } = torsion(la, lb);
    const state = samples(joints, {
      p: { x: 3, y: -4 }, a: { x: 3, y: -4 - 2 * la }, b: { x: 3 + lb, y: -4 },
    });
    const f = evaluate({ ...s, stiffness: 0, damping: 1 }, state, links);
    // omegaA=-2, omegaB=-1; tau=-5. Fork's same-sign torque gives positive power here.
    vector(f.get('a'), { x: 0, y: 5 / la });
    vector(f.get('b'), { x: 5 / lb, y: 0 });
    near(power(f, state), -5);
    vector(totalForce(f), { x: 0, y: 0 });
    near(moment(f, state), 0);
  });
}

test('torsion damping ignores common rigid rotation, translation and radial leg speed', () => {
  const { s, joints, links } = torsion(2, 5);
  const state = samples(joints, {
    p: { x: 8, y: -3 }, a: { x: 8 + 7, y: -3 + 6 }, b: { x: 8 - 15, y: -3 - 9 },
  });
  for (const f of evaluate({ ...s, stiffness: 0, damping: 7 }, state, links).values()) vector(f, { x: 0, y: 0 });
});

test('torsion signed negative angle restores in the opposite direction', () => {
  const { s, joints, links } = torsion();
  joints.b.position = { x: 0, y: -1 };
  const f = evaluate(s, samples(joints), links);
  vector(f.get('a'), { x: 0, y: -Math.PI });
  vector(f.get('b'), { x: Math.PI, y: 0 });
});

for (const rotation of [0, 0.43, -1.7, Math.PI]) {
  test(`torsion geometry/forces are translation and rotation covariant at ${rotation}`, () => {
    const { s, joints, links } = torsion(2, 5);
    const rotate = (v: Vec2): Vec2 => ({ x: Math.cos(rotation) * v.x - Math.sin(rotation) * v.y, y: Math.sin(rotation) * v.x + Math.cos(rotation) * v.y });
    for (const j of Object.values(joints)) {
      const p = rotate(j.position);
      j.position = { x: p.x + 19, y: p.y - 7 };
    }
    const state = samples(joints, { p: rotate({ x: 3, y: -4 }), a: rotate({ x: 3, y: -8 }), b: rotate({ x: 8, y: -4 }) });
    const f = evaluate({ ...s, damping: 1 }, state, links);
    const magnitude = Math.PI + 5;
    vector(f.get('a'), rotate({ x: 0, y: magnitude / 2 }));
    vector(f.get('b'), rotate({ x: magnitude / 5, y: 0 }));
    vector(f.get('p'), rotate({ x: -magnitude / 5, y: -magnitude / 2 }));
    vector(totalForce(f), { x: 0, y: 0 });
    near(moment(f, state), 0);
  });
}

test('torsion wraps across the +/-pi seam using the shortest signed error', () => {
  const { s, joints, links } = torsion();
  const angle = -Math.PI + 0.1;
  joints.b.position = { x: Math.cos(angle), y: Math.sin(angle) };
  const f = evaluate({ ...s, stiffness: 1, restLength: Math.PI - 0.1 }, samples(joints), links);
  // Shortest error is +0.2, so effective k=10 gives tau=-2.
  vector(f.get('a'), { x: 0, y: 2 });
  vector(f.get('b'), { x: 2 * Math.sin(angle), y: -2 * Math.cos(angle) });
});

test('torsion equilibrium is periodic over several revolutions', () => {
  const { s, joints, links } = torsion();
  for (const turns of [-3, -1, 1, 4]) {
    for (const f of evaluate({ ...s, restLength: Math.PI / 2 + turns * 2 * Math.PI }, samples(joints), links).values()) vector(f, { x: 0, y: 0 });
  }
});

test('torsion geometry uses anchor endpoints as pivot and returns detached live/design coordinates', () => {
  const { s, joints, links } = torsion(2, 5);
  assert.deepEqual(torsionGeometry(s, joints, links), {
    pivotId: 'p', distalAId: 'a', distalBId: 'b', pivot: { x: 0, y: 0 }, a: { x: 2, y: 0 }, b: { x: 0, y: 5 },
  });
  links.pa.jointIds = ['a', 'p'];
  links.bp.jointIds = ['p', 'b'];
  s.anchorA = linkAnchor('pa', 1);
  s.anchorB = linkAnchor('bp', 0);
  assert.doesNotThrow(() => validateSpring(s, joints, links));
  const geometry = torsionGeometry(s, joints, links)!;
  Object.assign(geometry.a, { x: 999 });
  assert.equal(joints.a.position.x, 2);
  joints.a.position = { x: 4, y: 1 };
  vector(torsionGeometry(s, joints, links)!.a, { x: 4, y: 1 });
});

test('force evaluation uses current samples, not design coordinates or link rest lengths', () => {
  const { s, joints, links } = torsion(2, 5);
  const state = samples(joints);
  state.a = { position: { x: 4, y: 0 }, velocity: { x: 0, y: 0 } };
  links.pa.restLength = 98765;
  vector(evaluate(s, state, links).get('a'), { x: 0, y: Math.PI / 4 });
  assert.equal(joints.a.position.x, 2);
});

test('anchor resolution supports design/live joints, endpoint weights and world copies', () => {
  const joints = { a: joint('a', 1, 2), b: joint('b', 9, 6) };
  const links = { ab: link('ab', 'a', 'b') };
  vector(resolveSpringAnchor(jointAnchor('a'), joints, links)!, { x: 1, y: 2 });
  vector(resolveSpringAnchor(linkAnchor('ab', 0.25), joints, links)!, { x: 3, y: 3 });
  vector(resolveSpringAnchor(linkAnchor('ab', 0), joints, links)!, { x: 1, y: 2 });
  vector(resolveSpringAnchor(linkAnchor('ab', 1), joints, links)!, { x: 9, y: 6 });
  const world = worldAnchor(-5, 6);
  const resolved = resolveSpringAnchor(world, joints, links)!;
  Object.assign(resolved, { x: 111 });
  vector(resolveSpringAnchor(world, joints, links)!, { x: -5, y: 6 });
  const detached = resolveSpringAnchor(jointAnchor('a'), joints, links)!;
  Object.assign(detached, { y: 999 });
  assert.equal(joints.a.position.y, 2);
  joints.a.position = { x: -3, y: 2 };
  vector(resolveSpringAnchor(linkAnchor('ab', 0.25), joints, links)!, { x: 0, y: 3 });
});

for (const field of ['stiffness', 'damping', 'restLength', 'prestressDelta'] as const) {
  for (const value of [NaN, Infinity, -Infinity]) {
    test(`nonfinite ${field}=${value} is diagnosed by validation and evaluation`, () => {
      const joints = { a: joint('a', 0, 0), b: joint('b', 10, 0) };
      const s = spring({ [field]: value });
      assert.throws(() => validateSpring(s, joints, {}), new RegExp(`Spring s:.*${field}.*finite`));
      assert.throws(() => evaluate(s, samples(joints)), /Spring s:.*finite/);
    });
  }
}

for (const overrides of [{ stiffness: -1 }, { damping: -1 }, { restLength: -1 }, { restLength: 1, prestressDelta: -2 }]) {
  test(`invalid negative linear parameter ${JSON.stringify(overrides)} is diagnosed`, () => {
    const joints = { a: joint('a', 0, 0), b: joint('b', 10, 0) };
    assert.throws(() => validateSpring(spring(overrides), joints, {}), /Spring s:.*nonnegative/);
    assert.throws(() => evaluate(spring(overrides), samples(joints)), /Spring s:.*nonnegative/);
  });
}

test('finite stiffness and damping have no artificial coefficient cap', () => {
  const joints = { a: joint('a', 0, 0), b: joint('b', 11, 0) };
  const s = spring({ stiffness: 1e12, damping: 1e12 });
  assert.doesNotThrow(() => validateSpring(s, joints, {}));
  vector(evaluate(s, samples(joints)).get('a'), { x: 6e9, y: 0 });
  const fixture = torsion();
  const t = { ...fixture.s, stiffness: 1e12, damping: 1e12 };
  assert.doesNotThrow(() => validateSpring(t, fixture.joints, fixture.links));
  vector(evaluate(t, samples(fixture.joints), fixture.links).get('a'), { x: 0, y: 5e12 * Math.PI });
});

test('linear equilibrium overflow is rejected rather than converted to a force', () => {
  const s = spring({ restLength: Number.MAX_VALUE, prestressDelta: Number.MAX_VALUE });
  assert.throws(() => validateSpring(s, {}, {}), /equilibrium.*finite/);
  assert.throws(() => evaluate(s, {}), /equilibrium.*finite/);
});

for (const invalid of [jointAnchor('missing'), linkAnchor('missing', 0.5), linkAnchor('ab', -0.01), linkAnchor('ab', 1.01), linkAnchor('ab', NaN), linkAnchor('ab', Infinity), worldAnchor(NaN, 0)]) {
  test(`invalid anchor ${JSON.stringify(invalid)} resolves to null and is diagnosed`, () => {
    const joints = { a: joint('a', 0, 0), b: joint('b', 10, 0) };
    const links = { ab: link('ab', 'a', 'b') };
    assert.equal(resolveSpringAnchor(invalid, joints, links), null);
    assert.throws(() => validateSpring(spring({ anchorA: invalid }), joints, links), /Spring s:.*anchorA/);
    assert.throws(() => evaluate(spring({ anchorA: invalid }), samples(joints), links), /Spring s:/);
  });
}

test('zero-weight link endpoints must still reference real finite joints', () => {
  const joints = { a: joint('a', 0, 0), b: joint('b', 10, 0) };
  const links = { ab: link('ab', 'a', 'missing') };
  const s = spring({ anchorA: linkAnchor('ab', 0) });
  assert.equal(resolveSpringAnchor(s.anchorA, joints, links), null);
  assert.throws(() => validateSpring(s, joints, links), /anchorA/);
  assert.throws(() => evaluate(s, samples(joints), links), /missing/);
  links.ab.jointIds = ['a', 'b'];
  joints.b.position = { x: Infinity, y: 0 };
  assert.equal(resolveSpringAnchor(s.anchorA, joints, links), null);
});

const invalidTorsionCases: [string, (fixture: ReturnType<typeof torsion>) => void][] = [
  ['same link', f => { f.s.anchorB = linkAnchor('pa', 0); }],
  ['interior t', f => { f.s.anchorA = linkAnchor('pa', 0.5); }],
  ['near-endpoint t', f => { f.s.anchorA = linkAnchor('pa', Number.EPSILON); }],
  ['different pivot', f => { f.s.anchorB = linkAnchor('bp', 0); }],
  ['joint anchor', f => { f.s.anchorA = jointAnchor('p'); }],
  ['world anchor', f => { f.s.anchorA = worldAnchor(0, 0); }],
  ['zero leg', f => { f.joints.a.position = { x: 0, y: 0 }; }],
  ['self loop', f => { f.links.pa.jointIds = ['p', 'p']; }],
  ['same distal', f => { f.links.bp.jointIds = ['a', 'p']; }],
  ['missing distal', f => { delete f.joints.b; }],
  ['nonfinite distal', f => { f.joints.b.position = { x: Infinity, y: 1 }; }],
];

for (const [label, invalidate] of invalidTorsionCases) {
  test(`invalid torsion ${label} is rejected without emitting forces`, () => {
    const f = torsion();
    invalidate(f);
    assert.equal(torsionGeometry(f.s, f.joints, f.links), null);
    assert.throws(() => validateSpring(f.s, f.joints, f.links), /Spring s:/);
    assert.throws(() => evaluate(f.s, samples(f.joints), f.links), /Spring s:/);
  });
}

test('torsionGeometry rejects non-torsional springs', () => {
  const { joints, links } = torsion();
  assert.equal(torsionGeometry(spring(), joints, links), null);
});

for (const state of [
  { a: { position: { x: NaN, y: 0 }, velocity: { x: 0, y: 0 } } },
  { a: { position: { x: 0, y: 0 }, velocity: { x: 0, y: Infinity } } },
  {},
]) {
  test('missing/nonfinite current state throws a joint diagnostic', () => {
    assert.throws(() => evaluate(spring(), state), /Spring s: joint a.*missing or nonfinite/);
  });
}

test('derived linear force/separation overflow is rejected including all-world springs', () => {
  const state = samples({ a: joint('a', 0, 0), b: joint('b', 1e300, 0) });
  assert.throws(() => evaluate(spring({ stiffness: 1e300 }), state), /nonfinite linear force/);
  const s = spring({ stiffness: 1e300, anchorA: worldAnchor(0, 0), anchorB: worldAnchor(1e300, 0) });
  assert.throws(() => evaluate(s, {}), /nonfinite linear force/);
  assert.throws(() => evaluate({ ...s, anchorA: worldAnchor(-Number.MAX_VALUE, 0), anchorB: worldAnchor(Number.MAX_VALUE, 0) }, {}), /nonfinite separation/);
});

test('force accumulation overflow throws, not a partially returned map', () => {
  const s1 = spring({ stiffness: Number.MAX_VALUE, restLength: 0 });
  const s2 = { ...s1, id: 'second' };
  const state = samples({ a: joint('a', 0, 0), b: joint('b', 100, 0) });
  assert.ok(Number.isFinite(evaluate(s1, state).get('a')!.x));
  assert.throws(() => evaluateSpringForces({ s1, s2 }, {}, id => state[id]), /Spring second: nonfinite force/);
});

test('torsion rejects nonfinite derived torque and forces for tiny nonzero legs', () => {
  const { s, joints, links } = torsion(1e-310, 1);
  assert.doesNotThrow(() => validateSpring(s, joints, links));
  assert.throws(() => evaluate(s, samples(joints), links), /nonfinite force/);
  const fixture = torsion();
  assert.throws(() => evaluate({ ...fixture.s, stiffness: Number.MAX_VALUE }, samples(fixture.joints), fixture.links), /nonfinite torsion/);
});

function deepFreeze<T>(value: T): T {
  if (value && typeof value === 'object') {
    Object.freeze(value);
    for (const child of Object.values(value)) deepFreeze(child);
  }
  return value;
}

test('all inputs remain immutable, samples are read once per call and outputs have no hidden state', () => {
  const fixture = torsion(2, 5);
  const springs = {
    torsion: fixture.s,
    linear: spring({ id: 'linear', anchorA: linkAnchor('pa', 0.25), anchorB: jointAnchor('b') }),
    damper: spring({ id: 'damper', kind: 'damper', anchorA: jointAnchor('p'), damping: 12 }),
  };
  const state = samples(fixture.joints, { a: { x: 1, y: 2 }, b: { x: -3, y: 4 } });
  const input = deepFreeze({ ...fixture, springs, state });
  const before = JSON.stringify(input);
  const calls = new Map<string, number>();
  const actual = evaluateSpringForces(springs, fixture.links, id => {
    calls.set(id, (calls.get(id) ?? 0) + 1);
    return state[id];
  });
  assert.deepEqual([...calls.values()], [1, 1, 1]);
  for (const s of Object.values(springs)) validateSpring(s, fixture.joints, fixture.links);
  const expected = evaluateSpringForces(springs, fixture.links, id => state[id]);
  assert.deepEqual(actual, expected);
  Object.assign(actual.get('a')!, { x: 12345 });
  actual.clear();
  assert.deepEqual(evaluateSpringForces(springs, fixture.links, id => state[id]), expected);
  assert.equal(JSON.stringify(input), before);
  assert.deepEqual(evaluateSpringForces({}, fixture.links, () => undefined), new Map());
});
