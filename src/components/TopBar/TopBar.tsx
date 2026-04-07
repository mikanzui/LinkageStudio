import { useState, useRef, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { useEditorStore } from '../../store/editor-store';
import { useMechanismStore } from '../../store/mechanism-store';
import { useSimulationStore } from '../../store/simulation-store';
import { serializeMechanism, deserializeMechanism, saveFileAs, openFilePicker, downloadFile } from '../../utils/file-io';
import { exportDXF } from '../../utils/export-dxf';
import { deleteSelectedEntities } from '../../utils/delete-selection';
import { showTransientHint } from '../../store/editor-store';
import type { GridLevel } from '../../types';
import './TopBar.css';

declare const __APP_VERSION__: string;

/** Same bytes as a saved .slinker file — used for unsaved-change detection (Open / etc.). */
function serializeCurrentProject(): string {
  const editor = useEditorStore.getState();
  const mech = useMechanismStore.getState();
  const sim = useSimulationStore.getState();
  const name = editor.projectName;
  const viewPreferences = {
    showLinks: editor.showLinks,
    showVectors: editor.showVectors,
    showRulers: editor.showRulers,
    showForceUnits: editor.showForceUnits,
    gridLevel: editor.gridLevel,
    camera: { pan: { ...editor.camera.pan }, zoom: editor.camera.zoom },
  };
  const simulationSettings = {
    gravityEnabled: sim.gravityEnabled,
    gravityStrength: sim.gravityStrength,
    damping: sim.damping,
    dragMultiplier: sim.dragMultiplier,
    dragDamping: sim.dragDamping,
  };
  return serializeMechanism(
    mech.joints,
    mech.links,
    mech.bodies,
    mech.baseBodyId,
    mech.outlines,
    mech.images,
    mech.sliders,
    mech.colliders,
    mech.tracers,
    mech.springs,
    name,
    viewPreferences,
    simulationSettings,
  );
}

function ProjectNameInput() {
  const projectName = useEditorStore((s) => s.projectName);
  const setProjectName = useEditorStore((s) => s.setProjectName);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(projectName);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => { setDraft(projectName); }, [projectName]);
  useEffect(() => { if (editing) inputRef.current?.select(); }, [editing]);

  if (!editing) {
    return (
      <span
        className="project-name"
        onClick={() => setEditing(true)}
        title="Click to rename project"
      >
        {projectName}
      </span>
    );
  }

  return (
    <input
      ref={inputRef}
      className="project-name-input"
      value={draft}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={() => {
        const trimmed = draft.trim();
        if (trimmed) setProjectName(trimmed);
        setEditing(false);
      }}
      onKeyDown={(e) => {
        if (e.key === 'Enter') {
          const trimmed = draft.trim();
          if (trimmed) setProjectName(trimmed);
          setEditing(false);
        } else if (e.key === 'Escape') {
          setDraft(projectName);
          setEditing(false);
        }
      }}
    />
  );
}

