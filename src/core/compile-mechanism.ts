import type { MechanismState, Joint, Link } from '../types';
import { generateBodyLinks } from './body-links';

export function snapshotMechanism(state: MechanismState): MechanismState {
  const { joints, links, bodies, baseBodyId, outlines, images, sliders, colliders, tracers } = state;
  return structuredClone({ joints, links, bodies, baseBodyId, outlines, images, sliders, colliders, tracers });
}

/** Derive invisible rigidity scaffolding without rewriting saved links or source data. */
export function compileMechanism(source: MechanismState) {
  const graph = snapshotMechanism(source);
  graph.joints = Object.fromEntries(Object.entries(graph.joints).filter(([id, j]) => !j.hidden && !id.startsWith('__temp_')));
  graph.links = Object.fromEntries(Object.entries(graph.links).filter(([, l]) => graph.joints[l.jointIds[0]] && graph.joints[l.jointIds[1]]));
  for (const link of Object.values(graph.links)) {
    if (!Number.isFinite(link.restLength) || link.restLength < 0) throw new Error(`Link ${link.id}: rest length must be finite and nonnegative.`);
  }
  const derived = generateBodyLinks(graph.bodies, graph.joints, graph.sliders);
  for (const link of derived.links) {
    if (graph.joints[link.jointIds[0]]?.hidden || graph.joints[link.jointIds[1]]?.hidden) graph.links[link.id] = link;
  }
  const fixedIds = new Set(graph.bodies[graph.baseBodyId]?.jointIds ?? []);
  const baseBrace = graph.joints[`__brace_${graph.baseBodyId}`];
  if (baseBrace) fixedIds.add(baseBrace.id);
  for (const joint of Object.values(graph.joints)) {
    if (!Number.isFinite(joint.position.x) || !Number.isFinite(joint.position.y)) throw new Error(`Joint ${joint.id}: position must be finite.`);
    joint.type = fixedIds.has(joint.id) ? 'fixed' : 'revolute';
    joint.connectedLinkIds = [];
  }
  for (const link of Object.values(graph.links)) for (const id of link.jointIds) graph.joints[id].connectedLinkIds.push(link.id);
  return { ...graph, fixedIds, angleConstraints: derived.angleConstraints };
}

export function maximumLinkError(joints: Record<string, Joint>, links: Record<string, Link>): number {
  let maximum = 0;
  for (const link of Object.values(links)) {
    const a = joints[link.jointIds[0]], b = joints[link.jointIds[1]];
    if (!a || !b) return Infinity;
    maximum = Math.max(maximum, Math.abs(Math.hypot(a.position.x - b.position.x, a.position.y - b.position.y) - link.restLength));
  }
  return maximum;
}
