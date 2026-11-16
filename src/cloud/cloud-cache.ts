import type { CloudCache, CloudCacheMetadata, CloudCacheRow, CloudItem } from './types';
import { MAX_DOCUMENT_CHARACTERS } from '../document/limits';

const NAME = 'linkage-studio-cloud-cache';
const META = 'cloud-meta';
const TEXT = 'cloud-text';
const STORES = [META, TEXT];
const ACCOUNT = 'accountId';
const UPDATED = 'account-updatedAt';
const MAX_DATE = 8_640_000_000_000_000;

function error(name: string, message: string): Error {
  return Object.assign(new Error(message), { name });
}
const corrupt = () => error('CloudCacheCorruptionError', 'Cloud cache records or schema are invalid.');
const closedError = () => error('CloudCacheClosedError', 'Cloud cache is closed.');

function object(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new TypeError('Expected a cloud cache object.');
  return value as Record<string, unknown>;
}
function string(value: unknown, max: number): string {
  // eslint-disable-next-line no-control-regex -- Persisted metadata must not contain ASCII controls.
  if (typeof value !== 'string' || !value.trim() || value.length > max || /[\u0000-\u001f\u007f]/.test(value)) {
    throw new TypeError('Invalid cloud cache string.');
  }
  return value;
}
function revision(value: unknown): number {
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < 1) throw new TypeError('Invalid cloud cache revision.');
  return value;
}
function timestamp(value: unknown): number {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0 || value > MAX_DATE) throw new TypeError('Invalid cloud cache timestamp.');
  return value;
}
function text(value: unknown): string {
  if (typeof value !== 'string' || value.length > MAX_DOCUMENT_CHARACTERS) throw new TypeError('Invalid cloud cache text.');
  return value;
}
function flag(value: unknown): boolean {
  if (typeof value !== 'boolean') throw new TypeError('Invalid cloud cache flag.');
  return value;
}
function item(value: unknown): CloudItem {
  const source = object(value);
  const date = string(source.lastModifiedDateTime, 64);
  if (!Number.isFinite(Date.parse(date))) throw new TypeError('Invalid cloud item date.');
  if (typeof source.size !== 'number' || !Number.isSafeInteger(source.size) || source.size < 0) throw new TypeError('Invalid cloud item size.');
  return {
    driveId: string(source.driveId, 1024), id: string(source.id, 1024), name: string(source.name, 256),
    eTag: string(source.eTag, 2048), lastModifiedDateTime: date, size: source.size,
  };
}
function row(value: unknown): CloudCacheRow {
  const source = object(value);
  const result: CloudCacheRow = {
    accountId: string(source.accountId, 1024), item: item(source.item), text: text(source.text),
    updatedAt: timestamp(source.updatedAt), revision: revision(source.revision),
  };
  if (source.pending !== undefined) {
    const pending = object(source.pending);
    result.pending = { text: text(pending.text), projectName: string(pending.projectName, 256) };
  }
  if (source.remoteDeleted !== undefined) result.remoteDeleted = flag(source.remoteDeleted);
  return result;
}
function key(accountId: unknown, driveId: unknown, itemId: unknown): string {
  return JSON.stringify([string(accountId, 1024), string(driveId, 1024), string(itemId, 1024)]);
}
function only(source: Record<string, unknown>, allowed: string[]): void {
  if (Object.keys(source).some((name) => !allowed.includes(name))) throw corrupt();
}
function storedMeta(value: unknown, expectedKey?: IDBValidKey): CloudCacheMetadata & { key: string } {
  const source = object(value);
  only(source, ['key', 'accountId', 'item', 'updatedAt', 'revision', 'hasPending', 'remoteDeleted']);
  const accountId = string(source.accountId, 1024);
  const cloudItem = item(source.item);
  only(object(source.item), ['driveId', 'id', 'name', 'eTag', 'lastModifiedDateTime', 'size']);
  const identity = key(accountId, cloudItem.driveId, cloudItem.id);
  if (source.key !== identity || (expectedKey !== undefined && expectedKey !== identity)) throw corrupt();
  return {
    key: identity, accountId, item: cloudItem, updatedAt: timestamp(source.updatedAt), revision: revision(source.revision),
    hasPending: flag(source.hasPending), remoteDeleted: source.remoteDeleted === undefined ? false : flag(source.remoteDeleted),
  };
}
function storedRow(meta: unknown, body: unknown, identity: string): CloudCacheRow | null {
  if (meta === undefined && body === undefined) return null;
  if (meta === undefined || body === undefined) throw corrupt();
  const metadata = storedMeta(meta, identity);
  const content = object(body);
  only(content, ['key', 'revision', 'text', 'pending']);
  if (content.key !== identity || content.revision !== metadata.revision || (content.pending !== undefined) !== metadata.hasPending) throw corrupt();
  if (content.pending !== undefined) only(object(content.pending), ['text', 'projectName']);
  return row({
    accountId: metadata.accountId, item: metadata.item, updatedAt: metadata.updatedAt, revision: metadata.revision,
    text: content.text, pending: content.pending, remoteDeleted: object(meta).remoteDeleted,
  });
}
function stored<T>(run: () => T): T {
  try { return run(); } catch { throw corrupt(); }
}
function schema(db: IDBDatabase): void {
  if (db.version !== 1 || db.objectStoreNames.length !== 2 || !STORES.every((name) => db.objectStoreNames.contains(name))) throw corrupt();
  const tx = db.transaction(STORES, 'readonly');
  for (const name of STORES) {
    const store = tx.objectStore(name);
    if (store.keyPath !== 'key' || store.autoIncrement || store.indexNames.length !== (name === META ? 2 : 0)) throw corrupt();
  }
  const meta = tx.objectStore(META);
  for (const [name, path] of [[ACCOUNT, ACCOUNT], [UPDATED, [ACCOUNT, 'updatedAt']]] as const) {
    if (!meta.indexNames.contains(name)) throw corrupt();
    const index = meta.index(name);
    if (JSON.stringify(index.keyPath) !== JSON.stringify(path) || index.unique || index.multiEntry) throw corrupt();
  }
}

