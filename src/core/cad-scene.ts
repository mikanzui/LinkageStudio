import type { Joint, MechanismState, Vec2 } from '../types';
import { computeBodyTransform, localToWorld } from './body-transform';

export type CadKind = 'joint' | 'link' | 'outline' | 'slider' | 'collider';
export interface CadLayer {
  readonly name: string;
  readonly sourceBodyId: string | null;
  readonly color: string;
  readonly purpose: 'body' | 'unowned' | 'slider' | 'collider';
}
interface CadSource {
  readonly id: string;
  readonly sourceId: string;
  readonly layer: string;
  readonly label: string;
}
export type CadEntity =
  | (CadSource & { readonly type: 'circle'; readonly kind: 'joint'; readonly center: Vec2; readonly radius: number })
  | (CadSource & { readonly type: 'line'; readonly kind: Exclude<CadKind, 'joint'>; readonly start: Vec2; readonly end: Vec2; readonly construction: boolean })
  | (CadSource & { readonly type: 'polyline'; readonly kind: 'outline'; readonly points: readonly Vec2[]; readonly closed: boolean; readonly construction: false });
export interface CadWarning {
  readonly code: 'omitted-content' | 'missing-reference' | 'degenerate-geometry' | 'unsupported-geometry' | 'invalid-color';
  readonly message: string;
  readonly sourceId?: string;
  readonly count?: number;
}
export interface CadScene {
  readonly layers: readonly CadLayer[];
  readonly entities: readonly CadEntity[];
  readonly warnings: readonly CadWarning[];
  readonly omissions: Readonly<Record<'images' | 'springs' | 'tracers' | 'forceSensors' | 'analysisOverlays', number>>;
}

export function singleLineComment(text: string): string {
  // ASCII also removes Unicode line separators; the final period prevents VB continuation.
  return text.replace(/[^\x20-\x7e]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 180) + '.';
}

export function finitePoint(point: Vec2): Vec2 {
  if (!Number.isFinite(point.x) || !Number.isFinite(point.y)) throw new Error('CAD coordinates must be finite.');
  return { x: point.x, y: point.y };
}
const same = (a: Vec2, b: Vec2) => a.x === b.x && a.y === b.y;
function suppressed(value: { id: string }): boolean {
  return value.id.startsWith('__temp_') || value.id.startsWith('__templink_');
}

