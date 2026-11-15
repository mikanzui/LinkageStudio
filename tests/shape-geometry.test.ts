import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { Vec2 } from '../src/types';
import { circlePoints, ngonPoints, rectanglePoints, trimOutlineEdges } from '../src/core/shape-geometry';

const p = (x: number, y: number): Vec2 => ({ x, y });
const square = (): Vec2[] => [p(0, 0), p(4, 0), p(4, 4), p(0, 4)];
const close = (actual: number, expected: number, tolerance = 1e-11): void => {
  assert.ok(Math.abs(actual - expected) <= tolerance, `${actual} != ${expected}`);
};
const pointClose = (actual: Vec2, expected: Vec2): void => {
  close(actual.x, expected.x);
  close(actual.y, expected.y);
};
const rotate = (point: Vec2, angle: number, origin = p(0, 0)): Vec2 => p(
  origin.x + point.x * Math.cos(angle) - point.y * Math.sin(angle),
  origin.y + point.x * Math.sin(angle) + point.y * Math.cos(angle),
);

function deepFreeze<T>(value: T): T {
  if (value !== null && typeof value === 'object') {
    Object.values(value).forEach(deepFreeze);
    Object.freeze(value);
  }
  return value;
}

test('rectangle: exact corners in drag order, without a repeated closing vertex', () => {
  assert.deepEqual(rectanglePoints(p(1, 2), p(5, 8)), [p(1, 2), p(5, 2), p(5, 8), p(1, 8)]);
  assert.deepEqual(rectanglePoints(p(5, 8), p(1, 2)), [p(5, 8), p(1, 8), p(1, 2), p(5, 2)]);
});

for (const sx of [-1, 1]) for (const sy of [-1, 1]) {
  test(`rectangle: mirrored square drag ${sx},${sy} uses max extent and signs`, () => {
    for (const [dx, dy] of [[2, 5], [5, 2]]) {
      assert.deepEqual(rectanglePoints(p(10, 20), p(10 + sx * dx, 20 + sy * dy), true), [
        p(10, 20), p(10 + sx * 5, 20), p(10 + sx * 5, 20 + sy * 5), p(10, 20 + sy * 5),
      ]);
    }
  });
}

test('rectangle: square axis ties choose positive direction; a coincident drag remains empty', () => {
  assert.deepEqual(rectanglePoints(p(0, 0), p(-4, 0), true), [p(0, 0), p(-4, 0), p(-4, 4), p(0, 4)]);
  assert.deepEqual(rectanglePoints(p(0, 0), p(0, -4), true), [p(0, 0), p(4, 0), p(4, -4), p(0, -4)]);
  assert.deepEqual(rectanglePoints(p(1, 2), p(1, 2), true), []);
});

test('rectangle: zero area, nonfinite, overflow and unrepresentable square corners return empty', () => {
  for (const [a, b, constrain] of [
    [p(0, 0), p(0, 2), false], [p(0, 0), p(2, 0), false], [p(1, 1), p(1, 1), false],
    [p(NaN, 0), p(2, 2), false], [p(0, 0), p(Infinity, 2), false],
    [p(-1e308, 0), p(1e308, 2), false], [p(1e308, 0), p(1e308, 1e308), true],
  ] as [Vec2, Vec2, boolean][]) assert.deepEqual(rectanglePoints(a, b, constrain), []);
});

test('primitives: tiny but representable geometry is not rejected by a world-unit epsilon', () => {
  assert.equal(rectanglePoints(p(0, 0), p(1e-200, 2e-200)).length, 4);
  assert.equal(circlePoints(p(0, 0), p(1e-200, 0)).length, 48);
  assert.equal(ngonPoints(p(0, 0), p(1e-200, 0), 3).length, 3);
});

test('circle: default 48 vertices, cardinal points, center and radius from a 3-4-5 drag', () => {
  const center = p(10, -3), points = circlePoints(center, p(13, 1));
  assert.equal(points.length, 48);
  for (const [i, expected] of [[0, p(15, -3)], [12, p(10, 2)], [24, p(5, -3)], [36, p(10, -8)]] as [number, Vec2][]) {
    pointClose(points[i], expected);
  }
  for (const vertex of points) close(Math.hypot(vertex.x - center.x, vertex.y - center.y), 5);
  close(points.reduce((sum, v) => sum + v.x, 0) / points.length, center.x);
  close(points.reduce((sum, v) => sum + v.y, 0) / points.length, center.y);
  assert.notDeepEqual(points[0], points.at(-1));
});

