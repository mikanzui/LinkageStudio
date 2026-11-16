export interface RecoveryMetadata {
  id: string;
  displayName: string;
  updatedAt: number;
  revision: number;
  formatVersion: 1;
}

export interface RecoveryDraft extends RecoveryMetadata { text: string }

export interface RecoveryStorage {
  list(limit?: number): Promise<RecoveryMetadata[]>;
  read(id: string): Promise<RecoveryDraft | null>;
  write(draft: RecoveryDraft): Promise<boolean>;
  remove(id: string): Promise<void>;
  close(): void;
}

export interface RecoverySnapshot {
  sessionId: string;
  generation: number;
  displayName: string;
  text: string;
  dirty: boolean;
}

export type RecoveryStatus = 'idle' | 'pending' | 'writing' | 'updated' | 'unavailable';
interface RecoveryHost {
  capture(): RecoverySnapshot | null;
  isCurrent(snapshot: RecoverySnapshot): boolean;
  status(status: RecoveryStatus, error?: string): void;
}

/** One in-flight write plus one replaceable snapshot; never an unbounded write queue. */
export class RecoveryCoordinator {
  private timer: ReturnType<typeof setTimeout> | undefined;
  private pending: RecoverySnapshot | undefined;
  private draining: Promise<void> | undefined;
  private revisions = new Map<string, number>();
  private disposed = false;
  private storage: RecoveryStorage;
  private host: RecoveryHost;
  private delay: number;
  private now: () => number;

  constructor(storage: RecoveryStorage, host: RecoveryHost, delay = 1000, now = Date.now) {
    this.storage = storage; this.host = host; this.delay = delay; this.now = now;
  }

  notify(): void {
    if (this.disposed) return;
    if (this.timer !== undefined) clearTimeout(this.timer);
    this.host.status('pending');
    this.timer = setTimeout(() => { void this.flush(); }, this.delay);
  }

  async flush(): Promise<void> {
    if (this.disposed) return;
    if (this.timer !== undefined) clearTimeout(this.timer);
    this.timer = undefined;
    try {
      const snapshot = this.host.capture();
      if (!snapshot) { this.notify(); return; }
      this.pending = { ...snapshot };
    } catch (error) { this.failure(error); return; }
    do {
      this.draining ??= this.drain().finally(() => { this.draining = undefined; });
      await this.draining;
    } while (this.pending && !this.disposed);
  }

  async discard(id: string): Promise<void> {
    if (this.disposed) throw new Error('Recovery controller is closed.');
    await this.draining;
    await this.storage.remove(id);
    this.revisions.delete(id);
  }

  dispose(): void {
    this.disposed = true;
    if (this.timer !== undefined) clearTimeout(this.timer);
    this.timer = undefined; this.pending = undefined;
    this.storage.close();
  }

  private failure(error: unknown): void {
    if (!this.disposed) this.host.status('unavailable', error instanceof Error ? error.message : String(error));
  }

  private async drain(): Promise<void> {
    while (this.pending && !this.disposed) {
      const snapshot = this.pending; this.pending = undefined;
      if (!this.host.isCurrent(snapshot)) continue;
      try {
        this.host.status('writing');
        if (!snapshot.dirty) {
          await this.storage.remove(snapshot.sessionId);
          if (!this.disposed && this.host.isCurrent(snapshot)) this.host.status('idle');
          continue;
        }
        let written = false;
        for (let attempt = 0; attempt < 2 && !written; attempt++) {
          let revision = this.revisions.get(snapshot.sessionId);
          if (revision === undefined || attempt > 0) revision = (await this.storage.read(snapshot.sessionId))?.revision ?? 0;
          if (this.disposed || !this.host.isCurrent(snapshot)) break;
          const next = revision + 1;
          if (!Number.isSafeInteger(next)) throw new Error('Recovery revision exceeds the supported range.');
          this.revisions.set(snapshot.sessionId, next);
          written = await this.storage.write({ id: snapshot.sessionId, displayName: snapshot.displayName.slice(0, 256) || 'Untitled',
            updatedAt: this.now(), revision: next, formatVersion: 1, text: snapshot.text });
        }
        if (this.disposed || !this.host.isCurrent(snapshot)) continue;
        if (!written) throw new Error('A newer recovery draft already exists. Current changes remain open.');
        this.host.status('updated');
      } catch (error) { if (this.host.isCurrent(snapshot)) this.failure(error); }
    }
  }
}
