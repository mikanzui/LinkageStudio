# Final Scrub Issue And Retest Ledger

2026-11-16. Status entries distinguish app defects, harness defects and external
qualification limits. Do not remove failed/aborted evidence when a later run passes.

| ID | Finding | Classification / Repair | Retest |
| --- | --- | --- | --- |
| S01 | Cached filename stayed stale after cloud rename until refresh | App usability; publish confirmed cache metadata immediately after open/save/rename/delete | G9 mounted assertion checks both filenames; through-g9-ux7Mjb PASS |
| S02 | Save assertion observed server receipt before local acknowledgement | Harness race; wait for acknowledged captured baseline, not request receipt | G9 actual save/autosave scenarios PASS |
| S03 | Planned reload was cancelled by beforeunload test handler | Harness; explicitly accept planned beforeunload navigation | Offline draft reload PASS, no app warning bypass added |
| S04 | Mobile WebKit cannot synthesize mouse wheel | Driver limit; use actual zoom buttons for camera setup; touch/pen limits remain explicit | Original cloud-imported handle motion PASS on portrait/Split View |
| S05 | Headless Firefox emits cancel before Playwright file delivery | Reproduced on a minimal page without app code, online and offline. Do not weaken native cancel handling; suppress native picker click only for qualified Firefox input delivery | Firefox production worker/offline/input/FileReader path PASS; actual native picker OPEN |
| S06 | Projects could not close while MSAL initialization was pending | App defect; cancellable library/initialization, epoch-owned UI completion, explicit ambiguous sent-write status, no late pre-upload request | Added 4 domain cases and stalled-auth/list UI scenarios; 21 scenarios per engine PASS in HMFsJW/uADliC; final cumulative PENDING |
| S07 | Auth callback denylist excluded query-free path only | App config defect; Workbox matches pathname plus search, so deny optional query suffix too | Added actual offline callback query navigation refusal; final production/cumulative PENDING |
| S08 | Initial soak fixture used raw retention=0, so motion settled | Harness qualification; no physics repair implied. Use raw retention=1 for undamped continuous motion, require travel in every timed block | Earlier settling runs ABORTED, not passed as continuous-motion evidence; two full ten-minute runs ACTIVE |
| S09 | Portability test rejected its own parent workspace path | Harness assertion; compare selected source root with the guessed nested child, not a substring of a legitimate temporary path | All 27 tooling tests PASS |
| S10 | First npm ci found native binding held by the old G8 preview | Local tooling lock, not dependency resolution; stopped only the owned preview on 5185 and retried | Clean no-bypass install PASS |
| S11 | Unbound cloud timer captured/serialized the guest document unnecessarily | App idle-cost correction; short-circuit before document capture when there is no binding. No unmeasured hardware/timing improvement claimed | Zero-capture regression PASS; full CxnIL6 22/22 + both ten-minute runs PASS on final fingerprints |

Final retest: through-g10-FBz1Mu PASS, 22/22 with stable source; S06/S07 are
closed for the browser/code contract. Continuous soaks F2h2Dg/Rof9Rj each PASS
after >=601000 ms; S08 is closed as a corrected harness qualification. Native
Firefox picker and physical device/target rows remain OPEN, not waived.

The earlier G10 through-g10-6fT01a run FAILED at S06. The next run was ABORTED
for S07 before promotion. No partial/aborted run is gate acceptance. Final pinned
reports are linked by acceptance.md; partial/aborted runs are not promoted.

External Microsoft registration/service/CORS/conditional upload, physical iPad
Safari/Home Screen/Pencil/VoiceOver, SolidWorks execution and upstream licensing
remain OPEN. Four low dev-only deepmerge audit findings remain disclosed, not
fixed or suppressed. CI definition is not evidence of a GitHub-hosted run.
