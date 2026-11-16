# Rebuild Verification Gates

Status: G0 baseline accepted; feature gates qualify the rebuild incrementally.
Starting code: pinned Huggabiz v0.12.3; see [README.md](README.md).

Execution order and scope are in [MASTER-PLAN.md](MASTER-PLAN.md); update
[progress-tracker.md](progress-tracker.md) and relevant
[visual/usability comparison rows](visual-usability-comparison.md) at each gate.
Use the [gate report template](templates/gate-report.md) for acceptance attempts.
Use [multi-agent-execution.md](multi-agent-execution.md) for work division. Parallel
implementation never replaces sequential gate acceptance or integrated-candidate checks.

## Evidence Rules

Codex owns test execution, analysis and gate decisions. The user's confirmed task
intent is a requirement, not a request for them to perform QA. No gate waits for a
routine user approval click. Product choices that cannot be inferred can be asked
separately while independent work continues.

Apply criteria at the gate where the feature is delivered. G0 accepts preservation,
source/visual baseline comparison, real import/drag reproduction, a failure-detecting
harness and a feature/test plan. Known defects in the old app are baseline findings,
not reasons to block construction of G1. Full-opening trajectory/rigidity and long
simulation checks belong to G2/G3; advanced tool screens belong to G4-G9. Required
physical iPad qualification cannot be claimed from emulation. Under the later D15
instruction, unavailable hardware is disclosed, not an automatic development or
release stop; code/browser compatibility must still pass at each relevant gate.

Latest execution direction (D15): the user requests code-based iPad functional
verification and continuous autonomous progression. G4 can accept its code/browser
input contract while physical iPad/Pencil/VoiceOver remains explicitly unverified;
do not stop independent implementation or ask for a routine user unlock. Production
reports must distinguish automated compatibility from actual-device qualification.

Every gate requires:

- Pinned code/build ID, fixture hashes, dependency lock, browser/OS/device and test date.
- Feature-specific assertions plus every previously accepted gate's regression suite.
- Actual UI interaction for user workflows; direct store injection is permitted for
  fixture setup/diagnostics, but cannot establish that import buttons or gestures work.
- Expected outcome established independently: analytical case, user-approved trace,
  pinned upstream capture or independent exported-file reader.
- A test that detects the known bad behavior. Reapply a small targeted fault in an
  isolated run when appropriate to prove the test is capable of failing.
- Console errors, screenshots before/after, pointer trace and relevant numerical data.
- Visual/usability comparison records linked to feature IDs and screen states;
  intentional changes documented against upstream and archived local reference.
- Explicit pass/fail/blocked/unverified status. Missing hardware remains unverified.
- Integrated candidate revision and lead-reviewed worker evidence, where delegated;
  passing checks in separate worker branches do not establish a passing combined app.
- No failed gate is waived just because TypeScript, unit tests or a build pass.

Upstream matching is useful behavioral evidence, not proof of physical correctness.
If upstream itself fails an invariant, document the discrepancy and decide intended
behavior before encoding it as the new contract.

## Gate Sequence

