import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import test from 'node:test';
import { createIndexedDbRecoveryStorage } from '../src/document/recovery-storage';
import type { RecoveryDraft } from '../src/document/recovery';
import { MAX_DOCUMENT_CHARACTERS } from '../src/document/limits';

const require = createRequire(import.meta.url);
const { IDBFactory: FakeFactory } = require('fake-indexeddb') as { IDBFactory: new () => IDBFactory };
const NAME = 'linkage-studio-rebuild-recovery';
const META = 'draft-meta';
const TEXT = 'draft-text';

function draft(overrides: Partial<RecoveryDraft> = {}): RecoveryDraft {
  return { id: 'document-1', displayName: 'Mechanism', updatedAt: 100, revision: 1, formatVersion: 1, text: '{"opaque":true}', ...overrides };
}

function openRaw(factory: IDBFactory, name = NAME, version = 1, upgrade?: (db: IDBDatabase) => void): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = factory.open(name, version);
    request.onupgradeneeded = () => upgrade?.(request.result);
    request.onerror = () => reject(request.error);
    request.onsuccess = () => resolve(request.result);
  });
}

function schema(db: IDBDatabase): void {
  db.createObjectStore(META, { keyPath: 'id' }).createIndex('updatedAt', 'updatedAt');
  db.createObjectStore(TEXT, { keyPath: 'id' });
}

function mutate(db: IDBDatabase, run: (tx: IDBTransaction) => void): Promise<void> {
  return new Promise((resolve, reject) => {
    const tx = db.transaction([META, TEXT], 'readwrite');
    tx.oncomplete = () => resolve();
    tx.onabort = () => reject(tx.error);
    run(tx);
  });
}

function rawRead(db: IDBDatabase, store: string, id: string): Promise<unknown> {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(store, 'readonly');
    const request = tx.objectStore(store).get(id);
    tx.oncomplete = () => resolve(request.result);
    tx.onabort = () => reject(tx.error);
  });
}

function observingFactory(factory: IDBFactory, onConnection: (db: IDBDatabase) => void): IDBFactory {
  return {
    open(name: string, version?: number) {
      const request = factory.open(name, version);
      request.addEventListener('success', () => onConnection(request.result));
      return request;
    },
  } as IDBFactory;
}

function hookTransactions(db: IDBDatabase, hook: (tx: IDBTransaction) => void): void {
  const original = db.transaction.bind(db);
  db.transaction = ((...args: Parameters<IDBDatabase['transaction']>) => {
    const tx = original(...args);
    hook(tx);
    return tx;
  }) as IDBDatabase['transaction'];
}

function hookStore(tx: IDBTransaction, hook: (store: IDBObjectStore) => void): void {
  const original = tx.objectStore.bind(tx);
  tx.objectStore = (name: string) => {
    const store = original(name);
    hook(store);
    return store;
  };
}

test('opens lazily with the default name/version and exact split-store schema', async (t) => {
  const factory = new FakeFactory();
  let opens = 0;
  const storage = createIndexedDbRecoveryStorage(observingFactory(factory, () => { opens++; }));
  t.after(() => storage.close());
  assert.deepEqual(await factory.databases(), []);
  assert.deepEqual(await storage.list(), []);
  assert.equal(opens, 1);
  const db = await openRaw(factory);
  t.after(() => db.close());
  assert.equal(db.version, 1);
  assert.deepEqual(Array.from(db.objectStoreNames), [META, TEXT]);
  const tx = db.transaction([META, TEXT]);
  assert.equal(tx.objectStore(META).keyPath, 'id');
  assert.equal(tx.objectStore(TEXT).keyPath, 'id');
  assert.equal(tx.objectStore(META).index('updatedAt').keyPath, 'updatedAt');
  assert.equal(await storage.read('absent'), null);
  assert.equal(opens, 1);
});

