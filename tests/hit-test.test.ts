import assert from 'node:assert/strict';
import { beforeEach, test } from 'node:test';
import type { Body, Joint, Link, Outline, Vec2 } from '../src/types';
import {
  hitTest, hitTestAny, hitTestJoint, hitTestLink, hitTestOutline,
  hitTestOutlineFilled, resetHitTesting,
} from '../src/interaction/hit-test';

const joint = (id: string, x: number, y = 0): Joint => ({
  id, type: 'revolute', position: { x, y }, connectedLinkIds: [],
});
const link = (id: string, a: string, b: string): Link => ({
  id, jointIds: [a, b], restLength: 100, mass: 1,
});
const origin: Vec2 = { x: 0, y: 0 };
const cluster = () => ({ a: joint('a', 0), b: joint('b', 1), c: joint('c', 2) });
const body: Body = {
  id: 'arm', name: 'Arm', color: '#f00', jointIds: [], useOutlineCOM: false, showLinks: true,
};
const outline: Outline = {
  id: 'shape', bodyId: body.id, name: 'Shape', visible: true,
  points: [{ x: 0, y: 0 }, { x: 100, y: 0 }, { x: 100, y: 100 }, { x: 0, y: 100 }],
};

beforeEach(resetHitTesting);

test('hover always selects the nearest joint without cycling', () => {
  const joints = { b: joint('b', 1), a: joint('a', 0), c: joint('c', -1) };
  for (let i = 0; i < 8; i++) {
    assert.equal(hitTestJoint({ x: 0, y: 0 }, joints, 1)?.id, 'a');
  }
});

test('explicit clicks cycle every overlapping joint in distance then ID order', () => {
  const joints = { c: joint('c', 2), b: joint('b', 1), z: joint('z', 0), a: joint('a', -1) };
  assert.deepEqual(Array.from({ length: 9 }, () => hitTestJoint(origin, joints, 1, true)?.id),
    ['z', 'a', 'b', 'c', 'z', 'a', 'b', 'c', 'z']);
});

test('hover, hover misses, and boolean classification never alter click state', () => {
  const joints = cluster();
  assert.equal(hitTestJoint(origin, joints, 1, true)?.id, 'a');
  for (let i = 0; i < 8; i++) {
    assert.equal(hitTestJoint(origin, joints, 1)?.id, 'a');
    assert.equal(hitTest(origin, joints, {}, 1)?.item.id, 'a');
    assert.equal(hitTestJoint({ x: 100, y: 100 }, joints, 1), null);
    assert.equal(hitTestAny(origin, joints, {}, 1), true);
    assert.equal(hitTestAny({ x: 100, y: 100 }, joints, {}, 1), false);
    assert.equal(hitTestJoint(origin, joints, 0), null);
  }
  assert.equal(hitTestJoint(origin, joints, 1, true)?.id, 'b');
  assert.equal(hitTestJoint(origin, joints, 1)?.id, 'a');
  assert.equal(hitTestJoint(origin, joints, 1, true)?.id, 'c');
});

test('removing or adding a cluster member restarts at nearest even when last ID remains', () => {
  const joints = cluster();
  hitTestJoint(origin, joints, 1, true);
  assert.equal(hitTestJoint(origin, joints, 1, true)?.id, 'b');
  const smaller = { a: joints.a, b: joints.b };
  assert.equal(hitTestJoint(origin, smaller, 1, true)?.id, 'a');
  assert.equal(hitTestJoint(origin, smaller, 1, true)?.id, 'b');
  assert.equal(hitTestJoint(origin, joints, 1, true)?.id, 'a');
});

test('cluster membership is independent of source record insertion order', () => {
  const joints = cluster();
  hitTestJoint(origin, joints, 1, true);
  assert.equal(hitTestJoint(origin, { c: joints.c, b: joints.b, a: joints.a }, 1, true)?.id, 'b');
});

test('pointer movement over four CSS pixels restarts, including accumulated drift', () => {
  for (const zoom of [0.5, 1, 4]) {
    resetHitTesting();
    const joints = { a: joint('a', 0), b: joint('b', 1 / zoom) };
    assert.equal(hitTestJoint(origin, joints, zoom, true)?.id, 'a');
    assert.equal(hitTestJoint(origin, joints, zoom, true)?.id, 'b');
    assert.equal(hitTestJoint({ x: -3.9 / zoom, y: 0 }, joints, zoom, true)?.id, 'a');
    assert.equal(hitTestJoint({ x: -4.1 / zoom, y: 0 }, joints, zoom, true)?.id, 'a');
  }
});

