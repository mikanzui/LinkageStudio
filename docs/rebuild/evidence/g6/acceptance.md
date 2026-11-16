# G6 Acceptance: Springs, Dampers And Torsion

Date: 2026-11-16. Owner: Codex. Result: PASS for the recorded motion-model contract.
Candidate: `7a6dd398a5d8751b90aec80804879fe5abf8651d`.
Immutable artifact: `.rebuild.local/gate-builds/g6-gSRHyg`, 11 output hashes.
Source including observer: `9f0021683d25dd88b7886aa04336068ab9ef31f701c3466f7c9c1d9a122f9821`.
Artifact was built before commit from identical source. G7 proceeds automatically.

## Evidence

434 domain tests, TypeScript/build, lint and diff whitespace pass. Full cumulative
report: `.rebuild.local/evidence/cumulative/through-g6-hztyQs/report.json`.
All fourteen suite/engine combinations pass with unchanged source start/end.

| Suite | Chromium | WebKit |
| --- | --- | --- |
| G1 files/editing/four layouts | g1/browser-l1Itnv | g1/browser-wmuHdr |
| G2 lifecycle/atomic rejection | g2/chromium-xJ9GgG | g2/webkit-GCNTry |
| G3 original/reopened real-file motion | g3/chromium-workflow-PZ25Kb | g3/webkit-workflow-Ovm2FP |
| G4 input/selection/layout | g4/chromium-input-ouimbl | g4/webkit-input-3Ay01h |
| G4 body controls | g4/bodies-mcwk8q | g4/bodies-hBRftk |
| G5 geometry/images/bitmap pixels | g5/chromium-browser-zAkyuw | g5/webkit-browser-ojUhVq |
| G6 complete spring workflow | g6/chromium-browser-18Z8g5 | g6/webkit-browser-h7cXj1 |

Paths are under `.rebuild.local/evidence/`. Reports retain pre-assertion graph data,
trusted input, motion samples, meaningful screenshots and traces. Both original
files still move and restore. Root tracked-patch SHA256 remains baseline-identical.

## Delivered Contract

Linear, damper and torsion tools; joint/link/world anchors; explicit snap intervals;
native parameter, rest/offset, name and attachment controls; selected-object list;
single-operation undo/delete/reattach; complete actual save/download/reopen.
Reattachment keeps ID/coefficients/offset, resetting natural rest to the new anchors.
Regeneration remaps link identity and reverses fractional t when endpoint order flips.
Deletion removes dependent springs atomically; undo restores exact attachments.
Mirror reflects springs/world anchors and negates torsion rest/offset consistently.
Selection/fit include springs. New spring fields survive schema/extension round-trip.

Independent domain cases check signs, force/moment conservation, damping power,
zero separation, wrapping/rotation, unequal torsion legs and input immutability.
Integrated oscillator positions agree with analytic motion at 30/60/120Hz; thirty
periods retain the preselected <2% energy bound. Stiffness 100/10000/1000000 and
dt 1/120,1/30,.1 remain bounded; excessive microstep budgets reject without committing
geometry or velocity state. Original no-spring stepping is unchanged.

Browser tests compare equilibrium baselines with shorter linear rest and torsion
targets in both angular directions, rather than accepting arbitrary displacement.
Pause halts graph/time; Create restores the entire design graph. New coarse tool,
field and attachment targets are >=44px and reachable, including Split View options.

## Corrections And Limits

Negative controls caught idle panel resize erasing reattachment identity, and old
invalid-input alerts persisting after correction. Both are repaired and asserted
in the final suite. Earlier negative artifacts remain in integration-notes.md.

Springs retain named legacy motion scales; torsion now uses conservative opposing
moments. This is NOT calibrated N/m or N.m/rad behavior. Broader force readouts and
legacy outline-weighted gravity are qualified separately in G7. Node-name/list
parity and generic floating display formatting remain explicitly tracked G7 work.
Physical iPad/Pencil/Files/Home Screen/VoiceOver remain unverified. WebKit canvas
tap and native mouse cancellation are distinguished from Chrome trusted touch.
