# Groundwork Evidence Ledger

Latest follow-up: UI-16 hold/context menu and checkbox/radio/range reintegration,
candidate `0.16.0-rebuild.3`. Scoped contract accepted: 950 domain/27 tooling,
focused three-engine checks and 24 qualifying regression suite/engine results
on unchanged final source, with a G9 harness-only retry explicitly qualified.
See [UI-16 acceptance](evidence/ui16/acceptance.md) for final
status, source/artifact identity, retained failures and device limits. Earlier
baseline/checkpoint rows below are historical, not a claim to stop current work.

Updated 2026-11-16. G0-G7 accepted; G8/G9/G10 verified implementation checkpoints
with external qualification limits. Development resumed after 0.16.0-rebuild.1.
Earlier baseline rows remain historical.

| Check | Result | Evidence / Limit |
| --- | --- | --- |
| Upstream identity | VERIFIED | GitHub master resolves to `3dfe10512e105f863a582ce5cc4b3bb8a2006306`; package v0.12.3 |
| Local ancestry | VERIFIED | Fetched upstream commit equals `git merge-base FETCH_HEAD HEAD` |
| Local baseline | RECORDED | HEAD `9954fca`; existing dirty source and two untracked test files preserved |
| Feature comparison | SOURCE AUDITED | History, upstream types/files, local components/stores/services; feature inventory in README |
| Current automated tests | PASS | `npm.cmd test`: 58 tests, 9 files; Node environment only |
| Current production build | PASS | `npm.cmd run build`: TypeScript, Vite and PWA generation completed |
| Current lint | FAIL | `npm.cmd run lint`: 28 errors, 2 warnings; includes hooks rules, unused values and explicit-any errors |
| Existing release pipeline | GAP | Deploy workflow runs `npm ci --legacy-peer-deps` and `npm run build:pages`; no tests/lint/typecheck stage |
| Fresh rendered app audit | PARTIAL | Earlier desktop-control failure recorded; G0 Session 01 now uses working Playwright/Chrome with isolated origins and mounted-store observations |
| Fresh legacy import/drag | REPRODUCED | Both fixtures imported through chooser and dragged through real input; local Airer halts at one frame; WorkingScreen moves; session-01 |
| Physical iPad Safari/Pencil | UNVERIFIED | No physical device run in this audit |
| iPad installed/offline app | UNVERIFIED | Requires physical release qualification |
| Cloud/auth recovery | SOURCE AUDITED ONLY | No live-account writes or login performed |
| CAD target compatibility | UNVERIFIED | Export code present; no independent CAD import or macro run |
| G8 complete files/recovery/CAD domain | PASS FOR DOMAIN CONTRACT | 663 tests/type/lint/build; codec negatives, transaction/quota/revision ownership, delayed file writes and independent four-unit DXF audit; evidence/g8/integration-notes.md |
| G8 first full browser matrix | FAILED, RETAINED | Native dialog focus and actual held-edit test corrected; later Chrome 51/51 passed but WebKit caught stale recovery selection/focus. through-g8-QV0AxL and through-g8-E9txK7 retained, no acceptance |
| G8 repaired WebKit matrix | PASS FOR BROWSER MATRIX | g8-ghGWm9, source 243ac083...; webkit-browser-t1wNrK all 51 desktop/coarse/Split View scenarios pass; full cumulative run still active |
| G8 actual downloaded CAD geometry | PASS FOR INDEPENDENT READER | Twenty-four files per full browser run; ezdxf1.4.5 audits dimensions/units/radii/layers/open paths and separate macro-call geometry reader; no CAD GUI or SolidWorks execution claim |
| G8 final versioned cumulative | PASS 18/18 | 0.16.0-rebuild.1, g8-pkwfMc, source 3ebb098f...; through-g8-Peh1SI; 54 G8 scenarios per engine plus all G1-G7 regressions |
| G8 actual CAD GUI | PASS FOR MM DXF SMOKE | LibreCAD 2.2.1.6 renders byte-identical final download; native rod properties (30,-72)->(30,-120), length48, correct rod layer; cad-gui-check.md; no SolidWorks execution claim |
| G8 portable domain tests | PASS WITH EXPLICIT PRIVATE LIMITS | Integrated checkout: 663/no skips with originals, 648/15 named skips without private fixtures; missing/tamper required controls fail; Python parser is never optional |
| Synthetic solver/lifecycle audit | TARGETED REPRODUCTIONS | Delegated in-memory checks found topology-dependent gravity, locked slider graphs, incorrect support reactions, pause retries and old-project coordinate restoration; details in README |
| Master preparation documents | COMPLETE | MASTER-PLAN, tracker, visual/usability ledger, templates and root AGENTS reference created; no application source change |
| Baseline preservation | PASS | Ten artifact hashes verified; both mandatory fixture hashes match; live application patch equals archived patch |
| Documentation/tooling checks | PASS | Eight Markdown files checked for relative links/trailing whitespace; no missing links; capture script passes `node --check`; Git diff check clean |
| Selective multi-agent planning | COMPLETE | Lead plus up to two workers, stage/file ownership, integration rules and measurement fields added; execution pilot not yet run |
| Multi-agent plan revision checks | PASS | Nine rebuild Markdown files checked: no missing relative links or trailing whitespace; Git diff check clean; tracked application patch still matches preserved baseline |
| G0 runtime setup | COMPLETE | Isolated upstream/local/candidate worktrees at 5181/5182/5183; one explicit causal experiment at 5184 |
| G0 motion harness | PASS FOR REPRODUCTION | 12 expected classifications match across brown-arm, rail-foot and WorkingScreen interactions; unchanged local Airer fails as expected; no release acceptance |
| G0 causal validation experiment | OBSERVED | Single dev-server guard change resumes Airer stepping/motion; fixed drift/restoration zero in sampled drags; physical accuracy remains unaccepted |
| G0 looks/usability | PARTIAL | Default/compact body-tree and offscreen error measured; fresh screenshots sealed; remaining screen/accessibility/device matrix open |
| G0 evidence integrity | PASS | All 101 sealed artifact hashes verified; 12 Markdown documents have valid relative links; nine JS scripts pass syntax checks; original tracked application patch unchanged |
| Airer intended handle/direction | USER CONFIRMED | Upper brown arm pulled upper-left; stable target `g6kFted7Nm` / `link_cwDY2fFAEZ_g6kFted7Nm`; full-opening pose/time tolerances remain unqualified |
| G0 baseline acceptance | PASS | Codex accepted evidence/g0/acceptance.md; G1 unlocked, not a claim that the defective reference or rebuilt physics is fixed |
| G0 acceptance recheck | PASS | 2026-11-15 19:43 UTC: check-motion.mjs reevaluated recorded browser captures, all 12 classifications match; all 101 sealed artifact sizes/hashes verified; not a new live browser run |
| G1 document/local editing | PASS | Candidate 5aacb68; 62 tests; build/lint pass; four Chrome mouse/touch contexts, nine workflow groups each; evidence/g1/acceptance.md; physical iPad unverified |
| G1 WebKit extension | PASS | All four G1 mouse/touch layouts pass in WebKit 27.2; browser-h44ORA; trusted touch taps, no physical-iPad claim |
| G2 ordinary links/lifecycle | PASS | Candidate 9192bad; 96 tests/build/lint; Chrome trusted mouse/touch rod drags, WebKit mouse drag/touch tap-plus-gravity; full A/B/A exact-restore and known-bad frame stops; evidence/g2/acceptance.md |
| G3 full legacy movement | PASS | Candidate 9639bdd, source hash 94c167da...; 139 tests/build/lint; 8 Chrome mouse/touch and 4 WebKit original/reopened real-file runs; complete brown-arm Airer opening; cumulative G1/G2 pass; evidence/g3/acceptance.md |
| G4 tablet/input/selection | PASS (CODE/BROWSER) | 715fed1; 199 tests/build/lint; immutable g4-WOLqjR output hashes and rendered source identity; cumulative G1-G3 pass; trusted Chrome pen/touch/cancel/pinch and WebKit/five repeated selection runs; evidence/g4/acceptance.md |
| G4 rapid synthetic flick follow-up tap | QUALIFICATION LIMIT | Plain native HTML also reproduces in Chrome157/bundled159; explicit 300ms endpoint hold passes eight independent controls; not claimed fixed in app; native-touch-probe-CuZ3il |
| Original workspace preservation after G4 | VERIFIED | Full-index tracked patch SHA256 remains 184322a978b5017eb90a4b6fcf96ef94d510110fbf7c31162f9cdaa97fcbc95f; all rebuild source edits confined to candidate |

