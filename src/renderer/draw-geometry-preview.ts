import type { CameraState, CreateTool, Vec2 } from '../types';
import { rectanglePoints, circlePoints, ngonPoints } from '../core/shape-geometry';

export function drawGeometryPreview(ctx: CanvasRenderingContext2D, state: {
  camera: CameraState; createTool: CreateTool; activeTool: string; mode: string;
  shapeGesture: {start: Vec2; end: Vec2; square: boolean} | null; ngonSides: number;
  trimStroke: Vec2[]; mirrorAxis: string; mirrorValue: number;
}, width: number, height: number, pixelRatio: number) {
  if(state.mode!=='create'||state.activeTool!=='joint')return;
  ctx.save();
  const {zoom,pan}=state.camera;
  ctx.setTransform(pixelRatio*zoom,0,0,pixelRatio*zoom,pixelRatio*pan.x,pixelRatio*pan.y);
  let points: Vec2[];
  if(state.shapeGesture){const {start,end,square}=state.shapeGesture;points=state.createTool==='rectangle'?rectanglePoints(start,end,square):state.createTool==='circle'?circlePoints(start,end):ngonPoints(start,end,state.ngonSides);}
  else points=state.trimStroke;
  if(points.length){
    ctx.beginPath();points.forEach((p,i)=>{if(i)ctx.lineTo(p.x,p.y);else ctx.moveTo(p.x,p.y);});
    if(state.shapeGesture){ctx.closePath();ctx.fillStyle='rgba(0,120,150,0.12)';ctx.fill();}
    ctx.strokeStyle=state.shapeGesture?'#007896':'#c33535';ctx.lineWidth=2/zoom;ctx.setLineDash([5/zoom,3/zoom]);ctx.stroke();
  }
  if(state.createTool==='mirror'){
    ctx.setTransform(pixelRatio,0,0,pixelRatio,0,0);ctx.beginPath();
    if(state.mirrorAxis==='vertical'){const x=state.mirrorValue*zoom+pan.x;ctx.moveTo(x,0);ctx.lineTo(x,height);}
    else{const y=state.mirrorValue*zoom+pan.y;ctx.moveTo(0,y);ctx.lineTo(width,y);}
    ctx.strokeStyle='#007896';ctx.lineWidth=1.5;ctx.setLineDash([6,4]);ctx.stroke();
  }
  ctx.restore();
}
