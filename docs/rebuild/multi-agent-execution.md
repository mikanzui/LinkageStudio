# Multi-Agent Execution Plan

Updated: 2026-11-15. User direction: selective parallel work with cost control.
No workers are required for this planning update. G0 is the first execution pilot.

## Team And Ownership

Maximum simultaneous team: one lead plus two workers. This is a ceiling, not a
target. Zero or one worker is normal when the gate has little independent work.

| Role | Owns | Handoff |
| --- | --- | --- |
| Lead | Critical path, architecture/contracts, shared orchestration, browser session, integration, tracker and gate acceptance | Integrated candidate, reviewed evidence and next task |
| Worker A: feature | One bounded implementation after interface agreement; exclusive files in its checkout | Patch/commit, exact changed paths, tests and known limitations |
| Worker B: verifier | Independent assertions, regression review and visual/usability comparison; tests in separately assigned files | Reproduction, pinned revision, measurements and PASS/FAIL/UNVERIFIED findings |

Roles may change between tasks, but only after the lead records new ownership.
The verifier is not automatically a second implementer. Read-only review can run
alongside development; candidate-specific verification requires that candidate to
exist and be pinned first. Independent review is a useful check, not a guarantee.

## Delegation Decision

Before spawning, the lead answers:

1. What immediate task will I do locally? Keep the next blocking step with the lead.
2. What needed deliverable can another agent finish without that step's result?
3. Are inputs/interfaces and expected results clear enough to prevent guessing?
4. Can file ownership and runtime resources be separated?
5. Is the task substantial enough to justify setup, model usage and integration?

If no independent deliverable exists, continue single-agent. Do not launch agents
to reread the same repository, restate the plan or wait for an unavailable browser.
Do not parallelize dependent feature gates as though their contracts already exist.

## Stage Assignments

These are candidate splits, activated only when dependencies and file scopes allow.

| Gate | Lead / Sequential Work | Worker A Opportunity | Worker B Opportunity |
| --- | --- | --- | --- |
| G0 | B02 runtime/browser setup, B04 real imports/drags, B06 scope decisions and B08 acceptance | Fixture entity/handle mapping and proposed B05 assertions using existing inputs; calibrate after B04 | B03 comparison checklist and analysis of captured S/C states; no independent browser control |
| G1 | Canonical document/schema, migration policy, commands and store contracts | Local-file adapter and explicit save outcomes after codec interface exists | Golden-file/undo/cancel tests in owned test files |
| G2 | Constraint compiler/session boundary, atomic frame commit/reset and integration | Bounded numerical kernel work after solver API/units are fixed | Analytical/lifecycle cases and review of session isolation |
| G3 | Shared slider/barrier semantics and session integration | Slider implementation | Collider implementation if solver write sets are separate; otherwise verifier only |
| G4 | Gesture ownership/state machine and physical test coordination | Panels/properties shell against command interface | Focus/accessibility/input regressions and comparison of captured tablet states |
| G5 | Geometry/world-local contracts and document integration | Image transform or primitive/trim feature, one owned package at a time | Independent mirror/outline package only if disjoint; otherwise transform/persistence tests |
| G6 | Force/anchor units, solver interface and final integration | Spring/damper or torsion feature, bounded by module | Analytical, anchor and save/reopen tests in separate files |
| G7 | Force-analysis semantics, accuracy decision and sensor document contract | Tracer/sensor presentation against fixed read model | Known-load/reaction tests and reference comparison |
| G8 | Codec completeness, data-loss policy and adapter integration | CAD exporter with fixed unit/visibility contract | Independent file parser/dimension checks and cancellation/recovery tests |
| G9 | Project identity, auth/session/conflict policy and disposable live-test setup | OneDrive storage adapter after API contract exists | Mock offline/conflict/expiry suite; no simultaneous live-account writes |
| G10 | Release candidate, real-device/PWA acceptance and rollback decision | Production/offline automation against pinned candidate | Independent cumulative regression and visual/usability evidence review |

