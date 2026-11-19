import { chromium, webkit } from '../../.rebuild.local/tooling/node_modules/playwright/index.mjs';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdir, mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { candidateFingerprint, assertCandidateBuild } from './candidate-fingerprint.mjs';

// Usage: node scripts/rebuild/verify-g5-browser.mjs chromium|webkit [candidate URL]
// Only native UI input changes the app. Evaluations read the mounted observer,
// inspect DOM/pixels, or create a detached bitmap supplied to the real chooser.
const root = fileURLToPath(new URL('../../', import.meta.url));
const engine = process.argv[2] ?? 'chromium';
assert(['chromium', 'webkit'].includes(engine), 'Use chromium or webkit');
const url = process.argv[3] ?? process.env.LINKAGE_CANDIDATE_URL ?? 'http://127.0.0.1:5183/linkage-studio/';
const startedAt = new Date().toISOString();
const sourceStart = await candidateFingerprint();
const harnessSha256 = createHash('sha256').update(await readFile(fileURLToPath(import.meta.url))).digest('hex');
const parent = join(root, '.rebuild.local/evidence/g5');
await mkdir(parent, { recursive: true });
const output = await mkdtemp(join(parent, `${engine}-browser-`));
await writeFile(join(output, 'harness.mjs'), await readFile(fileURLToPath(import.meta.url)));
const profiles = [
  { id: 'desktop', width: 1440, height: 1000, touch: false, dpr: 1 },
  { id: 'tablet', width: 1024, height: 1366, touch: true, dpr: 2 },
];
const fixture = {
  version: '0.12.3', projectName: 'G5 body rod',
  joints: {
    a: { id: 'a', type: 'revolute', position: { x: 100, y: 200 }, connectedLinkIds: ['rod'] },
    b: { id: 'b', type: 'revolute', position: { x: 200, y: 200 }, connectedLinkIds: ['rod'] },
  },
  links: { rod: { id: 'rod', jointIds: ['a', 'b'], restLength: 100, mass: 1 } },
  bodies: {
    base: { id: 'base', name: 'Base', color: '#e53935', jointIds: [], useOutlineCOM: false, showLinks: true },
    body1: { id: 'body1', name: 'Body 1', color: '#4caf50', jointIds: ['a', 'b'], useOutlineCOM: false, showLinks: true },
  },
  baseBodyId: 'base', outlines: {}, images: {}, sliders: {}, colliders: {}, tracers: {},
  viewPreferences: { camera: { zoom: 1, pan: { x: 0, y: 0 } }, gridLevel: 'off' },
};
await writeFile(join(output, 'fixture.slinker'), JSON.stringify(fixture, null, 2));
const results = [];
const near = (actual, expected, label, tolerance = 1e-4) =>
  assert(Math.abs(actual - expected) <= tolerance, `${label}: expected ${expected}, got ${actual}`);
const pointNear = (actual, expected, label) => {
  near(actual.x, expected.x, `${label}.x`); near(actual.y, expected.y, `${label}.y`);
};
const pointsNear = (actual, expected, label) => {
  assert.equal(actual.length, expected.length, `${label} vertex count`);
  actual.forEach((p, i) => pointNear(p, expected[i], `${label}[${i}]`));
};
const graphKeys = ['joints', 'links', 'bodies', 'baseBodyId', 'outlines', 'images', 'sliders', 'colliders', 'tracers'];
const graphOnly = state => Object.fromEntries(graphKeys.filter(k => k in state).map(k => [k, state[k]]));

// Independent frame math, not an import of the implementation under test.
function worldPoints(graph, outline) {
  const body = graph.bodies[outline.bodyId], joints = body.jointIds.map(id => graph.joints[id].position);
  const origin = joints.length ? {
    x: joints.reduce((sum, p) => sum + p.x, 0) / joints.length,
    y: joints.reduce((sum, p) => sum + p.y, 0) / joints.length,
  } : { x: 0, y: 0 };
  let angle = joints.length > 1 ? Math.atan2(joints[0].y - origin.y, joints[0].x - origin.x) : 0;
  if (body.frame) {
    const [a, b] = body.frame.jointIds.map(id => graph.joints[id].position);
    angle = Math.atan2(b.y - a.y, b.x - a.x) + body.frame.angleOffset;
  }
  return outline.points.map(p => ({
    x: origin.x + p.x * Math.cos(angle) - p.y * Math.sin(angle),
    y: origin.y + p.x * Math.sin(angle) + p.y * Math.cos(angle),
  }));
}
function bounds(points) {
  return { minX: Math.min(...points.map(p => p.x)), maxX: Math.max(...points.map(p => p.x)),
    minY: Math.min(...points.map(p => p.y)), maxY: Math.max(...points.map(p => p.y)) };
}
const rectangle = [{ x: 260, y: 300 }, { x: 380, y: 300 }, { x: 380, y: 380 }, { x: 260, y: 380 }];
const browser = engine === 'webkit' ? await webkit.launch({ headless: true })
  : await chromium.launch({ channel: 'chrome', headless: true });
