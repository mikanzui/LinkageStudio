import React, { useEffect, useRef, useState } from 'react';
import { useEditorStore } from '../../store/editor-store';
import { useMechanismStore } from '../../store/mechanism-store';
import { computeBodyTransform, localToWorld } from '../../core/body-transform';

function getOrbitLayout(bodyCount: number) {
  // Match original arc body selector geometry
  const radius = bodyCount <= 1 ? 56 : 74;
  const perCircleDeg = 32;
  const maxSpanDeg = 250;
  const centerAngleDeg = 315;
  const spanDeg = Math.min(maxSpanDeg, Math.max(perCircleDeg, (bodyCount - 1) * perCircleDeg));
  const startAngleDeg = centerAngleDeg - spanDeg / 2;

  const positions: { x: number; y: number; angleDeg: number }[] = [];
  for (let i = 0; i < bodyCount; i++) {
    const t = bodyCount > 1 ? i / (bodyCount - 1) : 0;
    const angleDeg = startAngleDeg + spanDeg * t;
    const angleRad = (angleDeg - 90) * (Math.PI / 180);
    positions.push({
      x: Math.cos(angleRad) * radius,
      y: Math.sin(angleRad) * radius,
      angleDeg,
    });
  }

  const addAngleDeg = centerAngleDeg + spanDeg / 2 + perCircleDeg;
  const addAngleRad = (addAngleDeg - 90) * (Math.PI / 180);
  const addPos = {
    x: Math.cos(addAngleRad) * radius,
    y: Math.sin(addAngleRad) * radius,
    angleDeg: addAngleDeg,
  };

  return { positions, radius, addPos };
}

