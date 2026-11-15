import { useEffect, useRef } from 'react';
import { Layout } from './components/Layout';
import { useMechanismStore } from './store/mechanism-store';
import { useSimulationStore } from './store/simulation-store';
import { useEditorStore } from './store/editor-store';
import { solve } from './core/solver/newton-raphson';
import { SimulationSession } from './core/simulation-session';
import { compileMechanism } from './core/compile-mechanism';
import type { MechanismState } from './types';
import { computeDOF } from './core/solver/dof';
import { computeDriverAngle } from './core/solver/driver';
import { angleBetween } from './core/math/vec2';
import { SIM_DT } from './utils/constants';
import { computeBodyTransform, localToWorld, polygonCentroid, polygonArea } from './core/body-transform';
import { isProjectDirty, markProjectSaved } from './document/project';

function App() {
  const initialAngleRef = useRef<number | null>(null);
  const sessionRef = useRef<SimulationSession | null>(null);
  const dofRef = useRef<{ graph: MechanismState; driver: boolean; value: number } | null>(null);

  useEffect(() => {
    markProjectSaved();
    const warn = (event: BeforeUnloadEvent) => {
      if (!isProjectDirty()) return;
      event.preventDefault(); event.returnValue = '';
    };
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, []);

  useEffect(() => {
    const tick = () => {
      try {
      const sim = useSimulationStore.getState();
      const mech = useMechanismStore.getState();
      const editor = useEditorStore.getState();

      // Compute fixed joint IDs from base body
      const baseBody = mech.bodies[mech.baseBodyId];
      const fixedJointIds = new Set<string>(baseBody?.jointIds ?? []);
      for (const joint of Object.values(mech.joints)) if (joint.hidden && joint.type === 'fixed') fixedJointIds.add(joint.id);

      // Use the design graph, not approximate solver positions which can inflate rank.
      const design = editor.simulationDesign ?? mech;
      const previousDOF = dofRef.current;
      if (!previousDOF || previousDOF.graph.joints !== design.joints || previousDOF.graph.links !== design.links
        || previousDOF.graph.bodies !== design.bodies || previousDOF.graph.sliders !== design.sliders || previousDOF.driver !== !!sim.driverJointId) {
        const compiled = compileMechanism(design);
        dofRef.current = { graph: design, driver: !!sim.driverJointId, value: computeDOF(compiled.joints, compiled.links, !!sim.driverJointId, compiled.fixedIds, compiled.sliders) };
      }
      const dof = dofRef.current!.value;
      if (dof !== sim.dof) sim.setDof(dof);

      // --- SIMULATE MODE ---
      if (editor.mode === 'simulate') {
        if (!sim.isPlaying) return;
        sessionRef.current ??= new SimulationSession(mech);

        // Build pull force from sim drag
        const pullForce = editor.simDrag?.active && editor.simDrag.linkId
          ? {
              linkId: editor.simDrag.linkId,
              grabT: editor.simDrag.grabT,
              target: editor.simDrag.cursorPoint,
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

        const frame = sessionRef.current.step(mech, { dt: SIM_DT * sim.speed,
          gravityEnabled: sim.gravityEnabled, gravityStrength: sim.gravityStrength,
          damping: sim.damping, dragMultiplier: sim.dragMultiplier, dragDamping: sim.dragDamping,
          pull: pullForce, gravityWeights: jointGravityWeights, comBodyJointSets });
        if (!frame.ok) {
          useSimulationStore.setState({ isPlaying: false, stepError: frame.error });
          return;
        }
        const result = frame.result;
        sim.setSolverResult(result);
        useMechanismStore.setState({ joints: frame.joints });
        sim.advanceTime(SIM_DT * sim.speed);
        {
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
            const transform = computeBodyTransform(body, frame.joints);
            const worldPt = localToWorld(tracer.localPosition, transform);
            sim.recordTracerTrace(tracer.id, worldPt);
          }
        }
        return;
      }

      // --- CREATE MODE (motor driver playback) ---
      if (!sim.isPlaying || !sim.driverJointId || !sim.driverLinkId) return;

      const link = mech.links[sim.driverLinkId];
      if (!link) return;

      const fixedJointId = link.jointIds.find((jid) => fixedJointIds.has(jid));
      const drivenJointId = link.jointIds.find((jid) => jid !== fixedJointId);
      if (!fixedJointId || !drivenJointId) return;

      if (initialAngleRef.current === null) {
        const fj = mech.joints[fixedJointId];
        const dj = mech.joints[drivenJointId];
        initialAngleRef.current = angleBetween(fj.position, dj.position);
      }

      sim.advanceTime(SIM_DT * sim.speed);
      const targetAngle = computeDriverAngle(sim.time, sim.speed, initialAngleRef.current);
      sim.setDriverAngle(targetAngle);

      const result = solve(mech.joints, mech.links, {
        fixedJointId,
        drivenJointId,
        targetAngle,
      }, fixedJointIds);

      sim.setSolverResult(result);

      if (result.converged) {
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
      }
      } catch (e) {
        console.error('Simulation tick error:', e);
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
      if (state.mode !== prevState.mode) {
        sessionRef.current = null;
      }
    });
    return unsub;
  }, []);

  return <Layout />;
}

export default App;
