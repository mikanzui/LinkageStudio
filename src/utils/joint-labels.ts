import type { Joint } from '../types';

const JOINT_NUMBER_RE = /^Joint\s+(\d+)$/i;

/** Next integer N so `Joint ${N}` does not collide with existing `Joint M` labels. */
export function nextJointDisplayNumber(joints: Record<string, Joint>): number {
  let max = 0;
  for (const j of Object.values(joints)) {
    if (!j || j.hidden) continue;
    const m = j.label?.trim().match(JOINT_NUMBER_RE);
    if (m) max = Math.max(max, parseInt(m[1], 10));
  }
  return max + 1;
}

/** Assign `Joint 1`, `Joint 2`, … to joints with no label (load migration / legacy files). */
export function assignMissingJointLabels(joints: Record<string, Joint>): Record<string, Joint> {
  const ids = Object.keys(joints)
    .filter((id) => joints[id] && !joints[id].hidden)
    .sort();
  const used = new Set<number>();
  for (const j of Object.values(joints)) {
    const m = j.label?.trim().match(JOINT_NUMBER_RE);
    if (m) used.add(parseInt(m[1], 10));
  }
  let next = 1;
  const out: Record<string, Joint> = { ...joints };
  for (const id of ids) {
    const j = out[id];
    if (j.label?.trim()) continue;
    while (used.has(next)) next++;
    out[id] = { ...j, label: `Joint ${next}` };
    used.add(next);
    next++;
  }
  return out;
}

/** Display string for UI (Bodies menu, etc.). */
export function getJointDisplayName(j: Joint): string {
  const t = j.label?.trim();
  if (t) return t;
  return j.id.length > 10 ? `${j.id.slice(0, 6)}…` : j.id;
}
