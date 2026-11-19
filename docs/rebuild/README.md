# Linkage Studio Rebuild Groundwork

Start with the [master plan](MASTER-PLAN.md) and [progress tracker](progress-tracker.md).
For every UI change, use the [visual and usability comparison](visual-usability-comparison.md).
Current17.1.0 selection/trim scope and verification are tracked in
[v17.1-plan.md](v17.1-plan.md). The dated groundwork/checkpoint text below is
historical and does not override current release status.

Audit date: 2026-11-15. Scope: source/history comparison and local baseline checks.
This is groundwork, not approval to replace the app or evidence that the current
legacy-file bugs are fixed. No application source was changed by this audit.

Checkpoint update, 2026-11-16: the historical audit below is retained. The isolated
0.16.0-rebuild.1 candidate now has G1-G7 acceptance and a verified G8 local/DXF
checkpoint with 663 domain tests and eighteen cumulative browser runs. See
[G8 results and remaining target limits](evidence/g8/acceptance.md). The user
requested stopping here and committing a new version; G9 has not started.

## Agreed Direction

- Start from Huggabiz's last release before the fork, not the first prototype.
- Reintroduce required fork features in small stages with cumulative regression gates.
- Required tablet: current-generation iPad with latest stable iPadOS. Record the
  exact model, OS build, browser and test date at release qualification.
- Test Safari and the installed Home Screen app, plus Pencil, fingers and keyboard
  workflows where hardware is available. Browser emulation cannot sign off hardware.
- Preserve the original author's credits and upstream provenance.

## Pinned Comparisons

| Reference | Commit / State | Purpose |
| --- | --- | --- |
| First prototype | `4a07f53` | Historical context: direct joint/link editing, simulation and basic UI |
| Selected upstream | `3dfe10512e105f863a582ce5cc4b3bb8a2006306`, v0.12.3 | Huggabiz master; verified through GitHub and fetched locally |
| Legacy file reference | `2319bee`, v0.11.15; `23123da`, v0.11.14 | Reference behavior for the two supplied mechanisms |
| Committed fork | `9954fca`, v0.15.5 | Current committed feature set |
| Actual local app | Committed fork plus existing dirty source/tests | Includes unsuccessful compatibility experiments; not a known-good baseline |

Upstream: https://github.com/Huggabiz/linkage-studio/tree/3dfe10512e105f863a582ce5cc4b3bb8a2006306

`git merge-base upstream HEAD` resolves to the selected upstream commit. The
committed fork diff spans 84 files, 15,536 insertions and 1,073 deletions, including
documentation, dependencies and tests. This is change volume, not a quality score.
Local dirty changes cover 12 tracked files plus two untracked test files at audit
start. Leave them intact and archive their patch before implementation starts.

## Where We Left Off

The Winged Airer still does not behave as expected according to the user's last
direct test. The other supplied file was reported working earlier; that is not a
fresh release qualification. Previous fixes changed loading, constraint generation,
hit testing, simulation caches and DOF without a reliable end-to-end reproduction.

Previous validation had material weaknesses:

- Global bounds included fixed base points, so unchanged width did not establish
  that the moving Airer stayed open.
- Some probes omitted collider-side initialization and outline COM gravity weights.
- A probe grabbed an invisible bracing link; another used store objects captured
  before updates. Neither reproduces a user's pointer drag through the app.
- Browser probes imported modules directly. Separate module/store identities were
  not excluded; reported graph sizes disagreed between browser and Node probes.
- PBD returns `converged: true` and `residual: 0`; those values alone prove no motion
  quality. Separate stability metrics exist and need independent assertions.
- A DOF clamp changed the display without restoring motion. The later rank estimate
  also requires validation at singular poses and with hidden bracing constraints.
- Rest-length checks found no mismatches in the supplied saves. That rules out one
  hypothesis, not the rest of the application lifecycle.
- The later slider-link compatibility option was not shown to change this file's
  generated link count. Its presence is not proof of the claimed root cause.

Consequently, the Airer is a blocking regression case, not a completed fix.

## Architecture Findings

