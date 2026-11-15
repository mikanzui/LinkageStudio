import { create } from 'zustand';
import { decodeDocument } from './codec';
import type { DocumentIssue } from './codec';
import { deserializeMechanism, serializeMechanism } from '../utils/file-io';
import { useMechanismStore } from '../store/mechanism-store';
import { useEditorStore } from '../store/editor-store';
import { useSimulationStore } from '../store/simulation-store';

export const useProjectStatus = create<{ savedText: string | null; message: string; severity: 'status' | 'alert' }>(() => ({ savedText: null, message: '', severity: 'status' }));

export function projectText(name?: string): string {
  const m = useMechanismStore.getState(), e = useEditorStore.getState(), s = useSimulationStore.getState();
  const joints = e.mode === 'simulate' && e.savedPositions
    ? Object.fromEntries(Object.entries(m.joints).map(([id, j]) => [id, { ...j, position: e.savedPositions?.[id] ?? j.position }])) : m.joints;
  return serializeMechanism(joints, m.links, m.bodies, m.baseBodyId, m.outlines, m.images, m.sliders, m.colliders, m.tracers, name ?? e.projectName,
    { showLinks: e.showLinks, showVectors: e.showVectors, showRulers: e.showRulers, showForceUnits: e.showForceUnits, gridLevel: e.gridLevel, camera: e.camera },
    { gravityEnabled: s.gravityEnabled, gravityStrength: s.gravityStrength, damping: s.damping, dragMultiplier: s.dragMultiplier, dragDamping: s.dragDamping }, m.documentContext);
}

// Camera/view changes alone do not require a destructive-navigation confirmation.
function designText(text: string): string {
  const data = JSON.parse(text);
  delete data.viewPreferences;
  for (const joint of Object.values(data.joints) as { connectedLinkIds?: string[] }[]) delete joint.connectedLinkIds;
  return JSON.stringify(data);
}
export function markProjectSaved(text = projectText()): void { useProjectStatus.setState({ savedText: designText(text) }); }
export function isProjectDirty(): boolean {
  const saved = useProjectStatus.getState().savedText;
  return saved !== null && designText(projectText()) !== saved;
}
export function setProjectMessage(message: string, severity: 'status' | 'alert' = 'status'): void { useProjectStatus.setState({ message, severity }); }

export function importProject(text: string): { ok: boolean; issues: DocumentIssue[] } {
  const decoded = decodeDocument(text);
  if (!decoded.ok) return decoded;
  const unsupported = ['springs', 'forceSensors'].filter(key => {
    const value = decoded.context.source[key];
    return value && typeof value === 'object' && Object.keys(value).length > 0;
  });
  if (unsupported.length) return { ok: false, issues: [{ severity: 'error', path: unsupported.join(', '), message: 'This rebuild stage cannot edit these features yet. The file and current project are unchanged.' }] };
  const state = deserializeMechanism(text);
  if (!state) return { ok: false, issues: [{ severity: 'error', path: '$', message: 'Could not construct the mechanism.' }] };
  // The store prepares a cloned graph before publishing; invalid input never clears the project.
  useMechanismStore.getState().loadState(state);
  useEditorStore.getState().setMode('create');
  useEditorStore.setState({ savedPositions: null, activeBodyIds: new Set(), hoveredId: null, arcSelector: null,
    projectName: state.projectName ?? 'Untitled', frozenOutlineWorldPoints: new Map(), outlinePoints: [] });
  const vp = state.viewPreferences;
  if (vp) {
    const prefs: Partial<ReturnType<typeof useEditorStore.getState>> = {};
    for (const key of ['showLinks', 'showVectors', 'showRulers', 'showForceUnits'] as const) if (vp[key] !== undefined) prefs[key] = vp[key];
    if (vp.camera) prefs.camera = structuredClone(vp.camera);
    useEditorStore.setState(prefs);
    if (vp.gridLevel) useEditorStore.getState().setGridLevel(vp.gridLevel as 'normal' | 'fine' | 'ultrafine' | 'off');
  }
  useSimulationStore.getState().reset();
  useSimulationStore.setState({ driverJointId: null, driverLinkId: null, solverResult: null, trackedJointIds: new Set(), tracingEnabled: false,
    gravityEnabled: false, gravityStrength: 250, damping: 0.5, dragMultiplier: 25, dragDamping: 0.25, ...state.simulationSettings });
  markProjectSaved();
  return { ok: true, issues: decoded.issues };
}