export function TopBar() {
  const [clearAllOpen, setClearAllOpen] = useState(false);
  const [clearAllSaveBusy, setClearAllSaveBusy] = useState(false);
  const [openUnsavedOpen, setOpenUnsavedOpen] = useState(false);
  const [openUnsavedSaveBusy, setOpenUnsavedSaveBusy] = useState(false);
  const lastSavedFingerprintRef = useRef<string | null>(null);

  const undo = useMechanismStore((s) => s.undo);
  const redo = useMechanismStore((s) => s.redo);
  const clearAll = useMechanismStore((s) => s.clearAll);
  const outlines = useMechanismStore((s) => s.outlines);
  const selectedIds = useEditorStore((s) => s.selectedIds);
  const editingOutlineId = useEditorStore((s) => s.editingOutlineId);
  const editingVertexIndex = useEditorStore((s) => s.editingVertexIndex);
  const loadState = useMechanismStore((s) => s.loadState);
  const clearSelection = useEditorStore((s) => s.clearSelection);
  const setMode = useEditorStore((s) => s.setMode);
  const setCreateTool = useEditorStore((s) => s.setCreateTool);
  const setMirrorPreview = useEditorStore((s) => s.setMirrorPreview);
  const createTool = useEditorStore((s) => s.createTool);
  const mode = useEditorStore((s) => s.mode);
  const isCreate = mode === 'create';
  const isMirrorMode = createTool === 'mirror';

  const hasSelection = selectedIds.size > 0;
  const hasVertexSelection = editingOutlineId !== null && editingVertexIndex !== null;
  const canDeleteVertex =
    hasVertexSelection &&
    (() => {
      const outline = outlines[editingOutlineId!];
      return Boolean(outline && outline.points.length > 3);
    })();
  const deleteDisabled =
    !isCreate ||
    (!hasSelection && !hasVertexSelection) ||
    (hasVertexSelection && !canDeleteVertex);
  const deleteTitle = !isCreate
    ? 'Delete (Create mode only)'
    : hasVertexSelection
      ? 'Delete vertex (Backspace)'
      : 'Delete selected (Backspace)';

  const handleSave = async (): Promise<boolean> => {
    const editor = useEditorStore.getState();

    // If project is still "Untitled", prompt for a name
    let name = editor.projectName;
    if (name === 'Untitled') {
      const newName = prompt('Project name:', name);
      if (!newName) return false; // cancelled
      const trimmed = newName.trim();
      if (trimmed) {
        name = trimmed;
        editor.setProjectName(name);
      }
    }

    const json = serializeCurrentProject();
    await saveFileAs(json, `${name}.slinker`);
    lastSavedFingerprintRef.current = json;
    return true;
  };

  const performOpen = async () => {
    const json = await openFilePicker();
    if (!json) return;
    const state = deserializeMechanism(json);
    if (!state) { alert('Invalid file format'); return; }
    loadState(state);
    clearSelection();

    // Restore project name from file if present
    if (state.projectName) {
      useEditorStore.getState().setProjectName(state.projectName);
    }

    // Restore view preferences
    if (state.viewPreferences) {
      const vp = state.viewPreferences;
      const editor = useEditorStore.getState();
      if (vp.showLinks !== undefined) { if (vp.showLinks !== editor.showLinks) editor.toggleShowLinks(); }
      if (vp.showVectors !== undefined) { if (vp.showVectors !== editor.showVectors) editor.toggleShowVectors(); }
      if (vp.showRulers !== undefined) { if (vp.showRulers !== editor.showRulers) editor.toggleShowRulers(); }
      if (vp.showForceUnits !== undefined) { if (vp.showForceUnits !== editor.showForceUnits) editor.toggleShowForceUnits(); }
      if (vp.gridLevel) editor.setGridLevel(vp.gridLevel as GridLevel);
      if (vp.camera) {
        useEditorStore.setState({ camera: { pan: vp.camera.pan, zoom: vp.camera.zoom } });
      }
    }

    // Restore simulation settings
    if (state.simulationSettings) {
      const ss = state.simulationSettings;
      const sim = useSimulationStore.getState();
      if (ss.gravityEnabled !== undefined && ss.gravityEnabled !== sim.gravityEnabled) sim.toggleGravity();
      if (ss.gravityStrength !== undefined) sim.setGravityStrength(ss.gravityStrength);
      if (ss.damping !== undefined) sim.setDamping(ss.damping);
      if (ss.dragMultiplier !== undefined) sim.setDragMultiplier(ss.dragMultiplier);
      if (ss.dragDamping !== undefined) sim.setDragDamping(ss.dragDamping);
    }

    lastSavedFingerprintRef.current = serializeCurrentProject();
  };

  useEffect(() => {
    lastSavedFingerprintRef.current = serializeCurrentProject();
  }, []);

  const handleOpenClick = () => {
    if (!isCreate) return;
    if (lastSavedFingerprintRef.current === null) {
      lastSavedFingerprintRef.current = serializeCurrentProject();
    }
    if (serializeCurrentProject() === lastSavedFingerprintRef.current) {
      void performOpen();
      return;
    }
    setOpenUnsavedOpen(true);
  };

  useEffect(() => {
    if (!clearAllOpen && !openUnsavedOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setClearAllOpen(false);
        setOpenUnsavedOpen(false);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [clearAllOpen, openUnsavedOpen]);

  const handleClearAllSaveFirst = async () => {
    if (!isCreate) return;
    setClearAllSaveBusy(true);
    try {
      const ok = await handleSave();
      if (ok) {
        showTransientHint('Project saved. Use “Clear everything” when you are ready to wipe the canvas.');
      }
    } catch (err) {
      console.error(err);
      showTransientHint('Save failed — try again or pick another location.');
    } finally {
      setClearAllSaveBusy(false);
    }
  };

  const handleClearAllConfirm = () => {
    clearAll();
    clearSelection();
    setClearAllOpen(false);
  };

  const handleOpenSaveFirst = async () => {
    if (!isCreate) return;
    setOpenUnsavedSaveBusy(true);
    try {
      const ok = await handleSave();
      if (ok) {
        showTransientHint('Project saved. Use “Open” when you are ready to load a file.');
      }
    } catch (err) {
      console.error(err);
      showTransientHint('Save failed — try again or pick another location.');
    } finally {
      setOpenUnsavedSaveBusy(false);
    }
  };

  const handleOpenWithoutSaving = () => {
    setOpenUnsavedOpen(false);
    void performOpen();
  };

  return (
    <div className="top-bar">
      <ProjectNameInput />

      <div className="top-bar-separator" />

      <div className="top-bar-group">
        <button className="top-bar-btn" onClick={handleSave} title="Save file" disabled={!isCreate}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z"/>
            <polyline points="17 21 17 13 7 13 7 21"/>
            <polyline points="7 3 7 8 15 8"/>
          </svg>
          Save
        </button>
        <button className="top-bar-btn" onClick={handleOpenClick} title="Open file" disabled={!isCreate}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/>
          </svg>
          Open
        </button>
      </div>

      <div className="top-bar-separator" />

      <div className="top-bar-group">
        <button className="top-bar-btn" onClick={undo} title="Undo (Ctrl+Z)">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="1 4 1 10 7 10"/>
            <path d="M3.51 15a9 9 0 1 0 2.13-9.36L1 10"/>
          </svg>
          Undo
        </button>
        <button className="top-bar-btn" onClick={redo} title="Redo (Ctrl+Y)">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="23 4 23 10 17 10"/>
            <path d="M20.49 15a9 9 0 1 1-2.13-9.36L23 10"/>
          </svg>
          Redo
        </button>
      </div>

      <div className="top-bar-separator" />

      <div className="top-bar-group">
        <button
          type="button"
          className={`top-bar-btn ${isMirrorMode ? 'top-bar-btn-active' : ''}`}
          disabled={!isCreate}
          onClick={() => {
            if (isMirrorMode) {
              setMirrorPreview(null);
              setCreateTool('joints');
            } else {
              setMode('create');
              setCreateTool('mirror');
            }
          }}
          title={
            !isCreate
              ? 'Mirror (Create mode only)'
              : isMirrorMode
                ? 'Click again or press Escape to exit mirror mode'
                : 'Mirror across a grid line (one shot)'
          }
        >
          <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round">
            <line x1="8" y1="1.5" x2="8" y2="14.5" strokeDasharray="2 1.6" />
            <path d="M7 3L3.5 4.8V11.2L7 13V3Z" />
            <path d="M9 3L12.5 4.8V11.2L9 13V3Z" fill="currentColor" opacity="0.3" />
          </svg>
          Mirror
        </button>
      </div>

      <div className="top-bar-separator" />

      <div className="top-bar-group">
        <button
          type="button"
          className="top-bar-btn"
          onClick={() => deleteSelectedEntities()}
          disabled={deleteDisabled}
          title={deleteTitle}
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="3 6 5 6 21 6" />
            <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
            <line x1="10" y1="11" x2="10" y2="17" />
            <line x1="14" y1="11" x2="14" y2="17" />
          </svg>
          Delete
        </button>
      </div>

      <div className="top-bar-separator" />

      <div className="top-bar-group">
        <button
          type="button"
          className="top-bar-btn danger"
          disabled={!isCreate}
          onClick={() => setClearAllOpen(true)}
          title={!isCreate ? 'Clear all (Create mode only)' : 'Clear entire mechanism…'}
        >
          Clear All
        </button>
      </div>

      <div className="top-bar-spacer" />

      <div className="top-bar-group">
        <button
          className="top-bar-btn"
          onClick={() => {
            const mech = useMechanismStore.getState();
            const editor = useEditorStore.getState();
            const dxf = exportDXF(
              mech.joints, mech.links, mech.bodies, mech.baseBodyId,
              mech.outlines, mech.sliders, mech.colliders, editor.showLinks,
            );
            const name = editor.projectName || 'Untitled';
            downloadFile(dxf, `${name}.dxf`);
          }}
          title="Export as DXF"
          disabled={!isCreate}
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
            <polyline points="7 10 12 15 17 10"/>
            <line x1="12" y1="15" x2="12" y2="3"/>
          </svg>
          Export DXF
        </button>
      </div>

      <div className="top-bar-brand">
        <span>Slinker V{__APP_VERSION__}</span>
      </div>

      {clearAllOpen &&
        createPortal(
          <div
            className="top-bar-modal-backdrop"
            role="presentation"
            onClick={() => setClearAllOpen(false)}
          >
            <div
              className="top-bar-modal"
              role="dialog"
              aria-modal="true"
              aria-labelledby="clear-all-title"
              onClick={(e) => e.stopPropagation()}
            >
              <h2 id="clear-all-title" className="top-bar-modal-title">
                Clear everything?
              </h2>
              <p className="top-bar-modal-text">
                This removes all joints, links, bodies, shapes, images, sliders, colliders, and tracers from the canvas.{' '}
                <span className="top-bar-modal-warn">Save your project first</span>
                {' '}if you need to keep this design — unsaved work will be lost.
              </p>
              <div className="top-bar-modal-actions">
                <button type="button" className="top-bar-modal-btn" onClick={() => setClearAllOpen(false)}>
                  Cancel
                </button>
                <button
                  type="button"
                  className="top-bar-modal-btn top-bar-modal-btn-primary"
                  disabled={!isCreate || clearAllSaveBusy}
                  onClick={() => void handleClearAllSaveFirst()}
                >
                  {clearAllSaveBusy ? 'Saving…' : 'Save first…'}
                </button>
                <button
                  type="button"
                  className="top-bar-modal-btn top-bar-modal-btn-danger"
                  onClick={handleClearAllConfirm}
                >
                  Clear everything
                </button>
              </div>
            </div>
          </div>,
          document.body,
        )}

      {openUnsavedOpen &&
        createPortal(
          <div
            className="top-bar-modal-backdrop"
            role="presentation"
            onClick={() => setOpenUnsavedOpen(false)}
          >
            <div
              className="top-bar-modal"
              role="dialog"
              aria-modal="true"
              aria-labelledby="open-unsaved-title"
              onClick={(e) => e.stopPropagation()}
            >
              <h2 id="open-unsaved-title" className="top-bar-modal-title">
                Unsaved changes?
              </h2>
              <p className="top-bar-modal-text">
                Opening another file will replace the current project.{' '}
                <span className="top-bar-modal-warn">Save your project first</span>
                {' '}if you need to keep this design — unsaved work will be lost.
              </p>
              <div className="top-bar-modal-actions">
                <button type="button" className="top-bar-modal-btn" onClick={() => setOpenUnsavedOpen(false)}>
                  Cancel
                </button>
                <button
                  type="button"
                  className="top-bar-modal-btn top-bar-modal-btn-primary"
                  disabled={!isCreate || openUnsavedSaveBusy}
                  onClick={() => void handleOpenSaveFirst()}
                >
                  {openUnsavedSaveBusy ? 'Saving…' : 'Save first…'}
                </button>
                <button
                  type="button"
                  className="top-bar-modal-btn top-bar-modal-btn-danger"
                  onClick={handleOpenWithoutSaving}
                >
                  Open anyway
                </button>
              </div>
            </div>
          </div>,
          document.body,
        )}
    </div>
  );
}
