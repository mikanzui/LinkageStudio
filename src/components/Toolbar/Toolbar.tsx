import { importImage as handleImportImage } from '../../utils/import-image';
import { deleteSelectedEntities } from '../../utils/delete-selection';
import { useEditorStore } from '../../store/editor-store';
import { useMechanismStore } from '../../store/mechanism-store';
import type { AppMode } from '../../types';
import { switchMode } from '../../utils/mode-switch';
import './Toolbar.css';
import { DrawToolButton, MirrorToolButton } from '../GeometryTools';
import { SpringTools } from '../SpringTools';
import { SensorToolButton } from '../ObjectTools';

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
  const drawing = useEditorStore((s) => s.activeTool === 'joint');
  const setCreateTool = useEditorStore((s) => s.setCreateTool);
  const outlines = useMechanismStore((s) => s.outlines);
  const selectedIds = useEditorStore((s) => s.selectedIds);

  const editingOutlineId = useEditorStore((s) => s.editingOutlineId);
  const editingVertexIndex = useEditorStore((s) => s.editingVertexIndex);

  const hasSelection = selectedIds.size > 0;
  const hasVertexSelection = editingOutlineId !== null && editingVertexIndex !== null;
  const canDeleteVertex = hasVertexSelection && (() => {
    const outline = outlines[editingOutlineId!];
    return outline && outline.points.length > (outline.closed === false ? 2 : 3);
  })();



  const handleModeSwitch = (newMode: AppMode) => switchMode(newMode);



  const isPivotTool = drawing && createTool === 'joints';
  const isSliderTool = drawing && createTool === 'slider';
  const isColliderTool = drawing && createTool === 'collider';
  const isTracerTool = drawing && createTool === 'tracer';


  return (
    <div className="toolbar">
      <div className="toolbar-section mode-toggle">
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
          <div className="toolbar-section">
            <div className="toolbar-label">Tools</div>

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

            <DrawToolButton />
            <MirrorToolButton />
            <div className="toolbar-group-label">Springs</div>
            <SpringTools />

            <button
              className={`tool-btn ${drawing && createTool === 'image' ? 'active' : ''}`}
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
            <SensorToolButton />

            <button
              className={`tool-btn ${isTracerTool ? 'active' : ''}`}
              onClick={() => setCreateTool('tracer')}
            >
              <IconTracer />
              <span className="tool-name">Path Plotter</span>
            </button>
          </div>

          {(hasSelection || hasVertexSelection) && (
            <div className="toolbar-section">
              <button
                className="tool-btn"
                onClick={deleteSelectedEntities}
                title={hasVertexSelection ? 'Delete vertex (Backspace)' : 'Delete selected (Backspace)'}
                style={{ color: '#E53935' }}
                disabled={hasVertexSelection && !canDeleteVertex}
              >
                {hasVertexSelection ? 'Delete Vertex' : 'Delete'}
              </button>
            </div>
          )}

        </>
      ) : null}

      <div style={{ marginTop: 'auto', padding: '8px', borderTop: '1px solid #333' }}>
        <div style={{ fontSize: 10, color: '#999', lineHeight: 1.4 }}>
          Coauthored by <a href="https://github.com/mikanzui" target="_blank" rel="noreferrer" style={{ color: '#a3cce8' }}>Jake Whiting</a> and <a href="https://github.com/Huggabiz/linkage-studio" target="_blank" rel="noreferrer" style={{ color: '#a3cce8' }}>Hugo Wilson</a>
        </div>
      </div>
    </div>
  );
}
