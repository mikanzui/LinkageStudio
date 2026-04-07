import { useMemo } from 'react';
import { useEditorStore } from '../../store/editor-store';
import { useMechanismStore } from '../../store/mechanism-store';
import type { AppMode } from '../../types';
import { screenToWorld } from '../../renderer/camera';
import type { Vec2 } from '../../types';
import { switchMode } from '../../utils/mode-switch';
import './Toolbar.css';

/* Inline SVG tool icons (16×16 viewBox) */
const IconPivot = () => (
  <svg className="tool-icon-svg" viewBox="0 0 16 16" width="16" height="16">
    <circle cx="8" cy="8" r="6" fill="none" stroke="currentColor" strokeWidth="1.5" />
    <circle cx="8" cy="8" r="2" fill="currentColor" />
  </svg>
);

const IconSlider = () => (
  <svg className="tool-icon-svg" viewBox="0 0 16 16" width="16" height="16">
    <line x1="2" y1="8" x2="14" y2="8" stroke="currentColor" strokeWidth="1.5" />
    <circle cx="3" cy="8" r="2" fill="none" stroke="currentColor" strokeWidth="1.2" />
    <circle cx="13" cy="8" r="2" fill="none" stroke="currentColor" strokeWidth="1.2" />
    <rect x="6" y="5" width="4" height="6" rx="1" fill="currentColor" opacity="0.6" />
  </svg>
);

const IconCollider = () => (
  <svg className="tool-icon-svg" viewBox="0 0 16 16" width="16" height="16">
    <line x1="2" y1="13" x2="14" y2="3" stroke="currentColor" strokeWidth="1.5" strokeDasharray="3 2" />
    <line x1="1" y1="11" x2="3" y2="15" stroke="currentColor" strokeWidth="1.2" />
    <line x1="13" y1="1" x2="15" y2="5" stroke="currentColor" strokeWidth="1.2" />
  </svg>
);

const IconTracer = () => (
  <svg className="tool-icon-svg" viewBox="0 0 16 16" width="16" height="16">
    <circle cx="8" cy="8" r="4" fill="none" stroke="currentColor" strokeWidth="1.2" />
    <line x1="8" y1="1" x2="8" y2="5" stroke="currentColor" strokeWidth="1.2" />
    <line x1="8" y1="11" x2="8" y2="15" stroke="currentColor" strokeWidth="1.2" />
    <line x1="1" y1="8" x2="5" y2="8" stroke="currentColor" strokeWidth="1.2" />
    <line x1="11" y1="8" x2="15" y2="8" stroke="currentColor" strokeWidth="1.2" />
    <circle cx="8" cy="8" r="1" fill="currentColor" />
  </svg>
);

const IconOutline = () => (
  <svg className="tool-icon-svg" viewBox="0 0 16 16" width="16" height="16">
    <polygon points="8,1 14,5 12,13 4,13 2,5" fill="none" stroke="currentColor" strokeWidth="1.3" strokeLinejoin="round" />
  </svg>
);

const IconImage = () => (
  <svg className="tool-icon-svg" viewBox="0 0 16 16" width="16" height="16">
    <rect x="1.5" y="2.5" width="13" height="11" rx="1.5" fill="none" stroke="currentColor" strokeWidth="1.2" />
    <circle cx="5" cy="6" r="1.5" fill="currentColor" />
    <polyline points="1.5,11 5,8 8,10 11,6 14.5,9.5" fill="none" stroke="currentColor" strokeWidth="1.2" strokeLinejoin="round" />
  </svg>
);

