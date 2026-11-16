# Remaining Updates

2026-11-16. User resumed development beyond the 0.16.0-rebuild.1 checkpoint.
Preserve tag/commit 1b6f723 and the original dirty master workspace. Work continues
on codex/rebuild-cloud-pwa in the existing isolated candidate. Codex owns tests and
gate decisions; no routine user sign-off. No deployment is authorized.

## G9: Optional Cloud Projects

Latest follow-up: UI16-05 corrects the incomplete .3 historical restoration in
`0.16.0-rebuild.4`. Actual animated old/new recordings, not settled screenshots,
now assert the 220ms fan, 38ms stagger and compact historical paint. Both original
11/12-body projects remain fans; stationary clamped hold/release cannot alter them.
960 domain/27 tooling tests PASS; final frozen cumulative24/24 and fresh install
PASS; scoped UI16-05 accepted by the lead. Track evidence
in `evidence/ui16-motion/acceptance.md` and progress-tracker.md. Existing external/Azure
qualifications below remain unchanged by this frontend-only task.

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
| G10-01 | Compatible pinned toolchain and clean installation | No legacy peer override needed, production audit clean, development findings repaired/qualified, clean-checkout type/lint/build/tests | IMPLEMENTED / VERIFIED locally; 919 tests, 904 pass + 15 explicit private skips in fresh public checkout; four low dev findings disclosed |
| G10-02 | Deployment subpath and PWA assets | Real repository path/case, nonblank cold/warm/offline navigation, correct asset scopes and usable installation icons | CODE / BROWSER VERIFIED; physical installation OPEN |
| G10-03 | Safe service-worker updates and background/resume | No automatic dirty-page replacement; recoverable update choice, old/new version transition and offline restart verified | CODE / BROWSER VERIFIED; final cumulative ACTIVE |
| G10-04 | Portable browser tooling and CI | Explicit private fixture configuration, no uploaded mechanisms/coordinate inventories, reproducible read-only observer build and published test commands | IMPLEMENTED; 27 tooling tests + hash-checked private tests; hosted CI UNVERIFIED |
| G10-05 | Final whole-app scrub and soak | All implemented UI workflows plus domain tests, full cumulative engines, tablet/Split View/cancel/rotation-code checks, 10-30 minute motion and ownership soak | DONE for code/browser contract; 22/22 cumulative + both continuous ten-minute runs PASS; physical qualification OPEN |
| G10-06 | Documentation/version/rollback decision | Accurate comparisons/evidence/issues, preserved author credit and checkpoint, explicit external/device limits; no deployment or full-release claim without required evidence | DONE for local 0.16.0-rebuild.2 checkpoint; evidence/g10/acceptance.md and release-readiness.md; no deployment/broad publication |

## External Qualifications

Supplied Azure-skill review (2026-11-16): read azure-integration-review.md for
version-specific adaptations. AZ-01 (deployment CSP with real download-host,
popup/renewal/PWA/image and blocked-destination tests) and AZ-02 (retain sanitized
non-interaction token/network failure classification without background popups)
are OPEN hardening follow-ups. Do not claim full skill/security-checklist compliance.
Bounded live work-account file workflow now passes after full-metadata download
repair; see evidence/g9/live-qualification.md. Live expiry/account-switch/quota/
offline-reconnect, personal account and production callback remain unqualified.

- Physical current iPad/Safari/Home Screen/Pencil/VoiceOver remain unverified until
  real hardware is available. Code/WebKit/touch regressions continue under D15.
- SolidWorks execution remains unverified; LibreCAD mm DXF smoke and independent
  four-unit parser checks are already recorded. Do not substitute them for SWB execution.
- Microsoft app registration/redirect permissions and disposable-account access
  need actual qualification. Do not automate authentication or invent credentials.
- Upstream redistribution terms still require review before external deployment.

Functional failures stop promotion and are repaired in the active gate. External
qualification rows remain OPEN rather than being silently treated as passes.