test('atomically writes and removes both stores; outputs contain fresh, metadata-only clones', async (t) => {
  const factory = new FakeFactory();
  const storage = createIndexedDbRecoveryStorage(factory);
  t.after(() => storage.close());
  const input = draft();
  const writing = storage.write(input);
  input.displayName = 'Changed after invocation';
  input.text = 'Changed after invocation';
  assert.equal(await writing, true);
  assert.deepEqual(await storage.read(input.id), draft());
  const rows = await storage.list();
  assert.deepEqual(rows, [{ id: input.id, displayName: 'Mechanism', updatedAt: 100, revision: 1, formatVersion: 1 }]);
  assert.equal('text' in rows[0], false);
  rows[0].displayName = 'Mutated result';
  const read = (await storage.read(input.id))!;
  read.text = 'Mutated result';
  assert.deepEqual(await storage.read(input.id), draft());
  const db = await openRaw(factory);
  t.after(() => db.close());
  assert.deepEqual(await rawRead(db, META, input.id), { id: input.id, displayName: 'Mechanism', updatedAt: 100, revision: 1, formatVersion: 1 });
  assert.deepEqual(await rawRead(db, TEXT, input.id), { id: input.id, text: draft().text });
  await storage.remove(input.id);
  assert.equal(await storage.read(input.id), null);
  assert.equal(await rawRead(db, META, input.id), undefined);
  assert.equal(await rawRead(db, TEXT, input.id), undefined);
  await storage.remove(input.id);
});

test('revision order, not timestamps, controls stale writes, including concurrent adapters', async (t) => {
  const factory = new FakeFactory();
  const a = createIndexedDbRecoveryStorage(factory);
  const b = createIndexedDbRecoveryStorage(factory);
  t.after(() => { a.close(); b.close(); });
  assert.equal(await a.write(draft({ revision: 3 })), true);
  assert.equal(await a.write(draft({ revision: 3, updatedAt: 9999, text: 'equal' })), false);
  assert.equal(await b.write(draft({ revision: 2, updatedAt: 9999, text: 'old' })), false);
  assert.equal(await b.write(draft({ revision: 4, updatedAt: 0, text: 'new' })), true);
  assert.deepEqual(await a.read('document-1'), draft({ revision: 4, updatedAt: 0, text: 'new' }));
  await Promise.all([a.write(draft({ revision: 6, text: 'six' })), b.write(draft({ revision: 5, text: 'five' }))]);
  assert.equal((await a.read('document-1'))?.revision, 6);
  assert.equal((await a.read('document-1'))?.text, 'six');
});

test('concurrent read snapshots never mix metadata and text from different revisions', async (t) => {
  const factory = new FakeFactory();
  const scopes: string[][] = [];
  const writer = createIndexedDbRecoveryStorage(factory);
  const reader = createIndexedDbRecoveryStorage(observingFactory(factory, (db) => {
    hookTransactions(db, (tx) => scopes.push(Array.from(tx.objectStoreNames)));
  }));
  t.after(() => { writer.close(); reader.close(); });
  await writer.write(draft({ displayName: 'revision-1', text: 'text-1' }));
  await reader.list();
  scopes.length = 0;
  const work: Promise<unknown>[] = [];
  for (let revision = 2; revision <= 20; revision++) {
    work.push(writer.write(draft({ revision, updatedAt: revision, displayName: `revision-${revision}`, text: `text-${revision}` })));
    work.push(reader.read('document-1').then((result) => {
      assert.notEqual(result, null);
      assert.equal(result!.displayName, `revision-${result!.revision}`);
      assert.equal(result!.text, `text-${result!.revision}`);
    }));
  }
  await Promise.all(work);
  assert.equal(scopes.length, 19);
  assert.ok(scopes.every((names) => names.length === 2 && names.includes(META) && names.includes(TEXT)));
});

