import { chromium, webkit } from '../../.rebuild.local/tooling/node_modules/playwright/index.mjs';
import { candidateFingerprint, assertCandidateBuild } from './candidate-fingerprint.mjs';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdir, mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

// Install at scripts/rebuild/verify-g7-browser.mjs; run only on a lead-frozen build.
// Browser evaluation reads mounted state/DOM/pixels only. All edits use native UI.
const root = fileURLToPath(new URL('../../', import.meta.url));
const engine = process.argv[2] ?? 'chromium', url = process.argv[3] ?? process.env.LINKAGE_CANDIDATE_URL;
assert(['chromium', 'webkit'].includes(engine), 'Use chromium or webkit');
assert(url, 'Supply the lead-approved frozen preview URL');
const startedAt = new Date().toISOString(), sourceStart = await candidateFingerprint();
const harness = await readFile(fileURLToPath(import.meta.url));
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
const parent = join(root, '.rebuild.local/evidence/g7');
await mkdir(parent, { recursive: true });
const output = await mkdtemp(join(parent, `${engine}-browser-`));
await writeFile(join(output, 'harness.mjs'), harness);
const profiles = [{ id: 'desktop', width: 1440, height: 1000, touch: false, dpr: 1 },
  { id: 'tablet', width: 1024, height: 1366, touch: true, dpr: 2 }];
const body = (id, jointIds, color) => ({ id, name: id, jointIds, color, showLinks: true, useOutlineCOM: false });
const fixture = { version: '0.12.3', projectName: 'G7 qualified rod',
  oldForkMetadata: { author: 'G7 retained author', nested: { revision: 7, note: 'Keep source metadata' } },
  joints: { anchor: { id: 'anchor', type: 'fixed', label: 'Support', position: { x: 75.00000000000001, y: 180 }, connectedLinkIds: ['rod'] },
    handle: { id: 'handle', type: 'revolute', label: 'Old handle', position: { x: 75.00000000000001, y: 300 }, connectedLinkIds: ['rod'] } },
  links: { rod: { id: 'rod', jointIds: ['anchor', 'handle'], restLength: 120, mass: 1 } },
  bodies: { base: body('base', ['anchor'], '#e53935'), rod: body('rod', ['anchor', 'handle'], '#4caf50'), spare: body('spare', [], '#42a5f5') },
  baseBodyId: 'base', outlines: {}, images: {}, sliders: {}, colliders: {}, tracers: {}, springs: {}, forceSensors: {},
  viewPreferences: { camera: { zoom: 1, pan: { x: 0, y: 0 } }, gridLevel: 'off', showRulers: false, showLoads: false, showReactions: false },
  simulationSettings: { gravityEnabled: true, gravityStrength: 250, damping: .5, dragMultiplier: 25, dragDamping: .25 } };
await writeFile(join(output, 'fixture.slinker'), JSON.stringify(fixture, null, 2));
const keys = ['joints', 'links', 'bodies', 'baseBodyId', 'outlines', 'images', 'sliders', 'colliders', 'tracers', 'springs', 'forceSensors'];
const graphOnly = g => Object.fromEntries(keys.map(k => [k, g[k] ?? {}]));
const near = (actual, expected, label, tolerance = 1e-5) => assert(Number.isFinite(actual) && Math.abs(actual - expected) <= tolerance,
  `${label}: expected ${expected}, got ${actual}`);
