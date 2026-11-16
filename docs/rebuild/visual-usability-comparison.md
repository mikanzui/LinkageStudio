# Visual And Usability Reference

Updated: 2026-11-16. Read before each frontend change; update after each gate.
Status: initial desktop screenshots and real import/drag/error measurements captured
in [G0 Session 01](evidence/g0/session-01.md). Full screen/device matrix remains open.
Proposed targets below are not user-approved mockups.

G1 candidate evidence: [acceptance](evidence/g1/acceptance.md). C02/C04/C11/C12
core local workflows now have real browser coverage on four mouse/touch layouts.
The upstream shell is retained, with visible bounded import diagnostics, larger
coarse-pointer file buttons and safe horizontal top-bar overflow. C10 remains
development-tested, not physical-device-qualified; 512px expanded canvas width is
only 112px and must improve at G4. Advanced feature comparisons remain pending.

G2 candidate evidence: [acceptance](evidence/g2/acceptance.md). C06/C07/C12 have
visible pause/resume/retry/restart, measured local DOF and actual stop-on-error
behavior. Ten mode cycles and both real A/B/A files restore exact original design
graphs. Coupled slider/barrier motion is still G3, not implied by rod tests.

G3 candidate evidence: [acceptance](evidence/g3/acceptance.md). The original and
resaved Airer now open coherently through the brown arm, with about 41-degree leg
angle/510-unit spread and Design DOF 1. Both fixtures have repeated real mouse/touch
movement, constraint checks and exact restore; the opened pose is recognisably
consistent with the user's reference image. This supersedes the earlier dead-drag
status for the candidate only. Expanded narrow-screen usability is still G4 work.

G4 candidate evidence: [acceptance](evidence/g4/acceptance.md), revision `715fed1`.
Compared with upstream's always-expanded starting panels and the fork's floating
navigation controls, the rebuild keeps the upstream compact shell but defaults to
collapsed rails below 1100px. Portrait has a 916px canvas; 512px Split View has a
404px canvas, versus 112px at G1. Expanded panels overlay rather than squeeze it.
The same body colors/rings, ground markers and grid are retained. Named native
body controls replace click-sensitive label rows; essential rename/cancel actions
do not require double-tap/hover. Select is distinct from drawing; box/lasso and
included-body filters live in a bounded viewport menu. Fit/reset/zoom are icons,
and HUD/toolbar no longer overlap. Buttons/body controls reach 44px on coarse input.

Reviewed views include production `g4/chromium-input-T6ntnd/split-fit.png`, body
workflow desktop/tablet captures under `g4/bodies-NJZ9Y4` and `bodies-tzffGe`, and
all four G1 layouts under `g1/browser-vsIffC` and `browser-HFN0Le` in the local
evidence directory. Repeated input workflows pass, including cancellation and
overlap picking; rapid synthetic flick-to-tap and physical-device limits are
disclosed in acceptance. G5 will compare shape/image/mirror interactions separately.

## Reference Rules

### UI-16 Reintegration Comparison

2026-11-16 follow-up, candidate `0.16.0-rebuild.3`; reference fork commit `5450513`
(`WorldContextMenu.tsx`, fork `Layout.css`). Comparison is source/history plus fresh
candidate screenshots, not a claimed pixel-identical historical browser capture.
Acceptance and exact run paths: [UI-16 evidence](evidence/ui16/acceptance.md).

