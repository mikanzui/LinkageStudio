# V16 Drawing Toolbar Restoration

## Reference And Scope

User requested the pre-rebuild simplified sidebar, secondary drawing toolbar
and old icons. Reference: fork commit 9954fca5bdfe48154353458b8c908d7d9f7af451,
src/components/Layout.tsx, Layout.css and Toolbar/Toolbar.tsx. Candidate base:
29dd006, branch codex/rebuild-cloud-pwa. Original workspace is reference-only.

The user calls this the pre-rebuild v16 UI. The pinned reference's package.json
labels itself 0.15.5; the exact historical source, not the informal version
name, establishes the recovered palette and glyph geometry.

| Comparison | Historical V16 | Rebuilt Before | Restoration |
| --- | --- | --- | --- |
| C03 tool groups | One Draw sidebar command | Six separate geometry commands | Draw plus separate Mirror; five drawing modes in canvas palette |
| C05 navigation | Contextual floating palette | No secondary drawing palette | Palette only during active drawing, not select/pan/simulation |
| C08 appearance | Bespoke spring/damper/torsion/sensor symbols | Generic cable/arrow/activity symbols | Historical glyphs shared by both rails and object lists |
| C10 tablet | Historical 32x30px palette buttons | Rebuilt coarse-pointer targets | 32px desktop / 44px coarse buttons; bounded palette |
| C12 cancellation | Historical tool switching | Rebuilt transactional cancellation | Existing setCreateTool boundary retained; draft cancellation tested |
| C13 access | Title-based icon buttons | Rebuilt names/pressed state | Named buttons, visible focus, keyboard activation and pressed state |

Mirror remains a separate accessible sidebar command: its axis/scope options
are not a drawing mode. Shape lock, square mode, polygon sides, finish/cancel,
image import and spring-placement options remain functional. Radius is 8px,
not the historical 10px, to follow current design constraints. The palette sits
below the ruler rather than overlapping it. Pivot, slider, collider, image and
tracer already retained their historical glyphs; no replacement was needed.
No solver, document codec or storage-adapter code changed. The later circle-trim
request adds optional primitive provenance in the existing outline/store shape.

## Whole-Circle Trim Follow-Up

User additionally requests complete circle removal, not surviving arc runs.
Previously circles were flattened into 48 edges and passed to polygon-edge
trimming, which deliberately retained all uncut edges.

Circle outlines now trim as single objects when a stroke crosses the boundary.
This includes diameter cuts through sampled vertices. Misses, tangencies,
inside-only strokes and cancelled gestures do not delete anything. Scope,
visibility, frozen geometry and single-step undo/redo are preserved; deleted
circle IDs are also removed from selection/frozen caches.

New primitive provenance survives save/reopen and mirror via existing DTO
preservation. New 48-sided N-gons remain segment-trimmed. Old files lack that
identity: a closed, regular 48-point ring is inferred as the historical circle.
An old untagged regular 48-gon is geometrically indistinguishable and receives
the same whole-circle behavior; this ambiguity cannot be recovered from absent
metadata. Open arcs and noncircular vertex edits remain segment-trimmed.

Ten focused circle regression tests and the retained geometry suite PASS;
all990 domain tests PASS with no skips. Native Chrome desktop/touch whole-circle
trim, cancel, scoped deletion, one undo/redo, real download/reopen and legacy
diameter checks PASS. WebKit desktop/tablet-profile checks also PASS. C09 is additionally in scope.
The new regression explicitly rejects the previous surviving-arc behavior.

## Acceptance Checks

- Native expanded/collapsed Draw access; five modes and options reachable.
- Real outline/rectangle/circle/polygon/trim/mirror actions, undo and round-trip.
- Palette hidden for select/pan/simulation; correct re-entry, no stale draft.
- Chrome and WebKit desktop/touch; 512px split view and short landscape layouts.
- Historical icon geometry compared against source, not merely icon presence.
- Previously accepted cumulative regressions against frozen final app source.
- No physical iPad claim from desktop emulation. No cloud-login fix claimed.

## Feature Evidence

2026-11-16 toolbar-only feature PASS (superseded by combined source below):
real-boundary build g5-ONFtoA, source
3052e12453d40b3fdbea026fff1864843c8a1b7ac95f671ce14ad14e436de305
(144 fingerprinted files), candidate base 29dd006 plus this scoped working diff.

- Chrome 157.0.8103.51: g5/chromium-browser-Qme02y, both profiles PASS.
- WebKit: g5/webkit-browser-Pyn7NR, both profiles PASS.
- Each engine uses 1440x1000 desktop and 1024x1366 touch/DPR2; palette also
  inspected at 512x440 and 1024x600. Native input, traces, screenshots, saved
  downloads and read-only mounted observations are retained in ignored evidence.
