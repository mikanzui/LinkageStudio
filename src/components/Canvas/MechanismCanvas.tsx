import { useRef, useEffect, useCallback, useState, useLayoutEffect, useMemo } from 'react';
import { useMechanismStore } from '../../store/mechanism-store';
import { useEditorStore } from '../../store/editor-store';
import { useSimulationStore } from '../../store/simulation-store';
import { render } from '../../renderer/canvas-renderer';
import { screenToWorld } from '../../renderer/camera';
import {
  handleMouseDown, handleMouseMove, handleMouseUp, handleDoubleClick, handleWheel, handleKeyDown, handleKeyUp,
} from '../../interaction/tool-manager';
import {
  hitTestAny,
  hitTestJoint,
  hitTestOutlineFilled,
  hitTestLink,
  hitTestSpring,
  bodyHasJointsInsideOutline,
} from '../../interaction/hit-test';
import { hitTestImage, hitTestRotateHandle, hitTestScaleHandle } from '../../renderer/draw-images';
import { computeBodyTransform, localToWorld } from '../../core/body-transform';
import type { Vec2 } from '../../types';
import { distance, distToSegment, segmentClampedT } from '../../core/math/vec2';
import { HIT_RADIUS } from '../../utils/constants';
import { getDofHudHelpTooltipRect } from '../../renderer/draw-overlays';
import { DOF_TOOLTIP } from '../../core/solver/dof';

// --- Touch gesture state (module-level, survives re-renders) ---
const activePointers: Map<number, Vec2> = new Map();
// none     = idle
// pending  = finger down on empty space, waiting to see if tap or pan
// interact = finger down on a component, forwarding to tool-manager (drag joint, sim drag, etc.)
// pan      = single finger dragging on empty space
// pinch    = two finger zoom + pan
let gestureState: 'none' | 'pending' | 'interact' | 'pan' | 'pinch' = 'none';
let lastPinchDist: number | null = null;
let lastPinchCenter: Vec2 | null = null;
let touchStartPos: Vec2 | null = null; // where the first finger landed
let touchStartPointerId: number | null = null;
let lastTouchScreen: Vec2 | null = null; // last position for single-finger pan

const PAN_THRESHOLD = 8; // px movement before a touch becomes a pan drag


