import type { Vec2, Outline } from '../types';
import { useEditorStore } from '../store/editor-store';
import { useMechanismStore } from '../store/mechanism-store';
import { rectanglePoints, circlePoints, ngonPoints } from '../core/shape-geometry';
import { prepareSketchTrim } from '../core/sketch-trim';
import type { TrimMethod, SketchOutline } from '../core/sketch-trim';
import { computeBodyTransform, localToWorld, worldToLocal } from '../core/body-transform';
import { resolveFrozenOutlines } from '../core/frozen-outlines';
import { snapToGrid } from '../core/math/vec2';
import { createId } from '../utils/id';
import { setProjectMessage } from '../document/project';

type TrimFrame = {
  outlines: Record<string, Outline>; targets: Set<string>; prepared: ReturnType<typeof prepareSketchTrim>;
  originalOutlines: ReturnType<typeof useMechanismStore.getState>['outlines'];
  joints: ReturnType<typeof useMechanismStore.getState>['joints'];
  bodies: ReturnType<typeof useMechanismStore.getState>['bodies'];
};
let trimFrame: TrimFrame | null = null;
let trimCache: { key: unknown[]; frame: TrimFrame } | null = null;
let gestureMethod: TrimMethod = 'power';
let overflow = false;
const primitive = (tool: string) => ['rectangle','circle','ngon'].includes(tool);
const snap = (p: Vec2) => { const e=useEditorStore.getState(); return e.gridEnabled ? snapToGrid(p,e.gridSize) : p; };

function getTrimFrame(): TrimFrame {
  const e = useEditorStore.getState(), m = useMechanismStore.getState();
  const key = [m.outlines, m.bodies, m.joints, e.frozenOutlineWorldPoints, e.lockOutlines, e.selectedIds, e.activeBodyIds, e.trimScope];
  if (trimCache && key.every((value, i) => value === trimCache!.key[i])) return trimCache.frame;
  const outlines = e.lockOutlines ? resolveFrozenOutlines(m.outlines, m.bodies, m.joints, e.frozenOutlineWorldPoints) : m.outlines;
  const world: SketchOutline[] = [], targets = new Set<string>();
  for (const outline of Object.values(outlines)) {
    const body = m.bodies[outline.bodyId];
    if (!outline.visible || !body) continue;
    const frame = computeBodyTransform(body, m.joints);
    world.push({ id: outline.id, points: outline.points.map(p => localToWorld(p, frame)), closed: outline.closed !== false, primitive: outline.primitive });
    if (e.trimScope === 'selected' ? e.selectedIds.has(outline.id) : e.activeBodyIds.has(outline.bodyId)) targets.add(outline.id);
  }
  const frame: TrimFrame = { outlines, targets, prepared: prepareSketchTrim(world), originalOutlines: m.outlines, joints: m.joints, bodies: m.bodies };
  trimCache = { key, frame };
  return frame;
}

function previewTrim(stroke: Vec2[], frame: TrimFrame, method: TrimMethod) {
  const e = useEditorStore.getState();
  const result = frame.prepared.apply(stroke, frame.targets, method, 8 / e.camera.zoom);
  useEditorStore.setState({ trimPreview: result.preview });
  return result;
}

function trimError(error: unknown) {
  useEditorStore.setState({ trimPreview: [] });
  setProjectMessage(error instanceof Error ? error.message : 'Cannot trim this sketch. No shapes changed.', 'alert');
}

export function commitOutline(): void {
  const e=useEditorStore.getState(),m=useMechanismStore.getState();
  if(e.mode!=='create'||e.outlinePoints.length<2)return;
  const bodyId=[...e.activeBodyIds].find(id=>m.bodies[id])??Object.keys(m.bodies).find(id=>id!==m.baseBodyId);
  if(!bodyId)return;
  const frame=computeBodyTransform(m.bodies[bodyId],m.joints),id=m.addOutline(bodyId,e.outlinePoints.map(p=>worldToLocal(p,frame)),undefined,e.outlinePoints.length === 2 ? false : undefined);
  if(e.lockOutlines)e.updateFrozenOutline(id,e.outlinePoints);
  e.clearOutlinePoints();e.select(id);
}

