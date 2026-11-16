import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { CanvasImage, MechanismState } from '../src/types/mechanism';
import type { Vec2 } from '../src/types/geometry';
import { mirrorGeometry } from '../src/core/mirror-geometry';
import { computeBodyTransform, localToWorld } from '../src/core/body-transform';

type ImageWithFlip = CanvasImage & { flipX?: boolean };

function fixture(): MechanismState {
  return {
    joints: {
      a: { id: 'a', type: 'revolute', position: { x: 2, y: 2 }, connectedLinkIds: ['ab', 'brace'] },
      b: { id: 'b', type: 'revolute', position: { x: 6, y: 2 }, connectedLinkIds: ['ab', 'bc'] },
      c: { id: 'c', type: 'revolute', position: { x: 6, y: 6 }, connectedLinkIds: ['bc'] },
      o: { id: 'o', type: 'fixed', position: { x: 0, y: 0 }, connectedLinkIds: [] },
      u: { id: 'u', type: 'revolute', position: { x: 20, y: 10 }, connectedLinkIds: ['uv'] },
      v: { id: 'v', type: 'revolute', position: { x: 30, y: 10 }, connectedLinkIds: ['uv'] },
      h: { id: 'h', type: 'revolute', position: { x: 3, y: 4 }, connectedLinkIds: ['brace'], hidden: true },
    },
    links: {
      ab: { id: 'ab', jointIds: ['a', 'b'], restLength: 4, mass: 2 },
      bc: { id: 'bc', jointIds: ['b', 'c'], restLength: 4, mass: 3 },
      uv: { id: 'uv', jointIds: ['u', 'v'], restLength: 10, mass: 4 },
      brace: { id: 'brace', jointIds: ['a', 'h'], restLength: Math.sqrt(5), mass: 1 },
    },
    bodies: {
      base: { id: 'base', name: 'Base', color: '#ff0000', jointIds: ['o'], useOutlineCOM: false, showLinks: true },
      arm: { id: 'arm', name: 'Arm', color: '#00ff00', jointIds: ['a', 'b'], useOutlineCOM: true, showLinks: true },
      shared: { id: 'shared', name: 'Shared', color: '#0000ff', jointIds: ['a', 'o'], useOutlineCOM: false, showLinks: true },
      other: { id: 'other', name: 'Other', color: '#999999', jointIds: ['u', 'v'], useOutlineCOM: false, showLinks: true },
    },
    baseBodyId: 'base',
    outlines: {
      shape: { id: 'shape', bodyId: 'arm', name: 'Shape', visible: true, points: [{ x: 1, y: 2 }, { x: 3, y: 4 }, { x: -2, y: 1 }] },
    },
    images: {
      pic: { id: 'pic', bodyId: 'arm', src: 'data:image/png;base64,asymmetric', position: { x: 4, y: 2 }, scale: 1.5, rotation: 0.37, opacity: 0.7, visible: true, naturalWidth: 8, naturalHeight: 4 },
    },
    sliders: { rail: { id: 'rail', jointIdA: 'a', jointIdB: 'b', jointIdC: 'c', t: 0.5 } },
    colliders: { barrier: { id: 'barrier', jointIdA: 'a', jointIdC: 'c', bodyIds: ['arm', 'other'] } },
    tracers: { pen: { id: 'pen', bodyId: 'arm', localPosition: { x: 2, y: 3 }, enabled: true } },
  };
}

function ids(prefix = 'new'): () => string {
  let n = 0;
  return () => `${prefix}${++n}`;
}

function freeze<T>(value: T): T {
  if (value !== null && typeof value === 'object' && !Object.isFrozen(value)) {
    for (const child of Object.values(value)) freeze(child);
    Object.freeze(value);
  }
  return value;
}

function close(actual: Vec2, expected: Vec2): void {
  assert(Math.abs(actual.x - expected.x) < 1e-10, `x: ${actual.x} != ${expected.x}`);
  assert(Math.abs(actual.y - expected.y) < 1e-10, `y: ${actual.y} != ${expected.y}`);
}

