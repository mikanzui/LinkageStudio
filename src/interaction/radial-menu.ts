import type { RadialTarget } from '../types/editor';
import type { Vec2 } from '../types';
import { useEditorStore } from '../store/editor-store';
import { useMechanismStore } from '../store/mechanism-store';
import { computeBodyTransform, localToWorld } from '../core/body-transform';
import { deleteSelectedEntities } from '../utils/delete-selection';
import { cancelInteractions } from './session';
import { radialLayout } from './radial-layout';
import { hitTestJoint, hitTestLink, hitTestOutline, hitTestOutlineFilled, hitTestSensor, hitTestTracer } from './hit-test';
import { hitTestImage } from '../renderer/draw-images';
import { hitTestSpring } from '../core/spring-geometry';
import { distToSegment } from '../core/math/vec2';
import { LINK_HIT_THRESHOLD } from '../utils/constants';

type Arc = NonNullable<ReturnType<typeof useEditorStore.getState>['arcSelector']>;
export function arcTarget(arc: Arc): RadialTarget {
  return arc.target ?? (arc.colliderId ? { kind: 'collider', id: arc.colliderId } : arc.tracerId ? { kind: 'tracer', id: arc.tracerId } : { kind: 'joint', id: arc.jointId! });
}
export function targetForId(id: string): RadialTarget | null {
  const m = useMechanismStore.getState();
  for (const [kind, collection] of [['joint', m.joints], ['link', m.links], ['collider', m.colliders], ['tracer', m.tracers], ['outline', m.outlines], ['image', m.images], ['spring', m.springs], ['sensor', m.forceSensors]] as const) {
    if (collection[id]) return { kind, id };
  }
  return null;
}
export function targetExists(target: RadialTarget): boolean { return targetForId(target.id)?.kind === target.kind; }
export function pickRadialTarget(point: Vec2): RadialTarget | null {
  const m = useMechanismStore.getState(), zoom = useEditorStore.getState().camera.zoom;
  const joint = hitTestJoint(point, m.joints, zoom);
  if (joint) return { kind: 'joint', id: joint.id };
  const tracer = hitTestTracer(point, m.tracers, m.bodies, m.joints, zoom);
  if (tracer) return { kind: 'tracer', id: tracer };
  const sensor = hitTestSensor(point, m.forceSensors, m.links, m.joints, zoom);
  if (sensor) return { kind: 'sensor', id: sensor };
  const spring = hitTestSpring(point, m.springs, m.joints, m.links, zoom);
  if (spring) return { kind: 'spring', id: spring };
  for (const collider of Object.values(m.colliders).reverse()) {
    const a = m.joints[collider.jointIdA], c = m.joints[collider.jointIdC];
    if (a && c && !a.hidden && !c.hidden && distToSegment(point, a.position, c.position) <= LINK_HIT_THRESHOLD / zoom) return { kind: 'collider', id: collider.id };
  }
  const link = hitTestLink(point, m.links, m.joints, zoom);
  if (link) return { kind: 'link', id: link.id };
  const outline = hitTestOutline(point, m.outlines, m.bodies, m.joints, zoom)
    ?? hitTestOutlineFilled(point, m.outlines, m.bodies, m.joints, '');
  if (outline) return { kind: 'outline', id: outline.id };
  const image = Object.values(m.images).reverse().find(image => hitTestImage(point, image));
  return image ? { kind: 'image', id: image.id } : null;
}
export function radialUsesToggle(target: RadialTarget): boolean { return target.kind === 'joint' || target.kind === 'collider'; }
export function canAssignBody(target: RadialTarget): boolean { return ['joint', 'collider', 'tracer', 'outline', 'image'].includes(target.kind); }
export function canAddRadialBody(target: RadialTarget): boolean { return canAssignBody(target) && target.kind !== 'tracer'; }
export function dismissRadialMenu(): void {
  const e = useEditorStore.getState(), arc = e.arcSelector;
  if (arc) e.setArcSelector({ ...arc, collapseTime: Date.now() });
  e.setArcSelector(null);
}
export function radialBodies(target: RadialTarget) {
  const m = useMechanismStore.getState();
  return canAssignBody(target) ? Object.values(m.bodies).sort((a, b) => a.id === m.baseBodyId ? -1 : b.id === m.baseBodyId ? 1 : 0) : [];
}
export function radialSelected(target: RadialTarget, bodyId: string): boolean {
  const m = useMechanismStore.getState();
  if (target.kind === 'joint') return m.bodies[bodyId]?.jointIds.includes(target.id) ?? false;
  if (target.kind === 'collider') return m.colliders[target.id]?.bodyIds.includes(bodyId) ?? false;
  return (target.kind === 'tracer' ? m.tracers[target.id] : target.kind === 'outline' ? m.outlines[target.id] : m.images[target.id])?.bodyId === bodyId;
}
export function chooseRadialBody(target: RadialTarget, bodyId: string): void {
  const e = useEditorStore.getState(), m = useMechanismStore.getState();
  if (e.mode !== 'create' || !targetExists(target) || !m.bodies[bodyId]) return;
  if (target.kind === 'joint') {
    if (radialSelected(target, bodyId)) m.removeJointFromBody(target.id, bodyId); else m.addJointToBody(target.id, bodyId);
  } else if (target.kind === 'collider') {
    if (radialSelected(target, bodyId)) m.removeBodyFromCollider(target.id, bodyId); else m.addBodyToCollider(target.id, bodyId);
  } else if (!radialSelected(target, bodyId)) {
    if (target.kind === 'tracer') m.updateTracerBody(target.id, bodyId);
    else if (target.kind === 'outline') { e.setEditingOutline(null); m.editOutline(target.id, { bodyId }); }
    else if (target.kind === 'image') m.editImage(target.id, { bodyId });
  }
}
export function radialAction(target: RadialTarget, action: string): void {
  if (useEditorStore.getState().mode !== 'create' || !targetExists(target)) return;
  if (action === '__add_body__' && canAssignBody(target)) {
    const m = useMechanismStore.getState(), before = m;
    m.pushHistory();
    const history = useMechanismStore.getState().past;
    try {
      const id = useMechanismStore.getState().addBody('Body');
      chooseRadialBody(target, id);
      useMechanismStore.setState({ past: history, future: [] });
      useEditorStore.getState().setActiveBody(id);
    } catch (error) { useMechanismStore.setState(before); throw error; }
  } else if (action === '__delete__') {
    useEditorStore.setState({ selectedIds: new Set([target.id]), editingOutlineId: null, editingVertexIndex: null });
    deleteSelectedEntities();
  }
}
export function openRadialMenu(target: RadialTarget, position: Vec2, openMode: 'hold' | 'context' = 'context', holdPointerStart?: Vec2): void {
  if (useEditorStore.getState().mode !== 'create' || !targetExists(target)) return;
  if (openMode === 'context') cancelInteractions();
  useEditorStore.getState().setArcSelector({
    target, openMode, holdPointerStart, holdMoved: false, jointId: target.kind === 'joint' ? target.id : null, colliderId: target.kind === 'collider' ? target.id : null,
    tracerId: target.kind === 'tracer' ? target.id : null, position: { ...position }, showTime: Date.now(), collapseTime: null,
    readyToToggle: new Set(radialBodies(target).map(b => b.id)), createdBodyId: null, lastToggleTime: 0, lastToggle: null,
  });
}
export function radialAnchor(target: RadialTarget): Vec2 {
  const m = useMechanismStore.getState();
  if (target.kind === 'joint') return m.joints[target.id].position;
  if (target.kind === 'image') return m.images[target.id].position;
  if (target.kind === 'outline') {
    const o = m.outlines[target.id], t = computeBodyTransform(m.bodies[o.bodyId], m.joints);
    const points = o.points.map(p => localToWorld(p, t));
    return points.reduce((p, q) => ({ x: p.x + q.x / points.length, y: p.y + q.y / points.length }), { x: 0, y: 0 });
  }
  if (target.kind === 'tracer') { const t = m.tracers[target.id]; return localToWorld(t.localPosition, computeBodyTransform(m.bodies[t.bodyId], m.joints)); }
  const edge = target.kind === 'collider' ? [m.colliders[target.id].jointIdA, m.colliders[target.id].jointIdC]
    : target.kind === 'link' ? m.links[target.id].jointIds : target.kind === 'sensor' ? m.links[m.forceSensors[target.id].linkId]?.jointIds : undefined;
  if (edge && m.joints[edge[0]] && m.joints[edge[1]]) {
    const a = m.joints[edge[0]].position, b = m.joints[edge[1]].position;
    return { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
  }
  return { x: 100, y: 100 };
}
let textContext: CanvasRenderingContext2D | null = null;
export function currentRadialLayout(width: number, height: number, coarse = false) {
  const e = useEditorStore.getState(), arc = e.arcSelector!;
  const target = arcTarget(arc), p = arc.position;
  const bodies = radialBodies(target);
  if (!textContext && typeof document !== 'undefined') textContext = document.createElement('canvas').getContext('2d');
  const nativeButton = typeof document === 'undefined' ? null : document.querySelector('.top-bar-btn');
  const family = nativeButton ? getComputedStyle(nativeButton).fontFamily : 'Arial';
  if (textContext) textContext.font = '500 ' + (coarse ? 12 : 10) + 'px ' + family;
  const widths = bodies.map(b => {
    const text = b.name.replace(/[ \t\r\n\f]+/g, ' ').replace(/^ | $/g, '');
    return Math.ceil(((textContext?.measureText(text).width ?? text.length * (coarse ? 7 : 6)) + 31) * 64) / 64;
  });
  return radialLayout({ x: p.x * e.camera.zoom + e.camera.pan.x, y: p.y * e.camera.zoom + e.camera.pan.y },
    bodies.map(b => b.id), canAddRadialBody(target), width, height, coarse, widths);
}
