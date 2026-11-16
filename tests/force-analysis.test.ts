import assert from 'node:assert/strict';
import test from 'node:test';
import type { Joint, Link, Vec2 } from '../src/types';
import { ForceAccumulator } from '../src/core/force-analysis';

function fixture() {
  const joints: Record<string, Joint> = {
    a: { id: 'a', type: 'fixed', position: { x: 0, y: 0 }, connectedLinkIds: ['ab'] },
    b: { id: 'b', type: 'revolute', position: { x: 0, y: 1 }, connectedLinkIds: ['ab'] },
  };
  const links: Record<string, Link> = {
    ab: { id: 'ab', jointIds: ['a', 'b'], restLength: 1, mass: 1 },
  };
  return { joints, links };
}

function make(h = 0.1, n = 1, fixed = new Set(['a']), reasons: string[] = []) {
  const { joints, links } = fixture();
  return new ForceAccumulator(joints, links, fixed, h, n, reasons);
}

function near(actual: number, expected: number) {
  assert.ok(Math.abs(actual - expected) <= 1e-10 * Math.max(1, Math.abs(expected)), `${actual} != ${expected}`);
}

function vec(actual: Vec2, x: number, y: number) {
  near(actual.x, x);
  near(actual.y, y);
}

// Deliberately bypass the public readonly vector type to test runtime isolation.
function mutableVector(value: Vec2): { x: number; y: number } {
  return value as { x: number; y: number };
}

for (const passes of [1, 3, 6, 12]) {
  test(`unit gravity support balances 250 over ${passes} passes and all substeps`, () => {
    const h = 1 / 120;
    const n = 4;
    const accumulator = make(h, n);
    for (let step = 0; step < n; step++) {
      for (let pass = 0; pass < passes; pass++) {
        accumulator.addDistance('ab', { x: 0, y: pass === 0 ? 250 * h * h : 0 }, { x: 0, y: 1 });
      }
      accumulator.addApplied('b', { x: 0, y: 250 });
    }
    const result = accumulator.finish(new Map());
    near(result.linkForces.get('ab')!.axialForce!, 250);
    vec(result.linkForces.get('ab')!.forceAtA, 0, 250);
    vec(result.linkForces.get('ab')!.forceAtB, 0, -250);
    vec(result.jointReactions.get('a')!.reactionForce, 0, -250);
    vec(result.jointReactions.get('b')!.reactionForce, 0, -250);
    vec(result.jointReactions.get('b')!.appliedForce, 0, 250);
    near(result.maxLinkForce, 250);
    near(result.maxJointReaction, 250);
  });
}

test('reversing endpoint orientation preserves tensile sign and support balance', () => {
  const { joints, links } = fixture();
  links.ab.jointIds = ['b', 'a'];
  const accumulator = new ForceAccumulator(joints, links, new Set(['a']), 0.1, 1);
  accumulator.addDistance('ab', { x: 0, y: -2.5 }, { x: 0, y: -1 });
  const result = accumulator.finish(new Map());
  near(result.linkForces.get('ab')!.axialForce!, 250);
  vec(result.jointReactions.get('a')!.reactionForce, 0, -250);
});

test('compression is negative while maxima use absolute axial magnitude', () => {
  const accumulator = make();
  accumulator.addDistance('ab', { x: 0, y: -2 }, { x: 0, y: 1 });
  const result = accumulator.finish(new Map());
  near(result.linkForces.get('ab')!.axialForce!, -200);
  near(result.maxLinkForce, 200);
});

test('free/free constraint forces sum to zero independently of applied loads', () => {
  const accumulator = make(1, 1, new Set());
  accumulator.addDistance('ab', { x: 3, y: 4 }, { x: 0, y: 1 });
  accumulator.addApplied('a', { x: 10, y: 20 });
  const result = accumulator.finish(new Map());
  const a = result.jointReactions.get('a')!;
  const b = result.jointReactions.get('b')!;
  assert.equal(a.kind, 'constraint');
  vec(a.reactionForce, 3, 4);
  vec(b.reactionForce, -3, -4);
  vec({ x: a.reactionForce.x + b.reactionForce.x, y: a.reactionForce.y + b.reactionForce.y }, 0, 0);
});

