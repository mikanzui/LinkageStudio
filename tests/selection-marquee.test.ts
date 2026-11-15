import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { Body, CanvasImage, Joint, Link, MechanismState, Vec2 } from '../src/types';
import { selectInRegion, type SelectionRegion } from '../src/interaction/selection-marquee';

const p = (x: number, y: number): Vec2 => ({ x, y });
const joint = (id: string, x: number, y = 0): Joint => ({
  id, type: 'revolute', position: p(x, y), connectedLinkIds: [],
});
const body = (id: string, jointIds: string[] = []): Body => ({
  id, jointIds, name: id, color: '#f00', useOutlineCOM: false, showLinks: true,
});
const link = (id: string, a: string, b: string): Link => ({
  id, jointIds: [a, b], mass: 1, restLength: 10,
});
const graph = (): MechanismState => ({
  joints: {}, links: {}, bodies: { base: body('base') }, baseBodyId: 'base',
  outlines: {}, images: {}, sliders: {}, colliders: {}, tracers: {},
});
const box = (x1: number, y1: number, x2: number, y2: number): SelectionRegion => ({
  kind: 'box', start: p(x1, y1), end: p(x2, y2),
});
const square = (min: number, max: number): Vec2[] => [p(min, min), p(max, min), p(max, max), p(min, max)];
const image = (id: string, overrides: Partial<CanvasImage> = {}): CanvasImage => ({
  id, bodyId: 'base', src: '', position: p(0, 0), scale: 1, rotation: 0,
  opacity: 1, visible: true, naturalWidth: 10, naturalHeight: 10, ...overrides,
});
const selected = (g: MechanismState, r: SelectionRegion, excluded: string[] = []): string[] =>
  [...selectInRegion(g, r, new Set(excluded))].sort();
const regions: [string, SelectionRegion][] = [
  ['box', box(-1, -1, 1, 1)], ['lasso', { kind: 'lasso', points: square(-1, 1) }],
];

