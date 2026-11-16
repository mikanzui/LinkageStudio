# G0 Session 01: Real Browser Baselines

Date: 2026-11-15. Result: baseline infrastructure and dead-drag reproduction
completed; full G0 acceptance remains open. Original application source unchanged.

## Runtime Identity

| Runtime | URL | Source |
| --- | --- | --- |
| Upstream reference | http://127.0.0.1:5181/linkage-studio/ | v0.12.3 `3dfe10512e105f863a582ce5cc4b3bb8a2006306` |
| Archived local reference | http://127.0.0.1:5182/LinkageStudio/ | `9954fca` plus archived patch `184322a978b5017eb90a4b6fcf96ef94d510110fbf7c31162f9cdaa97fcbc95f` and untracked source tests |
| Candidate foundation | http://127.0.0.1:5183/linkage-studio/ | Separate `rebuild/g0-candidate` worktree at upstream; no app changes yet |
| Causal experiment | http://127.0.0.1:5184/LinkageStudio/ | Local reference plus ONE dev-server guard transformation; not a qualified fix |

Windows, Node v24.13.1, installed Chrome 157.0.8103.51, Playwright 1.65.1 headless,
1440x1000 CSS pixels, default device scale factor 1, mouse. Each case uses a fresh
browser context; origins/storage are separate and service workers blocked for
the development baseline. Production/PWA behavior is not qualified by these runs.

`npm ci --legacy-peer-deps --no-audit --no-fund` completed independently in all
three worktrees. Dependencies remain at their pinned baseline versions. A separate
ignored tooling installation provides Playwright; no app package/lock was changed.

The dev-only observer is appended to the actual mechanism/editor/simulation store
modules by a Vite transform. Tests read cloned snapshots; they never import stores
or call a solver from page code. Build identity is in an HTML meta element, which
works with the local app's CSP without weakening it. No app state is injected.

## Sealed Evidence

[Evidence manifest](../../../../.rebuild.local/evidence/g0-runs/2026-11-15T19-12-32-965Z-4X1adO/manifest.json)
lists 101 hashed artifacts: screenshots, frame snapshots, fixture imports,
layout measurements, runtime configs and the exact test tooling.

Mutable development captures remain under `.rebuild.local/evidence/g0`; the report
refers to the sealed copy. Historical clipboard images were unavailable. Fresh
captures supersede the invalid initial screenshots taken during the splash.

Source/fixture mapping: [fixture-map.md](fixture-map.md).
Control/task checklist: [usability-checklist.md](usability-checklist.md).

## Actual User Flow Tested

1. Load each build, identify it, inspect meaningful content and console.
2. Use upstream Open or local Open Local File. Supply each original fixture through
   the browser file chooser and wait for visible joints and splash completion.
3. Pan/zoom through actual mouse controls; read camera and canvas rectangle to
   transform the same world-space grab/path into screen coordinates.
4. Click Simulate, mouse-down on the mapped joint, verify actual `simDrag` identity,
   move in 30 steps with 50 ms waits and take 30 mounted-state snapshots.
5. Capture held/released states, mouse-up, then click Create and compare visible
   design joints to the imported state.
6. Repeat with pointer-down suppressed in an otherwise unchanged upstream candidate
   as a negative control. No solver call or artificial displacement substitutes for input.

Raw motion times vary slightly because these are wall-time browser runs. Simulation
time and individual joint states are recorded. This is not a deterministic-frame
physics benchmark or full trajectory parity test.

## Reproduced Airer Failure

The local app imports the file and accepts the grab, but simulation time stops at
`0.016666666666666666` seconds. Error:

```text
Link "link_3DdNCLFmHi_tuJsmXorU2" has zero or negative rest length.
```

This is a saved zero-length distance link between two different coincident joints.
After the first committed solve, their observed separation is
`0.0002729194081997472` world units. The next pre-solve validation compares that
solver residue with a `1e-10` threshold and refuses every subsequent solve.
Thus the drag state is active while the actual mechanism does not move.

