# G1 Acceptance: Document And Local Editing

Date: 2026-11-15. Decision owner: Codex. Result: PASS for G1 scope.
Candidate: `5aacb68b5df65d72f1db494600f3952c13313841`, isolated branch
`rebuild/g0-candidate`, based on pinned Huggabiz `3dfe105`.
G2 starts automatically; no user unlock or routine QA is required.

## Results

- 62 Node tests pass: legacy payload round-trip, explicit schema/model identity,
  unsupported-version rejection, invalid graph diagnostics, nested snapshot safety,
  coordinate transactions, Base membership and A/B/A import isolation.
- Full TypeScript/Vite/PWA production build passes. ESLint passes with zero errors
  or warnings. Inherited unused/dead code, duplicate/missing arc fields and unsafe
  nullable access were corrected without porting the fork's simulation changes.
- Real mounted Chrome 157 workflows pass at 1440x1000 mouse and 1024x1366,
  1366x1024, 512x1000 touch contexts. Nine workflow groups per profile: create/body
  assignment/fix/undo/redo, coordinate commit/undo/Escape, focus-safe shortcuts,
  delete/undo, native-save cancellation, dirty-open cancellation, both real-file
  import/invalid-preserve/download/reopen flows, picker cancellation/cleanup.
- Saved files were independently parsed and every original entity ID/property
  compared against the archived originals, including embedded images, barriers,
  tracers and legacy rest lengths. Original version semantics survive resaving.
- All profiles have nonblank canvas pixel samples and zero page/console errors.
  Invalid-file feedback stays visible above the canvas rather than below a long tree.
- File-adapter tests include slow iOS-style reads, late cancellation, read failures,
  retry, missing desktop APIs and delayed object-URL revocation. A download is not
  reported as a confirmed disk write; native cancellation does not mark work saved.

Evidence: [browser report](../../../../.rebuild.local/evidence/g1/browser-SCGmLy/report.json),
[portrait Airer](../../../../.rebuild.local/evidence/g1/browser-SCGmLy/tablet-portrait-airer.slinker.png),
[Split View WorkingScreen](../../../../.rebuild.local/evidence/g1/browser-SCGmLy/tablet-split-working-screen.json.png).
Report SHA-256: `f8b4bb678700002489224b676da0c044b4f495092423e3fea792dc7b48e4ed61`.
Browser runner: `scripts/rebuild/verify-g1-browser.mjs`.

## Limitations And Comparisons

C02/C11/C12 now have validated local workflows; C04 core assignment is tested;
C10 includes automated touch development checks, not physical iPad qualification.
Inherited shell remains recognisable. Coarse-pointer file buttons have 44px minimum
targets, horizontal overflow remains reachable, and diagnostics occupy a bounded
full-width band. At 512px width expanded panels leave a 112px canvas; improve at G4.

This gate does not accept simulation accuracy, springs/sensors, CAD, cloud or
production offline behavior. Nonempty springs/sensors are explicitly refused by
this stage's editor, not silently dropped; the codec preserves their raw payload.
Stale legacy barrier references are reported and retained, not automatically deleted.
Safari/WebKit and physical Pencil/palm behavior are not established by Chrome tests.

Initial browser runner mistakes were corrected: snap-adjusted coordinates must be
used to select a new pivot; selection must not accidentally invoke double-tap fixed
toggle. Extending the workflow caught a real focus/value race in coordinate editing,
which was repaired and retested. Failed captures remain in sibling evidence folders.

## Next Gate

G2: extract pure constraint compilation and owned simulation sessions; commit frames
atomically, restore exact design graphs, stop on failure and prove ordinary-link
physics/lifecycle invariants. Keep both real imports and all G1 workflows passing.
