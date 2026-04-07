import type { Vec2 } from '../types';
import type { CameraState } from '../types';
import { screenToWorld } from '../renderer/camera';
import { hitTestJoint, hitTestOutline, hitTestLink } from './hit-test';
import { hitTestImage } from '../renderer/draw-images';
import { distance, sub, dot, lengthSq } from '../core/math/vec2';
import { computeBodyTransform, localToWorld, polygonCentroid } from '../core/body-transform';
import { HIT_RADIUS } from '../utils/constants';
import type { MechanismState } from '../types';

/** True if marquee selection should not start (something would take the click in Pivot tool). */
export function hitTestJointsToolBlock(worldPos: Vec2, zoom: number, mechanism: MechanismState): boolean {
  if (hitTestJoint(worldPos, mechanism.joints, zoom)) return true;

  const bHitThreshold = (HIT_RADIUS * 1.4) / zoom;
  for (const slider of Object.values(mechanism.sliders)) {
    const jA = mechanism.joints[slider.jointIdA];
    const jB = mechanism.joints[slider.jointIdB];
    const jC = mechanism.joints[slider.jointIdC];
    if (!jB || jB.hidden) continue;
    const dB = distance(worldPos, jB.position);
    if (dB >= bHitThreshold) continue;
    const dA = jA && !jA.hidden ? distance(worldPos, jA.position) : Infinity;
    const dC = jC && !jC.hidden ? distance(worldPos, jC.position) : Infinity;
    if (dB < dA && dB < dC) return true;
  }

  for (const slider of Object.values(mechanism.sliders)) {
    const jA = mechanism.joints[slider.jointIdA];
    const jC = mechanism.joints[slider.jointIdC];
    if (!jA || !jC) continue;
    const ab = sub(jC.position, jA.position);
    const ap = sub(worldPos, jA.position);
    const abLenSq = lengthSq(ab);
    if (abLenSq < 1e-8) continue;
    const t = Math.max(0, Math.min(1, dot(ap, ab) / abLenSq));
    const closest = { x: jA.position.x + ab.x * t, y: jA.position.y + ab.y * t };
    if (distance(worldPos, closest) < HIT_RADIUS / zoom) return true;
  }

  if (hitTestOutline(worldPos, mechanism.outlines, mechanism.bodies, mechanism.joints, zoom)) return true;

  if (hitTestLink(worldPos, mechanism.links, mechanism.joints, zoom)) return true;

  for (const img of Object.values(mechanism.images)) {
    if (hitTestImage(worldPos, img)) return true;
  }

  const colliderTh = HIT_RADIUS / zoom;
  for (const collider of Object.values(mechanism.colliders)) {
    const jA = mechanism.joints[collider.jointIdA];
    const jC = mechanism.joints[collider.jointIdC];
    if (!jA || !jC) continue;
    const ab = sub(jC.position, jA.position);
    const ap = sub(worldPos, jA.position);
    const abLenSq = lengthSq(ab);
    if (abLenSq < 1e-8) continue;
    const t = Math.max(0, Math.min(1, dot(ap, ab) / abLenSq));
    const closest = { x: jA.position.x + ab.x * t, y: jA.position.y + ab.y * t };
    if (distance(worldPos, closest) < colliderTh) return true;
  }

  const tracerTh = HIT_RADIUS / zoom;
  for (const tracer of Object.values(mechanism.tracers)) {
    const body = mechanism.bodies[tracer.bodyId];
    if (!body) continue;
    const transform = computeBodyTransform(body, mechanism.joints);
    const worldPt = localToWorld(tracer.localPosition, transform);
    if (distance(worldPos, worldPt) < tracerTh) return true;
  }

  return false;
}

function bodiesForJoint(jointId: string, mechanism: MechanismState): string[] {
  if (!jointId) return [];
  return Object.values(mechanism.bodies)
    .filter((b) => b.jointIds.includes(jointId))
    .map((b) => b.id);
}

function bodiesForJointSet(jointIds: (string | undefined)[], mechanism: MechanismState): string[] {
  const ids = new Set<string>();
  for (const jid of jointIds) {
    if (!jid) continue;
    for (const b of bodiesForJoint(jid, mechanism)) ids.add(b);
  }
  return [...ids];
}

/** Entity counts for selection if at least one of its bodies is not excluded. */
export function passesMarqueeBodyFilter(
  bodyIds: string[],
  excludedBodyIds: Set<string>,
): boolean {
  if (excludedBodyIds.size === 0) return true;
  return bodyIds.some((id) => !excludedBodyIds.has(id));
}

function pointInWorldBox(p: Vec2, min: Vec2, max: Vec2): boolean {
  return p.x >= min.x && p.x <= max.x && p.y >= min.y && p.y <= max.y;
}

