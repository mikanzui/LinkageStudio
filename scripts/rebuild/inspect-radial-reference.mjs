import assert from 'node:assert/strict';
import { mkdir, mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { basename, join } from 'node:path';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { chromium, webkit } from '../../.rebuild.local/tooling/node_modules/playwright/index.mjs';

const engine = process.argv[2] ?? 'chromium', kind = process.argv[3] ?? 'reference';
const url = process.argv[4] ?? 'http://127.0.0.1:5192/LinkageStudio/#/editor';
const parent = new URL('../../.rebuild.local/evidence/radial-motion/', import.meta.url);
await mkdir(parent, { recursive: true });
const output = await mkdtemp(join(fileURLToPath(parent), `${kind}-${engine}-`));
const browser = engine === 'webkit' ? await webkit.launch() : await chromium.launch({ channel: 'chrome' });
const context = await browser.newContext({ viewport: { width: 1440, height: 1000 }, serviceWorkers: 'block', recordVideo: { dir: output, size: { width: 1440, height: 1000 } } });
const page = await context.newPage();
const synthetic = { version: '0.12.3', projectName: 'Radial parity specimen',
  joints: { a: { id: 'a', type: 'revolute', position: { x: 400, y: 400 }, connectedLinkIds: ['rod'] }, b: { id: 'b', type: 'revolute', position: { x: 650, y: 400 }, connectedLinkIds: ['rod'] } },
  links: { rod: { id: 'rod', jointIds: ['a', 'b'], restLength: 250, mass: 1 } },
  bodies: Object.fromEntries(['base', 'body1', 'body2', 'body3'].map((id, i) => [id, { id, name: i ? 'Body ' + i : 'Base', jointIds: i === 1 ? ['a', 'b'] : [], color: ['#e53935', '#4caf50', '#ff9800', '#9c27b0'][i] }])),
  baseBodyId: 'base', outlines: {}, images: {}, sliders: {}, colliders: {}, tracers: {} };
const fixturePath = process.argv[5];
const bytes = fixturePath ? await readFile(fixturePath) : Buffer.from(JSON.stringify(synthetic));
const seed = JSON.parse(bytes.toString('utf8'));
const handle = process.argv[6] ?? (fixturePath ? Object.values(seed.joints).find(j => !j.hidden).id : 'a');
await context.addInitScript(() => {
  globalThis.__radialFrames = [];
  globalThis.__radialDownTime = 0;
  document.addEventListener('pointerdown', event => { if (event.isTrusted && event.target instanceof HTMLCanvasElement) globalThis.__radialDownTime = performance.now(); }, true);
  let started = 0, seen = false;
  function frame(time) {
    const menu = document.querySelector('.world-context-menu, .radial-menu');
    if (menu && !started) { started = time; seen = true; globalThis.__radialHoldDelay = time - globalThis.__radialDownTime; }
    if (started && globalThis.__radialFrames.length < 150) {
      const controls = menu ? [...menu.querySelectorAll('button')].map(el => {
        const r = el.getBoundingClientRect(), s = getComputedStyle(el);
        return { name: el.textContent.trim() || el.getAttribute('aria-label') || el.title,
          x: r.x, y: r.y, width: r.width, height: r.height, opacity: s.opacity, transform: s.transform,
          font: s.font, padding: s.padding, background: s.backgroundColor,
          animations: el.getAnimations().map(a => ({ time: a.currentTime, timing: a.effect.getTiming(), frames: a.effect.getKeyframes() })) };
      }) : [];
      globalThis.__radialFrames.push({ elapsed: time - started, closing: menu?.classList.contains('closing'), controls });
      if (!menu && seen) return;
    }
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);
});
try {
  await page.goto(url); await page.locator('canvas').waitFor();
  const build = JSON.parse(await page.locator('meta[name="linkage-g0-build"]').getAttribute('content'));
  const chooser = page.waitForEvent('filechooser'); await page.getByTitle('Open file', { exact: true }).click();
  await (await chooser).setFiles({ name: fixturePath ? basename(fixturePath) : 'radial.slinker', mimeType: 'application/json', buffer: bytes });
  await page.waitForFunction(id => !!globalThis.__LINKAGE_G0_READ__?.mechanism().joints[id], handle);
  const before = await page.evaluate(() => __LINKAGE_G0_READ__.mechanism());
  const point = await page.evaluate(id => { const e = __LINKAGE_G0_READ__.editor(), m = __LINKAGE_G0_READ__.mechanism(), r = document.querySelector('canvas').getBoundingClientRect(); return { x: r.x + e.camera.pan.x + m.joints[id].position.x * e.camera.zoom, y: r.y + e.camera.pan.y + m.joints[id].position.y * e.camera.zoom }; }, handle);
  await page.mouse.move(point.x, point.y); await page.mouse.down();
  await page.locator('.world-context-menu, .radial-menu').waitFor();
  const threshold = await page.evaluate(() => __radialHoldDelay);
  await page.screenshot({ path: join(output, 'opening.png') });
  await page.waitForTimeout(100); await page.screenshot({ path: join(output, 'opening-mid.png') });
  await page.waitForTimeout(300); await page.screenshot({ path: join(output, 'settled.png') });
  await page.waitForFunction(() => [...document.querySelectorAll('.world-context-menu button, .radial-menu button')].every(el => el.getAnimations().every(a => a.playState === 'finished')));
  const geometry = await page.evaluate(id => {
    const menu = document.querySelector('.world-context-menu, .radial-menu'), r = document.querySelector('canvas').getBoundingClientRect(), e = __LINKAGE_G0_READ__.editor(), j = __LINKAGE_G0_READ__.mechanism().joints[id];
    const anchor = { x: r.x + e.camera.pan.x + j.position.x * e.camera.zoom, y: r.y + e.camera.pan.y + j.position.y * e.camera.zoom };
    return { anchor, variant: menu.classList.contains('radial-list') ? 'list' : 'orbit', bodyCount: Object.keys(__LINKAGE_G0_READ__.mechanism().bodies).length, rings: menu.querySelectorAll('.world-context-center-pulse, .radial-ring').length, spokes: menu.querySelectorAll('.world-context-orbit-line, .radial-spoke').length,
      controls: [...menu.querySelectorAll('button')].map(el => { const r = el.getBoundingClientRect(), s = getComputedStyle(el); return { name: el.textContent.trim() || el.getAttribute('aria-label') || el.title,
        dx: r.x + r.width / 2 - anchor.x, dy: r.y + r.height / 2 - anchor.y, width: s.width, height: s.height, font: s.font, padding: s.padding, background: s.backgroundColor, border: s.border, direction: s.flexDirection, animation: s.animation }; }) };
  }, handle);
  await page.mouse.up(); await page.screenshot({ path: join(output, 'closing.png') });
  await page.waitForTimeout(90); await page.screenshot({ path: join(output, 'closing-mid.png') });
  await page.waitForTimeout(300); assert.equal(await page.locator('.world-context-menu, .radial-menu').count(), 0);
  const frames = await page.evaluate(() => __radialFrames);
  const after = await page.evaluate(() => __LINKAGE_G0_READ__.mechanism());
  const passed = JSON.stringify(after) === JSON.stringify(before);
  await writeFile(join(output, 'report.json'), JSON.stringify({ kind, engine, browser: browser.version(), build, fixtureSha256: createHash('sha256').update(bytes).digest('hex'), threshold, geometry, frames, passed }, null, 2));
  if (!passed) {
    await writeFile(join(output, 'FAILED-mechanism.json'), JSON.stringify({ before, after }, null, 2));
    assert.fail('Hold/release changed the mechanism; see ' + join(output, 'FAILED-mechanism.json'));
  }
  console.log(JSON.stringify({ output, threshold, geometry, passed }));
} finally { await context.close(); await page.video().saveAs(join(output, 'hold-menu.webm')); await browser.close(); }
