import type { Joint, Link, SliderConstraint } from '../../types';

/** Native `title` text for DOF in the panel and canvas HUD hit-zone. */
export const DOF_TOOLTIP =
  'DOF = 2×movable joints − distance links (touching a movable end) − sliders − driver. Negative means over-constrained by this count (often redundant links). Independent constraints can differ, so actual motion may not match this integer.';

function jointIsFixed(jointId: string, joints: Record<string, Joint>, fixedJointIds?: Set<string>): boolean {
  const j = joints[jointId];
  if (!j || j.hidden) return true;
  return fixedJointIds ? fixedJointIds.has(jointId) : j.type === 'fixed';
}

/**
 * DOF ≈ 2 * (free joints) - (independent distance links) - (sliders) - (driver).
 * Links between two fixed joints do not remove unknowns. Each slider (B on A–C)
 * removes one DOF when the slider joint B is free.
 */
export function computeDOF(
  joints: Record<string, Joint>,
  links: Record<string, Link>,
  hasDriver: boolean,
  fixedJointIds?: Set<string>,
  sliders?: Record<string, SliderConstraint>,
): number {
  let unknowns = 0;
  for (const joint of Object.values(joints)) {
    if (joint.hidden) continue; // exclude bracing joints from user-facing DOF
    const isFixed = jointIsFixed(joint.id, joints, fixedJointIds);
    if (isFixed) continue;
    unknowns += 2;
  }

  let constraints = 0;
  for (const link of Object.values(links)) {
    const jA = joints[link.jointIds[0]];
    const jB = joints[link.jointIds[1]];
    if (jA?.hidden || jB?.hidden) continue;
    const idA = link.jointIds[0];
    const idB = link.jointIds[1];
    if (jointIsFixed(idA, joints, fixedJointIds) && jointIsFixed(idB, joints, fixedJointIds)) continue;
    constraints++;
  }

  if (sliders) {
    for (const s of Object.values(sliders)) {
      if (jointIsFixed(s.jointIdB, joints, fixedJointIds)) continue;
      constraints += 1;
    }
  }

  if (hasDriver) constraints += 1;

  return unknowns - constraints;
}
