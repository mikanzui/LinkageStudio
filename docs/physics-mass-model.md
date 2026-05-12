# Mass model — joints, links, and simulation

LinkageStudio separates **topology / display mass** (`Link.mass`) from the **degrees of freedom** used in **`solveWithForce`** (PBD simulate).

---

## Links: `mass` field

Every `Link` has a **`mass: number`** in `src/types/mechanism.ts`.

- Used for **gravity-force visualization** vectors on links (combined with `link.mass * gravity.strength` scaling in `newton-raphson.ts`).
- It is **not** automatically turned into inertia for every joint acceleration in the PBD loop — the simulated moving particles are coarse-grained differently (see below).

---

## Joints: optional `mass?`

`Joint` may declare **`mass?: number`**.

- Intended for finer-grained or future use (e.g. concentrated masses). The simulate path primarily treats **free joints** as **effective unit-mass carriers** alongside spring and gravity weighting helpers (see **`jointGravityWeights`** in `App.tsx` when outlines use outline COM).

---

## Springs / integration: implicit “particle” mass

**Linear springs** compute accelerations via `linearSpringAccelerationOnB` assuming **unit mass at the driven end** (“SI labels in UI; sim scaling constants” — see comments in `spring-forces.ts`).

**Torsion** applies tangential acceleration with a **`τ`/2 convention** paired with simplified leg geometry (`spring-forces.ts` / `spring-solver.ts`) — **not full rigid-body** torque–inertia (τ = *I α*) computed from **`Link.mass`**.

---

## Takeaways

1. **`Link.mass`** affects gravity **display scaling** on links and conceptual “linkiness,” not full multibody inertia in the PBD ticker.
2. **Force overlays** (`utils/units.ts`, `FORCE_READOUT_LABEL_HINT`) show values in **solver model units** with **“N/kN-style” formatting** — comparable to SI for tuning, **not guaranteed equal** to a lab measurement from file masses alone.
3. For CoM/outline bodies, **gravity workload** is split across joints via **weights**, which can change how acceleration feels without changing each link’s **`mass`** field individually.
