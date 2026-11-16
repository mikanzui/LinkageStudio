import type {
  RecoveryDraft,
  RecoveryMetadata,
  RecoveryStorage,
} from './recovery';
import { MAX_DOCUMENT_CHARACTERS } from './limits';

const META = 'draft-meta';
const TEXT = 'draft-text';
const UPDATED = 'updatedAt';
const STORES = [META, TEXT];

function namedError(name: string, message: string): Error {
  const error = new Error(message);
  error.name = name;
  return error;
}

function corruption(message: string): Error {
  return namedError('RecoveryStorageCorruptionError', message);
}

function validateId(id: unknown): asserts id is string {
  if (typeof id !== 'string' || id.length === 0 || id.length > 256) {
    throw new TypeError('Recovery id must contain 1 to 256 characters.');
  }
}

function record(value: unknown): Record<string, unknown> {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    throw new TypeError('Recovery record must be an object.');
  }
  return value as Record<string, unknown>;
}

function metadata(value: unknown): RecoveryMetadata {
  const source = record(value);
  const result = {
    id: source.id,
    displayName: source.displayName,
    updatedAt: source.updatedAt,
    revision: source.revision,
    formatVersion: source.formatVersion,
  };
  validateId(result.id);
  if (typeof result.displayName !== 'string' || result.displayName.length > 256) {
    throw new TypeError('Recovery display name must be a string of at most 256 characters.');
  }
  if (typeof result.updatedAt !== 'number' || !Number.isFinite(result.updatedAt) || result.updatedAt < 0) {
    throw new TypeError('Recovery timestamp must be finite and nonnegative.');
  }
  if (typeof result.revision !== 'number' || !Number.isSafeInteger(result.revision) || result.revision <= 0) {
    throw new TypeError('Recovery revision must be a positive safe integer.');
  }
  if (result.formatVersion !== 1) throw new TypeError('Recovery format version must be 1.');
  return result as RecoveryMetadata;
}

function validateText(text: unknown): asserts text is string {
  if (typeof text !== 'string' || text.length > MAX_DOCUMENT_CHARACTERS) {
    throw new TypeError(`Recovery text must be a string of at most ${MAX_DOCUMENT_CHARACTERS} characters.`);
  }
}

function storedMetadata(value: unknown): RecoveryMetadata {
  try {
    return metadata(value);
  } catch (error) {
    throw corruption(`Invalid recovery metadata: ${error instanceof Error ? error.message : String(error)}`);
  }
}

function storedDraft(meta: unknown, text: unknown, id: string): RecoveryDraft | null {
  if (meta === undefined && text === undefined) return null;
  if (meta === undefined || text === undefined) throw corruption(`Incomplete recovery record: ${id}`);
  const result = storedMetadata(meta);
  try {
    const content = record(text);
    if (content.id !== id || result.id !== id) throw new TypeError('Recovery record ids disagree.');
    const body = content.text;
    validateText(body);
    return { ...result, text: body };
  } catch (error) {
    throw corruption(`Invalid recovery text: ${error instanceof Error ? error.message : String(error)}`);
  }
}

function validateSchema(db: IDBDatabase): void {
  if (db.version !== 1 || db.objectStoreNames.length !== 2 || !STORES.every((name) => db.objectStoreNames.contains(name))) {
    throw corruption('Expected recovery schema version 1 with draft-meta and draft-text stores.');
  }
  const tx = db.transaction(STORES, 'readonly');
  for (const name of STORES) {
    const store = tx.objectStore(name);
    if (store.keyPath !== 'id' || store.autoIncrement) throw corruption(`Invalid recovery store schema: ${name}`);
  }
  const store = tx.objectStore(META);
  if (!store.indexNames.contains(UPDATED)) throw corruption('Missing recovery updatedAt index.');
  const index = store.index(UPDATED);
  if (index.keyPath !== UPDATED || index.unique || index.multiEntry) throw corruption('Invalid recovery updatedAt index.');
}