export function buildCadScene(graph: MechanismState, showLinksGlobal = true): CadScene {
  const layers: CadLayer[] = [];
  const entities: CadEntity[] = [];
  const warnings: CadWarning[] = [];
  const usedNames = new Set(['0']);
  const bodyLayers = new Map<string, string>();
  const warn = (code: CadWarning['code'], message: string, sourceId?: string) => warnings.push({ code, message, sourceId });
  const addLayer = (name: string, color: string, sourceBodyId: string | null, purpose: CadLayer['purpose']) => {
    const stem = name.replace(/[^A-Za-z0-9_-]/g, '_').slice(0, 31) || 'Body';
    let safe = stem, suffix = 1;
    while (usedNames.has(safe.toLowerCase())) {
      const tail = `_${suffix++}`;
      safe = stem.slice(0, 31 - tail.length) + tail;
    }
    usedNames.add(safe.toLowerCase());
    if (/^#[0-9a-f]{3}$/i.test(color)) color = '#' + [...color.slice(1)].map(c => c + c).join('');
    if (!/^#[0-9a-f]{6}$/i.test(color)) {
      warn('invalid-color', 'Invalid body color replaced with white for CAD.', sourceBodyId ?? undefined);
      color = '#ffffff';
    }
    layers.push({ name: safe, color, sourceBodyId, purpose });
    return safe;
  };
  const unowned = addLayer('Unowned', '#ffffff', null, 'unowned');
  const sliders = addLayer('Sliders', '#808080', null, 'slider');
  const colliders = addLayer('Colliders', '#ffffff', null, 'collider');
  const bodies = Object.values(graph.bodies);
  for (const body of bodies) {
    if (bodyLayers.has(body.id)) throw new Error('Duplicate CAD source body ID.');
    bodyLayers.set(body.id, addLayer(body.name, body.color, body.id, 'body'));
  }
  const source = (kind: CadKind, sourceId: string, layer: string, label = sourceId): CadSource => {
    const owner = layers.find(item => item.name === layer)!;
    return { id: JSON.stringify([kind, sourceId, owner.purpose, owner.sourceBodyId]), sourceId, layer, label };
  };
  const visibleJoint = (j: Joint | undefined): j is Joint => !!j && !j.hidden && !suppressed(j);
  const owned = new Set<string>();
  const addJoint = (joint: Joint, layer: string) => {
    entities.push({ ...source('joint', joint.id, layer, joint.label ?? joint.id), type: 'circle', kind: 'joint',
      center: finitePoint(joint.position), radius: joint.type === 'fixed' ? 5 : 3.75 });
  };
  for (const body of bodies) {
    for (const jid of new Set(body.jointIds)) {
      const joint = graph.joints[jid];
      if (!joint) { warn('missing-reference', 'Body references a missing joint.', body.id); continue; }
      if (!visibleJoint(joint)) continue;
      addJoint(joint, bodyLayers.get(body.id)!);
      owned.add(jid);
    }
  }
  for (const [jid, joint] of Object.entries(graph.joints)) if (!owned.has(jid) && visibleJoint(joint)) addJoint(joint, unowned);
  const addLine = (kind: Exclude<CadKind, 'joint'>, id: string, layer: string, a: Vec2, b: Vec2, construction: boolean, label = id) => {
    const start = finitePoint(a), end = finitePoint(b);
    if (same(start, end)) { warn('degenerate-geometry', 'Skipped zero-length CAD segment.', id); return; }
    entities.push({ ...source(kind, id, layer, label), type: 'line', kind, start, end, construction });
  };
  if (showLinksGlobal) for (const link of Object.values(graph.links)) {
    if (suppressed(link)) continue;
    const [a, b] = link.jointIds.map(id => graph.joints[id]);
    if (!a || !b) { warn('missing-reference', 'Link references a missing endpoint.', link.id); continue; }
    if (!visibleJoint(a) || !visibleJoint(b)) continue;
    const owner = bodies.find(body => body.id !== graph.baseBodyId && link.jointIds.every(id => body.jointIds.includes(id)));
    if (owner?.showLinks) addLine('link', link.id, bodyLayers.get(owner.id)!, a.position, b.position, true, owner.name);
  }
  for (const outline of Object.values(graph.outlines)) {
    if (!outline.visible || suppressed(outline)) continue;
    const body = graph.bodies[outline.bodyId];
    if (!body) { warn('missing-reference', 'Outline references a missing body.', outline.id); continue; }
    if (outline.points.length < 2) { warn('unsupported-geometry', 'Outline needs at least two points.', outline.id); continue; }
    for (const jid of body.jointIds) if (graph.joints[jid]) finitePoint(graph.joints[jid].position);
    if (body.frame && !Number.isFinite(body.frame.angleOffset)) throw new Error('CAD body angle must be finite.');
    const transform = computeBodyTransform(body, graph.joints);
    finitePoint(transform.origin);
    if (!Number.isFinite(transform.angle)) throw new Error('CAD body transform must be finite.');
    const points: Vec2[] = [];
    let removed = false;
    for (const point of outline.points) {
      const world = finitePoint(localToWorld(finitePoint(point), transform));
      if (points.length && same(points[points.length - 1], world)) { removed = true; continue; }
      points.push(world);
    }
    const closed = outline.closed !== false;
    if (closed && points.length > 1 && same(points[0], points[points.length - 1])) { points.pop(); removed = true; }
    if (removed) warn('degenerate-geometry', 'Removed duplicate outline vertices without adding edges.', outline.id);
    const layer = bodyLayers.get(body.id)!;
    if (points.length < 2) { warn('degenerate-geometry', 'Skipped collapsed outline.', outline.id); continue; }
    if (points.length === 2) addLine('outline', outline.id, layer, points[0], points[1], false, outline.name);
    else entities.push({ ...source('outline', outline.id, layer, outline.name), type: 'polyline', kind: 'outline', points, closed, construction: false });
  }
  for (const [kind, guides, layer] of [
    ['slider', graph.sliders, sliders], ['collider', graph.colliders, colliders],
  ] as const) for (const guide of Object.values(guides)) {
    if (suppressed(guide)) continue;
    const a = graph.joints[guide.jointIdA], b = graph.joints[guide.jointIdC];
    if (!a || !b) { warn('missing-reference', 'Skipped guide with stale optional endpoint reference.', guide.id); continue; }
    if (visibleJoint(a) && visibleJoint(b)) addLine(kind, guide.id, layer, a.position, b.position, true);
  }
  const omissions = {
    images: Object.keys(graph.images).length, springs: Object.keys(graph.springs ?? {}).length,
    tracers: Object.keys(graph.tracers).length, forceSensors: Object.keys(graph.forceSensors ?? {}).length,
    analysisOverlays: Object.values(graph.joints).filter(j => j.externalForce && (j.externalForce.x !== 0 || j.externalForce.y !== 0)).length,
  };
  const omissionLabels: Record<keyof typeof omissions, [string, string]> = {
    images: ['image', 'images'], springs: ['spring', 'springs'], tracers: ['tracer', 'tracers'],
    forceSensors: ['force sensor', 'force sensors'], analysisOverlays: ['analysis overlay', 'analysis overlays'],
  };
  for (const [kind, count] of Object.entries(omissions)) if (count) warnings.push({ code: 'omitted-content', count,
    message: `${count} ${omissionLabels[kind as keyof typeof omissions][count === 1 ? 0 : 1]} omitted: not ordinary CAD geometry.` });
  const scene = { layers, entities, warnings, omissions };
  validateCadScene(scene);
  return scene;
}

/** Writers also validate caller-created scenes, not only buildCadScene output. */
export function validateCadScene(scene: CadScene): void {
  const layers = new Set<string>(), ids = new Set<string>();
  for (const layer of scene.layers) {
    if (!/^[A-Za-z0-9_-]{1,31}$/.test(layer.name) || layers.has(layer.name.toLowerCase())) throw new Error('Unsafe or duplicate CAD layer name.');
    if (!/^#[0-9a-f]{6}$/i.test(layer.color)) throw new Error('Invalid CAD layer color.');
    layers.add(layer.name.toLowerCase());
  }
  for (const entity of scene.entities) {
    if (ids.has(entity.id)) throw new Error('Duplicate CAD entity ID.');
    ids.add(entity.id);
    if (!layers.has(entity.layer.toLowerCase()) || !/^[A-Za-z0-9_-]{1,31}$/.test(entity.layer)) throw new Error('Unknown or unsafe CAD entity layer.');
    if (entity.type === 'circle') {
      finitePoint(entity.center);
      if (!Number.isFinite(entity.radius) || entity.radius <= 0) throw new Error('CAD radius must be finite and positive.');
    } else if (entity.type === 'line') {
      finitePoint(entity.start); finitePoint(entity.end);
      if (same(entity.start, entity.end)) throw new Error('Zero-length CAD segment.');
    } else if (entity.type === 'polyline') {
      if (entity.points.length < 3) throw new Error('CAD polylines need at least three points; use a line for two.');
      for (let i = 0; i < entity.points.length; i++) {
        finitePoint(entity.points[i]);
        if ((i > 0 && same(entity.points[i - 1], entity.points[i])) ||
          (entity.closed && i === entity.points.length - 1 && same(entity.points[0], entity.points[i]))) throw new Error('Zero-length CAD polyline edge.');
      }
    } else throw new Error('Unsupported CAD entity type.');
  }
}

export type LegacyCadArguments = [
  joints: MechanismState['joints'], links: MechanismState['links'], bodies: MechanismState['bodies'], baseBodyId: string,
  outlines: MechanismState['outlines'], sliders: MechanismState['sliders'], colliders: MechanismState['colliders'],
];
export function legacyCadGraph(...[joints, links, bodies, baseBodyId, outlines, sliders, colliders]: LegacyCadArguments): MechanismState {
  return { joints, links, bodies, baseBodyId, outlines, sliders, colliders, images: {}, tracers: {} };
}
