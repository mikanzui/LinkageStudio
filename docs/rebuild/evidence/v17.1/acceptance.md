# 17.1.0 Selection And Trim Qualification

2026-11-19. Lead-owned acceptance; no routine user gate unlock. Status: local
code/browser gate ACCEPTED; hosted publication and live checks PASS. Candidate branch:
codex/rebuild-cloud-pwa; initial remote master/candidate0d10f6e. Protected original
master9954fca and experiments remain untouched.

## Initial Frozen Source (Before Panel Fix)

- Real cloud boundary SHA256:
  `29d8f9aca8664d79a5c6bbb2b8fed8d3f63cf5ead2b1e1513c42dabd95b4ba99`.
- Mock cloud boundary SHA256:
  `ffc11c3d2ff47c953dcf6e5ba288909e0f6377b25c7144adcaf404b7e74fc40f`.
- App version17.1.0; pinned FlattenJS1.6.15. Normal production HTML title/meta,
  top-bar label and downloaded writerVersion are checked against current release.
- Historical sourceVersion, example origin labels, dependency versions and old
  tags are intentionally retained. Old standalone app/config moved to docs/archive
  with clear historical labels; they are not qualified current entry points.

## Scope And Comparison

C03/C05: pictured compact bottom bar with directly visible Pan/Select/Box/Lasso,
standard lasso and Home icons, retained filter/options menu. C08/C09: Power Trim,
Trim to Closest, endpoint Extend to Boundary/Shift-Power; red candidate preview;
two-point open sketch lines. User confirmed intersected circles lose the arc
between real intersections; isolated circles still delete whole. C10/C12:
responsive grouped wrapping,44px coarse hit targets and dynamic HUD separation,
release-coordinate selection, cancellation and bounded gestures. C13:
package17.1.0 canonical release identity. See ../../visual-usability-comparison.md.

## Evidence So Far

- Domain1023/1023, tooling27/27, typecheck, lint, normal build PASS. npm audit
  reports0 vulnerabilities at test time. Build retains its existing large-chunk
  warning; it is not a build failure or a claim of optimized bundle size.
- Independent kernel review found artificial straight-vertex boundaries,
  duplicate vertex/sample handling, far-coordinate circle degradation and slow
  global interval lookup. Added regressions and fixes. Precision limits refuse
  explicitly without changes; no silent circle-to-polygon downgrade.
- Earlier focused native attempt failed on test setup: Cancel left Outline mode,
  and same-project-name fixture reload lacked a completion wait. Corrected and
  rerun; do not count the failed attempt as accepted evidence.
- Additional Shift-touch test initially omitted CDP's modifier bit; corrected
  native test input rather than changing app behavior.
- Normal uninstrumented loopback production checks PASS in Chrome and WebKit:
  pages/chromium-live-3hbClW, pages/webkit-live-BveFpY,
  drawing-live/chromium-WWSf2B, drawing-live/webkit-vjW5TC. These verify version,
  credits, seven exact example assets, offline example reopening and canvas motion,
  isolated-circle deletion, both partial-arc trim modes, saved undo/redo and the
  directly visible selection tools. They are not public hosted deployment evidence.
- Initial cumulative through-g10-EREL5f stopped after12 passing runs at a real
  WebKit512px regression: the expanded Properties overlay hid Selection options.
  Toolbar placement now accounts for overlaid side panels instead of raising it
  over property controls. Added every-button hit-reachability assertions with
  Properties expanded. A new final frozen cumulative run is required.

## Final Source

Final frozen source after panel/popup correction: real
`28ec6b5701519baeac674ad3e2059109a2dca41901f286efdd114c0544f79e8d`;
mock `f2b336908ec07fbdd969d0d7c3b22912de75eefe5fdaeced955c2a4b16054ee8`.
The intermediate final attempt was intentionally stopped for the additional
short-popup bound, not accepted. Native UI16 Chrome/WebKit expanded panel and
512x440 popup checks PASS (chromium-PFy0pa/webkit-yNhpmR before the popup bound;
webkit-bYdFaG and its companion Chrome report after it). The final cumulative
run through-g10-MjlX6R PASS24/24, with unchanged source at both ends. Retained
[cumulative report](cumulative-report.json),
[WebKit CAD parse](cad-webkit.json), [Chrome CAD parse](cad-chromium.json).

