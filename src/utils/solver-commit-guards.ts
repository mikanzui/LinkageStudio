import type { Vec2 } from '../types';

/** True if every position in the map has finite x/y. */
export function jointPositionsFinite(positions: Map<string, Vec2>): boolean {
  for (const p of positions.values()) {
    if (!Number.isFinite(p.x) || !Number.isFinite(p.y)) return false;
  }
  return true;
}