test('circle: rotating the radius handle leaves its +X phase unchanged', () => {
  const center = p(10, -3);
  assert.deepEqual(circlePoints(center, p(10, 2)), circlePoints(center, p(15, -3)));
});

function assertRegular(points: Vec2[], center: Vec2, radius: number): void {
  const chord = 2 * radius * Math.sin(Math.PI / points.length);
  for (let i = 0; i < points.length; i++) {
    const a = points[i], b = points[(i + 1) % points.length];
    close(Math.hypot(a.x - center.x, a.y - center.y), radius);
    close(Math.hypot(b.x - a.x, b.y - a.y), chord);
    const cross = (a.x - center.x) * (b.y - center.y) - (a.y - center.y) * (b.x - center.x);
    assert.ok(cross > 0, 'vertices advance counterclockwise');
  }
}

test('circle: every supported segment count is bounded and regular', () => {
  for (let count = 8; count <= 256; count++) {
    const points = circlePoints(p(2, 3), p(5, 7), count);
    assert.equal(points.length, count);
    assertRegular(points, p(2, 3), 5);
  }
});

test('ngon: every supported side count is regular and starts exactly at the edge handle', () => {
  for (let count = 3; count <= 128; count++) {
    const edge = p(5, 7), points = ngonPoints(p(2, 3), edge, count);
    assert.equal(points.length, count);
    assert.deepEqual(points[0], edge);
    assert.notEqual(points[0], edge);
    assertRegular(points, p(2, 3), 5);
  }
});

test('ngon: analytical triangle coordinates and rotation/translation equivariance', () => {
  const triangle = ngonPoints(p(0, 0), p(2, 0), 3);
  pointClose(triangle[0], p(2, 0));
  pointClose(triangle[1], p(-1, Math.sqrt(3)));
  pointClose(triangle[2], p(-1, -Math.sqrt(3)));
  for (const angle of [Math.PI / 2, Math.PI, -0.7, 2.4]) {
    const origin = p(7, -11), result = ngonPoints(origin, rotate(p(2, 0), angle, origin), 3);
    triangle.forEach((point, i) => pointClose(result[i], rotate(point, angle, origin)));
  }
});

for (const [name, generate, invalidCounts] of [
  ['circle', circlePoints, [-Infinity, -1, 0, 3, 7, 8.5, 255.5, 257, Infinity, NaN, 1e12]],
  ['ngon', ngonPoints, [-Infinity, -1, 0, 2, 3.5, 127.5, 129, Infinity, NaN, 1e12]],
] as const) {
  test(`${name}: invalid counts return empty rather than clamp, round or allocate unbounded arrays`, () => {
    for (const count of invalidCounts) assert.deepEqual(generate(p(0, 0), p(1, 0), count), []);
  });
  test(`${name}: nonfinite, zero radius, overflow and unrepresentable geometry returns empty`, () => {
    for (const [center, edge] of [
      [p(2, 3), p(2, 3)], [p(NaN, 0), p(1, 0)], [p(0, Infinity), p(1, 0)],
      [p(0, 0), p(-Infinity, 1)], [p(0, 0), p(1, NaN)],
      [p(-1e308, 0), p(1e308, 0)], [p(0, 0), p(1e308, 1e308)],
      [p(1e308, 1e308), p(1e308, 1e308 - 2e292)],
    ]) assert.deepEqual(generate(center, edge, 48), []);
  });
}

test('primitives: frozen inputs stay unchanged; modifying output cannot change inputs', () => {
  const start = deepFreeze(p(1, 2)), end = deepFreeze(p(5, 7));
  for (const result of [rectanglePoints(start, end), rectanglePoints(start, end, true),
    circlePoints(start, end), ngonPoints(start, end, 5)]) {
    assert.ok(result.length >= 3);
    result.forEach((vertex) => { Object.assign(vertex, { x: 100, y: 200 }); });
    assert.deepEqual(start, p(1, 2));
    assert.deepEqual(end, p(5, 7));
  }
});

