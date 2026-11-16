import { saveLocalFile } from '../utils/file-adapter';
import type { LocalSaveOutcome } from '../utils/file-adapter';
import { useEditorStore } from '../store/editor-store';
import { markProjectSaved, projectDesignSignature, projectText, useProjectStatus } from './project';

export interface LocalProjectSaveResult {
  outcome: LocalSaveOutcome;
  obsolete: boolean;
  savedCurrent: boolean;
}
const pendingSessions = new Set<string>();

/** File completion belongs to its captured document, never a subsequently loaded one. */
export async function saveProjectLocally(name: string, write = saveLocalFile): Promise<LocalProjectSaveResult> {
  const { sessionId } = useProjectStatus.getState(), beforeName = useEditorStore.getState().projectName;
  if (pendingSessions.has(sessionId)) return { outcome: { status: 'failed', error: new Error('A local save is already in progress.') }, obsolete: false, savedCurrent: false };
  const text = projectText(name);
  pendingSessions.add(sessionId);
  try {
    let outcome: LocalSaveOutcome;
    try { outcome = await write(text, `${name}.slinker`); }
    catch (error) { outcome = { status: 'failed', error: error instanceof Error ? error : new Error(String(error)) }; }
    const obsolete = useProjectStatus.getState().sessionId !== sessionId;
    let savedCurrent = false;
    if (!obsolete && outcome.status === 'saved' && outcome.confirmation === 'confirmed-write') {
      savedCurrent = useEditorStore.getState().projectName === beforeName
        && projectDesignSignature(projectText(name)) === projectDesignSignature(text);
      if (savedCurrent) useEditorStore.getState().setProjectName(name);
      // This becomes the confirmed baseline even if newer edits must remain dirty.
      markProjectSaved(text);
    }
    return { outcome, obsolete, savedCurrent };
  } finally { pendingSessions.delete(sessionId); }
}
