import { useEffect, useImperativeHandle, useRef, useState } from 'react';
import type { Ref } from 'react';
import { Download, History, RotateCcw, Trash2, X } from 'lucide-react';
import { RecoveryCoordinator } from '../document/recovery';
import type { RecoveryDraft, RecoveryStorage } from '../document/recovery';
import { createIndexedDbRecoveryStorage } from '../document/recovery-storage';
import { importProject, isProjectDirty, markProjectRecovered, projectText, useProjectStatus } from '../document/project';
import { useMechanismStore } from '../store/mechanism-store';
import { useEditorStore } from '../store/editor-store';
import { useSimulationStore } from '../store/simulation-store';
import { useRecoveryStore } from '../store/recovery-store';
import { cancelInteractions, hasActiveInteractions } from '../interaction/session';
import { containDialogTab } from '../interaction/dialog-focus';
import { writeRestartCheckpoint } from '../document/restart';
import './ProjectDialog.css';

export interface RecoveryActions { flush(): Promise<void>; discard(id: string): Promise<void>; checkpoint(): Promise<boolean> }
type Runtime = { storage: RecoveryStorage; coordinator: RecoveryCoordinator };

export function RecoveryControl({ ref }: { ref: Ref<RecoveryActions> }) {
  const runtime = useRef<Runtime | null>(null), dialog = useRef<HTMLDialogElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const selectionToken = useRef(0), modalToken = useRef(0), openedSession = useRef(''), alive = useRef(false);
  const downloadUrl = useRef(''), mutating = useRef(false);
  const open = useRecoveryStore(s => s.open), drafts = useRecoveryStore(s => s.drafts);
  const status = useRecoveryStore(s => s.status), storageError = useRecoveryStore(s => s.error);
  const [selected, setSelected] = useState(''), [draft, setDraft] = useState<RecoveryDraft | null>(null);
  const [loading, setLoading] = useState(false), [error, setError] = useState(''), [url, setUrl] = useState('');
  const [opening, setOpening] = useState(false);

  useImperativeHandle(ref, () => ({
    async flush() { await runtime.current?.coordinator.flush(); },
    async discard(id) { await runtime.current?.coordinator.discard(id); },
    async checkpoint() {
      const owned = runtime.current;
      if (!owned) return false;
      const result = await writeRestartCheckpoint(owned.storage, () => ({ sessionId: useProjectStatus.getState().sessionId, text: projectText(), displayName: useEditorStore.getState().projectName, interacting: hasActiveInteractions() }), () => owned.coordinator.flush());
      return result === 'ready' && runtime.current === owned;
    },
  }), []);

  useEffect(() => {
    alive.current = true; let generation = 0;
    const storage = createIndexedDbRecoveryStorage();
    const coordinator = new RecoveryCoordinator(storage, {
      capture() {
        if (hasActiveInteractions()) return null;
        const text = projectText();
        return { sessionId: useProjectStatus.getState().sessionId, generation, text,
          displayName: useEditorStore.getState().projectName, dirty: isProjectDirty(text) };
      },
      isCurrent: snapshot => !hasActiveInteractions() && snapshot.generation === generation && snapshot.sessionId === useProjectStatus.getState().sessionId,
      status(next, issue = '') {
        const previous = useRecoveryStore.getState();
        if (previous.status !== next || previous.error !== issue) useRecoveryStore.setState({ status: next, error: issue });
      },
    });
    const owned = { storage, coordinator }; runtime.current = owned;
    const changed = () => { generation++; coordinator.notify(); };
    const unsubscribe = [
      useMechanismStore.subscribe((next, previous) => {
        if (useEditorStore.getState().mode === 'create' && ['joints', 'links', 'bodies', 'outlines', 'images', 'sliders', 'colliders', 'tracers', 'springs', 'forceSensors'].some(key => next[key as keyof typeof next] !== previous[key as keyof typeof previous])) changed();
      }),
      useEditorStore.subscribe((next, previous) => {
        if (['projectName', 'mode', 'camera', 'showLinks', 'showVectors', 'showRulers', 'showForceUnits', 'showLoads', 'showReactions', 'gridLevel', 'frozenOutlineWorldPoints'].some(key => next[key as keyof typeof next] !== previous[key as keyof typeof previous])) changed();
      }),
      useSimulationStore.subscribe((next, previous) => {
        if (['gravityEnabled', 'gravityStrength', 'damping', 'dragMultiplier', 'dragDamping'].some(key => next[key as keyof typeof next] !== previous[key as keyof typeof previous])) changed();
      }),
      useProjectStatus.subscribe((next, previous) => { if (next.sessionId !== previous.sessionId || next.savedText !== previous.savedText || next.forceDirty !== previous.forceDirty) changed(); }),
    ];
    const hidden = () => { if (document.hidden) void coordinator.flush(); };
    const leaving = () => { void coordinator.flush(); };
    document.addEventListener('visibilitychange', hidden); window.addEventListener('pagehide', leaving);
    void storage.list().then(rows => {
      if (runtime.current !== owned) return;
      useRecoveryStore.setState({ drafts: rows });
      if (rows.length && !isProjectDirty() && !Object.keys(useMechanismStore.getState().joints).some(id => !useMechanismStore.getState().joints[id].hidden)) {
        openedSession.current = useProjectStatus.getState().sessionId;
        useRecoveryStore.setState({ open: true });
      }
    }).catch(issue => { if (runtime.current === owned) useRecoveryStore.setState({ status: 'unavailable', error: String(issue) }); });
    return () => {
      alive.current = false;
      if (downloadUrl.current) URL.revokeObjectURL(downloadUrl.current);
      unsubscribe.forEach(stop => stop()); document.removeEventListener('visibilitychange', hidden); window.removeEventListener('pagehide', leaving);
      coordinator.dispose(); if (runtime.current === owned) runtime.current = null;
    };
  }, []);

  useEffect(() => {
    if (open && !dialog.current?.open) dialog.current?.showModal();
    if (!open && dialog.current?.open) dialog.current.close();
  }, [open]);
  const clearDownload = () => {
    const previous = downloadUrl.current; downloadUrl.current = ''; setUrl('');
    if (previous) setTimeout(() => URL.revokeObjectURL(previous), 60_000);
  };
  const close = () => { modalToken.current++; selectionToken.current++; clearDownload(); setLoading(false); setOpening(false); setDraft(null); setSelected(''); setError(''); useRecoveryStore.setState({ open: false }); };
  const select = async (id: string) => {
    const owned = runtime.current, token = ++selectionToken.current;
    clearDownload(); setSelected(id); setDraft(null); setError(''); setLoading(true);
    try {
      const value = await owned?.storage.read(id);
      if (token === selectionToken.current && runtime.current === owned) {
        if (!value) throw new Error('Recovery draft no longer exists.');
        const blob = URL.createObjectURL(new Blob([value.text], { type: 'application/json' }));
        downloadUrl.current = blob; setUrl(blob); setDraft(value);
      }
    } catch (issue) { if (token === selectionToken.current && runtime.current === owned && alive.current) setError(String(issue)); }
    finally { if (token === selectionToken.current && runtime.current === owned && alive.current) setLoading(false); }
  };
  const refresh = async (token: number, selection: number) => {
    const owned = runtime.current; if (!owned) return;
    const rows = await owned.storage.list();
    if (runtime.current === owned) {
      useRecoveryStore.setState({ drafts: rows });
      if (token !== modalToken.current || selection !== selectionToken.current || !useRecoveryStore.getState().open) return;
      if (rows.length) await select(rows[0].id); else { clearDownload(); setDraft(null); setSelected(''); }
    }
  };
  const show = async () => {
    cancelInteractions();
    const token = ++modalToken.current, selection = selectionToken.current, owned = runtime.current;
    // Do not expose rows while a pending flush can insert/recenter them mid-click.
    setOpening(true);
    trigger.current?.focus();
    openedSession.current = useProjectStatus.getState().sessionId; setError(''); useRecoveryStore.setState({ open: true });
    try { await owned?.coordinator.flush(); if (runtime.current === owned) await refresh(token, selection); }
    catch (issue) { if (alive.current && runtime.current === owned && token === modalToken.current) setError(String(issue)); }
    finally { if (alive.current && runtime.current === owned && token === modalToken.current) setOpening(false); }
  };
  const restore = () => {
    if (!draft) return;
    if (openedSession.current !== useProjectStatus.getState().sessionId) { setError('Project changed while recovery was open. Reopen recovery and retry.'); return; }
    if (isProjectDirty() && !confirm('Discard unsaved changes and restore a recovery copy?')) return;
    const result = importProject(draft.text);
    if (!result.ok) { setError(result.issues.map(i => `${i.path}: ${i.message}`).join('\n')); return; }
    markProjectRecovered(); close();
  };
  const discard = async () => {
    if (!selected || mutating.current || !confirm('Discard this recovery draft?')) return;
    const token = modalToken.current, selection = selectionToken.current; mutating.current = true;
    setLoading(true); setError('');
    try { await runtime.current?.coordinator.discard(selected); await refresh(token, selection); }
    catch (issue) { if (alive.current && token === modalToken.current) setError(String(issue)); }
    finally { mutating.current = false; if (alive.current && token === modalToken.current) setLoading(false); }
  };

  return <>
    <button ref={trigger} type="button" className="top-bar-btn" aria-label="Recovery" title={storageError ? `Recovery unavailable: ${storageError}` : `Recovery: ${status}`}
      data-recovery-status={status} onClick={() => { void show(); }}><History size={16}/>{drafts.length > 0 && <span className="recovery-count">{drafts.length}</span>}</button>
    <dialog ref={dialog} className="project-dialog" aria-labelledby="recovery-title" aria-busy={opening || loading} onKeyDown={containDialogTab} onCancel={event => { event.preventDefault(); close(); }} onClose={() => { if (!dialog.current?.open) { close(); if (!document.querySelector('dialog[open]')) trigger.current?.focus(); } }}>
      <header><h2 id="recovery-title">Recovery Drafts</h2><button type="button" className="dialog-icon" aria-label="Close recovery" title="Close" onClick={close}><X size={18}/></button></header>
      <div className="dialog-body">
        {(error || storageError) && <div role="alert" className="dialog-error">{error || storageError}</div>}
        {!opening && !drafts.length && <p>No recovery drafts.</p>}
        <div className="recovery-list">{!opening && drafts.map(row => {
          const date = new Date(row.updatedAt), validDate = Number.isFinite(date.valueOf());
          return <label key={row.id} data-recovery-id={row.id}>
          <input type="radio" name="recovery-draft" checked={selected === row.id} onChange={() => { void select(row.id); }}/>
          <span><strong>{row.displayName || 'Untitled'}</strong><time dateTime={validDate ? date.toISOString() : undefined}>{validDate ? date.toLocaleString() : 'Unknown date'}</time></span>
        </label>; })}</div>
        <div className="recovery-status" role="status">{opening || loading ? 'Loading...' : selected && !draft && !error ? 'Choose a draft.' : ''}</div>
      </div>
      <footer>
        <button type="button" className="dialog-command" disabled={!draft || loading} onClick={restore}><RotateCcw size={16}/>Restore copy</button>
        <a className="dialog-icon" aria-label="Download recovery file" title="Download recovery" aria-disabled={!draft || loading}
          href={draft && !loading ? url : undefined} download={`${draft?.displayName || 'Recovered'}.slinker`}><Download size={18}/></a>
        <button type="button" className="dialog-icon danger" aria-label="Discard recovery draft" title="Discard" disabled={!selected || loading} onClick={() => { void discard(); }}><Trash2 size={18}/></button>
        <button type="button" className="dialog-command" onClick={close}>Later</button>
      </footer>
    </dialog>
  </>;
}
