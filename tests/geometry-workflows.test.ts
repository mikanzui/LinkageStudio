import { test } from 'node:test';
import assert from 'node:assert/strict';
import { legacyFixtureOptions, readLegacyFixture } from './fixture-helper';
import type { Body, Joint, MechanismState, Vec2 } from '../src/types';
import { computeBodyTransform, stabilizeBodyFrame, localToWorld, worldToLocal, polygonArea, polygonCentroid } from '../src/core/body-transform';
import { projectImages } from '../src/core/image-transform';
import { snapshotMechanism } from '../src/core/compile-mechanism';
import { useMechanismStore as store } from '../src/store/mechanism-store';
import { useEditorStore as editor } from '../src/store/editor-store';
import { projectText, importProject } from '../src/document/project';
import { beginGeometry, moveGeometry, finishGeometry } from '../src/interaction/geometry-tools';
import { hitTestOutline, hitTestOutlineFilled } from '../src/interaction/hit-test';
import { selectInRegion } from '../src/interaction/selection-marquee';
import { decodeDocument } from '../src/document/codec';

Object.assign(globalThis,{__APP_VERSION__:'rebuild-g5'});
const near=(a:Vec2,b:Vec2)=>assert(Math.hypot(a.x-b.x,a.y-b.y)<1e-8,JSON.stringify({a,b}));
const joint=(id:string,x:number,y:number):Joint=>({id,type:'revolute',position:{x,y},connectedLinkIds:[]});
function graph():MechanismState {
  return {joints:{center:joint('center',0,0),left:joint('left',-50,0),right:joint('right',50,0)},links:{},
    bodies:{base:{id:'base',name:'Base',color:'#ff0000',jointIds:[],useOutlineCOM:false,showLinks:true},arm:{id:'arm',name:'Arm',color:'#00ff00',jointIds:['center','left','right'],useOutlineCOM:false,showLinks:true}},baseBodyId:'base',
    outlines:{shape:{id:'shape',bodyId:'arm',name:'Shape',visible:true,points:[{x:0,y:0},{x:100,y:0},{x:100,y:100},{x:0,y:100}]}},
    images:{picture:{id:'picture',bodyId:'arm',src:'data:image/png;base64,AA==',position:{x:20,y:0},rotation:.3,scale:1,opacity:1,visible:true,naturalWidth:10,naturalHeight:20}},
    sliders:{},colliders:{},tracers:{}};
}
function load(g=graph()) { store.getState().loadState(g);editor.getState().setMode('create');editor.setState({frozenOutlineWorldPoints:new Map(),activeBodyIds:new Set(['arm']),selectedIds:new Set(),gridEnabled:false,lockOutlines:true}); }
const world=(g:MechanismState,id='shape')=>g.outlines[id].points.map(p=>localToWorld(p,computeBodyTransform(g.bodies[g.outlines[id].bodyId],g.joints)));

test('centroid-first legacy frame initializes without changing saved pose, then rotates stably',()=>{
  const g=graph(),body=stabilizeBodyFrame(g.bodies.arm,g.joints);
  assert(body.frame);near(localToWorld({x:10,y:20},computeBodyTransform(body,g.joints)),{x:10,y:20});
  const rotated=Object.fromEntries(Object.entries(g.joints).map(([id,j])=>[id,{...j,position:{x:100-j.position.y,y:200+j.position.x}}]));
  near(localToWorld({x:10,y:20},computeBodyTransform(body,rotated)),{x:80,y:210});
  for(let i=0;i<10;i++){const disturbed=structuredClone(rotated);disturbed.center.position.x+=1e-12*i;near(localToWorld({x:10,y:20},computeBodyTransform(body,disturbed)),{x:80,y:210});}
});

test('polygon area and centroid are invariant under large translations and reversed winding',()=>{
  for(const offset of [0,1e12,-1e12]){
    const points=[{x:offset,y:offset},{x:offset+100,y:offset},{x:offset+100,y:offset+100},{x:offset,y:offset+100}];
    for(const order of [points,[...points].reverse()]){assert.equal(polygonArea(order),10000);assert.deepEqual(polygonCentroid(order),{x:offset+50,y:offset+50});}
  }
  const concave=[{x:0,y:0},{x:2,y:0},{x:2,y:1},{x:1,y:1},{x:1,y:2},{x:0,y:2}];
  assert.equal(polygonArea(concave),3);near(polygonCentroid(concave),{x:5/6,y:5/6});
  near(polygonCentroid([{x:1,y:2},{x:3,y:2}]),{x:2,y:2});assert.equal(polygonArea([]),0);
});

