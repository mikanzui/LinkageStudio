import { chromium, webkit } from '../../.rebuild.local/tooling/node_modules/playwright/index.mjs';
import assert from 'node:assert/strict';
import { mkdir, mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';

import { candidateFingerprint, assertCandidateBuild } from './candidate-fingerprint.mjs';
const root = fileURLToPath(new URL('../../', import.meta.url));
const sourceStart = await candidateFingerprint();
const engine = process.argv[2] ?? 'chromium';
const browser = engine === 'webkit' ? await webkit.launch() : await chromium.launch({ channel: 'chrome' });
const parent = join(root, '.rebuild.local/evidence/g2'); await mkdir(parent, { recursive: true });
const output = await mkdtemp(join(parent, `${engine}-`));
const { archive } = JSON.parse(await readFile(join(root, '.rebuild.local/runtimes.json'), 'utf8'));
const results = [];
const body = (id, jointIds) => ({ id, name: id, jointIds, color: '#4caf50', useOutlineCOM: false, showLinks: true });
const j = (id, x, y, type = 'revolute') => ({ id, type, position: { x, y }, connectedLinkIds: ['arm'] });
const rod = { version: '0.11.15', baseBodyId: 'base', projectName: 'G2 rod', joints: { a: j('a', 150, 150, 'fixed'), b: j('b', 300, 150) },
  links: { arm: { id: 'arm', jointIds: ['a', 'b'], restLength: 150, mass: 1 } }, bodies: { base: body('base', ['a']), arm: body('arm', ['a', 'b']) }, outlines: {},
  viewPreferences: { camera: { pan: { x: 0, y: 0 }, zoom: 1 } }, simulationSettings: { gravityEnabled: false, gravityStrength: 250, damping: .5, dragMultiplier: 25, dragDamping: .25 } };
const distance = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
try {
  for (const touch of [false, true]) {
    const context = await browser.newContext({ viewport: { width: touch ? 1024 : 1440, height: touch ? 1366 : 1000 }, hasTouch: touch, isMobile: touch, serviceWorkers: 'block' });
    const page = await context.newPage(); page.setDefaultTimeout(8000);
    const errors = [], checks = [], traces = [];
    page.on('pageerror', e => errors.push(e.message)); page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
    page.on('dialog', d => d.accept());
    const activate = locator => touch ? locator.tap() : locator.click();
    const acceptDirtyOpen = async () => {
      const unsaved = page.getByRole('dialog', { name: 'Unsaved Changes', exact: true });
      if (await unsaved.isVisible()) await activate(unsaved.getByRole('button', { name: 'Discard and open', exact: true }));
    };
    const mode = async name => {
      const expanded = page.getByRole('button', { name, exact: true });
      await activate(await expanded.isVisible() ? expanded : page.getByTitle(`${name} mode`, { exact: true }));
    };
    const expandPanel = async () => {
      const expand = page.getByTitle('Expand panel', { exact: true });
      if (await expand.isVisible()) await activate(expand);
      await page.locator('.right-panel').waitFor({ state: 'visible' });
    };
    const snapshot = () => page.evaluate(() => ({ mechanism: __LINKAGE_G0_READ__.mechanism(), simulation: __LINKAGE_G0_READ__.simulation(), editor: __LINKAGE_G0_READ__.editor() }));
    const open = async file => {
      const picker = page.waitForEvent('filechooser'); await activate(page.getByRole('button', { name: 'Open', exact: true })); await acceptDirtyOpen(); await (await picker).setFiles(file);
      await page.waitForFunction(() => document.querySelector('.top-bar').getAttribute('aria-busy') === 'false');
    };
    const openData = data => open({ name: 'g2.slinker', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(data)) });
    try {
      await page.goto((process.argv[3] ?? process.env.LINKAGE_CANDIDATE_URL ?? 'http://127.0.0.1:5183/linkage-studio/'));
      await assertCandidateBuild(page, sourceStart);
      await openData(rod); const design = await snapshot();
      await mode('Simulate');
      await page.waitForFunction(() => __LINKAGE_G0_READ__.simulation().time > .05);
      const rect = await page.locator('canvas').boundingBox();
      const start = { x: rect.x + 300, y: rect.y + 150 }, end = { x: rect.x + 150, y: rect.y + 300 };
      if (touch && engine === 'chromium') {
        const cdp = await context.newCDPSession(page);
        await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ ...start, id: 1 }] });
        for (let i = 1; i <= 30; i++) {
          await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: start.x + (end.x-start.x)*i/30, y: start.y + (end.y-start.y)*i/30, id: 1 }] });
          await page.waitForTimeout(20); traces.push(await snapshot());
        }
        await page.waitForTimeout(300); await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
      } else if (!touch) {
        await page.mouse.move(start.x, start.y); await page.mouse.down();
        for (let i = 1; i <= 30; i++) { await page.mouse.move(start.x + (end.x-start.x)*i/30, start.y + (end.y-start.y)*i/30); await page.waitForTimeout(20); traces.push(await snapshot()); }
        await page.waitForTimeout(300); await page.mouse.up();
      } else {
        // WebKit exposes taps but no trusted multi-point drag API here. Test tap/select
        // separately; dynamic motion comes from gravity, not synthetic pointer claims.
        await page.touchscreen.tap(start.x, start.y);
        await expandPanel();
        await page.getByRole('checkbox', { name: 'Gravity', exact: true }).check();
        const collapse = page.getByTitle('Collapse panel', { exact: true });
        if (await collapse.isVisible()) await activate(collapse);
        await page.waitForTimeout(900); traces.push(await snapshot());
      }
      const moved = await snapshot(); assert(distance(moved.mechanism.joints.b.position, rod.joints.b.position) > 20);
      for (const state of [...traces, moved]) {
        assert.equal(state.simulation.stepError, null);
        assert.deepEqual(state.mechanism.joints.a.position, rod.joints.a.position);
        assert(Math.abs(distance(state.mechanism.joints.a.position, state.mechanism.joints.b.position) - 150) < 1e-3);
      }
      checks.push(touch && engine === 'webkit' ? 'touch-tap/gravity rigid motion; trusted drag unavailable' : 'trusted pointer drag/rigidity/fixed support');
      await activate(page.getByRole('button', { name: 'Pause', exact: true })); const paused = await snapshot(); await page.waitForTimeout(250);
      const still = await snapshot(); assert.equal(still.simulation.time, paused.simulation.time); assert.deepEqual(still.mechanism, paused.mechanism);
      await activate(page.getByRole('button', { name: 'Resume', exact: true })); await page.waitForTimeout(100); assert((await snapshot()).simulation.time > paused.simulation.time);
      checks.push('pause halts positions/time; resume advances');
      await mode('Create'); assert.deepEqual((await snapshot()).mechanism, design.mechanism);
      checks.push('exact graph/pose restoration');
      for (let cycle = 0; cycle < 10; cycle++) {
        await mode('Simulate'); await page.waitForTimeout(40);
        await mode('Create'); assert.deepEqual((await snapshot()).mechanism, design.mechanism);
      }
      checks.push('ten repeated mode cycles');
      for (const name of ['airer.slinker', 'working-screen.json', 'airer.slinker']) {
        await open(join(archive, 'fixtures', name)); const before = await snapshot();
        await mode('Simulate'); await page.waitForTimeout(200);
        const compiled = await snapshot(); assert.equal(compiled.simulation.stepError, null); assert(compiled.simulation.time > 0);
        for (const [id, link] of Object.entries(before.mechanism.links)) assert.deepEqual(compiled.mechanism.links[id], link);
        await mode('Create'); assert.deepEqual((await snapshot()).mechanism, before.mechanism);
      }
      checks.push('real A/B/A imports compile/step/restore without saved-link mutation');
      const invalid = structuredClone(rod); invalid.bodies.base.jointIds.push('b'); invalid.joints.b.type = 'fixed'; invalid.links.arm.restLength = 50;
      await openData(invalid); const badDesign = await snapshot(); await mode('Simulate');
      await page.getByRole('alert').filter({ hasText: 'Constraint error' }).waitFor();
      const failed = await snapshot(); await page.waitForTimeout(200); const failedStill = await snapshot();
      assert.equal(failed.simulation.isPlaying, false); assert.equal(failed.simulation.time, 0); assert.equal(failedStill.simulation.time, 0);
      assert.deepEqual(failedStill.mechanism, failed.mechanism); checks.push('known-bad frame rejected atomically; time stops; visible error');
      await mode('Create'); assert.deepEqual((await snapshot()).mechanism, badDesign.mechanism);
      await page.screenshot({ path: join(output, `${touch ? 'touch' : 'mouse'}-failure-recovery.png`) });
      assert.equal(errors.length, 0, errors.join('\n'));
      results.push({ touch, passed: true, checks, errors, handleTravel: distance(moved.mechanism.joints.b.position, rod.joints.b.position) });
      await writeFile(join(output, `${touch ? 'touch' : 'mouse'}-traces.json`), JSON.stringify(traces, null, 2));
    } catch (error) {
      await page.screenshot({ path: join(output, `${touch ? 'touch' : 'mouse'}-FAILED.png`) });
      results.push({ touch, passed: false, checks, errors, error: error.stack });
    } finally { await context.close(); }
    console.log(JSON.stringify(results.at(-1)));
  }
} finally { await browser.close(); }
const sourceEnd = await candidateFingerprint();
if (sourceEnd.sourceSha256 !== sourceStart.sourceSha256) results.push({ passed: false, error: 'Candidate source changed during test run.' });
await writeFile(join(output, 'report.json'), JSON.stringify({ sourceStart, sourceEnd, engine, browser: browser.version(), results, physicalIPadVerified: false }, null, 2));
console.log(JSON.stringify({ output, passed: results.every(r => r.passed) }));
if (results.some(r => !r.passed)) process.exitCode = 1;
