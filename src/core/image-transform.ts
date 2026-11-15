import type { Body, CanvasImage, Joint } from '../types';
import { computeBodyTransform, localToWorld, worldToLocal } from './body-transform';

/** Images persist their design-world pose; runtime projection never mutates that pose. */
export function projectImages(images: Record<string, CanvasImage>, bodies: Record<string, Body>, design: Record<string, Joint>, current: Record<string, Joint>): Record<string, CanvasImage> {
  const frames = new Map(Object.values(bodies).map(body => [body.id, { design: computeBodyTransform(body,design), current: computeBodyTransform(body,current) }]));
  return Object.fromEntries(Object.entries(images).map(([id,image]) => {
    const frame = frames.get(image.bodyId);
    return [id, frame ? { ...image, position: localToWorld(worldToLocal(image.position,frame.design),frame.current), rotation: image.rotation + frame.current.angle - frame.design.angle } : image];
  }));
}
