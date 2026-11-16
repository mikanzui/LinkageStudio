import type { Vec2 } from '../types';
import { useEditorStore } from '../store/editor-store';
import { useMechanismStore } from '../store/mechanism-store';
import { hitTest, hitTestJoint, hitTestLink, hitTestOutline, hitTestOutlineFilled, hitTestSensor, hitTestTracer } from './hit-test';
import { hitTestImage, hitTestRotateHandle, hitTestScaleHandle } from '../renderer/draw-images';
import { screenToWorld } from '../renderer/camera';
import { snapToGrid, distance, sub, dot, lengthSq } from '../core/math/vec2';
import { computeBodyTransform, worldToLocal, localToWorld } from '../core/body-transform';
import { HIT_RADIUS } from '../utils/constants';
import { selectInRegion } from './selection-marquee';
import type { SelectionGesture } from '../types/editor';
import { deleteSelectedEntities } from '../utils/delete-selection';
import { beginGeometry, moveGeometry, finishGeometry, commitOutline } from './geometry-tools';
import { placeSpring } from './spring-tools';
import { hitTestSpring } from '../core/spring-geometry';
import { setProjectMessage } from '../document/project';
import { arcTarget, chooseRadialBody, currentRadialLayout, openRadialMenu, radialAction, targetForId, targetExists, radialAnchor, radialUsesToggle } from './radial-menu';
import { radialHit } from './radial-layout';

/** Start the long-press arc selector timer for a given joint. No-op for touch input. */
function startArcTimer(jointId: string, screenX: number, screenY: number) {
  if (lastPointerType === 'touch') return; // Touch uses tap-on-release, not hold
  longPressStartScreen = { x: screenX, y: screenY };
  longPressJointId = jointId;
  if (longPressTimer) clearTimeout(longPressTimer);
  longPressTimer = setTimeout(() => {
    if (longPressJointId) {
      const j = useMechanismStore.getState().joints[longPressJointId];
      if (j && !j.hidden) {
        useEditorStore.getState().setArcSelector({
          jointId: longPressJointId,
          colliderId: null, tracerId: null,
          position: { ...j.position },
          showTime: Date.now(),
          collapseTime: null,
          readyToToggle: new Set([...Object.keys(useMechanismStore.getState().bodies), '__add_body__']), createdBodyId: null, lastToggleTime: 0, lastToggle: null,
        });
        isDragging = false;
        dragJointId = null;
      }
    }
    longPressTimer = null;
  }, LONG_PRESS_MS);
}

/** Start the long-press arc selector timer for a collider barrier line. No-op for touch. */
function startColliderArcTimer(colliderId: string, worldPos: Vec2, screenX: number, screenY: number) {
  if (lastPointerType === 'touch') return;
  longPressStartScreen = { x: screenX, y: screenY };
  longPressJointId = colliderId; // reuse for cancel tracking
  if (longPressTimer) clearTimeout(longPressTimer);
  longPressTimer = setTimeout(() => {
    const mech = useMechanismStore.getState();
    const collider = mech.colliders[colliderId];
    if (collider) {
      useEditorStore.getState().setArcSelector({
        jointId: null,
        colliderId,
        tracerId: null,
        position: { ...worldPos },
        showTime: Date.now(),
        collapseTime: null,
        readyToToggle: new Set([...Object.keys(mech.bodies), '__add_body__']), createdBodyId: null, lastToggleTime: 0, lastToggle: null,
      });
    }
    longPressTimer = null;
  }, LONG_PRESS_MS);
}

/** Start the long-press arc selector timer for a tracer (single-select body mode). No-op for touch. */
function startTracerArcTimer(tracerId: string, screenX: number, screenY: number) {
  if (lastPointerType === 'touch') return;
  longPressStartScreen = { x: screenX, y: screenY };
  longPressJointId = tracerId;
  if (longPressTimer) clearTimeout(longPressTimer);
  longPressTimer = setTimeout(() => {
    const mech = useMechanismStore.getState();
    const tracer = mech.tracers[tracerId];
    if (tracer) {
      const body = mech.bodies[tracer.bodyId];
      if (body) {
        const transform = computeBodyTransform(body, mech.joints);
        const worldPt = localToWorld(tracer.localPosition, transform);
        useEditorStore.getState().setArcSelector({
          jointId: null,
          colliderId: null,
          tracerId,
          position: { ...worldPt },
          showTime: Date.now(),
          collapseTime: null,
          readyToToggle: new Set([...Object.keys(mech.bodies), '__add_body__']), createdBodyId: null, lastToggleTime: 0, lastToggle: null,
        });
      }
    }
    longPressTimer = null;
  }, LONG_PRESS_MS);
}

/** Extra object holds use the same timer/cancellation ownership as pivot holds. */
export function startObjectHold(e: PointerEvent | MouseEvent, canvas: HTMLCanvasElement) {
  const editor = useEditorStore.getState();
  if (editor.mode !== 'create' || e.button !== 0 || lastPointerType === 'touch' || editor.selectedIds.size !== 1) return;
  if (editor.activeTool === 'pan' || (editor.activeTool === 'select' && editor.selectMode !== 'single')
    || (editor.activeTool === 'joint' && !['joints', 'image', 'tracer'].includes(editor.createTool))) return;
  const target = [...editor.selectedIds].map(targetForId).find(t => t !== null);
  if (!target) return;
  const rect = canvas.getBoundingClientRect();
  longPressStartScreen = { x: e.clientX, y: e.clientY };
  if (longPressTimer) clearTimeout(longPressTimer);
  longPressTimer = setTimeout(() => {
    if (targetExists(target) && useEditorStore.getState().mode === 'create') {
      openRadialMenu(target, target.kind === 'joint' || target.kind === 'tracer' ? radialAnchor(target)
        : screenToWorld({ x: e.clientX - rect.left, y: e.clientY - rect.top }, editor.camera), 'hold');
      isDragging = false; dragJointId = null;
    }
    longPressTimer = null;
  }, LONG_PRESS_MS);
}

