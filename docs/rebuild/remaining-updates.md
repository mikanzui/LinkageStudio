# Remaining Updates

2026-11-16. User resumed development beyond the 0.16.0-rebuild.1 checkpoint.
Preserve tag/commit 1b6f723 and the original dirty master workspace. Work continues
on codex/rebuild-cloud-pwa in the existing isolated candidate. Codex owns tests and
gate decisions; no routine user sign-off. No deployment is authorized.

## G9: Optional Cloud Projects

| ID | Deliverable | Acceptance | Status |
| --- | --- | --- | --- |
| G9-01 | Explicit account/auth port, document ownership and Graph/cache contracts | Guest editor never waits for auth; account/project changes invalidate stale callbacks; no credential logging or background popup | DONE for code/browser; live registration OPEN |
| G9-02 | Identity/ETag-based OneDrive transport and bounded pagination | First-save conflict refusal, conditional update/rename/delete, read-only listing, safe token/download destinations, explicit quota/auth/missing/ambiguous outcomes | IMPLEMENTED; 151 transport tests; live service OPEN |
| G9-03 | Account-scoped local cache and pending journal | Atomic revisions, metadata-only listing, offline reopen/reconnect, quota/corruption refusal, pending content never silently replaced | IMPLEMENTED; 49 storage tests; mounted checks ACTIVE |
| G9-04 | Native project library, save, autosave and conflict controls | Real UI create/open/rename/delete, local escape paths, save-first/cancel, keyboard/modal ownership and 44px coarse targets | DONE for browser contract; 18 scenarios per engine, native physical limits OPEN |
| G9-05 | Integrated domain/browser regression | Account switch/expiry/offline/conflict/late completion/failed upload and all G1-G8 checks on one pinned artifact | DONE for code/browser checkpoint; 898 tests/0 skips, 20 cumulative passes; live Microsoft OPEN |

An explicitly authorized disposable real-account run is separately recorded.
Authentication must be performed by the user; absence of a configured registration
or account does not permit claiming mock tests prove Microsoft service behavior.
No existing user cloud file will be modified for testing.

## G10: Production, Offline And Release Readiness

| ID | Deliverable | Acceptance | Status |
| --- | --- | --- | --- |
| G10-01 | Compatible pinned toolchain and clean installation | No legacy peer override needed, production audit clean, development findings repaired/qualified, clean-checkout type/lint/build/tests | TODO |
| G10-02 | Deployment subpath and PWA assets | Real repository path/case, nonblank cold/warm/offline navigation, correct asset scopes and usable installation icons | TODO |
| G10-03 | Safe service-worker updates and background/resume | No automatic dirty-page replacement; recoverable update choice, old/new version transition and offline restart verified | TODO |
| G10-04 | Portable browser tooling and CI | Explicit private fixture configuration, no uploaded mechanisms/coordinate inventories, reproducible read-only observer build and published test commands | TODO |
| G10-05 | Final whole-app scrub and soak | All implemented UI workflows plus domain tests, full cumulative engines, tablet/Split View/cancel/rotation-code checks, 10-30 minute motion and ownership soak | TODO |
| G10-06 | Documentation/version/rollback decision | Accurate comparisons/evidence/issues, preserved author credit and checkpoint, explicit external/device limits; no deployment or full-release claim without required evidence | TODO |

## External Qualifications

- Physical current iPad/Safari/Home Screen/Pencil/VoiceOver remain unverified until
  real hardware is available. Code/WebKit/touch regressions continue under D15.
- SolidWorks execution remains unverified; LibreCAD mm DXF smoke and independent
  four-unit parser checks are already recorded. Do not substitute them for SWB execution.
- Microsoft app registration/redirect permissions and disposable-account access
  need actual qualification. Do not automate authentication or invent credentials.
- Upstream redistribution terms still require review before external deployment.

Functional failures stop promotion and are repaired in the active gate. External
qualification rows remain OPEN rather than being silently treated as passes.
