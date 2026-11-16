import { chromium } from '../../.rebuild.local/tooling/node_modules/playwright/index.mjs';
import { mkdir, mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';
const root = fileURLToPath(new URL('../../', import.meta.url));
const parent = join(root, '.rebuild.local/evidence/g3'); await mkdir(parent, { recursive: true }); const output = await mkdtemp(join(parent, 'airer-probe-'));
const { archive } = JSON.parse(await readFile(join(root, '.rebuild.local/runtimes.json'), 'utf8'));
const b = await chromium.launch({ channel: 'chrome' });
try {
  for (const [id, url] of [['upstream', 'http://127.0.0.1:5181/linkage-studio/'], ['candidate', 'http://127.0.0.1:5183/linkage-studio/']]) {
    const c = await b.newContext({ viewport: { width: 1440, height: 1000 }, serviceWorkers: 'block' }); const p = await c.newPage();
    await p.goto(url); const picker = p.waitForEvent('filechooser'); await p.getByRole('button', { name: 'Open', exact: true }).click(); await (await picker).setFiles(join(archive, 'fixtures/airer.slinker'));
    await p.waitForFunction(() => Object.keys(__LINKAGE_G0_READ__.mechanism().joints).length > 10);
    await p.mouse.move(700, 450); await p.mouse.down({ button: 'middle' }); await p.mouse.move(350, 450, { steps: 10 }); await p.mouse.up({ button: 'middle' });
    const read = () => p.evaluate(() => ({ graph: __LINKAGE_G0_READ__.mechanism(), editor: __LINKAGE_G0_READ__.editor(), simulation: __LINKAGE_G0_READ__.simulation() }));
    await p.getByRole('button', { name: 'Simulate', exact: true }).click(); await p.waitForTimeout(200);
    const start = await read(), rect = await p.locator('canvas').boundingBox(), camera = start.editor.camera;
    const screen = point => ({ x: rect.x + camera.pan.x + point.x * camera.zoom, y: rect.y + camera.pan.y + point.y * camera.zoom });
    const from = screen(start.graph.joints.g6kFted7Nm.position);
    await p.mouse.move(from.x, from.y); await p.mouse.down();
    const grabbed = await read(); const samples = [];
    for (const target of [{ x: 600, y: 200 }, { x: 400, y: 100 }, { x: 100, y: -50 }]) {
      const to = screen(target); await p.mouse.move(to.x, to.y, { steps: 30 });
      for (let i = 0; i < 12; i++) { await p.waitForTimeout(250); const s = await read(); samples.push(s); }
    }
    await p.screenshot({ path: join(output, `${id}-held.png`) }); await p.mouse.up();
    await writeFile(join(output, `${id}.json`), JSON.stringify({ start, grabbed, samples }, null, 2));
    const data = samples.map(s => ({ time: s.simulation.time, error: s.simulation.stepError, signedSpread: s.graph.joints.XlD7YOWwBk.position.x - s.graph.joints['9hUW_8pccU'].position.x,
      handle: s.graph.joints.g6kFted7Nm.position, residual: s.simulation.solverResult?.residual }));
    console.log(JSON.stringify({ id, grabbed: grabbed.editor.simDrag, samples: data })); await c.close();
  }
} finally { await b.close(); }
console.log(output);
