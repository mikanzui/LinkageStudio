# Slinker / Linkage Studio

Version **0.16.0-rebuild.1**, an isolated rebuild checkpoint based on
[Huggabiz / Hugo Wilson's Linkage Studio](https://github.com/Huggabiz/linkage-studio)
v0.12.3 (`3dfe10512e105f863a582ce5cc4b3bb8a2006306`).

Rebuilds the editor, document and simulation boundaries while restoring the fork's
geometry, spring, tracer, sensor and export tools. This checkpoint stops after
local files/recovery/CAD work. Microsoft/OneDrive and production/PWA qualification
remain future stages; this is not a complete replacement for the fork's cloud app.
See [changes](CHANGELOG.md) and [rebuild tracker](docs/rebuild/progress-tracker.md).

## Run Locally

Node 24 is used for verification (Vite requires Node 20.19+ or 22.12+).

```sh
npm ci --legacy-peer-deps
npm run dev -- --host 127.0.0.1
```

Open the printed `/linkage-studio/` URL. The explicit install flag is currently
needed for the inherited Vite 8 / vite-plugin-pwa 1.2 peer mismatch. Their tested
build works, but the compatible clean-release toolchain remains a G10 task.

```sh
npm run lint
npm run build
npm run preview -- --host 127.0.0.1
```

## Tests

The domain suite includes an independent DXF reader. Prepare Python 3.13 with the
pinned CAD dependencies and point `CAD_PYTHON` to that interpreter:

```sh
python -m venv .venv-cad
.venv-cad/bin/python -m pip install -r scripts/rebuild/requirements-cad.txt
CAD_PYTHON="$PWD/.venv-cad/bin/python" npm test
```

Windows uses `.venv-cad\Scripts\python.exe`; set environment variables using your
shell's native syntax. The two user-supplied legacy mechanisms and raw browser
evidence are deliberately not published. Fixture configuration, required-evidence
mode and the workspace browser harness are documented in
[testing](docs/rebuild/testing.md).

## Qualification Limits

- Chrome/WebKit, mouse/touch and narrow/tablet tests are automated. No claim of
  physical iPad, Pencil, VoiceOver or installed Home Screen certification.
- Forces are qualified **unit-particle model loads**, not SI-certified structural
  forces. Partial contact/slider/grab reactions are explicitly unavailable.
- DXF R12 coordinates use the chosen units; the CAD import unit must match.
  Unsupported images, springs, tracers and sensors are listed as omissions.
- SolidWorks `.swb` generation is tested numerically but target-app execution is
  unverified. The export dialog states this limitation.
- Recovery is best effort local storage, not a durable file/cloud save. Browser
  download initiation does not clear unsaved changes.
- Production update/offline/soak and development-dependency audit work remain G10.

## Provenance

Original author credit and GitHub link remain in the editor. This branch retains
the upstream commit ancestry and incremental rebuild commits. No top-level upstream
license was identified during the audit; redistribution terms require review before
external release. A source checkpoint is not a deployment or release certification.
