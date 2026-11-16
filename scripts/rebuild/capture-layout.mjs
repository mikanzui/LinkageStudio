import { chromium } from '../../.rebuild.local/tooling/node_modules/playwright/index.mjs';
import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';

const root = fileURLToPath(new URL('../../', import.meta.url));
const { targets, archive } = JSON.parse(await readFile(join(root, '.rebuild.local/runtimes.json'), 'utf8'));
const output = join(root, '.rebuild.local/evidence/g0/layout');
await mkdir(output, { recursive: true });
const browser = await chromium.launch({ channel:'chrome', headless:true });
try {
  for (const id of ['upstream', 'local']) {
    const target = targets.find((target) => target.id === id);
    const context = await browser.newContext({ viewport:{width:1440,height:1000}, serviceWorkers:'block' });
    const page = await context.newPage();
    page.setDefaultTimeout(10000);
    await page.goto(target.url);
    const picker = page.waitForEvent('filechooser');
    await page.getByRole('button',{name:id==='local'?'Open Local File':'Open',exact:true}).click();
    await (await picker).setFiles(join(archive,'fixtures/airer.slinker'));
    await page.waitForFunction(()=>Object.values(globalThis.__LINKAGE_G0_READ__.mechanism().joints).filter(j=>!j.hidden).length===27);
    await page.locator('.splash-screen').waitFor({state:'detached'});
    await page.screenshot({path:join(output,`${id}-design.png`)});
    await page.getByRole('button',{name:'Simulate',exact:true}).click();
    await page.waitForTimeout(250);
    const feedback = await page.evaluate(()=>{
      const el=document.querySelector('.panel-step-error-banner');
      const r=el?.getBoundingClientRect();
      const parent=el?.closest('.right-panel');
      return { message:el?.textContent??null, rect:r?{top:r.top,bottom:r.bottom,left:r.left,right:r.right}:null,
        visibleInViewport:!!r&&r.top<innerHeight&&r.bottom>0, panelScrollHeight:parent?.scrollHeight??null,
        physicsTextPresent:document.body.innerText.includes('PHYSICS') };
    });
    await page.screenshot({path:join(output,`${id}-error-default.png`)});
    let collapseActions=0;
    if(id==='local') {
      while(await page.getByTitle('Hide body contents',{exact:true}).count()) {
        await page.getByTitle('Hide body contents',{exact:true}).first().click();
        if(++collapseActions>20)throw new Error('Body collapse loop exceeded fixture body count');
      }
    }
    await page.screenshot({path:join(output,`${id}-compact-bodies.png`)});
    const after = await page.locator('.panel-step-error-banner').count()
      ? await page.locator('.panel-step-error-banner').boundingBox() : null;
    await writeFile(join(output,`${id}.json`),JSON.stringify({id,feedback,collapseActions,after,
      bodyText:await page.locator('body').innerText()},null,2));
    console.log(JSON.stringify({id,feedback,collapseActions,after},null,2));
    await context.close();
  }
} finally { await browser.close(); }
