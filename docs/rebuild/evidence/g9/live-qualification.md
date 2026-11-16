# Live OneDrive Qualification

2026-11-16, Windows in-app browser, candidate 0.16.0-rebuild.2 on
http://localhost:5187/LinkageStudio/. Lead performed UI checks; user performed
Microsoft authentication. User authorized create/rename/delete of one clearly
named disposable synthetic QA file. This is not a personal-account or device
matrix certification. No production deployment.

## Registration And Failure Reproduction

The requested 127.0.0.1 callback returned AADSTS50011. User's Authentication
screenshot showed the SPA callback http://localhost:5173/LinkageStudio/redirect.html.
Reopened the same candidate on localhost:5187; Microsoft documents port-insensitive
localhost redirect matching. Callback HTTP 200, authentication and Graph listing
succeeded. No registration setting, permission or scope was changed.

Live create succeeded, but remote reopen failed. Added static-stage diagnostics
without logging provider bodies/addresses. Actual UI identified missing download
address: the projected metadata response omitted @microsoft.graph.downloadUrl.
Changed the first metadata request to standard GET by immutable drive/item ID
without $select. Same QA file then downloaded and reopened successfully. Both
identity checks, pre/post ETag/size verification, bounded UTF-8 stream reading,
no bearer/cookies to the download host and no redirect following remain intact.

The previous mocks always supplied the annotation even for projected requests;
they did not model this service behavior. Domain regression now models omission
under $select, and mounted browser boundary does the same. A passing mock is not
substituted for the observed before/after live result.

Negative control: compiled the historical 0810710 transport in memory and ran it
against the same synthetic projection-omission boundary as the repaired module.
Historical code failed invalid as expected; repaired code returned the exact abc
payload. No source file was temporarily mutated and no real network request made.

## Actual UI Results

Disposable name: Codex-QA-20261116-R2-LIVE-A7K3.slinker, then suffix -RENAMED
through the app, then -EXTERNAL through OneDrive's own web interface.

| Check | Observed Result |
| --- | --- |
| Authenticate and list | PASS on the user-selected work account; existing cloud project was not opened |
| Create synthetic QA mechanism | PASS: actual Saved to OneDrive acknowledgement and remote listing |
| Duplicate-name create | PASS: conflict refusal, no silent overwrite |
| Remote reopen | FAIL with projected metadata; PASS after full-metadata repair |
| Manual save and fresh remote download | PASS: edited authored project title persisted; QA rod and Base present, design DOF 1 |
| App rename | PASS: remote/cache filenames updated, authored title unchanged |
| Independent stale revision | PASS: renamed only QA through OneDrive UI, then attempted save from older app binding. Transport conflict message and pending offline draft observed; no local-cache-revision error substituted for server refusal |
| Remote contents after stale refusal | PASS: explicitly discarded synthetic pending draft/local edit, reopened remote, prior confirmed title retained rather than rejected title |
| Explicit autosave | PASS: enabled checkbox for bound QA, changed authored title, received acknowledgement, fresh remote reopen retained Codex QA R2 Autosave Verified |
| Delete and detach | PASS: Deleted from OneDrive. Local copies retained; cached row marked deleted remotely, autosave disabled, authored local mechanism retained |
| Independent cleanup | PASS: reloaded OneDrive web folder, disposable filename absent; unrelated existing project remained listed and untouched |

The discarded offline draft contained only the intentionally rejected synthetic
edit. Deletion was recoverable normal OneDrive deletion, not recycle-bin purge.
Local synthetic cache/recovery retained; original 127.0.0.1 origin storage untouched.
Auxiliary Microsoft web tabs were closed; localhost candidate remains open.

Private local evidence: .rebuild.local/live-qa/qa-seed.slinker and
onedrive-completed.jpg. Screenshot shows only synthetic geometry/local retained
design and deletion acknowledgement, not tokens or private model contents.
Raw OAuth query strings, preauthenticated URLs and unrelated filenames are not
copied into this public report. Successful SDK token exchange is not extracted.

## Qualification Limits

Actual forced expiry/revocation, account switching, quota exhaustion and offline
reconnect were not induced on the live account; those remain automated boundary
coverage, not live-provider passes. Server stale-write refusal is demonstrated on
this work drive; other providers/personal accounts and all race schedules are not
thereby certified. Physical iPad/Safari/Home Screen remains unverified. Production
host registration currently shows an editor-root callback, not the dedicated
production redirect.html; resolve that before any future production cloud release.

Post-repair acceptance: 923 domain tests, zero skips; typecheck/lint PASS. Full
22-suite cumulative browser rerun yF897B PASS: 22/22, zero failures, source stable.
First post-repair run piCBR2 failed the unrelated G4 tablet startup harness race;
initial/failed screenshots show the mount-effect collapse replacing the button.
Harness now awaits actual narrow collapsed state before using Expand; no UI tap,
membership, undo, target-size or persistence assertion was removed.

Final artifact: .rebuild.local/gate-builds/g10-T5ENEN. Cumulative report:
.rebuild.local/evidence/cumulative/through-g10-yF897B/report.json. Actual final G9
boundary suites: webkit-browser-cvfMNk and chromium-browser-mnCR2j, 21 scenarios
each. G4 body retests bodies-uJ41mb / bodies-dwbREg PASS. Source start/end SHA256:
`0d05fadc37d810800165b041109b9a75437a8575a409fa97b265f68aa7d41f3f`
(128 files, mock SDK boundary). Real SDK observer fingerprint:
`5efb864398b0a680b1ea3db9b3d0c6a6f4347ab7fec443706390130c14aedc3f`
(127 files). Normal production build, type/lint and 27 tooling tests PASS;
normal release assets contain no observer or fake-auth boundary. No hosted CI run.

Harness SHA256: verify-g4-bodies.mjs
`225f72e4c14828ee6f426048ca779dd0b5f8971f864ce765d29554f8683da875`;
verify-g9-browser.mjs
`500db27400381685d130bbb62735fab6557662b6b90b80c5e6ed59cf88b7a90f`.
The earlier ten-minute physics soaks are historical unchanged-physics evidence,
not repeated measurements of this cloud-only change.

See ../../azure-integration-review.md for the supplied skill audit and AZ-01/AZ-02
hardening follow-ups. No complete security checklist or deployment claim.