function handleArcHover(worldPos: Vec2, editor: ReturnType<typeof useEditorStore.getState>, canvas: HTMLCanvasElement) {
  const arc = editor.arcSelector;
  if (!arc || arc.openMode === 'context') return;
  const rect = canvas.getBoundingClientRect(), target = arcTarget(arc);
  const layout = currentRadialLayout(rect.width, rect.height, typeof matchMedia === 'function' && matchMedia('(pointer: coarse)').matches);
  const key = radialHit(layout, { x: worldPos.x * editor.camera.zoom + editor.camera.pan.x, y: worldPos.y * editor.camera.zoom + editor.camera.pan.y });
  if (!key?.startsWith('body:') || (radialUsesToggle(target) && !arc.readyToToggle.has(key.slice(5)))) return;
  chooseRadialBody(target, key.slice(5));
  if (!radialUsesToggle(target)) return;
  const readyToToggle = new Set(arc.readyToToggle); readyToToggle.delete(key.slice(5));
  useEditorStore.getState().setArcSelector({ ...arc, readyToToggle });
}

/** Exit outline editing mode and update frozen world points. */
export function exitOutlineEditMode() {
  const editor = useEditorStore.getState();
  const mechanism = useMechanismStore.getState();
  const outlineId = editor.editingOutlineId;
  if (outlineId) {
    const outline = mechanism.outlines[outlineId];
    if (outline) {
      const body = mechanism.bodies[outline.bodyId];
      if (body) {
        const transform = computeBodyTransform(body, mechanism.joints);
        const worldPts = outline.points.map((p) => localToWorld(p, transform));
        editor.updateFrozenOutline(outlineId, worldPts);
      }
    }
  }
  editor.setEditingOutline(null);
}

function isFixed(jointId: string): boolean {
  const { bodies, baseBodyId } = useMechanismStore.getState();
  return bodies[baseBodyId]?.jointIds.includes(jointId) ?? false;
}

let isDragging = false;
let dragJointId: string | null = null;
let isPanning = false;
let marquee: { region: SelectionGesture; initial: Set<string>; additive: boolean } | null = null;
let lastMouse: Vec2 = { x: 0, y: 0 };

// Slider line drag state
let sliderLineDragId: string | null = null;
let sliderLineDragStart: Vec2 = { x: 0, y: 0 };
let sliderLineDragStartPositions: { a: Vec2; b: Vec2; c: Vec2 } | null = null;

// Outline vertex drag state
let outlineVertexDragIndex: number | null = null;
let outlineVertexDragOutlineId: string | null = null;

// Image drag state
let imageDragId: string | null = null;
let imageDragType: 'move' | 'rotate' | 'scale' | null = null;
let imageDragStart: Vec2 = { x: 0, y: 0 };
let imageStartRotation = 0;
let imageStartScale = 1;

// Tracer drag state
let tracerDragId: string | null = null;
let longPressPendingTracerId: string | null = null;

// Track pointer type to disable arc timer for touch
let lastPointerType: string = 'mouse';

// Long-press arc selector state
let longPressTimer: ReturnType<typeof setTimeout> | null = null;
let longPressJointId: string | null = null;
let longPressStartScreen: Vec2 | null = null;
const LONG_PRESS_MS = 300;
const LONG_PRESS_MOVE_THRESHOLD_BASE = 8; // px screen movement to cancel (minimum)
let imageStartPos: Vec2 = { x: 0, y: 0 };