try {
  for (const profile of profiles) {
    const dir = join(output, profile.id);
    await mkdir(dir);
    const context = await browser.newContext({ viewport: { width: profile.width, height: profile.height },
      hasTouch: profile.touch, isMobile: profile.touch, deviceScaleFactor: profile.dpr,
      serviceWorkers: 'block', acceptDownloads: true });
    // Select the browser's genuine prompt/download fallback, not a fake save handler.
    await context.addInitScript(() => {
      Object.defineProperty(window, 'showSaveFilePicker', { value: undefined, configurable: true });
      globalThis.__g5InputEvidence = [];
      for (const type of ['pointerdown', 'pointermove', 'pointerup', 'pointercancel', 'click', 'keydown']) {
        document.addEventListener(type, event => {
          const target = event.target.closest?.('button,input,select,canvas') ?? event.target;
          globalThis.__g5InputEvidence.push({ type, time: performance.now(), trusted: event.isTrusted,
            pointerType: event.pointerType, pointerId: event.pointerId, x: event.clientX, y: event.clientY,
            key: event.key, tag: target.tagName, label: target.getAttribute?.('aria-label') ?? target.title });
        }, true);
      }
    });
    await context.tracing.start({ screenshots: true, snapshots: true, sources: false });
    const page = await context.newPage();
    page.setDefaultTimeout(10000);
    const errors = [], consoleMessages = [], checks = [], steps = [], controlTargets = [];
    let build, sequence = 0, geometryGraph, rectangleId, circleId, ngonId, mirrorId, imageId;
    let currentStep = 'bootstrap';
    page.on('pageerror', e => errors.push({ type: 'pageerror', message: e.message }));
    page.on('console', m => {
      consoleMessages.push({ type: m.type(), message: m.text() });
      if (m.type() === 'error') errors.push({ type: 'console', message: m.text() });
    });
    page.on('dialog', dialog => dialog.accept(dialog.type() === 'prompt' ? 'g5-complete.slinker' : undefined));
    const cdp = engine === 'chromium' && profile.touch ? await context.newCDPSession(page) : null;
    const button = name => page.getByRole('button', { name, exact: true });
    const field = name => page.getByLabel(name, { exact: true });
    const activate = locator => profile.touch ? locator.tap() : locator.click();
    const selectGeometry = async name => {
      if (name !== 'Mirror' && !await button(name).isVisible()) await activate(button('Draw'));
      await activate(button(name));
    };
    const acceptDirtyOpen = async () => {
      const unsaved = page.getByRole('dialog', { name: 'Unsaved Changes', exact: true });
      if (await unsaved.isVisible()) await activate(unsaved.getByRole('button', { name: 'Discard and open', exact: true }));
    };
    const read = () => page.evaluate(() => ({ graph: globalThis.__LINKAGE_G0_READ__.mechanism(),
      editor: globalThis.__LINKAGE_G0_READ__.editor() }));
    const graph = async () => (await read()).graph;
    const editor = async () => (await read()).editor;
    const canvas = page.locator('canvas');
    const undo = () => activate(button('Undo'));
    const redo = () => activate(button('Redo'));
    const mark = (name, evidence) => checks.push({ name, passed: true, ...(evidence ? { evidence } : {}) });
    async function capture(name) {
      const stem = `${String(++sequence).padStart(3, '0')}-${name}`;
      await page.screenshot({ path: join(dir, `${stem}.png`), fullPage: true });
      await writeFile(join(dir, `${stem}.json`), JSON.stringify(await read(), null, 2));
    }
    async function run(name, work) {
      currentStep = name;
      const start = Date.now();
      try {
        await work();
        await capture(name);
        steps.push({ name, passed: true, elapsedMs: Date.now() - start });
      } catch (error) {
        const classification = /observer must expose/.test(error.message) ? 'observation-prerequisite'
          : /setup required/i.test(error.message) ? 'dependent-setup-unavailable'
            : name === 'touch-target-qualification' ? 'app-touch-target'
              : error.name === 'TimeoutError' ? 'selector-or-timing-needs-review' : 'assertion-needs-review';
        steps.push({ name, passed: false, classification, elapsedMs: Date.now() - start, failure: error.stack });
        await capture(`${name}-FAILED`).catch(e => steps.at(-1).captureFailure = String(e));
      }
      console.log(JSON.stringify({ engine, profile: profile.id, step: steps.at(-1) }));
    }
    async function waitPixels() {
      await page.waitForFunction(() => {
        const c = document.querySelector('canvas'); if (!c) return false;
        const r = c.getBoundingClientRect(), dpr = Math.min(3, Math.max(.5, devicePixelRatio));
        return r.width > 400 && r.height > 400 && Math.abs(c.width - r.width * dpr) <= 1
          && Math.abs(c.height - r.height * dpr) <= 1;
      });
      await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
    }
    async function collapsePanels() {
      for (const title of ['Collapse toolbar', 'Collapse panel']) {
        const control = page.getByTitle(title, { exact: true });
        if (await control.count()) await activate(control);
      }
      await page.locator('.toolbar-collapsed').waitFor();
      await page.locator('.panel-collapsed').waitFor();
      await waitPixels();
    }
    async function openProperties() {
      const expand = page.getByTitle('Expand panel', { exact: true });
      if (await expand.count()) await activate(expand);
      await page.locator('.right-panel').waitFor(); await waitPixels();
    }
    async function openFixture(data = fixture, name = 'g5-body-rod.slinker') {
      const chooser = page.waitForEvent('filechooser');
      await activate(button('Open')); await acceptDirtyOpen();
      await (await chooser).setFiles({ name, mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(data)) });
      await page.getByText('Opened '+name+'.',{exact:true}).waitFor();
      await page.waitForFunction(name => globalThis.__LINKAGE_G0_READ__.editor().projectName === name
        && document.querySelector('.top-bar')?.getAttribute('aria-busy') === 'false', data.projectName);
      await collapsePanels();
      assert.equal((await graph()).links.rod.restLength, 100);
      assert.deepEqual((await editor()).camera, data.viewPreferences.camera);
    }
    async function screen(point) {
      await waitPixels();
      const r = await canvas.boundingBox(), camera = (await editor()).camera;
      const result = { x: r.x + camera.pan.x + point.x * camera.zoom,
        y: r.y + camera.pan.y + point.y * camera.zoom };
      assert(result.x > r.x && result.x < r.x + r.width && result.y > r.y && result.y < r.y + r.height,
        `World point outside canvas: ${JSON.stringify({ point, result, r, camera })}`);
      assert.equal(await page.evaluate(p => document.elementFromPoint(p.x, p.y)?.tagName, result), 'CANVAS',
        `Canvas point covered by UI: ${JSON.stringify(result)}`);
      return result;
    }
    async function tapWorld(point) {
      const p = await screen(point);
      if (cdp) {
        await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ ...p, id: 1 }] });
        await page.waitForTimeout(70);
        await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
      } else if (profile.touch) await page.touchscreen.tap(p.x, p.y);
      else await page.mouse.click(p.x, p.y);
    }
    async function dragWorld(points, cancel, beforeRelease, modifiers = 0) {
      const positions = [];
      for (const p of points) positions.push(await screen(p));
      const first = positions[0];
      if (cdp) await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ ...first, id: 31 }], modifiers });
      else { await page.mouse.move(first.x, first.y); await page.mouse.down(); }
      try {
        for (let i = 1; i < positions.length; i++) {
          const from = positions[i - 1], to = positions[i];
          for (let n = 1; n <= 12; n++) {
            const p = { x: from.x + (to.x - from.x) * n / 12, y: from.y + (to.y - from.y) * n / 12 };
            if (cdp) await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ ...p, id: 31 }], modifiers });
            else await page.mouse.move(p.x, p.y);
            await page.waitForTimeout(16);
          }
        }
        // Chrome 157/159 rapid flick release can suppress the NEXT native button click.
        // This hold must precede release; sleeping after release is not equivalent.
        await page.waitForTimeout(300);
        if (beforeRelease) await beforeRelease();
        if (cancel === 'Escape') await page.keyboard.press('Escape');
      } finally {
        if (cdp) await cdp.send('Input.dispatchTouchEvent', { type: cancel === 'touchCancel' ? 'touchCancel' : 'touchEnd', touchPoints: [], modifiers });
        else await page.mouse.up();
      }
    }
    async function assertOptionsReachable() {
      await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
      const blocked = await page.locator('.geometry-options').evaluate(group =>
        [...group.querySelectorAll('input,button')].filter(el => !el.disabled).flatMap(el => {
          const r = el.getBoundingClientRect(), x = r.x + r.width / 2, y = r.y + r.height / 2;
          const hit = document.elementFromPoint(x, y);
          return x < 0 || x > innerWidth || y < 0 || y > innerHeight || !(hit === el || el.contains(hit))
            ? [{ label: el.getAttribute('aria-label') ?? el.type, x, y, hit: hit?.tagName }] : [];
        }));
      assert.deepEqual(blocked, [], 'Every geometry option must be visible and hit-reachable above overlay panels');
    }
    async function shapeProperties(id) {
      await openProperties();
      const g = await graph(), name = g.outlines[id].name, owner = g.bodies[g.outlines[id].bodyId].name;
      const expand = button(`Expand ${owner}`);
      if (await expand.count()) await activate(expand);
      await activate(button(`Properties for ${name}`));
      assert.deepEqual((await editor()).selectedIds, [id]);
    }
    async function imageProperties() {
      await openProperties();
      const g = await graph(), owner = g.bodies[g.images[imageId].bodyId].name;
      const expand = button(`Expand ${owner}`);
      if (await expand.count()) await activate(expand);
      await activate(button('Image properties'));
      assert.deepEqual((await editor()).selectedIds, [imageId]);
    }
    async function commitAndUndo(label, value, verify, method = 'Enter') {
      const before = graphOnly(await graph());
      await field(label).fill(String(value));
      assert.deepEqual(graphOnly(await graph()), before, `${label}: draft must not mutate graph`);
      await field(label).press(method === 'blur' ? 'Tab' : 'Enter');
      const after = graphOnly(await graph());
      verify(after);
      assert.notDeepEqual(after, before, `${label}: commit must change graph`);
      await undo(); assert.deepEqual(graphOnly(await graph()), before, `${label}: exactly one undo restores graph`);
      await redo(); assert.deepEqual(graphOnly(await graph()), after, `${label}: redo restores complete graph`);
      mark(`${label}: isolated draft, ${method} commit, one undo/redo`);
    }
    async function cancelField(label, draft) {
      const before = graphOnly(await graph());
      await field(label).fill(String(draft)); await field(label).press('Escape');
      assert.deepEqual(graphOnly(await graph()), before, `${label}: Escape must cancel`);
      await undo(); const undone = graphOnly(await graph());
      assert.notDeepEqual(undone, before, `${label}: cancellation must not add a no-op undo entry`);
      await redo(); assert.deepEqual(graphOnly(await graph()), before);
      mark(`${label}: Escape cancels without a history entry`);
    }
    async function save(name) {
      const download = page.waitForEvent('download');
      await activate(button('Save'));
      const file = await download; assert.equal(await file.failure(), null);
      const path = join(dir, `${name}.slinker`); await file.saveAs(path);
      return JSON.parse(await readFile(path, 'utf8'));
    }
    async function checkPixels(reflected) {
      const g = await graph(), image = g.images[imageId], camera = (await editor()).camera;
      const samples = [-.25, .25].map(x => ({ x: image.position.x + x * image.naturalWidth * image.scale,
        y: image.position.y + image.naturalHeight * image.scale * .2 }));
      await waitPixels();
      const pixels = await canvas.evaluate((c, { samples, camera }) => {
        const r = c.getBoundingClientRect(), ctx = c.getContext('2d');
        return samples.map(p => [...ctx.getImageData(Math.round((camera.pan.x + p.x * camera.zoom) * c.width / r.width),
          Math.round((camera.pan.y + p.y * camera.zoom) * c.height / r.height), 1, 1).data]);
      }, { samples, camera });
      const red = p => p[0] > p[2] + 80, blue = p => p[2] > p[0] + 80;
      assert(reflected ? blue(pixels[0]) && red(pixels[1]) : red(pixels[0]) && blue(pixels[1]),
        `Rendered asymmetric image ${reflected ? 'reflected' : 'normal'} colors: ${JSON.stringify(pixels)}`);
      mark(`canvas pixels: ${reflected ? 'reflected blue/red' : 'normal red/blue'} at DPR ${profile.dpr}`, pixels);
    }
    try {
      await page.goto(url);
      build = await assertCandidateBuild(page, sourceStart);
      await page.waitForFunction(() => !!globalThis.__LINKAGE_G0_READ__?.mechanism && !!globalThis.__LINKAGE_G0_READ__?.editor);
      await page.locator('.splash-screen').waitFor({ state: 'detached' });
      await collapsePanels();
      const initialPixels = await canvas.evaluate(c => {
        const r = c.getBoundingClientRect(); return { width: r.width, height: r.height, backingWidth: c.width,
          backingHeight: c.height, dpr: devicePixelRatio, coarse: matchMedia('(pointer: coarse)').matches };
      });
      near(initialPixels.backingWidth, initialPixels.width * profile.dpr, 'initial backing width', 1);
      near(initialPixels.backingHeight, initialPixels.height * profile.dpr, 'initial backing height', 1);
      assert.equal(initialPixels.coarse, profile.touch);
      mark('collapsed rails and DPR-matched backing pixels before coordinate capture', initialPixels);

      await run('v16-draw-palette-and-icons', async () => {
        await openFixture();
        const before = graphOnly(await graph());
        const palette = page.getByRole('toolbar', { name: 'Draw overlay tools', exact: true });
        assert.equal(await palette.count(), 0, 'Negative control: no drawing palette in joint mode');
        for (const expanded of [false, true]) {
          if (expanded) await activate(page.getByTitle('Expand toolbar', { exact: true }));
          const sidebar = page.locator(expanded ? '.toolbar' : '.toolbar-collapsed');
          for (const name of ['Outline', 'Rectangle', 'Circle', 'N-gon', 'Trim']) {
            assert.equal(await sidebar.getByRole('button', { name, exact: true }).count(), 0, name + ' must not clutter sidebar');
          }
          await activate(button('Draw'));
          assert.equal(await palette.getByRole('button').count(), 5);
          assert.equal(await button('Draw').getAttribute('aria-pressed'), 'true');
          assert.equal(await button('Draw').locator('polygon').getAttribute('points'), '8,1 14,5 12,13 4,13 2,5');
          assert.equal(await button('Outline').locator('line').getAttribute('x1'), '2.5');
          assert.equal(await button('Rectangle').locator('rect').getAttribute('width'), '12');
          assert.equal(await button('Circle').locator('circle').getAttribute('r'), '6');
          assert.equal(await button('N-gon').locator('polygon').getAttribute('points'), '8,1.5 14,5 13,12 3,12 2,5');
          assert.equal(await button('Trim').locator('circle').count(), 2);
          assert.equal(await button('Linear spring').locator('path').getAttribute('d'), 'M2 8c0-1 1-1.5 2-1.5s2 1 2 2 1 2 2 2 2-1 2-2 1-2 2-2 2 0.5 2 1.5');
          assert.equal(await button('Damper').locator('rect').getAttribute('width'), '7');
          assert.equal(await button('Torsion spring').locator('path').getAttribute('d'), 'M 9.8 5.2 A 2.2 2.2 0 0 1 6.2 5.2');
          assert.equal(await button('Force sensor').locator('polyline').getAttribute('points'), '3,12 5,8 7,10 9,4 11,9 13,6');
          const hit = await button('Draw').boundingBox();
          if (profile.touch) assert(hit.width >= 44 && hit.height >= 44, 'Draw coarse hit target');
          await capture(expanded ? 'v16-draw-expanded' : 'v16-draw-collapsed');
        }
        await collapsePanels();
        await activate(button('Draw'));
        await button('Outline').focus();
        await page.keyboard.press('Tab');
        assert.equal(await page.locator(':focus').getAttribute('aria-label'), 'Rectangle');
        await page.keyboard.press('Enter');
        assert.equal((await editor()).createTool, 'rectangle');
        assert.equal(await button('Rectangle').getAttribute('aria-pressed'), 'true');
        await selectGeometry('Outline');
        await tapWorld({ x: 280, y: 300 });
        assert(await button('Finish outline').isDisabled());
        await selectGeometry('Circle');
        await selectGeometry('Outline');
        assert(await button('Finish outline').isDisabled(), 'Switching modes clears incomplete outline');
        for (const name of ['Select', 'Pan']) {
          await activate(button(name));
          assert.equal(await palette.count(), 0, name + ' hides palette');
          assert.equal(await button('Draw').getAttribute('aria-pressed'), 'false');
          await activate(button('Draw'));
          assert(await button('Finish outline').isDisabled());
        }
        for (const viewport of [{ width: 512, height: 440 }, { width: 1024, height: 600 }]) {
          await page.setViewportSize(viewport);
          await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
          const boxes = await palette.getByRole('button').evaluateAll(buttons => buttons.map(el => {
            const r = el.getBoundingClientRect(), parent = el.closest('.canvas-container').getBoundingClientRect();
            const hit = document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2);
            return { label: el.getAttribute('aria-label'), width: r.width, height: r.height,
              contained: r.left >= parent.left && r.right <= parent.right && r.top >= parent.top && r.bottom <= parent.bottom,
              reachable: hit === el || el.contains(hit) };
          }));
          assert(boxes.every(b => b.contained && b.reachable), JSON.stringify(boxes));
          const viewportButtons=await page.getByRole('toolbar',{name:'Viewport'}).getByRole('button').evaluateAll(buttons=>buttons.map(el=>{
            const r=el.getBoundingClientRect(),hit=document.elementFromPoint(r.x+r.width/2,r.y+r.height/2);
            return {label:el.getAttribute('aria-label'),width:r.width,height:r.height,reachable:r.left>=0&&r.right<=innerWidth&&r.top>=0&&r.bottom<=innerHeight&&(hit===el||el.contains(hit))};
          }));
          assert(viewportButtons.every(b=>b.reachable&&(!profile.touch||b.width>=44&&b.height>=44)),JSON.stringify(viewportButtons));
          if (profile.touch) assert(boxes.every(b => b.width >= 44 && b.height >= 44), 'Palette coarse targets');
          await capture('v16-palette-' + viewport.width + 'x' + viewport.height);
        }
        await page.setViewportSize({ width: profile.width, height: profile.height }); await waitPixels();
        await activate(page.getByTitle('Simulate mode', { exact: true }));
        assert.equal(await palette.count(), 0, 'Simulation hides drawing palette');
        await activate(page.getByTitle('Create mode', { exact: true }));
        assert.equal(await palette.count(), 0, 'Returning to create starts in joint mode');
        assert.deepEqual(graphOnly(await graph()), before, 'Palette navigation never commits a draft');
        mark('historical glyphs, simplified rails, contextual palette, keyboard, draft cancellation and split-view hit targets');
      });

      await run('geometry-controls', async () => {
        await openFixture();
        const before = graphOnly(await graph());
        for (const expanded of [false, true]) {
          if (expanded) await activate(page.getByTitle('Expand toolbar', { exact: true }));
          await activate(button('Draw'));
          for (const [name, tool] of [['Rectangle', 'rectangle'], ['Circle', 'circle'], ['N-gon', 'ngon'], ['Trim', 'trim'], ['Mirror', 'mirror']]) {
            await selectGeometry(name);
            assert.equal((await editor()).createTool, tool);
            assert.equal(await button(name).getAttribute('aria-pressed'), 'true');
            const r = await button(name).boundingBox();
            controlTargets.push({ name, expanded, ...r });
          }
          await assertOptionsReachable();
          await capture(expanded ? 'tools-expanded' : 'tools-collapsed');
        }
        if (profile.touch) {
          await page.setViewportSize({ width: 512, height: 1000 });
          await assertOptionsReachable(); await capture('split-view-options');
          await page.setViewportSize({ width: profile.width, height: profile.height });
          await waitPixels();
        }
        await collapsePanels();
        await selectGeometry('N-gon');
        await field('Polygon sides').fill('7'); await field('Polygon sides').press('Enter');
        assert.equal(await field('Polygon sides').inputValue(), '7');
        await field('Polygon sides').fill('9'); await field('Polygon sides').press('Escape');
        assert.equal(await field('Polygon sides').inputValue(), '7');
        await selectGeometry('Trim');
        for (const name of ['Active Bodies', 'Selected Shapes']) {
          await activate(page.getByRole('radio', { name, exact: true }));
          assert(await page.getByRole('radio', { name, exact: true }).isChecked());
        }
        await activate(button('Mirror'));
        for (const name of ['Horizontal', 'Vertical', 'All', 'Selection']) {
          await activate(page.getByRole('radio', { name, exact: true }));
          assert(await page.getByRole('radio', { name, exact: true }).isChecked());
        }
        await field('Mirror axis coordinate').fill('450'); await field('Mirror axis coordinate').press('Tab');
        await field('Mirror axis coordinate').fill('999'); await field('Mirror axis coordinate').press('Escape');
        assert.equal(await field('Mirror axis coordinate').inputValue(), '450');
        assert.deepEqual(graphOnly(await graph()), before, 'Tool options alone cannot edit the document');
        mark('expanded/collapsed geometry buttons, numeric options cancellation, axis and scope controls', controlTargets);
      });

      await run('touch-target-qualification', async () => {
        assert.equal(controlTargets.length, 10, 'All expanded/collapsed geometry controls must be measured');
        if (profile.touch) {
          const undersized = controlTargets.filter(r => r.width < 44 || r.height < 44);
          assert.equal(undersized.length, 0, `Geometry touch targets below 44px: ${JSON.stringify(undersized)}`);
        }
        mark('measured all geometry button targets; coarse-pointer minimum 44px', controlTargets);
      });

      await run('primitives-world-geometry', async () => {
        await openFixture();
        await selectGeometry('Rectangle'); await activate(page.getByTitle('Body 1', { exact: true }));
        assert.equal(await field('Shape positions locked').isChecked(), true);
        const beforeCancel = graphOnly(await graph());
        await dragWorld([rectangle[0], rectangle[2]], 'Escape');
        assert.deepEqual(graphOnly(await graph()), beforeCancel, 'Canceled primitive creates no shape');
        if (cdp) {
          await dragWorld([rectangle[0], rectangle[2]], 'touchCancel');
          assert.deepEqual(graphOnly(await graph()), beforeCancel, 'Touch-canceled primitive creates no shape');
        }
        await dragWorld([rectangle[0], rectangle[2]]);
        let g = await graph(); rectangleId = Object.keys(g.outlines)[0];
        assert(rectangleId); assert.equal(g.outlines[rectangleId].bodyId, 'body1');
        pointsNear(worldPoints(g, g.outlines[rectangleId]), rectangle, 'rectangle world corners');
        await undo(); assert.equal(Object.keys((await graph()).outlines).length, 0, 'Canceled gestures add no undo entry');
        await redo(); pointsNear(worldPoints(await graph(), (await graph()).outlines[rectangleId]), rectangle, 'rectangle redo');
        mark('actual rectangle drag, body-local/world corners, Escape/touchCancel, atomic creation undo/redo');

        await selectGeometry('Circle'); await dragWorld([{ x: 560, y: 300 }, { x: 600, y: 300 }]);
        g = await graph(); circleId = Object.keys(g.outlines).find(id => id !== rectangleId);
        const circle = worldPoints(g, g.outlines[circleId]); assert.equal(circle.length, 48);
        for (const p of circle) near(Math.hypot(p.x - 560, p.y - 300), 40, 'circle radius');
        for (const [key, value] of Object.entries({ minX: 520, maxX: 600, minY: 260, maxY: 340 })) near(bounds(circle)[key], value, `circle ${key}`);
        mark('actual circle drag: 48 vertices, world center/radius and bounds');

        await selectGeometry('N-gon'); await field('Polygon sides').fill('7'); await field('Polygon sides').press('Enter');
        await dragWorld([{ x: 540, y: 470 }, { x: 590, y: 470 }]);
        g = await graph(); ngonId = Object.keys(g.outlines).find(id => ![rectangleId, circleId].includes(id));
        const expected = Array.from({ length: 7 }, (_, i) => ({ x: 540 + 50 * Math.cos(i * Math.PI * 2 / 7), y: 470 + 50 * Math.sin(i * Math.PI * 2 / 7) }));
        pointsNear(worldPoints(g, g.outlines[ngonId]), expected, '7-gon world vertices');
        assert.equal(g.outlines[ngonId].closed !== false, true);
        assert.deepEqual(g.joints, fixture.joints); assert.deepEqual(g.links, fixture.links);
        mark('actual N-gon drag: seven independently calculated world vertices/bounds, rod graph unchanged', bounds(expected));
        geometryGraph = g;
      });

      await run('circle-trim-whole-object', async () => {
        assert(circleId && geometryGraph, 'Circle drawing setup required');
        const original = await graph();
        const saved = await save('circle-before-trim');
        assert.equal(saved.outlines[circleId].primitive, 'circle', 'Circle identity survives actual download');
        await openFixture(saved, 'circle-before-trim.slinker');
        const trimCircle = async (x, cancel) => {
          await shapeProperties(circleId); await collapsePanels();
          await selectGeometry('Trim');
          await activate(page.getByRole('radio', { name: 'Selected Shapes', exact: true }));
          await dragWorld([{ x, y: 240 }, { x, y: 360 }], cancel);
        };
        const before = await graph();
        await trimCircle(570, 'Escape');
        assert.deepEqual(graphOnly(await graph()), graphOnly(before), 'Cancelled circle trim changes nothing');
        await trimCircle(570);
        const after = await graph();
        assert.equal(after.outlines[circleId], undefined, 'Whole circle removed, not surviving arc runs');
        assert.equal(Object.keys(after.outlines).length, Object.keys(before.outlines).length - 1);
        for (const id of Object.keys(before.outlines).filter(id => id !== circleId)) assert.deepEqual(after.outlines[id], before.outlines[id]);
        assert.deepEqual(after.joints, before.joints); assert.deepEqual(after.links, before.links);
        assert(!(await editor()).selectedIds.includes(circleId), 'Deleted circle cannot remain selected');
        await capture('circle-trim-whole');
        await undo(); assert.deepEqual(graphOnly(await graph()), graphOnly(before), 'One undo restores entire circle');
        await redo(); assert.deepEqual(graphOnly(await graph()), graphOnly(after));
        const deleted = await save('circle-after-trim');
        await openFixture(deleted, 'circle-after-trim.slinker');
        assert.equal((await graph()).outlines[circleId], undefined, 'Save/reopen cannot resurrect deleted circle');
        const legacy = { ...fixture, ...graphOnly(original) };
        delete legacy.outlines[circleId].primitive;
        await openFixture(legacy, 'legacy-circle.slinker');
        const legacyBefore = await graph();
        await trimCircle(560); // Diameter crosses sampled circle vertices, not edge interiors.
        assert.equal((await graph()).outlines[circleId], undefined, 'Legacy 48-point circle removed as one object');
        await undo(); assert.deepEqual(graphOnly(await graph()), graphOnly(legacyBefore));
        await openFixture({ ...fixture, ...graphOnly(saved) }, 'circle-restored-for-regressions.slinker');
        geometryGraph = await graph();
        mark('real native circle trim: complete removal, cancel, scope, one undo/redo, download/reopen and legacy diameter crossing');
      });

      await run('manual-outline-finish-cancel', async () => {
        const savedGeometry = await graph();
        await openFixture();
        const points = [{x:260,y:650},{x:400,y:650},{x:350,y:780}];
        await selectGeometry('Outline');
        await activate(page.getByTitle('Body 1',{exact:true}));
        await tapWorld(points[0]);
        assert(await button('Finish outline').isDisabled());
        await activate(button('Cancel outline'));assert.equal(Object.keys((await graph()).outlines).length,0);
        await selectGeometry('Outline');
        await tapWorld(points[0]);await tapWorld(points[1]);
        assert(await button('Finish outline').isEnabled());await activate(button('Finish outline'));
        let lineGraph=await graph(),lineId=Object.keys(lineGraph.outlines)[0];
        assert.equal(lineGraph.outlines[lineId].closed,false);
        pointsNear(worldPoints(lineGraph,lineGraph.outlines[lineId]),points.slice(0,2),'open two-point sketch line');
        await undo();assert.equal(Object.keys((await graph()).outlines).length,0);
        await selectGeometry('Outline');
        for(const point of points)await tapWorld(point);
        await activate(button('Finish outline'));
        let g=await graph(),id=Object.keys(g.outlines)[0];pointsNear(worldPoints(g,g.outlines[id]),points,'finished manual outline');
        await undo();assert.equal(Object.keys((await graph()).outlines).length,0);
        for(const point of points)await tapWorld(point);await tapWorld(points[0]);
        g=await graph();id=Object.keys(g.outlines)[0];pointsNear(worldPoints(g,g.outlines[id]),points,'canvas-closed manual outline');
        mark('touch/mouse manual outline: partial cancel, explicit finish, close-at-first-point and undo');
        await capture('manual-outline-closed');
        await openFixture({...fixture,...graphOnly(savedGeometry)},'g5-geometry-after-manual-outline.slinker');
      });

      await run('v17-1-cad-intersection-trim', async () => {
        const savedGeometry=await graph();
        const ring=Array.from({length:48},(_,i)=>({x:400+60*Math.cos(i*Math.PI/24),y:400+60*Math.sin(i*Math.PI/24)}));
        const outlines={
          ring:{id:'ring',bodyId:'base',name:'Circle',points:ring,closed:true,primitive:'circle'},
          boundary:{id:'boundary',bodyId:'base',name:'Boundary',points:[{x:400,y:300},{x:400,y:500}],closed:false},
        };
        for(const method of ['power','closest']) {
          await openFixture({...fixture,outlines},'intersection-'+method+'.slinker');
          await activate(button('Select'));await tapWorld({x:460,y:400});
          assert.deepEqual((await editor()).selectedIds,['ring']);
          await selectGeometry('Trim');
          await activate(page.getByRole('radio',{name:'Selected Shapes',exact:true}));
          await field('Trim method').selectOption(method);
          const before=graphOnly(await graph());
          if(method==='power') {
            await dragWorld([{x:450,y:400},{x:470,y:400}],'Escape');
            assert.deepEqual(graphOnly(await graph()),before,'Escape cancels intersection trim');
            if(cdp) {await dragWorld([{x:450,y:400},{x:470,y:400}],'touchCancel');assert.deepEqual(graphOnly(await graph()),before);}
            await dragWorld([{x:450,y:400},{x:470,y:400}],undefined,async()=>{
              assert.deepEqual(graphOnly(await graph()),before,'Candidate preview cannot mutate the design');
              await capture('v17-1-power-preview-before-release');
              const red=await canvas.evaluate((c,camera)=>{
                const r=c.getBoundingClientRect(),ctx=c.getContext('2d');
                const x=(camera.pan.x+(400+60/Math.sqrt(2))*camera.zoom)*c.width/r.width;
                const y=(camera.pan.y+(400-60/Math.sqrt(2))*camera.zoom)*c.height/r.height;
                const data=ctx.getImageData(Math.round(x)-3,Math.round(y)-3,7,7).data;
                let count=0;for(let i=0;i<data.length;i+=4)if(data[i]>170&&data[i+1]<130&&data[i+2]<130)count++;
                return count;
              },(await editor()).camera);
              assert(red>0,'Rendered red candidate arc must be visible before release');
            });
          } else await tapWorld({x:460,y:400});
          const after=graphOnly(await graph());
          assert.equal(after.outlines.ring.closed,false);assert.equal(after.outlines.ring.primitive,'circle');
          const arc=worldPoints(after,after.outlines.ring);
          assert(arc.every(p=>p.x<=400+1e-5));
          pointNear(arc[0],{x:400,y:460},'arc start');pointNear(arc.at(-1),{x:400,y:340},'arc end');
          for(const key of Object.keys(before).filter(k=>k!=='outlines'))assert.deepEqual(after[key],before[key]);
          assert.deepEqual(after.outlines.boundary,before.outlines.boundary);
          await capture('v17-1-'+method+'-semicircle');
          const downloaded=await save('v17-1-'+method+'-arc');assert.equal(downloaded.writerVersion,'17.1.0');
          await undo();assert.deepEqual(graphOnly(await graph()),before,'One undo restores full circle');
          await redo();assert.deepEqual(graphOnly(await graph()),after);
          await openFixture({...fixture,...graphOnly(downloaded)},'saved-'+method+'-arc.slinker');
          assert.deepEqual((await graph()).outlines.ring,after.outlines.ring);
        }
        await openFixture({...fixture,outlines:{
          line:{id:'line',bodyId:'base',name:'Open line',points:[{x:300,y:400},{x:400,y:400}],closed:false},
          boundary:{id:'boundary',bodyId:'base',name:'Boundary',points:[{x:450,y:300},{x:450,y:500}],closed:false},
        }},'extend-line.slinker');
        await activate(button('Select'));await tapWorld({x:390,y:400});await selectGeometry('Trim');
        await field('Trim method').selectOption('extend');
        const before=graphOnly(await graph());await tapWorld({x:390,y:400});
        const extended=graphOnly(await graph());pointNear(extended.outlines.line.points.at(-1),{x:450,y:400},'extended endpoint');
        await undo();assert.deepEqual(graphOnly(await graph()),before);await redo();assert.deepEqual(graphOnly(await graph()),extended);
        await undo();await field('Trim method').selectOption('power');await page.keyboard.down('Shift');
        try{await dragWorld([{x:390,y:390},{x:390,y:410}],undefined,undefined,8);}finally{await page.keyboard.up('Shift');}
        assert.deepEqual(graphOnly(await graph()),extended,'Shift-Power uses the same extension boundary');
        mark('17.1 native selected-circle arcs between intersections, both methods, Escape/touch cancellation, one undo/redo, download/reopen and line extension');
        await openFixture({...fixture,...graphOnly(savedGeometry)},'g5-restored-after-cad-trim.slinker');
      });

      await run('shape-properties', async () => {
        assert(rectangleId && geometryGraph, 'Primitive setup required');
        await shapeProperties(rectangleId);
        await commitAndUndo('Shape name', 'G5 rectangle', g => assert.equal(g.outlines[rectangleId].name, 'G5 rectangle'));
        await cancelField('Shape name', 'Canceled name');
        const beforeBody = await graph(), originalWorld = worldPoints(beforeBody, beforeBody.outlines[rectangleId]);
        await field('Shape body').selectOption('base');
        let g = await graph(); assert.equal(g.outlines[rectangleId].bodyId, 'base');
        pointsNear(worldPoints(g, g.outlines[rectangleId]), originalWorld, 'reassigned shape world position');
        await undo(); assert.deepEqual(graphOnly(await graph()), graphOnly(beforeBody));
        mark('Shape body membership changes preserve world geometry and undo');
        for (const label of ['Shape visible', 'Closed shape']) {
          const before = graphOnly(await graph()); await activate(field(label));
          const key = label === 'Shape visible' ? 'visible' : 'closed';
          assert.equal((await graph()).outlines[rectangleId][key], false);
          await undo(); assert.deepEqual(graphOnly(await graph()), before);
        }
        await activate(button('Edit vertices')); await field('Shape vertex').selectOption('0');
        await commitAndUndo('Vertex X', 270, g => near(worldPoints(g, g.outlines[rectangleId])[0].x, 270, 'vertex X'));
        await cancelField('Vertex X', 999);
        await commitAndUndo('Vertex Y', 310, g => near(worldPoints(g, g.outlines[rectangleId])[0].y, 310, 'vertex Y'), 'blur');
        await cancelField('Vertex Y', 999);
        await activate(button('Finish vertex editing'));
        // Leave the original rectangle intact for the one-edge trim's independent oracle.
        await undo(); await undo();
        g = await graph(); pointsNear(worldPoints(g, g.outlines[rectangleId]), rectangle, 'vertex edits undone');
        geometryGraph = g;
        mark('shape visibility/closed toggles and vertex X/Y editing with cancellation/history');
      });

      await run('trim-selection-and-undo', async () => {
        assert(rectangleId && geometryGraph, 'Primitive setup required');
        await shapeProperties(rectangleId); await collapsePanels();
        await selectGeometry('Trim'); await activate(page.getByRole('radio', { name: 'Selected Shapes', exact: true }));
        const before = await graph();
        await dragWorld([{ x: 320, y: 280 }, { x: 320, y: 320 }]);
        const after = await graph(), trimmed = after.outlines[rectangleId];
        assert.equal(trimmed.closed, false); assert.equal(trimmed.points.length, 4);
        pointsNear(worldPoints(after, trimmed), [rectangle[1], rectangle[2], rectangle[3], rectangle[0]], 'trimmed open run');
        for (const id of Object.keys(before.outlines).filter(id => id !== rectangleId)) assert.deepEqual(after.outlines[id], before.outlines[id], `Trim scope preserves ${id}`);
        assert.deepEqual(after.joints, before.joints); assert.deepEqual(after.links, before.links); assert.deepEqual(after.bodies, before.bodies);
        await capture('trim-open-four-vertices');
        await undo(); assert.deepEqual(graphOnly(await graph()), graphOnly(before), 'One undo restores closed rectangle');
        await capture('trim-undone-closed');
        await redo(); assert.deepEqual(graphOnly(await graph()), graphOnly(after));
        geometryGraph = after;
        mark('selected trim crosses one edge: closed=false, four preserved vertices, others unchanged, one undo/redo');
      });

      await run('mirror-selection-identity', async () => {
        assert(rectangleId && geometryGraph, 'Primitive setup required');
        await shapeProperties(rectangleId); await collapsePanels();
        await activate(button('Mirror')); await activate(page.getByRole('radio', { name: 'Vertical', exact: true }));
        await activate(page.getByRole('radio', { name: 'Selection', exact: true }));
        await field('Mirror axis coordinate').fill('450'); await field('Mirror axis coordinate').press('Enter');
        const before = await graph();
        await activate(button('Apply mirror'));
        const after = await graph(), added = Object.keys(after.outlines).filter(id => !before.outlines[id]);
        assert.equal(added.length, 1); mirrorId = added[0]; assert.notEqual(mirrorId, rectangleId);
        for (const [id, outline] of Object.entries(before.outlines)) assert.deepEqual(after.outlines[id], outline, `Mirror original ${id} stable`);
        assert.deepEqual(after.joints, before.joints); assert.deepEqual(after.links, before.links); assert.deepEqual(after.bodies, before.bodies);
        const expected = worldPoints(before, before.outlines[rectangleId]).map(p => ({ x: 900 - p.x, y: p.y }));
        pointsNear(worldPoints(after, after.outlines[mirrorId]), expected, 'mirrored shape');
        assert.equal(after.outlines[mirrorId].closed, before.outlines[rectangleId].closed);
        assert.deepEqual((await editor()).selectedIds, [mirrorId]);
        await undo(); assert.deepEqual(graphOnly(await graph()), graphOnly(before));
        await redo(); assert.deepEqual(graphOnly(await graph()), graphOnly(after));
        geometryGraph = after;
        mark('selected vertical-axis mirror: fresh ID, exact reflected world geometry, original graph stable, undo/redo');
      });

      await run('image-chooser-properties-pixels', async () => {
        // Recover independent image coverage even when a preceding geometry case failed.
        await openFixture();
        if (geometryGraph) {
          const combined = { ...fixture, ...graphOnly(geometryGraph), projectName: 'G5 combined', viewPreferences: fixture.viewPreferences };
          await openFixture(combined, 'g5-created-geometry.slinker');
        }
        assert(Object.hasOwn(await graph(), 'images'), 'Mounted mechanism() observer must expose images for G5 (read-only config prerequisite)');
        const dataURL = await page.evaluate(() => {
          const c = document.createElement('canvas'); c.width = 96; c.height = 64;
          const ctx = c.getContext('2d');
          ctx.fillStyle = '#ff0000'; ctx.fillRect(0, 0, 48, 64);
          ctx.fillStyle = '#0000ff'; ctx.fillRect(48, 0, 48, 64);
          ctx.fillStyle = '#ffffff'; ctx.fillRect(6, 6, 12, 10);
          return c.toDataURL('image/png');
        });
        const bitmap = Buffer.from(dataURL.split(',')[1], 'base64');
        await writeFile(join(dir, 'asymmetric-test-only.png'), bitmap);
        await selectGeometry('Rectangle'); await activate(page.getByTitle('Body 1', { exact: true }));
        const chooser = page.waitForEvent('filechooser'); await activate(page.getByTitle('Image', { exact: true }));
        await (await chooser).setFiles({ name: 'g5-asymmetric-test-only.png', mimeType: 'image/png', buffer: bitmap });
        await page.waitForFunction(() => Object.keys(globalThis.__LINKAGE_G0_READ__.mechanism().images).length === 1);
        let g = await graph(); imageId = Object.keys(g.images)[0];
        assert.equal(g.images[imageId].src, dataURL); assert.equal(g.images[imageId].bodyId, 'body1');
        assert.equal(g.images[imageId].naturalWidth, 96); assert.equal(g.images[imageId].naturalHeight, 64);
        await undo(); assert.equal(Object.keys((await graph()).images).length, 0);
        await redo(); assert.deepEqual((await graph()).images[imageId], g.images[imageId]);
        mark('Image first-import automatic shared file chooser, generated asymmetric PNG bytes, image import single undo/redo');
        await imageProperties();
        const edits = [
          ['Image X', 300, s => near(s.images[imageId].position.x, 300, 'image X')],
          ['Image Y', 620, s => near(s.images[imageId].position.y, 620, 'image Y')],
          ['Image scale', 1.5, s => near(s.images[imageId].scale, 1.5, 'image scale')],
          ['Image rotation degrees', 30, s => near(s.images[imageId].rotation, Math.PI / 6, 'image rotation')],
          ['Image opacity percent', 75, s => near(s.images[imageId].opacity, .75, 'image opacity')],
        ];
        for (let i = 0; i < edits.length; i++) {
          const [label, value, verify] = edits[i];
          await commitAndUndo(label, value, verify, i % 2 ? 'blur' : 'Enter');
          await cancelField(label, label.includes('opacity') ? 25 : 999);
        }
        const beforeBody = graphOnly(await graph()); await field('Image body').selectOption('base');
        assert.equal((await graph()).images[imageId].bodyId, 'base');
        pointNear((await graph()).images[imageId].position, beforeBody.images[imageId].position, 'image reassignment center');
        await undo(); assert.deepEqual(graphOnly(await graph()), beforeBody);
        for (const [label, key] of [['Image reflected', 'flipX'], ['Image visible', 'visible']]) {
          const before = graphOnly(await graph()); await activate(field(label));
          assert.equal((await graph()).images[imageId][key], !(before.images[imageId][key] ?? false));
          const after = graphOnly(await graph()); await undo(); assert.deepEqual(graphOnly(await graph()), before);
          await redo(); assert.deepEqual(graphOnly(await graph()), after);
          if (key === 'visible') await undo();
        }
        await field('Image rotation degrees').fill('0'); await field('Image rotation degrees').press('Enter');
        await field('Image opacity percent').fill('100'); await field('Image opacity percent').press('Enter');
        await collapsePanels(); await checkPixels(true); await capture('image-reflected-pixels');
        await imageProperties(); await activate(field('Image reflected')); await collapsePanels();
        await checkPixels(false); await capture('image-normal-pixels');
        await imageProperties(); await activate(field('Image reflected'));
        await field('Image rotation degrees').fill('30'); await field('Image rotation degrees').press('Enter');
        await field('Image opacity percent').fill('75'); await field('Image opacity percent').press('Enter');
        await collapsePanels();
        mark('Image body/visibility/reflection editing and real canvas normal/reflected bitmap pixels');
      });

      await run('image-canvas-move-cancel', async () => {
        assert(imageId, 'Image setup required');
        await collapsePanels();
        // Switching to another tool before Image avoids opening its import chooser again.
        await selectGeometry('Rectangle'); await activate(page.getByTitle('Image', { exact: true }));
        const before = await graph(), p = before.images[imageId].position;
        await dragWorld([p, { x: p.x + 70, y: p.y + 40 }]);
        const moved = await graph(); pointNear(moved.images[imageId].position, { x: p.x + 70, y: p.y + 40 }, 'image canvas move');
        assert.deepEqual(moved.outlines, before.outlines); assert.deepEqual(moved.joints, before.joints);
        await undo(); assert.deepEqual(graphOnly(await graph()), graphOnly(before));
        await redo(); assert.deepEqual(graphOnly(await graph()), graphOnly(moved));
        await dragWorld([moved.images[imageId].position, { x: p.x + 130, y: p.y + 80 }], 'Escape');
        assert.deepEqual(graphOnly(await graph()), graphOnly(moved));
        if (cdp) {
          await dragWorld([moved.images[imageId].position, { x: p.x + 130, y: p.y + 80 }], 'touchCancel');
          assert.deepEqual(graphOnly(await graph()), graphOnly(moved));
        }
        await undo(); assert.deepEqual(graphOnly(await graph()), graphOnly(before), 'Canceled move leaves no undo entry');
        await redo(); assert.deepEqual(graphOnly(await graph()), graphOnly(moved));
        mark('actual image canvas drag/move, single undo/redo, Escape and Chromium touchCancel rollback/history');
      });

      await run('complete-save-download-reopen', async () => {
        const before = await graph(); assert(imageId && before.images?.[imageId], 'Image setup required for complete graph round-trip');
        assert(mirrorId && before.outlines[mirrorId], 'Mirror setup required for complete graph round-trip');
        assert.equal(before.outlines[rectangleId].closed, false);
        assert.equal(before.images[imageId].flipX, true);
        assert(before.bodies.body1.frame, 'Stable body frame must exist in the mounted graph');
        const saved = await save('complete-graph');
        assert.deepEqual(graphOnly(saved), graphOnly(before), 'Downloaded complete graph equals mounted graph, including closed/frame/flipX/assets');
        await openFixture(); assert.equal(Object.keys((await graph()).outlines).length, 0);
        await openFixture(saved, 'g5-complete-roundtrip.slinker');
        assert.deepEqual(graphOnly(await graph()), graphOnly(saved), 'Reopened complete graph equals downloaded graph');
        const savedAgain = await save('complete-graph-reopened');
        assert.deepEqual(graphOnly(savedAgain), graphOnly(saved), 'Second actual download preserves all graph fields');
        assert.deepEqual(savedAgain.viewPreferences.camera, saved.viewPreferences.camera);
        mark('actual Save/download/Open/reopen/Save complete graph with IDs, body frame, closed=false, flipX, transforms and PNG bytes');
      });

      await run('image-follows-simulated-body-pixels', async () => {
        const asset = (await graph()).images[imageId];
        assert(asset, 'Image setup required');
        const scene = structuredClone(fixture);
        scene.projectName = 'G5 runtime image attachment';
        scene.joints.a.type = 'fixed';
        scene.bodies.base.jointIds = ['a'];
        scene.images = { [imageId]: { ...asset, bodyId: 'body1', position: { x: 150, y: 200 },
          rotation: 0, scale: 1, opacity: 1, visible: true, flipX: false } };
        await openFixture(scene, 'g5-attached-image.slinker');
        const design = graphOnly(await graph());
        await activate(page.getByTitle('Simulate mode', { exact: true }));
        await dragWorld([{ x: 200, y: 200 }, { x: 100, y: 300 }]);
        await activate(button('Pause'));
        await page.waitForFunction(() => !globalThis.__LINKAGE_G0_READ__.simulation().isPlaying);
        const runtime = await graph(), a = runtime.joints.a.position, b = runtime.joints.b.position;
        pointNear(a, scene.joints.a.position, 'fixed image-body pivot');
        assert(Math.hypot(b.x - 200, b.y - 200) > 20, 'Attached body must actually rotate');
        assert.deepEqual(runtime.images[imageId], design.images[imageId], 'Simulation must not mutate design image transform');
        const center = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
        const angle = Math.atan2(b.y - a.y, b.x - a.x);
        const samples = [-24, 24].map(x => ({ x: center.x + x * Math.cos(angle) - 13 * Math.sin(angle),
          y: center.y + x * Math.sin(angle) + 13 * Math.cos(angle) }));
        await page.waitForFunction(({ samples }) => {
          const c = document.querySelector('canvas'), r = c.getBoundingClientRect();
          const camera = globalThis.__LINKAGE_G0_READ__.editor().camera;
          const colors = samples.map(p => Array.from(c.getContext('2d').getImageData(
            Math.round((camera.pan.x + p.x * camera.zoom) * c.width / r.width),
            Math.round((camera.pan.y + p.y * camera.zoom) * c.height / r.height), 1, 1).data));
          return colors[0][0] > 220 && colors[0][1] < 40 && colors[0][2] < 40
            && colors[1][2] > 220 && colors[1][0] < 40 && colors[1][1] < 40;
        }, { samples }, { timeout: 4000 });
        await capture('attached-image-rotated-pixels');
        await activate(page.getByTitle('Create mode', { exact: true }));
        assert.deepEqual(graphOnly(await graph()), design, 'Design graph and image restore after body motion');
        mark('Real simulated body rotation, fixed pivot, independently predicted red/blue image pixels, exact design restore');
      });

      await run('console-and-input-health', async () => {
        assert.equal(errors.length, 0, JSON.stringify(errors, null, 2));
        const events = await page.evaluate(() => globalThis.__g5InputEvidence);
        const canvasDown = events.filter(e => e.type === 'pointerdown' && e.tag === 'CANVAS');
        assert(canvasDown.length > 0 && canvasDown.every(e => e.trusted));
        const expected = cdp ? 'touch' : 'mouse';
        assert(canvasDown.some(e => e.pointerType === expected), `Actual ${expected} canvas input required`);
        if (profile.touch) assert(events.some(e => e.type === 'pointerdown' && e.tag === 'BUTTON' && e.pointerType === 'touch' && e.trusted), 'Actual trusted UI touch tap required');
        mark('no page/console errors and recorded trusted canvas/UI events');
      });
    } catch (error) {
      steps.push({ name: currentStep, passed: false, failure: error.stack });
      await page.screenshot({ path: join(dir, 'bootstrap-FAILED.png'), fullPage: true }).catch(() => {});
    } finally {
      const diagnostics = await page.evaluate(() => {
        const c = document.querySelector('canvas'), r = c?.getBoundingClientRect();
        return { graph: globalThis.__LINKAGE_G0_READ__?.mechanism?.(), editor: globalThis.__LINKAGE_G0_READ__?.editor?.(),
          events: globalThis.__g5InputEvidence, bodyText: document.body.innerText,
          canvas: c ? { x: r.x, y: r.y, width: r.width, height: r.height, backingWidth: c.width, backingHeight: c.height, dpr: devicePixelRatio } : null,
          html: document.querySelector('.app-layout')?.outerHTML };
      }).catch(error => ({ captureFailure: String(error) }));
      await writeFile(join(dir, 'raw-state.json'), JSON.stringify(diagnostics, null, 2));
      await writeFile(join(dir, 'console.json'), JSON.stringify(consoleMessages, null, 2));
      const result = { profile, build, passed: steps.length > 0 && steps.every(s => s.passed) && errors.length === 0, checks, steps, errors, controlTargets,
        input: cdp ? 'trusted Chromium CDP touch; single session; 300ms held before drag release'
          : profile.touch ? 'trusted WebKit UI taps; native mouse geometry/image drags' : 'native mouse and keyboard',
        comparisons: ['C03', 'C04', 'C05', 'C09', 'C10', 'C11', 'C12', 'C13'], screens: ['S08', 'S09', 'S10'] };
      results.push(result);
      await writeFile(join(dir, 'report.json'), JSON.stringify(result, null, 2));
      await context.tracing.stop({ path: join(dir, 'trace.zip') });
      await context.close();
    }
  }
} finally { await browser.close(); }
const sourceEnd = await candidateFingerprint();
const stableSource = sourceStart.sourceSha256 === sourceEnd.sourceSha256;
const report = { startedAt, finishedAt: new Date().toISOString(), engine, browser: browser.version(), url,
  harnessSha256, sourceStart, sourceEnd, stableSource, results,
  passed: stableSource && results.length === profiles.length && results.every(r => r.passed), gateAcceptance: false,
  limits: ['Harness evidence only; lead owns final immutable-build/cumulative gate acceptance.',
    'Physical iPad, Apple Pencil, Safari device/Home Screen and VoiceOver not verified.',
    'WebKit supports actual trusted UI taps here, but canvas drags use native mouse; trusted multi-touch/pen dispatch unavailable.',
    'Trim Active Bodies and Mirror All/Horizontal controls are exercised; destructive geometry assertions use Selected Shapes and Selection/Vertical.',
    'Image attachment is qualified by real canvas pixels during body motion; no calibrated image/body dynamics or physical-device claim.'],
  usage: 'unknown', physicalIPadVerified: false, voiceOverVerified: false };
await writeFile(join(output, 'report.json'), JSON.stringify(report, null, 2));
console.log(JSON.stringify({ output, stableSource, passed: report.passed, gateAcceptance: false,
  results: results.map(r => ({ profile: r.profile.id, passed: r.passed, failures: r.steps.filter(s => !s.passed) })) }));
if (!report.passed) process.exitCode = 1;