| Rows | Before / Historical Upgrade | Reintegrated Contract And Intentional Difference |
| --- | --- | --- |
| C03/C04 | Upstream canvas arcs use small unlabeled body circles. Fork adds labeled angled pills, color dots, selected blue state, plus and trash | DOM radial pills restore those signals; shared command APIs retain rebuilt body/Base/undo semantics. Add/delete occur only on release, never hover; a held sweep is one undo |
| C04/C12/C13 | Fork long press/global release paths can require precise gesture timing | Right-click, Shift+F10/ContextMenu and Selection options > Object actions use the same commands. Native named buttons support arrow/Home/End/Enter/Space, Escape and focus return; dismissal consumes the outside click |
| C08/C13 | Rebuild retained browser-default blue ticks and thumbs; fork uses inset pale square/dot indicators and thin blue-gray tracks/pale round thumbs | Native checkbox/radio/range elements regain fork paint, visible keyboard focus, disabled/checked/indeterminate states and high-contrast native fallback. Numeric fields remain precise and unchanged |
| C10/C13 | Historical range visual height is only 4px; radial controls can escape screen edges or crowd with many bodies | Track stays 4px but input hit height is 24px desktop/44px coarse; checkbox glyph 14px within 44px coarse labels. Radial rows 32/44px, exact rotated bounds clamp to canvas; many bodies/small canvas use a bounded scrolling list |
| C10/C12 | Older global menu listeners mix pointer ownership and cancellation | Existing gesture owner/checkpoint remains authoritative: no new finger hold delay, pen ignores palm, Escape/resize/lost capture/project change cancels stale edits. Held-to-list release transitions to persistent tap controls |
| C07 | Longer Design DOF badge can overlap fixed-x coordinate readout | Coordinate placement measures badge width and wraps above on narrow canvases; unit regression covers long coordinate labels |
| C02/C11/C12 | Initial recovery flush can add a row and recenter the dialog during a native radio click | Recovery exposes busy state and withholds rows until the initial flush/list/read settles. Later explicit radio selection remains native; close/cancel keeps request ownership |

Reviewed candidate desktop/portrait/Split View radial, control and many-body
screenshots: labeled pills/color dots, selected blue fill, inset state indicators,
pale thumbs and readable/clamped body list. Actual localhost tab visibly displays
`.3` with the same controls. Screen-reader/physical iPad/Pencil qualification is
not inferred from native semantics, browser automation or screenshots.

Current qualification: G0-G7 accepted; G8 code/browser/DXF checkpoint verified;
G9/G10 implementation checkpoints verified; bounded live OneDrive QA also passes.
UI-16 code/browser contract accepted with 24 qualifying suite/engine results;
the G9 harness-only retry is recorded, not hidden as a continuous-run PASS.
Physical iPad/SolidWorks and named external
qualifications remain open. The earlier requested .1 stopping point was resumed.

G8 checkpoint: C02/C10/C11/C12 now have native
Save-first/Open/Clear, Recovery and CAD dialogs instead of immediate DXF export
and a discard-only confirmation. Native format/unit selects, explicit export
omissions, 44px coarse controls, stable feedback height and dialog keyboard
ownership are implemented. Recovery is visibly distinct from confirmed file save;
download-only never clears dirty state. Compared with upstream's DXF-only action,
format choice adds one deliberate step for honest scaling/content selection.
Compared with the fork, one shared scene writer avoids unit/visibility divergence.
Both engines' 54 G8 scenarios and all eighteen cumulative runs pass on g8-pkwfMc.
Actual Split View screenshots were reviewed: native dialogs are centered, readable,
within the viewport, and have reachable 44px coarse controls without text overlap.
This caught the inherited global-margin reset; native control names, focus return,
Tab wrapping and stale async draft selection were also repaired. Real LibreCAD
shows the exported open L path, closed triangle and separate layers; native rod
properties read length 48 drawing units, matching the mm-coordinate file.
See evidence/g8/acceptance.md and cad-gui-check.md for exact evidence/limitations.
The original proposed-status column below is historical groundwork, not the latest
gate tracker. Use acceptance reports plus the dated comparison records for current
evidence. Physical iPad/VoiceOver remain unverified under D15; G9 cloud and G10
production/offline coverage are not implied by local editor passes. F01 node-list
label editing was explicitly closed in G7, separately from earlier body-name tests.

Compare three versions: pinned upstream v0.12.3, archived local v0.15.5 plus dirty
patch, and the candidate rebuild. Distinguish source observations, historical
user screenshots, fresh visual observations and measured task results.

The upstream is the behavioral starting point. The local app contains useful
features and UI ideas, but its complexity is not a layout specification. Record
benefits and friction per workflow before choosing which interaction to retain.