function outlineWorld(graph: MechanismState, id: string): Vec2[] {
  const outline = graph.outlines[id];
  const transform = computeBodyTransform(graph.bodies[outline.bodyId], graph.joints);
  return outline.points.map(p => localToWorld(p, transform));
}

function tracerWorld(graph: MechanismState, id: string): Vec2 {
  const tracer = graph.tracers[id];
  return localToWorld(tracer.localPosition, computeBodyTransform(graph.bodies[tracer.bodyId], graph.joints));
}

function connectionsAreExact(graph: MechanismState): void {
  for (const joint of Object.values(graph.joints)) {
    const expected = Object.values(graph.links).filter(link => link.jointIds.includes(joint.id)).map(link => link.id).sort();
    assert.deepEqual([...joint.connectedLinkIds].sort(), expected);
  }
}

test('deep-frozen source is unchanged and the returned graph is fully detached', () => {
  const source = freeze(fixture()), before = structuredClone(source);
  const selection = freeze(new Set(['a', 'shape', 'pic', 'pen']));
  const result = mirrorGeometry(source, 'vertical', 0, 'selection', selection, ids());
  assert.deepEqual(source, before);
  assert.deepEqual([...selection], ['a', 'shape', 'pic', 'pen']);
  result.graph.joints.a.position.x = 99;
  result.graph.bodies.arm.jointIds.push('different');
  result.graph.images.pic.position.x = 99;
  result.graph.outlines.shape.points[0].x = 99;
  result.graph.colliders.barrier.bodyIds.push('different');
  assert.deepEqual(source, before);
});

test('on-axis joint is reused and one reflected shared joint joins every original owning body', () => {
  const source = fixture();
  const { graph, createdIds } = mirrorGeometry(source, 'vertical', 0, 'selection', new Set(['a', 'o']), ids());
  assert.deepEqual(createdIds, ['new1']);
  close(graph.joints.new1.position, { x: -2, y: 2 });
  assert.deepEqual(graph.joints.o, source.joints.o);
  assert.deepEqual(graph.bodies.arm.jointIds, ['a', 'b', 'new1']);
  assert.deepEqual(graph.bodies.shared.jointIds, ['a', 'o', 'new1']);
  assert.deepEqual(graph.bodies.base, source.bodies.base);
  assert.deepEqual(graph.bodies.other, source.bodies.other);
  assert.deepEqual(Object.keys(graph.bodies), Object.keys(source.bodies));
});

test('fork epsilon reuses near-axis joints without snapping their original coordinates', () => {
  const source = fixture();
  source.joints.o.position.x = 0.0009;
  source.joints.a.position.x = 0.0011;
  const { graph, createdIds } = mirrorGeometry(source, 'vertical', 0, 'selection', new Set(['o', 'a']), ids());
  assert.equal(createdIds.length, 1);
  assert.equal(graph.joints.o.position.x, 0.0009);
  close(graph.joints.new1.position, { x: -0.0011, y: 2 });
});

test('a reflected Base member remains fixed and is appended to the same Base', () => {
  const source = fixture();
  source.joints.o.position.x = 3;
  const { graph } = mirrorGeometry(source, 'vertical', 0, 'selection', new Set(['o']), ids());
  assert.equal(graph.joints.new1.type, 'fixed');
  assert.deepEqual(graph.bodies.base.jointIds, ['o', 'new1']);
});

test('reflected joint position metadata does not alias the original position metadata', () => {
  const source = fixture();
  Object.assign(source.joints.a.position, { custom: { values: ['keep'] } });
  freeze(source);
  const { graph } = mirrorGeometry(source, 'vertical', 0, 'selection', new Set(['a']), ids());
  type MetadataPoint = Vec2 & { custom: { values: string[] } };
  const original = graph.joints.a.position as MetadataPoint;
  const mirrored = graph.joints.new1.position as MetadataPoint;
  mirrored.custom.values.push('new');
  assert.deepEqual(original.custom.values, ['keep']);
  assert.deepEqual((source.joints.a.position as MetadataPoint).custom.values, ['keep']);
});

