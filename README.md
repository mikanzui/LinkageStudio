# Slinker / Linkage Studio

Version **17.1.0**, an isolated rebuild based on
[Huggabiz / Hugo Wilson's Linkage Studio](https://github.com/Huggabiz/linkage-studio)
v0.12.3 (`3dfe10512e105f863a582ce5cc4b3bb8a2006306`).

Rebuilds the editor, document and simulation boundaries while restoring the fork's
geometry, spring, tracer, sensor and export tools. Adds optional account-isolated
OneDrive projects, offline drafts and recovery-verified PWA restarts. Live Microsoft
service edge cases and physical-device qualification remain explicitly open.
Microsoft sign-in on the previous hosted build is user-confirmed working;
this follow-up does not change authentication or callback configuration.
See [changes](CHANGELOG.md) and [rebuild tracker](docs/rebuild/progress-tracker.md).

The simplified **Draw** sidebar entry opens the restored five-tool canvas
palette. Historical mechanical icons are retained. Trimming a circle removes the
entire isolated circle. Intersected circles trim to real sketch boundaries.
Power trim, click-to-closest and endpoint extension share an undoable preview.
Pan, Select, Box and freehand Lasso are directly available in the viewport bar.
See [current comparison and validation](docs/rebuild/v17.1-plan.md) and the
[historical drawing palette comparison](docs/rebuild/drawing-toolbar-restoration.md).

`master` is the canonical release source and GitHub Pages deployment branch.
The rebuild and historical fork histories are retained; no force-push is needed.
Legacy generated HTML/exporter files are clearly marked in docs/archive/ and are
not the current release. Imported source versions and example-origin versions
remain historical; writerVersion identifies the application that saves a file.
The new analytic sketch kernel uses pinned FlattenJS; its retained
[MIT notice](public/flatten-js-notice.txt) is included in the deployed app.

Open **Projects > Examples** for seven searchable, downloadable models, including
the supplied Winged Airer and Working Screen, the new spring-assisted two-stage
scissor lift, and the earlier playground's individual mechanisms. These are
available offline after the first successful app installation; no sign-in needed.
See [example guide and files](examples/README.md) and the prioritized
[feature/patch backlog and tutorial plan](docs/rebuild/FEATURE-BACKLOG.md).

Try the [Mechanism Playground](examples/README.md): a spring-driven crank-slider,
damped carriage/end stop and torsion gripper, with tracers and load sensors.

## Run Locally

Use Node 24.13.1 or later in the Node 24 line.

```sh
npm ci
npm run dev -- --host 127.0.0.1
```

Open the printed `/LinkageStudio/` URL, including its case. No peer bypass is
needed. `VITE_BASE_PATH=/` (or another validated trailing-slash subpath) overrides
the hosting path when set in your shell before the build.

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
shell's native syntax. Authorized copies of the two supplied legacy mechanisms
are included in examples/. Raw browser traces and private coordinate inventories
are not published. Fixture configuration, required-evidence
mode and the portable browser harness are documented in
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
- OneDrive is optional. Its Microsoft SPA registration must allow the exact
  origin/base plus `redirect.html`; `VITE_MSAL_CLIENT_ID` selects an owned public
  registration. No client secret belongs in this browser application. Live
  sign-in/CORS/conditional-upload behavior is not certified by mock tests. A bounded
  actual work-account QA run is recorded in docs/rebuild/evidence/g9/live-qualification.md.
  Local cloud QA uses http://localhost:5187/LinkageStudio/ because the owned SPA
  callback is registered under localhost, not 127.0.0.1. Keep callbacks same-origin;
  do not override just the redirect hostname while leaving the editor on another.
  Apply the supplied Azure skill via docs/rebuild/azure-integration-review.md;
  its CSP and token/network classification follow-ups remain explicitly OPEN.
- Four low development-only audit findings remain in the unpatched deepmerge
  build-tool chain; its inspected consumer merges static defaults only. Production
  audit has zero findings. This is a qualification, not a security patch.
- Final G10 cumulative/soak results and any unresolved issues are maintained in
  the rebuild tracker; installation assets are not physical Home Screen evidence.

## Provenance

The editor credits "Coauthored by Jake Whiting and Hugo Wilson", with links to
Jake's GitHub profile and Hugo's original repository. This branch retains
the upstream commit ancestry and incremental rebuild commits. No top-level upstream
license was identified during the audit. On 2026-11-16 Jake confirmed that Hugo
authorized publication of this rebuilt version; no new upstream license is implied.
Publication evidence and remaining qualifications are recorded in
[Pages acceptance](docs/rebuild/evidence/pages/acceptance.md).
