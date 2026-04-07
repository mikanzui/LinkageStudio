import type { Vec2, Link, Joint, SpringAnchor } from '../types';
import { useEditorStore, showTransientHint } from '../store/editor-store';
import { useMechanismStore } from '../store/mechanism-store';
import { hitTest, hitTestJoint, hitTestOutline, hitTestOutlineFilled, hitTestSpring, hitTestLink } from './hit-test';
import { hitTestImage, hitTestRotateHandle, hitTestScaleHandle } from '../renderer/draw-images';
import { screenToWorld } from '../renderer/camera';
import { snapToGrid, distance, sub, dot, lengthSq, segmentClampedT } from '../core/math/vec2';
import { quantizeSpringLinkT } from '../core/springs/spring-solver';
import { computeBodyTransform, worldToLocal, localToWorld } from '../core/body-transform';
import { DEFAULT_GRID_SIZE, HIT_RADIUS } from '../utils/constants';
import { deleteSelectedEntities } from '../utils/delete-selection';
import {
  hitTestJointsToolBlock,
  worldAxisBoxFromScreenRect,
  worldPolygonFromScreenLasso,
  collectIdsInWorldBox,
  collectIdsInWorldLasso,
} from './selection-marquee';

function springLinkAnchorAtClick(
  link: Link,
  worldPos: Vec2,
  joints: Record<string, Joint>,
  resolutionSteps: number,
): SpringAnchor {
  const jA = joints[link.jointIds[0]];
  const jB = joints[link.jointIds[1]];
  const tRaw = segmentClampedT(worldPos, jA.position, jB.position);
  const t = quantizeSpringLinkT(tRaw, resolutionSteps);
  return { type: 'link', linkId: link.id, t };
}

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
        useEditorStore.getState().setWorldContextMenu({
          targetType: 'joint',
          targetId: longPressJointId,
          screenPosition: { x: screenX, y: screenY },
          openMode: 'hold',
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
      useEditorStore.getState().setWorldContextMenu({
        targetType: 'collider',
        targetId: colliderId,
        screenPosition: { x: screenX, y: screenY },
        openMode: 'hold',
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
      useEditorStore.getState().setWorldContextMenu({
        targetType: 'tracer',
        targetId: tracerId,
        screenPosition: { x: screenX, y: screenY },
        openMode: 'hold',
      });
    }
    longPressTimer = null;
  }, LONG_PRESS_MS);
}

/** Compute the screen positions of arc selector body circles. */
export function getArcCirclePositions(
  jointWorldPos: Vec2,
  bodyCount: number,
  camera: { pan: Vec2; zoom: number },
): { screenX: number; screenY: number; centerScreenX: number; centerScreenY: number; angle: number }[] {
  const RADIUS = 52; // screen px from joint center
  const PER_CIRCLE_DEG = 32; // angular spacing between circles
  const MAX_SPAN_DEG = 250;
  // Arc is centered at 345° (11 o'clock), expanding symmetrically clockwise
  const centerAngleDeg = 315;
  const spanDeg = Math.min(MAX_SPAN_DEG, Math.max(PER_CIRCLE_DEG, (bodyCount - 1) * PER_CIRCLE_DEG));
  // First circle at the counter-clockwise edge, last at the clockwise edge
  const startAngleDeg = centerAngleDeg - spanDeg / 2;
  const centerScreenX = jointWorldPos.x * camera.zoom + camera.pan.x;
  const centerScreenY = jointWorldPos.y * camera.zoom + camera.pan.y;

  const positions: { screenX: number; screenY: number; centerScreenX: number; centerScreenY: number; angle: number }[] = [];
  for (let i = 0; i < bodyCount; i++) {
    const t = bodyCount > 1 ? i / (bodyCount - 1) : 0;
    // Fan clockwise: increasing angle (0° = up, clockwise positive in screen space)
    const angleDeg = startAngleDeg + spanDeg * t;
    const angleRad = (angleDeg - 90) * (Math.PI / 180);
    positions.push({
      screenX: centerScreenX + Math.cos(angleRad) * RADIUS,
      screenY: centerScreenY + Math.sin(angleRad) * RADIUS,
      centerScreenX,
      centerScreenY,
      angle: angleDeg,
    });
  }
  return positions;
}

/** Compute the screen position of the "Add Body" button at the end of the arc. */
export function getArcAddButtonPosition(
  jointWorldPos: Vec2,
  bodyCount: number,
  camera: { pan: Vec2; zoom: number },
): { screenX: number; screenY: number; centerScreenX: number; centerScreenY: number } {
  const RADIUS = 52;
  const PER_CIRCLE_DEG = 32;
  const MAX_SPAN_DEG = 250;
  const centerAngleDeg = 315;
  const spanDeg = Math.min(MAX_SPAN_DEG, Math.max(PER_CIRCLE_DEG, (bodyCount - 1) * PER_CIRCLE_DEG));
  // Place one step past the last body circle
  const addAngleDeg = centerAngleDeg + spanDeg / 2 + PER_CIRCLE_DEG;
  const angleRad = (addAngleDeg - 90) * (Math.PI / 180);
  const centerScreenX = jointWorldPos.x * camera.zoom + camera.pan.x;
  const centerScreenY = jointWorldPos.y * camera.zoom + camera.pan.y;
  return {
    screenX: centerScreenX + Math.cos(angleRad) * RADIUS,
    screenY: centerScreenY + Math.sin(angleRad) * RADIUS,
    centerScreenX,
    centerScreenY,
  };
}

