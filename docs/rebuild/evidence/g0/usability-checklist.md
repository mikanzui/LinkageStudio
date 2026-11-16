# G0 Source-Informed Usability Checklist

Task: MA-G0-B. Owner: bounded comparison worker; lead owns runtime/browser,
shared status documents and G0 acceptance. Status: checklist authored; supplied
lead captures reviewed in the empirical addendum. Workflow completion,
accessibility and device qualification remain **UNVERIFIED** unless explicitly
limited to a captured observation there.

Started: 2026-11-15 18:55:15 UTC (first recorded clock reading).
Source review/checklist review completed: 2026-11-15 18:59:43 UTC.
Recorded interval: 4 min 28 s from first clock reading through review; lead
integration/rework time excluded and UNKNOWN. Handoff: this evidence file only.
Usage/tokens/credits/cost: UNKNOWN (not exposed). No cost/speed saving claimed.

## Scope And Provenance

- U: Huggabiz v0.12.3, `3dfe10512e105f863a582ce5cc4b3bb8a2006306`.
- L: v0.15.5, `9954fca5bdfe48154353458b8c908d7d9f7af451` plus the
  existing dirty source tree inspected read-only. A clean `9954fca` build is not
  this reference. Lead-provided capture patch identity is recorded below.
- Read AGENTS.md, master plan, progress tracker, active G0 validation gate,
  multi-agent execution rules and [comparison ledger](../../visual-usability-comparison.md).
- Only this file is written. No browser control, capture creation, imports, solver
  probes, builds or device tests were run by this worker. Supplied PNGs/JSON were
  inspected read-only after the lead's follow-up. Source observations are not
  empirical results. Fixture IDs/expected handles belong to MA-G0-A and the lead;
  this checklist does not invent them or set motion tolerances.
- G0 focus: F01/F03/F04/F07/F08/F18; C01-C08/C10-C13 as referenced below.
  S08 advanced tools, cloud qualification, exports and complete prior-audit
  coverage are outside this bounded task.

Source anchors below name repository paths/functions. U means read with
`git show 3dfe105:<path>`; L means the dirty working file. Anchors describe the
inspected source, not a promise that live accessibility trees match it.

## Entry Without Cloud

| Reference | Source-backed route | Observe/record |
| --- | --- | --- |
| U | Serve the app base URL: `src/App.tsx` returns `<Layout />` directly. No project/library or sign-in step in this entry path. | S01 direct editor, S02 initial mode/bodies, elapsed cold-load time until controls and canvas respond. |
| L normal guest | Base URL or `#/` resolves to Projects. Signed-out `src/pages/ProjectsPage.tsx` renders buttons named `New Blank Project` and `Open Local File`, separately from `Sign in with Microsoft`. Choose `Open Local File` for fixture entry, or `New Blank Project` for S02. | S01 guest page, actions/time to usable editor, any auth blocking. Do not sign in. |
| L direct editor | Append `#/editor` to that build's base URL (also accepts `#/editor?...`); `useHashRoute` in `src/App.tsx`. This reaches Layout without selecting a cloud project, but does not itself load a file or clear existing state. | Record this as a separate shortcut, not the normal-entry timing result. Open via editor `Open`. |

L `handleOpenLocal` only navigates after valid deserialization and clears OneDrive
identity. Cancel should leave Projects visible; invalid input uses native alert
`Invalid file format`. `handleNewProject` clears the mechanism/selection, resets
simulation and names it `Untitled`; use only a disposable session. Editor mounts
`SplashScreen`: source timer 1000 ms plus 320 ms fade, `aria-hidden="true"`, no
skip control. Do not count that timer as measured readiness. L still initializes
MSAL before rendering in `src/main.tsx`; guest availability during initialization
failure/offline is unverified, not proof of total auth independence.

## Source Control Map

Use text/role when specified; `title` is tooltip metadata, not an asserted ARIA
label. Scope selectors to the relevant panel/dialog and confirm uniqueness live.
There are no assumed `data-testid` hooks or DOM selectors for canvas joints.