The user supplied two Airer images: an opened mechanism on the older version and
a vertically folded/stuck mechanism on the newer version. These are evidence of
the reported motion/pose difference. Their different crop/viewport/state prevents
using them as a pixel-perfect UI comparison or proof of current runtime behavior.
The original temp paths are listed in the evidence ledger; archive or recapture them.

User confirmation, 2026-11-15: the normal opening action is pulling the upper brown
arm toward the upper-left. Use joint `g6kFted7Nm` / arm
`link_cwDY2fFAEZ_g6kFted7Nm` in S06/C06 comparisons. Separate mere handle motion
from coordinated opening of the wing and legs. The slider-foot capture is supporting
diagnostic evidence and cannot replace this user workflow. Numeric waypoints and
full-opening pose thresholds are not approved by the handle confirmation alone.

## Design Intent

- Put the usable editor and actual mechanism first. Keep room for inspection and
  manipulation rather than adding a marketing screen before local editing.
- Use a quiet technical workspace: legible canvas, restrained surrounding controls,
  predictable tool groups and clear modes. No visual redesign is approved yet.
- Keep body identity colors, shared-pivot rings, fixed-ground markers, grid/rulers,
  slider rails and barriers distinguishable. Use labels/symbols as well as color.
- Show selection, active tool, document status, simulation state and errors clearly.
- Keep navigation stable as panels resize/collapse. Secondary tools should not
  conceal common actions or reduce canvas space without a measured benefit.
- Pair desktop efficiency with finger/Pencil workflows. Essential actions cannot
  depend on hover, a keyboard shortcut or long press as their sole route.
- Use familiar icons with accessible names/tooltips, explicit active states and
  numeric controls appropriate to the parameter. Do not encode commands as decor.
- Avoid inconsistent duplicate ways of performing the same edit. A radial shortcut
  can coexist with properties only when both invoke the same command semantics.

## Comparison Ledger

Evidence for this first table is source/history unless explicitly noted. Current
usability concerns are audit risks; fresh task testing must confirm their impact.