test('long pauses restart nearest and hover cannot extend the click timeout', (t) => {
  let now = 100;
  t.mock.method(performance, 'now', () => now);
  const joints = cluster();
  assert.equal(hitTestJoint(origin, joints, 1, true)?.id, 'a');
  now = 1100;
  assert.equal(hitTestJoint(origin, joints, 1, true)?.id, 'b');
  now = 2000;
  hitTestJoint(origin, joints, 1);
  now = 2101;
  assert.equal(hitTestJoint(origin, joints, 1, true)?.id, 'a');
});

test('explicit misses and invalid clicks clear the cycle', () => {
  const joints = cluster();
  for (const [point, zoom] of [[{ x: 100, y: 100 }, 1], [origin, 0], [{ x: NaN, y: 0 }, 1]] as const) {
    hitTestJoint(origin, joints, 1, true);
    assert.equal(hitTestJoint(origin, joints, 1, true)?.id, 'b');
    assert.equal(hitTestJoint(point, joints, zoom, true), null);
    assert.equal(hitTestJoint(origin, joints, 1, true)?.id, 'a');
    resetHitTesting();
  }
});

test('reset makes replacement/imported documents with reused IDs start nearest', () => {
  const joints = cluster();
  hitTestJoint(origin, joints, 1, true);
  assert.equal(hitTestJoint(origin, joints, 1, true)?.id, 'b');
  const imported = structuredClone(joints);
  resetHitTesting();
  resetHitTesting();
  assert.equal(hitTestJoint(origin, imported, 1, true)?.id, 'a');
  assert.equal(hitTestJoint(origin, imported, 1, true)?.id, 'b');
});

test('generic hit test forwards explicit cycling but defaults to nearest', () => {
  const joints = cluster();
  assert.equal(hitTest(origin, joints, {}, 1, true)?.item.id, 'a');
  assert.equal(hitTest(origin, joints, {}, 1)?.item.id, 'a');
  assert.equal(hitTest(origin, joints, {}, 1, true)?.item.id, 'b');
  assert.equal(hitTest({ x: 100, y: 100 }, joints, {}, 1, true), null);
  assert.equal(hitTest(origin, joints, {}, 1, true)?.item.id, 'a');
});

test('joints retain priority over ordinary links and nearest links remain pickable', () => {
  const joints = { a: joint('a', 0), b: joint('b', 100), c: joint('c', 0, 4), d: joint('d', 100, 4) };
  const links = { farther: link('farther', 'c', 'd'), arm: link('arm', 'a', 'b') };
  assert.deepEqual(hitTest(origin, joints, links, 1), { type: 'joint', item: joints.a });
  const midpoint = { x: 50, y: 1 };
  assert.equal(hitTestLink(midpoint, links, joints, 1)?.id, 'arm');
  assert.deepEqual(hitTest(midpoint, joints, links, 1), { type: 'link', item: links.arm });
  assert.equal(hitTestAny(midpoint, joints, links, 1), true);
  assert.equal(hitTestAny({ x: 50, y: 30 }, joints, links, 1), false);
});

test('hidden brace joints and links with hidden or missing endpoints are excluded', () => {
  const joints = { hidden: { ...joint('hidden', 0), hidden: true }, far: joint('far', 100) };
  const links = { brace: link('brace', 'hidden', 'far'), missing: link('missing', 'absent', 'far') };
  assert.equal(hitTestJoint(origin, joints, 1, true), null);
  for (const point of [origin, { x: 50, y: 0 }]) {
    assert.equal(hitTestLink(point, links, joints, 1), null);
    assert.equal(hitTest(point, joints, links, 1, true), null);
    assert.equal(hitTestAny(point, joints, links, 1), false);
  }
  const visible = { ...joints, a: joint('a', 1), b: joint('b', 2) };
  assert.deepEqual(Array.from({ length: 3 }, () => hitTestJoint(origin, visible, 1, true)?.id), ['a', 'b', 'a']);
});