for (const [name, region] of regions) {
  test(`${name}: includes joints inside/on every boundary, not outside or hidden`, () => {
    const g = graph();
    g.joints = {
      inside: joint('inside', 0), left: joint('left', -1), right: joint('right', 1),
      top: joint('top', 0, 1), bottom: joint('bottom', 0, -1), corner: joint('corner', 1, 1),
      outside: joint('outside', 1 + 1e-8), hidden: { ...joint('hidden', 0), hidden: true },
    };
    assert.deepEqual(selected(g, region), ['bottom', 'corner', 'inside', 'left', 'right', 'top']);
  });

  test(`${name}: selects crossing, inside, collinear/tangent links but not misses`, () => {
    const g = graph();
    const cases: [string, Vec2, Vec2, boolean][] = [
      ['cross', p(-4, 0), p(4, 0), true], ['vertical', p(0, -4), p(0, 4), true],
      ['edge', p(-4, 1), p(4, 1), true], ['corner', p(-2, 0), p(0, 2), true],
      ['inside', p(-0.5, 0), p(0.5, 0), true], ['end', p(1, 0), p(4, 0), true],
      ['miss', p(-4, 2), p(4, 2), false], ['near', p(-4, 1 + 1e-8), p(4, 1 + 1e-8), false],
      ['diagonalMiss', p(0, 3), p(3, 0), false], ['extension', p(2, 0), p(4, 0), false],
    ];
    for (const [id, a, b] of cases) {
      g.joints[`${id}A`] = joint(`${id}A`, a.x, a.y);
      g.joints[`${id}B`] = joint(`${id}B`, b.x, b.y);
      g.links[id] = link(id, `${id}A`, `${id}B`);
    }
    g.bodies.arm = body('arm', Object.keys(g.joints));
    const result = selectInRegion(g, region, new Set());
    for (const [id, , , expected] of cases) assert.equal(result.has(id), expected, id);
  });

  test(`${name}: rail/barrier geometry is A-C, not slider B or collider targets`, () => {
    const g = graph();
    g.joints = { a: joint('a', -4), c: joint('c', 4), b: joint('b', 100),
      missA: joint('missA', -4, 3), missC: joint('missC', 4, 3), inside: joint('inside', 0) };
    g.sliders = {
      rail: { id: 'rail', jointIdA: 'a', jointIdB: 'b', jointIdC: 'c', t: 0.5 },
      missRail: { id: 'missRail', jointIdA: 'missA', jointIdB: 'inside', jointIdC: 'missC', t: 0.5 },
    };
    g.colliders = { barrier: { id: 'barrier', jointIdA: 'a', jointIdC: 'c', bodyIds: ['target'] } };
    g.bodies.railBody = body('railBody', ['a', 'c']);
    g.bodies.target = body('target', ['b']);
    assert.deepEqual(selected(g, region, ['target']), ['barrier', 'inside', 'rail']);
    assert.deepEqual(selected(g, region, ['railBody']), ['inside']);
  });

  test(`${name}: outline overlap includes edge crossing, either enclosure, not centroid-only`, () => {
    const g = graph();
    const shapes: Record<string, Vec2[]> = {
      enclosing: square(-10, 10), enclosed: square(-0.5, 0.5),
      crossing: [p(-4, 0.5), p(4, 0.5), p(4, 4), p(-4, 4)],
      tangent: [p(1, -3), p(3, -3), p(3, 3), p(1, 3)],
      segment: [p(-4, 0), p(4, 0)], miss: [p(2, -3), p(4, -3), p(4, 3), p(2, 3)],
    };
    for (const [id, points] of Object.entries(shapes)) {
      g.outlines[id] = { id, bodyId: 'base', name: id, visible: true, points };
    }
    assert.deepEqual(selected(g, region), ['crossing', 'enclosed', 'enclosing', 'segment', 'tangent']);
  });

  test(`${name}: image overlap uses bounds rather than center, including enclosure`, () => {
    const g = graph();
    g.images = {
      enclosing: image('enclosing'), enclosed: image('enclosed', { scale: 0.1 }),
      crossing: image('crossing', { position: p(4, 0), naturalWidth: 8, naturalHeight: 1 }),
      tangent: image('tangent', { position: p(6, 0) }),
      miss: image('miss', { position: p(6 + 1e-8, 0) }),
      hidden: image('hidden', { visible: false }),
    };
    assert.deepEqual(selected(g, region), ['crossing', 'enclosed', 'enclosing', 'tangent']);
  });

  test(`${name}: shared-joint exclusions prefer non-Base owners and leave unowned eligible`, () => {
    const g = graph();
    g.joints = { shared: joint('shared', 0), baseOnly: joint('baseOnly', 0),
      unowned: joint('unowned', 0), moving: joint('moving', 0) };
    g.bodies.base.jointIds = ['shared', 'baseOnly'];
    g.bodies.a = body('a', ['shared', 'moving']);
    g.bodies.b = body('b', ['shared']);
    assert.deepEqual(selected(g, region, ['base']), ['moving', 'shared', 'unowned']);
    assert.deepEqual(selected(g, region, ['a']), ['baseOnly', 'shared', 'unowned']);
    assert.deepEqual(selected(g, region, ['a', 'b']), ['baseOnly', 'unowned']);
    assert.deepEqual(selected(g, region, ['base', 'a']), ['shared', 'unowned']);
    assert.deepEqual(selected(g, region, ['base', 'a', 'b']), ['unowned']);
  });

  test(`${name}: Base-only attached objects and rails honor Base exclusion`, () => {
    const g = graph();
    g.joints = { a: joint('a', -4), c: joint('c', 4), b: joint('b', 8) };
    g.bodies.base.jointIds = ['a', 'c', 'b'];
    g.images.picture = image('picture');
    g.outlines.shape = { id: 'shape', bodyId: 'base', name: '', visible: true, points: square(-2, 2) };
    // Base centroid is (8/3,0), first-joint direction is -X, so +local X reaches world zero.
    g.tracers.trace = { id: 'trace', bodyId: 'base', enabled: true, localPosition: p(8 / 3, 0) };
    g.sliders.rail = { id: 'rail', jointIdA: 'a', jointIdB: 'b', jointIdC: 'c', t: 0.5 };
    g.colliders.barrier = { id: 'barrier', jointIdA: 'a', jointIdC: 'c', bodyIds: [] };
    assert.deepEqual(selected(g, region), ['barrier', 'picture', 'rail', 'shape', 'trace']);
    assert.deepEqual(selected(g, region, ['base']), []);
    g.bodies.arm = body('arm', ['a', 'c']);
    assert.deepEqual(selected(g, region, ['base']), ['barrier', 'rail']);
    assert.deepEqual(selected(g, region, ['arm']), ['picture', 'shape', 'trace']);
  });
}

