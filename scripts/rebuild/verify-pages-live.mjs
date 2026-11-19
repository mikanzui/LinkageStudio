import assert from 'node:assert/strict';
import { mkdir, mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { createHash } from 'node:crypto';
import { chromium, webkit } from '../../.rebuild.local/tooling/node_modules/playwright/index.mjs';
import { resolveBrowserPaths } from './source-paths.mjs';

const paths = resolveBrowserPaths(), engine = process.argv[2] ?? 'chromium';
const pkg = JSON.parse(await readFile(join(paths.candidate, 'package.json'), 'utf8'));
const catalog = JSON.parse(await readFile(join(paths.candidate, 'examples/catalog.json'), 'utf8'));
assert(['chromium', 'webkit'].includes(engine));
const url = process.argv[3] ?? 'https://mikanzui.github.io/LinkageStudio/';
const target = new URL(url);
assert(target.href === 'https://mikanzui.github.io/LinkageStudio/' ||
  (target.protocol === 'http:' && ['127.0.0.1', 'localhost'].includes(target.hostname) && target.pathname === '/LinkageStudio/'), 'Only the release site or an isolated loopback preview is supported');
const parent = join(paths.local, 'evidence/pages'); await mkdir(parent, { recursive: true });
const output = await mkdtemp(join(parent, engine + '-live-'));
const browser = engine === 'webkit' ? await webkit.launch() : await chromium.launch(process.argv.includes('--bundled-chromium') ? {} : { channel: 'chrome' });
const context = await browser.newContext({ viewport: engine === 'webkit' ? { width: 1024, height: 1100 } : { width: 1440, height: 1000 },
  hasTouch: engine === 'webkit', isMobile: engine === 'webkit', serviceWorkers: 'allow', acceptDownloads: true });
await context.addInitScript(() => Object.defineProperty(window, 'showSaveFilePicker', { value: undefined, configurable: true }));
const page = await context.newPage(), errors = [], checks = [];
page.on('pageerror', e => errors.push(e.message));
page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
page.on('dialog', d => d.accept(d.type() === 'prompt' ? d.defaultValue() : undefined));
const button = name => page.getByRole('button', { name, exact: true });
const activate = locator => engine === 'webkit' ? locator.tap() : locator.click();
async function mode(name) { const compact = button(name + ' mode'); await activate(await compact.isVisible() ? compact : button(name)); }
const colors = { crank: [46, 157, 85], carriage: [22, 138, 171], jaw: [190, 79, 134] };
const pixels = (palette = colors) => page.locator('canvas[aria-label="Mechanism canvas"]').evaluate((c, colors) => {
  const data = c.getContext('2d').getImageData(0, 0, c.width, c.height).data, scale = c.width / c.getBoundingClientRect().width;
  return Object.fromEntries(Object.entries(colors).map(([name, rgb]) => {
    let count = 0, x = 0, y = 0;
    for (let i = 0; i < data.length; i += 4) if (rgb.every((v, k) => Math.abs(v - data[i + k]) < 28)) {
      count++; x += (i / 4) % c.width; y += Math.floor(i / 4 / c.width);
    }
    return [name, { count, x: x / count / scale, y: y / count / scale }];
  }));
}, palette);
async function gallery(example) {
  await activate(button('Projects')); await activate(page.getByRole('tab', { name: 'Examples', exact: true }));
  assert.equal(await page.locator('input[name="example-project"]').count(), 7);
  await activate(page.locator(`input[name="example-project"][value="${example.id}"]`));
}
async function openExample(example) { await gallery(example); await activate(button('Open example')); await page.getByRole('dialog', { name: 'Projects', exact: true }).waitFor({ state: 'hidden' }); }
let passed = false;
try {
  const response = await page.goto(url); assert.equal(response.status(), 200);
  await page.locator('canvas').waitFor();
  assert((await page.locator('.top-bar-brand').innerText()).includes(pkg.version));
  assert.equal(await page.title(),'Slinker v'+pkg.version);
  assert.equal(await page.locator('meta[name="application-version"]').getAttribute('content'),pkg.version);
  assert.equal(await page.evaluate(() => typeof globalThis.__LINKAGE_G0_READ__), 'undefined');
  await page.evaluate(() => navigator.serviceWorker.ready); await page.reload();
  await page.waitForFunction(() => !!navigator.serviceWorker.controller);
  const expand = button('Expand toolbar'); if (engine === 'webkit') await expand.waitFor();
  if (await expand.isVisible()) await activate(expand);
  const credit = page.getByText('Coauthored by', { exact: false }); await credit.waitFor(); await credit.scrollIntoViewIfNeeded();
  assert.equal((await credit.innerText()).replace(/\s+/g, ' ').trim(), 'Coauthored by Jake Whiting and Hugo Wilson');
  assert.equal(await page.getByRole('link', { name: 'Jake Whiting', exact: true }).getAttribute('href'), 'https://github.com/mikanzui');
  assert.equal(await page.getByRole('link', { name: 'Hugo Wilson', exact: true }).getAttribute('href'), 'https://github.com/Huggabiz/linkage-studio');
  assert(!/Claude Opus|VibeCoded by/.test(await page.locator('body').innerText()));
  await page.screenshot({ path: join(output, 'live-credits.png') });
  checks.push('Cold/warm worker, actual version, credit text/links, no old tag or test observer');
  if (engine === 'webkit') await activate(button('Collapse toolbar'));
  const bridge = await context.request.get(url + 'redirect.html'); assert.equal(bridge.status(), 200);
  assert(!/src\/main|assets\/main-/.test(await bridge.text()));
  const notice=await context.request.get(url+'flatten-js-notice.txt');assert.equal(notice.status(),200);assert((await notice.text()).includes('Copyright (c) 2017 alexbol99'));
  for (const item of catalog) {
    const response = await context.request.get(url + 'examples/' + item.filename); assert.equal(response.status(), 200);
    assert.deepEqual(await response.body(), await readFile(join(paths.candidate, 'examples', item.filename)), 'Exact live model bytes ' + item.filename);
  }
  const example = await context.request.get(url + 'examples/mechanism-playground.slinker'); assert.equal(example.status(), 200);
  const bytes = await example.body(), expected = await readFile(join(paths.candidate, 'examples/mechanism-playground.slinker'));
  assert.deepEqual(JSON.parse(bytes.toString()), JSON.parse(expected.toString()));
  await openExample(catalog.find(e => e.id === 'playground'));
  await button('Mechanism Playground').waitFor(); await activate(button('Fit mechanism'));
  await page.waitForTimeout(150); const before = await pixels();
  await mode('Simulate'); await button('Pause').waitFor(); await page.waitForTimeout(1300);
  await activate(button('Pause')); const after = await pixels();
  const movement = Object.fromEntries(Object.keys(colors).map(k => {
    assert(before[k].count > 40 && after[k].count > 40, 'Visible colored mechanism ' + k);
    const distance = Math.hypot(after[k].x - before[k].x, after[k].y - before[k].y);
    assert(distance > 2, 'Actual live canvas movement for ' + k); return [k, distance];
  }));
  assert.equal(await button('Retry').count(), 0);
  await page.screenshot({ path: join(output, 'live-example.png') });
  checks.push('All seven hosted sources byte-match; Projects > Examples opens playground with three actual moving colored mechanisms');
  await mode('Create'); const pending = page.waitForEvent('download'); await activate(button('Save'));
  const download = await pending, savedPath = join(output, 'live-saved.slinker'); await download.saveAs(savedPath);
  const saved = JSON.parse(await readFile(savedPath, 'utf8')), original = JSON.parse(bytes.toString());
  for (const key of ['springs', 'sliders', 'colliders', 'tracers', 'forceSensors']) assert.deepEqual(saved[key], original[key]);
  checks.push('Live Create restoration and native saved file retains springs, rails, stop, traces and sensors');
  await gallery(catalog[0]);
  const sourceDownload = page.waitForEvent('download'); await activate(page.getByRole('link', { name: 'Download example' }));
  const model = await sourceDownload, modelPath = join(output, 'downloaded-' + catalog[0].filename); await model.saveAs(modelPath);
  assert.deepEqual(await readFile(modelPath), await readFile(join(paths.candidate, 'examples', catalog[0].filename)));
  await page.screenshot({ path: join(output, 'live-projects-examples.png') }); await activate(button('Close projects'));
  const originalViewport = page.viewportSize(); await page.setViewportSize({ width: 512, height: 440 });
  await gallery(catalog[0]); await page.getByRole('searchbox', { name: 'Search examples' }).fill('scissor');
  await page.waitForFunction(() => { const r = document.querySelector('dialog[open]')?.getBoundingClientRect(); return r && r.top >= 0 && r.bottom <= innerHeight; });
  await button('Open example').scrollIntoViewIfNeeded();
  for (const control of [button('Open example'), page.getByRole('link', { name: 'Download example' })]) {
    const r = await control.boundingBox(); assert(r.y >= 0 && r.y + r.height <= 440 && r.height >= (engine === 'webkit' ? 44 : 34), 'Reachable short-viewport example command');
  }
  const rows = await page.locator('.example-list label').evaluateAll(rows => rows.map(row => ({ minimum: getComputedStyle(row).minHeight, height: row.getBoundingClientRect().height })));
  assert.equal(rows.length, 1); assert(rows.every(row => row.minimum === '76px' && row.height >= 76));
  await page.screenshot({ path: join(output, 'live-short-keyboard-viewport.png') }); await page.keyboard.press('Escape');
  if (await page.getByRole('dialog', { name: 'Projects', exact: true }).isVisible()) {
    assert.equal(await page.getByRole('searchbox', { name: 'Search examples' }).inputValue(), '', 'Native search Escape clears its query before modal cancellation');
    await button('Close projects').focus(); await page.keyboard.press('Escape');
  }
  await page.getByRole('dialog', { name: 'Projects', exact: true }).waitFor({ state: 'hidden' }); await page.setViewportSize(originalViewport);
  checks.push('Examples search and Open/download remain reachable in a 512x440 keyboard-height viewport; row minimum76px');
  await context.setOffline(true); await page.reload(); await page.locator('canvas').waitFor();
  assert((await page.evaluate(()=>fetch('./flatten-js-notice.txt').then(r=>r.text()))).includes('MIT License'),'Geometry license notice retained offline');
  for (const item of catalog) { await openExample(item); assert.equal(await button('Retry').count(), 0); }
  await openExample(catalog[0]); const liftPalette = { platform: [24, 142, 154] };
  const liftBefore = await pixels(liftPalette), liftSamples = []; await mode('Simulate');
  for (let i = 0; i < 5; i++) { await page.waitForTimeout(250); liftSamples.push(await pixels(liftPalette)); }
  await activate(button('Pause'));
  assert(liftBefore.platform.count > 40 && liftSamples.every(s => s.platform.count > 40));
  assert(Math.max(...liftSamples.map(s => Math.hypot(s.platform.x-liftBefore.platform.x,s.platform.y-liftBefore.platform.y))) > 2, 'Actual offline live scissor platform movement');
  await page.screenshot({ path: join(output, 'live-offline-scissor-lift.png') }); await mode('Create'); await context.setOffline(false);
  checks.push('Native source download exact; all seven Projects examples open offline after reload; real offline scissor-lift pixels move');
  assert.deepEqual(errors, []); passed = true;
  await writeFile(join(output, 'motion.json'), JSON.stringify({ before, after, movement, fixtureSha256: createHash('sha256').update(bytes).digest('hex') }, null, 2));
} finally {
  await context.close(); await browser.close();
  await writeFile(join(output, 'report.json'), JSON.stringify({ url, engine, passed, checks, errors, physicalIPadVerified: false, hostedLiveSignInVerified: false }, null, 2));
  console.log(JSON.stringify({ output, passed, checks }));
}
