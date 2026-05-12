# Phased plan — open issues (mikanzui/LinkageStudio)

Evaluation of **23 open issues** as of plan creation: group by **dependency**, **shared code paths**, and **risk**. Phases are **sequential** unless noted “parallel OK.”

| Phase | Theme | Issues | Rationale |
|-------|--------|--------|-----------|
| **0** | Baseline | — | Record `npm test` + `npm run build` green; optional `docs/validation/issue-anchors.md` rows before edits. |
| **1** | Core physics safety (P0) | **#1**, **#2**, **#3** | Same neighborhood: `App.tsx` tick, `solve` / `solveWithForce`, `newton-raphson.ts`. **#1** extends solver result shape; **#2** fixes motor/time desync; **#3** guards commits after solve. Implement in that order to avoid merge churn. |
| **2** | Solver maintainability (P1) | **#4**, **#5**, **#6**, **#19** | **#4** centralizes knobs (helps **#1** thresholds and **#7** later). **#5** driver UX; **#6** naming/tooltips; **#19** pre-solve validation (pairs with **#3**). **#5** and **#6** parallel OK after **#4** skeleton exists. |
| **3** | Physics fidelity / docs (P2) | **#7**, **#8**, **#9** | **#7** stiff springs / `dt` — best after **#1** metrics exist. **#8** zero-length springs; **#9** documentation-only can ship anytime but fits here. |
| **4** | Hygiene | **#17**, **#18** | **#17** grep + delete/wire/doc `onAxisConstraint`. **#18** copy-only in panels/tooltips. Low coupling. |
| **5** | UX hardening (P3) | **#10**, **#11**, **#12** | **#10** error surfacing; **#11** honest force labels; **#12** dev overlay (feature-flag). Can follow Phase 1 so simulate errors use same banner path as **#10**. |
| **6** | Automated validation (tests) | **#13**, **#14**, **#15**, **#16** | Land **with** earlier phases where possible (e.g. **#13** with **#2**). **#16** integration last — depends on stable mode-switch behavior. |
| **7** | Product / tools | **#21**, **#22**, **#20**, **#23** | **#21** (trim scope) and **#22** (gauge removal affordance) are smaller. **#20** (two-point force) medium. **#23** (text + arrow) largest — new model + render + persistence. |

---

## Suggested PR breakdown (minimal loop)

1. **PR-A (Phase 1):** #1 + #2 + #3 + Vitest for any new pure helpers (metrics, finite check).
2. **PR-B (Phase 2):** #4 + #5 + #6 + #19 (split only if #4 is huge: first PR config only, second PR UX + validation).
3. **PR-C (Phase 3):** #7 + #8; **#9** as doc commit in same or separate PR.
4. **PR-D (Phase 4):** #17 + #18.
5. **PR-E (Phase 5):** #10 + #11; **#12** optional behind flag.
6. **PR-F (Phase 6):** #13–#16 as tests PR(s) or folded into A–E.
7. **PR-G (Phase 7):** #21 → #22 → #20 → #23 (or #23 alone if scope creep).

---

## Dependencies (quick)

- **#7** benefits from **#1** (measurable instability).
- **#19** overlaps **#3** — merge implementation or single owner.
- **#16** should run after **#1–#3** and mode-switch paths are stable.
- **#23** may need file format / store decisions — check before **#20** if persistence shares annotation layer.

---

## What Cursor / automation can validate well

- Unit and integration tests (`vitest run`), TypeScript build, ESLint.
- Grep-based audits (**#17**), refactors with compiler feedback.
- Deterministic solver scenarios (given fixture mechanism JSON if you add fixtures).
- UI copy changes in TSX (static review).

---

## Manual / human validation required (re-run after fixes)

Use this as a **sign-off checklist**; Cursor cannot fully substitute perception, hardware, or production auth.

### Simulation & physics feel
- [ ] Run **simulate** with **stiff springs** + **high sim speed** — confirm warning/pause/clamp behaves and no silent explosion (**#1**, **#7**).
- [ ] **Motor playback** in create mode: force non-convergent mechanism (if possible) — time/driver must not run ahead of geometry (**#2**).
- [ ] Introduce **bad state** (if dev cheat) or stress test — **non-finite** recovery feels correct, no blank canvas (**#3**).
- [ ] **Long soak**: leave sim running 10–30 min on a nontrivial mechanism — memory and frame time acceptable.

### Motor & driver
- [ ] Invalid / ambiguous **driver link** — user sees clear message, not silent no-op (**#5**).

### Springs & labels
- [ ] **Torsion** vs **linear** property labels read correctly for non-developers (**#6**, **#9**, **#18**).
- [ ] **Force readouts**: numbers match expectations for a known simple case (trust but verify) (**#11**).

### Errors & tooling
- [ ] Force a **tick exception** (temporary throw) — banner/toast and optional pause (**#10**).
- [ ] **Force gauge**: discover how to remove/hide; new affordance is obvious without docs (**#22**).
- [ ] **Trim tool**: multiple bodies — only targeted colour body is trimmed (**#21**).

### New features
- [ ] **Two-point force** workflow matches design intent; comparable to spring tool if combined (**#20**).
- [ ] **Text box + arrow**: create, edit, move, save, reload file, export — persistence correct (**#23**).

### Cross-environment
- [ ] **Browser matrix** (at least Chrome + Edge or Firefox): canvas, pointer, keyboard.
- [ ] **Laptop vs desktop**, **different DPI** — overlays and text readable (**#12** overlay if enabled).
- [ ] **Touch / pen** (if supported): no regressions on canvas tools.

### Product & release
- [ ] **GitHub Pages / production build** smoke (`npm run build`, deploy preview).
- [ ] **MSAL / OneDrive** (if applicable to your branch): sign-in, save, open — not covered by solver tests.
- [ ] **Stakeholder demo** on 2–3 real user mechanisms.

---

## Tracking

- **Runbook (your steps + parallel agents):** [`docs/ISSUE-FIX-RUNBOOK.md`](./ISSUE-FIX-RUNBOOK.md)
- Issues: https://github.com/mikanzui/LinkageStudio/issues  
- Anchor map (fill during validation): `docs/validation/issue-anchors.md`  
- Risk context: `docs/physics-engine-release-review.md`
