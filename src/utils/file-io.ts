import type { Joint, Link, Body, Outline, CanvasImage, SliderConstraint, ColliderConstraint, Tracer, Vec2 } from '../types';
import { decodeDocument, encodeDocument } from '../document/codec';
import type { DocumentContext, DocumentIssue, JsonObject } from '../document/codec';

declare const __APP_VERSION__: string;

/** View preferences saved with the file */
interface ViewPreferences {
  showLinks?: boolean;
  showVectors?: boolean;
  showRulers?: boolean;
  showForceUnits?: boolean;
  gridLevel?: string;
  camera?: { pan: Vec2; zoom: number };
}

/** Simulation/physics settings saved with the file */
interface SimulationSettings {
  gravityEnabled?: boolean;
  gravityStrength?: number;
  damping?: number;
  dragMultiplier?: number;
  dragDamping?: number;
}

/** Serializable format for a linkage file (.slinker) */
interface SlinkerFile {
  version: string;
  joints: Record<string, { id: string; type: string; position: Vec2; connectedLinkIds: string[] }>;
  links: Record<string, { id: string; jointIds: [string, string]; restLength: number; mass: number }>;
  bodies: Record<string, { id: string; name: string; color: string; jointIds: string[]; useOutlineCOM: boolean; showLinks?: boolean }>;
  baseBodyId: string;
  outlines: Record<string, { id: string; bodyId: string; name?: string; visible?: boolean; points: Vec2[] }>;
  images?: Record<string, { id: string; bodyId: string; src: string; position: Vec2; scale: number; rotation: number; opacity: number; visible: boolean; naturalWidth: number; naturalHeight: number }>;
  sliders?: Record<string, { id: string; jointIdA: string; jointIdB: string; jointIdC: string; t: number }>;
  colliders?: Record<string, { id: string; jointIdA: string; jointIdC: string; bodyIds: string[] }>;
  tracers?: Record<string, { id: string; bodyId: string; localPosition: Vec2; enabled: boolean }>;
  projectName?: string;
  viewPreferences?: ViewPreferences;
  simulationSettings?: SimulationSettings;
}

export function serializeMechanism(
  joints: Record<string, Joint>,
  links: Record<string, Link>,
  bodies: Record<string, Body>,
  baseBodyId: string,
  outlines: Record<string, Outline>,
  images?: Record<string, CanvasImage>,
  sliders?: Record<string, SliderConstraint>,
  colliders?: Record<string, ColliderConstraint>,
  tracers?: Record<string, Tracer>,
  projectName?: string,
  viewPreferences?: ViewPreferences,
  simulationSettings?: SimulationSettings,
  documentContext?: DocumentContext,
): string {
  const data: SlinkerFile = {
    version: __APP_VERSION__,
    joints: {},
    links: {},
    bodies: {},
    baseBodyId,
    outlines: {},
  };

  for (const [id, j] of Object.entries(joints)) {
    // Skip hidden bracing joints — they are regenerated on load
    if (j.hidden) continue;
    data.joints[id] = { id: j.id, type: j.type, position: { x: j.position.x, y: j.position.y }, connectedLinkIds: [...j.connectedLinkIds] };
  }
  for (const [id, l] of Object.entries(links)) {
    // Skip links involving hidden bracing joints
    const jA = joints[l.jointIds[0]];
    const jB = joints[l.jointIds[1]];
    if (jA?.hidden || jB?.hidden) continue;
    data.links[id] = { id: l.id, jointIds: [l.jointIds[0], l.jointIds[1]], restLength: l.restLength, mass: l.mass };
  }
  for (const [id, b] of Object.entries(bodies)) {
    data.bodies[id] = { id: b.id, name: b.name, color: b.color, jointIds: [...b.jointIds], useOutlineCOM: b.useOutlineCOM, showLinks: b.showLinks };
  }
  for (const [id, o] of Object.entries(outlines)) {
    data.outlines[id] = { id: o.id, bodyId: o.bodyId, name: o.name, visible: o.visible, points: o.points.map(p => ({ x: p.x, y: p.y })) };
  }

  if (images) {
    data.images = {};
    for (const [id, img] of Object.entries(images)) {
      data.images[id] = {
        id: img.id, bodyId: img.bodyId, src: img.src,
        position: { x: img.position.x, y: img.position.y },
        scale: img.scale, rotation: img.rotation, opacity: img.opacity,
        visible: img.visible, naturalWidth: img.naturalWidth, naturalHeight: img.naturalHeight,
      };
    }
  }

  if (sliders) {
    data.sliders = {};
    for (const [id, s] of Object.entries(sliders)) {
      data.sliders[id] = { id: s.id, jointIdA: s.jointIdA, jointIdB: s.jointIdB, jointIdC: s.jointIdC, t: s.t };
    }
  }

  if (colliders) {
    data.colliders = {};
    for (const [id, c] of Object.entries(colliders)) {
      data.colliders[id] = { id: c.id, jointIdA: c.jointIdA, jointIdC: c.jointIdC, bodyIds: [...c.bodyIds] };
    }
  }

  if (tracers) {
    data.tracers = {};
    for (const [id, t] of Object.entries(tracers)) {
      data.tracers[id] = { id: t.id, bodyId: t.bodyId, localPosition: { x: t.localPosition.x, y: t.localPosition.y }, enabled: t.enabled };
    }
  }

  if (projectName) data.projectName = projectName;
  if (viewPreferences) data.viewPreferences = viewPreferences;
  if (simulationSettings) data.simulationSettings = simulationSettings;

  return encodeDocument(JSON.parse(JSON.stringify(data)) as JsonObject, __APP_VERSION__, documentContext);
}

