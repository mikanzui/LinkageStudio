import { chromium } from '../../.rebuild.local/tooling/node_modules/playwright/index.mjs';
import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';

const root = fileURLToPath(new URL('../../', import.meta.url));
const { targets } = JSON.parse(await readFile(join(root, '.rebuild.local/runtimes.json'), 'utf8'));
const output = join(root, '.rebuild.local/evidence/g0/entry');
await mkdir(output, { recursive: true });
const browser = await chromium.launch({ channel: 'chrome', headless: true });
try {
  for (const target of targets) {
    const context = await browser.newContext({ viewport: { width: 1440, height: 1000 }, serviceWorkers: 'block' });
    const page = await context.newPage();
    page.setDefaultTimeout(10000);
    const errors = [];
    page.on('pageerror', (error) => errors.push(error.message));
    await page.goto(target.url);
    await page.waitForSelector('button');
    await page.locator('.splash-screen').waitFor({ state: 'detached' });
    const result = await page.evaluate(() => ({
      title: document.title,
      url: location.href,
      build: JSON.parse(document.querySelector('meta[name="linkage-g0-build"]').content),
      observedStores: Object.keys(globalThis.__LINKAGE_G0_READ__ ?? {}),
      buttons: [...document.querySelectorAll('button')].map((button) => ({
        text: button.innerText, title: button.title, disabled: button.disabled,
      })),
      body: document.body.innerText,
    }));
    result.errors = errors;
    await page.screenshot({ path: join(output, `${target.id}.png`) });
    await writeFile(join(output, `${target.id}.json`), JSON.stringify(result, null, 2));
    console.log(JSON.stringify({ id: target.id, ...result }, null, 2));
    await context.close();
  }
} finally {
  await browser.close();
}
