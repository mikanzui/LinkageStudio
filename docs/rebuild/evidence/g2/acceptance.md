# G2 Acceptance: Owned Simulation And Exact Restore

Date: 2026-11-15. Decision owner: Codex. Result: PASS for ordinary-link/lifecycle
scope. Candidate `9192bad` on isolated `rebuild/g0-candidate`. G3 starts automatically.

## Implementation And Checks

Pure compilation clones the design and adds hidden scaffolding without replacing
saved visible links/rest lengths. Simulation sessions own velocity and barrier-side
state. Trial state is committed only after finite/fixed/ordinary-link validation;
failed frames cannot advance time or leak trial velocities. Position publication is
one store update. Returning to Create restores the exact original graph, not a
regenerated approximation. Design properties are read-only during simulation.

96 Node tests pass, including 22 independently authored local-Jacobian DOF cases.
Analytical checks cover gravity independent of link degree, 1/2/4-link chains over
240 frames, a collinear braced body, closed four-bar, coincidence constraints,
fixed supports, invalid frames and interleaved projects with identical IDs.
Ordinary-link error threshold is 0.001 world units; support drift threshold 1e-8.
Production build and ESLint pass. No claim of calibrated SI dynamics is made.

Chrome mouse and trusted touch-drag workflows pass: rigid rod motion, pause freezes
time/positions, resume advances, exact restore, ten repeated mode cycles, real-file
A/B/A compile/step/restore, and a deliberately inconsistent fixed rod that must stop
with a visible error and zero committed time. WebKit mouse passes the same paths;
WebKit touch uses trusted tap plus gravity for motion because this runner cannot
provide trusted touch drags through that engine. This limitation is not hidden by
synthetic pointer events.

Evidence runs (before final read-only-panel/design-serialization guard):
[Chrome](../../../../.rebuild.local/evidence/g2/chromium-bMTf4T/report.json),
[WebKit](../../../../.rebuild.local/evidence/g2/webkit-evWDJY/report.json).
The final guard change was followed by another complete passing G2 run:
[final Chrome](../../../../.rebuild.local/evidence/g2/chromium-YSudNl/report.json),
[final WebKit](../../../../.rebuild.local/evidence/g2/webkit-Ty4lDk/report.json).

Cumulative G1 browser workflows also pass across all four layouts in both engines:
[Chrome](../../../../.rebuild.local/evidence/g1/browser-KHrHxP/report.json),
[WebKit](../../../../.rebuild.local/evidence/g1/browser-ZuKQTB/report.json).
The G1 WebKit extension also passed before G2 changes:
[G1 WebKit](../../../../.rebuild.local/evidence/g1/browser-h44ORA/report.json).

## Intentional Changes And Remaining Scope

C06/C07/C12: pause/retry/restart commands and bounded visible errors now match
actual stepping. DOF uses normalized constraint-Jacobian rank, not redundant-link
subtraction; this is instantaneous/local mobility, not a promise of finite motion
through singularities. Gravity acceleration is applied once per joint rather than
once per incident derived link, removing a confirmed topology-dependent defect.
The explicit `saved-links-v1` tag identifies the preserved graph/rest-length policy;
it does not promise identical legacy dynamic time histories.

G3 remains mandatory: slider endpoint limits, moving/fixed rails, collider crossing,
full Airer brown-arm opening and coupled constraint accuracy. Coupled graphs are
measured but do not yet use the ordinary-link acceptance threshold. They are not
certified just because G2 real files step. Geometry/COM, advanced forces, cloud,
CAD and physical iPad/Pencil remain at their assigned later gates.