| Gate | Deliverable | Acceptance And Regression Evidence |
| --- | --- | --- |
| G0: Reproducible baselines | Archived upstream/local/dirty references, fixtures and UI reproduction | Both files imported/dragged through real controls; confirmed brown-arm intent; upstream/local failure difference and negative controls recorded; baseline visual/source comparison and feature plan exist. No claim of repaired physics or device qualification |
| G1: Core document and basic editing | Bodies, joints/Base, IDs, commands/undo and schema migrations | Create/edit/delete/reassign/undo/redo; round-trip all core entities; fixed joints remain fixed; malformed input gives actionable diagnostics and leaves current project intact |
| G2: Simulation lifecycle and legacy parity | Constraint compiler and per-project session; ordinary rigid links | Pendulum, chain, four-bar, collinear braces; valid ordinary-link drag and pose reset; both real files import/compile without data loss; load A/B/A with no stale velocities/cache; slider/barrier motion qualifies at G3 |
| G3: Sliders and barriers | Slider limits, moving/fixed rails and collider side initialization | Free B on fixed AC, fixed B on moving AC, endpoint limits, rotated rails; Airer and WorkingScreen; no cross-barrier tunneling or endpoint wrap; all G2 cases remain valid |
| G4: Input and tablet foundation | Unified gestures, camera, selection, panels and focus | Mouse/touch/Pencil code paths, pointer cancel, two-finger interruption, pan/pinch/zoom anchors, overlap picking; automated WebKit/touch/viewport qualification per D15; physical-device limits disclosed |
| G5: Geometry and presentation | Outlines/COM, vertex edits, images, primitives, trim, mirror | World/local transforms preserved across membership/mode changes; bounded selection and trim scope; mirror identity; image transform and fixture motion; pixel/geometry checks at multiple DPI |
| G6: Springs and dampers | Linear, link anchors, damping, torsion, editable parameters | Analytical direction/equilibrium, rest/prestress, zero separation, rotation invariance, speed/stiffness stress, constraint error bounds; persistent anchors survive editing and regen |
| G7: Tracing and force analysis | Tracers, link loads, sensors and overlays | Tracer follows same body-local point; known force cases with documented model units; sensors survive save/reopen/undo; finite and bounded time-series; no claim of SI accuracy without calibration |
| G8: Files and CAD exports | Mature local/recovery codec and supported exports | Every entity round-trips; cancel does not clear dirty state; iOS picker cancel/retry; DXF read with independent parser and CAD; SolidWorks macro run in target app; units/visibility verified |
| G9: Cloud project workflow | Optional MSAL/OneDrive library and autosave | Guest work unaffected by auth failure; first-save autosave, rename/reopen, account switch, expiry, offline reload/reconnect, conflicts, pagination, failed upload and quota behavior; mock tests plus real-account qualification |
| G10: PWA and release | Production subpath/offline/update and browser/device qualification matrix | Cold/warm/offline load, update with dirty project, background/resume, 10-30 minute soak, full cumulative regression; real iPad Safari/Home Screen qualification only when hardware available, otherwise disclose per D15 |

G4 input/device smoke checks start at G1 and repeat at every stage. G8 codec
assertions also start at G1; the late gate is for complete formats and target-app
qualification. Features can move between stages by dependency, but evidence cannot
be deferred until after shipping that feature.

## Airer / WorkingScreen End-To-End Contract

### UI-16 G4 Regression Contract

Scoped follow-up in `0.16.0-rebuild.3`; see `evidence/ui16/acceptance.md` and the
UI-16 comparison ledger. Required assertions before accepting reintegration:

- Actual mouse hold/sweep/release changes membership once, with complete undo/redo.
- Add/delete only mutate on release; cancellation and late release cannot restore
  an abandoned edit. Pen/palm, Escape, resize and existing ownership tests remain.
- Context and non-hold tap/keyboard routes invoke the same commands. Check focus
  entry/return, Escape, arrows/Enter, outside-click dismissal and all four edges.
- Many-body/long-name list stays bounded/reachable. Coarse hit surfaces are at
  least 44px while native indicators retain the intended appearance.
- Native Space/arrow control changes reach simulation settings and downloaded
  documents; checked/focus/high-contrast states remain distinguishable.
- Recovery's initial flush/list/read exposes busy state and withholds rows until
  ready, so list insertion cannot move the native radio during a click. Corrupt
  drafts stay downloadable; restore refusal and discard remain scoped/atomic.
- Source-pinned Chrome/WebKit cumulative G1-G10, including both original and
  reopened private mechanisms, pass after integration. Focused Firefox is separate
  with any file-picker automation boundary explicitly qualified.
- Record physical iPad/VoiceOver/Pencil as unverified where unavailable, not passed.

1. Verify exact fixture hash; preserve source bytes. Open via local file UI in the
   upstream and candidate builds, using separate origins/profiles.
2. Capture visible joint IDs/positions, memberships, slider definitions, collider
   targets, saved gravity/damping and screen-to-world transform before simulation.
3. Switch using the actual mode control. Record compiled topology and rest lengths
   for diagnostics; compare visible pose, not hidden brace IDs alone.
