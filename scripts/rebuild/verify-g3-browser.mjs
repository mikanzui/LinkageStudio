import { chromium, webkit } from '../../.rebuild.local/tooling/node_modules/playwright/index.mjs';
import assert from 'node:assert/strict';
import { mkdir, mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { candidateFingerprint, assertCandidateBuild } from './candidate-fingerprint.mjs';
const root = fileURLToPath(new URL('../../', import.meta.url));
const sourceStart = await candidateFingerprint();
const engine = process.argv[2] ?? 'chromium';
const parent = join(root, '.rebuild.local/evidence/g3'); await mkdir(parent, { recursive: true });
const output = await mkdtemp(join(parent, `${engine}-workflow-`));
const { archive } = JSON.parse(await readFile(join(root, '.rebuild.local/runtimes.json'), 'utf8'));
const browser = engine === 'webkit' ? await webkit.launch() : await chromium.launch({ channel: 'chrome' });
const results = [];
const distance = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
function metrics(state, initial) {
  const { joints, links, bodies, baseBodyId, sliders } = state.graph;
  let relativeError = 0, coincidenceError = 0, sliderError = 0, fixedDrift = 0;
  for (const l of Object.values(links)) {
    const e = Math.abs(distance(joints[l.jointIds[0]].position, joints[l.jointIds[1]].position) - l.restLength);
    if (l.restLength === 0) coincidenceError = Math.max(coincidenceError, e); else relativeError = Math.max(relativeError, e / l.restLength);
  }
  for (const s of Object.values(sliders)) {
    const a = joints[s.jointIdA].position, b = joints[s.jointIdB].position, c = joints[s.jointIdC].position;
    const dx = c.x-a.x, dy = c.y-a.y, length = Math.hypot(dx,dy), t = ((b.x-a.x)*dx+(b.y-a.y)*dy)/(length*length);
    sliderError = Math.max(sliderError, Math.abs((b.x-a.x)*dy-(b.y-a.y)*dx)/length, Math.max(0,-t,t-1)*length);
  }
  for (const id of bodies[baseBodyId].jointIds) fixedDrift = Math.max(fixedDrift, distance(joints[id].position, initial.graph.joints[id].position));
  let openingAngle = null, spread = null;
  if (joints.XlD7YOWwBk) {
    const a = joints['9hUW_8pccU'].position, c = joints.XlD7YOWwBk.position, apex = joints['7GbfNIkT2-'].position;
    const ax=a.x-apex.x,ay=a.y-apex.y,cx=c.x-apex.x,cy=c.y-apex.y;
    openingAngle = Math.acos(Math.max(-1,Math.min(1,(ax*cx+ay*cy)/(Math.hypot(ax,ay)*Math.hypot(cx,cy)))))*180/Math.PI;
    spread = distance(a,c);
  }
  return { relativeError, coincidenceError, sliderError, fixedDrift, openingAngle, spread };
}
try {
  for (const touch of engine === 'webkit' ? [false] : [false, true]) {
    const context = await browser.newContext({ viewport: { width: touch ? 1024 : 1440, height: touch ? 1366 : 1000 }, hasTouch: touch, isMobile: touch, serviceWorkers: 'block', acceptDownloads: true });
    await context.addInitScript(() => Object.defineProperty(window, 'showSaveFilePicker', { configurable: true, value: undefined }));
    const page = await context.newPage(); page.setDefaultTimeout(10000); const errors = [];
    page.on('pageerror', e => errors.push(e.message)); page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
    page.on('dialog', d => d.accept(d.type() === 'prompt' ? 'g3-roundtrip.slinker' : undefined));
    const activate = locator => touch ? locator.tap() : locator.click();
    const acceptDirtyOpen = async () => {
      const unsaved = page.getByRole('dialog', { name: 'Unsaved Changes', exact: true });
      if (await unsaved.isVisible()) await activate(unsaved.getByRole('button', { name: 'Discard and open', exact: true }));
    };
    const cdp = touch ? await context.newCDPSession(page) : null;
    const read = () => page.evaluate(() => ({ graph: __LINKAGE_G0_READ__.mechanism(), editor: __LINKAGE_G0_READ__.editor(), simulation: __LINKAGE_G0_READ__.simulation() }));
    const mode = async name => { const expanded = page.getByRole('button', { name, exact: true }); await activate(await expanded.isVisible() ? expanded : page.getByTitle(`${name} mode`, { exact: true })); };
    const open = async file => { const picker = page.waitForEvent('filechooser'); await activate(page.getByRole('button', { name: 'Open', exact: true })); await acceptDirtyOpen(); await (await picker).setFiles(file); await page.waitForFunction(() => document.querySelector('.top-bar').getAttribute('aria-busy') === 'false'); };
    try {
      await page.goto((process.argv[3] ?? process.env.LINKAGE_CANDIDATE_URL ?? 'http://127.0.0.1:5183/linkage-studio/'));
      await assertCandidateBuild(page, sourceStart);
      for (const title of ['Collapse toolbar', 'Collapse panel']) {
        const collapse = page.getByTitle(title, { exact: true });
        if (await collapse.isVisible()) await activate(collapse);
      }
      for (const fixture of ['airer.slinker', 'working-screen.json']) {
        await open(join(archive, 'fixtures', fixture));
        const handle = fixture.startsWith('airer') ? 'g6kFted7Nm' : '0oYLG5yu-0';
        let reopened;
        for (let repetition = 0; repetition < 2; repetition++) {
          if (repetition) await open(reopened);
          // Camera setup uses real wheel/middle input, not store writes. Touch pan/pinch
          // gets separate G4 qualification; this run's trusted touch action is the pull.
          let rect = await page.locator('canvas').boundingBox(); await page.mouse.move(rect.x+rect.width/2,rect.y+rect.height/2);
          for(let z=0;z<4;z++){ await page.mouse.wheel(0,100); await page.waitForTimeout(20); }
          let state=await read(); const desired={x:rect.width/2-700*state.editor.camera.zoom,y:rect.height/2-400*state.editor.camera.zoom};
          const dx=desired.x-state.editor.camera.pan.x,dy=desired.y-state.editor.camera.pan.y,n=Math.max(1,Math.ceil(Math.abs(dx)/(rect.width*.3)),Math.ceil(Math.abs(dy)/(rect.height*.3)));
          for(let k=0;k<n;k++){await page.mouse.move(rect.x+rect.width/2,rect.y+rect.height/2);await page.mouse.down({button:'middle'});await page.mouse.move(rect.x+rect.width/2+dx/n,rect.y+rect.height/2+dy/n,{steps:8});await page.mouse.up({button:'middle'});}
          const design=await read(); await mode('Simulate'); await page.waitForTimeout(150); const initial=await read();
          rect=await page.locator('canvas').boundingBox(); const cam=initial.editor.camera;
          const screen=p=>({x:rect.x+cam.pan.x+p.x*cam.zoom,y:rect.y+cam.pan.y+p.y*cam.zoom});
          let previous=screen(initial.graph.joints[handle].position); const samples=[];
          if(cdp)await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{...previous,id:1}]});else{await page.mouse.move(previous.x,previous.y);await page.mouse.down();}
          const grabbed=await read(); assert.equal(grabbed.editor.simDrag?.jointId,handle);
          const targets=fixture.startsWith('airer')?[{x:600,y:200},{x:400,y:100},{x:100,y:-50}]:[{x:625,y:325}];
          for(const target of targets){
            const to=screen(target);assert(to.x>rect.x&&to.x<rect.x+rect.width&&to.y>rect.y&&to.y<rect.y+rect.height,'drag target in canvas');
            for(let step=1;step<=20;step++){
              const point={x:previous.x+(to.x-previous.x)*step/20,y:previous.y+(to.y-previous.y)*step/20};
              if(cdp)await cdp.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{...point,id:1}]});else await page.mouse.move(point.x,point.y);
              await page.waitForTimeout(30);samples.push(await read());
            }
            for(let hold=0;hold<16;hold++){await page.waitForTimeout(100);samples.push(await read());}
            previous=to;
          }
          const held=await read();await page.screenshot({path:join(output,`${touch?'touch':'mouse'}-${fixture}-${repetition}-held.png`)});
          if(cdp)await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});else await page.mouse.up();
          await page.waitForTimeout(200);const released=await read();samples.push(released);
          const measured=samples.map(s=>metrics(s,initial));
          await writeFile(join(output,`${touch?'touch':'mouse'}-${fixture}-${repetition}-raw.json`),JSON.stringify({design,initial,grabbed,held,released,samples,measured},null,2));
          for(let i=0;i<samples.length;i++){
            assert.equal(samples[i].simulation.stepError,null);const m=measured[i];
            assert(m.relativeError<1e-3,`relative error ${m.relativeError}`);assert(m.coincidenceError<.1,`coincidence ${m.coincidenceError}`);
            assert(m.sliderError<.1,`slider error ${m.sliderError}`);assert(m.fixedDrift<1e-8);
          }
          const final=metrics(held,initial),travel=distance(held.graph.joints[handle].position,initial.graph.joints[handle].position);
          assert(travel>30);if(fixture.startsWith('airer')){assert(final.openingAngle>=30&&final.openingAngle<=60);assert(final.spread>300);assert.equal(held.simulation.dof,1);}
          await mode('Create');assert.deepEqual((await read()).graph,design.graph);
          if(!repetition){const event=page.waitForEvent('download');await activate(page.getByRole('button',{name:'Save',exact:true}));const download=await event;reopened=join(output,`${touch?'touch':'mouse'}-${fixture}`);await download.saveAs(reopened);}
          const summary={touch,fixture,repetition,passed:true,travel,...final,maxRelativeError:Math.max(...measured.map(m=>m.relativeError)),errors};results.push(summary);console.log(JSON.stringify(summary));
          await writeFile(join(output,`${touch?'touch':'mouse'}-${fixture}-${repetition}.json`),JSON.stringify({design,initial,grabbed,held,released,samples,measured,summary},null,2));
        }
      }
      assert.equal(errors.length,0,errors.join('\n'));
    }catch(error){results.push({touch,passed:false,error:error.stack,errors});await page.screenshot({path:join(output,`${touch?'touch':'mouse'}-FAILED.png`)});console.log(JSON.stringify(results.at(-1)));}
    finally{await context.close();}
  }
}finally{await browser.close();}
const sourceEnd = await candidateFingerprint();
if (sourceEnd.sourceSha256 !== sourceStart.sourceSha256) results.push({ passed: false, error: 'Candidate source changed during test run.' });
await writeFile(join(output,'report.json'),JSON.stringify({sourceStart,sourceEnd,engine,browser:browser.version(),results,physicalIPadVerified:false},null,2));
console.log(JSON.stringify({output,passed:results.every(r=>r.passed)}));if(results.some(r=>!r.passed))process.exitCode=1;
