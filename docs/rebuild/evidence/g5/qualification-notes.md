# G5 Qualification Corrections

The lead expanded validation beyond the initial bounded geometry harness. This
record preserves discovered gaps rather than representing every early run as pass.

- Expanded coarse toolbar buttons measured 123x31 CSS pixels. Repaired to at least
  44px; G4 target coverage reopened until cumulative requalification completes.
- Mounted-state observer omitted images/tracers. Added both, then repeated actual
  save/reopen and complete design-restoration assertions. No imported duplicate store.
- Screenshot inspection found geometry options covered by the expanded tablet
  toolbar despite all tool-button tests passing. Moved options into a wrapping
  full-width band above the canvas; actual elementFromPoint checks now cover every
  option with expanded/collapsed toolbar and at 512px Split View.
- Added manual outline partial-cancel, explicit Finish, first-point closure and undo.
- Added real simulated-body rotation with an asymmetric PNG. Independently predict
  red/blue sample pixels from live joint positions, then verify exact design restore.
- Analytic polygon moments now use translated triangle fans; a 100x100 polygon at
  world offset 1e12 retains area 10000 and its correct centroid.
- Save resolves locked outline world geometry without mutating mounted state;
  undo/redo invalidates frozen caches and image import epochs.

Latest build: `g5-iTGyV8`, source SHA256
`9e0d31462d3f08088f1779e7bcf8cbe2f2f07d13cbe3a50ee0c60fb7f0e944ea`.
Feature harness runs: `g5/chromium-browser-FIGOqK`, `g5/webkit-browser-gEhZsc`
under `.rebuild.local/evidence`. Both desktop/tablet profiles pass. Full cumulative
suite still determines promotion; these notes alone are not gate acceptance.

Comparison rows: C03/C04/C06/C09/C10/C11/C12/C13, screens S08/S09/S10.
No physical iPad, Pencil, Home Screen or VoiceOver qualification is claimed.
