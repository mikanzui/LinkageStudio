import { Eraser } from 'lucide-react';
import { useSimulationStore } from '../../store/simulation-store';
import { useMechanismStore } from '../../store/mechanism-store';
import { useEditorStore } from '../../store/editor-store';
import { computeBodyTransform, localToWorld } from '../../core/body-transform';
import { CommitInput } from '../CommitInput';

function PhysicsControl({ label, value, min, max, step, change }: {
  label: string; value: number; min: number; max: number; step: number; change(value: number): void;
}) {
  return <div className="physics-control">
    <span>{label}</span>
    <input type="range" aria-label={label + ' slider'} min={min} max={Math.max(max, value)} step={step} value={value} onChange={event => change(Number(event.target.value))}/>
    <CommitInput key={label + value} label={label} value={value} numeric min={min} max={label.includes('percent') || label === 'Speed' ? max : undefined} commit={value => change(Number(value))}/>
  </div>;
}

export function SimulationPanel() {
  const s = useSimulationStore(), e = useEditorStore();
  const toggleLock = () => {
    const m = useMechanismStore.getState();
    if (e.lockOutlines) {
      if (e.frozenOutlineWorldPoints.size) m.reprojectOutlinesFromWorld(e.frozenOutlineWorldPoints);
      e.setLockOutlines(false);
    } else {
      const frozen = new Map<string, import('../../types').Vec2[]>();
      for (const outline of Object.values(m.outlines)) {
        const body = m.bodies[outline.bodyId]; if (!body) continue;
        const frame = computeBodyTransform(body, m.joints);
        frozen.set(outline.id, outline.points.map(point => localToWorld(point, frame)));
      }
      e.setLockOutlines(true, frozen);
    }
  };
  return <div className="panel-content">
    <div className="panel-title">{e.mode === 'simulate' ? 'Simulation' : 'Properties'}</div>
    <div className="panel-info">Design DOF: {s.dof}</div>
    {e.mode === 'simulate' && <>
      <div className="panel-info">Time: {s.time.toFixed(2)}s</div>
      <button type="button" className="tool-btn" aria-label="Clear traces" title="Clear traces" onClick={s.clearTraces}><Eraser size={16}/></button>
      <PhysicsControl label="Speed" value={s.speed} min={.1} max={5} step={.1} change={s.setSpeed}/>
    </>}
    <div className="panel-title">Physics</div>
    <label><input type="checkbox" checked={s.gravityEnabled} onChange={s.toggleGravity}/>Gravity</label>
    {s.gravityEnabled && <PhysicsControl label="Gravity strength" value={s.gravityStrength} min={0} max={3000} step={50} change={s.setGravityStrength}/>}
    <PhysicsControl label="Damping percent" value={(1 - s.damping) * 100} min={0} max={100} step={1} change={value => s.setDamping(1 - value / 100)}/>
    <PhysicsControl label="Drag multiplier" value={s.dragMultiplier} min={0} max={50} step={1} change={s.setDragMultiplier}/>
    <PhysicsControl label="Drag damping percent" value={s.dragDamping * 100} min={0} max={100} step={1} change={value => s.setDragDamping(value / 100)}/>
    <div className="panel-title">View</div>
    <label><input type="checkbox" checked={e.showLinks} onChange={e.toggleShowLinks}/>Show links</label>
    <label><input type="checkbox" checked={e.showVectors} onChange={e.toggleShowVectors}/>Applied force vectors</label>
    <label><input type="checkbox" checked={e.showLoads} onChange={event => useEditorStore.setState({ showLoads: event.target.checked })}/>Model link loads</label>
    <label><input type="checkbox" checked={e.showReactions} onChange={event => useEditorStore.setState({ showReactions: event.target.checked })}/>Joint reactions (model)</label>
    <label><input type="checkbox" checked={e.showForceUnits} onChange={e.toggleShowForceUnits}/>Force values (model)</label>
    <label><input type="checkbox" checked={e.showRulers} onChange={e.toggleShowRulers}/>Show rulers</label>
    {e.mode === 'create' && <label><input type="checkbox" checked={e.lockOutlines} onChange={toggleLock}/>Lock outlines</label>}
    <div className="panel-title">Grid</div>
    <div className="grid-controls">{(['normal', 'fine', 'ultrafine', 'off'] as const).map(level =>
      <button type="button" className="tool-btn" key={level} aria-pressed={e.gridLevel === level} onClick={() => e.setGridLevel(level)}>{level === 'ultrafine' ? 'Ultra' : level[0].toUpperCase() + level.slice(1)}</button>)}</div>
    {e.mode === 'simulate' && s.solverResult?.forceAnalysis && !s.solverResult.forceAnalysis.complete && <div role="status" className="panel-info">{s.solverResult.forceAnalysis.limitations.join(' ')}</div>}
  </div>;
}
