import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Utils } from '@flatten-js/core';
import { circlePoints, ngonPoints } from '../src/core/shape-geometry';
import { prepareSketchTrim } from '../src/core/sketch-trim';
import type { SketchOutline, TrimResult } from '../src/core/sketch-trim';
import type { Vec2 } from '../src/types';

const p = (x: number, y: number): Vec2 => ({ x, y });
const line = (id: string, a: Vec2, b: Vec2): SketchOutline => ({ id, points: [a, b], closed: false });
const circle = (id = 'circle', x = 0): SketchOutline => ({ id, points: circlePoints(p(x, 0), p(x + 10, 0)), closed: true, primitive: 'circle' });
const cuts = () => [line('target', p(-5, 0), p(5, 0)), line('left', p(-2, -3), p(-2, 3)), line('right', p(2, -3), p(2, 3))];
const close = (a: number, b: number, tolerance = 1e-7) => assert(Math.abs(a - b) <= tolerance, `${a} != ${b}`);
const near = (a: Vec2, b: Vec2) => { close(a.x, b.x); close(a.y, b.y); };
const only = (result: TrimResult, id = 'target') => { assert.deepEqual([...result.changes.keys()], [id]); return result.changes.get(id)!; };

test('straight subdivision and duplicate vertices do not create trim boundaries', () => {
  for (const method of ['closest', 'power'] as const) {
    const boundaries = [line('a', p(2, -2), p(2, 2)), line('b', p(8, -2), p(8, 2))];
    const apply = (points: Vec2[]) => prepareSketchTrim([{ id: 'target', points, closed: false }, ...boundaries]).apply(
      method === 'closest' ? [p(6, 0)] : [p(6, -1), p(6, 1)], new Set(['target']), method, .1);
    assert.deepEqual(apply([p(0, 0), p(5, 0), p(5, 0), p(10, 0)]), apply([p(0, 0), p(10, 0)]));
  }
  const result = prepareSketchTrim([{ id: 'target', closed: false, points: [p(0, 0), p(5, 0), p(5, 0), p(5, 5), p(10, 5)] },
    line('b', p(8, 4), p(8, 6))]).apply([p(9, 4), p(9, 6)], new Set(['target']), 'power', .1);
  assert.equal(only(result).length, 1);
});

test('distant boundaries cannot silently change a true circle into polygon trimming', () => {
  assert.throws(() => prepareSketchTrim([circle(), line('b', p(0, -1e9), p(0, 1e9))]), /relative trim precision/);
});

test('duplicate samples and an on-edge dwell preserve genuine crossings', () => {
  const scene = prepareSketchTrim([line('target', p(0, 0), p(10, 0))]);
  const apply = (stroke: Vec2[]) => scene.apply(stroke, new Set(['target']), 'power', .1);
  assert.deepEqual(apply([p(2, -1), p(2, 0), p(2, 0), p(2, 0), p(2, 1)]), apply([p(2, -1), p(2, 0), p(2, 1)]));
  assert.equal(only(apply([p(2, -1), p(2, 0), p(3, 0), p(4, 0), p(4, 1)])).length, 0);
});

test('dense repeated crossings use indexed interval lookup without long preview stalls', () => {
  const outlines = Array.from({ length: 250 }, (_, i) => line(String(i), p(-10, .01 * i), p(10, -.01 * i + .000001 * i * i)));
  const scene = prepareSketchTrim(outlines), start = performance.now();
  const result = scene.apply(Array.from({ length: 101 }, (_, i) => p(-5, i % 2 ? -5 : 5)), new Set(outlines.map(o => o.id)), 'power', .1);
  assert.equal(result.changes.size, 250);
  assert(performance.now() - start < 750, 'Repeated crossings should not scan every outline interval per hit');
});

for (const method of ['power', 'closest'] as const) test(method + ': trims only between true line intersections', () => {
  const scene = prepareSketchTrim(cuts());
  const result = scene.apply(method === 'power' ? [p(0, -1), p(0, 1)] : [p(0, .05)], new Set(['target']), method, .1);
  const runs = only(result);
  assert.equal(runs.length, 2);
  near(runs[0].points[0], p(-5, 0)); near(runs[0].points[1], p(-2, 0));
  near(runs[1].points[0], p(2, 0)); near(runs[1].points[1], p(5, 0));
});