test('selected link expands endpoints and copies only that link, keeping unrelated visible links', () => {
  const source = fixture();
  const { graph, createdIds } = mirrorGeometry(source, 'vertical', 0, 'selection', new Set(['ab']), ids());
  assert.deepEqual(createdIds, ['new1', 'new2', 'new3']);
  assert.deepEqual(graph.links.new3.jointIds, ['new1', 'new2']);
  assert.equal(graph.links.new3.restLength, 4);
  assert.equal(graph.links.new3.mass, 2);
  for (const link of Object.values(source.links)) assert.deepEqual(graph.links[link.id], link);
  assert.equal(Object.keys(graph.links).length, 5);
  assert.equal(Object.keys(graph.sliders).length, 1);
  assert.equal(Object.keys(graph.colliders).length, 1);
  connectionsAreExact(graph);
});

test('selecting joint endpoints does not implicitly copy unselected links, sliders, colliders or assets', () => {
  const source = fixture();
  const { graph, createdIds } = mirrorGeometry(source, 'horizontal', 1, 'selection', new Set(['a', 'b', 'c']), ids());
  assert.equal(createdIds.length, 3);
  assert.deepEqual(graph.links, source.links);
  assert.deepEqual(graph.sliders, source.sliders);
  assert.deepEqual(graph.colliders, source.colliders);
  assert.deepEqual(graph.images, source.images);
  assert.equal(Object.keys(graph.outlines).length, 1);
  assert.equal(Object.keys(graph.tracers).length, 1);
});

test('selected slider and collider share expanded endpoints and preserve existing body targets', () => {
  const source = fixture();
  const { graph, createdIds } = mirrorGeometry(source, 'vertical', 0, 'selection', new Set(['rail', 'barrier']), ids());
  assert.equal(createdIds.length, 5);
  const slider = graph.sliders.new4, collider = graph.colliders.new5;
  assert.deepEqual([slider.jointIdA, slider.jointIdB, slider.jointIdC], ['new1', 'new2', 'new3']);
  assert.deepEqual([collider.jointIdA, collider.jointIdC], ['new1', 'new3']);
  assert.deepEqual(collider.bodyIds, ['arm', 'other']);
  assert.equal(slider.t, 0.5);
  assert.deepEqual(graph.links, source.links);
});

test('all-on-axis links and constraints are not duplicated; a mixed link connects its reused axis joint', () => {
  const source = fixture();
  source.joints.a.position.x = 0;
  source.joints.b.position.x = 0;
  source.joints.c.position.x = 0;
  const unchanged = mirrorGeometry(source, 'vertical', 0, 'selection', new Set(['ab', 'rail', 'barrier']), ids());
  assert.deepEqual(unchanged.createdIds, []);
  assert.deepEqual(unchanged.graph, source);
  source.joints.b.position.x = 3;
  const { graph, createdIds } = mirrorGeometry(source, 'vertical', 0, 'selection', new Set(['ab']), ids());
  assert.deepEqual(createdIds, ['new1', 'new2']);
  assert.deepEqual(graph.links.new2.jointIds, ['a', 'new1']);
  assert.deepEqual(graph.joints.a.connectedLinkIds, ['ab', 'brace', 'new2']);
  connectionsAreExact(graph);
});

test('all copies visible entities but never hidden braces, hidden assets or disabled tracers', () => {
  const source = fixture();
  source.outlines.invisible = { ...structuredClone(source.outlines.shape), id: 'invisible', visible: false };
  source.images.invisibleImage = { ...structuredClone(source.images.pic), id: 'invisibleImage', visible: false };
  source.tracers.disabled = { ...structuredClone(source.tracers.pen), id: 'disabled', enabled: false };
  const { graph, createdIds } = mirrorGeometry(source, 'vertical', 0, 'all', new Set(), ids());
  assert.equal(Object.keys(graph.joints).length, Object.keys(source.joints).length + 5);
  assert.equal(Object.keys(graph.links).length, Object.keys(source.links).length + 3);
  assert.equal(Object.keys(graph.outlines).length, Object.keys(source.outlines).length + 1);
  assert.equal(Object.keys(graph.images).length, Object.keys(source.images).length + 1);
  assert.equal(Object.keys(graph.tracers).length, Object.keys(source.tracers).length + 1);
  assert.equal(Object.keys(graph.sliders).length, 2);
  assert.equal(Object.keys(graph.colliders).length, 2);
  assert.equal(createdIds.length, 13);
  assert.deepEqual(graph.joints.h, source.joints.h);
  assert.deepEqual(graph.links.brace, source.links.brace);
  connectionsAreExact(graph);
});

