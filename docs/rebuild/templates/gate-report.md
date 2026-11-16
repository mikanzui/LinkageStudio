# Gate Report Template

One report per acceptance attempt. Keep failed attempts and link the later retest.

```text
Gate / attempt / date / feature IDs:
Status: PASS / FAIL / BLOCKED / UNVERIFIED
Required predecessor gates and reports:
Code commit / patch hash / build identity / lock hash:
Fixture and reference artifact hashes:
Environment (device, OS, browser, viewport, DPI, input):
Scope implemented:
Lead + worker IDs/roles/task ownership and exact bases:
Integrated revision (may differ from worker revision):
Independent review and lead disposition:
Behavioral/numerical assertions and independent expected values:
Known-bad behavior detected before fix / negative-control result:
UI entry actions and observed workflow results:
Visual/usability C rows / screen S states / comparison record:
Data lifecycle: create/edit/cancel/delete/undo/save/reopen/simulate:
Full cumulative regression suite results:
Console/network/error checks:
Physical iPad Safari/Home Screen/Pencil results:
Evidence paths (screenshots, events, measurements, logs):
Intentional differences and approved decisions:
Remaining failures/untested surfaces:
Codex acceptance decision, rationale and date (no routine user sign-off):
Rollback artifact / known-good candidate:
Package wall time / worker durations / integration and rework time:
Reported usage/cost with units and source (UNKNOWN if unavailable):
Parallel-work benefit and next-stage concurrency decision:
Next task:
```

A hardware result required at this gate, or a failing cumulative scenario,
prevents PASS. Requirements assigned to later gates remain visible but do not
block earlier baseline/document work. Codex runs the checks and records acceptance;
an implementation commit or empty decision field does not imply PASS.
