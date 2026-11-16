import type { Joint, Link, SliderConstraint, ColliderConstraint, AngleConstraint, Vec2, SolverResult, ForceVector } from '../../types';
import { distanceConstraint, angleDriverConstraint } from './constraints';
import { projectSlider } from './slider-projection';
import { sweptBarrierCrossing } from './barrier-crossing';
import { createMatrix, solveLU } from '../math/linalg';
import { SOLVER_MAX_ITERATIONS, SOLVER_TOLERANCE, SOLVER_DAMPING } from '../../utils/constants';
import type { MechanismSpring } from '../../types';
import { evaluateSpringForces, torsionGeometry } from '../springs/spring-model';
import { ForceAccumulator } from '../force-analysis';

export interface StepConfiguration { analysis?: boolean; constraintPasses?: number; substeps?: number }

interface DriverInfo {
  fixedJointId: string;
  drivenJointId: string;
  targetAngle: number;
}

function solveSystem(J: number[][], phi: number[], m: number, n: number): number[] | null {
  if (m === n) {
    const negPhi = phi.map((v) => -v);
    const Jcopy = J.map((r) => [...r]);
    if (!solveLU(Jcopy, negPhi)) return null;
    return negPhi;
  }
  const JtJ = createMatrix(n, n);
  const Jtphi = new Array<number>(n).fill(0);
  for (let i = 0; i < n; i++) {
    for (let j = 0; j < n; j++) {
      let sum = 0;
      for (let k = 0; k < m; k++) sum += J[k][i] * J[k][j];
      JtJ[i][j] = sum;
    }
    for (let k = 0; k < m; k++) Jtphi[i] -= J[k][i] * phi[k];
  }
  if (!solveLU(JtJ, Jtphi)) return null;
  return Jtphi;
}

/**
 * Kinematic solver (create mode motor drivers).
 */
export function solve(
  joints: Record<string, Joint>, links: Record<string, Link>, driver: DriverInfo | null,
  fixedJointIds?: Set<string>,
): SolverResult {
  const freeJoints: Joint[] = [];
  const jointIndex = new Map<string, number>();
  for (const joint of Object.values(joints)) {
    const isFixed = fixedJointIds ? fixedJointIds.has(joint.id) : joint.type === 'fixed';
    if (isFixed) continue;
    jointIndex.set(joint.id, freeJoints.length * 2);
    freeJoints.push(joint);
  }
  const n = freeJoints.length * 2;
  if (n === 0) return { converged: true, iterations: 0, residual: 0, positions: new Map(), forceVectors: [] };

  const q = new Array<number>(n);
  for (let i = 0; i < freeJoints.length; i++) {
    q[i * 2] = freeJoints[i].position.x; q[i * 2 + 1] = freeJoints[i].position.y;
  }

  const linkArray = Object.values(links);
  const numConstraints = linkArray.length + (driver ? 1 : 0);
  let residual = Infinity; let iter = 0;

  for (; iter < SOLVER_MAX_ITERATIONS; iter++) {
    const phi = new Array<number>(numConstraints).fill(0);
    const J = createMatrix(numConstraints, n);
    let row = 0;
    for (const link of linkArray) {
      const idxI = jointIndex.get(link.jointIds[0]); const idxJ = jointIndex.get(link.jointIds[1]);
      const ji = joints[link.jointIds[0]]; const jj = joints[link.jointIds[1]];
      if (!ji || !jj) { row++; continue; }
      const pi: Vec2 = idxI !== undefined ? { x: q[idxI], y: q[idxI + 1] } : ji.position;
      const pj: Vec2 = idxJ !== undefined ? { x: q[idxJ], y: q[idxJ + 1] } : jj.position;
      const c = distanceConstraint(pi, pj, link.restLength);
      phi[row] = c.residual;
      if (idxI !== undefined) { J[row][idxI] = c.dxi; J[row][idxI + 1] = c.dyi; }
      if (idxJ !== undefined) { J[row][idxJ] = c.dxj; J[row][idxJ + 1] = c.dyj; }
      row++;
    }
    if (driver) {
      const fj = joints[driver.fixedJointId]; const di = jointIndex.get(driver.drivenJointId);
      if (fj && di !== undefined) {
        const pd: Vec2 = { x: q[di], y: q[di + 1] };
        const c = angleDriverConstraint(fj.position, pd, driver.targetAngle);
        phi[row] = c.residual; J[row][di] = c.dxDriven; J[row][di + 1] = c.dyDriven;
      }
    }
    residual = 0;
    for (let i = 0; i < numConstraints; i++) residual += phi[i] * phi[i];
    residual = Math.sqrt(residual);
    if (residual < SOLVER_TOLERANCE) break;
    const dq = solveSystem(J, phi, numConstraints, n);
    if (!dq) break;
    for (let i = 0; i < n; i++) q[i] += SOLVER_DAMPING * dq[i];
  }

  const positions = new Map<string, Vec2>();
  for (let i = 0; i < freeJoints.length; i++) positions.set(freeJoints[i].id, { x: q[i * 2], y: q[i * 2 + 1] });
  for (const j of Object.values(joints)) if (j.type === 'fixed') positions.set(j.id, j.position);
  return { converged: residual < SOLVER_TOLERANCE, iterations: iter, residual, positions, forceVectors: [] };
}

