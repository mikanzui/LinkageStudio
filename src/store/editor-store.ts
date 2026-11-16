import { create } from 'zustand';
import type { AppMode, ToolType, JointSubType, CreateTool, JointMode, CameraState, SimDragState, GridLevel } from '../types';
import type { Vec2 } from '../types';
import type { MechanismState, SpringAnchor } from '../types';
import { DEFAULT_GRID_SIZE } from '../utils/constants';
import { clampZoom } from '../renderer/viewport';
import { useMechanismStore } from './mechanism-store';
import { resetHitTesting } from '../interaction/hit-test';
import type { SelectMode, SelectionGesture, RadialTarget } from '../types/editor';
import { computeBodyTransform, localToWorld } from '../core/body-transform';

const GRID_DIVISOR: Record<GridLevel, number> = {
  normal: 1,
  fine: 4,
  ultrafine: 16,
  off: 1,
};

function gridLevelToSize(level: GridLevel): number {
  return DEFAULT_GRID_SIZE / GRID_DIVISOR[level];
}

const GRID_CYCLE: GridLevel[] = ['normal', 'fine', 'ultrafine', 'off'];

interface EditorStore {
  springPlacement: { anchorA?: SpringAnchor; pivotId?: string; linkAId?: string } | null;
  springSnapSteps: number;
  springReattachId: string | null;
  placementCommitted: boolean;
  mode: AppMode;
  activeTool: ToolType;
  selectMode: SelectMode;
  selectionGesture: SelectionGesture | null;
  excludedBodies: Set<string>;
  setSelectMode(mode: SelectMode): void;
  toggleExcludedBody(id: string): void;
  jointSubType: JointSubType;
  selectedIds: Set<string>;
  hoveredId: string | null;
  camera: CameraState;
  gridEnabled: boolean;
  gridSize: number;
  gridLevel: GridLevel;
  linkStartJointId: string | null;
  simDrag: SimDragState | null;
  savedPositions: Record<string, Vec2> | null;
  simulationDesign: MechanismState | null;
  activeBodyIds: Set<string>;
  showLinks: boolean;
  showVectors: boolean;
  showRulers: boolean;
  showForceUnits: boolean;
  showLoads: boolean;
  showReactions: boolean;
  projectName: string;
  createTool: CreateTool;
  shapeGesture: { start: Vec2; end: Vec2; square: boolean } | null;
  ngonSides: number;
  square: boolean;
  trimStroke: Vec2[];
  trimScope: 'selected' | 'active';
  mirrorAxis: 'vertical' | 'horizontal';
  mirrorValue: number;
  mirrorScope: 'selection' | 'all';
  jointMode: JointMode;
  autoChainLastBodyId: string | null;
  outlinePoints: Vec2[];
  lockOutlines: boolean;
  frozenOutlineWorldPoints: Map<string, Vec2[]>;
  leftCollapsed: boolean;
  rightCollapsed: boolean;
  leftWidth: number;
  rightWidth: number;
  setPanelWidth(side: 'left' | 'right', width: number): void;
  imageDragMode: 'move' | 'rotate' | 'scale' | null;
  sliderPointA: { position: Vec2; jointId: string } | null;
  colliderPointA: { position: Vec2; jointId: string } | null;

