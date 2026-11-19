import { Arc, Point, Segment, Ray, Vector, Box, PlanarSet, Utils } from '@flatten-js/core';
import type { Vec2 } from '../types';

export type TrimMethod = 'power' | 'closest' | 'extend';
export interface SketchOutline { id: string; points: Vec2[]; closed: boolean; primitive?: string }
export interface TrimRun { points: Vec2[]; circle: boolean }
export interface TrimResult { changes: Map<string, TrimRun[]>; preview: Vec2[][] }
type Geometry = Segment | Arc;
type Entity = { owner: SketchOutline; index: number; geometry: Geometry; fullCircle: boolean; cuts: number[] };
type Interval = { entity: Entity; start: number; end: number };
const EPS = 1e-9;
const TAU = 2 * Math.PI;
const finite = (p: Vec2) => Number.isFinite(p.x) && Number.isFinite(p.y);
const mod = (n: number) => ((n % TAU) + TAU) % TAU;
const clamp = (n: number) => Math.max(0, Math.min(1, n));
const cross = (a: Vec2, b: Vec2) => a.x * b.y - a.y * b.x;
const subtract = (a: Vec2, b: Vec2) => ({ x: a.x - b.x, y: a.y - b.y });

function precise<T>(work: () => T): T {
  const previous = Utils.getTolerance();
  Utils.setTolerance(1e-10);
  try { return work(); } finally { Utils.setTolerance(previous); }
}

function circular(points: Point[], outline: SketchOutline): Arc | null {
  if (outline.primitive !== 'circle' && !(outline.primitive === undefined && outline.closed && points.length === 48)) return null;
  if (points.length < 3) return null;
  const a = points[0], b = points[Math.floor((points.length - 1) / 2)], c = outline.closed ? points[Math.floor(points.length * 2 / 3)] : points[points.length - 1];
  const u = subtract(b, a), v = subtract(c, a), determinant = 2 * cross(u, v);
  if (Math.abs(determinant) < Math.hypot(u.x, u.y) * Math.hypot(v.x, v.y) * 1e-12) return null;
  const uu = u.x * u.x + u.y * u.y, vv = v.x * v.x + v.y * v.y;
  const center = new Point(a.x + (v.y * uu - u.y * vv) / determinant, a.y + (u.x * vv - v.x * uu) / determinant);
  const radius = Math.hypot(a.x - center.x, a.y - center.y);
  if (radius < EPS * 100) throw new Error('Sketch features exceed relative trim precision. No shapes changed.');
  if (!finite(center) || radius < EPS) return null;
  if (points.some(p => Math.abs(Math.hypot(p.x - center.x, p.y - center.y) - radius) > Math.max(EPS, radius * 1e-5))) return null;
  const angles = points.map(p => Math.atan2(p.y - center.y, p.x - center.x));
  const direction = Math.sign(Math.sin(angles[1] - angles[0]));
  if (!direction) return null;
  let sweep = 0;
  for (let i = 1; i < points.length; i++) {
    const step = mod(direction * (angles[i] - angles[i - 1]));
    if (step < EPS || step > Math.PI) return null;
    if (outline.primitive === undefined && Math.abs(step - TAU / 48) > 1e-5) return null;
    sweep += step;
  }
  if (outline.closed) sweep += mod(direction * (angles[0] - angles[angles.length - 1]));
  if (sweep > TAU + 1e-7 || (outline.closed && Math.abs(sweep - TAU) > 1e-7)) return null;
  return new Arc(center, radius, angles[0], angles[0] + direction * (outline.closed ? TAU : sweep), direction > 0);
}

function parameter(entity: Entity, point: Point): number {
  const g = entity.geometry;
  if (g instanceof Arc) return mod((g.counterClockwise ? 1 : -1) * (Math.atan2(point.y - g.pc.y, point.x - g.pc.x) - g.startAngle)) / g.sweep;
  const d = subtract(g.end, g.start), p = subtract(point, g.start);
  return (p.x * d.x + p.y * d.y) / (d.x * d.x + d.y * d.y);
}

function tangent(entity: Entity, point: Point): Vec2 {
  const g = entity.geometry;
  const vector = g instanceof Arc ? { x: -(point.y - g.pc.y), y: point.x - g.pc.x } : subtract(g.end, g.start);
  const length = Math.hypot(vector.x, vector.y);
  return { x: vector.x / length, y: vector.y / length };
}

