import { chromium } from '../../.rebuild.local/tooling/node_modules/playwright/index.mjs';
import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';

const root = fileURLToPath(new URL('../../', import.meta.url));
const runtimes = JSON.parse(await readFile(join(root, '.rebuild.local/runtimes.json'), 'utf8'));
const fixture = process.argv[2] ?? 'airer';
if (!['airer', 'working-screen'].includes(fixture)) throw new Error('Unknown fixture');
const foot = fixture === 'airer' && process.argv[3] === 'foot';
const output = join(root, `.rebuild.local/evidence/g0/${fixture}${foot ? '-foot' : ''}-drag`);
await mkdir(output, { recursive: true });
const browser = await chromium.launch({ channel: 'chrome', headless: true });
const results = [];
try {
  for (const run of [
    { id: 'upstream', targetId: 'upstream' },
    { id: 'local', targetId: 'local' },
    { id: 'local-causal', targetId: 'local-causal' },
    { id: 'negative-control', targetId: 'candidate', blockPointer: true },
  ]) {
    const target = runtimes.targets.find((target) => target.id === run.targetId);
    const context = await browser.newContext({ viewport: { width: 1440, height: 1000 }, serviceWorkers: 'block' });
    const page = await context.newPage();
    page.setDefaultTimeout(10000);
    const errors = [];
    page.on('pageerror', (error) => errors.push(error.message));
    page.on('console', (message) => { if (message.type() === 'error') errors.push(message.text()); });
    await page.goto(target.url);
    const picker = page.waitForEvent('filechooser');
    await page.getByRole('button', { name: run.targetId.startsWith('local') ? 'Open Local File' : 'Open', exact: true }).click();
    await (await picker).setFiles(join(runtimes.archive, `fixtures/${fixture === 'airer' ? 'airer.slinker' : 'working-screen.json'}`));
    await page.waitForFunction(() => Object.keys(globalThis.__LINKAGE_G0_READ__.mechanism().joints).length > 10);
    await page.locator('.splash-screen').waitFor({ state: 'detached' });
    const snapshot = () => page.evaluate(() => {
      const mechanism = globalThis.__LINKAGE_G0_READ__.mechanism();
      const editor = globalThis.__LINKAGE_G0_READ__.editor();
      const r = document.querySelector('canvas').getBoundingClientRect();
      return { joints: mechanism.joints, links: mechanism.links, bodies: mechanism.bodies,
        baseBodyId: mechanism.baseBodyId, editor, simulation: globalThis.__LINKAGE_G0_READ__.simulation(),
        canvas: { left: r.left, top: r.top, width: r.width, height: r.height } };
    });
    const rawDesign = await snapshot();
    if (fixture === 'airer') {
      // Pan through actual middle-button input so the saved mechanism is centered.
      await page.mouse.move(700, 450);
      await page.mouse.down({ button: 'middle' });
      await page.mouse.move(350, 450, { steps: 12 });
      await page.mouse.up({ button: 'middle' });
    } else {
      await page.mouse.move(650, 500);
      for (let i = 0; i < 4; i++) { await page.mouse.wheel(0, 100); await page.waitForTimeout(30); }
    }
    if (foot) {
      const state = await snapshot();
      const midpoint = (state.joints.XlD7YOWwBk.position.x + 1450) / 2;
      const current = state.canvas.left + state.editor.camera.pan.x + midpoint * state.editor.camera.zoom;
      const desired = state.canvas.left + state.canvas.width / 2;
      const delta = desired - current;
      const startX = delta < 0 ? state.canvas.left + state.canvas.width - 30 : state.canvas.left + 30;
      await page.mouse.move(startX, 500);
      await page.mouse.down({button:'middle'});
      await page.mouse.move(startX + delta, 500, {steps:16});
      await page.mouse.up({button:'middle'});
    }
    await page.getByRole('button', { name: 'Simulate', exact: true }).click();
    await page.waitForTimeout(300);
    const before = await snapshot();
    const base = new Set(before.bodies[before.baseBodyId].jointIds);
    // Fixture-map handle observed on the actual canvas, checked by stable entity ID.
    const handleId = fixture === 'airer' ? (foot ? 'XlD7YOWwBk' : 'g6kFted7Nm') : '0oYLG5yu-0';
    const handle = before.joints[handleId];
    if (!handle || base.has(handle.id)) throw new Error('Primary handle is missing/fixed.');
    const screen = (world) => ({
      x: before.canvas.left + before.editor.camera.pan.x + world.x * before.editor.camera.zoom,
      y: before.canvas.top + before.editor.camera.pan.y + world.y * before.editor.camera.zoom,
    });
    const from = screen(handle.position);
    const to = screen(fixture === 'airer' ? (foot ? {x:1450,y:850} : { x: 100, y: -50 }) : { x: 625, y: 325 });
    for (const point of [from, to]) {
      if (point.x < before.canvas.left || point.x > before.canvas.left + before.canvas.width
        || point.y < before.canvas.top || point.y > before.canvas.top + before.canvas.height) {
        throw new Error('Drag point is outside the canvas; adjust with UI navigation first.');
      }
    }
    await page.screenshot({ path: join(output, `${run.id}-before.png`) });
    if (run.blockPointer) {
      await page.evaluate(() => window.addEventListener('pointerdown', (event) => {
        if (event.target instanceof HTMLCanvasElement && event.button === 0) event.stopImmediatePropagation();
      }, true));
    }
    await page.mouse.move(from.x, from.y);
    await page.mouse.down();
    let grabbed = await snapshot();
    const grabAttempts = [grabbed.editor.simDrag];
    if (foot && !run.blockPointer) {
      for (let attempt = 0; attempt < 4 && grabbed.editor.simDrag?.jointId !== handle.id; attempt++) {
        await page.mouse.up();
        await page.mouse.down();
        grabbed = await snapshot();
        grabAttempts.push(grabbed.editor.simDrag);
      }
    }
    const samples = [];
    for (let step = 1; step <= 30; step++) {
      const t = step / 30;
      await page.mouse.move(from.x + (to.x - from.x) * t, from.y + (to.y - from.y) * t);
      await page.waitForTimeout(50);
      samples.push(await snapshot());
    }
    const held = await snapshot();
    await page.screenshot({ path: join(output, `${run.id}-held.png`) });
    await page.mouse.up();
    await page.waitForTimeout(300);
    const released = await snapshot();
    await page.screenshot({ path: join(output, `${run.id}-released.png`) });
    await page.getByRole('button', { name: 'Create', exact: true }).click();
    const restored = await snapshot();
    const handleTravel = Math.hypot(held.joints[handle.id].position.x - before.joints[handle.id].position.x,
      held.joints[handle.id].position.y - before.joints[handle.id].position.y);
    const fixedDrift = Math.max(...[...base].map((id) => Math.hypot(
      released.joints[id].position.x - before.joints[id].position.x,
      released.joints[id].position.y - before.joints[id].position.y)));
    const restoreError = Math.max(...Object.values(rawDesign.joints).filter((j) => !j.hidden).map((j) => Math.hypot(
      restored.joints[j.id].position.x - j.position.x, restored.joints[j.id].position.y - j.position.y)));
    const summary = { id: run.id, fixture, interaction:foot?'sliding-foot':'pull-arm', handleId: handle.id, from, to,
      grabbed: grabbed.editor.simDrag, grabAttempts, handleTravel, fixedDrift, restoreError,
      timeBefore: before.simulation.time, timeHeld: held.simulation.time,
      stepError: held.simulation.stepError ?? null, errors };
    const record = { summary, rawDesign, before, grabbed, held, released, restored, samples };
    await writeFile(join(output, `${run.id}.json`), JSON.stringify(record, null, 2));
    console.log(JSON.stringify(summary, null, 2));
    results.push(summary);
    await context.close();
  }
  const upstream = results.find((r) => r.id === 'upstream');
  const local = results.find((r) => r.id === 'local');
  const negative = results.find((r) => r.id === 'negative-control');
  const assessment = {
    upstreamRealGrab: upstream.grabbed?.active === true,
    localRealGrab: local.grabbed?.active === true,
    localValidationFailure: Boolean(local.stepError),
    localTravelFractionOfUpstream: local.handleTravel / upstream.handleTravel,
    negativeControlRejected: !negative.grabbed?.active,
    note: 'Fixture-specific travel threshold is not yet approved; these are observed measurements, not full G0 sign-off.',
  };
  await writeFile(join(output, 'assessment.json'), JSON.stringify(assessment, null, 2));
  console.log(JSON.stringify(assessment, null, 2));
} finally {
  await browser.close();
}