export function deserializeMechanism(json: string): {
  joints: Record<string, Joint>;
  links: Record<string, Link>;
  bodies: Record<string, Body>;
  baseBodyId: string;
  outlines: Record<string, Outline>;
  images?: Record<string, CanvasImage>;
  sliders?: Record<string, SliderConstraint>;
  colliders?: Record<string, ColliderConstraint>;
  tracers?: Record<string, Tracer>;
  projectName?: string;
  viewPreferences?: ViewPreferences;
  simulationSettings?: SimulationSettings;
  documentContext: DocumentContext;
  documentIssues: DocumentIssue[];
} | null {
  try {
    const decoded = decodeDocument(json);
    if (!decoded.ok) return null;
    const data = decoded.context.source as unknown as SlinkerFile;

    const joints: Record<string, Joint> = {};
    for (const [id, j] of Object.entries(data.joints)) {
      joints[id] = {
        id: j.id,
        type: j.type as 'revolute' | 'fixed',
        position: { x: j.position.x, y: j.position.y },
        connectedLinkIds: j.connectedLinkIds || [],
      };
    }

    const links: Record<string, Link> = {};
    for (const [id, l] of Object.entries(data.links || {})) {
      links[id] = {
        id: l.id,
        jointIds: [l.jointIds[0], l.jointIds[1]],
        restLength: l.restLength,
        mass: l.mass,
      };
    }

    const bodies: Record<string, Body> = {};
    for (const [id, b] of Object.entries(data.bodies)) {
      bodies[id] = {
        id: b.id,
        name: b.name,
        color: b.color,
        jointIds: b.jointIds || [],
        useOutlineCOM: b.useOutlineCOM ?? false,
        showLinks: b.showLinks ?? true,
      };
    }

    const outlines: Record<string, Outline> = {};
    for (const [id, o] of Object.entries(data.outlines || {})) {
      outlines[id] = {
        id: o.id,
        bodyId: o.bodyId,
        name: o.name || `Shape ${Object.keys(outlines).length + 1}`,
        visible: o.visible ?? true,
        points: o.points.map(p => ({ x: p.x, y: p.y })),
      };
    }

    const images: Record<string, CanvasImage> = {};
    if (data.images) {
      for (const [id, img] of Object.entries(data.images)) {
        images[id] = {
          id: img.id, bodyId: img.bodyId, src: img.src,
          position: { x: img.position.x, y: img.position.y },
          scale: img.scale, rotation: img.rotation, opacity: img.opacity,
          visible: img.visible, naturalWidth: img.naturalWidth, naturalHeight: img.naturalHeight,
        };
      }
    }

    const sliders: Record<string, SliderConstraint> = {};
    if (data.sliders) {
      for (const [id, s] of Object.entries(data.sliders)) {
        sliders[id] = { id: s.id, jointIdA: s.jointIdA, jointIdB: s.jointIdB, jointIdC: s.jointIdC, t: s.t };
      }
    }

    const colliders: Record<string, ColliderConstraint> = {};
    if (data.colliders) {
      for (const [id, c] of Object.entries(data.colliders)) {
        colliders[id] = { id: c.id, jointIdA: c.jointIdA, jointIdC: c.jointIdC, bodyIds: c.bodyIds || [] };
      }
    }

    const tracers: Record<string, Tracer> = {};
    if (data.tracers) {
      for (const [id, t] of Object.entries(data.tracers)) {
        tracers[id] = { id: t.id, bodyId: t.bodyId, localPosition: { x: t.localPosition.x, y: t.localPosition.y }, enabled: t.enabled ?? true };
      }
    }

    return {
      joints, links, bodies, baseBodyId: data.baseBodyId, outlines, images, sliders, colliders, tracers,
      projectName: data.projectName,
      viewPreferences: data.viewPreferences,
      simulationSettings: data.simulationSettings,
      documentContext: decoded.context,
      documentIssues: decoded.issues,
    };
  } catch {
    return null;
  }
}

export function downloadFile(content: string, filename: string, mimeType = 'application/octet-stream') {
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}
