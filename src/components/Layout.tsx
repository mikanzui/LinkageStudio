import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { MechanismCanvas } from './Canvas/MechanismCanvas';
import { CanvasViewportBar } from './Canvas/CanvasViewportBar';
import { WorldContextMenu } from './Canvas/WorldContextMenu';
import { TopBar } from './TopBar/TopBar';
import { Toolbar } from './Toolbar/Toolbar';
import { BodyPanel } from './Panels/BodyPanel';
import { PropertyPanel } from './Panels/PropertyPanel';
import { SimulationPanel } from './Panels/SimulationPanel';
import { useEditorStore, DEFAULT_LEFT_SIDEBAR_WIDTH_PX, DEFAULT_RIGHT_SIDEBAR_WIDTH_PX } from '../store/editor-store';
import { useMechanismStore } from '../store/mechanism-store';
import { switchMode } from '../utils/mode-switch';
import { deleteSelectedEntities } from '../utils/delete-selection';
import { screenToWorld } from '../renderer/camera';
import './Layout.css';

/** Snap grid + auto-collapse when dragged narrower than threshold (preview can go lower during drag). */
const SIDEBAR_SNAP_PX = 16;
const LEFT_SIDEBAR_MIN_COMMIT_PX = 140;
const RIGHT_SIDEBAR_MIN_COMMIT_PX = 220;
const LEFT_SIDEBAR_COLLAPSE_BELOW_PX = 96;
const RIGHT_SIDEBAR_COLLAPSE_BELOW_PX = 168;
const LEFT_DRAG_PREVIEW_FLOOR_PX = 48;
const RIGHT_DRAG_PREVIEW_FLOOR_PX = 72;

function sidebarResizeClampMax(side: 'left' | 'right'): number {
  if (typeof globalThis.window === 'undefined') return 560;
  const min = side === 'left' ? LEFT_SIDEBAR_MIN_COMMIT_PX : RIGHT_SIDEBAR_MIN_COMMIT_PX;
  return Math.max(min + 40, Math.floor(globalThis.window.innerWidth * 0.46));
}

