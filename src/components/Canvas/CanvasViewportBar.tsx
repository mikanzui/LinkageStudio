import { useCallback } from 'react';
import { useEditorStore } from '../../store/editor-store';
import { useMechanismStore } from '../../store/mechanism-store';
import { fitCameraToBounds, getMechanismWorldBounds } from '../../core/viewport-fit';
import './CanvasViewportBar.css';

function getLinkageCanvasSize(): { w: number; h: number } {
  const el = document.getElementById('linkage-canvas') as HTMLCanvasElement | null;
  if (!el || el.width <= 0 || el.height <= 0) return { w: 800, h: 600 };
  return { w: el.width, h: el.height };
}

export function CanvasViewportBar() {
  const activeTool = useEditorStore((s) => s.activeTool);
  const setTool = useEditorStore((s) => s.setTool);
  const resetViewport = useEditorStore((s) => s.resetViewport);
  const setCamera = useEditorStore((s) => s.setCamera);
  const zoomViewportAtCenter = useEditorStore((s) => s.zoomViewportAtCenter);
  const mode = useEditorStore((s) => s.mode);
  const spacePanHeld = useEditorStore((s) => s.spacePanHeld);
  const selectMode = useEditorStore((s) => s.selectMode);
  const setSelectMode = useEditorStore((s) => s.setSelectMode);
  const isCreate = mode === 'create';
  const selectionToolsDisabled = !isCreate || activeTool === 'pan' || spacePanHeld;

  const handleFit = useCallback(() => {
    const { w, h } = getLinkageCanvasSize();
    const mech = useMechanismStore.getState();
    const bounds = getMechanismWorldBounds(
      mech.joints,
      mech.outlines,
      mech.bodies,
      mech.tracers,
    );
    if (!bounds) {
      resetViewport();
      return;
    }
    setCamera(fitCameraToBounds(bounds, w, h, 48));
  }, [resetViewport, setCamera]);

  const handleZoom = useCallback(
    (factor: number) => {
      const { w, h } = getLinkageCanvasSize();
      zoomViewportAtCenter(factor, w, h);
    },
    [zoomViewportAtCenter],
  );

  const togglePan = useCallback(() => {
    setTool(activeTool === 'pan' ? 'select' : 'pan');
  }, [activeTool, setTool]);

  return (
    <div className="canvas-viewport-bar" role="toolbar" aria-label="Viewport">
      <button
        type="button"
        className={`viewport-btn ${activeTool === 'pan' ? 'active' : ''}`}
        onClick={togglePan}
        title="Pan (drag on canvas) — hold Space, middle mouse, or use zoom buttons"
      >
        <IconHand />
      </button>
      <span className="viewport-bar-divider" aria-hidden />
      <button
        type="button"
        className={`viewport-btn ${selectMode === 'single' ? 'active' : ''}`}
        disabled={selectionToolsDisabled}
        onClick={() => setSelectMode('single')}
        title="Click to select (drag joints, Shift+click to add)"
      >
        <IconSelectClick />
      </button>
      <button
        type="button"
        className={`viewport-btn ${selectMode === 'box' ? 'active' : ''}`}
        disabled={selectionToolsDisabled}
        onClick={() => setSelectMode('box')}
        title="Drag a box on empty canvas to select (Shift adds to selection)"
      >
        <IconSelectBox />
      </button>
      <button
        type="button"
        className={`viewport-btn ${selectMode === 'lasso' ? 'active' : ''}`}
        disabled={selectionToolsDisabled}
        onClick={() => setSelectMode('lasso')}
        title="Drag a freeform lasso on empty canvas (Shift adds to selection)"
      >
        <IconSelectLasso />
      </button>
      <span className="viewport-bar-divider" aria-hidden />
      <button
        type="button"
        className="viewport-btn"
        onClick={() => handleZoom(1 / 1.15)}
        title="Zoom out"
      >
        <IconZoomOut />
      </button>
      <button
        type="button"
        className="viewport-btn"
        onClick={() => handleZoom(1.15)}
        title="Zoom in"
      >
        <IconZoomIn />
      </button>
      <span className="viewport-bar-divider" aria-hidden />
      <button type="button" className="viewport-btn" onClick={handleFit} title="Zoom to fit content">
        <IconFit />
      </button>
      <button type="button" className="viewport-btn" onClick={resetViewport} title="Reset view (origin, 100% zoom)">
        <IconHome />
      </button>
    </div>
  );
}

function IconHand() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M18 11V6a2 2 0 0 0-2-2v0a2 2 0 0 0-2 2v0" />
      <path d="M14 10V4a2 2 0 0 0-2-2v0a2 2 0 0 0-2 2v2" />
      <path d="M10 10.5V6a2 2 0 0 0-2-2v0a2 2 0 0 0-2 2v8" />
      <path d="M18 11a2 2 0 1 1 4 0v3a8 8 0 0 1-8 8h-1c-2.8 0-4.5-.86-6-2.28V18" />
    </svg>
  );
}

function IconZoomIn() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round">
      <circle cx="11" cy="11" r="7" />
      <path d="M21 21l-4.3-4.3M11 8v6M8 11h6" />
    </svg>
  );
}

function IconZoomOut() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round">
      <circle cx="11" cy="11" r="7" />
      <path d="M21 21l-4.3-4.3M8 11h6" />
    </svg>
  );
}

function IconFit() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M15 3h4v4M9 21H5v-4M21 9v4h-4M3 15v-4h4" />
      <path d="M3 9V5h4M21 15v4h-4M15 21h4v-4M9 3H5v4" />
    </svg>
  );
}

function IconHome() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M3 10.5L12 3l9 7.5" />
      <path d="M5 10v10h5v-6h4v6h5V10" />
    </svg>
  );
}

function IconSelectClick() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M4 4l7 18 2-8 8-2-18-8z" />
    </svg>
  );
}

function IconSelectBox() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <rect x="4" y="5" width="14" height="12" rx="1.5" strokeDasharray="3 2" />
      <path d="M7 9h6M7 12h4" opacity="0.5" />
    </svg>
  );
}

function IconSelectLasso() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M5 8c2-4 8-3 10 1s-2 8-6 8-4-2-4-5" />
      <path d="M5 10c-1.5 2-1 5 2 6" opacity="0.7" />
    </svg>
  );
}