export function handleMouseDown(e: PointerEvent | MouseEvent, canvas: HTMLCanvasElement) {
  lastPointerType = 'pointerType' in e ? e.pointerType : 'mouse';
  const editor = useEditorStore.getState();
  const mechanism = useMechanismStore.getState();
  const rect = canvas.getBoundingClientRect();
  const screenPos: Vec2 = { x: e.clientX - rect.left, y: e.clientY - rect.top };
  const worldPos = screenToWorld(screenPos, editor.camera);
  lastMouse = screenPos;

  // Middle mouse → pan (always)
  if (e.button === 1) {
    isPanning = true;
    e.preventDefault();
    return;
  }

  // --- SIMULATE MODE ---
  if (editor.activeTool === 'pan') {
    isPanning = true;
    return;
  }
  if (editor.mode === 'simulate') {
    if (e.button !== 0) return;

    const hit = hitTest(worldPos, mechanism.joints, mechanism.links, editor.camera.zoom, true);
    if (hit) {
      if (hit.type === 'joint') {
        const joint = hit.item;
        if (isFixed(joint.id)) return;
        // Find a link connected to this joint
        const linkId = joint.connectedLinkIds[0] || null;
        let grabT = 0;
        if (linkId) {
          const link = mechanism.links[linkId];
          if (link) grabT = link.jointIds[0] === joint.id ? 0 : 1;
        }
        editor.setSimDrag({
          active: true,
          grabPoint: joint.position,
          cursorPoint: worldPos,
          jointId: joint.id,
          linkId,
          grabT,
        });
      } else {
        // Link hit: compute parametric t along the link
        const link = hit.item;
        const jA = mechanism.joints[link.jointIds[0]];
        const jB = mechanism.joints[link.jointIds[1]];
        if (!jA || !jB) return;
        // Both endpoints fixed = can't drag
        if (isFixed(jA.id) && isFixed(jB.id)) return;

        // Compute parametric t: project worldPos onto segment AB
        const ab = sub(jB.position, jA.position);
        const ap = sub(worldPos, jA.position);
        const abLenSq = lengthSq(ab);
        const t = abLenSq > 1e-8 ? Math.max(0, Math.min(1, dot(ap, ab) / abLenSq)) : 0.5;

        // Pick the closer non-fixed joint for the jointId reference
        let jointId: string;
        if (isFixed(jA.id)) jointId = jB.id;
        else if (isFixed(jB.id)) jointId = jA.id;
        else jointId = t <= 0.5 ? jA.id : jB.id;

        editor.setSimDrag({
          active: true,
          grabPoint: worldPos,
          cursorPoint: worldPos,
          jointId,
          linkId: link.id,
          grabT: t,
        });
      }
      return;
    }

    // Outline (shape) hit: create a temp joint for force transfer
    const outlineHit = hitTestOutlineFilled(
      worldPos, mechanism.outlines, mechanism.bodies, mechanism.joints, mechanism.baseBodyId,
    );
    if (outlineHit) {
      const body = mechanism.bodies[outlineHit.bodyId];
      if (body) {
        const hasFreeJoint = body.jointIds.some((jid) => !isFixed(jid));
        if (!hasFreeJoint) return;

        // Create a temp joint linked to 2 nearest body joints (doesn't change body structure)
        const tempId = mechanism.addTempJoint(worldPos, body.id);

        const mech2 = useMechanismStore.getState();
        const tempJoint = mech2.joints[tempId];
        if (!tempJoint) return;

        // Find a temp link connected to the temp joint
        const linkId = tempJoint.connectedLinkIds[0] || null;
        let grabT = 0;
        if (linkId) {
          const link = mech2.links[linkId];
          if (link) grabT = link.jointIds[0] === tempId ? 0 : 1;
        }

        editor.setSimDrag({
          active: true,
          grabPoint: worldPos,
          cursorPoint: worldPos,
          jointId: tempId,
          linkId,
          grabT,
          tempJointId: tempId,
        });
      }
    }
    return;
  }

  // --- CREATE MODE ---
  if (e.button !== 0) return;
  if (editor.activeTool === 'joint' && editor.createTool === 'force-sensor') {
    const link = hitTestLink(worldPos, mechanism.links, mechanism.joints, editor.camera.zoom);
    if (link) { editor.select(mechanism.addForceSensor(link.id)); useEditorStore.setState({ placementCommitted: true }); }
    return;
  }
  if (editor.activeTool === 'joint' && placeSpring(worldPos)) return;

  if (editor.activeTool === 'select') {
    if (editor.selectMode !== 'single') {
      const region: SelectionGesture = editor.selectMode === 'box' ? { kind: 'box', start: worldPos, end: worldPos } : { kind: 'lasso', points: [worldPos] };
      marquee = { region, initial: new Set(editor.selectedIds), additive: e.shiftKey };
      useEditorStore.setState({ selectionGesture: region });
      return;
    }
    const sensorId = hitTestSensor(worldPos, mechanism.forceSensors, mechanism.links, mechanism.joints, editor.camera.zoom);
    const tracerId = hitTestTracer(worldPos, mechanism.tracers, mechanism.bodies, mechanism.joints, editor.camera.zoom);
    if (!hitTestJoint(worldPos, mechanism.joints, editor.camera.zoom) && (sensorId || tracerId)) {
      editor.select(sensorId || tracerId!);
      if (tracerId && !sensorId) { tracerDragId = tracerId; mechanism.pushHistory(); }
      return;
    }
    const hit = hitTest(worldPos, mechanism.joints, mechanism.links, editor.camera.zoom, true);
    if (hit) {
      if (e.shiftKey) editor.toggleSelect(hit.item.id);
      else editor.select(hit.item.id);
      if (hit.type === 'joint') {
        isDragging = true;
        dragJointId = hit.item.id;
        mechanism.pushHistory();
      }
      return;
    }
    const spring = hitTestSpring(worldPos, mechanism.springs, mechanism.joints, mechanism.links, editor.camera.zoom);
    if (spring) { editor.select(spring); return; }
    const outline = hitTestOutline(worldPos, mechanism.outlines, mechanism.bodies, mechanism.joints, editor.camera.zoom);
    if (outline) { editor.select(outline.id); return; }
    for (const image of Object.values(mechanism.images).reverse()) {
      if (hitTestImage(worldPos, image)) { editor.select(image.id); return; }
    }
    editor.clearSelection();
    return;
  }

  if (beginGeometry(worldPos,e.shiftKey)) return;

  // --- IMAGE TOOL ---
  if (editor.createTool === 'image') {
    // Check if clicking on already-selected image handles
    const selectedImageId = [...editor.selectedIds].find((id) => mechanism.images[id]);
    if (selectedImageId) {
      const img = mechanism.images[selectedImageId];
      if (img) {
        // Check rotate handle first
        if (hitTestRotateHandle(worldPos, img, editor.camera.zoom)) {
          imageDragId = selectedImageId;
          imageDragType = 'rotate';
          imageDragStart = worldPos;
          imageStartRotation = img.rotation;
          mechanism.pushHistory();
          return;
        }
        // Check scale handles (corners)
        if (hitTestScaleHandle(worldPos, img, editor.camera.zoom)) {
          imageDragId = selectedImageId;
          imageDragType = 'scale';
          imageDragStart = worldPos;
          imageStartScale = img.scale;
          imageStartPos = img.position;
          mechanism.pushHistory();
          return;
        }
      }
    }
    // Check if clicking on any image
    const allImages = Object.values(mechanism.images);
    // Reverse so topmost (last drawn) is checked first
    for (let i = allImages.length - 1; i >= 0; i--) {
      const img = allImages[i];
      if (hitTestImage(worldPos, img)) {
        editor.select(img.id);
        imageDragId = img.id;
        imageDragType = 'move';
        imageDragStart = worldPos;
        imageStartPos = img.position;
        mechanism.pushHistory();
        return;
      }
    }
    // Clicked empty space - deselect
    if (editor.selectedIds.size > 0) {
      editor.clearSelection();
    }
    return;
  }

  // --- SLIDER TOOL ---
  if (editor.createTool === 'slider') {
    // Check for existing joint hit first (select it)
    const existingJoint = hitTestJoint(worldPos, mechanism.joints, editor.camera.zoom, true);
    if (existingJoint && !editor.sliderPointA) {
      editor.select(existingJoint.id);
      isDragging = true;
      dragJointId = existingJoint.id;
      mechanism.pushHistory();
      return;
    }

    // Check for slider rail line hit (select the slider)
    if (!editor.sliderPointA) {
      for (const slider of Object.values(mechanism.sliders)) {
        const jA = mechanism.joints[slider.jointIdA];
        const jC = mechanism.joints[slider.jointIdC];
        if (!jA || !jC) continue;
        const ab = sub(jC.position, jA.position);
        const ap = sub(worldPos, jA.position);
        const abLenSq = lengthSq(ab);
        if (abLenSq < 1e-8) continue;
        const t = Math.max(0, Math.min(1, dot(ap, ab) / abLenSq));
        const closest = { x: jA.position.x + ab.x * t, y: jA.position.y + ab.y * t };
        const dist = distance(worldPos, closest);
        if (dist < HIT_RADIUS / editor.camera.zoom) {
          editor.select(slider.id);
          // Also allow dragging the rail
          sliderLineDragId = slider.id;
          sliderLineDragStart = worldPos;
          const jB = mechanism.joints[slider.jointIdB];
          sliderLineDragStartPositions = {
            a: { ...jA.position },
            b: jB ? { ...jB.position } : { x: 0, y: 0 },
            c: { ...jC.position },
          };
          mechanism.pushHistory();
          return;
        }
      }

      // Clicked empty space with something selected — deselect
      if (editor.selectedIds.size > 0) {
        editor.clearSelection();
        return;
      }
    }

    const pos = editor.gridEnabled ? snapToGrid(worldPos, editor.gridSize) : worldPos;

    if (!editor.sliderPointA) {
      // First click on empty space: place joint A
      const activeBodyIds = Array.from(editor.activeBodyIds);
      const jointId = mechanism.addJoint('revolute', pos, activeBodyIds);
      editor.setSliderPointA({ position: pos, jointId });
      startArcTimer(jointId, e.clientX, e.clientY);
    } else {
      // Second click: place joint C, auto-create B at midpoint, create slider constraint
      const activeBodyIds = Array.from(editor.activeBodyIds);
      const jointIdC = mechanism.addJoint('revolute', pos, activeBodyIds);
      // B at midpoint, no body membership
      const midPos = {
        x: (editor.sliderPointA.position.x + pos.x) / 2,
        y: (editor.sliderPointA.position.y + pos.y) / 2,
      };
      const jointIdB = mechanism.addJoint('revolute', midPos);
      mechanism.addSlider(editor.sliderPointA.jointId, jointIdC, jointIdB);
      editor.setSliderPointA(null);
      editor.setCreateTool('joints');
      startArcTimer(jointIdC, e.clientX, e.clientY);
    }
    return;
  }

  // --- COLLIDER TOOL ---
  if (editor.createTool === 'collider') {
    // Check for existing joint hit first (select it)
    const existingJoint = hitTestJoint(worldPos, mechanism.joints, editor.camera.zoom, true);
    if (existingJoint && !editor.colliderPointA) {
      editor.select(existingJoint.id);
      isDragging = true;
      dragJointId = existingJoint.id;
      mechanism.pushHistory();
      return;
    }

    // Check for collider line hit (select the collider)
    if (!editor.colliderPointA) {
      for (const collider of Object.values(mechanism.colliders)) {
        const jA = mechanism.joints[collider.jointIdA];
        const jC = mechanism.joints[collider.jointIdC];
        if (!jA || !jC) continue;
        const ab = sub(jC.position, jA.position);
        const ap = sub(worldPos, jA.position);
        const abLenSq = lengthSq(ab);
        if (abLenSq < 1e-8) continue;
        const t = Math.max(0, Math.min(1, dot(ap, ab) / abLenSq));
        const closest = { x: jA.position.x + ab.x * t, y: jA.position.y + ab.y * t };
        const dist = distance(worldPos, closest);
        if (dist < HIT_RADIUS / editor.camera.zoom) {
          editor.select(collider.id);
          startColliderArcTimer(collider.id, closest, e.clientX, e.clientY);
          return;
        }
      }

      // Clicked empty space with collider selected — deselect and revert to pivot
      if (editor.selectedIds.size > 0) {
        editor.clearSelection();
        editor.setCreateTool('joints');
        return;
      }
    }

    const pos = editor.gridEnabled ? snapToGrid(worldPos, editor.gridSize) : worldPos;

    if (!editor.colliderPointA) {
      // First click: place endpoint A
      const activeBodyIds = Array.from(editor.activeBodyIds);
      const jointId = mechanism.addJoint('revolute', pos, activeBodyIds);
      editor.setColliderPointA({ position: pos, jointId });
      startArcTimer(jointId, e.clientX, e.clientY);
    } else {
      // Second click: place endpoint C, create collider constraint + rigid link
      const activeBodyIds = Array.from(editor.activeBodyIds);
      const jointIdC = mechanism.addJoint('revolute', pos, activeBodyIds);
      const colliderId = mechanism.addCollider(editor.colliderPointA.jointId, jointIdC);
      // Add a rigid link between A and C
      mechanism.addLink(editor.colliderPointA.jointId, jointIdC);
      editor.setColliderPointA(null);
      editor.select(colliderId);
      startArcTimer(jointIdC, e.clientX, e.clientY);
    }
    return;
  }

  // --- TRACER TOOL ---
  if (editor.createTool === 'tracer') {
    // Check for existing tracer hit (select it)
    for (const tracer of Object.values(mechanism.tracers)) {
      if (!tracer.enabled) continue;
      const body = mechanism.bodies[tracer.bodyId];
      if (!body) continue;
      const transform = computeBodyTransform(body, mechanism.joints);
      const worldPt = localToWorld(tracer.localPosition, transform);
      if (distance(worldPos, worldPt) < HIT_RADIUS / editor.camera.zoom) {
        editor.select(tracer.id);
        // Don't start drag immediately — let long-press timer determine intent
        // Drag will start if user moves beyond threshold (cancelling the arc timer)
        longPressPendingTracerId = tracer.id;
        mechanism.pushHistory();
        startTracerArcTimer(tracer.id, e.clientX, e.clientY);
        return;
      }
    }


    // Place a tracer on the active body (radio-select, single body)
    let activeBodyId = [...editor.activeBodyIds][0];
    if (!activeBodyId) {
      // Auto-select first non-base body if none active
      const nonBase = Object.values(mechanism.bodies).find((b) => b.id !== mechanism.baseBodyId);
      if (nonBase) {
        activeBodyId = nonBase.id;
        editor.setActiveBody(nonBase.id);
      }
    }
    if (!activeBodyId || !mechanism.bodies[activeBodyId]) return;

    const pos = editor.gridEnabled ? snapToGrid(worldPos, editor.gridSize) : worldPos;
    const body = mechanism.bodies[activeBodyId];
    const transform = computeBodyTransform(body, mechanism.joints);
    const localPt = worldToLocal(pos, transform);
    const tracerId = mechanism.addTracer(activeBodyId, localPt);
    useEditorStore.setState({ placementCommitted: true });
    editor.select(tracerId);
    startTracerArcTimer(tracerId, e.clientX, e.clientY);
    return;
  }

  // --- OUTLINE TOOL ---
  if (editor.createTool === 'outline') {
    // --- OUTLINE EDIT MODE ---
    if (editor.editingOutlineId) {
      const outline = mechanism.outlines[editor.editingOutlineId];
      if (outline) {
        const body = mechanism.bodies[outline.bodyId];
        if (body) {
          const transform = computeBodyTransform(body, mechanism.joints);
          const worldPts = outline.points.map((p) => localToWorld(p, transform));
          const hitRadius = HIT_RADIUS / editor.camera.zoom;

          // Check vertex hit
          for (let i = 0; i < worldPts.length; i++) {
            if (distance(worldPos, worldPts[i]) < hitRadius) {
              editor.setEditingVertexIndex(i);
              outlineVertexDragIndex = i;
              outlineVertexDragOutlineId = editor.editingOutlineId;
              mechanism.pushHistory();
              return;
            }
          }

          // Check edge hit (insert vertex)
          for (let i = 0; i < worldPts.length - (outline.closed === false ? 1 : 0); i++) {
            const j = (i + 1) % worldPts.length;
            const a = worldPts[i];
            const b = worldPts[j];
            const ab = sub(b, a);
            const ap = sub(worldPos, a);
            const abLenSq = lengthSq(ab);
            if (abLenSq < 1e-8) continue;
            const t = Math.max(0, Math.min(1, dot(ap, ab) / abLenSq));
            const closest = { x: a.x + ab.x * t, y: a.y + ab.y * t };
            if (distance(worldPos, closest) < hitRadius) {
              // Insert new vertex at the clicked position (grid-snapped)
              const snappedWorld = editor.gridEnabled ? snapToGrid(worldPos, editor.gridSize) : worldPos;
              const localPt = worldToLocal(snappedWorld, transform);
              mechanism.insertOutlineVertex(editor.editingOutlineId, i, localPt);
              editor.setEditingVertexIndex(i + 1);
              outlineVertexDragIndex = i + 1;
              outlineVertexDragOutlineId = editor.editingOutlineId;
              return;
            }
          }

          // Clicked away from shape — exit edit mode
          exitOutlineEditMode();
          return;
        }
      }
      exitOutlineEditMode();
      return;
    }

    // --- OUTLINE DRAWING MODE ---
    const pos = editor.gridEnabled ? snapToGrid(worldPos, editor.gridSize) : worldPos;
    const points = editor.outlinePoints;

    // If not currently drawing, check if clicking on an existing outline to select it
    if (points.length === 0) {
      const hitOutline = hitTestOutline(worldPos, mechanism.outlines, mechanism.bodies, mechanism.joints, editor.camera.zoom);
      if (hitOutline) {
        editor.select(hitOutline.id);
        return;
      }
      // Clicked empty space — deselect any selected outline
      if (editor.selectedIds.size > 0) {
        editor.clearSelection();
        return;
      }
    }

    // If clicking near the first point and we have 3+ points, close the outline
    if (points.length >= 3) {
      const distToFirst = distance(pos, points[0]);
      const closeThreshold = HIT_RADIUS / editor.camera.zoom;
      if (distToFirst < closeThreshold) {
        commitOutline();
        return;
      }
    }

    // Add point
    editor.addOutlinePoint(pos);
    return;
  }

  // --- JOINTS TOOL ---
  // Check slider rail line hit first (before joint hit, so joints take priority via the joint check below)
  const joint = hitTestJoint(worldPos, mechanism.joints, editor.camera.zoom, true);
  if (!joint) {
    // Check if clicking on a slider rail line
    for (const slider of Object.values(mechanism.sliders)) {
      const jA = mechanism.joints[slider.jointIdA];
      const jC = mechanism.joints[slider.jointIdC];
      if (!jA || !jC) continue;
      // Point-to-segment distance
      const ab = sub(jC.position, jA.position);
      const ap = sub(worldPos, jA.position);
      const abLen = Math.sqrt(lengthSq(ab));
      if (abLen < 1e-8) continue;
      const t = Math.max(0, Math.min(1, dot(ap, ab) / lengthSq(ab)));
      const closest = { x: jA.position.x + ab.x * t, y: jA.position.y + ab.y * t };
      const dist = distance(worldPos, closest);
      if (dist < HIT_RADIUS / editor.camera.zoom) {
        // Start dragging the slider rail
        sliderLineDragId = slider.id;
        sliderLineDragStart = worldPos;
        const jB = mechanism.joints[slider.jointIdB];
        sliderLineDragStartPositions = {
          a: { ...jA.position },
          b: jB ? { ...jB.position } : { x: 0, y: 0 },
          c: { ...jC.position },
        };
        mechanism.pushHistory();
        return;
      }
    }
  }

  if (joint) {
    if (e.shiftKey) {
      editor.toggleSelect(joint.id);
    } else {
      editor.select(joint.id);
    }
    isDragging = true;
    dragJointId = joint.id;
    mechanism.pushHistory();
    startArcTimer(joint.id, e.clientX, e.clientY);
  } else if (editor.selectedIds.size > 0) {
    editor.clearSelection();
    if (lastPointerType === 'touch') return; // Touch: just deselect, no deferred place
    // Deselect + start timer — if held, place a new joint + arc selector
    const pos2 = editor.gridEnabled ? snapToGrid(worldPos, editor.gridSize) : worldPos;
    longPressStartScreen = { x: e.clientX, y: e.clientY };
    longPressJointId = '__deferred_place__';
    if (longPressTimer) clearTimeout(longPressTimer);
    longPressTimer = setTimeout(() => {
      if (longPressJointId === '__deferred_place__') {
        const activeBodyIds2 = Array.from(useEditorStore.getState().activeBodyIds);
        const newId = useMechanismStore.getState().addJoint('revolute', pos2, activeBodyIds2);
        startArcTimer(newId, e.clientX, e.clientY);
        // Fire the arc immediately since we've already waited
        if (longPressTimer) clearTimeout(longPressTimer);
        longPressTimer = null;
        const j = useMechanismStore.getState().joints[newId];
        if (j && !j.hidden) {
          useEditorStore.getState().setArcSelector({
            jointId: newId,
            colliderId: null, tracerId: null,
            position: { ...j.position },
            showTime: Date.now(),
            collapseTime: null,
            readyToToggle: new Set([...Object.keys(useMechanismStore.getState().bodies), '__add_body__']), createdBodyId: null, lastToggleTime: 0, lastToggle: null,
          });
        }
      }
      longPressTimer = null;
    }, LONG_PRESS_MS);
  } else {
    const pos = editor.gridEnabled ? snapToGrid(worldPos, editor.gridSize) : worldPos;
    const activeBodyIds = Array.from(editor.activeBodyIds);
    const newJointId = mechanism.addJoint('revolute', pos, activeBodyIds);
    startArcTimer(newJointId, e.clientX, e.clientY);
  }
}

