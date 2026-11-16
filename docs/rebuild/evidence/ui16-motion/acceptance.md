# UI16-05 Native Fan Motion Evidence

2026-11-16. Lead-only correction on `codex/rebuild-cloud-pwa`, version
`0.16.0-rebuild.4`, starting commit `16bae05bfa6dd81f9ab95534d25c1b5644b6e6ea`.
Status: scoped historical opening/paint and adaptive code/browser contract PASS;
final frozen cumulative24/24 PASS, accepted by the lead. No publication/deployment. Physical iPad
qualification remains open. This report supersedes only the historical appearance
claim in [the .3 evidence](../ui16/acceptance.md), not its recorded functional tests.

## What Was Wrong

User feedback was correct. .3 used a 120ms opacity fade rather than the old moving
fan, larger fixed112x32 pills/radius100, 40-degree spacing, dots all on one side,
no ring/spokes, an invented center X and immediate disappearance. Its >6-body list
cutoff also changed both original projects: Airer has11 bodies and WorkingScreen12.
Animation-disabled settled screenshots could not establish motion parity. The
previous restoration description overstated what was verified.

Historical reference is the actual preserved fork `WorldContextMenu.tsx` and
`Layout.css`, introduced at `545051374fd176a74d3ce18f8fe6dfe99595dcf5`. The mounted
archived checkout identifies `9954fca5bdfe48154353458b8c908d7d9f7af451` plus preserved
patch SHA256 `184322a978b5017eb90a4b6fcf96ef94d510110fbf7c31162f9cdaa97fcbc95f`.
WorldContextMenu SHA256 is unchanged from the protected root:
`d43b8c384da6aa6029c43de1e02d00bd94f479a6190d5efc3723f96dc56a0cf8`.
Do not confuse this v16-era fork UI reference with pinned upstream v0.12.3.

Restored: 340ms hold/12px minimum startup jitter, 220ms translated/scaled expansion
(.7 to1), cubic-bezier(.4,0,.2,1), 38ms body stagger, compact56/74px radius,
32-degree nominal spacing/span cap250, native-font20px content-width pills,
10px inward dots, selected blue state, faint ring/spokes, add20/delete30 and no
extra center action. atan2 principal-angle normalization fixes a reversed label
at the180-degree wrap. Body hover toggles debounce/rearm on exit, as in the fork.
Hit testing follows actual animated DOM controls, not only final rectangles.

An intermediate .4 native Airer test caught another real defect: edge clamping
placed Body10 beneath the stationary cursor and release assigned the brown handle.
Origin/movement guards now require deliberate movement before body/add/delete
release activation. A37-case radial domain suite includes all three stationary
release controls. Both original raw files now retain identical full mechanism
data before/after stationary hold/release in the actual mounted app.

Commands still end immediately; only a frozen inert, disabled, aria-hidden snapshot
retracts for220ms and is removed at230ms. Historical CSS requested reverse closing,
but native Chrome's completed animation snaps opacity0 when direction changes.
The new fresh presentation actually reverses: this is an intentional improvement,
NOT a claim of pixel-identical historical closing frames. Escape/cancel is immediate.
Reduced motion skips both animations. Keep44px coarse targets, non-hold keyboard/
tap routes, bounded edge clamping, long-label radius adaptation and a list when
the orbit cannot fit or has >24 bodies. These are disclosed usability adaptations.
No solver, document codec, persistence or Azure implementation was replaced.

## Native Comparison Evidence

All directories below are ignored local artifacts under
`.rebuild.local/evidence/radial-motion/`, not private mechanisms committed publicly.
Each successful inspection contains `report.json`, native-speed `hold-menu.webm`
and opening/mid/settled/closing captures. No animation fast-forward/disable is used
for these temporal assertions. Final actual candidate artifact `g11-ewQKKJ` uses
real SDK boundary, source SHA256
`dada801687a33439b6fe1d463ac192e6b21dd39239612200fee68179639a1a4f`.