function SidebarEdgeRail({
  side,
  collapsed,
  previewWidth,
  onPreviewWidth,
}: {
  side: 'left' | 'right';
  collapsed: boolean;
  previewWidth: number | null;
  onPreviewWidth: (w: number | null) => void;
}) {
  const committedWidth = useEditorStore((s) => (side === 'left' ? s.leftSidebarWidthPx : s.rightSidebarWidthPx));
  const setCommittedWidth = useEditorStore((s) => (side === 'left' ? s.setLeftSidebarWidthPx : s.setRightSidebarWidthPx));
  const toggleCollapsed = useEditorStore((s) => (side === 'left' ? s.toggleLeftCollapsed : s.toggleRightCollapsed));

  const dragRef = useRef<{
    pid: number;
    startX: number;
    startW: number;
    captureEl: HTMLElement;
    pointerType: string;
  } | null>(null);
  const railRef = useRef<HTMLDivElement | null>(null);
  const latestRawRef = useRef(committedWidth);
  const previewCbRef = useRef(onPreviewWidth);
  const collapsedGestureStartRef = useRef({ x: 0, y: 0 });
  previewCbRef.current = onPreviewWidth;

  useEffect(() => {
    latestRawRef.current = committedWidth;
  }, [committedWidth]);

  useLayoutEffect(() => {
    if (collapsed) return;

    const applySnapCommit = () => {
      const raw = latestRawRef.current;
      previewCbRef.current(null);

      const max = sidebarResizeClampMax(side);
      const st = useEditorStore.getState();
      if (side === 'left') {
        if (raw < LEFT_SIDEBAR_COLLAPSE_BELOW_PX) {
          st.toggleLeftCollapsed();
          return;
        }
        const snapped = Math.round(Math.min(raw, max) / SIDEBAR_SNAP_PX) * SIDEBAR_SNAP_PX;
        st.setLeftSidebarWidthPx(Math.max(snapped, LEFT_SIDEBAR_MIN_COMMIT_PX));
      } else {
        if (raw < RIGHT_SIDEBAR_COLLAPSE_BELOW_PX) {
          st.toggleRightCollapsed();
          return;
        }
        const snapped = Math.round(Math.min(raw, max) / SIDEBAR_SNAP_PX) * SIDEBAR_SNAP_PX;
        st.setRightSidebarWidthPx(Math.max(snapped, RIGHT_SIDEBAR_MIN_COMMIT_PX));
      }
    };

    const finishResize = (expectedPid: number | 'any') => {
      const d = dragRef.current;
      if (!d) return;
      if (expectedPid !== 'any' && d.pid !== expectedPid) return;
      dragRef.current = null;
      try {
        if (d.captureEl.hasPointerCapture(d.pid)) {
          d.captureEl.releasePointerCapture(d.pid);
        }
      } catch {
        /* already released */
      }
      applySnapCommit();
    };

    const onMove = (e: PointerEvent) => {
      const d = dragRef.current;
      if (!d || e.pointerId !== d.pid) return;
      // If the button was released off-window, some browsers omit pointerup until later;
      // the next pointermove often arrives with buttons === 0 — commit snap then.
      if (e.pointerType === 'mouse' && e.buttons === 0) {
        finishResize(e.pointerId);
        return;
      }
      e.preventDefault();
      const max = sidebarResizeClampMax(side);
      let raw: number;
      if (side === 'left') {
        raw = d.startW + (e.clientX - d.startX);
        raw = Math.min(Math.max(raw, LEFT_DRAG_PREVIEW_FLOOR_PX), max);
      } else {
        raw = d.startW - (e.clientX - d.startX);
        raw = Math.min(Math.max(raw, RIGHT_DRAG_PREVIEW_FLOOR_PX), max);
      }
      latestRawRef.current = raw;
      previewCbRef.current(raw);
    };

    const onWindowBlur = () => finishResize('any');
    const onDocMouseLeave = () => {
      const d = dragRef.current;
      if (d?.pointerType === 'mouse') finishResize('any');
    };

    const onLostPointerCapture = (e: PointerEvent) => {
      if (dragRef.current?.pid === e.pointerId) finishResize(e.pointerId);
    };

    const onPointerUp = (e: PointerEvent) => finishResize(e.pointerId);
    const onPointerCancel = (e: PointerEvent) => finishResize(e.pointerId);

    window.addEventListener('pointermove', onMove, { passive: false });
    window.addEventListener('pointerup', onPointerUp);
    window.addEventListener('pointercancel', onPointerCancel);
    window.addEventListener('blur', onWindowBlur);
    document.documentElement.addEventListener('mouseleave', onDocMouseLeave);

    const rail = railRef.current;
    if (rail) {
      rail.addEventListener('lostpointercapture', onLostPointerCapture);
    }

    return () => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onPointerUp);
      window.removeEventListener('pointercancel', onPointerCancel);
      window.removeEventListener('blur', onWindowBlur);
      document.documentElement.removeEventListener('mouseleave', onDocMouseLeave);
      if (rail) {
        rail.removeEventListener('lostpointercapture', onLostPointerCapture);
      }
      const dangling = dragRef.current;
      if (dangling) {
        dragRef.current = null;
        try {
          if (dangling.captureEl.hasPointerCapture(dangling.pid)) {
            dangling.captureEl.releasePointerCapture(dangling.pid);
          }
        } catch {
          /* ignore */
        }
        previewCbRef.current(null);
      }
    };
  }, [side, collapsed]);

  const onRailPointerDown = (e: React.PointerEvent) => {
    if (collapsed) return;
    const captureEl = e.currentTarget as HTMLElement;
    dragRef.current = {
      pid: e.pointerId,
      startX: e.clientX,
      startW: committedWidth,
      captureEl,
      pointerType: e.pointerType,
    };
    latestRawRef.current = committedWidth;
    previewCbRef.current(committedWidth);
    try {
      captureEl.setPointerCapture(e.pointerId);
    } catch {
      /* passive target */
    }
    e.preventDefault();
  };

  const onRailDoubleClick = () => {
    if (collapsed) return;
    setCommittedWidth(side === 'left' ? DEFAULT_LEFT_SIDEBAR_WIDTH_PX : DEFAULT_RIGHT_SIDEBAR_WIDTH_PX);
  };

  const expandLabel = side === 'left' ? 'Expand toolbar' : 'Expand panel';
  const resizeTitle =
    'Drag to resize (snaps when you release). Drag very narrow to collapse. Double-click for default width.';

  if (collapsed) {
    const releaseCaptureSafe = (el: HTMLButtonElement, pid: number) => {
      if (el.hasPointerCapture(pid)) el.releasePointerCapture(pid);
    };

    return (
      <button
        type="button"
        className={`sidebar-edge-rail sidebar-edge-rail-${side} collapsed`}
        onPointerDown={(e) => {
          e.preventDefault();
          collapsedGestureStartRef.current = { x: e.clientX, y: e.clientY };
          (e.currentTarget as HTMLButtonElement).setPointerCapture(e.pointerId);
        }}
        onPointerUp={(e) => {
          const { x, y } = collapsedGestureStartRef.current;
          const dx = e.clientX - x;
          const dy = e.clientY - y;
          const tapLike = Math.abs(dx) < 12 && Math.abs(dy) < 16;
          const dragExpand =
            side === 'left'
              ? dx > 14
              : dx < -14;
          if (tapLike || dragExpand) {
            toggleCollapsed();
          }
          releaseCaptureSafe(e.currentTarget as HTMLButtonElement, e.pointerId);
        }}
        onPointerCancel={(e) => {
          releaseCaptureSafe(e.currentTarget as HTMLButtonElement, e.pointerId);
        }}
        aria-label={expandLabel}
        title={`${expandLabel} — tap or drag toward canvas`}
      />
    );
  }

  return (
    <div
      ref={railRef}
      className={`sidebar-edge-rail sidebar-edge-rail-${side}`}
      onPointerDown={onRailPointerDown}
      onDoubleClick={onRailDoubleClick}
      role="separator"
      aria-orientation="vertical"
      aria-valuemin={side === 'left' ? LEFT_SIDEBAR_MIN_COMMIT_PX : RIGHT_SIDEBAR_MIN_COMMIT_PX}
      aria-valuemax={Math.round(sidebarResizeClampMax(side))}
      aria-valuenow={Math.round(previewWidth ?? committedWidth)}
      title={resizeTitle}
    />
  );
}

