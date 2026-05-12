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
  const toggleActiveBody = useEditorStore((s) => s.toggleActiveBody);
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
  const updateTracerBody = useMechanismStore((s) => s.updateTracerBody);
  const joints = useMechanismStore((s) => s.joints);
  const links = useMechanismStore((s) => s.links);
  const removeJoint = useMechanismStore((s) => s.removeJoint);
  const removeLink = useMechanismStore((s) => s.removeLink);
  const removeCollider = useMechanismStore((s) => s.removeCollider);
  const removeTracer = useMechanismStore((s) => s.removeTracer);
  const [isClosing, setIsClosing] = useState(false);
  const closeTimerRef = useRef<number | null>(null);
  const dragSnapLastBodyRef = useRef<string | null>(null);
  const dragReadyBodiesRef = useRef<Set<string>>(new Set());
  const primaryDownRef = useRef<boolean>(false);
  const didDragApplyRef = useRef<boolean>(false);
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
        target?.closest('.world-context-hub')
        || target?.closest('.world-context-orbit-pill')
        || target?.closest('.world-context-add-body-dot')
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
      if (menu.openMode === 'hold') requestClose();
    };

    const onWheel = (event: WheelEvent) => {
      const target = event.target as HTMLElement | null;
      const insideHub = !!target?.closest('.world-context-hub');
      if (!insideHub) requestClose();
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

  const orbit = getOrbitLayout(bodyList.length);
  const maxOrbitY = Math.max(
    ...orbit.positions.map((p) => p.y),
    orbit.addPos.y,
  );
  const hubTopPx = Math.max(orbit.radius + 96, maxOrbitY + 122);

  useEffect(() => {
    if (!menu || isClosing) return undefined;
    const sessionKey = `${menu.targetType}:${menu.targetId}:${menu.openMode}`;
    if (dragSessionKeyRef.current !== sessionKey) {
      dragSessionKeyRef.current = sessionKey;
      dragSnapLastBodyRef.current = null;
      dragReadyBodiesRef.current = new Set(bodyList.map((b) => b.id));
      didDragApplyRef.current = false;
      dragStartPointRef.current = null;
      dragMovedRef.current = false;
    }

    /** Hold-drag toggle only when the pointer is over a body pill, not near orbit points on the canvas. */
    const getBodyIdUnderPill = (clientX: number, clientY: number): string | null => {
      const hitEl = document.elementFromPoint(clientX, clientY) as HTMLElement | null;
      const hitPill = hitEl?.closest('.world-context-orbit-pill') as HTMLElement | null;
      return hitPill?.dataset.bodyId ?? null;
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
      } else {
        const tracer = mech.tracers[menu.targetId];
        if (!tracer) return;
        if (tracer.bodyId !== nearestBodyId) mech.updateTracerBody(menu.targetId, nearestBodyId);
      }
    };

    const handleDragSnap = (clientX: number, clientY: number, buttons: number) => {
      const isDragGestureActive = primaryDownRef.current || (buttons & 1) === 1;
      if (!isDragGestureActive) {
        dragSnapLastBodyRef.current = null;
        dragReadyBodiesRef.current = new Set(bodyList.map((b) => b.id));
        dragStartPointRef.current = null;
        dragMovedRef.current = false;
        return;
      }

      if (menu.openMode === 'hold' && !dragMovedRef.current) {
        const start = dragStartPointRef.current;
        if (!start) {
          dragStartPointRef.current = { x: clientX, y: clientY };
          return;
        }
        const dx = clientX - start.x;
        const dy = clientY - start.y;
        if ((dx * dx + dy * dy) < 36) return; // ~6px movement threshold
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
      if (menu.openMode !== 'hold') return;
      // No actual drag gesture: don't apply anything on release.
      if (!dragMovedRef.current) return;
      // If drag already snapped, don't apply again on release.
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
          title={`Toggle ${body.name}`}
        >
          <span className="world-context-orbit-pill-dot" style={{ background: body.color }} />
          {body.name}
        </button>
      </div>
    );
  };

  const renderJointMenu = (): React.JSX.Element => {
    const jointId = menu.targetId;
    const inBase = bodies[baseBodyId]?.jointIds.includes(jointId) ?? false;
    return (
      <>
        <div className="world-context-hub-title">Joint</div>
        <div className="world-context-hub-tools">
          <button
            className="world-context-hub-btn"
            onClick={() => {
              if (inBase) removeJointFromBody(jointId, baseBodyId);
              else addJointToBody(jointId, baseBodyId);
            }}
          >
            {inBase ? 'Set Revolute' : 'Set Fixed'}
          </button>
          <button className="world-context-hub-btn" onClick={() => createAndAssignBodyToJoint(jointId)}>
            + New Body
          </button>
          <button
            type="button"
            className="world-context-hub-btn world-context-hub-btn--danger"
            onClick={() => {
              removeJoint(jointId);
              closeMenuAndClearSelection();
            }}
          >
            Delete joint
          </button>
        </div>
        <div className="world-context-menu-hints radial">
          <span><kbd>Esc</kbd> close</span>
          <span>Bodies use accent highlight when enabled</span>
          <span>Use + New Body to append and attach</span>
          <span>Linear spring tool â€” joint/link endpoints only</span>
        </div>
      </>
    );
  };

  const renderColliderMenu = (): React.JSX.Element | null => {
    const collider = colliders[menu.targetId];
    if (!collider) return null;
    return (
      <>
        <div className="world-context-hub-title">Collider</div>
        <div className="world-context-hub-tools">
          <button className="world-context-hub-btn" onClick={() => createAndAssignBodyToCollider(collider.id)}>
            + New Body
          </button>
          <button
            type="button"
            className="world-context-hub-btn world-context-hub-btn--danger"
            onClick={() => {
              removeCollider(collider.id);
              closeMenuAndClearSelection();
            }}
          >
            Delete collider
          </button>
        </div>
        <div className="world-context-menu-hints radial">
          <span><kbd>Esc</kbd> close</span>
          <span>Highlighted bodies are blocked by this barrier</span>
          <span>Use + New Body to quickly include a new part</span>
        </div>
      </>
    );
  };

  const renderLinkMenu = (): React.JSX.Element | null => {
    const link = links[menu.targetId];
    if (!link) return null;
    return (
      <>
        <div className="world-context-hub-title">Link</div>
        <div className="world-context-hub-tools">
          <button
            type="button"
            className="world-context-hub-btn world-context-hub-btn--danger"
            onClick={() => {
              removeLink(link.id);
              closeMenuAndClearSelection();
            }}
          >
            Delete link
          </button>
        </div>
        <div className="world-context-menu-hints radial" style={{ paddingTop: 6 }}>
          <span><kbd>Esc</kbd> close</span>
          <span>Linear spring tool â†’ Link â†” link or Joint â†” link</span>
        </div>
      </>
    );
  };

  const renderTracerMenu = (): React.JSX.Element | null => {
    const tracer = tracers[menu.targetId];
    if (!tracer) return null;
    return (
      <>
        <div className="world-context-hub-title">Path Plotter</div>
        <div className="world-context-hub-tools">
          <button className="world-context-hub-btn" onClick={() => toggleActiveBody(tracer.bodyId)}>
            Toggle Active Route Body
          </button>
          <button
            type="button"
            className="world-context-hub-btn world-context-hub-btn--danger"
            onClick={() => {
              removeTracer(tracer.id);
              closeMenuAndClearSelection();
            }}
          >
            Delete path plotter
          </button>
        </div>
        <div className="world-context-menu-hints radial">
          <span><kbd>Esc</kbd> close</span>
          <span>Tracer follows selected body frame</span>
          <span>Accent-highlighted body is the route</span>
        </div>
      </>
    );
  };

  let content: React.JSX.Element | null = null;
  let orbitNodes: React.JSX.Element[] = [];
  if (menu.targetType === 'joint') content = renderJointMenu();
  else if (menu.targetType === 'collider') content = renderColliderMenu();
  else if (menu.targetType === 'link') content = renderLinkMenu();
  else content = renderTracerMenu();

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
  }

  const addBodyControl = (
    <button
      className="world-context-add-body-dot"
      style={{
        left: `calc(50% + ${orbit.addPos.x}px)`,
        top: `calc(50% + ${orbit.addPos.y}px)`,
        '--orbit-x': `${orbit.addPos.x}px`,
        '--orbit-y': `${orbit.addPos.y}px`,
      } as React.CSSProperties}
      onClick={() => {
        if (menu.targetType === 'joint') createAndAssignBodyToJoint(menu.targetId);
        else if (menu.targetType === 'collider') createAndAssignBodyToCollider(menu.targetId);
      }}
      title="Add Body"
    >
      +
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
      </div>
      <div className="world-context-hub" style={{ top: `calc(50% + ${hubTopPx}px)` }}>
        {content}
      </div>
    </div>
  );
}
