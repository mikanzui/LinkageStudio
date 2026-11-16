import { useEffect, useMemo, useRef } from 'react';
import { CircleDot, FlipHorizontal2, Trash2, X } from 'lucide-react';
import { ForceSensorIcon } from './Toolbar/ToolIcons';
import { useEditorStore } from '../store/editor-store';
import { useMechanismStore } from '../store/mechanism-store';
import { useSimulationStore } from '../store/simulation-store';
import { computeBodyTransform, localToWorld, worldToLocal } from '../core/body-transform';
import { setProjectMessage } from '../document/project';
import { CommitInput } from './CommitInput';
import type { ForceSample } from '../store/simulation-store';
import type { ForceSensor, Tracer } from '../types';
import './ObjectTools.css';

const short = (id: string) => id.slice(0, 8);
const number = (value: number | null | undefined) => typeof value === 'number' && Number.isFinite(value) ? Number(value.toPrecision(6)).toString() : 'Unavailable';
function report(work: () => void) {
  try { work(); setProjectMessage(''); }
  catch (error) { setProjectMessage(error instanceof Error ? error.message : 'Invalid object settings.', 'alert'); }
}
function Mirrored() { return <span className="object-mirrored" title="Mirrored joint" role="img" aria-label="Mirrored joint"><FlipHorizontal2 size={14}/></span>; }
function Readout({ label, value }: { label: string; value: string }) {
  return <label>{label}<output aria-label={label}>{value}</output></label>;
}

export function SensorToolButton({ compact = false }: { compact?: boolean }) {
  const e = useEditorStore(), active = e.activeTool === 'joint' && e.createTool === 'force-sensor';
  return <button type="button" aria-label="Force sensor" title="Force sensor" aria-pressed={active} className={(compact ? 'collapsed-tool-btn' : 'tool-btn') + (active ? ' active' : '')}
    onClick={() => e.setCreateTool('force-sensor')}><ForceSensorIcon size={17}/>{!compact && <span className="tool-name">Force sensor</span>}</button>;
}

export function BodyNodes({ bodyId }: { bodyId: string }) {
  const m = useMechanismStore(), e = useEditorStore();
  if (e.mode !== 'create') return null;
  return <div className="object-node-list" role="group" aria-label={`${m.bodies[bodyId]?.name ?? bodyId} joints`}>{m.bodies[bodyId]?.jointIds.map(id => {
    const joint = m.joints[id];
    return joint && !joint.hidden ? <button key={id} type="button" className="object-pick" title={`Joint ${joint.label || id}`}
      aria-label={`Joint ${joint.label || short(id)} properties`} aria-pressed={e.selectedIds.has(id)} onClick={() => e.select(id)}>
      <CircleDot size={14}/><span>{joint.label || short(id)}</span>{joint.mirrored && <Mirrored/>}
    </button> : null;
  })}</div>;
}

export function RuntimeObjects() {
  const m = useMechanismStore(), e = useEditorStore();
  if (e.mode !== 'simulate') return null;
  const visibleJoints = Object.values(m.joints).filter(j => !j.hidden && !j.id.startsWith('__temp_'));
  const visibleLinks = Object.values(m.links).filter(l => l.jointIds.every(id => m.joints[id] && !m.joints[id].hidden));
  const ids = [...visibleJoints.map(j => j.id), ...visibleLinks.map(l => l.id), ...Object.keys(m.tracers)];
  const selected = [...e.selectedIds].find(id => ids.includes(id)) ?? '';
  return <div className="panel-content object-tools"><label>Inspect<select aria-label="Runtime object" value={selected} onChange={event => { if (event.target.value) e.select(event.target.value); }}>
    <option value="">Choose object</option>
    <optgroup label="Joints">{visibleJoints.map(j => <option key={j.id} value={j.id}>{j.label || `Joint ${short(j.id)}`}</option>)}</optgroup>
    <optgroup label="Links">{visibleLinks.map(l => <option key={l.id} value={l.id}>{l.jointIds.map(id => m.joints[id]?.label || short(id)).join(' / ')}</option>)}</optgroup>
    <optgroup label="Tracers">{Object.values(m.tracers).map(t => <option key={t.id} value={t.id}>{t.name || `Tracer ${short(t.id)}`}</option>)}</optgroup>
  </select></label></div>;
}

