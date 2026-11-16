import type { SpringAnchor, Vec2, MechanismSpring } from '../types';
import { useMechanismStore } from '../store/mechanism-store';
import { useEditorStore } from '../store/editor-store';
import { hitTestJoint, hitTestLink } from './hit-test';
import { resolveSpringAnchor, torsionGeometry } from '../core/springs/spring-model';
import { setProjectMessage } from '../document/project';

export function placeSpring(world: Vec2): boolean {
  const e = useEditorStore.getState(), m = useMechanismStore.getState();
  if (!['spring', 'damper', 'torsion'].includes(e.createTool)) return false;
  const pending = e.springPlacement;
  const joint = hitTestJoint(world, m.joints, e.camera.zoom);
  const link = hitTestLink(world, m.links, m.joints, e.camera.zoom);
  try {
    let spring: Omit<MechanismSpring, 'id'>;
    if (e.createTool === 'torsion') {
      if (!pending?.pivotId) {
        if (joint) useEditorStore.setState({ springPlacement: { pivotId: joint.id } });
        return true;
      }
      if (!link || !link.jointIds.includes(pending.pivotId) || link.id === pending.linkAId) return true;
      if (!pending.linkAId) {
        useEditorStore.setState({ springPlacement: { ...pending, linkAId: link.id } }); return true;
      }
      const leg = (linkId: string): SpringAnchor => ({ type: 'link', linkId, t: m.links[linkId].jointIds[0] === pending.pivotId ? 0 : 1 });
      spring = { kind: 'torsional', anchorA: leg(pending.linkAId), anchorB: leg(link.id), stiffness: 20, damping: 4, restLength: 0, prestressDelta: 0 };
      const geometry = torsionGeometry({ ...spring, id: 'placement' }, m.joints, m.links);
      if (!geometry) return true;
      spring.restLength = Math.atan2((geometry.a.x - geometry.pivot.x) * (geometry.b.y - geometry.pivot.y) - (geometry.a.y - geometry.pivot.y) * (geometry.b.x - geometry.pivot.x),
        (geometry.a.x - geometry.pivot.x) * (geometry.b.x - geometry.pivot.x) + (geometry.a.y - geometry.pivot.y) * (geometry.b.y - geometry.pivot.y));
    } else {
      let anchor: SpringAnchor;
      if (joint) anchor = { type: 'joint', jointId: joint.id };
      else if (link) {
        const a = m.joints[link.jointIds[0]].position, b = m.joints[link.jointIds[1]].position;
        const dx = b.x - a.x, dy = b.y - a.y, length2 = dx * dx + dy * dy;
        const t = length2 ? Math.max(0, Math.min(1, ((world.x - a.x) * dx + (world.y - a.y) * dy) / length2)) : 0;
        anchor = { type: 'link', linkId: link.id, t: Math.round(t * e.springSnapSteps) / e.springSnapSteps };
      } else anchor = { type: 'world', position: { ...world } };
      if (!pending?.anchorA) {
        useEditorStore.setState({ springPlacement: { anchorA: anchor } }); return true;
      }
      const a = resolveSpringAnchor(pending.anchorA, m.joints, m.links), b = resolveSpringAnchor(anchor, m.joints, m.links);
      if (!a || !b || Math.hypot(b.x - a.x, b.y - a.y) < 1e-8) return true;
      spring = { kind: e.createTool === 'damper' ? 'damper' : 'linear', anchorA: pending.anchorA, anchorB: anchor,
        stiffness: e.createTool === 'damper' ? 0 : 150, damping: 12, restLength: Math.hypot(b.x - a.x, b.y - a.y), prestressDelta: 0 };
    }
    let number = 1;
    const names = new Set(Object.values(m.springs).map(s => s.name));
    while (names.has(`Spring ${number}`)) number++;
    const id = e.springReattachId && m.springs[e.springReattachId] ? e.springReattachId : m.addSpring({ ...spring, name: `Spring ${number}` });
    if (e.springReattachId && m.springs[e.springReattachId]) m.editSpring(id, { anchorA: spring.anchorA, anchorB: spring.anchorB });
    useEditorStore.setState({ springPlacement: null, springReattachId: null, placementCommitted: true }); e.select(id);
  } catch (error) { setProjectMessage(error instanceof Error ? error.message : 'Could not place spring.', 'alert'); }
  return true;
}
