# G8 Versioned Checkpoint

2026-11-16. Codex accepts the **code/browser/local-recovery/DXF checkpoint**.
Full target qualification remains OPEN for SolidWorks; it is not marked passed.
Per the user's latest instruction, stop here before G9 and publish the versioned
source checkpoint on `codex/rebuild-v0.16.0`, not master or a deployment.

Version: **0.16.0-rebuild.1**. Tag identifies the final commit.
Immutable test artifact: `.rebuild.local/gate-builds/g8-pkwfMc`.
Runtime source including the read-only observer:
`3ebb098f2f34ce67e737d36a5cd66091bd0c3b29865533dc3fe60d8a85c1ed09`.
Built and verified before commit from identical runtime source.

## Results

- 663 domain tests pass with REQUIRE_LEGACY_FIXTURES=1; zero skips.
- TypeScript, ESLint, normal production build and diff whitespace pass.
- Production dependency audit: zero vulnerabilities. Development findings remain
  documented G10 work, alongside the Vite/PWA peer mismatch.
- Eighteen of eighteen cumulative suite/engine runs pass with unchanged source:
  `.rebuild.local/evidence/cumulative/through-g8-Peh1SI/report.json`.
- G8 alone has 54 scenarios per engine, desktop/tablet/Split View, all pass.
- Both engines' actual CAD downloads independently checked: 48 total files,
  ezdxf 1.4.5 plus a separate SolidWorks numeric-call reader; not app writer output
  compared with itself. DXF dimensions/radii/layers/open paths verified in four units.
- Actual LibreCAD mm-file import/render and native rod-coordinate/length check
  completed. See [GUI record](cad-gui-check.md) for exact values and limits.

| Suite | Chromium evidence | WebKit evidence |
| --- | --- | --- |
| G1 editing/local files/four layouts | g1/browser-KNX9Y1 | g1/browser-L5dMiS |
| G2 lifecycle/atomic rejection | g2/chromium-2KiaAp | g2/webkit-hLydAo |
| G3 original/reopened real-file motion | g3/chromium-workflow-RRXssW | g3/webkit-workflow-suhN7Z |
| G4 input/selection/layout | g4/chromium-input-mFOzgV | g4/webkit-input-JNWfZG |
| G4 bodies | g4/bodies-DoDraa | g4/bodies-DXjPAf |
| G5 geometry/images | g5/chromium-browser-W9arlM | g5/webkit-browser-4XrzZO |
| G6 springs/attachments | g6/chromium-browser-L9ZIpr | g6/webkit-browser-lWmgc0 |
| G7 tracers/sensors/qualified loads | g7/chromium-browser-S3aUV6 | g7/webkit-browser-l20Mno |
| G8 files/recovery/export | g8/chromium-browser-7HTGio | g8/webkit-browser-BpAD3O |

Evidence paths are under the private `.rebuild.local/evidence` directory. Raw
mechanisms, traces, screenshots and local tools are deliberately not uploaded.
The code, harnesses, contracts, failure history and human-readable results are
published; private-workspace requirements are explicit in ../../testing.md.

## Delivered And Compared

Source-preserving bounded validation, stable selectable identity, explicit optional
fields and atomic malformed/future-model refusal. Per-document transactional
IndexedDB recovery with monotonic revision ownership, coalesced capture, quota/
denied/corrupt failures, actual design pose in simulation and deferred active
gestures. Recovery does not pretend to be a file/cloud save. Restored copies remain
dirty. Late saves cannot rename or mark a newly imported document saved.

Native Save-first/Discard/Cancel, recovery and CAD dialogs replace the upstream's
discard-only and immediate-DXF paths. Unit/format fields and omission counts make
export meaning explicit. Focus wrapping/return, 44px coarse targets, stable feedback
height, narrow reachability, keyboard isolation and Safari blob lifetime are checked.
The same source retains all G1-G7 input and motion contracts, including the user's
confirmed Airer brown-handle workflow. C02/C10/C11/C12 comparison updated.

## Negatives And Portability

Retained failed runs caught focus escape, inaccessible select labels, wrong recovery
selection after async refresh, invalid-date page crashes and a held test that was
only a preview. Each was corrected and retested, not relabeled passed. Earlier
source-changing or interrupted cumulative runs are not accepted; see
[integration history](integration-notes.md).

Published domain tests no longer require private baseline paths. Fifteen named
real-file cases explicitly skip when fixtures are absent; the remaining 648 pass.
Required-evidence mode fails if fixtures are absent/tampered; CAD parser failures
never skip. Reviewed worker package and actual integrated checkout reruns confirm
663/0 skips with originals and 648/15 skips without them. This is not a claim that
the audit-workspace browser harness has a standalone bootstrap; that remains G10.

## Open Qualification

SolidWorks execution, physical iPad/Pencil/VoiceOver/Home Screen, real OS Files
picker cancellation and durable native filesystem writes remain unverified.
Browser-boundary mocks are distinguished from those physical outcomes. R12 import
units must explicitly match; palette colors are approximations. Force output stays
within the declared model-load contract, not SI certification.

G9 cloud and G10 production/offline/update/soak/final whole-app scrub remain future
work. This prerelease checkpoint neither closes those stages nor replaces the
original master workspace. Original tracked patch and fixture hashes remain intact.
