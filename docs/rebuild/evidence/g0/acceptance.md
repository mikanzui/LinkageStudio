# G0 Acceptance: Baseline Ready For Rebuild

Date: 2026-11-15. Decision owner: Codex. Result: PASS for baseline establishment.
This unlocks G1 implementation. It does not certify the old app, the causal
experiment or any rebuilt feature as correct.

## Acceptance Evidence

| Criterion | Result | Evidence |
| --- | --- | --- |
| Preserve original and current states | PASS | Upstream/local ZIPs, dirty patch, untracked tests and hash-matching fixtures in baseline manifest |
| Isolate references and candidate | PASS | Separate worktrees/origins; upstream/candidate start at `3dfe105`; local is archived `9954fca` plus patch |
| Observe actual mounted app | PASS | Real chooser imports and pointer gestures; Vite read-only observers on mounted stores; no test-side store imports |
| Reproduce both mechanisms | PASS | Brown-arm/foot and WorkingScreen captures in Session 01; local Airer stops after one frame while upstream moves |
| Confirm intended interaction | PASS | User confirmed upper brown arm pulled upper-left; IDs and direction recorded in D13 |
| Test detects known bad behavior | PASS | 12 expected motion/failed-motion classifications; blocked pointer-down controls rejected |
| Record looks/usability baseline | PASS | Source C01-C14 inventory; fresh entry/design/simulation/drag/error captures; expanded-body-tree error visibility measured |
| Define retained scope and staged tests | PASS | F01-F21 mapped to G1-G10 and C/S rows; existing feature families retained, interaction simplification evidence-led |
| Preserve evidence integrity | PASS | 101 sealed artifact hashes verified; original tracked application patch unchanged |

Evidence: [Session 01](session-01.md), [fixture map](fixture-map.md),
[control checklist](usability-checklist.md), and
[sealed manifest](../../../../.rebuild.local/evidence/g0-runs/2026-11-15T19-12-32-965Z-4X1adO/manifest.json).

## Scoped Deferrals

- G2/G3: coordinated brown-arm opening, exact angles/slider travel, repeatability,
  constraint accuracy and numerical coincidence semantics. The motion smoke test
  is not a substitute for these tests.
- G4/G5: complete input/selection/panel/geometry screen matrix and accessibility.
- G8/G9: complete serialization/export/recovery/cloud qualification and those screens.
- G4/G10 release qualification: physical current-iPad/Pencil, Safari/Home Screen app,
  production/PWA and update tests. Hardware availability is recorded honestly.

These are feature-stage requirements, not waived tests. The initial plan incorrectly
made complete future-feature coverage and repeated user confirmation prerequisites
for beginning the rebuild. This scope correction follows the user's instruction
that Codex should perform verification and progress the gates autonomously.

## Scope Decision

Retain implemented F01-F21 capability families. Simplify interaction surfaces where
comparison evidence supports it; preserve precise selection improvements and local
editing without cloud dependency. Keep unimplemented annotations/two-point force/
collaboration out of parity scope. No custom backend is added without a concrete
requirement. Physical force readouts require model validation, not copied labels.

## Next Action

G1: implement the versioned canonical document/codec boundary on the isolated
candidate, preserve legacy payloads and explicit simulation semantics, and test it
against both real files before wiring the editor lifecycle. Original references
stay unchanged. Codex executes and records the checks; the user is not the test runner.
