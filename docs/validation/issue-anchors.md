# Issue anchors (frozen map)

**Execution order:** see [`../phased-issue-fix-plan.md`](../phased-issue-fix-plan.md).

Fill this **once per batch** after validation so later chats do not re-explore the repo.

| Issue | Anchor files | Validation signal |
|-------|----------------|-------------------|
| #1 P0 simulate stability | `newton-raphson.ts` `solveWithForce`, `constants.ts` thresholds, `App.tsx` simulate tick | `simulateMetrics` + auto-pause when `simulateStable === false`; time only advances on stable step |
| #2 P0 motor desync | `App.tsx` motor path, `driver.ts` | `advanceTime` / `setDriverAngle` only after `solve` converged + finite positions; pause otherwise |
| #3 P0 finite guards | `solver-commit-guards.ts`, `App.tsx` | `jointPositionsFinite` before commit; pause on failure |
| | | |

Use the stub in `.cursor/rules/issue-context-efficiency.mdc` when triaging a single issue before adding a row here.