test('lists newest first, defaults to ten, bounds results and never opens draft-text for listing', async (t) => {
  const factory = new FakeFactory();
  let watching = false;
  const transactions: string[][] = [];
  const storage = createIndexedDbRecoveryStorage(observingFactory(factory, (db) => {
    hookTransactions(db, (tx) => { if (watching) transactions.push(Array.from(tx.objectStoreNames)); });
  }));
  t.after(() => storage.close());
  for (let i = 0; i < 13; i++) await storage.write(draft({ id: `id-${i}`, updatedAt: i, text: 'opaque-not-json' }));
  watching = true;
  assert.deepEqual((await storage.list()).map((row) => row.updatedAt), [12, 11, 10, 9, 8, 7, 6, 5, 4, 3]);
  assert.deepEqual((await storage.list(1)).map((row) => row.updatedAt), [12]);
  assert.equal((await storage.list(100)).length, 13);
  assert.deepEqual(transactions, [[META], [META], [META]]);
});

test('timestamp ties have stable descending id order', async (t) => {
  const storage = createIndexedDbRecoveryStorage(new FakeFactory());
  t.after(() => storage.close());
  for (const id of ['b', 'a', 'c']) await storage.write(draft({ id }));
  assert.deepEqual((await storage.list()).map((row) => row.id), ['c', 'b', 'a']);
});

test('validates draft input before any database open', async () => {
  let opens = 0;
  const storage = createIndexedDbRecoveryStorage({ open() { opens++; throw new Error('must not open'); } } as unknown as IDBFactory);
  const invalid = [
    null, [], {},
    ...['', 'x'.repeat(257), null, 12].map((id) => ({ ...draft(), id })),
    ...[null, 12, 'x'.repeat(257)].map((displayName) => ({ ...draft(), displayName })),
    ...[NaN, Infinity, -Infinity, -1, '1'].map((updatedAt) => ({ ...draft(), updatedAt })),
    ...[0, -1, 1.5, NaN, Infinity, Number.MAX_SAFE_INTEGER + 1, '1'].map((revision) => ({ ...draft(), revision })),
    ...[0, 2, '1', null].map((formatVersion) => ({ ...draft(), formatVersion })),
    ...[null, 5, {}, 'x'.repeat(MAX_DOCUMENT_CHARACTERS + 1)].map((text) => ({ ...draft(), text })),
  ];
  for (const value of invalid) await assert.rejects(storage.write(value as RecoveryDraft), TypeError);
  for (const value of [0, -1, 101, 1.5, NaN, Infinity, null, '10']) await assert.rejects(storage.list(value as number), TypeError);
  for (const value of ['', 'x'.repeat(257), null, 12]) {
    await assert.rejects(storage.read(value as string), TypeError);
    await assert.rejects(storage.remove(value as string), TypeError);
  }
  assert.equal(opens, 0);
  storage.close();
});

test('accepts exact boundary values and stores incompatible JSON or non-JSON without parsing', async (t) => {
  const storage = createIndexedDbRecoveryStorage(new FakeFactory());
  t.after(() => storage.close());
  const input = draft({ id: 'x'.repeat(256), displayName: 'n'.repeat(256), revision: Number.MAX_SAFE_INTEGER, updatedAt: 0, text: 'x'.repeat(MAX_DOCUMENT_CHARACTERS) });
  assert.equal(await storage.write(input), true);
  assert.equal((await storage.read(input.id))?.text.length, MAX_DOCUMENT_CHARACTERS);
  for (const text of ['', 'not json', '{"schemaVersion":999,"unknown":[1,2]}']) {
    const entry = draft({ id: `opaque-${text.length}`, text, displayName: '' });
    assert.equal(await storage.write(entry), true);
    assert.deepEqual(await storage.read(entry.id), entry);
  }
});

