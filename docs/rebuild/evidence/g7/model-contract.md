# G7 Model Contract

G7 is accepted in acceptance.md. This contract alone is not acceptance evidence.
Scope: F15/F16 plus explicit F01 node-name parity closure; C04/C06/C07/C08/C09/C11.

## Force Meaning

Retain the working motion model. A free solver particle has unit inertial mass;
fixed support coordinates do not integrate. Link/body mass fields are not silently
treated as calibrated SI mass. Legacy outline-weighted gravity remains a distinct
approximate motion setting. No N/kg/engineering-accuracy claim is permitted from it.
The force read model must identify model units and incomplete contact qualification.

Repair the fork's last-pass-only defect by accumulating distance-constraint impulses
across EVERY projection pass and substep, then averaging over frame duration.
Do not divide the accumulated correction by the pass count. A fixed endpoint still
receives the equal/opposite virtual constraint force even though its position stays
fixed. Support reaction balances its spring/constraint loads with opposite sign.
Redundant graph link-load decomposition is not unique; total balance is the contract.

Kinematic barriers are not mutually coupled rigid-body contact dynamics. Do not label
distance-link contributions as complete support/contact reactions for slider/barrier
graphs without a corresponding conservative impulse implementation and tests.
Unsupported reaction components must be explicit, never reported as measured zero.
Zero-rest coincidence has no unique axial direction; retain its geometry and diagnose
unavailable axial sensor data rather than inventing tension or dropping the sensor.

Mandatory independent cases: vertical static support balances unit-particle gravity
within 1%; reaction is nonzero and invariant over 1/3/6/12 projection passes; reversed
link orientation preserves tensile sign; free fall is topology invariant; analytical
small-angle pendulum period/energy; summed impulse balances momentum. Test spring
loads at fixed supports and rejected-frame rollback without polluting analysis state.
Force analysis must not change accepted motion when disabled or enabled.

## Documents And Runtime Ownership

Force sensor definitions persist stable id/linkId/enabled/name; optional old fields
remain lossless. Topology changes remap by endpoint identity, deletion is undoable,
mirror handles sensor references and local/cloud/recovery share the same codec.
No global force smoothing or cross-project sample state. Analysis is derived only
after a valid committed frame. Pause/restart/load/clear have defined sampling resets.
Bound trace and sensor time series; reject nonfinite samples, never leak unbounded
per-frame arrays. Sensors record model-qualified axial values, not GUI-scaled arrows.

## Objects And UI

Keep tracer world/body-local placement and body reassignment. Add named numeric
properties and keyboard/touch object selection rather than relying on hover menus.
Joint/node name editing, node-list selection and mirrored-node identification are
still missing from fork parity: add them here, with transactional persistence and
actual browser save/reopen tests. This closure must not erase F01's earlier evidence.

Loads use a binary native control; sensors/tracers have named placement and property
controls, bounded readable values/plots and accessible state. Coarse targets remain
44px, including added lists/fields. Actual browser motion must agree with tracer
coordinates and sensor readouts. No routine user gate-unlock step is required.