export function handleDoubleClick(e: PointerEvent | MouseEvent, canvas: HTMLCanvasElement) {
  const editor = useEditorStore.getState();
  if (editor.mode !== 'create') return;

  const mechanism = useMechanismStore.getState();
  const rect = canvas.getBoundingClientRect();
  const screenPos: Vec2 = { x: e.clientX - rect.left, y: e.clientY - rect.top };
  const worldPos = screenToWorld(screenPos, editor.camera);

  const joint = hitTestJoint(worldPos, mechanism.joints, editor.camera.zoom);
  if (joint) {
    const baseBodyId = mechanism.baseBodyId;
    if (isFixed(joint.id)) {
      mechanism.removeJointFromBody(joint.id, baseBodyId);
    } else {
      mechanism.addJointToBody(joint.id, baseBodyId);
    }
  }
}

export function handleMouseMove(e: PointerEvent, canvas: HTMLCanvasElement) {
  const editor = useEditorStore.getState();
  const mechanism = useMechanismStore.getState();
  const rect = canvas.getBoundingClientRect();
  const screenPos: Vec2 = { x: e.clientX - rect.left, y: e.clientY - rect.top };
  const worldPos = screenToWorld(screenPos, editor.camera);
  if (moveGeometry(worldPos)) return;
  if (marquee) {
    const region = marquee.region;
    if (region.kind === 'box') marquee.region = { ...region, end: worldPos };
    else if (distance(worldPos, region.points[region.points.length - 1]) * editor.camera.zoom >= 2) marquee.region = { kind: 'lasso', points: [...region.points, worldPos] };
    useEditorStore.setState({ selectionGesture: marquee.region });
    return;
  }

  // Cancel long-press if cursor moved too far (threshold scales with grid coarseness)
  if (longPressTimer && longPressStartScreen) {
    const gridScreenPx = editor.gridEnabled ? editor.gridSize * editor.camera.zoom : 0;
    const threshold = Math.max(LONG_PRESS_MOVE_THRESHOLD_BASE, gridScreenPx * 0.4);
    const dx = e.clientX - longPressStartScreen.x;
    const dy = e.clientY - longPressStartScreen.y;
    if (Math.sqrt(dx * dx + dy * dy) > threshold) {
      clearTimeout(longPressTimer);
      longPressTimer = null;
      longPressJointId = null;
      // If a tracer was pending, start dragging it now
      if (longPressPendingTracerId) {
        tracerDragId = longPressPendingTracerId;
        longPressPendingTracerId = null;
      }
    }
  }

  // Arc selector hover toggle logic
  if (editor.arcSelector) {
    handleArcHover(worldPos, editor, canvas);
    return; // block all other interactions while arc is shown
  }

  if (isPanning) {
    const dx = screenPos.x - lastMouse.x;
    const dy = screenPos.y - lastMouse.y;
    editor.panCamera({ x: dx, y: dy });
    lastMouse = screenPos;
    return;
  }

  // --- SIMULATE MODE ---
  if (editor.mode === 'simulate') {
    const simDrag = editor.simDrag;
    if (simDrag && simDrag.active) {
      editor.setSimDrag({ ...simDrag, cursorPoint: worldPos });
      return;
    }
    // Hover detection still works in simulate mode
    const hit = hitTest(worldPos, mechanism.joints, mechanism.links, editor.camera.zoom);
    editor.setHovered(hit ? hit.item.id : null);
    lastMouse = screenPos;
    return;
  }

  // --- CREATE MODE ---

  // Slider line dragging (translate all 3 joints)
  if (sliderLineDragId && sliderLineDragStartPositions) {
    const dx = worldPos.x - sliderLineDragStart.x;
    const dy = worldPos.y - sliderLineDragStart.y;
    const slider = mechanism.sliders[sliderLineDragId];
    if (slider) {
      let newA = { x: sliderLineDragStartPositions.a.x + dx, y: sliderLineDragStartPositions.a.y + dy };
      let newB = { x: sliderLineDragStartPositions.b.x + dx, y: sliderLineDragStartPositions.b.y + dy };
      let newC = { x: sliderLineDragStartPositions.c.x + dx, y: sliderLineDragStartPositions.c.y + dy };
      if (editor.gridEnabled && !e.altKey) {
        // Snap A to grid, translate B and C by same delta
        const snappedA = snapToGrid(newA, editor.gridSize);
        const snapDx = snappedA.x - newA.x;
        const snapDy = snappedA.y - newA.y;
        newA = snappedA;
        newB = { x: newB.x + snapDx, y: newB.y + snapDy };
        newC = { x: newC.x + snapDx, y: newC.y + snapDy };
      }
      mechanism.moveJoint(slider.jointIdA, newA, editor.lockOutlines ? editor.frozenOutlineWorldPoints : undefined);
      mechanism.moveJoint(slider.jointIdB, newB, editor.lockOutlines ? editor.frozenOutlineWorldPoints : undefined);
      mechanism.moveJoint(slider.jointIdC, newC, editor.lockOutlines ? editor.frozenOutlineWorldPoints : undefined);
    }
    return;
  }

  // Tracer dragging
  if (tracerDragId) {
    const mech = useMechanismStore.getState();
    const tracer = mech.tracers[tracerDragId];
    if (tracer) {
      const body = mech.bodies[tracer.bodyId];
      if (body) {
        const transform = computeBodyTransform(body, mech.joints);
        const snappedWorld = editor.gridEnabled && !e.altKey ? snapToGrid(worldPos, editor.gridSize) : worldPos;
        const localPt = worldToLocal(snappedWorld, transform);
        mech.moveTracer(tracerDragId, localPt);
      }
    }
    return;
  }

  // Outline vertex dragging
  if (outlineVertexDragIndex !== null && outlineVertexDragOutlineId) {
    const outline = mechanism.outlines[outlineVertexDragOutlineId];
    if (outline) {
      const body = mechanism.bodies[outline.bodyId];
      if (body) {
        const transform = computeBodyTransform(body, mechanism.joints);
        const snappedWorld = editor.gridEnabled && !e.altKey ? snapToGrid(worldPos, editor.gridSize) : worldPos;
        const localPt = worldToLocal(snappedWorld, transform);
        const newPoints = [...outline.points];
        newPoints[outlineVertexDragIndex] = localPt;
        mechanism.updateOutlinePoints(outlineVertexDragOutlineId, newPoints);
      }
    }
    return;
  }

  // Image dragging
  if (imageDragId && imageDragType) {
    const img = mechanism.images[imageDragId];
    if (img) {
      if (imageDragType === 'move') {
        const dx = worldPos.x - imageDragStart.x;
        const dy = worldPos.y - imageDragStart.y;
        mechanism.updateImage(imageDragId, {
          position: { x: imageStartPos.x + dx, y: imageStartPos.y + dy },
        });
      } else if (imageDragType === 'rotate') {
        // Angle from image center to current cursor vs start
        const startAngle = Math.atan2(imageDragStart.y - img.position.y, imageDragStart.x - img.position.x);
        const curAngle = Math.atan2(worldPos.y - img.position.y, worldPos.x - img.position.x);
        mechanism.updateImage(imageDragId, {
          rotation: imageStartRotation + (curAngle - startAngle),
        });
      } else if (imageDragType === 'scale') {
        const startDist = Math.sqrt(
          (imageDragStart.x - imageStartPos.x) ** 2 + (imageDragStart.y - imageStartPos.y) ** 2,
        );
        const curDist = Math.sqrt(
          (worldPos.x - imageStartPos.x) ** 2 + (worldPos.y - imageStartPos.y) ** 2,
        );
        const ratio = startDist > 1 ? curDist / startDist : 1;
        mechanism.updateImage(imageDragId, {
          scale: Math.max(0.01, imageStartScale * ratio),
        });
      }
    }
    return;
  }

  if (isDragging && dragJointId) {
    const pos = editor.gridEnabled && !e.altKey ? snapToGrid(worldPos, editor.gridSize) : worldPos;

    // Check if this joint is part of a slider
    const slider = mechanism.getSliderForJoint(dragJointId);
    if (slider) {
      if (dragJointId === slider.jointIdB) {
        // B: constrain to line AC (use unsnapped worldPos so B slides freely)
        const jA = mechanism.joints[slider.jointIdA];
        const jC = mechanism.joints[slider.jointIdC];
        if (jA && jC) {
          const ac = sub(jC.position, jA.position);
          const ap = sub(worldPos, jA.position);
          const acLenSq = lengthSq(ac);
          const t = acLenSq > 1e-8 ? Math.max(0, Math.min(1, dot(ap, ac) / acLenSq)) : 0.5;
          const constrained = { x: jA.position.x + ac.x * t, y: jA.position.y + ac.y * t };
          mechanism.moveJoint(dragJointId, constrained, editor.lockOutlines ? editor.frozenOutlineWorldPoints : undefined);
          mechanism.updateSliderT(slider.id, t);
        }
      } else {
        // A or C: move freely, but maintain B's parametric t
        mechanism.moveJoint(dragJointId, pos, editor.lockOutlines ? editor.frozenOutlineWorldPoints : undefined);
        const jA = mechanism.joints[dragJointId === slider.jointIdA ? dragJointId : slider.jointIdA];
        const jC = mechanism.joints[dragJointId === slider.jointIdC ? dragJointId : slider.jointIdC];
        const posA = dragJointId === slider.jointIdA ? pos : jA.position;
        const posC = dragJointId === slider.jointIdC ? pos : jC.position;
        const t = slider.t;
        const newB = { x: posA.x + (posC.x - posA.x) * t, y: posA.y + (posC.y - posA.y) * t };
        mechanism.moveJoint(slider.jointIdB, newB, editor.lockOutlines ? editor.frozenOutlineWorldPoints : undefined);
      }
    } else {
      mechanism.moveJoint(dragJointId, pos, editor.lockOutlines ? editor.frozenOutlineWorldPoints : undefined);
    }
    return;
  }

  const hoverJoint = hitTestJoint(worldPos, mechanism.joints, editor.camera.zoom);
  editor.setHovered(hoverJoint ? hoverJoint.id : null);
  lastMouse = screenPos;
}