for (const [name, stroke, expected] of [
  ['bottom', [p(2, -1), p(2, 1)], [[p(4, 0), p(4, 4), p(0, 4), p(0, 0)]]],
  ['right', [p(3, 2), p(5, 2)], [[p(4, 4), p(0, 4), p(0, 0), p(4, 0)]]],
  ['top', [p(2, 3), p(2, 5)], [[p(0, 4), p(0, 0), p(4, 0), p(4, 4)]]],
  ['closing left', [p(-1, 2), p(1, 2)], [[p(0, 0), p(4, 0), p(4, 4), p(0, 4)]]],
] as [string, Vec2[], Vec2[][]][]) {
  test(`trim: removing ${name} edge preserves all four vertices and the other three edges`, () => {
    const points = square();
    assert.deepEqual(trimOutlineEdges(points, true, stroke), expected);
    assert.deepEqual(trimOutlineEdges(points, true, [...stroke].reverse()), expected);
    assert.deepEqual(points, square());
  });
}

test('trim: two opposite cuts produce two disconnected runs, not a newly connected polygon', () => {
  assert.deepEqual(trimOutlineEdges(square(), true, [p(2, -1), p(2, 5)]), [
    [p(4, 0), p(4, 4)], [p(0, 4), p(0, 0)],
  ]);
  assert.deepEqual(trimOutlineEdges(square(), true, [p(-1, 2), p(5, 2)]), [
    [p(4, 4), p(0, 4)], [p(0, 0), p(4, 0)],
  ]);
});

test('trim: adjacent cuts discard only the isolated singleton and preserve the connected run', () => {
  assert.deepEqual(trimOutlineEdges(square(), true, [p(2, -1), p(2, 2), p(5, 2)]), [
    [p(4, 4), p(0, 4), p(0, 0)],
  ]);
});

test('trim: a triangle loses one edge, not the whole outline', () => {
  assert.deepEqual(trimOutlineEdges([p(0, 0), p(4, 0), p(0, 4)], true, [p(1, -1), p(1, 0.2)]), [
    [p(4, 0), p(0, 4), p(0, 0)],
  ]);
});

test('trim: all edges cut returns [], distinct from null/no cut', () => {
  const stroke = [p(2, 2), p(2, -1), p(2, 2), p(5, 2), p(2, 2), p(2, 5), p(2, 2), p(-1, 2)];
  assert.deepEqual(trimOutlineEdges(square(), true, stroke), []);
  assert.deepEqual(trimOutlineEdges([p(0, 0), p(4, 0)], false, [p(2, -1), p(2, 1)]), []);
});

test('trim: repeated/reversed crossings of one edge remove it once and are deterministic', () => {
  const stroke = [p(2, -1), p(2, 1), p(3, -1), p(3, 1)];
  const expected = [[p(4, 0), p(4, 4), p(0, 4), p(0, 0)]];
  for (let i = 0; i < 5; i++) assert.deepEqual(trimOutlineEdges(square(), true, stroke), expected);
  assert.deepEqual(trimOutlineEdges(square(), true, [...stroke].reverse()), expected);
});

for (const [name, stroke] of [
  ['miss', [p(-2, -2), p(-1, -1)]],
  ['inside only', [p(1, 1), p(3, 3)]],
  ['edge extension only', [p(5, -1), p(5, 1)]],
  ['tangent corner', [p(-1, 1), p(1, -1)]],
  ['diagonal through vertices only', [p(-1, -1), p(5, 5)]],
  ['ends at edge interior', [p(2, -1), p(2, 0)]],
  ['starts at edge interior', [p(2, 0), p(2, 1)]],
  ['ends at vertex', [p(-1, -1), p(0, 0)]],
  ['starts at vertex', [p(0, 0), p(1, 1)]],
  ['bounces off edge', [p(1, -1), p(2, 0), p(3, -1)]],
  ['collinear overlap', [p(-1, 0), p(5, 0)]],
  ['collinear interior travel', [p(1, 0), p(3, 0)]],
  ['collinear travel between opposite sides', [p(1, -1), p(1, 0), p(3, 0), p(3, 1)]],
  ['near miss', [p(2, -1), p(2, -1e-10)]],
] as [string, Vec2[]][]) {
  test(`trim: ${name} is not a strict crossing`, () => {
    assert.equal(trimOutlineEdges(square(), true, stroke), null);
    assert.equal(trimOutlineEdges(square(), true, [...stroke].reverse()), null);
  });
}