G0 Session 01 evidence and limitations: [session report](evidence/g0/session-01.md).
Its sealed bundle contains 101 hashed artifacts. Original application source and
the pinned reference worktrees were not edited by the experiment.

The eight-file documentation check above describes the earlier preparation run.
New plan revisions require their own link/consistency check; they do not alter the
recorded application test results or qualify any rebuild gate.

Build warnings: main JS chunk exceeds 500 kB; Browserslist data reported stale.
These warnings do not alone establish runtime defects.

## Required Real-World Fixtures

Keep originals unchanged. Copy to a local immutable regression corpus before G0
execution; do not publish private designs without deciding their distribution.

| File | Size | SHA-256 | Expected Reference |
| --- | --- | --- | --- |
| `C:/Users/jaket/Downloads/Flap - Winged Airer (1).slinker` | 30,332 bytes | `8E73FD936565D2C4DF4D549BCC584C438C894F717DA6E54AD328A8B3FFD5E0EB` | v0.11.15 save; user supplied open-versus-stuck screenshots; record exact intended pull point and motion |
| `C:/Users/jaket/Downloads/WorkingScreenLow.slinker 1 (1).json` | 461,390 bytes | `4F1E389186A478E7E4CD7876914B072D20A964B1130718C1F62766C57DBA4C07` | v0.11.14 save; user previously reported motion working; recapture against upstream |

