import { useEffect, useRef, useState } from 'react';
import { RefreshCw, Save, X } from 'lucide-react';
import { approveRestart } from '../document/restart';
import { projectText, useProjectStatus } from '../document/project';
import { useEditorStore } from '../store/editor-store';
import { cancelInteractions, hasActiveInteractions } from '../interaction/session';
import { containDialogTab } from '../interaction/dialog-focus';
import './ProjectDialog.css';

function capture() { return { sessionId: useProjectStatus.getState().sessionId, text: projectText(), displayName: useEditorStore.getState().projectName, interacting: hasActiveInteractions() }; }
type Snapshot = ReturnType<typeof capture>;
export function UpdateControl({ checkpoint, saveLocal }: { checkpoint(): Promise<boolean>; saveLocal(): Promise<boolean> }) {
  const registration = useRef<ServiceWorkerRegistration | null>(null), requested = useRef<Snapshot | null>(null);
  const dialog = useRef<HTMLDialogElement>(null), trigger = useRef<HTMLButtonElement>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined), busyRef = useRef(false);
  const [available, setAvailable] = useState(false), [busy, setBusy] = useState(false), [issue, setIssue] = useState('');
  useEffect(() => {
    if (!import.meta.env.PROD || !('serviceWorker' in navigator) || !isSecureContext) return;
    let active = true, lastChecked = 0;
    let controller = navigator.serviceWorker.controller;
    const detach: (() => void)[] = [];
    const reload = () => {
      const approved = requested.current; requested.current = null;
      if (timer.current) clearTimeout(timer.current);
      if (!approved) return;
      const now = capture();
      if (now.sessionId !== approved.sessionId || now.text !== approved.text || now.interacting) {
        busyRef.current = false; setBusy(false); setIssue('The design changed. Retry the update.'); return;
      }
      approveRestart(approved); location.reload();
    };
    const controlled = () => {
      const next = navigator.serviceWorker.controller, replacement = !!controller && next !== controller;
      controller = next;
      if (active && (replacement || requested.current)) { setAvailable(true); reload(); }
    };
    navigator.serviceWorker.addEventListener('controllerchange', controlled);
    const refresh = () => {
      if (document.hidden || Date.now()-lastChecked < 60_000) return;
      lastChecked = Date.now(); void registration.current?.update().catch(() => {});
    };
    document.addEventListener('visibilitychange', refresh); window.addEventListener('online', refresh);
    void navigator.serviceWorker.register(`${import.meta.env.BASE_URL}sw.js`, { scope: import.meta.env.BASE_URL, updateViaCache: 'none' }).then(reg => {
      if (!active) return;
      registration.current = reg;
      const found = () => {
        const worker = reg.installing;
        if (!worker) return;
        const changed = () => { if (active && worker.state === 'installed' && reg.waiting && navigator.serviceWorker.controller) setAvailable(true); };
        worker.addEventListener('statechange', changed); detach.push(() => worker.removeEventListener('statechange', changed)); changed();
      };
      reg.addEventListener('updatefound', found); detach.push(() => reg.removeEventListener('updatefound', found)); found();
      if (reg.waiting && navigator.serviceWorker.controller) setAvailable(true);
    }).catch(() => { /* An unavailable optional offline worker cannot block the editor. */ });
    return () => {
      active = false; registration.current = null; requested.current = null; detach.forEach(stop => stop());
      if (timer.current) clearTimeout(timer.current);
      navigator.serviceWorker.removeEventListener('controllerchange', controlled);
      document.removeEventListener('visibilitychange', refresh); window.removeEventListener('online', refresh);
    };
  }, []);
  const restart = async () => {
    if (busyRef.current) return;
    cancelInteractions(); const snapshot = capture(); busyRef.current = true; setBusy(true); setIssue('');
    try {
      if (!await checkpoint()) { setIssue('Recovery could not be confirmed. Current design remains open.'); return; }
      const now = capture();
      if (snapshot.sessionId !== now.sessionId || snapshot.text !== now.text || now.interacting) { setIssue('The design changed. Retry the update.'); return; }
      const waiting = registration.current?.waiting;
      if (!waiting) { approveRestart(snapshot); location.reload(); return; }
      requested.current = snapshot;
      timer.current = setTimeout(() => { requested.current = null; busyRef.current = false; setBusy(false); setIssue('Update activation was not confirmed. Retry when online.'); }, 15_000);
      waiting.postMessage({ type: 'SKIP_WAITING' });
    } catch { requested.current = null; if (timer.current) clearTimeout(timer.current); setIssue('Update did not complete. Current design remains open.'); }
    finally { if (!requested.current) { busyRef.current = false; setBusy(false); } }
  };
  if (!available) return null;
  return <>
    <button ref={trigger} type="button" className="top-bar-btn" aria-label="Update available" title="Update available" onClick={() => { cancelInteractions(); trigger.current?.focus(); setIssue(''); dialog.current?.showModal(); }}><RefreshCw size={16}/></button>
    <dialog ref={dialog} className="project-dialog" aria-labelledby="update-title" onKeyDown={containDialogTab} onCancel={e => { if (busy) e.preventDefault(); }} onClose={() => trigger.current?.focus()}>
      <header><h2 id="update-title">Update Available</h2><button type="button" className="dialog-icon" title="Close" aria-label="Close update" disabled={busy} onClick={() => dialog.current?.close()}><X size={18}/></button></header>
      <div className="dialog-body"><div className="dialog-error" role="status">{issue || 'Current design will be retained in Recovery.'}</div></div>
      <footer>
        <button type="button" className="dialog-command" disabled={busy} onClick={() => void restart()}><RefreshCw size={16}/>Restart with recovery</button>
        <button type="button" className="dialog-command" disabled={busy} onClick={() => { busyRef.current=true; setBusy(true); void saveLocal().finally(() => { busyRef.current=false; setBusy(false); }); }}><Save size={16}/>Save local file</button>
        <button type="button" className="dialog-command" disabled={busy} onClick={() => dialog.current?.close()}>Later</button>
      </footer>
    </dialog>
  </>;
}
