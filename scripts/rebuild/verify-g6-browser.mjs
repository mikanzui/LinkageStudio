import { chromium, webkit } from '../../.rebuild.local/tooling/node_modules/playwright/index.mjs';
import { candidateFingerprint, assertCandidateBuild } from './candidate-fingerprint.mjs';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdir, mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

// Install at scripts/rebuild/verify-g6-browser.mjs before running. The package
// deliberately keeps installed-path imports. No evaluation mutates app state.
const root = fileURLToPath(new URL('../../', import.meta.url));
const engine = process.argv[2] ?? 'chromium';
assert(['chromium', 'webkit'].includes(engine), 'Use chromium or webkit');
const url = process.argv[3] ?? process.env.LINKAGE_CANDIDATE_URL;
assert(url, 'Supply the lead-approved frozen preview URL');
const startedAt = new Date().toISOString();
const sourceStart = await candidateFingerprint();
const harness = await readFile(fileURLToPath(import.meta.url));
const harnessSha256 = createHash('sha256').update(harness).digest('hex');
const parent = join(root, '.rebuild.local/evidence/g6');
await mkdir(parent, { recursive: true });
const output = await mkdtemp(join(parent, `${engine}-browser-`));
await writeFile(join(output, 'harness.mjs'), harness);
const profiles = [
  { id: 'desktop', width: 1440, height: 1000, touch: false, dpr: 1 },
  { id: 'tablet', width: 1024, height: 1366, touch: true, dpr: 2 },
];
const body = (id, jointIds, color = '#4caf50') => ({ id, name: id, jointIds, color, useOutlineCOM: false, showLinks: true });
const joint = (id, x, y, connectedLinkIds = [], type = 'revolute') => ({ id, type, position: { x, y }, connectedLinkIds });
const fixture = {
  version: '0.12.3', projectName: 'G6 rod and free joints',
  oldForkMetadata: { author: 'G6 preserved author', nested: { note: 'Do not discard unknown legacy metadata', revision: 7 } },
  joints: { a: joint('a', 100, 180, ['rod'], 'fixed'), b: joint('b', 220, 180, ['rod']),
    c: joint('c', 320, 300), d: joint('d', 100, 360) },
  links: { rod: { id: 'rod', jointIds: ['a', 'b'], restLength: 120, mass: 1 } },
  bodies: { base: body('base', ['a'], '#e53935'), rod: body('rod', ['a', 'b']),
    freeC: body('freeC', ['c'], '#42a5f5'), freeD: body('freeD', ['d'], '#ef6c00') },
  baseBodyId: 'base', outlines: {}, images: {}, sliders: {}, colliders: {}, tracers: {},
  viewPreferences: { camera: { zoom: 1, pan: { x: 0, y: 0 } }, gridLevel: 'off', showRulers: false },
  simulationSettings: { gravityEnabled: false, gravityStrength: 250, damping: .5, dragMultiplier: 25, dragDamping: .25 },
};
const torsionFixture = {
  ...structuredClone(fixture), projectName: 'G6 two independent pivoted rods',
  joints: { pivot: joint('pivot', 100, 160, ['legA', 'legB'], 'fixed'),
    endA: joint('endA', 220, 160, ['legA']), endB: joint('endB', 100, 280, ['legB']) },
  links: { legA: { id: 'legA', jointIds: ['pivot', 'endA'], restLength: 120, mass: 1 },
    legB: { id: 'legB', jointIds: ['pivot', 'endB'], restLength: 120, mass: 1 } },
  bodies: { base: body('base', ['pivot'], '#e53935'), armA: body('armA', ['pivot', 'endA']),
    armB: body('armB', ['pivot', 'endB'], '#42a5f5') },
};
await writeFile(join(output, 'fixture.slinker'), JSON.stringify(fixture, null, 2));
await writeFile(join(output, 'torsion-fixture.slinker'), JSON.stringify(torsionFixture, null, 2));
const graphKeys = ['joints', 'links', 'bodies', 'baseBodyId', 'outlines', 'images', 'sliders', 'colliders', 'tracers', 'springs'];
const graphOnly = graph => Object.fromEntries(graphKeys.map(key => [key, graph[key] ?? (key === 'baseBodyId' ? undefined : {})]));
const distance = (a, b) => Math.hypot(b.x - a.x, b.y - a.y);
const near = (a, b, label, tolerance = 1e-5) => assert(Math.abs(a - b) <= tolerance, `${label}: expected ${b}, got ${a}`);
const wrap = angle => Math.atan2(Math.sin(angle), Math.cos(angle));
function resolve(anchor, graph) {
  if (anchor.type === 'world') return anchor.position;
  if (anchor.type === 'joint') return graph.joints[anchor.jointId].position;
  const [a, b] = graph.links[anchor.linkId].jointIds.map(id => graph.joints[id].position);
  return { x: a.x + anchor.t * (b.x - a.x), y: a.y + anchor.t * (b.y - a.y) };
}
function signedAngle(graph, spring) {
  const aLink = graph.links[spring.anchorA.linkId], bLink = graph.links[spring.anchorB.linkId];
  const pivotA = aLink.jointIds[spring.anchorA.t], pivotB = bLink.jointIds[spring.anchorB.t];
  assert.equal(pivotA, pivotB, 'Torsion legs share the selected endpoint pivot');
  const p = graph.joints[pivotA].position;
  const a = graph.joints[aLink.jointIds[1 - spring.anchorA.t]].position;
  const b = graph.joints[bLink.jointIds[1 - spring.anchorB.t]].position;
  return Math.atan2((a.x - p.x) * (b.y - p.y) - (a.y - p.y) * (b.x - p.x),
    (a.x - p.x) * (b.x - p.x) + (a.y - p.y) * (b.y - p.y));
}
const results = [];
const browser = engine === 'webkit' ? await webkit.launch({ headless: true })
  : await chromium.launch({ channel: 'chrome', headless: true });