export function SensorList() {
  const m = useMechanismStore(), e = useEditorStore();
  if (!Object.keys(m.forceSensors).length) return null;
  return <div className="panel-content object-tools"><div className="panel-title">Force Sensors</div>
    {Object.values(m.forceSensors).map(sensor => <button key={sensor.id} type="button" className="object-pick"
      title={`${sensor.name || `Sensor ${short(sensor.id)}`} properties`} aria-label={`${sensor.name || `Sensor ${short(sensor.id)}`} properties`}
      aria-pressed={e.selectedIds.has(sensor.id)} onClick={() => e.select(sensor.id)}>
      <ForceSensorIcon size={16}/><span>{sensor.name || `Sensor ${short(sensor.id)}`}</span>
    </button>)}
  </div>;
}

function TracerFields({ tracer, create }: { tracer: Tracer; create: boolean }) {
  const m = useMechanismStore(), e = useEditorStore(), body = m.bodies[tracer.bodyId];
  const transform = body ? computeBodyTransform(body, m.joints) : null;
  const world = transform ? localToWorld(tracer.localPosition, transform) : null;
  const edit = (updates: Partial<Tracer>) => report(() => m.editTracer(tracer.id, updates));
  return <>
    {create ? <>
      <label>Name<CommitInput key={tracer.id + tracer.name} label="Tracer name" value={tracer.name ?? ''} commit={name => edit({ name })}/></label>
      <label>Body<select aria-label="Tracer body" value={tracer.bodyId} onChange={event => edit({ bodyId: event.target.value })}>
        {Object.values(m.bodies).map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
      </select></label>
    </> : <><Readout label="Tracer name" value={tracer.name || `Tracer ${short(tracer.id)}`}/><Readout label="Tracer body" value={body?.name ?? 'Unavailable'}/></>}
    {(['x', 'y'] as const).map(axis => create && world && transform ? <label key={axis}>{axis.toUpperCase()}
      <CommitInput key={tracer.id + axis + world[axis]} label={`Tracer ${axis.toUpperCase()}`} value={world[axis]} numeric
        commit={value => edit({ localPosition: worldToLocal({ ...world, [axis]: Number(value) }, transform) })}/>
    </label> : <Readout key={axis} label={`Tracer ${axis.toUpperCase()}`} value={number(world?.[axis])}/>)}
    {create ? <>
      <label className="object-checkbox"><input type="checkbox" aria-label="Tracer enabled" checked={tracer.enabled} onChange={event => edit({ enabled: event.target.checked })}/>Enabled</label>
      <button type="button" className="tool-btn" aria-label="Delete tracer" title="Delete tracer" onClick={() => report(() => { m.removeTracer(tracer.id); e.clearSelection(); })}><Trash2 size={16}/></button>
    </> : <Readout label="Tracer enabled" value={tracer.enabled ? 'Yes' : 'No'}/>}
  </>;
}

const EMPTY_SAMPLES: ForceSample[] = [];
function SensorHistory({ samples, current }: { samples: ForceSample[]; current: number | null | undefined }) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const data = useMemo(() => samples.slice(-600).filter(p => Number.isFinite(p.time) && Number.isFinite(p.force)), [samples]);
  useEffect(() => {
    const element = canvas.current;
    if (!element) return;
    const draw = () => {
      const width = element.getBoundingClientRect().width, height = 96, dpr = Math.min(3, Math.max(.5, window.devicePixelRatio || 1));
      element.width = Math.max(1, Math.round(width * dpr)); element.height = Math.round(height * dpr);
      const ctx = element.getContext('2d');
      if (!ctx || width <= 0) return;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0); ctx.clearRect(0, 0, width, height);
      if (!data.length) return;
      const min = Math.min(...data.map(p => p.force)), max = Math.max(...data.map(p => p.force));
      const range = max - min || Math.max(Math.abs(max) * .1, 1);
      const first = data[0].time, duration = data[data.length - 1].time - first;
      ctx.strokeStyle = getComputedStyle(element).color; ctx.fillStyle = ctx.strokeStyle; ctx.lineWidth = 1.5; ctx.beginPath();
      data.forEach((p, index) => {
        const x = duration > 0 ? 4 + (width - 8) * (p.time - first) / duration : width / 2;
        const y = max === min ? height / 2 : height - 6 - (height - 12) * (p.force - min) / range;
        if (index === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
        if (data.length === 1) ctx.fillRect(x - 2, y - 2, 4, 4);
      }); ctx.stroke();
    };
    draw();
    const observer = new ResizeObserver(draw); observer.observe(element);
    window.addEventListener('resize', draw);
    return () => { observer.disconnect(); window.removeEventListener('resize', draw); };
  }, [data]);
  return <div className="object-history">
    <Readout label="Current axial force (model units)" value={number(current)}/>
    <canvas ref={canvas} role="img" aria-label={data.length ? 'Axial force history (model units)' : 'Axial force history unavailable'}/>
    {!data.length && <div className="panel-info">Unavailable</div>}
    <Readout label="Minimum force (model units)" value={number(data.length ? Math.min(...data.map(p => p.force)) : null)}/>
    <Readout label="Maximum force (model units)" value={number(data.length ? Math.max(...data.map(p => p.force)) : null)}/>
  </div>;
}

