import assert from 'node:assert/strict';
import { mkdir, mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { spawn } from 'node:child_process';
import { createServer } from 'node:net';
import { chromium, webkit } from '../../.rebuild.local/tooling/node_modules/playwright/index.mjs';
import { resolveBrowserPaths } from './source-paths.mjs';
import { candidateFingerprint, assertCandidateBuild } from './candidate-fingerprint.mjs';
import { buildGate } from './build-gate.mjs';

const paths = resolveBrowserPaths(), engine = process.argv[2] ?? 'chromium';
assert(['chromium', 'webkit'].includes(engine));
const catalog = JSON.parse(await readFile(join(paths.candidate, 'examples/catalog.json'), 'utf8'));
let url = process.argv.slice(3).find(arg => !arg.startsWith('--')), server;
if (!url) {
  const build = await buildGate('g17');
  const socket = createServer(); await new Promise(r => socket.listen(0, '127.0.0.1', r));
  const port = socket.address().port; await new Promise(r => socket.close(r));
  url = `http://127.0.0.1:${port}${build.sourceStart.base}`;
  server = spawn(process.execPath, [join(paths.candidate, 'node_modules/vite/bin/vite.js'), 'preview', '--host', '127.0.0.1', '--port', String(port), '--strictPort', '--outDir', build.output], { cwd: paths.candidate, windowsHide: true, stdio: 'inherit' });
  let ready = false;
  for (let i = 0; i < 100; i++) { try { if ((await fetch(url)).ok) { ready = true; break; } } catch { /* bounded startup */ } await new Promise(r => setTimeout(r, 100)); }
  if (!ready) { server.kill(); throw new Error('Preview did not start'); }
}
const sourceStart = await candidateFingerprint();
const parent = join(paths.local, 'evidence/v17'); await mkdir(parent, { recursive: true });
const output = await mkdtemp(join(parent, engine + '-examples-')), results = [];
const browser = engine === 'webkit' ? await webkit.launch() : await chromium.launch(process.argv.includes('--bundled-chromium') ? {} : { channel: 'chrome' });
const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
try {
  for (const profile of [{ id: 'desktop', width: 1440, height: 1000, touch: false }, { id: 'portrait', width: 1024, height: 1366, touch: true }, { id: 'split', width: 512, height: 900, touch: true }]) {
    const context = await browser.newContext({ viewport: { width: profile.width, height: profile.height }, hasTouch: profile.touch, isMobile: profile.touch, deviceScaleFactor: profile.touch ? 2 : 1, serviceWorkers: 'block', acceptDownloads: true });
    await context.addInitScript(() => Object.defineProperty(window, 'showSaveFilePicker', { configurable: true, value: undefined }));
    const page = await context.newPage(), errors = []; page.setDefaultTimeout(15000);
    page.on('pageerror', e => errors.push(e.message)); page.on('dialog', d => d.accept(d.type() === 'prompt' ? d.defaultValue() : undefined));
    const activate = l => profile.touch ? l.tap() : l.click();
    const button = name => page.getByRole('button', { name, exact: true });
    const read = () => page.evaluate(() => ({ graph: __LINKAGE_G0_READ__.mechanism(), editor: __LINKAGE_G0_READ__.editor(), simulation: __LINKAGE_G0_READ__.simulation() }));
    const mode = async name => { const compact = button(name + ' mode'); await activate(await compact.isVisible() ? compact : button(name)); };
    const gallery = async () => {
      await activate(button('Projects')); const tab = page.getByRole('tab', { name: 'Examples', exact: true }); await activate(tab);
      await page.getByRole('radiogroup', { name: 'Examples', exact: true }).waitFor();
    };
    const choose = async e => { await page.getByRole('searchbox', { name: 'Search examples' }).fill(''); await activate(page.locator(`input[name="example-project"][value="${e.id}"]`)); };
    const open = async e => { await gallery(); await choose(e); await activate(button('Open example')); await page.getByRole('dialog', { name: 'Projects', exact: true }).waitFor({ state: 'hidden' }); };
    try {
      await page.goto(url); await page.locator('canvas').waitFor(); await assertCandidateBuild(page, sourceStart);
      if (profile.touch) await page.locator('.panel-collapsed').first().waitFor();
      for (const name of ['Collapse toolbar', 'Collapse panel']) if (await button(name).isVisible()) await activate(button(name));
      await gallery();
      assert.equal(await page.locator('input[name="example-project"]').count(), 7);
      const layout = await page.getByRole('dialog', { name: 'Projects', exact: true }).evaluate(d => {
        const r = d.getBoundingClientRect(); return { x: r.x, right: r.right, y: r.y, bottom: r.bottom, width: innerWidth, height: innerHeight, overflow: d.scrollWidth > d.clientWidth + 1 };
      });
      assert(layout.x >= 0 && layout.y >= 0 && layout.right <= layout.width && layout.bottom <= layout.height && !layout.overflow, JSON.stringify(layout));
      await page.getByRole('searchbox', { name: 'Search examples' }).fill('torsion'); assert.equal(await page.locator('input[name="example-project"]').count(), 2);
      await page.getByRole('searchbox', { name: 'Search examples' }).fill('no-match-xyz'); await page.getByText('No matching examples', { exact: true }).waitFor(); assert(await button('Open example').isDisabled());
      await page.getByRole('searchbox', { name: 'Search examples' }).fill('');
      const rowsFit = await page.locator('.example-list label').evaluateAll(rows => rows.every(row => {
        const r = row.getBoundingClientRect(), text = row.querySelector('span').getBoundingClientRect(); return r.height >= 76 && text.top >= r.top && text.bottom <= r.bottom;
      })); assert(rowsFit, 'Rows must retain their target height without overlapping their text');
      await page.screenshot({ path: join(output, profile.id + '-catalog.png') });
      if (profile.touch) for (const locator of [page.getByRole('tab', { name: 'Examples', exact: true }), button('Open example'), page.getByRole('link', { name: 'Download example' })]) { const r = await locator.boundingBox(); assert(r.height >= 44 && r.width >= 44, JSON.stringify(r)); }
      await activate(button('Close projects'));
      for (const example of catalog) {
        await open(example); const design = (await read()).graph;
        const bodyCount = Object.keys(design.bodies).length; assert(bodyCount > 1);
        await page.screenshot({ path: join(output, profile.id + '-' + example.id + '-design.png') });
        await mode('Simulate'); const samples = [];
        if (example.id === 'winged-airer' || example.id === 'working-screen') {
          // Native camera input keeps the full brown-arm pull on canvas, including Split View.
          let rect = await page.locator('canvas').boundingBox(), state = await read();
          for (let i = 0; state.editor.camera.zoom > .28 && i < 30; i++) { await activate(button('Zoom out')); state = await read(); }
          const dx = rect.width / 2 - 600 * state.editor.camera.zoom - state.editor.camera.pan.x;
          const dy = rect.height / 2 - 400 * state.editor.camera.zoom - state.editor.camera.pan.y;
          const n = Math.max(1, Math.ceil(Math.abs(dx) / (rect.width * .3)), Math.ceil(Math.abs(dy) / (rect.height * .3)));
          for (let i = 0; i < n; i++) { await page.mouse.move(rect.x + rect.width / 2, rect.y + rect.height / 2); await page.mouse.down({ button: 'middle' }); await page.mouse.move(rect.x + rect.width / 2 + dx / n, rect.y + rect.height / 2 + dy / n, { steps: 8 }); await page.mouse.up({ button: 'middle' }); }
          const initial = await read(), handle = example.id === 'winged-airer' ? 'g6kFted7Nm' : '0oYLG5yu-0';
          rect = await page.locator('canvas').boundingBox(); const cam = initial.editor.camera;
          const screen = p => ({ x: rect.x + cam.pan.x + p.x * cam.zoom, y: rect.y + cam.pan.y + p.y * cam.zoom });
          let previous = screen(initial.graph.joints[handle].position);
          const cdp = profile.touch && engine === 'chromium' ? await context.newCDPSession(page) : null;
          if (cdp) await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ ...previous, id: 1 }] });
          else { await page.mouse.move(previous.x, previous.y); await page.mouse.down(); }
          assert.equal((await read()).editor.simDrag?.jointId, handle);
          const targets = example.id === 'winged-airer' ? [{ x: 600, y: 200 }, { x: 400, y: 100 }, { x: 100, y: -50 }] : [{ x: 625, y: 325 }];
          for (const target of targets) {
            const to = screen(target); assert(to.x > rect.x && to.x < rect.x + rect.width && to.y > rect.y && to.y < rect.y + rect.height);
            for (let i = 1; i <= 20; i++) { const p = { x: previous.x + (to.x - previous.x) * i / 20, y: previous.y + (to.y - previous.y) * i / 20 }; if (cdp) await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ ...p, id: 1 }] }); else await page.mouse.move(p.x, p.y); await page.waitForTimeout(30); samples.push(await read()); }
            await page.waitForTimeout(1600); samples.push(await read()); previous = to;
          }
          const held = await read(); if (cdp) { await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] }); await cdp.detach(); } else await page.mouse.up();
          const travel = dist(held.graph.joints[handle].position, initial.graph.joints[handle].position); assert(travel > 30);
          if (example.id === 'winged-airer') { const j = held.graph.joints, a = j['9hUW_8pccU'].position, b = j.XlD7YOWwBk.position, c = j['7GbfNIkT2-'].position; const angle = Math.acos(((a.x-c.x)*(b.x-c.x)+(a.y-c.y)*(b.y-c.y))/(dist(a,c)*dist(b,c)))*180/Math.PI; assert(angle >= 30 && angle <= 60 && dist(a,b) > 300); assert.equal(held.simulation.dof, 1); results.push({ profile: profile.id, example: example.id, travel, angle, spread: dist(a,b), trustedTouchPull: !!cdp, passed: true }); }
          else results.push({ profile: profile.id, example: example.id, travel, passed: true });
        } else {
          const started = Date.now(); while (Date.now() - started < 30000) { const s = await read(); samples.push(s); if (s.simulation.time >= 6) break; await page.waitForTimeout(100); }
          assert(samples.at(-1).simulation.time >= 6);
          const ids = example.id === 'scissor-lift' ? ['E', 'B'] : example.id === 'crank-slider' ? ['output'] : example.id === 'carriage' ? ['cart-a'] : example.id === 'gripper' ? ['jaw-left-tip'] : ['output', 'cart-a', 'jaw-left-tip'];
          const travel = Object.fromEntries(ids.map(id => [id, Math.max(...samples.map(s => dist(s.graph.joints[id].position, design.joints[id].position)))]));
          for (const d of Object.values(travel)) assert(d > 25, JSON.stringify(travel));
          results.push({ profile: profile.id, example: example.id, travel, passed: true });
        }
        for (const s of samples) { assert.equal(s.simulation.stepError, null); for (const j of Object.values(s.graph.joints)) assert(Number.isFinite(j.position.x) && Number.isFinite(j.position.y)); for (const id of design.bodies[design.baseBodyId].jointIds) assert.deepEqual(s.graph.joints[id].position, design.joints[id].position); }
        await activate(button('Pause')); await page.screenshot({ path: join(output, profile.id + '-' + example.id + '-moving.png') });
        await mode('Create'); assert.deepEqual((await read()).graph, design, 'Exact design restoration ' + example.id);
        const downloadPromise = page.waitForEvent('download'); await activate(button('Save')); const download = await downloadPromise;
        const saved = join(output, profile.id + '-' + example.filename); await download.saveAs(saved);
        const chooser = page.waitForEvent('filechooser'); await activate(button('Open')); await (await chooser).setFiles(saved);
        await page.waitForFunction(() => document.querySelector('.top-bar')?.getAttribute('aria-busy') === 'false');
        const reopened = (await read()).graph; for (const key of ['joints','links','bodies','outlines','springs','sliders','colliders','tracers','forceSensors']) assert.deepEqual(reopened[key], design[key], example.id + ' saved ' + key);
        console.log(JSON.stringify(results.at(-1)));
      }
      // Unsaved navigation is exercised through the actual name editor, not store mutation.
      await activate(page.getByTitle('Rename project', { exact: true })); await page.getByRole('textbox', { name: 'Project name', exact: true }).fill('Keep this unsaved project'); await page.keyboard.press('Enter');
      const dirty = await read(); await gallery(); await choose(catalog[0]); await activate(button('Open example'));
      await page.getByRole('region', { name: 'Unsaved example navigation' }).waitFor(); assert.deepEqual((await read()).graph, dirty.graph);
      await activate(button('Cancel')); await activate(button('Close projects')); assert.equal((await read()).editor.projectName, 'Keep this unsaved project');
      await gallery(); await choose(catalog[0]); await activate(button('Open example')); await activate(button('Discard and open')); await page.getByRole('dialog', { name: 'Projects', exact: true }).waitFor({ state: 'hidden' });
      assert.equal((await read()).editor.projectName, 'Spring-Assisted Two-Stage Scissor Lift');
      const stable = await read(); let release;
      await page.route('**/examples/mechanism-playground.slinker', async route => { await new Promise(r => { release = r; }); await route.fulfill({ status: 200, body: await readFile(join(paths.candidate, 'examples/mechanism-playground.slinker'), 'utf8') }).catch(() => {}); });
      await gallery(); await choose(catalog.find(e => e.id === 'playground')); await activate(button('Open example')); await page.waitForFunction(() => document.querySelector('.example-projects')?.getAttribute('aria-busy') === 'true');
      await activate(button('Close projects')); release(); await page.waitForTimeout(150); assert.deepEqual((await read()).graph, stable.graph, 'Closed gallery must ignore late fetch');
      await page.unroute('**/examples/mechanism-playground.slinker');
      await gallery(); const tab = page.getByRole('tab', { name: 'Examples', exact: true }); await tab.focus(); await page.keyboard.press('ArrowLeft'); assert.equal(await page.getByRole('tab', { name: 'My projects', exact: true }).getAttribute('aria-selected'), 'true');
      await page.keyboard.press('End'); assert.equal(await tab.getAttribute('aria-selected'), 'true'); await page.keyboard.press('Escape'); await button('Projects').waitFor(); assert.equal(await button('Projects').evaluate(e => e === document.activeElement), true);
      assert.deepEqual(errors, []); results.push({ profile: profile.id, protections: ['dirty Cancel/discard','native saved-file reopen for all seven','closed late fetch','tab keyboard and Escape focus','bounded dialog and coarse targets'], passed: true });
    } catch (error) { results.push({ profile: profile.id, passed: false, failure: error.stack, errors }); await page.screenshot({ path: join(output, profile.id + '-FAILED.png') }).catch(() => {}); throw error; }
    finally { await context.close(); await writeFile(join(output, 'progress.json'), JSON.stringify(results, null, 2)); }
  }
} finally {
  await browser.close(); if (server) { const exit = new Promise(r => server.once('exit', r)); server.kill(); await exit; }
  const sourceEnd = await candidateFingerprint(), passed = results.length === 24 && results.every(r => r.passed) && sourceStart.sourceSha256 === sourceEnd.sourceSha256;
  await writeFile(join(output, 'report.json'), JSON.stringify({ engine, output, sourceStart, sourceEnd, results, passed, physicalIPadVerified: false }, null, 2)); console.log(JSON.stringify({ output, passed }));
  if (!passed) process.exitCode = 1;
}