- New negative control rejects the old cluttered sidebar/no-Draw-button UI.
  Checks cover five palette modes, named/pressed states, historical glyph
  coordinates, keyboard Tab/Enter, incomplete-outline cancellation and hiding
  outside drawing. Existing geometric, undo, image-pixel and round-trip
  assertions were retained, with tool activation routed through Draw.
- Screenshots 001-v16-draw-collapsed.png, 002-v16-draw-expanded.png and
  003-v16-palette-512x440.png visually reviewed, including WebKit touch.
- Toolbar-only domain tests 980/980, tooling 27/27, typecheck and lint PASS.
- A structured TypeScript-AST comparison checks all10 recovered SVG trees against
  9954fca: complete child geometry/attributes match. Only root size/class/ARIA
  presentation attributes are excluded. Report: g5/drawing-icon-reference.json.
- Original root tracked diff still SHA256
  184322a978b5017eb90a4b6fcf96ef94d510110fbf7c31162f9cdaa97fcbc95f.
  Both supplied original file hashes remain unchanged.

## Qualification Limits

WebKit/touch automation is development evidence, not a physical latest-iPad,
Pencil, palm rejection or VoiceOver qualification. Those remain UNVERIFIED.
Chrome tablet canvas drags use trusted CDP touch input. WebKit tablet controls
use trusted taps; continuous canvas drags use native mouse because trusted touch
drag/cancellation injection is unavailable in that harness.
The earlier hosted redirect-registration mismatch is historical: the user now
confirms sign-in worked on the last build. This update neither changes auth
configuration nor claims a fresh agent-executed Microsoft login.
The user subsequently requested committing these changes and updating outdated
GitHub master. Publication is now authorized for this follow-up; no new version
tag is requested, and the existing v17.0.0 tag is not moved.

## Combined Acceptance

The toolbar-only run through-g10-HNEVBW was intentionally interrupted after
18/24 passing suite-engine combinations when the user added whole-circle trim.
It is partial evidence, not final acceptance for the new trim source.
Final combined source remained frozen throughout the replacement cumulative run.

Combined toolbar/circle-trim feature PASS on real-boundary build g5-Bcojqx,
source7cb332294d0b729320aaf7352071c4d3adfddd75d98e5e6ac116a8d9a251faa0
(144 files). Chrome g5/chromium-browser-5OEtVn and WebKit
g5/webkit-browser-zoQAuy both pass all14 steps in both profiles. Whole-circle
deletion screenshot011-circle-trim-whole.png visually reviewed; rectangle and
N-gon remain intact with no residual circle arcs.

Full frozen cumulative through-g10-IIAGMK PASS24/24 on mock-boundary build
g10-AQpa4z, source
0acc34983bec4902e1bffc870ff215d3311f47093b8f4f4f53866178cd81fb28
(145 files), unchanged at start/end. Executed2026-11-16T23:23:13.131Z to
23:45:31.515Z:22m18.384s. Lead accepts the scoped toolbar and circle-trim
reintegration. No user unlock was required.

- Final domain990/990 and tooling27/27, zero skips; lint/typecheck/normal build PASS.
- Normal, uninstrumented production preview: WebKit pages/webkit-live-Om7K1j
  and Chrome pages/chromium-live-yrwkly PASS five workflows each, including all
  seven offline examples and real visible mechanism motion. These are loopback
  production checks, not new hosted deployment or real-account sign-in evidence.
- Independent ezdxf1.4.5/parser checks PASS48 actual CAD downloads from
  g8/webkit-browser-WICEnN and g8/chromium-browser-clzn2R. No new CAD-GUI or
  SolidWorks execution claim.
- Package-lock SHA256:
  4958c8e404dd62fe6c6209e8f67b30943756485c0c8b123f3bb62b991ab61746.
- Original root tracked diff and both supplied file hashes rechecked unchanged.
- One lead; zero workers for these coupled changes. Model/billing usage unknown;
  no unmeasured multi-agent time/cost saving is claimed.

## GitHub Consolidation

User confirms Microsoft sign-in worked on the last build. Record USER-REPORTED
PASS for that build, not fresh agent authentication evidence. No auth/MSAL/Graph/
callback source changed in this follow-up; Azure hardening items remain OPEN.

Remote master9954fca and the rebuild share pinned upstream3dfe105 but have
diverged histories. Preserve the verified rebuild tree in an explicit history
merge with legacy master, then non-force-push master and the rebuild branch to
the same result. The old implementation remains reachable as the merge's
historical parent. Master becomes the Pages workflow source. Do not reset,
checkout or update the dirty original local master worktree; its files/index
and experiments remain at the preserved baseline.

Commit, remote update and hosted deployment evidence pending.
