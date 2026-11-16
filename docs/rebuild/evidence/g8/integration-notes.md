# G8 Integration Notes

2026-11-16. G8 code/browser/DXF checkpoint verified; external target limits OPEN.
Stopping at version 0.16.0-rebuild.1 before G9. Historical attempts retained below;
final accepted evidence is acceptance.md. Comparisons C02/C10/C11/C12.

## Domain And UI Integration

- Bounded iterative codec traversal rejects oversized/deep/nonfinite/colliding
  data atomically. Body IDs deliberately have a separate namespace from selectable
  entity IDs. Legacy zero-rest links and unresolved optional barriers are retained.
  Twenty new hardening tests pass; pinned pre-G8 negative run fails 14/20 as expected.
- Empty names and omitted image visibility survive file construction correctly.
- IndexedDB uses separate metadata/text stores, atomic commit acknowledgment,
  monotonic revisions, blocked/open timeout and explicit quota/schema errors.
  All 43 storage and 13 coordinator tests pass. No automatic record eviction.
- Recovery is per-document, not a saved-file acknowledgment. Snapshot generation
  and session ownership prevent stale completion from changing current status.
  Simulation uses the authored design. Active cancellable canvas interactions
  defer capture. Visibility/pagehide flushing is best effort, not a crash guarantee.
- Native recovery dialog offers explicit restore-copy/download/discard. Invalid or
  future draft text remains downloadable; restore must pass the canonical codec.
  A restored copy remains dirty until a confirmed write.
- Local saves capture a document and baseline before awaiting the writer. Imported
  projects are immune to old completion; newer edits/renames remain dirty. All 31
  independent delayed-writer tests pass. Download initiation is not confirmed storage.
- Open/Clear now offer Save first/Discard/Cancel. A confirmed Save first enables
  a separate fresh Open action so Safari's file chooser retains user activation.
  Picker cancellation, invalid input and changed-document completion preserve state.
- Native CAD dialog uses explicit format and unit selects, geometry/omission
  counts, and unit-bearing filenames. R12 DXF does not promise insertion units;
  SolidWorks macro target execution remains unqualified. Scene/writers have 37
  tests including independent ezdxf audit in four units and deliberate wrong-scale
  and reclosed-path negative controls. Unknown metadata does not gain visibility
  semantics; shorthand hex colors are correctly expanded.
- Document dialogs own keyboard input; canvas shortcuts cannot run through them.
  File/recovery/export boundaries cancel current canvas gestures before capture.
  The feedback row has stable height so asynchronous messages cannot resize the
  canvas mid-gesture. Blob download lifetime permits deferred Safari consumption.

## Dependencies And Outstanding Qualification

