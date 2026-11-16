# G3 Acceptance: Legacy Opening, Sliders And Barriers

Date: 2026-11-15. Decision owner: Codex. Result: PASS for the recorded G3 contract.
Candidate: `9639bddda75553993269816957af6490b8a10608`.
Source fingerprint: `94c167dac2666f1347c92ab88f93a2f565ea644fd1b591120c13be994355cf13`.
G4 proceeds automatically, with code/WebKit/touch verification per D15.

## Actual Full-Opening Evidence

The primary pull is the confirmed brown handle `g6kFted7Nm`, through world targets
`(600,200)`, `(400,100)`, `(100,-50)`, with real pointer down/move/up. The same
fixture is saved, reopened through the chooser and pulled again. Chrome mouse and
trusted CDP touch runs pass; WebKit mouse runs pass. WebKit touch drag is not claimed.

Chrome Airer opening is about 41.18 degrees with leg spread about 510 world units
(initial spread 50.11). Brown-handle travel is about 451.7 world units. This is
coordinated opening of the actual legs/wing/slider, not movement of an arbitrary
joint. The user's supplied open screenshot gives an independent coarse reference:
apex approximately `(555,195)`, feet `(358,713)` and `(751,713)`, implying about
41.5 degrees between the legs. Those are manual annotations of the conversation
image, not a fabricated archived image or a pixel-perfect automated match.

The test's broad full-opening criterion is 30-60 degrees and spread above 300,
with the stable handle ID grabbed and meaningful motion. Numerical criteria use
the pre-existing relative rigid-link target below 1e-3, fixed drift below 1e-8,
plus coincidence and rail/limit errors below 0.1 world units. The sampled final
Chrome runs have maximum relative link errors below 0.00021; WebKit below 0.00050.
Fixed drift is zero. These are interactive kinematic checks, not calibrated SI-force
or arbitrary-stiffness guarantees. The primary workflow is repeated after reopening.

WorkingScreen also passes original/reopened movement in both engines (Chrome
roughly 149-154 world units handle travel; WebKit roughly 119-120 under its event
timing), with bounded constraints and exact design-graph restoration.

Evidence:
[Chrome mouse/touch report](../../../../.rebuild.local/evidence/g3/chromium-workflow-j8FJDB/report.json),
[WebKit mouse report](../../../../.rebuild.local/evidence/g3/webkit-workflow-eZZp9R/report.json),
[touch Airer opening](../../../../.rebuild.local/evidence/g3/chromium-workflow-j8FJDB/touch-airer.slinker-0-held.png),
[WebKit Airer opening](../../../../.rebuild.local/evidence/g3/webkit-workflow-eZZp9R/mouse-airer.slinker-0-held.png).
Both reports pin the same source hash at start and end; changing source during a
run is now a test failure. Raw samples are retained before assertions execute.

## Why Earlier Repairs Were Insufficient

The fork's validation rejected a legitimate saved zero-rest coincidence after a
small numerical displacement, halting the Airer after one frame. That explains the
dead drag, but bypassing it alone did not establish full opening. The inherited
solver also used a fixed 50/50 slider correction that did not account correctly for
which rail endpoints were free, and too few constraint passes left loops flexible.
The pinned upstream could move the brown handle on the tested path while leg spread
stayed near 39 units. Increasing force could destabilize it instead of opening it.

The candidate retains the saved graph, projects slider constraints using the actual
available inverse masses/Jacobian, handles endpoints explicitly, and iterates contact
and rigidity together. Coupled microsteps and bounded adaptive convergence avoid
passing an overstretched frame. Session acceptance checks enforce relative link,
coincidence and slider bounds before publishing. Gravity's topology defect was
already corrected at G2. Nominal design DOF stays 1 rather than changing to 0 from
small residual errors in a redundant moving graph; the label is now Design DOF.

## Regression And Scope

139 Node tests pass; TypeScript/Vite/PWA build and ESLint pass. Tests cover fixed,
moving and rotated rails; endpoint limits at varied dt/damping; continuous swept
point/moving-segment geometry; high-speed static crossing; endpoint bypass and
translating-barrier response. Degenerate/stale saved barriers are preserved with
import diagnostics rather than silently removed from the file.

All cumulative G1 and G2 browser cases pass against this pinned source:
[G1 Chrome](../../../../.rebuild.local/evidence/g1/browser-E79TFK/report.json),
[G1 WebKit](../../../../.rebuild.local/evidence/g1/browser-CXrDVX/report.json),
[G2 Chrome](../../../../.rebuild.local/evidence/g2/chromium-ELAwDy/report.json),
[G2 WebKit](../../../../.rebuild.local/evidence/g2/webkit-JEN2QB/report.json).
G0 sealed baseline evidence remains unchanged. Earlier failed G3 reports remain
alongside accepted reports; assertions were not relaxed to accept them.

C06/C07 now have full-opening/restoration evidence, C10 has trusted Chrome touch
pulls plus WebKit core coverage, and C11 has save/reopen/repeat motion. G4 still
owns comprehensive palm/Pencil/cancel/pinch/panel/focus and responsive-layout work.
Physical iPad/Safari/Pencil remains unverified; source/emulation tests do not certify it.
