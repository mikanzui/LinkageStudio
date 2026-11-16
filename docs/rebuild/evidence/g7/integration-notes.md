# G7 Integration Notes

2026-11-16. G7 accepted in acceptance.md; this file preserves integration history.

## Implemented Contract

The accumulator receives every distance projection on every pass/substep. It
averages correction impulses by frame duration, not projection pass count. Fixed
supports balance distance and applied/spring loads. Model-force analysis is opt-in
and leaves positions/velocities unchanged; no global smoothing or cached readings.
Slider/barrier/grab reactions explicitly report incomplete qualification. Zero-rest
links retain sensors but have unavailable axial direction, not a fabricated zero.
Documents with sensors declare `forceModel: unit-particle-v1`; unknown models reject
atomically. These values are NOT calibrated SI engineering loads.

Known-load cases cover 1/3/6/12 passes and 1/10/24 substeps, static gravity 250,
external force 50 plus gravity 250, and all-fixed spring support balance. Topology
does not multiply free-fall gravity. Analysis on/off is bit-identical in the tested
motion sequence. A thirty-period pendulum test exposed excessive projection energy
loss (about 63/39/22% at 30/60/120Hz). An initial adaptive refinement passed energy
but was rejected after independent review: Airer took about 167ms/frame without
analysis and 256-277ms with it at 60Hz, rejecting 30Hz. WorkingScreen took 43-65ms
and rejected 1/12s. Ordinary substep controls succeeded. That refinement is REMOVED.

