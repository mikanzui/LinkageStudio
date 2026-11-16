import type { Vec2, Joint, Link, Outline, Body, Tracer, ForceSensor } from '../types';
import { distance } from '../core/math/vec2';
import { distToSegment } from '../core/math/vec2';
import { HIT_RADIUS, LINK_HIT_THRESHOLD } from '../utils/constants';
import { computeBodyTransform, localToWorld } from '../core/body-transform';

function finitePoint(point: Vec2): boolean {
  return Number.isFinite(point.x) && Number.isFinite(point.y);
}

function validQuery(worldPos: Vec2, zoom: number): boolean {
  return finitePoint(worldPos) && Number.isFinite(zoom) && zoom > 0;
}

export function hitTestTracer(world: Vec2, tracers: Record<string, Tracer>, bodies: Record<string, Body>, joints: Record<string, Joint>, zoom: number): string | null {
  if (!validQuery(world, zoom)) return null;
  for (const tracer of Object.values(tracers).reverse()) {
    const body = bodies[tracer.bodyId];
    if (body && tracer.enabled && distance(world, localToWorld(tracer.localPosition, computeBodyTransform(body, joints))) <= HIT_RADIUS / zoom) return tracer.id;
  }
  return null;
}

export function hitTestSensor(world: Vec2, sensors: Record<string, ForceSensor>, links: Record<string, Link>, joints: Record<string, Joint>, zoom: number): string | null {
  if (!validQuery(world, zoom)) return null;
  for (const sensor of Object.values(sensors).reverse()) {
    const link = links[sensor.linkId]; if (!link || !sensor.enabled) continue;
    const a = joints[link.jointIds[0]], b = joints[link.jointIds[1]];
    if (a && b && distance(world, { x: (a.position.x + b.position.x) / 2, y: (a.position.y + b.position.y) / 2 }) <= HIT_RADIUS / zoom) return sensor.id;
  }
  return null;
}

/**
 * Lightweight boolean hit-test — checks if worldPos is near any joint or link.
 * Does NOT mutate click-cycling state. Use this for
 * touch gesture classification (interact vs pan) where we just need a yes/no.
 */
export function hitTestAny(
  worldPos: Vec2,
  joints: Record<string, Joint>,
  links: Record<string, Link>,
  zoom: number,
): boolean {
  if (!validQuery(worldPos, zoom)) return false;
  const jointThreshold = HIT_RADIUS / zoom;
  for (const joint of Object.values(joints)) {
    if (joint.hidden || !finitePoint(joint.position)) continue;
    if (distance(worldPos, joint.position) < jointThreshold) return true;
  }
  const linkThreshold = LINK_HIT_THRESHOLD / zoom;
  for (const link of Object.values(links)) {
    const jA = joints[link.jointIds[0]];
    const jB = joints[link.jointIds[1]];
    if (!jA || !jB) continue;
    if (jA.hidden || jB.hidden) continue;
    if (!finitePoint(jA.position) || !finitePoint(jB.position)) continue;
    if (distToSegment(worldPos, jA.position, jB.position) < linkThreshold) return true;
  }
  return false;
}

const CYCLE_MOVE_PX = 4;
const CYCLE_PAUSE_MS = 1000;
let clickCycle: {
  jointIds: string[];
  lastJointId: string;
  origin: Vec2;
  zoom: number;
  time: number;
} | null = null;

/** Clear transient picking state when changing projects or interaction modes. */
export function resetHitTesting(): void {
  clickCycle = null;
}

/** Nearest-only by default; opt into overlap cycling only for explicit clicks. */
export function hitTestJoint(
  worldPos: Vec2,
  joints: Record<string, Joint>,
  zoom: number,
  cycle = false,
): Joint | null {
  if (!validQuery(worldPos, zoom)) {
    if (cycle) resetHitTesting();
    return null;
  }
  const threshold = HIT_RADIUS / zoom;

  // Collect all joints within hit radius (skip hidden bracing joints)
  const hits: { joint: Joint; dist: number }[] = [];
  for (const joint of Object.values(joints)) {
    if (joint.hidden || !finitePoint(joint.position)) continue;
    const d = distance(worldPos, joint.position);
    if (d < threshold) {
      hits.push({ joint, dist: d });
    }
  }

  if (hits.length === 0) {
    if (cycle) resetHitTesting();
    return null;
  }

  // Sort by distance (closest first), then by id for stable order
  hits.sort((a, b) => a.dist - b.dist || a.joint.id.localeCompare(b.joint.id));

  if (!cycle) return hits[0].joint;

  const now = performance.now();
  const jointIds = hits.map(({ joint }) => joint.id).sort();
  const previous = clickCycle;
  const repeat = previous !== null
    && previous.zoom === zoom
    && now >= previous.time && now - previous.time <= CYCLE_PAUSE_MS
    && distance(worldPos, previous.origin) * zoom <= CYCLE_MOVE_PX
    && jointIds.length === previous.jointIds.length
    && jointIds.every((id, index) => id === previous.jointIds[index]);
  const lastIdx = repeat ? hits.findIndex(({ joint }) => joint.id === previous.lastJointId) : -1;
  const selected = hits[(lastIdx + 1) % hits.length].joint;
  clickCycle = {
    jointIds, lastJointId: selected.id,
    // Anchor the cluster so accumulated small pointer moves cannot drift indefinitely.
    origin: repeat ? previous.origin : { ...worldPos },
    zoom, time: now,
  };
  return selected;
}

