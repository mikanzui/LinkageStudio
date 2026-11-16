# Mechanism Playground Example

2026-11-16. Scope: a reproducible public example, documentation and focused tests;
no application, solver, dependency or schema changes. Candidate starts at
`6bfd1f4ce0b352d957c2007ee1b20bc35b66f29d`, app version remains0.16.0-rebuild.4.
Lead-only work; no delegation or cost/speed claim. Status: scoped example accepted
by the lead; domain and all six final native workflows including visible charts PASS.

## Example Contract

The standalone `examples/mechanism-playground.slinker` is generated from
`scripts/examples/create-playground.ts`. A byte-identical delivery copy is in
Downloads as `Slinker - Mechanism Playground.slinker`. SHA256:
`05137c40f07dcdd5adec1550b5dfbda970c361f059ffd5fd0cb6ab21e26eb454`.

Three independent systems share fixed Ground, without drawn cross-scene bracing:

- Green crank and gold coupler: a preloaded world-anchored linear spring drives
  an oscillating crank-slider. Crank-circle and body-local coupler-path tracers;
  a connecting-rod load sensor. No invented constant-speed motor behavior.
- Cyan carriage: parallel sliders, joint-anchored return spring, endpoint/link
  anchored dashpot and an actual finite vertical collider stop. The colored plate
  begins at the leading constrained edge, so the outline does not pass through
  the stop before the constrained joints reach it. A body-local travel tracer.
- Pink/purple jaws: two independent rigid arms about one fixed hinge, with a
  preloaded torsional spring between their incident links. Left-jaw arc tracer
  and load sensor. Dragging either jaw changes the opening.

All moving bodies have stable frames and persistent outlines. Gravity is disabled
so the designed preload, not an uncontrolled falling component, starts the demo.
No external image, account or network asset is needed. Parameters and loads use
the inherited legacy-motion/unit-particle model, not calibrated SI engineering units.
The [example guide](../../../../examples/README.md) explains controls and limits.

## Verification

- Two domain tests: reproducible exact file/clean codec and600 frames (ten seconds)
  with actual compiled topology/springs/contact and force analysis. Peak observed
  travel: output118.927, carriage179.9675, each jaw86.421 world units. The carriage
  actually reaches850.0325 near its850 stop; merely never crossing cannot pass.
  Maximum link-length error0.001836; fixed anchors unchanged, finite positions,
  slider rail errors below.1, source graph unchanged.
- Full workspace domain suite962 PASS, zero skips/failures. Lint/typecheck PASS.
  No production code changed; the existing frozen app source remains
  `dada801687a33439b6fe1d463ac192e6b21dd39239612200fee68179639a1a4f`.
  Observer artifactg11-ewQKKJ was reused only after verifying that exact fingerprint.
  Prior cumulative24/24 qualifies this unchanged app, not a newly rerun full suite.
- Native Chrome `playground/chromium-EQLI3Y` and WebKit `playground/webkit-gP4CZC`
  PASS on desktop1440x1000, portrait1024x1366/DPR2 and512x900 Split View/DPR2.
  Actual chooser/FileReader import, Fit, automatic simulation for >=6 simulated
  seconds, all three mechanisms' measured travel, exact fixed anchors, finite
  states, barrier side, all four tracer histories, both nonzero finite sensor
  histories, colored canvas pixels, native carriage drag, exact Create restoration,
  real Save download/reopen of every entity family and repeat simulation PASS.
  Native carriage pull moves81-111 world units. No page/console errors.
- Initial Rk1Q5i/oiGQMC runs intentionally remain failed: the new harness lacked
  a Save-as prompt handler, so Playwright dismissed the real prompt and the app
  correctly reported Save cancelled. Adding acceptance of the suggested filename
  repairs the harness only; no application/file edits were required. Retain those
  failed reports rather than describing the first invocation as PASS.
- Final Chrome `playground/chromium-eneUyt` / WebKit `playground/webkit-cbN9dM`
  repeat all three workflows per engine, plus native sensor-list selection and
  actual history-canvas ink (855-2844 nontransparent plotted pixels), not just
  sampled data. All six PASS; no errors. Native drag moves81-113 world units.
  Reviewed desktop sensor screenshot shows the actual load waveform alongside
  all mechanisms. The existing incomplete-analysis notice correctly discloses
  missing slider and kinematic contact reactions; it is not a motion failure.
- User-facing localhost5187: opened the delivered file in a new in-app tab, collapsed
  panels, Fit and Simulate; visibly observed all three systems with traces. Marked
  the new tab as a deliverable; existing tabs/projects were not replaced.

## Visual And Device Qualification

Reviewed native desktop and WebKit portrait/Split View design/running captures.
Colored rods, plate, springs, dashpot, stop and traces render with no missing assets.
The fixed wide-world example is an overview in512px Split View: use canvas zoom
for individual details; do not claim all small mechanism details are finger-sized
in the all-at-once fit. Portrait and desktop provide clear separated systems.
Native touch UI activations and viewport/DPR checks are real automated browser
tests; the held canvas drag in these cases uses a mouse, not physical Pencil/finger.
Latest physical iPad/Safari/Home Screen/Pencil/VoiceOver remains UNVERIFIED.
No new release/deployment or broad engineering-accuracy claim is made.

See [visual comparison](../../visual-usability-comparison.md#example-playground)
and [progress tracker](../../progress-tracker.md#example-playground).