Undamped, anchored positive-distance graphs without springs/contact/grab now use
SHAKE/RATTLE half-kicks and position/velocity constraint impulses. The implementation
uses the old position gradient and the new velocity tangent, with bounded ordinary
substeps. Reference: [Andersen's original RATTLE paper](https://www.sciencedirect.com/science/article/pii/0021999183900141).
Both impulses enter force balance. Small-angle thirty-period energy/period bounds
remain <2%; large-angle 30s tests at 120Hz, 30Hz and dt=.1s keep <2% energy error,
length error <1e-7 and tangent dot-product <1e-6. Rejected constraints leave owned
velocities untouched. Both real coupled files now commit at 60/30/12Hz with zero
damping, without the brute-force refinement. A subsequent independent-probe run
measured warmed Airer analysis frames about 6ms at 60Hz and WorkingScreen 4-5ms;
these are local samples, not a device/FPS guarantee. The existing contact, spring,
drag, coincidence and unanchored paths retain PBD. Their long-term conservative
energy behavior is NOT qualified by the isolated-pendulum result.

Sensor definitions are undoable/persistent, follow endpoint identity during link
regeneration, survive reversal and mirror, and delete with dependencies. Tracers
have first-tap placement, names, world-coordinate edits and body reassignment that
preserves world position. Box/lasso includes enabled sensors; Fit includes distant
enabled tracers. Node lists now select/edit joint labels and identify mirrored
nodes. Clearing an imported label stores an explicit blank to prevent preserved
source metadata resurrecting the old name.

Time series are bounded (600 sensor samples, 6000 trace points), finite and owned
per project. Repeated/rewinding sensor times are ignored; position samples clone
caller coordinates. Pause stops sampling, restart clears samples, and import/new
clears driver/tracked-object ownership. Mode switching no longer inserts derived
outline reprojection into authored undo history. Display formatting does not round
stored numbers merely from focus/blur. Numeric physics controls have native fields
as well as sliders and reject invalid ranges.

## Browser Findings So Far

Final: 5b5431fb5b58d0dac961c35c10924ad0cc333251, g7-MwfdcW, source
`e4c1daa5ae32a1d0c2920132aba4fc833db07ceb0aa46dbc239df1cbde8c4b4f`.
519 tests/type/build/lint; cumulative through-g7-11YTSS all sixteen passes. The
intermediate/pending wording below records historical runs, not the final status.

First frozen artifact: `g7-P4jtGS`, source
`9ae33d726d19eb9d636e0e1a37802ac7b0e35bcd3eafc4b86fdddc2724546056`.
Focused Chrome `g7/chromium-browser-cBTJEY` and WebKit
`g7/webkit-browser-B3KFm7` pass desktop/tablet workflows. These are intermediate
results; the final cumulative artifact must also pass.

Earlier negative runs `chromium-browser-wgfisv` and `chromium-browser-26cYg3`
caught harness assumptions, retained as evidence: redo of creation clears selection
so the native tracer list must reselect it; a numeric edit initially requested the
same Y value; empty finger drags in the tracer tool pan rather than placing an
object. Cancellation still requires no orphan and no authored history. Trusted
input assertions distinguish actual canvas/control events from the application's
offscreen file-input click and blob-download anchor click; no arbitrary synthetic
control events are permitted.

Screenshot review of `cBTJEY/tablet/136-paused.png` found an applied-force label
overlapping the joint ring despite numerical/UI assertions passing. The renderer
now bounds arrow length at 100 CSS pixels and places noncolliding labels clear of
the vector/marker; independent renderer tests cover model-value preservation and
duplicate-label suppression. Visual retest on `bxLPiT` is recorded below.

The first cumulative run (`through-g7-ckpVQZ`, artifact `g7-BBRUDA`, source
`9b89ccd35af98efa361984bbf56f9e7236cc5929318af9bc14bfdd45dcd66f73`) passed
all fourteen G1-G6 suite/engine checks. Added blank-name browser negatives then
failed G7 in both engines (`chromium-browser-Yq3RaZ`, `webkit-browser-o6u1yK`):
shared CommitInput incorrectly rejected an empty text draft. Fixed for text while
empty/nonfinite numeric fields still reject. Joint/tracer/sensor field clearing now
has direct native-input undo/redo coverage, separate from the joint clear icon.
Additional tracer command tests caught missing validation/caller-coordinate aliasing
in inherited entry points; these now validate before history and clone positions.
The old body-reassignment entry point shares the validated transactional command.
517 domain tests/type/build pass. Rebuilt `g7-bxLPiT`, source
`0162cfc6b7fe22bbe4d9e30ed5be5df2237d8cadacac8af11d82d04041cef058`;
focused Chrome `chromium-browser-Ck9p5j` passes the expanded suite. The prior focused
`chromium-browser-pah9bR` failed a harness-only paused resume lookup (`Play` instead
of the actual `Resume` control); the corrected run retains all joint-trace/clear
assertions. Cumulative `through-g7-hPQzjF` is ACTIVE, not accepted from that count.

Lead-reviewed `Ck9p5j/tablet/159-sensor-chart-readable.png` and
`162-joint-reaction-readable.png`: chart/current/min/max are legible and show 250,
support Fy is -250, and the applied-force label now clears the joint ring. No panel
text overlap observed. Minimum-width 220px panel physics fields are bounded and
native controls remain reachable in Chrome; WebKit cumulative retest remains pending.

The second cumulative run `through-g7-hPQzjF` passed G1-G6 and the then-current
G7 Chrome workflow, but new WebKit edge negatives (`webkit-browser-SOUv13`) exposed
two remaining outputs: a COM-enabled body without an outline suppressed its normal
gravity arrow, and an all-fixed graph recorded no joint trace. The former now
requires actual closed outline geometry before COM suppression; the latter samples
committed frame joints, not only the solver's moving-position map. Domain tests
also exposed no applied spring/external vectors from the all-fixed early return;
static forces now feed the same display path independently of analysis enablement.
Numeric damping's old .999 cutoff ignored tiny nonzero field values; only exactly
1 selects the undamped conservative path now, with a direct fractional-damping
expected-value regression. All 519 domain tests pass after these corrections.

All worker usage is UNKNOWN. Euler/Hilbert/Archimedes/Bohr are handed off/closed.
Bohr's isolated reproduction remains in packages/g7-review/review.mts; six separate
fixed/free momentum cases with external loads/damping also passed. Physical iPad,
Pencil, VoiceOver and native Home Screen behavior remain unverified, not inferred
from code or browser emulation.
