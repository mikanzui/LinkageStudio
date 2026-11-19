# Feature And Patch Backlog

Owner: Codex (implementation and verification), Jake (product direction).
Updated 2026-11-19 for 17.1.0. This consolidates the rebuild audit, remaining
qualifications and user requests. It is not a promise that every proposed idea
will ship. Historical gate results remain in their original reports.

## Status And Priority

Active17.1.0 delivery: directly visible selection tools, standard lasso,
intersection-based Power/closest trim and open-line extension; see
[v17.1-plan.md](v17.1-plan.md). Full CAD trim mode parity and tutorial lessons
remain future scope, not claims of implemented features.

- PATCH: an identified gap, not necessarily an observed user-visible failure.
- QUALIFY: implemented behavior needing additional target/service evidence.
- FEATURE: new functionality; scope and tests must be agreed before implementation.
- INVESTIGATE: a question, not a confirmed bug.
- P0: safety/security/data integrity. P1: next dependable usability release.
  P2: subsequent workflow improvements. P3: research, subject to product review.

Each implementation needs a bounded change, a frozen-source evidence bundle,
visual comparison where applicable, and cumulative regression before promotion.
Codex accepts gates; the user is not the routine test runner. Physical-device
absence is an explicit qualification limit, not a reason to stop code/browser work.

## P0: Hardening And Data Safety

| ID | Type | Work And Acceptance | Dependencies / Gate |
| --- | --- | --- | --- |
| AZ-01 | PATCH | Add a deployment-appropriate CSP. Prove blocked third-party destinations and successful real Microsoft popup, renewal, approved preauthenticated download hosts, images and PWA. No copied policy that breaks cloud reopen. Header-only requirements cannot be met by a meta tag. | Supplied Azure skill; [review](azure-integration-review.md); G9/G10, C01/C11/C12 |
| AZ-02 | PATCH | Preserve sanitized network/token error categories. Offline renewal must not masquerade as required consent or open a background popup. Test transport/auth boundary and mounted autosave/retry UI. | G9, account-bound silent acquisition unchanged |
| DATA-01 | QUALIFY | Extend live OneDrive tests to expiry, account switch, personal account, quota, reconnect/conflict and ambiguous upload outcomes. Only disposable QA files; no original cloud-file mutation. Existing bounded work-account create/open/rename/delete passed. | [Live report](evidence/g9/live-qualification.md), G9 |
| DATA-02 | QUALIFY | Exercise hosted production sign-in against the registered redirect.html and actual browser session. Registration is user-confirmed, not a successful hosted sign-in. Retain local editing during all failures. | Microsoft interactive sign-in; no credential automation; G9/G10 |
| DATA-03 | FEATURE | User-readable recovery management/export of pending local revisions before clearing a cache or resolving conflicts. Explicit deletion and clear ownership; no automatic overwrite or claim that a download is a confirmed disk save. | Existing recovery/cache contracts, G1/G8/G9 |
| COMPAT-01 | PATCH | Run both exact, now-public supplied originals in clean hosted CI with zero silent skips. Keep their byte hashes pinned and test full brown-handle Airer opening, Working Screen motion and saved reopen. | Delivered CI configuration in 17; retained per-release G1/G3 |
| UPDATE-01 | QUALIFY | Extend browser suspend/resume and interrupted update checks with long-lived dirty documents and cached examples. Never replace a dirty tab or clear user storage to force an update. | Existing two-tab worker tests; G10 |

## P1: Learnability, Input And Target Qualification

| ID | Type | Work And Acceptance | Dependencies / Gate |
| --- | --- | --- | --- |
| LEARN-01 | FEATURE | A tutorial guide accessible from the editor, plus a printable/repository guide. Lessons: first four-bar; fixed versus moving joints; bodies and sliders; Simulate/pull/restore; save/recovery; springs/damping; tracing/load limitations. Each lesson has a runnable example, expected result and automated checkpoint. Never replace the usable first screen with a landing page. | Tutorial outline below; C02/C03/C05/C08/C10/C12; G4/G7/G8 |
| LEARN-02 | FEATURE | Contextual reference for mouse, touch and keyboard alternatives, including hold-to-fan, stationary release, cancel, body assignment and two-finger navigation. Keep ordinary controls concise; dedicated help is separate from permanent instructional clutter. | Historical UI16 contract, touch cancellation, C03/C04/C08/C10 |
| IPAD-01 | QUALIFY | Latest iPad hardware/current iPadOS: Safari and Home Screen, portrait/landscape/Split View, Files open/save, Pencil plus palm rejection, keyboard and VoiceOver. Repeat handle opening and cancel/recovery while interrupted/backgrounded. Record exact hardware/OS, not "latest" alone. | Code/WebKit/touch coverage continues; physical evidence currently unavailable; G4/G10 |
| UI-01 | QUALIFY | Usability pass on long names, dense body fans, 512px Split View, virtual keyboard, zoom/fit and modal scrolling. Preserve 44px coarse commands, readable labels, focus containment and native controls; compare actual animated fan with historical reference. | [Comparison](visual-usability-comparison.md), UI16-05; G4 |
| A11Y-01 | QUALIFY | Keyboard-only full lesson, focus/selection announcements, forced colors/reduced motion and actual VoiceOver. Canvas alternatives must expose object identity/actions without relying on color alone. | G4/G7; native assistive technology remains unverified |
| QA-01 | PATCH | Keep reproducible all-model gallery import/motion/Create restore/native save-reopen checks and stale-fetch/unsaved navigation negatives in CI. Offline cold reopen must use precached source bytes, not an earlier opportunistic browser download. | Delivered gallery harness in 17; G1/G3/G8/G10 |
| QA-02 | FEATURE | Portable per-release evidence index and one-command release qualification. Separate public assets from ignored runtime snapshots, expose exact source/artifact identities and retain failed controls. | Existing fingerprint/gate tools, lead-owned acceptance |