fake-indexeddb 6.2.8 is development-only for real transaction semantics in tests.
Direct nanoid patched from 5.1.7 to 5.1.16 after primary advisory review:
[GHSA-28wg-ghj8-5hjv](https://github.com/advisories/GHSA-28wg-ghj8-5hjv),
[GHSA-xwg4-73v4-xw9w](https://github.com/advisories/GHSA-xwg4-73v4-xw9w).
The app uses fixed-size secure IDs; no app exploit is asserted. Production audit
now reports zero vulnerabilities. Full development audit still has 30 findings;
resolve or qualify at G10. No broad audit --force used.

Inherited Vite 8.0.1 / vite-plugin-pwa 1.2.0 peer conflict required
--legacy-peer-deps for these scoped installs. A clean reproducible install and
compatible production/PWA toolchain remain mandatory G10 work, not silently waived.

First integrated artifact g8-wEW6M7 has 663 passing domain tests/type/lint/build.
Focused Chrome desktop complete-file download/reopen passes after correcting the
test fixture's invalid torsion and normalizing only known generated hidden braces
out of authored persistence comparisons. No production assertion was weakened.
Evidence: g8/chromium-browser-C3PsMH. The initial fixture/normalization failure
g8/chromium-browser-zIrE1o remains archived. Four focused Chrome/WebKit mouse/touch
dialog-adaptation runs also pass (worker handoff records exact limits).
Full browser/tablet/cumulative checks and actual CAD import remain pending.

## Browser Negatives And Repairs

The full g8-wEW6M7 run failed in through-g8-QV0AxL. Native dialog Tab could
reach the browser boundary; explicit endpoint wrapping was added. The held-test
rectangle was only an editor preview, not an authored mutation: the assertion was
retained and the gesture changed to a real Select-tool handle drag. Its focused
desktop retest passes (chromium-browser-qXyzlp). Export selects gained explicit
accessible names; focused export passes in chromium-browser-lroVvC, with eight
downloaded files independently checked by ezdxf and a separate numeric macro reader.

g8-b0Etqo passed all 51 Chrome cases (chromium-browser-BHUdhP), but WebKit caught
eight failures (webkit-browser-NObmse) in through-g8-E9txK7: recovery refresh could
select the newest draft after the user chose a different row, and Export Escape
did not restore trigger focus. Background refresh now carries the selection token
from dialog opening and cannot replace an intervening selection. All dialog
triggers explicitly own focus before opening/after close. Native Tab wrapping and
keyboard shortcut isolation remain checked. No failures have been relabeled passes.

Actual Split View screenshots also exposed the global margin reset overriding
native dialog centering; the dialog now specifies margin:auto. Export omission
labels have proper singular/plural human-facing names instead of raw object keys.
Final current test build is g8-ghGWm9, source
`243ac0838aede3791ed5639b04be51376698f67ea1cb2f317b9af8c35ab9bdba`.
Full cumulative retest runs WebKit first to expose the previously failing engine
before spending time on the remaining suites. It still requires every planned run.

The added native-storage timestamp edge case reproduced an actual WebKit page
crash (`Invalid Date`, webkit-browser-VVWchA): a finite IndexedDB timestamp can be
outside Date's representable range. Recovery rows now show Unknown date and retain
download/restore access rather than calling toISOString on an invalid Date.
The prior cumulative through-g8-dawFtv completed functional assertions but was
invalidated by this source change (G7 final Chrome stableSource=false); it is NOT
accepted. Fresh cumulative build g8-Xf5tUy, source
`a08fdd8a6d8c69f841ea6011f7ae64860874b8577df3d471f67c8c8040e42fa9`,
includes 54 G8 scenarios per engine and the corrected G4 evidence output path.

The user approved launching the isolated portable LibreCAD copy. It has launched;
actual file import/dimensions still in progress. This is not a SolidWorks substitute.
Portable LibreCAD was prepared without running its installer; action-time launch
permission requested separately. SolidWorks was not found in the scoped inventory.
Physical iPad qualification remains unverified, not a development gate unlock.

## Final Versioned Run

User requested a natural stop and versioned GitHub commit. Version bumped to
0.16.0-rebuild.1 on codex/rebuild-v0.16.0. Final artifact g8-pkwfMc, source
`3ebb098f2f34ce67e737d36a5cd66091bd0c3b29865533dc3fe60d8a85c1ed09`.
through-g8-Peh1SI passes all eighteen runs with unchanged source; G8 is now 54
scenarios per engine, including the previously crashing timestamp case. Domain
663/no skips, type/lint/normal build and production audit pass. Actual LibreCAD
mm import/render/native rod properties pass; see cad-gui-check.md. Macro target,
physical-device and G9/G10 qualifications are not claimed.

Mill's bounded portable-test package was reviewed/integrated. Six test files now
share a hash-checked private fixture helper; generic cases use authored synthetic
data. Every original real-fixture assertion remains locally exercised. Integrated
missing-fixture rerun gives 648 pass/15 explicit skips; required missing/tampered
and CAD dependency/version negatives are retained in the private handoff. No
private mechanisms or raw browser data will be uploaded. Standalone browser
bootstrap and a fresh external/POSIX installation remain unverified G10 work.