try {
  for (const profile of profiles) {
    const dir = join(output, profile.id);
    await mkdir(dir);
    const context = await browser.newContext({ viewport: { width: profile.width, height: profile.height },
      deviceScaleFactor: profile.dpr, hasTouch: profile.touch, isMobile: profile.touch,
      serviceWorkers: 'block', acceptDownloads: true });
    await context.addInitScript(() => {
      Object.defineProperty(window, 'showSaveFilePicker', { value: undefined, configurable: true });
      globalThis.__g6Events = [];
      for (const type of ['pointerdown', 'pointermove', 'pointerup', 'pointercancel', 'click', 'keydown']) {
        document.addEventListener(type, event => {
          const target = event.target.closest?.('button,input,select,canvas') ?? event.target;
          globalThis.__g6Events.push({ type, time: performance.now(), trusted: event.isTrusted,
            pointerType: event.pointerType, pointerId: event.pointerId, x: event.clientX, y: event.clientY,
            key: event.key, tag: target.tagName, label: target.getAttribute?.('aria-label') ?? target.title });
        }, true);
      }
    });
    await context.tracing.start({ screenshots: true, snapshots: true, sources: false });
    const page = await context.newPage();
    page.setDefaultTimeout(10000);
    const cdp = engine === 'chromium' && profile.touch ? await context.newCDPSession(page) : null;
    const errors = [], consoleMessages = [], steps = [], checks = [], targets = [], motion = [];
    let sequence = 0, currentStep = 'bootstrap', build;
    page.on('pageerror', error => errors.push({ type: 'pageerror', message: error.message }));
    page.on('console', message => {
      consoleMessages.push({ type: message.type(), message: message.text() });
      if (message.type() === 'error') errors.push({ type: 'console', message: message.text() });
    });
    page.on('dialog', dialog => dialog.accept(dialog.type() === 'prompt' ? 'g6-complete.slinker' : undefined));
    const button = name => page.getByRole('button', { name, exact: true });
    const field = name => page.getByLabel(name, { exact: true });
    const activate = locator => profile.touch ? locator.tap() : locator.click();
    const acceptDirtyOpen = async () => {
      const unsaved = page.getByRole('dialog', { name: 'Unsaved Changes', exact: true });
      if (await unsaved.isVisible()) await activate(unsaved.getByRole('button', { name: 'Discard and open', exact: true }));
    };
    const canvas = page.locator('canvas');
    const read = () => page.evaluate(() => ({ graph: globalThis.__LINKAGE_G0_READ__.mechanism(),
      editor: globalThis.__LINKAGE_G0_READ__.editor(), simulation: globalThis.__LINKAGE_G0_READ__.simulation() }));
    const graph = async () => (await read()).graph;
    const undo = () => activate(button('Undo'));
    const redo = () => activate(button('Redo'));
    async function capture(name, extra = {}, screenshot = false) {
      const stem = `${String(++sequence).padStart(3, '0')}-${name}`;
      const state = await read();
      await writeFile(join(dir, `${stem}.json`), JSON.stringify({ ...state, extra }, null, 2));
      if (screenshot) await page.screenshot({ path: join(dir, `${stem}.png`), fullPage: true });
      return state;
    }
    // Capture and flush diagnostic state BEFORE evaluating assertions, not only
    // after a pass. A failed numeric/sign assertion retains its input samples.
    async function check(name, assertion, extra = {}) {
      const state = await capture(name, extra);
      assertion(state);
      checks.push({ name, passed: true });
      return state;
    }
    async function run(name, work) {
      currentStep = name;
      const start = Date.now();
      try {
        await work();
        await capture(name, {}, true);
        steps.push({ name, passed: true, elapsedMs: Date.now() - start });
      } catch (error) {
        const failure = { name, passed: false, elapsedMs: Date.now() - start, failure: error.stack,
          classification: /observer must expose/.test(error.message) ? 'observation-prerequisite'
            : error.name === 'TimeoutError' ? 'selector-or-timing-needs-review' : 'assertion-needs-review' };
        steps.push(failure);
        await capture(`${name}-FAILED`, { failure: error.stack }, true).catch(e => failure.captureFailure = String(e));
      }
      await writeFile(join(dir, 'progress.json'), JSON.stringify({ steps, checks, errors }, null, 2));
      console.log(JSON.stringify({ engine, profile: profile.id, step: steps.at(-1) }));
    }
    async function waitPixels() {
      await page.waitForFunction(() => {
        const c = document.querySelector('canvas'); if (!c) return false;
        const r = c.getBoundingClientRect(), dpr = Math.min(3, Math.max(.5, devicePixelRatio));
        return r.width >= 390 && r.height > 300 && Math.abs(c.width - r.width * dpr) <= 1
          && Math.abs(c.height - r.height * dpr) <= 1;
      });
      await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
    }
    async function collapsePanels() {
      for (const name of ['Collapse toolbar', 'Collapse panel']) {
        const control = page.getByTitle(name, { exact: true });
        if (await control.count()) await activate(control);
      }
      await page.locator('.toolbar-collapsed').waitFor();
      await page.locator('.panel-collapsed').waitFor();
      await waitPixels();
    }
    async function openProperties(id) {
      const expand = page.getByTitle('Expand panel', { exact: true });
      if (await expand.count()) await activate(expand);
      const spring = (await graph()).springs[id];
      await activate(button(`Properties for ${spring.name ?? id}`));
      await field('Spring name').waitFor();
    }
    async function openData(data = fixture, filename = 'g6-fixture.slinker') {
      const chooser = page.waitForEvent('filechooser');
      await activate(button('Open')); await acceptDirtyOpen();
      await (await chooser).setFiles({ name: filename, mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(data)) });
      await page.waitForFunction(name => globalThis.__LINKAGE_G0_READ__.editor().projectName === name
        && document.querySelector('.top-bar')?.getAttribute('aria-busy') === 'false', data.projectName);
      await collapsePanels();
      await check('opened-through-chooser', state => {
        assert.deepEqual(state.editor.camera, data.viewPreferences.camera);
        assert.equal(state.simulation.gravityEnabled, false);
        assert.deepEqual(state.graph.springs, data.springs ?? {});
      });
    }
    async function screen(point) {
      await waitPixels();
      const r = await canvas.boundingBox(), camera = (await read()).editor.camera;
      const p = { x: r.x + camera.pan.x + point.x * camera.zoom, y: r.y + camera.pan.y + point.y * camera.zoom };
      const hit = await page.evaluate(p => document.elementFromPoint(p.x, p.y)?.tagName, p);
      if (!(p.x > r.x && p.x < r.x + r.width && p.y > r.y && p.y < r.y + r.height && hit === 'CANVAS')) {
        await check('unreachable-canvas-point', () => assert.fail('World point outside/covered canvas'), { point, p, r, camera, hit });
      }
      return p;
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
    async function cancelTouch(point) {
      const p = await screen(point);
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ ...p, id: 31 }] });
      try { await page.waitForTimeout(300); await capture('touch-held-before-cancel'); }
      finally { await cdp.send('Input.dispatchTouchEvent', { type: 'touchCancel', touchPoints: [] }); }
    }
    async function dragWorld(from, to, cancel = false) {
      const a = await screen(from), b = await screen(to);
      if (cdp) await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ ...a, id: 41 }] });
      else { await page.mouse.move(a.x, a.y); await page.mouse.down(); }
      try {
        for (let i = 1; i <= 20; i++) {
          const p = { x: a.x + (b.x - a.x) * i / 20, y: a.y + (b.y - a.y) * i / 20 };
          if (cdp) await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ ...p, id: 41 }] });
          else await page.mouse.move(p.x, p.y);
          await page.waitForTimeout(16);
        }
        // Chrome native rapid flick release can suppress the next UI click.
        // A post-release sleep is not equivalent to this pre-release hold.
        await page.waitForTimeout(300);
        if (cancel && !cdp) await page.keyboard.press('Escape');
      } finally {
        if (cdp) await cdp.send('Input.dispatchTouchEvent', { type: cancel ? 'touchCancel' : 'touchEnd', touchPoints: [] });
        else await page.mouse.up();
      }
    }
    async function target(locator, label) {
      await locator.scrollIntoViewIfNeeded();
      const result = await locator.evaluate(el => {
        const r = el.getBoundingClientRect(), x = r.x + r.width / 2, y = r.y + r.height / 2;
        const hit = document.elementFromPoint(x, y);
        return { x, y, width: r.width, height: r.height, reachable: x >= 0 && x < innerWidth && y >= 0 && y < innerHeight
          && (hit === el || el.contains(hit)), hit: hit?.tagName, coarse: matchMedia('(pointer: coarse)').matches };
      });
      targets.push({ label, ...result });
      await check('target-hit-reachability', () => {
        assert(result.reachable, `${label}: center must be hit-reachable`);
        if (profile.touch) assert(result.width >= 44 && result.height >= 44, `${label}: coarse target >=44px`);
      }, { label, result });
    }
    async function selectOption(label, value) {
      const before = graphOnly(await graph());
      await field(label).selectOption(String(value));
      return { before, after: graphOnly(await graph()) };
    }
    async function edit(label, value, verify, method = 'Enter') {
      const before = graphOnly(await graph());
      await field(label).fill(String(value));
      await check('field-draft-isolated', state => assert.deepEqual(graphOnly(state.graph), before), { label, value });
      await field(label).press(method === 'blur' ? 'Tab' : 'Enter');
      const after = graphOnly(await graph());
      await check('field-commit', () => { assert.notDeepEqual(after, before); verify(after); }, { label, value, method });
      await undo();
      await check('field-one-undo', state => assert.deepEqual(graphOnly(state.graph), before), { label });
      await redo();
      await check('field-redo', state => assert.deepEqual(graphOnly(state.graph), after), { label });
    }
    async function noEdit(label, value, method) {
      const before = graphOnly(await graph());
      await field(label).fill(String(value));
      await field(label).press(method);
      await check('invalid-or-escaped-field-preserves-graph', state => assert.deepEqual(graphOnly(state.graph), before), { label, value, method });
      await undo();
      await check('invalid-or-escaped-field-no-history', state => assert.notDeepEqual(graphOnly(state.graph), before), { label });
      await redo();
      await check('invalid-or-escaped-field-redo', state => assert.deepEqual(graphOnly(state.graph), before), { label });
    }
    async function place(name, points) {
      await collapsePanels();
      await activate(button(name));
      const before = graphOnly(await graph()), oldIds = new Set(Object.keys(before.springs));
      for (let i = 0; i < points.length; i++) {
        await tapWorld(points[i]);
        if (i < points.length - 1) await check('incomplete-placement-no-entity', state => {
          assert.deepEqual(graphOnly(state.graph), before);
          assert(state.editor.springPlacement, 'Pending placement must be observable');
        }, { name, pointIndex: i });
      }
      let id;
      await check('placement-atomic', state => {
        const ids = Object.keys(state.graph.springs).filter(id => !oldIds.has(id));
        assert.equal(ids.length, 1); id = ids[0];
        assert.equal(state.editor.springPlacement, null); assert.equal(state.editor.springReattachId, null);
        assert.deepEqual(state.editor.selectedIds, [id]);
      }, { name, points });
      const after = graphOnly(await graph());
      await undo(); await check('placement-one-undo', state => assert.deepEqual(graphOnly(state.graph), before));
      await redo(); await check('placement-redo', state => assert.deepEqual(graphOnly(state.graph), after));
      return id;
    }
    async function save(name) {
      const pending = page.waitForEvent('download');
      await activate(button('Save'));
      const download = await pending, failure = await download.failure();
      await check('download-completed', () => assert.equal(failure, null), { filename: download.suggestedFilename(), failure });
      const path = join(dir, `${name}.slinker`);
      await download.saveAs(path);
      return JSON.parse(await readFile(path, 'utf8'));
    }
    async function pixels(center) {
      await waitPixels();
      const sample = await canvas.evaluate((c, center) => {
        const camera = globalThis.__LINKAGE_G0_READ__.editor().camera, r = c.getBoundingClientRect();
        const x = (camera.pan.x + center.x * camera.zoom) * c.width / r.width;
        const y = (camera.pan.y + center.y * camera.zoom) * c.height / r.height;
        return { bytes: [...c.getContext('2d').getImageData(Math.round(x - 24), Math.round(y - 24), 48, 48).data],
          width: c.width, height: c.height, cssWidth: r.width, cssHeight: r.height, dpr: devicePixelRatio };
      }, center);
      const { bytes, ...dimensions } = sample;
      return { ...dimensions, sha256: createHash('sha256').update(Buffer.from(bytes)).digest('hex'),
        distinctColors: new Set(Array.from({ length: bytes.length / 4 }, (_, i) => bytes.slice(i * 4, i * 4 + 4).join(','))).size };
    }
    async function simulate(name, metric, duration = 1.2) {
      await collapsePanels();
      const design = await graph();
      await activate(page.getByTitle('Simulate mode', { exact: true }));
      const samples = [];
      const start = Date.now();
      while (Date.now() - start < 7000) {
        const state = await read();
        samples.push({ time: state.simulation.time, value: metric(state.graph), simulation: state.simulation, graph: state.graph });
        if (state.simulation.stepError || state.simulation.time >= duration) break;
        await page.waitForTimeout(60);
      }
      await activate(button('Pause'));
      const paused = await read();
      samples.push({ time: paused.simulation.time, value: metric(paused.graph), simulation: paused.simulation, graph: paused.graph });
      motion.push({ name, samples });
      await writeFile(join(dir, `${name}-samples.json`), JSON.stringify({ design, samples }, null, 2));
      await check('motion-samples-health', () => {
        assert(samples.at(-1).time >= duration, 'Simulation must actually advance to the requested time');
        for (const sample of samples) {
          assert.equal(sample.simulation.stepError, null);
          assert(Number.isFinite(sample.value));
          for (const [id, j] of Object.entries(sample.graph.joints)) {
            assert(Number.isFinite(j.position.x) && Number.isFinite(j.position.y));
            if (design.joints[id]?.type === 'fixed') assert.deepEqual(j.position, design.joints[id].position);
          }
          for (const link of Object.values(design.links)) {
            const [a, b] = link.jointIds.map(id => sample.graph.joints[id].position);
            assert(Math.abs(distance(a, b) - link.restLength) / link.restLength < 1e-3, 'Rigid rod residual <1e-3');
          }
        }
      }, { name, values: samples.map(s => ({ time: s.time, value: s.value })) });
      await page.waitForTimeout(250);
      await check('pause-halts-time-and-graph', state => {
        assert.equal(state.simulation.time, paused.simulation.time);
        assert.deepEqual(state.graph, paused.graph);
      }, { name });
      await capture(`${name}-paused`, {}, true);
      await activate(page.getByTitle('Create mode', { exact: true }));
      await check('create-exact-restore', state => assert.deepEqual(state.graph, design), { name });
      return samples;
    }
    try {
      await page.goto(url);
      build = await assertCandidateBuild(page, sourceStart);
      await page.waitForFunction(() => !!globalThis.__LINKAGE_G0_READ__?.mechanism && !!globalThis.__LINKAGE_G0_READ__?.editor);
      await page.locator('.splash-screen').waitFor({ state: 'detached' });
      await collapsePanels();
      await check('observer-and-dpr-contract', state => {
        assert('springs' in state.graph, 'observer must expose mechanism.springs');
        assert('springPlacement' in state.editor && 'springReattachId' in state.editor, 'observer must expose pending spring placement and reattach ID');
      });
      const dimensions = await pixels({ x: 160, y: 300 });
      await check('canvas-dpr', () => {
        near(dimensions.width, dimensions.cssWidth * profile.dpr, 'canvas backing width', 1);
        near(dimensions.height, dimensions.cssHeight * profile.dpr, 'canvas backing height', 1);
      }, dimensions);

      await run('expanded-collapsed-and-split-view-controls', async () => {
        await openData();
        const before = graphOnly(await graph());
        for (const expanded of [false, true]) {
          if (expanded) await activate(page.getByTitle('Expand toolbar', { exact: true }));
          for (const [name, tool] of [['Linear spring', 'spring'], ['Damper', 'damper'], ['Torsion spring', 'torsion']]) {
            await target(button(name), `${expanded ? 'expanded' : 'collapsed'} ${name}`);
            await activate(button(name));
            const pressed = await button(name).getAttribute('aria-pressed');
            await check('named-tool-active-without-edit', asyncState => {
              assert.equal(asyncState.editor.createTool, tool);
              assert.equal(pressed, 'true');
              assert.deepEqual(graphOnly(asyncState.graph), before);
            }, { name, expanded, ariaPressed: pressed });
          }
        }
        await collapsePanels();
        await page.setViewportSize({ width: 512, height: 900 });
        try {
          for (const name of ['Linear spring', 'Damper', 'Torsion spring']) {
            await activate(button(name));
            if (name !== 'Torsion spring') await target(field('Spring link snap intervals'), `512px ${name} snap`);
            await tapWorld({ x: 100, y: 180 });
            await target(button('Cancel spring placement'), `512px ${name} cancel`);
            await activate(button('Cancel spring placement'));
            await check('split-view-cancel-no-edit', state => assert.deepEqual(graphOnly(state.graph), before), { name });
          }
        } finally {
          await page.setViewportSize({ width: profile.width, height: profile.height });
          await collapsePanels();
        }
      });

      await run('first-anchor-cancel-and-history', async () => {
        await openData();
        await place('Linear spring', [{ x: 100, y: 180 }, { x: 320, y: 300 }]);
        const sentinel = graphOnly(await graph());
        for (const kind of ['icon', 'Escape', ...(cdp ? ['touchCancel'] : [])]) {
          await activate(button('Linear spring'));
          await tapWorld({ x: 160, y: 180 });
          await check('first-anchor-pending', state => {
            assert(state.editor.springPlacement?.anchorA);
            assert.deepEqual(graphOnly(state.graph), sentinel);
          }, { kind });
          if (kind === 'icon') await activate(button('Cancel spring placement'));
          else if (kind === 'Escape') await page.keyboard.press('Escape');
          else await cancelTouch({ x: 280, y: 360 });
          await check('cancel-no-entities', state => {
            assert.equal(state.editor.springPlacement, null); assert.equal(state.editor.springReattachId, null);
            assert.deepEqual(graphOnly(state.graph), sentinel);
          }, { kind });
          await undo();
          await check('cancel-no-history-entry', state => assert.equal(Object.keys(state.graph.springs).length, 0), { kind });
          await redo(); await check('cancel-history-redo', state => assert.deepEqual(graphOnly(state.graph), sentinel));
        }
        // Exercise the genuine held-release canvas path without importing a graph
        // mutation API. WebKit uses native mouse for this drag, trusted UI taps above.
        await page.keyboard.press('Escape');
        await activate(button('Select'));
        await dragWorld({ x: 320, y: 300 }, { x: 360, y: 340 }, true);
        await check('native-drag-cancel-restores-graph', state => assert.deepEqual(graphOnly(state.graph), sentinel));
      });

      await run('linear-damper-parameters-anchors-and-roundtrip', async () => {
        await openData();
        const linearId = await place('Linear spring', [{ x: 100, y: 180 }, { x: 320, y: 300 }]);
        await check('linear-defaults-capture-current-rest', state => {
          const s = state.graph.springs[linearId];
          assert.equal(s.kind, 'linear'); assert.equal(s.stiffness, 150); assert.equal(s.damping, 12);
          assert.equal(s.prestressDelta, 0); near(s.restLength, Math.hypot(220, 120), 'linear natural rest');
          assert.deepEqual(s.anchorA, { type: 'joint', jointId: 'a' }); assert.deepEqual(s.anchorB, { type: 'joint', jointId: 'c' });
        });
        const damperId = await place('Damper', [{ x: 160, y: 180 }, { x: 280, y: 360 }]);
        await check('damper-defaults-link-and-world', state => {
          const s = state.graph.springs[damperId];
          assert.equal(s.kind, 'damper'); assert.equal(s.stiffness, 0); assert.equal(s.damping, 12); assert.equal(s.prestressDelta, 0);
          assert.deepEqual(s.anchorA, { type: 'link', linkId: 'rod', t: .5 });
          assert.deepEqual(s.anchorB, { type: 'world', position: { x: 280, y: 360 } });
          near(s.restLength, Math.hypot(120, 180), 'damper natural rest');
        });
        await openProperties(linearId);
        await edit('Spring motion stiffness', 210, g => assert.equal(g.springs[linearId].stiffness, 210));
        await edit('Spring motion damping', 18, g => assert.equal(g.springs[linearId].damping, 18), 'blur');
        await edit('Spring rest length', 180, g => assert.equal(g.springs[linearId].restLength, 180));
        await edit('Spring rest length offset', 12, g => assert.equal(g.springs[linearId].prestressDelta, 12), 'blur');
        await edit('Spring name', 'G6 edited spring', g => assert.equal(g.springs[linearId].name, 'G6 edited spring'));
        await noEdit('Spring name', 'Escaped draft', 'Escape');
        await noEdit('Spring motion stiffness', -1, 'Enter');
        await noEdit('Spring motion damping', -2, 'Tab');
        await noEdit('Spring rest length', -1, 'Enter');
        await noEdit('Spring rest length offset', -10000, 'Enter');
        await noEdit('Spring rest length', '', 'Tab');
        for (const [label, value, expected] of [['Attachment A joint', 'b', { type: 'joint', jointId: 'b' }],
          ['Attachment B joint', 'd', { type: 'joint', jointId: 'd' }]]) {
          const side = label.includes(' A ') ? 'anchorA' : 'anchorB';
          const change = await selectOption(label, value);
          await check('attachment-joint-selector', state => {
            assert.deepEqual(state.graph.springs[linearId][side], expected);
            const s = state.graph.springs[linearId]; near(s.restLength, distance(resolve(s.anchorA, state.graph), resolve(s.anchorB, state.graph)), 'anchor edit captures new rest');
          }, { label, value });
          await undo(); await check('attachment-selector-one-undo', state => assert.deepEqual(graphOnly(state.graph), change.before));
          await redo();
        }
        await selectOption('Attachment A type', 'link');
        await target(field('Attachment A link'), 'Attachment A link');
        await field('Attachment A link').selectOption('rod');
        await edit('Attachment A fraction', .25, g => assert.deepEqual(g.springs[linearId].anchorA, { type: 'link', linkId: 'rod', t: .25 }));
        await noEdit('Attachment A fraction', 1.5, 'Enter');
        await selectOption('Attachment B type', 'world');
        await edit('Attachment B X', 300, g => assert.equal(g.springs[linearId].anchorB.position.x, 300));
        await edit('Attachment B Y', 340, g => assert.equal(g.springs[linearId].anchorB.position.y, 340), 'blur');
        await target(button('Reattach spring'), 'Reattach spring');
        await target(button('Delete spring'), 'Delete spring');
        await capture('linear-spring-properties', {}, true);
        const beforeReattach = graphOnly(await graph()), previous = beforeReattach.springs[linearId];
        await activate(button('Reattach spring'));
        await collapsePanels();
        await check('reattach-pending-id', state => assert.equal(state.editor.springReattachId, linearId));
        await tapWorld({ x: 100, y: 360 }); await tapWorld({ x: 160, y: 180 });
        const reattached = graphOnly(await graph());
        await check('reattach-preserves-identity-and-parameters', () => {
          const s = reattached.springs[linearId];
          assert.deepEqual(Object.keys(reattached.springs).sort(), Object.keys(beforeReattach.springs).sort());
          for (const key of ['id', 'kind', 'stiffness', 'damping', 'prestressDelta', 'name']) assert.deepEqual(s[key], previous[key]);
          assert.deepEqual(s.anchorA, { type: 'joint', jointId: 'd' }); assert.deepEqual(s.anchorB, { type: 'link', linkId: 'rod', t: .5 });
          near(s.restLength, Math.hypot(60, -180), 'reattach natural rest');
        });
        await undo(); await check('reattach-one-undo', state => assert.deepEqual(graphOnly(state.graph), beforeReattach));
        await redo();
        await openProperties(damperId);
        const damperFields = { stiffnessFields: await field('Spring motion stiffness').count(), restFields: await field('Spring rest length').count() };
        await check('damper-fields', () => {
          assert.equal(damperFields.stiffnessFields, 0); assert.equal(damperFields.restFields, 0);
        }, damperFields);
        await edit('Spring motion damping', 24, g => assert.equal(g.springs[damperId].damping, 24));
        await selectOption('Attachment A type', 'world');
        await edit('Attachment A X', 140, g => assert.equal(g.springs[damperId].anchorA.position.x, 140));
        await edit('Attachment A Y', 210, g => assert.equal(g.springs[damperId].anchorA.position.y, 210), 'blur');
        const beforeDelete = graphOnly(await graph());
        await activate(button('Delete spring'));
        await check('delete-spring-only', state => {
          const expected = structuredClone(beforeDelete); delete expected.springs[damperId];
          assert.deepEqual(graphOnly(state.graph), expected);
        });
        await undo(); await check('delete-one-undo', state => assert.deepEqual(graphOnly(state.graph), beforeDelete));
        await collapsePanels();
        const complete = graphOnly(await graph()), saved = await save('complete-springs');
        await check('saved-complete-springs-and-metadata', () => {
          assert.deepEqual(graphOnly(saved), complete);
          assert.deepEqual(saved.oldForkMetadata, fixture.oldForkMetadata);
          assert.equal(saved.sourceVersion, fixture.version); assert.equal(saved.springModel, 'legacy-motion-v1');
          assert.deepEqual(saved.simulationSettings, fixture.simulationSettings);
          assert(Object.values(saved.springs).some(s => s.anchorA.type === 'world' || s.anchorB.type === 'world'));
        });
        await openData(); await openData(saved, 'g6-complete-roundtrip.slinker');
        await check('reopened-complete-springs', state => assert.deepEqual(graphOnly(state.graph), complete));
        const second = await save('complete-springs-reopened');
        await check('second-save-preserves-metadata-and-graph', () => {
          assert.deepEqual(graphOnly(second), graphOnly(saved)); assert.deepEqual(second.oldForkMetadata, saved.oldForkMetadata);
        });
        const invalid = structuredClone(saved); invalid.springs[linearId].anchorA = { type: 'joint', jointId: 'missing-g6-joint' };
        const beforeInvalid = graphOnly(await graph());
        const chooser = page.waitForEvent('filechooser'); await activate(button('Open')); await acceptDirtyOpen();
        await (await chooser).setFiles({ name: 'invalid-attachment.slinker', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(invalid)) });
        await page.waitForFunction(() => document.querySelector('.top-bar')?.getAttribute('aria-busy') === 'false');
        await check('invalid-import-atomic-graph-preserved', state => assert.deepEqual(graphOnly(state.graph), beforeInvalid));
      });

      await run('linear-restoring-motion-and-visible-spring', async () => {
        await openData();
        await activate(button('Linear spring'));
        const beforePixels = await pixels({ x: 210, y: 300 });
        const id = await place('Linear spring', [{ x: 320, y: 300 }, { x: 100, y: 300 }]);
        const afterPixels = await pixels({ x: 210, y: 300 });
        await check('spring-rendered-pixels', () => {
          assert.notEqual(afterPixels.sha256, beforePixels.sha256, 'Spring changes independently located coil-region pixels');
          assert(afterPixels.distinctColors > 1, 'Spring region is nonblank');
        }, { beforePixels, afterPixels });
        const metric = g => distance(resolve(g.springs[id].anchorA, g), resolve(g.springs[id].anchorB, g));
        const baseline = await simulate('linear-current-rest-baseline', metric);
        await check('linear-equilibrium-baseline', () => assert(baseline.every(s => Math.abs(s.value - 220) < .05)), { values: baseline.map(s => s.value) });
        await openProperties(id);
        await edit('Spring rest length', 160, g => assert.equal(g.springs[id].restLength, 160));
        const restored = await simulate('linear-shorter-rest', metric);
        await check('linear-signed-restoring-toward-target', () => {
          const values = restored.map(s => s.value), best = Math.min(...values.map(v => Math.abs(v - 160)));
          assert(best < 58, 'Rest error must meaningfully shrink from 60, not just show arbitrary displacement');
          assert(values.some(v => v < 218), 'Shorter rest must contract, not extend');
        }, { target: 160, baseline: baseline.map(s => s.value), values: restored.map(s => s.value) });
      });

      await run('torsion-placement-properties-roundtrip-and-signed-motion', async () => {
        await openData(torsionFixture, 'g6-torsion-fixture.slinker');
        await activate(button('Torsion spring'));
        const blank = graphOnly(await graph());
        await tapWorld({ x: 100, y: 160 }); await tapWorld({ x: 160, y: 160 });
        await tapWorld({ x: 180, y: 160 });
        await check('torsion-rejects-repeated-leg', state => {
          assert.deepEqual(graphOnly(state.graph), blank);
          assert.equal(state.editor.springPlacement.pivotId, 'pivot');
          assert.equal(state.editor.springPlacement.linkAId, 'legA');
        });
        await page.keyboard.press('Escape');
        await check('torsion-partial-cancel', state => { assert.equal(state.editor.springPlacement, null); assert.deepEqual(graphOnly(state.graph), blank); });
        const id = await place('Torsion spring', [{ x: 100, y: 160 }, { x: 160, y: 160 }, { x: 100, y: 220 }]);
        await check('torsion-current-signed-angle-and-defaults', state => {
          const s = state.graph.springs[id]; assert.equal(s.kind, 'torsional');
          assert.deepEqual(s.anchorA, { type: 'link', linkId: 'legA', t: 0 });
          assert.deepEqual(s.anchorB, { type: 'link', linkId: 'legB', t: 0 });
          near(s.restLength, Math.PI / 2, 'torsion rest'); near(signedAngle(state.graph, s), s.restLength, 'independent signed angle');
          assert.equal(s.stiffness, 20); assert.equal(s.damping, 4); assert.equal(s.prestressDelta, 0);
        });
        await openProperties(id);
        await target(field('Attachment A link'), 'Torsion Attachment A link');
        await target(field('Attachment B link'), 'Torsion Attachment B link');
        await target(field('Attachment A endpoint'), 'Torsion Attachment A endpoint');
        await target(field('Attachment B endpoint'), 'Torsion Attachment B endpoint');
        const valid = graphOnly(await graph());
        await field('Attachment B link').selectOption('legA');
        await check('torsion-invalid-same-leg-edit-preserves-graph', state => assert.deepEqual(graphOnly(state.graph), valid));
        await field('Attachment B endpoint').selectOption('1');
        await check('torsion-invalid-pivot-edit-preserves-graph', state => assert.deepEqual(graphOnly(state.graph), valid));
        await edit('Spring rest angle degrees', 75, g => near(g.springs[id].restLength, 75 * Math.PI / 180, 'degrees conversion'));
        const oldAlerts = await page.getByRole('alert').allTextContents();
        await check('valid-spring-edit-clears-old-input-error', () => assert.deepEqual(oldAlerts, []), { oldAlerts });
        await edit('Spring rest angle offset degrees', -15, g => near(g.springs[id].prestressDelta, -Math.PI / 12, 'offset degrees'), 'blur');
        await noEdit('Spring rest angle degrees', 33, 'Escape');
        await capture('torsion-spring-properties', {}, true);
        await field('Attachment B link').selectOption('legA');
        assert((await page.getByRole('alert').count()) > 0, 'Invalid attachment must remain visibly diagnosed until corrected');
        const beforeReattach = graphOnly(await graph());
        await activate(button('Reattach spring')); await collapsePanels();
        await tapWorld({ x: 100, y: 160 }); await tapWorld({ x: 100, y: 220 }); await tapWorld({ x: 160, y: 160 });
        await check('torsion-reattach-reversed-order-natural-rest', state => {
          const s = state.graph.springs[id], prev = beforeReattach.springs[id];
          assert.equal(Object.keys(state.graph.springs).length, 1);
          for (const key of ['id', 'kind', 'name', 'stiffness', 'damping', 'prestressDelta']) assert.deepEqual(s[key], prev[key]);
          near(s.restLength, -Math.PI / 2, 'reversed leg signed natural rest');
        });
        assert.deepEqual(await page.getByRole('alert').allTextContents(), [], 'Successful reattachment clears the old error after pointer release');
        await undo(); await check('torsion-reattach-one-undo', state => assert.deepEqual(graphOnly(state.graph), beforeReattach));
        await openProperties(id);
        await edit('Spring rest angle degrees', 90, g => near(g.springs[id].restLength, Math.PI / 2, 'reset baseline rest'));
        await edit('Spring rest angle offset degrees', 0, g => assert.equal(g.springs[id].prestressDelta, 0));
        const metric = g => signedAngle(g, g.springs[id]);
        const baseline = await simulate('torsion-current-rest-baseline', metric);
        await check('torsion-equilibrium-baseline', () => assert(baseline.every(s => Math.abs(wrap(s.value - Math.PI / 2)) < .002)));
        await openProperties(id);
        await edit('Spring motion stiffness', 2000, g => assert.equal(g.springs[id].stiffness, 2000));
        await edit('Spring motion damping', 10, g => assert.equal(g.springs[id].damping, 10), 'blur');
        await edit('Spring rest angle degrees', 60, g => near(g.springs[id].restLength, Math.PI / 3, 'shorter angular rest'));
        const lower = await simulate('torsion-target-60-degrees', metric);
        await check('torsion-signed-motion-toward-60-not-displacement-only', () => {
          const values = lower.map(s => s.value), firstError = Math.PI / 6;
          assert(values.some(v => wrap(v - Math.PI / 2) < -.025), 'Signed angle must decrease toward 60deg');
          assert(Math.min(...values.map(v => Math.abs(wrap(v - Math.PI / 3)))) < firstError - .025, 'Signed target error must shrink');
        }, { targetDegrees: 60, values: lower.map(s => s.value), baseline: baseline.map(s => s.value) });
        await openProperties(id);
        await edit('Spring rest angle degrees', 120, g => near(g.springs[id].restLength, 2 * Math.PI / 3, 'longer angular rest'));
        const upper = await simulate('torsion-target-120-degrees', metric);
        await check('torsion-signed-motion-reverses-toward-120', () => {
          const values = upper.map(s => s.value);
          assert(values.some(v => wrap(v - Math.PI / 2) > .025), 'Signed angle must increase when UI rest is raised');
          assert(Math.min(...values.map(v => Math.abs(wrap(v - 2 * Math.PI / 3)))) < Math.PI / 6 - .025);
        }, { targetDegrees: 120, values: upper.map(s => s.value) });
        const beforeSave = graphOnly(await graph()), saved = await save('torsion-complete');
        await check('torsion-download-graph', () => assert.deepEqual(graphOnly(saved), beforeSave));
        await openData(); await openData(saved, 'g6-torsion-reopened.slinker');
        await check('torsion-reopen-graph', state => assert.deepEqual(graphOnly(state.graph), beforeSave));
      });

      await run('console-and-trusted-input-health', async () => {
        const events = await page.evaluate(() => globalThis.__g6Events);
        await writeFile(join(dir, 'input-events.json'), JSON.stringify(events, null, 2));
        await check('console-and-trusted-input', () => {
          assert.deepEqual(errors, []);
          const canvasDown = events.filter(e => e.type === 'pointerdown' && e.tag === 'CANVAS');
          assert(canvasDown.length > 0 && canvasDown.every(e => e.trusted));
          assert(canvasDown.some(e => e.pointerType === (profile.touch ? 'touch' : 'mouse')));
          if (profile.touch) assert(events.some(e => e.type === 'pointerdown' && e.tag === 'BUTTON' && e.pointerType === 'touch' && e.trusted));
          if (cdp) assert(events.some(e => e.type === 'pointercancel' && e.pointerType === 'touch' && e.trusted));
          if (engine === 'webkit' && profile.touch) assert(canvasDown.some(e => e.pointerType === 'mouse'), 'WebKit native mouse cancellation drag recorded separately');
        }, { errors, eventCount: events.length });
      });
    } catch (error) {
      steps.push({ name: currentStep, passed: false, failure: error.stack });
      await capture('bootstrap-FAILED', { failure: error.stack }, true).catch(() => {});
    } finally {
      const raw = await page.evaluate(() => ({ events: globalThis.__g6Events,
        graph: globalThis.__LINKAGE_G0_READ__?.mechanism?.(), editor: globalThis.__LINKAGE_G0_READ__?.editor?.(),
        simulation: globalThis.__LINKAGE_G0_READ__?.simulation?.(), bodyText: document.body.innerText,
        html: document.querySelector('.app-layout')?.outerHTML })).catch(error => ({ captureFailure: String(error) }));
      await writeFile(join(dir, 'raw-state.json'), JSON.stringify(raw, null, 2));
      await writeFile(join(dir, 'console.json'), JSON.stringify(consoleMessages, null, 2));
      await writeFile(join(dir, 'motion.json'), JSON.stringify(motion, null, 2));
      const result = { profile, build, steps, checks, errors, targets,
        passed: steps.length === 6 && steps.every(s => s.passed) && errors.length === 0,
        input: cdp ? 'Trusted Chromium CDP single-touch placement/cancel/drag, 300ms pre-release hold'
          : profile.touch ? 'Trusted WebKit UI/canvas taps; native mouse canvas cancellation drag' : 'Native mouse and keyboard',
        comparisons: ['C03', 'C06', 'C08', 'C10', 'C11', 'C12', 'C13'], screens: ['S02', 'S03', 'S07', 'S09', 'S10'] };
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
  physicalIPadVerified: false, usage: 'unknown', limits: [
    'Harness-only evidence; lead owns integration, cumulative G1-G5, domain/stress/anchor-remap/mirror qualification and gate acceptance.',
    'Physical iPad/Safari/Home Screen/Apple Pencil/VoiceOver unavailable; no actual-device certification.',
    'WebKit exposes trusted taps but no trusted touch drag/cancel injection here; canvas cancellation drag uses native mouse/Escape.',
    'Chromium uses single-touch with 300ms held before drag release; rapid native flick limitation not certified resolved.',
    'Spring coefficients qualify motion direction/restoring behavior, not SI accuracy or engineering force calibration.',
    'Damper placement/edit/persistence are covered; dissipative power/stiffness/timestep extremes remain lead domain checks.',
  ] };
await writeFile(join(output, 'report.json'), JSON.stringify(report, null, 2));
console.log(JSON.stringify({ output, stableSource, passed: report.passed, gateAcceptance: false,
  results: results.map(r => ({ profile: r.profile.id, passed: r.passed, failures: r.steps.filter(s => !s.passed) })) }));
if (!report.passed) process.exitCode = 1;
