# Version 17.0.0 Acceptance

2026-11-16. Lead: Codex. Status: scoped release PASS / PUBLISHED.
Scope: Projects > Examples, seven public downloadable models including supplied
originals and a new spring-assisted two-stage scissor lift, offline packaging,
17.0.0 release and prioritized feature/patch/tutorial documentation.

## Final Outcome

- Published app source:ef70ed67e770cc40c7997be93c5a040e8ca825f4 on the isolated
  codex/rebuild-cloud-pwa branch. Original master/main remain9954fca; no forced refs.
- [Hosted run43966910340](https://github.com/mikanzui/LinkageStudio/actions/runs/43966910340)
  PASS build/deploy:980 domain/zero skips,27 tooling/zero skips, type/lint/audit,
  normal production build, both real production/offline browser suites and all
  six native gallery profiles. The Linux coarse-row negative control is repaired,
  not bypassed. Deployment7837974306 success2026-11-16T22:18:44Z.
- [Live app](https://mikanzui.github.io/LinkageStudio/): Chrome x7sCBk / WebKit
  zzt00K PASS five checks each, no observer or auth mock. Exact bytes for all seven
  sources; Projects/native download; three moving playground systems; original
  design Save retention;512x440 search/commands; all seven open after offline
  reload and actual scissor platform pixels move. No console/page errors.
- Actual retained in-app tab13 starts on the cached .4 app, then safely upgrades
  through Update available > Restart with recovery to17.0.0. Recovery is closed,
  not deleted. Projects > Examples visibly lists all seven; selected tab retained
  as the user-facing deliverable. Existing user tabs/designs are not replaced.
- [v17.0.0 release](https://github.com/mikanzui/LinkageStudio/releases/tag/v17.0.0)
  published2026-11-16T22:22:23Z, not draft/prerelease. Tag targets ef70ed6. Eleven
  assets: seven models, example ZIP, guide, catalog and SHA256SUMS. GitHub upload
  digests match all model/source values and ZIP SHA256
  1f352c21438f0f9c40bb2961c48fb179d454c0775d2d1618a2b6a4c92c6dc4fb.
- Final local frozen24/24, six native gallery profiles and normal no-observer
  checks below are accepted by the lead. Earlier failures and qualifications stay
  explicit. No routine user QA/gate unlock was requested.

User explicitly authorizes publishing the examples in this release. Earlier
reports describing private originals retain their historical scope. Original
Downloads bytes and the preserved root application/experiments must not change.
Only the isolated candidate branch is released; no forced master/main changes.

## Evidence So Far

- Original Airer SHA2568e73fd936565d2c4df4d549bcc584c438c894f717da6e54ad328a8b3ffd5e0eb;
  Working Screen4f1e389186a478e7e4cd7876914b072d20a964b1130718c1f62766c57dba4c07.
-980 domain tests PASS/zero skips,27 tooling PASS. New18 tests cover catalog/pins,
  async document ownership, dirty navigation, three standalone motions and lift.
- Scissor lift ten-second60Hz run:291.75 maximum platform rise,189.97 floor travel,
  maximum link residual.004354 and rail error4.16e-14. Controlled manual pull also
  moves both stages; source unchanged. Lead reviewed bounded worker implementation.
- Preliminary Chrome3oi5V0: all21 model workflows and three protection profiles
  passed, but final source identity changed during the run. Not accepted. A source
  whitespace correction and nonshrinking-row refinement were completed before the
  frozen qualifying runs. No failed/unfinished preliminary run is a release pass.
- Frozen native gallery Chrome bHEvxY / WebKit hjTNxp PASS: desktop1440x1000,
  touch portrait1024x1366 and Split View512x900, seven actual motions plus protection
  checks in each profile (48 result groups total). Airer opens about41degrees
  through its original brown handle; Chrome portrait/Split pulls use trusted CDP
  touch. WebKit canvas pulls use mouse input, UI commands use trusted taps. Native
  saved downloads/reopen and exact Create restore pass for all42 model/profile
  combinations. Nonshrinking rows fit their text; coarse controls >=44px.
- Source identity(real boundary):e4d131434eb61a85da2de94e4c07e5595fe04ba5d5975520b173fe97e2db077b,
 143 source files, unchanged start/end. Native reports stay ignored/local.
- WebKit QEDENe/NVzZru preliminary runs fail due to harness auto-collapse timing
  and unsupported mouse-wheel input in mobile WebKit. Final harness waits for
  compact layout and uses real Zoom buttons; no app-source changes to bypass tests.
- Production Chrome3FMMPk and cumulative production WebKit4rNTnK/ChromeW7FvvB
  PASS seven checks each, including exact first-time offline payloads/opening of
  all seven models, dirty two-tab update refusal and quota/recovery/rotation.
- Normal build:28 precache entries/~1.37MiB including all models; no test observer.
  Production audit0 findings. ZIP contains nine entries (seven exact models,
  catalog and guide), all seven entry SHA256 values independently rechecked.
- Bounded read-only reviewer Galileo found no concrete data-loss/async/cloud-
  binding/security regression; no edits/tests/browser claims. Review does not
  replace mounted checks. Both focused workers closed; usage/duration UNKNOWN.
- Full frozen cumulative G1-G10 through-g10-SX3NvG PASS24/24; mocked boundary
 2695116642b26c1df97b84d327c0caafe4d318041cd60ffff06851adb5f59328,
 144 source files, unchanged start/end. Runtime21:10:11.298-21:33:20.044 UTC,
 23m08.746s. This is measured test runtime, not total development/agent cost.
- All48 actual CAD downloads from final WebKit3o39qZ/ChromeIy92ii pass independent
  ezdxf1.4.5/macro inspection in the existing cad-tooling virtual environment.
  System Python lacked ezdxf; no installation or app change was needed. Actual
  SolidWorks execution remains unverified.
- Both Downloads originals and preserved root tracked diff rechecked unchanged:
  root diff SHA256184322a978b5017eb90a4b6fcf96ef94d510110fbf7c31162f9cdaa97fcbc95f.
  Staged Git blobs and public mirrors retain both exact original byte hashes.
- Lead accepts local V17 code/browser contract. Hosted build/deploy/live-site and
  tag/release are still ACTIVE, not inferred from the local test results.

## Publication Sequence And Corrections

First publication candidate19929697faf4da3770a8881dcc7ca51a8a076f28 was pushed,
but hosted run43961565653 correctly stopped deployment at the new portrait row
minimum assertion. All seven desktop models had moved/saved/reopened first.
The existing ControlTheme coarse radio selector has specificity(0,2,2), beating
the new example-row selector(0,2,1) and changing computed min-height from76 to44px.
Windows font content happened to exceed76px; Linux exposed the missing minimum.
This is a catalog CSS cascade defect, not a model motion failure. Local bundled
Chromium diagnostics explicitly measure44px computed minimum before the patch.

Fix: add the app-layout qualifier only to the example-row rule(0,3,1). Keep the
assertion strict and additionally require computed min-height76px; log exact row
height/text insets. No solver/document/auth/global control rule changed. All
three local final-source browser runs (full24 cumulative plus six gallery
profiles) are restarted; earlier source identities above remain historical, not
final-source acceptance. Releasev17.0.0 stays DRAFT targeting1992969 until final
qualification, successful deployment and live verification. Its11 uploaded asset
digests match source, including the seven models and verified ZIP.

Post-fix gallery Chrome9kFFOv/WebKit0rBaQX PASS48 groups/six profiles, now requiring
computed76px and fitting row text. Final real-source fingerprint is
653412daff5926de89c8959c8e7571365f4a032f49dd673d8c35f97c1046e919 (143 files).
No-observer normal production preview http://127.0.0.1:5192/LinkageStudio/:
ChromeajmqUe/WebKitprm5ia PASS five checks each, including native source download,
512x440 keyboard-height search/commands and offline first open/motion. These
preview reports are not hosted-site evidence. An earlier Chromeu8aX9Q helper
timed out because native search Escape cleared its query before dialog cancel;
the helper now explicitly asserts query clearing, then tests modal Escape from
button focus. The premature commentary claim was corrected; final results above
are observed, not inferred. Full final-source cumulative remains ACTIVE.

Final cumulative through-g10-KtdB1G PASS24/24 on unchanged source. Mocked boundary
7046718b4e69dbeec3fda39081de49baec5f418135b01996461223a6422f65f8 (144 files),
real boundary653412daff5926de89c8959c8e7571365f4a032f49dd673d8c35f97c1046e919.
Measured21:43:31.568-22:04:46.924 UTC =21m15.356s. Both final G8 exports
(WebKito01JaR/ChromeMOJ1N2) independently pass48 CAD downloads. Final980 domain,
type/lint/normal build PASS; package/toolchain is unchanged from the prior27
tooling pass. Lead accepts the final local scoped code/browser contract.
No hosted retry/tag/publication PASS is inferred from this result.

The final outcome above records exact identities, browser reports, cumulative
result, normal artifact, clean hosted test/deploy, source commit/tag/release assets
and actual live checks. Acceptance was completed only after those observations.
No credentials, tenant/token details, user cloud files or ignored raw browser
snapshots are release assets. The public models/catalog and user-facing guide are.

## Limits

Physical latest iPad/iPadOS/Safari/Home Screen/Pencil/VoiceOver unverified; native
WebKit, touch/code/viewport tests do not certify hardware. Model loads are not
calibrated SI; slider/contact reactions remain incomplete. Azure AZ-01/AZ-02 and
broader live account/production sign-in qualifications remain open. Tutorial is
planned in FEATURE-BACKLOG.md, not falsely described as implemented in17.0.0.
