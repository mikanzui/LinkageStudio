import { useRef, useEffect, useCallback } from 'react';
import { useMechanismStore } from '../../store/mechanism-store';
import { useEditorStore } from '../../store/editor-store';
import { useSimulationStore } from '../../store/simulation-store';
import { render } from '../../renderer/canvas-renderer';
import { screenToWorld } from '../../renderer/camera';
import {
  handleMouseDown, handleMouseMove, handleMouseUp, handleDoubleClick, handleWheel, handleKeyDown,
} from '../../interaction/tool-manager';
import { hitTestAny, hitTestOutlineFilled, hitTestSensor, hitTestTracer } from '../../interaction/hit-test';
import { hitTestImage, hitTestRotateHandle, hitTestScaleHandle } from '../../renderer/draw-images';
import { computeBodyTransform, localToWorld } from '../../core/body-transform';
import type { Vec2 } from '../../types';
import { createPointerRuntime } from '../../interaction/pointer-runtime';
import { snapshotMechanism } from '../../core/compile-mechanism';
import { registerInteractionCancellation } from '../../interaction/session';
import { projectImages } from '../../core/image-transform';
import { drawGeometryPreview } from '../../renderer/draw-geometry-preview';
import { resolveSpringAnchor } from '../../core/springs/spring-model';
import { hitTestSpring } from '../../core/spring-geometry';

const PAN_THRESHOLD = 8; // px movement before a touch becomes a pan drag

function interactionCheckpoint() {
  const m = useMechanismStore.getState(), e = useEditorStore.getState();
  return {
    mechanism: { ...snapshotMechanism(m), angleConstraints: structuredClone(m.angleConstraints), past: m.past, future: m.future },
    editor: structuredClone({ selectedIds: e.selectedIds, outlinePoints: e.outlinePoints, frozenOutlineWorldPoints: e.frozenOutlineWorldPoints, arcSelector: e.arcSelector,
      sliderPointA: e.sliderPointA, colliderPointA: e.colliderPointA, editingOutlineId: e.editingOutlineId, editingVertexIndex: e.editingVertexIndex, selectionGesture: e.selectionGesture, shapeGesture: e.shapeGesture, trimStroke: e.trimStroke, springPlacement: e.springPlacement, springReattachId: e.springReattachId, placementCommitted: e.placementCommitted }),
  };
}


