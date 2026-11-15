import type { Joint, Link, SliderConstraint } from '../../types';

// Rows have unit norm; pivots below this tolerance are numerically dependent.
const RANK_TOLERANCE = 1e-10;

function numericalRank(rows: number[][], columns: number): number {
  let rank = 0;
  while (rank < Math.min(rows.length, columns)) {
    let pivotRow = rank;
    let pivotColumn = rank;
    let largest = 0;
    for (let i = rank; i < rows.length; i++) {
      for (let j = rank; j < columns; j++) {
        const magnitude = Math.abs(rows[i][j]);
        if (magnitude > largest) {
          largest = magnitude;
          pivotRow = i;
          pivotColumn = j;
        }
      }
    }
    if (largest <= RANK_TOLERANCE) break;

    // Complete pivoting avoids depending on joint/link iteration order.
    [rows[rank], rows[pivotRow]] = [rows[pivotRow], rows[rank]];
    for (const row of rows) {
      [row[rank], row[pivotColumn]] = [row[pivotColumn], row[rank]];
    }
    for (let i = rank + 1; i < rows.length; i++) {
      const factor = rows[i][rank] / rows[rank][rank];
      rows[i][rank] = 0;
      for (let j = rank + 1; j < columns; j++) {
        rows[i][j] -= factor * rows[rank][j];
      }
    }
    rank++;
  }
  return rank;
}

function finitePosition(joint: Joint | undefined): joint is Joint {
  return !!joint && Number.isFinite(joint.position.x) && Number.isFinite(joint.position.y);
}

function direction(a: Joint, b: Joint) {
  const dx = b.position.x - a.position.x;
  const dy = b.position.y - a.position.y;
  const scale = Math.max(Math.abs(dx), Math.abs(dy));
  if (!Number.isFinite(scale) || scale === 0) return undefined;
  const length = Math.hypot(dx / scale, dy / scale);
  return { x: (dx / scale) / length, y: (dy / scale) / length, scale, length };
}

/**
 * Instantaneous/local linearized DOF of the full compiled joint graph.
 * Numerical Jacobian nullity is not a guarantee of finite motion at singularities
 * or of constraint feasibility. Invalid/undefined rows are ignored, not validated.
 * A driver is estimated to remove at most one otherwise free DOF. Slider endpoint
 * limits are intentionally not treated as active equalities in this first slice.
 */
export function computeDOF(
  joints: Record<string, Joint>,
  links: Record<string, Link>,
  hasDriver: boolean,
  fixedJointIds?: Set<string>,
  sliders?: Record<string, SliderConstraint>,
): number {
  const validLinks = Object.values(links).filter((link) => (
    link.jointIds[0] !== link.jointIds[1]
    && finitePosition(joints[link.jointIds[0]])
    && finitePosition(joints[link.jointIds[1]])
    && Number.isFinite(link.restLength) && link.restLength >= 0
  ));
  const linkedJointIds = new Set(validLinks.flatMap((link) => link.jointIds));
  const jointIndex = new Map<string, number>();
  for (const joint of Object.values(joints)) {
    if (joint.hidden && !linkedJointIds.has(joint.id)) continue;
    const isFixed = (joint.hidden && joint.type === 'fixed')
      || (fixedJointIds ? fixedJointIds.has(joint.id) : joint.type === 'fixed');
    if (isFixed) continue;
    jointIndex.set(joint.id, jointIndex.size * 2);
  }
  const variables = jointIndex.size * 2;
  if (variables === 0) return 0;

  const rows: number[][] = [];
  function addRow(gradients: [string, number, number][]) {
    const row = new Array<number>(variables).fill(0);
    for (const [id, dx, dy] of gradients) {
      const index = jointIndex.get(id);
      if (index === undefined) continue;
      row[index] += dx;
      row[index + 1] += dy;
    }
    let scale = 0;
    for (const value of row) {
      if (!Number.isFinite(value)) return;
      scale = Math.max(scale, Math.abs(value));
    }
    if (scale === 0) return;
    let norm = 0;
    for (const value of row) norm = Math.hypot(norm, value / scale);
    rows.push(row.map((value) => (value / scale) / norm));
  }

  for (const link of validLinks) {
    const [a, b] = link.jointIds;
    if (link.restLength === 0) {
      // A zero-rest link means coincidence, not a squared-distance zero gradient.
      addRow([[a, 1, 0], [b, -1, 0]]);
      addRow([[a, 0, 1], [b, 0, -1]]);
      continue;
    }
    const unit = direction(joints[a], joints[b]);
    if (!unit) continue;
    addRow([[a, -unit.x, -unit.y], [b, unit.x, unit.y]]);
  }

  for (const slider of Object.values(sliders ?? {})) {
    const a = joints[slider.jointIdA];
    const b = joints[slider.jointIdB];
    const c = joints[slider.jointIdC];
    if (!finitePosition(a) || !finitePosition(b) || !finitePosition(c)) continue;
    const unit = direction(a, c);
    if (!unit) continue;
    const bx = (b.position.x - a.position.x) / unit.scale;
    const by = (b.position.y - a.position.y) / unit.scale;
    const t = (bx * unit.x + by * unit.y) / unit.length;
    if (!Number.isFinite(t)) continue;
    const nx = -unit.y;
    const ny = unit.x;
    // Analytic gradient of cross(C-A, B-A) / |C-A|, including moving rails.
    addRow([
      [a.id, (t - 1) * nx, (t - 1) * ny],
      [b.id, nx, ny],
      [c.id, -t * nx, -t * ny],
    ]);
  }

  const freeDOF = variables - numericalRank(rows, variables);
  const driverRank = hasDriver && freeDOF > 0 ? 1 : 0;
  return Math.max(0, freeDOF - driverRank);
}