export function handleMouseUp(_e?: PointerEvent | MouseEvent, _canvas?: HTMLCanvasElement) {
  const editor = useEditorStore.getState();
  // Clear old input errors only after a committed placement has released capture.
  if (_e && editor.placementCommitted) {
    useEditorStore.setState({ placementCommitted: false }); setProjectMessage('');
  }
  const rect = _canvas?.getBoundingClientRect();
  finishGeometry(!!_e, _e && rect ? screenToWorld({x:_e.clientX-rect.left,y:_e.clientY-rect.top},editor.camera) : undefined);
  if (marquee) {
    if (_e && editor.mode === 'create' && editor.activeTool === 'select') {
      const selected = selectInRegion(useMechanismStore.getState(), marquee.region, editor.excludedBodies);
      useEditorStore.setState({ selectedIds: marquee.additive ? new Set([...marquee.initial, ...selected]) : selected });
    }
    marquee = null;
    useEditorStore.setState({ selectionGesture: null });
  }

  // Cancel long-press timer
  if (longPressTimer) { clearTimeout(longPressTimer); longPressTimer = null; }
  longPressJointId = null;
  longPressStartScreen = null;

  if (!_e) editor.setArcSelector(null);
  if (_e && _canvas && editor.arcSelector && editor.arcSelector.openMode !== 'context') {
    const arc = editor.arcSelector, target = arcTarget(arc), rect = _canvas.getBoundingClientRect();
    const layout = currentRadialLayout(rect.width, rect.height, typeof matchMedia === 'function' && matchMedia('(pointer: coarse)').matches);
    if (layout.variant === 'list') {
      editor.setArcSelector({ ...arc, openMode: 'context' });
    } else {
      const key = radialHit(layout, { x: _e.clientX - rect.left, y: _e.clientY - rect.top });
      editor.setArcSelector(null);
      if (key === '__add_body__' || key === '__delete__') radialAction(target, key);
      else if (key?.startsWith('body:') && (!radialUsesToggle(target) || arc.readyToToggle.has(key.slice(5)))) chooseRadialBody(target, key.slice(5));
    }
  }

  // Clean up temporary joint from shape dragging
  if (editor.simDrag?.tempJointId) {
    const mechanism = useMechanismStore.getState();
    mechanism.removeTempJoint(editor.simDrag.tempJointId);
  }

  // Clear simulate drag
  if (editor.simDrag) {
    editor.setSimDrag(null);
  }

  isDragging = false;
  dragJointId = null;
  isPanning = false;
  imageDragId = null;
  imageDragType = null;
  sliderLineDragId = null;
  tracerDragId = null;
  longPressPendingTracerId = null;
  sliderLineDragStartPositions = null;
  outlineVertexDragIndex = null;
  outlineVertexDragOutlineId = null;
}