function SensorFields({ sensor, create }: { sensor: ForceSensor; create: boolean }) {
  const m = useMechanismStore(), e = useEditorStore(), s = useSimulationStore();
  const edit = (updates: Partial<ForceSensor>) => report(() => m.editForceSensor(sensor.id, updates));
  const current = !create && sensor.enabled ? s.solverResult?.forceAnalysis?.linkForces.get(sensor.linkId)?.axialForce : null;
  const samples = !create && sensor.enabled ? s.forceSensorData.get(sensor.id) ?? EMPTY_SAMPLES : EMPTY_SAMPLES;
  return <>
    {create ? <>
      <label>Name<CommitInput key={sensor.id + sensor.name} label="Sensor name" value={sensor.name ?? ''} commit={name => edit({ name })}/></label>
      <label>Link<select aria-label="Sensor link" value={sensor.linkId} onChange={event => edit({ linkId: event.target.value })}>
        {Object.values(m.links).filter(link => link.jointIds.every(id => m.joints[id] && !m.joints[id].hidden)).map(link => <option key={link.id} value={link.id}>{link.jointIds.map(id => m.joints[id]?.label || short(id)).join(' / ')}</option>)}
      </select></label>
      <label className="object-checkbox"><input type="checkbox" aria-label="Sensor enabled" checked={sensor.enabled} onChange={event => edit({ enabled: event.target.checked })}/>Enabled</label>
      <button type="button" className="tool-btn" aria-label="Delete sensor" title="Delete sensor" onClick={() => report(() => { m.removeForceSensor(sensor.id); e.clearSelection(); })}><Trash2 size={16}/></button>
    </> : <>
      <Readout label="Sensor name" value={sensor.name || `Sensor ${short(sensor.id)}`}/>
      <Readout label="Sensor link" value={m.links[sensor.linkId] ? `Link ${short(sensor.linkId)}` : 'Unavailable'}/>
      <Readout label="Sensor enabled" value={sensor.enabled ? 'Yes' : 'No'}/>
      <SensorHistory samples={samples} current={current}/>
    </>}
  </>;
}