export function MechanismCanvas() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const cursorWorldRef = useRef<Vec2 | null>(null);
  const rafRef = useRef<number>(0);
  const gesture = useRef(createPointerRuntime());
  const checkpoint = useRef<ReturnType<typeof interactionCheckpoint> | null>(null);
  const beginTool = useCallback((event: PointerEvent | MouseEvent, canvas: HTMLCanvasElement) => {
    if (useEditorStore.getState().mode === 'create') checkpoint.current = interactionCheckpoint();
    handleMouseDown(event, canvas);
  }, []);
  const endTool = useCallback((event: PointerEvent | MouseEvent, canvas: HTMLCanvasElement) => {
    handleMouseUp(event, canvas); checkpoint.current = null;
  }, []);
  const cancelTool = useCallback(() => {
    const active = checkpoint.current !== null;
    handleMouseUp();
    if (checkpoint.current && useEditorStore.getState().mode === 'create') {
      useMechanismStore.setState(checkpoint.current.mechanism);
      useEditorStore.setState(checkpoint.current.editor);
    }
    checkpoint.current = null;
    if (active) useEditorStore.setState({ springPlacement: null, springReattachId: null, placementCommitted: false });
  }, []);

  const renderLoop = useCallback(function drawFrame() {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // Resize canvas to fill container
    const rect = canvas.parentElement!.getBoundingClientRect();
    const pixelRatio = Math.min(3, Math.max(.5, window.devicePixelRatio || 1));
    const width = Math.max(1, Math.round(rect.width * pixelRatio)), height = Math.max(1, Math.round(rect.height * pixelRatio));
    if (canvas.width !== width || canvas.height !== height) {
      canvas.width = width;
      canvas.height = height;
    }

    const mechanism = useMechanismStore.getState();
    const editor = useEditorStore.getState();
    const sim = useSimulationStore.getState();

    try {
      render(ctx, canvas, {
        springs: mechanism.springs,
        forceSensors: mechanism.forceSensors,
        forceAnalysis: editor.mode === 'simulate' ? sim.solverResult?.forceAnalysis : undefined,
        showLoads: editor.showLoads,
        showReactions: editor.showReactions,
        springAnchor: editor.springPlacement?.anchorA ? resolveSpringAnchor(editor.springPlacement.anchorA, mechanism.joints, mechanism.links) : mechanism.joints[editor.springPlacement?.pivotId ?? '']?.position,
        joints: mechanism.joints,
        links: mechanism.links,
        bodies: mechanism.bodies,
        outlines: mechanism.outlines,
        images: editor.mode === 'simulate' && editor.simulationDesign ? projectImages(mechanism.images, mechanism.bodies, editor.simulationDesign.joints, mechanism.joints) : mechanism.images,
        sliders: mechanism.sliders,
        colliders: mechanism.colliders,
        tracers: mechanism.tracers,
        tracerPaths: sim.tracerPaths || new Map(),
        selectedIds: editor.selectedIds,
        hoveredId: editor.hoveredId,
        camera: editor.camera,
        gridEnabled: editor.gridEnabled,
        gridSize: editor.gridSize,
        dof: sim.dof,
        cursorWorld: cursorWorldRef.current,
        pathTraces: sim.pathTraces,
        simDrag: editor.simDrag,
        mode: editor.mode,
        forceVectors: sim.solverResult?.forceVectors || [],
        showLinks: editor.showLinks,
        showVectors: editor.showVectors,
        showRulers: editor.showRulers,
        showForceUnits: editor.showForceUnits,
        createTool: editor.createTool,
        outlinePoints: editor.outlinePoints,
        activeBodyColor: (() => {
          const activeId = [...editor.activeBodyIds][0];
          return activeId && mechanism.bodies[activeId] ? mechanism.bodies[activeId].color : '#888888';
        })(),
        gravityEnabled: sim.gravityEnabled,
        gravityStrength: sim.gravityStrength,
        baseBodyId: mechanism.baseBodyId,
        frozenOutlinePoints: (editor.lockOutlines && editor.mode === 'create') ? (() => {
          // Ensure all outlines are in the frozen map — fill missing ones
          const frozen = editor.frozenOutlineWorldPoints;
          let needsUpdate = false;
          const updates: [string, import('../../types').Vec2[]][] = [];
          for (const outline of Object.values(mechanism.outlines)) {
            if (outline.points.length < 2 || frozen.has(outline.id)) continue;
            const body = mechanism.bodies[outline.bodyId];
            if (!body) continue;
            const transform = computeBodyTransform(body, mechanism.joints);
            updates.push([outline.id, outline.points.map((p) => localToWorld(p, transform))]);
            needsUpdate = true;
          }
          if (needsUpdate) {
            for (const [id, pts] of updates) editor.updateFrozenOutline(id, pts);
            return new Map([...frozen, ...updates]);
          }
          return frozen;
        })() : undefined,
        sliderPointA: editor.sliderPointA?.position ?? null,
        colliderPointA: editor.colliderPointA?.position ?? null,
        editingOutlineId: editor.editingOutlineId,
        editingVertexIndex: editor.editingVertexIndex,
        arcSelector: editor.arcSelector ? { jointId: editor.arcSelector.jointId, colliderId: editor.arcSelector.colliderId, tracerId: editor.arcSelector.tracerId, position: editor.arcSelector.position, showTime: editor.arcSelector.showTime, collapseTime: editor.arcSelector.collapseTime, createdBodyId: editor.arcSelector.createdBodyId } : null,
      }, { width: rect.width, height: rect.height, pixelRatio });
      drawGeometryPreview(ctx,editor,rect.width,rect.height,pixelRatio);
      const selection = editor.selectionGesture;
      if (selection) {
        const points = selection.kind === 'box'
          ? [selection.start, { x: selection.end.x, y: selection.start.y }, selection.end, { x: selection.start.x, y: selection.end.y }]
          : selection.points;
        ctx.save(); ctx.setTransform(pixelRatio, 0, 0, pixelRatio, 0, 0);
        ctx.beginPath();
        points.forEach((point, index) => { const x = point.x * editor.camera.zoom + editor.camera.pan.x, y = point.y * editor.camera.zoom + editor.camera.pan.y; if (index) ctx.lineTo(x, y); else ctx.moveTo(x, y); });
        ctx.closePath(); ctx.fillStyle = 'rgba(0,120,150,0.10)'; ctx.strokeStyle = '#007896'; ctx.lineWidth = 1.5; ctx.setLineDash([5, 3]); ctx.fill(); ctx.stroke(); ctx.restore();
      }
    } catch (e) {
      console.error('Render error:', e);
    }

    rafRef.current = requestAnimationFrame(drawFrame);
  }, []);

  useEffect(() => {
    rafRef.current = requestAnimationFrame(renderLoop);
    return () => cancelAnimationFrame(rafRef.current);
  }, [renderLoop]);

  // On mount, if lockOutlines is true but frozenOutlineWorldPoints is empty,
  // populate it from current outline positions. Fixes the bug where the
  // checkbox starts checked but has no frozen data to actually lock to.
  useEffect(() => {
    const editor = useEditorStore.getState();
    if (editor.lockOutlines && editor.frozenOutlineWorldPoints.size === 0) {
      const mech = useMechanismStore.getState();
      const outlineValues = Object.values(mech.outlines);
      if (outlineValues.length > 0) {
        const frozen = new Map<string, Vec2[]>();
        for (const outline of outlineValues) {
          const body = mech.bodies[outline.bodyId];
          if (!body || outline.points.length < 2) continue;
          const transform = computeBodyTransform(body, mech.joints);
          frozen.set(outline.id, outline.points.map((p) => localToWorld(p, transform)));
        }
        if (frozen.size > 0) {
          editor.setLockOutlines(true, frozen);
        }
      }
    }
  }, []);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => handleKeyDown(e);
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const wheel = (event: WheelEvent) => handleWheel(event, canvas);
    canvas.addEventListener('wheel', wheel, { passive: false });
    return () => canvas.removeEventListener('wheel', wheel);
  }, []);

  // Prevent Safari/iOS gesture zoom on the canvas.
  // IMPORTANT: Only intercept Safari's proprietary gesture* events.
  // Do NOT preventDefault on touchstart/touchmove — on newer iOS/Safari,
  // this can block subsequent pointerdown/pointermove from being dispatched.
  // The CSS touchAction:'none' on the canvas already prevents all default
  // touch behaviors (scroll, zoom, pan).
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const preventGesture = (e: Event) => e.preventDefault();
    canvas.addEventListener('gesturestart', preventGesture);
    canvas.addEventListener('gesturechange', preventGesture);
    canvas.addEventListener('gestureend', preventGesture);
    return () => {
      canvas.removeEventListener('gesturestart', preventGesture);
      canvas.removeEventListener('gesturechange', preventGesture);
      canvas.removeEventListener('gestureend', preventGesture);
    };
  }, []);

  const mode = useEditorStore((s) => s.mode);
  const activeTool = useEditorStore((s) => s.activeTool);
  const simDrag = useEditorStore((s) => s.simDrag);
  const hoveredId = useEditorStore((s) => s.hoveredId);

  // Custom dark crosshair cursor (SVG data URI) — the built-in CSS 'crosshair'
  // renders white/invisible on some OS/browser combinations.
  const CROSSHAIR_CURSOR = `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='24' height='24'%3E%3Cline x1='12' y1='2' x2='12' y2='22' stroke='%23333' stroke-width='1.5'/%3E%3Cline x1='2' y1='12' x2='22' y2='12' stroke='%23333' stroke-width='1.5'/%3E%3Ccircle cx='12' cy='12' r='3' fill='none' stroke='%23333' stroke-width='1'/%3E%3C/svg%3E") 12 12, crosshair`;

  const cursor = activeTool === 'pan' ? 'grab' : activeTool === 'select' && mode === 'create' ? 'default' : mode === 'simulate'
    ? (simDrag?.active ? 'grabbing' : 'grab')
    : (hoveredId ? 'pointer' : CROSSHAIR_CURSOR);

  const handlePinchMove = useCallback(() => {
    if (gesture.current.activePointers.size < 2) return;
    const pts = Array.from(gesture.current.activePointers.values());
    const dx = pts[1].x - pts[0].x;
    const dy = pts[1].y - pts[0].y;
    const dist = Math.sqrt(dx * dx + dy * dy);
    const center: Vec2 = {
      x: (pts[0].x + pts[1].x) / 2,
      y: (pts[0].y + pts[1].y) / 2,
    };
    const canvas = canvasRef.current!;
    const rect = canvas.getBoundingClientRect();

    if (gesture.current.lastPinchDist !== null && gesture.current.lastPinchCenter !== null) {
      const factor = dist / gesture.current.lastPinchDist;
      useEditorStore.getState().zoomCamera(factor, { x: gesture.current.lastPinchCenter.x - rect.left, y: gesture.current.lastPinchCenter.y - rect.top });
      const panDx = center.x - gesture.current.lastPinchCenter.x;
      const panDy = center.y - gesture.current.lastPinchCenter.y;
      useEditorStore.getState().panCamera({ x: panDx, y: panDy });
    }
    gesture.current.lastPinchDist = dist;
    gesture.current.lastPinchCenter = center;
  }, []);

  // Reset all touch gesture state
  const resetGesture = useCallback(() => {
    gesture.current.reset();
  }, []);

  const cancelGesture = useCallback(() => {
    const state = gesture.current;
    const ids = [...state.activePointers.keys(), state.penId, state.mouseId].filter((id): id is number => id !== null);
    state.reset(); cancelTool();
    cursorWorldRef.current = null;
    for (const id of ids) {
      try { if (canvasRef.current?.hasPointerCapture(id)) canvasRef.current.releasePointerCapture(id); } catch { /* Capture may already be gone. */ }
    }
  }, [cancelTool]);
  useEffect(() => registerInteractionCancellation(cancelGesture), [cancelGesture]);

  useEffect(() => {
    const blur = () => { cancelGesture(); useEditorStore.setState({ springPlacement: null, springReattachId: null }); if (useEditorStore.getState().mode === 'simulate') useSimulationStore.getState().pause(); };
    const hidden = () => { if (document.hidden) blur(); };
    const palm = (event: PointerEvent) => {
      if (gesture.current.penId !== null && event.pointerType === 'touch') { event.preventDefault(); event.stopPropagation(); }
    };
    const escape = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && (gesture.current.mouseId !== null || gesture.current.penId !== null || gesture.current.activePointers.size)) {
        event.preventDefault(); event.stopImmediatePropagation(); cancelGesture();
      }
    };
    window.addEventListener('blur', blur);
    document.addEventListener('visibilitychange', hidden);
    document.addEventListener('pointerdown', palm, { capture: true, passive: false });
    window.addEventListener('keydown', escape, true);
    return () => {
      window.removeEventListener('blur', blur); document.removeEventListener('visibilitychange', hidden);
      document.removeEventListener('pointerdown', palm, true); window.removeEventListener('keydown', escape, true); cancelGesture();
    };
  }, [cancelGesture]);

  useEffect(() => {
    const parent = canvasRef.current?.parentElement;
    if (!parent) return;
    let previous = parent.getBoundingClientRect();
    const observer = new ResizeObserver(() => {
      const next = parent.getBoundingClientRect();
      if (Math.abs(next.width - previous.width) > .5 || Math.abs(next.height - previous.height) > .5) cancelGesture();
      previous = next;
    });
    observer.observe(parent);
    return () => observer.disconnect();
  }, [cancelGesture]);

  return (
    <canvas
      ref={canvasRef}
      aria-label="Mechanism canvas"
      tabIndex={0}
      style={{ display: 'block', width: '100%', height: '100%', cursor, userSelect: 'none', touchAction: 'none' }}
      onPointerDown={(e) => {
        const canvas = canvasRef.current!;
        if (!gesture.current.accepts(e.pointerId, e.pointerType, 'down')) return;

        // --- MOUSE: pass through directly (no gesture detection needed) ---
        if (e.pointerType === 'mouse') {
          if (e.button !== 0 && e.button !== 1) return;
          gesture.current.mouseId = e.pointerId;
          canvas.setPointerCapture(e.pointerId);
          beginTool(e.nativeEvent, canvas);
          return;
        }

        // --- PEN (Apple Pencil): pass through directly, like mouse ---
        // Pen has precise intent and can't pinch, so no gesture detection needed.
        if (e.pointerType === 'pen') {
          cancelGesture();
          gesture.current.penId = e.pointerId;
          e.preventDefault();
          canvas.setPointerCapture(e.pointerId);
          gesture.current.mode = 'interact';
          gesture.current.touchStartPointerId = e.pointerId;
          // Update cursor world pos for outline ghost/preview
          const rect = canvas.getBoundingClientRect();
          const screen = { x: e.clientX - rect.left, y: e.clientY - rect.top };
          cursorWorldRef.current = screenToWorld(screen, useEditorStore.getState().camera);
          beginTool(e.nativeEvent, canvas);
          return;
        }

        // --- TOUCH (finger) ---
        e.preventDefault();
        canvas.setPointerCapture(e.pointerId);
        gesture.current.activePointers.set(e.pointerId, { x: e.clientX, y: e.clientY });

        if (gesture.current.activePointers.size >= 2) {
          // Transition to pinch: cancel any in-progress single-pointer interaction
          if (gesture.current.mode === 'interact') {
            cancelTool();
          }
          gesture.current.mode = 'pinch';
          gesture.current.lastPinchDist = null;
          gesture.current.lastPinchCenter = null;
          handlePinchMove();
          return;
        }

        // First finger down — hit-test to decide: interact with component or pan/tap empty space
        const rect = canvas.getBoundingClientRect();
        const screenPos: Vec2 = { x: e.clientX - rect.left, y: e.clientY - rect.top };
        const editor = useEditorStore.getState();
        const mechanism = useMechanismStore.getState();
        const worldPos = screenToWorld(screenPos, editor.camera);

        // Check if touching a joint, link, filled outline, or image (including handles).
        // Use hitTestAny (non-mutating) so the authoritative hitTest in handleMouseDown
        // gets a clean state for click-cycling overlapping joints.
        let componentHit = hitTestAny(worldPos, mechanism.joints, mechanism.links, editor.camera.zoom)
          || hitTestOutlineFilled(worldPos, mechanism.outlines, mechanism.bodies, mechanism.joints, mechanism.baseBodyId);

        // Also check images and their handles
        if (!componentHit && editor.createTool === 'image') {
          const selectedImageId = [...editor.selectedIds].find((id) => mechanism.images[id]);
          if (selectedImageId) {
            const img = mechanism.images[selectedImageId];
            if (img && (hitTestRotateHandle(worldPos, img, editor.camera.zoom)
                     || hitTestScaleHandle(worldPos, img, editor.camera.zoom))) {
              componentHit = true;
            }
          }
          if (!componentHit) {
            for (const img of Object.values(mechanism.images)) {
              if (hitTestImage(worldPos, img)) {
                componentHit = true;
                break;
              }
            }
          }
        }

        if (componentHit || hitTestSpring(worldPos, mechanism.springs, mechanism.joints, mechanism.links, editor.camera.zoom)
          || hitTestSensor(worldPos, mechanism.forceSensors, mechanism.links, mechanism.joints, editor.camera.zoom)
          || hitTestTracer(worldPos, mechanism.tracers, mechanism.bodies, mechanism.joints, editor.camera.zoom)
          || editor.activeTool === 'pan' || (editor.activeTool === 'select' && editor.selectMode !== 'single')
          || (editor.activeTool === 'joint' && ['rectangle','circle','ngon','trim','mirror','spring','damper','torsion','force-sensor'].includes(editor.createTool))) {
          // Finger landed on a component → forward to tool-manager immediately for drag interaction
          gesture.current.mode = 'interact';
          gesture.current.touchStartPointerId = e.pointerId;
          beginTool(e.nativeEvent, canvas);
        } else {
          // Finger landed on empty space → wait to distinguish tap from pan
          gesture.current.mode = 'pending';
          gesture.current.touchStartPos = { x: e.clientX, y: e.clientY };
          gesture.current.touchStartPointerId = e.pointerId;
          gesture.current.lastTouchScreen = { x: e.clientX, y: e.clientY };
        }
      }}
      onDoubleClick={(e) => {
        if (gesture.current.mode !== 'pinch') {
          handleDoubleClick(e.nativeEvent, canvasRef.current!);
        }
      }}
      onPointerMove={(e) => {
        const canvas = canvasRef.current!;
        if (!gesture.current.accepts(e.pointerId, e.pointerType, 'move')) return;

        // --- MOUSE: pass through directly ---
        if (e.pointerType === 'mouse') {
          const rect = canvas.getBoundingClientRect();
          const screen = { x: e.clientX - rect.left, y: e.clientY - rect.top };
          cursorWorldRef.current = screenToWorld(screen, useEditorStore.getState().camera);
          handleMouseMove(e.nativeEvent as PointerEvent, canvas);
          return;
        }

        // --- PEN: pass through directly (like mouse) ---
        if (e.pointerType === 'pen') {
          e.preventDefault();
          const rect = canvas.getBoundingClientRect();
          const screen = { x: e.clientX - rect.left, y: e.clientY - rect.top };
          cursorWorldRef.current = screenToWorld(screen, useEditorStore.getState().camera);
          handleMouseMove(e.nativeEvent as PointerEvent, canvas);
          return;
        }

        // --- TOUCH (finger) ---
        e.preventDefault();
        gesture.current.activePointers.set(e.pointerId, { x: e.clientX, y: e.clientY });

        // Pinch mode: zoom + pan with two fingers
        if (gesture.current.mode === 'pinch') {
          if (gesture.current.activePointers.size >= 2) {
            handlePinchMove();
          }
          return;
        }

        // Interact: forward moves to tool-manager (dragging a joint, sim drag, etc.)
        if (gesture.current.mode === 'interact') {
          const rect = canvas.getBoundingClientRect();
          const screen = { x: e.clientX - rect.left, y: e.clientY - rect.top };
          cursorWorldRef.current = screenToWorld(screen, useEditorStore.getState().camera);
          handleMouseMove(e.nativeEvent as PointerEvent, canvas);
          return;
        }

        // Pending: check if finger moved enough to become a pan
        if (gesture.current.mode === 'pending' && gesture.current.touchStartPos) {
          const dx = e.clientX - gesture.current.touchStartPos.x;
          const dy = e.clientY - gesture.current.touchStartPos.y;
          if (dx * dx + dy * dy > PAN_THRESHOLD * PAN_THRESHOLD) {
            gesture.current.mode = 'pan';
            useEditorStore.getState().panCamera({ x: dx, y: dy });
            gesture.current.lastTouchScreen = { x: e.clientX, y: e.clientY };
          }
          return; // Don't do anything else while pending
        }

        // Single-finger pan
        if (gesture.current.mode === 'pan' && gesture.current.lastTouchScreen) {
          const dx = e.clientX - gesture.current.lastTouchScreen.x;
          const dy = e.clientY - gesture.current.lastTouchScreen.y;
          useEditorStore.getState().panCamera({ x: dx, y: dy });
          gesture.current.lastTouchScreen = { x: e.clientX, y: e.clientY };
          return;
        }
      }}
      onPointerUp={(e) => {
        const canvas = canvasRef.current!;
        if (!gesture.current.accepts(e.pointerId, e.pointerType, 'up')) return;

        // --- MOUSE: pass through directly ---
        if (e.pointerType === 'mouse') {
          gesture.current.mouseId = null;
          if (canvas.hasPointerCapture(e.pointerId)) canvas.releasePointerCapture(e.pointerId);
          endTool(e.nativeEvent, canvas);
          return;
        }

        // --- PEN: pass through directly (like mouse) ---
        if (e.pointerType === 'pen') {
          gesture.current.penId = null;
          try { canvas.releasePointerCapture(e.pointerId); } catch (_) { /* already released */ }
          endTool(e.nativeEvent, canvas);
          resetGesture();
          return;
        }

        // --- TOUCH (finger) ---
        gesture.current.activePointers.delete(e.pointerId);
        try { canvas.releasePointerCapture(e.pointerId); } catch (_) { /* already released */ }

        if (gesture.current.mode === 'pinch') {
          // Still have 2+ fingers? Stay in pinch. Otherwise wait for all fingers to lift.
          if (gesture.current.activePointers.size >= 2) {
            // Reset pinch baseline for remaining fingers
            gesture.current.lastPinchDist = null;
            gesture.current.lastPinchCenter = null;
          } else if (gesture.current.activePointers.size === 0) {
            resetGesture();
          }
          // Don't fire any interaction when coming out of pinch
          return;
        }

        // Interact: finger lifted off a component drag → forward mouseUp to tool-manager
        if (gesture.current.mode === 'interact' && e.pointerId === gesture.current.touchStartPointerId) {
          endTool(e.nativeEvent, canvas);
          resetGesture();
          gesture.current.activePointers.clear();
          return;
        }

        if (gesture.current.mode === 'pending' && gesture.current.touchStartPos && e.pointerId === gesture.current.touchStartPointerId) {
          // Finger lifted without significant movement → TAP
          // Update cursor world position so outline ghost draws correctly
          const rect = canvas.getBoundingClientRect();
          const screen = { x: e.clientX - rect.left, y: e.clientY - rect.top };
          cursorWorldRef.current = screenToWorld(screen, useEditorStore.getState().camera);
          // Fire down + up at the touch position to trigger the action (place joint, select, etc.)
          beginTool(e.nativeEvent, canvas);
          endTool(e.nativeEvent, canvas);
          resetGesture();
          gesture.current.activePointers.clear();
          return;
        }

        // End of pan or other gesture
        if (gesture.current.activePointers.size === 0) {
          resetGesture();
        }
      }}
      onPointerLeave={(e) => {
        // Only clear cursor for mouse (pen/touch use capture)
        if (e.pointerType === 'mouse') {
          cursorWorldRef.current = null;
        }
      }}
      onPointerCancel={(e) => {
        if (gesture.current.accepts(e.pointerId, e.pointerType, 'cancel')) cancelGesture();
      }}
      onLostPointerCapture={(e) => { if (gesture.current.accepts(e.pointerId, e.pointerType, 'cancel')) cancelGesture(); }}
      onContextMenu={(e) => e.preventDefault()}
    />
  );
}