// --- Position-Based Dynamics simulation ---

export interface ForceInfo { linkId: string; grabT: number; target: Vec2; }
export interface GravityInfo { enabled: boolean; strength: number; }

// Velocity-based state for semi-implicit Euler (replaces Verlet prev-positions)
const velocities = new Map<string, Vec2>();

export function resetVelocities() {
  velocities.clear();
}

const PULL_STRENGTH = 6;
const NUM_SUBSTEPS = 10;
const CONSTRAINT_PASSES = 512;

/**
 * Physics simulation using substep PBD with explicit velocity tracking.
 *
 * Uses multiple substeps per frame to minimise constraint projection energy loss.
 * Damping is applied as velocity scaling per substep, time-based so it's
 * frame-rate independent.
 *
 * damping parameter: 0.0 = maximum damping, 1.0 = no damping.
 * Internally converted to a per-second retention factor.
 */
export function solveWithForce(
  joints: Record<string, Joint>,
  links: Record<string, Link>,
  gravity: GravityInfo,
  pullForce: ForceInfo | null,
  damping: number,
  dragMultiplier: number,
  dragDamping: number,
  dt: number,
  fixedJointIds?: Set<string>,
  jointGravityWeights?: Map<string, number>,
  sliders?: Record<string, SliderConstraint>,
  _angleConstraints?: AngleConstraint[],
  colliders?: Record<string, ColliderConstraint>,
  colliderSides?: Map<string, number>,
  bodiesRef?: Record<string, { jointIds: string[] }>,
  comBodyJointSets?: Set<string>[],
  ownedVelocities: Map<string, Vec2> = velocities,
  springs: Record<string, MechanismSpring> = {},
  configuration: StepConfiguration = {},
): SolverResult {
  const freeJoints: Joint[] = [];
  const jointIndex = new Map<string, number>();
  const forceVectors: ForceVector[] = [];
  // Display geometry is independent of the actual reported model magnitude.
  const display = (origin: Vec2, force: Vec2, color: string, scale = .03) => {
    const magnitude = Math.hypot(force.x, force.y);
    if (magnitude > 1e-10) forceVectors.push({ origin, force: { x: force.x * scale, y: force.y * scale }, magnitude, color });
  };

  for (const joint of Object.values(joints)) {
    const isFixed = fixedJointIds ? fixedJointIds.has(joint.id) : joint.type === 'fixed';
    if (isFixed) continue;
    jointIndex.set(joint.id, freeJoints.length * 2);
    freeJoints.push(joint);
  }

  const n = freeJoints.length * 2;
  const reasons = [
    ...(Object.keys(sliders ?? {}).length ? ['Slider reactions are not included.'] : []),
    ...(Object.keys(colliders ?? {}).length ? ['Kinematic contact reactions are not included.'] : []),
    ...(pullForce ? ['Grab reactions at fixed anchors are not included.'] : []),
  ];
  if (n === 0) {
    let analysis;
    const forces = evaluateSpringForces(springs, links, id => joints[id] ? { position: joints[id].position, velocity: { x: 0, y: 0 } } : undefined);
    for (const [id, force] of forces) if (!joints[id].hidden) display(joints[id].position, force, '#00838f');
    for (const joint of Object.values(joints)) if (!joint.hidden && joint.externalForce) display(joint.position, joint.externalForce, '#8e24aa');
    if (configuration.analysis) {
      const fixed = fixedJointIds ?? new Set(Object.keys(joints));
      analysis = new ForceAccumulator(joints, links, fixed, dt, 1, reasons);
      for (const [id, force] of forces) analysis.addApplied(id, force);
      for (const joint of Object.values(joints)) if (joint.externalForce) analysis.addApplied(joint.id, joint.externalForce);
    }
    return { converged: true, iterations: 0, residual: 0, positions: new Map(), forceVectors, ...(analysis ? { forceAnalysis: analysis.finish(new Map()) } : {}) };
  }

  const linkArray = Object.values(links);

  // --- Precompute constant gravity acceleration per joint ---
  // jointGravityWeights: per-joint multiplier for gravity. Default (no weights) = equal distribution.
  // Custom weights allow shifting effective COM (e.g. from outline center of area).
  const gravAccX = new Float64Array(freeJoints.length);
  const gravAccY = new Float64Array(freeJoints.length);

  if (gravity.enabled) {
    const g = gravity.strength;
    if (jointGravityWeights && jointGravityWeights.size > 0) {
      // Use provided weights
      for (const fj of freeJoints) {
        const idx = jointIndex.get(fj.id)!;
        const weight = jointGravityWeights.get(fj.id) ?? 1;
        gravAccY[idx / 2] += g * weight;
      }
    } else {
      // Gravity is acceleration, not a contribution from every derived brace/link.
      gravAccY.fill(g);
    }
  }

  // --- Drag link info (precompute which link is being dragged) ---
  let dragLink: Link | null = null;
  let dragIdxA: number | undefined;
  let dragIdxB: number | undefined;
  let dragFixedPosA: Vec2 | null = null;
  let dragFixedPosB: Vec2 | null = null;
  if (pullForce) {
    for (const link of linkArray) {
      if (link.id === pullForce.linkId) {
        dragLink = link;
        const jA = joints[link.jointIds[0]];
        const jB = joints[link.jointIds[1]];
        dragIdxA = jointIndex.get(jA?.id ?? '');
        dragIdxB = jointIndex.get(jB?.id ?? '');
        if (dragIdxA === undefined && jA) dragFixedPosA = jA.position;
        if (dragIdxB === undefined && jB) dragFixedPosB = jB.position;
        break;
      }
    }
  }

  // --- Current positions into working array ---
  const q = new Float64Array(n);
  const v = new Float64Array(n);
  for (let i = 0; i < freeJoints.length; i++) {
    const joint = freeJoints[i];
    q[i * 2] = joint.position.x;
    q[i * 2 + 1] = joint.position.y;
    const vel = ownedVelocities.get(joint.id);
    if (vel) { v[i * 2] = vel.x; v[i * 2 + 1] = vel.y; }
  }

  // --- Damping factor per substep (time-based) ---
  const coupled = (sliders && Object.keys(sliders).length > 0) || (colliders && Object.keys(colliders).length > 0);
  // RATTLE for conservative distance graphs; contact/drag/spring paths retain PBD.
  const conservative = damping === 1 && !coupled && !pullForce && !Object.keys(springs).length
    && freeJoints.length < Object.keys(joints).length && linkArray.length > 0 && linkArray.every(link => link.restLength > 1e-8);
  let stiffnessBound = 0, dampingBound = 0;
  for (const spring of Object.values(springs)) {
    let gradientBound = 2, kScale = .006, cScale = .006;
    if (spring.kind === 'torsional') {
      const geometry = torsionGeometry(spring, joints, links);
      if (!geometry) throw new Error(`Spring ${spring.id}: invalid torsion legs.`);
      const a = 1 / Math.hypot(geometry.a.x - geometry.pivot.x, geometry.a.y - geometry.pivot.y);
      const b = 1 / Math.hypot(geometry.b.x - geometry.pivot.x, geometry.b.y - geometry.pivot.y);
      gradientBound = a * a + b * b + (a + b) ** 2; kScale = 10; cScale = 5;
    }
    stiffnessBound += (spring.kind === 'damper' ? 0 : spring.stiffness) * kScale * gradientBound;
    dampingBound += spring.damping * cScale * gradientBound;
  }
  const springSteps = Object.keys(springs).length
    ? Math.ceil(dt * Math.max(3000, Math.sqrt(stiffnessBound) * 20, dampingBound * 10)) : 0;
  if (!Number.isFinite(springSteps) || springSteps > 2048) throw new Error('Spring settings exceed the supported time-step stability budget. Reduce stiffness, damping or simulation speed.');
  const requestedSubsteps = configuration.substeps ?? (coupled ? Math.max(24, Math.ceil(dt * 1440)) : NUM_SUBSTEPS);
  if (!Number.isInteger(requestedSubsteps) || requestedSubsteps < 1 || requestedSubsteps > 2048) throw new Error('Invalid solver substep count.');
  const substeps = Math.max(requestedSubsteps, springSteps);
  const subDt = dt / substeps;
  const analysis = configuration.analysis ? new ForceAccumulator(joints, links, fixedJointIds ?? new Set(Object.values(joints).filter(j => j.type === 'fixed').map(j => j.id)), subDt, substeps, reasons) : undefined;
  const retentionPerSecond = damping < 0.001 ? 0.001 : damping;
  const dampPerSubstep = Math.pow(retentionPerSecond, subDt);
  const effectiveStrength = PULL_STRENGTH * dragMultiplier;

  // --- Substep loop ---
  for (let sub = 0; sub < substeps; sub++) {
    const springForces = Object.keys(springs).length ? evaluateSpringForces(springs, links, id => {
      const joint = joints[id]; if (!joint) return undefined;
      const index = jointIndex.get(id);
      return index === undefined ? { position: joint.position, velocity: { x: 0, y: 0 } }
        : { position: { x: q[index], y: q[index + 1] }, velocity: { x: v[index], y: v[index + 1] } };
    }) : null;
    if (analysis) {
      for (const joint of Object.values(joints)) if (!jointIndex.has(joint.id)) {
        const spring = springForces?.get(joint.id);
        if (spring) analysis.addApplied(joint.id, spring);
        if (joint.externalForce) analysis.addApplied(joint.id, joint.externalForce);
      }
    }
    // 1. Compute per-substep acceleration: constant gravity + position-dependent drag
    for (let i = 0; i < freeJoints.length; i++) {
      let axi = gravAccX[i];
      let ayi = gravAccY[i];
      const springForce = springForces?.get(freeJoints[i].id);
      if (springForce) { axi += springForce.x; ayi += springForce.y; }
      const external = freeJoints[i].externalForce;
      if (external) { axi += external.x; ayi += external.y; }

      // Critically damped spring drag: F = k * displacement - c * velocity
      // c = 2 * sqrt(k) * dampingRatio gives critical damping at ratio=1
      if (pullForce && dragLink) {
        const t = pullForce.grabT;
        const ax1 = dragIdxA !== undefined ? q[dragIdxA] : dragFixedPosA!.x;
        const ay1 = dragIdxA !== undefined ? q[dragIdxA + 1] : dragFixedPosA!.y;
        const bx1 = dragIdxB !== undefined ? q[dragIdxB] : dragFixedPosB!.x;
        const by1 = dragIdxB !== undefined ? q[dragIdxB + 1] : dragFixedPosB!.y;
        const grabX = ax1 + (bx1 - ax1) * t;
        const grabY = ay1 + (by1 - ay1) * t;

        // Spring force (proportional to displacement)
        const springFx = (pullForce.target.x - grabX) * effectiveStrength;
        const springFy = (pullForce.target.y - grabY) * effectiveStrength;

        // Velocity at grab point (interpolated from joint velocities)
        let grabVx = 0, grabVy = 0;
        if (dragIdxA !== undefined) { grabVx += v[dragIdxA] * (1 - t); grabVy += v[dragIdxA + 1] * (1 - t); }
        if (dragIdxB !== undefined) { grabVx += v[dragIdxB] * t; grabVy += v[dragIdxB + 1] * t; }

        // Damping force (proportional to velocity, scaled by sqrt(k) for critical damping)
        // dragDamping slider: 0 = undamped, 0.5 = critically damped, 1.0 = overdamped
        const dampCoeff = 2 * Math.sqrt(effectiveStrength) * (dragDamping * 2);
        const dampFx = -grabVx * dampCoeff;
        const dampFy = -grabVy * dampCoeff;

        const dax = springFx + dampFx;
        const day = springFy + dampFy;

        const idx2 = i * 2;
        if (dragIdxA !== undefined && dragIdxA === idx2) {
          axi += dax * (1 - t);
          ayi += day * (1 - t);
        }
        if (dragIdxB !== undefined && dragIdxB === idx2) {
          axi += dax * t;
          ayi += day * t;
        }
      }

      analysis?.addApplied(freeJoints[i].id, { x: axi, y: ayi });
      v[i * 2] += axi * subDt * (conservative ? .5 : 1);
      v[i * 2 + 1] += ayi * subDt * (conservative ? .5 : 1);
    }

    // 2. Predict position
    const predicted = new Float64Array(n);
    for (let i = 0; i < n; i++) {
      predicted[i] = q[i] + v[i] * subDt;
    }

    // 3. Project distance constraints + slider constraints
    const sliderArray = sliders ? Object.values(sliders) : [];
    const passes = configuration.constraintPasses ?? (sliderArray.length || (colliders && Object.keys(colliders).length) ? CONSTRAINT_PASSES : 64);
    if (!Number.isInteger(passes) || passes < 1 || passes > 4096) throw new Error('Invalid constraint projection count.');
    const collidedJoints = new Map<number, { idx: number; nx: number; ny: number }>();
    for (let pass = 0; pass < passes; pass++) {
      for (const link of linkArray) {
        const idxI = jointIndex.get(link.jointIds[0]);
        const idxJ = jointIndex.get(link.jointIds[1]);
        if (idxI === undefined && idxJ === undefined) continue;
        const ji = joints[link.jointIds[0]];
        const jj = joints[link.jointIds[1]];
        if (!ji || !jj) continue;

        const x1 = idxI !== undefined ? predicted[idxI] : ji.position.x;
        const y1 = idxI !== undefined ? predicted[idxI + 1] : ji.position.y;
        const x2 = idxJ !== undefined ? predicted[idxJ] : jj.position.x;
        const y2 = idxJ !== undefined ? predicted[idxJ + 1] : jj.position.y;

        const ddx = x2 - x1;
        const ddy = y2 - y1;
        const dist = Math.sqrt(ddx * ddx + ddy * ddy);
        if (dist < 1e-8) continue;

        const diff = (dist - link.restLength) / dist;
        const isFreeI = idxI !== undefined;
        const isFreeJ = idxJ !== undefined;
        const w = (isFreeI ? 1 : 0) + (isFreeJ ? 1 : 0);
        if (w === 0) continue;

        let cx = ddx * diff / w;
        let cy = ddy * diff / w;
        if (conservative) {
          // SHAKE position correction uses the start-of-step constraint gradient.
          const ox = (idxJ === undefined ? jj.position.x : q[idxJ]) - (idxI === undefined ? ji.position.x : q[idxI]);
          const oy = (idxJ === undefined ? jj.position.y : q[idxJ + 1]) - (idxI === undefined ? ji.position.y : q[idxI + 1]);
          const dot = ox * ddx + oy * ddy;
          const error = dist * dist - link.restLength * link.restLength;
          const discriminant = dot * dot - (ox * ox + oy * oy) * error;
          if (dot <= 0 || discriminant < 0) throw new Error('Conservative constraint changed too far in one step. Reduce simulation speed.');
          const correction = error / (w * (dot + Math.sqrt(discriminant)));
          cx = ox * correction; cy = oy * correction;
        }
        if (analysis && (cx !== 0 || cy !== 0)) analysis.addDistance(link.id, { x: cx, y: cy }, { x: ddx / dist, y: ddy / dist });
        if (isFreeI) { predicted[idxI!] += cx; predicted[idxI! + 1] += cy; }
        if (isFreeJ) { predicted[idxJ!] -= cx; predicted[idxJ! + 1] -= cy; }
      }

      for (const slider of sliderArray) projectSlider(slider, joints, jointIndex, predicted);

      if (colliders && colliderSides) {
        for (const collider of Object.values(colliders)) {
          if (!joints[collider.jointIdA] || !joints[collider.jointIdC]) continue;
          // Get barrier endpoints (may be fixed or free)
          const idxA = jointIndex.get(collider.jointIdA);
          const idxC = jointIndex.get(collider.jointIdC);
          const ax = idxA !== undefined ? predicted[idxA] : (joints[collider.jointIdA]?.position.x ?? 0);
          const ay = idxA !== undefined ? predicted[idxA + 1] : (joints[collider.jointIdA]?.position.y ?? 0);
          const cx = idxC !== undefined ? predicted[idxC] : (joints[collider.jointIdC]?.position.x ?? 0);
          const cy = idxC !== undefined ? predicted[idxC + 1] : (joints[collider.jointIdC]?.position.y ?? 0);

          const lineDx = cx - ax;
          const lineDy = cy - ay;
          const lineLenSq = lineDx * lineDx + lineDy * lineDy;
          if (lineLenSq < 1e-10) continue;
          const lineLen = Math.sqrt(lineLenSq);
          // Unit normal (perpendicular to line, consistent direction)
          const nx = -lineDy / lineLen;
          const ny = lineDx / lineLen;

          // Check each joint in the collider's assigned bodies
          for (const bodyId of collider.bodyIds) {
            const body = bodiesRef?.[bodyId];
            if (!body) continue;
            for (const jid of body.jointIds) {
              // Skip the collider's own endpoints
              if (jid === collider.jointIdA || jid === collider.jointIdC) continue;
              const idx = jointIndex.get(jid);
              if (idx === undefined) continue;

              const px = predicted[idx];
              const py = predicted[idx + 1];

              // Parametric projection onto line segment
              const apx = px - ax, apy = py - ay;
              const t = (apx * lineDx + apy * lineDy) / lineLenSq;

              // Signed distance from line (positive = normal side, negative = opposite)
              const signedDist = apx * nx + apy * ny;
              const sideKey = `${collider.id}:${jid}`;

              const crossing = (pass === 0 || pass === passes - 1) ? sweptBarrierCrossing(
                { x: q[idx], y: q[idx + 1] }, { x: px, y: py },
                { x: idxA === undefined ? ax : q[idxA], y: idxA === undefined ? ay : q[idxA + 1] }, { x: ax, y: ay },
                { x: idxC === undefined ? cx : q[idxC], y: idxC === undefined ? cy : q[idxC + 1] }, { x: cx, y: cy }) : null;

              if ((t < 0 || t > 1) && !crossing) {
                // Outside segment bounds — joint has gone around the endpoint.
                // Update the recorded side so re-entering from this side is accepted.
                const newSide = signedDist > 0 ? 1 : signedDist < 0 ? -1 : 0;
                if (newSide !== 0 && pass === passes - 1) colliderSides.set(sideKey, newSide);
                continue;
              }

              // Look up current recorded side
              const initialSide = colliderSides.get(sideKey);
              if (initialSide === undefined || initialSide === 0) continue;

              // If joint has crossed (sign differs from initial), push it back
              if (signedDist * initialSide < 0) {
                // Project onto the line, then offset to original side by a small epsilon
                const epsilon = 1e-5;
                predicted[idx] = px - signedDist * nx + initialSide * epsilon * nx;
                predicted[idx + 1] = py - signedDist * ny + initialSide * epsilon * ny;
                collidedJoints.set(idx, { idx, nx, ny });
              }
            }
          }
        }
      }
      if (pass % 16 === 15) {
        let settled = true;
        for (const link of linkArray) {
          const ia = jointIndex.get(link.jointIds[0]), ib = jointIndex.get(link.jointIds[1]);
          const a = joints[link.jointIds[0]], b = joints[link.jointIds[1]];
          if (!a || !b) continue;
          const ax = ia === undefined ? a.position.x : predicted[ia], ay = ia === undefined ? a.position.y : predicted[ia + 1];
          const bx = ib === undefined ? b.position.x : predicted[ib], by = ib === undefined ? b.position.y : predicted[ib + 1];
          const tolerance = coupled ? (link.restLength > 0 ? link.restLength * 1e-4 : 1e-3) : conservative ? 1e-10 : 1e-5;
          if (Math.abs(Math.hypot(bx - ax, by - ay) - link.restLength) > tolerance) { settled = false; break; }
        }
        if (settled) break;
      }
    }

    // 4. Derive velocity from position change
    const invSubDt = 1 / subDt;
    for (let i = 0; i < n; i++) {
      v[i] = (predicted[i] - q[i]) * invSubDt;
    }
    if (conservative) {
      for (let i = 0; i < freeJoints.length; i++) {
        v[i * 2] += (gravAccX[i] + (freeJoints[i].externalForce?.x ?? 0)) * subDt / 2;
        v[i * 2 + 1] += (gravAccY[i] + (freeJoints[i].externalForce?.y ?? 0)) * subDt / 2;
      }
      projectDistanceVelocities(joints, linkArray, jointIndex, predicted, v, subDt, passes, analysis);
    }

    // 4b. Collider velocity damping: for joints that hit a wall,
    // remove normal velocity (no bounce) and apply friction to tangent.
    const WALL_FRICTION = 0.7; // tangent velocity retention (0 = full stop, 1 = frictionless)
    for (const { idx, nx, ny } of collidedJoints.values()) {
      const vx = v[idx], vy = v[idx + 1];
      // Normal component (into wall) — remove entirely
      const vn = vx * nx + vy * ny;
      // Tangent component — apply friction
      const tx = vx - vn * nx;
      const ty = vy - vn * ny;
      analysis?.addApplied(freeJoints[idx / 2].id, { x: (tx * WALL_FRICTION - vx) / subDt, y: (ty * WALL_FRICTION - vy) / subDt });
      v[idx] = tx * WALL_FRICTION;
      v[idx + 1] = ty * WALL_FRICTION;
    }

    // 5. Apply damping to velocity
    if (damping < 1) {
      for (let i = 0; i < n; i++) {
        if (analysis && i % 2 === 0) analysis.addApplied(freeJoints[i / 2].id, { x: v[i] * (dampPerSubstep - 1) / subDt, y: v[i + 1] * (dampPerSubstep - 1) / subDt });
        v[i] *= dampPerSubstep;
      }
    }

    // 6. Update positions
    for (let i = 0; i < n; i++) {
      q[i] = predicted[i];
    }
  }

  // Display lengths and reported model magnitudes are separate quantities.
  const positionOf = (id: string): Vec2 => {
    const index = jointIndex.get(id);
    return index === undefined ? joints[id].position : { x: q[index], y: q[index + 1] };
  };
  const velocityOf = (id: string): Vec2 => {
    const index = jointIndex.get(id);
    return index === undefined ? { x: 0, y: 0 } : { x: v[index], y: v[index + 1] };
  };
  for (let i = 0; i < freeJoints.length; i++) {
    const joint = freeJoints[i]; if (joint.hidden) continue;
    if (!comBodyJointSets?.some(ids => ids.has(joint.id))) display(positionOf(joint.id), { x: gravAccX[i], y: gravAccY[i] }, '#42A5F5');
    if (joint.externalForce) display(positionOf(joint.id), joint.externalForce, '#8e24aa');
  }
  if (Object.keys(springs).length) {
    const forces = evaluateSpringForces(springs, links, id => joints[id] ? { position: positionOf(id), velocity: velocityOf(id) } : undefined);
    for (const [id, force] of forces) if (!joints[id].hidden) display(positionOf(id), force, '#00838f');
  }
  if (pullForce && dragLink) {
    const a = positionOf(dragLink.jointIds[0]), b = positionOf(dragLink.jointIds[1]);
    const va = velocityOf(dragLink.jointIds[0]), vb = velocityOf(dragLink.jointIds[1]), t = pullForce.grabT;
    const origin = { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t };
    const damp = 2 * Math.sqrt(effectiveStrength) * (dragDamping * 2);
    display(origin, { x: (pullForce.target.x - origin.x) * effectiveStrength - (va.x * (1 - t) + vb.x * t) * damp,
      y: (pullForce.target.y - origin.y) * effectiveStrength - (va.y * (1 - t) + vb.y * t) * damp }, '#FF9800', .015);
  }

  const positions = new Map<string, Vec2>();
  for (let i = 0; i < freeJoints.length; i++) {
    positions.set(freeJoints[i].id, { x: q[i * 2], y: q[i * 2 + 1] });
  }
  for (const joint of Object.values(joints)) {
    if (joint.type === 'fixed') positions.set(joint.id, joint.position);
  }

  const forceAnalysis = analysis?.finish(positions);
  for (let i = 0; i < freeJoints.length; i++) ownedVelocities.set(freeJoints[i].id, { x: v[i * 2], y: v[i * 2 + 1] });
  return { converged: true, iterations: 0, residual: 0, positions, forceVectors, ...(forceAnalysis ? { forceAnalysis } : {}) };
}

