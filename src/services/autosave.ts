import type { IPublicClientApplication, AccountInfo } from '@azure/msal-browser';
import { saveProject } from './onedrive';
import { useEditorStore } from '../store/editor-store';
import { useMechanismStore } from '../store/mechanism-store';
import { useSimulationStore } from '../store/simulation-store';
import { serializeMechanism } from '../utils/file-io';

const DEBOUNCE_MS = 2000;
const RETRY_DELAYS = [1000, 2000, 4000];
const LOCAL_KEY_PREFIX = 'slinker-autosave-';

let debounceTimer: ReturnType<typeof setTimeout> | null = null;
let lastSavedHash: string | null = null;
let unsubMech: (() => void) | null = null;
let unsubEditor: (() => void) | null = null;

function simpleHash(str: string): string {
  let h = 0;
  for (let i = 0; i < str.length; i++) {
    h = ((h << 5) - h + str.charCodeAt(i)) | 0;
  }
  return h.toString(36);
}

function serializeCurrent(): string {
  const mech = useMechanismStore.getState();
  const editor = useEditorStore.getState();
  const sim = useSimulationStore.getState();
  return serializeMechanism(
    mech.joints, mech.links, mech.bodies, mech.baseBodyId,
    mech.outlines, mech.images, mech.sliders, mech.colliders, mech.tracers, mech.springs,
    editor.projectName,
    {
      showLinks: editor.showLinks,
      showVectors: editor.showVectors,
      showRulers: editor.showRulers,
      showForceUnits: editor.showForceUnits,
      outlineSimGrabInteriorWithJoints: editor.outlineSimGrabInteriorWithJoints,
      gridLevel: editor.gridLevel,
      camera: { pan: { ...editor.camera.pan }, zoom: editor.camera.zoom },
    },
    {
      gravityEnabled: sim.gravityEnabled,
      gravityStrength: sim.gravityStrength,
      damping: sim.damping,
      dragMultiplier: sim.dragMultiplier,
      dragDamping: sim.dragDamping,
    },
  );
}

async function saveWithRetry(
  instance: IPublicClientApplication,
  account: AccountInfo,
  fileName: string,
  content: string,
): Promise<string> {
  for (let attempt = 0; attempt <= RETRY_DELAYS.length; attempt++) {
    try {
      return await saveProject(instance, account, fileName, content);
    } catch (err) {
      if (attempt >= RETRY_DELAYS.length) throw err;
      await new Promise((r) => setTimeout(r, RETRY_DELAYS[attempt]));
    }
  }
  throw new Error('Unreachable');
}

function scheduleAutosave(
  instance: IPublicClientApplication,
  account: AccountInfo,
) {
  if (debounceTimer) clearTimeout(debounceTimer);

  debounceTimer = setTimeout(async () => {
    const editor = useEditorStore.getState();
    if (!editor.autoSaveEnabled || !editor.oneDriveFileId) return;

    const content = serializeCurrent();
    const hash = simpleHash(content);
    if (hash === lastSavedHash) return; // No changes

    useEditorStore.getState().setCloudSyncStatus('saving');
    const fileName = editor.oneDriveFileName || `${editor.projectName}.slinker`;

    try {
      const itemId = await saveWithRetry(instance, account, fileName, content);
      lastSavedHash = hash;
      useEditorStore.getState().setCloudSyncStatus('saved');
      useEditorStore.getState().setOneDriveFileId(itemId);

      // Clear any offline backup
      const key = LOCAL_KEY_PREFIX + (editor.oneDriveFileId || 'pending');
      localStorage.removeItem(key);
    } catch {
      // Save to localStorage as offline backup
      const key = LOCAL_KEY_PREFIX + (editor.oneDriveFileId || 'pending');
      localStorage.setItem(key, content);
      useEditorStore.getState().setCloudSyncStatus(
        navigator.onLine ? 'error' : 'offline',
      );
    }
  }, DEBOUNCE_MS);
}

/** Start listening to store changes and auto-saving to OneDrive. */
export function startAutosave(
  instance: IPublicClientApplication,
  account: AccountInfo,
): void {
  stopAutosave();

  // Initialize hash from current state
  lastSavedHash = simpleHash(serializeCurrent());

  const trigger = () => scheduleAutosave(instance, account);

  unsubMech = useMechanismStore.subscribe(trigger);
  unsubEditor = useEditorStore.subscribe((state, prevState) => {
    // Only trigger on content-changing fields, not UI-only changes
    if (
      state.projectName !== prevState.projectName ||
      state.showLinks !== prevState.showLinks ||
      state.showVectors !== prevState.showVectors ||
      state.gridLevel !== prevState.gridLevel
    ) {
      trigger();
    }
  });

  // Online recovery
  window.addEventListener('online', trigger);

  // beforeunload backup
  window.addEventListener('beforeunload', () => {
    const editor = useEditorStore.getState();
    if (editor.autoSaveEnabled && editor.oneDriveFileId) {
      const content = serializeCurrent();
      const hash = simpleHash(content);
      if (hash !== lastSavedHash) {
        const key = LOCAL_KEY_PREFIX + editor.oneDriveFileId;
        localStorage.setItem(key, content);
      }
    }
  });
}

/** Stop auto-save subscriptions. */
export function stopAutosave(): void {
  if (debounceTimer) clearTimeout(debounceTimer);
  debounceTimer = null;
  unsubMech?.();
  unsubEditor?.();
  unsubMech = null;
  unsubEditor = null;
}

/** Check for pending offline backups and sync them. Returns true if a backup was found. */
export async function syncPendingBackup(
  instance: IPublicClientApplication,
  account: AccountInfo,
  fileId: string,
  fileName: string,
): Promise<boolean> {
  const key = LOCAL_KEY_PREFIX + fileId;
  const backup = localStorage.getItem(key);
  if (!backup) return false;

  try {
    await saveProject(instance, account, fileName, backup);
    localStorage.removeItem(key);
    return true;
  } catch {
    return false;
  }
}

/** Reset the saved hash (call after manual save or load). */
export function resetAutosaveHash(): void {
  lastSavedHash = simpleHash(serializeCurrent());
}
