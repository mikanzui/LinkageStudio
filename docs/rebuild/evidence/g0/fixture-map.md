# G0 Fixture Map: Public Summary

This publication copy is intentionally redacted. The full joint-coordinate,
body-membership and slider-geometry tables remain in the private audit workspace;
neither mechanism can be reconstructed from a published coordinate inventory.
The original detailed local report has not been overwritten.

## Integrity

| Private fixture | SHA-256 |
| --- | --- |
| airer.slinker | 8e73fd936565d2c4df4d549bcc584c438c894f717da6e54ad328a8b3ffd5e0eb |
| working-screen.json | 4f1e389186a478e7e4cd7876914b072d20a964b1130718c1f62766c57dba4c07 |

Originals are user-supplied, not repository assets. Configure the absolute private
fixture directory as described in [testing](../../testing.md); hash mismatch is a
failure. Tests must never manufacture replacement originals or upload raw files.

## Verification Method

- Recompute the actual handle position and camera transform from the mounted app
  immediately before pointer-down; do not assume a stale screenshot coordinate.
- Winged Airer's user-confirmed primary action is the upper brown handle pulled
  upper-left. Check coherent articulation, leg spread and opening angle, not merely
  one joint moving or a solver returning success.
- WorkingScreen's named pull link must move the coordinated screen/door linkage.
  Initial slider endpoint limits must not be mistaken for a frozen mechanism.
- Record actual hit identity, finite positions, fixed drift, relative link error,
  zero-rest coincidence error, rail error and slider travel. Shared pivots and
  intentional zero-rest links are not malformed merely because IDs differ.
- Preserve authored body-local assets, model settings and unknown metadata through
  save/reopen. Returning to Create must restore the exact authored graph.
- Keep missing optional legacy barrier references with diagnostics; do not invent
  geometry or silently delete source records to obtain a pass.
- Repeat both original and reopened motion through actual UI input in the required
  browser profiles. Negative/suppressed-drag and no-pointer controls must be
  distinguishable from successful opening.

The original static mapping did not itself prove browser correctness. Later
[G3 acceptance](../g3/acceptance.md) establishes the calibrated opening contract,
and [G8 checkpoint](../g8/acceptance.md) records its cumulative revalidation.
Physical iPad evidence cannot be inferred from the private map or browser emulation.
