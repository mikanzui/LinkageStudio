import assert from 'node:assert/strict';
import test from 'node:test';
import { computeDOF } from '../src/core/solver/dof';
import type { Joint, Link, SliderConstraint } from '../src/types';

function joint(id: string, x: number, y: number, options: Partial<Joint> = {}): Joint {
  return { id, type: 'revolute', position: { x, y }, connectedLinkIds: [], ...options };
}

function graph(points: Joint[], pairs: [string, string][] = []) {
  const joints = Object.fromEntries(points.map((point) => [point.id, point]));
  const links: Record<string, Link> = Object.fromEntries(pairs.map(([a, b], i) => {
    const id = `link${i}`;
    return [id, {
      id, jointIds: [a, b], mass: 1,
      restLength: Math.hypot(
        joints[a].position.x - joints[b].position.x,
        joints[a].position.y - joints[b].position.y,
      ),
    }];
  }));
  return { joints, links };
}

const slider: Record<string, SliderConstraint> = {
  slider: { id: 'slider', jointIdA: 'a', jointIdB: 'b', jointIdC: 'c', t: 0.5 },
};

test('a lone free pivot has two translational DOF', () => {
  assert.equal(computeDOF({ a: joint('a', 0, 0) }, {}, false), 2);
  assert.equal(computeDOF({}, {}, false), 0);
});

test('a rod with one fixed pivot has one rotational DOF', () => {
  const { joints, links } = graph([
    joint('a', 0, 0, { type: 'fixed' }), joint('b', 2, 0),
  ], [['a', 'b']]);
  assert.equal(computeDOF(joints, links, false), 1);
  assert.equal(computeDOF(joints, links, true), 0);
});

test('a free triangle has only three planar rigid-body DOF', () => {
  const { joints, links } = graph([
    joint('a', 0, 0), joint('b', 2, 0), joint('c', 0, 1),
  ], [['a', 'b'], ['b', 'c'], ['c', 'a']]);
  assert.equal(computeDOF(joints, links, false), 3);
});

test('a redundant complete rectangle retains three rigid-body DOF', () => {
  const { joints, links } = graph([
    joint('a', 0, 0), joint('b', 2, 0), joint('c', 2, 1), joint('d', 0, 1),
  ], [['a', 'b'], ['a', 'c'], ['a', 'd'], ['b', 'c'], ['b', 'd'], ['c', 'd']]);
  assert.equal(computeDOF(joints, links, false), 3);
  const redundant = { ...links, duplicate: { ...links.link0, id: 'duplicate' } };
  assert.equal(computeDOF(joints, redundant, false), 3);
  assert.equal(computeDOF(joints, Object.fromEntries(Object.entries(redundant).reverse()), false), 3);
});

test('a dense redundant six-pivot body does not yield negative mobility', () => {
  const points = [
    joint('a', 0, 0), joint('b', 1, 0), joint('c', 2, 1),
    joint('d', 2, 2), joint('e', 1, 3), joint('f', 0, 2),
  ];
  const pairs: [string, string][] = [];
  for (let i = 0; i < points.length; i++) {
    for (let j = i + 1; j < points.length; j++) pairs.push([points[i].id, points[j].id]);
  }
  const { joints, links } = graph(points, pairs);
  assert.equal(computeDOF(joints, links, false), 3);
  assert.equal(computeDOF(joints, links, true), 2);
});

test('fixed-fixed rows and a driver cannot produce negative DOF', () => {
  const { joints, links } = graph([
    joint('a', 0, 0, { type: 'fixed' }), joint('b', 1, 0, { type: 'fixed' }),
  ], [['a', 'b'], ['a', 'b']]);
  assert.equal(computeDOF(joints, links, false), 0);
  assert.equal(computeDOF(joints, links, true), 0);
  joints.c = joint('c', 3, 4);
  assert.equal(computeDOF(joints, links, false), 2);
  assert.equal(computeDOF(joints, links, true), 1);
});

