# G5 Acceptance: Geometry And Images

Date: 2026-11-15. Owner: Codex. Result: PASS for the recorded contract.
Candidate commit: `c9178b88c20c3068cfa89e2ca59346acc8dbab66`.
Immutable output: `.rebuild.local/gate-builds/g5-iTGyV8` (11 artifact hashes).
Source including observer config: `9e0d31462d3f08088f1779e7bcf8cbe2f2f07d13cbe3a50ee0c60fb7f0e944ea`.
The output was built before commit from identical source; commit metadata is not
part of the source hash. G6 proceeds automatically.

## Evidence

326 unit/domain tests, TypeScript/production build, lint and diff whitespace pass.
Complete cumulative run: `.rebuild.local/evidence/cumulative/through-g5-tCHoDV/report.json`.
All 12 suite/engine combinations pass on the same source, unchanged start to end.

| Suite | Chromium Evidence | WebKit Evidence |
| --- | --- | --- |
| G1 local files, fields, undo, cancellation, four layouts | g1/browser-HPKlWH | g1/browser-HUjHnc |
| G2 session lifecycle and atomic rejection | g2/chromium-cIlFTl | g2/webkit-WULc67 |
| G3 both original/reopened real-file motion | g3/chromium-workflow-a61UiP | g3/webkit-workflow-l8Ew8h |
| G4 pointer ownership/selection/layout | g4/chromium-input-CPJ9Wc | g4/webkit-input-DJYLPY |
| G4 body controls | g4/bodies-6dQ6B8 | g4/bodies-tkgNQQ |
| G5 complete geometry/image workflow | g5/chromium-browser-2ARKWf | g5/webkit-browser-6GqBuU |

Paths are under `.rebuild.local/evidence/`; reports include raw state, screenshots,
trusted input records and traces. Earlier focused post-layout runs FIGOqK/gEhZsc
also pass. Original fixture hashes and root tracked patch hash still match baseline.

## Qualified Behavior

- Rectangle, circle and N-gon have independently checked world geometry, actual
  pointer/touch creation, cancellation and single-operation undo/redo.
- Manual outlines support partial cancel, explicit Finish and first-point closure.
- Outline body/name/visibility/closed/vertex properties preserve local/world semantics.
- Trim removes crossed edges only within explicit scope. Open runs preserve surviving
  vertices, IDs/metadata and unrelated entities; one undo restores the closed shape.
- Mirror has explicit axis/coordinate/scope and fresh IDs, constructive same-body
  membership, preserved original world poses, actual reflected bitmap transforms.
- Actual PNG chooser, image properties/move/cancel/undo and complete save/reopen retain
  body frame, open paths, reflection, transforms and embedded bytes.
- An asymmetric PNG follows actual simulated body rotation at independently predicted
  canvas pixels, while saved design transforms remain unchanged and restore exactly.
- Stable body frames, membership reprojection, frozen-outline save/cache lifecycle
  and large-coordinate polygon moments have analytical regressions.
- Expanded/collapsed coarse tool targets measure at least 44px. Every geometry option
  remains hit-reachable with expanded tablet toolbar and 512px Split View. Options
  now occupy an unframed wrapping band above canvas instead of an occluded floating box.

## Comparison And Limits

C03/C04/C06/C09/C10/C11/C12/C13, S08/S09/S10. Preserve upstream body colors,
canvas/joint language and original credit; added tools are explicit rather than hidden
palette gestures. Trim intentionally repairs destructive fork semantics; mirror is
not an independently moving duplicate mechanism. See D16/D17 and qualification-notes.

G4 expanded-target coverage is reaccepted by this run; the original gap stays logged.
Physical iPad, Pencil, Home Screen and VoiceOver remain unverified. Chrome uses trusted
touch with the documented held-release timing; WebKit tablet canvas drags use mouse,
with trusted UI touch taps. No calibrated SI force/COM dynamics claim is made.
