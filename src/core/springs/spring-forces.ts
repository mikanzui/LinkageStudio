import type { Vec2 } from '../../types';

/**
 * Springs use SI labels in the UI (N/m, N·s/m). World/grid positions are treated
 * as **metres** (1 world unit = 1 m) for interpreting k and c. The live sim uses the
 * same “engineering” scale as gravity (~800 world units/s²); these factors map
 * typical N/m values into stable accelerations alongside that field.
 */
export const WORLD_UNITS_PER_METRE = 1;
export const SPRING_STIFFNESS_SI_TO_SIM = 0.006;
export const SPRING_DAMPING_SI_TO_SIM = 0.006;
/**
 * Torsion mapping: τ_sim = k_SI * TORSION_STIFFNESS_SI_TO_SIM.
 * Applied as tangential acceleration a = τ/2 (unit-mass particles, no ÷L).
 * Linear springs use displacement in world units (50–200), while torsion uses
 * angle error in radians (0–π), so the scale factor is much higher to produce
 * comparable accelerations at default stiffness values.
 */
export const TORSION_STIFFNESS_SI_TO_SIM = 10;
export const TORSION_DAMPING_SI_TO_SIM = 5;

/** Effective equilibrium length: natural rest at placement + user prestress offset (linear springs, metres). */
export function equilibriumRestLength(restLength: number, prestressDelta: number): number {
  return restLength + prestressDelta;
}

/** Equilibrium angle for torsion: φ_eq = φ₀ + Δφ (radians). Same math as linear rest; separate name for clarity in UI/code. */
export function equilibriumRestAngle(restAngleRad: number, prestressDeltaRad: number): number {
  return restAngleRad + prestressDeltaRad;
}

/**
 * Linear spring between anchors A and B (direction u = unit(B - A)).
 * Returns acceleration increment for the particle at B when A is held fixed (unit mass).
 * F_B = -k·(L - L_eq)·u - c·((v_B - v_A)·u)·u
 */
export function linearSpringAccelerationOnB(
  pA: Vec2,
  pB: Vec2,
  vA: Vec2,
  vB: Vec2,
  kSim: number,
  cSim: number,
  LEq: number,
): { ax: number; ay: number } {
  const dx = pB.x - pA.x;
  const dy = pB.y - pA.y;
  const L = Math.hypot(dx, dy);
  if (L < 1e-12) return { ax: 0, ay: 0 };
  const ux = dx / L;
  const uy = dy / L;
  const e = L - LEq;
  const vrx = vB.x - vA.x;
  const vry = vB.y - vA.y;
  const valong = vrx * ux + vry * uy;
  const f = -kSim * e - cSim * valong;
  return { ax: f * ux, ay: f * uy };
}

export function siStiffnessToSim(kNPerM: number): number {
  return kNPerM * SPRING_STIFFNESS_SI_TO_SIM;
}

export function siDampingToSim(cNsPerM: number): number {
  return cNsPerM * SPRING_DAMPING_SI_TO_SIM;
}

export function siTorsionStiffnessToSim(kNmPerRad: number): number {
  return kNmPerRad * TORSION_STIFFNESS_SI_TO_SIM;
}

export function siTorsionDampingToSim(cNmSPerRad: number): number {
  return cNmSPerRad * TORSION_DAMPING_SI_TO_SIM;
}
