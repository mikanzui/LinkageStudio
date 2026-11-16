# G8 CAD Boundary

2026-11-16. F17; C11/C12. Pure exporter package; no store, UI, browser or download
ownership. Input is a caller-chosen authored/design/current-pose MechanismState.
Never compile or regenerate its graph, modify source objects or infer rigidity.

## API

`buildCadScene(graph: MechanismState, showLinksGlobal = true): CadScene` in
`src/core/cad-scene.ts`. Scene has uniquely named ASCII layers with source body IDs,
colors, world-coordinate circle/line/polyline entities and explicit warnings.
Entity kind identifies joint/link/outline/slider/collider; lines may be construction
geometry for SolidWorks. Polyline retains its open/closed flag. Define and export
the exact TypeScript discriminated union in that module for both writers.

`writeDXF(scene: CadScene, unit: ExportUnit): string` and
`writeSolidWorksMacro(scene: CadScene, unit: ExportUnit): string` are pure writers.
`ExportUnit = 'mm' | 'cm' | 'm' | 'in'`, shared in utils/export-manager.ts.
Retain legacy `exportDXF(joints, links, bodies, baseBodyId, outlines, sliders,
colliders, showLinksGlobal = true, unit = 'mm')` wrapper so existing callers work.
Add equivalent `exportSolidWorksMacro` wrapper. New export UI can use full-graph
buildCadScene plus a writer, sharing geometry/diagnostics rather than copying loops.

## Geometry And Safety

- World scale: 25 units = 10mm. Keep scene points in world coordinates; writers
  convert units and invert screen Y exactly once. SolidWorks coordinate arguments
  stay meters regardless of display unit selection. Reject invalid runtime units.
- Visible authored joints, per-body-layer pivots (shared pivot may occur in each
  different body layer), nonhidden links subject to global/owner visibility, visible
  outlines, sliders and colliders. Hidden/temp solver geometry never exports.
  Unowned visible joints need a distinct default layer rather than silent loss.
- Owner link visibility agrees with renderer (first non-Base owner); guides do not
  disappear merely because ordinary links are hidden. Skip missing stale optional
  barrier references with a warning, preserving exportable legacy geometry.
- Open trimmed paths stay open. Two-point outlines are segments, never a duplicate
  closed loop. Avoid zero-length CAD segments; report skipped unsupported geometry.
- Unique case-insensitive safe layer names, including collisions with reserved
  guide/default layer names. Stable source IDs are not renamed in the input graph.
- Embedded images, springs, tracers, sensors and analysis overlays are not ordinary
  CAD geometry; report omission counts/warnings from full graph. Project saves still
  preserve all of them. Do not silently represent a spring as a rigid constraint.
- Finite geometry/units only, with enough numeric precision for small and large
  coordinates. User labels/names must not inject DXF records or executable macro
  lines; comments are sanitized to one line. Never put arbitrary source text into
  executable expressions. Do not silently clamp or drop malformed finite geometry.
- Preserve the existing R12 compatibility intent unless independent version/unit
  validation justifies a documented change. Do not claim unit metadata support from
  string presence alone. Macros must use a documented creation/plane API with
  actionable failures, not unexplained numeric preference fallbacks.

## Verification And Ownership

Worker owns isolated package files mapping to core/cad-scene.ts,
utils/export-manager.ts, utils/export-dxf.ts, utils/export-solidworks.ts and
tests/cad-export.test.ts. No candidate/shared UI/types edits. Worker may run isolated
tests/imports against accepted candidate types and use installed independent parser,
but does not control browser/CAD GUI, change servers, install packages or accept G8.
Lead reviews/installs package and owns real UI downloads, independent parser/actual
CAD dimension/visibility checks, macro target limits and cumulative qualification.
Primary source links and prepared tooling are in preparation.md.
