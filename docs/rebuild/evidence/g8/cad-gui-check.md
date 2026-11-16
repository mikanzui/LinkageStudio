# LibreCAD GUI Check

2026-11-16. Actual Windows LibreCAD 2.2.1.6, not a simulated CAD page.
User approved launching the extracted official portable copy. No system-wide
installer was run and no original mechanism or generated DXF was overwritten.

## Observed

The native file chooser's cached accessibility indices failed, so the actual
browser-downloaded `cad-mm.dxf` was opened through LibreCAD's command-line file
argument. Its native window title and load log confirm the file. Auto Zoom renders
the authored rod/wing, fixed and free pivot circles, separate guides, closed
triangle and visibly unclosed L-shaped outline. Body/guide layer names appear in
LibreCAD's layer tree. R12 colors are palette approximations, not exact source RGB.

Double-clicked the actual vertical rod line. LibreCAD's native Line dialog shows:

| Property | Actual value | Expected |
| --- | --- | --- |
| Layer | rod | rod |
| Start X, Y | 30, -72 | World (75,180), scaled by 0.4 with Y inverted |
| End X, Y | 30, -120 | World (75,300), scaled by 0.4 with Y inverted |
| Length | 48 drawing units (status bar) | 120 world units x 0.4 |
| Line type | Dash | Construction/link guide |

The dialog was cancelled with Escape without altering geometry or saving the CAD
file. Native screenshots and accessibility output were observed in the tool
conversation; no separate screenshot file is claimed. The visible drawing and
native dimension dialog, together with independent parsed downloads, qualify this
DXF GUI smoke test. The reader verifies the other three scales, every coordinate,
circle radius, layer and open/closed path in both browser download matrices.

Select All reports 19 selections including the polyline containers/child edges,
and total length 327.106 drawing units (including circle circumferences). The
parser reports 14 top-level DXF entities; these are different counting conventions.
Auto Zoom marks the CAD view dirty and LibreCAD later reports an autosave, but
the inspected original download still has SHA-256
`bf988fc70368a5d33525cbcc28e24a3bc9ac13e614b4c2c98c97c72e02198117`.
It is byte-identical to the versioned build's final Chrome mm download in
chromium-browser-7HTGio. No source mechanism was changed or re-saved in CAD.

## Limits

R12 has no standard insertion-unit metadata. These are millimetre-coordinate
numbers; import units must be chosen to match. No automatic physical scaling in
another CAD app is promised. Only the mm sample received this GUI inspection;
cm/m/in are independently parsed, not claimed GUI-measured. SolidWorks macro
execution remains UNVERIFIED and is not substituted by this LibreCAD result.