There is no separately deployed custom backend. Both versions are browser apps
using React, TypeScript, Zustand and Canvas 2D. The fork adds MSAL authentication,
direct Microsoft Graph/OneDrive access and local backup logic.

Current responsibilities are tightly coupled:

- `src/App.tsx`: routing, cloud load, physics timer, collider caches, validation,
  state commits and tracing.
- `src/store/mechanism-store.ts`: document entities, derived constraints, editing,
  undo snapshots, temporary simulation joints and persistence loading.
- `src/interaction/tool-manager.ts`: most tools, gestures, selection and drag state.
- `src/utils/mode-switch.ts`: pose save/restore, outline reprojection and topology
  regeneration. The transition itself changes simulation inputs.
- `src/core/solver/newton-raphson.ts`: kinematic solver, PBD and module-global velocities.
- `src/services/autosave.ts`: module-global timers/subscriptions and cloud backup.
- `src/utils/file-io.ts`: app-version-based JSON format, sanitization and browser pickers.

Proposed boundaries for the rebuild (design direction, not implemented):

1. Versioned persistent document, explicit migrations and import diagnostics.
2. Pure constraint compiler from document to simulation inputs; explicit compatibility
   policy instead of changing physics implicitly on a UI transition.
3. Per-project simulation session owning positions, velocities, collision sides,
   pause/error state and atomic frame commits.
4. Editor commands and undo transactions separated from simulation updates.
5. One input controller with explicit pointer ownership and tool/gesture arbitration.
6. Renderer and accessible control shell reading the same public application state.
7. Storage adapters for local files, recovery and optional OneDrive with shared codec.

Keep guest/local editing independent of cloud initialization. A new server is not
yet justified; settle cloud conflict/security requirements before adding one.

## Feature Inventory

Source presence means implemented code exists, not that a workflow has passed QA.
U = inherited from selected upstream; F = fork addition; E = fork extension.

| Area | Upstream Capability | Local Additions / Changes | Evidence |
| --- | --- | --- | --- |
| Mechanism model | Bodies, shared pivot joints, fixed Base, generated links/braces | E: labels, mirrored metadata, more store behavior and legacy patches | `src/types/mechanism.ts`, `src/store/mechanism-store.ts` |
| Basic editing | Add/move/delete joints, body membership, undo/redo | E: selection deletion, node menus and radial edit/delete actions | `src/utils/delete-selection.ts`, `src/components/Panels/BodyNodesMenu.tsx` |
| Sliders | A/B/C rails, projection and limits | E: pair-skip generation and direct B dragging; legacy generation option in dirty patch | `src/core/body-links.ts`, `src/interaction/tool-manager.ts` |
| Colliders | Barrier endpoints and assigned bodies | E: interaction/validation/cache changes | `src/App.tsx`, `src/utils/mechanism-sim-validation.ts` |
| Simulation | Drag forces, gravity, damping, speed; kinematic engine code | E: spring forces, stability metrics, finite guards, error banners and timing HUD | `src/core/solver`, `src/App.tsx` |
| Springs | Absent | F: linear springs, dampers, torsional springs, joint/link anchors, prestress/parameters | `src/core/springs`, `src/components/Panels/PropertyPanel.tsx` |
| Force analysis | Basic force vectors/readouts | F: link loads, reactions, sensors and sampled sensor data | `src/core/solver/force-analysis.ts`, `src/store/simulation-store.ts` |
| Tracing | Path plotters and clear traces | E: interaction and body reassignment behavior | `src/interaction/tool-manager.ts`, `src/App.tsx` |
| Outlines | Freeform outlines, vertex editing, lock/reprojection, optional COM | E: shape palette and selection; F: rectangle, circle, N-gon and trim | `src/components/Layout.tsx`, `src/interaction/tool-manager.ts` |
| Images | Embedded image import, transform/opacity/visibility | E: selection/touch interaction changes | `src/renderer/draw-images.ts`, `src/interaction/tool-manager.ts` |
| Mirror | Absent | F: mirror previews, scope and mirrored joint metadata | `src/interaction/tool-manager.ts`, `src/store/mechanism-store.ts` |
| Selection | Single object / basic selection | F: box/lasso, additive selection and body exclusions | `src/interaction/selection-marquee.ts` |
| Navigation | Pan, zoom, grid levels, rulers and collapsible panels | F/E: viewport bar, fit/reset, sidebar resizing, compact panels and radial menus | `src/components/Canvas/CanvasViewportBar.tsx`, `src/components/Layout.tsx` |
| Local files | JSON `.slinker`, embedded images, view/physics preferences, save/open | E: spring/label metadata; current compatibility/reset patches | `src/utils/file-io.ts`, `src/components/TopBar/TopBar.tsx` |
| Export | DXF with visibility behavior | F/E: unit/format manager and SolidWorks macro export | `src/utils/export-manager.ts`, `src/utils/export-solidworks.ts` |
| Project library | Direct editor with project naming | F: projects route, cloud list/new/open/rename/delete, guest entry | `src/pages/ProjectsPage.tsx` |
| Authentication | Absent | F: Microsoft redirect sign-in, silent token/popup fallback | `src/main.tsx`, `src/auth/msal-config.ts` |
| Cloud storage | Absent | F: OneDrive folder storage, autosave, retries/status and local backup | `src/services/onedrive.ts`, `src/services/autosave.ts` |
| PWA/offline | Installable cached shell; historical standalone exporter archived, not a current release | E: renamed app, splash, deployment base path and update handling | `vite.config.ts`, `docs/archive/vite.export.config.ts`, `src/components/SplashScreen.tsx` |
| Touch/Pencil | Explicit pen path, finger pan/component drag, pinch and iOS picker fixes | E: marquee, new tools, context menus and responsive layout | `src/components/Canvas/MechanismCanvas.tsx` |
| Quality tooling | Manual solver scenarios/scripts | F: Vitest, diagnostics and physics review docs; deployment workflow | `vitest.config.ts`, `.github/workflows/deploy-pages.yml` |

