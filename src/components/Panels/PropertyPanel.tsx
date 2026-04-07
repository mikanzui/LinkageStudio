import { useEditorStore } from '../../store/editor-store';
import { useMechanismStore } from '../../store/mechanism-store';
import type { Joint, Outline, CanvasImage } from '../../types';

export function PropertyPanel() {
  const selectedIds = useEditorStore((s) => s.selectedIds);
  const joints = useMechanismStore((s) => s.joints);
  const outlines = useMechanismStore((s) => s.outlines);
  const images = useMechanismStore((s) => s.images);
  const bodies = useMechanismStore((s) => s.bodies);
  const moveJoint = useMechanismStore((s) => s.moveJoint);
  const updateImage = useMechanismStore((s) => s.updateImage);

  if (selectedIds.size === 0) {
    return null;
  }

  const id = [...selectedIds][0];
  const joint = joints[id] as Joint | undefined;
  const outline = outlines[id] as Outline | undefined;
  const image = images[id] as CanvasImage | undefined;

  if (joint) {
    const step = 0.1;
    return (
      <div className="panel-content">
        <div className="panel-section-header">
          <div className="panel-title">Joint</div>
        </div>
        <div className="panel-surface panel-section">
          <div className="panel-kind-label">
            {joint.type === 'fixed' ? 'Fixed (Base)' : 'Revolute'}
          </div>
          <label className="panel-num-row">
            <span className="panel-num-axis">X</span>
            <div className="panel-num-stepper">
              <input
                type="number"
                step={step}
                value={joint.position.x.toFixed(1)}
                onChange={(e) => moveJoint(joint.id, { x: +e.target.value, y: joint.position.y })}
              />
              <div className="panel-num-arrows" role="group" aria-label="Adjust X">
                <button
                  type="button"
                  className="panel-num-arrow"
                  tabIndex={-1}
                  onClick={() =>
                    moveJoint(joint.id, { x: joint.position.x + step, y: joint.position.y })
                  }
                >
                  <svg width="10" height="6" viewBox="0 0 10 6" aria-hidden>
                    <path d="M1 5L5 1L9 5" fill="none" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                </button>
                <button
                  type="button"
                  className="panel-num-arrow"
                  tabIndex={-1}
                  onClick={() =>
                    moveJoint(joint.id, { x: joint.position.x - step, y: joint.position.y })
                  }
                >
                  <svg width="10" height="6" viewBox="0 0 10 6" aria-hidden>
                    <path d="M1 1L5 5L9 1" fill="none" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                </button>
              </div>
            </div>
          </label>
          <label className="panel-num-row">
            <span className="panel-num-axis">Y</span>
            <div className="panel-num-stepper">
              <input
                type="number"
                step={step}
                value={joint.position.y.toFixed(1)}
                onChange={(e) => moveJoint(joint.id, { x: joint.position.x, y: +e.target.value })}
              />
              <div className="panel-num-arrows" role="group" aria-label="Adjust Y">
                <button
                  type="button"
                  className="panel-num-arrow"
                  tabIndex={-1}
                  onClick={() =>
                    moveJoint(joint.id, { x: joint.position.x, y: joint.position.y + step })
                  }
                >
                  <svg width="10" height="6" viewBox="0 0 10 6" aria-hidden>
                    <path d="M1 5L5 1L9 5" fill="none" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                </button>
                <button
                  type="button"
                  className="panel-num-arrow"
                  tabIndex={-1}
                  onClick={() =>
                    moveJoint(joint.id, { x: joint.position.x, y: joint.position.y - step })
                  }
                >
                  <svg width="10" height="6" viewBox="0 0 10 6" aria-hidden>
                    <path d="M1 1L5 5L9 1" fill="none" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                </button>
              </div>
            </div>
          </label>
        </div>
      </div>
    );
  }

  if (outline) {
    const body = bodies[outline.bodyId];
    return (
      <div className="panel-content">
        <div className="panel-section-header">
          <div className="panel-title">{outline.name || 'Shape'}</div>
        </div>
        <div className="panel-surface panel-section">
          <div className="panel-info">Body: {body?.name ?? 'Unknown'}</div>
          <div className="panel-info">{outline.points.length} vertices</div>
        </div>
      </div>
    );
  }

  if (image) {
    const body = bodies[image.bodyId];
    return (
      <div className="panel-content">
        <div className="panel-section-header">
          <div className="panel-title">Image</div>
        </div>
        <div className="panel-surface panel-section">
          <div className="panel-info">Body: {body?.name ?? 'Unknown'}</div>
          <div className="panel-info">{image.naturalWidth} x {image.naturalHeight} px</div>
          <label>
            Scale
            <input
              type="number"
              step="0.1"
              min="0.01"
              value={image.scale.toFixed(2)}
              onChange={(e) => updateImage(image.id, { scale: Math.max(0.01, +e.target.value) })}
            />
          </label>
          <label>
            Rotation
            <input
              type="number"
              step="5"
              value={Math.round((image.rotation * 180) / Math.PI)}
              onChange={(e) => updateImage(image.id, { rotation: (+e.target.value * Math.PI) / 180 })}
            />
            <span style={{ fontSize: 10, color: '#777' }}>deg</span>
          </label>
        </div>
      </div>
    );
  }

  return null;
}