test('fixed spring loads average actual applied forces by substeps only', () => {
  const accumulator = make(0.01, 2);
  accumulator.addApplied('a', { x: 6, y: 8 });
  accumulator.addApplied('a', { x: 10, y: 12 });
  const result = accumulator.finish(new Map());
  vec(result.jointReactions.get('a')!.appliedForce, 8, 10);
  vec(result.jointReactions.get('a')!.reactionForce, -8, -10);
});

test('support balances both constraint and applied loads with signed contributions', () => {
  const accumulator = make(1);
  accumulator.addDistance('ab', { x: 3, y: 4 }, { x: 0, y: 1 });
  accumulator.addApplied('a', { x: 5, y: 6 });
  const result = accumulator.finish(new Map());
  const support = result.jointReactions.get('a')!;
  assert.equal(support.kind, 'support');
  vec(support.reactionForce, -8, -10);
  vec(support.contributions[0].force, -3, -4);
  vec(result.jointReactions.get('b')!.contributions[0].force, -3, -4);
});

test('all nonzero passes and substeps contribute to the frame average', () => {
  const accumulator = make(0.5, 2);
  for (const y of [1, 2, 3, 4, 0]) {
    accumulator.addDistance('ab', { x: 0, y }, { x: 0, y: 1 });
  }
  near(accumulator.finish(new Map()).linkForces.get('ab')!.axialForce!, 20);
});

test('axial force sums each instantaneous projection rather than a final direction', () => {
  const accumulator = make(1);
  accumulator.addDistance('ab', { x: 2, y: 0 }, { x: 1, y: 0 });
  accumulator.addDistance('ab', { x: 0, y: 3 }, { x: 0, y: 1 });
  const link = accumulator.finish(new Map()).linkForces.get('ab')!;
  near(link.axialForce!, 5);
  vec(link.forceAtA, 2, 3);
});

test('zero-rest links keep vector balance but no axial value or axial maximum', () => {
  const { joints, links } = fixture();
  links.ab.restLength = 0;
  const accumulator = new ForceAccumulator(joints, links, new Set(['a']), 1, 1);
  accumulator.addDistance('ab', { x: 7, y: 0 }, { x: 1, y: 0 });
  const result = accumulator.finish(new Map());
  assert.equal(result.linkForces.get('ab')!.axialForce, null);
  assert.equal(result.maxLinkForce, 0);
  vec(result.jointReactions.get('a')!.reactionForce, -7, 0);
  near(result.maxJointReaction, 7);
});

test('includes untouched links and isolated joints with zero samples', () => {
  const { joints, links } = fixture();
  joints.c = { id: 'c', type: 'revolute', position: { x: 2, y: 2 }, connectedLinkIds: [] };
  const result = new ForceAccumulator(joints, links, new Set(), 1, 1).finish(new Map());
  assert.equal(result.linkForces.size, 1);
  assert.equal(result.jointReactions.size, 3);
  assert.equal(result.linkForces.get('ab')!.axialForce, 0);
  assert.deepEqual(result.jointReactions.get('c')!.contributions, []);
  assert.equal(result.maxLinkForce, 0);
  assert.equal(result.maxJointReaction, 0);
  assert.equal(result.units, 'model');
  assert.equal(result.complete, true);
  assert.deepEqual(result.limitations, []);
});

test('contact incompleteness is explicit and reasons are copied at both boundaries', () => {
  const reasons = ['Contact impulses unavailable'];
  const accumulator = make(1, 1, new Set(), reasons);
  reasons[0] = 'mutated';
  const result = accumulator.finish(new Map());
  assert.equal(result.complete, false);
  assert.deepEqual(result.limitations, ['Contact impulses unavailable']);
  result.limitations.length = 0;
  assert.deepEqual(accumulator.finish(new Map()).limitations, ['Contact impulses unavailable']);
});

test('constructor rejects invalid timestep and substep ranges and derived scales', () => {
  for (const h of [0, -1, NaN, Infinity, Number.MIN_VALUE, Number.MAX_VALUE]) {
    assert.throws(() => make(h));
  }
  for (const n of [0, -1, 1.5, NaN, Infinity, Number.MAX_SAFE_INTEGER + 1]) {
    assert.throws(() => make(1, n));
  }
});