The folded pose is already in the input file: moving-joint x range is approximately
762.5-825.1. A folded still image alone is not proof of load corruption or collapse.
The reproducible difference is whether a real drag can articulate that pose.

## Single-Guard Causal Experiment

Reference source stays untouched. An explicitly named experimental server replaces
only this condition in `mechanism-sim-validation.ts` at serve time:

```ts
// Local reference
if (!(link.restLength > LINK_EPSILON) && currentLength > LINK_EPSILON) {
// Causal experiment
if (!Number.isFinite(link.restLength) || link.restLength < 0) {
```

All other file, input, topology and solver behavior stays that of the local
reference. This isolates the stop condition; it is not the final coincidence model,
numerical tolerance policy or migration design for the rebuild.

## Measured Results

World units; values from the sealed run, not estimated from screenshots.

| Interaction / Measurement | Upstream | Local Reference | Causal Experiment |
| --- | ---: | ---: | ---: |
| Airer brown handle travel | 374.021 | 0 | 426.935 |
| Airer foot travel along ground rail | 58.109 | 0 | 59.803 |
| Airer leg spread, before foot pull | 51.862 | 50.164 | 51.862 |
| Airer leg spread, held foot pull | 109.972 | 50.164 | 111.666 |
| WorkingScreen pull endpoint travel | 85.876 | 87.332 | 89.056 |
| Fixed-joint drift in these drags | 0 | 0 | 0 |
| Visible design-joint restoration error | 0 | 0 | 0 |

Handles: Airer brown `g6kFted7Nm`, Airer slider B `XlD7YOWwBk`, WorkingScreen
Door Pull Link endpoint `0oYLG5yu-0`. The brown-handle path alone does not establish
leg opening; the separate foot pull measures the actual spread. The user subsequently
confirmed the upper brown arm and upper-left pull direction on 2026-11-15. This
validates handle selection; it does not approve the test's numeric waypoint or
establish that the full coordinated opening was achieved.

Negative controls were rejected for all three interactions: no active grab, only
idle motion. Brown idle travel was 0.283, foot 0.487, WorkingScreen 5.353 units.
The broad motion smoke criterion requires an actual grab, >10 units of handle
travel, advancing simulation time, finite coordinates, no error, fixed coordinates
and design-pose restoration. All 12 expected success/failure classifications match.
The unchanged local Airer is an EXPECTED FAILURE, not a passing application result.

Physics acceptance is explicitly false. Large brown-arm pulls produced max link
length errors of 18.095 upstream and 23.823 in the experiment. Foot pulls were
0.715/0.702; WorkingScreen max sampled errors were approximately 0.046-0.051.
These are diagnostics requiring stronger solver qualification; moving is not the
same as preserving rigidity or matching the full reference pose.

## Looks And Usability Observations

- **C01/C02, S01:** upstream opens directly into the editor. Local opens into a
  signed-out library with Microsoft, New Blank Project and Open Local File controls.
  Local-file entry succeeds without sign-in in this tested online environment.
- **C04/C07/C08, S06/S12:** local Airer body contents default to expanded. The error
  banner is at y=2042-2108 in a 1000px viewport. Collapsing 11 body contents through
  UI moves it to y=416-482. The default screenshot hides the actionable feedback.
  Upstream shows the body list and physics controls together for this fixture.
- **C05/C13:** selecting the crowded upstream foot required three pointer-down
  attempts; local selects it on the first attempt. The harness records this, rather
  than silently substituting a direct store drag. Upstream hover/click cycling can
  choose nearby fixed markers before the intended slider joint.
- **C07:** DOF reports differ and are not treated as proof of motion. Local shows
  DOF 1 while its Airer is halted. Upstream's count is negative while it moves.
- **C05:** WorkingScreen mouse-wheel zoom logs four passive-listener preventDefault
  console errors upstream; local/experiment did not log them in that flow.

Representative screenshots in the sealed capture folder:

- `captures/airer-drag/upstream-held.png` and `local-held.png`.
- `captures/airer-foot-drag/upstream-held.png` and `local-causal-held.png`.
- `captures/layout/local-error-default.png` and `local-compact-bodies.png`.
- `captures/fixtures/*-design.png` and `*-simulate.png` for both mechanisms.

