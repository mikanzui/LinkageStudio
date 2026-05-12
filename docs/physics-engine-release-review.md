# Physics engine — release risk & improvement review

Multi-agent codebase review focused on **`src/core/solver`**, **`src/core/springs`**, **`App.tsx` simulation tick**, stores, canvas/rendering, and utilities. Intended for prioritization ahead of an upcoming release.

---

## Architecture snapshot

- **Create mode + motor playback:** kinematic **`solve`** (Newton-style iteration on distance/crank constraints) in `newton-raphson.ts`. Joint updates are gated on **`result.converged`** in `App.tsx`.
- **Simulate mode:** **`solveWithForce`** — explicit forces/springs/drag, substeps, then PBD-style distance (and slider) projection; returns **`converged: true`** and **`residual: 0`** unconditionally (see `newton-raphson.ts` ~807–813), so the app cannot use residual/converged to detect simulate-mode instability.
- **Springs:** only in **`solveWithForce`**, not in **`solve`**.
- **Global joint velocities:** module-level map in `newton-raphson.ts`; **`resetVelocities()`** on entering simulate — can otherwise leak expectations across sessions/mechanisms if not reset.
- **Tuning:** `SOLVER_MAX_ITERATIONS`, `SOLVER_TOLERANCE`, `SIM_DT`, etc. live in `utils/constants.ts`, but **`solveWithForce`** also hardcodes substep counts, constraint passes, friction, and epsilons in-file. `SolverConfig` in `types/solver.ts` is not wired through the public solve API.

---

## Failure modes & risks

### Solver & constraints

| Risk | Notes | Where to look |
|------|--------|----------------|
| **NR non-convergence in create mode** | Motor time and driver angle can advance while **`moveJoint`** is skipped if **`solve`** does not converge — silent desync between timeline and geometry. | `App.tsx` (motor tick + `solve`), `newton-raphson.ts` `solve` |
| **Invalid / ambiguous driver topology** | If the driver link has no endpoint on the base (fixed) body, driver IDs may be missing and the motor tick can bail early with no structured user error. | `App.tsx` driver inference |
| **Simulate always “converged”** | **`solveWithForce`** always reports success; explosions and bad states still commit every frame. | `newton-raphson.ts`, `App.tsx` |
| **Under-tested kinematic path** | Automated tests emphasize **`solveWithForce`** / PBD; **`solve`** (motor + NR) lacks parallel coverage (singular driver, iteration limits, DOF parity). | `physics-integration.test.ts`, `test-scenarios.ts` |
| **Unused / dead constraint helpers** | **`onAxisConstraint`** in `constraints.ts` may be unused by `solve` / `solveWithForce` (sliders use custom projection in **`solveWithForce`**). Confusing for maintainers. | `constraints.ts`, repo-wide search |

### Springs & forces