test('explicit hidden brace or brace-link selection creates nothing', () => {
  const source = fixture();
  const result = mirrorGeometry(source, 'vertical', 0, 'selection', new Set(['h', 'brace']), () => assert.fail('must not allocate'));
  assert.deepEqual(result.graph, source);
  assert.deepEqual(result.createdIds, []);
});

test('original outline/tracer world positions survive a changed body centroid and direction', () => {
  const source = fixture();
  const oldOutline = outlineWorld(source, 'shape'), oldTracer = tracerWorld(source, 'pen');
  // Independent analytical source frame: centroid (4,2), angle PI.
  close(oldOutline[0], { x: 3, y: 0 });
  close(oldTracer, { x: 2, y: -1 });
  const { graph } = mirrorGeometry(source, 'vertical', 0, 'selection', new Set(['a']), ids());
  assert.notDeepEqual(computeBodyTransform(graph.bodies.arm, graph.joints), computeBodyTransform(source.bodies.arm, source.joints));
  outlineWorld(graph, 'shape').forEach((p, i) => close(p, oldOutline[i]));
  close(tracerWorld(graph, 'pen'), oldTracer);
  assert.deepEqual(graph.images.pic, source.images.pic);
  for (const joint of Object.values(source.joints)) assert.deepEqual(graph.joints[joint.id], joint);
});

for (const axis of ['vertical', 'horizontal'] as const) {
  test(`${axis} reflects body-local outline/tracer through world space into the same body`, () => {
    const source = fixture();
    const oldOutline = outlineWorld(source, 'shape'), oldTracer = tracerWorld(source, 'pen');
    const { graph } = mirrorGeometry(source, axis, 7, 'selection', new Set(['a', 'shape', 'pen']), ids());
    const reflected = (p: Vec2) => axis === 'vertical' ? { x: 14 - p.x, y: p.y } : { x: p.x, y: 14 - p.y };
    outlineWorld(graph, 'new2').forEach((p, i) => close(p, reflected(oldOutline[i])));
    close(tracerWorld(graph, 'new3'), reflected(oldTracer));
    assert.equal(graph.outlines.new2.bodyId, 'arm');
    assert.equal(graph.tracers.new3.bodyId, 'arm');
    outlineWorld(graph, 'shape').forEach((p, i) => close(p, oldOutline[i]));
    close(tracerWorld(graph, 'pen'), oldTracer);
  });
}

test('assets without selected joints do not expand body membership', () => {
  const source = fixture();
  const { graph, createdIds } = mirrorGeometry(source, 'vertical', 0, 'selection', new Set(['shape', 'pic', 'pen']), ids());
  assert.equal(createdIds.length, 3);
  assert.deepEqual(graph.bodies, source.bodies);
  assert.deepEqual(graph.joints, source.joints);
  assert.deepEqual(graph.links, source.links);
});

test('on-axis outlines/tracers reuse their originals but an on-axis image still reflects its texture', () => {
  const source = fixture();
  source.outlines.shape.bodyId = 'base';
  source.outlines.shape.points = [{ x: 0, y: -3 }, { x: 0, y: 5 }];
  source.tracers.pen.bodyId = 'base';
  source.tracers.pen.localPosition = { x: 0, y: 9 };
  source.images.pic.position.x = 0;
  const { graph, createdIds } = mirrorGeometry(source, 'vertical', 0, 'selection', new Set(['shape', 'pic', 'pen']), ids());
  assert.deepEqual(createdIds, ['new1']);
  assert.equal(Object.keys(graph.outlines).length, 1);
  assert.equal(Object.keys(graph.tracers).length, 1);
  assert.equal((graph.images.new1 as ImageWithFlip).flipX, true);
  close(graph.images.new1.position, source.images.pic.position);
});

