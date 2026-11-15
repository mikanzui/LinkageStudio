import { useState, useRef, useEffect } from 'react';
import { useEditorStore } from '../../store/editor-store';
import { useMechanismStore } from '../../store/mechanism-store';
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

  useEffect(() => { if (editing) inputRef.current?.select(); }, [editing]);

  if (!editing) {
    return (
      <span
        className="project-name"
        onClick={() => { setDraft(projectName); setEditing(true); }}
        role="button"
        tabIndex={0}
        onKeyDown={(e) => { if (e.key === 'Enter') { setDraft(projectName); setEditing(true); } }}
        title="Click to rename project"
      >
        {projectName}
      </span>
    );
  }

  return (
    <input
      ref={inputRef}
      aria-label="Project name"
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

  const handleSave = async () => {
    if (busyRef.current) return;
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
  };

  const handleOpen = async () => {
    if (busyRef.current || (isProjectDirty() && !confirm('Discard unsaved changes and open another file?'))) return;
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
  };

  return (
    <>
    <div className="top-bar" aria-busy={busy}>
      <ProjectNameInput />

      <div className="top-bar-separator" />

      <div className="top-bar-group">
        <button className="top-bar-btn" onClick={handleSave} title="Save file" disabled={!isCreate || busy}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z"/>
            <polyline points="17 21 17 13 7 13 7 21"/>
            <polyline points="7 3 7 8 15 8"/>
          </svg>
          Save
        </button>
        <button className="top-bar-btn" onClick={handleOpen} title="Open file" disabled={!isCreate || busy}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/>
          </svg>
          Open
        </button>
      </div>

      <div className="top-bar-separator" />

      <div className="top-bar-group">
        <button className="top-bar-btn" onClick={undo} title="Undo (Ctrl+Z)" disabled={!isCreate || !pastLength || busy}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="1 4 1 10 7 10"/>
            <path d="M3.51 15a9 9 0 1 0 2.13-9.36L1 10"/>
          </svg>
          Undo
        </button>
        <button className="top-bar-btn" onClick={redo} title="Redo (Ctrl+Y)" disabled={!isCreate || !futureLength || busy}>
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
          className="top-bar-btn danger"
          onClick={() => { if (confirm('Clear everything?')) { clearAll(); clearSelection(); } }}
          title="Clear all"
          disabled={!isCreate || busy}
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
        <span>Slinker v{__APP_VERSION__}</span>
      </div>
    </div>
    {message && <div className={`project-feedback ${severity}`} role={severity}>{message}</div>}
    </>
  );
}
