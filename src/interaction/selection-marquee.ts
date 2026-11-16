import type { Body, MechanismState, Vec2 } from '../types';
import { computeBodyTransform, localToWorld } from '../core/body-transform';
import { cross, sub } from '../core/math/vec2';
import { getImageCorners } from '../renderer/draw-images';
import { springPolyline } from '../core/spring-geometry';

export type SelectionRegion =
  | { kind: 'box'; start: Vec2; end: Vec2 }
  | { kind: 'lasso'; points: Vec2[] };

const finitePoint = (p: Vec2): boolean => Number.isFinite(p.x) && Number.isFinite(p.y);
const samePoint = (a: Vec2, b: Vec2): boolean => a.x === b.x && a.y === b.y;

function orientation(a: Vec2, b: Vec2, p: Vec2): number {
  const ab = sub(b, a), ap = sub(p, a);
  const determinant = cross(ab, ap);
  const roundoff = 16 * Number.EPSILON * (Math.abs(ab.x * ap.y) + Math.abs(ab.y * ap.x));
  return Math.abs(determinant) <= roundoff ? 0 : Math.sign(determinant);
}

function onSegment(p: Vec2, a: Vec2, b: Vec2): boolean {
  return orientation(a, b, p) === 0
    && p.x >= Math.min(a.x, b.x) && p.x <= Math.max(a.x, b.x)
    && p.y >= Math.min(a.y, b.y) && p.y <= Math.max(a.y, b.y);
}

function segmentsIntersect(a: Vec2, b: Vec2, c: Vec2, d: Vec2): boolean {
  const ac = orientation(a, b, c), ad = orientation(a, b, d);
  const ca = orientation(c, d, a), cb = orientation(c, d, b);
  return (ac * ad < 0 && ca * cb < 0)
    || (ac === 0 && onSegment(c, a, b)) || (ad === 0 && onSegment(d, a, b))
    || (ca === 0 && onSegment(a, c, d)) || (cb === 0 && onSegment(b, c, d));
}

function contains(p: Vec2, polygon: Vec2[]): boolean {
  if (!finitePoint(p)) return false;
  let inside = false;
  for (let i = 0; i < polygon.length; i++) {
    const a = polygon[i], b = polygon[(i + 1) % polygon.length];
    if (onSegment(p, a, b)) return true;
    if ((a.y > p.y) !== (b.y > p.y)) {
      const x = a.x + (b.x - a.x) * ((p.y - a.y) / (b.y - a.y));
      if (p.x < x) inside = !inside;
    }
  }
  return inside;
}

/** Normalize repeated pointer samples/closing vertex, rejecting non-simple or zero-area polygons. */
function validPolygon(input: Vec2[]): Vec2[] | null {
  if (!input.every(finitePoint)) return null;
  const points = input.filter((p, i) => i === 0 || !samePoint(p, input[i - 1]));
  if (points.length > 1 && samePoint(points[0], points[points.length - 1])) points.pop();
  if (points.length < 3) return null;
  let area = 0, magnitude = 0;
  for (let i = 1; i < points.length - 1; i++) {
    const term = cross(sub(points[i], points[0]), sub(points[i + 1], points[0]));
    area += term;
    magnitude += Math.abs(term);
  }
  if (!Number.isFinite(area) || !Number.isFinite(magnitude)
    || Math.abs(area) <= 16 * Number.EPSILON * magnitude) return null;
  for (let i = 0; i < points.length; i++) {
    const next = (i + 1) % points.length;
    const after = (i + 2) % points.length;
    // Adjacent edges may continue straight, but must not double back over each other.
    if (onSegment(points[after], points[i], points[next])
      || onSegment(points[i], points[next], points[after])) return null;
    for (let j = i + 1; j < points.length; j++) {
      const jNext = (j + 1) % points.length;
      if (j === next || jNext === i) continue;
      if (segmentsIntersect(points[i], points[next], points[j], points[jNext])) return null;
    }
  }
  return points;
}

function segmentOverlaps(a: Vec2, b: Vec2, region: Vec2[]): boolean {
  if (!finitePoint(a) || !finitePoint(b) || samePoint(a, b)
    || !finitePoint(sub(b, a))) return false;
  if (contains(a, region) || contains(b, region)) return true;
  return region.some((p, i) => segmentsIntersect(a, b, p, region[(i + 1) % region.length]));
}

function polygonOverlaps(points: Vec2[], region: Vec2[]): boolean {
  const polygon = validPolygon(points);
  if (!polygon) return false;
  return polygon.some((p, i) => segmentOverlaps(p, polygon[(i + 1) % polygon.length], region))
    || contains(region[0], polygon);
}