export function MechanismCanvas() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const cursorWorldRef = useRef<Vec2 | null>(null);
  const rafRef = useRef<number>(0);
  const dof = useSimulationStore((s) => s.dof);
  const [canvasSize, setCanvasSize] = useState({ w: 0, h: 0 });
  const [showDofHelp, setShowDofHelp] = useState(false);

  useLayoutEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const update = () => {
      const r = el.getBoundingClientRect();
      setCanvasSize({ w: Math.round(r.width), h: Math.round(r.height) });
    };
    update();
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const dofHelpRect = useMemo(
    () => getDofHudHelpTooltipRect(canvasSize.w, canvasSize.h, dof),
    [canvasSize.w, canvasSize.h, dof],
  );

  useEffect(() => {
    if (dof >= 0) setShowDofHelp(false);
  }, [dof]);

  const renderLoop = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // Resize canvas to fill container
    const rect = canvas.parentElement!.getBoundingClientRect();
    if (canvas.width !== rect.width || canvas.height !== rect.height) {
      canvas.width = rect.width;
      canvas.height = rect.height;
    }

    const mechanism = useMechanismStore.getState();
    const editor = useEditorStore.getState();
    const sim = useSimulationStore.getState();

    try {
      render(ctx, canvas, {
        joints: mechanism.joints,
        links: mechanism.links,
        bodies: mechanism.bodies,
        outlines: mechanism.outlines,
        images: mechanism.images,
        sliders: mechanism.sliders,
        colliders: mechanism.colliders,
        tracers: mechanism.tracers,
        springs: mechanism.springs,
        tracerPaths: sim.tracerPaths || new Map(),
        selectedIds: editor.selectedIds,
        hoveredId: editor.hoveredId,
        camera: editor.camera,
        gridEnabled: editor.gridEnabled,
        gridSize: editor.gridSize,
        gridLevel: editor.gridLevel,
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
        shapeStartPoint: editor.shapeStartPoint,
        ngonSides: editor.ngonSides,
        editingOutlineId: editor.editingOutlineId,
        editingVertexIndex: editor.editingVertexIndex,
        arcSelector: editor.arcSelector ? { jointId: editor.arcSelector.jointId, colliderId: editor.arcSelector.colliderId, tracerId: editor.arcSelector.tracerId, position: editor.arcSelector.position, showTime: editor.arcSelector.showTime, collapseTime: editor.arcSelector.collapseTime, createdBodyId: editor.arcSelector.createdBodyId } : null,
        mirrorPreview: editor.mirrorPreview,
        selectionGesture: editor.selectionGesture,
        springPickPendingAnchor:
          editor.mode === 'create' && (editor.createTool === 'spring' || editor.createTool === 'damper')
            ? editor.springPickPendingAnchor
            : null,
        torsionSpringPick:
          editor.mode === 'create' && editor.createTool === 'torsionSpring'
            ? editor.torsionSpringPick
            : null,
        showLoads: editor.showLoads,
        forceAnalysis: sim.solverResult?.forceAnalysis ?? null,
        forceSensors: mechanism.forceSensors,
        forceSensorData: sim.forceSensorData,
      });
    } catch (e) {
      console.error('Render error:', e);
    }

    rafRef.current = requestAnimationFrame(renderLoop);
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
    const onKeyDown = (e: KeyboardEvent) => handleKeyDown(e);
    const onKeyUp = (e: KeyboardEvent) => handleKeyUp(e);
    const onWindowBlur = () => useEditorStore.getState().setSpacePanHeld(false);
    // Capture so Space is handled before focused buttons (otherwise Space toggles controls and keyup can be lost).
    const useCapture = true;
    window.addEventListener('keydown', onKeyDown, useCapture);
    window.addEventListener('keyup', onKeyUp, useCapture);
    window.addEventListener('blur', onWindowBlur);
    return () => {
      window.removeEventListener('keydown', onKeyDown, useCapture);
      window.removeEventListener('keyup', onKeyUp, useCapture);
      window.removeEventListener('blur', onWindowBlur);
    };
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
    const onWheel = (e: WheelEvent) => handleWheel(e, canvas);
    canvas.addEventListener('wheel', onWheel, { passive: false });
    return () => {
      canvas.removeEventListener('gesturestart', preventGesture);
      canvas.removeEventListener('gesturechange', preventGesture);
      canvas.removeEventListener('gestureend', preventGesture);
      canvas.removeEventListener('wheel', onWheel);
    };
  }, []);

  const mode = useEditorStore((s) => s.mode);
  const activeTool = useEditorStore((s) => s.activeTool);
  const spacePanHeld = useEditorStore((s) => s.spacePanHeld);
  const simDrag = useEditorStore((s) => s.simDrag);
  const hoveredId = useEditorStore((s) => s.hoveredId);

  // Custom dark crosshair cursor (SVG data URI) — the built-in CSS 'crosshair'
  // renders white/invisible on some OS/browser combinations.
  const CROSSHAIR_CURSOR = `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='24' height='24'%3E%3Cline x1='12' y1='2' x2='12' y2='22' stroke='%23333' stroke-width='1.5'/%3E%3Cline x1='2' y1='12' x2='22' y2='12' stroke='%23333' stroke-width='1.5'/%3E%3Ccircle cx='12' cy='12' r='3' fill='none' stroke='%23333' stroke-width='1'/%3E%3C/svg%3E") 12 12, crosshair`;

  const cursor =
    mode === 'simulate' && simDrag?.active
      ? 'grabbing'
      : activeTool === 'pan' || spacePanHeld
        ? 'grab'
        : mode === 'simulate'
          ? 'grab'
          : hoveredId
            ? 'pointer'
            : CROSSHAIR_CURSOR;

  const handlePinchMove = useCallback(() => {
    if (activePointers.size < 2) return;
    const pts = Array.from(activePointers.values());
    const dx = pts[1].x - pts[0].x;
    const dy = pts[1].y - pts[0].y;
    const dist = Math.sqrt(dx * dx + dy * dy);
    const center: Vec2 = {
      x: (pts[0].x + pts[1].x) / 2,
      y: (pts[0].y + pts[1].y) / 2,
    };
    const canvas = canvasRef.current!;
    const rect = canvas.getBoundingClientRect();
    const screenCenter: Vec2 = { x: center.x - rect.left, y: center.y - rect.top };

    if (lastPinchDist !== null && lastPinchCenter !== null) {
      const factor = dist / lastPinchDist;
      useEditorStore.getState().zoomCamera(factor, screenCenter);
      const panDx = center.x - lastPinchCenter.x;
      const panDy = center.y - lastPinchCenter.y;
      useEditorStore.getState().panCamera({ x: panDx, y: panDy });
    }
    lastPinchDist = dist;
    lastPinchCenter = center;
  }, []);

  // Reset all touch gesture state
  const resetGesture = useCallback(() => {
    gestureState = 'none';
    lastPinchDist = null;
    lastPinchCenter = null;
    touchStartPos = null;
    touchStartPointerId = null;
    lastTouchScreen = null;
  }, []);

  return (
    <div ref={containerRef} style={{ position: 'relative', width: '100%', height: '100%' }}>
    <canvas
      id="linkage-canvas"
      ref={canvasRef}
      style={{ width: '100%', height: '100%', cursor, userSelect: 'none', touchAction: 'none' }}
      onPointerDown={(e) => {
        const canvas = canvasRef.current!;

        // --- MOUSE: pass through directly (no gesture detection needed) ---
        if (e.pointerType === 'mouse') {
          handleMouseDown(e.nativeEvent as PointerEvent, canvas);
          return;
        }

        // --- PEN (Apple Pencil): pass through directly, like mouse ---
        // Pen has precise intent and can't pinch, so no gesture detection needed.
        if (e.pointerType === 'pen') {
          e.preventDefault();
          canvas.setPointerCapture(e.pointerId);
          gestureState = 'interact';
          touchStartPointerId = e.pointerId;
          // Update cursor world pos for outline ghost/preview
          const rect = canvas.getBoundingClientRect();
          const screen = { x: e.clientX - rect.left, y: e.clientY - rect.top };
          cursorWorldRef.current = screenToWorld(screen, useEditorStore.getState().camera);
          handleMouseDown(e.nativeEvent as PointerEvent, canvas);
          return;
        }

        // --- TOUCH (finger) ---
        e.preventDefault();
        canvas.setPointerCapture(e.pointerId);
        activePointers.set(e.pointerId, { x: e.clientX, y: e.clientY });

        if (activePointers.size >= 2) {
          // Transition to pinch: cancel any in-progress single-pointer interaction
          if (gestureState === 'interact') {
            handleMouseUp(e.nativeEvent as PointerEvent, canvasRef.current!);
          }
          gestureState = 'pinch';
          lastPinchDist = null;
          lastPinchCenter = null;
          return;
        }

        // First finger down — hit-test to decide: interact with component or pan/tap empty space
        const rect = canvas.getBoundingClientRect();
        const screenPos: Vec2 = { x: e.clientX - rect.left, y: e.clientY - rect.top };
        const editor = useEditorStore.getState();
        const mechanism = useMechanismStore.getState();
        const worldPos = screenToWorld(screenPos, editor.camera);

        // Check if touching a joint, link, filled outline (simulate only, gated), or image (including handles).
        // Use hitTestAny (non-mutating) so the authoritative hitTest in handleMouseDown
        // gets a clean state for click-cycling overlapping joints.
        let componentHit = hitTestAny(worldPos, mechanism.joints, mechanism.links, editor.camera.zoom);
        if (editor.mode === 'simulate') {
          const outlineFill = hitTestOutlineFilled(
            worldPos,
            mechanism.outlines,
            mechanism.bodies,
            mechanism.joints,
            mechanism.baseBodyId,
          );
          if (outlineFill) {
            const b = mechanism.bodies[outlineFill.bodyId];
            const allowFill =
              editor.outlineSimGrabInteriorWithJoints ||
              !b ||
              !bodyHasJointsInsideOutline(outlineFill, b, mechanism.joints);
            if (allowFill) componentHit = true;
          }
        } else {
          componentHit =
            componentHit ||
            !!hitTestOutlineFilled(
              worldPos,
              mechanism.outlines,
              mechanism.bodies,
              mechanism.joints,
              mechanism.baseBodyId,
            );
        }

        // Also check images and their handles
        if (
          !componentHit &&
          (editor.createTool === 'spring' ||
            editor.createTool === 'damper' ||
            editor.createTool === 'torsionSpring')
        ) {
          componentHit = !!(
            hitTestJoint(worldPos, mechanism.joints, editor.camera.zoom)
            || hitTestLink(worldPos, mechanism.links, mechanism.joints, editor.camera.zoom)
            || hitTestSpring(worldPos, mechanism.springs, mechanism.joints, mechanism.links, editor.camera.zoom)
          );
        }

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

        if (componentHit) {
          // Finger landed on a component → forward to tool-manager immediately for drag interaction
          gestureState = 'interact';
          touchStartPointerId = e.pointerId;
          handleMouseDown(e.nativeEvent as PointerEvent, canvas);
        } else if (
          editor.mode === 'create' &&
          (editor.createTool === 'joints' ||
            editor.createTool === 'spring' ||
            editor.createTool === 'damper' ||
            editor.createTool === 'torsionSpring') &&
          editor.activeTool === 'select' &&
          editor.selectMode !== 'single'
        ) {
          // Empty canvas + box/lasso: start marquee immediately (same as mouse)
          gestureState = 'interact';
          touchStartPointerId = e.pointerId;
          handleMouseDown(e.nativeEvent as PointerEvent, canvas);
        } else {
          // Finger landed on empty space → wait to distinguish tap from pan
          gestureState = 'pending';
          touchStartPos = { x: e.clientX, y: e.clientY };
          touchStartPointerId = e.pointerId;
          lastTouchScreen = { x: e.clientX, y: e.clientY };
        }
      }}
      onDoubleClick={(e) => {
        if (gestureState !== 'pinch') {
          handleDoubleClick(e.nativeEvent, canvasRef.current!);
        }
      }}
      onPointerMove={(e) => {
        const canvas = canvasRef.current!;

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
        activePointers.set(e.pointerId, { x: e.clientX, y: e.clientY });

        // Pinch mode: zoom + pan with two fingers
        if (gestureState === 'pinch') {
          if (activePointers.size >= 2) {
            handlePinchMove();
          }
          return;
        }

        // Interact: forward moves to tool-manager (dragging a joint, sim drag, etc.)
        if (gestureState === 'interact') {
          const rect = canvas.getBoundingClientRect();
          const screen = { x: e.clientX - rect.left, y: e.clientY - rect.top };
          cursorWorldRef.current = screenToWorld(screen, useEditorStore.getState().camera);
          handleMouseMove(e.nativeEvent as PointerEvent, canvas);
          return;
        }

        // Pending: check if finger moved enough to become a pan
        if (gestureState === 'pending' && touchStartPos) {
          const dx = e.clientX - touchStartPos.x;
          const dy = e.clientY - touchStartPos.y;
          if (dx * dx + dy * dy > PAN_THRESHOLD * PAN_THRESHOLD) {
            gestureState = 'pan';
            lastTouchScreen = { x: e.clientX, y: e.clientY };
          }
          return; // Don't do anything else while pending
        }

        // Single-finger pan
        if (gestureState === 'pan' && lastTouchScreen) {
          const dx = e.clientX - lastTouchScreen.x;
          const dy = e.clientY - lastTouchScreen.y;
          useEditorStore.getState().panCamera({ x: dx, y: dy });
          lastTouchScreen = { x: e.clientX, y: e.clientY };
          return;
        }
      }}
      onPointerUp={(e) => {
        const canvas = canvasRef.current!;

        // --- MOUSE: pass through directly ---
        if (e.pointerType === 'mouse') {
          handleMouseUp(e.nativeEvent as PointerEvent, canvasRef.current!);
          return;
        }

        // --- PEN: pass through directly (like mouse) ---
        if (e.pointerType === 'pen') {
          try { canvas.releasePointerCapture(e.pointerId); } catch (_) { /* already released */ }
          handleMouseUp(e.nativeEvent as PointerEvent, canvasRef.current!);
          resetGesture();
          return;
        }

        // --- TOUCH (finger) ---
        try { canvas.releasePointerCapture(e.pointerId); } catch (_) { /* already released */ }
        activePointers.delete(e.pointerId);

        if (gestureState === 'pinch') {
          // Still have 2+ fingers? Stay in pinch. Otherwise wait for all fingers to lift.
          if (activePointers.size >= 2) {
            // Reset pinch baseline for remaining fingers
            lastPinchDist = null;
            lastPinchCenter = null;
          } else if (activePointers.size === 0) {
            resetGesture();
          }
          // Don't fire any interaction when coming out of pinch
          return;
        }

        // Interact: finger lifted off a component drag → forward mouseUp to tool-manager
        if (gestureState === 'interact' && e.pointerId === touchStartPointerId) {
          handleMouseUp(e.nativeEvent as PointerEvent, canvasRef.current!);
          resetGesture();
          activePointers.clear();
          return;
        }

        if (gestureState === 'pending' && touchStartPos && e.pointerId === touchStartPointerId) {
          // Finger lifted without significant movement → TAP
          // Update cursor world position so outline ghost draws correctly
          const rect = canvas.getBoundingClientRect();
          const screen = { x: e.clientX - rect.left, y: e.clientY - rect.top };
          cursorWorldRef.current = screenToWorld(screen, useEditorStore.getState().camera);
          // Fire down + up at the touch position to trigger the action (place joint, select, etc.)
          handleMouseDown(e.nativeEvent as PointerEvent, canvas);
          handleMouseUp(e.nativeEvent as PointerEvent, canvasRef.current!);
          resetGesture();
          activePointers.clear();
          return;
        }

        // End of pan or other gesture
        if (activePointers.size === 0) {
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
        const canvas = canvasRef.current!;
        try { canvas.releasePointerCapture(e.pointerId); } catch (_) { /* already released */ }
        activePointers.delete(e.pointerId);

        if (activePointers.size === 0) {
          if (gestureState === 'interact') {
            handleMouseUp(e.nativeEvent as PointerEvent, canvasRef.current!);
          }
          resetGesture();
          activePointers.clear();
        }
      }}
      /* wheel handler registered via useEffect with { passive: false } */
      onContextMenu={(e) => {
        e.preventDefault();
        const canvas = canvasRef.current!;
        const editor = useEditorStore.getState();
        const mechanism = useMechanismStore.getState();

        if (editor.mode !== 'create') {
          editor.setWorldContextMenu(null);
          return;
        }

        const rect = canvas.getBoundingClientRect();
        const screenPos: Vec2 = { x: e.clientX - rect.left, y: e.clientY - rect.top };
        const worldPos = screenToWorld(screenPos, editor.camera);
        const joint = hitTestJoint(worldPos, mechanism.joints, editor.camera.zoom);
        if (joint) {
          editor.select(joint.id);
          editor.setWorldContextMenu({
            targetType: 'joint',
            targetId: joint.id,
            screenPosition: screenPos,
            openMode: 'context',
          });
          return;
        }

        // Collider barrier before link: A–C uses a rigid link; link hit-test would steal the segment.
        const colliderThreshold = HIT_RADIUS / editor.camera.zoom;
        let bestCollider: { id: string; d: number } | null = null;
        for (const collider of Object.values(mechanism.colliders)) {
          const jA = mechanism.joints[collider.jointIdA];
          const jC = mechanism.joints[collider.jointIdC];
          if (!jA || !jC) continue;
          const d = distToSegment(worldPos, jA.position, jC.position);
          if (d < colliderThreshold && (!bestCollider || d < bestCollider.d)) {
            bestCollider = { id: collider.id, d };
          }
        }
        if (bestCollider) {
          editor.select(bestCollider.id);
          editor.setWorldContextMenu({
            targetType: 'collider',
            targetId: bestCollider.id,
            screenPosition: screenPos,
            openMode: 'context',
          });
          return;
        }

        const linkHit = hitTestLink(worldPos, mechanism.links, mechanism.joints, editor.camera.zoom);
        if (linkHit) {
          const jA = mechanism.joints[linkHit.jointIds[0]];
          const jB = mechanism.joints[linkHit.jointIds[1]];
          if (jA && jB) {
            const t = segmentClampedT(worldPos, jA.position, jB.position);
            editor.select(linkHit.id);
            editor.setWorldContextMenu({
              targetType: 'link',
              targetId: linkHit.id,
              linkClickT: t,
              screenPosition: screenPos,
              openMode: 'context',
            });
            return;
          }
        }

        // Tracer hit
        const tracerHitRadius = HIT_RADIUS / editor.camera.zoom;
        for (const tracer of Object.values(mechanism.tracers)) {
          const body = mechanism.bodies[tracer.bodyId];
          if (!body) continue;
          const transform = computeBodyTransform(body, mechanism.joints);
          const worldPt = localToWorld(tracer.localPosition, transform);
          if (distance(worldPos, worldPt) < tracerHitRadius) {
            editor.select(tracer.id);
            editor.setWorldContextMenu({
              targetType: 'tracer',
              targetId: tracer.id,
              screenPosition: screenPos,
              openMode: 'context',
            });
            return;
          }
        }

        editor.setWorldContextMenu(null);
      }}
    />
    {dofHelpRect && (
      <div
        aria-label="Degrees of freedom help"
        onMouseEnter={() => setShowDofHelp(true)}
        onMouseLeave={() => setShowDofHelp(false)}
        style={{
          position: 'absolute',
          left: dofHelpRect.left,
          top: dofHelpRect.top,
          width: dofHelpRect.width,
          height: dofHelpRect.height,
          cursor: 'help',
        }}
      />
    )}
    {dofHelpRect && showDofHelp && (
      <div
        style={{
          position: 'absolute',
          left: dofHelpRect.left + dofHelpRect.width / 2,
          top: dofHelpRect.top - 8,
          transform: 'translate(-50%, -100%)',
          pointerEvents: 'none',
          background: 'rgba(20,20,20,0.96)',
          color: '#fff',
          border: '1px solid #666',
          borderRadius: 6,
          padding: '6px 8px',
          maxWidth: 340,
          fontSize: 11,
          lineHeight: 1.35,
          boxShadow: '0 4px 12px rgba(0,0,0,0.35)',
          zIndex: 10,
          whiteSpace: 'normal',
        }}
      >
        {DOF_TOOLTIP}
      </div>
    )}
    </div>
  );
}