/* ---- Mode icons ---- */

/* Create: pencil */
const IconCreateMode = () => (
  <svg width="18" height="18" viewBox="0 0 18 18" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round">
    <path d="M12.5 2.5L15.5 5.5L6 15H3V12L12.5 2.5Z" />
    <line x1="10.5" y1="4.5" x2="13.5" y2="7.5" />
  </svg>
);

/* Simulate: figure with motion lines */
const IconSimulateMode = () => (
  <svg width="18" height="18" viewBox="0 0 18 18" fill="none" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="11" cy="4" r="2" />
    <path d="M9 7L11 10L13 8" />
    <line x1="11" y1="10" x2="10" y2="15" />
    <line x1="11" y1="10" x2="13" y2="15" />
    <line x1="3" y1="6" x2="7" y2="6" />
    <line x1="2" y1="9" x2="6" y2="9" />
    <line x1="3" y1="12" x2="7" y2="12" />
  </svg>
);

/* ---- Tool icons for collapsed toolbar ---- */
const IconPivotSmall = () => (
  <svg width="18" height="18" viewBox="0 0 16 16">
    <circle cx="8" cy="8" r="5.5" fill="none" stroke="currentColor" strokeWidth="1.3" />
    <circle cx="8" cy="8" r="1.8" fill="currentColor" />
  </svg>
);

const IconSliderSmall = () => (
  <svg width="18" height="18" viewBox="0 0 16 16">
    <line x1="2" y1="8" x2="14" y2="8" stroke="currentColor" strokeWidth="1.3" />
    <circle cx="3" cy="8" r="1.8" fill="none" stroke="currentColor" strokeWidth="1" />
    <circle cx="13" cy="8" r="1.8" fill="none" stroke="currentColor" strokeWidth="1" />
    <rect x="6.5" y="5.5" width="3" height="5" rx="0.8" fill="currentColor" opacity="0.5" />
  </svg>
);

const IconOutlineSmall = () => (
  <svg width="18" height="18" viewBox="0 0 16 16">
    <polygon points="8,1.5 13.5,5 11.5,12.5 4.5,12.5 2.5,5" fill="none" stroke="currentColor" strokeWidth="1.3" strokeLinejoin="round" />
  </svg>
);