Fork milestones: `28676c8` interaction/layout; `bcce7b0` linear springs;
`be667a6` dampers/torsion/tests; `243c51e` force engine/sensors/export manager;
`218b4df` projects/OneDrive/primitives/trim; `9c325a0` through `633de39`
hardening/tests; `5450513` UI revision.

Do not count the backlog's two-point applied-force tool or text/arrow annotations
as shipped features. Motor solver/driver state exists, but a complete exposed
driver-setup/playback workflow was not established by this audit. Backup-sync helper
presence likewise does not establish a recovery workflow.

## Risks To Carry Into Rebuild

| ID | Evidence / Concern | Required Resolution |
| --- | --- | --- |
| R01 | Airer loading/motion remains user-reported broken despite green unit tests | Reproduce through UI against pinned upstream with the same fixture and drag |
| R02 | `file-io.ts` omits force sensors despite store/UI support | Full entity round-trip contract for local/cloud/recovery |
| R03 | Compatibility inferred from app version; re-save stamps new version and drops legacy policy | Separate schema and simulation-model versions; idempotent migrations |
| R04 | Silent pruning of invalid references and dropped world spring anchors | Explicit diagnostics, preserved original and recoverable import result |
| R05 | `pause()` sets playback false but Simulate branch steps independently | Explicit run/error state respected by the whole session |
| R06 | Local picker cancellation returns void; caller can mark document saved | Structured save outcome and dirty-state assertions |
| R07 | Autosave startup depends on project identity indirectly; backup recovery helper lacks caller | First-save/reconnect/reload/account-switch recovery tests |
| R08 | Debounce runs on every mechanism mutation; simulation can delay saves indefinitely | Document revisions separated from transient simulation updates |
| R09 | OneDrive writes by filename, without demonstrated conflict/version protection | Identity-based save semantics, conflict policy, pagination and retry tests |
| R10 | Finger empty-space drags can pan while new tools expect drawing strokes | Tool-specific gesture table and physical device tests |
| R11 | Touch excluded from some hold timers; equivalent menu paths incomplete | Finger/Pencil/mouse parity for assignment, tracing and context operations |
| R12 | Global keyboard shortcuts affect editable fields/buttons; modals/focus incomplete | Keyboard/focus contracts and accessibility tests |
| R13 | Body changes/mode changes/temp joints can regenerate lengths and brace graph | Invariants across edits, undo, transitions and load paths |
| R14 | Mutable global velocity/cache state and per-joint store commits | Isolated sessions and atomic frame commits |
| R15 | DOF tooltip still describes negative count while dirty implementation uses rank | Validate semantics; never use display values as proof of mobility |
| R16 | Force numbers use a simplified model; CAD output is not independently qualified | Document units/mass; analytical checks and independent CAD import |
| R17 | PWA caches and deployment can deliver different builds; auth initialization gates rendering | Build identity checks, production/offline update tests and local startup isolation |