test('trim: sampled interior crossing counts, including duplicate stationary samples', () => {
  for (const stroke of [
    [p(2, -1), p(2, 0), p(2, 1)],
    [p(2, -1), p(2, 0), p(2, 0), p(2, 0), p(2, 1)],
    [p(1, -1), p(2, 0), p(3, 1)],
  ]) {
    const expected = [[p(4, 0), p(4, 4), p(0, 4), p(0, 0)]];
    assert.deepEqual(trimOutlineEdges(square(), true, stroke), expected);
    assert.deepEqual(trimOutlineEdges(square(), true, [...stroke].reverse()), expected);
  }
});

test('trim: touching one edge does not hide a proper crossing of another edge', () => {
  assert.deepEqual(trimOutlineEdges(square(), true, [p(2, 0), p(2, 5)]), [
    [p(0, 4), p(0, 0), p(4, 0), p(4, 4)],
  ]);
});

test('trim: open polyline splits in original order and never inserts a closing edge', () => {
  const points = [p(0, 0), p(2, 0), p(4, 0), p(6, 0), p(8, 0)];
  assert.deepEqual(trimOutlineEdges(points, false, [p(3, -1), p(3, 1)]), [
    [p(0, 0), p(2, 0)], [p(4, 0), p(6, 0), p(8, 0)],
  ]);
  assert.deepEqual(trimOutlineEdges(points, false, [p(1, -1), p(1, 1)]), [points.slice(1)]);
  assert.deepEqual(trimOutlineEdges(points, false, [p(7, -1), p(7, 1)]), [points.slice(0, -1)]);
  const openSquare = square();
  assert.equal(trimOutlineEdges(openSquare, false, [p(-1, 2), p(1, 2)]), null);
});

test('trim: open multi-cuts retain unrelated remote vertices without bridging gaps', () => {
  const points = [p(0, 0), p(2, 0), p(4, 0), p(6, 0), p(8, 0), p(10, 0), p(12, 0)];
  assert.deepEqual(trimOutlineEdges(points, false, [p(3, -1), p(3, 1), p(9, 1), p(9, -1)]), [
    [p(0, 0), p(2, 0)], [p(4, 0), p(6, 0), p(8, 0)], [p(10, 0), p(12, 0)],
  ]);
});

test('trim: adjacent open cuts discard singletons, not disconnected surviving edges', () => {
  const points = [p(0, 0), p(2, 0), p(4, 0), p(6, 0), p(8, 0)];
  assert.deepEqual(trimOutlineEdges(points, false, [p(1, -1), p(1, 1), p(3, 1), p(3, -1)]), [
    [p(4, 0), p(6, 0), p(8, 0)],
  ]);
});

test('trim: winding reversal preserves surviving edges and reverses run direction', () => {
  assert.deepEqual(trimOutlineEdges(square().reverse(), true, [p(2, -1), p(2, 1)]), [
    [p(0, 0), p(0, 4), p(4, 4), p(4, 0)],
  ]);
});

test('trim: rotation/translation, tiny scales and large finite coordinates preserve edge identity', () => {
  for (const [angle, origin, scale] of [
    [0, p(0, 0), 1e-200], [0, p(0, 0), 1e200],
    [0.7, p(7, -11), 1], [-1.2, p(-20, 30), 3],
  ] as [number, Vec2, number][]) {
    const transform = (point: Vec2): Vec2 => rotate(p(point.x * scale, point.y * scale), angle, origin);
    const points = square().map(transform), stroke = [p(2, -1), p(2, 1)].map(transform);
    assert.deepEqual(trimOutlineEdges(points, true, stroke), [[points[1], points[2], points[3], points[0]]]);
  }
});

test('trim: invalid outline, invalid stroke, degenerate edges or overflow return null atomically', () => {
  for (const points of [[], [p(0, 0)], [p(0, 0), p(0, 0)],
    [p(0, 0), p(4, 0), p(4, 0), p(0, 4)], [p(0, 0), p(4, 0), p(NaN, 4)],
    [p(0, 0), p(4, 0), p(8, 0)],
    [p(-1e308, 0), p(1e308, 0), p(0, 4)]]) {
    assert.equal(trimOutlineEdges(points, true, [p(2, -1), p(2, 1)]), null);
  }
  assert.equal(trimOutlineEdges([p(0, 0), p(4, 0)], true, [p(2, -1), p(2, 1)]), null);
  for (const stroke of [[], [p(2, 0)], [p(2, 0), p(2, 0)],
    [p(2, -1), p(2, 1), p(Infinity, 1)], [p(2, -1), p(NaN, 1)],
    [p(-1e308, -1), p(1e308, 1)]]) {
    assert.equal(trimOutlineEdges(square(), true, stroke), null);
  }
});