Historical screenshots were supplied in the conversation. Temp clipboard paths are
not durable test assets; archive reference images and fresh traces as part of G0.

## Preserved Baseline Archive

Capture completed 2026-11-15 using
`node scripts/rebuild/capture-baseline.mjs`.

Manifest: [local archive manifest](../../.rebuild.local/baselines/2026-11-15T18-45-10-493Z-CMbWTX/manifest.json).
The `.rebuild.local/` directory is excluded by the existing `*.local` Git ignore
rule. It contains private local evidence, not published repository assets.

The archive contains pinned upstream/local-head ZIPs, the complete tracked diff
from HEAD, staged-diff evidence, both untracked source test files, dependency lock,
status and both supplied mechanism files. All ten artifacts have SHA-256 entries.
Both mandatory fixture hashes match the recorded originals. No original was changed.

The historical screenshot paths are now missing:

- `C:/Users/jaket/AppData/Local/Temp/codex-clipboard-67361434-4776-4ea9-9d58-852b4de90201.png`
- `C:/Users/jaket/AppData/Local/Temp/codex-clipboard-d3dec47e-f0cc-4dbc-87c7-fbc5ef890594.png`

The manifest records them as MISSING. This archive passes source/input preservation
only; it did not itself accept visual comparison, browser drag or physical iPad
qualification. Subsequent G0 browser evidence and baseline acceptance are recorded
above; physical iPad qualification remains unverified.

To repeat preservation, run the same command from the workspace. Each run creates
a fresh directory and never overwrites an older capture. Restore only into a
separate directory using the manifest instructions. It is a source baseline archive,
not a backup of browser sessions or credentials. Newly authored untracked planning
documents are not part of its application-source snapshot.

## Evidence Bundle Template

## G5 Integrated Acceptance

2026-11-15: candidate c9178b88c20c3068cfa89e2ca59346acc8dbab66, immutable
g5-iTGyV8; source plus observer SHA256
`9e0d31462d3f08088f1779e7bcf8cbe2f2f07d13cbe3a50ee0c60fb7f0e944ea`.
326 tests/build/lint and all twelve Chrome/WebKit cumulative suite combinations pass.
Manifest, raw logs and report: `.rebuild.local/evidence/cumulative/through-g5-tCHoDV/`.
Gate details: [G5 acceptance](evidence/g5/acceptance.md); discovered observer,
coarse-target and overlay coverage gaps are retained in qualification-notes.md.
G4 expanded target coverage is reaccepted; original files and root patch hashes match.
Physical hardware/VoiceOver remain unverified. G6 starts automatically.