for (const method of ['power', 'closest'] as const) test(method + ': circle crossed by a diameter retains the other semicircle', () => {
  const scene = prepareSketchTrim([circle(), line('boundary', p(0, -20), p(0, 20))]);
  const result = scene.apply(method === 'power' ? [p(9, 1), p(11, 1)] : [p(10, 0)], new Set(['circle']), method, .1);
  const runs = only(result, 'circle'); assert.equal(runs.length, 1); assert(runs[0].circle);
  assert(runs[0].points.length > 8);
  for (const point of runs[0].points) { close(Math.hypot(point.x, point.y), 10); assert(point.x <= 1e-7); }
  near(runs[0].points[0], p(0, 10)); near(runs[0].points.at(-1)!, p(0, -10));
});

test('circle-circle intersections, not display vertices, bound a trimmed arc', () => {
  const scene = prepareSketchTrim([circle(), circle('boundary', 10)]);
  const run = only(scene.apply([p(9, 0), p(11, 0)], new Set(['circle']), 'power', .1), 'circle')[0];
  near(run.points[0], p(5, Math.sqrt(75))); near(run.points.at(-1)!, p(5, -Math.sqrt(75)));
  assert(run.points.every(p => p.x <= 5 + 1e-7));
});

test('adjacent retained quadrants join across the circle seam, not disconnected fragments', () => {
  const scene = prepareSketchTrim([circle(), line('v', p(0, -20), p(0, 20)), line('h', p(-20, 0), p(20, 0))]);
  const runs = only(scene.apply([p(9, 1), p(11, 1)], new Set(['circle']), 'power', .1), 'circle');
  assert.equal(runs.length, 1);
  assert(runs[0].points.some(p => p.x < -9.99));
  assert(runs[0].points.some(p => p.y < -9.99));
  assert(runs[0].points.some(p => p.y > 9.99));
});

test('saved open circle arcs can be trimmed again at new intersections', () => {
  const first = prepareSketchTrim([circle(), line('v', p(0, -20), p(0, 20))]).apply([p(10, 0)], new Set(['circle']), 'closest', .1);
  const arc: SketchOutline = { id: 'arc', points: first.changes.get('circle')![0].points, closed: false, primitive: 'circle' };
  const reopened = JSON.parse(JSON.stringify(arc)) as SketchOutline;
  const scene = prepareSketchTrim([reopened, line('h', p(-20, 0), p(20, 0))]);
  const runs = only(scene.apply([p(-9, 4.5)], new Set(['arc']), 'closest', .3), 'arc');
  assert.equal(runs.length, 1); assert(runs[0].points.every(p => p.y <= 1e-7));
  near(runs[0].points[0], p(-10, 0)); near(runs[0].points.at(-1)!, p(0, -10));
});

test('isolated and legacy circles still delete whole; tangencies and inside-only strokes do not', () => {
  const legacy = circle(); delete legacy.primitive;
  for (const outline of [circle(), legacy]) {
    const scene = prepareSketchTrim([outline]);
    assert.deepEqual(only(scene.apply([p(9, 0), p(11, 0)], new Set(['circle']), 'power', .1), 'circle'), []);
    assert.deepEqual(only(scene.apply([p(10, 0)], new Set(['circle']), 'closest', .1), 'circle'), []);
    for (const stroke of [[p(10, -20), p(10, 20)], [p(-1, 0), p(1, 0)], [p(9, 0), p(10, 0)]]) assert.equal(scene.apply(stroke, new Set(['circle']), 'power', .1).changes.size, 0);
  }
});

test('a tangent boundary does not split a circle into artificial arc sections', () => {
  const scene = prepareSketchTrim([circle(), line('tangent', p(10, -20), p(10, 20))]);
  assert.deepEqual(only(scene.apply([p(-11, 0), p(-9, 0)], new Set(['circle']), 'power', .1), 'circle'), []);
});

test('ordinary rectangles and explicitly tagged 48-sided N-gons retain their edge semantics', () => {
  const rectangle: SketchOutline = { id: 'target', points: [p(0, 0), p(4, 0), p(4, 4), p(0, 4)], closed: true, primitive: 'rectangle' };
  const result = prepareSketchTrim([rectangle]).apply([p(2, -1), p(2, 1)], new Set(['target']), 'power', .1);
  const runs = only(result); assert.equal(runs.length, 1);
  assert.deepEqual(runs[0].points, [p(4, 0), p(4, 4), p(0, 4), p(0, 0)]);
  const polygon: SketchOutline = { id: 'target', points: ngonPoints(p(0, 0), p(10, 0), 48), closed: true, primitive: 'ngon' };
  const remaining = only(prepareSketchTrim([polygon]).apply([p(9, 1), p(11, 1)], new Set(['target']), 'power', .1));
  assert.equal(remaining.length, 1); assert(!remaining[0].circle); assert.equal(remaining[0].points.length, 48);
});