export function hitTestLink(
  worldPos: Vec2,
  links: Record<string, Link>,
  joints: Record<string, Joint>,
  zoom: number,
): Link | null {
  if (!validQuery(worldPos, zoom)) return null;
  const threshold = LINK_HIT_THRESHOLD / zoom;
  let closest: Link | null = null;
  let closestDist = Infinity;

  for (const link of Object.values(links)) {
    const jA = joints[link.jointIds[0]];
    const jB = joints[link.jointIds[1]];
    if (!jA || !jB) continue;
    if (jA.hidden || jB.hidden) continue;
    if (!finitePoint(jA.position) || !finitePoint(jB.position)) continue;
    const d = distToSegment(worldPos, jA.position, jB.position);
    if (d < threshold && d < closestDist) {
      closestDist = d;
      closest = link;
    }
  }
  return closest;
}

export function hitTestOutline(
  worldPos: Vec2,
  outlines: Record<string, Outline>,
  bodies: Record<string, Body>,
  joints: Record<string, Joint>,
  zoom: number,
): Outline | null {
  if (!validQuery(worldPos, zoom)) return null;
  const threshold = LINK_HIT_THRESHOLD / zoom;
  let closest: Outline | null = null;
  let closestDist = Infinity;

  for (const outline of Object.values(outlines)) {
    const body = bodies[outline.bodyId];
    if (!body || outline.points.length < 2 || !outline.visible) continue;
    const transform = computeBodyTransform(body, joints);
    const worldPts = outline.points.map((p) => localToWorld(p, transform));
    if (!worldPts.every(finitePoint)) continue;

    for (let i = 0; i < worldPts.length - (outline.closed === false ? 1 : 0); i++) {
      const a = worldPts[i];
      const b = worldPts[(i + 1) % worldPts.length];
      const d = distToSegment(worldPos, a, b);
      if (d < threshold && d < closestDist) {
        closestDist = d;
        closest = outline;
      }
    }
  }
  return closest;
}

/** Point-in-polygon test using ray casting. */
function pointInPolygon(pt: Vec2, polygon: Vec2[]): boolean {
  let inside = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const yi = polygon[i].y, yj = polygon[j].y;
    const xi = polygon[i].x, xj = polygon[j].x;
    if ((yi > pt.y) !== (yj > pt.y) && pt.x < (xj - xi) * (pt.y - yi) / (yj - yi) + xi) {
      inside = !inside;
    }
  }
  return inside;
}

/**
 * Hit-test outlines as filled shapes (not just edges) for simulate mode dragging.
 * Returns only outlines where the click point is NOT inside any other body's outline
 * (i.e., non-overlapping regions). Excludes base body outlines.
 */
export function hitTestOutlineFilled(
  worldPos: Vec2,
  outlines: Record<string, Outline>,
  bodies: Record<string, Body>,
  joints: Record<string, Joint>,
  baseBodyId: string,
): Outline | null {
  if (!finitePoint(worldPos)) return null;
  // Compute world-space polygons for all outlines
  const outlinePolygons: { outline: Outline; worldPts: Vec2[] }[] = [];
  for (const outline of Object.values(outlines)) {
    const body = bodies[outline.bodyId];
    if (!body || outline.points.length < 3 || !outline.visible || outline.closed === false) continue;
    const transform = computeBodyTransform(body, joints);
    const worldPts = outline.points.map((p) => localToWorld(p, transform));
    if (!worldPts.every(finitePoint)) continue;
    outlinePolygons.push({ outline, worldPts });
  }

  // Find all outlines containing the point
  const hits: { outline: Outline; bodyId: string }[] = [];
  for (const { outline, worldPts } of outlinePolygons) {
    if (pointInPolygon(worldPos, worldPts)) {
      hits.push({ outline, bodyId: outline.bodyId });
    }
  }

  if (hits.length === 0) return null;

  // Filter out base body outlines
  const nonBase = hits.filter((h) => h.bodyId !== baseBodyId);
  if (nonBase.length === 0) return null;

  // If multiple bodies' outlines overlap at this point, skip (return null)
  const uniqueBodyIds = new Set(nonBase.map((h) => h.bodyId));
  if (uniqueBodyIds.size > 1) return null;

  // Return the first non-base outline (they're all from the same body)
  return nonBase[0].outline;
}

export function hitTest(
  worldPos: Vec2,
  joints: Record<string, Joint>,
  links: Record<string, Link>,
  zoom: number,
  cycle = false,
): { type: 'joint'; item: Joint } | { type: 'link'; item: Link } | null {
  // Joints have priority over links
  const joint = hitTestJoint(worldPos, joints, zoom, cycle);
  if (joint) return { type: 'joint', item: joint };
  const link = hitTestLink(worldPos, links, joints, zoom);
  if (link) return { type: 'link', item: link };
  return null;
}