## G6 Integrated Acceptance

2026-11-16: candidate 7a6dd398a5d8751b90aec80804879fe5abf8651d, immutable
g6-gSRHyg; source `9f0021683d25dd88b7886aa04336068ab9ef31f701c3466f7c9c1d9a122f9821`.
434 tests/type/build/lint pass; all fourteen cumulative browser suite/engine runs
pass in `.rebuild.local/evidence/cumulative/through-g6-hztyQs/`. See
[G6 acceptance](evidence/g6/acceptance.md). Earlier reattachment and stale-alert
failures remain documented, not relabeled as passing runs. Root patch unchanged.
Spring motion-model qualification is not SI calibration or physical iPad certification.

```text
Gate / feature:
Commit + dirty patch hash + build ID:
Fixture hashes:
Device/model + OS build + browser + viewport + DPI + input type:
Exact entry route and UI steps:
Expected output and independent reference:
Measured moving-joint/angle/travel result:
Constraints/fixed-joint/finite-state checks:
Before/after screenshots and event trace paths:
Console/network errors:
Cumulative suite outcome:
Negative control (how this check detects the regression):
Result: PASS / FAIL / BLOCKED / UNVERIFIED
Remaining limitations:
```

## G7 Integrated Acceptance

2026-11-16: candidate 5b5431fb5b58d0dac961c35c10924ad0cc333251; immutable
g7-MwfdcW, source `e4c1daa5ae32a1d0c2920132aba4fc833db07ceb0aa46dbc239df1cbde8c4b4f`.
519 tests/type/build/lint and all sixteen cumulative suite/engine runs pass in
`.rebuild.local/evidence/cumulative/through-g7-11YTSS/`. See
[G7 acceptance](evidence/g7/acceptance.md). Forces are qualified model values, not
SI loads; RATTLE regime and contact/physical-device limits remain explicit. Earlier
failed/performance runs are preserved in G7 integration notes. G8 starts automatically.

## Open Decisions (Remaining)

- G0 scope retains implemented F01-F21 capability families and simplifies
  interactions where comparison evidence supports it. Record specific exceptions;
  do not treat unimplemented backlog items as existing feature parity.
- Airer handle and upper-left pull direction are confirmed. Establish the full
  coordinated opening trajectory through that handle in the pinned upstream before
  setting real-fixture numeric tolerances; the foot test remains secondary.
- Record exact current iPad model/OS/Pencil at G4; the user requested latest
  hardware and stable iPadOS, not an older compatibility floor.
- Define compatibility direction: import old files into new app is mandatory;
  new features in files cannot automatically work in old binaries. If backward export
  is required, specify supported target versions and explicit loss diagnostics.
- Decide dimensional/force accuracy expectations and CAD formats used in practice.
- Review license/provenance and preserve Hugo Wilson / Huggabiz credit before any
  redistributed rebuild; no top-level license was identified in this initial scan.

## 2026-11-16: G9/G10 Implementation Checkpoint

The earlier groundwork items above are historical preparation notes. G0-G7 have
accepted reports; G8/G9/G10 are verified code/browser checkpoints with named
external target qualifications still OPEN, not overall deployment certification.

- G9 checkpoint 43d440d: 898 domain tests and 20 cumulative combinations; see
  evidence/g9/acceptance.md. Final G10 adds cancellation/idle regressions.
- Final version 0.16.0-rebuild.2: 919 domain tests PASS, zero skips with originals;
  27 public tooling + 2 private archive checks PASS; type/lint/normal build PASS.
- Final pinned cumulative CxnIL6: 22/22 PASS, source f966a249 unchanged.
  Both originals' actual handle motion/reopen and all earlier gates remain passing.
- Real generated worker/offline/update/quota/two-tab/query-callback scenarios pass
  in Chrome 157.0.8103.51 and automated WebKit 27.2. Firefox 159 also passes the
  public production suite with an explicit native-picker automation boundary.
- Continuous ten-minute soaks: Chromium ouoswt 601028 ms / 550 samples and
  WebKit ssVS7p 600933 ms / 557 samples, real-SDK source c0b38990. Motion persists
  in every timed block, constraints remain bounded, traces cap at 6000 and the
  complete authored design restores. Wall and simulation clocks are distinct.
