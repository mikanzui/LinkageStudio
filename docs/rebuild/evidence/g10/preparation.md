# G10 Preparation And Update Contract

2026-11-16. G9 cumulative verification is running on a pinned artifact. Work in
this preparation phase stays in ignored, disjoint packages until G9 integration
checks finish; it does not certify G10 or change the artifact under test.

## Work Packages

- G10-01: Noether owns dependency/clean-install experiments only in
  `.rebuild.local/packages/g10-toolchain`. No candidate edits during G9 runs.
- G10-04: Chandrasekhar owns portable harness bootstrap proposals only in
  `.rebuild.local/packages/g10-portable`. Private fixtures must be explicitly
  supplied/hash checked; no published coordinates, automatic replacements or
  full-suite pass without the originals.
- Lead owns update/recovery, subpath, icons, final scrub and acceptance.
  `.rebuild.local/packages/g10-pwa` contains proposed code and 13 passing
  restart-checkpoint tests, not integrated app/device evidence.

## Restart Safety

The inherited `autoUpdate` behavior must be removed. Workbox generates the worker;
the app owns a small explicit registration/restart UI. A waiting update must not
reload any open editor automatically, including another dirty tab. A requested
restart first flushes recovery, commits the exact current authored design (even a
clean open file), reads it back and checks the session and full text again. Quota,
corruption, concurrent edits or stale revision refuse restart. Beforeunload bypass
is one-use, short-lived and limited to this exact acknowledged design.

Other tabs never receive reload approval. They retain their current graph and
receive an update indicator when the controller changes. No auth callback bridge
enters SPA navigation fallback, and no Graph/auth response is runtime-cached.
An update dialog provides Later and an independent local-save action. Background
checks are bounded; no mandatory network wait is introduced into guest startup.

The first rollout cannot retroactively change a worker/reload handler already
running in an older deployed app. Document that transition and do not deploy this
candidate automatically. Physical iPad Home Screen behavior remains unverified.

## Assets And Hosting

The real repository uses `/LinkageStudio/`, not upstream's lowercase path. Verify
the exact case with production assets and offline navigation; keep a validated
root/subpath build override. Existing author icon is rasterized, not redesigned,
for 192/512px manifest PNGs and the 180px Apple touch icon. Preserve the SVG source
and credit. No claim of installation from checking the manifest alone.

## Primary References

- [Workbox generateSW configuration](https://developer.chrome.com/docs/workbox/modules/workbox-build)
- [PWA prompt-update behavior](https://vite-pwa-org.netlify.app/guide/prompt-for-update.html)
- [Service-worker waiting lifecycle](https://developer.mozilla.org/en-US/docs/Web/API/ServiceWorkerRegistration/waiting)
- [MSAL v5 redirect bridge](https://learn.microsoft.com/en-us/entra/msal/javascript/browser/redirect-bridge)

Final acceptance requires actual old/new worker transitions, offline reload,
two-tab dirty preservation, recovery refusal negatives, production browser scrub
and soak. Code/unit tests, mock worker messages and manifest validation alone are
not evidence that those workflows passed.
