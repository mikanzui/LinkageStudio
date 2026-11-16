import { FlipHorizontal2, Check, X } from 'lucide-react';
import { DrawIcon, OutlineIcon, RectangleIcon, CircleIcon, NgonIcon, TrimIcon } from './Toolbar/ToolIcons';
import { useEditorStore } from '../store/editor-store';
import { useMechanismStore } from '../store/mechanism-store';
import { applyMirror, commitOutline } from '../interaction/geometry-tools';
import { CommitInput } from './CommitInput';

const drawTools = [
  { id: 'outline', label: 'Outline', Icon: OutlineIcon },
  { id: 'rectangle', label: 'Rectangle', Icon: RectangleIcon },
  { id: 'circle', label: 'Circle', Icon: CircleIcon },
  { id: 'ngon', label: 'N-gon', Icon: NgonIcon },
  { id: 'trim', label: 'Trim', Icon: TrimIcon },
] as const;

export function DrawToolButton({ compact = false }: { compact?: boolean }) {
  const tool = useEditorStore(s => s.createTool), drawing = useEditorStore(s => s.activeTool === 'joint');
  const active = drawing && drawTools.some(({ id }) => id === tool);
  return <button type="button" className={(compact ? 'collapsed-tool-btn' : 'tool-btn') + (active ? ' active' : '')}
    title="Draw" aria-label="Draw" aria-pressed={active} onClick={() => useEditorStore.getState().setCreateTool('outline')}>
    <DrawIcon />{!compact && <span className="tool-name">Draw</span>}
  </button>;
}

export function DrawPalette() {
  const mode = useEditorStore(s => s.mode), tool = useEditorStore(s => s.createTool);
  const drawing = useEditorStore(s => s.activeTool === 'joint');
  if (mode !== 'create' || !drawing || !drawTools.some(({ id }) => id === tool)) return null;
  return <div className="shape-draw-palette" role="toolbar" aria-label="Draw overlay tools">
    {drawTools.map(({ id, label, Icon }) => <button type="button" key={id}
      className={'shape-draw-palette-btn' + (tool === id ? ' active' : '')}
      title={label} aria-label={label} aria-pressed={tool === id}
      onClick={() => useEditorStore.getState().setCreateTool(id)}><Icon /></button>)}
  </div>;
}

export function MirrorToolButton({ compact=false }: { compact?: boolean }) {
  const tool=useEditorStore(s=>s.createTool),drawing=useEditorStore(s=>s.activeTool==='joint');
  return <button type="button" className={(compact?'collapsed-tool-btn':'tool-btn')+(drawing&&tool==='mirror'?' active':'')} title="Mirror" aria-label="Mirror" aria-pressed={drawing&&tool==='mirror'} onClick={()=>useEditorStore.getState().setCreateTool('mirror')}><FlipHorizontal2 size={17}/>{!compact&&<span className="tool-name">Mirror</span>}</button>;
}

export function GeometryOptions() {
  const e=useEditorStore(),m=useMechanismStore();
  if(e.mode!=='create'||e.activeTool!=='joint'||!['rectangle','ngon','trim','mirror','outline','circle'].includes(e.createTool))return null;
  return <div className="geometry-options" role="group" aria-label="Geometry options">
    {e.createTool==='outline'&&!e.editingOutlineId&&<><button type="button" className="tool-btn" aria-label="Finish outline" title="Finish outline" disabled={e.outlinePoints.length<3} onClick={commitOutline}><Check size={18}/></button><button type="button" className="tool-btn" aria-label="Cancel outline" title="Cancel outline" onClick={()=>e.setCreateTool('joints')}><X size={18}/></button></>}
    {e.createTool==='rectangle'&&<label><input type="checkbox" checked={e.square} onChange={event=>useEditorStore.setState({square:event.target.checked})}/>Square</label>}
    {e.createTool==='ngon'&&<label>Sides<CommitInput key={e.ngonSides} label="Polygon sides" numeric min={3} max={128} value={e.ngonSides} commit={value=>{const n=Number(value);if(Number.isInteger(n))useEditorStore.setState({ngonSides:n});}}/></label>}
    {e.createTool==='trim'&&<fieldset><legend>Trim Scope</legend><label><input type="radio" name="trim-scope" checked={e.trimScope==='selected'} onChange={()=>useEditorStore.setState({trimScope:'selected'})}/>Selected Shapes</label><label><input type="radio" name="trim-scope" checked={e.trimScope==='active'} onChange={()=>useEditorStore.setState({trimScope:'active'})}/>Active Bodies</label></fieldset>}
    {e.createTool==='mirror'?<>
      <fieldset><legend>Axis</legend>{(['vertical','horizontal'] as const).map(axis=><label key={axis}><input type="radio" name="mirror-axis" checked={e.mirrorAxis===axis} onChange={()=>useEditorStore.setState({mirrorAxis:axis})}/>{axis==='vertical'?'Vertical':'Horizontal'}</label>)}</fieldset>
      <label>Coordinate<CommitInput key={e.mirrorValue} label="Mirror axis coordinate" value={e.mirrorValue} numeric commit={value=>useEditorStore.setState({mirrorValue:Number(value)})}/></label>
      <fieldset><legend>Scope</legend>{(['selection','all'] as const).map(scope=><label key={scope}><input type="radio" name="mirror-scope" checked={e.mirrorScope===scope} onChange={()=>useEditorStore.setState({mirrorScope:scope})}/>{scope==='selection'?'Selection':'All'}</label>)}</fieldset>
      <button type="button" className="tool-btn" aria-label="Apply mirror" title="Apply mirror" onClick={applyMirror}><Check size={18}/></button>
    </>:e.createTool!=='trim'&&<label><input type="checkbox" aria-label="Shape positions locked" checked={e.lockOutlines} onChange={event=>{if(!event.target.checked)m.reprojectOutlinesFromWorld(e.frozenOutlineWorldPoints);e.setLockOutlines(event.target.checked);}}/>Lock Shapes</label>}
  </div>;
}
