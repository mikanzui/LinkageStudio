# Example Projects

In Slinker17.1.0, open **Projects > Examples**, select a model and choose
**Open example**. The adjacent download icon provides its source file. Search
matches names, mechanisms and tags. No Microsoft account is required. Examples
are bundled for offline use after the app finishes its first online installation.
Opening a model makes an editable project copy; original source bytes are not
overwritten. Unsaved work requires an explicit save/discard/cancel decision.

## Included Models

| Model | File | What To Try |
| --- | --- | --- |
| Spring-assisted scissor lift (new) | [spring-scissor-lift.slinker](spring-scissor-lift.slinker) | Simulate raises two crossing stages and moves the platform rail. Pull the platform down/up and observe spring assistance, damping, traces and arm sensor. |
| Flap - Winged Airer | [airer.slinker](airer.slinker) | In Simulate, pull the upper brown handle toward the upper-left to open the coupled wings and legs. This is the exact user-supplied original. |
| Working Screen | [working-screen.json](working-screen.json) | Simulate and pull the screen mechanism; inspect coupled screen/drawer/door motion. Exact user-supplied original. |
| Mechanism Playground | [mechanism-playground.slinker](mechanism-playground.slinker) | Three independent spring-driven systems, four paths and two load sensors. |
| Spring-driven crank-slider | [crank-slider.slinker](crank-slider.slinker) | Rocking crank, translating output and coupler path, separated from the playground. |
| Damped carriage and end stop | [damped-carriage.slinker](damped-carriage.slinker) | Spring return, parallel rails, dashpot and finite stop. Pull right and release. |
| Torsion-spring gripper | [torsion-gripper.slinker](torsion-gripper.slinker) | Pull the jaws apart, release and observe angular spring response and traces. |

The two legacy files retain unresolved saved barrier references (Airer4,
Working Screen9). The loader reports and retains these old records rather than
silently deleting data or refusing the whole mechanism. They do not prevent the
validated handle motions. Exact source hashes and byte lengths are in
[catalog.json](catalog.json). User authorized publishing these supplied examples.

## Scissor Lift

Four rigid crossing bars share center pivots over two stages. B travels on a
fixed floor rail, while F travels on the moving platform rail. F must not also
be a rigid member of that platform: that extra constraint would lock the design.
The world-anchored spring lifts the platform and the opposite dashpot damps it.
The two traces show vertical platform travel and a lower center's curved path.
The included load sensor uses the existing qualified model-unit interpretation.
This is a motion demonstrator, not a certified load-bearing lift design.

## Playground

Open `mechanism-playground.slinker` in the current Slinker rebuild, then select
Simulate. Springs are preloaded, so all three mechanisms move automatically.
Pause/Resume stops/restarts time; Restart restores the initial spring energy.
Returning to Create restores the original design exactly.

- Upper left: a spring-driven crank-slider. The green crank rocks, the gold
  connecting rod drives the output along its rail, and two tracers show the
  crank circle and the connecting rod's coupler curve. This is an oscillator,
  not a constant-speed motor.
- Upper right: a cyan spring-return carriage on parallel rails. The lower
  dashpot damps its motion; the vertical barrier stops its left edge. Pull the
  carriage to the right in Simulate and release to reload the spring.
- Below: two gripper jaws share a fixed hinge and a torsion spring. They close
  toward their rest angle and settle. Pull either jaw apart and release it.

The connecting rod and left jaw have enabled load sensors; inspect their live
charts in the simulation panel. Four body-local tracers and colored outlines
move with their bodies. Spring anchors include world, joint and link endpoints.
The saved file includes the mechanism, outlines, sensor/tracer configuration and
physics settings. It needs no images, cloud account or external assets.

Force readings and spring parameters use the app's **unit-particle / legacy
motion model**, not calibrated SI engineering loads. Physical iPad qualification
is not implied by automated WebKit/touch/viewport checks. Slider and contact
reactions are not included in the force model; its incomplete-analysis notice is
expected here and does not stop the mechanism motion. Older releases without
these features cannot be expected to simulate them.

Regenerate the file with `node --import tsx scripts/examples/create-playground.ts`.
Focused checks: `node --import tsx --test tests/example-playground.test.ts`.
Mounted-browser checks: `node scripts/rebuild/verify-playground-browser.mjs ENGINE URL`
against a prepared read-only observer build (see `docs/rebuild/testing.md`).

## Reproducibility And Packaging

- Regenerate the new lift: `node --import tsx scripts/examples/create-scissor-lift.ts`.
- Refresh standalone detail files, public mirrors and catalog: `npm run examples:prepare`.
- The canonical sources live here; `public/examples/` is a generated byte-for-byte
  mirror needed before Vite/Workbox build so examples are genuinely precached.
- Focused tests: `node --import tsx --test tests/example-*.test.ts`.
- Native catalog checks: `node scripts/rebuild/verify-examples-browser.mjs chromium`
  and `node scripts/rebuild/verify-examples-browser.mjs webkit`.
- The17.0.0 GitHub release includes an examples ZIP and all seven individual models.

New mechanisms require the current feature implementation; backward compatibility
does not mean an older release can simulate features it never implemented. The
tutorial and future additions/patches are tracked in
[the feature backlog](../docs/rebuild/FEATURE-BACKLOG.md).
