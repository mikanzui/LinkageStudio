# Testing The Rebuild Checkpoint

Version 0.16.0-rebuild.2 adds optional cloud and production/offline/update code.
Gate evidence and external qualification limits are tracked separately; a source
commit is not a production release. The earlier rebuild.1 checkpoint is retained.

## Domain Tests

Use Node 24 and Python 3.13. From a standalone checkout:

```powershell
npm ci
python -m venv .venv-cad
.venv-cad/Scripts/python.exe -m pip install -r scripts/rebuild/requirements-cad.txt
$env:CAD_PYTHON = (Resolve-Path .venv-cad/Scripts/python.exe).Path
npm test
npm run test:tooling
npm run lint
npm run build
```

POSIX shells use `.venv-cad/bin/python` and
`export CAD_PYTHON="$PWD/.venv-cad/bin/python"`. CAD tests require ezdxf 1.4.5;
missing or incorrect parser setup fails, rather than silently skipping the checks.
The compatible pinned Vite/PWA and ESLint 10 stack installs without peer bypasses.
Production audit is zero. Four low development-only findings remain in the
unpatched deepmerge chain, with a regression assertion for its static-default
consumer. Do not run `npm audit fix --force` or label the full audit clean.

## Private Legacy Fixtures

The actual user files are NOT included in GitHub. Public synthetic tests run
without them; only the named private-fixture cases explicitly skip. Full local
qualification must run with those originals and no skipped tests:

```powershell
$env:LINKAGE_FIXTURE_DIR = 'C:/private/linkage-fixtures'
$env:REQUIRE_LEGACY_FIXTURES = '1'
npm test
```

`LINKAGE_FIXTURE_DIR` must be absolute and contain these exact files:

| File | SHA-256 |
| --- | --- |
| airer.slinker | 8e73fd936565d2c4df4d549bcc584c438c894f717da6e54ad328a8b3ffd5e0eb |
| working-screen.json | 4f1e389186a478e7e4cd7876914b072d20a964b1130718c1f62766c57dba4c07 |

Hash mismatches always fail. Required-evidence mode also fails on missing files.
The preserved private audit workspace can locate its existing archive automatically;
no fixture is downloaded, reconstructed, replaced or uploaded by test setup.

## Browser Evidence

`scripts/rebuild/verify-g1-browser.mjs` through `verify-g10-production.mjs` use
chooser/download controls,
trusted browser input, read-only observations of the mounted stores, a frozen
build fingerprint and isolated browser storage. They do not drive a second store
instead of the visible app. Failure injections apply at file/IndexedDB boundaries.

Full browser qualification requires the two private originals, not an inherited
workspace. With `LINKAGE_FIXTURE_DIR` set, run:

```powershell
npm run test:browser:prepare
npm run test:browser
node scripts/rebuild/verify-g10-production.mjs chromium --soak
node scripts/rebuild/verify-g10-production.mjs webkit --soak
```

The bootstrap resolves the current checkout (or explicit
`LINKAGE_CANDIDATE_DIR`), verifies both hashes, creates ignored runtime/config
files and installs pinned Playwright tooling/browsers only with explicit install
flags. Existing different configs/archives/tooling definitions are preserved and
refused. Source directories are never aliased by a junction. Full cumulative runs
require all 22 suite/engine combinations and unchanged source/config/base/mock
fingerprints. A ten-minute soak is a separate real-time run, not accelerated
solver time. Reports retain wall time and simulation time.

Public synthetic production checks need no private files:

```powershell
node scripts/rebuild/prepare-browser.mjs --config-only --install-tooling --install-browsers
npm run test:production
node scripts/rebuild/verify-g10-production.mjs webkit
```

These do not replace private-file or complete cumulative qualification. The
non-deploying GitHub workflow runs public domain/tooling/build/audit and generated
worker smoke checks. Hosted CI execution is unverified until actually run.
Raw traces, screenshots, mechanism contents and local tooling are not published.
The published G0 fixture map is a redacted verification summary. Full coordinate
and body-membership inventories remain only in the original private audit docs.

The workspace cumulative runner accepts an explicit URL and `--webkit-first`.
It requires every planned suite/engine pass with unchanged source; a partial run,
interruption, changed source or a failed earlier gate cannot be marked passed.
The CAD download checker separately uses ezdxf and an independent macro-call
reader, not the application's geometry writer, to inspect actual downloads.

## Device And Target Limits

WebKit engine tests are not physical iPad Safari/Home Screen/Pencil/VoiceOver
certification. Chrome CDP touch/pen and WebKit trusted taps are distinguished from
WebKit mouse drag/cancellation. Physical OS picker cancellation is modeled at the
actual input element, not a claim that automation dismissed the iOS Files app.
Windows headless Firefox 159 emits cancel before Playwright file delivery even on
a minimal non-app page. Its production test suppresses only the native picker
click, then drives the actual input/FileReader/import. That is not Firefox native
picker qualification. Chrome/WebKit use actual chooser events.
SolidWorks execution remains unverified. CAD GUI inspection must have its own
evidence and cannot be inferred from passing numeric/parser tests.