const IconColliderSmall = () => (
  <svg width="18" height="18" viewBox="0 0 16 16">
    <line x1="2" y1="13" x2="14" y2="3" stroke="currentColor" strokeWidth="1.3" strokeDasharray="3 2" />
    <line x1="1" y1="11" x2="3" y2="15" stroke="currentColor" strokeWidth="1" />
    <line x1="13" y1="1" x2="15" y2="5" stroke="currentColor" strokeWidth="1" />
  </svg>
);

const IconSpringSmall = () => (
  <svg width="18" height="18" viewBox="0 0 16 16">
    <path
      d="M2 8c0-1 1-1.5 2-1.5s2 1 2 2 1 2 2 2 2-1 2-2 1-2 2-2 2 0.5 2 1.5"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.25"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
    <circle cx="2" cy="8" r="1" fill="currentColor" />
    <circle cx="14" cy="8" r="1" fill="currentColor" />
  </svg>
);

const IconDamperSmall = () => (
  <svg width="18" height="18" viewBox="0 0 16 16">
    <line x1="2" y1="8" x2="4.5" y2="8" stroke="currentColor" strokeWidth="1.25" strokeLinecap="round" />
    <rect x="4.5" y="5.5" width="7" height="5" rx="0.8" fill="none" stroke="currentColor" strokeWidth="1.1" />
    <line x1="11.5" y1="8" x2="14" y2="8" stroke="currentColor" strokeWidth="1.25" strokeLinecap="round" />
  </svg>
);

const IconTorsionSpringSmall = () => (
  <svg width="18" height="18" viewBox="0 0 16 16">
    <line x1="8" y1="2.5" x2="8" y2="6.5" stroke="currentColor" strokeWidth="1.15" strokeLinecap="round" />
    <line x1="8" y1="6.5" x2="12" y2="10.5" stroke="currentColor" strokeWidth="1.15" strokeLinecap="round" />
    <line x1="8" y1="6.5" x2="4" y2="10.5" stroke="currentColor" strokeWidth="1.15" strokeLinecap="round" />
    <path
      d="M 9.5 5 A 2 2 0 0 1 6.5 5"
      fill="none"
      stroke="currentColor"
      strokeWidth="1"
      strokeLinecap="round"
    />
  </svg>
);

const IconTracerSmall = () => (
  <svg width="18" height="18" viewBox="0 0 16 16">
    <circle cx="8" cy="8" r="3.5" fill="none" stroke="currentColor" strokeWidth="1" />
    <line x1="8" y1="2" x2="8" y2="5" stroke="currentColor" strokeWidth="1" />
    <line x1="8" y1="11" x2="8" y2="14" stroke="currentColor" strokeWidth="1" />
    <line x1="2" y1="8" x2="5" y2="8" stroke="currentColor" strokeWidth="1" />
    <line x1="11" y1="8" x2="14" y2="8" stroke="currentColor" strokeWidth="1" />
    <circle cx="8" cy="8" r="1" fill="currentColor" />
  </svg>
);

const IconForceSensorSmall = () => (
  <svg width="18" height="18" viewBox="0 0 16 16">
    <line x1="2" y1="8" x2="14" y2="8" stroke="currentColor" strokeWidth="1.25" />
    <polyline points="3,12 5,8 7,10 9,4 11,9 13,6" fill="none" stroke="currentColor" strokeWidth="1.05" strokeLinejoin="round" />
    <circle cx="2" cy="8" r="1.35" fill="currentColor" />
    <circle cx="14" cy="8" r="1.35" fill="currentColor" />
  </svg>
);

const IconImageSmall = () => (
  <svg width="18" height="18" viewBox="0 0 16 16">
    <rect x="2" y="3" width="12" height="10" rx="1.2" fill="none" stroke="currentColor" strokeWidth="1.2" />
    <circle cx="5.5" cy="6.5" r="1.3" fill="currentColor" />
    <polyline points="2,11 5,8.5 7.5,10 10.5,6.5 14,9.5" fill="none" stroke="currentColor" strokeWidth="1" strokeLinejoin="round" />
  </svg>
);