export function Toolbar() {
  const mode = useEditorStore((s) => s.mode);
  const createTool = useEditorStore((s) => s.createTool);
  const setCreateTool = useEditorStore((s) => s.setCreateTool);
  const mirrorScope = useEditorStore((s) => s.mirrorScope);
  const setMirrorScope = useEditorStore((s) => s.setMirrorScope);
  const marqueeExcludedBodyIds = useEditorStore((s) => s.marqueeExcludedBodyIds);
  const toggleMarqueeBodyExcluded = useEditorStore((s) => s.toggleMarqueeBodyExcluded);
  const selectMode = useEditorStore((s) => s.selectMode);
  const activeTool = useEditorStore((s) => s.activeTool);
  /** Box/lasso filters — only relevant when using those viewport modes (not pan). */
  const showMarqueeBodiesPanel =
    mode === 'create' && activeTool === 'select' && (selectMode === 'box' || selectMode === 'lasso');
  const addImage = useMechanismStore((s) => s.addImage);
  const baseBodyId = useMechanismStore((s) => s.baseBodyId);
  const bodies = useMechanismStore((s) => s.bodies);

  const sortedBodies = useMemo(() => {
    const list = Object.values(bodies);
    list.sort((a, b) => {
      if (a.id === baseBodyId) return -1;
      if (b.id === baseBodyId) return 1;
      return a.name.localeCompare(b.name);
    });
    return list;
  }, [bodies, baseBodyId]);

  const handleModeSwitch = (newMode: AppMode) => switchMode(newMode);

  const handleImportImage = () => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'image/jpeg,image/png,image/bmp,image/webp';
    input.style.position = 'fixed';
    input.style.top = '-9999px';
    input.style.left = '-9999px';
    document.body.appendChild(input);

    const cleanup = () => { if (input.parentNode) input.parentNode.removeChild(input); };

    input.addEventListener('change', () => {
      const file = input.files?.[0];
      if (!file) { cleanup(); return; }
      const reader = new FileReader();
      reader.onload = () => {
        const dataUrl = reader.result as string;
        const img = new Image();
        img.onload = () => {
          const camera = useEditorStore.getState().camera;
          const canvas = document.querySelector('canvas');
          let center: Vec2 = { x: 0, y: 0 };
          if (canvas) {
            const rect = canvas.getBoundingClientRect();
            center = screenToWorld({ x: rect.width / 2, y: rect.height / 2 }, camera);
          }
          const id = addImage(baseBodyId, dataUrl, img.naturalWidth, img.naturalHeight, center);
          useEditorStore.getState().select(id);
          setCreateTool('image');
          cleanup();
        };
        img.onerror = cleanup;
        img.src = dataUrl;
      };
      reader.onerror = cleanup;
      reader.readAsDataURL(file);
    });

    input.click();
  };

  const isPivotTool = createTool === 'joints';
  const isSliderTool = createTool === 'slider';
  const isColliderTool = createTool === 'collider';
  const isTracerTool = createTool === 'tracer';
  const isMirrorTool = createTool === 'mirror';

  const renderHints = () => {
    if (isPivotTool) {
      return (
        <>
          <div className="sim-hint">Click to add pivot joint</div>
          <div className="sim-hint">Hold to assign bodies</div>
          <div className="sim-hint">Double-click to toggle fixed</div>
        </>
      );
    }
    if (isSliderTool) {
      return (
        <>
          <div className="sim-hint">Click to place end A</div>
          <div className="sim-hint">Click again to place end C</div>
          <div className="sim-hint">Slider B auto-placed at midpoint</div>
          <div className="sim-hint">Escape to cancel</div>
        </>
      );
    }
    if (isTracerTool) {
      return (
        <>
          <div className="sim-hint">Select a body, then click to place</div>
          <div className="sim-hint">Traces path during simulation</div>
          <div className="sim-hint">Hold on tracer to change body</div>
        </>
      );
    }
    if (isColliderTool) {
      return (
        <>
          <div className="sim-hint">Click to place end A</div>
          <div className="sim-hint">Click again to place end C</div>
          <div className="sim-hint">Select barrier line to assign bodies</div>
          <div className="sim-hint">Escape to cancel</div>
        </>
      );
    }
    if (createTool === 'outline') {
      return (
        <>
          <div className="sim-hint">Click to place outline points</div>
          <div className="sim-hint">Click first point to close</div>
          <div className="sim-hint">Escape to cancel</div>
        </>
      );
    }
    if (isMirrorTool) {
      return (
        <>
          <div className="sim-hint">Hover a grid line to preview mirror axis</div>
          <div className="sim-hint">Click to mirror ({mirrorScope === 'all' ? 'all items' : 'selection'})</div>
          <div className="sim-hint">Items on axis stay shared and are not duplicated</div>
        </>
      );
    }
    // image
    return (
      <>
        <div className="sim-hint">Click image to select</div>
        <div className="sim-hint">Drag to move</div>
        <div className="sim-hint">Drag corners to scale</div>
        <div className="sim-hint">Drag top handle to rotate</div>
      </>
    );
  };

  return (
    <div className="toolbar">
      <div className="toolbar-mode-row">
        <button
          className={`mode-btn ${mode === 'create' ? 'active' : ''}`}
          onClick={() => handleModeSwitch('create')}
        >
          Create
        </button>
        <button
          className={`mode-btn simulate ${mode === 'simulate' ? 'active' : ''}`}
          onClick={() => handleModeSwitch('simulate')}
        >
          Simulate
        </button>
      </div>

      {mode === 'create' ? (
        <>
          <div className="panel-section-header">
            <div className="panel-title">Tools</div>
          </div>
          <div className="toolbar-section">
            {/* Joints group */}
            <div className="toolbar-group-label">Joints</div>

            <button
              className={`tool-btn ${isPivotTool ? 'active' : ''}`}
              onClick={() => setCreateTool('joints')}
            >
              <IconPivot />
              <span className="tool-name">Pivot</span>
            </button>

            <button
              className={`tool-btn ${isSliderTool ? 'active' : ''}`}
              onClick={() => setCreateTool('slider')}
            >
              <IconSlider />
              <span className="tool-name">Slider</span>
            </button>

            <button
              className={`tool-btn ${isColliderTool ? 'active' : ''}`}
              onClick={() => setCreateTool('collider')}
            >
              <IconCollider />
              <span className="tool-name">Collider</span>
            </button>

            {/* Shapes group */}
            <div className="toolbar-group-label">Shapes</div>

            <button
              className={`tool-btn ${createTool === 'outline' ? 'active' : ''}`}
              onClick={() => setCreateTool('outline')}
            >
              <IconOutline />
              <span className="tool-name">Outline</span>
            </button>

            <button
              className={`tool-btn ${createTool === 'image' ? 'active' : ''}`}
              onClick={() => {
                if (createTool === 'image') {
                  handleImportImage();
                } else {
                  setCreateTool('image');
                  const hasImages = Object.keys(useMechanismStore.getState().images).length > 0;
                  if (!hasImages) handleImportImage();
                }
              }}
            >
              <IconImage />
              <span className="tool-name">Image</span>
            </button>

            {/* Sensors group */}
            <div className="toolbar-group-label">Sensors</div>

            <button
              className={`tool-btn ${isTracerTool ? 'active' : ''}`}
              onClick={() => setCreateTool('tracer')}
            >
              <IconTracer />
              <span className="tool-name">Path Plotter</span>
            </button>
          </div>

          <div className="panel-section-header">
            <div className="panel-title">Interact</div>
          </div>
          <div className="toolbar-section interact-hints-fieldset">
            {renderHints()}
          </div>

          {isMirrorTool && (
            <>
              <div className="panel-section-header">
                <div className="panel-title">Options</div>
              </div>
              <fieldset className="toolbar-section panel-content interact-fieldset mirror-options-fieldset">
                <legend className="interact-fieldset-legend">Mirror scope</legend>
                <div className="mirror-options mirror-options-stack">
                  <label className="panel-toggle-row">
                    <input
                      type="radio"
                      name="mirror-scope"
                      checked={mirrorScope === 'selection'}
                      onChange={() => setMirrorScope('selection')}
                    />
                    <span>Selection</span>
                  </label>
                  <label className="panel-toggle-row">
                    <input
                      type="radio"
                      name="mirror-scope"
                      checked={mirrorScope === 'all'}
                      onChange={() => setMirrorScope('all')}
                    />
                    <span>All</span>
                  </label>
                </div>
              </fieldset>
            </>
          )}

          {showMarqueeBodiesPanel && (
            <>
              <div className="panel-section-header">
                <div className="panel-title">Selection</div>
              </div>
              <div className="toolbar-section marquee-selection-fieldset">
                <p className="toolbar-marquee-hint">
                  Uncheck to exclude a body from box and lasso selection.
                </p>
                <div className="marquee-body-list">
                  {sortedBodies.map((body) => (
                    <label key={body.id} className="panel-toggle-row">
                      <input
                        type="checkbox"
                        checked={!marqueeExcludedBodyIds.has(body.id)}
                        onChange={() => toggleMarqueeBodyExcluded(body.id)}
                      />
                      <span
                        className="layer-color"
                        style={{ backgroundColor: body.color }}
                        aria-hidden
                      />
                      <span className="layer-name">{body.name}</span>
                    </label>
                  ))}
                </div>
              </div>
            </>
          )}
        </>
      ) : (
        <>
          <div className="panel-section-header">
            <div className="panel-title">Interact</div>
          </div>
          <div className="toolbar-section">
            <div className="sim-hint">Click & drag joints, links, or shapes to apply force</div>
            <div className="sim-hint">Middle-click to pan</div>
            <div className="sim-hint">Scroll to zoom</div>
          </div>
        </>
      )}

      <div className="toolbar-footer">
        <div style={{ fontSize: 9, color: '#555', lineHeight: 1.4 }}>
          Written by Hugo Wilson and Jake Whiting
        </div>
      </div>
    </div>
  );
}