export function createIndexedDbRecoveryStorage(
  factory?: IDBFactory,
  options?: { databaseName?: string; openTimeoutMs?: number },
): RecoveryStorage {
  const databaseName = options?.databaseName ?? 'linkage-studio-rebuild-recovery';
  const openTimeoutMs = options?.openTimeoutMs ?? 5000;
  if (typeof databaseName !== 'string' || databaseName.length === 0) throw new TypeError('Recovery database name must be nonempty.');
  if (!Number.isSafeInteger(openTimeoutMs) || openTimeoutMs < 1 || openTimeoutMs > 2_147_483_647) {
    throw new TypeError('Recovery open timeout must be an integer from 1 to 2147483647 ms.');
  }

  let closed = false;
  let database: IDBDatabase | null = null;
  let opening: Promise<IDBDatabase> | null = null;
  let cancelOpen: (() => void) | null = null;
  const closedError = () => namedError('RecoveryStorageClosedError', 'Recovery storage is closed.');

  function open(): Promise<IDBDatabase> {
    if (closed) return Promise.reject(closedError());
    if (database) return Promise.resolve(database);
    if (opening) return opening;
    const pending = new Promise<IDBDatabase>((resolve, reject) => {
      let settled = false;
      const timer = setTimeout(() => fail(namedError('TimeoutError', 'Opening recovery storage timed out.')), openTimeoutMs);
      function fail(error: unknown): void {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        cancelOpen = null;
        reject(error);
      }
      cancelOpen = () => fail(closedError());
      try {
        const provider = factory ?? globalThis.indexedDB;
        if (!provider) throw namedError('NotSupportedError', 'IndexedDB is unavailable for recovery.');
        const request = provider.open(databaseName, 1);
        request.onerror = () => fail(request.error ?? namedError('UnknownError', 'Opening recovery storage failed.'));
        request.onblocked = () => fail(namedError('RecoveryStorageBlockedError', 'Recovery storage is blocked by another connection.'));
        request.onupgradeneeded = (event) => {
          if (settled || closed) {
            request.transaction?.abort();
            return;
          }
          try {
            if (event.oldVersion !== 0) throw corruption('Unexpected recovery schema upgrade.');
            const db = request.result;
            db.createObjectStore(META, { keyPath: 'id' }).createIndex(UPDATED, UPDATED);
            db.createObjectStore(TEXT, { keyPath: 'id' });
          } catch (error) {
            fail(error);
            request.transaction?.abort();
          }
        };
        request.onsuccess = () => {
          const db = request.result;
          if (settled || closed) {
            db.close();
            return;
          }
          try {
            validateSchema(db);
            db.onversionchange = () => {
              db.close();
              if (database === db) database = null;
            };
            db.onclose = () => { if (database === db) database = null; };
            database = db;
            settled = true;
            clearTimeout(timer);
            cancelOpen = null;
            resolve(db);
          } catch (error) {
            db.close();
            fail(error);
          }
        };
      } catch (error) {
        fail(error);
      }
    });
    opening = pending;
    void pending.then(
      () => { if (opening === pending) opening = null; },
      () => { if (opening === pending) opening = null; },
    );
    return pending;
  }

  async function transact<T>(
    mode: IDBTransactionMode,
    stores: string[],
    run: (tx: IDBTransaction, finish: (value: T) => void, guard: (callback: () => void) => () => void) => void,
  ): Promise<T> {
    const db = await open();
    if (closed) throw closedError();
    return new Promise<T>((resolve, reject) => {
      let tx: IDBTransaction;
      try {
        tx = db.transaction(stores, mode);
      } catch (error) {
        reject(error);
        return;
      }
      let value: T;
      let finished = false;
      let failure: unknown;
      const guard = (callback: () => void) => () => {
        try {
          callback();
        } catch (error) {
          failure = error;
          try { tx.abort(); } catch { reject(error); }
        }
      };
      tx.oncomplete = () => {
        if (failure !== undefined) reject(failure);
        else if (finished) resolve(value);
        else reject(namedError('UnknownError', 'Recovery transaction completed without a result.'));
      };
      tx.onabort = () => reject(failure ?? tx.error ?? namedError('AbortError', 'Recovery transaction aborted.'));
      // Request errors retain the default abort action and surface through onabort.
      guard(() => run(tx, (result) => { value = result; finished = true; }, guard))();
    });
  }

  function getDraft(
    tx: IDBTransaction,
    id: string,
    guard: (callback: () => void) => () => void,
    receive: (draft: RecoveryDraft | null) => void,
  ): void {
    const meta = tx.objectStore(META).get(id);
    const text = tx.objectStore(TEXT).get(id);
    let count = 0;
    const done = guard(() => {
      if (++count === 2) receive(storedDraft(meta.result, text.result, id));
    });
    meta.onsuccess = done;
    text.onsuccess = done;
  }

  return {
    async list(limit = 10) {
      if (closed) throw closedError();
      if (!Number.isInteger(limit) || limit < 1 || limit > 100) throw new TypeError('Recovery list limit must be an integer from 1 to 100.');
      return transact<RecoveryMetadata[]>('readonly', [META], (tx, finish, guard) => {
        const rows: RecoveryMetadata[] = [];
        const store = tx.objectStore(META);
        const index = store.index(UPDATED);
        const total = store.count();
        const indexed = index.count();
        let counted = 0;
        // Missing/non-indexable timestamps must not disappear silently from the list.
        const checkCount = guard(() => {
          if (++counted === 2 && total.result !== indexed.result) throw corruption('Recovery metadata is missing a valid updatedAt index key.');
        });
        total.onsuccess = checkCount;
        indexed.onsuccess = checkCount;
        const request = index.openCursor(null, 'prev');
        request.onsuccess = guard(() => {
          const cursor = request.result;
          if (!cursor) { finish(rows); return; }
          const row = storedMetadata(cursor.value);
          if (row.id !== cursor.primaryKey || row.updatedAt !== cursor.key) throw corruption('Recovery metadata index disagrees with its record.');
          rows.push(row);
          if (rows.length === limit) finish(rows);
          else cursor.continue();
        });
      });
    },
    async read(id) {
      if (closed) throw closedError();
      validateId(id);
      return transact<RecoveryDraft | null>('readonly', STORES, (tx, finish, guard) => getDraft(tx, id, guard, finish));
    },
    async write(draft) {
      if (closed) throw closedError();
      const source = record(draft);
      const meta = metadata(source);
      const text = source.text;
      validateText(text);
      return transact<boolean>('readwrite', STORES, (tx, finish, guard) => {
        getDraft(tx, meta.id, guard, (existing) => {
          if (existing && existing.revision >= meta.revision) { finish(false); return; }
          tx.objectStore(META).put(meta);
          tx.objectStore(TEXT).put({ id: meta.id, text });
          finish(true);
        });
      });
    },
    async remove(id) {
      if (closed) throw closedError();
      validateId(id);
      return transact<void>('readwrite', STORES, (tx, finish) => {
        tx.objectStore(META).delete(id);
        tx.objectStore(TEXT).delete(id);
        finish(undefined);
      });
    },
    close() {
      closed = true;
      cancelOpen?.();
      database?.close();
      database = null;
    },
  };
}
