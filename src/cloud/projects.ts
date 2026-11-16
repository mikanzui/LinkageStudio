import { CloudError } from './types';
import type { CloudCache, CloudCacheMetadata, CloudCacheRow, CloudItem, CloudPort } from './types';

export interface CloudDocument {
  capture(): { session: string; text: string; name: string; signature: string; interacting: boolean };
  validate(text: string): void;
  open(text: string, pending: boolean): void;
  saved(text: string): void;
  detached(): void;
}
export interface CloudBinding { accountId: string; session: string; item: CloudItem; text: string; revision: number; remoteDeleted: boolean }
export interface CloudState {
  accountId: string | null; items: CloudItem[]; cached: CloudCacheMetadata[];
  binding: CloudBinding | null; autosave: boolean; busy: boolean;
  status: string; error: CloudError['code'] | null;
}
const describe = (error: unknown) => error instanceof CloudError ? error : error instanceof Error && error.name === 'QuotaExceededError'
  ? new CloudError('quota', 'Offline storage is full. Local changes are retained; save a local file.')
  : new CloudError('unknown', 'Cloud operation failed. Local changes are retained.');
export function createCloudProjects(cache: CloudCache, doc: CloudDocument, changed: (s: CloudState) => void) {
  let state: CloudState = { accountId: null, items: [], cached: [], binding: null, autosave: false, busy: false, status: '', error: null };
  let port: CloudPort | null = null, epoch = 0, disposed = false;
  let operation: AbortController | null = null;
  const update = (patch: Partial<CloudState>) => { if (!disposed) { state = { ...state, ...patch }; changed(state); } };
  const current = (version: number) => !disposed && version === epoch;
  const owns = (version: number, session: string) => current(version) && doc.capture().session === session;
  const binding = () => state.binding && state.binding.session === doc.capture().session ? state.binding : null;
  const begin = () => {
    if (!port || state.busy || disposed) throw new CloudError('auth', 'Choose a connected account first.');
    const captured = { port, epoch, doc: doc.capture(), controller: new AbortController() };
    operation = captured.controller;
    update({ busy: true, error: null });
    return captured;
  };
  const finish = (version: number) => { if (current(version)) { operation = null; update({ busy: false }); } };
  const fail = (version: number, error: unknown) => { if (current(version)) { const e = describe(error); update({ status: e.message, error: e.code }); } };
  const rowFor = (b: CloudBinding): CloudCacheRow => ({ accountId: b.accountId, item: b.item, text: b.text, revision: b.revision, updatedAt: Date.now(), remoteDeleted: b.remoteDeleted });
  const cachedRows = (row: CloudCacheRow): CloudCacheMetadata[] => [
    { accountId: row.accountId, item: row.item, revision: row.revision, updatedAt: row.updatedAt, hasPending: !!row.pending, remoteDeleted: !!row.remoteDeleted },
    ...state.cached.filter(r => r.item.id !== row.item.id || r.item.driveId !== row.item.driveId),
  ].slice(0, 100);
  async function refresh() {
    const c = begin();
    try {
      try {
        const cached = await cache.list(c.port.accountId);
        if (current(c.epoch)) update({ cached });
      } catch { if (current(c.epoch)) update({ cached: [], status: 'Offline cache is unavailable.' }); }
      const items = await c.port.list(c.controller.signal);
      if (current(c.epoch)) update({ items, status: 'OneDrive projects refreshed.' });
    } catch (e) { fail(c.epoch, e); }
    finally { finish(c.epoch); }
  }
  async function open(item: CloudItem, fromCache = false) {
    const c = begin();
    try {
      let row: CloudCacheRow;
      if (fromCache) {
        const found = await cache.read(c.port.accountId, item.driveId, item.id);
        if (!found) throw new CloudError('missing', 'This cached copy is unavailable.');
        row = found;
      } else {
        const loaded = await c.port.load(item, c.controller.signal);
        doc.validate(loaded.text);
        const previous = await cache.read(c.port.accountId, item.driveId, item.id);
        // A remote read must never erase an offline draft, even in another tab.
        row = { accountId: c.port.accountId, ...loaded, updatedAt: Date.now(), revision: (previous?.revision ?? 0) + 1 };
        if (!previous?.pending && !await cache.write(row)) throw new CloudError('conflict', 'The cached copy changed in another tab. Refresh before opening.');
        if (previous?.pending) throw new CloudError('conflict', 'An offline draft exists. Open the cached draft before loading the remote copy.');
      }
      if (!owns(c.epoch, c.doc.session) || doc.capture().signature !== c.doc.signature) return;
      const openedText = fromCache && row.pending ? row.pending.text : row.text;
      doc.validate(openedText);
      doc.open(openedText, fromCache && !!row.pending);
      update({ cached: cachedRows(row), binding: { accountId: c.port.accountId, session: doc.capture().session, item: row.item, text: row.text, revision: row.revision, remoteDeleted: !!row.remoteDeleted }, autosave: false,
        status: fromCache ? row.pending ? 'Opened offline draft. Changes are not uploaded.' : 'Opened cached copy. Remote revision is unverified.' : 'Opened from OneDrive.' });
    } catch (e) { fail(c.epoch, e); }
    finally { finish(c.epoch); }
  }
  async function save(asCopy = false, copyName?: string) {
    const c = begin(), bound = asCopy ? null : binding();
    try {
      if (c.doc.interacting) throw new CloudError('cancelled', 'Finish the active gesture before saving to OneDrive.');
      let pending: CloudCacheRow | null = null;
      if (bound) {
        if (bound.remoteDeleted) throw new CloudError('missing', 'Cloud file was deleted. Save a new copy.');
        const existing = await cache.read(bound.accountId, bound.item.driveId, bound.item.id);
        if (existing && existing.revision !== bound.revision) throw new CloudError('conflict', 'This cached project changed in another tab. Open its draft or save a new copy.');
        pending = { ...rowFor(bound), revision: bound.revision + 1, pending: { text: c.doc.text, projectName: c.doc.name } };
        if (!await cache.write(pending)) throw new CloudError('conflict', 'A newer offline draft exists. Save a new copy.');
        if (owns(c.epoch, c.doc.session)) update({ cached: cachedRows(pending), binding: { ...bound, revision: pending.revision } });
      }
      if (!owns(c.epoch, c.doc.session)) return;
      const item = bound ? await c.port.save(bound.item, c.doc.text, c.controller.signal) : await c.port.create(copyName ?? c.doc.name, c.doc.text, c.controller.signal);
      const next: CloudBinding = { accountId: c.port.accountId, session: c.doc.session, item, text: c.doc.text, revision: (pending?.revision ?? 0) + 1, remoteDeleted: false };
      let cacheOK = false;
      try { cacheOK = await cache.write(rowFor(next)); } catch { /* Remote acknowledgement is still real if the cache fails. */ }
      if (!owns(c.epoch, c.doc.session)) return;
      doc.saved(c.doc.text);
      update({ ...(cacheOK ? { cached: cachedRows(rowFor(next)) } : {}), binding: next, autosave: bound ? state.autosave : false, items: [item, ...state.items.filter(i => i.id !== item.id || i.driveId !== item.driveId)],
        status: cacheOK ? 'Saved to OneDrive.' : 'Saved to OneDrive; offline cache was not updated.', error: cacheOK ? null : 'quota' });
    } catch (e) { fail(c.epoch, e); }
    finally { finish(c.epoch); }
  }
  async function rename(item: CloudItem, name: string) {
    const c = begin();
    try {
      const next = await c.port.rename(item, name, c.controller.signal);
      let revision = binding()?.revision ?? 0, cached = false;
      let updatedCache: CloudCacheRow | undefined;
      try {
        const old = await cache.read(c.port.accountId, item.driveId, item.id);
        if (old) { const proposed = { ...old, item: next, revision: old.revision + 1, updatedAt: Date.now() }; cached = await cache.write(proposed); if (cached) { revision = proposed.revision; updatedCache = proposed; } }
        else cached = true;
      } catch { /* Rename acknowledgement must not be hidden by a cache failure. */ }
      if (!current(c.epoch)) return;
      const b = binding();
      update({ ...(updatedCache ? { cached: cachedRows(updatedCache) } : {}), items: state.items.map(i => i.id === item.id && i.driveId === item.driveId ? next : i),
        ...(b?.item.id === item.id && b.item.driveId === item.driveId ? { binding: { ...b, item: next, revision } } : {}),
        status: cached ? 'Cloud file renamed.' : 'Cloud file renamed; offline cache was not updated.' });
    } catch (e) { fail(c.epoch, e); }
    finally { finish(c.epoch); }
  }
  async function remove(item: CloudItem) {
    const c = begin();
    try {
      await c.port.remove(item, c.controller.signal);
      let cached = true;
      let updatedCache: CloudCacheRow | undefined;
      try {
        const old = await cache.read(c.port.accountId, item.driveId, item.id);
        if (old) { const proposed = { ...old, revision: old.revision + 1, remoteDeleted: true, updatedAt: Date.now() }; cached = await cache.write(proposed); if (cached) updatedCache = proposed; }
      } catch { cached = false; }
      if (!current(c.epoch)) return;
      const b = binding(), detached = b?.item.id === item.id && b.item.driveId === item.driveId;
      if (detached) doc.detached();
      update({ ...(updatedCache ? { cached: cachedRows(updatedCache) } : {}), items: state.items.filter(i => i.id !== item.id || i.driveId !== item.driveId), ...(detached ? { binding: null, autosave: false } : {}), status: cached ? 'Deleted from OneDrive. Local copies retained.' : 'Deleted from OneDrive. Offline metadata was not updated; local copies retained.' });
    } catch (e) { fail(c.epoch, e); }
    finally { finish(c.epoch); }
  }
  async function discardPending(item: CloudItem) {
    const c = begin();
    try {
      const old = await cache.read(c.port.accountId, item.driveId, item.id);
      if (old?.pending) {
        const next = { ...old, revision: old.revision + 1, updatedAt: Date.now() };
        delete next.pending;
        if (!await cache.write(next)) throw new CloudError('conflict', 'The offline draft changed. Refresh before discarding.');
        if (current(c.epoch)) {
          const b = binding();
          if (b?.item.id === item.id && b.item.driveId === item.driveId) update({ binding: { ...b, revision: next.revision } });
        }
      }
      const cached = await cache.list(c.port.accountId);
      if (current(c.epoch)) update({ cached, status: 'Offline draft discarded. Current local design unchanged.' });
    } catch (e) { fail(c.epoch, e); }
    finally { finish(c.epoch); }
  }
  return {
    state: () => state,
    cancel() {
      const wasBusy=state.busy;
      epoch++; operation?.abort(); operation=null;
      update({ busy:false, ...(wasBusy ? { autosave:false, error:'cancelled' as const, status:'Cloud operation cancelled. A sent write may still complete; local changes are retained.' } : {}) });
    },
    select(next: CloudPort | null) {
      epoch++; operation?.abort(); operation = null; port = next;
      update({ accountId: next?.accountId ?? null, items: [], cached: [], binding: null, autosave: false, busy: false, status: '', error: null });
    },
    refresh, open, save, rename, remove, discardPending,
    autosave(enabled: boolean) { update({ autosave: enabled && !!binding() }); },
    async tick() {
      const b = binding();
      if (state.binding && !b) update({ binding: null, autosave: false });
      if (!state.autosave || !b || state.busy || state.error || doc.capture().interacting || doc.capture().text === b.text) return;
      await save();
    },
    dispose() { disposed = true; epoch++; operation?.abort(); cache.close(); },
  };
}
