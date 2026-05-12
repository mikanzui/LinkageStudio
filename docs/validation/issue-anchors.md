# Issue anchors (frozen map)

**Execution order:** see [`../phased-issue-fix-plan.md`](../phased-issue-fix-plan.md).

Fill this **once per batch** after validation so later chats do not re-explore the repo.

| Issue | Anchor files | Validation signal |
|-------|----------------|-------------------|
| #1 P0 simulate stability | `newton-raphson.ts` `solveWithForce`, `constants.ts` thresholds, `App.tsx` simulate tick | `simulateMetrics` + auto-pause when `simulateStable === false`; time only advances on stable step |
| #2 P0 motor desync | `App.tsx` motor path, `driver.ts` | `advanceTime` / `setDriverAngle` only after `solve` converged + finite positions; pause otherwise |
| #3 P0 finite guards | `solver-commit-guards.ts`, `App.tsx` | `jointPositionsFinite` before commit; pause on failure |
| #4 P1 SolverConfig | `types/solver.ts`, `utils/constants.ts` `DEFAULT_SOLVER_CONFIG`, `newton-raphson.ts` | `mergeSolverConfig`; NR + PBD + stability from one object |
| #5 P1 driver UX | `App.tsx`, `simulation-store.ts` `stepError`, `SimulationPanel.tsx` | Banner when motor link invalid |
| #6 P1 torsion naming | `spring-forces.ts` `equilibriumRestAngle`, `spring-solver.ts`, `PropertyPanel` tooltips | Torsion uses `equilibriumRestAngle`; row tooltips for φ₀/Δ vs L₀ |
| #19 P1-b pre-sim | `mechanism-sim-validation.ts`, `App.tsx` simulate path | Validates before `solveWithForce`; message + pause |
| #17 maint | `constraints.ts` `onAxisConstraint` doc | Documented unused-by-solver status |
| #18 dual damping | `SimulationPanel` global Damping label, `PropertyPanel` spring `c` rows | Tooltips distinguish global vs element damping |
| | | |

Use the stub in `.cursor/rules/issue-context-efficiency.mdc` when triaging a single issue before adding a row here.
