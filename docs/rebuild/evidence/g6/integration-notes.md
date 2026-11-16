# G6 Integration Notes

G6 ACTIVE, not accepted by this note. Candidate c9178b8 plus current G6 patch.
Frozen test artifact g6-XcnID3, source SHA256
`b928b922031b187f1212cf7645287bbceb02dd38d52f93a5d1e4d7bfa74201e0`.

## Model And Causal Checks

Spring kernel is pure per-substep evaluation. Linear .006/.006 and torsion 10/5
coefficient scales are retained as legacy motion tuning, not SI calibration.
Torsion now applies opposing moments divided by each leg length, with a balancing
pivot force. Damping power is independently checked nonpositive. Fixed endpoint
forces remain in analytic kernel output even though fixed positions do not integrate.
World anchors are explicitly supported rather than silently dropping their spring.

The first integrated analytic oscillator test found phase error at 30/60/120Hz
outside the preselected .16 world-unit tolerance. Kept the tolerance and refined
spring-only integration to at most 1/3000s before further stiffness/damping refinement.
No-spring mechanisms retain the accepted G3 stepping. Frames requiring more than
2048 microsteps reject atomically with an actionable stability-budget diagnostic.

434 tests currently pass with TypeScript/build/lint. Includes 78 independent kernel
cases, thirty-period energy bound <2%, independent oscillator positions, signed
torsion restoration with unequal grounded/free legs at 30/60/120Hz, stiffness
100/10000/1000000 with dt 1/120,1/30,.1, and atomic failure-state recovery.

## Persistence And Workflow Contract

Endpoint identity remaps link IDs and t -> 1-t on reversal. One store publication
includes topology and dependent attachment changes. Deletion/undo, repeated load,
explicit reattachment (reset natural rest, preserve offset), world anchors and
extension metadata have document/store tests. Saved files identify springModel
legacy-motion-v1 independently of the source application version.

Mirror supports all spring families, reflecting world anchors and negating torsion
rest/offset angles. Selection/marquee/fit include springs. Parameter and anchor
properties use named native controls; no SI label or unqualified force readout.
Browser placement/edit/cancel/reattach/delete/save/reopen and cumulative gate results
are still required before acceptance. Physical iPad/Pencil remain unverified.

Browser negative run b928...: Chromium IKhGfO and WebKit 1Bjpf1 reproduce a real
reattachment bug in both desktop/tablet profiles. Idle panel resize invoked the
gesture-cancel path and unconditionally cleared springReattachId; torsion then
created a second spring. Repair distinguishes an active captured transaction from
an idle layout change. Background blur still clears pending placement explicitly.
Same reattachment/identity/history assertions run on fresh g6-xBzueb, source
`89c93cd392635a7ab5cc2a5b0376bb34f6b5ce11bede9a4ba77c1572aaad21ad`.

Focused 89c93 runs 8W8U5v/2o12xI pass all functional spring workflows. Screenshot
review then found an old invalid-attachment alert still displayed after valid
correction and during successful simulation. Added an explicit alert-clearing
regression before accepting the gate. Earlier green functional assertions do not
qualify this newly identified feedback path; cumulative validation includes it.

The strengthened 89c93 suite correctly fails on the stale alert in knZSOd/8iwd9l
(through-g6-2YumNd). Successful native edits now clear it; completed canvas placement
defers clearing until pointer release so feedback resizing cannot roll back the
new spring. Fresh g6-gSRHyg, source
`9f0021683d25dd88b7886aa04336068ab9ef31f701c3466f7c9c1d9a122f9821`, passes
K7KiGV/p3Xz7A, including invalid -> valid edit and invalid -> successful reattachment.
434 domain tests and type/build/lint remain green; final cumulative requalification
is running before promotion.

## Parity Closure To Revisit

The scope matrix includes fork joint/node names and mirrored-node metadata under
F01. Existing metadata survives codec round-trip, but the candidate currently lacks
the fork's node-list naming interface. Add the joint object/property workflow and
browser regression during G7's force/tracer object work; do not claim full F01 UI
parity from the earlier body-name tests. G1's recorded tested contract is unchanged;
this is an explicitly tracked release-parity gap, not a silent feature deletion.