/** Ray casting point-in-polygon (closed). */
export function pointInPolygon(pt: Vec2, poly: Vec2[]): boolean {
  if (poly.length < 3) return false;
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const yi = poly[i].y;
    const yj = poly[j].y;
    const xi = poly[i].x;
    const xj = poly[j].x;
    if ((yi > pt.y) !== (yj > pt.y) && pt.x < ((xj - xi) * (pt.y - yi)) / (yj - yi + 1e-20) + xi) {
      inside = !inside;
    }
  }
  return inside;
}

function segmentIntersectsRect(a: Vec2, b: Vec2, min: Vec2, max: Vec2): boolean {
  if (pointInWorldBox(a, min, max) || pointInWorldBox(b, min, max)) return true;
  const edges: [Vec2, Vec2][] = [
    [{ x: min.x, y: min.y }, { x: max.x, y: min.y }],
    [{ x: max.x, y: min.y }, { x: max.x, y: max.y }],
    [{ x: max.x, y: max.y }, { x: min.x, y: max.y }],
    [{ x: min.x, y: max.y }, { x: min.x, y: min.y }],
  ];
  for (const [e0, e1] of edges) {
    const d1 = sub(b, a);
    const d2 = sub(e1, e0);
    const denom = d1.x * d2.y - d1.y * d2.x;
    if (Math.abs(denom) < 1e-12) continue;
    const d3 = sub(e0, a);
    const t = (d3.x * d2.y - d3.y * d2.x) / denom;
    const u = (d3.x * d1.y - d3.y * d1.x) / denom;
    if (t >= 0 && t <= 1 && u >= 0 && u <= 1) return true;
  }
  return false;
}

function segmentIntersectsPolygon(a: Vec2, b: Vec2, poly: Vec2[]): boolean {
  if (poly.length < 2) return false;
  for (let i = 0; i < poly.length; i++) {
    const p0 = poly[i];
    const p1 = poly[(i + 1) % poly.length];
    const d1 = sub(b, a);
    const d2 = sub(p1, p0);
    const denom = d1.x * d2.y - d1.y * d2.x;
    if (Math.abs(denom) < 1e-12) continue;
    const d3 = sub(p0, a);
    const t = (d3.x * d2.y - d3.y * d2.x) / denom;
    const u = (d3.x * d1.y - d3.y * d1.x) / denom;
    if (t >= 0 && t <= 1 && u >= 0 && u <= 1) return true;
  }
  return pointInPolygon(a, poly) || pointInPolygon(b, poly);
}

export function worldAxisBoxFromScreenRect(
  screenA: Vec2,
  screenB: Vec2,
  camera: CameraState,
): { min: Vec2; max: Vec2 } {
  const w0 = screenToWorld(screenA, camera);
  const w1 = screenToWorld(screenB, camera);
  return {
    min: { x: Math.min(w0.x, w1.x), y: Math.min(w0.y, w1.y) },
    max: { x: Math.max(w0.x, w1.x), y: Math.max(w0.y, w1.y) },
  };
}

export function worldPolygonFromScreenLasso(
  screenPoints: Vec2[],
  camera: CameraState,
): Vec2[] {
  return screenPoints.map((p) => screenToWorld(p, camera));
}

/**
 * Collect selectable entity ids in a world-space axis-aligned box.
 */