/** Optional dependency injection is for isolated tests; production calls need no arguments. */
export function createCloudCache(
  factory?: IDBFactory,
  options?: { openTimeoutMs?: number; keyRange?: typeof IDBKeyRange },
): CloudCache {
  const timeout = options?.openTimeoutMs ?? 5000;
  if (!Number.isSafeInteger(timeout) || timeout < 1 || timeout > 2_147_483_647) throw new TypeError('Invalid cloud cache open timeout.');
  let closed = false;
  let database: IDBDatabase | null = null;
  let opening: Promise<IDBDatabase> | null = null;
  let cancelOpen: (() => void) | null = null;
  const active = new Set<IDBTransaction>();

  function open(): Promise<IDBDatabase> {
    if (closed) return Promise.reject(closedError());
    if (database) return Promise.resolve(database);
    if (opening) return opening;
    const pending = new Promise<IDBDatabase>((resolve, reject) => {
      let settled = false;
      const timer = setTimeout(() => fail(error('TimeoutError', 'Opening cloud cache timed out.')), timeout);
      function fail(reason: unknown): void {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        cancelOpen = null;
        reject(reason);
      }
      cancelOpen = () => fail(closedError());
      try {
        const provider = factory ?? globalThis.indexedDB;
        if (!provider) throw error('NotSupportedError', 'IndexedDB is unavailable for cloud cache.');
        const request = provider.open(NAME, 1);
        request.onerror = () => fail(request.error ?? error('UnknownError', 'Opening cloud cache failed.'));
        request.onblocked = () => fail(error('CloudCacheBlockedError', 'Cloud cache is blocked by another connection.'));
        request.onupgradeneeded = (event) => {
          if (settled || closed) { request.transaction?.abort(); return; }
          try {
            if (event.oldVersion !== 0) throw corrupt();
            const meta = request.result.createObjectStore(META, { keyPath: 'key' });
            meta.createIndex(ACCOUNT, ACCOUNT);
            meta.createIndex(UPDATED, [ACCOUNT, 'updatedAt']);
            request.result.createObjectStore(TEXT, { keyPath: 'key' });
          } catch (reason) {
            fail(reason);
            request.transaction?.abort();
          }
        };
        request.onsuccess = () => {
          const db = request.result;
          if (settled || closed) { db.close(); return; }
          try {
            schema(db);
            db.onversionchange = () => { db.close(); if (database === db) database = null; };
            db.onclose = () => { if (database === db) database = null; };
            database = db;
            settled = true;
            clearTimeout(timer);
            cancelOpen = null;
            resolve(db);
          } catch (reason) { db.close(); fail(reason); }
        };
      } catch (reason) { fail(reason); }
    });
    opening = pending;
    void pending.then(
      () => { if (opening === pending) opening = null; },
      () => { if (opening === pending) opening = null; },
    );
    return pending;
  }

  async function transact<T>(
    mode: IDBTransactionMode, names: string[],
    run: (tx: IDBTransaction, finish: (value: T) => void, guard: (callback: () => void) => () => void) => void,
  ): Promise<T> {
    const db = await open();
    if (closed) throw closedError();
    return new Promise<T>((resolve, reject) => {
      let tx: IDBTransaction;
      try { tx = db.transaction(names, mode); } catch (reason) { reject(reason); return; }
      active.add(tx);
      let value: T;
      let finished = false;
      let failure: unknown;
      const guard = (callback: () => void) => () => {
        try { callback(); } catch (reason) {
          failure = reason;
          try { tx.abort(); } catch { active.delete(tx); reject(reason); }
        }
      };
      tx.oncomplete = () => {
        active.delete(tx);
        if (failure !== undefined) reject(failure);
        else if (finished) resolve(value);
        else reject(error('UnknownError', 'Cloud cache transaction completed without a result.'));
      };
      tx.onabort = () => { active.delete(tx); reject(failure ?? tx.error ?? error('AbortError', 'Cloud cache transaction aborted.')); };
      guard(() => run(tx, (result) => { value = result; finished = true; }, guard))();
    });
  }

  function get(
    tx: IDBTransaction, identity: string, guard: (callback: () => void) => () => void,
    receive: (value: CloudCacheRow | null) => void,
  ): void {
    const meta = tx.objectStore(META).get(identity);
    const body = tx.objectStore(TEXT).get(identity);
    let count = 0;
    const done = guard(() => { if (++count === 2) receive(stored(() => storedRow(meta.result, body.result, identity))); });
    meta.onsuccess = done;
    body.onsuccess = done;
  }

  return {
    async list(accountId, limit = 100) {
      if (closed) throw closedError();
      const account = string(accountId, 1024);
      if (!Number.isInteger(limit) || limit < 1 || limit > 100) throw new TypeError('Cloud cache list limit must be 1 to 100.');
      const ranges = options?.keyRange ?? globalThis.IDBKeyRange;
      if (!ranges) throw error('NotSupportedError', 'IndexedDB key ranges are unavailable.');
      const range = ranges.bound([account, 0], [account, MAX_DATE]);
      return transact<CloudCacheMetadata[]>('readonly', [META], (tx, finish, guard) => {
        const meta = tx.objectStore(META);
        const index = meta.index(UPDATED);
        const total = meta.index(ACCOUNT).count(ranges.only(account));
        const indexed = index.count(range);
        let count = 0;
        const checked = guard(() => { if (++count === 2 && total.result !== indexed.result) throw corrupt(); });
        total.onsuccess = checked;
        indexed.onsuccess = checked;
        const rows: CloudCacheMetadata[] = [];
        const request = index.openCursor(range, 'prev');
        request.onsuccess = guard(() => {
          const cursor = request.result;
          if (!cursor) { finish(rows); return; }
          const metadata = stored(() => storedMeta(cursor.value, cursor.primaryKey));
          if (metadata.accountId !== account || JSON.stringify(cursor.key) !== JSON.stringify([account, metadata.updatedAt])) throw corrupt();
          const result: CloudCacheMetadata = { accountId: metadata.accountId, item: metadata.item, updatedAt: metadata.updatedAt, revision: metadata.revision, hasPending: metadata.hasPending, remoteDeleted: metadata.remoteDeleted };
          rows.push(result);
          if (rows.length === limit) finish(rows);
          else cursor.continue();
        });
      });
    },
    async read(accountId, driveId, itemId) {
      if (closed) throw closedError();
      const identity = key(accountId, driveId, itemId);
      return transact<CloudCacheRow | null>('readonly', STORES, (tx, finish, guard) => get(tx, identity, guard, finish));
    },
    async write(value) {
      if (closed) throw closedError();
      // Snapshot synchronously, before opening the database or yielding to caller edits.
      const input = row(value);
      const identity = key(input.accountId, input.item.driveId, input.item.id);
      return transact<boolean>('readwrite', STORES, (tx, finish, guard) => get(tx, identity, guard, (existing) => {
        if (existing && existing.revision >= input.revision) { finish(false); return; }
        const metadata = {
          key: identity, accountId: input.accountId, item: input.item, revision: input.revision, updatedAt: input.updatedAt,
          hasPending: input.pending !== undefined,
          ...(input.remoteDeleted === undefined ? {} : { remoteDeleted: input.remoteDeleted }),
        };
        tx.objectStore(META).put(metadata);
        tx.objectStore(TEXT).put({ key: identity, revision: input.revision, text: input.text, ...(input.pending === undefined ? {} : { pending: input.pending }) });
        finish(true);
      }));
    },
    async remove(accountId, driveId, itemId, expectedRevision) {
      if (closed) throw closedError();
      const identity = key(accountId, driveId, itemId);
      revision(expectedRevision);
      return transact<boolean>('readwrite', STORES, (tx, finish, guard) => get(tx, identity, guard, (existing) => {
        if (!existing || existing.revision !== expectedRevision) { finish(false); return; }
        tx.objectStore(META).delete(identity);
        tx.objectStore(TEXT).delete(identity);
        finish(true);
      }));
    },
    close() {
      closed = true;
      cancelOpen?.();
      for (const tx of active) { try { tx.abort(); } catch { /* A completed transaction may already be committing. */ } }
      database?.close();
      database = null;
    },
  };
}