for(const fixture of ['airer.slinker','working-screen.json'] as const)test(fixture+': body-frame initialization preserves every legacy local/world asset pose',legacyFixtureOptions(fixture),()=>{
  const g=JSON.parse(readLegacyFixture(fixture)) as MechanismState;
  store.getState().loadState(g);const actual=store.getState();
  for(const o of Object.values(g.outlines??{}))o.points.forEach((p,i)=>near(localToWorld(p,computeBodyTransform(g.bodies[o.bodyId],g.joints)),localToWorld(actual.outlines[o.id].points[i],computeBodyTransform(actual.bodies[o.bodyId],actual.joints))));
  for(const t of Object.values(g.tracers??{}))near(localToWorld(t.localPosition,computeBodyTransform(g.bodies[t.bodyId],g.joints)),localToWorld(actual.tracers[t.id].localPosition,computeBodyTransform(actual.bodies[t.bodyId],actual.joints)));
});

test('images follow a stable body transform without changing persisted design-world pose',()=>{
  const g=graph();g.bodies.arm=stabilizeBodyFrame(g.bodies.arm,g.joints);
  const before=structuredClone(g),rotated=Object.fromEntries(Object.entries(g.joints).map(([id,j])=>[id,{...j,position:{x:100-j.position.y,y:200+j.position.x}}]));
  const images=projectImages(g.images,g.bodies,g.joints,rotated);near(images.picture.position,{x:100,y:220});
  assert(Math.abs(Math.cos(images.picture.rotation)-Math.cos(.3+Math.PI/2))<1e-9);assert.deepEqual(g,before);
});

test('outline reassignment and membership changes preserve world pose and valid frame references',()=>{
  load();const before=world(store.getState());
  const other=store.getState().addBody('Other');store.getState().editOutline('shape',{bodyId:other});world(store.getState()).forEach((p,i)=>near(p,before[i]));
  store.getState().undo();assert.equal(store.getState().outlines.shape.bodyId,'arm');
  store.getState().removeJointFromBody('left','arm');world(store.getState()).forEach((p,i)=>near(p,before[i]));
  for(const id of store.getState().bodies.arm.frame?.jointIds??[])assert(store.getState().bodies.arm.jointIds.includes(id));
  store.getState().removeJointFromBody('right','arm');world(store.getState()).forEach((p,i)=>near(p,before[i]));assert.equal(store.getState().bodies.arm.frame,undefined);
});

test('locked outlines remain canonical through coordinate edit and single undo/redo',()=>{
  load();const before=world(store.getState()),frozen=new Map([['shape',before]]);
  store.getState().editJoint('right',{x:75,y:30},frozen);world(store.getState()).forEach((p,i)=>near(p,before[i]));
  store.getState().undo();world(store.getState()).forEach((p,i)=>near(p,before[i]));assert.equal(store.getState().joints.right.position.x,50);
  store.getState().redo();world(store.getState()).forEach((p,i)=>near(p,before[i]));assert.equal(store.getState().joints.right.position.x,75);
});

test('save resolves visible frozen geometry, and reopened file retains that world pose',()=>{
  load();const before=world(store.getState());editor.setState({frozenOutlineWorldPoints:new Map([['shape',before]])});
  store.getState().moveJoint('right',{x:75,y:40});const saved=projectText();assert(importProject(saved).ok);world(store.getState()).forEach((p,i)=>near(p,before[i]));
});

test('body deletion removes attached assets and target references, with complete one-step undo',()=>{
  const g=graph();g.tracers.trace={id:'trace',bodyId:'arm',localPosition:{x:10,y:10},enabled:true};g.colliders.wall={id:'wall',jointIdA:'left',jointIdC:'right',bodyIds:['arm']};load(g);
  const before=snapshotMechanism(store.getState());store.getState().removeBody('arm');
  assert.equal(store.getState().images.picture,undefined);assert.equal(store.getState().outlines.shape,undefined);assert.equal(store.getState().tracers.trace,undefined);assert.deepEqual(store.getState().colliders.wall.bodyIds,[]);
  assert(decodeDocument(projectText()).ok);store.getState().undo();assert.deepEqual(snapshotMechanism(store.getState()),before);
});

test('image numeric and reflection edits are atomic, finite and undoable',()=>{
  load();const before=structuredClone(store.getState().images.picture),count=store.getState().past.length;
  store.getState().editImage('picture',{scale:2,flipX:true});assert.equal(store.getState().past.length,count+1);store.getState().undo();assert.deepEqual(store.getState().images.picture,before);
  for(const update of [{scale:0},{rotation:NaN},{opacity:2},{bodyId:'missing'}])store.getState().editImage('picture',update);assert.deepEqual(store.getState().images.picture,before);
});

