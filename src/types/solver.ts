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
  magnitude?: number;
}

export interface LinkForce {
  linkId: string;
  axialForce: number | null;
  forceAtA: Vec2;
  forceAtB: Vec2;
}

export interface JointReaction {
  jointId: string;
  kind: 'support' | 'constraint';
  reactionForce: Vec2;
  magnitude: number;
  appliedForce: Vec2;
  contributions: { linkId: string; force: Vec2 }[];
}

export interface ForceAnalysisResult {
  units: 'model';
  complete: boolean;
  limitations: string[];
  linkForces: Map<string, LinkForce>;
  jointReactions: Map<string, JointReaction>;
  maxLinkForce: number;
  maxJointReaction: number;
}

export interface SolverResult {
  converged: boolean;
  iterations: number;
  residual: number;
  positions: Map<string, Vec2>;
  forceVectors: ForceVector[];
  forceAnalysis?: ForceAnalysisResult;
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
