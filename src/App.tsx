import { useEffect, useRef, useState, useCallback } from 'react';
import { useMsal, useIsAuthenticated } from '@azure/msal-react';
import { Layout } from './components/Layout';
import { SplashScreen } from './components/SplashScreen';
import { ProjectsPage } from './pages/ProjectsPage';
import { useMechanismStore } from './store/mechanism-store';
import { useSimulationStore } from './store/simulation-store';
import { useEditorStore } from './store/editor-store';
import { solve, solveWithForce, resetVelocities } from './core/solver/newton-raphson';
import { computeDOF } from './core/solver/dof';
import { computeDriverAngle } from './core/solver/driver';
import { angleBetween } from './core/math/vec2';
import { SIM_DT, mergeSolverConfig, simulatePbdSubstepsForFrameDt } from './utils/constants';
import { jointPositionsFinite } from './utils/solver-commit-guards';
import { validateMechanismForSimulateStep } from './utils/mechanism-sim-validation';
import { computeBodyTransform, localToWorld, polygonCentroid, polygonArea } from './core/body-transform';
import { loadProject } from './services/onedrive';
import { deserializeMechanism, openFilePicker } from './utils/file-io';
import { startAutosave, stopAutosave, resetAutosaveHash } from './services/autosave';
import type { GridLevel } from './types';

type AppPage = 'projects' | 'editor';

function useHashRoute(): [AppPage, (page: AppPage) => void] {
  const getPage = (): AppPage => {
    const hash = window.location.hash;
    if (hash === '#/editor' || hash.startsWith('#/editor?')) return 'editor';
    return 'projects';
  };
  const [page, setPage] = useState<AppPage>(getPage);
  useEffect(() => {
    const onHash = () => setPage(getPage());
    window.addEventListener('hashchange', onHash);
    return () => window.removeEventListener('hashchange', onHash);
  }, []);
  const navigate = (p: AppPage) => {
    window.location.hash = p === 'projects' ? '#/' : '#/editor';
  };
  return [page, navigate];
}

