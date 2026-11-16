import { chromium, webkit } from '../../.rebuild.local/tooling/node_modules/playwright/index.mjs';
import assert from 'node:assert/strict';
import { mkdir, mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { candidateFingerprint, assertCandidateBuild } from './candidate-fingerprint.mjs';

const root = fileURLToPath(new URL('../../', import.meta.url));
const sourceStart = await candidateFingerprint();
const parent = join(root, '.rebuild.local/evidence/g4');
await mkdir(parent, { recursive: true });
const output = await mkdtemp(join(parent, 'bodies-'));
const engine = process.argv[2] ?? 'chromium';
assert(['chromium', 'webkit'].includes(engine), 'Use chromium or webkit');
const browser = engine === 'webkit' ? await webkit.launch({ headless: true })
  : await chromium.launch({ channel: 'chrome', headless: true });
const results = [];
const { archive } = JSON.parse(await readFile(join(root, '.rebuild.local/runtimes.json'), 'utf8'));
const profiles = [
  { id: 'desktop', width: 1440, height: 1000, touch: false },
  { id: 'tablet', width: 1024, height: 1366, touch: true },
];

try {
  for (const profile of profiles) {
    const context = await browser.newContext({ viewport: { width: profile.width, height: profile.height },
      hasTouch: profile.touch, isMobile: profile.touch, deviceScaleFactor: profile.touch ? 2 : 1,
      serviceWorkers: 'block', acceptDownloads: true });
    await context.addInitScript(() => Object.defineProperty(window, 'showSaveFilePicker', { value: undefined, configurable: true }));
    const page = await context.newPage();
    page.setDefaultTimeout(7000);
    const errors = [], checks = [];
    page.on('pageerror', e => errors.push(e.message));
    page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
    page.on('dialog', d => d.accept(d.type() === 'prompt' ? 'g4-bodies.slinker' : undefined));
    const activate = locator => profile.touch ? locator.tap() : locator.click();
    const acceptDirtyOpen = async () => {
      const unsaved = page.getByRole('dialog', { name: 'Unsaved Changes', exact: true });
      if (await unsaved.isVisible()) await activate(unsaved.getByRole('button', { name: 'Discard and open', exact: true }));
    };
    const state = () => page.evaluate(() => globalThis.__LINKAGE_G0_READ__.mechanism());
    const editor = () => page.evaluate(() => globalThis.__LINKAGE_G0_READ__.editor());
    const button = name => page.getByRole('button', { name, exact: true });
    const row = id => page.locator(`.body-row[data-body-id="${id}"]`);
    const activeRows = () => page.locator('.body-row-active').evaluateAll(rows => rows.map(r => r.dataset.bodyId).sort());
    const membership = s => Object.fromEntries(Object.values(s.bodies).map(b => [b.id, b.jointIds]));
    let targets;
    try {
      await page.goto((process.argv[3] ?? process.env.LINKAGE_CANDIDATE_URL ?? 'http://127.0.0.1:5183/linkage-studio/'));
      await assertCandidateBuild(page, sourceStart);
      await page.waitForFunction(() => !!globalThis.__LINKAGE_G0_READ__?.mechanism);
      await page.screenshot({ path: join(output, `${profile.id}-initial.png`) });
      if (await page.getByTitle('Expand panel', { exact: true }).count()) await activate(page.getByTitle('Expand panel', { exact: true }));
      const initial = await state();
      await activate(button('+ Add Body'));
      let s = await state();
      const added = Object.values(s.bodies).find(b => !initial.bodies[b.id]);
      assert(added, 'Add Body must create a body');
      checks.push('named native Add Body control');

      // Keyboard activation of the edit command is independent of the pointer profile.
      await button(`Rename ${added.name}`).focus();
      await page.keyboard.press('Enter');
      let field = page.getByRole('textbox', { name: `Body name for ${added.name}`, exact: true });
      await field.fill('Arm g Backspace');
      assert.equal((await state()).bodies[added.id].name, added.name, 'Typing must not commit');
      await field.press('Escape');
      assert.equal((await state()).bodies[added.id].name, added.name);
      assert.equal(await button(`Rename ${added.name}`).evaluate(el => el === document.activeElement), true);
      await activate(button('Undo'));
      assert.equal((await state()).bodies[added.id], undefined, 'Canceled rename must not add history');
      await activate(button('Redo'));

      await activate(button(`Rename ${added.name}`));
      field = page.getByRole('textbox', { name: `Body name for ${added.name}`, exact: true });
      await field.fill('Wing arm');
      await field.press('Enter');
      assert.equal((await state()).bodies[added.id].name, 'Wing arm');
      await activate(button('Undo'));
      assert.equal((await state()).bodies[added.id].name, added.name, 'One undo must restore the original name');
      await activate(button('Redo'));
      assert.equal((await state()).bodies[added.id].name, 'Wing arm');
      await activate(button('Rename Wing arm'));
      field = page.getByRole('textbox', { name: 'Body name for Wing arm', exact: true });
      await field.fill('Canceled touch name');
      await activate(button('Cancel body rename'));
      assert.equal((await state()).bodies[added.id].name, 'Wing arm');
      await activate(button('Rename Wing arm'));
      field = page.getByRole('textbox', { name: 'Body name for Wing arm', exact: true });
      await field.fill('Touch arm');
      await activate(button('Save body name'));
      assert.equal((await state()).bodies[added.id].name, 'Touch arm');
      checks.push('keyboard/pointer rename, draft isolation, Escape/touch cancel, single-operation undo/redo, focus restore');

      // Keep the original G1 checkbox ordering: Base then Body 1.
      const body1 = Object.values(initial.bodies).find(b => b.id !== initial.baseBodyId);
      const activeCheckbox = page.getByRole('checkbox', { name: `Use ${body1.name} for new objects`, exact: true });
      if (!await activeCheckbox.isChecked()) await activate(activeCheckbox);
      let canvas = await page.locator('canvas').boundingBox();
      const point = { x: canvas.x + canvas.width * .4, y: canvas.y + canvas.height * .3 };
      if (profile.touch) await page.touchscreen.tap(point.x, point.y); else await page.mouse.click(point.x, point.y);
      await page.waitForFunction(() => Object.values(globalThis.__LINKAGE_G0_READ__.mechanism().joints).some(j => !j.hidden));
      s = await state();
      const joint = Object.values(s.joints).find(j => !j.hidden);
      assert(s.bodies[body1.id].jointIds.includes(joint.id));
      await page.waitForTimeout(550);
      const camera = (await editor()).camera;
      const jp = { x: canvas.x + camera.pan.x + joint.position.x * camera.zoom,
        y: canvas.y + camera.pan.y + joint.position.y * camera.zoom };
      if (profile.touch) await page.touchscreen.tap(jp.x, jp.y); else await page.mouse.click(jp.x, jp.y);
      const member = page.getByRole('checkbox', { name: 'Selected joint belongs to Touch arm', exact: true });
      await member.waitFor();
      const activeBefore = await activeRows();
      // Clicking the name label retains the old row's membership action exactly once.
      await activate(row(added.id).locator('.body-name'));
      assert((await state()).bodies[added.id].jointIds.includes(joint.id));
      assert.equal(await member.isChecked(), true);
      assert.deepEqual(await activeRows(), activeBefore);
      await activate(button('Undo'));
      assert.equal((await state()).bodies[added.id].jointIds.includes(joint.id), false);
      await member.focus(); await page.keyboard.press('Space');
      assert((await state()).bodies[added.id].jointIds.includes(joint.id));
      checks.push('name-label and keyboard membership, one-click/one-undo, active creation selection unchanged');

      const beforeColor = await state(), assigned = membership(beforeColor);
      await activate(button('Change color of Touch arm'));
      assert.notEqual((await state()).bodies[added.id].color, beforeColor.bodies[added.id].color);
      assert.deepEqual(membership(await state()), assigned, 'Swatch must not change membership');
      await activate(button('Undo'));
      assert.equal((await state()).bodies[added.id].color, beforeColor.bodies[added.id].color);
      await activate(button('Rename Touch arm'));
      await page.getByRole('textbox', { name: 'Body name for Touch arm', exact: true }).fill('Canceled assignment');
      await activate(button('Cancel body rename'));
      assert.deepEqual(membership(await state()), assigned, 'Rename must not change membership');
      await page.screenshot({ path: join(output, `${profile.id}-membership.png`) });
      checks.push('color native swatch/undo and rename have no membership side effects');

      await activate(button('Delete body Touch arm'));
      assert.equal((await state()).bodies[added.id], undefined);
      await activate(button('Undo'));
      assert((await state()).bodies[added.id]);
      assert.deepEqual(membership(await state()), assigned);
      checks.push('named icon deletion/undo preserves memberships');

      const chooser = page.waitForEvent('filechooser');
      await activate(button('Open')); await acceptDirtyOpen();
      // Synthetic nested-entity fixture goes through the real import control, never a store setter.
      const fixture = JSON.parse(await readFile(join(archive, 'fixtures', 'airer.slinker'), 'utf8'));
      const owner = Object.values(fixture.bodies).find(b => b.id !== fixture.baseBodyId && b.jointIds.length >= 2);
      fixture.outlines = { ...fixture.outlines, g4outline: { id: 'g4outline', bodyId: owner.id,
        name: 'G4 outline', visible: true, points: [{ x: 0, y: 0 }, { x: 30, y: 0 }, { x: 0, y: 20 }] } };
      fixture.tracers = { ...fixture.tracers, g4tracer: { id: 'g4tracer', bodyId: owner.id,
        localPosition: { x: 10, y: 10 }, enabled: true } };
      fixture.images = { ...fixture.images, g4image: { id: 'g4image', bodyId: owner.id,
        src: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aB1sAAAAASUVORK5CYII=',
        position: { x: 10, y: 10 }, scale: 1, naturalWidth: 1, naturalHeight: 1,
        rotation: 0, opacity: 1, visible: true } };
      await (await chooser).setFiles({ name: 'g4-airer-with-synthetic-children.slinker',
        mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(fixture)) });
      await page.waitForFunction(() => document.querySelector('.top-bar')?.getAttribute('aria-busy') === 'false');
      s = await state();
      const outlined = Object.values(s.bodies).find(b => Object.values(s.outlines).some(o => o.bodyId === b.id));
      assert(outlined, 'Imported synthetic child fixture must have an outline body');
      const outlinedRow = row(outlined.id);
      const linksBody = Object.values(s.bodies).find(b => b.id !== s.baseBodyId && b.jointIds.length >= 2);
      const linkButton = button(`${linksBody.showLinks ? 'Hide' : 'Show'} links for ${linksBody.name}`);
      await linkButton.focus(); await page.keyboard.press('Enter');
      assert.equal((await state()).bodies[linksBody.id].showLinks, !linksBody.showLinks);
      const coa = outlinedRow.getByRole('button', { name: `Use outline center of area for ${outlined.name}`, exact: true });
      await coa.focus(); await page.keyboard.press('Space');
      assert.equal((await state()).bodies[outlined.id].useOutlineCOM, !outlined.useOutlineCOM);
      await activate(outlinedRow.getByRole('button', { name: `Collapse ${outlined.name}`, exact: true }));
      assert.equal(await page.locator(`[id="body-children-${outlined.id}"]`).count(), 0);
      const expand = outlinedRow.getByRole('button', { name: `Expand ${outlined.name}`, exact: true });
      await expand.focus(); await page.keyboard.press('Enter');
      assert.equal(await page.locator(`[id="body-children-${outlined.id}"]`).count(), 1);
      assert.deepEqual(membership(await state()), membership(s));
      checks.push('keyboard named COM/link/collapse controls, child content preserved, no membership effects');

      const children = page.locator(`[id="body-children-${outlined.id}"]`);
      await activate(children.getByRole('button', { name: 'Hide shape', exact: true }));
      assert.equal((await state()).outlines.g4outline.visible, false);
      await activate(children.getByRole('button', { name: 'Show shape', exact: true }));
      const editShape = children.getByRole('button', { name: 'Edit shape vertices', exact: true });
      const editColor = await editShape.evaluate(el => getComputedStyle(el).color);
      await activate(editShape);
      assert.notEqual(await editShape.evaluate(el => getComputedStyle(el).color), editColor);
      await activate(editShape);
      assert.equal(await editShape.evaluate(el => getComputedStyle(el).color), editColor);
      await activate(children.getByRole('button', { name: 'Hide image', exact: true }));
      await activate(children.getByRole('button', { name: 'Show image', exact: true }));
      await children.locator('input[type=range]').fill('55');
      assert.equal(await children.locator('input[type=range]').inputValue(), '55');
      await activate(children.getByRole('button', { name: 'Disable tracer', exact: true }));
      await activate(children.getByRole('button', { name: 'Enable tracer', exact: true }));
      const downloadEvent = page.waitForEvent('download');
      await activate(button('Save'));
      const savedPath = join(output, `${profile.id}-children.slinker`);
      await (await downloadEvent).saveAs(savedPath);
      const saved = JSON.parse(await readFile(savedPath, 'utf8'));
      assert.equal(saved.images.g4image.visible, true);
      assert.equal(saved.images.g4image.opacity, .55);
      assert.equal(saved.tracers.g4tracer.enabled, true);
      assert.equal(saved.outlines.g4outline.visible, true);
      checks.push('synthetic child outline eye/edit exit, image eye/opacity, tracer enable; actual saved-file assertions');

      targets = await page.locator('.body-row').evaluateAll(rows => rows.flatMap(row =>
        [...row.querySelectorAll('button:not(:disabled), label.body-selection')].map(el => {
          const r = el.getBoundingClientRect();
          return { name: el.getAttribute('aria-label') ?? el.getAttribute('title'), width: r.width, height: r.height,
            coarse: matchMedia('(pointer: coarse)').matches };
        })));
      if (profile.touch) {
        assert(targets.every(t => t.coarse), 'Touch profile must actually use coarse pointer styling');
        assert(targets.every(t => t.width >= 44 && t.height >= 44), JSON.stringify(targets));
      }
      await outlinedRow.scrollIntoViewIfNeeded();
      await page.screenshot({ path: join(output, `${profile.id}-children.png`) });
      checks.push('measured native-control targets; 44px minimum for coarse pointer');

      await activate(await button('Simulate').count() ? button('Simulate') : page.getByTitle('Simulate mode', { exact: true }));
      assert.equal(await page.locator('.body-panel').evaluate(el => el.inert), true);
      const bodyIds = Object.keys((await state()).bodies).sort();
      const inertAdd = button('+ Add Body');
      await inertAdd.scrollIntoViewIfNeeded();
      const addBounds = await inertAdd.boundingBox();
      if (profile.touch) await page.touchscreen.tap(addBounds.x + addBounds.width / 2, addBounds.y + addBounds.height / 2);
      else await page.mouse.click(addBounds.x + addBounds.width / 2, addBounds.y + addBounds.height / 2);
      assert.deepEqual(Object.keys((await state()).bodies).sort(), bodyIds, 'Inert body controls must reject real pointer activation');
      await inertAdd.focus();
      assert.equal(await page.locator('.body-panel').evaluate(el => el.contains(document.activeElement)), false,
        'Inert controls must reject keyboard focus');
      await activate(await button('Create').count() ? button('Create') : page.getByTitle('Create mode', { exact: true }));
      assert.equal(await page.locator('.body-panel').evaluate(el => el.inert), false);
      assert.deepEqual(membership(await state()), membership(s));
      assert.equal(errors.length, 0, errors.join('\n'));
      checks.push('simulate inert/read-only body guard and Create restoration; no console/page errors');
      results.push({ profile, passed: true, checks, targets, errors });
    } catch (e) {
      await page.screenshot({ path: join(output, `${profile.id}-FAILED.png`) });
      results.push({ profile, passed: false, checks, targets, errors, failure: e.stack });
    } finally { await context.close(); }
    console.log(JSON.stringify(results.at(-1)));
  }
} finally { await browser.close(); }
const sourceEnd = await candidateFingerprint();
const stableSource = sourceStart.sourceSha256 === sourceEnd.sourceSha256;
const report = { createdAt: new Date().toISOString(), engine, browser: browser.version(), sourceStart, sourceEnd,
  stableSource, results, physicalIPadVerified: false, voiceOverVerified: false };
await writeFile(join(output, 'report.json'), JSON.stringify(report, null, 2));
console.log(JSON.stringify({ output, stableSource, passed: stableSource && results.every(r => r.passed) }));
if (!stableSource || results.some(r => !r.passed)) process.exitCode = 1;