/**
 * Pure world-space overlap selection (C05/S03 and C09/S08). Edges/vertices count;
 * crossing and containment in either direction count, without screen-space padding.
 * Invalid/zero-area/self-intersecting regions return empty; invalid entities are skipped.
 * Two-point outlines are segments; collapsed segments and zero-area polygons are skipped.
 *
 * Exclusion uses non-Base owners when present, otherwise Base if owned there;
 * ALL effective owners must be excluded. Unowned objects remain eligible. A joint's
 * owners contain that joint; segment owners contain BOTH geometry endpoints (slider B and collider
 * target bodyIds are not owners). Attached objects use bodyId. Links additionally
 * follow renderer visibility: first non-Base owner has showLinks, no hidden endpoints.
 * Tracers must be enabled. Global display toggles are outside this graph-only API.
 */
export function selectInRegion(
  graph: MechanismState,
  region: SelectionRegion,
  excludedBodies: ReadonlySet<string>,
): Set<string> {
  const selected = new Set<string>();
  let polygon: Vec2[] | null = null;
  if (region.kind === 'box') {
    if (!finitePoint(region.start) || !finitePoint(region.end)) return selected;
    const min = { x: Math.min(region.start.x, region.end.x), y: Math.min(region.start.y, region.end.y) };
    const max = { x: Math.max(region.start.x, region.end.x), y: Math.max(region.start.y, region.end.y) };
    polygon = validPolygon([min, { x: max.x, y: min.y }, max, { x: min.x, y: max.y }]);
  } else if (region.kind === 'lasso') {
    polygon = validPolygon(region.points);
  }
  if (!polygon) return selected;

  const bodies = Object.values(graph.bodies);
  const ownersFor = (jointIds: string[]): Body[] =>
    bodies.filter((body) => jointIds.every((id) => body.jointIds.includes(id)));
  const eligible = (owners: Body[]): boolean => {
    const nonBase = owners.filter((body) => body.id !== graph.baseBodyId);
    const effective = nonBase.length > 0 ? nonBase : owners;
    return effective.length === 0 || effective.some((body) => !excludedBodies.has(body.id));
  };
  const attachedBody = (id: string): Body | undefined => {
    const body = graph.bodies[id];
    if (!body || !eligible([body])) return undefined;
    if (body.jointIds.some((jid) => !graph.joints[jid] || !finitePoint(graph.joints[jid].position))) return undefined;
    return body;
  };

  for (const joint of Object.values(graph.joints)) {
    if (!joint.hidden && eligible(ownersFor([joint.id])) && contains(joint.position, polygon)) selected.add(joint.id);
  }
  for (const link of Object.values(graph.links)) {
    const owners = ownersFor(link.jointIds);
    const a = graph.joints[link.jointIds[0]], b = graph.joints[link.jointIds[1]];
    if (!owners.find((body) => body.id !== graph.baseBodyId)?.showLinks
      || !eligible(owners) || !a || !b || a.hidden || b.hidden) continue;
    if (segmentOverlaps(a.position, b.position, polygon)) selected.add(link.id);
  }
  for (const segment of [...Object.values(graph.sliders), ...Object.values(graph.colliders)]) {
    const a = graph.joints[segment.jointIdA], c = graph.joints[segment.jointIdC];
    if (!a || !c || !eligible(ownersFor([segment.jointIdA, segment.jointIdC]))) continue;
    if (segmentOverlaps(a.position, c.position, polygon)) selected.add(segment.id);
  }
  for (const outline of Object.values(graph.outlines)) {
    const body = attachedBody(outline.bodyId);
    if (!body || !outline.visible) continue;
    const transform = computeBodyTransform(body, graph.joints);
    const points = outline.points.map((p) => localToWorld(p, transform));
    const overlaps = outline.closed === false || points.length === 2
      ? points.slice(1).some((point, index) => segmentOverlaps(points[index], point, polygon)) : polygonOverlaps(points, polygon);
    if (overlaps) selected.add(outline.id);
  }
  for (const image of Object.values(graph.images)) {
    if (!image.visible || !attachedBody(image.bodyId) || !finitePoint(image.position)
      || !Number.isFinite(image.rotation) || !Number.isFinite(image.scale) || image.scale <= 0
      || !Number.isFinite(image.naturalWidth) || image.naturalWidth <= 0
      || !Number.isFinite(image.naturalHeight) || image.naturalHeight <= 0) continue;
    if (polygonOverlaps(getImageCorners(image), polygon)) selected.add(image.id);
  }
  for (const tracer of Object.values(graph.tracers)) {
    const body = attachedBody(tracer.bodyId);
    if (!body || !tracer.enabled) continue;
    const worldPoint = localToWorld(tracer.localPosition, computeBodyTransform(body, graph.joints));
    if (contains(worldPoint, polygon)) selected.add(tracer.id);
  }
  for (const spring of Object.values(graph.springs ?? {})) {
    const ids = [spring.anchorA, spring.anchorB].flatMap(anchor => anchor.type === 'joint' ? [anchor.jointId] : anchor.type === 'link' ? graph.links[anchor.linkId]?.jointIds ?? [] : []);
    if (!eligible(bodies.filter(body => ids.some(id => body.jointIds.includes(id))))) continue;
    const points = springPolyline(spring, graph.joints, graph.links, 1);
    if (points.slice(1).some((p, i) => segmentOverlaps(points[i], p, polygon))) selected.add(spring.id);
  }
  return selected;
}
