import { X, RefreshCw, Trash2 } from 'lucide-react';
import { SpringIcon, DamperIcon, TorsionIcon } from './Toolbar/ToolIcons';
import type { MechanismSpring, SpringAnchor } from '../types';
import { useEditorStore } from '../store/editor-store';
import { useMechanismStore } from '../store/mechanism-store';
import { resolveSpringAnchor } from '../core/springs/spring-model';
import { setProjectMessage } from '../document/project';
import { CommitInput } from './CommitInput';

const tools = [
  { id: 'spring', name: 'Linear spring', Icon: SpringIcon },
  { id: 'damper', name: 'Damper', Icon: DamperIcon },
  { id: 'torsion', name: 'Torsion spring', Icon: TorsionIcon },
] as const;

export function SpringTools({ compact = false }: { compact?: boolean }) {
  const e = useEditorStore();
  return <>{tools.map(({ id, name, Icon }) => <button type="button" key={id} aria-label={name} title={name}
    aria-pressed={e.activeTool === 'joint' && e.createTool === id}
    className={(compact ? 'collapsed-tool-btn' : 'tool-btn') + (e.activeTool === 'joint' && e.createTool === id ? ' active' : '')}
    onClick={() => e.setCreateTool(id)}><Icon size={17}/>{!compact && <span className="tool-name">{name}</span>}</button>)}</>;
}

export function SpringOptions() {
  const e = useEditorStore();
  if (e.mode !== 'create' || e.activeTool !== 'joint' || !['spring', 'damper', 'torsion'].includes(e.createTool)) return null;
  return <div className="geometry-options" role="group" aria-label="Spring options">
    {e.createTool !== 'torsion' && <label>Link Snap<CommitInput key={e.springSnapSteps} label="Spring link snap intervals" value={e.springSnapSteps} numeric min={2} max={1000}
      commit={value => { if (Number.isInteger(Number(value))) useEditorStore.setState({ springSnapSteps: Number(value) }); }}/></label>}
    <button type="button" className="tool-btn" aria-label="Cancel spring placement" title="Cancel spring placement" disabled={!e.springPlacement && !e.springReattachId}
      onClick={() => useEditorStore.setState({ springPlacement: null, springReattachId: null })}><X size={18}/></button>
  </div>;
}

export function SpringList() {
  const m = useMechanismStore(), e = useEditorStore();
  if (!Object.keys(m.springs).length) return null;
  return <div className="panel-content"><div className="panel-title">Springs</div>
    {Object.values(m.springs).map(spring => <button type="button" className="tool-btn" key={spring.id}
      aria-label={`Properties for ${spring.name ?? spring.id}`} disabled={e.mode !== 'create'}
      aria-pressed={e.selectedIds.has(spring.id)} onClick={() => e.select(spring.id)}>
      {spring.kind === 'torsional' ? <TorsionIcon size={16}/> : spring.kind === 'damper' ? <DamperIcon size={16}/> : <SpringIcon size={16}/>}
      <span className="tool-name">{spring.name ?? spring.id}</span></button>)}
  </div>;
}

function report(work: () => void) {
  try { work(); setProjectMessage(''); } catch (error) { setProjectMessage(error instanceof Error ? error.message : 'Invalid spring settings.', 'alert'); }
}