// Texture-coordinate oracle: transform the SAME labelled UV point before/after.
// An unordered corner-set comparison alone cannot detect a 180-degree texture error.
function texturePoint(image: ImageWithFlip, u: number, v: number): Vec2 {
  const x = (u - 0.5) * image.naturalWidth * image.scale * (image.flipX ? -1 : 1);
  const y = (v - 0.5) * image.naturalHeight * image.scale;
  const c = Math.cos(image.rotation), s = Math.sin(image.rotation);
  return { x: image.position.x + c * x - s * y, y: image.position.y + s * x + c * y };
}

for (const axis of ['vertical', 'horizontal'] as const) {
  for (const flipX of [undefined, false, true]) {
    test(`${axis} image corner/texture math with initial flipX=${flipX}`, () => {
      const source = fixture(), image: ImageWithFlip = source.images.pic;
      image.flipX = flipX;
      for (const rotation of [0, 0.37, -1.2, Math.PI / 2, 2 * Math.PI]) {
        image.rotation = rotation;
        const { graph } = mirrorGeometry(source, axis, -3, 'selection', new Set(['pic']), ids());
        const mirrored: ImageWithFlip = graph.images.new1;
        assert.equal(mirrored.flipX, !flipX);
        assert.equal(mirrored.rotation, axis === 'vertical' ? -rotation : Math.PI - rotation);
        for (const [u, v] of [[0, 0], [1, 0], [1, 1], [0, 1], [0.2, 0.73]]) {
          const original = texturePoint(image, u, v);
          const expected = axis === 'vertical' ? { x: -6 - original.x, y: original.y } : { x: original.x, y: -6 - original.y };
          close(texturePoint(mirrored, u, v), expected);
        }
        assert.deepEqual(graph.images.pic, image);
      }
    });
  }
}

test('two reflections restore labelled image texture coordinates, including initial flip', () => {
  const source = fixture();
  (source.images.pic as ImageWithFlip).flipX = true;
  for (const axis of ['vertical', 'horizontal'] as const) {
    const first = mirrorGeometry(source, axis, 5, 'selection', new Set(['pic']), ids('first'));
    const second = mirrorGeometry(first.graph, axis, 5, 'selection', new Set(first.createdIds), ids('second'));
    for (const [u, v] of [[0, 0], [1, 1], [0.2, 0.73]]) close(texturePoint(second.graph.images.second1, u, v), texturePoint(source.images.pic, u, v));
  }
});