export function beginGeometry(point: Vec2, shift: boolean): boolean {
  const e=useEditorStore.getState();
  if (e.activeTool !== 'joint' || e.mode !== 'create') return false;
  if (primitive(e.createTool)) { const start=snap(point);useEditorStore.setState({shapeGesture:{start,end:start,square:shift||e.square}}); return true; }
  if (e.createTool === 'trim') {
    overflow = false; gestureMethod = shift ? 'extend' : e.trimMode;
    try {
      trimFrame = getTrimFrame();
      useEditorStore.setState({ trimStroke: [point] });
      previewTrim([point], trimFrame, gestureMethod);
    } catch (error) { trimFrame = null; useEditorStore.setState({ trimStroke: [] }); trimError(error); }
    return true;
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
      else {
        const stroke = [...e.trimStroke,point]; useEditorStore.setState({trimStroke:stroke});
        if (trimFrame && !overflow) try { previewTrim(stroke, trimFrame, gestureMethod); } catch (error) { overflow = true; trimError(error); }
      }
    }
    return true;
  }
  if (e.mode === 'create' && e.activeTool === 'joint' && e.createTool === 'trim' && e.trimMode !== 'power') {
    try { previewTrim([point], getTrimFrame(), e.trimMode); } catch (error) { trimError(error); }
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
    const kind = state.createTool === 'rectangle' ? 'rectangle' : state.createTool === 'circle' ? 'circle' : 'ngon';
    if(points.length && bodyId){const frame=computeBodyTransform(m.bodies[bodyId],m.joints),id=m.addOutline(bodyId,points.map(p=>worldToLocal(p,frame)),kind);if(state.lockOutlines)state.updateFrozenOutline(id,points);state.select(id);}
  }
  if(commit && trimFrame && state.trimStroke.length>=(gestureMethod === 'power' ? 2 : 1)){
    if(overflow)setProjectMessage('Trim stroke is too long. No shapes changed.','alert');
    else{
      try {
        const captured = trimFrame;
        if (m.outlines !== captured.originalOutlines || m.joints !== captured.joints || m.bodies !== captured.bodies) throw new Error('Sketch changed during trim. No shapes changed.');
        const result = captured.prepared.apply(state.trimStroke, captured.targets, gestureMethod, 8 / state.camera.zoom);
        const outlines = { ...captured.outlines }, frozen = new Map(state.frozenOutlineWorldPoints);
        for (const [id, runs] of result.changes) {
          const o = outlines[id], frame = computeBodyTransform(m.bodies[o.bodyId], m.joints);
          delete outlines[id]; frozen.delete(id);
          runs.forEach((run, index) => {
            if (run.points.length < 2 || !run.points.every(p => Number.isFinite(p.x) && Number.isFinite(p.y))) throw new Error('Invalid trim result. No shapes changed.');
            const target = index ? createId() : id;
            outlines[target] = { ...o, id: target, name: index ? o.name + ' ' + (index + 1) : o.name, closed: false,
              primitive: run.circle ? 'circle' : o.primitive === 'circle' ? undefined : o.primitive,
              points: run.points.map(p => worldToLocal(p, frame)) };
            if (state.lockOutlines) frozen.set(target, run.points);
          });
        }
        if (result.changes.size) {
          m.pushHistory(); useMechanismStore.setState({ outlines });
          useEditorStore.setState({ frozenOutlineWorldPoints: frozen, selectedIds: new Set([...state.selectedIds].filter(id => !captured.targets.has(id) || !!outlines[id])) });
        }
      } catch (error) { trimError(error); }
    }
  }
  trimFrame=null;trimCache=null;overflow=false;useEditorStore.setState({shapeGesture:null,trimStroke:[],trimPreview:[]});
}

export function applyMirror(): void {
  const e=useEditorStore.getState(),m=useMechanismStore.getState();if(e.mode!=='create')return;
  try{
    const ids=m.mirrorAcrossAxis(e.mirrorAxis,e.mirrorValue,e.mirrorScope,e.selectedIds);
    useEditorStore.setState({selectedIds:new Set(ids),frozenOutlineWorldPoints:new Map()});
    setProjectMessage(ids.length?'Mirrored geometry.':'No geometry mirrored.');
  }catch(error){setProjectMessage(error instanceof Error?error.message:String(error),'alert');}
}