function AnchorFields({ spring, side }: { spring: MechanismSpring; side: 'A' | 'B' }) {
  const m = useMechanismStore(), anchor = spring[side === 'A' ? 'anchorA' : 'anchorB'];
  const name = `Attachment ${side}`;
  const edit = (next: SpringAnchor) => report(() => m.editSpring(spring.id, { [side === 'A' ? 'anchorA' : 'anchorB']: next }));
  const joints = Object.values(m.joints).filter(j => !j.hidden);
  const links = Object.values(m.links).filter(l => l.jointIds.every(id => !m.joints[id]?.hidden));
  return <fieldset className="spring-anchor-fields"><legend>{name}</legend>
    {spring.kind !== 'torsional' && <label>Type<select aria-label={`${name} type`} value={anchor.type} onChange={event => {
      if (event.target.value === 'joint' && joints[0]) edit({ type: 'joint', jointId: joints[0].id });
      if (event.target.value === 'link' && links[0]) edit({ type: 'link', linkId: links[0].id, t: .5 });
      if (event.target.value === 'world') edit({ type: 'world', position: resolveSpringAnchor(anchor, m.joints, m.links) ?? { x: 0, y: 0 } });
    }}><option value="joint" disabled={!joints.length}>Joint</option><option value="link" disabled={!links.length}>Link</option><option value="world">World</option></select></label>}
    {anchor.type === 'joint' && <label>Joint<select aria-label={`${name} joint`} value={anchor.jointId} onChange={event => edit({ ...anchor, jointId: event.target.value })}>{joints.map(joint => <option key={joint.id} value={joint.id}>{joint.id}</option>)}</select></label>}
    {anchor.type === 'link' && <>
      <label>Link<select aria-label={`${name} link`} value={anchor.linkId} onChange={event => edit({ ...anchor, linkId: event.target.value })}>{links.map(link => <option key={link.id} value={link.id}>{link.jointIds.join(' / ')}</option>)}</select></label>
      {spring.kind === 'torsional' ? <label>Endpoint<select aria-label={`${name} endpoint`} value={anchor.t} onChange={event => edit({ ...anchor, t: Number(event.target.value) })}><option value={0}>1</option><option value={1}>2</option></select></label>
        : <label>Fraction<CommitInput key={spring.id + side + anchor.t} label={`${name} fraction`} value={anchor.t} numeric min={0} max={1} commit={value => edit({ ...anchor, t: Number(value) })}/></label>}
    </>}
    {anchor.type === 'world' && (['x', 'y'] as const).map(axis => <label key={axis}>{axis.toUpperCase()}<CommitInput key={spring.id + side + axis + anchor.position[axis]} label={`${name} ${axis.toUpperCase()}`} value={anchor.position[axis]} numeric commit={value => edit({ ...anchor, position: { ...anchor.position, [axis]: Number(value) } })}/></label>)}
  </fieldset>;
}

export function SpringProperties({ spring }: { spring: MechanismSpring }) {
  const m = useMechanismStore(), e = useEditorStore(), angular = spring.kind === 'torsional';
  const edit = (updates: Partial<MechanismSpring>) => report(() => m.editSpring(spring.id, updates));
  return <div className="panel-content"><div className="panel-title">{angular ? 'Torsion Spring' : spring.kind === 'damper' ? 'Damper' : 'Linear Spring'}</div>
    <label>Name<CommitInput key={spring.id + spring.name} label="Spring name" value={spring.name ?? spring.id} commit={name => edit({ name })}/></label>
    {spring.kind !== 'damper' && <label>Stiffness<CommitInput key={spring.id + 'k' + spring.stiffness} label="Spring motion stiffness" value={spring.stiffness} numeric min={0} commit={value => edit({ stiffness: Number(value) })}/></label>}
    <label>Damping<CommitInput key={spring.id + 'c' + spring.damping} label="Spring motion damping" value={spring.damping} numeric min={0} commit={value => edit({ damping: Number(value) })}/></label>
    {spring.kind !== 'damper' && <>
      <label>{angular ? 'Rest Angle' : 'Rest Length'}<CommitInput key={spring.id + 'rest' + spring.restLength} label={angular ? 'Spring rest angle degrees' : 'Spring rest length'} value={angular ? spring.restLength * 180 / Math.PI : spring.restLength} numeric min={angular ? undefined : 0}
        commit={value => edit({ restLength: Number(value) * (angular ? Math.PI / 180 : 1) })}/>{angular && <span>deg</span>}</label>
      <label>Rest Offset<CommitInput key={spring.id + 'offset' + spring.prestressDelta} label={angular ? 'Spring rest angle offset degrees' : 'Spring rest length offset'} value={angular ? spring.prestressDelta * 180 / Math.PI : spring.prestressDelta} numeric min={angular ? undefined : -spring.restLength}
        commit={value => edit({ prestressDelta: Number(value) * (angular ? Math.PI / 180 : 1) })}/>{angular && <span>deg</span>}</label>
    </>}
    <AnchorFields spring={spring} side="A"/><AnchorFields spring={spring} side="B"/>
    <div className="geometry-actions"><button type="button" className="tool-btn" aria-label="Reattach spring" title="Reattach spring" onClick={() => { e.setCreateTool(angular ? 'torsion' : spring.kind === 'damper' ? 'damper' : 'spring'); useEditorStore.setState({ springReattachId: spring.id }); }}><RefreshCw size={16}/></button>
      <button type="button" className="tool-btn" aria-label="Delete spring" title="Delete spring" onClick={() => { m.removeSpring(spring.id); e.clearSelection(); }}><Trash2 size={16}/></button></div>
  </div>;
}
