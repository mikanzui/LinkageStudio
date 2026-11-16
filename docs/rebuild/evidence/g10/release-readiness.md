# Rebuild.2 Readiness And Rollback

2026-11-16. Version 0.16.0-rebuild.2, branch codex/rebuild-cloud-pwa. Local
implementation candidate, not deployment approval. Final gate report owns the
cumulative decision; this document owns residual qualifications and rollback.

## Preserved Inputs

- Original master remains at 9954fca; its complete tracked patch still hashes
  `184322a978b5017eb90a4b6fcf96ef94d510110fbf7c31162f9cdaa97fcbc95f`
  using the original full-index/binary diff command. Both original untracked
  compatibility test files match the archive. No root app source was replaced.
- Both supplied mechanisms retain their original pinned SHA256 values.
- Earlier GitHub checkpoint v0.16.0-rebuild.1 remains at 1b6f723; G9 implementation
  checkpoint is 43d440d. No tag or original branch was force-updated.
- The published fixture-map document remains the redacted checkpoint version.
  Private models/coordinate inventories/raw browser traces stay outside Git.

## External Qualifications

| Item | State / Concrete Next Step |
| --- | --- |
| Microsoft registration | OPEN: user confirmed control and authorized a disposable QA file. Exact public client ID/callback confirmation and manual sign-in are pending. Required local SPA redirect: http://127.0.0.1:5187/LinkageStudio/redirect.html. No browser client secret |
| Live OneDrive behavior | AUTHORIZED / NOT YET RUN: user performs authentication; Codex tests only the synthetic disposable project, including stale ETag refusal, CORS/download, expiry/reconnect and rename/delete. Never use original cloud files as destructive tests |
| Physical iPad | OPEN: record actual current model/iPadOS/Pencil; qualify Safari/Home Screen/Files/VoiceOver/keyboard and background resume. Automated code/WebKit/touch/viewport evidence is not a hardware claim and did not block implementation |
| SolidWorks macro execution | OPEN: actual licensed target app required. Independent parser and LibreCAD DXF evidence are retained but are not substitutes |
| Redistribution terms | OPEN: no top-level license identified in the pinned upstream snapshot; preserve author/provenance and resolve terms before external release |
| GitHub-hosted CI | UNVERIFIED: non-deploying public workflow added, but no hosted run/deployment is implied by a local pass |
| Remaining development audit | Four low findings in an unpatched deepmerge build-tool chain; inspected consumer merges static internal defaults only, asserted in tests. Production audit zero. This is a qualified residual, not a fix or suppression |

The bounded independent G10 review found no actionable finding in its eight
assigned auth/coordinator/modal/restart/config files, with exact file hashes in
the local g10-review handoff. This is not a guarantee that no bugs remain.
One main JS chunk remains above the 500 kB warning threshold (about 509 kB,
153 kB gzip in the normal build); no warning threshold was raised to hide it.

## Timing And Device Limits

Ten-minute soaks assert actual wall duration, sustained motion in each timed
block, finite coordinates, fixed-pivot/length bounds and capped traces. Simulation
time is recorded separately: browser throttling changes wall-clock throughput.
The tests do not certify real-time performance, refresh-rate equivalence or SI
engineering accuracy. Windows headless Firefox's native picker limitation is
explicitly qualified; its mounted input/FileReader/import uses a boundary fixture.

## Rollback Policy

Do not reset or overwrite the preserved original workspace. Inspect an older tag
in a separate checkout/archive and retain current exports/recovery first. G8
recovery and G9 cloud caches use distinct version-1 databases; rolling source
back must not clear either database or browser site data. The old checkpoint's
automatic PWA mode is not a certified safe worker rollback target. A deployed
worker/reload handler already running in an older app cannot be changed
retroactively by this branch. Plan an explicit saved/recovered transition before
any future deployment/rollback, and never use Clear Site Data as routine QA.

Normal release builds use vite.config.ts, not the generated read-only observer or
mock-auth test config. Normal dist bundles were checked for absence of observer
getters/test-auth bypasses. No deployment, Microsoft credential automation,
original cloud-file mutation or broad publication is performed by this readiness
checkpoint. Remaining external qualifications do not become passing rows merely
because all code/browser checks pass.
