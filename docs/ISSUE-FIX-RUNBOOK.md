# Issue fix runbook — your checklist + multi-agent playbook

Use this with [`phased-issue-fix-plan.md`](./phased-issue-fix-plan.md) and [`validation/issue-anchors.md`](./validation/issue-anchors.md).

---

## Terminology

- **Driver / playback (create mode):** The app ties animation to a **driver link** on the **base (red) body** — the UI may not say “motor”; tests and errors refer to **driver** or **kinematics**.

---

## Part A — What you do (human / process)

### Before any coding session

1. **Branch** — `git checkout -b fix/phase-N-short-topic` from current `master`.
2. **Baseline** — from `linkage-studio/`: `npm ci` (if clean), `npm run build`, `npm test`. Note failures in `issue-anchors.md` or a PR comment.
3. **Pick a phase** — follow the phase table in `phased-issue-fix-plan.md`; do not skip P0 if physics is still broken.
4. **Open GitHub issue(s)** — read acceptance criteria: `gh issue view N -R mikanzui/LinkageStudio`.

### During implementation

5. **Update anchors** — add a row in `docs/validation/issue-anchors.md`: issue #, files touched, how you will prove it (test name or manual step).
6. **Small commits** — logical commits per issue or per file cluster; message references `#N`.
7. **PR** — one PR per suggested PR letter (A–G) when possible; link issues `Closes #N` or `Refs #N`.

### After implementation (automated)

8. `npm run build` && `npm test` && `npm run lint` (if lint is part of your workflow).
9. Fix any TypeScript errors before asking for review.

### After implementation (manual)

10. Run the **Manual / human validation** section in `phased-issue-fix-plan.md` for the issues you changed (browser, motor, simulate soak, etc.).

### Shipping

11. Merge to your default branch; optional: open PR to `upstream` (Huggabiz) if you use that remote.
12. Close or update GitHub issues; deploy Pages if applicable.

---

## Part B — Efficient multi-agent setup (parallel vs serial)

### Rule: minimize merge conflicts

| Work type | Parallel OK? | Notes |
|-----------|----------------|-------|
| **Same file hot spots** (`App.tsx`, `newton-raphson.ts`) | **No** — one agent / one human sequence | Phase 1 (#1–#3) is serial. |
| **Different directories** | **Yes** | e.g. `spring-forces.ts` + `SimulationPanel.tsx` copy. |
| **Tests only** | **Yes** if tests are different files | e.g. `#15` in `spring-forces.test.ts` while another agent edits `dof.ts` docs. |
| **Docs + code** | **Yes** | e.g. `#9` doc while code PR is open — watch for contradiction. |

### Suggested parallel batches (after Phase 1 lands)

1. **Batch 1 (parallel):** `#5` (driver errors in `App.tsx` or panel) + `#6` (property strings in `PropertyPanel` / spring types) — only if `#5` does not balloon `App.tsx`; if both need `App.tsx`, serialize.
2. **Batch 2 (parallel):** `#17` (`constraints.ts` audit) + `#18` (panel tooltips only).
3. **Batch 3 (parallel):** `#11` (units copy) + `#22` (force gauge UX) — both UI; split by file if possible.
4. **Batch 4 (tests):** `#13` vs `#15` vs `#14` in **different** test files — parallel OK.

### How to launch agents without token burn

- **One** read-only explore per theme, **fixed output**: files list + 3 acceptance checks (see `.cursor/rules/issue-context-efficiency.mdc`).
- Do **not** spawn two explores both targeting `newton-raphson.ts`.
- Paste the **anchor table** row into the agent prompt so it does not re-map the repo.
- **Parent agent** merges results; subagents do not “continue the conversation” — they return a single structured block.

### Cursor features (quick map)

| Feature | Use for |
|---------|---------|
| **Agent + grep/read** | 90% of fixes after anchors exist |
| **Task → explore (readonly)** | One-time boundary scan per phase |
| **Parallel Tasks** | Only disjoint paths (table above) |
| **Terminal** | `npm test`, `gh issue view` |
| **Avoid** | Repeated full-repo semantic search every session |

---

## Part C — Repo map (quick)

| Area | Path |
|------|------|
| Sim tick / motor | `src/App.tsx` |
| PBD + metrics | `src/core/solver/newton-raphson.ts` |
| Solver types | `src/types/solver.ts` |
| Knobs | `src/utils/constants.ts` |
| Sim state | `src/store/simulation-store.ts` |

---

## Part D — Execution status (maintain by hand)

| Phase | Status | PR / notes |
|-------|--------|------------|
| 1 P0 #1–#3 | Done | `master` — simulate metrics, motor sync, finite guards |
| 2 P1 #4–#6, #19 | Done | `DEFAULT_SOLVER_CONFIG`, `stepError` UI, torsion `equilibriumRestAngle`, pre-sim validation; #18 tooltips included |
| 3 P2 #7–#9 | Done | Simulate `pbdSubsteps` scale with Speed; degenerate-length spring damping; `docs/physics-mass-model.md` |
| 5 P3 #10–#11 partial | Done | Tick `catch` → `stepError` + pause; `FORCE_READOUT_LABEL_HINT` on force UI |
| 4 hygiene #17–#18 | Done | Landed with phase 2 (tooltips / `onAxisConstraint` doc per plan) |
| 6–7 | Pending | Tests batch (#13–#16), product tools (#20–#23) |

Update this table as you merge work.
