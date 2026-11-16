import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { readFile, writeFile, mkdir, mkdtemp } from 'node:fs/promises';
import { join, resolve, extname, sep } from 'node:path';
import { pathToFileURL, fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import { resolveBrowserPaths } from './source-paths.mjs';
import { prepareBrowser } from './prepare-browser.mjs';
import { candidateFingerprint, assertCandidateBuild } from './candidate-fingerprint.mjs';

process.env.LINKAGE_CLOUD_MOCK='0';
const paths=resolveBrowserPaths(),engine=process.argv[2]??'chromium';assert(['chromium','webkit','firefox'].includes(engine));
// Only config/tooling are needed: this public synthetic smoke never claims original-fixture coverage.
await prepareBrowser({requireFixtures:false,requireTooling:true});
const {chromium,webkit,firefox}=await import(pathToFileURL(join(paths.root,'.rebuild.local/tooling/node_modules/playwright/index.mjs')).href);
const {build}=await import(pathToFileURL(join(paths.candidate,'node_modules/vite/dist/node/index.js')).href);
const sourceStart=await candidateFingerprint();
const parent=join(paths.root,'.rebuild.local/evidence/g10');await mkdir(parent,{recursive:true});
const output=await mkdtemp(join(parent,`${engine}-production-`));
const harness=await readFile(fileURLToPath(import.meta.url));await writeFile(join(output,'harness.mjs'),harness);
const pkg=JSON.parse(await readFile(join(paths.candidate,'package.json'),'utf8'));
const artifacts=[];
for(const label of ['a','b']){
  const outDir=join(output,'build-'+label);
  await build({configFile:paths.config,define:{__APP_VERSION__:JSON.stringify(pkg.version+'-update-probe-'+label)},build:{outDir,emptyOutDir:false}});
  artifacts.push({label,outDir,swSha256:createHash('sha256').update(await readFile(join(outDir,'sw.js'))).digest('hex')});
}
assert.notEqual(artifacts[0].swSha256,artifacts[1].swSha256,'Actual old/new worker scripts differ');
const indexA=await readFile(join(artifacts[0].outDir,'index.html'),'utf8'),manifest=JSON.parse(await readFile(join(artifacts[0].outDir,'manifest.webmanifest'),'utf8'));
const baseMatch=indexA.match(/href="([^" ]+)manifest\.webmanifest"/);assert(baseMatch,'Built manifest URL');const base=baseMatch[1];assert.equal(base,'/LinkageStudio/','Exact real repository path/case');
assert(!indexA.includes('registerSW.js'),'No automatic injected worker reload handler');
assert(manifest.icons.some(i=>i.src.endsWith('icon-192.png')&&i.type==='image/png'));assert(manifest.icons.some(i=>i.src.endsWith('icon-512.png')&&i.purpose.includes('maskable')));
for(const [name,size]of [['icon-192.png',192],['icon-512.png',512],['apple-touch-icon.png',180]]){const data=await readFile(join(artifacts[0].outDir,name));assert.equal(data.readUInt32BE(16),size);assert.equal(data.readUInt32BE(20),size);}
const seed=JSON.stringify({version:'0.12.3',projectName:'Production design',joints:{a:{id:'a',type:'fixed',position:{x:200,y:120},connectedLinkIds:['rod']},b:{id:'b',type:'revolute',position:{x:260,y:223.92304845413264},connectedLinkIds:['rod']}},links:{rod:{id:'rod',jointIds:['a','b'],restLength:120,mass:1}},bodies:{base:{id:'base',name:'Base',jointIds:['a'],color:'#e53935'},rod:{id:'rod',name:'Rod',jointIds:['a','b'],color:'#4caf50'}},baseBodyId:'base',outlines:{},images:{},sliders:{},colliders:{},tracers:{trace:{id:'trace',name:'Soak trace',bodyId:'rod',localPosition:{x:10,y:20},enabled:true}},simulationSettings:{gravityEnabled:true,gravityStrength:250,damping:process.argv.includes('--soak')?1:0,dragMultiplier:25,dragDamping:.25}});
const mime={'.html':'text/html','.js':'application/javascript','.css':'text/css','.png':'image/png','.svg':'image/svg+xml','.webmanifest':'application/manifest+json','.json':'application/json'};
let phase=0;const requests=[];
const server=createServer(async(req,res)=>{
  try{
    const url=new URL(req.url,'http://localhost');requests.push({path:url.pathname,phase});
    if(!url.pathname.startsWith(base)){res.writeHead(404);res.end('Not found');return;}
    const name=decodeURIComponent(url.pathname.slice(base.length))||'index.html';
    if(name.includes('\\')||name.split('/').some(s=>s==='..')){res.writeHead(400);res.end();return;}
    let bytes;
    for(const index of phase===0?[0]:[1,0]){
      const path=resolve(artifacts[index].outDir,name);if(!path.startsWith(artifacts[index].outDir+sep))throw new Error('Outside artifact');
      try{bytes=await readFile(path);break;}catch{}
    }
    if(!bytes){res.writeHead(404);res.end('Not found');return;}
    res.writeHead(200,{'Content-Type':mime[extname(name)]??'application/octet-stream','Cache-Control':'no-store'});res.end(bytes);
  }catch{res.writeHead(500);res.end();}
});
await new Promise(r=>server.listen(0,'127.0.0.1',r));const url=`http://127.0.0.1:${server.address().port}${base}`;
const browser=await({chromium,webkit,firefox}[engine]).launch({headless:true,...(engine==='chromium'&&!process.argv.includes('--bundled-chromium')?{channel:'chrome'}:{})});
const results=[],errors=[];let failure;
let activePage;
async function check(name,work){await work();results.push({name,passed:true});console.log(JSON.stringify({check:name,passed:true}));}
try{
  const context=await browser.newContext({viewport:{width:1024,height:900},hasTouch:engine!=='firefox',isMobile:engine!=='firefox',deviceScaleFactor:2,serviceWorkers:'allow',acceptDownloads:true});
  await context.addInitScript(suppressNativePicker=>{
    if(suppressNativePicker){const click=HTMLInputElement.prototype.click;HTMLInputElement.prototype.click=function(){if(this.type!=='file')return Reflect.apply(click,this,[]);};}
    globalThis.__testFileEvents=[];
    for(const type of ['change','cancel'])document.addEventListener(type,event=>{if(event.target instanceof HTMLInputElement&&event.target.type==='file')globalThis.__testFileEvents.push({type,files:event.target.files?.length??0,time:performance.now()});},true);
    Object.defineProperty(window,'showSaveFilePicker',{configurable:true,value:undefined});
    const put=IDBObjectStore.prototype.put;
    IDBObjectStore.prototype.put=function(...args){if(globalThis.__testRecoveryQuota&&this.name==='draft-text')throw new DOMException('Injected quota','QuotaExceededError');return Reflect.apply(put,this,args);};
  },engine==='firefox');
  const page=await context.newPage();activePage=page;page.setDefaultTimeout(15000);page.on('pageerror',e=>errors.push(e.message));page.on('dialog',d=>d.type()==='beforeunload'?d.accept():d.type()==='prompt'?d.accept(d.defaultValue()):d.dismiss());
  const click=el=>engine==='firefox'?el.click():el.tap();
  const button=name=>page.getByRole('button',{name,exact:true});
  const read=()=>page.evaluate(()=>({graph:__LINKAGE_G0_READ__.mechanism(),editor:__LINKAGE_G0_READ__.editor(),simulation:__LINKAGE_G0_READ__.simulation(),project:__LINKAGE_G0_READ__.project()}));
  const poll=async(fn,description)=>{const started=Date.now();while(Date.now()-started<20000){if(await fn())return;await page.waitForTimeout(80);}assert.fail(description);};
  const open=async()=>{const file={name:'production.slinker',mimeType:'application/json',buffer:Buffer.from(seed)};if(engine==='firefox'){await click(button('Open'));await page.locator('input[type=file]').setInputFiles(file);}else{const pending=page.waitForEvent('filechooser').then(chooser=>chooser.setFiles(file));await click(button('Open'));await pending;}await poll(async()=>(await read()).editor.projectName==='Production design','Local file import');};
  const rename=async name=>{await click(page.getByTitle('Rename project',{exact:true}));const field=page.getByRole('textbox',{name:'Project name',exact:true});await field.fill(name);await field.press('Enter');};
  const mode=async name=>{const expanded=button(name);await click(await expanded.isVisible()?expanded:page.getByTitle(name+' mode',{exact:true}));};
  await check('cold-production-case-assets-and-worker',async()=>{
    assert.equal((await page.goto(url)).status(),200);await assertCandidateBuild(page,sourceStart);await page.locator('canvas').waitFor();
    assert.match(await page.locator('.top-bar-brand').innerText(),/update-probe-a/);
    await page.evaluate(()=>navigator.serviceWorker.ready);await page.reload();await poll(()=>page.evaluate(()=>!!navigator.serviceWorker.controller),'Worker controls warm navigation');
    const wrong=await context.request.get(url.replace('/LinkageStudio/','/linkage-studio/'));assert.equal(wrong.status(),404);
    const bridge=await context.request.get(url+'redirect.html');assert.equal(bridge.status(),200);assert.equal(bridge.headers()['cross-origin-opener-policy'],undefined);assert(!/src\/main|assets\/main-/.test(await bridge.text()),'Auth bridge does not load the editor');
  });
  await check('coauthor-credit-links-layout-and-no-model-tag',async()=>{
    await page.locator('.panel-collapsed').first().waitFor();
    const expand=button('Expand toolbar'),compact=await expand.isVisible();if(compact)await click(expand);
    const credit=page.getByText('Coauthored by',{exact:false});await credit.waitFor();await credit.scrollIntoViewIfNeeded();
    assert.equal((await credit.innerText()).replace(/\\s+/g,' ').trim(),'Coauthored by Jake Whiting and Hugo Wilson');
    assert.equal(await page.getByRole('link',{name:'Jake Whiting',exact:true}).getAttribute('href'),'https://github.com/mikanzui');
    assert.equal(await page.getByRole('link',{name:'Hugo Wilson',exact:true}).getAttribute('href'),'https://github.com/Huggabiz/linkage-studio');
    assert(!/Claude Opus|VibeCoded by/.test(await page.locator('body').innerText()));
    assert(await credit.evaluate(el=>el.scrollWidth<=el.clientWidth),'Credit wraps within the toolbar');
    await page.screenshot({path:join(output,'coauthor-credits.png')});
    if(compact)await click(button('Collapse toolbar'));
  });
  await check('offline-reload-local-open-save-and-canvas',async()=>{
    await context.setOffline(true);await page.reload();await page.locator('canvas').waitFor();await open();
    const callback=await context.newPage();const response=await callback.goto(url+'redirect.html?probe=1').catch(()=>null);assert(response===null||response.status()>=400,'An offline auth callback with a query must not receive the SPA index fallback');await callback.close();await page.bringToFront();
    const before=await read();await mode('Simulate');await page.waitForTimeout(1000);const moving=await read();assert.equal(moving.simulation.stepError,null);assert(Math.hypot(moving.graph.joints.b.position.x-before.graph.joints.b.position.x,moving.graph.joints.b.position.y-before.graph.joints.b.position.y)>2);await mode('Create');assert.deepEqual((await read()).graph,before.graph);
    const download=page.waitForEvent('download');await click(button('Save'));const file=await download;const path=join(output,'offline-save.slinker');await file.saveAs(path);assert.equal(JSON.parse(await readFile(path,'utf8')).projectName,'Production design');
    const pixels=await page.locator('canvas').evaluate(canvas=>{const data=canvas.getContext('2d').getImageData(0,0,canvas.width,canvas.height).data;let ink=0;for(let i=0;i<data.length;i+=4)if(data[i+1]>data[i]+25&&data[i+1]>data[i+2]+10)ink++;return ink;});assert(pixels>50,'Mechanism produces real colored canvas pixels offline');
    await page.screenshot({path:join(output,'offline-canvas.png')});await context.setOffline(false);
  });
  await check('all-seven-examples-precached-and-open-offline-without-cloud',async()=>{
    const catalog=JSON.parse(await readFile(join(paths.candidate,'examples/catalog.json'),'utf8'));
    // No gallery asset has been requested by the page: prove the worker cached
    // the built source bytes before any opportunistic online example download.
    await context.setOffline(true);
    for(const example of catalog){
      const expected=await readFile(join(paths.candidate,'examples',example.filename),'utf8');
      const text=await page.evaluate(async filename=>{const response=await fetch(new URL('examples/'+filename,document.baseURI));if(!response.ok)throw new Error('Uncached example');return response.text();},example.filename);
      assert.equal(text,expected,'Exact offline bytes '+example.filename);
      await click(button('Projects'));await click(page.getByRole('tab',{name:'Examples',exact:true}));
      await click(page.locator(`input[name="example-project"][value="${example.id}"]`));await click(button('Open example'));
      await page.getByRole('dialog',{name:'Projects',exact:true}).waitFor({state:'hidden'});
      assert(Object.keys((await read()).graph.bodies).length>1);
    }
    await page.screenshot({path:join(output,'offline-projects-example.png')});
    // Leave the original synthetic seed and Projects' default view for the
    // unchanged dirty-update/rotation assertions below.
    await open();await click(button('Projects'));await click(page.getByRole('tab',{name:'My projects',exact:true}));await click(button('Close projects'));await context.setOffline(false);
  });
  await rename('Dirty update sentinel');const original=(await read()).graph;const peer=await context.newPage();peer.on('dialog',d=>d.type()==='beforeunload'?d.accept():d.dismiss());await peer.goto(url);await peer.locator('canvas').waitFor();
  await peer.waitForTimeout(500);const peerRecovery=peer.getByRole('button',{name:'Close recovery',exact:true});if(await peerRecovery.isVisible())await(engine==='firefox'?peerRecovery.click():peerRecovery.tap());
  const peerName=peer.getByTitle('Rename project',{exact:true});await(engine==='firefox'?peerName.click():peerName.tap());await peer.getByRole('textbox',{name:'Project name',exact:true}).fill('Other tab unsaved');await peer.getByRole('textbox',{name:'Project name',exact:true}).press('Enter');
  let navigations=0,peerNavigations=0;page.on('framenavigated',frame=>{if(frame===page.mainFrame())navigations++;});peer.on('framenavigated',frame=>{if(frame===peer.mainFrame())peerNavigations++;});
  await check('waiting-update-never-reloads-dirty-tabs',async()=>{
    phase=1;await page.evaluate(async()=>{const reg=await navigator.serviceWorker.getRegistration();await reg.update();});
    await button('Update available').waitFor();await page.waitForTimeout(1000);assert.equal(navigations,0);assert.equal(peerNavigations,0);assert.equal((await read()).editor.projectName,'Dirty update sentinel');
    await click(button('Update available'));const modal=page.getByRole('dialog',{name:'Update Available',exact:true});await modal.waitFor();await click(modal.getByRole('button',{name:'Later',exact:true}));assert.equal(navigations,0);
  });
  await check('quota-refuses-update-and-exact-recovery-allows-restart',async()=>{
    await click(button('Update available'));const modal=page.getByRole('dialog',{name:'Update Available',exact:true});await page.evaluate(()=>{globalThis.__testRecoveryQuota=true;});
    await click(modal.getByRole('button',{name:'Restart with recovery',exact:true}));await poll(()=>modal.getByRole('status').innerText().then(t=>/could not be confirmed/.test(t)),'Quota refusal visible');assert.equal(navigations,0);assert.deepEqual((await read()).graph,original);
    await page.evaluate(()=>{globalThis.__testRecoveryQuota=false;});await click(modal.getByRole('button',{name:'Restart with recovery',exact:true}));await page.getByRole('dialog',{name:'Recovery Drafts',exact:true}).waitFor();
    assert.match(await page.locator('.top-bar-brand').innerText(),/update-probe-b/);assert(navigations>0);assert.equal(peerNavigations,0,'Other dirty tab must not reload on controllerchange');
    assert.equal(await peer.getByTitle('Rename project',{exact:true}).innerText(),'Other tab unsaved');
    const recovery=page.getByRole('dialog',{name:'Recovery Drafts',exact:true});await click(recovery.locator('.recovery-list label').filter({hasText:'Dirty update sentinel'}));await click(recovery.getByRole('button',{name:'Restore copy',exact:true}));await recovery.waitFor({state:'hidden'});assert.equal((await read()).editor.projectName,'Dirty update sentinel');assert.deepEqual((await read()).graph,original);assert.equal((await read()).project.dirty,true);
  });
  await check('split-keyboard-height-and-rotation-modal-reachability',async()=>{
    await page.setViewportSize({width:512,height:440});await click(button('Projects'));const modal=page.getByRole('dialog',{name:'Projects',exact:true});await modal.waitFor();
    await poll(async()=>{const b=await modal.boundingBox();return b.y>=0&&b.y+b.height<=440.5;},'Dialog fits shortened visual viewport');
    await modal.getByRole('textbox',{name:'Cloud file name'}).focus();await page.keyboard.type(' keyboard');await page.keyboard.press('Escape');await modal.waitFor({state:'hidden'});
    await page.setViewportSize({width:1366,height:1024});assert.deepEqual((await read()).graph,original);await page.screenshot({path:join(output,'rotated-canvas.png')});
  });
  if(process.argv.includes('--soak'))await check('ten-minute-owned-motion-and-bounded-traces',async()=>{
    // A fresh context avoids a second tab's RAF throttling contaminating this timed run.
    await peer.close();await page.bringToFront();await mode('Simulate');const start=Date.now(),samples=[];
    while(Date.now()-start<600_000){await page.waitForTimeout(1000);const s=await read(),a=s.graph.joints.a.position,b=s.graph.joints.b.position;
      assert.equal(s.simulation.stepError,null);assert(Number.isFinite(b.x)&&Number.isFinite(b.y));assert(Math.hypot(a.x-200,a.y-120)<1e-8);assert(Math.abs(Math.hypot(a.x-b.x,a.y-b.y)-120)/120<1e-3);
      assert((s.simulation.tracerPaths.trace?.length??0)<=6000);samples.push({wall:Date.now()-start,time:s.simulation.time,b,trace:s.simulation.tracerPaths.trace?.length??0});
      if(samples.length%30===0)await writeFile(join(output,'soak-progress.json'),JSON.stringify(samples));
    }
    assert(samples.at(-1).wall>=600_000);for(let from=0;from<samples.length;from+=30){const block=samples.slice(from,from+30);if(block.length>=20)assert(Math.max(...block.map(s=>s.b.x))-Math.min(...block.map(s=>s.b.x))>20,'Motion persists in every timed block, not only at startup');}await writeFile(join(output,'soak.json'),JSON.stringify(samples));await mode('Create');assert.deepEqual((await read()).graph,original);
  });
  assert.deepEqual(errors,[]);await context.close();
}catch(e){failure=e.stack;console.log(JSON.stringify({failure}));if(activePage&&!activePage.isClosed()){await activePage.screenshot({path:join(output,'FAILED.png')});await writeFile(join(output,'failure-state.json'),JSON.stringify(await activePage.evaluate(()=>({fileEvents:globalThis.__testFileEvents,feedback:document.querySelector('.project-feedback')?.textContent,project:globalThis.__LINKAGE_G0_READ__?.project?.(),editor:globalThis.__LINKAGE_G0_READ__?.editor?.(),graph:globalThis.__LINKAGE_G0_READ__?.mechanism?.()})),null,2));}}
finally{await browser.close();await new Promise(r=>{server.close(r);server.closeAllConnections();});}
const sourceEnd=await candidateFingerprint(),passed=!failure&&sourceEnd.sourceSha256===sourceStart.sourceSha256;
await writeFile(join(output,'report.json'),JSON.stringify({engine,sourceStart,sourceEnd,artifacts,base,results,errors,failure,passed,soak:process.argv.includes('--soak'),requests,qualification:'Real generated workers/static server/IDB; same source with two explicit version defines. Synthetic public mechanism. Visual viewport emulation is not physical iPad/keyboard qualification.',nativePicker:engine==='firefox'?'UNVERIFIED: Windows headless Firefox emits cancel before Playwright file delivery even on a minimal non-app page. Only native click is suppressed; actual file input change/FileReader/import remain mounted-app tests.':'Real Playwright filechooser event and input delivery; physical OS picker remains unverified.'},null,2));console.log(JSON.stringify({output,passed}));if(!passed)process.exitCode=1;
