import assert from 'node:assert/strict';
import { mkdir, mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { createHash } from 'node:crypto';
import { chromium, webkit } from '../../.rebuild.local/tooling/node_modules/playwright/index.mjs';
import { resolveBrowserPaths } from './source-paths.mjs';

const paths = resolveBrowserPaths(), engine = process.argv[2] ?? 'chromium';
assert(['chromium', 'webkit'].includes(engine));
const url = 'https://mikanzui.github.io/LinkageStudio/';
const parent = join(paths.local, 'evidence/pages'); await mkdir(parent, { recursive: true });
const output = await mkdtemp(join(parent, engine + '-live-'));
const browser = engine === 'webkit' ? await webkit.launch() : await chromium.launch({ channel: 'chrome' });
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
const pixels = () => page.locator('canvas[aria-label="Mechanism canvas"]').evaluate((c, colors) => {
  const data = c.getContext('2d').getImageData(0, 0, c.width, c.height).data, scale = c.width / c.getBoundingClientRect().width;
  return Object.fromEntries(Object.entries(colors).map(([name, rgb]) => {
    let count = 0, x = 0, y = 0;
    for (let i = 0; i < data.length; i += 4) if (rgb.every((v, k) => Math.abs(v - data[i + k]) < 28)) {
      count++; x += (i / 4) % c.width; y += Math.floor(i / 4 / c.width);
    }
    return [name, { count, x: x / count / scale, y: y / count / scale }];
  }));
}, colors);
let passed = false;
try {
  const response = await page.goto(url); assert.equal(response.status(), 200);
  await page.locator('canvas').waitFor();
  assert.match(await page.locator('.top-bar-brand').innerText(), /0\.16\.0-rebuild\.4/);
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
  checks.push('Live HTTPS cold/warm worker, actual version, credit text/links, no old tag or test observer');
  if (engine === 'webkit') await activate(button('Collapse toolbar'));
  const bridge = await context.request.get(url + 'redirect.html'); assert.equal(bridge.status(), 200);
  assert(!/src\/main|assets\/main-/.test(await bridge.text()));
  const example = await context.request.get(url + 'examples/mechanism-playground.slinker'); assert.equal(example.status(), 200);
  const bytes = await example.body(), expected = await readFile(join(paths.candidate, 'examples/mechanism-playground.slinker'));
  assert.deepEqual(JSON.parse(bytes.toString()), JSON.parse(expected.toString()));
  const chooser = page.waitForEvent('filechooser'); await activate(button('Open'));
  await (await chooser).setFiles({ name: 'Mechanism Playground.slinker', mimeType: 'application/json', buffer: bytes });
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
  checks.push('Hosted public example matches source, native import/Fit/Simulate and three actual moving colored mechanisms');
  await mode('Create'); const pending = page.waitForEvent('download'); await activate(button('Save'));
  const download = await pending, savedPath = join(output, 'live-saved.slinker'); await download.saveAs(savedPath);
  const saved = JSON.parse(await readFile(savedPath, 'utf8')), original = JSON.parse(bytes.toString());
  for (const key of ['springs', 'sliders', 'colliders', 'tracers', 'forceSensors']) assert.deepEqual(saved[key], original[key]);
  checks.push('Live Create restoration and native saved file retains springs, rails, stop, traces and sensors');
  assert.deepEqual(errors, []); passed = true;
  await writeFile(join(output, 'motion.json'), JSON.stringify({ before, after, movement, fixtureSha256: createHash('sha256').update(bytes).digest('hex') }, null, 2));
} finally {
  await context.close(); await browser.close();
  await writeFile(join(output, 'report.json'), JSON.stringify({ url, engine, passed, checks, errors, physicalIPadVerified: false, hostedLiveSignInVerified: false }, null, 2));
  console.log(JSON.stringify({ output, passed, checks }));
}