| ID | Surface / Workflow | Upstream Reference | Current Local Difference | Proposed Rebuild Contract | Capture / Measure | State |
| --- | --- | --- | --- | --- | --- | --- |
| C01 | Entry and overall shell | Direct editor; top bar, canvas, tools and body/property panels | Projects route, splash, richer controls, resizable/collapsed panels | Immediate guest/local route; canvas remains primary; cloud library optional | Time/actions to open local file; unobscured canvas area; S01/S02 | Proposed; capture pending |
| C02 | Projects and file status | Project naming, local save/open | Cloud list/auth, save state and confirmations | Understandable local/cloud identity, dirty/saving/saved/error states; cancellation truthful | New/open/save/cancel/back; no lost edits; S01/S10/S11 | Known source risks; runtime pending |
| C03 | Tools and modes | Smaller grouped pivot/slider/collider/outline/image/tracer tools | Springs, force sensors, mirror and shape palette; more modes and menus | Stable logical groups; selected mode/tool obvious; any partial action cancelable | Locate and use each tool without hints/hover; menu depth/actions/errors; S02/S03 | Proposed; capture pending |
| C04 | Body assignment and object identity | Body tree, shared-joint rings, color and arc assignment | Node labels/menu, extra radial edit/delete and compact body controls | Selected objects versus active creation body unambiguous; assignment parity across menus | Assign joint to two bodies, fix/unfix, rename, undo; S04/S05 | Source compared; task timing pending |
| C05 | Navigation and selection | Pan/zoom and basic selection | Floating viewport controls, fit/reset, box/lasso and exclusions | Distinct pan/select/draw intent; zoom anchor stable; fit exposes relevant content | Pan/zoom/fit, overlapping pivots, additive selection; S03/S08 | Proposed; capture pending |
| C06 | Mechanism legibility and pose | Body-colored links, visible pivots, rails and barriers | Added spring/load/force overlays and new interaction paths | Same intended geometry and usable handles; layers do not obscure selection | Real Airer/WorkingScreen before/during/after drag; moving-joint/angle trace; S06 | User-reported regression; unverified fix |
| C07 | Simulation feedback | Create/Simulate and physics interaction | DOF changes, timing/error/status displays; pause semantic mismatch | Distinguish available motion, playing/paused/error; feedback reflects real behavior | Switch/drag/release/reset/error recovery; observe after banner; S06/S07/S12 | Known source defects; runtime pending |
| C08 | Properties and physics controls | Simpler body/selection/physics fields | More compact parameter rows, expanding numeric ranges, spring/force settings | Readable labels/units; precise typing and usable touch adjustment; no accidental edits | Edit values, clamp/cancel/undo, large numbers and keyboard; S04/S07 | Proposed; capture pending |
| C09 | Shapes, images and overlays | Outlines, vertices, image transforms, lock and COM | Primitives, trim, mirror and extra palette | Clear tool scope and transform handles; geometry follows body consistently | Create/edit/trim/mirror/image, membership changes, mode cycles; S08 | Proposed; capture pending |
| C10 | Tablet layout and gestures | iOS/Pencil fixes and collapsed panels | New resizing/menus/palettes and shared pointer state | Finger-only completion; Pencil ownership; reachable controls in Split View and rotation | Physical touch/Pencil/palm/cancel, keyboard open and screen edges; S09 | Physical test required |
| C11 | Persistence/export/offline | .slinker, embedded assets, DXF and PWA | Springs/cloud/sensors, format/unit manager and SolidWorks | Every supported entity survives reopen; explicit unsupported export content; no false saved state | Save/reopen/cancel, independent CAD reader, offline restart; S10/S11 | Known sensor persistence gap |
| C12 | Confirmation, focus and recovery | Basic dialogs/undo | More modal/project/error paths | Predictable Escape, focus restore, safe dirty navigation and actionable recovery | Keyboard/VoiceOver, cancel picker, failure injection, undo inside fields; S10/S12 | Audit risks; runtime pending |
| C13 | Accessibility and hit areas | Visual canvas and conventional controls | Compact icon rails/radial menus | Keyboard-accessible object/property actions, named controls and visible focus; touch hit areas | Focus order, non-color identification, VoiceOver, measured hit regions | No fresh qualification |
| C14 | Credits/build identity/update | Hugo Wilson credit and upstream app | Combined author credit, new app version/PWA | Preserve original attribution and upstream link; clear candidate build identity for QA | Credit visible/reachable; production cold/update build checks | Source confirmed; target proposed |

## Matched Screen Capture Inventory

For each row capture upstream/local/candidate where supported. For an added feature,
upstream is N/A with explanation, not a fabricated screenshot. Include expanded and
collapsed panels, visible tool state and identical fixture/selection/camera when comparing.

| Screen ID | Required State | Primary Comparison Rows |
| --- | --- | --- |
| S01 | Cold guest entry; signed-out project/library state where present | C01/C02 |
| S02 | Empty Create editor; default bodies; panels expanded and collapsed | C01/C03/C04 |
| S03 | Mechanism loaded; single/box/lasso/pan tool states | C03/C05 |
| S04 | Joint/body selected; memberships, labels and property editing | C04/C08 |
| S05 | Joint/body context menu at center and all viewport edges | C04/C10/C13 |
| S06 | Airer then WorkingScreen: design, simulate, grabbed, released, restored | C06/C07 |
| S07 | Physics parameters, spring settings and force/sensor overlays | C07/C08 |
| S08 | Outline/vertex/image/primitives/mirror/trim states | C05/C09 |
| S09 | Tablet portrait/landscape/Split View with keyboard and open menu | C01/C10/C13 |
| S10 | Save/open/export dialogs including cancel and dirty navigation | C02/C11/C12 |
| S11 | Offline/recovery/auth-expired/save-error/update states | C02/C11/C12 |
| S12 | Simulation error, resume/reset, keyboard focus and announced message | C07/C12/C13 |

## Comparison Procedure At Every Gate

1. Identify feature IDs and C/S rows before editing; record expected improvement.
2. Use the same fixture hash, build identity, viewport, pixel ratio, input type,
   selection and camera. Keep original uncropped images alongside any annotated crops.