| Check | Historical / Negative | Final Candidate | Result |
| --- | --- | --- | --- |
| Chrome157 synthetic four-body native hold | reference-chromium-tW3TaB | candidate-chromium-OpxmQn | Full geometry/paint/rotation/motion comparison PASS; observed onset362.7 /362.3ms including event/RAF scheduling |
| WebKit27.2 synthetic four-body native hold | reference-webkit-BsW8L9 | candidate-webkit-vlENi5 | Full comparison PASS; native MS Shell Dlg, not forced Arial; observed onset381 /360ms |
| Airer raw bytes, confirmed brown handle | airer-reference-chromium-WhGOGr | airer-final-chromium-pk3Zxy |11-body fan; paint/rotation/timing comparison PASS with documented edge-clamp adaptation; full graph unchanged; onset358.6 /358.4ms |
| WorkingScreen raw bytes | screen-reference-chromium-dAq53x | screen-final-chromium-vSkEDg |12-body fan; paint/rotation/timing PASS with crowded-label radius/clamp adaptation; graph unchanged; onset351.1 /353.8ms |
| Rejected .3 actual rendered build | before-chromium-bmagRV | Comparator must reject | Full contract fails missing ring; motion-only independently fails120 !=220ms |
| Intermediate wrong-angle .4 | candidate-chromium-9EKFxH | Comparator must reject | FAIL historical readable label rotation; final atan2 correction passes |
| Intermediate clamped release | airer-candidate-chromium-lWNqhY | Raw-file before/after | FAIL unintended Body10 assignment; retained capture/video, not accepted |
| Replayed clamped-release negative | airer-negative-chromium-FvERiD | Frozen pre-guard g11-0vSXIz | Native inspector and comparator both FAIL; Body10 membership grows2 to3 on stationary release; report/FAILED-mechanism.json/video retained |

The replayed negative identifies source
`4fec2ddbdfe4eb5667da07be106b10c02b0b65e5fc5ff7851b5d311abca5f050`.
The final raw-file reports explicitly record `passed:true`; the replay records
`passed:false`, and the comparator refuses it before considering paint/motion.
Earlier final-source repeats GAzZEE/dpBLe3 also passed before/after invariants.

Strict desktop geometry tolerances are .06 CSS px Chrome/.25 WebKit for native
subpixel layout. Width tolerance .25 CSS px covers canvas/native button kerning
(actual long-name differences below .2px); height/paint/padding/direction and final
rotation remain strict. `--adaptive` skips only absolute dx/dy where the bounded
candidate intentionally shifts/expands the old partly clipped/overlapping fan.
It does not waive body count, paint, rotation, animation or graph invariants.
Multiple actual rendered matrices must differ during opening and new retraction;
CSS declarations alone cannot pass. Reference/candidate guides and control counts
must match; hidden fabricated center controls cannot pass.

Raw original SHA256 pins remain:

- Airer: `8e73fd936565d2c4df4d549bcc584c438c894f717da6e54ad328a8b3ffd5e0eb`.
- WorkingScreen: `4f1e389186a478e7e4cd7876914b072d20a964b1130718c1f62766c57dba4c07`.

## Integrated Verification

- `npm test`:960 PASS, no skips/failures; radial37 PASS.
- Tooling27 PASS; lint clean; TypeScript/normal production/PWA build PASS. Existing
  >500kB chunk warning remains. Normal `dist` contains no observer or fake-auth markers.
- Fresh external temporary checkout `g10/clean-checkout-e98ZED`: locked install
  without peer overrides, complete peer tree, typecheck/lint/tooling/build and
  production audit PASS (zero production advisories). Public unit run960 total:
  945 PASS,15 explicitly skipped private-fixture cases; the configured workspace
  run above includes all originals and has zero skips. This is not hosted CI.
- Final-source focused Chrome157 `ui16/chromium-517UkY` and WebKit27.2
  `ui16/webkit-Sl1bpt`: desktop1440x1000, portrait1024x1366/DPR2 and512px Split View
  all PASS. Chrome18/WebKit16 checks per profile. Trusted hold/sweep/release,
  undo/redo, re-entry, tracer single assignment revisit, actual translated/scaled
  frames and inert reverse frames, reduced motion, Escape/resize/late release,
  add/delete, context/keyboard/focus/tap, four edges,12-body fan and large list,
  native checkbox/range keyboard values and save persistence. Chrome additionally
  trusted pen/palm and native forced-colors. No page errors.