4. For Airer, use the user-confirmed upper brown arm pulled toward the upper-left:
   joint `g6kFted7Nm`, arm `link_cwDY2fFAEZ_g6kFted7Nm`. Record the world grab
   point and pointer path so camera/window dimensions do not change intent. Test
   coordinated wing/leg opening through this handle; moving the sliding foot alone
   cannot pass the primary workflow. User confirmation identifies the handle and
   direction, not a particular numeric waypoint, duration or acceptable final pose.
5. Drag with real pointer down/move/up over a fixed duration in both builds. Measure
   moving-joint displacement, relevant opening angles and slider travel from that
   fixture's initial state. Exclude Base, hidden braces and unrelated offscreen joints.
6. Check finite coordinates, fixed-joint drift, link-length error and barrier sides
   throughout. A tiny displacement on an unrelated joint does not count as opening.
7. Release; observe deterministic frame samples and timed idle samples with the
   saved physics settings. Preserve intended opening/closing behavior from reference;
   do not assume gravity should leave the pose unchanged.
8. Switch back; verify design pose and outline/tracer placement restore. Repeat ten
   mode cycles; load the other file and return; verify no inherited drag/cache/driver.
9. Save, close, reopen through UI and repeat motion. Test guest and cloud paths once
   cloud is introduced. Migration must not lose the old simulation semantics.
10. Repeat via touch/Pencil on the target iPad and in the production PWA build.

Numeric tolerances for these real mechanisms are pending reference capture. Choose
them from repeated upstream traces and required design precision; document each
fixture's stable ID/angle/travel assertions before using it as a gate. Do not invent
a convenient threshold after observing the candidate output.

## Basic Numerical Contracts

Small synthetic cases can use explicit initial tolerances: fixed-joint drift less
than `1e-8` world units; ordinary rigid-link relative length error less than `1e-3`
over the test; finite coordinates and no dangling references at all times. These are
proposed starting contracts to calibrate against solver precision, not current
measurements or universal engineering-accuracy guarantees.

Additional proposed physics qualification targets (calibrate and approve before
turning them into release promises):

| Case | Independent Expected Result |
| --- | --- |
| Free fall with 2/3/5 joints, redundant links and braces | COM displacement follows `0.5*g*t*t` within 1% at one second; topology does not change acceleration |
| Small-angle pendulum | Period within 2% of `2*pi*sqrt(L/g)`; compare at 30/60/120 Hz |
| Undamped pendulum | Energy drift at most 2% over 30 cycles, with documented discretization |
| Static hanging support | Support balances load within 1%, nonzero fixed reaction, invariant over 1/3/6/12 projection passes |
| Fixed-rail slider | Measurable commanded travel as well as perpendicular error below `1e-3 * rail length`; test generated bodies with braces |
| Rejected simulation step | No geometry/time commit or hidden-state contamination; next solver call occurs only after explicit recovery/resume |

These targets expose inherited defects too. If supporting engineering-quality
forces is beyond the chosen physical model, decide the model or product scope
explicitly rather than weakening the assertions until current results pass.

Include static and moving slider rails, coincidence/near-collinearity, loop closure,
simultaneous constraints, zero damping, large speed and stiff spring cases. Separate
kinematic convergence from dynamic stability and energy behavior. A solver returning
success is never the only assertion.

## Platform Qualification

| Environment | Required Coverage | Qualification Limit |
| --- | --- | --- |
| Windows Chromium (Chrome/Edge) | Mouse, keyboard, trackpad, zoom/DPI, file and export flows | Full automated workflow suite plus manual review |
| Firefox desktop | Canvas, events, files and core editor workflows | Cross-engine suite |
| Safari / WebKit | Core editor, download/import, focus and rendering | WebKit automation is useful but not device proof |
| Current iPad, latest stable iPadOS Safari | Finger, Pencil, pinch/pan, Files picker, orientation, Split View, keyboard, cancel/resume | Physical device required; record model, OS build and Pencil type |
| Same iPad, installed Home Screen app | Offline/cold launch, Files, resume, update, safe areas | Physical device required |