/** Handle cursor movement over arc body circles — toggle body membership on enter. */
function handleArcHover(worldPos: Vec2, editor: ReturnType<typeof useEditorStore.getState>) {
  const arc = editor.arcSelector;
  if (!arc) return;
  // No toggles during collapse animation
  if (arc.collapseTime !== null) return;
  const mechanism = useMechanismStore.getState();
  const bodies = Object.values(mechanism.bodies);
  bodies.sort((a, b) => {
    if (a.id === mechanism.baseBodyId) return -1;
    if (b.id === mechanism.baseBodyId) return 1;
    return 0;
  });

  const positions = getArcCirclePositions(arc.position, bodies.length, editor.camera);
  const CIRCLE_RADIUS = 12; // screen px hit radius

  // Convert world cursor to screen
  const cursorScreenX = worldPos.x * editor.camera.zoom + editor.camera.pan.x;
  const cursorScreenY = worldPos.y * editor.camera.zoom + editor.camera.pan.y;

  for (let i = 0; i < bodies.length; i++) {
    const body = bodies[i];
    const pos = positions[i];
    const dx = cursorScreenX - pos.screenX;
    const dy = cursorScreenY - pos.screenY;
    const dist = Math.sqrt(dx * dx + dy * dy);

    if (dist < CIRCLE_RADIUS) {
      // Cursor is inside this circle — toggle if ready
      if (arc.readyToToggle.has(body.id)) {
        let wasAdded = false;
        if (arc.tracerId) {
          // Tracer mode: single-select — set tracer to this body
          const tracer = mechanism.tracers[arc.tracerId];
          if (tracer && tracer.bodyId !== body.id) {
            mechanism.updateTracerBody(arc.tracerId, body.id);
            wasAdded = true;
          }
        } else if (arc.colliderId) {
          const collider = mechanism.colliders[arc.colliderId];
          if (collider) {
            if (collider.bodyIds.includes(body.id)) {
              mechanism.removeBodyFromCollider(arc.colliderId, body.id);
              wasAdded = false;
            } else {
              mechanism.addBodyToCollider(arc.colliderId, body.id);
              wasAdded = true;
            }
          }
        } else if (arc.jointId) {
          const joint = mechanism.joints[arc.jointId];
          if (joint) {
            if (body.jointIds.includes(arc.jointId)) {
              mechanism.removeJointFromBody(arc.jointId, body.id);
              wasAdded = false;
            } else {
              mechanism.addJointToBody(arc.jointId, body.id);
              wasAdded = true;
            }
          }
        }
        if (arc.tracerId) {
          // Single-select: keep all bodies ready, just record the change
          editor.setArcSelector({ ...arc, lastToggleTime: Date.now(), lastToggle: { bodyId: body.id, wasAdded } });
        } else {
          const newReady = new Set(arc.readyToToggle);
          newReady.delete(body.id);
          editor.setArcSelector({ ...arc, readyToToggle: newReady, lastToggleTime: Date.now(), lastToggle: { bodyId: body.id, wasAdded } });
        }
      }
    } else {
      // Cursor is outside — mark as ready to toggle again
      if (!arc.readyToToggle.has(body.id)) {
        const newReady = new Set(arc.readyToToggle);
        newReady.add(body.id);
        editor.setArcSelector({ ...arc, readyToToggle: newReady });
      }
    }
  }

  // "Add Body" button hover toggle (one-way: create only, no undo on re-hover)
  if (!arc.createdBodyId) {
    const addPos = getArcAddButtonPosition(arc.position, bodies.length, editor.camera);
    const addDx = cursorScreenX - addPos.screenX;
    const addDy = cursorScreenY - addPos.screenY;
    const addDist = Math.sqrt(addDx * addDx + addDy * addDy);

    if (addDist < 10 && arc.readyToToggle.has('__add_body__')) {
      const freshMech = useMechanismStore.getState();
      const newBodyId = freshMech.addBody('Body');
      const freshMech2 = useMechanismStore.getState();
      if (arc.jointId) {
        freshMech2.addJointToBody(arc.jointId, newBodyId);
      } else if (arc.colliderId) {
        freshMech2.addBodyToCollider(arc.colliderId, newBodyId);
      }
      const newReady = new Set(arc.readyToToggle);
      newReady.delete('__add_body__');
      editor.setArcSelector({ ...arc, readyToToggle: newReady, createdBodyId: newBodyId });
    }
  }
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
let lastMouse: Vec2 = { x: 0, y: 0 };

// Slider line drag state
let sliderLineDragId: string | null = null;
let sliderLineDragStart: Vec2 = { x: 0, y: 0 };
let sliderLineDragStartPositions: { a: Vec2; b: Vec2; c: Vec2 } | null = null;
/** Mouse: hold still on rail → long-press menu on B; move past threshold → translate rail. Touch: unused (immediate drag). */
let pendingSliderRailDrag: { sliderId: string; worldStart: Vec2; positions: { a: Vec2; b: Vec2; c: Vec2 } } | null = null;
const SLIDER_RAIL_HOLD_JOINT_ID = '__slider_rail__';

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
const LONG_PRESS_MS = 340;
const LONG_PRESS_MOVE_THRESHOLD_BASE = 8; // px screen movement to cancel (minimum)
let imageStartPos: Vec2 = { x: 0, y: 0 };

/** Box or lasso marquee drag (screen space, canvas-relative). */
let marqueeDrag: {
  kind: 'box' | 'lasso';
  startScreen: Vec2;
  shift: boolean;
  lastScreen: Vec2;
  lassoPoints?: Vec2[];
} | null = null;

const MARQUEE_MIN_PX = 4;

function getMirrorPreview(worldPos: Vec2, gridSize: number, zoom: number): { axis: 'vertical' | 'horizontal'; value: number } {
  const step = gridSize > 0 ? gridSize : DEFAULT_GRID_SIZE;
  const nearestX = Math.round(worldPos.x / step) * step;
  const nearestY = Math.round(worldPos.y / step) * step;
  const dxPx = Math.abs(worldPos.x - nearestX) * zoom;
  const dyPx = Math.abs(worldPos.y - nearestY) * zoom;
  if (dxPx <= dyPx) return { axis: 'vertical', value: nearestX };
  return { axis: 'horizontal', value: nearestY };
}

/** After mousedown on slider rail (mouse): opens body menu on midpoint B if still held; cancelled by movement in handleMouseMove. */
function scheduleSliderRailHoldMenu(clientX: number, clientY: number) {
  if (longPressTimer) clearTimeout(longPressTimer);
  const cx = clientX;
  const cy = clientY;
  longPressTimer = setTimeout(() => {
    if (longPressJointId !== SLIDER_RAIL_HOLD_JOINT_ID || !pendingSliderRailDrag) {
      longPressTimer = null;
      return;
    }
    const p = pendingSliderRailDrag;
    pendingSliderRailDrag = null;
    longPressJointId = null;
    longPressTimer = null;
    const mech = useMechanismStore.getState();
    const s = mech.sliders[p.sliderId];
    if (!s) return;
    const jMid = mech.joints[s.jointIdB];
    if (!jMid || jMid.hidden) return;
    useEditorStore.getState().setWorldContextMenu({
      targetType: 'joint',
      targetId: s.jointIdB,
      screenPosition: { x: cx, y: cy },
      openMode: 'hold',
    });
  }, LONG_PRESS_MS);
}

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
  if (editor.mode === 'simulate') {
    if (e.button === 0 && (editor.activeTool === 'pan' || editor.spacePanHeld)) {
      isPanning = true;
      e.preventDefault();
      return;
    }
    if (e.button !== 0) return;

    const hit = hitTest(worldPos, mechanism.joints, mechanism.links, editor.camera.zoom);
    if (hit) {
      if (hit.type === 'joint') {
        const joint = hit.item;
        if (isFixed(joint.id)) return;

        // Slider midpoint B is not on any distance link; A–C rail pull only
        // moves free endpoints — if A and C are fixed, force was zero. Apply
        // spring directly to B; slider constraint keeps B on segment AC.
        const slider = mechanism.getSliderForJoint(joint.id);
        if (slider && joint.id === slider.jointIdB) {
          editor.setSimDrag({
            active: true,
            grabPoint: joint.position,
            cursorPoint: worldPos,
            jointId: joint.id,
            linkId: null,
            grabT: 0,
            directJointId: joint.id,
          });
          return;
        }

        // First valid link in connections (first id can be stale after regen)
        let linkId: string | null = null;
        let grabT = 0;
        for (const lid of joint.connectedLinkIds) {
          const link = mechanism.links[lid];
          if (!link) continue;
          linkId = lid;
          grabT = link.jointIds[0] === joint.id ? 0 : 1;
          break;
        }
        editor.setSimDrag({
          active: true,
          grabPoint: joint.position,
          cursorPoint: worldPos,
          jointId: joint.id,
          linkId,
          grabT,
          // No distance link: pull joint toward cursor (otherwise App omits pullForce and drag does nothing)
          directJointId: linkId ? null : joint.id,
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
          directJointId: null,
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
          directJointId: null,
        });
      }
    }
    return;
  }

  // --- CREATE MODE ---
  if (e.button !== 0) return;
  if (editor.worldContextMenu) {
    editor.setWorldContextMenu(null);
  }

  if (editor.activeTool === 'pan' || editor.spacePanHeld) {
    isPanning = true;
    return;
  }

  if (editor.createTool === 'mirror') {
    const preview = editor.mirrorPreview ?? getMirrorPreview(worldPos, editor.gridSize, editor.camera.zoom);
    useMechanismStore
      .getState()
      .mirrorAcrossAxis(preview.axis, preview.value, editor.mirrorScope, Array.from(editor.selectedIds));
    editor.setMirrorPreview(null);
    editor.setCreateTool('joints');
    return;
  }

  // --- LINEAR SPRING / LINEAR DAMPER (same placement pattern) ---
  if (editor.createTool === 'spring' || editor.createTool === 'damper') {
    const isDamper = editor.createTool === 'damper';
    const sub = editor.springToolSubmode;
    const pending = editor.springPickPendingAnchor;
    const springSteps = useEditorStore.getState().springLinkResolution;

    const jHit = hitTestJoint(worldPos, mechanism.joints, editor.camera.zoom);
    const linkHit = hitTestLink(worldPos, mechanism.links, mechanism.joints, editor.camera.zoom);
    const spHit = hitTestSpring(worldPos, mechanism.springs, mechanism.joints, mechanism.links, editor.camera.zoom);

    if (spHit) {
      if (e.shiftKey) editor.toggleSelect(spHit.id);
      else editor.select(spHit.id);
      return;
    }

    const clearPick = () => useEditorStore.getState().clearSpringPickPending();

    const addJJ = isDamper ? mechanism.addDamperJointToJoint : mechanism.addSpringJointToJoint;
    const addJL = isDamper ? mechanism.addDamperJointToLink : mechanism.addSpringJointToLink;
    const addLL = isDamper ? mechanism.addDamperLinkToLink : mechanism.addSpringLinkToLink;

    if (sub === 'jointJoint') {
      if (jHit && !jHit.hidden) {
        if (!pending) {
          useEditorStore.setState({ springPickPendingAnchor: { type: 'joint', jointId: jHit.id } });
          editor.select(jHit.id);
          showTransientHint('Pick a second joint (same or different body). Escape to cancel.');
          return;
        }
        if (pending.type !== 'joint') {
          showTransientHint('Pick a second joint.');
          return;
        }
        if (pending.jointId === jHit.id) {
          showTransientHint('Pick a different joint for the other end.');
          return;
        }
        const sid = addJJ.call(mechanism, pending.jointId, jHit.id);
        clearPick();
        if (sid) {
          editor.select(sid);
          editor.setCreateTool('joints');
        }
        return;
      }
      if (linkHit) {
        showTransientHint('Joint ↔ joint: click joints, not the link bar. Switch mode for joint ↔ link.');
        return;
      }
      if (pending) {
        clearPick();
        showTransientHint('Cancelled first pick.');
        return;
      }
      if (editor.selectedIds.size > 0) editor.clearSelection();
      return;
    }

    if (sub === 'jointLink') {
      if (!pending) {
        if (jHit && !jHit.hidden) {
          useEditorStore.setState({ springPickPendingAnchor: { type: 'joint', jointId: jHit.id } });
          editor.select(jHit.id);
          showTransientHint('Click a link for the other end. Escape to cancel.');
          return;
        }
        if (linkHit) {
          showTransientHint('Joint ↔ link: pick a joint first, then a link.');
          return;
        }
        if (editor.selectedIds.size > 0) editor.clearSelection();
        return;
      }
      if (pending.type === 'joint') {
        if (linkHit) {
          const anchorB = springLinkAnchorAtClick(linkHit, worldPos, mechanism.joints, springSteps);
          const sid = addJL.call(mechanism, pending.jointId, anchorB.linkId, anchorB.t);
          clearPick();
          if (sid) {
            editor.select(sid);
            editor.setCreateTool('joints');
          }
          return;
        }
        if (jHit && !jHit.hidden) {
          showTransientHint('Click a link for the second end.');
          return;
        }
        clearPick();
        showTransientHint('Cancelled first pick.');
        return;
      }
      clearPick();
      return;
    }

    // linkLink
    if (!pending) {
      if (linkHit) {
        const a = springLinkAnchorAtClick(linkHit, worldPos, mechanism.joints, springSteps);
        useEditorStore.setState({ springPickPendingAnchor: a });
        showTransientHint('Click another link (or another point on a link). Escape to cancel.');
        return;
      }
      if (jHit && !jHit.hidden) {
        showTransientHint('Link ↔ link: pick a link first, then a second link or point.');
        return;
      }
      if (editor.selectedIds.size > 0) editor.clearSelection();
      return;
    }
    if (pending.type === 'link') {
      if (linkHit) {
        const b = springLinkAnchorAtClick(linkHit, worldPos, mechanism.joints, springSteps);
        const sid = addLL.call(mechanism, pending.linkId, pending.t, b.linkId, b.t);
        clearPick();
        if (sid) {
          editor.select(sid);
          editor.setCreateTool('joints');
        }
        return;
      }
      if (jHit) {
        showTransientHint('Click a link for the second end.');
        return;
      }
      clearPick();
      showTransientHint('Cancelled first pick.');
      return;
    }
    clearPick();
    return;
  }

  // --- TORSION SPRING (pivot joint → link A → link B) ---
  if (editor.createTool === 'torsionSpring') {
    const pick = editor.torsionSpringPick;
    const jHit = hitTestJoint(worldPos, mechanism.joints, editor.camera.zoom);
    const linkHit = hitTestLink(worldPos, mechanism.links, mechanism.joints, editor.camera.zoom);
    const spHit = hitTestSpring(worldPos, mechanism.springs, mechanism.joints, mechanism.links, editor.camera.zoom);

    if (spHit) {
      if (e.shiftKey) editor.toggleSelect(spHit.id);
      else editor.select(spHit.id);
      return;
    }

    const clearTorsion = () => useEditorStore.getState().clearTorsionSpringPick();

    if (!pick) {
      if (jHit && !jHit.hidden) {
        useEditorStore.setState({ torsionSpringPick: { pivotJointId: jHit.id } });
        editor.select(jHit.id);
        showTransientHint('Pick a link through this pivot. Escape to cancel.');
        return;
      }
      if (linkHit) {
        showTransientHint('Torsion spring: click the pivot joint first.');
        return;
      }
      if (editor.selectedIds.size > 0) editor.clearSelection();
      return;
    }

    if (!pick.linkAId) {
      if (linkHit) {
        if (!linkHit.jointIds.includes(pick.pivotJointId)) {
          showTransientHint('That link does not include the pivot.');
          return;
        }
        useEditorStore.setState({ torsionSpringPick: { pivotJointId: pick.pivotJointId, linkAId: linkHit.id } });
        showTransientHint('Pick a second link that shares the pivot.');
        return;
      }
      if (jHit && !jHit.hidden && jHit.id !== pick.pivotJointId) {
        showTransientHint('Click a link through the pivot (not another joint).');
        return;
      }
      clearTorsion();
      showTransientHint('Cancelled torsion pick.');
      return;
    }

    if (linkHit) {
      if (!linkHit.jointIds.includes(pick.pivotJointId)) {
        showTransientHint('That link does not include the pivot.');
        return;
      }
      if (linkHit.id === pick.linkAId) {
        showTransientHint('Pick a different second link.');
        return;
      }
      const sid = mechanism.addTorsionSpring(pick.pivotJointId, pick.linkAId, linkHit.id);
      clearTorsion();
      if (sid) {
        editor.select(sid);
        editor.setCreateTool('joints');
      }
      return;
    }
    if (jHit) {
      showTransientHint('Click the second link (bar), not a joint.');
      return;
    }
    clearTorsion();
    showTransientHint('Cancelled torsion pick.');
    return;
  }

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
    if (!editor.sliderPointA) {
      // Nearest joint in standard radius first (A/B/C); then expanded B grab for mid-rail only.
      const existingJoint = hitTestJoint(worldPos, mechanism.joints, editor.camera.zoom);
      if (existingJoint) {
        editor.select(existingJoint.id);
        isDragging = true;
        dragJointId = existingJoint.id;
        mechanism.pushHistory();
        return;
      }

      const bHitThreshold = (HIT_RADIUS * 1.4) / editor.camera.zoom;
      let closestBId: string | null = null;
      let closestBDist = Infinity;
      for (const slider of Object.values(mechanism.sliders)) {
        const jA = mechanism.joints[slider.jointIdA];
        const jB = mechanism.joints[slider.jointIdB];
        const jC = mechanism.joints[slider.jointIdC];
        if (!jB || jB.hidden) continue;
        const dB = distance(worldPos, jB.position);
        if (dB >= bHitThreshold) continue;
        const dA = jA && !jA.hidden ? distance(worldPos, jA.position) : Infinity;
        const dC = jC && !jC.hidden ? distance(worldPos, jC.position) : Infinity;
        if (dB >= dA || dB >= dC) continue;
        if (dB < closestBDist) {
          closestBDist = dB;
          closestBId = jB.id;
        }
      }
      if (closestBId) {
        editor.select(closestBId);
        isDragging = true;
        dragJointId = closestBId;
        mechanism.pushHistory();
        return;
      }
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
          const jB = mechanism.joints[slider.jointIdB];
          const positions = {
            a: { ...jA.position },
            b: jB ? { ...jB.position } : { x: 0, y: 0 },
            c: { ...jC.position },
          };
          if (lastPointerType === 'touch') {
            sliderLineDragId = slider.id;
            sliderLineDragStart = worldPos;
            sliderLineDragStartPositions = positions;
            mechanism.pushHistory();
            return;
          }
          pendingSliderRailDrag = { sliderId: slider.id, worldStart: worldPos, positions };
          longPressStartScreen = { x: e.clientX, y: e.clientY };
          longPressJointId = SLIDER_RAIL_HOLD_JOINT_ID;
          scheduleSliderRailHoldMenu(e.clientX, e.clientY);
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
    const existingJoint = hitTestJoint(worldPos, mechanism.joints, editor.camera.zoom);
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

    if (editor.selectedIds.size > 0) {
      editor.clearSelection();
      if (lastPointerType === 'touch') return; // Touch: just deselect, no deferred place
      // Deselect + start timer — if held, place a new tracer + arc selector
      const pos2 = editor.gridEnabled ? snapToGrid(worldPos, editor.gridSize) : worldPos;
      longPressStartScreen = { x: e.clientX, y: e.clientY };
      longPressJointId = '__deferred_tracer__';
      if (longPressTimer) clearTimeout(longPressTimer);
      longPressTimer = setTimeout(() => {
        if (longPressJointId === '__deferred_tracer__') {
          const edState = useEditorStore.getState();
          const mechState = useMechanismStore.getState();
          let bodyId = [...edState.activeBodyIds][0];
          if (!bodyId) {
            const nonBase = Object.values(mechState.bodies).find((b) => b.id !== mechState.baseBodyId);
            if (nonBase) { bodyId = nonBase.id; edState.setActiveBody(nonBase.id); }
          }
          if (bodyId && mechState.bodies[bodyId]) {
            const body = mechState.bodies[bodyId];
            const transform = computeBodyTransform(body, mechState.joints);
            const localPt = worldToLocal(pos2, transform);
            const newTracerId = mechState.addTracer(bodyId, localPt);
            edState.select(newTracerId);
            // Open arc immediately
            const tracer = useMechanismStore.getState().tracers[newTracerId];
            if (tracer) {
              const worldPt = localToWorld(tracer.localPosition, computeBodyTransform(useMechanismStore.getState().bodies[bodyId], useMechanismStore.getState().joints));
              edState.setWorldContextMenu({
                targetType: 'tracer',
                targetId: newTracerId,
                screenPosition: {
                  x: worldPt.x * edState.camera.zoom + edState.camera.pan.x,
                  y: worldPt.y * edState.camera.zoom + edState.camera.pan.y,
                },
                openMode: 'hold',
              });
            }
          }
        }
        longPressTimer = null;
      }, LONG_PRESS_MS);
      return;
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
          for (let i = 0; i < worldPts.length; i++) {
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
        const activeBodyId = [...editor.activeBodyIds][0];
        const body = mechanism.bodies[activeBodyId];
        if (body) {
          const transform = computeBodyTransform(body, mechanism.joints);
          const localPoints = points.map((p) => worldToLocal(p, transform));
          const outlineId = mechanism.addOutline(activeBodyId, localPoints);
          // Freeze the new outline's world points if lock is on
          if (editor.lockOutlines && outlineId) {
            editor.updateFrozenOutline(outlineId, points);
          }
        }
        editor.clearOutlinePoints();
        return;
      }
    }

    // Add point
    editor.addOutlinePoint(pos);
    return;
  }

  // --- BOX / LASSO (Pivot or Spring tool, Select viewport mode) ---
  if (
    (editor.createTool === 'joints' ||
      editor.createTool === 'spring' ||
      editor.createTool === 'damper' ||
      editor.createTool === 'torsionSpring') &&
    editor.activeTool === 'select' &&
    editor.selectMode !== 'single' &&
    !hitTestJointsToolBlock(worldPos, editor.camera.zoom, mechanism)
  ) {
    const kind: 'box' | 'lasso' = editor.selectMode === 'box' ? 'box' : 'lasso';
    marqueeDrag = {
      kind,
      startScreen: { ...screenPos },
      shift: e.shiftKey,
      lastScreen: { ...screenPos },
      lassoPoints: kind === 'lasso' ? [{ ...screenPos }] : undefined,
    };
    editor.setSelectionGesture(
      kind === 'box'
        ? { type: 'box', screenStart: screenPos, screenEnd: screenPos }
        : { type: 'lasso', screenPoints: [{ ...screenPos }] },
    );
    return;
  }

  // --- JOINTS TOOL ---
  // Standard joint hit first (closest); then expanded B; then rail. Order avoids B shortcut / hover cycling stealing C.
  const joint = hitTestJoint(worldPos, mechanism.joints, editor.camera.zoom);
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
    return;
  }

  const springPick = hitTestSpring(worldPos, mechanism.springs, mechanism.joints, mechanism.links, editor.camera.zoom);
  if (springPick) {
    if (e.shiftKey) editor.toggleSelect(springPick.id);
    else editor.select(springPick.id);
    return;
  }

  const bHitThreshold = (HIT_RADIUS * 1.4) / editor.camera.zoom;
  let closestBId: string | null = null;
  let closestBDist = Infinity;
  for (const slider of Object.values(mechanism.sliders)) {
    const jA = mechanism.joints[slider.jointIdA];
    const jB = mechanism.joints[slider.jointIdB];
    const jC = mechanism.joints[slider.jointIdC];
    if (!jB || jB.hidden) continue;
    const dB = distance(worldPos, jB.position);
    if (dB >= bHitThreshold) continue;
    const dA = jA && !jA.hidden ? distance(worldPos, jA.position) : Infinity;
    const dC = jC && !jC.hidden ? distance(worldPos, jC.position) : Infinity;
    if (dB >= dA || dB >= dC) continue;
    if (dB < closestBDist) {
      closestBDist = dB;
      closestBId = jB.id;
    }
  }
  if (closestBId) {
    if (e.shiftKey) editor.toggleSelect(closestBId);
    else editor.select(closestBId);
    isDragging = true;
    dragJointId = closestBId;
    mechanism.pushHistory();
    return;
  }

  for (const slider of Object.values(mechanism.sliders)) {
    const jA = mechanism.joints[slider.jointIdA];
    const jC = mechanism.joints[slider.jointIdC];
    if (!jA || !jC) continue;
    const ab = sub(jC.position, jA.position);
    const ap = sub(worldPos, jA.position);
    const abLen = Math.sqrt(lengthSq(ab));
    if (abLen < 1e-8) continue;
    const t = Math.max(0, Math.min(1, dot(ap, ab) / lengthSq(ab)));
    const closest = { x: jA.position.x + ab.x * t, y: jA.position.y + ab.y * t };
    const dist = distance(worldPos, closest);
    if (dist < HIT_RADIUS / editor.camera.zoom) {
      const jB = mechanism.joints[slider.jointIdB];
      const positions = {
        a: { ...jA.position },
        b: jB ? { ...jB.position } : { x: 0, y: 0 },
        c: { ...jC.position },
      };
      if (lastPointerType === 'touch') {
        sliderLineDragId = slider.id;
        sliderLineDragStart = worldPos;
        sliderLineDragStartPositions = positions;
        mechanism.pushHistory();
        return;
      }
      pendingSliderRailDrag = { sliderId: slider.id, worldStart: worldPos, positions };
      longPressStartScreen = { x: e.clientX, y: e.clientY };
      longPressJointId = SLIDER_RAIL_HOLD_JOINT_ID;
      scheduleSliderRailHoldMenu(e.clientX, e.clientY);
      return;
    }
  }

  if (editor.selectedIds.size > 0) {
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
          const ed = useEditorStore.getState();
          ed.setWorldContextMenu({
            targetType: 'joint',
            targetId: newId,
            screenPosition: {
              x: j.position.x * ed.camera.zoom + ed.camera.pan.x,
              y: j.position.y * ed.camera.zoom + ed.camera.pan.y,
            },
            openMode: 'hold',
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

  // Cancel long-press if cursor moved too far (threshold scales with grid coarseness).
  // Pending slider rail: same threshold starts translating the rail instead of opening the hold menu.
  if (longPressStartScreen) {
    const gridScreenPx = editor.gridEnabled ? editor.gridSize * editor.camera.zoom : 0;
    const threshold = Math.max(LONG_PRESS_MOVE_THRESHOLD_BASE, gridScreenPx * 0.4);
    const dx = e.clientX - longPressStartScreen.x;
    const dy = e.clientY - longPressStartScreen.y;
    if (Math.sqrt(dx * dx + dy * dy) > threshold) {
      if (
        pendingSliderRailDrag &&
        longPressJointId === SLIDER_RAIL_HOLD_JOINT_ID &&
        longPressTimer
      ) {
        clearTimeout(longPressTimer);
        longPressTimer = null;
        longPressJointId = null;
        const p = pendingSliderRailDrag;
        pendingSliderRailDrag = null;
        sliderLineDragId = p.sliderId;
        sliderLineDragStart = p.worldStart;
        sliderLineDragStartPositions = p.positions;
        useMechanismStore.getState().pushHistory();
      } else if (longPressTimer) {
        clearTimeout(longPressTimer);
        longPressTimer = null;
        longPressJointId = null;
        if (longPressPendingTracerId) {
          tracerDragId = longPressPendingTracerId;
          longPressPendingTracerId = null;
        }
      }
    }
  }

  if (isPanning) {
    const dx = screenPos.x - lastMouse.x;
    const dy = screenPos.y - lastMouse.y;
    editor.panCamera({ x: dx, y: dy });
    lastMouse = screenPos;
    return;
  }

  if (marqueeDrag) {
    marqueeDrag.lastScreen = { ...screenPos };
    if (marqueeDrag.kind === 'box') {
      editor.setSelectionGesture({
        type: 'box',
        screenStart: marqueeDrag.startScreen,
        screenEnd: screenPos,
      });
    } else {
      const pts = marqueeDrag.lassoPoints ?? [];
      const last = pts[pts.length - 1];
      if (!last) {
        pts.push({ ...screenPos });
      } else {
        const dx = screenPos.x - last.x;
        const dy = screenPos.y - last.y;
        if (dx * dx + dy * dy > 9) pts.push({ ...screenPos });
        else pts[pts.length - 1] = { ...screenPos };
      }
      marqueeDrag.lassoPoints = pts;
      editor.setSelectionGesture({ type: 'lasso', screenPoints: [...pts] });
    }
    editor.setHovered(null);
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

  if (editor.mode === 'create' && editor.createTool === 'mirror') {
    editor.setMirrorPreview(getMirrorPreview(worldPos, editor.gridSize, editor.camera.zoom));
    editor.setHovered(null);
    lastMouse = screenPos;
    return;
  }

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
      mechanism.moveJoint(slider.jointIdA, newA);
      mechanism.moveJoint(slider.jointIdB, newB);
      mechanism.moveJoint(slider.jointIdC, newC);
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
          mechanism.moveJoint(dragJointId, constrained);
          mechanism.updateSliderT(slider.id, t);
        }
      } else {
        // A or C: move freely, but maintain B's parametric t
        mechanism.moveJoint(dragJointId, pos);
        const jA = mechanism.joints[dragJointId === slider.jointIdA ? dragJointId : slider.jointIdA];
        const jC = mechanism.joints[dragJointId === slider.jointIdC ? dragJointId : slider.jointIdC];
        const posA = dragJointId === slider.jointIdA ? pos : jA.position;
        const posC = dragJointId === slider.jointIdC ? pos : jC.position;
        const t = slider.t;
        const newB = { x: posA.x + (posC.x - posA.x) * t, y: posA.y + (posC.y - posA.y) * t };
        mechanism.moveJoint(slider.jointIdB, newB);
      }
    } else {
      mechanism.moveJoint(dragJointId, pos);
    }
    return;
  }

  const hoverJoint = hitTestJoint(worldPos, mechanism.joints, editor.camera.zoom);
  const springCount = Object.keys(mechanism.springs).length;
  const hoverSpring =
    !hoverJoint && springCount > 0
      ? hitTestSpring(worldPos, mechanism.springs, mechanism.joints, mechanism.links, editor.camera.zoom)
      : null;
  editor.setHovered(hoverJoint ? hoverJoint.id : hoverSpring ? hoverSpring.id : null);
  lastMouse = screenPos;
}

