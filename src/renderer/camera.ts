import type { Vec2, CameraState } from '../types';

export function screenToWorld(screen: Vec2, camera: CameraState): Vec2 {
  return {
    x: (screen.x - camera.pan.x) / camera.zoom,
    y: (screen.y - camera.pan.y) / camera.zoom,
  };
}

export function worldToScreen(world: Vec2, camera: CameraState): Vec2 {
  return {
    x: world.x * camera.zoom + camera.pan.x,
    y: world.y * camera.zoom + camera.pan.y,
  };
}

export function applyCamera(ctx: CanvasRenderingContext2D, camera: CameraState, pixelRatio = 1) {
  ctx.setTransform(camera.zoom * pixelRatio, 0, 0, camera.zoom * pixelRatio, camera.pan.x * pixelRatio, camera.pan.y * pixelRatio);
}

export function resetCamera(ctx: CanvasRenderingContext2D, pixelRatio = 1) {
  ctx.setTransform(pixelRatio, 0, 0, pixelRatio, 0, 0);
}