Final G4 UI16: webkit-YLLy4j /chromium-f6RoNk. Final G5 drawing:
webkit-browser-9ow17p /chromium-browser-xZEHVa. Both desktop and coarse profiles
PASS, including red preview pixels, partial arcs, both trim modes, explicit and
Shift extension, touch/Escape cancellation, one undo/redo, native download/reopen,
open lines and normal existing geometry/image workflows.

Final normal production (no observer) PASS: pages/chromium-live-TTssjW,
pages/webkit-live-5x8MY2, drawing-live/chromium-lnVYQt,
drawing-live/webkit-3LB9PC. Production smoke with CI's bundled Chromium also PASS;
the Pages workflow now requires this native drawing/offline smoke before upload.
The geometry notice is verified online and from the offline worker cache.
Final1023 domain /27 tooling, typecheck, lint and production build PASS; audit0
vulnerabilities at check time. All48 final browser CAD downloads independently
parsed. Real legacy Airer handle opening and Working Screen drag regressions PASS
in both engines, not merely load/layout tests.

Visuals reviewed on final-source WebKit:
[desktop result](screenshots/desktop-trimmed-arc.png),
[tablet preview](screenshots/tablet-trim-preview.png),
[Properties and toolbar](screenshots/split-properties-toolbar.png).
Historical/reference comparison remains in ../../visual-usability-comparison.md.

## Limits

Physical latest iPad/iPadOS, Pencil, VoiceOver and Home Screen device qualification
remain UNVERIFIED. Chrome trusted touch/pen/cancel and WebKit tablet/touch UI plus
native mouse canvas drags qualify code/browser behavior, not physical hardware.
No new Microsoft sign-in was attempted; auth/MSAL callback code is unchanged.
AZ-01/AZ-02 hardening remains OPEN. Full SolidWorks mode parity, licensed CAD macro
execution and engineering-load certification are not claimed.

## Preservation

Protected original tracked-diff SHA256 remains
`184322a978b5017eb90a4b6fcf96ef94d510110fbf7c31162f9cdaa97fcbc95f`.
The raw airer/working-screen files, historical ancestry and v17.0.0 tag are retained.
No forced updates or dirty-root checkout/reset are permitted.
The dirty original now uses local codex/preserved-pre-rebuild-9954fca, with its
upstream removed to prevent accidental pulls/pushes to canonical master. Local
master tracks the rebuilt origin/master and now points to17.1.0 with the
candidate. No original tracked file was changed by ref cleanup.
The examples ZIP contains9 byte-verified files (seven models plus README/catalog):
SHA256 `d8d87fd9bdd95075b0a53d27f651761a0be25443e675abe0897cdebb17d60a87`.

## Publication

Release implementation commit: `f35fc2a39a4a209062b0323af376699045cec5dd`.
After commit, the real-boundary source fingerprint still exactly matched the
qualified final source above. Local/remote master and the rebuild branch were
advanced normally without force. The protected legacy branch has no upstream.

[Hosted run44575839949](https://github.com/mikanzui/LinkageStudio/actions/runs/44575839949)
PASS, including the new native trim gate and full Chromium/WebKit examples matrix.
Deployment7920734549 for f35fc2a succeeded2026-11-19T17:29:37Z at
https://mikanzui.github.io/LinkageStudio/. Hosted elapsed10m38s; local cumulative
browser elapsed18m56.6s. Billing usage and agent cost savings are UNKNOWN.

Actual public-site checks, no observer, PASS in both engines:
[Chrome pages](live-pages-chromium.json), [Chrome drawing](live-drawing-chromium.json),
[WebKit pages](live-pages-webkit.json), [WebKit drawing](live-drawing-webkit.json).
They verify current HTML/app version, credits/callback, exact seven example
assets, offline notice/examples, moving mechanisms, isolated-circle removal,
Power/closest partial arcs, boundary preservation, saved undo/redo and selection
buttons. They are fresh hosted checks, distinct from earlier loopback evidence.

The final evidence-only commit and new v17.1.0 tag retain the same app source;
historical v17.0.0 remains ef70ed6. No second deploy is needed for evidence-only
changes. Existing open clients may need the app's update prompt to activate17.1.0;
unsaved designs are not forcibly reloaded.
