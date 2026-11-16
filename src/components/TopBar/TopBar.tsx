import { useState, useRef, useEffect, useCallback } from 'react';
import { Save, FolderOpen, Undo2, Redo2, FileDown, Trash2, Pause, Play, RotateCcw } from 'lucide-react';
import { useEditorStore } from '../../store/editor-store';
import { useMechanismStore } from '../../store/mechanism-store';
import { useSimulationStore, resetRuntimeForDocument } from '../../store/simulation-store';
import { switchMode } from '../../utils/mode-switch';
import { downloadFile } from '../../utils/file-io';
import { openLocalFile, saveLocalFile } from '../../utils/file-adapter';
import { importProject, isProjectDirty, markProjectSaved, projectText, setProjectMessage, useProjectStatus } from '../../document/project';
import { exportDXF } from '../../utils/export-dxf';
import './TopBar.css';

declare const __APP_VERSION__: string;

function ProjectNameInput() {
  const projectName = useEditorStore((s) => s.projectName);
  const setProjectName = useEditorStore((s) => s.setProjectName);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(projectName);
  const inputRef = useRef<HTMLInputElement>(null);
  const draftRef = useRef(projectName);
  const editingRef = useRef(false);
  const begin = () => { draftRef.current = projectName; editingRef.current = true; setDraft(projectName); setEditing(true); };
  const finish = (commit: boolean) => {
    if (!editingRef.current) return;
    editingRef.current = false;
    if (commit && draftRef.current.trim()) setProjectName(draftRef.current.trim());
    setEditing(false);
  };

  useEffect(() => { if (editing) inputRef.current?.select(); }, [editing]);

  if (!editing) {
    return (
      <button type="button"
        className="project-name"
        onClick={begin}
        title="Rename project"
      >
        {projectName}
      </button>
    );
  }

  return (
    <input
      ref={inputRef}
      aria-label="Project name"
      className="project-name-input"
      value={draft}
      onChange={(e) => { draftRef.current = e.target.value; setDraft(e.target.value); }}
      onBlur={() => finish(true)}
      onKeyDown={(e) => {
        if (e.key === 'Enter') {
          finish(true);
        } else if (e.key === 'Escape') {
          finish(false);
        }
      }}
    />
  );
}