### Visual Reference Captures

Same 1440x1000 viewport and fixture. Screen origins differ slightly between UI
layouts; drag paths are matched in world coordinates. These are fresh captures,
not the unavailable historical clipboard images.

Upstream: brown-arm drag produces motion (not the full-opening acceptance pose).

![Upstream Airer while brown arm is held](../../../../.rebuild.local/evidence/g0-runs/2026-11-15T19-12-32-965Z-4X1adO/captures/airer-drag/upstream-held.png)

Archived local: the same handle is grabbed, but the mechanism stays frozen.

![Local Airer grabbed but frozen](../../../../.rebuild.local/evidence/g0-runs/2026-11-15T19-12-32-965Z-4X1adO/captures/airer-drag/local-held.png)

Local error after collapsing body contents: feedback becomes visible without any
change to the simulation error itself.

![Local error visible with compact body list](../../../../.rebuild.local/evidence/g0-runs/2026-11-15T19-12-32-965Z-4X1adO/captures/layout/local-compact-bodies.png)

## Commands And Reproduction

```powershell
# Fresh workspace setup only; refuses existing worktrees/output metadata.
node scripts/rebuild/prepare-runtimes.mjs
npm ci --prefix .rebuild.local/worktrees/upstream --legacy-peer-deps --no-audit --no-fund
npm ci --prefix .rebuild.local/worktrees/local --legacy-peer-deps --no-audit --no-fund
npm ci --prefix .rebuild.local/worktrees/candidate --legacy-peer-deps --no-audit --no-fund
npm install --prefix .rebuild.local/tooling --no-save --package-lock=false playwright@1.65.1
node scripts/rebuild/prepare-causal-experiment.mjs
powershell -NoProfile -File scripts/rebuild/start-runtimes.ps1
node scripts/rebuild/inspect-pages.mjs
node scripts/rebuild/capture-fixtures.mjs
node scripts/rebuild/drag-airer.mjs
node scripts/rebuild/drag-airer.mjs airer foot
node scripts/rebuild/drag-airer.mjs working-screen
node scripts/rebuild/check-motion.mjs
node scripts/rebuild/seal-evidence.mjs
```

`start-runtimes.ps1` starts all four configs in a fresh session after the experiment
is registered. It refuses occupied ports rather than replacing existing servers.
The test runner uses ignored `.rebuild.local/tooling/node_modules/playwright` and
the installed Chrome. Setup installs that tooling separately, outside app packages.
Scaffolding tools require the stored archive/runtime paths specified in their source.
Do not run prepare again over existing worktrees or apply the old patch to the user tree.

## Pilot And Remaining Work

Lead runtime setup manifest: 18:56:38.971 UTC; sealed capture: 19:12:32.965 UTC,
approximately 15m54s. This measured interval excludes earlier preparation/worker
dispatch and later report writing; it is not total project elapsed time.
Workers supplied two bounded reports and have been closed. Their recorded first
clock/handoff intervals were about 7m42s (fixture map) and 6m42s (usability report).
Token/credit/cost and separate integration time UNKNOWN. No comparable serial run
exists, so no cost or speed saving is claimed. Prefer one worker for the next
tightly coupled runtime task; open a second only for an independent deliverable.

Harness rework: an initial inline identity script was blocked by local CSP and
replaced with a meta tag; local screenshots initially caught splash and were
recaptured; a layout wait counted hidden braces and timed out, then was corrected
to count visible joints. These are test-infrastructure corrections, not app fixes.

Still open: full S01-S12 coverage, reference capture of the full-opening trajectory,
opening-angle/slider thresholds, longer repeated mode/file cycles, save/reopen,
production/PWA and physical iPad tests. The candidate app remains unmodified.
Next task at the time of this session: complete B03/B05 using this reliable harness,
then decide scope and G0 acceptance before building the canonical document/session
layers. Subsequent decision: [G0 accepted](acceptance.md); G1 is unlocked. The
historical observations and unqualified physics results above remain unchanged.