| Action/state | U selector/name actually in source | L selector/name actually in source |
| --- | --- | --- |
| Open / Save | `.top-bar button[title="Open file"]`, text `Open`; `[title="Save file"]`, text `Save`. Both disabled outside Create. | Same. Guest Open uses picker/dirty confirmation; authenticated Open routes to Projects. |
| Project name | `.project-name[title="Click to rename project"]`; editable `.project-name-input`. | Same. Name editor commits on Enter/blur, Escape restores draft. |
| Mode | `.mode-btn`, text `Create` / `Simulate`; `.active` indicates mode, not `aria-pressed`. | Same expanded controls. |
| Collapsed mode | `.collapsed-mode-btn[title="Create mode"]` / `[title="Simulate mode"]`. | Same. |
| Mechanism surface | `.canvas-container canvas`; U has no canvas ID in inspected component. | `canvas#linkage-canvas`; geometry is pixels, not separately named DOM objects. |
| Collapse/expand shell | `.collapse-btn[title="Collapse toolbar"]`, `[title="Expand toolbar"]`, `[title="Collapse panel"]`, `[title="Expand panel"]`. | Expanded `.sidebar-edge-rail-left/right[role="separator"]`, vertical orientation and numeric ARIA values; drag narrower to collapse. Collapsed rails are buttons with `aria-label="Expand toolbar"` / `"Expand panel"`. No matching upstream-style Collapse button in L Layout. |
| Add / assign body | Button text `+ Add Body`; expanded row has native `input[type="checkbox"]` or `input[type="radio"][name="activeBody"]`, but no explicit body-name label association. Locate the row by visible body text/structure. | Same inputs within `.body-row`; `.body-row.active` reflects active creation body, not necessarily selected-joint membership. |
| Collapsed body | `.collapsed-body-dot[title="<actual body name>"]`; `.active` and check mark. | Same. `.collapsed-add-body[title="Add body"]`. |
| Body contents | Inline chevron span, only when outlines/images/tracers exist; no named button supplied. | Spans with titles `Show body contents` / `Hide body contents`; includes joint/spring Features. These are not buttons. |
| Body context | Canvas-rendered arc, `drawArcSelector` in `src/renderer/draw-overlays.ts`; no DOM body-button names. | `.world-context-orbit-pill[data-body-id="<actual id>"]`, body-name text; title `Toggle <name>`, or Base-joint action `Set Fixed` / `Set Revolute`. `.selected` is target membership, `.active` is creation-body activity. |
| Local dirty dialog | No unsaved-open dialog in inspected U TopBar. | `[role="dialog"][aria-labelledby="open-unsaved-title"]`, heading `Unsaved changes?`; buttons `Cancel`, `Save first...`, `Open anyway` (source uses Unicode ellipsis for Save first). Scope by dialog/text, not an invented label. |
| Save feedback/error | `saveFileAs` uses native picker or prompt, no guaranteed local saved badge. | `.hint-toast[role="status"]` for Save-first hints; `.panel-step-error-banner` with button text `Dismiss` for simulation error. Error banner has no explicit alert/live role. Cloud-status span only appears authenticated with file ID; it is not a guest dirty indicator. |

L viewport toolbar is `[role="toolbar"][aria-label="Viewport"]` in
`src/components/Canvas/CanvasViewportBar.tsx`. Pan button title starts
`Pan (drag on canvas)`; single-selection title starts `Click to select`;
fit title is `Zoom to fit content`. Pan must be off and Space released for the
matched L grab: `activeTool === 'pan'` or `spacePanHeld` diverts it to camera pan.
Do not introduce L-only fit/selection actions into U timing without recording them.

## Lead Run Checklist

Run each applicable task on U and archived-dirty L, initially in isolated fresh,
signed-out origins/profiles. Preserve originals; saves use new output names.
Use both Winged Airer and WorkingScreenLow with hashes from the fixture worker.
For every row record U/L outcomes independently, including upstream failures.

