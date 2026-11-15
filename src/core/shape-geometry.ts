import type { Vec2 } from '../types';

const MAX_TRIM_POINTS = 4096;
const finitePoint = (p: Vec2): boolean => Number.isFinite(p.x) && Number.isFinite(p.y);
const samePoint = (a: Vec2, b: Vec2): boolean => a.x === b.x && a.y === b.y;
const copyPoint = (p: Vec2): Vec2 => ({ x: p.x, y: p.y });

function orientation(a: Vec2, b: Vec2, p: Vec2): number {
  const x = b.x - a.x, y = b.y - a.y;
  const px = p.x - a.x, py = p.y - a.y;
  const scale = Math.max(Math.abs(x), Math.abs(y), Math.abs(px), Math.abs(py));
  if (scale === 0) return 0;
  const left = (x / scale) * (py / scale), right = (y / scale) * (px / scale);
  const determinant = left - right;
  const roundoff = 16 * Number.EPSILON * (Math.abs(left) + Math.abs(right));
  return Math.abs(determinant) <= roundoff ? 0 : Math.sign(determinant);
}

function validPolygon(points: Vec2[]): boolean {
  return validPath(points, 3)
    && points.every((p, i) => !samePoint(p, points[(i + 1) % points.length]))
    && points.some((p) => orientation(points[0], points[1], p) !== 0);
}

/** Four unclosed corners in drag order. Invalid/zero-area geometry returns [].
 * Square uses the larger drag extent; an exactly zero axis chooses the positive side.
 */
export function rectanglePoints(start: Vec2, end: Vec2, square = false): Vec2[] {
  if (!finitePoint(start) || !finitePoint(end)) return [];
  const dx = end.x - start.x, dy = end.y - start.y;
  if (!Number.isFinite(dx) || !Number.isFinite(dy)) return [];
  let x = end.x, y = end.y;
  if (square) {
    const side = Math.max(Math.abs(dx), Math.abs(dy));
    x = start.x + (dx < 0 ? -side : side);
    y = start.y + (dy < 0 ? -side : side);
  }
  const points = [copyPoint(start), { x, y: start.y }, { x, y }, { x: start.x, y }];
  return validPolygon(points) ? points : [];
}

function radialPoints(center: Vec2, edge: Vec2, count: number, aligned: boolean): Vec2[] {
  if (!finitePoint(center) || !finitePoint(edge)) return [];
  const dx = edge.x - center.x, dy = edge.y - center.y;
  const radius = Math.hypot(dx, dy);
  if (!Number.isFinite(radius) || radius === 0) return [];
  const startAngle = aligned ? Math.atan2(dy, dx) : 0;
  const points = Array.from({ length: count }, (_, i) => {
    const angle = startAngle + i * 2 * Math.PI / count;
    return { x: center.x + radius * Math.cos(angle), y: center.y + radius * Math.sin(angle) };
  });
  if (aligned) points[0] = copyPoint(edge);
  return validPolygon(points) ? points : [];
}

/** Unclosed circle approximation, starting on +X; integer segments must be 8..256. */
export function circlePoints(center: Vec2, edge: Vec2, segments = 48): Vec2[] {
  if (!Number.isInteger(segments) || segments < 8 || segments > 256) return [];
  return radialPoints(center, edge, segments, false);
}

/** Regular unclosed polygon, first vertex at edge; integer sides must be 3..128. */
export function ngonPoints(center: Vec2, edge: Vec2, sides: number): Vec2[] {
  if (!Number.isInteger(sides) || sides < 3 || sides > 128) return [];
  return radialPoints(center, edge, sides, true);
}

function insideEdge(p: Vec2, a: Vec2, b: Vec2): boolean {
  return !samePoint(p, a) && !samePoint(p, b)
    && p.x >= Math.min(a.x, b.x) && p.x <= Math.max(a.x, b.x)
    && p.y >= Math.min(a.y, b.y) && p.y <= Math.max(a.y, b.y);
}

function crossesEdge(a: Vec2, b: Vec2, stroke: Vec2[]): boolean {
  let previousSide = orientation(a, b, stroke[0]);
  for (let i = 1; i < stroke.length; i++) {
    const c = stroke[i - 1], d = stroke[i];
    const side = orientation(a, b, d);
    if (previousSide * side < 0
      && orientation(c, d, a) * orientation(c, d, b) < 0) return true;
    // A pointer sample exactly on the edge is a crossing only when it continues
    // through the edge. Endpoints, bounces and collinear travel are not cuts.
    if (previousSide === 0 && i >= 2 && side !== 0 && insideEdge(c, a, b)
      && orientation(a, b, stroke[i - 2]) * side < 0) return true;
    previousSide = side;
  }
  return false;
}

function validPath(points: Vec2[], minimum: number): boolean {
  if (points.length < minimum || points.length > MAX_TRIM_POINTS || !points.every(finitePoint)) return false;
  let minX = points[0].x, maxX = minX, minY = points[0].y, maxY = minY;
  for (const p of points) {
    minX = Math.min(minX, p.x);
    maxX = Math.max(maxX, p.x);
    minY = Math.min(minY, p.y);
    maxY = Math.max(maxY, p.y);
  }
  return Number.isFinite(maxX - minX) && Number.isFinite(maxY - minY);
}

/**
 * Remove strictly crossed edges, never vertices from surviving edges (C03/C09/S08).
 * All geometry uses the caller's common coordinate space; no scope/store/UI policy.
 * null = no cut or invalid input; [] = all edges cut. Otherwise every result is OPEN,
 * contains only copied original vertices, and has at least one edge. No intersections
 * are inserted. Outline endpoints/tangencies/collinear overlap do not count as cuts.
 * Internal stroke vertices count only when crossing from one side to the other.
 * Consecutive duplicate stroke samples are ignored; zero-length outline edges and
 * wholly collinear closed outlines are invalid. Collinear open polylines are valid.
 * Closed runs start after the lowest-index cut and follow original winding; open runs
 * follow original order. Inputs are never changed or aliased by the output.
 * At most 4096 points per input; O(outline * stroke) time and O(outline + stroke) space.
 */
export function trimOutlineEdges(points: Vec2[], closed: boolean, stroke: Vec2[]): Vec2[][] | null {
  if (!validPath(points, closed ? 3 : 2) || !validPath(stroke, 2)) return null;
  if (closed && !validPolygon(points)) return null;
  const samples = stroke.filter((p, i) => i === 0 || !samePoint(p, stroke[i - 1]));
  if (samples.length < 2) return null;
  const edgeCount = closed ? points.length : points.length - 1;
  const cut = new Array<boolean>(edgeCount).fill(false);
  for (let i = 0; i < edgeCount; i++) {
    const a = points[i], b = points[(i + 1) % points.length];
    if (samePoint(a, b)) return null;
    cut[i] = crossesEdge(a, b, samples);
  }
  const firstCut = cut.indexOf(true);
  if (firstCut < 0) return null;
  const runs: Vec2[][] = [];
  let run: Vec2[] = [];
  const start = closed ? (firstCut + 1) % edgeCount : 0;
  for (let offset = 0; offset < edgeCount; offset++) {
    const i = (start + offset) % edgeCount;
    if (cut[i]) {
      if (run.length > 1) runs.push(run);
      run = [];
    } else {
      if (run.length === 0) run.push(copyPoint(points[i]));
      run.push(copyPoint(points[(i + 1) % points.length]));
    }
  }
  if (run.length > 1) runs.push(run);
  return runs;
}
