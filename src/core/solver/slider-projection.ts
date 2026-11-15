import type { Joint, SliderConstraint } from '../../types';

/** Project into the caller-owned position buffer; fixed coordinates are never written. */
export function projectSlider(slider: SliderConstraint, joints: Record<string, Joint>, index: Map<string, number>, positions: Float64Array): void {
  const ia = index.get(slider.jointIdA), ib = index.get(slider.jointIdB), ic = index.get(slider.jointIdC);
  const a = joints[slider.jointIdA], b = joints[slider.jointIdB], c = joints[slider.jointIdC];
  if (!a || !b || !c) return;
  const ax = ia === undefined ? a.position.x : positions[ia], ay = ia === undefined ? a.position.y : positions[ia + 1];
  const bx = ib === undefined ? b.position.x : positions[ib], by = ib === undefined ? b.position.y : positions[ib + 1];
  const cx = ic === undefined ? c.position.x : positions[ic], cy = ic === undefined ? c.position.y : positions[ic + 1];
  const dx = cx - ax, dy = cy - ay, length = Math.hypot(dx, dy);
  if (!Number.isFinite(length) || length < 1e-10) return;
  const nx = -dy / length, ny = dx / length;
  const t = ((bx - ax) * dx + (by - ay) * dy) / (length * length);
  const error = (bx - ax) * nx + (by - ay) * ny;
  const wa = ia === undefined ? 0 : 1, wb = ib === undefined ? 0 : 1, wc = ic === undefined ? 0 : 1;
  const denominator = wa * (1 - t) ** 2 + wb + wc * t ** 2;
  if (denominator > 1e-16) {
    const scale = error / denominator;
    if (ia !== undefined) { positions[ia] += (1 - t) * scale * nx; positions[ia + 1] += (1 - t) * scale * ny; }
    if (ib !== undefined) { positions[ib] -= scale * nx; positions[ib + 1] -= scale * ny; }
    if (ic !== undefined) { positions[ic] += t * scale * nx; positions[ic + 1] += t * scale * ny; }
  }
  const newAx = ia === undefined ? ax : positions[ia], newAy = ia === undefined ? ay : positions[ia + 1];
  const newCx = ic === undefined ? cx : positions[ic], newCy = ic === undefined ? cy : positions[ic + 1];
  const newBx = ib === undefined ? bx : positions[ib], newBy = ib === undefined ? by : positions[ib + 1];
  const railX = newCx - newAx, railY = newCy - newAy, railSq = railX * railX + railY * railY;
  if (railSq < 1e-20) return;
  const newT = ((newBx - newAx) * railX + (newBy - newAy) * railY) / railSq;
  const endpointIndex = newT < 0 ? ia : newT > 1 ? ic : undefined;
  if (newT >= 0 && newT <= 1) return;
  const endpointX = newT < 0 ? newAx : newCx, endpointY = newT < 0 ? newAy : newCy;
  const w = (ib === undefined ? 0 : 1) + (endpointIndex === undefined ? 0 : 1);
  if (w === 0) return;
  const ex = (newBx - endpointX) / w, ey = (newBy - endpointY) / w;
  if (ib !== undefined) { positions[ib] -= ex; positions[ib + 1] -= ey; }
  if (endpointIndex !== undefined) { positions[endpointIndex] += ex; positions[endpointIndex + 1] += ey; }
}