test('zero-rest coincidence imposes two coordinate equalities', () => {
  const { joints, links } = graph([joint('a', 1, 2), joint('b', 1, 2)], [['a', 'b']]);
  assert.equal(computeDOF(joints, links, false), 2);
  assert.equal(computeDOF(joints, links, false, new Set(['a'])), 0);
  // Rest-zero semantics still apply if the current pose is not yet coincident.
  joints.b.position = { x: 4, y: 2 };
  assert.equal(computeDOF(joints, links, false), 2);
});

test('the supplied fixed set overrides visible joint types', () => {
  const { joints, links } = graph([
    joint('a', 0, 0, { type: 'fixed' }), joint('b', 2, 0),
  ], [['a', 'b']]);
  assert.equal(computeDOF(joints, links, false, new Set()), 3);
  assert.equal(computeDOF(joints, links, false, new Set(['b'])), 1);
});

test('a free hidden brace makes collinear visible joints locally rigid', () => {
  const { joints, links } = graph([
    joint('a', -1, 0), joint('b', 0, 0), joint('c', 1, 0),
    joint('brace', 0, 1, { hidden: true }),
  ], [['a', 'b'], ['a', 'c'], ['b', 'c'], ['brace', 'a'], ['brace', 'b'], ['brace', 'c']]);
  assert.equal(computeDOF(joints, links, false), 3);
  joints.isolated = joint('isolated', 4, 5, { hidden: true });
  assert.equal(computeDOF(joints, links, false), 3);
});

test('a hidden fixed brace stays fixed even with an empty fixed set', () => {
  const { joints, links } = graph([
    joint('a', 1, 0), joint('brace', 0, 0, { hidden: true, type: 'fixed' }),
  ], [['a', 'brace']]);
  assert.equal(computeDOF(joints, links, false, new Set()), 1);
});

test('an incident free hidden joint contributes variables as well as link rank', () => {
  const { joints, links } = graph([
    joint('a', 1, 0), joint('brace', 0, 0, { hidden: true }),
  ], [['a', 'brace']]);
  assert.equal(computeDOF(joints, links, false), 3);
  assert.equal(computeDOF(joints, links, false, new Set(['brace'])), 1);
});

test('hidden joints without valid incident links add no variables', () => {
  const joints = { a: joint('a', 0, 0), hidden: joint('hidden', 1, 1, { hidden: true }) };
  const links: Record<string, Link> = {
    dangling: { id: 'dangling', jointIds: ['hidden', 'missing'], restLength: 1, mass: 1 },
    invalid: { id: 'invalid', jointIds: ['a', 'hidden'], restLength: NaN, mass: 1 },
    self: { id: 'self', jointIds: ['hidden', 'hidden'], restLength: 0, mass: 1 },
  };
  assert.equal(computeDOF(joints, links, false), 2);
});

test('free B on fixed AC has one rail-translation DOF, including endpoints', () => {
  for (const x of [0, 0.5, 2]) {
    const { joints, links } = graph([
      joint('a', 0, 0), joint('b', x, 0), joint('c', 2, 0),
    ], [['a', 'c']]);
    assert.equal(computeDOF(joints, links, false, new Set(['a', 'c']), slider), 1);
  }
});

test('moving rigid AC with fixed B has two DOF: slide and rotate about B', () => {
  for (const x of [0, 0.5, 2]) {
    const { joints, links } = graph([
      joint('a', 0, 0), joint('b', x, 0), joint('c', 2, 0),
    ], [['a', 'c']]);
    assert.equal(computeDOF(joints, links, false, new Set(['b']), slider), 2);
  }
});

test('slider gradients couple moving endpoints, rather than constraining only B', () => {
  const { joints, links } = graph([
    joint('a', 0, 0), joint('b', 1, 0), joint('c', 2, 0),
  ], [['a', 'c'], ['a', 'b']]);
  assert.equal(computeDOF(joints, links, false, new Set(['b', 'c']), slider), 0);
  assert.equal(computeDOF(joints, links, false, new Set(), slider), 3);
});

