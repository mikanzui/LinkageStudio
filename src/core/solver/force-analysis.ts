import type { Joint, Link, Vec2, LinkForce, JointReaction, ForceAnalysisResult } from '../../types';

/**
 * Per-link position correction recorded during the last PBD constraint pass.
 * dxA/dyA = correction applied to joint A, dxB/dyB = correction applied to joint B.
 */
export interface LinkCorrection {
  linkId: string;
  jointIdA: string;
  jointIdB: string;
  dxA: number;
  dyA: number;
  dxB: number;
  dyB: number;
}

/**
 * Analyse forces from PBD constraint corrections.
 *
 * In Position-Based Dynamics each constraint pass applies Δx to satisfy C(x)=0.
 * The equivalent constraint force is F = Δx / Δt² (mass = 1 per joint in PBD).
 * For distance constraints: joints pulled closer ⇒ tension, pushed apart ⇒ compression.
 *
 * @param corrections  Per-link corrections from the last constraint pass of the last substep.
 * @param joints       Current joint data (for positions of fixed joints).
 * @param links        Link definitions (for rest lengths and IDs).
 * @param positions    Final solved positions from the PBD solver.
 * @param subDt        Duration of one substep (dt / NUM_SUBSTEPS).
 * @param constraintPasses  Number of constraint passes per substep (corrections are cumulative).
 */
export function analyzeForces(
  corrections: LinkCorrection[],
  joints: Record<string, Joint>,
  _links: Record<string, Link>,
  positions: Map<string, Vec2>,
  subDt: number,
  constraintPasses: number,
): ForceAnalysisResult {
  const linkForces = new Map<string, LinkForce>();
  const jointReactionMap = new Map<string, { fx: number; fy: number; contribs: { linkId: string; force: Vec2 }[] }>();

  const invDtSq = 1 / (subDt * subDt);
  // Scale by passes since corrections are accumulated across passes
  const scale = invDtSq / constraintPasses;

  for (const corr of corrections) {
    // Force = correction / dt² (in PBD, unit mass per joint)
    const fxA = corr.dxA * scale;
    const fyA = corr.dyA * scale;
    const fxB = corr.dxB * scale;
    const fyB = corr.dyB * scale;

    // Get link direction for axial force decomposition
    const posA = positions.get(corr.jointIdA) ?? joints[corr.jointIdA]?.position;
    const posB = positions.get(corr.jointIdB) ?? joints[corr.jointIdB]?.position;
    if (!posA || !posB) continue;

    const dx = posB.x - posA.x;
    const dy = posB.y - posA.y;
    const len = Math.sqrt(dx * dx + dy * dy);
    if (len < 1e-10) continue;

    const ux = dx / len;
    const uy = dy / len;

    // Axial force: project the correction force onto the link direction
    // Convention: positive = tension (pulling joints together),
    //             negative = compression (pushing joints apart)
    // The force on B points from B toward A in tension, so project -forceB onto unit(A→B)
    const axialForceFromB = -(fxB * ux + fyB * uy);
    const axialForceFromA = fxA * ux + fyA * uy;
    const axialForce = (axialForceFromA + axialForceFromB) / 2;

    const linkForce: LinkForce = {
      linkId: corr.linkId,
      axialForce,
      forceAtA: { x: fxA, y: fyA },
      forceAtB: { x: fxB, y: fyB },
    };
    linkForces.set(corr.linkId, linkForce);

    // Accumulate to joint reactions
    for (const [jid, fx, fy] of [[corr.jointIdA, fxA, fyA], [corr.jointIdB, fxB, fyB]] as [string, number, number][]) {
      let entry = jointReactionMap.get(jid);
      if (!entry) {
        entry = { fx: 0, fy: 0, contribs: [] };
        jointReactionMap.set(jid, entry);
      }
      entry.fx += fx;
      entry.fy += fy;
      entry.contribs.push({ linkId: corr.linkId, force: { x: fx, y: fy } });
    }
  }

  // Build JointReaction results
  const jointReactions = new Map<string, JointReaction>();
  let maxLinkForce = 0;
  let maxJointReaction = 0;

  for (const [, lf] of linkForces) {
    const abs = Math.abs(lf.axialForce);
    if (abs > maxLinkForce) maxLinkForce = abs;
  }

  for (const [jointId, entry] of jointReactionMap) {
    const mag = Math.sqrt(entry.fx * entry.fx + entry.fy * entry.fy);
    if (mag > maxJointReaction) maxJointReaction = mag;
    jointReactions.set(jointId, {
      jointId,
      reactionForce: { x: entry.fx, y: entry.fy },
      magnitude: mag,
      contributions: entry.contribs,
    });
  }

  return { linkForces, jointReactions, maxLinkForce, maxJointReaction };
}