## P2: Workflow And Engineering Clarity

| ID | Type | Work And Acceptance | Dependencies / Gate |
| --- | --- | --- | --- |
| EX-01 | FEATURE | Example previews, tag filters and per-model notes/lesson links. Preview must represent actual source geometry; no misleading decorative thumbnail. Existing 17 catalog/search/download/offline models are already delivered, not future work. | Projects > Examples, native desktop/tablet screenshots, C02/C08 |
| EX-02 | FEATURE | Personal examples/favorites and explicit private/shared imports. Built-in sources stay read-only; editing always creates a project copy. No silent upload or sharing of personal mechanisms. | Document identity/cache ownership, G1/G9 |
| LOAD-01 | FEATURE | Define calibrated physical units and mass/inertia assumptions before engineering force claims. Add analytical reference cases, numerical tolerances and a migration strategy. Existing readings remain legacy/model units. | G6/G7; physics/product decision required |
| LOAD-02 | FEATURE | Complete slider/contact reactions and associated sensor interpretation. Show unsupported/indeterminate states honestly; prove equilibrium, equal/opposite reactions and constrained examples before removing incomplete-analysis notices. | LOAD-01 or explicitly bounded model-unit contract; G3/G7 |
| DOF-01 | INVESTIGATE | Compare displayed mobility with independent rank/analytical results on compound and redundant systems, including the playground. A suspected badge discrepancy is not a confirmed solver failure. Preserve known Airer 1-DOF motion regression. | G2/G3; numerical singularity/tolerance study |
| DRIVE-01 | FEATURE | Consider explicit speed/angle-driven inputs with limits and failure feedback. A spring-driven oscillator is not a continuous motor; do not imply existing internal driver fields provide a tested motor workflow. | Physics contract first, G2/G6/G7 |
| CAD-01 | QUALIFY | Real SolidWorks target execution and dimensions/material/outline orientation review. LibreCAD mm smoke and independent four-unit DXF/macro checks already passed; they do not prove SolidWorks execution. | Target app access, G8 |
| EDIT-01 | FEATURE | Evaluate ergonomic multi-object operations, object-list search, bulk visibility/locking and explicit reusable subassemblies. Every operation must preserve references, undo as a coherent action and retain local/world transforms. | G1/G4/G5; product priorities first |
| PERF-01 | INVESTIGATE | Benchmark large supplied/constructed projects for parse, fit, frame time, chart history and save size on desktop and constrained tablet profiles. Optimize measured bottlenecks only; consider background parsing after ownership/cancellation is specified. | G1/G7/G8/G10; record datasets and limits |
| FILE-01 | FEATURE | Document supported schema versions, unknown-field retention and future-version refusal/recovery behavior. Add a versioned golden-file matrix before changing schema, including current raw originals and 17 mechanisms. | Existing lossless codec/migrations, G1/G8 |

## P3: Product Review

- Additional mechanisms selected for teaching a distinct constraint or application,
  not duplicate decorative samples. Candidate topics: pantograph, parallel-motion
  linkage, quick-return and walking-leg linkage. Choose a proven design/reference
  and validate its actual motion before inclusion; none is claimed implemented.
- Manufacturing-oriented constraints, parametric dimensions, assemblies and richer
  analysis require a separate architecture/accuracy brief, not incremental labels
  over the present motion model.
- Collaboration/sharing requires explicit identity, permissions, document conflict
  and privacy design. Do not repurpose OneDrive autosave as real-time collaboration.

## Tutorial Outline And Acceptance

1. **First motion:** open a simple reference; create fixed pivots and a four-bar;
   pull it in Simulate; return to Create without changing design coordinates.
2. **Bodies and rails:** distinguish a joint from a body; add a slider; show a
   deliberately overconstrained negative example and repair it without hiding DOF.
3. **Safe editing:** body fan, select/cycle, undo, duplicate/mirror, outlines and
   explicit cancellation; equivalent mouse, keyboard and touch paths.
4. **Springs and traces:** use standalone crank-slider, carriage and gripper;
   alter one parameter, observe movement and trace; reset/reopen exact settings.
5. **Scissor lift:** explain fixed floor versus moving platform rail; F slides
   on the platform and is not an extra rigid platform member. Compare spring
   assistance and damping without promising SI forces or a certified lift design.
6. **Your projects:** local save/reopen, download versus confirmed disk write,
   recovery, optional OneDrive identity/conflict/offline workflow and CAD limits.

Guide completion requires code-backed saved fixtures plus mounted Chrome/WebKit
lesson runs, clear expected outcomes, keyboard/touch reachability, and an accurate
limitations section. Physical iPad/VoiceOver status stays explicitly qualified.

## Already Delivered (Do Not Rebuild Again Without Evidence)

G1-G10 delivered lossless persistence, lifecycle/legacy motion, tablet input shell,
geometry/images/mirror, springs, traces/model-load charts, CAD/recovery, optional
OneDrive, safe PWA updates and the historical animated body fan. See the master
plan and acceptance reports for exact scope and limits. Version 17 adds the
Projects example library, seven standalone downloadable models including the two
authorized originals, offline assets and release/backlog documentation. Planned
acceptance and actual release outcome are tracked in `evidence/v17/acceptance.md`.