test('duplicate, fixed-only, and dangling slider rows add no spurious rank', () => {
  const { joints, links } = graph([
    joint('a', 0, 0), joint('b', 1, 0), joint('c', 2, 0),
  ], [['a', 'c']]);
  const sliders = {
    ...slider,
    duplicate: { ...slider.slider, id: 'duplicate' },
    dangling: { ...slider.slider, id: 'dangling', jointIdB: 'missing' },
  };
  assert.equal(computeDOF(joints, links, false, new Set(['a', 'c']), sliders), 1);
  joints.d = joint('d', 4, 5);
  assert.equal(computeDOF(joints, links, false, new Set(['a', 'b', 'c']), sliders), 2);
});

test('slider rows use actual geometry, not cached t, and tolerate off-rail poses', () => {
  const { joints, links } = graph([
    joint('a', 0, 0), joint('b', 0, 1), joint('c', 2, 0),
  ], [['a', 'c']]);
  const staleSlider = { slider: { ...slider.slider, t: NaN } };
  assert.equal(computeDOF(joints, links, false, new Set(['b', 'c']), staleSlider), 0);
});

test('rank is invariant under translation, rotation, and extreme uniform scale', () => {
  for (const scale of [1e-120, 1, 1e120]) {
    const transform = (id: string, x: number, y: number) => joint(
      id, scale * (7 + 0.6 * x - 0.8 * y), scale * (-3 + 0.8 * x + 0.6 * y),
    );
    const { joints, links } = graph([
      transform('a', 0, 0), transform('b', 0.5, 0), transform('c', 2, 0),
    ], [['a', 'c']]);
    assert.equal(computeDOF(joints, links, false, new Set(['a', 'c']), slider), 1);
    assert.equal(computeDOF(joints, links, false, new Set(['b']), slider), 2);
    const triangle = graph([
      transform('a', 0, 0), transform('b', 2, 0), transform('c', 1, 1),
    ], [['a', 'b'], ['a', 'c'], ['b', 'c']]);
    assert.equal(computeDOF(triangle.joints, triangle.links, false), 3);
  }
});

test('singular collinear distances report instantaneous, not finite-motion DOF', () => {
  const { joints, links } = graph([
    joint('a', -1, 0), joint('b', 0, 0), joint('c', 1, 0),
  ], [['a', 'b'], ['b', 'c'], ['a', 'c']]);
  // The transverse first-order flex is not a guaranteed finite mechanism motion.
  assert.equal(computeDOF(joints, links, false), 4);
});

test('degenerate and nonfinite constraints are ignored without inventing rank', () => {
  const { joints, links } = graph([
    joint('a', 0, 0), joint('b', 0, 0), joint('c', 0, 0),
  ], [['a', 'b']]);
  links.link0.restLength = 1; // Positive-rest distance has undefined direction here.
  assert.equal(computeDOF(joints, links, false, undefined, slider), 6);
  joints.c.position = { x: Infinity, y: 0 };
  links.dangling = { id: 'dangling', jointIds: ['a', 'missing'], restLength: 1, mass: 1 };
  links.negative = { id: 'negative', jointIds: ['a', 'b'], restLength: -1, mass: 1 };
  links.infinite = { id: 'infinite', jointIds: ['a', 'c'], restLength: Infinity, mass: 1 };
  assert.equal(computeDOF(joints, links, false, undefined, slider), 6);
});

test('repeated slider references cancel and do not create a spurious constraint', () => {
  const { joints, links } = graph([joint('a', 0, 0), joint('c', 1, 0)], [['a', 'c']]);
  const atA = { slider: { ...slider.slider, jointIdB: 'a', t: 0 } };
  assert.equal(computeDOF(joints, links, false, undefined, atA), 3);
});

test('DOF evaluation does not mutate the compiled graph or fixed set', () => {
  const { joints, links } = graph([
    joint('a', 0, 0), joint('b', 1, 0), joint('c', 2, 0),
  ], [['a', 'c']]);
  const fixed = new Set(['a', 'c']);
  const before = structuredClone({ joints, links, fixed, slider });
  computeDOF(joints, links, false, fixed, slider);
  assert.deepEqual({ joints, links, fixed, slider }, before);
});