| Risk | Notes | Where to look |
|------|--------|----------------|
| **Stiff springs + large effective `dt`** | **`sim.speed`** scales frame `dt`; PBD **`pbdSubsteps`** is bumped via **`simulatePbdSubstepsForFrameDt`** (#7). Still tighten dampers/spring k if unstable. | `App.tsx`, `constants.ts`, `solveWithForce` |
| **Springs vs PBD ordering** | Springs apply forces then links are projected; stiff springs fight projection → jitter / non-physical transients. | `solveWithForce` |
| **Zero-length linear spring** | Near-coincident anchors (**no stiff k-term**): **damper-only** along relative velocity when `c>0`; see `LINEAR_SPRING_SINGULAR_SEPARATION` in `spring-forces.ts`. | `spring-forces.ts` (**#8**) |
| **Collapsed torsion legs** | Near-zero leg length skips torsion torque for that frame. | `spring-solver.ts` |
| **Torsion model semantics** | Simplified paired tangential accelerations + large SI→sim scale **`TORSION_STIFFNESS_SI_TO_SIM`**; not full rigid-body **`τ = Iα`** across links. Misleading vs UI N·m labels. | `spring-forces.ts`, `spring-solver.ts` |
| **Dual damping** | Global per-substep velocity damping **and** per-spring damper coefficients — easy to overtune or misunderstand. | `solveWithForce`, `spring-solver.ts` |
| **Naming: `equilibriumRestLength` for torsion** | Same helper name used for linear rest length vs torsion equilibrium angle; **`restLength`/`prestress`** semantics differ by spring kind — documentation/tooltip risk. | `spring-solver.ts`, `spring-forces.ts` |
| **`solve` omits springs** | Any future code path that calls **`solve`** expecting “physics” will silently drop springs. | `newton-raphson.ts` |

**Mass semantics:** **`Link.mass`** vs **`Joint.mass?`** vs PBD / spring conventions are summarized in [`physics-mass-model.md`](./physics-mass-model.md) (**#9**).

### Integration, UI, and state

| Risk | Notes | Where to look |
|------|--------|----------------|
| **Fixed `dt` vs wall clock** | `setInterval(SIM_DT * 1000)` — slow frames lag wall time but still use the same `dt`. | `App.tsx`, `constants.ts` |
| **No pre-solve validation** | Missing guards for NaN/Inf positions, zero-length links, broken slider/collider references before **`solveWithForce`**. | `App.tsx`, stores |
| **Topology mutation on regen** | **`regenerateLinks` / `regenConstraints`** can inject bracing joints and change rest lengths from **current** poses; mode-switch depends on ordering with snapshots/outlines. | `mechanism-store.ts`, `mode-switch.ts` |
| **`moveJoint`** | No finite guard at store level; rest lengths depend on regeneration, not every move. | `mechanism-store.ts` |
| **`colliderSidesRef`** | Rebuilt when entering simulate; stale sides briefly possible after mode transitions. | `App.tsx` |
| **Force readouts** | Displayed “N” is **scaled model** output, not strict SI — users may over-trust numerics. | `utils/units.ts`, `force-analysis.ts`, renderer |
| **Errors invisible** | Simulation tick **`try/catch`** logs only — no pause/toast/recovery UX. | `App.tsx` |
| **Rendering** | `draw-mechanism` assumes finite joint coords — NaNs can corrupt or clear visuals. | `renderer/draw-mechanism.ts` |

---

## Recommended improvements (backlog)

**P0 — user-visible correctness**

1. **Simulate stability signal** — Compute a lightweight metric after **`solveWithForce`** (max Δq per substep, max velocity, post-projection violation). Thread through return value; in **`App.tsx`**, warn, clamp, or auto-pause instead of blindly committing when thresholds blow.
2. **Motor NR desync** — If **`solve`** fails convergence, do not advance **`advanceTime` / driver angle** OR show explicit **“kinematics not solved”** and pause playback.
3. **Finite guards** — Reject any frame that produces non-finite positions; optionally rewind to last good snapshot and reset velocities.

**P1 — tuning & maintainability**

4. **Unify solver configuration** — Wire **`SolverConfig`** (or export a single config object) so substeps/passes/tolerances are not split between **`constants.ts`** and **`solveWithForce`** literals.
5. **Driver validation** — Surface clear errors when driver link endpoints do not imply a fixed + driven joint.
6. **Rename/document torsion equilibrium** — Split **`equilibriumRestLength`** naming for torsion vs linear; tighten property panel copy.

**P2 — physics fidelity (longer horizon)**

7. **Stiff-spring stabilization** — Stiffness-aware substeps, or XPBD-style / implicit damping for stiff segments.
8. **Regularization at zero spring length** — Small ε fallback instead of zero force.
9. **Clarify mass model** — Document (or implement) how link mass in types relates to joint-acceleration spring model.

**P3 — UX & observability**

10. Toast/banner + auto-pause on tick exceptions.
11. UI copy for force overlays: **“model units”** vs SI.
12. Optional **FPS/solver timing** overlay for heavy mechanisms.

---

## Test gaps

- **`solve`** (motor + NR): singularities, max iterations, DOF/consistency vs **`computeDOF`**.
- **Link-anchored linear springs** (`split`, `resolveAnchor` paths) vs joint–joint-only coverage today.
- **Torsion:** wrap near ±π; **`siTorsionStiffnessToSim` / `siTorsionDampingToSim`** (mappers untested unlike linear helpers).
- **Stress:** very high stiffness × **`sim.speed`** × large **`dt`** — bounded motion regression.
- **Force analysis:** whether user expectations match spring + PBD-derived “sensor” behavior.
- **Integration:** **`switchMode`**, **`regenerateLinks`**, collider-side init, motor tick when **`SOLVER_MAX_ITERATIONS`** is exceeded.

---

## Key file index

| Area | Path |
|------|------|
| NR + PBD loop | `src/core/solver/newton-raphson.ts` — `solve`, `solveWithForce`, `resetVelocities` |
| Constraints | `src/core/solver/constraints.ts`, `driver.ts`, `dof.ts` |
| Force analysis | `src/core/solver/force-analysis.ts` |
| Springs | `src/core/springs/spring-forces.ts`, `spring-solver.ts`; tests `*.test.ts` |
| Tick & mode split | `src/App.tsx` |
| Stores | `src/store/mechanism-store.ts`, `simulation-store.ts`, `editor-store.ts` |
| Mode transition | `src/utils/mode-switch.ts` |
| Pointer → sim drag | `src/interaction/tool-manager.ts` |
| Render loop | `src/components/Canvas/MechanismCanvas.tsx`, `renderer/*` |
| Knobs | `src/utils/constants.ts`, `types/solver.ts` |
| Scripts (manual suites) | `test-slider.ts`, `test-rigidity.ts` (repo root of app package) |

---

## Export to GitHub Issues

Issues are scripted as numbered JSON payloads plus a PowerShell driver:

1. Install and authenticate GitHub CLI: `gh auth login` (or set `GITHUB_TOKEN`).
2. From **`linkage-studio/`** run:

   ```powershell
   powershell -NoProfile -File scripts/github-physics-issues/create.ps1 -DryRun
   powershell -NoProfile -File scripts/github-physics-issues/create.ps1 -Repo mikanzui/LinkageStudio
```

   Omit `-Repo` to use `gh repo view` default (follows `origin`, usually **mikanzui/LinkageStudio**).

3. Sources: [`scripts/github-physics-issues/issues.json`](../scripts/github-physics-issues/issues.json)

---

## Review method

Three parallel read-only agents were directed at (1) solver/constraints/DOF/driver, (2) springs and force coupling, and (3) app integration and UX failure modes; this document merges and de-duplicates their findings and spot-checks critical claims in `newton-raphson.ts` and `constants.ts`.
