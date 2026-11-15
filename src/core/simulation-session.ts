import type { MechanismState, Vec2, SolverResult } from '../types';
import { maximumLinkError } from './compile-mechanism';
import { solveWithForce } from './solver/newton-raphson';

export interface FrameOptions {
  dt: number;
  gravityEnabled: boolean;
  gravityStrength: number;
  damping: number;
  dragMultiplier: number;
  dragDamping: number;
  pull: { linkId: string; grabT: number; target: Vec2 } | null;
  gravityWeights?: Map<string, number>;
  comBodyJointSets?: Set<string>[];
}
export type FrameResult = { ok: true; result: SolverResult; joints: MechanismState['joints'] }
  | { ok: false; error: string };

export class SimulationSession {
  private velocities = new Map<string, Vec2>();
  private sides: Map<string, number> | undefined;
  private fixed = new Map<string, Vec2>();

  constructor(graph: MechanismState) {
    const fixedIds = new Set(graph.bodies[graph.baseBodyId]?.jointIds ?? []);
    for (const j of Object.values(graph.joints)) if (fixedIds.has(j.id) || (j.hidden && j.type === 'fixed')) this.fixed.set(j.id, { ...j.position });
  }

  step(graph: MechanismState, options: FrameOptions): FrameResult {
    if (!(options.dt > 0 && options.dt <= 1 / 10)) return { ok: false, error: 'Time step must be finite and within (0, 0.1] seconds.' };
    for (const key of ['gravityStrength', 'damping', 'dragMultiplier', 'dragDamping'] as const) {
      if (!Number.isFinite(options[key]) || options[key] < 0) return { ok: false, error: `${key} must be finite and nonnegative.` };
    }
    const trialVelocities = new Map([...this.velocities].map(([id, v]) => [id, { ...v }]));
    const sides = this.sides ? new Map(this.sides) : initialColliderSides(graph);
    try {
      const fixedIds = new Set(this.fixed.keys());
      const result = solveWithForce(graph.joints, graph.links, { enabled: options.gravityEnabled, strength: options.gravityStrength },
        options.pull, options.damping, options.dragMultiplier, options.dragDamping, options.dt,
        fixedIds, options.gravityWeights, graph.sliders, [], graph.colliders, sides, graph.bodies, options.comBodyJointSets, trialVelocities);
      const joints = { ...graph.joints };
      for (const [id, position] of result.positions) {
        if (!Number.isFinite(position.x) || !Number.isFinite(position.y)) throw new Error(`Joint ${id}: non-finite solver position.`);
        const original = this.fixed.get(id);
        if (original && Math.hypot(position.x - original.x, position.y - original.y) > 1e-8) throw new Error(`Fixed joint ${id} moved.`);
        if (joints[id]) joints[id] = { ...joints[id], position: { ...position } };
      }
      const residual = maximumLinkError(joints, graph.links);
      if (!Number.isFinite(residual)) throw new Error('Incomplete or non-finite constraint result.');
      // Ordinary-link accuracy is strict; coupled sliders/barriers qualify separately at G3.
      const coupled = Object.keys(graph.sliders).length > 0 || Object.keys(graph.colliders).length > 0;
      if (!coupled && residual > 1e-3) throw new Error(`Constraint error ${residual.toPrecision(4)} exceeds 0.001 world units.`);
      this.velocities = trialVelocities; this.sides = sides;
      return { ok: true, joints, result: { ...result, residual, converged: residual <= 1e-3 } };
    } catch (error) { return { ok: false, error: error instanceof Error ? error.message : String(error) }; }
  }
}

function initialColliderSides(graph: MechanismState): Map<string, number> {
  const sides = new Map<string, number>();
  for (const c of Object.values(graph.colliders)) {
    const a = graph.joints[c.jointIdA], b = graph.joints[c.jointIdC]; if (!a || !b) continue;
    const dx = b.position.x - a.position.x, dy = b.position.y - a.position.y;
    for (const bodyId of c.bodyIds) for (const id of graph.bodies[bodyId]?.jointIds ?? []) {
      const j = graph.joints[id]; if (!j || id === a.id || id === b.id) continue;
      sides.set(`${c.id}:${id}`, Math.sign((j.position.y - a.position.y) * dx - (j.position.x - a.position.x) * dy));
    }
  }
  return sides;
}