function intervals(entity: Entity): Interval[] {
  const sorted = [...entity.cuts].sort((a, b) => a - b).filter((n, i, all) => !i || n - all[i - 1] > EPS);
  if (entity.fullCircle) {
    if (sorted.length < 2) return [{ entity, start: 0, end: 1 }];
    return sorted.map((start, i) => ({ entity, start, end: i + 1 < sorted.length ? sorted[i + 1] : sorted[0] + 1 }));
  }
  const breaks = [0, ...sorted.filter(n => n > EPS && n < 1 - EPS), 1];
  return breaks.slice(0, -1).map((start, i) => ({ entity, start, end: breaks[i + 1] }));
}

function includes(interval: Interval, t: number): boolean {
  if (interval.end > 1 && t < interval.start) t += 1;
  return t >= interval.start - EPS && t <= interval.end + EPS;
}

/** Immutable prepared sketch: geometry is normalized, indexed once and never
 * committed by preview. FlattenJS owns line/arc intersection and distance math.
 */
export function prepareSketchTrim(input: SketchOutline[]) {
  return precise(() => {
    const outlines = input.map(o => ({ ...o, points: o.points.map(p => ({ ...p })) }));
    const ids = new Set<string>();
    for (const o of outlines) {
      if (ids.has(o.id)) throw new Error('Duplicate sketch outline. No shapes changed.');
      ids.add(o.id);
      if (o.points.length > 4096 || !o.points.every(finite)) throw new Error('Invalid or oversized sketch outline. No shapes changed.');
    }
    const all = outlines.flatMap(o => o.points);
    const origin = all[0] ?? { x: 0, y: 0 };
    let scale = 0;
    for (const p of all) scale = Math.max(scale, Math.abs(p.x - origin.x), Math.abs(p.y - origin.y));
    if (!Number.isFinite(scale)) throw new Error('Sketch coordinate range is too large. No shapes changed.');
    if (!scale) scale = 1;
    const normalized = (p: Vec2) => new Point((p.x - origin.x) / scale, (p.y - origin.y) / scale);
    const world = (p: Vec2): Vec2 => ({ x: origin.x + p.x * scale, y: origin.y + p.y * scale });
    const entities: Entity[] = [];
    const byOwner = new Map<string, Entity[]>();
    for (const outline of outlines) {
      let points = outline.points.map(normalized);
      const arc = circular(points, outline), list: Entity[] = [];
      if (!arc) {
        outline.points = outline.points.filter((p, i, all) => !i || p.x !== all[i - 1].x || p.y !== all[i - 1].y);
        // Display tessellation must not introduce boundaries in a straight sketch line.
        let changed = true;
        while (changed) {
          changed = false;
          outline.points = outline.points.filter((p, i, all) => {
            if (!outline.closed && (!i || i === all.length - 1)) return true;
            const a = subtract(normalized(p), normalized(all[(i + all.length - 1) % all.length]));
            const b = subtract(normalized(all[(i + 1) % all.length]), normalized(p));
            if (Math.abs(cross(a, b)) <= Math.hypot(a.x, a.y) * Math.hypot(b.x, b.y) * 1e-12 && a.x * b.x + a.y * b.y > 0) { changed = true; return false; }
            return true;
          });
        }
        points = outline.points.map(normalized);
      }
      if (arc) list.push({ owner: outline, index: 0, geometry: arc, fullCircle: outline.closed, cuts: [] });
      else for (let i = 0; i < points.length - (outline.closed ? 0 : 1); i++) {
        const a = points[i], b = points[(i + 1) % points.length];
        const length = Math.hypot(a.x - b.x, a.y - b.y);
        if (length === 0) continue;
        if (length < EPS) throw new Error('Sketch features exceed relative trim precision. No shapes changed.');
        list.push({ owner: outline, index: i, geometry: new Segment(a, b), fullCircle: false, cuts: [] });
      }
      byOwner.set(outline.id, list); entities.push(...list);
    }
    if (entities.length > 2048) throw new Error('Too many sketch edges to trim safely. No shapes changed.');
    const spatial = new PlanarSet();
    for (const entity of entities) spatial.add(entity.geometry);
    const owners = new Map(entities.map((entity, index) => [entity.geometry, { entity, index }]));
    let pairs = 0;
    for (let i = 0; i < entities.length; i++) for (const shape of spatial.search(entities[i].geometry.box)) {
      const other = owners.get(shape as Geometry);
      if (!other || other.index <= i) continue;
      const a = entities[i], b = other.entity;
      if (++pairs > 500000) throw new Error('Too many sketch intersections. No shapes changed.');
      for (const p of a.geometry.intersect(b.geometry)) {
        if (!finite(p) || Math.abs(cross(tangent(a, p), tangent(b, p))) < 1e-8) continue;
        for (const entity of [a, b]) {
          const t = parameter(entity, p);
          if (t >= -EPS && t <= 1 + EPS) entity.cuts.push(entity.fullCircle && t > 1 - EPS ? 0 : clamp(t));
        }
      }
    }
    const parts = entities.flatMap(intervals);
    const entityParts = new Map<Entity, Interval[]>(), ownerParts = new Map<string, Interval[]>();
    for (const part of parts) {
      if (!entityParts.has(part.entity)) entityParts.set(part.entity, []);
      if (!ownerParts.has(part.entity.owner.id)) ownerParts.set(part.entity.owner.id, []);
      entityParts.get(part.entity)!.push(part); ownerParts.get(part.entity.owner.id)!.push(part);
    }

    function sample(part: Interval): Vec2[] {
      const g = part.entity.geometry;
      if (g instanceof Segment) {
        const a = part.entity.owner.points[part.entity.index], b = part.entity.owner.points[(part.entity.index + 1) % part.entity.owner.points.length];
        return [part.start, part.end].map(t => t === 0 ? { ...a } : t === 1 ? { ...b } : { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t });
      }
      const count = Math.max(8, Math.ceil((part.end - part.start) * g.sweep / TAU * 48));
      return Array.from({ length: count + 1 }, (_, i) => {
        let t = part.start + (part.end - part.start) * i / count;
        if (part.entity.fullCircle) t = ((t % 1) + 1) % 1;
        const p = g.pointAtLength(clamp(t) * g.length);
        if (!p) throw new Error('Cannot sample trimmed arc. No shapes changed.');
        return world(p);
      });
    }

    function selectedAt(point: Point, targets: ReadonlySet<string>, tolerance: number) {
      let best: { entity: Entity; point: Point; distance: number } | undefined;
      for (const shape of spatial.search(new Box(point.x - tolerance, point.y - tolerance, point.x + tolerance, point.y + tolerance))) {
        const entity = owners.get(shape as Geometry)!.entity;
        if (!targets.has(entity.owner.id)) continue;
        const [distance, segment] = point.distanceTo(entity.geometry);
        if (distance <= tolerance && (!best || distance < best.distance)) best = { entity, point: segment.end, distance };
      }
      return best;
    }

    function extendAt(point: Point, targets: ReadonlySet<string>, tolerance: number): TrimResult {
      const result: TrimResult = { changes: new Map(), preview: [] };
      const eligible = new Set([...targets].filter(id => !byOwner.get(id)?.[0]?.owner.closed));
      const best = selectedAt(point, eligible, tolerance);
      if (!best || !(best.entity.geometry instanceof Segment)) return result;
      const entity = best.entity, g = entity.geometry as Segment, ownerEntities = byOwner.get(entity.owner.id)!;
      const start = parameter(entity, best.point) < .5;
      if (start ? entity !== ownerEntities[0] : entity !== ownerEntities[ownerEntities.length - 1]) return result;
      const end = start ? g.start : g.end, other = start ? g.end : g.start, d = subtract(end, other);
      const ray = new Ray(end, new Vector(-d.y, d.x));
      let next: Point | undefined, distance = Infinity;
      for (const boundary of entities) {
        if (boundary === entity) continue;
        for (const p of ray.intersect(boundary.geometry)) {
          const length = Math.hypot(p.x - end.x, p.y - end.y);
          if (finite(p) && length > EPS && length < distance) { next = p; distance = length; }
        }
      }
      if (!next) return result;
      const points = entity.owner.points.map(p => ({ ...p }));
      points[start ? 0 : points.length - 1] = world(next);
      result.changes.set(entity.owner.id, [{ points, circle: false }]);
      result.preview.push([world(end), world(next)]);
      return result;
    }

    function apply(stroke: Vec2[], targets: ReadonlySet<string>, method: TrimMethod, tolerance: number): TrimResult {
      return precise(() => {
        const result: TrimResult = { changes: new Map(), preview: [] };
        if (!stroke.length || stroke.length > 4096 || !stroke.every(finite) || !Number.isFinite(tolerance) || tolerance < 0) return result;
        const points = stroke.filter((p, i) => !i || p.x !== stroke[i - 1].x || p.y !== stroke[i - 1].y).map(normalized);
        if (!points.every(finite)) return result;
        if (method === 'extend') {
          const first = extendAt(points[0], targets, tolerance / scale);
          for (let i = 1; i < points.length; i++) {
            if (Math.hypot(points[i].x - points[i - 1].x, points[i].y - points[i - 1].y) < EPS) continue;
            const segment = new Segment(points[i - 1], points[i]);
            for (const shape of spatial.search(segment.box)) {
              const entity = owners.get(shape as Geometry)!.entity;
              if (!targets.has(entity.owner.id) || first.changes.has(entity.owner.id)) continue;
              for (const point of entity.geometry.intersect(segment)) {
                const next = extendAt(point, new Set([entity.owner.id]), tolerance / scale);
                for (const [id, runs] of next.changes) first.changes.set(id, runs);
                first.preview.push(...next.preview);
              }
            }
          }
          return first;
        }
        const removed = new Set<Interval>();
        const changedOwners = new Set<string>();
        const mark = (entity: Entity, p: Point) => {
          const t = clamp(parameter(entity, p));
          const candidates = entityParts.get(entity)!;
          let lo = 0, hi = candidates.length;
          while (lo < hi) { const mid = (lo + hi) >>> 1; if (candidates[mid].start <= t + EPS) lo = mid + 1; else hi = mid; }
          const part = candidates[Math.max(0, lo - 1)];
          const hit = includes(part, t) ? part : candidates[candidates.length - 1];
          if (includes(hit, t)) { removed.add(hit); changedOwners.add(entity.owner.id); }
        };
        if (method === 'closest') {
          const best = selectedAt(points[0], targets, tolerance / scale);
          if (best) mark(best.entity, best.point);
        } else {
          let intersections = 0;
          for (let i = 1; i < points.length; i++) {
            const a = points[i - 1], b = points[i];
            if (Math.hypot(a.x - b.x, a.y - b.y) < EPS) continue;
            const segment = new Segment(a, b);
            for (const shape of spatial.search(segment.box)) {
              const entity = owners.get(shape as Geometry)!.entity;
              if (!targets.has(entity.owner.id)) continue;
              if (++intersections > 500000) throw new Error('Trim stroke is too complex. No shapes changed.');
              for (const p of entity.geometry.intersect(segment)) {
                const t = parameter(entity, p);
                if (!entity.fullCircle && (t <= EPS || t >= 1 - EPS)) continue;
                const tangentVector = tangent(entity, p);
                const side = (point: Point) => {
                  const value = cross(tangentVector, subtract(point, p));
                  return Math.abs(value) < EPS ? 0 : Math.sign(value);
                };
                let left = side(a), right = side(b);
                for (let j = i - 2; !left && j >= 0; j--) {
                  if (++intersections > 500000) throw new Error('Trim stroke is too complex. No shapes changed.');
                  left = side(points[j]);
                }
                for (let j = i + 1; !right && j < points.length; j++) {
                  if (++intersections > 500000) throw new Error('Trim stroke is too complex. No shapes changed.');
                  right = side(points[j]);
                }
                if (left * right < 0) mark(entity, p);
              }
            }
          }
        }
        for (const part of removed) result.preview.push(sample(part));
        for (const id of targets) {
          const ownerEntities = byOwner.get(id);
          if (!ownerEntities?.length || !changedOwners.has(id)) continue;
          const owner = ownerEntities[0].owner;
          const retained = ownerParts.get(id)!.filter(part => !removed.has(part));
          if (ownerEntities[0].geometry instanceof Arc) {
            const arcs: Interval[] = [];
            for (const part of retained) {
              const last = arcs[arcs.length - 1];
              if (last && Math.abs(last.end - part.start) < EPS) last.end = part.end;
              else arcs.push({ ...part });
            }
            if (ownerEntities[0].fullCircle && arcs.length > 1 && Math.abs(arcs[arcs.length - 1].end - arcs[0].start - 1) < EPS) {
              arcs[0] = { ...arcs[arcs.length - 1], end: arcs[0].end + 1 }; arcs.pop();
            }
            result.changes.set(id, arcs.map(part => ({ points: sample(part), circle: true })));
            continue;
          }
          const runs: { points: Vec2[]; first: Interval; last: Interval }[] = [];
          for (const part of retained) {
            const previous = runs[runs.length - 1], vertices = sample(part);
            if (previous && ((previous.last.entity === part.entity && Math.abs(previous.last.end - part.start) < EPS)
              || (previous.last.end === 1 && part.start === 0 && previous.last.entity.index + 1 === part.entity.index))) {
              previous.points.push(...vertices.slice(1)); previous.last = part;
            } else runs.push({ points: vertices, first: part, last: part });
          }
          if (owner.closed && runs.length > 1) {
            const first = runs[0], last = runs[runs.length - 1];
            if (last.last.end === 1 && first.first.start === 0 && last.last.entity === ownerEntities[ownerEntities.length - 1] && first.first.entity === ownerEntities[0]) {
              first.points = [...last.points, ...first.points.slice(1)]; runs.pop();
            }
          }
          result.changes.set(id, runs.map(run => ({ points: run.points, circle: false })));
        }
        return result;
      });
    }
    return { apply };
  });
}
