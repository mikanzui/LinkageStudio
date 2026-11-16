# Testing The Rebuild Checkpoint

Version 0.16.0-rebuild.1 stops at local files/recovery/exports. G9 cloud and G10
production/PWA/offline/soak remain unimplemented or unqualified. Gate evidence and
limitations are tracked separately; a source commit is not a production release.

## Domain Tests

Use Node 24 and Python 3.13. From a standalone checkout:

```powershell
npm ci --legacy-peer-deps
python -m venv .venv-cad
.venv-cad/Scripts/python.exe -m pip install -r scripts/rebuild/requirements-cad.txt
$env:CAD_PYTHON = (Resolve-Path .venv-cad/Scripts/python.exe).Path
npm test
npm run lint
npm run build
```

POSIX shells use `.venv-cad/bin/python` and
`export CAD_PYTHON="$PWD/.venv-cad/bin/python"`. CAD tests require ezdxf 1.4.5;
missing or incorrect parser setup fails, rather than silently skipping the checks.
The install flag exposes the inherited Vite/PWA peer mismatch; G10 must resolve
the release toolchain and remaining development dependency audit findings.

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

`scripts/rebuild/verify-g1-browser.mjs` through `verify-g8-browser.mjs` are the
original audit-workspace harnesses. They use real chooser/download controls,
trusted browser input, read-only observations of the mounted stores, a frozen
build fingerprint and isolated browser storage. They do not drive a second store
instead of the visible app. Failure injections apply at file/IndexedDB boundaries.

These scripts currently require the generated private `.rebuild.local` workspace:
isolated candidate/reference trees, runtime configs, Playwright/browser tooling,
archived fixtures and built artifact. A standalone browser-harness bootstrap is
still G10 work; copying the scripts does not reproduce those private inputs.
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
SolidWorks execution remains unverified. CAD GUI inspection must have its own
evidence and cannot be inferred from passing numeric/parser tests.
