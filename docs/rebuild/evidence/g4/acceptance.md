# G4 Acceptance: Input, Selection And Tablet Foundation

Decision owner: Codex. Result: PASS for code/browser qualification under D15.
Candidate: `715fed10b3ab005a683bfdbede384eb7d527ef51` (built from G3 plus the identical staged G4 source).
Source SHA256: `5b248bdd9980e8a866b835c54576d9b6f6d4b0b372f0fd8b3165f7c0fd4146bc`.
Immutable production artifact: `.rebuild.local/gate-builds/g4-WOLqjR`.
Its `gate-manifest.json` hashes all 11 output files. Tests check rendered source
identity, not just a dev server claiming to have reloaded. Node 24.13.1, Windows,
Chrome 157.0.8103.51 and Playwright WebKit 27.2 were used.

## Delivered And Verified

- Per-canvas pointer ownership, Pencil-path palm rejection, capture/cancel/Escape,
  resize cancellation, and document/history boundaries cancel before replacement.
- Trusted Chrome finger drag cancellation restores graph and undo boundary;
  second-finger interruption rolls back before pinch. Pinch world anchor is stable.
- Native capture loss, keyboard undo/redo while dragging, import while captured,
  pen/finger handover and finger pan are actual browser event workflows.
- Distinct Select/Pan/drawing, overlap cycling unaffected by hover, box/lasso
  crossing/enclosure selection and shared-body exclusions. Deletion is one command.
- Native named body controls, touch/keyboard rename/cancel/focus, body assignment,
  color/visibility/COM and inert Simulate controls. Measured coarse targets >=44px.
- Responsive panels default collapsed below 1100px, expand as overlays, resize by
  pointer or keyboard. Split View retains a 404px canvas at a 512px viewport.
- DPI2 backing pixels match CSS-space input; fit excludes Base-only long rails;
  zoom bounds and bounded tick iteration avoid unusable/looping extreme views.
- Icon file/viewport controls, safe narrow top bar, project-name Escape, keyboard
  save/open and redo. Original Hugo Wilson attribution links to Huggabiz upstream.

199 domain/adapter/store tests, ESLint, TypeScript and Vite/PWA production build pass.
Screenshots were inspected, including Split View HUD/toolbar separation. G5 owns
the full outline/image/primitive lifecycle, not implied by this foundation gate.

## Evidence

Paths below are relative to `.rebuild.local/evidence/`; originals and failed runs
are retained. Both fixture hashes still match G0 and the root patch is unchanged.

| Suite | Chrome | WebKit |
| --- | --- | --- |
| G1 four layouts/files | `g1/browser-vsIffC` | `g1/browser-HFN0Le` |
| G2 lifecycle/negative controls | `g2/chromium-o5wXBp` | `g2/webkit-LnhVxY` |
| G3 original/reopened full motion | `g3/chromium-workflow-bmioWq` | `g3/webkit-workflow-i1RwU6` |
| G4 body workflows | `g4/bodies-NJZ9Y4` | `g4/bodies-tzffGe` |
| G4 input/selection | `g4/chromium-input-T6ntnd`, `chromium-input-zNsmx5` | `g4/webkit-input-3gFpOZ`, `NBHPn7`, `L6yFLS`, `n7oQQA`, `S0CZqz` |

G3 Airer still opens about 41.17-41.20 degrees with ~510 world-unit leg spread,
~451.7 handle travel and zero fixed drift. Maximum sampled link-relative error is
below 0.00046 Chrome / 0.00023 WebKit. WorkingScreen also moves and restores exactly.

## Qualification Limits And Harness Corrections

No physical iPad, Safari Files app, Home Screen, Pencil hardware or VoiceOver was
tested. WebKit touch taps are real automated events; its multi-touch/Pencil dispatch
is unavailable here. Chrome trusted CDP events plus pure ownership tests cover those
code paths, not hardware certification. WebKit cannot emulate independent mouse and
touch clicks during capture; its captured-import case uses the real keyboard command.

Rapid CDP flick release followed by a native-button tap is timing-sensitive even on
a plain HTML canvas/button page with no app code, in Chrome 157 and bundled 159.
The maintained native probe reproduces it with/without pointer preventDefault,
zoom-lock and mixed sessions. Holding 300ms before release passes all eight controls;
the selection workflow therefore explicitly tests a held release. Rapid synthetic
flick-to-tap is a remaining automation/platform qualification limit, not a fixed app
claim. Probe runs: `native-touch-probe-GMeSHo`, `bEUVLx`, `CuZ3il` under `g4/`.

A WebKit repeat caught the harness measuring coordinates before responsive mount
had settled. It now waits for the actual collapsed rails and matching backing pixels;
five consecutive runs passed. No selection or physics tolerances were weakened.

G5 starts automatically. This is not complete application/release acceptance.

G5 coverage extension: the earlier read-only browser observer omitted images and
tracers, though those files were round-tripped through UI and domain tests. G5 adds
both to mounted-state observation and reruns cumulative restoration assertions.
The new G5 target measurements also found expanded tool buttons below 44px; the
coarse expanded-tool/mode CSS is being repaired and requalified before G5 promotion.
The earlier 44px measurements apply to body/viewport/collapsed controls, not every
expanded legacy tool. This coverage correction is retained rather than hidden.

Requalification complete: G5 commit c9178b8 and immutable g5-iTGyV8, cumulative
through-g5-tCHoDV. Expanded/collapsed geometry tool targets meet 44px on coarse
pointer; geometry option hit reachability also passes expanded tablet/Split View.
Both engines pass all G1-G5 suites. G4 is PASS again; no physical-device claim added.