export function handleWheel(e: WheelEvent, canvas: HTMLCanvasElement) {
  e.preventDefault();
  const editor = useEditorStore.getState();
  const rect = canvas.getBoundingClientRect();
  const center: Vec2 = { x: e.clientX - rect.left, y: e.clientY - rect.top };
  const factor = e.deltaY < 0 ? 1.1 : 1 / 1.1;
  editor.zoomCamera(factor, center);
}

export function handleKeyDown(e: KeyboardEvent) {
  if (document.querySelector('dialog[open]')) return;
  const target = e.target;
  if (target instanceof HTMLElement && target.closest('input, textarea, select, dialog, .radial-menu, [contenteditable="true"], [role="dialog"]')) return;
  const editor = useEditorStore.getState();
  const mechanism = useMechanismStore.getState();

  if (editor.mode === 'create' && (e.key === 'ContextMenu' || e.key === 'F10' && e.shiftKey)) {
    const selected = [...editor.selectedIds].map(targetForId).find(t => t !== null);
    if (selected) { e.preventDefault(); openRadialMenu(selected, radialAnchor(selected)); }
    return;
  }

  // In simulate mode, disable creation shortcuts
  if (editor.mode === 'simulate') {
    // Only allow grid toggle and undo/redo
    if (e.key === 'g' && !e.ctrlKey && !e.metaKey) {
      editor.cycleGrid();
      return;
    }
    if (e.key === 'Escape') {
      if (editor.simDrag?.tempJointId) {
        const mechanism = useMechanismStore.getState();
        mechanism.removeTempJoint(editor.simDrag.tempJointId);
      }
      editor.setSimDrag(null);
      return;
    }
    return;
  }

  // --- CREATE MODE shortcuts ---
  if (!e.ctrlKey && !e.metaKey) {
    switch (e.key) {
      case 'g': editor.cycleGrid(); return;
      case 'Escape':
        if (editor.springPlacement) {
          useEditorStore.setState({ springPlacement: null });
        } else if (editor.editingOutlineId) {
          exitOutlineEditMode();
        } else if (editor.sliderPointA) {
          editor.setCreateTool('joints');
        } else if (editor.colliderPointA) {
          editor.setCreateTool('joints');
        } else if (editor.outlinePoints.length > 0) {
          editor.clearOutlinePoints();
        } else {
          editor.clearSelection();
        }
        return;
    }
  }

  if (e.key === 'Delete' || e.key === 'Backspace') {
    e.preventDefault();
    // If editing outline and a vertex is selected, delete the vertex
    if (editor.editingOutlineId && editor.editingVertexIndex !== null) {
      const outline = mechanism.outlines[editor.editingOutlineId];
      if (outline && outline.points.length > (outline.closed === false ? 2 : 3)) {
        mechanism.removeOutlineVertex(editor.editingOutlineId, editor.editingVertexIndex);
        editor.setEditingVertexIndex(null);
      }
      return;
    }
    deleteSelectedEntities();
  }

  if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z') {
    e.preventDefault();
    if (e.shiftKey) mechanism.redo();
    else mechanism.undo();
  }
  if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'y') {
    e.preventDefault();
    mechanism.redo();
  }
}