3. Capture before/after states and run the actual task. Record success, action count,
   task time, unintended edits, recovery steps and remarks. First-use tasks can be
   user-observed; do not invent user research from automated clicks.
4. Compare result/behavior first, then readability, reachability and discoverability.
   For animation, capture event/state traces plus timed frames, not one still image.
5. Record intentional differences with rationale and evidence. Automated visual
   diffs may mask known text/caret variation only; never mask the mechanism or errors.
6. Add the evidence record below and link it from tracker/gate report. A new layout
   does not pass until relevant prior task paths still work.

## Proposed Usability Acceptance Checks

| Dimension | Acceptance Contract | How Measured |
| --- | --- | --- |
| Task completion | Every retained primary workflow completes with each supported input | Named task script; pass/fail and blocked step |
| Data safety | No unexpected edit, false save, canceled-save dirty reset or silent entity loss | Document revision/hash and reopen assertions |
| Tool discoverability | Core tools and mode/file actions available without hover or hidden gestures | First-use walkthrough; record actions/help/recovery |
| Interaction efficiency | No unexplained extra modal/menu steps for existing workflows | Compare action counts to baseline; justify any increase |
| Layout | No clipped controls, illegible labels or unintended overlap at target sizes | Matched screenshots and bounding/hit-region checks |
| Mechanism readability | Joint/body/rail/barrier/selection identity readable with overlays on/off | Fixture inspection and input targeting at standard zoom/DPI |
| Touch reachability | Proposed 44 CSS px primary touch targets; dense secondary controls have usable spacing/alternatives | Hit-region measurement and physical iPad task success |
| Feedback | Dirty/save/error/mode state agrees with actual state; pointer operations show correct target | UI assertion paired with state/event evidence |
| Keyboard/accessibility | Focus order, Escape, field undo and named object actions usable | Automated focus tests plus VoiceOver/device review |
| Performance | Responsive dragging and parameter editing on target hardware | Record median/p95 frame/interaction latency; choose budget after G0 capture |

Do not fabricate timing/performance improvements. Measure baseline before fixing
budgets, and keep the same task/input conditions when comparing results.

## Evidence Record Template

```text
Record ID / date / gate / feature / C rows / S states:
Reference builds + fixture hash:
Device, OS, browser, viewport, DPI and input:
Task and exact preconditions:
Upstream result + screenshot/trace paths:
Archived-local result + screenshot/trace paths:
Candidate result + screenshot/trace paths:
Actions/time/errors/recovery (or not measured):
Visual/readability/accessibility observations:
Chosen behavior and intentional differences:
Result: PASS / FAIL / BLOCKED / UNVERIFIED
User review needed / obtained:
Follow-up tracker task:
```

## Current Dispositions

Session-01 empirical updates (Windows Chrome 157, 1440x1000):

| Comparison | Observation | Rebuild Implication |
| --- | --- | --- |
| C01/C02, S01 | Guest local-file entry works in both; upstream starts in editor, local starts in project library | Keep local editing available without a mandatory cloud workflow |
| C04/C07/C08, S06/S12 | Local Airer error banner starts at y=2042; collapsing 11 body contents puts it at y=416 | Keep run/error feedback visible independently of body-tree expansion; avoid all-node expansion by default |
| C05/C13 | Upstream overlapping foot selection needed three clicks; local selected it first time | Preserve precise predictable selection rather than blindly copying upstream cycling |
| C06/C07 | Local registers grab but time halts after one frame; actual foot spread remains unchanged | Bind UI feedback/tests to committed motion and errors, not DOF/active-drag indicators |
| C05 | Upstream WorkingScreen wheel input logs passive-listener preventDefault errors | Include console health in gesture regression checks |

Sealed captures, measured motion/spread and source identities are linked from the
session report. Brown-arm travel and foot spread are distinct assertions. Initial
local design images caught the splash and were recaptured after it unmounted.

- Keep source-level comparisons separate from the explicitly captured states above;
  uncaptured screen/device states remain unverified.