test('rejects corrupt metadata on list/read/write without erasing stored records', async (t) => {
  for (const bad of [{ revision: 0 }, { displayName: 2 }, { formatVersion: 2 }, { updatedAt: 'wrong' }, { updatedAt: undefined }]) {
    await t.test(JSON.stringify(bad), async () => {
      const factory = new FakeFactory();
      const db = await openRaw(factory, NAME, 1, schema);
      const { text, ...meta } = draft();
      const broken = { ...meta, ...bad };
      await mutate(db, (tx) => {
        tx.objectStore(META).put(broken);
        tx.objectStore(TEXT).put({ id: meta.id, text });
      });
      const storage = createIndexedDbRecoveryStorage(factory);
      try {
        for (const action of [() => storage.list(), () => storage.read(meta.id), () => storage.write(draft({ revision: 2 }))]) {
          await assert.rejects(action(), { name: 'RecoveryStorageCorruptionError' });
        }
        assert.deepEqual(await rawRead(db, META, meta.id), broken);
        assert.deepEqual(await rawRead(db, TEXT, meta.id), { id: meta.id, text });
      } finally { storage.close(); db.close(); }
    });
  }
});

test('rejects incomplete pairs and malformed text without deletion, but explicit remove works', async (t) => {
  for (const which of ['metadata-only', 'text-only', 'nonstring-text', 'missing-text']) {
    await t.test(which, async () => {
      const factory = new FakeFactory();
      const db = await openRaw(factory, NAME, 1, schema);
      const { text, ...meta } = draft();
      await mutate(db, (tx) => {
        if (which !== 'text-only') tx.objectStore(META).put(meta);
        if (which !== 'metadata-only') tx.objectStore(TEXT).put({ id: meta.id, text: which === 'nonstring-text' ? 42 : which === 'missing-text' ? undefined : text });
      });
      const beforeMeta = await rawRead(db, META, meta.id);
      const beforeText = await rawRead(db, TEXT, meta.id);
      const storage = createIndexedDbRecoveryStorage(factory);
      try {
        await assert.rejects(storage.read(meta.id), { name: 'RecoveryStorageCorruptionError' });
        await assert.rejects(storage.write(draft({ revision: 2 })), { name: 'RecoveryStorageCorruptionError' });
        assert.deepEqual(await rawRead(db, META, meta.id), beforeMeta);
        assert.deepEqual(await rawRead(db, TEXT, meta.id), beforeText);
        await storage.remove(meta.id);
        assert.equal(await storage.read(meta.id), null);
      } finally { storage.close(); db.close(); }
    });
  }
});

test('rejects malformed schema without migrating or deleting existing databases', async (t) => {
  const cases: Record<string, (db: IDBDatabase) => void> = {
    'missing-store': (db) => { db.createObjectStore(META, { keyPath: 'id' }).createIndex('updatedAt', 'updatedAt'); },
    'wrong-keypath': (db) => { db.createObjectStore(META, { keyPath: 'other' }).createIndex('updatedAt', 'updatedAt'); db.createObjectStore(TEXT, { keyPath: 'id' }); },
    'auto-increment': (db) => { db.createObjectStore(META, { keyPath: 'id', autoIncrement: true }).createIndex('updatedAt', 'updatedAt'); db.createObjectStore(TEXT, { keyPath: 'id' }); },
    'missing-index': (db) => { db.createObjectStore(META, { keyPath: 'id' }); db.createObjectStore(TEXT, { keyPath: 'id' }); },
    'wrong-index': (db) => { db.createObjectStore(META, { keyPath: 'id' }).createIndex('updatedAt', 'displayName'); db.createObjectStore(TEXT, { keyPath: 'id' }); },
    'unique-index': (db) => { db.createObjectStore(META, { keyPath: 'id' }).createIndex('updatedAt', 'updatedAt', { unique: true }); db.createObjectStore(TEXT, { keyPath: 'id' }); },
    'extra-store': (db) => { schema(db); db.createObjectStore('extra'); },
  };
  for (const [name, upgrade] of Object.entries(cases)) {
    await t.test(name, async () => {
      const factory = new FakeFactory();
      const db = await openRaw(factory, NAME, 1, upgrade);
      const names = Array.from(db.objectStoreNames);
      db.close();
      const storage = createIndexedDbRecoveryStorage(factory);
      await assert.rejects(storage.list(), { name: 'RecoveryStorageCorruptionError' });
      storage.close();
      const preserved = await openRaw(factory);
      assert.deepEqual(Array.from(preserved.objectStoreNames), names);
      preserved.close();
    });
  }
});