test('visible outline edge and filled-region behavior is preserved', () => {
  const bodies = { arm: body };
  const outlines = { shape: outline };
  assert.equal(hitTestOutline({ x: 50, y: 2 }, outlines, bodies, {}, 1), outline);
  assert.equal(hitTestOutline({ x: 50, y: 50 }, outlines, bodies, {}, 1), null);
  assert.equal(hitTestOutlineFilled({ x: 50, y: 50 }, outlines, bodies, {}, 'base'), outline);
  assert.equal(hitTestOutlineFilled({ x: 50, y: 50 }, outlines, bodies, {}, 'arm'), null);
  const invisible = { shape: { ...outline, visible: false } };
  assert.equal(hitTestOutline({ x: 50, y: 2 }, invisible, bodies, {}, 1), null);
  assert.equal(hitTestOutlineFilled({ x: 50, y: 50 }, invisible, bodies, {}, 'base'), null);
  const overlapping = { ...outlines, other: { ...outline, id: 'other', bodyId: 'other' } };
  assert.equal(hitTestOutlineFilled({ x: 50, y: 50 }, overlapping,
    { ...bodies, other: { ...body, id: 'other' } }, {}, 'base'), null);
});

test('invalid zooms and pointer coordinates fail closed across picking APIs', () => {
  const joints = cluster(), links = { arm: link('arm', 'a', 'b') };
  const queries = [
    ...[0, -1, NaN, Infinity, -Infinity].map((zoom) => ({ point: origin, zoom })),
    ...[NaN, Infinity, -Infinity].flatMap((value) => [
      { point: { x: value, y: 0 }, zoom: 1 }, { point: { x: 0, y: value }, zoom: 1 },
    ]),
  ];
  for (const { point, zoom } of queries) {
    assert.equal(hitTestJoint(point, joints, zoom), null);
    assert.equal(hitTestLink(point, links, joints, zoom), null);
    assert.equal(hitTestAny(point, joints, links, zoom), false);
    assert.equal(hitTest(point, joints, links, zoom), null);
    assert.equal(hitTestOutline(point, { shape: outline }, { arm: body }, {}, zoom), null);
    if (!Number.isFinite(point.x) || !Number.isFinite(point.y)) {
      assert.equal(hitTestOutlineFilled(point, { shape: outline }, { arm: body }, {}, 'base'), null);
    }
  }
});

test('nonfinite geometry is not pickable and hit radii remain CSS-space bounded', () => {
  const joints = { a: joint('a', NaN), b: joint('b', Infinity) };
  const links = { arm: link('arm', 'a', 'b') };
  assert.equal(hitTestAny(origin, joints, links, 1), false);
  assert.equal(hitTestJoint(origin, joints, 1, true), null);
  assert.equal(hitTestLink(origin, links, joints, 1), null);
  const invalid = { shape: { ...outline, points: [{ x: NaN, y: 0 }, ...outline.points] } };
  assert.equal(hitTestOutline(origin, invalid, { arm: body }, {}, 1), null);
  assert.equal(hitTestOutlineFilled({ x: 50, y: 50 }, invalid, { arm: body }, {}, 'base'), null);
  for (const zoom of [0.5, 1, 4]) {
    const visible = { a: joint('a', 0) };
    assert.equal(hitTestJoint({ x: 11.9 / zoom, y: 0 }, visible, zoom)?.id, 'a');
    assert.equal(hitTestJoint({ x: 12 / zoom, y: 0 }, visible, zoom), null);
  }
});

function deepFreeze<T>(value: T): T {
  if (value !== null && typeof value === 'object') {
    Object.values(value).forEach(deepFreeze);
    Object.freeze(value);
  }
  return value;
}

test('picking never mutates the source graph or caller pointer', () => {
  const source = deepFreeze({
    joints: cluster(), links: { arm: link('arm', 'a', 'b') },
    bodies: { arm: body }, outlines: { shape: outline }, point: { x: 0, y: 0 },
  });
  const snapshot = structuredClone(source);
  for (let i = 0; i < 4; i++) {
    hitTestJoint(source.point, source.joints, 1, true);
    hitTest(source.point, source.joints, source.links, 1, true);
    hitTestAny(source.point, source.joints, source.links, 1);
    hitTestLink(source.point, source.links, source.joints, 1);
    hitTestOutline(source.point, source.outlines, source.bodies, source.joints, 1);
    hitTestOutlineFilled(source.point, source.outlines, source.bodies, source.joints, 'base');
  }
  resetHitTesting();
  assert.deepEqual(source, snapshot);
});

test('cycle origin is copied rather than retaining the caller mutable pointer', () => {
  const joints = cluster(), point = { x: 0, y: 0 };
  hitTestJoint(point, joints, 1, true);
  point.x = -5;
  assert.equal(hitTestJoint(point, joints, 1, true)?.id, 'a');
});