- Firefox159 desktop `ui16/firefox-pITEax`:16 checks PASS, including native temporal
  frames. Existing Windows headless file-input click suppression is disclosed:
  actual FileReader/import remains tested, native Firefox chooser is NOT qualified.
- All three focused reports have start=end final real-boundary source hash above.
- Frozen full cumulative `through-g10-L2wRKj`, artifact `g10-plpAuK`, source SHA256
  `553d8fd08ab05df524e90174ed232a0d9c3880a42ebb5cc58bebbd8836c8270c`
  (mock cloud transport,133 files): PASS24/24, source start=end, all12 scripts in
  both engines exactly once, zero final-run retries. Measured suite interval
  15:27:22.661-15:46:08.457 UTC,18m45.796s, not total development time.
  G9 kOOQuI/zLElfT each pass21 scenarios. Both raw original/reopened mechanism
  opening workflows pass in G3 WcVv1Y/sBNe2u. G8 i5vPJl/yXddHt each pass54
  scenarios; independent ezdxf1.4.5/macro-call checks pass all24 actual downloads
  per engine (48 total). This turn does not rerun CAD GUI or SolidWorks.
  Real SDK and mock fingerprints differ by their declared dependency boundary;
  they are not falsely presented as identical bundles.
- Two preliminary full invocations were deliberately cancelled during investigation:
  `through-g10-D31ov2` after6 passes for the angle correction, `through-g10-tC0TjO`
  after18 passes for actual-file fan-count correction. They are retained, not
  promoted as final source acceptance or silently combined with final results.
- The initial inspector invocation against normal dev (no observer) timed out at
  setup, not application behavior; corrected to a separately identified observer
  build. This is retained as a harness/setup failure, not hidden as a product pass.
- User-facing dev restarted at `http://localhost:5187/LinkageStudio/`, actual
  version .4 observed in a new in-app tab with the original Airer and keyboard
  fan. Existing tabs/storage/originals remain intact. This UI view is not the
  native animated evidence; the independent recordings above establish that.

## Reproduction And Limits

Use `inspect-radial-reference.mjs ENGINE KIND URL [FILE] [HANDLE_ID]` for actual
native-speed capture, then `compare-radial-captures.mjs REFERENCE CANDIDATE`.
`--motion-only` isolates the negative fade control; `--adaptive` has only the
documented position exception. The enhanced `verify-ui16-browser.mjs` is included
in cumulative G1-G10 runs. Local fixture paths/IDs are caller inputs, not baked
private source coordinates. Read-only mounted observers do not import a second store.

Physical latest iPad/Safari/Home Screen/Pencil/VoiceOver is unverified. Automated
WebKit, touch/viewport and cancellation code regressions establish their stated
coverage, not device certification. The existing fast-flick/pointer-velocity
qualification remains; finite tests do not prove every opening-time trajectory.
Azure AZ-01/AZ-02, broader live-account/production callback, hosted CI, SolidWorks
and upstream redistribution qualifications remain unchanged. No live cloud
mutation was needed for this UI correction. No deployment/push/tag authorized.
No workers spawned for the tightly coupled correction; usage and total wall time
not measured, so no multi-agent cost/speed saving is claimed.

See [comparison](../../visual-usability-comparison.md#ui16-05-historical-fan-correction)
and [gate contract](../../validation-gates.md#ui16-05-native-motion-gate).

Executed root harness SHA256 pins (helper mirrors are committed in the candidate):

- Native inspector: `02c717a3fce3379bbedb466588cd47150ec76f6d3c36dedc776a891486d4ac7b`.
- Comparison: `f27faf253c4c8736ceddaed19334c4dd5739ad68a4a060e9a085873c9f389680`.
- UI16 regression: `de5410ba846f525f9d25450072bec35106f9af9e2a02b1cfcaf499069d7db9db`;
  candidate mirror `cfa7704ebe78e47e32760a8e9e1e5dd4a6a7807b6b357bdd48264d45148c1cfc`
  differs only by one trailing blank line, verified with whitespace-aware diff.
