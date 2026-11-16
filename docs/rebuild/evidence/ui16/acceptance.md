# UI-16 Reintegration Evidence

2026-11-16. Candidate `codex/rebuild-cloud-pwa`, version `0.16.0-rebuild.3`,
starting commit `b29ad7c1fced3b144ffd6eafb4c95ce24d881934` plus UI-16 patch.
Status: PASS for scoped code/browser contract; 24 regression suite/engine results
qualified on one unchanged artifact. Bounded review DONE/CLOSED. Physical and
external qualifications remain OPEN. This is not an uninterrupted-run PASS claim.
Scope: C02/C03/C04/C07/C08/C10/C11/C12/C13, G4/G5/G8 regression obligations.
No deployment.

## Comparison And Implementation

Source reference: fork `545051374fd176a74d3ce18f8fe6dfe99595dcf5`, preserved root
WorldContextMenu.tsx and Layout.css. Historical upgraded radial pills, body dots,
selected blue state, plus/trash and inset checkbox/pale range styling are restored
through rebuilt commands/native inputs, not by transplanting the old stores or
global pointer listeners. See the [visual/usability comparison](../../visual-usability-comparison.md#ui-16-reintegration-comparison).

Intentional safeguards: one-gesture undo, release-only add/delete, no new touch
long-press delay, keyboard/right-click/tap route, exact bounded rotated layout,
many-body list, visible focus/native forced-color fallback and 44px coarse targets.
Measured Design DOF badge prevents coordinate text overlap.

## Integrated Verification

- Domain: `npm test`, 950 PASS, zero skipped; includes 27 radial command/layout/HUD
  cases and mandatory original legacy fixtures.
- Tooling: `npm run test:tooling`, 27 PASS. `npm run lint` clean;
  `npm run build` passes TypeScript/production/PWA. Existing >500kB chunk advisory
  remains a build warning, not a functional pass criterion.
- Final real-SDK observer artifact `g11-cvRuPp`, source SHA256
  `3520872004ae637cd75d62ccea34ce7d3d210d53bf50030744c5516885fcb439`.
- Focused WebKit27.2 `ui16/webkit-LYvPTX`: desktop, portrait and 512px Split View
  PASS after recovery race repair, 12 assertions per profile. Firefox159
  `ui16/firefox-bN1A9e`: final-source desktop PASS.
  Firefox native file-input click is suppressed only to avoid a reproduced Windows
  headless chooser cancellation; file input/FileReader/import and all other input
  routes remain real. Do not claim native Firefox chooser qualification.
- Chrome157 `ui16/chromium-ozq62c`: three-profile final-source PASS, 14 assertions each,
  including trusted pen/palm, native forced-colors and both review regressions.
  Final focused reports match the final real-SDK source hash above.
  Screenshots disable finite animations only to capture settled paint rather than
  an arbitrary translucent frame. Screenshot paths reviewed: desktop-radial-hold.png,
  split-controls.png and split-many-bodies.png in these final focused directories.
- Frozen cumulative artifact `g10-uDD20r`, mocked cloud transport,
  source SHA256
  `c5abc6c88114af926d08db30178e13f97af9cffcfdbaee59e419880c9cc5acd7`:
  `through-g10-AwCAbE` has 22 passing suites, then stopped on a G9 harness timing
  assertion. G9 is retried separately after a test-only repair on this exact
  unchanged artifact. Do not describe the failed single invocation as PASS.
- Final G9 `webkit-browser-Ra8ZQI` and `chromium-browser-FV5vz5`: 21/21 scenarios
  each PASS after the harness-only readiness repair. Their start/end source hashes
  match the prior 22 passing suites and frozen artifact. Lead checked all twelve
  scripts in both engines occur exactly once across the qualifying results: 24/24
  PASS for individual suite coverage. Ignored aggregate manifest:
  `ui16/final-regression-coverage.json`. The original failed cumulative report is
  retained unchanged; there was no application edit between these passing suites.
- Final G8 `webkit-browser-pAiQql` and `chromium-browser-NcuLVV`: 54/54 scenarios
  each PASS with stable final source, including busy-list safety and native corrupt
  draft selection. The independent ezdxf1.4.5/macro-call reader passes all 24 actual
  downloaded CAD files per engine (48 total). This does not requalify a CAD GUI or
  SolidWorks execution, and does not imply physical Files picker qualification.
- Normal user-facing localhost5187 editor visibly shows `.3`, labeled radial
  actions, inset indicators and pale slider thumbs after fresh tab load. The
  older already-loaded tab was stale; no source or user document was replaced.

Ignored raw evidence root: `.rebuild.local/evidence/`. Source start/end hashes
must match; reports are read-only mounted-app observation with actual UI events,
not direct test-store mutation as proof of a gesture.

Preservation checks PASS: original tracked full-index/binary patch SHA256 remains
`184322a978b5017eb90a4b6fcf96ef94d510110fbf7c31162f9cdaa97fcbc95f`;
Airer SHA256 remains `8e73fd936565d2c4df4d549bcc584c438c894f717da6e54ad328a8b3ffd5e0eb`;
WorkingScreen SHA256 remains `4f1e389186a478e7e4cd7876914b072d20a964b1130718c1f62766c57dba4c07`.

Final source and staged diffs pass whitespace checks; changed-document links pass
with the pre-existing ignored private baseline archive explicitly qualified as
outside the public candidate. Local checkpoint only; no tag, push or deployment.

## Retained Failures And Corrections

- Stale-artifact guard intentionally refused mismatched source/build identities;
  rebuilt preview before accepting results.
- Zero-size orbit wrapper made group visibility probes fail despite rendered
  buttons; wrapper now has stable 1px dimensions without affecting hit geometry.
- Escape originally bubbled into canvas selection clearing; capture-phase menu
  handling now closes/rolls back while retaining selection and correct focus.
- Native focus checks now use actual Shift+Tab/Tab keyboard entry, not programmatic
  focus after a mouse click. Firefox correctly distinguishes those modalities.
- Saved-control assertion reads canonical nested simulationSettings, not retained
  unknown legacy top-level metadata. No codec change was required.
- Narrow expanded panel covered a synthetic test point; harness collapses it before
  the next canvas action. Panel overlay behavior remains the established contract.
- Independent review found context picking omitted tracers/images/colliders/
  springs/sensors, allowing the prior selection to receive Delete. Context picking
  now checks all supported visible object types before background selection fallback;
  domain checks and real right-click tracer/delete/undo assert the intended target.
- Review also found single-body tracer assignment reused toggle debouncing, so
  revisiting a body retained the previous hover assignment. Single assignment now
  follows the latest hover and final release; only joint/collider toggles debounce.
  The new domain test demonstrably failed before repair (`body2 !== body1`), then
  passes; actual browser Body1 -> Body2 -> Body1 release is also asserted.
- Cumulative `through-g10-rZd49B` was deliberately cancelled after 16 passing runs
  to integrate those review findings; it is NOT a final acceptance run. Later test
  expansions corrected semantic locator roles (pressed Select button, not native
  checkbox) and removed an unnecessary Pivot click hidden in collapsed tablet tools.
  Failed/aborted evidence remains retained; final runs are explicitly named above.
- Cumulative `through-g10-jsmw50` stopped at G8 WebKit: 20 suites passed but the
  desktop invalid-JSON recovery selection did not land. Trace `sosh@1965` shows
  pointer-down on INPUT, pointer-up on LABEL and click on DIV: a pending flush
  inserted the current draft and recentered the native dialog mid-click. This is
  a real UI readiness race, not waived as timing noise. Recovery now hides rows
  behind explicit aria-busy until initial flush/list/read completes, with close
  cancellation retaining modal/selection ownership. G8 checks busy-list safety
  and waits for that public readiness state before its actual native row click.
  Targeted corrupt-draft selection/opaque download/restore refusal/discard checks
  passed six times in fresh WebKit contexts after repair (`F1QINQ`, `Otu6jQ`,
  `gb9J3d`, `x3lfrX`, `qAvKqm`, `gERFpf` under g8/webkit-browser-*); filtered
  reports have selectedChecksPassed true but are partial, not full gate PASS.
- Cumulative `through-g10-AwCAbE` reached G9 with all prior 22 suites PASS. In its
  desktop auth-failure case, the harness focused the last enabled control while
  auth was busy (Close), then pressed Tab after authentication completed and
  enabled Account/File name. Account correctly received focus inside the dialog,
  but the test incorrectly still expected Close as the first/only enabled item.
  Trace `vgue@154`-`vgue@158` and FAILED.png retain that evidence. The test now waits
  for settled unavailable/idle state before its static endpoint assertion; stalled
  auth cancellation remains separately tested. No application/auth source changed.

## Ownership And Limits

Lead owns commands, shared gestures, integration, cumulative tests and acceptance.
Pasteur implemented only ControlTheme.css and is CLOSED. Linnaeus completed the
bounded read-only command/history/cancellation review and is CLOSED. Both concrete
findings were reproduced and repaired by the lead before final acceptance. Actual
agent time/model usage unavailable; no cost-saving claim.

Physical iPad/Safari/Home Screen/Pencil/VoiceOver remain UNVERIFIED. WebKit and
touch/DPR/viewport/code regressions do not establish physical-device qualification.
Existing Azure CSP/error classification, broader live provider/account cases,
SolidWorks and redistribution qualifications remain open. No Azure integration
source was changed by this frontend task. No push/deployment authorized.
