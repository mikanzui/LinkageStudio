import { chromium } from '../../.rebuild.local/tooling/node_modules/playwright/index.mjs';
import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';

const root = fileURLToPath(new URL('../../', import.meta.url));
const { targets, archive } = JSON.parse(await readFile(join(root, '.rebuild.local/runtimes.json'), 'utf8'));
const output = join(root, '.rebuild.local/evidence/g0/fixtures');
await mkdir(output, { recursive: true });
const browser = await chromium.launch({ channel: 'chrome', headless: true });
try {
  for (const target of targets.filter((target) => target.id !== 'candidate')) {
    for (const fixture of ['airer', 'working-screen']) {
      const context = await browser.newContext({ viewport: { width: 1440, height: 1000 }, serviceWorkers: 'block' });
      const page = await context.newPage();
      page.setDefaultTimeout(10000);
      const errors = [];
      page.on('pageerror', (error) => errors.push({ type: 'pageerror', message: error.message }));
      page.on('console', (message) => {
        if (message.type() === 'error') errors.push({ type: 'console', message: message.text() });
      });
      page.on('dialog', (dialog) => dialog.dismiss());
      await page.goto(target.url);
      const fileChooser = page.waitForEvent('filechooser');
      await page.getByRole('button', { name: target.id.startsWith('local') ? 'Open Local File' : 'Open', exact: true }).click();
      await (await fileChooser).setFiles(join(archive, `fixtures/${fixture === 'airer' ? 'airer.slinker' : 'working-screen.json'}`));
      await page.waitForFunction(() => Object.keys(globalThis.__LINKAGE_G0_READ__.mechanism().joints).length > 10);
      await page.locator('.splash-screen').waitFor({ state: 'detached' });
      const read = () => page.evaluate(() => ({
        build: JSON.parse(document.querySelector('meta[name="linkage-g0-build"]').content),
        mechanism: globalThis.__LINKAGE_G0_READ__.mechanism(),
        editor: globalThis.__LINKAGE_G0_READ__.editor(),
        simulation: globalThis.__LINKAGE_G0_READ__.simulation(),
        canvas: (() => {
          const c = document.querySelector('canvas'); const r = c.getBoundingClientRect();
          return { left: r.left, top: r.top, width: r.width, height: r.height, backingWidth: c.width, backingHeight: c.height };
        })(),
      }));
      const design = await read();
      await page.screenshot({ path: join(output, `${target.id}-${fixture}-design.png`) });
      await page.getByRole('button', { name: 'Simulate', exact: true }).click();
      await page.waitForTimeout(1000);
      const simulate = await read();
      await page.screenshot({ path: join(output, `${target.id}-${fixture}-simulate.png`) });
      const record = { target: target.id, fixture, browser: browser.version(), design, simulate, errors };
      await writeFile(join(output, `${target.id}-${fixture}.json`), JSON.stringify(record, null, 2));
      console.log(JSON.stringify({ target: target.id, fixture,
        designLinks: Object.keys(design.mechanism.links).length,
        simulateLinks: Object.keys(simulate.mechanism.links).length,
        simulateTime: simulate.simulation.time, error: simulate.simulation.stepError,
        errors: errors.slice(0, 5),
      }));
      await context.close();
    }
  }
} finally {
  await browser.close();
}