test('constructor rejects missing references and mismatched identifiers', () => {
  const { joints, links } = fixture();
  assert.throws(() => new ForceAccumulator(joints, links, new Set(['missing']), 1, 1));
  links.ab.jointIds[1] = 'missing';
  assert.throws(() => new ForceAccumulator(joints, links, new Set(), 1, 1));
  links.ab.jointIds[1] = 'b';
  assert.throws(() => new ForceAccumulator(joints, { wrong: links.ab }, new Set(), 1, 1));
  assert.throws(() => new ForceAccumulator({ wrong: joints.a }, {}, new Set(), 1, 1));
});

test('constructor rejects nonfinite geometry, loads, mass and negative lengths', () => {
  for (const change of [
    (j: Record<string, Joint>, _l: Record<string, Link>) => { mutableVector(j.a.position).x = NaN; },
    (j: Record<string, Joint>, _l: Record<string, Link>) => { j.a.mass = Infinity; },
    (j: Record<string, Joint>, _l: Record<string, Link>) => { j.a.externalForce = { x: 0, y: Infinity }; },
    (_j: Record<string, Joint>, l: Record<string, Link>) => { l.ab.restLength = -1; },
    (_j: Record<string, Joint>, l: Record<string, Link>) => { l.ab.restLength = Infinity; },
    (_j: Record<string, Joint>, l: Record<string, Link>) => { l.ab.mass = NaN; },
  ]) {
    const { joints, links } = fixture();
    change(joints, links);
    assert.throws(() => new ForceAccumulator(joints, links, new Set(), 1, 1));
  }
  assert.throws(() => make(1, 1, new Set(), [42 as unknown as string]));
});

test('sample methods reject missing references, nonfinite vectors and nonunit directions', () => {
  const accumulator = make(1);
  assert.throws(() => accumulator.addDistance('missing', { x: 0, y: 0 }, { x: 1, y: 0 }));
  assert.throws(() => accumulator.addApplied('missing', { x: 0, y: 0 }));
  for (const value of [NaN, Infinity, -Infinity]) {
    assert.throws(() => accumulator.addDistance('ab', { x: value, y: 0 }, { x: 1, y: 0 }));
    assert.throws(() => accumulator.addDistance('ab', { x: 0, y: 0 }, { x: value, y: 0 }));
    assert.throws(() => accumulator.addApplied('a', { x: 0, y: value }));
  }
  for (const x of [0, 0.99, 1.01]) {
    assert.throws(() => accumulator.addDistance('ab', { x: 0, y: 0 }, { x, y: 0 }));
  }
  accumulator.addDistance('ab', { x: 0, y: 0 }, { x: 1 + 0.5e-6, y: 0 });
  assert.equal(accumulator.finish(new Map()).maxLinkForce, 0);
});

test('scaled force overflow is rejected without retaining the invalid sample', () => {
  const accumulator = make(0.1);
  assert.throws(() => accumulator.addDistance('ab', { x: 1e308, y: 0 }, { x: 1, y: 0 }));
  assert.equal(accumulator.finish(new Map()).maxLinkForce, 0);
  accumulator.addDistance('ab', { x: 1, y: 0 }, { x: 1, y: 0 });
  near(accumulator.finish(new Map()).maxLinkForce, 100);
});

test('accumulated correction and applied overflow reject atomically', () => {
  const accumulator = make(1);
  accumulator.addDistance('ab', { x: 1e308, y: 0 }, { x: 1, y: 0 });
  assert.throws(() => accumulator.addDistance('ab', { x: 1e308, y: 0 }, { x: 1, y: 0 }));
  accumulator.addApplied('b', { x: 1e308, y: 0 });
  assert.throws(() => accumulator.addApplied('b', { x: 1e308, y: 0 }));
  const result = accumulator.finish(new Map());
  near(result.maxLinkForce, 1e308);
  vec(result.jointReactions.get('b')!.appliedForce, 1e308, 0);
});

test('finish rejects overflow in combined support loads and reaction magnitudes', () => {
  const accumulator = make(1);
  accumulator.addDistance('ab', { x: 1e308, y: 0 }, { x: 1, y: 0 });
  accumulator.addApplied('a', { x: 1e308, y: 0 });
  assert.throws(() => accumulator.finish(new Map()));
  const magnitude = make(1);
  magnitude.addApplied('a', { x: 1.3e308, y: 1.3e308 });
  assert.throws(() => magnitude.finish(new Map()));
});