test('write never succeeds on request success before commit and abort rolls back both stores', async (t) => {
  const factory = new FakeFactory();
  let aborting = false;
  let settled = false;
  let observedSuccess = false;
  const storage = createIndexedDbRecoveryStorage(observingFactory(factory, (db) => {
    hookTransactions(db, (tx) => {
      if (tx.mode !== 'readwrite') return;
      hookStore(tx, (store) => {
        if (store.name !== TEXT) return;
        const put = store.put.bind(store);
        store.put = ((...args: Parameters<IDBObjectStore['put']>) => {
          const request = put(...args);
          request.addEventListener('success', () => {
            observedSuccess = true;
            assert.equal(settled, false);
            if (aborting) tx.abort();
          });
          return request;
        }) as IDBObjectStore['put'];
      });
    });
  }));
  t.after(() => storage.close());
  const first = storage.write(draft());
  first.then(() => { settled = true; });
  assert.equal(await first, true);
  assert.equal(observedSuccess, true);
  settled = false;
  aborting = true;
  const failed = storage.write(draft({ revision: 2, displayName: 'Must roll back', text: 'Must roll back' }));
  failed.then(() => { settled = true; }, () => { settled = true; });
  await assert.rejects(failed, { name: 'AbortError' });
  assert.deepEqual(await storage.read('document-1'), draft());
});

test('remove resolves only on commit; abort restores metadata and text', async (t) => {
  const factory = new FakeFactory();
  let aborting = false;
  let settled = false;
  let observed = false;
  const storage = createIndexedDbRecoveryStorage(observingFactory(factory, (db) => {
    hookTransactions(db, (tx) => {
      if (tx.mode !== 'readwrite') return;
      hookStore(tx, (store) => {
        if (store.name !== TEXT) return;
        const remove = store.delete.bind(store);
        store.delete = (key) => {
          const request = remove(key);
          request.addEventListener('success', () => {
            observed = true;
            assert.equal(settled, false);
            if (aborting) tx.abort();
          });
          return request;
        };
      });
    });
  }));
  t.after(() => storage.close());
  await storage.write(draft());
  aborting = true;
  const failed = storage.remove('document-1');
  failed.then(() => { settled = true; }, () => { settled = true; });
  await assert.rejects(failed, { name: 'AbortError' });
  assert.deepEqual(await storage.read('document-1'), draft());
  settled = false;
  aborting = false;
  const removed = storage.remove('document-1');
  removed.then(() => { settled = true; });
  await removed;
  assert.equal(observed, true);
  assert.equal(await storage.read('document-1'), null);
});

test('quota/security exceptions propagate unchanged and an interrupted split write rolls back', async (t) => {
  for (const name of ['QuotaExceededError', 'SecurityError']) {
    await t.test(name, async () => {
      const factory = new FakeFactory();
      const failure = new DOMException('injected storage failure', name);
      let failing = false;
      const storage = createIndexedDbRecoveryStorage(observingFactory(factory, (db) => {
        hookTransactions(db, (tx) => {
          if (tx.mode !== 'readwrite') return;
          hookStore(tx, (store) => {
            if (store.name === TEXT && failing) store.put = () => { throw failure; };
          });
        });
      }));
      try {
        await storage.write(draft());
        failing = true;
        await assert.rejects(storage.write(draft({ revision: 2 })), (error) => error === failure);
        assert.deepEqual(await storage.read('document-1'), draft());
      } finally { storage.close(); }
    });
  }
});

