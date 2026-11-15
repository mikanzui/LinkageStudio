import type { Vec2 } from '../types';
import { useEditorStore } from '../store/editor-store';
import { useMechanismStore } from '../store/mechanism-store';
import { rectanglePoints, circlePoints, ngonPoints, trimOutlineEdges } from '../core/shape-geometry';
import { computeBodyTransform, localToWorld, worldToLocal } from '../core/body-transform';
import { resolveFrozenOutlines } from '../core/frozen-outlines';
import { snapToGrid } from '../core/math/vec2';
import { createId } from '../utils/id';
import { setProjectMessage } from '../document/project';

let trimTargets: string[] = [];
let overflow = false;
const primitive = (tool: string) => ['rectangle','circle','ngon'].includes(tool);
const snap = (p: Vec2) => { const e=useEditorStore.getState(); return e.gridEnabled ? snapToGrid(p,e.gridSize) : p; };

export function commitOutline(): void {
  const e=useEditorStore.getState(),m=useMechanismStore.getState();
  if(e.mode!=='create'||e.outlinePoints.length<3)return;
  const bodyId=[...e.activeBodyIds].find(id=>m.bodies[id])??Object.keys(m.bodies).find(id=>id!==m.baseBodyId);
  if(!bodyId)return;
  const frame=computeBodyTransform(m.bodies[bodyId],m.joints),id=m.addOutline(bodyId,e.outlinePoints.map(p=>worldToLocal(p,frame)));
  if(e.lockOutlines)e.updateFrozenOutline(id,e.outlinePoints);
  e.clearOutlinePoints();e.select(id);
}

export function beginGeometry(point: Vec2, shift: boolean): boolean {
  const e=useEditorStore.getState(),m=useMechanismStore.getState();
  if (e.activeTool !== 'joint' || e.mode !== 'create') return false;
  if (primitive(e.createTool)) { const start=snap(point);useEditorStore.setState({shapeGesture:{start,end:start,square:shift||e.square}}); return true; }
  if (e.createTool === 'trim') {
    trimTargets=Object.values(m.outlines).filter(o=>o.visible && (e.trimScope === 'selected' ? e.selectedIds.has(o.id) : e.activeBodyIds.has(o.bodyId))).map(o=>o.id);
    overflow=false;useEditorStore.setState({trimStroke:[point]});return true;
  }
  if (e.createTool === 'mirror') { useEditorStore.setState({mirrorValue:e.mirrorAxis==='vertical'?snap(point).x:snap(point).y});return true; }
  return false;
}

export function moveGeometry(point: Vec2): boolean {
  const e=useEditorStore.getState();
  if(e.shapeGesture){useEditorStore.setState({shapeGesture:{...e.shapeGesture,end:snap(point)}});return true;}
  if(e.trimStroke.length){
    const last=e.trimStroke[e.trimStroke.length-1];
    if(Math.hypot(point.x-last.x,point.y-last.y)*e.camera.zoom>=2){
      if(e.trimStroke.length>=4096)overflow=true;
      else useEditorStore.setState({trimStroke:[...e.trimStroke,point]});
    }
    return true;
  }
  return false;
}

export function finishGeometry(commit: boolean, point?: Vec2): void {
  const m=useMechanismStore.getState();
  if(commit && point)moveGeometry(point);
  const state=useEditorStore.getState();
  if(commit && state.shapeGesture){
    const {start,end,square}=state.shapeGesture;
    const points=state.createTool==='rectangle'?rectanglePoints(start,end,square):state.createTool==='circle'?circlePoints(start,end):ngonPoints(start,end,state.ngonSides);
    const bodyId=[...state.activeBodyIds].find(id=>m.bodies[id])??Object.keys(m.bodies).find(id=>id!==m.baseBodyId);
    if(points.length && bodyId){const frame=computeBodyTransform(m.bodies[bodyId],m.joints),id=m.addOutline(bodyId,points.map(p=>worldToLocal(p,frame)));if(state.lockOutlines)state.updateFrozenOutline(id,points);state.select(id);}
  }
  if(commit && state.trimStroke.length>1){
    if(overflow)setProjectMessage('Trim stroke is too long. No shapes changed.','alert');
    else{
      const outlines=state.lockOutlines?resolveFrozenOutlines(m.outlines,m.bodies,m.joints,state.frozenOutlineWorldPoints):{...m.outlines};
      const frozen=new Map(state.frozenOutlineWorldPoints);let changed=false;
      for(const id of trimTargets){
        const o=outlines[id],body=o&&m.bodies[o.bodyId];if(!o||!body)continue;
        const frame=computeBodyTransform(body,m.joints),world=o.points.map(p=>localToWorld(p,frame)),runs=trimOutlineEdges(world,o.closed!==false,state.trimStroke);
        if(runs===null)continue;
        changed=true;delete outlines[id];frozen.delete(id);
        runs.forEach((run,index)=>{const target=index?createId():id;outlines[target]={...o,id:target,name:index?o.name+' '+(index+1):o.name,closed:false,points:run.map(p=>worldToLocal(p,frame))};if(state.lockOutlines)frozen.set(target,run);});
      }
      if(changed){m.pushHistory();useMechanismStore.setState({outlines});useEditorStore.setState({frozenOutlineWorldPoints:frozen});}
    }
  }
  trimTargets=[];overflow=false;useEditorStore.setState({shapeGesture:null,trimStroke:[]});
}

export function applyMirror(): void {
  const e=useEditorStore.getState(),m=useMechanismStore.getState();if(e.mode!=='create')return;
  try{
    const ids=m.mirrorAcrossAxis(e.mirrorAxis,e.mirrorValue,e.mirrorScope,e.selectedIds);
    useEditorStore.setState({selectedIds:new Set(ids),frozenOutlineWorldPoints:new Map()});
    setProjectMessage(ids.length?'Mirrored geometry.':'No geometry mirrored.');
  }catch(error){setProjectMessage(error instanceof Error?error.message:String(error),'alert');}
}
