import type { Joint, Link, MechanismSpring, SpringAnchor } from '../types';

/** Preserve fractional attachment identity when generated link IDs/order change. */
export function remapSpringAnchors(
  springs: Record<string, MechanismSpring>, previous: Record<string, Link>,
  next: Record<string, Link>, joints: Record<string, Joint>,
): Record<string, MechanismSpring> {
  const remap = (anchor: SpringAnchor): SpringAnchor | null => {
    if (anchor.type === 'world') return anchor;
    if (anchor.type === 'joint') return joints[anchor.jointId] ? anchor : null;
    const before = previous[anchor.linkId];
    if (!before) return null;
    const samePair = (link: Link) => link.jointIds.includes(before.jointIds[0]) && link.jointIds.includes(before.jointIds[1]);
    const link = next[anchor.linkId] && samePair(next[anchor.linkId]) ? next[anchor.linkId] : Object.values(next).find(samePair);
    if (!link || !link.jointIds.every(id => joints[id])) return null;
    return { ...anchor, linkId: link.id, t: link.jointIds[0] === before.jointIds[0] ? anchor.t : 1 - anchor.t };
  };
  return Object.fromEntries(Object.entries(springs).flatMap(([id, spring]) => {
    const anchorA = remap(spring.anchorA), anchorB = remap(spring.anchorB);
    return anchorA && anchorB ? [[id, { ...spring, anchorA, anchorB }]] : [];
  }));
}
