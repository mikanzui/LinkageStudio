import { chromium, webkit } from '../../.rebuild.local/tooling/node_modules/playwright/index.mjs';
import assert from 'node:assert/strict';
import { mkdir, readFile, writeFile, mkdtemp } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';
import { createHash } from 'node:crypto';

import { candidateFingerprint, assertCandidateBuild } from './candidate-fingerprint.mjs';
const root = fileURLToPath(new URL('../../', import.meta.url));
const sourceStart = await candidateFingerprint();
const parent = join(root, '.rebuild.local/evidence/g1');
await mkdir(parent, { recursive: true });
const output = await mkdtemp(join(parent, 'browser-'));
const { archive } = JSON.parse(await readFile(join(root, '.rebuild.local/runtimes.json'), 'utf8'));
const engine = process.argv[2] ?? 'chromium';
if (!['chromium', 'webkit'].includes(engine)) throw new Error('Unknown browser engine');
const browser = engine === 'webkit' ? await webkit.launch({ headless: true }) : await chromium.launch({ channel: 'chrome', headless: true });
const results = [];
const profiles = [
  { id: 'desktop', width: 1440, height: 1000, touch: false },
  { id: 'tablet-portrait', width: 1024, height: 1366, touch: true },
  { id: 'tablet-landscape', width: 1366, height: 1024, touch: true },
  { id: 'tablet-split', width: 512, height: 1000, touch: true },
];
try {
  for (const profile of profiles) {
    const context = await browser.newContext({ viewport: { width: profile.width, height: profile.height },
      hasTouch: profile.touch, isMobile: profile.touch, deviceScaleFactor: profile.touch ? 2 : 1, serviceWorkers: 'block', acceptDownloads: true });
    // Exercise the browser path Safari needs: no File System Access API.
    await context.addInitScript(() => Object.defineProperty(window, 'showSaveFilePicker', { value: undefined, configurable: true }));
    const page = await context.newPage(); page.setDefaultTimeout(7000);
    const errors = []; const checks = [];
    page.on('pageerror', e => errors.push(e.message));
    page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
    let dismissConfirm = false;
    page.on('dialog', dialog => dialog.type() === 'confirm' && dismissConfirm ? dialog.dismiss() : dialog.accept(dialog.type() === 'prompt' ? 'roundtrip.slinker' : undefined));
    const activate = locator => profile.touch ? locator.tap() : locator.click();
    const acceptDirtyOpen = async () => {
      const unsaved = page.getByRole('dialog', { name: 'Unsaved Changes', exact: true });
      if (await unsaved.isVisible()) await activate(unsaved.getByRole('button', { name: 'Discard and open', exact: true }));
    };
    const expandPanel = async () => {
      const expand = page.getByTitle('Expand panel', { exact: true });
      if (await expand.isVisible()) await activate(expand);
      await page.locator('.right-panel').waitFor({ state: 'visible' });
    };
    const clearCanvasOverlay = async () => {
      if (profile.width >= 1100) return;
      for (const title of ['Collapse toolbar', 'Collapse panel']) {
        const collapse = page.getByTitle(title, { exact: true });
        if (await collapse.isVisible()) await activate(collapse);
      }
    };
    const state = () => page.evaluate(() => globalThis.__LINKAGE_G0_READ__.mechanism());
    const visibleJoints = s => Object.values(s.joints).filter(j => !j.hidden);
    const open = async file => {
      const chooser = page.waitForEvent('filechooser');
      await activate(page.getByRole('button', { name: 'Open', exact: true })); await acceptDirtyOpen();
      await (await chooser).setFiles(file);
      await page.waitForFunction(() => document.querySelector('.top-bar')?.getAttribute('aria-busy') === 'false');
    };
    try {
      await page.goto((process.argv[3] ?? process.env.LINKAGE_CANDIDATE_URL ?? 'http://127.0.0.1:5183/linkage-studio/'));
      await assertCandidateBuild(page, sourceStart);
      await page.waitForFunction(() => !!globalThis.__LINKAGE_G0_READ__?.mechanism);
      if (profile.width < 1100) await page.locator('.panel-collapsed').waitFor({ state: 'visible' });
      await expandPanel();
      await activate(page.locator('.right-panel input[type=checkbox]').nth(1));
      await clearCanvasOverlay();
      let box = await page.locator('canvas').boundingBox(); assert(box.width > 0 && box.height > 0);
      const point = { x: box.x + box.width * .4, y: box.y + box.height * .3 };
      if (profile.touch) await page.touchscreen.tap(point.x, point.y); else await page.mouse.click(point.x, point.y);
      await page.waitForFunction(() => Object.values(globalThis.__LINKAGE_G0_READ__.mechanism().joints).filter(j => !j.hidden).length === 1);
      let s = await state(); const id = visibleJoints(s)[0].id;
      assert(s.bodies.body1.jointIds.includes(id));
      // This scenario tests selection then membership, not the separate double-tap fixed toggle.
      await page.waitForTimeout(550);
      const camera = await page.evaluate(() => globalThis.__LINKAGE_G0_READ__.editor().camera);
      const jointPoint = { x: box.x + camera.pan.x + s.joints[id].position.x * camera.zoom, y: box.y + camera.pan.y + s.joints[id].position.y * camera.zoom };
      if (profile.touch) await page.touchscreen.tap(jointPoint.x, jointPoint.y); else await page.mouse.click(jointPoint.x, jointPoint.y);
      await expandPanel();
      await activate(page.locator('.right-panel input[type=checkbox]').nth(0));
      s = await state(); assert(s.bodies.base.jointIds.includes(id)); assert.equal(s.joints[id].type, 'fixed');
      await activate(page.getByRole('button', { name: 'Undo', exact: true })); assert.equal((await state()).joints[id].type, 'revolute');
      await activate(page.getByRole('button', { name: 'Redo', exact: true })); assert.equal((await state()).joints[id].type, 'fixed');
      checks.push('real-pointer create/body assignment/fix/undo/redo');
      const xInput = page.getByRole('spinbutton', { name: 'Joint X', exact: true });
      const oldX = (await state()).joints[id].position.x;
      await xInput.fill(String(oldX + 25)); await xInput.press('Enter');
      assert.equal((await state()).joints[id].position.x, oldX + 25);
      await activate(page.getByRole('button', { name: 'Undo', exact: true })); assert.equal((await state()).joints[id].position.x, oldX);
      await xInput.fill('999'); await xInput.press('Escape'); assert.equal((await state()).joints[id].position.x, oldX);
      checks.push('coordinate commit/undo/Escape cancellation');
      await activate(page.locator('.project-name')); const name = page.getByRole('textbox', { name: 'Project name', exact: true });
      await name.fill('grid g Backspace'); await name.press('ControlOrMeta+a'); await name.press('Backspace'); await name.fill('G1 test'); await name.press('Enter');
      assert.equal(visibleJoints(await state()).length, 1); checks.push('text-field shortcuts cannot edit graph');
      const deleteButton = page.getByRole('button', { name: 'Delete', exact: true });
      await activate(await deleteButton.isVisible() ? deleteButton : page.getByTitle('Delete selected', { exact: true })); assert.equal(visibleJoints(await state()).length, 0);
      await activate(page.getByRole('button', { name: 'Undo', exact: true })); assert.equal(visibleJoints(await state()).length, 1);
      checks.push('UI delete/undo');
      const beforeSaveCancel = JSON.stringify(await state());
      await page.evaluate(() => Object.defineProperty(window, 'showSaveFilePicker', { configurable: true,
        value: async () => { throw new DOMException('Test cancellation', 'AbortError'); } }));
      await activate(page.getByRole('button', { name: 'Save', exact: true }));
      await page.getByRole('status').filter({ hasText: 'Save cancelled' }).waitFor();
      assert.equal(JSON.stringify(await state()), beforeSaveCancel);
      await page.evaluate(() => Object.defineProperty(window, 'showSaveFilePicker', { configurable: true, value: undefined }));
      checks.push('native-save cancellation is not success');
      const beforeOpenCancel = await state();
      let pickerOpened = false; const onChooser = () => { pickerOpened = true; }; page.on('filechooser', onChooser);
      await activate(page.getByRole('button', { name: 'Open', exact: true }));
      const unsaved = page.getByRole('dialog', { name: 'Unsaved Changes', exact: true });
      await unsaved.waitFor({ state: 'visible' });
      assert.equal(pickerOpened, false, 'Dirty Open must not open a chooser before a decision');
      await activate(unsaved.getByRole('button', { name: 'Cancel', exact: true }));
      await unsaved.waitFor({ state: 'hidden' });
      await page.waitForTimeout(50); assert.equal(pickerOpened, false); page.off('filechooser', onChooser);
      assert.deepEqual(await state(), beforeOpenCancel);
      assert.equal(visibleJoints(await state()).length, 1);
      checks.push('dirty-open cancellation preserves graph');
      for (const fixture of ['airer.slinker', 'working-screen.json']) {
        const file = join(archive, 'fixtures', fixture), original = JSON.parse(await readFile(file, 'utf8'));
        await open(file);
        s = await state();
        assert.equal(visibleJoints(s).length, Object.keys(original.joints).length);
        assert.deepEqual(Object.keys(s.links).sort(), Object.keys(original.links).sort());
        const beforeInvalid = JSON.stringify(s);
        await open({ name: 'invalid.slinker', mimeType: 'application/json', buffer: Buffer.from('{') });
        assert.equal(JSON.stringify(await state()), beforeInvalid);
        assert.match(await page.getByRole('alert').innerText(), /Invalid JSON/);
        const feedback = await page.getByRole('alert').boundingBox(); assert(feedback.y >= 0 && feedback.y + feedback.height <= profile.height);
        const downloadEvent = page.waitForEvent('download');
        await activate(page.getByRole('button', { name: 'Save', exact: true }));
        const download = await downloadEvent; const savedPath = join(output, `${profile.id}-${fixture}`); await download.saveAs(savedPath);
        const saved = JSON.parse(await readFile(savedPath, 'utf8'));
        assert.equal(saved.sourceVersion, original.version); assert.equal(saved.simulationModel, 'saved-links-v1');
        for (const kind of ['joints', 'links', 'bodies', 'outlines', 'images', 'sliders', 'colliders', 'tracers']) {
          assert.deepEqual(Object.keys(saved[kind] ?? {}).sort(), Object.keys(original[kind] ?? {}).sort(), kind);
          for (const [entityId, entity] of Object.entries(original[kind] ?? {})) for (const [key, value] of Object.entries(entity)) assert.deepEqual(saved[kind][entityId][key], value, `${kind}.${entityId}.${key}`);
        }
        assert.match(await page.getByRole('status').and(page.locator('.project-feedback')).innerText(), /not confirmed/);
        await open(savedPath);
        assert.equal(visibleJoints(await state()).length, Object.keys(original.joints).length);
        await page.screenshot({ path: join(output, `${profile.id}-${fixture}.png`) });
        checks.push(`${fixture}: UI import/invalid-preserve/download/complete-reopen`);
      }
      // Exercise actual cancel event without mutating app state.
      const beforeCancel = JSON.stringify(await state());
      const chooser = page.waitForEvent('filechooser'); await activate(page.getByRole('button', { name: 'Open', exact: true })); await acceptDirtyOpen(); await chooser;
      await page.locator('input[type=file]').evaluate(input => input.dispatchEvent(new Event('cancel')));
      await page.waitForFunction(() => document.querySelector('.top-bar').getAttribute('aria-busy') === 'false');
      assert.equal(JSON.stringify(await state()), beforeCancel); assert.equal(await page.locator('input[type=file]').count(), 0);
      checks.push('picker cancel cleanup/retry');
      const pixelStats = await page.locator('canvas').evaluate(c => {
        const d = c.getContext('2d').getImageData(0, 0, c.width, c.height).data; const colors = new Set();
        for (let i = 0; i < d.length; i += 128) colors.add(`${d[i]},${d[i+1]},${d[i+2]},${d[i+3]}`);
        return { colors: colors.size, width: c.width, height: c.height, touchAction: getComputedStyle(c).touchAction };
      });
      assert(pixelStats.colors > 10); assert.equal(pixelStats.touchAction, 'none');
      assert.equal(errors.length, 0, errors.join('\n'));
      results.push({ profile, passed: true, checks, errors, pixelStats });
    } catch (error) {
      await page.screenshot({ path: join(output, `${profile.id}-FAILED.png`) });
      results.push({ profile, passed: false, checks, errors, failure: error.stack });
    } finally { await context.close(); }
    console.log(JSON.stringify(results.at(-1)));
  }
} finally { await browser.close(); }
const sourceEnd = await candidateFingerprint();
if (sourceEnd.sourceSha256 !== sourceStart.sourceSha256) results.push({ passed: false, error: 'Candidate source changed during test run.' });
const report = { sourceStart, sourceEnd, createdAt: new Date().toISOString(), engine, browser: browser.version(), results, physicalIPadVerified: false };
await writeFile(join(output, 'report.json'), JSON.stringify(report, null, 2));
const bytes = await readFile(join(output, 'report.json'));
console.log(JSON.stringify({ output, reportSha256: createHash('sha256').update(bytes).digest('hex'), passed: results.every(x => x.passed) }));
if (results.some(x => !x.passed)) process.exitCode = 1;