| ID / comparisons / screens | Exact task | Observable evidence required (all pending) |
| --- | --- | --- |
| G0-UX01 C01/C02/C03; S01/S02 | Cold launch through normal guest path above; capture entry, then empty Create editor with panels expanded. Repeat L direct-editor shortcut separately. | Full uncropped viewport, build/archive identity, visible mode/name/default bodies; readiness time and actions excluding/including file-picker time separately. Note splash, sign-in obstruction, obscured canvas area and actual named controls/focus. |
| G0-UX02 C02/C05/C06/C12; S03/S06/S10 | In Create, click real `Open` (or L guest `Open Local File`); choose exact fixture. Capture immediately after load before changing camera or mode. Repeat picker cancel/retry on disposable unchanged session. | Name, visible joint/body identity, memberships, rails/barriers/outlines, loaded camera and saved gravity/damping. Cancel retains document and route; retry works. Record import diagnostics/console. If camera differs because file settings were restored, keep first capture, then record intentional normalization for matched captures. |
| G0-UX03 C03/C06/C07/C08; S06/S07 | From loaded design pose click `Simulate`, no drag yet. Record immediate and agreed timed-idle states with physics settings unchanged. Check Save/Open disabled. | Active mode and control reachability; pose changes before grab, displayed DOF/time, gravity/speed/damping/drag settings, errors. Separate mode-transition jump from gravity-driven idle motion. Do not equate DOF text with actual mobility. |
| G0-UX04 C05/C06/C07/C13; S06 | Use MA-G0-A/user-approved moving joint/link and world grab point. Real primary-pointer down/move/up on canvas, same world path and duration in U/L. Capture held state, release and agreed timed samples. Repeat a Base/fixed grab as negative control; optionally test slider B/link/interior as separately named cases. | Pointer timestamps, viewport-relative and world coordinates, camera transform; intended handle identity and hit category, displacement/opening angle/slider travel, fixed-joint drift and constraints per fixture contract. Show actual mechanism movement, not just cursor or a grab overlay. Blank-space pan or outline grab is not a substitute for the prescribed handle. |
| G0-UX05 C06/C07/C09/C12; S06 | After release click `Create`; compare with the pre-Simulate design capture. Repeat ten mode cycles, then A/B/A real opens and the same drag. Also exercise collapsed mode buttons in a separately recorded repetition. | Joint design pose restored, membership/outline/tracer alignment unchanged, traces cleared, no residual pull/temp geometry/cache from previous file. Save/Open re-enabled. `src/utils/mode-switch.ts` intends position restore, trace clear and outline freeze; runtime still must prove it. |
| G0-UX06 C02/C11/C12; S10 | Save disposable design in Create, including `Untitled` name-prompt cancel, native save-picker cancel, fallback `Save as:` prompt cancel (only if that path exists in tested browser), successful save and UI reopen. | Distinguish no file written, file written and later reopen equivalence. Name, original bytes, memberships, pose/settings and active document remain safe. Record native dialogs separately from page screenshots; no fabricated modal selector. Confirm a canceled save does not suppress subsequent dirty protection. |
| G0-UX07 C02/C11/C12/C13; S10/S11 | L: make a known edit, Open -> `Unsaved changes?`. Test Cancel, Escape and backdrop separately; reopen -> Save first -> cancel native picker; dismiss confirmation then Open again. Repeat with successful save, then explicitly `Open anyway` and picker cancel/retry. U: run same edit/Open cancellation sequence, recording absent dirty confirmation as a baseline difference. | Document unchanged after cancellations, no false `Project saved` hint or erased dirty protection, dialog busy/retry state and focus restoration. Save first is intentionally not automatic Open: source leaves modal open and tells user to use Open. Record extra actions. L Back-to-projects button (`title="Back to projects"`) sets hash directly; test dirty navigation only on disposable state, do not assume it shares Open protection. |
| G0-UX08 C01/C03/C04/C10/C13; S02/S04/S06 | Collapse/expand each side using version-specific shell controls. L: drag rails narrow, release; tap/drag-expand; resize and double-click reset separately. Repeat selected-joint assignment and mode return while collapsed. | Canvas CSS area before/after, target boxes, clipped controls/topbar overflow, tool/mode visibility, unchanged intended selection/geometry. L rail snap is 16 px; collapse thresholds are left <96 px/right <168 px raw width (source only). Record actual behavior, lost-pointer recovery and keyboard activation; collapsed L rail handlers use pointer events, so button semantics alone do not prove keyboard operation. |
| G0-UX09 C03/C04/C08/C12/C13; S04 | In disposable Create/Pivot (`Pivot` text, collapsed title `Pivot joint`), add bodies if needed. Select one known joint by actual canvas click; toggle its checkbox into two bodies; toggle Base to fix/unfix; Undo/Redo each membership edit. Clear selection and toggle same rows as active creation bodies. | Checkboxes versus row activity, two body rings/identity, Base fixed marker, no unintended extra joint/body. Record selected joint ID and each body's jointIds before/after via lead diagnostics paired with actual events. Do not treat active-body color as proof of membership. Rename non-Base body by double-click name then Enter; verify identity survives, and record whether name-clicking accidentally changed membership. |
| G0-UX10 C04/C10/C13; S04/S05 | Repeat same joint assignment through U hold arc and L context menu; center then all four edges. U mouse hold threshold 300 ms, L 340 ms (source). L can right-click joint to open DOM orbit; use existing row checkboxes as independent alternative. Repeat collider target-body assignment using selected barrier, not endpoint joint; undo. | Actual reachable labels/hit regions, same memberships and fixed state across expanded/collapsed/context paths, no double-toggle on hold release, no clipping or accidental target deletion. L body pill Base title must flip Set Fixed/Set Revolute; collider bodyIds are targets, not pivot membership. U arc has no separate accessible DOM controls; report this limitation rather than invent selectors. |