// ---- Temporal smoothing (EMA) to eliminate frame-to-frame flicker ----

/** Smoothing factor: 0 = frozen, 1 = no smoothing. 0.12 ≈ ~8 frame average. */
const EMA_ALPHA = 0.12;

let prevSmoothed: ForceAnalysisResult | null = null;

/** Reset smoothing state (call when simulation resets / stops). */
export function resetForceSmoothing() {
  prevSmoothed = null;
}

function lerpVal(prev: number, next: number, alpha: number): number {
  return prev + alpha * (next - prev);
}

/**
 * Apply exponential moving average to a raw ForceAnalysisResult.
 * On the first call (or after reset) it returns the raw result as-is.
 */
export function smoothForceAnalysis(raw: ForceAnalysisResult): ForceAnalysisResult {
  if (!prevSmoothed) {
    prevSmoothed = raw;
    return raw;
  }

  const smoothedLinkForces = new Map<string, LinkForce>();
  for (const [id, lf] of raw.linkForces) {
    const prev = prevSmoothed.linkForces.get(id);
    if (prev) {
      smoothedLinkForces.set(id, {
        linkId: id,
        axialForce: lerpVal(prev.axialForce, lf.axialForce, EMA_ALPHA),
        forceAtA: {
          x: lerpVal(prev.forceAtA.x, lf.forceAtA.x, EMA_ALPHA),
          y: lerpVal(prev.forceAtA.y, lf.forceAtA.y, EMA_ALPHA),
        },
        forceAtB: {
          x: lerpVal(prev.forceAtB.x, lf.forceAtB.x, EMA_ALPHA),
          y: lerpVal(prev.forceAtB.y, lf.forceAtB.y, EMA_ALPHA),
        },
      });
    } else {
      smoothedLinkForces.set(id, lf);
    }
  }

  const smoothedJointReactions = new Map<string, JointReaction>();
  for (const [id, jr] of raw.jointReactions) {
    const prev = prevSmoothed.jointReactions.get(id);
    if (prev) {
      const rx = lerpVal(prev.reactionForce.x, jr.reactionForce.x, EMA_ALPHA);
      const ry = lerpVal(prev.reactionForce.y, jr.reactionForce.y, EMA_ALPHA);
      smoothedJointReactions.set(id, {
        jointId: id,
        reactionForce: { x: rx, y: ry },
        magnitude: Math.sqrt(rx * rx + ry * ry),
        contributions: jr.contributions, // contributions aren't smoothed (used for breakdown only)
      });
    } else {
      smoothedJointReactions.set(id, jr);
    }
  }

  let maxLinkForce = 0;
  for (const [, lf] of smoothedLinkForces) {
    const abs = Math.abs(lf.axialForce);
    if (abs > maxLinkForce) maxLinkForce = abs;
  }

  let maxJointReaction = 0;
  for (const [, jr] of smoothedJointReactions) {
    if (jr.magnitude > maxJointReaction) maxJointReaction = jr.magnitude;
  }

  const result: ForceAnalysisResult = {
    linkForces: smoothedLinkForces,
    jointReactions: smoothedJointReactions,
    maxLinkForce,
    maxJointReaction,
  };

  prevSmoothed = result;
  return result;
}
