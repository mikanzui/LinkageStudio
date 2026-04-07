import { create } from 'zustand';
import type {
  AppMode, ToolType, JointSubType, CreateTool, JointMode, CameraState, SimDragState, GridLevel,
  SelectMode, SelectionGesture, SpringToolSubmode, SpringAnchor,
} from '../types';
import type { Vec2 } from '../types';
import { DEFAULT_GRID_SIZE, DEFAULT_SPRING_LINK_RESOLUTION } from '../utils/constants';

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

let transientHintTimer: ReturnType<typeof setTimeout> | null = null;

interface EditorStore {
  mode: AppMode;
  activeTool: ToolType;
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
  activeBodyIds: Set<string>;
  showLinks: boolean;
  showVectors: boolean;
  showRulers: boolean;
  showForceUnits: boolean;
  showLoads: boolean;
  /**
   * Simulate: allow dragging filled shape interior (COM/temp joint) when pivots on the same body
   * lie inside the outline. Off makes joints/links easier to pick on overlapping geometry.
   */
  outlineSimGrabInteriorWithJoints: boolean;
  projectName: string;
  createTool: CreateTool;
  jointMode: JointMode;
  autoChainLastBodyId: string | null;
  outlinePoints: Vec2[];
  lockOutlines: boolean;
  frozenOutlineWorldPoints: Map<string, Vec2[]>;
  leftCollapsed: boolean;
  rightCollapsed: boolean;
  /** While true (Space held), left-drag pans like the pan tool */
  spacePanHeld: boolean;
  imageDragMode: 'move' | 'rotate' | 'scale' | null;
  sliderPointA: { position: Vec2; jointId: string } | null;
  colliderPointA: { position: Vec2; jointId: string } | null;
  mirrorScope: 'selection' | 'all';
  mirrorPreview: { axis: 'vertical' | 'horizontal'; value: number } | null;
  /** Pivot tool: how drags on empty canvas select (viewport bar). */
  selectMode: SelectMode;
  /** Live box/lasso overlay while dragging (screen px). */
  selectionGesture: SelectionGesture | null;
  /** Bodies excluded from box/lasso selection (unchecked in Interact panel). */
  marqueeExcludedBodyIds: Set<string>;
  /** Grid steps along a link for quantizing spring attachment t (min 2). */
  springLinkResolution: number;
  /** Spring tool placement style (toolbar / property panel). */
  springToolSubmode: SpringToolSubmode;
  /** First anchor picked (joint or link); waiting for second click. */
  springPickPendingAnchor: SpringAnchor | null;
  /** Torsion spring tool: pivot joint, then first link, then second link. */
  torsionSpringPick: { pivotJointId: string; linkAId?: string } | null;

  setMode(mode: AppMode): void;
  setTool(tool: ToolType): void;
  setJointSubType(type: JointSubType): void;
  select(id: string): void;
  toggleSelect(id: string): void;
  clearSelection(): void;
  setHovered(id: string | null): void;
  panCamera(delta: Vec2): void;
  zoomCamera(factor: number, center: Vec2): void;
  resetViewport(): void;
  setCamera(camera: CameraState): void;
  zoomViewportAtCenter(factor: number, canvasWidth: number, canvasHeight: number): void;
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
  toggleShowLoads(): void;
  toggleOutlineSimGrabInteriorWithJoints(): void;
  setProjectName(name: string): void;
  setCreateTool(tool: CreateTool): void;
  setJointMode(mode: JointMode): void;
  setAutoChainLastBodyId(id: string | null): void;
  addOutlinePoint(pt: Vec2): void;
  clearOutlinePoints(): void;
  setLockOutlines(locked: boolean, frozenPoints?: Map<string, Vec2[]>): void;
  toggleLeftCollapsed(): void;
  toggleRightCollapsed(): void;
  setSpacePanHeld(held: boolean): void;
  setImageDragMode(mode: 'move' | 'rotate' | 'scale' | null): void;
  setSliderPointA(point: { position: Vec2; jointId: string } | null): void;
  setColliderPointA(point: { position: Vec2; jointId: string } | null): void;
  setMirrorScope(scope: 'selection' | 'all'): void;
  setMirrorPreview(preview: { axis: 'vertical' | 'horizontal'; value: number } | null): void;
  setSelectMode(mode: SelectMode): void;
  setSelectionGesture(gesture: SelectionGesture | null): void;
  toggleMarqueeBodyExcluded(bodyId: string): void;
  applyMarqueeSelection(ids: string[], additive: boolean): void;
  setSpringLinkResolution(steps: number): void;
  setSpringToolSubmode(submode: SpringToolSubmode): void;
  clearSpringPickPending(): void;
  clearTorsionSpringPick(): void;
  editingOutlineId: string | null;
  editingVertexIndex: number | null;

