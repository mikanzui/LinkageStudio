import type { SolverConfig } from '../types/solver';

// Rendering
export const JOINT_RADIUS = 8;
export const JOINT_RADIUS_FIXED = 10;
export const LINK_WIDTH = 4;
export const GRID_COLOR = '#ddd';
export const GRID_MAJOR_COLOR = '#aaa';
export const BACKGROUND_COLOR = '#f8f8f8';
export const SELECTION_COLOR = '#2196F3';
export const HOVER_COLOR = '#64B5F6';

// Joint type colors
export const REVOLUTE_COLOR = '#333333';
export const FIXED_COLOR = '#E53935';
export const LINK_COLOR = '#555555';

// Interaction
export const HIT_RADIUS = 12;
export const LINK_HIT_THRESHOLD = 8;
export const SNAP_DISTANCE = 10;
export const DEFAULT_GRID_SIZE = 25;

// Solver
export const SOLVER_MAX_ITERATIONS = 100;
export const SOLVER_TOLERANCE = 1e-10;
export const SOLVER_DAMPING = 1.0;

// Simulation (stability thresholds used by PBD `solveWithForce`)
export const SIM_DT = 1 / 60;
export const DEFAULT_MOTOR_SPEED = 1.0;

/** PBD simulate: max |Δpos| per joint in any one substep before we treat the step as unstable. */
export const SIM_STABILITY_MAX_SUBSTEP_DISPLACEMENT = 250;
/** PBD simulate: max |velocity| (world units/s) on any free joint after substeps. */
export const SIM_STABILITY_MAX_JOINT_SPEED = 20_000;
/** PBD simulate: max |actual − restLength| on any distance link after the step. */
export const SIM_STABILITY_MAX_LINK_LENGTH_ERROR = 120;

/** Default NR + PBD + stability knobs; pass `Partial<SolverConfig>` into `solve` / `solveWithForce` to override. */
export const DEFAULT_SOLVER_CONFIG: SolverConfig = {
  maxIterations: SOLVER_MAX_ITERATIONS,
  tolerance: SOLVER_TOLERANCE,
  damping: SOLVER_DAMPING,
  pbdSubsteps: 10,
  pbdConstraintPasses: 6,
  simPullStrength: 6,
  stabilityMaxSubstepDisplacement: SIM_STABILITY_MAX_SUBSTEP_DISPLACEMENT,
  stabilityMaxJointSpeed: SIM_STABILITY_MAX_JOINT_SPEED,
  stabilityMaxLinkLengthError: SIM_STABILITY_MAX_LINK_LENGTH_ERROR,
};

export function mergeSolverConfig(p?: Partial<SolverConfig>): SolverConfig {
  return { ...DEFAULT_SOLVER_CONFIG, ...p };
}

/**
 * Simulate mode: extra PBD substeps when Speed > 1 scales frame dt (#7).
 * Keeps integration sub-steps closer to the Speed 1 baseline for stiff springs
 * (`subDt ∝ dt / pbdSubsteps`). Capped so very high speeds do not explode cost.
 */
export const SIM_PBD_SUBSTEPS_SIMULATE_CEIL = 56;

export function simulatePbdSubstepsForFrameDt(frameDt: number): number {
  const base = DEFAULT_SOLVER_CONFIG.pbdSubsteps;
  const ratio = frameDt / SIM_DT;
  return Math.min(
    SIM_PBD_SUBSTEPS_SIMULATE_CEIL,
    Math.max(base, Math.round(base * ratio)),
  );
}

/** Default linear spring (SI): stiffness N/m, damping N·s/m — world unit = 1 m. */
export const DEFAULT_SPRING_STIFFNESS_NM = 150;
export const DEFAULT_SPRING_DAMPING_NS_PER_M = 12;
/** Default linear damper: k = 0; same c scale as linear spring. */
export const DEFAULT_DAMPER_DAMPING_NS_PER_M = 12;
/** Default torsion spring at pivot (SI): N·m/rad and N·m·s/rad. */
export const DEFAULT_TORSION_STIFFNESS_NM_PER_RAD = 20;
export const DEFAULT_TORSION_DAMPING_NMS_PER_RAD = 4;
/** Default steps along a link for quantizing spring attachment t (≥2). */
export const DEFAULT_SPRING_LINK_RESOLUTION = 20;

// Body colors — distinct palette (20 colors, blue excluded for selection highlight)
export const BASE_BODY_COLOR = '#E53935';
export const BODY_COLORS = [
  '#4CAF50', // green
  '#FF9800', // orange
  '#9C27B0', // purple
  '#00BCD4', // cyan
  '#795548', // brown
  '#E91E63', // pink
  '#607D8B', // blue-grey
  '#CDDC39', // lime
  '#FF5722', // deep orange
  '#3F51B5', // indigo
  '#009688', // teal
  '#FFC107', // amber
  '#8BC34A', // light green
  '#673AB7', // deep purple
  '#F44336', // red
  '#00ACC1', // dark cyan
  '#FF6F00', // dark amber
  '#7B1FA2', // purple dark
  '#26A69A', // medium teal
  '#D81B60', // dark pink
];