export function handleMouseUp(e: PointerEvent | MouseEvent, canvas?: HTMLCanvasElement) {
  const editor = useEditorStore.getState();

  if (marqueeDrag) {
    const m = marqueeDrag;
    marqueeDrag = null;
    editor.setSelectionGesture(null);
    const mech = useMechanismStore.getState();
    const dx = m.lastScreen.x - m.startScreen.x;
    const dy = m.lastScreen.y - m.startScreen.y;
    const dragLen = Math.sqrt(dx * dx + dy * dy);
    const additive = e.shiftKey || m.shift;
    if (dragLen >= MARQUEE_MIN_PX) {
      let ids: string[] = [];
      if (m.kind === 'box') {
        const { min, max } = worldAxisBoxFromScreenRect(m.startScreen, m.lastScreen, editor.camera);
        ids = collectIdsInWorldBox(min, max, mech, editor.marqueeExcludedBodyIds);
      } else {
        const poly = worldPolygonFromScreenLasso(m.lassoPoints ?? [], editor.camera);
        ids = collectIdsInWorldLasso(poly, mech, editor.marqueeExcludedBodyIds);
      }
      editor.applyMarqueeSelection(ids, additive);
    } else if (!additive && editor.selectedIds.size > 0) {
      editor.clearSelection();
    }
  }

  // Cancel long-press timer
  if (longPressTimer) { clearTimeout(longPressTimer); longPressTimer = null; }
  longPressJointId = null;
  longPressStartScreen = null;

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
  pendingSliderRailDrag = null;
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

export function handleKeyUp(e: KeyboardEvent) {
  if (e.code === 'Space' || e.key === ' ' || e.key === 'Spacebar') {
    useEditorStore.getState().setSpacePanHeld(false);
  }
}

export function handleKeyDown(e: KeyboardEvent) {
  if (e.code === 'Space' || e.key === ' ') {
    if (e.repeat) return;
    const el = e.target as HTMLElement | null;
    if (el?.closest?.('input, textarea, [contenteditable="true"]')) return;
    useEditorStore.getState().setSpacePanHeld(true);
    e.preventDefault();
    return;
  }

  const editor = useEditorStore.getState();
  const mechanism = useMechanismStore.getState();

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
        if (marqueeDrag) {
          marqueeDrag = null;
          editor.setSelectionGesture(null);
          e.preventDefault();
          return;
        }
        if (editor.worldContextMenu) {
          editor.setWorldContextMenu(null);
          e.preventDefault();
          return;
        }
        if (editor.createTool === 'mirror') {
          editor.setMirrorPreview(null);
          editor.setCreateTool('joints');
          e.preventDefault();
          return;
        }
        if (editor.createTool === 'spring' || editor.createTool === 'damper') {
          if (editor.springPickPendingAnchor) {
            useEditorStore.getState().clearSpringPickPending();
            showTransientHint('Cancelled first pick.');
          } else {
            editor.setCreateTool('joints');
          }
          e.preventDefault();
          return;
        }
        if (editor.createTool === 'torsionSpring') {
          if (editor.torsionSpringPick) {
            useEditorStore.getState().clearTorsionSpringPick();
            showTransientHint('Cancelled torsion spring step.');
          } else {
            editor.setCreateTool('joints');
          }
          e.preventDefault();
          return;
        }
        if (editor.editingOutlineId) {
          exitOutlineEditMode();
        } else if (editor.sliderPointA) {
          // Cancel slider placement — remove the already-placed A joint
          mechanism.undo();
          editor.setSliderPointA(null);
        } else if (editor.colliderPointA) {
          // Cancel collider placement — remove the already-placed A joint
          mechanism.undo();
          editor.setColliderPointA(null);
        } else if (editor.outlinePoints.length > 0) {
          editor.clearOutlinePoints();
        } else {
          editor.clearSelection();
        }
        return;
    }
  }

  if (e.key === 'Delete' || e.key === 'Backspace') {
    if (editor.mode !== 'create') return;
    const el = e.target as HTMLElement | null;
    if (el?.closest?.('input, textarea, [contenteditable="true"]')) return;
    deleteSelectedEntities();
  }

  if ((e.ctrlKey || e.metaKey) && e.key === 'z') {
    if (e.shiftKey) mechanism.redo();
    else mechanism.undo();
  }
  if ((e.ctrlKey || e.metaKey) && e.key === 'y') {
    mechanism.redo();
  }
}