test('box normalization is drag-direction independent and lasso winding/closing samples do not matter', () => {
  const g = graph();
  g.joints = { center: joint('center', 0), corner: joint('corner', 1, 1) };
  for (const r of [box(1, 1, -1, -1), box(-1, 1, 1, -1),
    { kind: 'lasso', points: [...square(-1, 1).reverse(), p(-1, 1), p(-1, 1)] } as SelectionRegion]) {
    assert.deepEqual(selected(g, r), ['center', 'corner']);
  }
});

test('concave lasso does not select its bounding-box notch or a segment wholly in the notch', () => {
  const g = graph();
  g.joints = { inside: joint('inside', 0.5, 3), notch: joint('notch', 3, 3),
    a: joint('a', 2, 2), b: joint('b', 3, 2), c: joint('c', -1, 0.5), d: joint('d', 5, 0.5) };
  g.links = { notchLink: link('notchLink', 'a', 'b'), crossing: link('crossing', 'c', 'd') };
  g.bodies.arm = body('arm', Object.keys(g.joints));
  g.images.notchImage = image('notchImage', { position: p(2.5, 2.5), scale: 0.1 });
  const r: SelectionRegion = { kind: 'lasso', points: [p(0, 0), p(4, 0), p(4, 1), p(1, 1), p(1, 4), p(0, 4)] };
  assert.deepEqual(selected(g, r), ['crossing', 'inside']);
});

test('outline and tracer use rotated/translated body-local geometry, not their raw local points', () => {
  const g = graph();
  // Centroid (10,20), first-joint direction +Y => 90-degree body rotation.
  g.joints = { a: joint('a', 10, 21), b: joint('b', 10, 19) };
  g.bodies.arm = body('arm', ['a', 'b']);
  g.outlines.shape = { id: 'shape', bodyId: 'arm', name: '', visible: true,
    points: [p(2, 0), p(4, 0), p(4, 1), p(2, 1)] };
  g.tracers.trace = { id: 'trace', bodyId: 'arm', enabled: true, localPosition: p(3, 0.5) };
  g.tracers.off = { ...g.tracers.trace, id: 'off', enabled: false };
  assert.deepEqual(selected(g, box(9.4, 22.9, 9.6, 23.1)), ['shape', 'trace']);
  assert.deepEqual(selected(g, { kind: 'lasso', points: [p(9.4, 22.9), p(9.6, 22.9), p(9.5, 23.2)] }), ['shape', 'trace']);
  assert.deepEqual(selected(g, box(2, 0, 4, 1)), []);
  assert.deepEqual(selected(g, box(9.4, 22.9, 9.6, 23.1), ['arm']), []);
  g.outlines.shape.visible = false;
  assert.deepEqual(selected(g, box(9.4, 22.9, 9.6, 23.1)), ['trace']);
});

