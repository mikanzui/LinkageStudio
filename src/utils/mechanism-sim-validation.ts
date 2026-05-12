import type { ColliderConstraint, Joint, Link, SliderConstraint } from '../types';

/** Cheap checks before running `solveWithForce` (issue #19). */
export function validateMechanismForSimulateStep(
  joints: Record<string, Joint>,
  links: Record<string, Link>,
  sliders?: Record<string, SliderConstraint>,
  colliders?: Record<string, ColliderConstraint>,
): { ok: boolean; reason?: string } {
  for (const j of Object.values(joints)) {
    if (!Number.isFinite(j.position.x) || !Number.isFinite(j.position.y)) {
      return { ok: false, reason: 'A joint has a non-finite position. Reset or fix coordinates before simulating.' };
    }
  }
  for (const link of Object.values(links)) {
    const a = joints[link.jointIds[0]];
    const b = joints[link.jointIds[1]];
    if (!a || !b) {
      return { ok: false, reason: `Link "${link.id}" references a missing joint.` };
    }
    if (!(link.restLength > 1e-10)) {
      return { ok: false, reason: `Link "${link.id}" has zero or negative rest length.` };
    }
  }
  if (sliders) {
    for (const s of Object.values(sliders)) {
      if (!joints[s.jointIdA] || !joints[s.jointIdB] || !joints[s.jointIdC]) {
        return { ok: false, reason: 'A slider constraint references a missing joint.' };
      }
    }
  }
  if (colliders) {
    for (const c of Object.values(colliders)) {
      if (!joints[c.jointIdA] || !joints[c.jointIdC]) {
        return { ok: false, reason: 'A collider references a missing joint.' };
      }
    }
  }
  return { ok: true };
}
