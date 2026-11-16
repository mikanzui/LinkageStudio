# Changelog

## 0.16.0-rebuild.2 - 2026-11-16

### Projects And Offline Updates

- Optional guest-first Microsoft/OneDrive library, immutable IDs and conditional
  writes, bounded pagination, safe download destinations and sanitized failures.
- Account-scoped cache/pending journal, explicit autosave, offline drafts,
  rename/delete/reopen and separate-copy conflict recovery. Late callbacks cannot
  change a replacement project/account. Invalid cloud data cannot replace a
  known-good cached copy.
- Cancellable initialization/library requests and sent-write outcome warnings;
  guest work cannot be trapped by a pending cloud operation.
- Live work-account QA exposed projected metadata omitting the download address;
  full metadata requests repair remote reopen while retaining identity/revision
  and bounded-download checks. Added sanitized failure stages and regressions.
- Recovery-verified explicit worker restart, no automatic reload of dirty tabs,
  quota refusal, real offline local-file operation and old/new worker tests.
- Correct case-sensitive hosting path, validated base override, rasterized
  existing author icons and visual-viewport-aware keyboard/Split View dialogs.

### Tooling And Qualification

- Compatible pinned Vite/React/PWA toolchain, ESLint 10 and clean npm installation
  without peer bypasses. Audit reduced from 30 to four low development findings;
  production remains zero. Unpatched deepmerge risk is disclosed and its static
  build-time consumer is regression checked.
- Portable read-only browser harness, explicit hash-checked private fixtures,
  clean-checkout checks and non-deploying public CI definition.
- Retained original compatibility/physics/export tests and upstream credit.
  Bounded live OneDrive create/open/save/rename/autosave/stale-write/delete verified;
  broader live failure/account matrix, physical iPad and SolidWorks unqualified.
  Supplied Azure-skill audit and explicit CSP/error-classification gaps recorded.
  Final gate evidence is tracked separately; this version is not deployment approval.

## 0.16.0-rebuild.1 - 2026-11-16

Versioned rebuild checkpoint, based on Huggabiz's last pre-fork v0.12.3.
Stops after local files, recovery and exports. Cloud integration and final
production/PWA qualification are not included in this checkpoint.

### Compatibility And Simulation

- Source-preserving, bounded validation and atomic imports; malformed input cannot
  clear the current project. Stable identities and complete entity save/reopen.
- Restored Winged Airer brown-handle opening and WorkingScreen motion, including
  reopened files, bounded constraints and exact return to the design graph.
- Corrected zero-rest coincidence rejection, mass-weighted slider/endpoint
  behavior, topology-dependent gravity and Design DOF reporting.
- Owned sessions, explicit pause/retry/restart, atomic rejected frames and bounded
  conservative stepping for the qualified undamped distance-only regime.

### Editing And Analysis

- Mouse/touch/pen ownership, cancellation, palm handling, pinch/pan and stable DPI
  coordinates; responsive panels and coarse-pointer control targets.
- Scoped box/lasso selection, exclusions, overlap cycling, undo/redo and precise
  native property fields.
- Stable outlines/images/body frames, primitives, edge trim, constructive mirror
  and bitmap reflection while preserving original geometry.
- Linear springs, dampers and opposing-moment torsion with persistent anchors,
  parameter editing, reattachment and analytical regression cases.
- Tracers, bounded path/sensor series, model loads/support balance, explicit
  partial-reaction limits and persistent sensor/node labels.

### Files, Recovery And CAD

- Save-first/Discard/Cancel navigation; cancelled, failed or download-only saves
  never falsely mark changes saved. Late writes cannot change a newer project.
- Per-document IndexedDB recovery with atomic revisions, restore-copy/download/
  discard, quota/denied-storage handling and design-only snapshots.
- Fixed stale recovery selection, invalid timestamp crashes, modal keyboard/focus
  ownership and Safari blob-download lifetime.
- Shared CAD geometry, mm/cm/m/in units, safe unique layers, retained open paths
  and explicit unsupported-content warnings.
- DXF R12 and SolidWorks text-macro generation with independent numeric geometry
  checks; SolidWorks target-app execution remains unqualified.

### Verification And Documentation

- Master plan, progress/evidence tracker and recurring upstream/fork/rebuild
  visual-usability comparisons.
- Domain, browser, tablet/Split View and file-picker/download regressions, including
  deliberately bad inputs and both original user mechanisms.
- Patched nanoid; production dependency audit is clean. Development-dependency
  findings and the inherited PWA peer mismatch remain documented release work.

The original master workspace, source user files and earlier repair experiments
are not replaced. Physical-device and unavailable target-app results are not
inferred from emulation or string matching.
