import { Square, Circle, Pentagon, Scissors, FlipHorizontal2, Check, X } from 'lucide-react';
import { useEditorStore } from '../store/editor-store';
import { useMechanismStore } from '../store/mechanism-store';
import { applyMirror, commitOutline } from '../interaction/geometry-tools';
import { CommitInput } from './CommitInput';

const tools = [
  { id: 'rectangle', label: 'Rectangle', Icon: Square },
  { id: 'circle', label: 'Circle', Icon: Circle },
  { id: 'ngon', label: 'N-gon', Icon: Pentagon },
  { id: 'trim', label: 'Trim', Icon: Scissors },
  { id: 'mirror', label: 'Mirror', Icon: FlipHorizontal2 },
] as const;

export function GeometryTools({ compact=false }: { compact?: boolean }) {
  const tool=useEditorStore(s=>s.createTool),drawing=useEditorStore(s=>s.activeTool==='joint');
  return <>{tools.map(({id,label,Icon})=><button type="button" key={id} className={(compact?'collapsed-tool-btn':'tool-btn')+(drawing&&tool===id?' active':'')} title={label} aria-label={label} aria-pressed={drawing&&tool===id} onClick={()=>useEditorStore.getState().setCreateTool(id)}><Icon size={17}/>{!compact&&<span className="tool-name">{label}</span>}</button>)}</>;
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