/** Icons for top canvas draw palette (match Toolbar overlay tools). */
const DrawPaletteIconOutline = () => (
  <svg className="shape-draw-palette-icon" width="18" height="18" viewBox="0 0 16 16" fill="none" aria-hidden>
    <line x1="2.5" y1="11.5" x2="13.5" y2="4.5" stroke="currentColor" strokeWidth="1.45" strokeLinecap="round" />
  </svg>
);
const DrawPaletteIconRectangle = () => (
  <svg className="shape-draw-palette-icon" width="18" height="18" viewBox="0 0 16 16" fill="none" aria-hidden>
    <rect x="2" y="3" width="12" height="10" stroke="currentColor" strokeWidth="1.3" strokeLinejoin="round" />
  </svg>
);
const DrawPaletteIconCircle = () => (
  <svg className="shape-draw-palette-icon" width="18" height="18" viewBox="0 0 16 16" fill="none" aria-hidden>
    <circle cx="8" cy="8" r="6" stroke="currentColor" strokeWidth="1.3" />
  </svg>
);
const DrawPaletteIconNgon = () => (
  <svg className="shape-draw-palette-icon" width="18" height="18" viewBox="0 0 16 16" fill="none" aria-hidden>
    <polygon points="8,1.5 14,5 13,12 3,12 2,5" stroke="currentColor" strokeWidth="1.3" strokeLinejoin="round" />
  </svg>
);
const DrawPaletteIconTrim = () => (
  <svg className="shape-draw-palette-icon" width="18" height="18" viewBox="0 0 16 16" fill="none" aria-hidden>
    <line x1="2" y1="3" x2="8" y2="13" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
    <line x1="14" y1="3" x2="8" y2="13" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
    <circle cx="5" cy="8" r="2.5" stroke="currentColor" strokeWidth="1.2" />
    <circle cx="11" cy="8" r="2.5" stroke="currentColor" strokeWidth="1.2" />
  </svg>
);

/* ---- Delete button for collapsed toolbar (same action as top bar) ---- */
function CollapsedDeleteButton() {
  const outlines = useMechanismStore((s) => s.outlines);
  const selectedIds = useEditorStore((s) => s.selectedIds);
  const mode = useEditorStore((s) => s.mode);
  const editingOutlineId = useEditorStore((s) => s.editingOutlineId);
  const editingVertexIndex = useEditorStore((s) => s.editingVertexIndex);

  const hasSelection = selectedIds.size > 0;
  const hasVertexSelection = editingOutlineId !== null && editingVertexIndex !== null;
  const canDeleteVertex =
    hasVertexSelection &&
    (() => {
      const outline = outlines[editingOutlineId!];
      return Boolean(outline && outline.points.length > 3);
    })();
  const isDisabled =
    mode !== 'create' ||
    (!hasSelection && !hasVertexSelection) ||
    (hasVertexSelection && !canDeleteVertex);
  const title =
    mode !== 'create'
      ? 'Delete (Create mode only)'
      : hasVertexSelection
        ? 'Delete vertex (Backspace)'
        : 'Delete selected (Backspace)';

  return (
    <button
      type="button"
      className="collapsed-tool-btn"
      onClick={() => deleteSelectedEntities()}
      disabled={isDisabled}
      title={title}
      aria-label={title}
    >
      <svg width="18" height="18" viewBox="0 0 18 18" fill="none" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round">
        <path d="M3 5H15" />
        <path d="M5 5V15C5 15.6 5.4 16 6 16H12C12.6 16 13 15.6 13 15V5" />
        <path d="M7 3V2H11V3" />
        <line x1="8" y1="8" x2="8" y2="13" />
        <line x1="10" y1="8" x2="10" y2="13" />
      </svg>
    </button>
  );
}

