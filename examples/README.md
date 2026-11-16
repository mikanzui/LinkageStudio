# Mechanism Playground

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