function App() {
  const [page, navigate] = useHashRoute();
  const { instance, accounts } = useMsal();
  const isAuthenticated = useIsAuthenticated();
  const account = accounts[0] ?? null;
  const initialAngleRef = useRef<number | null>(null);
  const colliderSidesRef = useRef<Map<string, number> | null>(null);
  const lastModeRef = useRef<string>('create');

  useEffect(() => {
    const tick = () => {
      try {
      const sim = useSimulationStore.getState();
      const mech = useMechanismStore.getState();
      const editor = useEditorStore.getState();

      // Compute fixed joint IDs from base body
      const baseBody = mech.bodies[mech.baseBodyId];
      const fixedJointIds = new Set<string>(baseBody?.jointIds ?? []);

      // Always compute DOF
      const dof = computeDOF(mech.joints, mech.links, !!sim.driverJointId, fixedJointIds, mech.sliders);
      if (dof !== sim.dof) sim.setDof(dof);

      // --- SIMULATE MODE ---
      if (editor.mode === 'simulate') {
        const simDt = SIM_DT * sim.speed;

        const precheck = validateMechanismForSimulateStep(
          mech.joints,
          mech.links,
          mech.sliders,
          mech.colliders,
        );
        if (!precheck.ok) {
          sim.setStepError(precheck.reason ?? 'Mechanism failed validation.');
          sim.pause();
          return;
        }

        // Build pull force from sim drag (link-based, direct on slider B, joint-only, or stale linkId fallback via simGrabJointId)
        const sd = editor.simDrag;
        const pullForce =
          sd?.active && (sd.linkId || sd.directJointId || sd.jointId)
            ? {
                linkId: sd.linkId,
                grabT: sd.grabT,
                target: sd.cursorPoint,
                directJointId: sd.directJointId ?? undefined,
                simGrabJointId: sd.jointId,
              }
            : null;

        // Compute gravity weights from body outline COMs
        // When useOutlineCOM is enabled, mass is proportional to outline area and
        // gravity is distributed to joints based on COM position relative to joints.
        let jointGravityWeights: Map<string, number> | undefined;
        const bodiesWithCOM = Object.values(mech.bodies).filter((b) => b.useOutlineCOM);
        if (bodiesWithCOM.length > 0 && sim.gravityEnabled) {
          jointGravityWeights = new Map();
          for (const body of bodiesWithCOM) {
            const bodyOutlines = Object.values(mech.outlines).filter((o) => o.bodyId === body.id && o.points.length >= 3);
            if (bodyOutlines.length === 0) continue;

            const transform = computeBodyTransform(body, mech.joints);
            // Area-weighted centroid across all outlines for this body
            let totalArea = 0, comX = 0, comY = 0;
            for (const outline of bodyOutlines) {
              const worldPts = outline.points.map((p) => localToWorld(p, transform));
              const a = polygonArea(worldPts);
              const c = polygonCentroid(worldPts);
              totalArea += a;
              comX += c.x * a;
              comY += c.y * a;
            }
            const com = totalArea > 1e-10 ? { x: comX / totalArea, y: comY / totalArea } : polygonCentroid(bodyOutlines[0].points.map((p) => localToWorld(p, transform)));
            const area = totalArea;
            const massMult = Math.max(0.1, area / 5000);

            // Find free joints in this body
            const freeIds = body.jointIds.filter((jid) => !fixedJointIds.has(jid) && mech.joints[jid]);
            if (freeIds.length < 2) {
              for (const jid of freeIds) jointGravityWeights.set(jid, massMult);
              continue;
            }

            // For 2 joints: project COM onto line to get parametric t, distribute mass
            if (freeIds.length === 2) {
              const pA = mech.joints[freeIds[0]].position;
              const pB = mech.joints[freeIds[1]].position;
              const dx = pB.x - pA.x, dy = pB.y - pA.y;
              const lenSq = dx * dx + dy * dy;
              let t = 0.5;
              if (lenSq > 1e-8) {
                t = Math.max(0, Math.min(1, ((com.x - pA.x) * dx + (com.y - pA.y) * dy) / lenSq));
              }
              // Distribute mass * 2 proportionally (total = 2 * massMult)
              jointGravityWeights.set(freeIds[0], 2 * massMult * (1 - t));
              jointGravityWeights.set(freeIds[1], 2 * massMult * t);
            } else {
              // 3+ joints — distribute mass equally
              const perJoint = (freeIds.length > 0) ? (massMult * freeIds.length) / freeIds.length : massMult;
              for (const jid of freeIds) jointGravityWeights.set(jid, perJoint);
            }
          }
        }

        // Build per-body joint sets for CoM bodies (to suppress per-link gravity vectors)
        let comBodyJointSets: Set<string>[] | undefined;
        if (bodiesWithCOM.length > 0) {
          comBodyJointSets = bodiesWithCOM.map((b) => new Set(b.jointIds));
        }

        // Compute collider initial sides on first simulate frame
        if (lastModeRef.current !== 'simulate') {
          colliderSidesRef.current = null;
        }
        lastModeRef.current = 'simulate';

        if (!colliderSidesRef.current && Object.keys(mech.colliders).length > 0) {
          const sides = new Map<string, number>();
          for (const collider of Object.values(mech.colliders)) {
            const jA = mech.joints[collider.jointIdA];
            const jC = mech.joints[collider.jointIdC];
            if (!jA || !jC) continue;
            const dx = jC.position.x - jA.position.x;
            const dy = jC.position.y - jA.position.y;
            const len = Math.sqrt(dx * dx + dy * dy);
            if (len < 1e-6) continue;
            const nx = -dy / len, ny = dx / len;

            for (const bodyId of collider.bodyIds) {
              const body = mech.bodies[bodyId];
              if (!body) continue;
              for (const jid of body.jointIds) {
                if (jid === collider.jointIdA || jid === collider.jointIdC) continue;
                const j = mech.joints[jid];
                if (!j) continue;
                const apx = j.position.x - jA.position.x;
                const apy = j.position.y - jA.position.y;
                const signedDist = apx * nx + apy * ny;
                sides.set(`${collider.id}:${jid}`, signedDist > 0 ? 1 : signedDist < 0 ? -1 : 0);
              }
            }
          }
          colliderSidesRef.current = sides;
        }

        const result = solveWithForce(
          mech.joints,
          mech.links,
          { enabled: sim.gravityEnabled, strength: sim.gravityStrength },
          pullForce,
          sim.damping,
          sim.dragMultiplier,
          sim.dragDamping,
          simDt,
          fixedJointIds,
          jointGravityWeights,
          mech.sliders,
          mech.angleConstraints,
          mech.colliders,
          colliderSidesRef.current ?? undefined,
          mech.springs,
          mech.bodies,
          comBodyJointSets,
          mergeSolverConfig({ pbdSubsteps: simulatePbdSubstepsForFrameDt(simDt) }),
        );

        sim.setSolverResult(result);

        const finite = jointPositionsFinite(result.positions);
        const stable = result.simulateStable !== false && finite;
        if (stable && (result.converged || result.residual < 1)) {
          sim.setStepError(null);
          sim.advanceTime(simDt);
          for (const [jointId, pos] of result.positions) {
            if (mech.joints[jointId] && !fixedJointIds.has(jointId)) {
              mech.moveJoint(jointId, pos);
            }
          }
          // Record traces
          if (sim.tracingEnabled) {
            for (const jointId of sim.trackedJointIds) {
              const pos = result.positions.get(jointId);
              if (pos) sim.recordTrace(jointId, pos);
            }
          }
          // Record tracer paths
          for (const tracer of Object.values(mech.tracers)) {
            if (!tracer.enabled) continue;
            const body = mech.bodies[tracer.bodyId];
            if (!body) continue;
            const transform = computeBodyTransform(body, mech.joints);
            const worldPt = localToWorld(tracer.localPosition, transform);
            sim.recordTracerTrace(tracer.id, worldPt);
          }
          // Record force sensor data
          if (result.forceAnalysis) {
            for (const sensor of Object.values(mech.forceSensors)) {
              if (!sensor.enabled) continue;
              const lf = result.forceAnalysis.linkForces.get(sensor.linkId);
              const force = lf ? lf.axialForce : 0;
              sim.recordForceSensorData(sensor.id, sim.time, force);
            }
          }
        } else {
          if (!finite || result.simulateStable === false) {
            sim.setStepError(
              !finite
                ? 'Simulation produced non-finite coordinates. Playback paused.'
                : 'Simulation step unstable (excessive motion or constraint error). Try lower Speed or Damping, or reduce spring stiffness. Playback paused.',
            );
            sim.pause();
          }
        }
        return;
      }

      // --- CREATE MODE (motor driver playback) ---
      lastModeRef.current = 'create';
      if (!sim.isPlaying || !sim.driverJointId || !sim.driverLinkId) return;

      const link = mech.links[sim.driverLinkId];
      if (!link) {
        sim.setStepError('Motor driver link is missing. Choose a valid driver link.');
        sim.pause();
        return;
      }

      const fixedJointId = link.jointIds.find((jid) => fixedJointIds.has(jid));
      const drivenJointId = link.jointIds.find((jid) => jid !== fixedJointId);
      if (!fixedJointId || !drivenJointId) {
        sim.setStepError(
          'Motor link must connect the red base body to a driven joint. Pick a link that touches the base (fixed) body.',
        );
        sim.pause();
        return;
      }

      if (initialAngleRef.current === null) {
        const fj = mech.joints[fixedJointId];
        const dj = mech.joints[drivenJointId];
        initialAngleRef.current = angleBetween(fj.position, dj.position);
      }

      const motorDt = SIM_DT * sim.speed;
      const proposedTime = sim.time + motorDt;
      const targetAngle = computeDriverAngle(proposedTime, sim.speed, initialAngleRef.current);

      const result = solve(mech.joints, mech.links, {
        fixedJointId,
        drivenJointId,
        targetAngle,
      }, fixedJointIds);

      sim.setSolverResult(result);

      const motorOk = result.converged && jointPositionsFinite(result.positions);
      if (motorOk) {
        sim.setStepError(null);
        sim.advanceTime(motorDt);
        sim.setDriverAngle(targetAngle);
        for (const [jointId, pos] of result.positions) {
          if (mech.joints[jointId] && !fixedJointIds.has(jointId)) {
            mech.moveJoint(jointId, pos);
          }
        }
        if (sim.tracingEnabled) {
          for (const jointId of sim.trackedJointIds) {
            const pos = result.positions.get(jointId);
            if (pos) sim.recordTrace(jointId, pos);
          }
        }
      } else {
        sim.setStepError(
          jointPositionsFinite(result.positions)
            ? 'Kinematics did not converge this frame. Try a different pose, add constraints, or check DOF. Playback paused.'
            : 'Motor solve produced non-finite coordinates. Playback paused.',
        );
        sim.pause();
      }
      } catch (e) {
        console.error('Simulation tick error:', e);
        try {
          const simErr = useSimulationStore.getState();
          const hint =
            e instanceof Error ? e.message : typeof e === 'string' ? e : 'unexpected error';
          simErr.setStepError(
            `Simulation tick failed (${hint}). Playback paused — see console for detail.`,
          );
          simErr.pause();
        } catch {
          /* store unavailable — logged above */
        }
      }
    };

    const intervalId = setInterval(tick, SIM_DT * 1000);
    return () => clearInterval(intervalId);
  }, []);

  // Reset initial angle when driver changes
  useEffect(() => {
    const unsub = useSimulationStore.subscribe((state, prevState) => {
      if (state.driverJointId !== prevState.driverJointId) {
        initialAngleRef.current = null;
      }
    });
    return unsub;
  }, []);

  // Reset velocities when entering simulate mode
  useEffect(() => {
    const unsub = useEditorStore.subscribe((state, prevState) => {
      if (state.mode === 'simulate' && prevState.mode !== 'simulate') {
        resetVelocities();
      }
    });
    return unsub;
  }, []);

  // Start/stop autosave when authenticated + in editor
  useEffect(() => {
    if (page === 'editor' && isAuthenticated && account) {
      const editor = useEditorStore.getState();
      if (editor.oneDriveFileId && editor.autoSaveEnabled) {
        startAutosave(instance, account);
      }
    }
    return () => stopAutosave();
  }, [page, isAuthenticated, account, instance]);

  const applyLoadedState = useCallback((state: ReturnType<typeof deserializeMechanism>) => {
    if (!state) return;
    const loadState = useMechanismStore.getState().loadState;
    loadState(state);
    useEditorStore.getState().clearSelection();
    if (state.projectName) useEditorStore.getState().setProjectName(state.projectName);
    if (state.viewPreferences) {
      const vp = state.viewPreferences;
      const editor = useEditorStore.getState();
      if (vp.showLinks !== undefined && vp.showLinks !== editor.showLinks) editor.toggleShowLinks();
      if (vp.showVectors !== undefined && vp.showVectors !== editor.showVectors) editor.toggleShowVectors();
      if (vp.showRulers !== undefined && vp.showRulers !== editor.showRulers) editor.toggleShowRulers();
      if (vp.showForceUnits !== undefined && vp.showForceUnits !== editor.showForceUnits) editor.toggleShowForceUnits();
      if (vp.outlineSimGrabInteriorWithJoints !== undefined) {
        useEditorStore.setState({ outlineSimGrabInteriorWithJoints: vp.outlineSimGrabInteriorWithJoints });
      }
      if (vp.gridLevel) editor.setGridLevel(vp.gridLevel as GridLevel);
      if (vp.camera) useEditorStore.setState({ camera: { pan: vp.camera.pan, zoom: vp.camera.zoom } });
    }
    if (state.simulationSettings) {
      const ss = state.simulationSettings;
      const sim = useSimulationStore.getState();
      if (ss.gravityEnabled !== undefined && ss.gravityEnabled !== sim.gravityEnabled) sim.toggleGravity();
      if (ss.gravityStrength !== undefined) sim.setGravityStrength(ss.gravityStrength);
      if (ss.damping !== undefined) sim.setDamping(ss.damping);
      if (ss.dragMultiplier !== undefined) sim.setDragMultiplier(ss.dragMultiplier);
      if (ss.dragDamping !== undefined) sim.setDragDamping(ss.dragDamping);
    }
    resetAutosaveHash();
  }, []);

  const handleOpenProject = useCallback(async (fileId: string, fileName: string) => {
    if (!account) return;
    try {
      const json = await loadProject(instance, account, fileId);
      const state = deserializeMechanism(json);
      if (!state) { alert('Invalid file format'); return; }
      applyLoadedState(state);
      useEditorStore.getState().setOneDriveFileId(fileId);
      useEditorStore.getState().setOneDriveFileName(fileName);
      navigate('editor');
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Failed to open project');
    }
  }, [instance, account, navigate, applyLoadedState]);

  const handleNewProject = useCallback(() => {
    useMechanismStore.getState().clearAll();
    useEditorStore.getState().clearSelection();
    useEditorStore.getState().setProjectName('Untitled');
    useEditorStore.getState().setOneDriveFileId(null);
    useEditorStore.getState().setOneDriveFileName(null);
    navigate('editor');
  }, [navigate]);

  const handleOpenLocal = useCallback(async () => {
    const json = await openFilePicker();
    if (!json) return;
    const state = deserializeMechanism(json);
    if (!state) { alert('Invalid file format'); return; }
    applyLoadedState(state);
    useEditorStore.getState().setOneDriveFileId(null);
    useEditorStore.getState().setOneDriveFileName(null);
    navigate('editor');
  }, [navigate, applyLoadedState]);

  if (page === 'projects') {
    return (
      <ProjectsPage
        onOpenProject={handleOpenProject}
        onNewProject={handleNewProject}
        onOpenLocal={handleOpenLocal}
      />
    );
  }

  return (
    <>
      <SplashScreen />
      <Layout />
    </>
  );
}

export default App;