If tasks share `App.tsx`, a store, the central tool manager or the same solver file,
assign that shared file to the lead or one worker exclusively. A split by concept
alone does not make simultaneous edits safe. Decompose modules at a justified stage
before using them as independent implementation packages.

## Brief Template

```text
Task ID / gate / feature IDs / risk IDs / C and S comparison rows:
Agent role and one concrete deliverable:
Starting commit + any required patch/input hashes:
Relevant document sections and supplied context:
Interfaces/units/behavior already agreed:
Exclusive writable files; all other paths read-only:
Expected assertions and independent reference:
Runtime/browser ownership (if any):
Required return: patch/commit, changed paths, actual checks, failures/limitations:
Stop/handoff condition:
```

Do not forward the entire chat/history by default. Supply compact context plus
the relevant master/audit/comparison sections. Verify the worker has the required
reference and candidate files; a checkout of HEAD alone may omit dirty patches.

## Integration Protocol

1. Lead records the task and ownership before delegation. Use isolated worker
   checkouts/branches for writes, with exact base and any required fixture/patch inputs.
2. Workers edit their exclusive file sets. Contract changes return to the lead first.
   Workers do not merge branches, change dependency versions or update master status.
3. Lead continues useful critical-path work. Wait only when the next step needs a result.
4. At handoff, inspect the diff, assertions and evidence. Resolve overlap explicitly;
   do not accept both patches blindly or discard existing user changes.
5. Integrate one bounded patch at a time. Record the resulting revision and rerun
   the affected tests plus cumulative accepted suite on the integrated candidate.
6. The browser has one driver at a time. The lead owns its profile, files, origin,
   mode and fixture state. Verifier tasks can analyze captures or use a distinct
   isolated profile when explicitly assigned; no concurrent manipulation of one page.
7. Link visual/usability comparison records and numerical evidence. Only the lead
   marks a task accepted or writes the gate result. Required device checks still apply.
8. Close finished agents and record integration/rework time and next action.

Tests written by another agent must assert independent expectations, including
the known bad behavior, rather than copy the implementation's output. Final
verification uses the mounted app and merged revision, not a worker's private store.

## Usage And Time Controls

- Start with short bounded briefs and the smallest useful number of workers.
- Avoid duplicate searches and repeated full audits; use the existing source audit.
- Close completed agents; do not keep agents running while waiting for hardware,
  browser access or an unresolved contract.
- Default to inherited model settings. Different models/effort can be considered
  for bounded tasks when explicitly selected; do not assume a cheaper model is active.
- Record reported usage when exposed. Distinguish tokens from billed credits/money;
  unavailable usage/cost is UNKNOWN. Do not estimate spend from elapsed time alone.
- Reduce concurrency when coordination, conflicts or repeated rework outweigh the
  independent work completed. Never cut verification to make the pilot look cheaper.

## G0 Pilot Measurement

Use existing measurements as context, not a fictional single-agent control run.
Do not repeat expensive work solely to construct a benchmark.

| Metric | Recording Rule |
| --- | --- |
| End-to-end wall time | Start/finish of the bounded work package, including integration and checks |
| Work allocation | Lead/worker task IDs, roles, exact base, exclusive files and independent overlap |
| Agent duration | Reported run duration or timestamps; unavailable timing is UNKNOWN |
| Usage | Per-agent/lead tokens or credits only where available, with units and source |
| Integration overhead | Time reviewing/merging/fixing overlap and rerunning affected checks |
| Rework | Failed assertions, duplicated investigation, conflicts and corrections |
| Accepted output | Completed deliverables and actual gate evidence, not lines of code |
| Serial comparison | Explicitly labeled estimate unless a comparable measured run already exists |

After G0, record whether to keep zero, one or two workers for the next stage and
why. Faster delivery can be supported by timestamps; cheaper delivery requires
comparable usage/cost evidence. Without it, report benefit as unproven.