  /** Long-press arc body selector state */
  arcSelector: {
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
  worldContextMenu: {
    screenPosition: Vec2;
    targetType: 'joint' | 'collider' | 'tracer' | 'link';
    targetId: string;
    /** Right-click on link: raw t along segment before quantize (create spring). */
    linkClickT?: number;
    openMode: 'hold' | 'context';
  } | null;
  /** Short-lived hint (e.g. slider body warning); auto-dismisses via showTransientHint */
  transientHint: string | null;
  dismissTransientHint(): void;
  setEditingOutline(outlineId: string | null): void;
  setEditingVertexIndex(index: number | null): void;
  setArcSelector(arc: EditorStore['arcSelector']): void;
  setWorldContextMenu(menu: EditorStore['worldContextMenu']): void;
  updateFrozenOutline(outlineId: string, worldPoints: Vec2[]): void;
}

export const useEditorStore = create<EditorStore>((set, get) => ({
  mode: 'create',
  activeTool: 'select',
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
  activeBodyIds: new Set<string>(),
  showLinks: true,
  showVectors: true,
  showRulers: true,
  showForceUnits: true,
  showLoads: false,
  outlineSimGrabInteriorWithJoints: true,
  projectName: 'Untitled',
  createTool: 'joints' as CreateTool,
  jointMode: 'manual' as JointMode,
  autoChainLastBodyId: null as string | null,
  outlinePoints: [] as Vec2[],
  lockOutlines: true,
  frozenOutlineWorldPoints: new Map(),
  leftCollapsed: false,
  rightCollapsed: false,
  spacePanHeld: false,
  imageDragMode: null,
  sliderPointA: null,
  colliderPointA: null,
  mirrorScope: 'selection',
  mirrorPreview: null,
  selectMode: 'single' as SelectMode,
  selectionGesture: null,
  marqueeExcludedBodyIds: new Set<string>(),
  springLinkResolution: DEFAULT_SPRING_LINK_RESOLUTION,
  springToolSubmode: 'jointJoint' as SpringToolSubmode,
  springPickPendingAnchor: null as SpringAnchor | null,
  torsionSpringPick: null as { pivotJointId: string; linkAId?: string } | null,
  editingOutlineId: null,
  editingVertexIndex: null,
  arcSelector: null,
  worldContextMenu: null,
  transientHint: null,

  dismissTransientHint() {
    if (transientHintTimer) {
      clearTimeout(transientHintTimer);
      transientHintTimer = null;
    }
    set({ transientHint: null });
  },

  setMode(mode) {
    if (transientHintTimer) {
      clearTimeout(transientHintTimer);
      transientHintTimer = null;
    }
    set({
      mode,
      simDrag: null,
      linkStartJointId: null,
      selectedIds: new Set(),
      outlinePoints: [],
      createTool: 'joints' as CreateTool,
      jointMode: 'manual' as JointMode,
      autoChainLastBodyId: null,
      lockOutlines: true,
      frozenOutlineWorldPoints: new Map(),
      sliderPointA: null,
      colliderPointA: null,
      editingOutlineId: null,
      editingVertexIndex: null,
      springPickPendingAnchor: null,
      springToolSubmode: 'jointJoint' as SpringToolSubmode,
      torsionSpringPick: null,
      transientHint: null,
      arcSelector: null,
      worldContextMenu: null,
      spacePanHeld: false,
      mirrorPreview: null,
      selectMode: 'single' as SelectMode,
      selectionGesture: null,
    });
  },

  setTool(tool) {
    set({ activeTool: tool, linkStartJointId: null });
  },

  setJointSubType(type) {
    set({ jointSubType: type });
  },

  select(id) {
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
    set({ selectedIds: new Set() });
  },

  setHovered(id) {
    if (get().hoveredId === id) return;
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
      const newZoom = Math.max(0.1, Math.min(10, s.camera.zoom * factor));
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

  resetViewport() {
    set({ camera: { pan: { x: 0, y: 0 }, zoom: 1 } });
  },

  setCamera(camera) {
    set({ camera });
  },

  zoomViewportAtCenter(factor, canvasWidth, canvasHeight) {
    set((s) => {
      const center = { x: canvasWidth / 2, y: canvasHeight / 2 };
      const newZoom = Math.max(0.1, Math.min(10, s.camera.zoom * factor));
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

  toggleShowLoads() {
    set((s) => ({ showLoads: !s.showLoads }));
  },

  toggleOutlineSimGrabInteriorWithJoints() {
    set((s) => ({ outlineSimGrabInteriorWithJoints: !s.outlineSimGrabInteriorWithJoints }));
  },

  setProjectName(name) {
    set({ projectName: name });
  },

  setCreateTool(tool) {
    set((s) => ({
      createTool: tool,
      outlinePoints: [],
      jointMode: 'manual' as JointMode,
      autoChainLastBodyId: null,
      sliderPointA: null,
      colliderPointA: null,
      editingOutlineId: null,
      editingVertexIndex: null,
      arcSelector: null,
      worldContextMenu: null,
      mirrorPreview: null,
      selectionGesture: null,
      springPickPendingAnchor: tool === 'spring' || tool === 'damper' ? s.springPickPendingAnchor : null,
      springToolSubmode: tool === 'spring' || tool === 'damper' ? s.springToolSubmode : 'jointJoint',
      torsionSpringPick: tool === 'torsionSpring' ? s.torsionSpringPick : null,
    }));
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

  setSpacePanHeld(held) {
    set({ spacePanHeld: held });
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

  setMirrorScope(scope) {
    set({ mirrorScope: scope });
  },

  setMirrorPreview(preview) {
    set({ mirrorPreview: preview });
  },

  setSelectMode(mode) {
    set({ selectMode: mode, selectionGesture: null });
  },

  setSelectionGesture(gesture) {
    set({ selectionGesture: gesture });
  },

  toggleMarqueeBodyExcluded(bodyId) {
    set((s) => {
      const next = new Set(s.marqueeExcludedBodyIds);
      if (next.has(bodyId)) next.delete(bodyId);
      else next.add(bodyId);
      return { marqueeExcludedBodyIds: next };
    });
  },

  applyMarqueeSelection(ids, additive) {
    set((s) => {
      if (additive) {
        const next = new Set(s.selectedIds);
        for (const id of ids) next.add(id);
        return { selectedIds: next };
      }
      return { selectedIds: new Set(ids) };
    });
  },

  setSpringLinkResolution(steps) {
    const s = Math.max(2, Math.floor(steps));
    set({ springLinkResolution: s });
  },

  setSpringToolSubmode(submode) {
    set({ springToolSubmode: submode, springPickPendingAnchor: null });
  },

  clearSpringPickPending() {
    set({ springPickPendingAnchor: null });
  },

  clearTorsionSpringPick() {
    set({ torsionSpringPick: null });
  },

  setEditingOutline(outlineId) {
    if (outlineId) {
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

  setWorldContextMenu(menu) {
    set({ worldContextMenu: menu });
  },

  updateFrozenOutline(outlineId, worldPoints) {
    set((s) => {
      const frozen = new Map(s.frozenOutlineWorldPoints);
      frozen.set(outlineId, worldPoints);
      return { frozenOutlineWorldPoints: frozen };
    });
  },
}));

/** Non-blocking toast for warnings (e.g. slider midpoint body mix). */
export function showTransientHint(message: string, durationMs = 8000) {
  if (transientHintTimer) {
    clearTimeout(transientHintTimer);
    transientHintTimer = null;
  }
  useEditorStore.setState({ transientHint: message });
  transientHintTimer = setTimeout(() => {
    useEditorStore.setState({ transientHint: null });
    transientHintTimer = null;
  }, durationMs);
}
