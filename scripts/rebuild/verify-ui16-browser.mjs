import assert from 'node:assert/strict';
import {mkdir,mkdtemp,writeFile,readFile} from 'node:fs/promises';
import {join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {chromium,webkit,firefox} from '../../.rebuild.local/tooling/node_modules/playwright/index.mjs';
import {candidateFingerprint,assertCandidateBuild} from './candidate-fingerprint.mjs';
const root=fileURLToPath(new URL('../../',import.meta.url)),engine=process.argv[2]??'chromium',url=process.argv[3]??'http://127.0.0.1:5191/LinkageStudio/';
const sourceStart=await candidateFingerprint();
const parent=join(root,'.rebuild.local/evidence/ui16');await mkdir(parent,{recursive:true});
const output=await mkdtemp(join(parent,engine+'-'));
const browser=engine==='webkit'?await webkit.launch():engine==='firefox'?await firefox.launch():await chromium.launch({channel:'chrome'});
const seed=(extra=0,compact=false)=>JSON.stringify({version:'0.12.3',projectName:'UI16 Synthetic',joints:{a:{id:'a',type:'revolute',position:{x:220,y:230},connectedLinkIds:['rod']},b:{id:'b',type:'revolute',position:{x:370,y:230},connectedLinkIds:['rod']}},links:{rod:{id:'rod',jointIds:['a','b'],restLength:150,mass:1}},bodies:{base:{id:'base',name:'Base',jointIds:[],color:'#e53935'},body1:{id:'body1',name:'Body 1',jointIds:['a','b'],color:'#4caf50'},body2:{id:'body2',name:'Body 2',jointIds:[],color:'#ff9800'},body3:{id:'body3',name:'Body 3',jointIds:[],color:'#9c27b0'},...Object.fromEntries(Array.from({length:extra},(_,i)=>['extra'+i,{id:'extra'+i,name:compact?'Body '+(i+4):'A deliberately long body name '+i,jointIds:[],color:'#2196f3'}]))},baseBodyId:'base',outlines:{},images:{},sliders:{},colliders:{},tracers:{t:{id:'t',bodyId:'body1',localPosition:{x:0,y:-120},enabled:true}},gravityEnabled:false,damping:.5});
const profiles=engine==='firefox'?[{id:'desktop',width:1440,height:1000,touch:false}]:[{id:'desktop',width:1440,height:1000,touch:false},{id:'portrait',width:1024,height:1366,touch:true},{id:'split',width:512,height:900,touch:true}];
const results=[];
try{for(const profile of profiles){
 const context=await browser.newContext({viewport:{width:profile.width,height:profile.height},hasTouch:profile.touch,isMobile:profile.touch,deviceScaleFactor:profile.touch?2:1,serviceWorkers:'block',acceptDownloads:true});
 await context.addInitScript(suppressNativePicker=>{if(suppressNativePicker){const click=HTMLInputElement.prototype.click;HTMLInputElement.prototype.click=function(){if(this.type!=='file')return Reflect.apply(click,this,[]);};}Object.defineProperty(window,'showSaveFilePicker',{value:undefined,configurable:true});globalThis.__ui16Events=[];for(const name of ['pointerdown','pointerup','click','keydown'])document.addEventListener(name,e=>{if(globalThis.__ui16Events.length<300)globalThis.__ui16Events.push({type:name,trusted:e.isTrusted,pointer:e.pointerType});},true);},engine==='firefox');
 await context.addInitScript(()=>{
  globalThis.__ui16Motion=[];globalThis.__ui16MotionDone=false;let down=0,start=0;
  document.addEventListener('pointerdown',e=>{if(e.isTrusted&&e.target instanceof HTMLCanvasElement)down=performance.now();},true);
  const frame=now=>{
   const menu=document.querySelector('.radial-menu'),buttons=menu?[...menu.querySelectorAll('button')]:[];
   if(menu&&!start){start=now;globalThis.__ui16HoldDelay=now-down;globalThis.__ui16Opening=buttons.filter(b=>b.dataset.radialKey?.startsWith('body:')).map(b=>({key:b.dataset.radialKey,timing:b.getAnimations()[0]?.effect.getTiming(),frames:b.getAnimations()[0]?.effect.getKeyframes()}));}
   if(start&&globalThis.__ui16Motion.length<200){
    const b=buttons[0],s=b?getComputedStyle(b):null;
    globalThis.__ui16Motion.push({time:now-start,closing:menu?.classList.contains('closing')??false,transform:s?.transform,opacity:s?.opacity,inert:menu?.inert,disabled:buttons.every(b=>b.disabled)});
    if(!menu){globalThis.__ui16MotionDone=true;return;}
   }
   requestAnimationFrame(frame);
  };requestAnimationFrame(frame);
 });
 const page=await context.newPage();page.setDefaultTimeout(8000);const errors=[],checks=[],motionEvidence={};page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});page.on('dialog',d=>d.accept(d.type()==='prompt'?'ui16.slinker':undefined));
 const read=()=>page.evaluate(()=>({graph:__LINKAGE_G0_READ__.mechanism(),editor:__LINKAGE_G0_READ__.editor(),simulation:__LINKAGE_G0_READ__.simulation()}));
 const graph=async()=>{const s=(await read()).graph;const {past,future,...design}=s;return design;};
 const snap=async(name)=>page.screenshot({path:join(output,profile.id+'-'+name+'.png'),animations:'disabled'});
 const menu=page.getByRole('group',{name:'Object actions',exact:true});
 const importSeed=async(extra=0,compact=false)=>{
  const chooser=engine==='firefox'?null:page.waitForEvent('filechooser');await page.getByRole('button',{name:'Open',exact:true}).click();
  const dirty=page.getByRole('dialog',{name:'Unsaved Changes',exact:true});if(await dirty.isVisible())await dirty.getByRole('button',{name:'Discard and open',exact:true}).click();
  const file={name:'ui16.slinker',mimeType:'application/json',buffer:Buffer.from(seed(extra,compact))};
  if(chooser)await(await chooser).setFiles(file);else await page.locator('input[type=file]').setInputFiles(file);
  await page.waitForFunction(()=>!!__LINKAGE_G0_READ__.mechanism().joints.a);await page.waitForFunction(()=>document.querySelector('.top-bar')?.getAttribute('aria-busy')==='false');
 };
 const position=async id=>{const s=await read(),r=await page.locator('canvas').boundingBox(),p=s.graph.joints[id].position;return{x:r.x+s.editor.camera.pan.x+p.x*s.editor.camera.zoom,y:r.y+s.editor.camera.pan.y+p.y*s.editor.camera.zoom};};
 const settled=()=>page.waitForFunction(()=>[...document.querySelectorAll('.radial-menu:not(.closing) button')].every(el=>el.getAnimations().every(a=>a.playState==='finished')));
 const hold=async()=>{const p=await position('a');await page.mouse.move(p.x,p.y);await page.mouse.down();await menu.waitFor();assert.equal(await menu.getAttribute('data-open-mode'),'hold');await settled();};
 const center=async locator=>{const b=await locator.boundingBox();assert(b);return{x:b.x+b.width/2,y:b.y+b.height/2};};
 const sweep=async locator=>{const p=await center(locator);await page.mouse.move(p.x,p.y,{steps:12});};
 try{
  await page.goto(url);await assertCandidateBuild(page,sourceStart);await page.waitForFunction(()=>!!__LINKAGE_G0_READ__?.mechanism);
  if(profile.touch)await page.locator('.panel-collapsed').waitFor();
  await importSeed();
  const original=await graph();await hold();await snap('radial-hold');await sweep(menu.getByRole('button',{name:'Toggle Body 2',exact:true}));
  await page.waitForFunction(()=>__LINKAGE_G0_READ__.mechanism().bodies.body2.jointIds.includes('a'));await page.mouse.up();await menu.waitFor({state:'hidden'});
  await page.waitForFunction(()=>__ui16MotionDone);
  Object.assign(motionEvidence,await page.evaluate(()=>({delay:__ui16HoldDelay,opening:__ui16Opening,frames:__ui16Motion})));
  assert(motionEvidence.delay>=330&&motionEvidence.delay<1000);
  assert.equal(motionEvidence.opening.length,4);
  motionEvidence.opening.forEach((b,i)=>{assert.equal(b.timing.duration,220);assert.equal(b.timing.delay,i*38);assert(b.frames[0].transform.includes('scale(0.7)'));});
  const openingFrames=motionEvidence.frames.filter(f=>!f.closing&&f.transform),closingFrames=motionEvidence.frames.filter(f=>f.closing&&f.transform);
  assert(new Set(openingFrames.map(f=>f.transform)).size>=4,'Opening must really translate/scale, not just fade');
  assert(new Set(closingFrames.map(f=>f.transform)).size>=4,'Closing must really retract');assert(closingFrames.every(f=>f.inert&&f.disabled),'Closing presentation cannot run commands');
  checks.push('real-time translated/scaled fan, 220ms/38ms stagger, 340ms hold and inert closing frames');
  assert((await read()).graph.bodies.body2.jointIds.includes('a'));await page.keyboard.press('Control+z');assert.deepEqual(await graph(),original);await page.keyboard.press('Control+Shift+z');assert((await read()).graph.bodies.body2.jointIds.includes('a'));
  checks.push('actual held sweep assigns once on release; undo/redo restores whole graph');
  await page.emulateMedia({reducedMotion:'reduce'});await hold();assert.equal(await menu.locator('button').evaluateAll(bs=>bs.reduce((n,b)=>n+b.getAnimations().length,0)),0);await page.mouse.up();await menu.waitFor({state:'hidden'});assert.equal(await page.locator('.radial-menu.closing').count(),0);await page.emulateMedia({reducedMotion:'no-preference'});checks.push('reduced-motion keeps the compact menu without opening or closing animation');
  await importSeed();const cancelled=await graph();await hold();await sweep(menu.getByRole('button',{name:'Toggle Body 2',exact:true}));await page.keyboard.press('Escape');await page.mouse.up();assert.deepEqual(await graph(),cancelled);await menu.waitFor({state:'hidden'});
  checks.push('Escape rolls back a held membership edit without late release');
  await hold();const toggle=menu.getByRole('button',{name:'Toggle Body 2',exact:true});await sweep(toggle);assert((await read()).graph.bodies.body2.jointIds.includes('a'));await sweep(toggle);assert((await read()).graph.bodies.body2.jointIds.includes('a'));let anchor=await position('a');await page.mouse.move(anchor.x,anchor.y);await sweep(toggle);assert(!(await read()).graph.bodies.body2.jointIds.includes('a'));await page.mouse.up();await menu.waitFor({state:'hidden'});await importSeed();checks.push('hold sweep debounces within a pill and rearms after leaving, as in the fork');
  const tracerPoint=async()=>{const s=await read(),r=await page.locator('canvas').boundingBox();return{x:r.x+s.editor.camera.pan.x+295*s.editor.camera.zoom,y:r.y+s.editor.camera.pan.y+350*s.editor.camera.zoom};};
  // The imported tracer is offset from both the rod and its pivots.
  let tp=await tracerPoint();await page.mouse.click(tp.x,tp.y,{button:'right'});await menu.waitFor();await menu.getByRole('button',{name:'Delete tracer',exact:true}).click();assert(!(await read()).graph.tracers.t);assert((await read()).graph.joints.a);await page.keyboard.press('Control+z');assert.deepEqual(await graph(),cancelled);
  await page.getByRole('button',{name:'Select',exact:true}).click();tp=await tracerPoint();await page.mouse.move(tp.x,tp.y);await page.mouse.down();await menu.waitFor();await settled();
  await sweep(menu.getByRole('button',{name:'Assign to Body 1',exact:true}));await sweep(menu.getByRole('button',{name:'Assign to Body 2',exact:true}));assert.equal((await read()).graph.tracers.t.bodyId,'body2');await sweep(menu.getByRole('button',{name:'Assign to Body 1',exact:true}));assert.equal((await read()).graph.tracers.t.bodyId,'body1');await page.mouse.up();assert.equal((await read()).graph.tracers.t.bodyId,'body1');
  checks.push('right-click targets the tracer rather than prior joint; held single assignment can revisit the final body');
  await importSeed();
  if(engine==='chromium'){
   const cdp=await context.newCDPSession(page),p=await position('a');
   const pen=async(type,q,buttons)=>cdp.send('Input.dispatchMouseEvent',{type,x:q.x,y:q.y,button:'left',buttons,pointerType:'pen',force:buttons?.6:0});
   await pen('mousePressed',p,1);await menu.waitFor();await settled();const destination=await center(menu.getByRole('button',{name:'Toggle Body 2',exact:true}));await pen('mouseMoved',destination,1);
   assert((await read()).graph.bodies.body2.jointIds.includes('a'));
   await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x:p.x+30,y:p.y+60,id:91}]});await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});
   assert.equal(await menu.getAttribute('data-open-mode'),'hold');assert((await read()).graph.bodies.body2.jointIds.includes('a'));
   await page.keyboard.press('Escape');await pen('mouseReleased',destination,0);assert.deepEqual(await graph(),cancelled);checks.push('trusted pen hold ignores palm touch and Escape rolls back');
  }
  await hold();await sweep(menu.getByRole('button',{name:'Toggle Body 2',exact:true}));await page.setViewportSize({width:profile.width-10,height:profile.height});await menu.waitFor({state:'hidden'});await page.mouse.up();assert.deepEqual(await graph(),cancelled);await page.setViewportSize({width:profile.width,height:profile.height});
  checks.push('container resize cancels a held edit and late release cannot restore it');
  await hold();await sweep(menu.getByRole('button',{name:'Add body and assign',exact:true}));const beforeAdd=await read();assert.equal(Object.keys(beforeAdd.graph.bodies).length,4,'Hovering Add never creates a body');await page.mouse.up();await menu.waitFor({state:'hidden'});const added=(await read()).graph;assert.equal(Object.keys(added.bodies).length,5);assert(Object.values(added.bodies).some(b=>!cancelled.bodies[b.id]&&b.jointIds.includes('a')));await page.keyboard.press('Control+z');assert.deepEqual(await graph(),cancelled);
  checks.push('add-and-assign only on release, one graph undo');
  await hold();await sweep(menu.getByRole('button',{name:'Delete joint',exact:true}));assert((await read()).graph.joints.a,'Hovering Delete must not delete');await page.mouse.up();assert(!(await read()).graph.joints.a);await page.keyboard.press('Control+z');assert.deepEqual(await graph(),cancelled);
  checks.push('delete only on release, one graph undo');
  let point=await position('a');await page.mouse.click(point.x,point.y,{button:'right'});await menu.waitFor();assert.equal(await menu.getAttribute('data-open-mode'),'context');
  await page.waitForFunction(()=>!!document.activeElement?.closest('.radial-menu'));await page.keyboard.press('ArrowRight');await page.keyboard.press('Enter');assert(!(await read()).graph.bodies.body1.jointIds.includes('a'));await page.keyboard.press('Escape');await menu.waitFor({state:'hidden'});
  checks.push('native right-click context menu and arrow/Enter/Escape route');
  const area=await page.locator('canvas').boundingBox();
  for(const corner of [{x:area.x+2,y:area.y+2},{x:area.x+area.width-2,y:area.y+2},{x:area.x+2,y:area.y+area.height-2},{x:area.x+area.width-2,y:area.y+area.height-2}]){
   await page.mouse.click(corner.x,corner.y,{button:'right'});await menu.waitFor();
   const bounds=await menu.locator('button').evaluateAll(buttons=>buttons.map(b=>{const r=b.getBoundingClientRect();return{x:r.x,y:r.y,width:r.width,height:r.height};}));
   for(const b of bounds){assert(b.x>=area.x-.1&&b.y>=area.y-.1&&b.x+b.width<=area.x+area.width+.1&&b.y+b.height<=area.y+area.height+.1);}
   await page.keyboard.press('Escape');
  }
  point=await position('a');await page.mouse.click(point.x,point.y,{button:'right'});await menu.waitFor();const outsideBefore=await graph();await page.mouse.click(area.x+area.width*.5,area.y+area.height*.7);await menu.waitFor({state:'hidden'});assert.deepEqual(await graph(),outsideBefore);
  checks.push('actual menu stays inside all four canvas edges; dismissal click does not draw');
  await page.locator('canvas').focus();await page.keyboard.press('Shift+F10');await menu.waitFor();await page.keyboard.press('Escape');assert(await page.locator('canvas').evaluate(el=>el===document.activeElement));checks.push('Shift+F10 and focus return work without pointer hold');
  await importSeed();point=await position('a');if(profile.touch)await page.touchscreen.tap(point.x,point.y);else await page.mouse.click(point.x,point.y);
  await page.getByRole('button',{name:'Selection options',exact:true}).click();await page.getByRole('button',{name:'Object actions',exact:true}).click();await menu.waitFor();assert.equal(await menu.getAttribute('data-open-mode'),'context');
  const body2=menu.getByRole('button',{name:'Toggle Body 2',exact:true});if(profile.touch)await body2.tap();else await body2.click();assert((await read()).graph.bodies.body2.jointIds.includes('a'));await page.keyboard.press('Escape');
  checks.push('tap/keyboard-accessible object actions without mandatory hold');
  if(await page.getByTitle('Expand panel',{exact:true}).count())await page.getByTitle('Expand panel',{exact:true}).click();
  const gravity=page.getByRole('checkbox',{name:'Gravity',exact:true});const glyph=await gravity.evaluate(el=>({width:el.getBoundingClientRect().width,height:el.getBoundingClientRect().height,appearance:getComputedStyle(el).appearance,borderRadius:getComputedStyle(el).borderRadius,after:getComputedStyle(el,'::after').transform,labelHeight:el.closest('label').getBoundingClientRect().height}));
  assert.equal(glyph.appearance,'none');assert.equal(glyph.width,14);assert.equal(glyph.height,14);assert.equal(glyph.borderRadius,'4px');if(profile.touch)assert(glyph.labelHeight>=44);
  await gravity.focus();await page.keyboard.press('Shift+Tab');await page.keyboard.press('Tab');assert(await gravity.evaluate(el=>el===document.activeElement));await gravity.press('Space');const focus=await gravity.evaluate(el=>({width:getComputedStyle(el).outlineWidth,style:getComputedStyle(el).outlineStyle}));assert.notEqual(focus.style,'none');assert((await read()).simulation.gravityEnabled);
  const checked=await gravity.evaluate(el=>getComputedStyle(el,'::after').transform);assert.notEqual(checked,glyph.after);
  const range=page.getByRole('slider',{name:'Damping percent slider',exact:true}),before=Number(await range.inputValue());
  await range.focus();await range.press('ArrowRight');assert.equal(Number(await range.inputValue()),before+1);const field=page.getByRole('spinbutton',{name:'Damping percent',exact:true});assert.equal(Number(await field.inputValue()),before+1);
  const surface=await range.evaluate(el=>({height:el.getBoundingClientRect().height,background:getComputedStyle(el).backgroundColor,appearance:getComputedStyle(el).appearance,thumb:getComputedStyle(el,'::-webkit-slider-thumb').backgroundImage,thumbSize:getComputedStyle(el).getPropertyValue('--control-thumb-size')}));
  assert(surface.height>=(profile.touch?44:24));assert.equal(surface.appearance,'none');await snap('controls');
  const download=page.waitForEvent('download');await page.getByRole('button',{name:'Save',exact:true}).click();const saved=JSON.parse(await readFile(await(await download).path(),'utf8'));assert.equal(saved.simulationSettings.gravityEnabled,true);assert(Math.abs(saved.simulationSettings.damping-(1-(before+1)/100))<1e-9);
  checks.push('custom native checkbox/range paint, focus/Space/arrows, coarse hit rows and saved physics values');
  const toolbarTargets=await page.getByRole('toolbar',{name:'Viewport'}).getByRole('button').evaluateAll(buttons=>buttons.map(el=>{
   const r=el.getBoundingClientRect(),hit=document.elementFromPoint(r.x+r.width/2,r.y+r.height/2);
   return {label:el.getAttribute('aria-label'),width:r.width,height:r.height,reachable:hit===el||el.contains(hit)};
  }));
  assert(toolbarTargets.every(t=>t.reachable&&(!profile.touch||t.width>=44&&t.height>=44)),JSON.stringify(toolbarTargets));
  if(profile.id==='split')await page.setViewportSize({width:512,height:440});
  await page.getByRole('button',{name:'Selection options',exact:true}).click();
  const popup=await page.locator('.selection-options').boundingBox(),visibleCanvas=await page.locator('canvas').boundingBox();
  assert(popup.y>=visibleCanvas.y&&popup.y+popup.height<=visibleCanvas.y+visibleCanvas.height,'Selection popup fits above wrapped toolbar');
  const single=page.getByRole('radio',{name:'Single',exact:true});await single.scrollIntoViewIfNeeded();const radio=await single.evaluate(el=>({radius:getComputedStyle(el).borderRadius,appearance:getComputedStyle(el).appearance}));assert.equal(radio.radius,'50%');assert.equal(radio.appearance,'none');await page.keyboard.press('Escape');
  if(profile.id==='split')await page.setViewportSize({width:profile.width,height:profile.height});
  if(engine==='chromium'){await page.emulateMedia({forcedColors:'active'});const forced=await gravity.evaluate(el=>getComputedStyle(el).appearance);assert.equal(forced,'auto');await snap('forced-colors');await page.emulateMedia({forcedColors:'none'});checks.push('forced-colors uses native state indicators');}
  if(await page.getByTitle('Collapse panel',{exact:true}).count())await page.getByTitle('Collapse panel',{exact:true}).click();
  await importSeed(8,true);point=await position('a');await page.mouse.click(point.x,point.y,{button:'right'});await menu.waitFor();assert(await menu.evaluate(el=>el.classList.contains('radial-orbit')));assert.equal(await menu.locator('.radial-body').count(),12);await page.keyboard.press('Escape');checks.push('twelve-body legacy-sized projects retain a fan instead of the old six-body list cutoff');
  await importSeed(40);point=await position('a');await page.mouse.click(point.x,point.y,{button:'right'});await menu.waitFor();assert(await menu.evaluate(el=>el.classList.contains('radial-list')));await snap('many-bodies');
  const menuBounds=await menu.boundingBox(),canvasBounds=await page.locator('canvas').boundingBox();assert(menuBounds.x>=canvasBounds.x&&menuBounds.x+menuBounds.width<=canvasBounds.x+canvasBounds.width+.1);assert(menuBounds.y>=canvasBounds.y&&menuBounds.y+menuBounds.height<=canvasBounds.y+canvasBounds.height+.1);
  await menu.getByRole('button',{name:'Toggle A deliberately long body name 39',exact:true}).click();assert((await read()).graph.bodies.extra39.jointIds.includes('a'));await page.keyboard.press('Escape');
  checks.push('many-body bounded scrolling menu reaches the last full accessible name');
  const events=await page.evaluate(()=>__ui16Events);assert(events.some(e=>e.trusted&&e.type==='pointerdown'));assert.equal(errors.length,0,errors.join('\n'));
  results.push({profile,passed:true,checks,motion:motionEvidence,glyph,surface,radio,errors,trustedEvents:events.filter(e=>e.trusted).length});
 }catch(error){await snap('FAILED');results.push({profile,passed:false,checks,errors,failure:error.stack});}
 finally{await context.close();}
 const last=results.at(-1);console.log(JSON.stringify({...last,motion:last.motion?{delay:last.motion.delay,frames:last.motion.frames.length,opening:last.motion.opening.map(b=>({key:b.key,duration:b.timing.duration,delay:b.timing.delay}))}:undefined}));
}}
finally{await browser.close();}
const sourceEnd=await candidateFingerprint(),passed=sourceStart.sourceSha256===sourceEnd.sourceSha256&&results.every(r=>r.passed);
await writeFile(join(output,'report.json'),JSON.stringify({output,engine,browser:browser.version(),sourceStart,sourceEnd,passed,results,nativePicker:engine==='firefox'?'qualified: native click suppressed for Windows headless cancellation; real file input/FileReader/import retained':'actual native chooser event and file input',physicalIPadVerified:false},null,2));
console.log(JSON.stringify({output,passed}));if(!passed)process.exitCode=1;
