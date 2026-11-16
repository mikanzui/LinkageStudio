import assert from 'node:assert/strict';
import { mkdir, mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { createHash } from 'node:crypto';
import { chromium, webkit } from '../../.rebuild.local/tooling/node_modules/playwright/index.mjs';
import { resolveBrowserPaths } from './source-paths.mjs';
import { candidateFingerprint, assertCandidateBuild } from './candidate-fingerprint.mjs';

const paths = resolveBrowserPaths(), engine = process.argv[2] ?? 'chromium';
assert(['chromium', 'webkit'].includes(engine));
const sourceStart = await candidateFingerprint(), url = process.argv[3] ?? 'http://127.0.0.1:5191/LinkageStudio/';
const file = join(paths.candidate, 'examples/mechanism-playground.slinker');
const fixtureSha256 = createHash('sha256').update(await readFile(file)).digest('hex');
const parent = join(paths.local, 'evidence/playground'); await mkdir(parent, { recursive: true });
const output = await mkdtemp(join(parent, engine + '-')), results = [];
const browser = engine === 'webkit' ? await webkit.launch() : await chromium.launch({ channel: 'chrome' });
try {
  for (const profile of [{ id: 'desktop', width: 1440, height: 1000, touch: false },
    { id: 'portrait', width: 1024, height: 1366, touch: true }, { id: 'split', width: 512, height: 900, touch: true }]) {
    const context = await browser.newContext({ viewport: { width: profile.width, height: profile.height }, hasTouch: profile.touch,
      isMobile: profile.touch, deviceScaleFactor: profile.touch ? 2 : 1, serviceWorkers: 'block', acceptDownloads: true,
      recordVideo: { dir: output, size: { width: profile.width, height: profile.height } } });
    await context.addInitScript(() => Object.defineProperty(window, 'showSaveFilePicker', { value: undefined, configurable: true }));
    const page = await context.newPage(), errors = [], samples = [];
    page.on('pageerror', e => errors.push(e.message)); page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
    page.on('dialog', d => d.accept(d.type() === 'prompt' ? d.defaultValue() : undefined));
    page.setDefaultTimeout(15000);
    const read = () => page.evaluate(() => ({ graph: __LINKAGE_G0_READ__.mechanism(), editor: __LINKAGE_G0_READ__.editor(), simulation: __LINKAGE_G0_READ__.simulation() }));
    const activate = locator => profile.touch ? locator.tap() : locator.click();
    const button = name => page.getByRole('button', { name, exact: true });
    const mode = async name => { const compact = page.getByTitle(name + ' mode', { exact: true }); await activate(await compact.isVisible() ? compact : button(name)); };
    const open = async path => {
      const chooser = page.waitForEvent('filechooser'); await activate(button('Open'));
      const dirty = page.getByRole('dialog', { name: 'Unsaved Changes', exact: true });
      if (await dirty.isVisible()) await activate(dirty.getByRole('button', { name: 'Discard and open', exact: true }));
      await (await chooser).setFiles(path);
      await page.waitForFunction(() => !!__LINKAGE_G0_READ__.mechanism().springs['gripper-torsion']);
      await page.waitForFunction(() => document.querySelector('.top-bar')?.getAttribute('aria-busy') === 'false');
    };
    try {
      await page.goto(url); await page.locator('canvas').waitFor(); await assertCandidateBuild(page, sourceStart);
      if (profile.touch) await page.locator('.panel-collapsed').first().waitFor();
      await open(file); await activate(button('Fit mechanism'));
      const original = (await read()).graph;
      await page.screenshot({ path: join(output, profile.id + '-design.png') });
      await mode('Simulate');
      const started = Date.now();
      while (Date.now() - started < 30000) {
        const s = await read(); samples.push(s); assert.equal(s.simulation.stepError, null);
        if (s.simulation.time >= 6) break;
        await page.waitForTimeout(100);
      }
      await activate(button('Pause')); const paused = await read(); assert(paused.simulation.time >= 6);
      const travel = {};
      for (const id of ['output', 'cart-a', 'jaw-left-tip', 'jaw-right-tip']) {
        const start = original.joints[id].position;
        travel[id] = Math.max(...samples.map(s => Math.hypot(s.graph.joints[id].position.x - start.x, s.graph.joints[id].position.y - start.y)));
      }
      assert(travel.output > 35 && travel['cart-a'] > 140 && travel['jaw-left-tip'] > 30 && travel['jaw-right-tip'] > 30, JSON.stringify(travel));
      for (const s of samples) {
        assert(s.graph.joints['cart-a'].position.x >= 849.9);
        for (const id of original.bodies.base.jointIds) assert.deepEqual(s.graph.joints[id].position, original.joints[id].position);
        for (const j of Object.values(s.graph.joints)) assert(Number.isFinite(j.position.x) && Number.isFinite(j.position.y));
      }
      for (const id of Object.keys(original.tracers)) assert((paused.simulation.tracerPaths[id] ?? []).length > 5, 'Tracer ' + id);
      for (const id of Object.keys(original.forceSensors)) {
        const readings = paused.simulation.forceSensorData[id] ?? [];
        assert(readings.length > 5 && readings.every(p => Number.isFinite(p.force)) && readings.some(p => Math.abs(p.force) > .001), 'Real load signal ' + id);
      }
      const pixels = await page.locator('canvas').evaluate(c => {
        const data = c.getContext('2d').getImageData(0, 0, c.width, c.height).data; let colored = 0;
        for (let i = 0; i < data.length; i += 4) if (Math.max(data[i], data[i + 1], data[i + 2]) - Math.min(data[i], data[i + 1], data[i + 2]) > 40) colored++;
        return colored;
      }); assert(pixels > 500, 'Mechanisms must actually render colored pixels');
      await page.screenshot({ path: join(output, profile.id + '-running.png') });
      const expand = button('Expand panel'); if (await expand.isVisible()) await activate(expand);
      await activate(button('Connecting rod load properties'));
      const chart = page.getByRole('img', { name: 'Axial force history (model units)', exact: true });
      await chart.scrollIntoViewIfNeeded();
      await page.waitForFunction(() => {
        const c = document.querySelector('canvas[aria-label="Axial force history (model units)"]');
        return c?.width > 80 && c?.height >= 96;
      });
      const chartInk = await chart.evaluate(c => {
        const d = c.getContext('2d').getImageData(0, 0, c.width, c.height).data; let ink = 0;
        for (let i = 3; i < d.length; i += 4) if (d[i] > 0) ink++;
        return ink;
      }); assert(chartInk > 100, 'Sensor chart must render actual nonblank history');
      await page.screenshot({ path: join(output, profile.id + '-sensor.png') });
      await activate(button('Collapse panel'));
      await activate(button('Resume'));
      const drag = await read(), rect = await page.locator('canvas').boundingBox(), p = drag.graph.joints['cart-a'].position;
      const point = { x: rect.x + drag.editor.camera.pan.x + p.x * drag.editor.camera.zoom,
        y: rect.y + drag.editor.camera.pan.y + p.y * drag.editor.camera.zoom };
      await page.mouse.move(point.x, point.y); await page.mouse.down();
      await page.mouse.move(point.x + 90 * drag.editor.camera.zoom, point.y, { steps: 18 });
      await page.waitForTimeout(600); const pulled = await read(); await page.mouse.up();
      assert(pulled.graph.joints['cart-a'].position.x > p.x + 20, 'Native drag must pull the carriage');
      await activate(button('Pause')); await mode('Create');
      assert.deepEqual((await read()).graph, original, 'Create restores the exact design');
      const downloadPromise = page.waitForEvent('download'); await activate(button('Save')); const download = await downloadPromise;
      const savedPath = join(output, profile.id + '-saved.slinker'); await download.saveAs(savedPath);
      await open(savedPath); const reopened = (await read()).graph;
      for (const key of ['joints', 'links', 'bodies', 'springs', 'sliders', 'colliders', 'outlines', 'tracers', 'forceSensors']) assert.deepEqual(reopened[key], original[key], 'Reopen ' + key);
      await mode('Simulate'); await page.waitForFunction(() => __LINKAGE_G0_READ__.simulation().time > .3);
      assert.equal((await read()).simulation.stepError, null); await activate(button('Pause'));
      assert.deepEqual(errors, []);
      results.push({ profile, passed: true, travel, pixels, chartInk, time: paused.simulation.time, samples: samples.length, dragTravel: pulled.graph.joints['cart-a'].position.x - p.x });
      console.log(JSON.stringify(results.at(-1)));
    } catch (error) {
      await page.screenshot({ path: join(output, profile.id + '-FAILED.png') }).catch(() => {});
      results.push({ profile, passed: false, failure: error.stack, errors }); throw error;
    } finally {
      await context.close(); await page.video().saveAs(join(output, profile.id + '.webm'));
      await writeFile(join(output, 'progress.json'), JSON.stringify(results, null, 2));
    }
  }
} finally {
  await browser.close();
  const sourceEnd = await candidateFingerprint(), passed = results.length === 3 && results.every(r => r.passed) && sourceStart.sourceSha256 === sourceEnd.sourceSha256;
  await writeFile(join(output, 'report.json'), JSON.stringify({ sourceStart, sourceEnd, fixtureSha256, engine, results, passed, physicalIPadVerified: false }, null, 2));
  console.log(JSON.stringify({ output, passed }));
}
