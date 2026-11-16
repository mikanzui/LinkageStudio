# Fork Spring Integration Audit

Read-only sidecar: Ohm `01a1e17a-a833-7310-9f31-51c024ad583d`; handed off and
closed 2026-11-15. No code edits, builds, browser or server ownership. Usage UNKNOWN.
Lead reviews recommendations before G6 implementation; this does not accept G6.

## Retained Behavior

Fork families: linear, damper, torsional. Linear/damper anchors are joints or
fractional link positions; torsion selects pivot then two incident links. Stored
fields are id, kind, anchorA/B, stiffness, damping, restLength, prestressDelta.
Torsion stores radians in the two rest/offset fields. Equilibrium is rest + offset.
Defaults: linear 150/12, damper 0/12, torsion 20/4. Link snap defaults to 20 intervals.
Explicit reattachment resets natural rest but preserves offset; ordinary regeneration
must not reset equilibrium or silently lose attachment identity.

## Concrete Risks

1. `src/core/springs/spring-solver.ts:367` applies both distal forces along the same
   signed tangent with magnitude tau/2, missing inverse leg length. Perpendicular
   unit legs receive equal angular acceleration, not relative restoration. Unequal
   legs can increase angle error. Correct opposing moments and test signed error.
2. Same torsion sign error permits positive damping power; sidecar probe found +7.5
   for k=0,c=1 with angular velocities -2,-1. Require nonpositive damping power.
3. `spring-forces.ts` scales linear coefficients by .006 and torsion by 10/5 in a
   unit-particle motion model. Existing SI labels are not calibrated engineering units.
4. Root file parser skips legacy world anchors/springs without diagnostics. Candidate
   must support them explicitly or reject atomically, never silently drop them.
5. Root regeneration checks link IDs without semantic remap. A reversed [b,a] link
   at t=.25 becomes [a,b] at the same t, moving the anchor from x75 to x25. Remap
   using endpoint identity and reverse t when necessary.

## Proposed Kernel Boundary

Pure per-substep spring force evaluation from current joint positions/velocities,
links and stable anchors; additive buffers with no global state. Include fixed
endpoint forces in analytic conservation checks. The lead owns types, store,
codec and solver integration. Preserve legacy linear tuning as an explicit motion
scale, not SI certification. Correct torsion generalized forces: with tau equal to
-k*angleError-c*relativeOmega, distal A gets -tau*nA/LA, B gets tau*nB/LB, shared
pivot balances their sum.

Mandatory checks: stretch/compression/equilibrium, axial damping power and common
velocity neutrality; barycentric force/moment conservation; opposing torsion moments,
unequal lengths, rotation/wrap invariance; finite/zero separation; damper ignores
stiffness; anchor remap/deletion/undo/reopen; bounded session stress and atomic errors.
Full trajectories, legacy spring fixtures and browser workflows remain unverified.
