import { useSimulationStore } from '../../store/simulation-store';
import { useMechanismStore } from '../../store/mechanism-store';
import { useEditorStore } from '../../store/editor-store';
import { computeBodyTransform, localToWorld } from '../../core/body-transform';
import { DOF_TOOLTIP } from '../../core/solver/dof';
import { FORCE_READOUT_LABEL_HINT } from '../../utils/units';
import { isDevSolverTimingOverlayEnabled } from '../../utils/dev-solver-overlay';

export function SimulationPanel() {
  const mode = useEditorStore((s) => s.mode);
  const speed = useSimulationStore((s) => s.speed);
  const dof = useSimulationStore((s) => s.dof);
  const time = useSimulationStore((s) => s.time);
  const gravityEnabled = useSimulationStore((s) => s.gravityEnabled);
  const gravityStrength = useSimulationStore((s) => s.gravityStrength);
  const setSpeed = useSimulationStore((s) => s.setSpeed);
  const clearTraces = useSimulationStore((s) => s.clearTraces);
  const toggleGravity = useSimulationStore((s) => s.toggleGravity);
  const setGravityStrength = useSimulationStore((s) => s.setGravityStrength);
  const dampingVal = useSimulationStore((s) => s.damping);
  const setDamping = useSimulationStore((s) => s.setDamping);
  const dragMult = useSimulationStore((s) => s.dragMultiplier);
  const setDragMultiplier = useSimulationStore((s) => s.setDragMultiplier);
  const dragDamp = useSimulationStore((s) => s.dragDamping);
  const setDragDamping = useSimulationStore((s) => s.setDragDamping);

  const showLinks = useEditorStore((s) => s.showLinks);
  const showVectors = useEditorStore((s) => s.showVectors);
  const showRulers = useEditorStore((s) => s.showRulers);
  const showForceUnits = useEditorStore((s) => s.showForceUnits);
  const showLoads = useEditorStore((s) => s.showLoads);
  const lockOutlines = useEditorStore((s) => s.lockOutlines);
  const gridLevel = useEditorStore((s) => s.gridLevel);
  const outlineSimGrabInteriorWithJoints = useEditorStore((s) => s.outlineSimGrabInteriorWithJoints);
  const stepError = useSimulationStore((s) => s.stepError);
  const setStepError = useSimulationStore((s) => s.setStepError);
  const devSolverLastTickWallMs = useSimulationStore((s) => s.devSolverLastTickWallMs);
  const devSolverLastSimDt = useSimulationStore((s) => s.devSolverLastSimDt);

  const devSolverTimingHud =
    import.meta.env.DEV && isDevSolverTimingOverlayEnabled() ? (
      <div
        className="panel-info"
        style={{
          fontSize: 11,
          fontFamily: 'monospace',
          opacity: 0.8,
          marginTop: 4,
        }}
        title="Dev only: wall time for last App tick and integration step dt. Enable with ?devSolverTiming=1"
      >
        solver tick {devSolverLastTickWallMs != null ? `${devSolverLastTickWallMs.toFixed(2)} ms` : '—'}
        {devSolverLastSimDt != null ? ` · Δt ${(devSolverLastSimDt * 1000).toFixed(3)} ms` : ''}
      </div>
    ) : null;

  const stepErrorBanner = stepError ? (
    <div
      className="panel-surface panel-section"
      style={{
        border: '1px solid #c62828',
        background: '#3e2723',
        color: '#ffccbc',
        fontSize: 12,
        padding: '8px 10px',
        display: 'flex',
        gap: 8,
        alignItems: 'flex-start',
      }}
    >
      <span style={{ flex: 1 }}>{stepError}</span>
      <button
        type="button"
        className="tool-btn"
        style={{ flexShrink: 0, fontSize: 11 }}
        onClick={() => setStepError(null)}
      >
        Dismiss
      </button>
    </div>
  ) : null;

  // Physics controls - visible in both modes (title rendered above box)
  const physicsSection = (
    <>
      <label className="panel-toggle-row">
        <input
          type="checkbox"
          checked={gravityEnabled}
          onChange={toggleGravity}
        />
        <span>Gravity</span>
      </label>
      {gravityEnabled && (
        <label className="panel-slider-row">
          <span className="panel-slider-label">Strength</span>
          <input
            type="range"
            min={100}
            max={3000}
            step={50}
            value={gravityStrength}
            onChange={(e) => setGravityStrength(+e.target.value)}
          />
          <span className="panel-slider-value">{gravityStrength}</span>
        </label>
      )}
      <label
        className="panel-slider-row"
        title="Global velocity retention each substep (applies to all free joints in simulate). Separate from per-spring damper coefficient c."
      >
        <span className="panel-slider-label">Damping</span>
        <input
          type="range"
          min={0}
          max={100}
          step={1}
          value={Math.round((1 - dampingVal) * 100)}
          onChange={(e) => setDamping(1 - (+e.target.value) / 100)}
        />
        <span className="panel-slider-value">{Math.round((1 - dampingVal) * 100)}</span>
      </label>
      <label className="panel-slider-row">
        <span className="panel-slider-label">Drag Force</span>
        <input
          type="range"
          min={1}
          max={50}
          step={1}
          value={dragMult}
          onChange={(e) => setDragMultiplier(+e.target.value)}
        />
        <span className="panel-slider-value">{dragMult}x</span>
      </label>
      <label className="panel-slider-row">
        <span className="panel-slider-label">Drag Damping</span>
        <input
          type="range"
          min={0}
          max={100}
          step={1}
          value={Math.round(dragDamp * 100)}
          onChange={(e) => setDragDamping(+e.target.value / 100)}
        />
        <span className="panel-slider-value">{Math.round(dragDamp * 100)}</span>
      </label>
    </>
  );

  const viewSection = (
    <>
      <label className="panel-toggle-row">
        <input
          type="checkbox"
          checked={showLinks}
          onChange={() => useEditorStore.getState().toggleShowLinks()}
        />
        Show links
      </label>
      <label className="panel-toggle-row">
        <input
          type="checkbox"
          checked={showVectors}
          onChange={() => useEditorStore.getState().toggleShowVectors()}
        />
        Show vectors
      </label>
      <label className="panel-toggle-row">
        <input
          type="checkbox"
          checked={showRulers}
          onChange={() => useEditorStore.getState().toggleShowRulers()}
        />
        Show rulers
      </label>
      <label className="panel-toggle-row" title={FORCE_READOUT_LABEL_HINT}>
        <input
          type="checkbox"
          checked={showForceUnits}
          onChange={() => useEditorStore.getState().toggleShowForceUnits()}
        />
        Force units on links (scaled model)
      </label>
      <label className="panel-toggle-row">
        <input
          type="checkbox"
          checked={showLoads}
          onChange={() => useEditorStore.getState().toggleShowLoads()}
        />
        Show loads
      </label>
      <label
        className="panel-toggle-row"
        title="Simulate mode: when on, you can drag a filled shape’s interior even if pivots on the same body lie inside that outline. When off, interior shape drags are skipped in that case so joints and links are easier to pick."
      >
        <input
          type="checkbox"
          checked={outlineSimGrabInteriorWithJoints}
          onChange={() => useEditorStore.getState().toggleOutlineSimGrabInteriorWithJoints()}
        />
        <span>Shape interior grab (joints inside)</span>
      </label>
      {mode === 'create' && (
        <label className="panel-toggle-row">
          <input
            type="checkbox"
            checked={lockOutlines}
            onChange={() => {
              const editor = useEditorStore.getState();
              const mech = useMechanismStore.getState();
              if (!editor.lockOutlines) {
                // Locking: snapshot current world-space outline positions
                const frozen = new Map<string, import('../../types').Vec2[]>();
                for (const outline of Object.values(mech.outlines)) {
                  const body = mech.bodies[outline.bodyId];
                  if (!body || outline.points.length < 2) continue;
                  const transform = computeBodyTransform(body, mech.joints);
                  frozen.set(outline.id, outline.points.map((p) => localToWorld(p, transform)));
                }
                editor.setLockOutlines(true, frozen);
              } else {
                // Unlocking: reproject outlines to stay at their frozen positions
                const frozen = editor.frozenOutlineWorldPoints;
                if (frozen.size > 0) {
                  mech.reprojectOutlinesFromWorld(frozen);
                }
                editor.setLockOutlines(false);
              }
            }}
          />
          Lock outlines
        </label>
      )}
      <div className="panel-subtitle">Grid (G)</div>
      <div style={{ display: 'flex', gap: 2 }}>
        {(['normal', 'fine', 'ultrafine', 'off'] as const).map((level) => (
          <button
            key={level}
            onClick={() => useEditorStore.getState().setGridLevel(level)}
            style={{
              flex: 1,
              padding: '3px 0',
              fontSize: 10,
              border: '1px solid #444',
              borderRadius: 3,
              cursor: 'pointer',
              background: gridLevel === level ? '#4a9eff' : '#2a2a2a',
              color: gridLevel === level ? '#fff' : '#aaa',
            }}
          >
            {level === 'ultrafine' ? 'Ultra' : level.charAt(0).toUpperCase() + level.slice(1)}
          </button>
        ))}
      </div>
    </>
  );

  if (mode === 'simulate') {
    return (
      <div className="panel-content">
        <div className="panel-section-header">
          <div className="panel-title">Simulation</div>
        </div>
        {stepErrorBanner}
        {devSolverTimingHud}
        <div className="panel-surface panel-section">
          <div className="panel-info" title={DOF_TOOLTIP} style={{ cursor: 'help' }}>DOF: {dof}</div>
          <div className="panel-info">Time: {time.toFixed(2)}s</div>
          <div className="sim-controls">
            <button className="tool-btn" onClick={clearTraces}>Clear Traces</button>
          </div>
          <label className="panel-slider-row">
            <span className="panel-slider-label">Speed</span>
            <input
              type="range"
              min={0.1}
              max={5}
              step={0.1}
              value={speed}
              onChange={(e) => setSpeed(+e.target.value)}
            />
            <span className="panel-slider-value">{speed.toFixed(1)}x</span>
          </label>
        </div>

        <div className="panel-section-header">
          <div className="panel-title">Physics</div>
        </div>
        <div className="panel-surface panel-section">
          {physicsSection}
        </div>

        <div className="panel-section-header">
          <div className="panel-title">View</div>
        </div>
        <div className="panel-surface panel-section">
          {viewSection}
        </div>
      </div>
    );
  }

  // --- CREATE MODE ---
  return (
    <div className="panel-content">
      <div className="panel-section-header">
        <div className="panel-title">Properties</div>
      </div>
      {stepErrorBanner}
      {devSolverTimingHud}
      <div className="panel-surface panel-section">
        <div className="panel-info" title={DOF_TOOLTIP} style={{ cursor: 'help' }}>DOF: {dof}</div>
      </div>

      <div className="panel-section-header">
        <div className="panel-title">Physics</div>
      </div>
      <div className="panel-surface panel-section">
        {physicsSection}
      </div>

      <div className="panel-section-header">
        <div className="panel-title">View</div>
      </div>
      <div className="panel-surface panel-section">
        {viewSection}
      </div>
    </div>
  );
}
