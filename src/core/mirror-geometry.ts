import type { CanvasImage, MechanismState } from '../types/mechanism';
import type { Vec2 } from '../types/geometry';
import { computeBodyTransform, localToWorld, worldToLocal } from './body-transform';
import type { SpringAnchor } from '../types';
import { validateSpring } from './springs/spring-model';

type ReflectableImage = CanvasImage & { flipX?: boolean };
const AXIS_EPSILON = 0.001;
const ENTITY_MAPS = ['joints', 'links', 'bodies', 'outlines', 'images', 'sliders', 'colliders', 'tracers', 'springs'] as const;

function fail(message: string): never {
  throw new Error(`Mirror: ${message}`);
}

function finite(value: number, description: string): void {
  if (!Number.isFinite(value)) fail(`${description} must be finite.`);
}

function point(value: Vec2, description: string): void {
  if (!value || typeof value !== 'object') fail(`${description} must be a point.`);
  finite(value.x, `${description}.x`);
  finite(value.y, `${description}.y`);
}

function record(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

/** Validate before allocating IDs; even malformed, out-of-scope entities are rejected. */
function validate(graph: MechanismState): Set<string> {
  if (!record(graph)) fail('graph must be an object.');
  const used = new Set<string>();
  for (const kind of ENTITY_MAPS) {
    const entities = kind === 'springs' ? graph.springs ?? {} : graph[kind];
    if (!record(entities)) fail(`${kind} must be an entity map.`);
    for (const [id, entity] of Object.entries(entities)) {
      if (!record(entity) || !id.trim() || entity.id !== id) fail(`${kind}.${id} has an invalid ID.`);
      if (used.has(id)) fail(`duplicate entity ID ${id}.`);
      used.add(id);
    }
  }
  const hasBody = (id: string) => {
    if (!Object.hasOwn(graph.bodies, id)) fail(`missing body ${id}.`);
  };
  const hasJoint = (id: string) => {
    if (!Object.hasOwn(graph.joints, id)) fail(`missing joint ${id}.`);
  };
  hasBody(graph.baseBodyId);
  for (const joint of Object.values(graph.joints)) {
    point(joint.position, `joint ${joint.id} position`);
    if (!Array.isArray(joint.connectedLinkIds)) fail(`joint ${joint.id} connections must be an array.`);
  }
  for (const body of Object.values(graph.bodies)) {
    if (!Array.isArray(body.jointIds)) fail(`body ${body.id} joints must be an array.`);
    body.jointIds.forEach(hasJoint);
    if (new Set(body.jointIds).size !== body.jointIds.length) fail(`body ${body.id} has duplicate joints.`);
  }
  for (const link of Object.values(graph.links)) {
    if (!Array.isArray(link.jointIds) || link.jointIds.length !== 2) fail(`link ${link.id} needs two endpoints.`);
    link.jointIds.forEach(hasJoint);
    finite(link.restLength, `link ${link.id} rest length`);
    if (link.restLength < 0) fail(`link ${link.id} rest length must be nonnegative.`);
  }
  for (const outline of Object.values(graph.outlines)) {
    hasBody(outline.bodyId);
    if (!Array.isArray(outline.points)) fail(`outline ${outline.id} points must be an array.`);
    outline.points.forEach(p => point(p, `outline ${outline.id} point`));
  }
  for (const image of Object.values(graph.images) as ReflectableImage[]) {
    hasBody(image.bodyId);
    point(image.position, `image ${image.id} position`);
    finite(image.rotation, `image ${image.id} rotation`);
    for (const field of ['scale', 'naturalWidth', 'naturalHeight'] as const) {
      finite(image[field], `image ${image.id} ${field}`);
      if (image[field] <= 0) fail(`image ${image.id} ${field} must be positive.`);
    }
    if (image.flipX !== undefined && typeof image.flipX !== 'boolean') fail(`image ${image.id} flipX must be boolean.`);
  }
  for (const slider of Object.values(graph.sliders)) {
    [slider.jointIdA, slider.jointIdB, slider.jointIdC].forEach(hasJoint);
    finite(slider.t, `slider ${slider.id} t`);
  }
  for (const collider of Object.values(graph.colliders)) {
    [collider.jointIdA, collider.jointIdC].forEach(hasJoint);
    if (!Array.isArray(collider.bodyIds)) fail(`collider ${collider.id} targets must be an array.`);
    collider.bodyIds.forEach(hasBody);
  }
  for (const tracer of Object.values(graph.tracers)) {
    hasBody(tracer.bodyId);
    point(tracer.localPosition, `tracer ${tracer.id} position`);
  }
  for (const spring of Object.values(graph.springs ?? {})) validateSpring(spring, graph.joints, graph.links);

  // Reserve extension-entity IDs too (for example future springs/force sensors).
  const seen = new WeakSet<object>();
  function reserve(value: unknown): void {
    if (value === null || typeof value !== 'object' || seen.has(value)) return;
    seen.add(value);
    if ('id' in value && typeof value.id === 'string') used.add(value.id);
    for (const child of Object.values(value)) reserve(child);
  }
  reserve(graph);
  return used;
}

function visible(entity: object): boolean {
  const flags = entity as { hidden?: boolean; visible?: boolean };
  return flags.hidden !== true && flags.visible !== false;
}

/**
 * Constructive reflection into the SAME bodies; returns a detached deep clone.
 * Selection copies only explicitly selected links/sliders/colliders, expanding their
 * endpoints. `all` copies visible entities, not hidden braces or disabled tracers.
 * On-axis joints (within 0.001 world units) are reused; on-axis images still copy.
 * Bad inputs/IDs throw; newId must return a fresh nonempty ID on every call.
 * No rigidity/brace regeneration occurs here. The caller must regenerate after
 * publishing, preserving explicit visible links and then refreshing connections.
 */
export function mirrorGeometry(
  graph: MechanismState,
  axis: 'vertical' | 'horizontal',
  axisValue: number,
  scope: 'selection' | 'all',
  selected: ReadonlySet<string>,
  newId: () => string,
): { graph: MechanismState; createdIds: string[] } {
  if (axis !== 'vertical' && axis !== 'horizontal') fail('axis must be vertical or horizontal.');
  finite(axisValue, 'axis value');
  if (scope !== 'selection' && scope !== 'all') fail('scope must be selection or all.');
  const usedIds = validate(graph);
  const result = structuredClone(graph);
  const createdIds: string[] = [];
  const allocate = () => {
    const id = newId();
    if (typeof id !== 'string' || !id.trim() || ['__proto__', 'constructor', 'prototype'].includes(id)) {
      fail('newId must return a nonempty, safe entity ID.');
    }
    if (usedIds.has(id)) fail(`newId collision: ${id}.`);
    usedIds.add(id);
    createdIds.push(id);
    return id;
  };
  const reflect = (p: Vec2): Vec2 => {
    const reflected = axis === 'vertical'
      ? { ...p, x: axisValue - (p.x - axisValue) }
      : { ...p, y: axisValue - (p.y - axisValue) };
    point(reflected, 'reflected point');
    return reflected;
  };
  const onAxis = (p: Vec2) => Math.abs((axis === 'vertical' ? p.x : p.y) - axisValue) <= AXIS_EPSILON;
  const targets = {
    joints: new Set<string>(), links: new Set<string>(), outlines: new Set<string>(),
    images: new Set<string>(), sliders: new Set<string>(), colliders: new Set<string>(), tracers: new Set<string>(), springs: new Set<string>(),
  };
  for (const kind of Object.keys(targets) as (keyof typeof targets)[]) {
    for (const [id, entity] of Object.entries(graph[kind] ?? {})) {
      const wanted = scope === 'all' ? visible(entity) : selected.has(id);
      if (!wanted || ('hidden' in entity && entity.hidden === true)) continue;
      if (kind === 'tracers' && scope === 'all' && !graph.tracers[id].enabled) continue;
      targets[kind].add(id);
    }
  }
  for (const id of targets.springs) {
    for (const anchor of [graph.springs![id].anchorA, graph.springs![id].anchorB]) {
      if (anchor.type === 'joint') targets.joints.add(anchor.jointId);
      if (anchor.type === 'link') targets.links.add(anchor.linkId);
    }
  }
  const expand = (kind: 'links' | 'sliders' | 'colliders', id: string, jointIds: readonly string[]) => {
    if (jointIds.some(jid => graph.joints[jid].hidden)) {
      targets[kind].delete(id);
      return;
    }
    jointIds.forEach(jid => targets.joints.add(jid));
  };
  for (const id of targets.links) expand('links', id, graph.links[id].jointIds);
  for (const id of targets.sliders) {
    const s = graph.sliders[id];
    expand('sliders', id, [s.jointIdA, s.jointIdB, s.jointIdC]);
  }
  for (const id of targets.colliders) {
    const c = graph.colliders[id];
    expand('colliders', id, [c.jointIdA, c.jointIdC]);
  }

  const jointMap = new Map<string, string>();
  const modifiedBodies = new Set<string>();
  for (const id of targets.joints) {
    const joint = result.joints[id];
    if (onAxis(joint.position)) {
      jointMap.set(id, id);
      continue;
    }
    const mirroredId = allocate();
    result.joints[mirroredId] = { ...structuredClone(joint), id: mirroredId, position: reflect(structuredClone(joint.position)), connectedLinkIds: [] };
    jointMap.set(id, mirroredId);
    for (const body of Object.values(result.bodies)) {
      if (!body.jointIds.includes(id)) continue;
      body.jointIds.push(mirroredId);
      modifiedBodies.add(body.id);
    }
  }

  const sourceFrames = new Map(Object.values(graph.bodies).map(body => [body.id, computeBodyTransform(body, graph.joints)]));
  const destinationFrames = new Map(Object.values(result.bodies).map(body => [body.id, computeBodyTransform(body, result.joints)]));
  const toWorld = (bodyId: string, p: Vec2) => {
    const world = localToWorld(p, sourceFrames.get(bodyId)!);
    point(world, `body ${bodyId} world point`);
    return world;
  };
  const toLocal = (bodyId: string, p: Vec2, metadata: Vec2) => {
    const local = { ...structuredClone(metadata), ...worldToLocal(p, destinationFrames.get(bodyId)!) };
    point(local, `body ${bodyId} local point`);
    return local;
  };
  // Membership changes move the centroid/reference direction, not existing assets.
  for (const outline of Object.values(graph.outlines)) {
    if (!modifiedBodies.has(outline.bodyId)) continue;
    result.outlines[outline.id].points = outline.points.map(p => toLocal(outline.bodyId, toWorld(outline.bodyId, p), p));
  }
  for (const tracer of Object.values(graph.tracers)) {
    if (!modifiedBodies.has(tracer.bodyId)) continue;
    result.tracers[tracer.id].localPosition = toLocal(tracer.bodyId, toWorld(tracer.bodyId, tracer.localPosition), tracer.localPosition);
  }

  const linkMap = new Map<string, string>();
  for (const id of targets.links) {
    const link = result.links[id];
    const jointIds = link.jointIds.map(jid => jointMap.get(jid)!) as [string, string];
    if (jointIds.every((jid, i) => jid === link.jointIds[i])) { linkMap.set(id, id); continue; }
    const mirroredId = allocate();
    result.links[mirroredId] = { ...structuredClone(link), id: mirroredId, jointIds };
    linkMap.set(id, mirroredId);
  }
  for (const id of targets.springs) {
    const spring = graph.springs![id], mirroredId = allocate();
    const anchor = (value: SpringAnchor): SpringAnchor => value.type === 'world' ? { ...structuredClone(value), position: reflect(value.position) }
      : value.type === 'joint' ? { ...value, jointId: jointMap.get(value.jointId)! } : { ...value, linkId: linkMap.get(value.linkId)! };
    result.springs ??= {};
    result.springs[mirroredId] = { ...structuredClone(spring), id: mirroredId, anchorA: anchor(spring.anchorA), anchorB: anchor(spring.anchorB),
      restLength: spring.kind === 'torsional' ? -spring.restLength : spring.restLength,
      prestressDelta: spring.kind === 'torsional' ? -spring.prestressDelta : spring.prestressDelta };
  }
  for (const id of targets.sliders) {
    const slider = result.sliders[id];
    const jointIdA = jointMap.get(slider.jointIdA)!, jointIdB = jointMap.get(slider.jointIdB)!, jointIdC = jointMap.get(slider.jointIdC)!;
    if (jointIdA === slider.jointIdA && jointIdB === slider.jointIdB && jointIdC === slider.jointIdC) continue;
    const mirroredId = allocate();
    result.sliders[mirroredId] = { ...structuredClone(slider), id: mirroredId, jointIdA, jointIdB, jointIdC };
  }
  for (const id of targets.colliders) {
    const collider = result.colliders[id];
    const jointIdA = jointMap.get(collider.jointIdA)!, jointIdC = jointMap.get(collider.jointIdC)!;
    if (jointIdA === collider.jointIdA && jointIdC === collider.jointIdC) continue;
    const mirroredId = allocate();
    result.colliders[mirroredId] = { ...structuredClone(collider), id: mirroredId, jointIdA, jointIdC };
  }
  for (const id of targets.outlines) {
    const outline = graph.outlines[id];
    const world = outline.points.map(p => toWorld(outline.bodyId, p));
    if (world.every(onAxis)) continue;
    const mirroredId = allocate();
    result.outlines[mirroredId] = {
      ...structuredClone(outline), id: mirroredId,
      points: world.map((p, i) => toLocal(outline.bodyId, reflect(p), outline.points[i])),
    };
  }
  for (const id of targets.images) {
    const image: ReflectableImage = structuredClone(graph.images[id]);
    const mirroredId = allocate();
    // R(r) * diag(flipX ? -1 : 1, 1): toggle X, then use -r for
    // world-X reflection or PI-r for world-Y reflection (including texture UVs).
    const mirrored: ReflectableImage = {
      ...image, id: mirroredId, position: reflect(image.position),
      rotation: axis === 'vertical' ? -image.rotation : Math.PI - image.rotation,
      flipX: !image.flipX,
    };
    result.images[mirroredId] = mirrored;
  }
  for (const id of targets.tracers) {
    const tracer = graph.tracers[id];
    const world = toWorld(tracer.bodyId, tracer.localPosition);
    if (onAxis(world)) continue;
    const mirroredId = allocate();
    result.tracers[mirroredId] = {
      ...structuredClone(tracer), id: mirroredId,
      localPosition: toLocal(tracer.bodyId, reflect(world), tracer.localPosition),
    };
  }
  for (const joint of Object.values(result.joints)) joint.connectedLinkIds = [];
  for (const link of Object.values(result.links)) {
    for (const id of new Set(link.jointIds)) result.joints[id].connectedLinkIds.push(link.id);
  }
  return { graph: result, createdIds };
}
