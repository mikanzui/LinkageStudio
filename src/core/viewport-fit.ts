import type { Joint, Outline, Body, Tracer } from '../types';
import type { CameraState } from '../types/editor';
import { computeBodyTransform, localToWorld } from './body-transform';

export type WorldBounds = { minX: number; maxX: number; minY: number; maxY: number };

function expand(b: WorldBounds, x: number, y: number) {
  b.minX = Math.min(b.minX, x);
  b.maxX = Math.max(b.maxX, x);
  b.minY = Math.min(b.minY, y);
  b.maxY = Math.max(b.maxY, y);
}

/**
 * Axis-aligned bounds of visible mechanism content (joints, outline shapes, tracers).
 */
export function getMechanismWorldBounds(
  joints: Record<string, Joint>,
  outlines: Record<string, Outline>,
  bodies: Record<string, Body>,
  tracers: Record<string, Tracer>,
): WorldBounds | null {
  const bounds: WorldBounds = {
    minX: Infinity,
    maxX: -Infinity,
    minY: Infinity,
    maxY: -Infinity,
  };
  let any = false;

  for (const j of Object.values(joints)) {
    if (j.hidden) continue;
    any = true;
    expand(bounds, j.position.x, j.position.y);
  }

  for (const outline of Object.values(outlines)) {
    const body = bodies[outline.bodyId];
    if (!body || outline.points.length === 0) continue;
    const transform = computeBodyTransform(body, joints);
    for (const p of outline.points) {
      const w = localToWorld(p, transform);
      any = true;
      expand(bounds, w.x, w.y);
    }
  }

  for (const tracer of Object.values(tracers)) {
    const body = bodies[tracer.bodyId];
    if (!body) continue;
    const transform = computeBodyTransform(body, joints);
    const w = localToWorld(tracer.localPosition, transform);
    any = true;
    expand(bounds, w.x, w.y);
  }

  if (!any) return null;
  return bounds;
}

/** Fit camera so bounds fill the canvas with padding (screen px). */
export function fitCameraToBounds(
  bounds: WorldBounds,
  canvasWidth: number,
  canvasHeight: number,
  paddingPx: number,
): CameraState {
  let w = bounds.maxX - bounds.minX;
  let h = bounds.maxY - bounds.minY;
  const cx = (bounds.minX + bounds.maxX) / 2;
  const cy = (bounds.minY + bounds.maxY) / 2;
  const minSpan = 80;
  if (w < 1e-6) w = minSpan;
  if (h < 1e-6) h = minSpan;

  const pad = paddingPx;
  const availW = Math.max(20, canvasWidth - 2 * pad);
  const availH = Math.max(20, canvasHeight - 2 * pad);
  let zoom = Math.min(availW / w, availH / h);
  zoom = Math.max(0.1, Math.min(10, zoom));

  return {
    zoom,
    pan: {
      x: canvasWidth / 2 - cx * zoom,
      y: canvasHeight / 2 - cy * zoom,
    },
  };
}
