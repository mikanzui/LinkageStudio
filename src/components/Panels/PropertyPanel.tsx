import { useEditorStore } from '../../store/editor-store';
import { useMechanismStore } from '../../store/mechanism-store';
import type { Joint, Outline, CanvasImage } from '../../types';
import { useRef, useState } from 'react';

function JointCoordinate({ joint, axis }: { joint: Joint; axis: 'x' | 'y' }) {
  const [draft, setDraft] = useState(joint.position[axis].toFixed(1));
  const cancelled = useRef(false);
  return <input type="number" aria-label={`Joint ${axis.toUpperCase()}`} value={draft}
    onFocus={() => { cancelled.current = false; }}
    onChange={event => setDraft(event.target.value)}
    onBlur={() => {
      if (!cancelled.current && draft.trim() && Number.isFinite(Number(draft))) {
        useMechanismStore.getState().editJoint(joint.id, { ...joint.position, [axis]: Number(draft) });
      }
      setDraft(joint.position[axis].toFixed(1));
    }}
    onKeyDown={event => {
      if (event.key === 'Escape') { cancelled.current = true; event.currentTarget.blur(); }
      else if (event.key === 'Enter') event.currentTarget.blur();
    }} />;
}

export function PropertyPanel() {
  const mode = useEditorStore(s => s.mode);
  const selectedIds = useEditorStore((s) => s.selectedIds);
  const joints = useMechanismStore((s) => s.joints);
  const outlines = useMechanismStore((s) => s.outlines);
  const images = useMechanismStore((s) => s.images);
  const bodies = useMechanismStore((s) => s.bodies);
  const updateImage = useMechanismStore((s) => s.updateImage);

  if (selectedIds.size === 0 || mode !== 'create') {
    return null;
  }

  const id = [...selectedIds][0];
  const joint = joints[id] as Joint | undefined;
  const outline = outlines[id] as Outline | undefined;
  const image = images[id] as CanvasImage | undefined;

  if (joint) {
    return (
      <div className="panel-content">
        <div className="panel-title">Joint</div>
        <div className="panel-info" style={{ fontStyle: 'italic', opacity: 0.7 }}>
          {joint.type === 'fixed' ? 'Fixed (Base)' : 'Revolute'}
        </div>
        <label>
          X
          <JointCoordinate key={`${joint.id}-${joint.position.x}`} joint={joint} axis="x" />
        </label>
        <label>
          Y
          <JointCoordinate key={`${joint.id}-${joint.position.y}`} joint={joint} axis="y" />
        </label>
      </div>
    );
  }

  if (outline) {
    const body = bodies[outline.bodyId];
    return (
      <div className="panel-content">
        <div className="panel-title">{outline.name || 'Shape'}</div>
        <div className="panel-info">Body: {body?.name ?? 'Unknown'}</div>
        <div className="panel-info">{outline.points.length} vertices</div>
      </div>
    );
  }

  if (image) {
    const body = bodies[image.bodyId];
    return (
      <div className="panel-content">
        <div className="panel-title">Image</div>
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
    );
  }

  return null;
}