/* ---- Mini body list for collapsed right panel ---- */
function CollapsedBodyList() {
  const bodies = useMechanismStore((s) => s.bodies);
  const joints = useMechanismStore((s) => s.joints);
  const colliders = useMechanismStore((s) => s.colliders);
  const baseBodyId = useMechanismStore((s) => s.baseBodyId);
  const addBody = useMechanismStore((s) => s.addBody);
  const addJointToBody = useMechanismStore((s) => s.addJointToBody);
  const removeJointFromBody = useMechanismStore((s) => s.removeJointFromBody);
  const addBodyToCollider = useMechanismStore((s) => s.addBodyToCollider);
  const removeBodyFromCollider = useMechanismStore((s) => s.removeBodyFromCollider);
  const activeBodyIds = useEditorStore((s) => s.activeBodyIds);
  const toggleActiveBody = useEditorStore((s) => s.toggleActiveBody);
  const setActiveBody = useEditorStore((s) => s.setActiveBody);
  const selectedIds = useEditorStore((s) => s.selectedIds);
  const createTool = useEditorStore((s) => s.createTool);

  const isOutlineMode = createTool === 'outline' || createTool === 'tracer' || createTool === 'rectangle' || createTool === 'circle' || createTool === 'ngon' || createTool === 'trim';
  const selectedJointId = [...selectedIds].find((id) => joints[id]);
  const selectedColliderId = [...selectedIds].find((id) => colliders[id]);
  const selectedCollider = selectedColliderId ? colliders[selectedColliderId] : null;

  const bodyList = Object.values(bodies);
  bodyList.sort((a, b) => {
    if (a.id === baseBodyId) return -1;
    if (b.id === baseBodyId) return 1;
    return 0;
  });

  const handleBodyClick = (bodyId: string) => {
    if (isOutlineMode) {
      setActiveBody(bodyId);
    } else if (selectedColliderId && selectedCollider) {
      if (selectedCollider.bodyIds.includes(bodyId)) removeBodyFromCollider(selectedColliderId, bodyId);
      else addBodyToCollider(selectedColliderId, bodyId);
    } else if (selectedJointId) {
      const body = bodies[bodyId];
      if (body.jointIds.includes(selectedJointId)) removeJointFromBody(selectedJointId, bodyId);
      else addJointToBody(selectedJointId, bodyId);
    } else {
      toggleActiveBody(bodyId);
    }
  };

  const isChecked = (bodyId: string): boolean => {
    if (isOutlineMode) return activeBodyIds.has(bodyId);
    if (selectedColliderId && selectedCollider) return selectedCollider.bodyIds.includes(bodyId);
    if (selectedJointId) return bodies[bodyId]?.jointIds.includes(selectedJointId) ?? false;
    return activeBodyIds.has(bodyId);
  };

  return (
    <>
      <button
        className="collapsed-add-body"
        onClick={() => addBody('Body')}
        title="Add body"
      >
        <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
          <line x1="7" y1="2" x2="7" y2="12" />
          <line x1="2" y1="7" x2="12" y2="7" />
        </svg>
      </button>
      <div className="collapsed-divider-h" />
      {bodyList.map((body) => {
        const checked = isChecked(body.id);
        return (
          <button
            key={body.id}
            className={`collapsed-body-dot ${checked ? 'active' : ''}`}
            onClick={() => handleBodyClick(body.id)}
            title={body.name}
          >
            <span className="body-dot" style={{ background: body.color }} />
            {checked && (
              <svg width="8" height="8" viewBox="0 0 10 10" className="body-check">
                {isOutlineMode ? (
                  <circle cx="5" cy="5" r="3" fill="#fff" />
                ) : (
                  <polyline points="2,5 4.5,8 8,2" fill="none" stroke="#fff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                )}
              </svg>
            )}
          </button>
        );
      })}
    </>
  );
}

export function Layout() {
  const leftCollapsed = useEditorStore((s) => s.leftCollapsed);
  const rightCollapsed = useEditorStore((s) => s.rightCollapsed);
  const leftSidebarWidthPx = useEditorStore((s) => s.leftSidebarWidthPx);
  const rightSidebarWidthPx = useEditorStore((s) => s.rightSidebarWidthPx);
  const mode = useEditorStore((s) => s.mode);
  const createTool = useEditorStore((s) => s.createTool);
  const setCreateTool = useEditorStore((s) => s.setCreateTool);
  const addImage = useMechanismStore((s) => s.addImage);
  const baseBodyId = useMechanismStore((s) => s.baseBodyId);
  const selectedIds = useEditorStore((s) => s.selectedIds);
  const editingOutlineId = useEditorStore((s) => s.editingOutlineId);
  const editingVertexIndex = useEditorStore((s) => s.editingVertexIndex);
  const transientHint = useEditorStore((s) => s.transientHint);
  const dismissTransientHint = useEditorStore((s) => s.dismissTransientHint);

  const [leftRailPreview, setLeftRailPreview] = useState<number | null>(null);
  const [rightRailPreview, setRightRailPreview] = useState<number | null>(null);

  const handleImportImage = () => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'image/jpeg,image/png,image/bmp,image/webp';
    input.style.position = 'fixed';
    input.style.top = '-9999px';
    input.style.left = '-9999px';
    document.body.appendChild(input);
    const cleanup = () => { if (input.parentNode) input.parentNode.removeChild(input); };
    input.addEventListener('change', () => {
      const file = input.files?.[0];
      if (!file) { cleanup(); return; }
      const reader = new FileReader();
      reader.onload = () => {
        const dataUrl = reader.result as string;
        const img = new Image();
        img.onload = () => {
          const camera = useEditorStore.getState().camera;
          const canvas = document.querySelector('canvas');
          let center = { x: 0, y: 0 };
          if (canvas) {
            const rect = canvas.getBoundingClientRect();
            center = screenToWorld({ x: rect.width / 2, y: rect.height / 2 }, camera);
          }
          const id = addImage(baseBodyId, dataUrl, img.naturalWidth, img.naturalHeight, center);
          useEditorStore.getState().select(id);
          setCreateTool('image');
          cleanup();
        };
        img.onerror = cleanup;
        img.src = dataUrl;
      };
      reader.onerror = cleanup;
      reader.readAsDataURL(file);
    });
    input.click();
  };

  const drawTools = ['outline', 'rectangle', 'circle', 'ngon', 'trim'] as const;
  const isDrawTool = drawTools.some((tool) => createTool === tool);

  return (
    <div className="app-layout">
      <TopBar />
      <div className="app-main">

        {/* ---- LEFT TOOLBAR ---- */}
        <div className="left-sidebar-host">
          {leftCollapsed ? (
            <div className="toolbar-collapsed">
              <div className="collapsed-mode-group">
                <button
                  className={`collapsed-mode-btn top ${mode === 'create' ? 'active' : ''}`}
                  onClick={() => switchMode('create')}
                  title="Create mode"
                >
                  <IconCreateMode />
                </button>
              <button
                className={`collapsed-mode-btn bottom simulate ${mode === 'simulate' ? 'active' : ''}`}
                onClick={() => switchMode('simulate')}
                title="Simulate mode"
              >
                <IconSimulateMode />
              </button>
            </div>

            {mode === 'create' && (
              <>
                <div className="collapsed-divider" />
                <button
                  className={`collapsed-tool-btn ${createTool === 'joints' ? 'active' : ''}`}
                  onClick={() => setCreateTool('joints')}
                  title="Pivot joint"
                >
                  <IconPivotSmall />
                </button>
                <button
                  className={`collapsed-tool-btn ${createTool === 'slider' ? 'active' : ''}`}
                  onClick={() => setCreateTool('slider')}
                  title="Slider joint"
                >
                  <IconSliderSmall />
                </button>
                <button
                  className={`collapsed-tool-btn ${createTool === 'collider' ? 'active' : ''}`}
                  onClick={() => setCreateTool('collider')}
                  title="Collider barrier"
                >
                  <IconColliderSmall />
                </button>

                <div className="collapsed-divider" />
                <button
                  className={`collapsed-tool-btn ${createTool === 'spring' ? 'active' : ''}`}
                  onClick={() => setCreateTool('spring')}
                  title="Spring — joint or link endpoints"
                >
                  <IconSpringSmall />
                </button>
                <button
                  className={`collapsed-tool-btn ${createTool === 'damper' ? 'active' : ''}`}
                  onClick={() => setCreateTool('damper')}
                  title="Damper (dashpot)"
                >
                  <IconDamperSmall />
                </button>
                <button
                  className={`collapsed-tool-btn ${createTool === 'torsionSpring' ? 'active' : ''}`}
                  onClick={() => setCreateTool('torsionSpring')}
                  title="Torsion spring — pivot, then two links"
                >
                  <IconTorsionSpringSmall />
                </button>

                <div className="collapsed-divider" />
                <button
                  className={`collapsed-tool-btn ${isDrawTool ? 'active' : ''}`}
                  onClick={() => setCreateTool('outline')}
                  title="Draw overlays"
                >
                  <IconOutlineSmall />
                </button>
                <button
                  className={`collapsed-tool-btn ${createTool === 'image' ? 'active' : ''}`}
                  onClick={() => {
                    if (createTool === 'image') {
                      handleImportImage();
                    } else {
                      setCreateTool('image');
                      const hasImages = Object.keys(useMechanismStore.getState().images).length > 0;
                      if (!hasImages) handleImportImage();
                    }
                  }}
                  title="Image overlay"
                >
                  <IconImageSmall />
                </button>

                <div className="collapsed-divider" />
                <button
                  className={`collapsed-tool-btn ${createTool === 'tracer' ? 'active' : ''}`}
                  onClick={() => setCreateTool('tracer')}
                  title="Path Plotter"
                >
                  <IconTracerSmall />
                </button>
                <button
                  className={`collapsed-tool-btn ${createTool === 'forceSensor' ? 'active' : ''}`}
                  onClick={() => setCreateTool('forceSensor')}
                  title="Force Sensor"
                  aria-label="Force Sensor"
                >
                  <IconForceSensorSmall />
                </button>

                {/* Delete button — shown when a joint/outline/image or vertex is selected */}
                {(selectedIds.size > 0 || (editingOutlineId !== null && editingVertexIndex !== null)) && (
                  <>
                    <div className="collapsed-divider" />
                    <CollapsedDeleteButton />
                  </>
                )}
              </>
            )}
          </div>
          ) : (
            <div className="left-sidebar-pane" style={{ width: leftRailPreview ?? leftSidebarWidthPx }}>
              <Toolbar />
            </div>
          )}
          <SidebarEdgeRail
            side="left"
            collapsed={leftCollapsed}
            previewWidth={leftRailPreview}
            onPreviewWidth={setLeftRailPreview}
          />
        </div>

        {/* ---- CANVAS ---- */}
        <div className="canvas-container">
          <MechanismCanvas />
          <CanvasViewportBar />
          {mode === 'create' && isDrawTool && (
            <div className="shape-draw-palette" role="toolbar" aria-label="Draw overlay tools">
              <button
                type="button"
                className={`shape-draw-palette-btn ${createTool === 'outline' ? 'active' : ''}`}
                onClick={() => setCreateTool('outline')}
                title="Freeform outline"
                aria-label="Freeform outline"
              >
                <DrawPaletteIconOutline />
              </button>
              <button
                type="button"
                className={`shape-draw-palette-btn ${createTool === 'rectangle' ? 'active' : ''}`}
                onClick={() => setCreateTool('rectangle')}
                title="Rectangle"
                aria-label="Rectangle"
              >
                <DrawPaletteIconRectangle />
              </button>
              <button
                type="button"
                className={`shape-draw-palette-btn ${createTool === 'circle' ? 'active' : ''}`}
                onClick={() => setCreateTool('circle')}
                title="Circle"
                aria-label="Circle"
              >
                <DrawPaletteIconCircle />
              </button>
              <button
                type="button"
                className={`shape-draw-palette-btn ${createTool === 'ngon' ? 'active' : ''}`}
                onClick={() => setCreateTool('ngon')}
                title="N-gon"
                aria-label="N-gon polygon"
              >
                <DrawPaletteIconNgon />
              </button>
              <button
                type="button"
                className={`shape-draw-palette-btn ${createTool === 'trim' ? 'active' : ''}`}
                onClick={() => setCreateTool('trim')}
                title="Power trim"
                aria-label="Power trim"
              >
                <DrawPaletteIconTrim />
              </button>
            </div>
          )}
          <WorldContextMenu />
          {transientHint && (
            <div className="hint-toast" role="status" aria-live="polite">
              <span className="hint-toast-msg">{transientHint}</span>
              <button type="button" className="hint-toast-close" onClick={() => dismissTransientHint()} aria-label="Dismiss">
                ×
              </button>
            </div>
          )}
        </div>

        {/* ---- RIGHT PANEL ---- */}
        <div className="right-sidebar-host">
          <SidebarEdgeRail
            side="right"
            collapsed={rightCollapsed}
            previewWidth={rightRailPreview}
            onPreviewWidth={setRightRailPreview}
          />
          {rightCollapsed ? (
            <div className="panel-collapsed">{mode === 'create' && <CollapsedBodyList />}</div>
          ) : (
            <div className="right-panel" style={{ width: rightRailPreview ?? rightSidebarWidthPx }}>
              <div className="right-panel-scroll">
                <BodyPanel />
                <PropertyPanel />
                <SimulationPanel />
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