## Short Differences To Watch

1. **Entry/remount:** U is direct editor; L adds Projects and editor splash. L
   project-entry import and editor-Open are different paths (`applyLoadedState`
   versus `performOpen`); exercise both, including A/B/A loads. Dirty App resets
   velocities/collider caches on project-entry load; dirty TopBar adds sim reset.
2. **Drag is not one case:** U takes the first connected link for a joint; dirty L
   searches for a valid link, adds direct slider-B/joint fallback and filters link
   hits. Outline-interior grabbing is also conditional in L. Do not accept source
   fixes as working motion; preserve handle, pan state, overlays and settings.
3. **Pose/legacy links:** U regenerates links normally on mode change; dirty L
   passes `includeSliderMidpointLinks: mech.legacySavedLinks`. Compare visible
   pose/rails and useful motion before deciding which behavior to retain.
4. **Cancel/save:** Both `saveFileAs` helpers return void on native AbortError or
   fallback prompt cancellation. L `handleSave` then records the fingerprint and
   returns true; Save-first can therefore show a saved hint without a written
   file. This is a source-derived risk, not an observed run result. Camera/view
   and simulation settings are also serialized in L dirty checks, so pan/zoom
   may trigger a confirmation without an entity edit; measure separately.
5. **Panels/body context:** U has explicit collapse buttons and a drawn hold arc;
   L adds resize rails, inline Features and DOM orbit controls. Extra compact
   controls can obscure active-creation versus selected-member states. Expanded
   body inputs have no explicit body-name accessible labels in either inspected
   implementation; measure actual names, tab stops and targets, not appearance.
   L expanded BodyPanel treats Image as single-active-body mode, while collapsed
   Layout's `isOutlineMode` omits Image; include an Image-selected comparison if
   that state affects the fixture assignment run rather than assuming parity.
6. **Simulation feedback:** L can call pause/show a paused-error message, but its
   Simulate tick branch is entered by mode, before the Create-driver isPlaying
   guard. Record time/pose after an error and after Dismiss; clearing text alone
   is not evidence of pause or recovery. No artificial error run is claimed here.