test('unknown metadata, closed outlines and stable body-frame pair metadata are preserved', () => {
  const source = fixture();
  Object.assign(source, { extension: { note: ['keep'] } });
  Object.assign(source.bodies.arm, { frame: { jointIds: ['a', 'b'], angleOffset: 0.4 }, custom: { value: ['body'] } });
  Object.assign(source.joints.a, { label: 'Pivot A', custom: { value: ['joint'] } });
  Object.assign(source.links.ab, { custom: { value: ['link'] } });
  Object.assign(source.outlines.shape, { closed: false, custom: { value: ['outline'] } });
  Object.assign(source.outlines.shape.points[0], { custom: { value: ['point'] } });
  Object.assign(source.images.pic, { custom: { value: ['image'] } });
  Object.assign(source.sliders.rail, { custom: { value: ['slider'] } });
  Object.assign(source.colliders.barrier, { custom: { value: ['collider'] } });
  Object.assign(source.tracers.pen, { custom: { value: ['tracer'] } });
  Object.assign(source.tracers.pen.localPosition, { custom: { value: ['tracer point'] } });
  const before = structuredClone(source), outline = outlineWorld(source, 'shape'), tracer = tracerWorld(source, 'pen');
  freeze(source);
  const { graph } = mirrorGeometry(source, 'vertical', 0, 'all', new Set(), ids());
  assert.deepEqual(source, before);
  assert.deepEqual(graph.bodies.arm, { ...before.bodies.arm, jointIds: [...before.bodies.arm.jointIds, 'new1', 'new2'] });
  outlineWorld(graph, 'shape').forEach((p, i) => close(p, outline[i]));
  close(tracerWorld(graph, 'pen'), tracer);
  for (const kind of ['joints', 'links', 'outlines', 'images', 'sliders', 'colliders', 'tracers'] as const) {
    const original = Object.values(source[kind])[0] as unknown as { custom: unknown };
    const mirrored = Object.entries(graph[kind]).find(([id]) => id.startsWith('new'))![1] as unknown as { custom: unknown };
    assert.deepEqual(mirrored.custom, original.custom);
    assert.notEqual(mirrored.custom, original.custom);
  }
  type PointMetadata = Vec2 & { custom: { value: string[] } };
  const oldPoint = source.outlines.shape.points[0] as PointMetadata;
  const originalReprojectedPoint = graph.outlines.shape.points[0] as PointMetadata;
  const mirroredOutline = Object.values(graph.outlines).find(o => o.id !== 'shape')!;
  const mirroredPoint = mirroredOutline.points[0] as PointMetadata;
  assert.notEqual(originalReprojectedPoint.custom, oldPoint.custom);
  assert.notEqual(mirroredPoint.custom, oldPoint.custom);
  originalReprojectedPoint.custom.value.push('change');
  mirroredPoint.custom.value.push('change');
  assert.deepEqual(oldPoint.custom.value, ['point']);
  assert.equal((mirroredOutline as typeof mirroredOutline & { closed: boolean }).closed, false);
});

test('empty or unknown selection returns a detached unchanged clone without allocating IDs', () => {
  const source = freeze(fixture());
  for (const selected of [new Set<string>(), new Set(['nonexistent', 'arm'])]) {
    const result = mirrorGeometry(source, 'vertical', 0, 'selection', selected, () => assert.fail('must not allocate'));
    assert.deepEqual(result.graph, source);
    assert.notEqual(result.graph, source);
    assert.deepEqual(result.createdIds, []);
  }
});

test('IDs are globally fresh, include every created entity, and do not silently overwrite', () => {
  const source = fixture();
  const { graph, createdIds } = mirrorGeometry(source, 'horizontal', -2, 'all', new Set(), ids());
  const kinds = ['joints', 'links', 'bodies', 'outlines', 'images', 'sliders', 'colliders', 'tracers'] as const;
  const added = kinds.flatMap(kind => Object.keys(graph[kind]).filter(id => !Object.hasOwn(source[kind], id)));
  assert.deepEqual([...createdIds].sort(), added.sort());
  assert.equal(new Set(createdIds).size, createdIds.length);
  for (const collision of ['a', 'ab', 'arm', 'shape', 'pic', 'rail', 'barrier', 'pen']) {
    assert.throws(() => mirrorGeometry(source, 'vertical', 0, 'selection', new Set(['a']), () => collision), /collision/);
  }
  assert.throws(() => mirrorGeometry(source, 'vertical', 0, 'selection', new Set(['a', 'b']), () => 'repeat'), /collision/);
  const extension = Object.assign(source, { springs: { spring: { id: 'spring', kind: 'linear', stiffness: 12, damping: 0, restLength: 1, prestressDelta: 0,
    anchorA: { type: 'world', position: { x: 0, y: 0 } }, anchorB: { type: 'world', position: { x: 1, y: 0 } } } } });
  assert.throws(() => mirrorGeometry(extension, 'vertical', 0, 'selection', new Set(['a']), () => 'spring'), /collision/);
});

test('invalid allocated IDs throw and frozen source remains unchanged after late collision', () => {
  const source = freeze(fixture()), before = structuredClone(source);
  for (const bad of ['', ' ', '__proto__', 'constructor', 'prototype', undefined, 123]) {
    assert.throws(() => mirrorGeometry(source, 'vertical', 0, 'selection', new Set(['a']), () => bad as string), /newId/);
  }
  let calls = 0;
  assert.throws(() => mirrorGeometry(source, 'vertical', 0, 'selection', new Set(['a', 'b']), () => ++calls === 1 ? 'fresh' : 'shape'), /collision/);
  assert.equal(calls, 2);
  assert.deepEqual(source, before);
});

