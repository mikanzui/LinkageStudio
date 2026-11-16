import { useEditorStore } from '../../store/editor-store';
import { useMechanismStore } from '../../store/mechanism-store';
import { CommitInput } from '../CommitInput';
import { Pencil, Check, Trash2 } from 'lucide-react';
import { computeBodyTransform, localToWorld, worldToLocal } from '../../core/body-transform';
import { exitOutlineEditMode } from '../../interaction/tool-manager';
import { deleteSelectedEntities } from '../../utils/delete-selection';
import { SpringProperties } from '../SpringTools';
import { ObjectProperties } from '../ObjectTools';

export function PropertyPanel() {
  const editor = useEditorStore();
  const m = useMechanismStore();
  if (!editor.selectedIds.size) return null;
  const id = [...editor.selectedIds][0], joint = m.joints[id], outline = m.outlines[id], image = m.images[id];
  if (joint || m.links[id] || m.tracers[id] || m.forceSensors[id]) return <ObjectProperties id={id}/>;
  if (editor.mode !== 'create') return null;
  if (m.springs[id]) return <SpringProperties spring={m.springs[id]}/>;
  const bodyOptions = Object.values(m.bodies).map(body => <option key={body.id} value={body.id}>{body.name}</option>);
  const remove = <button className="tool-btn" type="button" aria-label={image ? 'Delete image' : 'Delete shape'} title={image ? 'Delete image' : 'Delete shape'} onClick={()=>{if(outline){m.removeOutline(id);editor.setEditingOutline(null);}else deleteSelectedEntities();}}><Trash2 size={16}/></button>;
  if (outline) {
    const editing = editor.editingOutlineId === id, vertex = editor.editingVertexIndex;
    const transform = computeBodyTransform(m.bodies[outline.bodyId],m.joints);
    const point = vertex !== null && outline.points[vertex] ? localToWorld(outline.points[vertex],transform) : null;
    return <div className="panel-content">
      <div className="panel-title">Shape</div>
      <label>Name<CommitInput key={id+outline.name} label="Shape name" value={outline.name} commit={name => m.editOutline(id,{name})}/></label>
      <label>Body<select aria-label="Shape body" value={outline.bodyId} onChange={event => { if (editing) exitOutlineEditMode(); m.editOutline(id,{bodyId:event.target.value}); }}>{bodyOptions}</select></label>
      <label><input type="checkbox" aria-label="Shape visible" checked={outline.visible} onChange={event => m.editOutline(id,{visible:event.target.checked})}/>Visible</label>
      <label><input type="checkbox" aria-label="Closed shape" checked={outline.closed !== false} disabled={outline.points.length < 3} onChange={event => m.editOutline(id,{closed:event.target.checked})}/>Closed</label>
      <div className="geometry-actions"><button className="tool-btn" type="button" aria-label={editing ? 'Finish vertex editing' : 'Edit vertices'} title={editing ? 'Finish vertex editing' : 'Edit vertices'} onClick={() => { if (editing) exitOutlineEditMode(); else editor.setEditingOutline(id); }}>{editing ? <Check size={16}/> : <Pencil size={16}/>}</button>{remove}</div>
      {editing && <>
        <label>Vertex<select aria-label="Shape vertex" value={vertex ?? ''} onChange={event => editor.setEditingVertexIndex(event.target.value === '' ? null : Number(event.target.value))}><option value="">-</option>{outline.points.map((_,index) => <option key={index} value={index}>{index+1}</option>)}</select></label>
        {point && (['x','y'] as const).map(axis => <label key={axis}>{axis.toUpperCase()}<CommitInput key={id+vertex+axis+point[axis]} label={'Vertex '+axis.toUpperCase()} value={point[axis]} numeric commit={value => { const points=outline.points.map(p=>({...p})); points[vertex!]=worldToLocal({...point,[axis]:Number(value)},transform); m.editOutline(id,{points}); }}/></label>)}
      </>}
    </div>;
  }
  if (image) return <div className="panel-content">
    <div className="panel-title">Image</div><div className="panel-info">{image.naturalWidth} x {image.naturalHeight} px</div>
    <label>Body<select aria-label="Image body" value={image.bodyId} onChange={event=>m.editImage(id,{bodyId:event.target.value})}>{bodyOptions}</select></label>
    {(['x','y'] as const).map(axis=><label key={axis}>{axis.toUpperCase()}<CommitInput key={id+axis+image.position[axis]} label={'Image '+axis.toUpperCase()} value={image.position[axis]} numeric commit={value=>m.editImage(id,{position:{...image.position,[axis]:Number(value)}})}/></label>)}
    <label>Scale<CommitInput key={id+'scale'+image.scale} label="Image scale" value={image.scale} numeric min={0.0001} commit={value=>m.editImage(id,{scale:Number(value)})}/></label>
    <label>Rotation<CommitInput key={id+'rotation'+image.rotation} label="Image rotation degrees" value={image.rotation*180/Math.PI} numeric commit={value=>m.editImage(id,{rotation:Number(value)*Math.PI/180})}/><span>deg</span></label>
    <label>Opacity<CommitInput key={id+'opacity'+image.opacity} label="Image opacity percent" value={image.opacity*100} numeric min={0} max={100} commit={value=>m.editImage(id,{opacity:Number(value)/100})}/><span>%</span></label>
    <label><input type="checkbox" aria-label="Image reflected" checked={image.flipX ?? false} onChange={event=>m.editImage(id,{flipX:event.target.checked})}/>Reflected</label>
    <label><input type="checkbox" aria-label="Image visible" checked={image.visible} onChange={event=>m.editImage(id,{visible:event.target.checked})}/>Visible</label>{remove}
  </div>;
  return null;
}
