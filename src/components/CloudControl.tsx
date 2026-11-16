import { useEffect, useRef, useState } from 'react';
import { Cloud, CloudUpload, LogIn, LogOut, Pencil, RefreshCw, Save, Trash2, X } from 'lucide-react';
import { cloudAuth } from '../cloud/auth';
import { createCloudCache } from '../cloud/cloud-cache';
import { createOneDriveClient } from '../cloud/onedrive';
import { createCloudProjects } from '../cloud/projects';
import type { CloudState } from '../cloud/projects';
import type { CloudAccount, CloudItem } from '../cloud/types';
import { CloudError } from '../cloud/types';
import { decodeDocument } from '../document/codec';
import { importProject, isProjectDirty, markProjectRecovered, markProjectSaved, projectDesignSignature, projectText, setProjectMessage, useProjectStatus } from '../document/project';
import { useEditorStore } from '../store/editor-store';
import { cancelInteractions, hasActiveInteractions } from '../interaction/session';
import { containDialogTab } from '../interaction/dialog-focus';
import './ProjectDialog.css';
import './CloudControl.css';

type Runtime = ReturnType<typeof createCloudProjects>;
type Selection = { item: CloudItem; cached: boolean };
export function CloudControl({ flush, saveLocal }: { flush(): Promise<void>; saveLocal(): Promise<boolean> }) {
  const runtime = useRef<Runtime | null>(null), dialog = useRef<HTMLDialogElement>(null), trigger = useRef<HTMLButtonElement>(null);
  const alive = useRef(false), authEpoch = useRef(0);
  const actionLock = useRef(false);
  const [state, setState] = useState<CloudState | null>(null), [accounts, setAccounts] = useState<CloudAccount[]>([]);
  const [ready, setReady] = useState(false), [authBusy, setAuthBusy] = useState(false), [issue, setIssue] = useState('');
  const [actionBusy, setActionBusy] = useState(false);
  const [selection, setSelection] = useState<Selection | null>(null), [pendingOpen, setPendingOpen] = useState<(Selection & { session: string }) | null>(null);
  const [filename, setFilename] = useState(''), [rename, setRename] = useState(false), [deleting, setDeleting] = useState(false);
  const mode = useEditorStore(s => s.mode);
  useEffect(() => {
    alive.current = true;
    let previousStatus = '';
    const owned = createCloudProjects(createCloudCache(), {
      capture() { const text = projectText(); return { session: useProjectStatus.getState().sessionId, text, name: useEditorStore.getState().projectName, signature: projectDesignSignature(text), interacting: hasActiveInteractions() }; },
      validate(text) { if (!decodeDocument(text).ok) throw new CloudError('invalid', 'Cloud project is invalid. Current local design and cached copies are unchanged.'); },
      open(text, pending) { const result = importProject(text); if (!result.ok) throw new Error('Invalid cloud project'); if (pending) markProjectRecovered(); },
      saved: markProjectSaved, detached: markProjectRecovered,
    }, next => { if (runtime.current === owned) { setState(next); if (next.status && next.status !== previousStatus) setProjectMessage(next.status, next.error ? 'alert' : 'status'); previousStatus = next.status; } });
    runtime.current = owned; setState(owned.state());
    const timer = setInterval(() => { void owned.tick().catch(() => {}); }, 1500);
    return () => { alive.current = false; clearInterval(timer); owned.dispose(); if (runtime.current === owned) runtime.current = null; };
  }, []);
  const busy = !!state?.busy || authBusy || actionBusy;
  const run = async (work: () => Promise<unknown>) => {
    if (actionLock.current) return;
    actionLock.current = true; setActionBusy(true);
    setIssue('');
    try { await work(); } catch { if (alive.current) setIssue('Operation did not complete. Current local design is unchanged.'); }
    finally { actionLock.current = false; if (alive.current) setActionBusy(false); }
  };
  const chooseAccount = (id: string) => {
    authEpoch.current++; setSelection(null); setPendingOpen(null); setRename(false); setDeleting(false);
    runtime.current?.select(id ? createOneDriveClient({ accountId: id, token: () => cloudAuth.token(id) }) : null);
    if (id) void runtime.current!.refresh().catch(() => { if (alive.current) setIssue('Cloud refresh did not complete.'); });
  };
  const show = () => {
    cancelInteractions(); trigger.current?.focus(); setFilename(useEditorStore.getState().projectName); setSelection(null); setPendingOpen(null); setRename(false); setDeleting(false);
    dialog.current?.showModal();
    if (ready) { if (state?.accountId) void run(() => runtime.current!.refresh()); return; }
    setAuthBusy(true); const version = ++authEpoch.current;
    void cloudAuth.initialize().then(() => {
      if (!alive.current || version !== authEpoch.current) return;
      setReady(true); const list = cloudAuth.accounts(); setAccounts(list);
      if (list.length === 1) chooseAccount(list[0].id);
    }).catch(() => { if (alive.current && version === authEpoch.current) setIssue('Cloud sign-in is unavailable. Local editing and files remain available.'); })
      .finally(() => { if (alive.current) setAuthBusy(false); });
  };
  const signIn = () => {
    if (busy) return;
    setAuthBusy(true); const version = ++authEpoch.current;
    void run(async () => {
      const account = await cloudAuth.signIn();
      if (!alive.current || version !== authEpoch.current) return;
      setAccounts(cloudAuth.accounts()); chooseAccount(account.id);
    }).finally(() => { if (alive.current) setAuthBusy(false); });
  };
  const requestOpen = () => {
    if (!selection || mode !== 'create') return;
    cancelInteractions(); setRename(false); setDeleting(false);
    if (isProjectDirty()) setPendingOpen({ ...selection, session: useProjectStatus.getState().sessionId });
    else void run(() => runtime.current!.open(selection.item, selection.cached));
  };
  const performOpen = () => {
    if (!pendingOpen) return;
    const target = pendingOpen; setPendingOpen(null);
    if (target.session !== useProjectStatus.getState().sessionId || useEditorStore.getState().mode !== 'create') { setIssue('Current project changed. Select the project again.'); return; }
    void run(() => runtime.current!.open(target.item, target.cached));
  };
  const saveCloud = (copy = false) => {
    cancelInteractions();
    void run(async () => { await flush(); await runtime.current?.save(copy, filename.trim() || undefined); });
  };
  const selectedKey = selection ? `${selection.cached ? 'cache' : 'remote'}:${selection.item.driveId}:${selection.item.id}` : '';
  const rows = [ ...(state?.items ?? []).map(item => ({ item, cached: false, detail: 'OneDrive' })),
    ...(state?.cached ?? []).map(row => ({ item: row.item, cached: true, detail: row.hasPending ? 'Offline draft' : row.remoteDeleted ? 'Deleted remotely; cached copy' : 'Cached copy' })) ];
  return <>
    <button ref={trigger} type="button" className="top-bar-btn" title="Projects" aria-label="Projects" onClick={show}><Cloud size={16}/><span className="top-bar-label">Projects</span></button>
    <dialog ref={dialog} className="project-dialog cloud-dialog" aria-labelledby="cloud-title" onKeyDown={containDialogTab} onCancel={e => { if (busy) e.preventDefault(); }} onClose={() => trigger.current?.focus()}>
      <header><h2 id="cloud-title">Projects</h2><button type="button" className="dialog-icon" aria-label="Close projects" title="Close" disabled={busy} onClick={() => dialog.current?.close()}><X size={18}/></button></header>
      <div className="dialog-body">
        <div className="cloud-account-row"><label className="dialog-field">Account<select aria-label="Cloud account" value={state?.accountId ?? ''} disabled={busy} onChange={e => chooseAccount(e.target.value)}><option value="">Guest</option>{accounts.map(a => <option key={a.id} value={a.id}>{a.label}</option>)}</select></label>
          <button type="button" className="dialog-icon" aria-label="Connect Microsoft account" title="Connect Microsoft account" disabled={!ready || busy} onClick={signIn}><LogIn size={18}/></button>
          <button type="button" className="dialog-icon" aria-label="Disconnect account" title="Disconnect account locally" disabled={!state?.accountId || busy} onClick={() => { const id = state!.accountId!; chooseAccount(''); void run(async () => { await cloudAuth.signOut(id); setAccounts(cloudAuth.accounts()); }); }}><LogOut size={18}/></button>
          <button type="button" className="dialog-icon" aria-label="Refresh projects" title="Refresh projects" disabled={!state?.accountId || busy} onClick={() => { setSelection(null); void run(() => runtime.current!.refresh()); }}><RefreshCw size={18}/></button>
        </div>
        <div className="cloud-status" role={issue || state?.error ? 'alert' : 'status'}>{issue || state?.status || (authBusy ? 'Connecting...' : state?.accountId ? '' : 'Guest')}</div>
        {pendingOpen ? <section aria-label="Unsaved cloud navigation"><h3>Unsaved Changes</h3><div className="cloud-actions">
          <button type="button" className="dialog-command" disabled={busy} onClick={() => void run(async () => { if (await saveLocal()) setIssue('Local save confirmed. Choose Discard and open to continue.'); })}><Save size={16}/>Save local first</button>
          <button type="button" className="dialog-command" disabled={busy} onClick={performOpen}>Discard and open</button>
          <button type="button" className="dialog-command" disabled={busy} onClick={() => setPendingOpen(null)}>Cancel</button>
        </div></section> : <>
          <div className="recovery-list cloud-list" role="radiogroup" aria-label="Cloud projects">{rows.map(row => {
            const key = `${row.cached ? 'cache' : 'remote'}:${row.item.driveId}:${row.item.id}`;
            return <label key={key}><input type="radio" name="cloud-project" value={key} checked={selectedKey === key} disabled={busy} onChange={() => { setSelection(row); setFilename(row.item.name.replace(/\.slinker$/i, '')); setRename(false); setDeleting(false); }}/><span><strong>{row.item.name}</strong><small>{row.detail}</small></span></label>;
          })}</div>
          <label className="dialog-field">File name<input aria-label="Cloud file name" value={filename} maxLength={200} disabled={busy} onChange={e => setFilename(e.target.value)}/></label>
          <div className="cloud-actions">
            <button type="button" className="dialog-command" disabled={!selection || busy || mode !== 'create'} onClick={requestOpen}>Open</button>
            <button type="button" className="dialog-icon" title="Rename cloud file" aria-label="Rename cloud file" disabled={!selection || selection.cached || busy} onClick={() => { setRename(true); setDeleting(false); }}><Pencil size={17}/></button>
            <button type="button" className="dialog-icon danger" title={selection?.cached ? 'Discard offline draft' : 'Delete cloud file'} aria-label={selection?.cached ? 'Discard offline draft' : 'Delete cloud file'} disabled={!selection || busy} onClick={() => { setDeleting(true); setRename(false); }}><Trash2 size={17}/></button>
            {rename && <button type="button" className="dialog-command" disabled={busy || !filename.trim()} onClick={() => { const target=selection!; setRename(false); setSelection(null); void run(() => runtime.current!.rename(target.item, filename.trim())); }}>Confirm rename</button>}
            {deleting && <button type="button" className="dialog-command" disabled={busy} onClick={() => { const target=selection!; setDeleting(false); setSelection(null); void run(() => target.cached ? runtime.current!.discardPending(target.item) : runtime.current!.remove(target.item)); }}>{selection?.cached ? 'Confirm discard offline draft' : 'Delete from OneDrive'}</button>}
          </div>
          <label className="cloud-autosave"><input type="checkbox" aria-label="Cloud autosave" checked={state?.autosave ?? false} disabled={!state?.binding || busy} onChange={e => runtime.current?.autosave(e.target.checked)}/>Autosave</label>
        </>}
      </div>
      <footer><button type="button" className="dialog-command" disabled={!state?.accountId || busy || mode !== 'create' || !!pendingOpen} onClick={() => saveCloud()}><CloudUpload size={17}/>Save to OneDrive</button>
        <button type="button" className="dialog-command" disabled={!state?.accountId || !filename.trim() || busy || mode !== 'create' || !!pendingOpen} onClick={() => saveCloud(true)}>Save new copy</button>
      </footer>
    </dialog>
  </>;
}