export function TopBar() {
  const undo = useMechanismStore((s) => s.undo);
  const redo = useMechanismStore((s) => s.redo);
  const clearAll = useMechanismStore((s) => s.clearAll);
  const pastLength = useMechanismStore((s) => s.past.length);
  const futureLength = useMechanismStore((s) => s.future.length);
  const clearSelection = useEditorStore((s) => s.clearSelection);
  const mode = useEditorStore((s) => s.mode);
  const isCreate = mode === 'create';
  const [busy, setBusy] = useState(false);
  const busyRef = useRef(false);
  const message = useProjectStatus(s => s.message);
  const severity = useProjectStatus(s => s.severity);
  const isPlaying = useSimulationStore(s => s.isPlaying);
  const stepError = useSimulationStore(s => s.stepError);

  const handleSave = useCallback(async () => {
    if (busyRef.current || useEditorStore.getState().mode !== 'create') return;
    const editor = useEditorStore.getState();

    // If project is still "Untitled", prompt for a name
    let name = editor.projectName;
    if (name === 'Untitled') {
      const newName = prompt('Project name:', name);
      if (!newName) return; // cancelled
      const trimmed = newName.trim();
      if (trimmed) {
        name = trimmed;
      }
    }

    busyRef.current = true; setBusy(true);
    try {
      const text = projectText(name);
      const outcome = await saveLocalFile(text, `${name}.slinker`);
      if (outcome.status === 'failed') setProjectMessage(`Save failed: ${outcome.error.message}`, 'alert');
      else if (outcome.status === 'cancelled') setProjectMessage('Save cancelled. Unsaved changes retained.');
      else if (outcome.confirmation === 'confirmed-write') {
        editor.setProjectName(name); markProjectSaved(text); setProjectMessage(`Saved ${outcome.name}`);
      } else setProjectMessage(`Download started: ${outcome.name}. File storage is not confirmed.`);
    } catch (error) { setProjectMessage(`Save failed: ${error instanceof Error ? error.message : String(error)}`, 'alert'); }
    finally { busyRef.current = false; setBusy(false); }
  }, []);

  const handleOpen = useCallback(async () => {
    if (useEditorStore.getState().mode !== 'create' || busyRef.current || (isProjectDirty() && !confirm('Discard unsaved changes and open another file?'))) return;
    busyRef.current = true; setBusy(true);
    try {
      const file = await openLocalFile();
      if (file.status === 'cancelled') { setProjectMessage('Open cancelled. Current project unchanged.'); return; }
      if (file.status === 'failed') { setProjectMessage(`Open failed: ${file.error.message}`, 'alert'); return; }
      const result = importProject(file.content);
      if (!result.ok) setProjectMessage(result.issues.map(x => `${x.path}: ${x.message}`).slice(0, 5).join('\n'), 'alert');
      else setProjectMessage(result.issues.length ? `Opened ${file.name}. ${result.issues.length} saved barrier references are unresolved; data retained.` : `Opened ${file.name}.`);
    } catch (error) { setProjectMessage(`Open failed: ${error instanceof Error ? error.message : String(error)}`, 'alert'); }
    finally { busyRef.current = false; setBusy(false); }
  }, []);

  useEffect(() => {
    const handler = (event: KeyboardEvent) => {
      if (!(event.ctrlKey || event.metaKey) || event.altKey || !['s', 'o'].includes(event.key.toLowerCase())) return;
      event.preventDefault();
      if (document.activeElement instanceof HTMLElement) document.activeElement.blur();
      if (event.key.toLowerCase() === 's') void handleSave(); else void handleOpen();
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [handleSave, handleOpen]);

  return (
    <>
    <div className="top-bar" aria-busy={busy}>
      <ProjectNameInput />

      {!isCreate && <div className="top-bar-group">
        <button className="top-bar-btn" aria-label={isPlaying ? 'Pause' : stepError ? 'Retry' : 'Resume'} title={isPlaying ? 'Pause' : stepError ? 'Retry' : 'Resume'} onClick={() => isPlaying ? useSimulationStore.getState().pause() : useSimulationStore.getState().play()}>
          {isPlaying ? <Pause size={16}/> : <Play size={16}/>}<span className="top-bar-label">{isPlaying ? 'Pause' : stepError ? 'Retry' : 'Resume'}</span>
        </button>
        <button className="top-bar-btn" aria-label="Restart" title="Restart" onClick={() => { switchMode('create'); switchMode('simulate'); }}><RotateCcw size={16}/><span className="top-bar-label">Restart</span></button>
      </div>}

      <div className="top-bar-separator" />

      <div className="top-bar-group">
        <button className="top-bar-btn" aria-label="Save" onClick={handleSave} title="Save file" disabled={!isCreate || busy}>
          <Save size={16}/>
          <span className="top-bar-label">Save</span>
        </button>
        <button className="top-bar-btn" aria-label="Open" onClick={handleOpen} title="Open file" disabled={!isCreate || busy}>
          <FolderOpen size={16}/>
          <span className="top-bar-label">Open</span>
        </button>
      </div>

      <div className="top-bar-separator" />

      <div className="top-bar-group">
        <button className="top-bar-btn" aria-label="Undo" onClick={undo} title="Undo (Ctrl+Z)" disabled={!isCreate || !pastLength || busy}>
          <Undo2 size={16}/>
          <span className="top-bar-label">Undo</span>
        </button>
        <button className="top-bar-btn" aria-label="Redo" onClick={redo} title="Redo (Ctrl+Y)" disabled={!isCreate || !futureLength || busy}>
          <Redo2 size={16}/>
          <span className="top-bar-label">Redo</span>
        </button>
      </div>

      <div className="top-bar-separator" />

      <div className="top-bar-group">
        <button
          className="top-bar-btn danger"
          onClick={() => { if (confirm('Clear everything?')) { clearAll(); clearSelection(); resetRuntimeForDocument(); } }}
          title="Clear all"
          aria-label="Clear All"
          disabled={!isCreate || busy}
        >
          <Trash2 size={16}/><span className="top-bar-label">Clear All</span>
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
          aria-label="Export DXF"
          disabled={!isCreate}
        >
          <FileDown size={16}/>
          <span className="top-bar-label">Export DXF</span>
        </button>
      </div>

      <div className="top-bar-brand">
        <span>Slinker v{__APP_VERSION__}</span>
      </div>
    </div>
    {(stepError || message) && <div className={`project-feedback ${stepError ? 'alert' : severity}`} role={stepError ? 'alert' : severity}>{stepError ?? message}</div>}
    </>
  );
}