test('constructive mirror preserves source IDs/rest metadata and completes same-body rigidity',()=>{
  const g=graph();g.joints={a:joint('a',10,0),b:joint('b',30,0)};g.bodies.arm.jointIds=['a','b'];g.links.custom={id:'custom',jointIds:['a','b'],restLength:20,mass:7};load(g);
  const before=snapshotMechanism(store.getState()),ids=store.getState().mirrorAcrossAxis('vertical',0,'selection',new Set(['custom']));
  assert(ids.length>=3);assert.deepEqual(store.getState().links.custom,before.links.custom);assert.equal(store.getState().bodies.arm.jointIds.length,4);
  const visible=Object.values(store.getState().links).filter(l=>l.jointIds.every(id=>!store.getState().joints[id].hidden));assert.equal(visible.length,6);
  for(const id of ids)assert(store.getState().joints[id]||store.getState().links[id]);store.getState().undo();assert.deepEqual(snapshotMechanism(store.getState()),before);
});

test('trim is explicitly scoped, preserves all surviving edges, and is one undo action',()=>{
  load();const second=store.getState().addOutline('arm',[{x:200,y:0},{x:300,y:0},{x:300,y:100},{x:200,y:100}]);
  editor.setState({selectedIds:new Set(['shape']),trimScope:'selected'});editor.getState().setCreateTool('trim');
  const before=snapshotMechanism(store.getState()),count=store.getState().past.length;
  assert(beginGeometry({x:50,y:-20},false));moveGeometry({x:50,y:20});finishGeometry(true);
  assert.equal(store.getState().outlines.shape.closed,false);assert.equal(store.getState().outlines.shape.points.length,4);assert.deepEqual(store.getState().outlines[second],before.outlines[second]);assert.equal(store.getState().past.length,count+1);
  store.getState().undo();assert.deepEqual(snapshotMechanism(store.getState()),before);
  editor.setState({selectedIds:new Set()});beginGeometry({x:50,y:-20},false);moveGeometry({x:50,y:20});finishGeometry(true);assert.deepEqual(snapshotMechanism(store.getState()),before);
});

test('undo invalidates frozen trim runs before redraw, including multiple cuts',()=>{
  load();const before=world(store.getState());editor.setState({frozenOutlineWorldPoints:new Map([['shape',before]]),selectedIds:new Set(['shape'])});editor.getState().setCreateTool('trim');
  beginGeometry({x:50,y:-20},false);moveGeometry({x:50,y:120});finishGeometry(true);
  assert.equal(Object.keys(store.getState().outlines).length,2);assert(editor.getState().frozenOutlineWorldPoints.size>0);
  store.getState().undo();assert.equal(editor.getState().frozenOutlineWorldPoints.size,0);world(store.getState()).forEach((p,i)=>near(p,before[i]));
});

test('cancelled primitive creates no graph or history; committed rectangle persists closed',()=>{
  load();editor.getState().setCreateTool('rectangle');const before=snapshotMechanism(store.getState()),count=store.getState().past.length;
  beginGeometry({x:200,y:200},false);moveGeometry({x:300,y:300});finishGeometry(false);assert.deepEqual(snapshotMechanism(store.getState()),before);assert.equal(store.getState().past.length,count);
  beginGeometry({x:200,y:200},false);moveGeometry({x:300,y:300});finishGeometry(true);assert.equal(Object.keys(store.getState().outlines).length,2);assert(importProject(projectText()).ok);
});

test('trimmed open paths have neither a phantom closing hit nor a filled selection area',()=>{
  const g=graph();g.outlines.shape.closed=false;g.outlines.shape.points=[{x:0,y:0},{x:100,y:0},{x:100,y:100}];
  assert.equal(hitTestOutline({x:50,y:50},g.outlines,g.bodies,g.joints,1),null);assert.equal(hitTestOutlineFilled({x:70,y:30},g.outlines,g.bodies,g.joints,'base'),null);
  assert(!selectInRegion(g,{kind:'box',start:{x:60,y:20},end:{x:80,y:40}},new Set()).has('shape'));
});

test('closed/bitmap-reflection/frame extensions validate and survive serialized round-trip',()=>{
  load();store.getState().editOutline('shape',{closed:false});store.getState().editImage('picture',{flipX:true});const saved=projectText();assert(importProject(saved).ok);
  assert.equal(store.getState().outlines.shape.closed,false);assert.equal(store.getState().images.picture.flipX,true);assert(store.getState().bodies.arm.frame);
  const bad=JSON.parse(saved);bad.bodies.arm.frame.jointIds=['missing','left'];assert.equal(decodeDocument(JSON.stringify(bad)).ok,false);
});

test('world/local conversions retain a transformed frame without accumulating repeated projection drift',()=>{
  const body:Body={...graph().bodies.arm,frame:{jointIds:['center','left'],angleOffset:.7}},g=graph();
  const frame=computeBodyTransform(body,g.joints);let p={x:30,y:70};for(let i=0;i<100;i++)p=localToWorld(worldToLocal(p,frame),frame);near(p,{x:30,y:70});
});