- Preserve useful fork tools while simplifying control organization based on tasks.
- Baseline motion and data integrity take precedence over visual polish.
- A new visual style, palette or mockup needs a recorded comparison decision before
  it becomes the build target. No such style has been approved yet.

## G5 Geometry Comparison

2026-11-15, c9178b8, g5-iTGyV8. C03/C04/C06/C09/C10/C11/C12/C13;
S08/S09/S10. See evidence/g5/acceptance.md and qualification-notes.md.

Upstream retains freeform outlines, local-body geometry, images and optional center
of area. Fork adds primitives/trim/mirror; its trim deleted vertices, which could
delete a triangle rather than cut a crossed edge. Candidate keeps the inherited
canvas/body visual language and adds named tools, explicit scope/axis and property
controls. Trim now persists surviving edges as open runs, rather than implying a
new closed polygon. Mirror is constructive within the same body (D16/D17).

Measured coarse expanded toolbar targets initially failed (31px); repaired to >=44px.
Visual inspection additionally found the options box behind an expanded toolbar.
The final wrapping full-width options band remains reachable above expanded panels
in portrait and 512px Split View, verified with actual hit testing. Native radio,
checkbox and numeric fields replace hidden scope/axis gestures. Actual body properties
remain reachable without hover. No task-time improvement is claimed.

Screenshots and trusted input traces are under `.rebuild.local/evidence/g5/`:
`chromium-browser-2ARKWf` and `webkit-browser-6GqBuU`. Earlier FIGOqK/gEhZsc
include the lead-reviewed expanded, Split View, trim/undo and rotating PNG views.
The runtime bitmap test predicts red/blue pixel locations from live body rotation;
full saved graph and design restoration are checked separately.
Result: PASS for code/browser qualification; physical iPad/Pencil/VoiceOver unverified.

## G6 Spring Comparison

2026-11-16, 7a6dd39, g6-gSRHyg; C03/C06/C08/C10/C11/C12/C13.
Upstream has no springs: added-feature comparison is against the archived fork.
Candidate retains linear/damper/torsion, rest/offset and link/joint attachments,
adds explicit world-anchor compatibility and preserves identity through regeneration.
Named tool buttons, native numeric/attachment fields and a selected-object list
replace reliance on small hover targets. All measured coarse controls reach 44px;
options wrap in Split View above overlay panels. No task-time improvement is claimed.

Lead-reviewed actual tablet properties and signed motion captures:
`g6/chromium-browser-18Z8g5/tablet/116-linear-spring-properties.png`,
`192-torsion-spring-properties.png`, and paused target motion frames; corresponding
WebKit evidence is `g6/webkit-browser-h7cXj1`. Invalid -> valid edits and reattachment
clear obsolete alerts. Whole graph/download/persistence and design restore pass.
Floating angle display artefacts were recorded for G7 generic-field cleanup, not a
promise that 75.00000000000001 is a meaningful new engineering precision.

Torsion differs intentionally from the fork's same-sign force defect: it reduces
signed target-angle error with opposing moments. Coefficients are motion-model
values; spring panels do not claim N/m calibration. Existing broader force labels
and reaction correctness are G7 work. Result: PASS for G6 contract; physical limits
remain disclosed. See evidence/g6/acceptance.md and integration-notes.md.

## G7 Object And Load Comparison

2026-11-16; C04/C06/C07/C08/C09/C10/C11/C12/C13; F01/F08/F15/F16.
5b5431f, g7-MwfdcW; all sixteen cumulative suite/engine combinations pass.

Upstream has body-local tracers but no force sensors or load readouts. The archived
fork adds node labels/mirrored metadata, sensor plots and reaction overlays, but
last-pass projection accounting could report zero for a supported weight. The
candidate preserves the body's colored tracer/marker language and adds named
tracer world-coordinate/body controls and native sensor/node selection. These do
not require hover/long-press to edit. Properties precede the long body tree; a
Simulate-only native object selector allows inspection while authored body edits
remain locked. Existing force units are relabeled explicitly as model values,
with incomplete contact qualification visible rather than implying engineering N.