export function ObjectProperties({ id }: { id: string }) {
  const m = useMechanismStore(), e = useEditorStore(), s = useSimulationStore();
  const joint = m.joints[id], link = m.links[id], tracer = m.tracers[id], sensor = m.forceSensors[id];
  if (!joint && !link && !tracer && !sensor) return null;
  const create = e.mode === 'create', analysis = !create ? s.solverResult?.forceAnalysis : undefined;
  const reaction = analysis?.jointReactions.get(id);
  return <div className="panel-content object-tools"><div className="panel-title">{joint ? 'Joint' : link ? 'Link' : tracer ? 'Tracer' : 'Force Sensor'}{joint?.mirrored && <Mirrored/>}</div>
    {joint && <>
      <div className="panel-info">{joint.type === 'fixed' ? 'Fixed (Base)' : 'Revolute'}</div>
      {create ? <div className="object-name-row"><label>Name<CommitInput key={id + joint.label} label="Joint name" value={joint.label ?? ''}
        commit={label => report(() => m.editJointProperties(id, { label }))}/></label>
        <button type="button" className="tool-btn" aria-label="Clear joint name" title="Clear joint name" disabled={!joint.label}
          onClick={() => report(() => m.editJointProperties(id, { label: undefined }))}><X size={16}/></button></div>
        : <Readout label="Joint name" value={joint.label || `Joint ${short(id)}`}/>}
      {(['x', 'y'] as const).map(axis => create ? <label key={axis}>{axis.toUpperCase()}<CommitInput key={id + axis + joint.position[axis]}
        label={`Joint ${axis.toUpperCase()}`} value={joint.position[axis]} numeric commit={value => report(() => m.editJoint(id,
          { ...joint.position, [axis]: Number(value) }, e.lockOutlines ? e.frozenOutlineWorldPoints : undefined))}/></label>
        : <Readout key={axis} label={`Joint ${axis.toUpperCase()}`} value={number(joint.position[axis])}/>)}
      {!create && <>
        <label className="object-checkbox"><input type="checkbox" aria-label="Trace joint" checked={s.trackedJointIds.has(id)} onChange={() => s.toggleTracing(id)}/>Trace</label>
        <Readout label="Reaction kind" value={reaction?.kind ?? 'Unavailable'}/>
        <Readout label="Reaction Fx (model units)" value={number(reaction?.reactionForce.x)}/>
        <Readout label="Reaction Fy (model units)" value={number(reaction?.reactionForce.y)}/>
        <Readout label="Reaction magnitude (model units)" value={number(reaction?.magnitude)}/>
        {reaction && <><Readout label="Applied Fx (model units)" value={number(reaction.appliedForce.x)}/><Readout label="Applied Fy (model units)" value={number(reaction.appliedForce.y)}/>
          <details className="object-contributions"><summary>Link contributions ({reaction.contributions.length})</summary>
            {reaction.contributions.map((c, index) => <div key={c.linkId + index}>Link {short(c.linkId)}<Readout label="Fx (model units)" value={number(c.force.x)}/><Readout label="Fy (model units)" value={number(c.force.y)}/></div>)}
          </details></>}
      </>}
    </>}
    {link && <><Readout label="Link ID" value={link.id}/><Readout label="Axial force (model units)" value={number(analysis?.linkForces.get(id)?.axialForce)}/>
      {create && <button type="button" className="tool-btn" aria-label="Add force sensor" title="Add force sensor"
        onClick={() => report(() => e.select(m.addForceSensor(id)))}><ForceSensorIcon size={16}/></button>}</>}
    {tracer && <TracerFields tracer={tracer} create={create}/>}
    {sensor && <SensorFields sensor={sensor} create={create}/>}
    {!create && analysis && <><Readout label="Force analysis" value={analysis.complete ? 'Complete (model units)' : 'Incomplete (model units)'}/>
      {analysis.limitations.map((text, index) => <div className="panel-info" key={index}>{text}</div>)}</>}
  </div>;
}