Touch scenarios: empty-space primitive creation versus pan, tracer dragging, hold
menus/body assignment, overlapping joints, rail endpoints, pointer capture loss,
finger landing while Pencil is active, palm contact, app backgrounding during drag,
and all panel actions without hover. Screen sizes include portrait/landscape and
Split View; all dialogs and radial menus stay reachable with the keyboard visible.

Accessibility scenarios: keyboard focus and button activation, editable-field
shortcuts, modal Escape/focus restoration, non-color-only body identification,
accessible names/selected states and a usable object/property interface alongside
the canvas. Confirm with VoiceOver on the iPad.

## Build And Release Gates

CI should run locked install, lint, TypeScript, unit/domain tests, browser workflow
tests and a production-build smoke test before deployment. Current `build:pages`
only runs Vite; it is not equivalent to `npm run build` or a typecheck.

Use isolated origins/profile storage for upstream, candidate and production tests.
Expose build identity and a test-only read-only diagnostic interface to the actual
mounted app. Avoid ad-hoc dynamic imports that can instantiate a second store.
Capture runtime state after real UI events and commit decisions, not only raw solver
output. Keep cloud tests in disposable test projects with original user files intact.

Every stage needs one implementation change set, one evidence bundle and a concise
gate report. A failed prior scenario blocks promotion. Do not batch unrelated tool,
solver, persistence and UI rewrites into a single feature stage.

## UI16-05 Native Motion Gate

This follow-up reopens only the historical hold-menu presentation claim; preserve
earlier functional results but do not treat them as motion evidence. Lead owns
acceptance, no routine user gate unlock. Required before accepting .4:

1. Read the historical fork source and mount that unchanged reference independently.
   Native hold must produce its compact fan. Capture computed geometry/paint and
   real RAF transforms/keyframes at native speed, plus a video; do not disable or
   fast-forward animation for these assertions.
2. The new desktop fan matches 220ms translation/scale .7-to-1, easing
   cubic-bezier(.4,0,.2,1), 38ms body stagger, principal-angle readable labels,
   inward dots, historical native font/paint, 20px pills, ring/spokes and no extra
   center X. Normal compact radius/angle geometry must match. Width tolerance
   .25 CSS px covers native button/canvas text-metric kerning only.
3. Prove the old .3 fade fails (120 versus220ms and missing guides). Prove the
   intermediate wrong-angle implementation fails label rotation. A comparator
   that passes both incorrect controls is not valid evidence.
4. Open both original raw fixture bytes through the actual chooser. Assert11/12
   body fans in the desktop candidate, immutable original hashes and complete
   mechanism equality before/after stationary hold/release. Compare historical
   paint and motion while separately disclosing adaptive radius/edge clamping.
5. Native held sweep/release must assign exactly once per entry, rearm after
   leaving, allow revisiting single assignments, and preserve one-action undo.
   Add/delete execute only on deliberate moved release; stationary clamped
   controls must not mutate. Escape/resize/blur/cancel must not allow late edits.
6. Closing is a frozen inert/disabled/aria-hidden presentation, removed after230ms;
   commands and gesture ownership end immediately. Verify actual multiple reverse
   transforms, not just CSS text. Disclose this intended reverse versus the old
   browser's completed-animation opacity snap. Reduced motion skips both motions.
7. Verify keyboard/context/tap alternatives, 44px coarse targets, desktop/tablet/
   512px Split View, large bounded scrolling list, 12-body fan, native checkbox/
   range keyboard persistence, forced-colors and trusted pen/palm checks where
   supported. WebKit/touch is not physical iPad certification.
8. Full domain/tooling/type/lint/build and cumulative G1-G10 Chrome/WebKit suites
   must pass on one frozen application source. Retain failures and deliberately
   cancelled preliminary runs. Link [comparison](visual-usability-comparison.md#ui16-05-historical-fan-correction)
   and [acceptance](evidence/ui16-motion/acceptance.md), with explicit limits.

Tools: `inspect-radial-reference.mjs ENGINE KIND URL [FILE] [HANDLE_ID]`,
`compare-radial-captures.mjs REFERENCE_REPORT CANDIDATE_REPORT` (adaptive option
skips only absolute orbit position for documented clamping/radius adaptations),
and the enhanced `verify-ui16-browser.mjs` integrated in `verify-cumulative.mjs`.