  setMode(mode: AppMode): void;
  setTool(tool: ToolType): void;
  setJointSubType(type: JointSubType): void;
  select(id: string): void;
  toggleSelect(id: string): void;
  clearSelection(): void;
  setHovered(id: string | null): void;
  panCamera(delta: Vec2): void;
  zoomCamera(factor: number, center: Vec2): void;
  setLinkStart(id: string | null): void;
  cycleGrid(): void;
  setGridLevel(level: GridLevel): void;
  setSimDrag(drag: SimDragState | null): void;
  setSavedPositions(positions: Record<string, Vec2> | null): void;
  toggleActiveBody(id: string): void;
  setActiveBody(id: string): void;
  toggleShowLinks(): void;
  toggleShowVectors(): void;
  toggleShowRulers(): void;
  toggleShowForceUnits(): void;
  setProjectName(name: string): void;
  setCreateTool(tool: CreateTool): void;
  setJointMode(mode: JointMode): void;
  setAutoChainLastBodyId(id: string | null): void;
  addOutlinePoint(pt: Vec2): void;
  clearOutlinePoints(): void;
  setLockOutlines(locked: boolean, frozenPoints?: Map<string, Vec2[]>): void;
  toggleLeftCollapsed(): void;
  toggleRightCollapsed(): void;
  setImageDragMode(mode: 'move' | 'rotate' | 'scale' | null): void;
  setSliderPointA(point: { position: Vec2; jointId: string } | null): void;
  setColliderPointA(point: { position: Vec2; jointId: string } | null): void;
  editingOutlineId: string | null;
  editingVertexIndex: number | null;

  /** Long-press arc body selector state */
  arcSelector: {
    target?: RadialTarget;
    openMode?: 'hold' | 'context';
    holdPointerStart?: Vec2;
    holdMoved?: boolean;
    /** Joint ID when assigning joint body membership */
    jointId: string | null;
    /** Collider ID when assigning collider barrier bodies */
    colliderId: string | null;
    /** Tracer ID when reassigning tracer body (single-select mode) */
    tracerId: string | null;
    position: Vec2;
    showTime: number;
    collapseTime: number | null;
    readyToToggle: Set<string>;
    createdBodyId: string | null;
    /** Timestamp of the last toggle (for grace period revert on release) */
    lastToggleTime: number;
    /** Info to revert the last toggle if within grace period */
    lastToggle: { bodyId: string; wasAdded: boolean } | null;
  } | null;
  setEditingOutline(outlineId: string | null): void;
  setEditingVertexIndex(index: number | null): void;
  setArcSelector(arc: EditorStore['arcSelector']): void;
  updateFrozenOutline(outlineId: string, worldPoints: Vec2[]): void;
}