Physics fields now combine native numeric input with sliders; focus-only display
formatting leaves stored precision/history intact. Node labels can be cleared and
stay cleared through source-preserving save/reopen. Added coarse targets measure
>=44px in focused Chrome/WebKit tablet runs. Sensor chart backing pixels match DPR2;
actual chart ink, model readings and fixed support balance are asserted separately.
Tracer movement is checked against an independent body-local calculation and
actual body-colored pixels. Undo/redo and complete design restoration remain required.

Intermediate focused evidence: `g7/chromium-browser-cBTJEY` and
`g7/webkit-browser-B3KFm7` under `.rebuild.local/evidence/`. Reviewed tablet
`136-paused.png` exposed a force label over the pivot ring, despite the value being
correct. Labels now clear the marker and suppress colliding duplicates; arrows are
bounded in CSS pixels without changing reported magnitudes. Final tablet chart and
reaction views were reviewed in `g7/chromium-browser-Q9iR9R`; final cumulative
G7 engine evidence is `chromium-browser-HBee42` and `webkit-browser-VBcqHR`, with
minimum-width fields, static traces/forces, empty-COM arrows and blank name commits
included. See [G7 acceptance](evidence/g7/acceptance.md). No task-time improvement, physical
iPad, Pencil, VoiceOver or calibrated SI accuracy is claimed.

## G9 Library Comparison (Active)

2026-11-16; F19/F20, C01/C02/C10/C11/C12. Upstream guest-first editor remains
the starting screen. Unlike the archived fork's mandatory project-library entry,
the candidate opens a native Projects dialog only on request. Local Save/Open
remain independent; cloud sign-in failure does not prevent local editing.
Cloud/account choice uses a native select, project rows use labeled radios, and
autosave is an explicit opt-in after cloud binding. Remote and cached drafts are
distinct rows. Immutable cloud identity survives rename; delete preserves the
local graph and cached copy. Conflict choices never force-overwrite the remote
revision: preserve/open a draft or save a separately named new copy.

The mounted-app suite covers desktop, portrait tablet and 512px Split View, modal
focus/escape, 44px coarse controls, cache reload and the original handle motion
after cloud import. Current status ACTIVE; final artifacts/screenshots and results
will be linked after acceptance. No task-time improvement, live Microsoft service
or physical iPad qualification is claimed from dependency-boundary mocks.

## G10 Production And Tablet Comparison

Live-auth follow-up, C01/C02/C12 (2026-11-16): the registration screenshot uses
localhost, while the QA launch used 127.0.0.1. Reopened the candidate on localhost
without changing Azure security settings or clearing the old origin's storage.
Guest-first behavior is unchanged. Actual sign-in and disposable work-account
create/open/save/rename/autosave/conflict/delete now pass; see
evidence/g9/live-qualification.md. Live reopen exposed missing download metadata
that mocks had always provided; full metadata requests repair it. Static stage
diagnostics improve failures without exposing provider URLs or tokens. This does
not establish physical iPad or a complete live failure/account matrix.

2026-11-16; F21, C01/C02/C10/C11/C12/C13. The inherited automatic worker update
is replaced by a small update indicator and native restart dialog. Later does not
reload. Restart confirms an exact recoverable current design; another dirty tab
is not reloaded. Existing author artwork is rasterized for installation assets,
not redesigned. The actual repository path/case is `/LinkageStudio/`.

Modal bounds now track the visual viewport instead of extending below a short
keyboard viewport; header/footer remain reachable while the body scrolls. Safe
area padding and browser page zoom are retained alongside canvas-owned gestures.
The inherited editor/body color language is unchanged; no task-time improvement
or new design system is claimed. Real Chromium/WebKit production tests cover
offline file use, update refusal/recovery, two-tab preservation and short/rotated
viewports. Firefox uses a disclosed native-picker boundary limit. Final cumulative
CxnIL6 passes 22/22; both ten-minute soaks ouoswt/ssVS7p pass after the idle fast path. Physical keyboard/Home Screen qualification
cannot be inferred from resize/viewport emulation. See evidence/g10/scrub-issues.md.