/** RATTLE's second constraint impulse keeps velocity tangent to the new geometry. */
function projectDistanceVelocities(joints: Record<string, Joint>, links: Link[], indices: Map<string, number>, positions: Float64Array,
  velocities: Float64Array, dt: number, passes: number, analysis: ForceAccumulator | undefined): void {
  for (let pass = 0; pass < passes; pass++) {
    let residual = 0;
    for (const link of links) {
      const [a, b] = link.jointIds, ia = indices.get(a), ib = indices.get(b);
      const weight = Number(ia !== undefined) + Number(ib !== undefined); if (!weight) continue;
      const dx = (ib === undefined ? joints[b].position.x : positions[ib]) - (ia === undefined ? joints[a].position.x : positions[ia]);
      const dy = (ib === undefined ? joints[b].position.y : positions[ib + 1]) - (ia === undefined ? joints[a].position.y : positions[ia + 1]);
      const length = Math.hypot(dx, dy); if (length < 1e-10) continue;
      const vx = (ib === undefined ? 0 : velocities[ib]) - (ia === undefined ? 0 : velocities[ia]);
      const vy = (ib === undefined ? 0 : velocities[ib + 1]) - (ia === undefined ? 0 : velocities[ia + 1]);
      const normal = (vx * dx + vy * dy) / length;
      residual = Math.max(residual, Math.abs(normal));
      const cx = dx / length * normal / weight, cy = dy / length * normal / weight;
      if (ia !== undefined) { velocities[ia] += cx; velocities[ia + 1] += cy; }
      if (ib !== undefined) { velocities[ib] -= cx; velocities[ib + 1] -= cy; }
      if (analysis && (cx || cy)) analysis.addDistance(link.id, { x: cx * dt, y: cy * dt }, { x: dx / length, y: dy / length });
    }
    if (residual < 1e-10) break;
  }
}