test('native asynchronous request errors abort instead of reporting success', async (t) => {
  const independent = new FakeFactory();
  const request = independent.open(NAME, 1);
  request.onupgradeneeded = () => {
    schema(request.result);
    request.transaction!.objectStore(META).createIndex('unique-name', 'displayName', { unique: true });
  };
  const ready = await new Promise<IDBDatabase>((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
  ready.close();
  const storage = createIndexedDbRecoveryStorage(independent);
  t.after(() => storage.close());
  await storage.write(draft());
  await assert.rejects(storage.write(draft({ id: 'duplicate-name' })), { name: 'ConstraintError' });
  assert.equal(await storage.read('duplicate-name'), null);
  assert.deepEqual(await storage.read('document-1'), draft());
});

test('unavailable and synchronously denied opens reject; failed open may be retried', async () => {
  const previous = Object.getOwnPropertyDescriptor(globalThis, 'indexedDB');
  Object.defineProperty(globalThis, 'indexedDB', { configurable: true, value: undefined });
  try {
    const unavailable = createIndexedDbRecoveryStorage();
    await assert.rejects(unavailable.list(), { name: 'NotSupportedError' });
    unavailable.close();
    const denied = new DOMException('denied', 'SecurityError');
    Object.defineProperty(globalThis, 'indexedDB', { configurable: true, get() { throw denied; } });
    const guarded = createIndexedDbRecoveryStorage();
    await assert.rejects(guarded.list(), (error) => error === denied);
    guarded.close();
    const factory = new FakeFactory();
    let first = true;
    const retrying = createIndexedDbRecoveryStorage({ open(name: string, version: number) {
      if (first) { first = false; throw denied; }
      return factory.open(name, version);
    } } as IDBFactory);
    await assert.rejects(retrying.list(), (error) => error === denied);
    assert.deepEqual(await retrying.list(), []);
    retrying.close();
  } finally {
    if (previous) Object.defineProperty(globalThis, 'indexedDB', previous);
    else Reflect.deleteProperty(globalThis, 'indexedDB');
  }
});

test('future database versions reject natively without rewriting data', async () => {
  const factory = new FakeFactory();
  const db = await openRaw(factory, NAME, 2, schema);
  db.close();
  const storage = createIndexedDbRecoveryStorage(factory);
  await assert.rejects(storage.list(), { name: 'VersionError' });
  storage.close();
  assert.equal((await factory.databases())[0].version, 2);
});

test('close before opening is idempotent and forbids every operation', async () => {
  let opens = 0;
  const storage = createIndexedDbRecoveryStorage({ open() { opens++; } } as unknown as IDBFactory);
  storage.close();
  storage.close();
  for (const operation of [() => storage.list(), () => storage.read('id'), () => storage.write(draft()), () => storage.remove('id')]) {
    await assert.rejects(operation(), { name: 'RecoveryStorageClosedError' });
  }
  assert.equal(opens, 0);
});

test('active transaction can commit after close; no new operations are accepted', async () => {
  const factory = new FakeFactory();
  let closeOnWrite = false;
  const storage = createIndexedDbRecoveryStorage(observingFactory(factory, (db) => {
    hookTransactions(db, (tx) => {
      if (tx.mode !== 'readwrite') return;
      hookStore(tx, (store) => {
        if (store.name !== TEXT) return;
        const put = store.put.bind(store);
        store.put = ((...args: Parameters<IDBObjectStore['put']>) => {
          const request = put(...args);
          request.addEventListener('success', () => { if (closeOnWrite) storage.close(); });
          return request;
        }) as IDBObjectStore['put'];
      });
    });
  }));
  closeOnWrite = true;
  assert.equal(await storage.write(draft()), true);
  await assert.rejects(storage.list(), { name: 'RecoveryStorageClosedError' });
  const other = createIndexedDbRecoveryStorage(factory);
  assert.deepEqual(await other.read('document-1'), draft());
  other.close();
});

test('versionchange closes the adapter connection and unblocks upgrade', { timeout: 3000 }, async () => {
  const factory = new FakeFactory();
  const storage = createIndexedDbRecoveryStorage(factory);
  await storage.write(draft());
  const upgraded = await openRaw(factory, NAME, 2);
  assert.equal(upgraded.version, 2);
  await assert.rejects(storage.list(), { name: 'VersionError' });
  upgraded.close();
  storage.close();
});

function controlledOpen(): { factory: IDBFactory; request: IDBOpenDBRequest } {
  const request = { onerror: null, onblocked: null, onupgradeneeded: null, onsuccess: null } as unknown as IDBOpenDBRequest;
  return { factory: { open: () => request } as unknown as IDBFactory, request };
}

function send(request: IDBOpenDBRequest, name: 'success' | 'blocked' | 'error' | 'upgradeneeded', properties: Record<string, unknown> = {}): void {
  Object.assign(request, properties);
  const handler = request[`on${name}`];
  if (handler) (handler as (event: unknown) => void).call(request, { target: request, oldVersion: 0 });
}

test('timeout bounds a hanging open and closes a late successful connection', { timeout: 3000 }, async () => {
  const { factory, request } = controlledOpen();
  const storage = createIndexedDbRecoveryStorage(factory, { openTimeoutMs: 10 });
  await assert.rejects(storage.list(), { name: 'TimeoutError' });
  let closed = 0;
  send(request, 'success', { result: { close() { closed++; } } });
  assert.equal(closed, 1);
  storage.close();
});

test('blocked open fails immediately, aborts late upgrade, and closes late connection', async () => {
  const { factory, request } = controlledOpen();
  const storage = createIndexedDbRecoveryStorage(factory, { openTimeoutMs: 1000 });
  const listing = storage.list();
  send(request, 'blocked');
  await assert.rejects(listing, { name: 'RecoveryStorageBlockedError' });
  let aborted = 0;
  send(request, 'upgradeneeded', { transaction: { abort() { aborted++; } } });
  let closed = 0;
  send(request, 'success', { result: { close() { closed++; } } });
  assert.equal(aborted, 1);
  assert.equal(closed, 1);
  storage.close();
});

test('close rejects pending shared opens and releases every late resource', async () => {
  const { factory, request } = controlledOpen();
  const storage = createIndexedDbRecoveryStorage(factory);
  const listing = storage.list();
  const reading = storage.read('id');
  storage.close();
  await assert.rejects(listing, { name: 'RecoveryStorageClosedError' });
  await assert.rejects(reading, { name: 'RecoveryStorageClosedError' });
  let aborted = 0;
  let closed = 0;
  send(request, 'upgradeneeded', { transaction: { abort() { aborted++; } } });
  send(request, 'success', { result: { close() { closed++; } } });
  assert.equal(aborted, 1);
  assert.equal(closed, 1);
});

test('native open request errors propagate unchanged', async () => {
  const { factory, request } = controlledOpen();
  const storage = createIndexedDbRecoveryStorage(factory);
  const failure = new DOMException('open denied', 'SecurityError');
  const listing = storage.list();
  send(request, 'error', { error: failure });
  await assert.rejects(listing, (error) => error === failure);
  storage.close();
});

test('validates options and isolates custom database names', async () => {
  for (const openTimeoutMs of [0, -1, 0.5, NaN, Infinity, 2_147_483_648]) {
    assert.throws(() => createIndexedDbRecoveryStorage(new FakeFactory(), { openTimeoutMs }), TypeError);
  }
  assert.throws(() => createIndexedDbRecoveryStorage(new FakeFactory(), { databaseName: '' }), TypeError);
  const factory = new FakeFactory();
  const custom = createIndexedDbRecoveryStorage(factory, { databaseName: 'isolated-test' });
  await custom.write(draft());
  const standard = createIndexedDbRecoveryStorage(factory);
  assert.deepEqual(await standard.list(), []);
  custom.close();
  standard.close();
});
