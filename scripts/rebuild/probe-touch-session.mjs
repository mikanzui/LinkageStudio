import { chromium } from '../../.rebuild.local/tooling/node_modules/playwright/index.mjs';
import { mkdir, mkdtemp, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
const browser = await chromium.launch(process.env.REBUILD_BUNDLED_CHROMIUM ? {} : { channel: 'chrome' });
const parent = '.rebuild.local/evidence/g4'; await mkdir(parent, { recursive: true });
const output = await mkdtemp(join(parent, 'native-touch-probe-')), results = [];
try {
 for (const zoomLocked of [false, true]) for (const mixed of [false, true]) for (const cancelPointer of [false, true]) {
  const context = await browser.newContext({ hasTouch: true, isMobile: true, deviceScaleFactor: 2, viewport: { width: 1024, height: 1366 } });
  const page = await context.newPage();
  await page.setContent('<meta name="viewport"><canvas style="width:800px;height:900px;touch-action:none"></canvas><button>Native</button>');
  await page.evaluate(({ zoomLocked, cancelPointer }) => {
    document.querySelector('meta').content = 'width=device-width, initial-scale=1' + (zoomLocked ? ', maximum-scale=1, user-scalable=no' : '');
    const canvas = document.querySelector('canvas');
    canvas.onpointerdown = e => { if (cancelPointer) e.preventDefault(); canvas.setPointerCapture(e.pointerId); };
    canvas.onpointermove = e => { if (cancelPointer) e.preventDefault(); };
    canvas.onpointerup = e => canvas.releasePointerCapture(e.pointerId);
    document.querySelector('button').onclick = e => e.currentTarget.textContent = 'Activated';
  }, { zoomLocked, cancelPointer });
  await page.waitForTimeout(100);
  const cdp = await context.newCDPSession(page);
  const send = (type, touchPoints) => cdp.send('Input.dispatchTouchEvent', { type, touchPoints });
  await send('touchStart', [{ x: 100, y: 100, id: 21 }]);
  for (let i = 1; i <= 6; i++) { await send('touchMove', [{ x: 100 + i * 10, y: 100 + i * 10, id: 21 }]); await page.waitForTimeout(20); }
  if(process.env.REBUILD_HOLD_TOUCH)await page.waitForTimeout(300);
  await send('touchEnd', []);
  if(process.env.REBUILD_SETTLED_TOUCH)await page.waitForTimeout(1000);
  if (mixed) await page.getByRole('button').tap();
  else { const r = await page.getByRole('button').boundingBox(); await send('touchStart', [{ x: r.x + r.width / 2, y: r.y + r.height / 2, id: 22 }]); await send('touchEnd', []); }
  await page.waitForTimeout(100);
  results.push({ zoomLocked, mixed, cancelPointer, activated: await page.getByRole('button').textContent() === 'Activated' });
  await context.close();
 }
} finally { await browser.close(); }
await writeFile(join(output, 'report.json'), JSON.stringify({ results }, null, 2));
console.log(JSON.stringify({ output, results }));