test('finish validates supplied positions and uses finite constructor-position fallbacks', () => {
  const accumulator = make(1);
  assert.doesNotThrow(() => accumulator.finish(new Map([['a', { x: 2, y: 3 }]])));
  assert.doesNotThrow(() => accumulator.finish(new Map()));
  assert.throws(() => accumulator.finish(new Map([['a', { x: Infinity, y: 0 }]])));
  assert.throws(() => accumulator.finish(new Map([['missing', { x: 0, y: 0 }]])));
});

test('constructor and sample inputs are never retained as aliases or mutated', () => {
  const { joints, links } = fixture();
  const fixed = new Set(['a']);
  const original = structuredClone({ joints, links });
  const accumulator = new ForceAccumulator(joints, links, fixed, 1, 1);
  const correction = { x: 0, y: 5 };
  const direction = { x: 0, y: 1 };
  const applied = { x: 2, y: 3 };
  accumulator.addDistance('ab', correction, direction);
  accumulator.addApplied('a', applied);
  accumulator.finish(new Map());
  assert.deepEqual({ joints, links }, original);
  assert.deepEqual(correction, { x: 0, y: 5 });
  assert.deepEqual(applied, { x: 2, y: 3 });
  mutableVector(joints.a.position).x = Infinity;
  links.ab.jointIds[0] = 'missing';
  links.ab.restLength = 0;
  fixed.clear();
  correction.y = 999;
  direction.y = 0;
  applied.x = 999;
  const result = accumulator.finish(new Map());
  assert.equal(result.linkForces.get('ab')!.axialForce, 5);
  vec(result.jointReactions.get('a')!.reactionForce, -2, -8);
});

test('results are deeply detached from internal state and from sibling output vectors', () => {
  const accumulator = make(1);
  accumulator.addDistance('ab', { x: 0, y: 5 }, { x: 0, y: 1 });
  accumulator.addApplied('a', { x: 2, y: 0 });
  const result = accumulator.finish(new Map());
  const expected = structuredClone(result);
  mutableVector(result.linkForces.get('ab')!.forceAtA).y = 999;
  vec(result.jointReactions.get('a')!.contributions[0].force, 0, -5);
  mutableVector(result.linkForces.get('ab')!.forceAtB).y = 999;
  result.linkForces.get('ab')!.axialForce = 999;
  const reaction = result.jointReactions.get('a')!;
  mutableVector(reaction.reactionForce).x = 999;
  mutableVector(reaction.appliedForce).x = 999;
  mutableVector(reaction.contributions[0].force).y = 999;
  reaction.contributions.length = 0;
  result.linkForces.clear();
  result.jointReactions.clear();
  assert.deepEqual(accumulator.finish(new Map()), expected);
});

test('repeated finish is observational and later accumulation does not alter old results', () => {
  const accumulator = make(1);
  accumulator.addDistance('ab', { x: 0, y: 2 }, { x: 0, y: 1 });
  const first = accumulator.finish(new Map());
  assert.deepEqual(accumulator.finish(new Map()), first);
  accumulator.addDistance('ab', { x: 0, y: 3 }, { x: 0, y: 1 });
  assert.equal(first.linkForces.get('ab')!.axialForce, 2);
  assert.equal(accumulator.finish(new Map()).linkForces.get('ab')!.axialForce, 5);
  assert.equal(make(1).finish(new Map()).maxLinkForce, 0);
});

test('multiple link contributions sum at a joint without losing per-link identity', () => {
  const { joints, links } = fixture();
  joints.c = { id: 'c', type: 'revolute', position: { x: 1, y: 0 }, connectedLinkIds: ['ac'] };
  links.ac = { id: 'ac', jointIds: ['a', 'c'], restLength: 1, mass: 1 };
  const accumulator = new ForceAccumulator(joints, links, new Set(['a']), 1, 1);
  accumulator.addDistance('ab', { x: 0, y: 4 }, { x: 0, y: 1 });
  accumulator.addDistance('ac', { x: 3, y: 0 }, { x: 1, y: 0 });
  const result = accumulator.finish(new Map());
  const support = result.jointReactions.get('a')!;
  vec(support.reactionForce, -3, -4);
  assert.deepEqual(support.contributions.map(entry => entry.linkId), ['ab', 'ac']);
  near(result.maxJointReaction, 5);
  near(result.maxLinkForce, 4);
});
