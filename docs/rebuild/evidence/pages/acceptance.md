# Credits And Pages Publication

2026-11-16. User explicitly requests coauthor credits, removing the Claude model
tag, a commit and publication to their existing GitHub Pages site. Lead owns
verification and gate decisions. Status: local checks PASS; hosted execution and
publication PENDING. No worker/cost-saving claim. Version0.16.0-rebuild.4.

## Authorization And Preserved State

- User confirms Hugo Wilson authorized publication. The upstream repository still
  has no license metadata; this records user permission attestation, not an
  invented license, copyright transfer or unrestricted licensing claim.
- User confirms exact Azure SPA callback
  `https://mikanzui.github.io/LinkageStudio/redirect.html` is registered. Dedicated
  same-origin MSAL v5 bridge remains unchanged; no secret/tenant/security change.
  Registration confirmation is not a successful live hosted account test.
- GitHub CLI authenticates asmikanzui with admin/push permission for
  mikanzui/LinkageStudio. Existing Pages uses workflow builds; github-pages has
  no deployment branch restriction/protection rule to change.
- Remote master/main stay9954fca; previous deployed run25750020067 succeeded from
  main at that commit. Rebuild branch is based on pinned upstream and is not a
  fast-forward of those refs. Publish `codex/rebuild-cloud-pwa` without force-
  updating either branch or replacing the protected original local workspace.
- Earlier public checkpoint codex/rebuild-v0.16.0 remains1b6f723. The only tracked
  original fixture map was introduced redacted at that checkpoint; no private
  map/fixtures are introduced by this publication. The only tracked.slinker is
  the newly authored public Mechanism Playground. No.env files are tracked.

## Credits And Local Verification

Footer now reads "Coauthored by Jake Whiting and Hugo Wilson". Jake's profile and
Hugo's original repository remain named links. Claude Opus/VibeCoded wording is
removed from application source, without removing upstream ancestry/provenance.
Existing compact footer style remains; native tests prove caption wrap/link targets.

-962 domain tests, zero skips/failures;27 tooling tests PASS.
- Lint and TypeScript/normal production/PWA build PASS. Existing >500kB main-chunk
  advisory remains, not suppressed.
- Source SHA256 (real boundary):
  `9a819be6b244a6bb2b6e59d135b91d160dec53268f49119c604a02407288ac1d`.
- Final native production suites `g10/chromium-production-p7wlLy` and
  `g10/webkit-production-8DAdHu`: six scenarios each PASS on stable final source.
  Cold/warm assets/case/worker/callback, exact coauthor links/layout/no model tag,
  offline import/save/actual motion, dirty two-tab update refusal, quota/recovery
  restart and short/rotated Split View modal reachability. Credit screenshots
  reviewed. No physical iPad/Safari/keyboard/Pencil certification.
- Earlier Chrome vHFSq2 also passes. WebKit lYzQqP fails the new credit harness
  because it expanded before responsive startup committed, detaching the footer.
  Wait for mounted collapsed layout before expansion; test-only repair, no app
  change. Failed evidence retained, not silently promoted.
- Normal dist scan finds no mounted observer, mock-auth or old credit markers.
  Actual release uses vite.config.ts, never the observer/update-probe test bundles.

## Hosted Plan And Outcome

The deployment workflow triggers only on the rebuild branch (or explicit dispatch),
leaving old source refs untouched. Verified current official action tags and pinned
their SHAs. Build job has read-only repository permissions, locked Node24 install
without peer override, Python/independent CAD parser, type/lint/public domain tests,
tooling tests, production audit and Chromium/WebKit production checks. Public CI
explicitly skips unavailable private original fixtures; local962 tests include them.
Only after checks pass is normal dist plus the public example uploaded. Deploy
job alone has Pages/id-token write permission, needs the build job and uses the
existing github-pages environment. No auth scopes, registration or environment
protections are weakened. References: GitHub's official
[Pages workflow requirements](https://docs.github.com/en/pages/getting-started-with-github-pages/using-custom-workflows-with-github-pages).

Hosted run/commit/deployment URL and actual cold/warm/file/credit outcome: PENDING.
Do not call the site published merely because a source push succeeds.

## Qualifications

Existing AZ-01 CSP and AZ-02 token/network classification hardening remain open;
the supplied Azure skill and version-specific review remain applicable. Hosted
live sign-in, expiry/account-switch/quota/offline reconnect and physical iPad/Home
Screen/Pencil/VoiceOver are not inferred from mocks, callback200 or this credit
change. Model loads remain explicitly non-SI and omit slider/contact reactions.
SolidWorks execution remains unverified. User publication authorization does not
turn these into passing qualification rows.

Previous deployment identity is retained for an explicit rollback decision. No
site-data clearing, destructive reset, forced Git ref move or older automatic-
worker rollback is performed. Save/recovery remain required before dirty-page
updates. Do not promise that old already-running worker behavior can be changed
retroactively by the new deployment.

See [credit comparison](../../visual-usability-comparison.md#coauthor-credits-and-publication)
and [tracker](../../progress-tracker.md#credits-and-publication-active).
