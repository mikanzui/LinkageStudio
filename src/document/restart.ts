import type { RecoveryStorage } from './recovery';

export interface RestartSnapshot { sessionId: string; text: string; displayName: string; interacting: boolean }
const same = (a: RestartSnapshot, b: RestartSnapshot) => !a.interacting && !b.interacting && a.sessionId === b.sessionId && a.text === b.text;

/** Persist even a clean active design: a worker restart must not silently open an empty editor. */
export async function writeRestartCheckpoint(storage: RecoveryStorage, capture: () => RestartSnapshot, flush: () => Promise<void>): Promise<'ready' | 'changed' | 'unavailable'> {
  const snapshot = capture();
  if (snapshot.interacting) return 'changed';
  try {
    await flush();
    if (!same(snapshot, capture())) return 'changed';
    const old = await storage.read(snapshot.sessionId);
    const revision = (old?.revision ?? 0) + 1;
    if (!Number.isSafeInteger(revision)) return 'unavailable';
    if (!same(snapshot, capture())) return 'changed';
    const committed = await storage.write({ id: snapshot.sessionId, text: snapshot.text, displayName: snapshot.displayName.slice(0,256) || 'Untitled', updatedAt: Date.now(), revision, formatVersion: 1 });
    if (!committed) return 'unavailable';
    const readback = await storage.read(snapshot.sessionId);
    if (readback?.text !== snapshot.text) return 'unavailable';
    return same(snapshot,capture()) ? 'ready' : 'changed';
  } catch { return 'unavailable'; }
}

let approval: { snapshot: RestartSnapshot; expires: number } | null = null;
export function approveRestart(snapshot: RestartSnapshot): void { approval = { snapshot: { ...snapshot }, expires: Date.now()+10_000 }; }
export function consumeRestartApproval(snapshot: RestartSnapshot): boolean {
  const previous=approval; approval=null;
  return !!previous && previous.expires >= Date.now() && same(previous.snapshot,snapshot);
}