## Empirical Record Per Task/Reference

Fill for each fixture/input/repetition. Use NOT MEASURED, UNVERIFIED, BLOCKED
with exact step/reason, or N/A with reason; never turn a blank field into PASS.

```text
Record/task ID / C IDs / S states:
Run UTC start/finish / operator / repetition number / first-use or rehearsed:
Reference U or L / full commit / dirty archive+patch identity / build ID:
Origin/base URL+hash / profile/cache state / auth state:
Fixture filename+SHA256 / original bytes preserved / disposable output name:
OS/browser version / device / viewport CSS px / DPR / zoom / input:
Preconditions: mode, tool, pan/Space state, selection, panels/widths, camera:
Physics settings and time at start / expected handle+world point+contract:
Action/event sequence and timestamps / pointer screen+world path / duration:
Outcome PASS/FAIL/BLOCKED/UNVERIFIED / first blocked or failed step:
Action count (explicit counting rule; gestures vs event samples) / menu depth:
Elapsed ms: entry-to-editor, import-to-ready, task total, picker wait separately:
Unintended edits / errors / retries / recovery steps / help or hover required:
Canvas CSS area and viewport fraction / control boxes / clipping/overlap:
Focus before/after / actual accessible names/states / keyboard completion:
Pose+membership before/after / intended moving displacement+angle+travel:
Fixed drift / constraint metrics / released-idle observations / restore delta:
Save result: name prompt canceled / picker canceled / written+reopened / error:
Original uncropped screen paths / timed frame+pointer+state traces / console:
Difference disposition (retain/simplify/defer/undecided) / user review:
Lead acceptance / follow-up B03/B04/B05/B06 task / missing device evidence:
```

Physical iPad Safari/Pencil/Home Screen (S09, C10/C13), VoiceOver and cross-engine
results remain UNVERIFIED. Desktop captures or source inspection cannot qualify
them. Lead integration/review/rework timing and acceptance remain to be recorded;
this handoff does not close B03, B04, B08 or G0.

## Empirical Addendum: Lead Captures

Read-only review: 2026-11-15 19:00:08-19:00:57 UTC; added after the initial
source-checklist review. Evidence root:
`.rebuild.local/evidence/g0/`. Entry artifacts were written about 18:58:11-12 UTC;
fixture artifacts about 18:59:17-26 UTC (filesystem UTC modification times, not
asserted event timestamps). Fixture JSON reports browser version `157.0.8103.51`,
U commit as above, L commit as above and L patch SHA256
`184322a978b5017eb90a4b6fcf96ef94d510110fbf7c31162f9cdaa97fcbc95f`.
CSS viewport/DPR, complete fixture hashes, task timing/action counts and exact
capture/event alignment still require the lead run record. Candidate entry was
not reviewed here; this addendum compares U/L only.

