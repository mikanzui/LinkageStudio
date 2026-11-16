# G9 Code And Browser Checkpoint

2026-11-16. F19/F20; C01/C02/C10/C11/C12. Lead acceptance: VERIFIED
IMPLEMENTATION CHECKPOINT / MICROSOFT SERVICE QUALIFICATION OPEN. This is not
full live-cloud target acceptance or deployment approval.

Follow-up 2026-11-16: bounded actual work-account file workflow now verified after
repairing projected metadata/download compatibility. See live-qualification.md
for actual failures/retests and remaining live/device limits; this report's
original G9 artifact/test counts remain historical. Supplied Azure skill and open
hardening checks are mapped in ../../azure-integration-review.md.

## Implemented

Optional guest-first Projects dialog; lazy MSAL 5.29.1 with explicit account
selection and no background popup; dedicated v5 redirect bridge; identity/ETag
OneDrive adapter, bounded safe pagination and credential-free downloads;
account/drive/item cache and pending journal; session-owned create/open/save,
rename/delete, explicit autosave, offline reopen, conflict refusal and copy paths.
Canonical validation precedes both import and replacement of a known-good cache.
Acknowledged writes and newer edits remain distinct. Cached names/deleted flags
update immediately rather than requiring a refresh.

## Evidence

- 898 domain tests, zero skips, including original private-fixture assertions;
  TypeScript/lint/normal production build PASS. New cloud coverage: 151 transport,
  49 storage, 8 auth and 27 coordinator cases (235 total).
- Frozen G9 artifact `.rebuild.local/gate-builds/g9-XbRGvr`, source SHA256
  `f62f3572039cbbbe97bfa2296316cb133161d2b83d5c6051024db144168fd53e`.
- Cumulative `.rebuild.local/evidence/cumulative/through-g9-ux7Mjb/report.json`:
  20/20 suite/engine combinations, source stable, G1-G9 plus both G4 suites.
- G9 mounted UI: 18 scenarios per engine across desktop, portrait tablet and
  512px Split View. Final evidence `g9/webkit-browser-Gf1yIO` and
  `g9/chromium-browser-Ij9Amk`. Actual mounted app/IDB; only SDK/HTTP boundaries
  replaced in an explicitly fingerprinted test variant.
- Cases include guest auth failure, first save/autosave, rename/reopen/delete,
  cloud collision/quota, expired credentials, account isolation, dirty-open/save
  cancellation, invalid remote content, offline draft reload/reconnect and both
  originals' cloud-imported handle motion/design restoration.
- Lead-reviewed WebKit Split View screenshot previously found stale cached
  filename after rename. Added immediate metadata updates and an independent
  mounted assertion that remote/cached names both change. Native select rendering
  was corrected with dark color-scheme and visually rechecked.

Raw fixture content, coordinates, screenshots/traces and synthetic-token HTTP
observations stay in ignored local evidence. No live credentials or original
mechanisms are published with this document.

## Open Limits

Real registration ownership/redirect URI, live Microsoft sign-in, provider CORS,
download host behavior and conditional simple-upload behavior are UNVERIFIED.
The adapter sends captured If-Match, but the simple-upload header table does not
document that precondition: mocks are not proof that the server enforces it.
An asynchronous request for disposable live QA authorization/registration access
has been made; no existing user cloud file was read/modified for testing.
No full cloud-service PASS is claimed. Graph primary references/qualification
limits are in preparation.md and the local worker handoff.

Physical iPad/Safari/Home Screen/Pencil/VoiceOver and SolidWorks remain OPEN.
WebKit touch/viewport/cancel checks do not replace hardware qualification. G10
code/readiness work proceeds under the user's autonomous-completion direction;
it does not waive these external qualifications or authorize deployment.
