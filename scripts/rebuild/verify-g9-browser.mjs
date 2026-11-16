import assert from 'node:assert/strict';
import { mkdir, mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium, webkit } from '../../.rebuild.local/tooling/node_modules/playwright/index.mjs';
import { candidateFingerprint, assertCandidateBuild } from './candidate-fingerprint.mjs';
const root=fileURLToPath(new URL('../../',import.meta.url)), engine=process.argv[2]??'chromium', url=process.argv[3];
assert.equal(process.env.LINKAGE_CLOUD_MOCK,'1','Use run-g9.mjs: this suite requires the explicitly fingerprinted external SDK boundary.');
const sourceStart=await candidateFingerprint();
const parent=join(root,'.rebuild.local/evidence/g9');await mkdir(parent,{recursive:true});
const output=await mkdtemp(join(parent,`${engine}-browser-`));
const {archive}=JSON.parse(await readFile(join(root,'.rebuild.local/runtimes.json'),'utf8'));
const legacy=await Promise.all(['airer.slinker','working-screen.json'].map(f=>readFile(join(archive,'fixtures',f),'utf8')));
const seed=JSON.stringify({version:'0.12.3',projectName:'Cloud One',joints:{a:{id:'a',type:'fixed',position:{x:100,y:100},connectedLinkIds:['rod']},b:{id:'b',type:'revolute',position:{x:100,y:220},connectedLinkIds:['rod']}},links:{rod:{id:'rod',jointIds:['a','b'],restLength:120,mass:1}},bodies:{base:{id:'base',name:'Base',jointIds:['a'],color:'#e53935'},rod:{id:'rod',name:'Rod',jointIds:['a','b'],color:'#4caf50'}},baseBodyId:'base',outlines:{},images:{},sliders:{},colliders:{},tracers:{}});
function boundary() {
  let seq=0;
  const data={authFail:false,expired:false,offline:false,writeStatus:0,invalid:false,events:[],files:new Map()};
  function add(id,name,text,account='account-A'){data.files.set(account+':'+id,{id,name,text,eTag:'"v1"',account});}
  add('one','One.slinker',seed);add('airer','Airer.slinker',legacy[0]);add('screen','WorkingScreen.slinker',legacy[1]);
  const dto=f=>({id:f.id,name:f.name,eTag:f.eTag,parentReference:{driveId:'drive-1'},size:Buffer.byteLength(data.invalid?'not json':f.text),lastModifiedDateTime:'2026-11-16T10:00:00Z',file:{},'@microsoft.graph.downloadUrl':`https://test.files.example/download/${f.account}/${f.id}`});
  data.install=async context=>{
    await context.route('**/__test_auth__/**',async route=>{
      const u=new URL(route.request().url()); data.events.push({kind:'auth',path:u.pathname});
      if(u.pathname.endsWith('/initialize')&&data.authWait)await data.authWait;
      await route.fulfill({status:data.authFail||data.expired&&u.pathname.endsWith('/token')?401:200,json:{homeAccountId:'account-B',username:'b@example.test'}});
    });
    await context.route('https://graph.microsoft.com/**',async route=>{
      const req=route.request(),u=new URL(req.url()),path=decodeURIComponent(u.pathname),method=req.method(),headers=req.headers();
      if(method==='OPTIONS'){await route.fulfill({status:204,headers:{'access-control-allow-origin':'*','access-control-allow-methods':'GET, PUT, PATCH, DELETE','access-control-allow-headers':'*'}});return;}
      const account=headers.authorization?.replace('Bearer test-only-','');assert(['account-A','account-B'].includes(account),'Explicit account-bound token');
      data.events.push({kind:'graph',method,path,account,match:headers['if-match']});
      const reply=(status,json)=>route.fulfill({status,headers:{'access-control-allow-origin':'*'},...(status===204?{}:{json})});
      if(data.offline){await route.abort('internetdisconnected');return;}
      if(method!=='GET'&&data.writeStatus){await reply(data.writeStatus,{error:{message:'injected'}});return;}
      if(path==='/v1.0/me/drive/root:/Documents/LinkageStudio'){await reply(200,{id:'folder',name:'LinkageStudio',eTag:'"folder"',parentReference:{driveId:'drive-1'},size:0,lastModifiedDateTime:'2026-11-16',folder:{}});return;}
      if(path==='/v1.0/drives/drive-1/items/folder/children'){
        if(data.listWait){await data.listWait;if(req.failure())return;}
        const all=[...data.files.values()].filter(f=>f.account===account);
        const second=u.searchParams.has('$skiptoken');
        await reply(200,{value:(second?all.slice(1):all.slice(0,1)).map(dto),...(!second&&all.length>1?{'@odata.nextLink':'https://graph.microsoft.com/v1.0/drives/drive-1/items/folder/children?$skiptoken=next'}:{})});return;
      }
      const creation=path.match(/^\/v1.0\/drives\/drive-1\/items\/folder:\/(.+):\/content$/);
      if(method==='PUT'&&creation){
        assert.equal(u.searchParams.get('@microsoft.graph.conflictBehavior'),'fail');
        if([...data.files.values()].some(f=>f.account===account&&f.name===creation[1])){await reply(409,{});return;}
        const id='created-'+(++seq);add(id,creation[1],req.postData(),account);await reply(201,dto(data.files.get(account+':'+id)));return;
      }
      const match=path.match(/^\/v1.0\/drives\/drive-1\/items\/([^/]+)(\/content)?$/),f=match&&data.files.get(account+':'+match[1]);
      if(!f){await reply(404,{});return;}
      if(method==='GET'){
        const metadata=dto(f);
        // Reproduce the real business-drive omission that broke cloud reopen.
        if(u.searchParams.has('$select'))delete metadata['@microsoft.graph.downloadUrl'];
        await reply(200,metadata);return;
      }
      assert.equal(headers['if-match'],f.eTag,'Every overwrite/rename/delete is conditional');
      if(method==='DELETE'){data.files.delete(account+':'+f.id);await reply(204);return;}
      if(method==='PUT')f.text=req.postData();else if(method==='PATCH')f.name=JSON.parse(req.postData()).name;else assert.fail(method);
      f.eTag='"v'+(++seq+1)+'"';await reply(200,dto(f));
    });
    await context.route('https://test.files.example/**',async route=>{
      assert.equal(route.request().headers().authorization,undefined,'No token sent to download host');
      const [,account,id]=new URL(route.request().url()).pathname.split('/').filter(Boolean),f=data.files.get(account+':'+id);assert(f);
      await route.fulfill({status:200,body:data.invalid?'not json':f.text,contentType:'text/plain',headers:{'access-control-allow-origin':'*'}});
    });
    await context.route('https://login.microsoftonline.com/**',()=>assert.fail('No real authentication in a boundary test'));
  };return data;
}
const browser=engine==='webkit'?await webkit.launch():await chromium.launch({channel:'chrome'}),results=[];
const profiles=[{id:'desktop',width:1440,height:1000,touch:false},{id:'tablet',width:1024,height:1366,touch:true},{id:'split',width:512,height:900,touch:true}];
const scenarios=[
  ['cancel-stalled-auth-and-list',async t=>{
    let releaseAuth,releaseList;t.cloud.authWait=new Promise(r=>{releaseAuth=r;});
    try{
      await t.click(t.page.getByRole('button',{name:'Projects',exact:true}));await t.dialog.waitFor();assert.equal(await t.dialog.getAttribute('aria-busy'),'true');
      await t.page.keyboard.press('Escape');await t.dialog.waitFor({state:'hidden'});await t.openLocal(seed);releaseAuth();await t.page.waitForTimeout(100);assert.equal((await t.read()).editor.projectName,'Cloud One');assert.equal(t.cloud.events.filter(e=>e.kind==='graph').length,0,'Obsolete auth completion does not start a library request');
      t.cloud.authWait=null;await t.library();await t.close();t.cloud.listWait=new Promise(r=>{releaseList=r;});
      const count=t.cloud.events.length;await t.click(t.page.getByRole('button',{name:'Projects',exact:true}));await t.dialog.waitFor();await t.poll(()=>t.cloud.events.slice(count).some(e=>e.path?.endsWith('/children')));
      await t.page.keyboard.press('Escape');await t.dialog.waitFor({state:'hidden'});assert.equal((await t.read()).editor.projectName,'Cloud One');releaseList();await t.page.waitForTimeout(100);assert.equal((await t.read()).editor.projectName,'Cloud One');
    }finally{releaseAuth?.();releaseList?.();}
  }],
  ['guest-auth-failure',async t=>{
    assert.equal(t.cloud.events.length,0,'Guest mount performs no auth/Graph work');t.cloud.authFail=true;
    await t.library();await t.poll(async()=>/unavailable/.test(await t.page.locator('.cloud-status').innerText()));await t.close();
    await t.openLocal(seed);assert.equal((await t.read()).editor.projectName,'Cloud One');await t.mode('Simulate');await t.page.waitForTimeout(100);assert.equal((await t.read()).simulation.stepError,null);await t.mode('Create');
  }],
  ['create-autosave-rename-delete',async t=>{
    await t.openLocal(seed);await t.renameProject('Cloud created');await t.library();
    await t.dialog.getByRole('textbox',{name:'Cloud file name'}).fill('Created');await t.click(t.dialog.getByRole('button',{name:'Save new copy',exact:true}));await t.status(/Saved to OneDrive/);
    assert.equal((await t.read()).project.dirty,false);const created=[...t.cloud.files.values()].find(f=>f.name==='Created.slinker');assert(created);assert.equal(JSON.parse(created.text).projectName,'Cloud created');
    await t.dialog.getByRole('checkbox',{name:'Cloud autosave'}).check();await t.close();await t.renameProject('Autosaved name');
    await t.poll(async()=>JSON.parse(created.text).projectName==='Autosaved name'&&!(await t.read()).project.dirty);
    await t.library();await t.select('Created.slinker',false);await t.dialog.getByRole('textbox',{name:'Cloud file name'}).fill('Renamed');await t.click(t.dialog.getByRole('button',{name:'Rename cloud file',exact:true}));await t.click(t.dialog.getByRole('button',{name:'Confirm rename',exact:true}));await t.status(/renamed/);
    assert.equal(created.name,'Renamed.slinker');assert.equal(await t.dialog.locator('.cloud-list strong').filter({hasText:/^Renamed\.slinker$/}).count(),2,'Remote and cached filenames both update immediately');await t.select('Renamed.slinker',false);await t.click(t.dialog.getByRole('button',{name:'Open',exact:true}));await t.status(/Opened from OneDrive/);
    assert.equal((await t.read()).editor.projectName,'Autosaved name');await t.select('Renamed.slinker',false);await t.click(t.dialog.getByRole('button',{name:'Delete cloud file',exact:true}));await t.click(t.dialog.getByRole('button',{name:'Delete from OneDrive',exact:true}));await t.status(/Deleted from OneDrive/);
    assert.equal((await t.read()).editor.projectName,'Autosaved name');assert.equal((await t.read()).project.dirty,true);assert(!t.cloud.files.has('account-A:'+created.id));
  }],
  ['conflict-offline-reload-draft',async t=>{
    await t.library();await t.select('One.slinker',false);await t.click(t.dialog.getByRole('button',{name:'Open',exact:true}));await t.status(/Opened from OneDrive/);await t.close();await t.renameProject('Offline authored draft');await t.library();
    t.cloud.writeStatus=412;await t.click(t.dialog.getByRole('button',{name:'Save to OneDrive',exact:true}));await t.status(/cloud project changed/);assert.equal((await t.read()).project.dirty,true);
    assert.equal(JSON.parse(t.cloud.files.get('account-A:one').text).projectName,'Cloud One');
    const writes=t.cloud.events.filter(e=>e.method==='PUT').length;await t.page.waitForTimeout(1700);assert.equal(t.cloud.events.filter(e=>e.method==='PUT').length,writes,'No blind retries');
    await t.close();t.cloud.offline=true;await t.page.reload();await t.dismissRecovery();await t.library();await t.status(/could not reach/);
    await t.select('One.slinker',true);await t.click(t.dialog.getByRole('button',{name:'Open',exact:true}));await t.status(/Opened offline draft/);assert.equal((await t.read()).editor.projectName,'Offline authored draft');assert.equal((await t.read()).project.dirty,true);
    t.cloud.offline=false;t.cloud.writeStatus=0;t.cloud.expired=true;await t.click(t.dialog.getByRole('button',{name:'Save to OneDrive',exact:true}));await t.status(/sign-in is required/);assert.equal((await t.read()).project.dirty,true);
    t.cloud.expired=false;await t.click(t.dialog.getByRole('button',{name:'Save to OneDrive',exact:true}));await t.status(/Saved to OneDrive/);assert.equal((await t.read()).project.dirty,false);
  }],
  ['account-isolation-and-collision',async t=>{
    await t.openLocal(seed);await t.renameProject('Unsaved local');await t.library();await t.select('One.slinker',false);await t.click(t.dialog.getByRole('button',{name:'Open',exact:true}));
    await t.click(t.dialog.getByRole('button',{name:'Save local first',exact:true}));await t.poll(async()=>/Save cancelled/.test(await t.page.locator('.project-feedback').innerText()));assert.equal((await t.read()).project.dirty,true);
    await t.click(t.dialog.getByRole('button',{name:'Cancel',exact:true}));assert.equal((await t.read()).editor.projectName,'Unsaved local');
    await t.dialog.getByRole('textbox',{name:'Cloud file name'}).fill('One');await t.click(t.dialog.getByRole('button',{name:'Save new copy',exact:true}));await t.status(/cloud project changed/);assert.equal((await t.read()).project.dirty,true);
    await t.click(t.dialog.getByRole('button',{name:'Connect Microsoft account',exact:true}));await t.poll(()=>t.dialog.getByRole('combobox',{name:'Cloud account'}).inputValue().then(v=>v==='account-B'));await t.status(/refreshed/);assert.equal(await t.dialog.getByRole('radio').count(),0,'Other account cannot see A cloud/cache rows');
    await t.dialog.getByRole('combobox',{name:'Cloud account'}).selectOption('account-A');await t.status(/refreshed/);assert((await t.dialog.getByRole('radio').count())>=3);
    await t.click(t.dialog.getByRole('button',{name:'Disconnect account',exact:true}));await t.poll(()=>t.dialog.getByRole('combobox',{name:'Cloud account'}).inputValue().then(v=>v===''));assert.equal((await t.read()).editor.projectName,'Unsaved local');
  }],
  ['invalid-open-focus-and-quota',async t=>{
    await t.openLocal(seed);const before=(await t.read()).graph;await t.library();await t.select('One.slinker',false);t.cloud.invalid=true;
    await t.click(t.dialog.getByRole('button',{name:'Open',exact:true}));await t.status(/invalid/);assert.deepEqual((await t.read()).graph,before);t.cloud.invalid=false;
    t.cloud.writeStatus=507;await t.click(t.dialog.getByRole('button',{name:'Save new copy',exact:true}));await t.status(/storage is full/);assert.deepEqual((await t.read()).graph,before);
    await t.page.keyboard.press('Escape');await t.dialog.waitFor({state:'hidden'});assert(await t.page.getByRole('button',{name:'Projects',exact:true}).evaluate(e=>e===document.activeElement));
  }],
  ['legacy-cloud-motion',async t=>{
    for(const [file,handle,targets] of [['Airer.slinker','g6kFted7Nm',[{x:600,y:200},{x:400,y:100},{x:100,y:-50}]],['WorkingScreen.slinker','0oYLG5yu-0',[{x:625,y:325}]]]){
      await t.library();await t.select(file,false);await t.click(t.dialog.getByRole('button',{name:'Open',exact:true}));await t.status(/Opened from OneDrive/);await t.close();
      for(const title of ['Collapse toolbar','Collapse panel']){const b=t.page.getByTitle(title,{exact:true});if(await b.isVisible())await t.click(b);}
      let rect=await t.page.locator('canvas').boundingBox();await t.page.mouse.move(rect.x+rect.width/2,rect.y+rect.height/2);
      for(let z=0;z<30&&(await t.read()).editor.camera.zoom>Math.min(rect.width/1500,rect.height/1100);z++)await t.click(t.page.getByRole('button',{name:'Zoom out',exact:true}));
      let s=await t.read();const desired={x:rect.width/2-700*s.editor.camera.zoom,y:rect.height/2-400*s.editor.camera.zoom},dx=desired.x-s.editor.camera.pan.x,dy=desired.y-s.editor.camera.pan.y,n=Math.max(1,Math.ceil(Math.abs(dx)/(rect.width*.3)),Math.ceil(Math.abs(dy)/(rect.height*.3)));
      for(let i=0;i<n;i++){await t.page.mouse.move(rect.x+rect.width/2,rect.y+rect.height/2);await t.page.mouse.down({button:'middle'});await t.page.mouse.move(rect.x+rect.width/2+dx/n,rect.y+rect.height/2+dy/n,{steps:8});await t.page.mouse.up({button:'middle'});}
      const design=(await t.read()).graph;await t.mode('Simulate');await t.page.waitForTimeout(150);const initial=await t.read();rect=await t.page.locator('canvas').boundingBox();const cam=initial.editor.camera,screen=p=>({x:rect.x+cam.pan.x+p.x*cam.zoom,y:rect.y+cam.pan.y+p.y*cam.zoom});
      let previous=screen(initial.graph.joints[handle].position);await t.page.mouse.move(previous.x,previous.y);await t.page.mouse.down();assert.equal((await t.read()).editor.simDrag?.jointId,handle);
      for(const target of targets){const to=screen(target);assert(to.x>rect.x&&to.x<rect.x+rect.width&&to.y>rect.y&&to.y<rect.y+rect.height);
        for(let step=1;step<=20;step++){await t.page.mouse.move(previous.x+(to.x-previous.x)*step/20,previous.y+(to.y-previous.y)*step/20);await t.page.waitForTimeout(30);assert.equal((await t.read()).simulation.stepError,null);}
        await t.page.waitForTimeout(1600);previous=to;}
      s=await t.read();const travel=Math.hypot(s.graph.joints[handle].position.x-initial.graph.joints[handle].position.x,s.graph.joints[handle].position.y-initial.graph.joints[handle].position.y);assert(travel>30);
      if(file.startsWith('Airer')){const a=s.graph.joints['9hUW_8pccU'].position,b=s.graph.joints.XlD7YOWwBk.position;assert(Math.hypot(a.x-b.x,a.y-b.y)>300);assert.equal(s.simulation.dof,1);}
      await t.page.screenshot({path:join(t.dir,file+'-opened.png')});await t.page.mouse.up();await t.mode('Create');assert.deepEqual((await t.read()).graph,design);
      await t.library();await t.click(t.dialog.getByRole('button',{name:'Save to OneDrive',exact:true}));await t.status(/Saved to OneDrive/);await t.close();
    }
  }],
];
try {
  for(const profile of profiles)for(const [name,scenario]of scenarios){
    const dir=join(output,profile.id+'-'+name);await mkdir(dir);const context=await browser.newContext({viewport:{width:profile.width,height:profile.height},hasTouch:profile.touch,isMobile:profile.touch,deviceScaleFactor:profile.touch?2:1,serviceWorkers:'block'});
    await context.addInitScript(()=>Object.defineProperty(window,'showSaveFilePicker',{configurable:true,value:undefined}));
    const cloud=boundary();await cloud.install(context);await context.tracing.start({snapshots:true,screenshots:false,sources:false});const page=await context.newPage();page.setDefaultTimeout(12000);const errors=[];
    page.on('pageerror',e=>errors.push(e.message));page.on('dialog',d=>d.type()==='beforeunload'?d.accept():d.dismiss());
    const dialog=page.getByRole('dialog',{name:'Projects',exact:true});
    const t={page,dialog,cloud,dir,click:e=>profile.touch?e.tap():e.click(),read:()=>page.evaluate(()=>({graph:__LINKAGE_G0_READ__.mechanism(),editor:__LINKAGE_G0_READ__.editor(),simulation:__LINKAGE_G0_READ__.simulation(),project:__LINKAGE_G0_READ__.project()})),
      async poll(f){const start=Date.now();while(Date.now()-start<12000){if(await f())return;await page.waitForTimeout(60);}assert.fail('Condition did not become true');},
      async status(re){await t.poll(async()=>re.test(await dialog.locator('.cloud-status').innerText()));await t.poll(async()=>await dialog.getAttribute('aria-busy')==='false');},
      async library(){await t.click(page.getByRole('button',{name:'Projects',exact:true}));await dialog.waitFor();await t.status(cloud.authFail?/unavailable/:cloud.offline?/could not reach/:/refreshed/);await t.checkModal();},
      async close(){await t.click(dialog.getByRole('button',{name:'Close projects',exact:true}));await dialog.waitFor({state:'hidden'});},
      async select(name,cached){const label=dialog.locator('.cloud-list label').filter({has:page.getByText(name,{exact:true})}).filter({has:page.getByText(cached?/Offline draft|Cached copy|cached copy/:/^OneDrive$/)});assert.equal(await label.count(),1);await t.click(label);},
      async renameProject(name){await t.click(page.getByTitle('Rename project',{exact:true}));const field=page.getByRole('textbox',{name:'Project name',exact:true});await field.fill(name);await field.press('Enter');},
      async openLocal(text){const chooser=page.waitForEvent('filechooser');await t.click(page.getByRole('button',{name:'Open',exact:true}));await(await chooser).setFiles({name:'cloud-seed.slinker',mimeType:'application/json',buffer:Buffer.from(text)});await t.poll(async()=>(await t.read()).editor.projectName===JSON.parse(text).projectName);},
      async dismissRecovery(){await page.waitForTimeout(500);const close=page.getByRole('button',{name:'Close recovery',exact:true});if(await close.isVisible())await t.click(close);},
      async mode(name){const button=page.getByRole('button',{name,exact:true});await t.click(await button.isVisible()?button:page.getByTitle(name+' mode',{exact:true}));},
      async checkModal(){
        const box=await dialog.boundingBox();assert(box.x>=0&&box.y>=0&&box.x+box.width<=profile.width+1&&box.y+box.height<=profile.height+1,'Modal fits viewport');
        if(profile.touch){for(const el of await dialog.locator('button:visible,select:visible,input:not([type=radio]):not([type=checkbox]):visible').all()){const b=await el.boundingBox();assert(b.height>=44,'Coarse target >=44px');}}
        const focusables=dialog.locator('button:not(:disabled),input:not(:disabled),select:not(:disabled)');await focusables.last().focus();await page.keyboard.press('Tab');assert(await focusables.first().evaluate(e=>e===document.activeElement),'Tab contained');
      },
    };
    let failure;try{await page.goto(url);await assertCandidateBuild(page,sourceStart);await page.locator('canvas').waitFor();await scenario(t);assert.deepEqual(errors,[]);await page.screenshot({path:join(dir,'final.png')});}
    catch(e){failure=e.stack;await page.screenshot({path:join(dir,'FAILED.png')});}
    const result={profile:profile.id,name,passed:!failure,failure,errors,events:cloud.events};results.push(result);await writeFile(join(dir,'report.json'),JSON.stringify(result,null,2));await context.tracing.stop({path:join(dir,'trace.zip')});await context.close();console.log(JSON.stringify({profile:profile.id,name,passed:!failure,failure}));if(failure)break;
  }
}finally{await browser.close();}
const sourceEnd=await candidateFingerprint(),passed=results.length===profiles.length*scenarios.length&&results.every(r=>r.passed)&&sourceEnd.sourceSha256===sourceStart.sourceSha256;
await writeFile(join(output,'report.json'),JSON.stringify({sourceStart,sourceEnd,results,passed,qualification:'Mock SDK and HTTP boundaries; actual mounted app, real IDB. No live Microsoft or physical iPad claim.'},null,2));console.log(JSON.stringify({output,passed}));if(!passed)process.exitCode=1;