test('rotated/scaled images use their oriented rectangle, not its AABB or owning body transform', () => {
  const g = graph();
  g.joints = { anchor: joint('anchor', 100, 100) };
  g.bodies.arm = body('arm', ['anchor']);
  g.images.photo = image('photo', { bodyId: 'arm', position: p(10, 20), naturalWidth: 8,
    naturalHeight: 2, scale: 2, rotation: Math.PI / 4 });
  // Long diagonal strip about (10,20), half-length 8 and half-width 2.
  for (const r of [box(14.8, 24.8, 15.2, 25.2),
    { kind: 'lasso', points: [p(14.8, 24.8), p(15.2, 24.8), p(15, 25.2)] } as SelectionRegion]) {
    assert.deepEqual(selected(g, r), ['photo']);
    assert.deepEqual(selected(g, r, ['arm']), []);
  }
  assert.deepEqual(selected(g, box(14.8, 14.8, 15.2, 15.2)), []);
  assert.deepEqual(selected(g, box(108, 118, 112, 122)), []);
  g.images.photo.rotation = Math.PI / 2;
  assert.deepEqual(selected(g, box(9.9, 27.9, 10.1, 28.1)), ['photo']);
  assert.deepEqual(selected(g, box(14.8, 19.8, 15.2, 20.2)), []);
});

test('links honor hidden braces, missing endpoints, Base-only ownership and per-body visibility', () => {
  const g = graph();
  g.joints = { a: joint('a', -4), b: joint('b', 4), hidden: { ...joint('hidden', 0), hidden: true } };
  g.bodies.base.jointIds = ['a', 'b'];
  g.links = { visible: link('visible', 'a', 'b'), brace: link('brace', 'a', 'hidden'), missing: link('missing', 'a', 'absent') };
  assert.deepEqual(selected(g, box(-1, -1, 1, 1)), []);
  g.bodies.arm = body('arm', ['a', 'b', 'hidden']);
  assert.deepEqual(selected(g, box(-1, -1, 1, 1)), ['visible']);
  g.bodies.arm.showLinks = false;
  assert.deepEqual(selected(g, box(-1, -1, 1, 1)), []);
});

test('segment ownership requires both endpoints; a shared endpoint does not give another body the edge', () => {
  const g = graph();
  g.joints = { a: joint('a', -4), b: joint('b', 4) };
  g.links.edge = link('edge', 'a', 'b');
  g.bodies.arm = body('arm', ['a', 'b']);
  g.bodies.neighbor = body('neighbor', ['a']);
  const r = box(-1, -1, 1, 1);
  assert.deepEqual(selected(g, r, ['arm']), []);
  g.bodies.neighbor.jointIds.push('b');
  assert.deepEqual(selected(g, r, ['arm']), ['edge']);
  assert.deepEqual(selected(g, r, ['arm', 'neighbor']), []);
});

test('invalid/degenerate regions fail closed rather than behaving as point/line selection', () => {
  const g = graph();
  g.joints.center = joint('center', 0);
  g.images.picture = image('picture');
  const invalid: SelectionRegion[] = [
    box(0, 0, 0, 1), box(0, 0, 1, 0), box(0, 0, 0, 0), box(NaN, 0, 1, 1),
    box(-Infinity, -1, 1, 1), box(-1e308, -1e308, 1e308, 1e308),
    ...[[], [p(0, 0)], [p(-1, 0), p(1, 0)], [p(-1, 0), p(0, 0), p(1, 0)],
      [p(0, 0), p(0, 0), p(0, 0)], [p(-1, -1), p(1, 1), p(-1, 1), p(1, -1)],
      [p(0, 0), p(4, 0), p(0, 3), p(3, 3), p(1, -1)],
      [p(0, 0), p(4, 0), p(2, 0), p(2, 2), p(0, 2)],
      [p(-1, -1), p(1, -1), p(Infinity, 1)],
    ].map((points): SelectionRegion => ({ kind: 'lasso', points })),
  ];
  for (const r of invalid) assert.deepEqual(selected(g, r), [], JSON.stringify(r));
});

