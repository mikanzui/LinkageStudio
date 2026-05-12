import type { Vec2 } from './geometry';

export interface SolverConfig {
  maxIterations: number;
  tolerance: number;
  damping: number;
}

export interface ForceVector {
  origin: Vec2;
  force: Vec2;
  color: string;
}

/** Force data for a single link (tension/compression). */
export interface LinkForce {
  linkId: string;
  /** Axial force magnitude (positive = tension, negative = compression). */
  axialForce: number;
  /** Force vector at joint A endpoint. */
  forceAtA: Vec2;
  /** Force vector at joint B endpoint. */
  forceAtB: Vec2;
}

/** Reaction force at a joint (sum of all constraint forces). */
export interface JointReaction {
  jointId: string;
  /** Total reaction force vector (sim units). */
  reactionForce: Vec2;
  /** Magnitude. */
  magnitude: number;
  /** Per-link breakdown: which links contribute what force at this joint. */
  contributions: { linkId: string; force: Vec2 }[];
}

/** Extended solver result with force data. */
export interface ForceAnalysisResult {
  linkForces: Map<string, LinkForce>;
  jointReactions: Map<string, JointReaction>;
  /** Maximum link force magnitude (for normalizing color scales). */
  maxLinkForce: number;
  /** Maximum joint reaction magnitude. */
  maxJointReaction: number;
}

/** Populated by `solveWithForce` for simulate-mode health (not NR `solve`). */
export interface SimulateStepMetrics {
  /** Largest single-joint displacement in any one substep (world units). */
  maxSubstepDisplacement: number;
  /** Largest speed magnitude on any free joint after integration (world units/s). */
  maxJointSpeed: number;
  /** Largest absolute link length error vs rest length (world units). */
  maxLinkLengthError: number;
}

export interface SolverResult {
  converged: boolean;
  iterations: number;
  residual: number;
  positions: Map<string, Vec2>;
  forceVectors: ForceVector[];
  forceAnalysis?: ForceAnalysisResult;
  /** When false, simulate should not commit positions (exploding / unstable step). */
  simulateStable?: boolean;
  simulateMetrics?: SimulateStepMetrics;
}

export interface SimulationState {
  isPlaying: boolean;
  speed: number;
  time: number;
  driverJointId: string | null;
  driverLinkId: string | null;
  driverType: 'motor' | 'slider';
  driverAngle: number;
  dof: number;
  solverResult: SolverResult | null;
  pathTraces: Map<string, Vec2[]>;
  tracingEnabled: boolean;
  trackedJointIds: Set<string>;
}
