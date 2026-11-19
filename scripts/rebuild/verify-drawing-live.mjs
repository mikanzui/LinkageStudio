import assert from 'node:assert/strict';
import { mkdir, mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { chromium, webkit } from '../../.rebuild.local/tooling/node_modules/playwright/index.mjs';
import { resolveBrowserPaths } from './source-paths.mjs';

const paths = resolveBrowserPaths(), engine = process.argv[2] ?? 'chromium';
const url = process.argv[3] ?? 'https://mikanzui.github.io/LinkageStudio/';
const target = new URL(url);
assert(['chromium', 'webkit'].includes(engine));
assert(target.href === 'https://mikanzui.github.io/LinkageStudio/' ||
  (target.protocol === 'http:' && ['localhost', '127.0.0.1'].includes(target.hostname) && target.pathname === '/LinkageStudio/'));
const parent = join(paths.local, 'evidence/drawing-live');
await mkdir(parent, { recursive: true });
const output = await mkdtemp(join(parent, engine + '-'));
const browser = engine === 'webkit' ? await webkit.launch() : await chromium.launch(process.argv.includes('--bundled-chromium') ? {} : { channel: 'chrome' });
const context = await browser.newContext({ viewport: { width: engine === 'webkit' ? 1024 : 1440, height: 1100 },
  hasTouch: engine === 'webkit', isMobile: engine === 'webkit', acceptDownloads: true, serviceWorkers: 'allow' });
await context.addInitScript(() => Object.defineProperty(window, 'showSaveFilePicker', { value: undefined, configurable: true }));
const page = await context.newPage(), errors = [], checks = [];
page.on('pageerror', error => errors.push(error.message));
page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
page.on('dialog', dialog => dialog.accept(dialog.type() === 'prompt' ? 'Drawing QA.slinker' : undefined));
const button = name => page.getByRole('button', { name, exact: true });
const activate = locator => engine === 'webkit' ? locator.tap() : locator.click();
const graphOnly = data => Object.fromEntries(['joints', 'links', 'bodies', 'baseBodyId', 'outlines', 'images', 'sliders', 'colliders', 'tracers', 'springs', 'forceSensors'].filter(key => key in data).map(key => [key, data[key]]));
async function save(name) {
  const waiting = page.waitForEvent('download');
  await activate(button('Save'));
  const download = await waiting, path = await download.path();
  const bytes = await readFile(path);
  await writeFile(join(output, name + '.slinker'), bytes);
  return JSON.parse(bytes.toString());
}
async function drag(a, b) {
  await page.mouse.move(a.x, a.y); await page.mouse.down();
  try { await page.mouse.move(b.x, b.y, { steps: 18 }); await page.waitForTimeout(350); }
  finally { await page.mouse.up(); }
}
let passed = false;
try {
  assert.equal((await page.goto(url)).status(), 200);
  const surface = page.locator('canvas[aria-label="Mechanism canvas"]');
  await surface.waitFor();
  await page.locator('.splash-screen').waitFor({ state: 'detached' });
  assert.equal(await page.evaluate(() => typeof globalThis.__LINKAGE_G0_READ__), 'undefined', 'No test observer in live artifact');
  if (engine === 'webkit') {
    await page.locator('.toolbar-collapsed').waitFor();
    await page.locator('.panel-collapsed').waitFor();
  } else {
    for (const title of ['Collapse toolbar', 'Collapse panel']) {
      const control = button(title); if (await control.isVisible()) await activate(control);
    }
  }
  await activate(button('Draw'));
  const palette = page.getByRole('toolbar', { name: 'Draw overlay tools', exact: true });
  assert.equal(await palette.getByRole('button').count(), 5);
  await activate(button('Circle'));
  const r = await surface.boundingBox(), center = { x: r.x + 300, y: r.y + 280 };
  await drag(center, { x: center.x + 60, y: center.y });
  const before = await save('before-trim'), ids = Object.keys(before.outlines);
  assert.equal(ids.length, 1);
  const id = ids[0];
  assert.equal(before.outlines[id].primitive, 'circle');
  assert.equal(before.outlines[id].points.length, 48);
  await page.screenshot({ path: join(output, 'circle-before-trim.png') });
  await activate(button('Trim'));
  await activate(page.getByRole('radio', { name: 'Selected Shapes', exact: true }));
  // Geometry options change height; reacquire the canvas rectangle.
  const trimmedBox = await surface.boundingBox();
  const shifted = { x: center.x + trimmedBox.x - r.x, y: center.y + trimmedBox.y - r.y };
  await drag({ x: shifted.x, y: shifted.y - 90 }, { x: shifted.x, y: shifted.y + 90 });
  const after = await save('after-trim');
  assert.equal(Object.keys(after.outlines).length, 0, 'Circle must disappear completely, not become open arc runs');
  for (const key of Object.keys(graphOnly(before)).filter(key => key !== 'outlines')) assert.deepEqual(after[key], before[key], 'Unrelated graph: ' + key);
  await page.screenshot({ path: join(output, 'circle-after-trim.png') });
  await activate(button('Undo'));
  assert.deepEqual(graphOnly(await save('undo-restores-circle')), graphOnly(before), 'One undo restores entire circle');
  await activate(button('Redo'));
  assert.deepEqual(graphOnly(await save('redo-removes-circle')), graphOnly(after));
  checks.push('Real live Draw palette, circle drag, complete circle trim and one undo/redo, verified through native saved downloads');
  const chooser = page.waitForEvent('filechooser');
  await activate(button('Open'));
  const unsaved = page.getByRole('dialog', { name: 'Unsaved Changes', exact: true });
  if (await unsaved.isVisible()) await activate(unsaved.getByRole('button', { name: 'Discard and open', exact: true }));
  await (await chooser).setFiles(join(output, 'after-trim.slinker'));
  await page.getByText('Opened after-trim.slinker.', { exact: true }).waitFor();
  assert.equal(Object.keys((await save('reopened-deleted-circle')).outlines).length, 0);
  await activate(button('Select')); assert.equal(await palette.count(), 0);
  await activate(button('Draw')); assert.equal(await palette.getByRole('button').count(), 5);
  checks.push('Actual downloaded file reopens without resurrecting circle; Select hides and Draw restores palette');
  const circlePoints=Array.from({length:48},(_,i)=>({x:300+60*Math.cos(i*Math.PI/24),y:300+60*Math.sin(i*Math.PI/24)}));
  const fixture={version:'0.12.3',projectName:'Live arc QA',joints:{},links:{},bodies:{base:{id:'base',name:'Base',color:'#e53935',jointIds:[]}},baseBodyId:'base',
    outlines:{ring:{id:'ring',bodyId:'base',name:'Circle',points:circlePoints,closed:true,primitive:'circle'},
      boundary:{id:'boundary',bodyId:'base',name:'Boundary',points:[{x:300,y:200},{x:300,y:400}],closed:false}},
    viewPreferences:{camera:{zoom:1,pan:{x:0,y:0}},gridLevel:'off'}};
  for(const method of ['power','closest']) {
    const name='live-'+method+'-intersection.slinker',choosing=page.waitForEvent('filechooser');
    await activate(button('Open'));
    const dirty=page.getByRole('dialog',{name:'Unsaved Changes',exact:true});
    if(await dirty.isVisible())await activate(dirty.getByRole('button',{name:'Discard and open',exact:true}));
    await (await choosing).setFiles({name,mimeType:'application/json',buffer:Buffer.from(JSON.stringify(fixture))});
    await page.getByText('Opened '+name+'.',{exact:true}).waitFor();
    await activate(button('Select'));
    let area=await surface.boundingBox();await page.mouse.click(area.x+360,area.y+300);
    await activate(button('Draw'));await activate(button('Trim'));
    await page.getByLabel('Trim method',{exact:true}).selectOption(method);
    area=await surface.boundingBox();
    if(method==='power')await drag({x:area.x+350,y:area.y+300},{x:area.x+370,y:area.y+300});
    else await page.mouse.click(area.x+360,area.y+300);
    const arc=await save('live-'+method+'-arc');
    assert.equal(arc.outlines.ring.closed,false);assert.equal(arc.outlines.ring.primitive,'circle');
    assert(arc.outlines.ring.points.every(p=>p.x<=300+1e-5));
    assert.deepEqual(arc.outlines.boundary.points,fixture.outlines.boundary.points);
    assert.equal(Object.keys(arc.joints).length,0);assert.equal(Object.keys(arc.links).length,0);
    await page.screenshot({path:join(output,'live-'+method+'-arc.png')});
    await activate(button('Undo'));assert.equal((await save('live-'+method+'-undo')).outlines.ring.closed,true);
    await activate(button('Redo'));assert.deepEqual(graphOnly(await save('live-'+method+'-redo')),graphOnly(arc));
  }
  for(const name of ['Pan','Select','Box select','Lasso select']) {
    await activate(button(name));assert.equal(await button(name).getAttribute('aria-pressed'),'true');
  }
  checks.push('17.1 actual production Power/closest intersection arcs, boundary preservation, native saved undo/redo and directly visible selection controls');
  assert.deepEqual(errors, []);
  passed = true;
} finally {
  await writeFile(join(output, 'report.json'), JSON.stringify({ url, engine, browser: browser.version(), passed, checks, errors,
    input: engine === 'webkit' ? 'Trusted tablet UI taps; native mouse canvas drags, not physical touch-drag evidence' : 'Native mouse/keyboard',
    physicalIPadVerified: false }, null, 2));
  await context.close(); await browser.close();
  console.log(JSON.stringify({ output, passed, checks }));
}