test('invalid entity geometry is skipped independently without losing valid selections', () => {
  const g = graph();
  g.joints = { good: joint('good', 0), nan: joint('nan', NaN), inf: joint('inf', 0, Infinity),
    a: joint('a', -4), b: joint('b', 4), collapsed: joint('collapsed', -4) };
  g.bodies.arm = body('arm', ['a', 'b', 'collapsed', 'nan', 'inf']);
  g.links = { nanEdge: link('nanEdge', 'a', 'nan'), infEdge: link('infEdge', 'a', 'inf'),
    collapsedEdge: link('collapsedEdge', 'a', 'collapsed') };
  g.sliders.missing = { id: 'missing', jointIdA: 'absent', jointIdB: 'good', jointIdC: 'b', t: 0 };
  g.colliders.collapsed = { id: 'collapsedBarrier', jointIdA: 'a', jointIdC: 'collapsed', bodyIds: [] };
  g.outlines.nan = { id: 'nanOutline', bodyId: 'base', visible: true, name: '', points: [p(NaN, 0), ...square(-1, 1)] };
  g.outlines.line = { id: 'flatOutline', bodyId: 'base', visible: true, name: '', points: [p(-2, 0), p(0, 0), p(2, 0)] };
  g.outlines.missing = { id: 'missingBody', bodyId: 'absent', visible: true, name: '', points: square(-1, 1) };
  g.outlines.badFrame = { id: 'badFrame', bodyId: 'arm', visible: true, name: '', points: square(-1, 1) };
  g.tracers.nan = { id: 'nanTracer', bodyId: 'base', enabled: true, localPosition: p(NaN, 0) };
  for (const [i, overrides] of [
    { scale: 0 }, { scale: -1 }, { scale: Infinity }, { rotation: NaN },
    { naturalWidth: 0 }, { naturalHeight: -1 }, { naturalWidth: Infinity },
    { position: p(0, Infinity) }, { bodyId: 'absent' },
  ].entries()) g.images[`bad${i}`] = image(`bad${i}`, overrides);
  g.images.valid = image('valid');
  for (const [, r] of regions) assert.deepEqual(selected(g, r), ['good', 'valid']);
});

test('empty and single-joint body frames follow existing transform helpers', () => {
  const g = graph();
  g.bodies.single = body('single', ['a']);
  g.joints.a = joint('a', 10, 20);
  g.tracers.empty = { id: 'empty', bodyId: 'base', enabled: true, localPosition: p(0, 0) };
  g.tracers.single = { id: 'single', bodyId: 'single', enabled: true, localPosition: p(1, 2) };
  assert.deepEqual(selected(g, box(-1, -1, 1, 1)), ['empty']);
  assert.deepEqual(selected(g, box(10.9, 21.9, 11.1, 22.1)), ['single']);
  g.bodies.single.jointIds.push('missing');
  assert.deepEqual(selected(g, box(10.9, 21.9, 11.1, 22.1)), []);
});

function deepFreeze<T>(value: T): T {
  if (value !== null && typeof value === 'object') {
    Object.values(value).forEach(deepFreeze);
    Object.freeze(value);
  }
  return value;
}

test('selection is pure, repeatable, and returns an independent Set', () => {
  const g = graph();
  g.joints.a = joint('a', 0);
  g.images.photo = image('photo');
  g.outlines.shape = { id: 'shape', bodyId: 'base', name: '', visible: true, points: square(-2, 2) };
  const r: SelectionRegion = { kind: 'lasso', points: [...square(-1, 1), p(-1, -1)] };
  const input = deepFreeze({ g, r });
  const snapshot = structuredClone(input);
  const excluded: ReadonlySet<string> = new Set(['unused']);
  const result = selectInRegion(input.g, input.r, excluded);
  assert.deepEqual([...result].sort(), ['a', 'photo', 'shape']);
  result.clear();
  assert.deepEqual(selected(input.g, input.r), ['a', 'photo', 'shape']);
  assert.deepEqual(input, snapshot);
  assert.deepEqual([...excluded], ['unused']);
});