test('trim: point bounds reject oversized inputs without truncating valid prefixes', () => {
  const stroke = [p(2, -1), ...Array.from({ length: 4095 }, () => p(2, 1))];
  assert.ok(trimOutlineEdges(square(), true, stroke));
  assert.equal(trimOutlineEdges(square(), true, [...stroke, p(2, 1)]), null);
  const points = Array.from({ length: 4096 }, (_, i) => p(i, 0));
  assert.deepEqual(trimOutlineEdges(points, false, [p(0.5, -1), p(0.5, 1)]), [points.slice(1)]);
  assert.equal(trimOutlineEdges([...points, p(4096, 0)], false, [p(0.5, -1), p(0.5, 1)]), null);
});

test('trim: frozen inputs, no aliasing, repeatability and no mutation even when no cut occurs', () => {
  const points = deepFreeze(square()), stroke = deepFreeze([p(2, -1), p(2, 5)]);
  const snapshot = structuredClone({ points, stroke });
  const first = trimOutlineEdges(points, true, stroke);
  const second = trimOutlineEdges(points, true, stroke);
  assert.deepEqual(first, second);
  assert.ok(first && second);
  assert.notEqual(first, second);
  Object.assign(first[0][0], { x: 100 });
  first[0].push(p(200, 200));
  first.pop();
  assert.deepEqual(second, [[p(4, 0), p(4, 4)], [p(0, 4), p(0, 0)]]);
  assert.equal(trimOutlineEdges(points, true, deepFreeze([p(1, 1), p(2, 2)])), null);
  assert.deepEqual({ points, stroke }, snapshot);
});

test('trim: exhaustive convex edge subsets preserve exactly the uncut original edges', () => {
  const key = (a: Vec2, b: Vec2): string => JSON.stringify([a, b]);
  for (let n = 3; n <= 8; n++) for (const closed of [false, true]) {
    const points = ngonPoints(p(0, 0), p(10, 0), n);
    const edgeCount = closed ? n : n - 1;
    for (let mask = 0; mask < 2 ** edgeCount; mask++) {
      const stroke = [p(0, 0)], expected: string[] = [];
      for (let i = 0; i < edgeCount; i++) {
        const a = points[i], b = points[(i + 1) % n];
        if (mask & (1 << i)) {
          // Twice the midpoint is outside the chosen convex edge; returning to
          // the center cannot intersect any other edge.
          stroke.push(p(a.x + b.x, a.y + b.y), p(0, 0));
        } else expected.push(key(a, b));
      }
      if (mask === 0) stroke.push(p(1, 0));
      const result = trimOutlineEdges(points, closed, stroke);
      if (mask === 0) {
        assert.equal(result, null);
        continue;
      }
      assert.ok(result);
      const actual: string[] = [];
      for (const run of result) {
        assert.ok(run.length >= 2, 'no singleton runs');
        for (let i = 1; i < run.length; i++) actual.push(key(run[i - 1], run[i]));
      }
      assert.deepEqual(actual.sort(), expected.sort(), `${n} vertices closed=${closed} mask=${mask}`);
      assert.deepEqual(trimOutlineEdges(points, closed, [...stroke].reverse()), result);
    }
  }
});

test('trim: collinear stroke subdivision at crossings does not alter the result', () => {
  for (const stroke of [[p(2, -1), p(2, 5)], [p(-1, 2), p(5, 2)]]) {
    const a = stroke[0], b = stroke[1];
    const samples = Array.from({ length: 7 }, (_, i) => p(a.x + (b.x - a.x) * i / 6, a.y + (b.y - a.y) * i / 6));
    assert.deepEqual(trimOutlineEdges(square(), true, samples), trimOutlineEdges(square(), true, stroke));
  }
});

test('trim: rotated touch and tangent cases remain non-cuts at small and large scales', () => {
  for (const scale of [1e-150, 1, 1e150]) for (const angle of [0.7, -1.2]) {
    const transform = (point: Vec2): Vec2 => rotate(p(point.x * scale, point.y * scale), angle);
    const points = square().map(transform);
    for (const stroke of [[p(2, -1), p(2, 0)], [p(-1, 1), p(1, -1)],
      [p(-1, 0), p(5, 0)], [p(1, -1), p(2, 0), p(3, -1)]]) {
      assert.equal(trimOutlineEdges(points, true, stroke.map(transform)), null);
    }
  }
});