test('invalid axes, nonfinite axis values and invalid scope throw before ID allocation', () => {
  const source = freeze(fixture());
  const noId = () => assert.fail('must validate before allocation');
  assert.throws(() => mirrorGeometry(source, 'diagonal' as 'vertical', 0, 'all', new Set(), noId), /axis/);
  for (const axisValue of [NaN, Infinity, -Infinity]) assert.throws(() => mirrorGeometry(source, 'vertical', axisValue, 'all', new Set(), noId), /finite/);
  assert.throws(() => mirrorGeometry(source, 'vertical', 0, 'body' as 'all', new Set(), noId), /scope/);
});

const malformedCases: [string, (graph: MechanismState) => void][] = [
  ['missing joint', graph => { graph.links.ab.jointIds[0] = 'missing'; }],
  ['missing body', graph => { graph.outlines.shape.bodyId = 'missing'; }],
  ['missing body', graph => { graph.images.pic.bodyId = 'missing'; }],
  ['missing body', graph => { graph.tracers.pen.bodyId = 'missing'; }],
  ['missing body', graph => { graph.colliders.barrier.bodyIds.push('missing'); }],
  ['missing joint', graph => { graph.sliders.rail.jointIdC = 'missing'; }],
  ['missing joint', graph => { graph.bodies.arm.jointIds.push('missing'); }],
  ['duplicate joints', graph => { graph.bodies.arm.jointIds.push('a'); }],
  ['invalid ID', graph => { graph.joints.a = { ...graph.joints.a, id: 'wrong' }; }],
  ['duplicate entity ID', graph => { graph.images.a = { ...graph.images.pic, id: 'a' }; }],
  ['finite', graph => { graph.joints.a.position.x = NaN; }],
  ['finite', graph => { graph.outlines.shape.points[0].x = Infinity; }],
  ['finite', graph => { graph.tracers.pen.localPosition.y = NaN; }],
  ['finite', graph => { graph.images.pic.rotation = Infinity; }],
  ['positive', graph => { graph.images.pic.scale = 0; }],
  ['positive', graph => { graph.images.pic.naturalWidth = -1; }],
  ['boolean', graph => { Object.assign(graph.images.pic, { flipX: 'yes' }); }],
  ['finite', graph => { graph.sliders.rail.t = NaN; }],
  ['nonnegative', graph => { graph.links.ab.restLength = -1; }],
  ['two endpoints', graph => { Object.assign(graph.links.ab, { jointIds: ['a'] }); }],
  ['points must be an array', graph => { Object.assign(graph.outlines.shape, { points: null }); }],
  ['images must be an entity map', graph => { Object.assign(graph, { images: null }); }],
];
for (const [message, corrupt] of malformedCases) {
  test(`malformed graph rejected before allocation: ${message} (${malformedCases.findIndex(entry => entry[1] === corrupt)})`, () => {
    const source = fixture(); corrupt(source); freeze(source);
    const before = structuredClone(source);
    assert.throws(() => mirrorGeometry(source, 'vertical', 0, 'selection', new Set(), () => assert.fail('must not allocate')), new RegExp(message));
    assert.deepEqual(source, before);
  });
}

test('nonfinite reflected output throws, while large on-axis coordinates do not overflow unnecessarily', () => {
  const source = fixture();
  source.joints.a.position.x = -1e308;
  assert.throws(() => mirrorGeometry(source, 'vertical', 1e308, 'selection', new Set(['a']), ids()), /finite/);
  source.joints.a.position.x = 1e308;
  const result = mirrorGeometry(source, 'vertical', 1e308, 'selection', new Set(['a']), ids());
  assert.deepEqual(result.createdIds, []);
  assert.equal(result.graph.joints.a.position.x, 1e308);
});