These are source-level findings and validation risks, not a complete runtime bug
list. See [validation-gates.md](validation-gates.md) for how to establish behavior.

### Additional Solver Audit Evidence

A delegated read-only audit exercised synthetic in-memory cases against the current
source/history. These are targeted reproductions, not browser/device sign-off:

- **Inherited gravity defect:** gravity is accumulated per incident distance link,
  including braces (`newton-raphson.ts:217`). At gravity 250 and damping 1 over 60
  frames, a free single link fell 125.208 world units; a generated triangle plus
  brace fell 375.625. Topology must not multiply gravitational acceleration.
- **Force reaction defect:** only the final projection pass is recorded, while
  analysis scales as though all passes were accumulated. A stationary vertical
  pendulum with six passes reported zero axial/support reaction under gravity 250;
  one pass reported axial 125. Inspect `newton-raphson.ts:442` and
  `force-analysis.ts:42` before trusting gauges or labels.
- **Slider graph defect:** restoring A-B and B-C distance links locks a midpoint
  on a fixed A-C rail; the newer skip can still leave brace-to-B constraints. In
  the audit's generated-body case, pulling B from 50 toward 80 ended at 50 using
  the legacy option and 52.663 with default generation after 120 frames. The
  compatibility test asserts generated IDs, not actual slider freedom.
- **Project snapshot leak:** an old simulation snapshot with B.x=100, followed by
  loading a project with B.x=200, restored B to 100 when returning to Create mode.
  Load/reset must clear editor saved positions as well as solver runtime state.
- **Pause defect:** an App-tick harness retried solving after an unstable result
  called `pause()`. Rejected results can already have mutated module velocities.
- **Validation gap:** current zero-length exception also admits negative/NaN rest
  lengths when endpoints coincide. Legitimate coincidence needs a precise schema
  and numerical contract rather than a broad bypass.

Motor speed is multiplied into both elapsed-time advance and driver-angle
calculation; qualify constant-speed ratios and changes before exposing that path.
The six original scenario checks passed across the historical/current revisions
despite the gravity defect. Existing tests therefore need stronger expected values.

## Next Work

Source preservation, isolated runtimes and real import/drag reproduction are now
complete; see [G0 Session 01](evidence/g0/session-01.md). The local Airer halts after
one simulation frame on zero-length validation; a single-guard dev-server experiment
restores motion, but does not qualify physical accuracy or the rebuild.
[G0 is accepted](evidence/g0/acceptance.md) for establishing the baseline and
failure detector; [G1](evidence/g1/acceptance.md), [G2](evidence/g2/acceptance.md)
and [G3](evidence/g3/acceptance.md) have passed on the isolated candidate, including
full brown-arm opening of original/reopened Airer. G4-G6 input/layout, geometry and
springs and G7 analysis/tracing/node parity are accepted; G8 files/recovery/CAD is
active. Use the progress
tracker and stage acceptance reports for current status. Codex runs verification
and accepts gates without routine user QA or approval. Complete opening/constraint
evidence is in G3; files/CAD, cloud and production remain at later gates.
Physical iPad remains unverified; D15 requires autonomous code/WebKit/touch
qualification without routine user gate unlocks. Do not port the whole current UI
or solver wholesale.
All subsequent gates rerun the previously accepted suite.