- Fresh public checkout H6Sirt: clean no-bypass install/peers/type/lint/build/audit,
  919 tests = 904 pass + 15 explicit missing-private skips, tooling PASS. Actual
  standalone public browser bootstrap FZKBtA PASS, no private runtime/worktree.
- Production audit zero; full audit retains four unpatched low dev findings with
  a specific static-consumer qualification. ESLint 10 removes the EOL lint stack.
- Independent bounded ownership/restart review found no actionable issue before
  the final one-line idle fast path; lead reviewed/tested that final change.
  Workers wrote disjoint ignored packages, then were closed. Usage/cost UNKNOWN;
  no unmeasured time or cost savings claimed.
- Original root full-index patch still hashes 184322a9; both user fixtures and
  original untracked tests match the archive. G8 tag remains at 1b6f723. Private
  geometry, traces and actual cloud credentials are not published.

See evidence/g10/acceptance.md, scrub-issues.md and release-readiness.md for exact
paths/full hashes and failures/retests. Earlier failed/aborted reports are not
promoted. The user now authorizes one disposable synthetic OneDrive QA file and
confirms registration control. The real app is open at port 5187, Projects ready;
exact client-ID/SPA callback confirmation and user-performed login are pending.
No original cloud file has been modified. Physical iPad/Home Screen/Pencil/
VoiceOver, actual SolidWorks, upstream redistribution terms and hosted CI remain
explicit external qualifications. No user QA/gate-unlock requirement is introduced.

## Live Microsoft Registration Blocker (2026-11-16)

The user confirmed the client ID and callback, then reported the actual sign-in
error AADSTS50011 for http://127.0.0.1:5187/LinkageStudio/redirect.html and client
a69f1ac8-5335-430c-a55f-808c85ced4fa. Source inspection confirms that the app derives
this callback from its current origin and base path. Registration confirmation is
not successful provider verification: live OneDrive qualification remains BLOCKED,
and no synthetic or existing cloud file has been changed in this run.