test('uncut portions stay connected even when other boundary intersections split them internally', () => {
  const rectangle: SketchOutline = { id: 'target', points: [p(0, 0), p(4, 0), p(4, 4), p(0, 4)], closed: true };
  const scene = prepareSketchTrim([rectangle, line('boundary', p(2, -1), p(2, 5))]);
  const runs = only(scene.apply([p(3, 3), p(5, 3)], new Set(['target']), 'power', .1));
  assert.equal(runs.length, 1, 'all three other edges remain a single connected open path');
});

test('extension lengthens the chosen open endpoint to its nearest real boundary', () => {
  for (const direction of [-1, 1]) {
    const scene = prepareSketchTrim([line('target', p(0, 0), p(5, 0)), line('boundary', p(direction > 0 ? 10 : -10, -10), p(direction > 0 ? 10 : -10, 10))]);
    const runs = only(scene.apply([p(direction > 0 ? 4.9 : .1, 0)], new Set(['target']), 'extend', .2));
    near(runs[0].points[0], p(direction > 0 ? 0 : -10, 0)); near(runs[0].points[1], p(direction > 0 ? 10 : 5, 0));
  }
});

test('shift/power extension supports crossing a line instead of requiring the stroke start on it', () => {
  const scene = prepareSketchTrim([line('target', p(0, 0), p(5, 0)), line('boundary', p(10, -10), p(10, 10))]);
  const run = only(scene.apply([p(4, -1), p(4, 1)], new Set(['target']), 'extend', .1))[0];
  near(run.points[1], p(10, 0));
});

test('extension does not modify closed outlines or a polyline internal edge', () => {
  const closed = circle();
  assert.equal(prepareSketchTrim([closed]).apply([p(10, 0)], new Set(['circle']), 'extend', 1).changes.size, 0);
  const path: SketchOutline = { id: 'path', points: [p(0, 0), p(5, 0), p(5, 5), p(10, 5)], closed: false };
  const scene = prepareSketchTrim([path, line('boundary', p(0, 10), p(10, 10))]);
  assert.equal(scene.apply([p(5, 3)], new Set(['path']), 'extend', .1).changes.size, 0);
});

test('scope excludes untargeted outlines but their geometry remains available as boundaries', () => {
  const scene = prepareSketchTrim(cuts());
  assert.equal(scene.apply([p(0, -1), p(0, 1)], new Set(), 'power', .1).changes.size, 0);
  assert.deepEqual([...scene.apply([p(0, -1), p(0, 1)], new Set(['target']), 'power', .1).changes.keys()], ['target']);
});

test('normalization preserves intersection endpoints under tiny/large scales and translations', () => {
  for (const scale of [1e-150, 1, 1e150]) {
    const transform = (p: Vec2) => ({ x: (p.x + 20) * scale, y: (p.y - 10) * scale });
    const scene = prepareSketchTrim(cuts().map(o => ({ ...o, points: o.points.map(transform) })));
    const runs = only(scene.apply([p(0, -1), p(0, 1)].map(transform), new Set(['target']), 'power', .1 * scale));
    close(runs[0].points.at(-1)!.x / scale, 18); close(runs[1].points[0].x / scale, 22);
  }
});

test('prepared scenes snapshot input, never mutate caller data, and restore library tolerance', () => {
  const input = cuts(), before = structuredClone(input), tolerance = Utils.getTolerance();
  const scene = prepareSketchTrim(input);
  input[0].points[0].x = 1000;
  const result = scene.apply([p(0, -1), p(0, 1)], new Set(['target']), 'power', .1);
  close(result.changes.get('target')![0].points[0].x, -5);
  assert.deepEqual(input.slice(1), before.slice(1)); assert.equal(Utils.getTolerance(), tolerance);
  assert.throws(() => prepareSketchTrim([{ ...input[0], points: [p(NaN, 0)] }]), /Invalid/);
  assert.equal(Utils.getTolerance(), tolerance);
});

test('invalid/oversized strokes are no-ops and geometry budgets fail atomically', () => {
  const scene = prepareSketchTrim(cuts());
  for (const stroke of [[], [p(NaN, 1)], Array.from({ length: 4097 }, () => p(0, 0))]) assert.equal(scene.apply(stroke, new Set(['target']), 'power', 1).changes.size, 0);
  assert.throws(() => prepareSketchTrim(Array.from({ length: 2050 }, (_, i) => line('line' + i, p(i, 0), p(i, 1)))), /Too many/);
});