export const useEditorStore = create<EditorStore>((set, get) => ({
  mode: 'create',
  activeTool: 'joint',
  selectMode: 'single',
  selectionGesture: null,
  excludedBodies: new Set(),
  setSelectMode(selectMode) { get().setTool('select'); set({ selectMode, selectionGesture: null }); },
  toggleExcludedBody(id) { set(s => { const excludedBodies = new Set(s.excludedBodies); if (excludedBodies.has(id)) excludedBodies.delete(id); else excludedBodies.add(id); return { excludedBodies }; }); },
  jointSubType: 'revolute',
  selectedIds: new Set(),
  hoveredId: null,
  camera: { pan: { x: 0, y: 0 }, zoom: 1 },
  gridEnabled: true,
  gridSize: DEFAULT_GRID_SIZE,
  gridLevel: 'normal' as GridLevel,
  linkStartJointId: null,
  simDrag: null,
  savedPositions: null,
  simulationDesign: null,
  springPlacement: null,
  springSnapSteps: 20,
  springReattachId: null,
  placementCommitted: false,
  activeBodyIds: new Set<string>(),
  showLinks: true,
  showVectors: true,
  showRulers: true,
  showForceUnits: true,
  showLoads: false,
  showReactions: false,
  projectName: 'Untitled',
  createTool: 'joints' as CreateTool,
  shapeGesture: null,
  ngonSides: 6,
  square: false,
  trimStroke: [],
  trimScope: 'selected',
  mirrorAxis: 'vertical',
  mirrorValue: 0,
  mirrorScope: 'selection',
  jointMode: 'manual' as JointMode,
  autoChainLastBodyId: null as string | null,
  outlinePoints: [] as Vec2[],
  lockOutlines: true,
  frozenOutlineWorldPoints: new Map(),
  leftCollapsed: false,
  rightCollapsed: false,
  leftWidth: 140,
  rightWidth: 260,
  setPanelWidth(side, width) {
    if (!Number.isFinite(width)) return;
    set(side === 'left' ? { leftWidth: Math.max(120, Math.min(300, width)) } : { rightWidth: Math.max(220, Math.min(480, width)) });
  },
  imageDragMode: null,
  sliderPointA: null,
  colliderPointA: null,
  editingOutlineId: null,
  editingVertexIndex: null,
  arcSelector: null,

  setMode(mode) {
    set({ shapeGesture: null, trimStroke: [] });
    set({ selectMode: 'single', selectionGesture: null, excludedBodies: new Set() });
    resetHitTesting();
    set({ activeTool: mode === 'create' ? 'joint' : 'select' });
    set({ mode, simDrag: null, linkStartJointId: null, selectedIds: new Set(), outlinePoints: [], createTool: 'joints' as CreateTool, jointMode: 'manual' as JointMode, autoChainLastBodyId: null, lockOutlines: true, frozenOutlineWorldPoints: new Map(), sliderPointA: null, colliderPointA: null, editingOutlineId: null, editingVertexIndex: null });
  },

  setTool(tool) {
    set({ selectionGesture: null });
    if (get().mode === 'create') get().setCreateTool('joints');
    resetHitTesting();
    set({ activeTool: tool, linkStartJointId: null });
  },

  setJointSubType(type) {
    set({ jointSubType: type });
  },

  select(id) {
    if (get().editingOutlineId && get().editingOutlineId !== id) get().setSelectMode('single');
    set({ selectedIds: new Set([id]) });
  },

  toggleSelect(id) {
    set((s) => {
      const next = new Set(s.selectedIds);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return { selectedIds: next };
    });
  },

  clearSelection() {
    if (get().editingOutlineId) get().setCreateTool('joints');
    set({ selectedIds: new Set(), springPlacement: null, springReattachId: null });
  },

  setHovered(id) {
    set({ hoveredId: id });
  },

  panCamera(delta) {
    set((s) => ({
      camera: {
        ...s.camera,
        pan: { x: s.camera.pan.x + delta.x, y: s.camera.pan.y + delta.y },
      },
    }));
  },

  zoomCamera(factor, center) {
    set((s) => {
      if (!Number.isFinite(factor) || factor <= 0) return s;
      const newZoom = clampZoom(s.camera.zoom * factor);
      const zoomRatio = newZoom / s.camera.zoom;
      return {
        camera: {
          zoom: newZoom,
          pan: {
            x: center.x - (center.x - s.camera.pan.x) * zoomRatio,
            y: center.y - (center.y - s.camera.pan.y) * zoomRatio,
          },
        },
      };
    });
  },

  setLinkStart(id) {
    set({ linkStartJointId: id });
  },

  cycleGrid() {
    set((s) => {
      const idx = GRID_CYCLE.indexOf(s.gridLevel);
      const next = GRID_CYCLE[(idx + 1) % GRID_CYCLE.length];
      return { gridLevel: next, gridEnabled: next !== 'off', gridSize: gridLevelToSize(next) };
    });
  },

  setGridLevel(level) {
    set({ gridLevel: level, gridEnabled: level !== 'off', gridSize: gridLevelToSize(level) });
  },

  setSimDrag(drag) {
    set({ simDrag: drag });
  },

  setSavedPositions(positions) {
    set({ savedPositions: positions });
  },

  toggleActiveBody(id) {
    set((s) => {
      const next = new Set(s.activeBodyIds);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return { activeBodyIds: next };
    });
  },

  setActiveBody(id) {
    set({ activeBodyIds: new Set([id]) });
  },

  toggleShowLinks() {
    set((s) => ({ showLinks: !s.showLinks }));
  },

  toggleShowVectors() {
    set((s) => ({ showVectors: !s.showVectors }));
  },

  toggleShowRulers() {
    set((s) => ({ showRulers: !s.showRulers }));
  },

  toggleShowForceUnits() {
    set((s) => ({ showForceUnits: !s.showForceUnits }));
  },

  setProjectName(name) {
    set({ projectName: name });
  },

  setCreateTool(tool) {
    set({ shapeGesture: null, trimStroke: [], springPlacement: null, springReattachId: null, placementCommitted: false });
    const previous = get();
    if (previous.editingOutlineId) {
      const m = useMechanismStore.getState(), outline = m.outlines[previous.editingOutlineId];
      if (outline && m.bodies[outline.bodyId]) {
        const frame = computeBodyTransform(m.bodies[outline.bodyId], m.joints), frozen = new Map(previous.frozenOutlineWorldPoints);
        frozen.set(outline.id,outline.points.map(p=>localToWorld(p,frame)));set({frozenOutlineWorldPoints:frozen});
      }
    }
    const pending = previous.sliderPointA ?? previous.colliderPointA;
    if (pending) useMechanismStore.getState().removeJoint(pending.jointId);
    resetHitTesting();
    set({ activeTool: 'joint' });
    set({ createTool: tool, outlinePoints: [], jointMode: 'manual' as JointMode, autoChainLastBodyId: null, sliderPointA: null, colliderPointA: null, editingOutlineId: null, editingVertexIndex: null });
  },

  setJointMode(mode) {
    set({ jointMode: mode, autoChainLastBodyId: null });
  },

  setAutoChainLastBodyId(id) {
    set({ autoChainLastBodyId: id });
  },

  addOutlinePoint(pt) {
    set((s) => ({ outlinePoints: [...s.outlinePoints, pt] }));
  },

  clearOutlinePoints() {
    set({ outlinePoints: [] });
  },

  setLockOutlines(locked, frozenPoints) {
    if (locked) {
      set({ lockOutlines: true, frozenOutlineWorldPoints: frozenPoints || new Map() });
    } else {
      set({ lockOutlines: false, frozenOutlineWorldPoints: new Map() });
    }
  },

  toggleLeftCollapsed() {
    set((s) => ({ leftCollapsed: !s.leftCollapsed }));
  },

  toggleRightCollapsed() {
    set((s) => ({ rightCollapsed: !s.rightCollapsed }));
  },

  setImageDragMode(mode) {
    set({ imageDragMode: mode });
  },

  setSliderPointA(point) {
    set({ sliderPointA: point });
  },

  setColliderPointA(point) {
    set({ colliderPointA: point });
  },

  setEditingOutline(outlineId) {
    if (outlineId) {
      set({ activeTool: 'joint' });
      set({ editingOutlineId: outlineId, editingVertexIndex: null, selectedIds: new Set([outlineId]), createTool: 'outline' as CreateTool, outlinePoints: [] });
    } else {
      set({ editingOutlineId: null, editingVertexIndex: null, selectedIds: new Set() });
    }
  },

  setEditingVertexIndex(index) {
    set({ editingVertexIndex: index });
  },

  setArcSelector(arc) {
    set({ arcSelector: arc });
  },

  updateFrozenOutline(outlineId, worldPoints) {
    set((s) => {
      const frozen = new Map(s.frozenOutlineWorldPoints);
      frozen.set(outlineId, worldPoints);
      return { frozenOutlineWorldPoints: frozen };
    });
  },
}));

// Restore geometry first, then invalidate view-only caches before another gesture.
useMechanismStore.subscribe((state, previous) => {
  if (state.documentEpoch === previous.documentEpoch) return;
  const e = useEditorStore.getState();
  const exists = (id: string) => state.joints[id] || state.links[id] || state.outlines[id] || state.images[id] || state.sliders[id] || state.colliders[id] || state.tracers[id] || state.springs[id] || state.forceSensors[id];
  const editing = e.editingOutlineId && state.outlines[e.editingOutlineId] ? e.editingOutlineId : null;
  useEditorStore.setState({ frozenOutlineWorldPoints: new Map(), springPlacement: null, springReattachId: null, placementCommitted: false, selectedIds: new Set([...e.selectedIds].filter(exists)),
    editingOutlineId: editing, editingVertexIndex: editing && e.editingVertexIndex !== null && e.editingVertexIndex < state.outlines[editing].points.length ? e.editingVertexIndex : null });
});