export function WorldContextMenu() {
  const menu = useEditorStore((s) => s.worldContextMenu);
  const closeMenu = useEditorStore((s) => s.setWorldContextMenu);
  const clearSelection = useEditorStore((s) => s.clearSelection);
  const setActiveBody = useEditorStore((s) => s.setActiveBody);
  const activeBodyIds = useEditorStore((s) => s.activeBodyIds);
  const camera = useEditorStore((s) => s.camera);

  const bodies = useMechanismStore((s) => s.bodies);
  const baseBodyId = useMechanismStore((s) => s.baseBodyId);
  const addBody = useMechanismStore((s) => s.addBody);
  const addJointToBody = useMechanismStore((s) => s.addJointToBody);
  const removeJointFromBody = useMechanismStore((s) => s.removeJointFromBody);
  const addBodyToCollider = useMechanismStore((s) => s.addBodyToCollider);
  const removeBodyFromCollider = useMechanismStore((s) => s.removeBodyFromCollider);
  const colliders = useMechanismStore((s) => s.colliders);
  const tracers = useMechanismStore((s) => s.tracers);
  const outlines = useMechanismStore((s) => s.outlines);
  const images = useMechanismStore((s) => s.images);
  const updateTracerBody = useMechanismStore((s) => s.updateTracerBody);
  const moveOutlineToBody = useMechanismStore((s) => s.moveOutlineToBody);
  const moveImageToBody = useMechanismStore((s) => s.moveImageToBody);
  const joints = useMechanismStore((s) => s.joints);
  const links = useMechanismStore((s) => s.links);
  const removeJoint = useMechanismStore((s) => s.removeJoint);
  const removeLink = useMechanismStore((s) => s.removeLink);
  const removeCollider = useMechanismStore((s) => s.removeCollider);
  const removeTracer = useMechanismStore((s) => s.removeTracer);
  const removeOutline = useMechanismStore((s) => s.removeOutline);
  const removeImage = useMechanismStore((s) => s.removeImage);
  const [isClosing, setIsClosing] = useState(false);
  const closeTimerRef = useRef<number | null>(null);
  const dragSnapLastBodyRef = useRef<string | null>(null);
  const dragReadyBodiesRef = useRef<Set<string>>(new Set());
  const primaryDownRef = useRef<boolean>(false);
  const didDragApplyRef = useRef<boolean>(false);
  const didActionApplyRef = useRef<boolean>(false);
  const dragSessionKeyRef = useRef<string | null>(null);
  const dragStartPointRef = useRef<{ x: number; y: number } | null>(null);
  const dragMovedRef = useRef<boolean>(false);
  /** Ignore stray capture-phase pointerdowns right after hold-menu mount (avoids instant close). */
  const holdMenuPointerDownGraceUntilRef = useRef<number>(0);

  const closeMenuAndClearSelection = () => {
    closeMenu(null);
    clearSelection();
  };

  const requestClose = () => {
    if (!menu || isClosing) return;
    setIsClosing(true);
    if (closeTimerRef.current) window.clearTimeout(closeTimerRef.current);
    closeTimerRef.current = window.setTimeout(() => {
      closeMenu(null);
      setIsClosing(false);
      closeTimerRef.current = null;
    }, 230);
  };

  useEffect(() => {
    if (!menu) return undefined;
    if (closeTimerRef.current) {
      window.clearTimeout(closeTimerRef.current);
      closeTimerRef.current = null;
    }
    setIsClosing(false);
    if (menu.openMode === 'hold') {
      // Hold-menu: pointer was down to open; release dismisses (see onPointerUp).
      primaryDownRef.current = true;
      holdMenuPointerDownGraceUntilRef.current = performance.now() + 120;
    } else {
      holdMenuPointerDownGraceUntilRef.current = 0;
    }

    const onGlobalPointerDown = (event: PointerEvent) => {
      if (
        menu.openMode === 'hold' &&
        performance.now() < holdMenuPointerDownGraceUntilRef.current
      ) {
        return;
      }
      const target = event.target as HTMLElement | null;
      // Only keep open when clicking actual interactive menu controls.
      const clickedInteractive = !!(
        target?.closest('.world-context-orbit-pill')
        || target?.closest('[data-world-context-action]')
      );
      if (clickedInteractive) return;
      requestClose();
    };

    const onEsc = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      event.preventDefault();
      event.stopPropagation();
      if (closeTimerRef.current) {
        window.clearTimeout(closeTimerRef.current);
        closeTimerRef.current = null;
      }
      setIsClosing(false);
      closeMenu(null);
    };
    const onPrimaryDown = (event: PointerEvent) => {
      if (event.button === 0) primaryDownRef.current = true;
    };
    const onPointerUp = (event: PointerEvent) => {
      if (event.button !== 0) return;
      primaryDownRef.current = false;
      if (menu.openMode === 'hold') {
        const action = getActionUnderPointer(event.clientX, event.clientY);
        if (action) {
          didActionApplyRef.current = true;
          executeOrbitAction(action);
          return;
        }
        requestClose();
      }
    };

    const onWheel = (event: WheelEvent) => {
      const target = event.target as HTMLElement | null;
      const insideMenuControl = !!(
        target?.closest('.world-context-orbit-pill')
        || target?.closest('[data-world-context-action]')
      );
      if (!insideMenuControl) requestClose();
    };

    const onResize = () => requestClose();

    const onVisibilityChange = () => {
      if (document.visibilityState === 'hidden') requestClose();
    };

    window.addEventListener('pointerdown', onGlobalPointerDown, true);
    window.addEventListener('keydown', onEsc);
    window.addEventListener('pointerdown', onPrimaryDown, true);
    window.addEventListener('pointerup', onPointerUp, true);
    window.addEventListener('wheel', onWheel, { capture: true, passive: true });
    window.addEventListener('resize', onResize);
    document.addEventListener('visibilitychange', onVisibilityChange);
    return () => {
      window.removeEventListener('pointerdown', onGlobalPointerDown, true);
      window.removeEventListener('keydown', onEsc);
      window.removeEventListener('pointerdown', onPrimaryDown, true);
      window.removeEventListener('pointerup', onPointerUp, true);
      window.removeEventListener('wheel', onWheel, { capture: true });
      window.removeEventListener('resize', onResize);
      document.removeEventListener('visibilitychange', onVisibilityChange);
    };
  }, [menu, closeMenu]);

  const worldToScreen = (x: number, y: number) => ({
    x: x * camera.zoom + camera.pan.x,
    y: y * camera.zoom + camera.pan.y,
  });

  const getAnchorScreenPosition = () => {
    if (!menu) return { x: 0, y: 0 };
    if (menu.targetType === 'joint') {
      const joint = joints[menu.targetId];
      if (!joint) return menu.screenPosition;
      return worldToScreen(joint.position.x, joint.position.y);
    }
    if (menu.targetType === 'link') {
      const link = links[menu.targetId];
      if (!link) return menu.screenPosition;
      const jA = joints[link.jointIds[0]];
      const jB = joints[link.jointIds[1]];
      if (!jA || !jB) return menu.screenPosition;
      const t = menu.linkClickT ?? 0.5;
      const x = jA.position.x + t * (jB.position.x - jA.position.x);
      const y = jA.position.y + t * (jB.position.y - jA.position.y);
      return worldToScreen(x, y);
    }
    if (menu.targetType === 'collider') {
      const collider = colliders[menu.targetId];
      if (!collider) return menu.screenPosition;
      const jA = joints[collider.jointIdA];
      const jC = joints[collider.jointIdC];
      if (!jA || !jC) return menu.screenPosition;
      return worldToScreen((jA.position.x + jC.position.x) * 0.5, (jA.position.y + jC.position.y) * 0.5);
    }
    if (menu.targetType === 'outline') {
      const outline = outlines[menu.targetId];
      if (!outline) return menu.screenPosition;
      const body = bodies[outline.bodyId];
      if (!body || outline.points.length === 0) return menu.screenPosition;
      const transform = computeBodyTransform(body, joints);
      const worldPts = outline.points.map((p) => localToWorld(p, transform));
      const center = worldPts.reduce((acc, p) => ({ x: acc.x + p.x, y: acc.y + p.y }), { x: 0, y: 0 });
      return worldToScreen(center.x / worldPts.length, center.y / worldPts.length);
    }
    if (menu.targetType === 'image') {
      const image = images[menu.targetId];
      if (!image) return menu.screenPosition;
      return worldToScreen(image.position.x, image.position.y);
    }
    const tracer = tracers[menu.targetId];
    if (!tracer) return menu.screenPosition;
    const body = bodies[tracer.bodyId];
    if (!body) return menu.screenPosition;
    const transform = computeBodyTransform(body, joints);
    const worldPt = localToWorld(tracer.localPosition, transform);
    return worldToScreen(worldPt.x, worldPt.y);
  };

  const anchor = getAnchorScreenPosition();

  const bodyList = Object.values(bodies).sort((a, b) => {
    if (a.id === baseBodyId) return -1;
    if (b.id === baseBodyId) return 1;
    return 0;
  });

  const createAndAssignBodyToJoint = (jointId: string) => {
    const newBodyId = addBody('Body');
    addJointToBody(jointId, newBodyId);
    setActiveBody(newBodyId);
  };

  const createAndAssignBodyToCollider = (colliderId: string) => {
    const newBodyId = addBody('Body');
    addBodyToCollider(colliderId, newBodyId);
    setActiveBody(newBodyId);
  };

  type OrbitAction = 'add-body' | 'delete-target';

  const executeOrbitAction = (action: OrbitAction) => {
    if (!menu) return;
    if (action === 'add-body') {
      if (menu.targetType === 'joint') createAndAssignBodyToJoint(menu.targetId);
      else if (menu.targetType === 'collider') createAndAssignBodyToCollider(menu.targetId);
      else if (menu.targetType === 'outline') {
        const newBodyId = addBody('Body');
        moveOutlineToBody(menu.targetId, newBodyId);
        setActiveBody(newBodyId);
      } else if (menu.targetType === 'image') {
        const newBodyId = addBody('Body');
        moveImageToBody(menu.targetId, newBodyId);
        setActiveBody(newBodyId);
      }
      return;
    }

    if (menu.targetType === 'joint') removeJoint(menu.targetId);
    else if (menu.targetType === 'collider') removeCollider(menu.targetId);
    else if (menu.targetType === 'link') removeLink(menu.targetId);
    else if (menu.targetType === 'tracer') removeTracer(menu.targetId);
    else if (menu.targetType === 'outline') removeOutline(menu.targetId);
    else removeImage(menu.targetId);
    closeMenuAndClearSelection();
  };

  const orbit = getOrbitLayout(bodyList.length);
  const getOrbitPoint = (angleDeg: number, radius = orbit.radius) => {
    const angleRad = (angleDeg - 90) * (Math.PI / 180);
    return {
      x: Math.cos(angleRad) * radius,
      y: Math.sin(angleRad) * radius,
      angleDeg,
    };
  };
  const deletePos = getOrbitPoint(135, orbit.radius + 8);

  const getActionUnderPointer = (clientX: number, clientY: number): OrbitAction | null => {
    const hitEl = document.elementFromPoint(clientX, clientY) as HTMLElement | null;
    const actionEl = hitEl?.closest('[data-world-context-action]') as HTMLElement | null;
    const action = actionEl?.dataset.worldContextAction;
    if (action === 'add-body' || action === 'delete-target') return action;

    // Pointer capture during hold-drag can make DOM targeting unreliable, so also
    // hit-test the radial controls by their known screen-space centers.
    const deleteDx = clientX - (anchor.x + deletePos.x);
    const deleteDy = clientY - (anchor.y + deletePos.y);
    if ((deleteDx * deleteDx + deleteDy * deleteDy) <= 24 * 24) return 'delete-target';

    const addDx = clientX - (anchor.x + orbit.addPos.x);
    const addDy = clientY - (anchor.y + orbit.addPos.y);
    if ((addDx * addDx + addDy * addDy) <= 18 * 18) return 'add-body';

    return null;
  };

  useEffect(() => {
    if (!menu || isClosing) return undefined;
    const sessionKey = `${menu.targetType}:${menu.targetId}:${menu.openMode}`;
    if (dragSessionKeyRef.current !== sessionKey) {
      dragSessionKeyRef.current = sessionKey;
      dragSnapLastBodyRef.current = null;
      dragReadyBodiesRef.current = new Set(bodyList.map((b) => b.id));
      didDragApplyRef.current = false;
      didActionApplyRef.current = false;
      dragStartPointRef.current = null;
      dragMovedRef.current = false;
    }

    /** Hold-drag toggle only when the pointer is over a body pill, not near orbit points on the canvas. */
    const getBodyIdUnderPill = (clientX: number, clientY: number): string | null => {
      const hitEl = document.elementFromPoint(clientX, clientY) as HTMLElement | null;
      const hitPill = hitEl?.closest('.world-context-orbit-pill') as HTMLElement | null;
      if (hitPill?.dataset.bodyId) return hitPill.dataset.bodyId;

      // During long-press, canvas pointer capture can make DOM hit-testing flaky.
      // Fall back to the known radial pill positions so sweeping across bodies
      // still assigns them as the pointer passes over each label.
      let bestBodyId: string | null = null;
      let bestD2 = Infinity;
      bodyList.forEach((body, index) => {
        const pos = orbit.positions[index];
        if (!pos) return;
        const dx = clientX - (anchor.x + pos.x);
        const dy = clientY - (anchor.y + pos.y);
        const d2 = dx * dx + dy * dy;
        if (d2 <= 34 * 34 && d2 < bestD2) {
          bestBodyId = body.id;
          bestD2 = d2;
        }
      });
      return bestBodyId;
    };

    const applyBodySelection = (nearestBodyId: string, mech: ReturnType<typeof useMechanismStore.getState>, _mode: 'hold' | 'context') => {
      if (menu.targetType === 'joint') {
        const body = mech.bodies[nearestBodyId];
        if (!body) return;
        const hasJoint = body.jointIds.includes(menu.targetId);
        if (hasJoint) mech.removeJointFromBody(menu.targetId, nearestBodyId);
        else mech.addJointToBody(menu.targetId, nearestBodyId);
      } else if (menu.targetType === 'collider') {
        const collider = mech.colliders[menu.targetId];
        if (!collider) return;
        const hasBody = collider.bodyIds.includes(nearestBodyId);
        if (hasBody) mech.removeBodyFromCollider(menu.targetId, nearestBodyId);
        else mech.addBodyToCollider(menu.targetId, nearestBodyId);
      } else if (menu.targetType === 'tracer') {
        const tracer = mech.tracers[menu.targetId];
        if (!tracer) return;
        if (tracer.bodyId !== nearestBodyId) mech.updateTracerBody(menu.targetId, nearestBodyId);
      } else if (menu.targetType === 'outline') {
        if (mech.outlines[menu.targetId]) mech.moveOutlineToBody(menu.targetId, nearestBodyId);
      } else if (menu.targetType === 'image') {
        if (mech.images[menu.targetId]) mech.moveImageToBody(menu.targetId, nearestBodyId);
      }
    };

    const handleDragSnap = (clientX: number, clientY: number, buttons: number) => {
      if (didActionApplyRef.current) return;
      const isDragGestureActive = primaryDownRef.current || (buttons & 1) === 1;
      if (!isDragGestureActive) {
        dragSnapLastBodyRef.current = null;
        dragReadyBodiesRef.current = new Set(bodyList.map((b) => b.id));
        dragStartPointRef.current = null;
        dragMovedRef.current = false;
        return;
      }

      if (menu.openMode === 'hold') {
        dragMovedRef.current = true;
      }

      const mech = useMechanismStore.getState();
      const nearestBodyId = getBodyIdUnderPill(clientX, clientY);

      if (!nearestBodyId) {
        dragSnapLastBodyRef.current = null;
        dragReadyBodiesRef.current = new Set(bodyList.map((b) => b.id));
        return;
      }
      if (!dragReadyBodiesRef.current.has(nearestBodyId)) return;
      if (dragSnapLastBodyRef.current === nearestBodyId) return;
      applyBodySelection(nearestBodyId, mech, menu.openMode);
      didDragApplyRef.current = true;

      dragSnapLastBodyRef.current = nearestBodyId;
      const nextReady = new Set(dragReadyBodiesRef.current);
      nextReady.delete(nearestBodyId);
      dragReadyBodiesRef.current = nextReady;
    };

    const onPointerMove = (event: PointerEvent) => {
      handleDragSnap(event.clientX, event.clientY, event.buttons);
    };
    const onPointerUpSnap = (event: PointerEvent) => {
      if (didActionApplyRef.current) return;
      if (menu.openMode !== 'hold') return;
      const action = getActionUnderPointer(event.clientX, event.clientY);
      if (action) {
        didActionApplyRef.current = true;
        executeOrbitAction(action);
        didDragApplyRef.current = true;
        requestClose();
        return;
      }
      // No actual drag gesture: don't apply body assignments on release.
      if (!dragMovedRef.current) return;
      // If a body already snapped during this hold gesture, don't apply it again
      // on release. Explicit action targets above still win when hovered.
      if (didDragApplyRef.current) return;
      const nearestBodyId = getBodyIdUnderPill(event.clientX, event.clientY);
      if (!nearestBodyId) return;
      // Avoid double-toggle when drag already snapped this same body.
      if (dragSnapLastBodyRef.current === nearestBodyId) return;
      const mech = useMechanismStore.getState();
      applyBodySelection(nearestBodyId, mech, menu.openMode);
      dragSnapLastBodyRef.current = nearestBodyId;
    };

    window.addEventListener('pointermove', onPointerMove, true);
    window.addEventListener('pointerup', onPointerUpSnap, true);
    return () => {
      window.removeEventListener('pointermove', onPointerMove, true);
      window.removeEventListener('pointerup', onPointerUpSnap, true);
    };
  }, [menu, isClosing, bodyList]);

  if (!menu) return null;

  const renderBodyOrbitNode = (
    body: (typeof bodyList)[number],
    index: number,
    selected: boolean,
    onToggle: () => void,
  ) => {
    const isActive = activeBodyIds.has(body.id);
    const isJointBaseAction = menu.targetType === 'joint' && body.id === baseBodyId;
    const pos = orbit.positions[index] ?? { x: 0, y: 0 };
    const lineLen = Math.max(0, Math.sqrt(pos.x * pos.x + pos.y * pos.y) - 14);
    const lineAngle = Math.atan2(pos.y, pos.x);
    // Mount combined dot+label pill at orbit point, with dot aimed toward center.
    const labelX = pos.x;
    const labelY = pos.y;
    const norm = Math.sqrt(pos.x * pos.x + pos.y * pos.y) || 1;
    const inwardX = -pos.x / norm;
    const inwardY = -pos.y / norm;
    const dotNearCenter = inwardX < 0 ? 'dot-left' : 'dot-right';
    // Align pill axis parallel to the radial line toward center.
    const angleDeg = (lineAngle * 180) / Math.PI;
    const radialDeg = angleDeg > 90 || angleDeg < -90 ? angleDeg + 180 : angleDeg;

    return (
      <div key={body.id} className="world-context-orbit-item">
        <span
          className="world-context-orbit-line"
          style={{
            left: '50%',
            top: '50%',
            width: `${lineLen}px`,
            transform: `translate(0, -50%) rotate(${lineAngle}rad)`,
            animationDelay: `${index * 38}ms`,
          }}
        />
        <button
          className={`world-context-orbit-pill ${selected ? 'selected' : ''} ${isActive ? 'active' : ''} ${dotNearCenter}`}
          data-body-id={body.id}
          style={{
            left: `calc(50% + ${labelX}px)`,
            top: `calc(50% + ${labelY}px)`,
            animationDelay: `${index * 38}ms`,
            '--orbit-x': `${labelX}px`,
            '--orbit-y': `${labelY}px`,
            '--pill-rot': `${radialDeg}deg`,
            '--inward-x': `${inwardX}`,
            '--inward-y': `${inwardY}`,
          } as React.CSSProperties}
          onClick={onToggle}
          title={isJointBaseAction ? (selected ? 'Set Revolute' : 'Set Fixed') : `Toggle ${body.name}`}
        >
          <span className="world-context-orbit-pill-dot" style={{ background: body.color }} />
          <span>{body.name}</span>
        </button>
      </div>
    );
  };

  let orbitNodes: React.JSX.Element[] = [];
  if (menu.targetType === 'joint') {
    const jointId = menu.targetId;
    orbitNodes = bodyList.map((body, index) =>
            renderBodyOrbitNode(body, index, body.jointIds.includes(jointId), () => {
              if (body.jointIds.includes(jointId)) removeJointFromBody(jointId, body.id);
              else addJointToBody(jointId, body.id);
            }),
    );
  } else if (menu.targetType === 'collider') {
    const collider = colliders[menu.targetId];
    if (collider) {
      orbitNodes = bodyList.map((body, index) =>
            renderBodyOrbitNode(body, index, collider.bodyIds.includes(body.id), () => {
              if (collider.bodyIds.includes(body.id)) removeBodyFromCollider(collider.id, body.id);
              else addBodyToCollider(collider.id, body.id);
            }),
      );
    }
  } else if (menu.targetType === 'tracer') {
    const tracer = tracers[menu.targetId];
    if (tracer) {
      orbitNodes = bodyList.map((body, index) =>
            renderBodyOrbitNode(body, index, tracer.bodyId === body.id, () => updateTracerBody(tracer.id, body.id)),
      );
    }
  } else if (menu.targetType === 'outline') {
    const outline = outlines[menu.targetId];
    if (outline) {
      orbitNodes = bodyList.map((body, index) =>
            renderBodyOrbitNode(body, index, outline.bodyId === body.id, () => moveOutlineToBody(outline.id, body.id)),
      );
    }
  } else if (menu.targetType === 'image') {
    const image = images[menu.targetId];
    if (image) {
      orbitNodes = bodyList.map((body, index) =>
            renderBodyOrbitNode(body, index, image.bodyId === body.id, () => moveImageToBody(image.id, body.id)),
      );
    }
  }

  const addBodyControl = (
    <button
      className="world-context-add-body-dot"
      data-world-context-action="add-body"
      style={{
        left: `calc(50% + ${orbit.addPos.x}px)`,
        top: `calc(50% + ${orbit.addPos.y}px)`,
        '--orbit-x': `${orbit.addPos.x}px`,
        '--orbit-y': `${orbit.addPos.y}px`,
      } as React.CSSProperties}
      onClick={() => executeOrbitAction('add-body')}
      title="Add Body"
    >
      +
    </button>
  );

  const deleteActionControl = (
    <button
      className="world-context-action-btn world-context-action-btn--danger"
      data-world-context-action="delete-target"
      style={{
        left: `calc(50% + ${deletePos.x}px)`,
        top: `calc(50% + ${deletePos.y}px)`,
        '--orbit-x': `${deletePos.x}px`,
        '--orbit-y': `${deletePos.y}px`,
      } as React.CSSProperties}
      onClick={() => executeOrbitAction('delete-target')}
      title={`Delete ${menu.targetType === 'outline' ? 'shape' : menu.targetType === 'tracer' ? 'path plotter' : menu.targetType}`}
      aria-label={`Delete ${menu.targetType === 'outline' ? 'shape' : menu.targetType === 'tracer' ? 'path plotter' : menu.targetType}`}
    >
      <svg width="18" height="18" viewBox="0 0 18 18" aria-hidden>
        <path d="M6 6.5V14" />
        <path d="M12 6.5V14" />
        <path d="M4.5 5H13.5" />
        <path d="M7 5V3.5H11V5" />
        <path d="M5.5 5L6.1 15H11.9L12.5 5" />
      </svg>
    </button>
  );

  return (
    <div
      className={`world-context-menu ${isClosing ? 'closing' : ''}`}
      style={{
        left: anchor.x,
        top: anchor.y,
      }}
      onContextMenu={(e) => e.preventDefault()}
    >
      <div className="world-context-center-pulse" style={{ width: `${orbit.radius * 2 + 54}px`, height: `${orbit.radius * 2 + 54}px` }} />
      <div className="world-context-orbit">
        {orbitNodes}
        {menu.targetType !== 'tracer' && menu.targetType !== 'link' && addBodyControl}
        {deleteActionControl}
      </div>
    </div>
  );
}