const distance = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
function tracerWorld(g, id) {
  const t = g.tracers[id], b = g.bodies[t.bodyId], points = b.jointIds.map(id => g.joints[id].position);
  const origin = { x: points.reduce((n, p) => n + p.x, 0) / (points.length || 1), y: points.reduce((n, p) => n + p.y, 0) / (points.length || 1) };
  let angle = points.length > 1 ? Math.atan2(points[0].y - origin.y, points[0].x - origin.x) : 0;
  if (b.frame) { const [a, z] = b.frame.jointIds.map(id => g.joints[id].position); angle = Math.atan2(z.y - a.y, z.x - a.x) + b.frame.angleOffset; }
  return { x: origin.x + t.localPosition.x * Math.cos(angle) - t.localPosition.y * Math.sin(angle),
    y: origin.y + t.localPosition.x * Math.sin(angle) + t.localPosition.y * Math.cos(angle) };
}
const results = [], browser = engine === 'webkit' ? await webkit.launch({ headless: true }) : await chromium.launch({ channel: 'chrome', headless: true });
try {
  for (const profile of profiles) {
    const dir = join(output, profile.id); await mkdir(dir);
    const context = await browser.newContext({ viewport: { width: profile.width, height: profile.height }, deviceScaleFactor: profile.dpr,
      hasTouch: profile.touch, isMobile: profile.touch, serviceWorkers: 'block', acceptDownloads: true });
    await context.addInitScript(() => {
      Object.defineProperty(window, 'showSaveFilePicker', { value: undefined, configurable: true });
      globalThis.__g7Events = [];
      for (const type of ['pointerdown', 'pointerup', 'pointercancel', 'click', 'keydown']) document.addEventListener(type, e => {
        const el = e.target.closest?.('button,input,select,canvas') ?? e.target;
        const internalFileClick = type === 'click' && !e.isTrusted && el.isConnected
          && ((el.matches?.('input[type="file"]') && el.getBoundingClientRect().bottom < 0)
            || (el.matches?.('a[download]') && el.style.display === 'none' && el.href.startsWith('blob:')));
        globalThis.__g7Events.push({ type, trusted: e.isTrusted, pointerType: e.pointerType, key: e.key,
          x: e.clientX, y: e.clientY, tag: el.tagName, label: el.getAttribute?.('aria-label') ?? el.title, internalFileClick });
      }, true);
    });
    await context.tracing.start({ screenshots: false, snapshots: true, sources: false });
    const page = await context.newPage(); page.setDefaultTimeout(10000);
    const cdp = engine === 'chromium' && profile.touch ? await context.newCDPSession(page) : null;
    const errors = [], steps = [], checks = [], targets = []; let sequence = 0, build;
    page.on('pageerror', e => errors.push({ type: 'pageerror', message: e.message }));
    page.on('console', m => { if (m.type() === 'error') errors.push({ type: 'console', message: m.text() }); });
    page.on('dialog', d => d.accept(d.type() === 'prompt' ? 'g7-complete.slinker' : undefined));
    const button = name => page.getByRole('button', { name, exact: true }), field = name => page.getByLabel(name, { exact: true });
    const activate = locator => profile.touch ? locator.tap() : locator.click();
    const acceptDirtyOpen = async () => {
      const unsaved = page.getByRole('dialog', { name: 'Unsaved Changes', exact: true });
      if (await unsaved.isVisible()) await activate(unsaved.getByRole('button', { name: 'Discard and open', exact: true }));
    };
    const canvas = page.locator('.canvas-container canvas');
    const read = () => page.evaluate(() => ({ graph: globalThis.__LINKAGE_G0_READ__.mechanism(),
      editor: globalThis.__LINKAGE_G0_READ__.editor(), simulation: globalThis.__LINKAGE_G0_READ__.simulation() }));
    const graph = async () => graphOnly((await read()).graph), undo = () => activate(button('Undo')), redo = () => activate(button('Redo'));
    async function capture(name, extra = {}, png = false) {
      const stem = `${String(++sequence).padStart(3, '0')}-${name}`, state = await read();
      await writeFile(join(dir, `${stem}.json`), JSON.stringify({ ...state, extra }, null, 2));
      if (png) await page.screenshot({ path: join(dir, `${stem}.png`), fullPage: true });
      return state;
    }
    async function check(name, test, extra = {}) { const s = await capture(name, extra); test(s); checks.push({ name, passed: true }); return s; }
    async function run(name, work) {
      const start = Date.now();
      try { await work(); await capture(name, {}, true); steps.push({ name, passed: true, elapsedMs: Date.now() - start }); }
      catch (e) { steps.push({ name, passed: false, failure: e.stack, elapsedMs: Date.now() - start });
        await capture(`${name}-FAILED`, { failure: e.stack }, true).catch(e => steps.at(-1).captureFailure = String(e)); }
      await writeFile(join(dir, 'progress.json'), JSON.stringify({ steps, checks, errors }, null, 2));
      console.log(JSON.stringify({ engine, profile: profile.id, step: steps.at(-1) }));
    }
    async function settle() {
      await page.waitForFunction(() => { const c = document.querySelector('.canvas-container canvas'); if (!c) return false;
        const r = c.getBoundingClientRect(), d = Math.min(3, Math.max(.5, devicePixelRatio));
        return r.width >= 390 && r.height > 300 && Math.abs(c.width - r.width * d) <= 1 && Math.abs(c.height - r.height * d) <= 1; });
      await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
    }
    async function collapse() {
      for (const name of ['Collapse toolbar', 'Collapse panel']) { const el = page.getByTitle(name, { exact: true }); if (await el.count()) await activate(el); }
      await page.locator('.toolbar-collapsed').waitFor(); await page.locator('.panel-collapsed').waitFor(); await settle();
    }
    async function expand() { const el = page.getByTitle('Expand panel', { exact: true }); if (await el.count()) await activate(el); await settle(); }
    async function open(data = fixture) {
      if ((await read()).editor.mode !== 'create') await activate(page.getByTitle('Create mode', { exact: true }));
      const chooser = page.waitForEvent('filechooser'); await activate(button('Open')); await acceptDirtyOpen();
      await (await chooser).setFiles({ name: 'g7-fixture.slinker', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(data)) });
      await page.waitForFunction(name => globalThis.__LINKAGE_G0_READ__.editor().projectName === name
        && document.querySelector('.top-bar')?.getAttribute('aria-busy') === 'false', data.projectName);
      await collapse(); await activate(button('Fit mechanism')); await settle();
    }
    async function screen(p) {
      await settle(); const r = await canvas.boundingBox(), camera = (await read()).editor.camera;
      const point = { x: r.x + camera.pan.x + p.x * camera.zoom, y: r.y + camera.pan.y + p.y * camera.zoom };
      const hit = await page.evaluate(p => document.elementFromPoint(p.x, p.y)?.matches('.canvas-container canvas'), point);
      await check('world-point-reachable', () => assert(hit, 'World point must be on uncovered main canvas'), { p, point, r, camera, hit });
      return point;
    }
    async function tap(p) {
      const a = await screen(p);
      if (cdp) { await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ ...a, id: 1 }] });
        await page.waitForTimeout(70); await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] }); }
      else if (profile.touch) await page.touchscreen.tap(a.x, a.y); else await page.mouse.click(a.x, a.y);
    }
    async function drag(from, to, cancel = false) {
      const a = await screen(from), b = await screen(to); let held;
      if (cdp) await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ ...a, id: 41 }] });
      else { await page.mouse.move(a.x, a.y); await page.mouse.down(); }
      try { for (let i = 1; i <= 20; i++) { const p = { x: a.x + (b.x - a.x) * i / 20, y: a.y + (b.y - a.y) * i / 20 };
          if (cdp) await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ ...p, id: 41 }] });
          else await page.mouse.move(p.x, p.y); await page.waitForTimeout(16); }
        await page.waitForTimeout(300); held = await capture(cancel ? 'held-before-cancel' : 'held-before-release');
        if (cancel && !cdp) await page.keyboard.press('Escape');
      } finally { if (cdp) await cdp.send('Input.dispatchTouchEvent', { type: cancel ? 'touchCancel' : 'touchEnd', touchPoints: [] }); else await page.mouse.up(); }
      return held;
    }
    async function target(el, label, control = true) {
      await el.scrollIntoViewIfNeeded(); const result = await el.evaluate(el => { if (el.matches('input[type="checkbox"]')) el = el.closest('label') ?? el;
        const r = el.getBoundingClientRect(), x = r.x + r.width / 2, y = r.y + r.height / 2, hit = document.elementFromPoint(x, y);
        return { width: r.width, height: r.height, reachable: x >= 0 && x < innerWidth && y >= 0 && y < innerHeight && (hit === el || el.contains(hit)) }; });
      targets.push({ label, ...result }); await check('control-reachability', () => { assert(result.reachable, label);
        if (profile.touch && control) assert(result.width >= 44 && result.height >= 44, `${label}: 44px coarse target`); }, { label, result, control });
    }
    async function jointProperties(id) {
      await expand(); const g = await graph(), owner = Object.values(g.bodies).find(b => b.jointIds.includes(id) && b.id !== g.baseBodyId) ?? g.bodies[g.baseBodyId];
      const toggle = button(`Expand ${owner.name}`); if (await toggle.count()) await activate(toggle);
      const node = page.getByRole('group', { name: `${owner.name} joints`, exact: true }).getByRole('button', { name: `Joint ${g.joints[id].label || id.slice(0, 8)} properties`, exact: true });
      await target(node, `Joint ${id} native object selection`); await activate(node);
      await field('Joint name').waitFor();
    }
    async function edit(label, value, verify) {
      const before = await graph(); await field(label).fill(String(value));
      await check('draft-not-committed', s => assert.deepEqual(graphOnly(s.graph), before), { label, value });
      await field(label).press('Enter'); const after = await graph();
      await check('field-committed', () => { assert.notDeepEqual(after, before); verify(after); }, { label, value });
      await undo(); await check('one-undo-restores', s => assert.deepEqual(graphOnly(s.graph), before));
      await redo(); await check('redo-restores', s => assert.deepEqual(graphOnly(s.graph), after));
    }
    async function atomic(action, verify) {
      const before = await graph(); await action(); const after = await graph();
      await check('atomic-ui-edit', () => { assert.notDeepEqual(after, before); verify(after); });
      await undo(); await check('atomic-one-undo', s => assert.deepEqual(graphOnly(s.graph), before));
      await redo(); await check('atomic-redo', s => assert.deepEqual(graphOnly(s.graph), after));
    }
    async function cancelCreation(point, key) {
      const before = await graph(), held = await drag(point, { x: point.x + 15, y: point.y + 10 }, true);
      await check('native-creation-cancel-no-orphan', s => {
        // Empty finger drags in the tracer tool pan; only a tap commits placement.
        assert.equal(Object.keys(held.graph[key]).length, Object.keys(before[key]).length + (cdp && key === 'tracers' ? 0 : 1), 'Correct transient creation or finger-pan classification');
        assert.deepEqual(graphOnly(s.graph), before); }, { key, held });
      await undo(); await check('creation-cancel-no-history', s => assert.equal(s.graph.joints.handle.label, 'Old handle'));
      await redo(); await check('creation-cancel-history-redo', s => assert.deepEqual(graphOnly(s.graph), before));
    }
    async function save(name) {
      const pending = page.waitForEvent('download'); await activate(button('Save')); const download = await pending;
      const failure = await download.failure(); await check('download-intact', () => assert.equal(failure, null), { failure, filename: download.suggestedFilename() });
      const path = join(dir, `${name}.slinker`); await download.saveAs(path); return JSON.parse(await readFile(path, 'utf8'));
    }
    async function pixels(el = canvas, point = null) {
      await settle(); const sample = await el.evaluate((c, point) => { const r = c.getBoundingClientRect(), camera = globalThis.__LINKAGE_G0_READ__.editor().camera;
        const x = point ? Math.round((camera.pan.x + point.x * camera.zoom) * c.width / r.width) : c.width / 2;
        const y = point ? Math.round((camera.pan.y + point.y * camera.zoom) * c.height / r.height) : c.height / 2;
        const w = point ? 32 : c.width, h = point ? 32 : c.height;
        const bytes = c.getContext('2d').getImageData(point ? x - 16 : 0, point ? y - 16 : 0, w, h).data;
        let digest = 2166136261, sum = 0, ink = 0, green = 0; const colors = new Set();
        for (let i = 0; i < bytes.length; i++) { digest = Math.imul(digest ^ bytes[i], 16777619) >>> 0; sum = (sum + bytes[i]) >>> 0;
          if (i % 4 === 0) { if (colors.size < 512) colors.add(`${bytes[i]},${bytes[i + 1]},${bytes[i + 2]},${bytes[i + 3]}`);
            if (bytes[i + 3]) ink++; if (bytes[i + 1] > bytes[i] + 25 && bytes[i + 1] > bytes[i + 2] + 25 && bytes[i + 3] > 40) green++; } }
        return { digest, sum, ink, green, distinctColors: colors.size, width: c.width, height: c.height, cssWidth: r.width, cssHeight: r.height }; }, point);
      return { ...sample, sha256: hash(JSON.stringify([sample.digest, sample.sum])) };
    }
    async function playFor(duration = .6) {
      const initial = (await read()).simulation.time;
      if ((await read()).editor.mode === 'create') { await collapse(); await activate(page.getByTitle('Simulate mode', { exact: true })); }
      else if (!(await read()).simulation.isPlaying) await activate(button('Resume'));
      const samples = [], start = Date.now();
      while (Date.now() - start < 8000) { const s = await read(); samples.push(s);
        if (s.simulation.stepError || s.simulation.time >= initial + duration) break; await page.waitForTimeout(50); }
      if ((await read()).simulation.isPlaying) await activate(button('Pause'));
      const paused = await capture('paused', { samples }, true);
      await check('simulation-health', () => { assert(paused.simulation.time >= initial + duration, 'Simulation advances');
        for (const s of samples) { assert.equal(s.simulation.stepError, null); for (const j of Object.values(s.graph.joints)) assert(Number.isFinite(j.position.x) && Number.isFinite(j.position.y)); } });
      await page.waitForTimeout(250); await check('pause-halts-sampling', s => { assert.deepEqual(s.graph, paused.graph);
        for (const k of ['time', 'forceSensorData', 'tracerPaths', 'pathTraces']) assert.deepEqual(s.simulation[k], paused.simulation[k]); });
      return paused;
    }
    try {
      await page.goto(url); build = await assertCandidateBuild(page, sourceStart);
      await page.waitForFunction(() => !!globalThis.__LINKAGE_G0_READ__?.simulation); await page.locator('.splash-screen').waitFor({ state: 'detached' });
      await check('mounted-observer-contract', s => { for (const k of keys) assert(k in s.graph, `observer must expose mechanism.${k}`);
        for (const k of ['showLoads', 'showReactions']) assert(k in s.editor, `observer must expose editor.${k}`);
        for (const k of ['solverResult', 'forceSensorData', 'tracerPaths', 'pathTraces']) assert(k in s.simulation, `observer must expose simulation.${k}`); });

      await run('joint-labels-precision-and-physics-controls', async () => {
        await open(); await jointProperties('handle'); await target(field('Joint name'), 'Joint name');
        await edit('Joint name', 'New handle', g => assert.equal(g.joints.handle.label, 'New handle'));
        const sentinel = await graph(); await field('Joint name').fill('Cancelled handle'); await field('Joint name').press('Escape');
        await check('name-Escape-no-edit', s => assert.deepEqual(graphOnly(s.graph), sentinel));
        await undo(); await check('name-Escape-no-history', s => assert.equal(s.graph.joints.handle.label, 'Old handle')); await redo();
        await edit('Joint name', '', g => assert.equal(g.joints.handle.label, '')); await undo();
        await target(button('Clear joint name'), 'Clear joint name');
        await atomic(() => activate(button('Clear joint name')), g => assert(!g.joints.handle.label));
        const cleared = await graph(), saved = await save('cleared-joint-name'); await open(saved);
        await check('cleared-label-no-source-resurrection', s => { assert(!s.graph.joints.handle.label); assert.deepEqual(graphOnly(s.graph), cleared); });
        await jointProperties('anchor'); const pristine = await graph(), displayed = await field('Joint X').inputValue();
        await field('Joint X').focus(); await field('Joint X').press('Tab');
        await check('precise-number-focus-blur-no-rounding', s => { assert.equal(displayed, '75'); assert.deepEqual(graphOnly(s.graph), pristine); }, { displayed });
        await edit('Joint name', 'Precision sentinel', g => assert.equal(g.joints.anchor.label, 'Precision sentinel'));
        const named = await graph(); await field('Joint X').focus(); await field('Joint X').press('Tab'); await undo();
        await check('focus-blur-no-history', s => assert.equal(s.graph.joints.anchor.label, 'Support')); await redo();
        await check('focus-blur-redo-exact', s => assert.deepEqual(graphOnly(s.graph), named));
        for (const [label, key, value, expected] of [['Gravity strength', 'gravityStrength', 275, 275], ['Damping percent', 'damping', 20, .8],
          ['Drag multiplier', 'dragMultiplier', 30, 30], ['Drag damping percent', 'dragDamping', 35, .35]]) {
          await target(field(label), label); const before = (await read()).simulation[key];
          await field(label).fill(String(value)); await field(label).press('Escape');
          await check('physics-Escape', s => near(s.simulation[key], before, label));
          await field(label).fill(String(value)); await field(label).press('Enter');
          await check('physics-native-number-commit', s => near(s.simulation[key], expected, label));
        }
        const resize = page.getByRole('separator', { name: 'Resize right panel', exact: true });
        await resize.focus(); for (let i = 0; i < 4; i++) await resize.press('ArrowRight');
        const rows = await page.locator('.physics-control').evaluateAll(elements => elements.map(el => ({
          width: el.clientWidth, scrollWidth: el.scrollWidth,
          fields: [...el.children].map(child => { const r = child.getBoundingClientRect(), parent = el.getBoundingClientRect();
            return { label: child.getAttribute('aria-label') ?? child.textContent, left: r.left - parent.left, right: r.right - parent.left }; }),
        })));
        await check('minimum-width-physics-layout', () => {
          for (const row of rows) { assert(row.scrollWidth <= row.width + 1, 'No horizontal physics overflow at minimum panel width');
            for (const field of row.fields) assert(field.left >= -1 && field.right <= row.width + 1, field.label); }
        }, { rows });
        for (const label of ['Gravity strength', 'Damping percent', 'Drag multiplier', 'Drag damping percent']) await target(field(label), `Minimum-width ${label}`);
        await resize.press('Home');
      });

      await run('tracer-placement-properties-cancel-and-motion', async () => {
        await open(); await jointProperties('handle'); await edit('Joint name', 'Cancel sentinel', g => assert.equal(g.joints.handle.label, 'Cancel sentinel')); await collapse();
        await activate(page.getByTitle('Path Plotter', { exact: true })); await activate(page.locator('.panel-collapsed').getByTitle('rod', { exact: true }));
        await target(page.getByTitle('Path Plotter', { exact: true }), 'Collapsed path plotter'); await cancelCreation({ x: 135, y: 245 }, 'tracers');
        let id; await atomic(() => tap({ x: 135, y: 245 }), g => { assert.equal(Object.keys(g.tracers).length, 1); id = Object.keys(g.tracers)[0]; assert.equal(g.tracers[id].bodyId, 'rod'); });
        await expand(); const tracerToggle = button('Expand rod'); if (await tracerToggle.count()) await activate(tracerToggle);
        await activate(button(`Tracer ${id.slice(0, 8)} properties`)); await field('Tracer name').waitFor();
        for (const label of ['Tracer name', 'Tracer body', 'Tracer X', 'Tracer Y', 'Tracer enabled', 'Delete tracer']) await target(field(label).or(button(label)), label);
        await edit('Tracer name', 'Orbit mark', g => assert.equal(g.tracers[id].name, 'Orbit mark'));
        await edit('Tracer name', '', g => assert.equal(g.tracers[id].name, '')); await undo();
        await edit('Tracer X', 130, g => near(tracerWorld(g, id).x, 130, 'Tracer X'));
        await edit('Tracer Y', 250, g => near(tracerWorld(g, id).y, 250, 'Tracer Y'));
        const world = tracerWorld(await graph(), id);
        await atomic(() => field('Tracer body').selectOption('spare'), g => near(distance(tracerWorld(g, id), world), 0, 'Reassignment preserves world point'));
        await atomic(() => field('Tracer body').selectOption('rod'), g => near(distance(tracerWorld(g, id), world), 0, 'Reassignment back preserves world point'));
        await atomic(() => activate(field('Tracer enabled')), g => assert.equal(g.tracers[id].enabled, false)); await undo();
        await collapse(); await activate(button('Select')); const design = await graph();
        await drag(tracerWorld(design, id), { x: 145, y: 260 }, true);
        await check('tracer-drag-cancel-exact', s => assert.deepEqual(graphOnly(s.graph), design));
        await undo(); await check('tracer-drag-cancel-no-history', s => assert.equal(s.graph.tracers[id].bodyId, 'spare'));
        await redo(); await check('tracer-drag-cancel-redo', s => assert.deepEqual(graphOnly(s.graph), design));
        await activate(page.getByTitle('Simulate mode', { exact: true }));
        await drag((await graph()).joints.handle.position, { x: 130, y: 280 }); const paused = await playFor(.6);
        const predicted = tracerWorld(paused.graph, id), trace = paused.simulation.tracerPaths[id] ?? [], marker = await pixels(canvas, predicted);
        await check('independent-tracer-world-and-pixels', () => { assert(trace.length > 2); near(distance(trace.at(-1), predicted), 0, 'Body-local tracer last sample');
          assert(Math.abs(paused.graph.joints.handle.position.x - design.joints.handle.position.x) > 1, 'Pendulum pull actually rotates body');
          assert(marker.distinctColors > 2 && marker.green > 0, 'Body-colored tracer marker visible at predicted world point'); }, { predicted, trace, marker });
        await activate(page.getByTitle('Create mode', { exact: true })); await check('tracer-create-whole-graph-restore', s => assert.deepEqual(graphOnly(s.graph), design));
        await expand(); const toggle = button('Expand rod'); if (await toggle.count()) await activate(toggle);
        await activate(button('Tracer Orbit mark properties'));
        await atomic(() => activate(button('Delete tracer')), g => assert.equal(Object.keys(g.tracers).length, 0)); await undo();
      });

      await run('sensor-qualified-load-history-and-persistence', async () => {
        await open(); await jointProperties('handle'); await edit('Joint name', 'Cancel sentinel', g => assert.equal(g.joints.handle.label, 'Cancel sentinel')); await collapse();
        await target(button('Force sensor'), 'Collapsed force sensor'); await activate(button('Force sensor')); await cancelCreation({ x: 75, y: 240 }, 'forceSensors');
        await activate(page.getByTitle('Expand toolbar', { exact: true })); await target(button('Force sensor'), 'Expanded force sensor'); await activate(button('Force sensor')); await collapse();
        let id; await atomic(() => tap({ x: 75, y: 240 }), g => { assert.equal(Object.keys(g.forceSensors).length, 1); id = Object.keys(g.forceSensors)[0]; });
        const one = await graph(); await tap({ x: 75, y: 240 }); await check('existing-link-sensor-selected-not-duplicated', s => {
          assert.deepEqual(graphOnly(s.graph), one); assert.deepEqual(s.editor.selectedIds, [id]); });
        await expand(); for (const label of ['Sensor name', 'Sensor link', 'Sensor enabled', 'Delete sensor']) await target(field(label).or(button(label)), label);
        await edit('Sensor name', 'Rod load', g => assert.equal(g.forceSensors[id].name, 'Rod load'));
        await edit('Sensor name', '', g => assert.equal(g.forceSensors[id].name, '')); await undo();
        await atomic(() => activate(field('Sensor enabled')), g => assert.equal(g.forceSensors[id].enabled, false)); await undo();
        await atomic(() => activate(button('Delete sensor')), g => assert.equal(Object.keys(g.forceSensors).length, 0)); await undo();
        await jointProperties('handle'); await activate(button('Clear joint name'));
        const complete = await save('sensor-created'); complete.forceSensors[id].legacySensorExtension = { calibration: 'model-only', revision: 7 };
        complete.tracers.persisted = { id: 'persisted', name: 'Saved path', bodyId: 'rod', localPosition: { x: 10, y: 20 }, enabled: true, extension: { keep: true } };
        await open(complete); const design = await graph(), saved = await save('sensor-complete');
        await check('complete-definitions-and-metadata-saved', () => { assert.deepEqual(graphOnly(saved), design); assert.deepEqual(saved.oldForkMetadata, fixture.oldForkMetadata);
          assert.deepEqual(saved.forceSensors[id].legacySensorExtension, complete.forceSensors[id].legacySensorExtension); assert(!saved.joints.handle.label);
          assert(saved.forceModel && /model|particle/i.test(JSON.stringify(saved.forceModel)), 'Saved forceModel must declare model units, not SI'); }, { saved });
        await open(saved); await check('sensor-save-reopen-whole-graph', s => assert.deepEqual(graphOnly(s.graph), design));
        const paused = await playFor(.7), samples = paused.simulation.forceSensorData[id] ?? [], backend = paused.simulation.solverResult?.forceAnalysis?.linkForces?.rod?.axialForce;
        await check('known-unit-particle-vertical-load', () => { assert(samples.length > 2); near(backend, 250, 'Backend axial load within 1%', 2.5);
          for (let i = 0; i < samples.length; i++) { near(samples[i].force, 250, 'Recorded axial load within 1%', 2.5); assert(Number.isFinite(samples[i].time)); if (i) assert(samples[i].time > samples[i - 1].time); } }, { samples, backend });
        await expand(); await activate(button('Rod load properties')); await target(field('Current axial force (model units)'), 'Current sensor readout', false);
        const current = await field('Current axial force (model units)').textContent(), chart = await pixels(page.getByRole('img', { name: 'Axial force history (model units)', exact: true }));
        await check('sensor-readout-and-chart-pixels', () => { near(Number(current), backend, 'Actual UI agrees with backend', .01); assert(chart.ink > 0 && chart.distinctColors > 1);
          near(chart.width, chart.cssWidth * profile.dpr, 'Chart DPR width', 1); near(chart.height, chart.cssHeight * profile.dpr, 'Chart DPR height', 1); }, { current, chart });
        await capture('sensor-chart-readable', { current, chart }, true);
        await target(field('Runtime object'), 'Runtime object inspector'); await field('Runtime object').selectOption('anchor');
        const reaction = await field('Reaction Fy (model units)').textContent();
        await check('support-reaction-ui', () => near(Number(reaction), -250, 'Fixed support Fy within 1%', 2.5), { reaction });
        await capture('joint-reaction-readable', { reaction }, true);
        for (const [label, key] of [['Model link loads', 'showLoads'], ['Joint reactions (model)', 'showReactions']]) {
          await field(label).scrollIntoViewIfNeeded(); const before = await pixels(); await activate(field(label)); const after = await pixels();
          await check('overlay-actual-draw-change', s => { assert.equal(s.editor[key], true); assert.notEqual(after.sha256, before.sha256); }, { label, before, after });
          await activate(field(label));
        }
        await field('Runtime object').selectOption('handle'); await target(field('Trace joint'), 'Joint trace checkbox');
        await activate(field('Trace joint')); const tracked = await playFor(.3);
        await check('native-joint-tracing', () => {
          const path = tracked.simulation.pathTraces.handle ?? [];
          assert(path.length > 2); near(distance(path.at(-1), tracked.graph.joints.handle.position), 0, 'Joint trace final point');
          assert((tracked.simulation.tracerPaths.persisted ?? []).length > 2); assert((tracked.simulation.forceSensorData[id] ?? []).length > 2);
        });
        await expand(); await target(button('Clear traces'), 'Clear all traces'); await activate(button('Clear traces'));
        await check('native-clear-all-series', state => {
          for (const key of ['pathTraces', 'tracerPaths', 'forceSensorData']) assert.equal(Object.keys(state.simulation[key]).length, 0);
          assert(state.simulation.trackedJointIds.includes('handle'), 'Clear samples retains chosen tracing');
        });
        await activate(button('Restart')); const restarted = await capture('restart-state');
        await check('restart-series-reset', () => { assert(restarted.simulation.time < paused.simulation.time); const next = restarted.simulation.forceSensorData[id] ?? [];
          assert(next.length < samples.length); if (next.length) assert(next[0].time <= samples[0].time + .05); });
        await playFor(.3); await activate(page.getByTitle('Create mode', { exact: true }));
        await check('sensor-create-whole-graph-restore', s => assert.deepEqual(graphOnly(s.graph), design));
        await expand(); await activate(button('Rod load properties')); await activate(field('Sensor enabled')); await collapse();
        const disabled = await playFor(.3); await check('disabled-sensor-no-fake-samples', () => assert.equal((disabled.simulation.forceSensorData[id] ?? []).length, 0));
      });

      await run('sensor-link-edit-invalid-import-and-zero-rest', async () => {
        const data = structuredClone(fixture); data.projectName = 'G7 sensor edge cases';
        data.forceSensors.probe = { id: 'probe', linkId: 'rod', enabled: true, name: 'Edge probe', extension: { retain: [1, 2, 3] } };
        data.joints.otherA = { ...structuredClone(data.joints.anchor), id: 'otherA', label: 'Other support', position: { x: 225, y: 180 }, connectedLinkIds: ['other'] };
        data.joints.otherB = { ...structuredClone(data.joints.handle), id: 'otherB', position: { x: 225, y: 300 }, connectedLinkIds: ['other'] };
        data.links.other = { id: 'other', jointIds: ['otherA', 'otherB'], restLength: 120, mass: 1 };
        data.bodies.base.jointIds.push('otherA'); data.bodies.other = body('other', ['otherA', 'otherB'], '#42a5f5');
        await open(data); await expand(); await activate(button('Edge probe properties'));
        await atomic(() => field('Sensor link').selectOption('other'), g => assert.equal(g.forceSensors.probe.linkId, 'other'));
        const before = await graph(), invalid = structuredClone(data); invalid.forceSensors.probe.linkId = 'missing-link';
        const chooser = page.waitForEvent('filechooser'); await activate(button('Open')); await acceptDirtyOpen();
        await (await chooser).setFiles({ name: 'invalid-sensor.slinker', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(invalid)) });
        await page.waitForFunction(() => document.querySelector('.top-bar')?.getAttribute('aria-busy') === 'false');
        await page.getByRole('alert').waitFor(); const alert = await page.getByRole('alert').textContent();
        await check('invalid-sensor-import-atomic', s => { assert.deepEqual(graphOnly(s.graph), before); assert(/sensor|link/i.test(alert)); }, { invalid, alert });
        const zero = structuredClone(fixture); zero.projectName = 'G7 zero-rest sensor'; zero.links.rod.restLength = 0;
        zero.joints.handle.position = { ...zero.joints.anchor.position }; zero.simulationSettings.gravityEnabled = false;
        zero.forceSensors.probe = structuredClone(data.forceSensors.probe); await open(zero);
        const zeroSaved = await save('zero-rest-definition'); await check('zero-rest-definition-retained', s => {
          assert.deepEqual(s.graph.forceSensors.probe, zero.forceSensors.probe); assert.deepEqual(zeroSaved.forceSensors.probe, zero.forceSensors.probe); });
        const paused = await playFor(.25); await expand(); await activate(button('Edge probe properties'));
        const current = await field('Current axial force (model units)').textContent();
        await check('zero-rest-unavailable-never-fake-zero', () => { assert.equal(current, 'Unavailable');
          assert.equal((paused.simulation.forceSensorData.probe ?? []).length, 0);
          assert.equal(paused.simulation.solverResult?.forceAnalysis?.linkForces?.rod?.axialForce, null); }, { current });
      });
      await run('empty-outline-com-retains-applied-gravity', async () => {
        const data = structuredClone(fixture); data.projectName = 'G7 COM without outline'; data.bodies.rod.useOutlineCOM = true;
        data.viewPreferences.showVectors = true;
        await open(data); const paused = await playFor(.3);
        await check('empty-outline-com-gravity-vector', () => {
          const vectors = paused.simulation.solverResult.forceVectors.filter(v => v.color === '#42A5F5');
          assert.equal(vectors.length, 1, 'No COM geometry must not hide the ordinary particle gravity vector');
          near(vectors[0].magnitude, 250, 'Unweighted gravity model value');
        });
      });
      await run('all-fixed-joint-trace-and-applied-load', async () => {
        const data = structuredClone(fixture); data.projectName = 'G7 static tracing'; data.bodies.base.jointIds.push('handle');
        data.joints.handle.type = 'fixed'; data.joints.handle.externalForce = { x: 3, y: 4 }; data.viewPreferences.showVectors = true;
        await open(data); await playFor(.2); await expand(); await field('Runtime object').selectOption('anchor');
        await activate(field('Trace joint')); const paused = await playFor(.3);
        await check('fixed-particle-trace-and-force', () => {
          const path = paused.simulation.pathTraces.anchor ?? [];
          assert(path.length > 2, 'Static joints still have a sampled constant path');
          for (const point of path) near(distance(point, data.joints.anchor.position), 0, 'Fixed trace point');
          const load = paused.simulation.solverResult.forceVectors.find(v => v.color === '#8e24aa');
          assert(load, 'All-fixed applied external load stays visible'); near(load.magnitude, 5, 'Static external force');
        });
      });
    } catch (e) { steps.push({ name: 'bootstrap', passed: false, failure: e.stack }); await capture('bootstrap-FAILED', { failure: e.stack }, true).catch(() => {}); }
    finally {
      const events = await page.evaluate(() => globalThis.__g7Events ?? []).catch(() => []);
      await writeFile(join(dir, 'events.json'), JSON.stringify(events, null, 2));
      await run('trusted-input-and-console', async () => { await check('native-input-only', () => { assert(events.some(e => e.tag === 'CANVAS' && e.type === 'pointerdown'));
          assert(events.every(e => e.trusted || e.internalFileClick), 'Native canvas/controls; only offscreen file input and download adapter clicks are internal'); if (cdp) assert(events.some(e => e.type === 'pointercancel' && e.pointerType === 'touch'));
          assert.equal(errors.length, 0, 'Console/page errors must be empty'); }, { events, errors }); });
      const result = { profile, build, steps, checks, targets, errors, passed: steps.length === 7 && steps.every(s => s.passed) && errors.length === 0,
        input: cdp ? 'Single CDP touch session; 300ms held release/cancel' : profile.touch ? 'Trusted WebKit UI/canvas taps; native mouse canvas drag/cancel' : 'Native mouse/keyboard',
        comparisons: ['C04', 'C06', 'C07', 'C08', 'C09', 'C10', 'C11', 'C12', 'C13'], screens: ['S04', 'S06', 'S07', 'S09', 'S10', 'S12'] };
      results.push(result); await writeFile(join(dir, 'report.json'), JSON.stringify(result, null, 2));
      await context.tracing.stop({ path: join(dir, 'trace.zip') }); await context.close();
    }
  }
} finally { await browser.close(); }
const sourceEnd = await candidateFingerprint(), stableSource = sourceStart.sourceSha256 === sourceEnd.sourceSha256;
const report = { startedAt, finishedAt: new Date().toISOString(), engine, url, harnessSha256: hash(harness), sourceStart, sourceEnd, stableSource, results,
  passed: stableSource && results.length === profiles.length && results.every(r => r.passed), gateAcceptance: false, physicalIPadVerified: false, usage: 'unknown',
  limits: ['Lead owns installation, frozen-artifact runs, cumulative G1-G6, long energy/cap stress, mirror/domain qualification and gate acceptance.',
    'No physical iPad/Safari/Home Screen/Pencil/VoiceOver certification; no SI/engineering force claim.',
    'WebKit touch drag/cancel unavailable here: trusted taps plus native mouse/Escape canvas cancellation only.',
    'Chromium 300ms pre-release hold qualifies this input path, not rapid native flick behavior.'] };
await writeFile(join(output, 'report.json'), JSON.stringify(report, null, 2));
console.log(JSON.stringify({ output, passed: report.passed, stableSource, gateAcceptance: false, failures: results.flatMap(r => r.steps.filter(s => !s.passed).map(s => ({ profile: r.profile.id, ...s }))) }));
if (!report.passed) process.exitCode = 1;