Microsoft's [redirect restrictions](https://learn.microsoft.com/en-us/entra/identity-platform/reply-url)
document case-sensitive paths and a portal-text-box limitation for HTTP 127.0.0.1
callbacks. Its [AADSTS50011 resolution](https://learn.microsoft.com/en-us/troubleshoot/entra/entra-id/app-integration/error-code-aadsts50011-redirect-uri-mismatch)
requires checking the application registration's saved redirects and allowing
three to five minutes after saving before retrying. Next: inspect only the saved
SPA redirect list for this client ID; reconcile registration and same-origin app
hosting without guessing, weakening OAuth checks, or requesting any secret.
### Registration Screenshot And Same-Origin Retry

2026-11-16: user-supplied Authentication screenshot shows the SPA callback
http://localhost:5173/LinkageStudio/redirect.html plus localhost and production
editor-root entries. It does not show a 127.0.0.1 callback. The previous launch
hostname was therefore inconsistent with the saved registration. Microsoft's
localhost exception ignores ports for redirect matching, but does not equate
localhost with 127.0.0.1. Reopened the unchanged candidate at
http://localhost:5187/LinkageStudio/ in a separate tab; callback HTTP 200 and
mounted version 0.16.0-rebuild.2 verified. Retried Connect Microsoft account.
Authentication and live OneDrive assertions remain pending. No Azure change,
cross-origin callback override, site-data clearing or original-project mutation.
Existing 127.0.0.1 recovery/cache storage remains untouched and separate.

Follow-up: actual authentication and disposable OneDrive create/duplicate refusal/
download/reopen/edit/save/rename/autosave/server stale-write refusal/delete all
observed through UI. Independent OneDrive web rename caused the stale revision;
remote contents survived the refused write, and cleanup absence was checked in
the provider web UI. Actual reopen first failed because projected metadata omitted
the download annotation. Standard full-metadata GET repairs it without weakening
identity, revision or bounded-download validation. Domain regressions now model
the omission; old 0810710 module fails the in-memory negative control, repaired
module passes. See evidence/g9/live-qualification.md for scope and limitations.

Supplied Azure skill was read in full and applied through
azure-integration-review.md; AGENTS now requires that review for future Azure work.
MSAL v5 bridge/lazy guest initialization and revision-owned IndexedDB are explicit
adaptations, not blindly replaced by older examples. CSP and token/network error
classification remain AZ-01/AZ-02 OPEN. Post-repair 923 domain tests/0 skips,
27 tooling tests, type/lint/normal build PASS. Original root full-index diff still
hashes 184322a9. Cumulative piCBR2 failed G4 tablet harness mount timing; screenshots
inspected, startup wait repaired, cumulative rerun ACTIVE. No partial run promoted.

Final post-repair acceptance: through-g10-yF897B PASS 22/22, zero failures, source
start=end 0d05fadc (full value and pinned artifact/harness hashes in
evidence/g9/live-qualification.md). G9 browser suites cvfMNk/mnCR2j each pass 21
scenarios. G4 body retests uJ41mb/dwbREg pass. The failed piCBR2 remains retained,
not promoted. Normal SDK build is observer/fake-auth free. Both original fixture
hashes rechecked unchanged; public G0 fixture map untouched. No push or deployment.

## UI16-05 Historical Motion Correction (2026-11-16)

User feedback reopened historical hold-menu appearance. Prior .3 functional tests
remain valid for their stated checks; its120ms fade/fixed112x32 pills/>6-body list
did not reproduce the old220ms/38ms fan. Settled animation-disabled screenshots
were inadequate evidence. Actual old/current native Chrome/WebKit RAF/video and
computed-paint comparisons now establish the restored contract; .3 and the
intermediate180-degree label-wrap implementation both fail independent negatives.
Both raw original files remain11/12-body desktop fans. The native Airer comparison
found an intermediate clamped stationary-release assignment; deliberate-movement
guards and full before/after mechanisms now pass. No solver/cloud/codec edits.

Version0.16.0-rebuild.4, real observer artifactg11-ewQKKJ, source
dada801687a33439b6fe1d463ac192e6b21dd39239612200fee68179639a1a4f.
Focused Chrome517UkY/WebKitSl1bpt (three layouts) and FirefoxpITEax (desktop) PASS;
960 domain/27 tooling, type/lint/normal build PASS. Native motion evidence under
ignored radial-motion; see evidence/ui16-motion/acceptance.md for full report/video
names, computed tolerances and intentional adaptive/retraction differences.

Final frozen cumulative through-g10-L2wRKj PASS24/24 on artifactg10-plpAuK/source
553d8fd08ab05df524e90174ed232a0d9c3880a42ebb5cc58bebbd8836c8270c (mock boundary).
Earlier D31ov2/tC0TjO invocations were deliberately cancelled for found corrections,
retained and not counted as final acceptance. Root protected tracked diff and
original fixture hashes match their pins. No worker/cost-saving claim. Physical
iPad and existing external Azure/licensing/target qualifications remain open.

Lead accepts UI16-05's scoped historical opening/paint and adaptive code/browser
contract. No final-run retries; measured native cumulative interval18m45.796s,
15:27:22.661-15:46:08.457 UTC. Both final G8 suites pass, and all48 real downloads
pass independent ezdxf/macro checks. Fresh temporary public checkoute98ZED passes
locked install/peers/type/lint/tooling/build/zero-advisory production audit;
945 unit PASS plus15 explicit private skips (workspace960 PASS, zero skips).
Raw-file red/green replay FvERiD versus pk3Zxy/vSkEDg explicitly rejects the
pre-guard stationary Body10 assignment and accepts unchanged final mechanisms.

## Mechanism Playground Example (2026-11-16)

Data/test/docs only on the unchanged0.16.0-rebuild.4 source hashdada8016. Delivered
three systems in one reproducible .slinker: spring-driven crank-slider, damped
carriage/end stop, torsion gripper; colored persistent outlines, four traces and
two model-load sensors. File SHA25605137c40f07dcdd5adec1550b5dfbda970c361f059ffd5fd0cb6ab21e26eb454.
Downloads delivery matches the public candidate example exactly; separate in-app
tab visibly opened, Fit and Simulate. Original workspace/tabs preserved.

962 domain tests/no skips and type/lint PASS. Ten-second invariant run measures
~119 output/~180 carriage/~86 each-jaw travel, real stop contact and fixed-anchor
preservation. Final native ChromeeneUyt/WebKitcbN9dM pass desktop/portrait/Split
View import, automatic motion, drag, all trace/load series, actual chart ink,
exact Create restore, real Save download/reopen/replay. Earlier missing-prompt-
handler test failures retained as harness failures, not app faults. Prior passing
EQLI3Y/gP4CZC runs omit the added visible chart assertion and are not misrepresented.
Example guide and evidence/examples/acceptance.md qualify narrow overview zoom,
mouse canvas-drag boundary, incomplete non-SI reactions and physical-device limits.
No application release/deployment, live cloud mutation or worker/cost-saving claim.

## First Rebuilt Pages Publication (2026-11-16)

User authorized new coauthor credits, removing the model tag, commit and Pages
publication; explicitly confirmed Hugo's permission and exact Azure SPA callback.
Published9b9d52f fromcodex/rebuild-cloud-pwa with no force ref updates; original
master/main9954fca, earlier public checkpoint1b6f723 and dirty workspace preserved.
Local962 domain/27 tooling/type/lint/normal build PASS. Hosted run43951095147 build
and deploy PASS, deployment7835707157 success20:36:22 UTC. Public hosted units947
PASS plus15 explicit private skips; local originals are included in962/zero skips.

Uninstrumented live https://mikanzui.github.io/LinkageStudio/: ChromedcB50Q and
WebKitYqRal4 PASS cold/warm worker/version/credit-links/no old tag, callback200,
public example match/native import/actual mechanism pixels moving/Create/Save.
No console errors or exposed observer/mock auth. Visible hosted in-app tab also
shows both author links and no model tag. Normal artifact plus public example only;
no private fixtures/traces published. Evidence/pages/acceptance.md owns outcome,
prior harness readiness failure, permission attestation and residual limits.

## Version 17 Projects Examples (2026-11-16)

Local scoped contract PASS, publication ACTIVE. Seven models including authorized
byte-identical supplied originals, new two-stage spring lift and standalone
playground details. Projects library has native search/radios/download, safe
dirty navigation, session/signature/abort ownership, offline precache and no auth
prerequisite.980 domain/no skips,27 tooling, type/lint/build/audit PASS.
Native Chrome bHEvxY / WebKit hjTNxp PASS48 model/protection result groups across
six desktop/portrait/512px profiles. Real brown-handle Airer motion,1DOF,
~41degree opening/~510spread; trusted Chromium touch on both narrow profiles.
Exact Create restore/native Save/reopen in all42 model/profile combinations.
Frozen cumulative through-g10-SX3NvG PASS24/24,23m08.746s, no source changes;
48 final CAD downloads independently parsed. Real-source hash e4d131434eb61a85da2de94e4c07e5595fe04ba5d5975520b173fe97e2db077b;
mocked source2695116642b26c1df97b84d327c0caafe4d318041cd60ffff06851adb5f59328.
See evidence/v17/acceptance.md for retained preliminary harness/source-freeze
failures, bounded worker/reviewer handoffs and physical/service/model limits.
No17 hosted success is inferred before the actual deployment/live checks.

Hosted first run43961565653 failed the portrait row minimum and skipped deploy;
release stayed DRAFT. Shared coarse radio specificity overrode catalog minimum76
to44px, masked by Windows content height. Narrow app-layout qualifier fixes only
catalog rows; new native assertion checks computed76px as well as text/height.
Final Chrome9kFFOv/WebKit0rBaQX PASS48 groups; no-observer normal preview
ChromeajmqUe/WebKitprm5ia PASS including512x440 search/commands and offline motion.
Chromeu8aX9Q search-Escape helper timeout retained; native query-clear behavior
is now asserted before modal Escape. Final full cumulativeKtdB1G PASS24/24,
21m15.356s (21:43:31.568-22:04:46.924 UTC), final980 domain/type/lint/build PASS,
48 new G8 CAD downloads independently parsed. Final real653412daff5926de89c8959c8e7571365f4a032f49dd673d8c35f97c1046e919;
mock7046718b4e69dbeec3fda39081de49baec5f418135b01996461223a6422f65f8.
Earlier identities above are first-candidate evidence, not final-source acceptance.
Hosted retry/live publication still pending; no success assumed from a push.