| Observation / C/S IDs | Direct evidence and bounded finding | Follow-up |
| --- | --- | --- |
| E01 Entry C01/C02; S01/S02 | [U entry PNG](../../../../.rebuild.local/evidence/g0/entry/upstream.png) shows usable empty Create editor with Base/Body 1-3, tools and physics visible. [L entry PNG](../../../../.rebuild.local/evidence/g0/entry/local.png) shows sign-in panel plus `New Blank Project` and `Open Local File`, no editor canvas. Entry JSON confirms these guest buttons enabled; neither entry JSON reports captured errors. | Guest controls are visibly present, not a measured successful guest workflow or cold-load benchmark. |
| E02 Local design capture obscured C01/C06/C07; S06 | [L Airer design](../../../../.rebuild.local/evidence/g0/fixtures/local-airer-design.png) and [L WorkingScreen design](../../../../.rebuild.local/evidence/g0/fixtures/local-working-screen-design.png) show the Slinker V0.15.5 splash, not the loaded design. Design JSON reports Create mode, but does not make those PNGs visible pose evidence. | Recapture after splash unmount/visible mechanism readiness, before Simulate; retain originals. These two matched design-screen cells remain UNVERIFIED. |
| E03 Airer feedback hidden C01/C04/C07/C08/C12; S04/S06/S07/S12 | [U Airer simulate](../../../../.rebuild.local/evidence/g0/fixtures/upstream-airer-simulate.png) displays Base and all ten body names, Simulation/time and physics controls. [L Airer simulate](../../../../.rebuild.local/evidence/g0/fixtures/local-airer-simulate.png) has expanded Features lists: Base and Bodies 1-3 fill almost the entire right viewport; Body 4 starts at the bottom. Physics/time/error banner are not visible. [L state JSON](../../../../.rebuild.local/evidence/g0/fixtures/local-airer.json), `simulate.simulation.stepError`, records `Link "link_3DdNCLFmHi_tuJsmXorU2" has zero or negative rest length.` Time is 0.016666666666666666, DOF 1, isPlaying false and simDrag null. | Captured diagnostic error is real supplied-state evidence, corroborating the lead's report; it is NOT visually displayed in this PNG. Scroll/collapse body contents to capture banner and recovery, recording actions. Test immediate discoverability without scrolling; keep summary/error visible in any proposed redesign. Do not infer a successful pause solely from isPlaying false. |
| E04 WorkingScreen panel density C01/C04/C08; S04/S06/S07 | [U WorkingScreen design](../../../../.rebuild.local/evidence/g0/fixtures/upstream-working-screen-design.png) shows all body names/overlays and physics rows, though lower View controls extend beyond bottom. [U simulate](../../../../.rebuild.local/evidence/g0/fixtures/upstream-working-screen-simulate.png) also fits body names and simulation summary, but not every lower physics/view control. [L simulate](../../../../.rebuild.local/evidence/g0/fixtures/local-working-screen-simulate.png) reaches only the beginning of Screen after Base/Door/Rear Trans/Door Pull Link Features lists; physics/summary are offscreen. | The observed compactness benefit is real, but do not overstate upstream as fitting every control for every fixture. Measure scroll/actions to target bodies, error and physics with default versus collapsed contents. |
| E05 DOF and no-grab state C06/C07; S06/S07 | Airer simulation screenshot badges are U -21 versus L 1; WorkingScreen badges U -80 versus L 1. WorkingScreen JSON simulation time is about 1.0833 s U / 1.0333 s L; L stepError is null. All four fixture JSON simulation editor snapshots have simDrag null. | Positive DOF/no captured console errors are not motion proof. Lead's real drag, release and restore traces are pending. U Airer design JSON DOF 0 versus design PNG -21 also shows snapshots are not perfectly atomic; do not derive frame-precise transitions from them. |
| E06 Framing/legibility C05/C06; S06 | Airer is folded near the right canvas edge in both simulation PNGs; the L rightmost geometry is partly clipped by the panel boundary. WorkingScreen outlines and embedded image are visible in both simulation captures, with different shell offsets. Fixture JSON reports equal U/L camera pan/zoom per fixture, but canvas origins/available area differ. | Keep original-import framing evidence, then establish a deliberate matched-world grab with measured canvas bounds. These stills do not reproduce the user-approved opened Airer pose or establish why it is folded. |

Addendum outcome: entry and panel-density differences are **OBSERVED IN SUPPLIED
CAPTURES**; Airer step error is **OBSERVED IN SUPPLIED STATE JSON**, with visible
error/recovery unverified. Save/cancel, assignment edits, shell collapse,
drag/release/restoration and all physical-device tasks remain UNVERIFIED here.
No task time, action count, frame latency, usability improvement or gate PASS has
been inferred from these stills. Suggested retain/simplify decisions require lead
and user review, not worker acceptance.

Addendum/handoff content review completed: 2026-11-15 19:01:57 UTC. Recorded
start-to-review interval including follow-up: 6 min 42 s; integration/rework
excluded. Usage remains UNKNOWN. Text-only whitespace check reported no
whitespace errors (Git warned about future LF-to-CRLF normalization); no runtime
tests were executed by this worker.
