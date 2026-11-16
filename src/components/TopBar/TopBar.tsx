import { useState, useRef, useEffect, useCallback } from 'react';
import { Save, FolderOpen, Undo2, Redo2, Trash2, Pause, Play, RotateCcw, X } from 'lucide-react';
import { useEditorStore } from '../../store/editor-store';
import { useMechanismStore } from '../../store/mechanism-store';
import { useSimulationStore, resetRuntimeForDocument } from '../../store/simulation-store';
import { switchMode } from '../../utils/mode-switch';
import { openLocalFile } from '../../utils/file-adapter';
import { importProject, isProjectDirty, projectDesignSignature, projectText, setProjectMessage, useProjectStatus } from '../../document/project';
import { saveProjectLocally } from '../../document/local-save';
import { RecoveryControl } from '../RecoveryControl';
import type { RecoveryActions } from '../RecoveryControl';
import { CadExportControl } from '../CadExportControl';
import { CloudControl } from '../CloudControl';
import { UpdateControl } from '../UpdateControl';
import { cancelInteractions } from '../../interaction/session';
import { containDialogTab } from '../../interaction/dialog-focus';
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
  const recovery = useRef<RecoveryActions>(null), navigationDialog = useRef<HTMLDialogElement>(null);
  const openTrigger = useRef<HTMLButtonElement>(null), clearTrigger = useRef<HTMLButtonElement>(null);
  const navigationSession = useRef('');
  const [navigation, setNavigation] = useState<'open' | 'clear'>('open'), [navigationSaved, setNavigationSaved] = useState(false);
  const message = useProjectStatus(s => s.message);
  const severity = useProjectStatus(s => s.severity);
  const isPlaying = useSimulationStore(s => s.isPlaying);
  const stepError = useSimulationStore(s => s.stepError);

  const handleSave = useCallback(async () => {
    if (busyRef.current || useEditorStore.getState().mode !== 'create') return false;
    cancelInteractions();
    const editor = useEditorStore.getState();

    // If project is still "Untitled", prompt for a name
    let name = editor.projectName;
    if (name === 'Untitled') {
      const newName = prompt('Project name:', name);
      if (!newName) return false;
      const trimmed = newName.trim();
      if (trimmed) {
        name = trimmed;
      }
    }

    busyRef.current = true; setBusy(true);
    try {
      const { outcome, obsolete, savedCurrent } = await saveProjectLocally(name);
      if (obsolete) return false;
      if (outcome.status === 'failed') setProjectMessage(`Save failed: ${outcome.error.message}`, 'alert');
      else if (outcome.status === 'cancelled') setProjectMessage('Save cancelled. Unsaved changes retained.');
      else if (outcome.confirmation === 'confirmed-write') {
        setProjectMessage(savedCurrent ? `Saved ${outcome.name}` : `Saved ${outcome.name}. Newer changes remain unsaved.`);
      } else setProjectMessage(`Download started: ${outcome.name}. File storage is not confirmed.`);
      return savedCurrent;
    } catch (error) { setProjectMessage(`Save failed: ${error instanceof Error ? error.message : String(error)}`, 'alert'); return false; }
    finally { busyRef.current = false; setBusy(false); }
  }, []);

  const openFile = useCallback(async (discard = false) => {
    if (useEditorStore.getState().mode !== 'create' || busyRef.current) return;
    cancelInteractions();
    const session = useProjectStatus.getState().sessionId, signature = projectDesignSignature(projectText());
    busyRef.current = true; setBusy(true);
    try {
      const file = await openLocalFile();
      if (file.status === 'cancelled') { setProjectMessage('Open cancelled. Current project unchanged.'); return; }
      if (file.status === 'failed') { setProjectMessage(`Open failed: ${file.error.message}`, 'alert'); return; }
      if (useProjectStatus.getState().sessionId !== session || projectDesignSignature(projectText()) !== signature) {
        setProjectMessage('Project changed while the file was being read. Open again to retry.', 'alert'); return;
      }
      const result = importProject(file.content);
      if (!result.ok) setProjectMessage(result.issues.map(x => `${x.path}: ${x.message}`).slice(0, 5).join('\n'), 'alert');
      else setProjectMessage(result.issues.length ? `Opened ${file.name}. ${result.issues.length} saved barrier references are unresolved; data retained.` : `Opened ${file.name}.`);
      if (result.ok && discard) await recovery.current?.discard(session);
    } catch (error) { setProjectMessage(`Open failed: ${error instanceof Error ? error.message : String(error)}`, 'alert'); }
    finally { busyRef.current = false; setBusy(false); }
  }, []);

  const requestNavigation = useCallback((action: 'open' | 'clear') => {
    if (busyRef.current || useEditorStore.getState().mode !== 'create') return;
    cancelInteractions();
    if (action === 'open' && !isProjectDirty()) { void openFile(); return; }
    navigationSession.current = useProjectStatus.getState().sessionId;
    (action === 'open' ? openTrigger : clearTrigger).current?.focus();
    setNavigation(action); setNavigationSaved(!isProjectDirty()); navigationDialog.current?.showModal();
  }, [openFile]);
  const handleOpen = useCallback(() => requestNavigation('open'), [requestNavigation]);
  const finishNavigation = () => {
    if (busyRef.current) return;
    if (navigationSession.current !== useProjectStatus.getState().sessionId || useEditorStore.getState().mode !== 'create') {
      navigationDialog.current?.close(); setProjectMessage('Project changed. Retry the action.', 'alert'); return;
    }
    navigationDialog.current?.close();
    if (navigation === 'open') void openFile(!navigationSaved);
    else { clearAll(); clearSelection(); resetRuntimeForDocument(); }
  };

  useEffect(() => {
    const handler = (event: KeyboardEvent) => {
      if (document.querySelector('dialog[open]')) return;
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
        <button ref={openTrigger} className="top-bar-btn" aria-label="Open" onClick={handleOpen} title="Open file" disabled={!isCreate || busy}>
          <FolderOpen size={16}/>
          <span className="top-bar-label">Open</span>
        </button>
        <RecoveryControl ref={recovery}/>
        <CloudControl flush={async () => { await recovery.current?.flush(); }} saveLocal={handleSave}/>
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
          ref={clearTrigger}
          className="top-bar-btn danger"
          onClick={() => requestNavigation('clear')}
          title="Clear all"
          aria-label="Clear All"
          disabled={!isCreate || busy}
        >
          <Trash2 size={16}/><span className="top-bar-label">Clear All</span>
        </button>
      </div>

      <div className="top-bar-spacer" />

      <div className="top-bar-group">
        <CadExportControl/>
      </div>

      <div className="top-bar-brand">
        <span>Slinker v{__APP_VERSION__}</span>
      </div>
      <UpdateControl checkpoint={async () => await recovery.current?.checkpoint() ?? false} saveLocal={handleSave}/>
    </div>
    <div className={`project-feedback ${stepError ? 'alert' : severity} ${!stepError && !message ? 'empty' : ''}`} role={stepError ? 'alert' : severity}>{stepError ?? message}</div>
    <dialog ref={navigationDialog} className="project-dialog" aria-labelledby="navigation-title" onKeyDown={containDialogTab} onClose={() => { if (!document.querySelector('dialog[open]')) (navigation === 'open' ? openTrigger : clearTrigger).current?.focus(); }}>
      <header><h2 id="navigation-title">{navigationSaved ? navigation === 'open' ? 'Open File' : 'Clear All' : 'Unsaved Changes'}</h2><button type="button" className="dialog-icon" aria-label="Cancel navigation" title="Close" disabled={busy} onClick={() => navigationDialog.current?.close()}><X size={18}/></button></header>
      <div className="dialog-body"><p>{navigationSaved ? navigation === 'open' ? 'Current changes are saved.' : 'Clear the current design?' : 'Current changes have not been saved to a confirmed file.'}</p></div>
      <footer>
        {!navigationSaved && <button type="button" className="dialog-command" disabled={busy} onClick={() => { void handleSave().then(saved => { if (saved && navigationDialog.current?.open) setNavigationSaved(true); }); }}><Save size={16}/>Save first</button>}
        <button type="button" className="dialog-command" disabled={busy} onClick={finishNavigation}>{navigationSaved ? navigation === 'open' ? 'Open file' : 'Clear all' : navigation === 'open' ? 'Discard and open' : 'Discard and clear'}</button>
        <button type="button" className="dialog-command" disabled={busy} onClick={() => navigationDialog.current?.close()}>Cancel</button>
      </footer>
    </dialog>
    </>
  );
}
