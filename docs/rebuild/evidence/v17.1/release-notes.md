# Slinker 17.1.0

- Restored the compact, always-visible Pan / Select / Box / Lasso toolbar with
  standard Lasso and Home icons. Selection filters remain available.
- Added Power Trim, Trim to Closest and Extend to Boundary, including Shift-Power
  extension, red previews and two-point open sketch lines.
- Intersected circles trim between real intersections and remain saved editable
  arcs. Isolated circles still delete whole. One Undo restores the previous shape.
- Fixed stale/release-coordinate selection gestures, oversized-stroke handling,
  redundant sketch vertices and dense intersection lookup.
- Kept controls reachable around overlaid panels and bounded the selection popup
  in short tablet/Split View layouts. Status text moves clear of wrapped controls.
- Unified the current app/version metadata; explicitly archived old standalone
  artifacts while preserving historical versions, original models and old tags.

See [qualification and retained failures](https://github.com/mikanzui/LinkageStudio/blob/v17.1.0/docs/rebuild/evidence/v17.1/acceptance.md) for evidence and limits.
This is not complete SolidWorks trim parity or physical iPad/Pencil certification.
Microsoft authentication code and the dedicated production callback are unchanged.