export function collectIdsInWorldBox(
  min: Vec2,
  max: Vec2,
  mechanism: MechanismState,
  excludedBodyIds: Set<string>,
): string[] {
  const ids: string[] = [];

  for (const joint of Object.values(mechanism.joints)) {
    if (joint.hidden) continue;
    if (!pointInWorldBox(joint.position, min, max)) continue;
    const bs = bodiesForJoint(joint.id, mechanism);
    if (!passesMarqueeBodyFilter(bs, excludedBodyIds)) continue;
    ids.push(joint.id);
  }

  for (const outline of Object.values(mechanism.outlines)) {
    const body = mechanism.bodies[outline.bodyId];
    if (!body || outline.points.length < 2 || !outline.visible) continue;
    if (!passesMarqueeBodyFilter([outline.bodyId], excludedBodyIds)) continue;
    const transform = computeBodyTransform(body, mechanism.joints);
    const worldPts = outline.points.map((p) => localToWorld(p, transform));
    const c = polygonCentroid(worldPts);
    if (!pointInWorldBox(c, min, max)) continue;
    ids.push(outline.id);
  }

  for (const img of Object.values(mechanism.images)) {
    if (!passesMarqueeBodyFilter([img.bodyId], excludedBodyIds)) continue;
    if (pointInWorldBox(img.position, min, max)) ids.push(img.id);
  }

  for (const slider of Object.values(mechanism.sliders)) {
    const jA = mechanism.joints[slider.jointIdA];
    const jB = mechanism.joints[slider.jointIdB];
    const jC = mechanism.joints[slider.jointIdC];
    if (!jA || !jC) continue;
    const bs = bodiesForJointSet([jA.id, jB?.id, jC.id], mechanism);
    if (!passesMarqueeBodyFilter(bs, excludedBodyIds)) continue;
    const pts = [jA.position, jB?.position ?? jA.position, jC.position];
    if (pts.some((p) => pointInWorldBox(p, min, max)) || segmentIntersectsRect(jA.position, jC.position, min, max)) {
      ids.push(slider.id);
    }
  }

  for (const collider of Object.values(mechanism.colliders)) {
    if (!passesMarqueeBodyFilter(collider.bodyIds, excludedBodyIds)) continue;
    const jA = mechanism.joints[collider.jointIdA];
    const jC = mechanism.joints[collider.jointIdC];
    if (!jA || !jC) continue;
    if (segmentIntersectsRect(jA.position, jC.position, min, max) || pointInWorldBox(jA.position, min, max) || pointInWorldBox(jC.position, min, max)) {
      ids.push(collider.id);
    }
  }

  for (const tracer of Object.values(mechanism.tracers)) {
    const body = mechanism.bodies[tracer.bodyId];
    if (!body) continue;
    if (!passesMarqueeBodyFilter([tracer.bodyId], excludedBodyIds)) continue;
    const transform = computeBodyTransform(body, mechanism.joints);
    const worldPt = localToWorld(tracer.localPosition, transform);
    if (pointInWorldBox(worldPt, min, max)) ids.push(tracer.id);
  }

  return ids;
}

/**
 * Collect selectable entity ids in a closed lasso (world-space polygon).
 */
export function collectIdsInWorldLasso(
  poly: Vec2[],
  mechanism: MechanismState,
  excludedBodyIds: Set<string>,
): string[] {
  if (poly.length < 3) return [];
  const ids: string[] = [];

  for (const joint of Object.values(mechanism.joints)) {
    if (joint.hidden) continue;
    if (!pointInPolygon(joint.position, poly)) continue;
    const bs = bodiesForJoint(joint.id, mechanism);
    if (!passesMarqueeBodyFilter(bs, excludedBodyIds)) continue;
    ids.push(joint.id);
  }

  for (const outline of Object.values(mechanism.outlines)) {
    const body = mechanism.bodies[outline.bodyId];
    if (!body || outline.points.length < 2 || !outline.visible) continue;
    if (!passesMarqueeBodyFilter([outline.bodyId], excludedBodyIds)) continue;
    const transform = computeBodyTransform(body, mechanism.joints);
    const worldPts = outline.points.map((p) => localToWorld(p, transform));
    const c = polygonCentroid(worldPts);
    if (!pointInPolygon(c, poly)) continue;
    ids.push(outline.id);
  }

  for (const img of Object.values(mechanism.images)) {
    if (!passesMarqueeBodyFilter([img.bodyId], excludedBodyIds)) continue;
    if (pointInPolygon(img.position, poly)) ids.push(img.id);
  }

  for (const slider of Object.values(mechanism.sliders)) {
    const jA = mechanism.joints[slider.jointIdA];
    const jB = mechanism.joints[slider.jointIdB];
    const jC = mechanism.joints[slider.jointIdC];
    if (!jA || !jC) continue;
    const bs = bodiesForJointSet([jA.id, jB?.id, jC.id], mechanism);
    if (!passesMarqueeBodyFilter(bs, excludedBodyIds)) continue;
    if (
      pointInPolygon(jA.position, poly) ||
      pointInPolygon(jC.position, poly) ||
      pointInPolygon(jB?.position ?? jA.position, poly) ||
      segmentIntersectsPolygon(jA.position, jC.position, poly)
    ) {
      ids.push(slider.id);
    }
  }

  for (const collider of Object.values(mechanism.colliders)) {
    if (!passesMarqueeBodyFilter(collider.bodyIds, excludedBodyIds)) continue;
    const jA = mechanism.joints[collider.jointIdA];
    const jC = mechanism.joints[collider.jointIdC];
    if (!jA || !jC) continue;
    if (segmentIntersectsPolygon(jA.position, jC.position, poly) || pointInPolygon(jA.position, poly) || pointInPolygon(jC.position, poly)) {
      ids.push(collider.id);
    }
  }

  for (const tracer of Object.values(mechanism.tracers)) {
    const body = mechanism.bodies[tracer.bodyId];
    if (!body) continue;
    if (!passesMarqueeBodyFilter([tracer.bodyId], excludedBodyIds)) continue;
    const transform = computeBodyTransform(body, mechanism.joints);
    const worldPt = localToWorld(tracer.localPosition, transform);
    if (pointInPolygon(worldPt, poly)) ids.push(tracer.id);
  }

  return ids;
}
