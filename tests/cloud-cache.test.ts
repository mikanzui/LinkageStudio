import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import test from 'node:test';
import { createCloudCache } from '../src/cloud/cloud-cache';
import type { CloudCacheRow } from '../src/cloud/types';
import { MAX_DOCUMENT_CHARACTERS } from '../src/document/limits';

const require = createRequire(import.meta.url);
const { IDBFactory: FakeFactory, IDBKeyRange: Range, forceCloseDatabase } = require('fake-indexeddb') as {
  IDBFactory: new () => IDBFactory; IDBKeyRange: typeof IDBKeyRange; forceCloseDatabase: (db: IDBDatabase) => void;
};
const NAME = 'linkage-studio-cloud-cache';
const META = 'cloud-meta';
const TEXT = 'cloud-text';
const identity = (account = 'account', drive = 'drive', id = 'item') => JSON.stringify([account, drive, id]);
const create = (factory: IDBFactory, openTimeoutMs?: number) => createCloudCache(factory, { keyRange: Range, openTimeoutMs });
function row(overrides: Partial<CloudCacheRow> = {}): CloudCacheRow {
  return {
    accountId: 'account', item: { driveId: 'drive', id: 'item', name: 'Model.slinker', eTag: '"base"', lastModifiedDateTime: '2026-11-16T00:00:00Z', size: 20 },
    text: 'confirmed opaque text', updatedAt: 100, revision: 1, ...overrides,
  };
}
const read = (cache: ReturnType<typeof create>) => cache.read('account', 'drive', 'item');
const remove = (cache: ReturnType<typeof create>, revision = 1) => cache.remove('account', 'drive', 'item', revision);
function openRaw(factory: IDBFactory, version = 1, upgrade?: (db: IDBDatabase) => void, name = NAME): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = factory.open(name, version);
    request.onupgradeneeded = () => upgrade?.(request.result);
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}
function mutate(db: IDBDatabase, run: (tx: IDBTransaction) => void): Promise<void> {
  return new Promise((resolve, reject) => {
    const tx = db.transaction([META, TEXT], 'readwrite');
    tx.oncomplete = () => resolve();
    tx.onabort = () => reject(tx.error);
    run(tx);
  });
}
function rawRead(db: IDBDatabase, name: string): Promise<Record<string, unknown>> {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(name);
    const request = tx.objectStore(name).get(identity());
    tx.oncomplete = () => resolve(request.result);
    tx.onabort = () => reject(tx.error);
  });
}
function observing(factory: IDBFactory, connected: (db: IDBDatabase) => void): IDBFactory {
  return { open(name: string, version?: number) {
    const request = factory.open(name, version);
    request.addEventListener('success', () => connected(request.result));
    return request;
  } } as IDBFactory;
}
function transactions(db: IDBDatabase, hook: (tx: IDBTransaction) => void): void {
  const original = db.transaction.bind(db);
  db.transaction = ((...args: Parameters<IDBDatabase['transaction']>) => {
    const tx = original(...args); hook(tx); return tx;
  }) as IDBDatabase['transaction'];
}
function stores(tx: IDBTransaction, hook: (store: IDBObjectStore) => void): void {
  const original = tx.objectStore.bind(tx);
  tx.objectStore = (name) => { const store = original(name); hook(store); return store; };
}

test('lazy default database/version; split stores and account indexes; recovery database is untouched', async (t) => {
  const factory = new FakeFactory();
  const recovery = await openRaw(factory, 1, (db) => db.createObjectStore('sentinel'), 'linkage-studio-rebuild-recovery');
  t.after(() => recovery.close());
  let opens = 0;
  const cache = create(observing(factory, () => { opens++; }));
  t.after(() => cache.close());
  assert.equal((await factory.databases()).length, 1);
  assert.deepEqual(await cache.list('account'), []);
  assert.equal(opens, 1);
  assert.equal(await read(cache), null);
  assert.equal(await remove(cache), false);
  assert.equal(opens, 1);
  const db = await openRaw(factory);
  t.after(() => db.close());
  assert.equal(db.version, 1);
  assert.deepEqual(Array.from(db.objectStoreNames), [META, TEXT]);
  const tx = db.transaction([META, TEXT]);
  assert.equal(tx.objectStore(META).keyPath, 'key');
  assert.equal(tx.objectStore(TEXT).keyPath, 'key');
  assert.deepEqual(tx.objectStore(META).index('account-updatedAt').keyPath, ['accountId', 'updatedAt']);
  assert.deepEqual(Array.from(recovery.objectStoreNames), ['sentinel']);
});

test('snapshots input and clones full rows; pending retains confirmed ETag; strips non-DTO secrets', async (t) => {
  const factory = new FakeFactory();
  const cache = create(factory);
  t.after(() => cache.close());
  const expected = row({ pending: { text: 'unsent', projectName: 'Pending model' }, remoteDeleted: true });
  const input = structuredClone(expected);
  Object.assign(input, { accessToken: 'DO-NOT-STORE' });
  Object.assign(input.item, { downloadUrl: 'DO-NOT-STORE' });
  Object.assign(input.pending!, { refreshToken: 'DO-NOT-STORE' });
  const writing = cache.write(input);
  input.item.eTag = 'caller-mutated';
  input.pending!.text = 'caller-mutated';
  assert.equal(await writing, true);
  assert.deepEqual(await read(cache), expected);
  const value = (await read(cache))!;
  value.item.name = 'mutated output'; value.pending!.projectName = 'mutated';
  assert.deepEqual(await read(cache), expected);
  const metadata = (await cache.list('account'))[0];
  assert.deepEqual(metadata, { accountId: 'account', item: expected.item, updatedAt: 100, revision: 1, hasPending: true, remoteDeleted: true });
  assert.equal('text' in metadata, false);
  assert.equal('pending' in metadata, false);
  metadata.item.eTag = 'mutated metadata';
  assert.equal((await read(cache))!.item.eTag, '"base"');
  const db = await openRaw(factory); t.after(() => db.close());
  const meta = await rawRead(db, META);
  const body = await rawRead(db, TEXT);
  assert.equal('text' in meta, false); assert.equal('pending' in meta, false);
  assert.equal(JSON.stringify([meta, body]).includes('DO-NOT-STORE'), false);
  assert.equal((body.pending as { text: string }).text, 'unsent');
});

test('identity is the exact account/drive/item JSON tuple, never filename or delimiter concatenation', async (t) => {
  const cache = create(new FakeFactory()); t.after(() => cache.close());
  const tuples = [['account', 'drive', 'item'], ['other', 'drive', 'item'], ['account', 'other', 'item'], ['account', 'drive', 'other'], ['a,b', 'c', 'd'], ['a', 'b,c', 'd']];
  for (const [accountId, driveId, id] of tuples) {
    await cache.write(row({ accountId, item: { ...row().item, driveId, id }, text: JSON.stringify([accountId, driveId, id]) }));
  }
  for (const [account, drive, id] of tuples) assert.equal((await cache.read(account, drive, id))!.text, JSON.stringify([account, drive, id]));
  assert.equal((await cache.list('account')).length, 3);
  assert.equal((await cache.list('other')).length, 1);
  assert.deepEqual(await cache.list('absent'), []);
  assert.equal(await cache.read('absent', 'drive', 'item'), null);
  assert.equal(await cache.remove('absent', 'drive', 'item', 1), false);
  assert.equal(await remove(cache), true);
  assert.notEqual(await cache.read('other', 'drive', 'item'), null);
});

test('strictly newer revisions win across connections; stale/equal writes and conditional removals preserve journal', async (t) => {
  const factory = new FakeFactory(); const a = create(factory); const b = create(factory);
  t.after(() => { a.close(); b.close(); });
  await a.write(row({ revision: 3, pending: { text: 'journal', projectName: 'Local' } }));
  assert.equal(await b.write(row({ revision: 3, updatedAt: 999 })), false);
  assert.equal(await b.write(row({ revision: 2, updatedAt: 999 })), false);
  assert.equal(await remove(b, 2), false);
  assert.equal(await remove(b, 4), false);
  assert.equal((await read(a))!.pending!.text, 'journal');
  await Promise.all([a.write(row({ revision: 6, updatedAt: 0 })), b.write(row({ revision: 5, updatedAt: 9999 }))]);
  assert.equal((await read(a))!.revision, 6);
  const [written, removed] = await Promise.all([b.write(row({ revision: 7, pending: { text: 'newest', projectName: 'New' } })), remove(a, 6)]);
  assert.equal(written, true); assert.equal(removed, false);
  assert.equal((await read(a))!.revision, 7);
  assert.equal(await remove(a, 7), true);
  assert.equal(await read(b), null);
});

test('concurrent read snapshots never mix confirmed/pending/metadata revisions', async (t) => {
  const factory = new FakeFactory(); const writer = create(factory); const reader = create(factory);
  t.after(() => { writer.close(); reader.close(); });
  await writer.write(row({ text: '1', pending: { text: '1', projectName: '1' } }));
  const work: Promise<unknown>[] = [];
  for (let revision = 2; revision <= 24; revision++) {
    work.push(writer.write(row({ revision, updatedAt: revision, text: String(revision), pending: { text: String(revision), projectName: String(revision) } })));
    work.push(read(reader).then((value) => {
      assert.ok(value); assert.equal(value.text, String(value.revision));
      assert.equal(value.pending!.text, String(value.revision)); assert.equal(value.pending!.projectName, String(value.revision));
    }));
  }
  await Promise.all(work);
});

test('list defaults to 100, newest first, account-filtered bounded metadata cursor without payload transactions', async (t) => {
  const factory = new FakeFactory(); let watching = false; let visits = 0;
  const cache = create(observing(factory, (db) => transactions(db, (tx) => {
    if (!watching) return;
    assert.deepEqual(Array.from(tx.objectStoreNames), [META]);
    stores(tx, (store) => {
      const index = store.index.bind(store);
      store.index = (name) => {
        const result = index(name);
        if (name === 'account-updatedAt') {
          const open = result.openCursor.bind(result);
          result.openCursor = (...args) => {
            assert.ok(args[0]); assert.equal(args[1], 'prev');
            const request = open(...args);
            request.addEventListener('success', () => { if (request.result) visits++; });
            return request;
          };
        }
        return result;
      };
    });
  })));
  t.after(() => cache.close());
  for (let i = 0; i < 103; i++) await cache.write(row({ item: { ...row().item, id: String(i) }, updatedAt: i }));
  await cache.write(row({ accountId: 'other', updatedAt: 99999 }));
  watching = true;
  const listed = await cache.list('account');
  assert.equal(listed.length, 100); assert.equal(visits, 100);
  assert.deepEqual(listed.map((value) => value.updatedAt), Array.from({ length: 100 }, (_, i) => 102 - i));
  visits = 0;
  assert.equal((await cache.list('account', 1))[0].updatedAt, 102); assert.equal(visits, 1);
});

test('invalid DTOs/options reject before any database open, including finite out-of-Date-range timestamps', async () => {
  let opens = 0; const cache = create({ open() { opens++; throw new Error('unexpected open'); } } as unknown as IDBFactory);
  const bad: unknown[] = [null, {}, row({ accountId: '' }), row({ accountId: 'x'.repeat(1025) }), row({ accountId: 'x\n' }), row({ text: 2 as unknown as string }), row({ text: 'x'.repeat(MAX_DOCUMENT_CHARACTERS + 1) }), row({ updatedAt: NaN }), row({ updatedAt: Infinity }), row({ updatedAt: -1 }), row({ updatedAt: 8_640_000_000_000_001 }), row({ revision: 0 }), row({ revision: 1.1 }), row({ revision: Number.MAX_SAFE_INTEGER + 1 }), row({ remoteDeleted: 1 as unknown as boolean }), row({ pending: null as unknown as CloudCacheRow['pending'] }), row({ pending: { text: 'ok', projectName: '' } }), row({ pending: { text: 'ok', projectName: 'x'.repeat(257) } }), row({ pending: { text: 'x'.repeat(MAX_DOCUMENT_CHARACTERS + 1), projectName: 'ok' } })];
  for (const field of ['driveId', 'id', 'name', 'eTag', 'lastModifiedDateTime'] as const) bad.push(row({ item: { ...row().item, [field]: '' } }));
  for (const changes of [{ eTag: 'x'.repeat(2049) }, { driveId: 'x'.repeat(1025) }, { id: '\u0000' }, { name: 'x'.repeat(257) }, { lastModifiedDateTime: 'nonsense' }, { size: -1 }, { size: Infinity }, { size: 0.5 }]) bad.push(row({ item: { ...row().item, ...changes } }));
  for (const value of bad) await assert.rejects(cache.write(value as CloudCacheRow), TypeError);
  for (const limit of [0, -1, 101, 0.5, NaN, Infinity]) await assert.rejects(cache.list('account', limit), TypeError);
  await assert.rejects(cache.list(''), TypeError);
  await assert.rejects(cache.read('account', '', 'item'), TypeError);
  await assert.rejects(remove(cache, 0), TypeError);
  for (const openTimeoutMs of [0, -1, 0.5, NaN, Infinity, 2_147_483_648]) assert.throws(() => create(new FakeFactory(), openTimeoutMs), TypeError);
  assert.equal(opens, 0); cache.close();
});

test('exact text/date/revision bounds and empty opaque payloads round-trip', async (t) => {
  const cache = create(new FakeFactory()); t.after(() => cache.close());
  const expected = row({ updatedAt: 8_640_000_000_000_000, revision: Number.MAX_SAFE_INTEGER, text: 'x'.repeat(MAX_DOCUMENT_CHARACTERS), pending: { text: '', projectName: 'X' }, remoteDeleted: false });
  assert.equal(await cache.write(expected), true);
  assert.deepEqual(await read(cache), expected);
  assert.doesNotThrow(() => new Date((expected.updatedAt)).toISOString());
  assert.equal((await cache.list('account'))[0].remoteDeleted, false);
});

test('incomplete/corrupt record pairs reject read/write/remove without deleting or healing data', async (t) => {
  const cases: [string, (meta: Record<string, unknown>, body: Record<string, unknown>, tx: IDBTransaction) => void][] = [
    ['missing text', (_m, _b, tx) => { tx.objectStore(TEXT).delete(identity()); }],
    ['missing metadata', (_m, _b, tx) => { tx.objectStore(META).delete(identity()); }],
    ['mismatched revision', (_m, b, tx) => { tx.objectStore(TEXT).put({ ...b, revision: 99 }); }],
    ['invalid text', (_m, b, tx) => { tx.objectStore(TEXT).put({ ...b, text: 123 }); }],
    ['missing pending', (m, _b, tx) => { tx.objectStore(META).put({ ...m, hasPending: true }); }],
    ['invalid pending', (m, b, tx) => { tx.objectStore(META).put({ ...m, hasPending: true }); tx.objectStore(TEXT).put({ ...b, pending: { text: 'ok' } }); }],
    ['foreign identity', (m, _b, tx) => { tx.objectStore(META).put({ ...m, accountId: 'other' }); }],
    ['invalid eTag', (m, _b, tx) => { tx.objectStore(META).put({ ...m, item: { ...row().item, eTag: '' } }); }],
    ['invalid date range', (m, _b, tx) => { tx.objectStore(META).put({ ...m, updatedAt: 1e100 }); }],
    ['unknown stored secret', (_m, b, tx) => { tx.objectStore(TEXT).put({ ...b, token: 'secret' }); }],
  ];
  for (const [name, damage] of cases) await t.test(name, async () => {
    const factory = new FakeFactory(); const cache = create(factory);
    const db = await openRawAfterWrite();
    async function openRawAfterWrite() { await cache.write(row()); return openRaw(factory); }
    try {
      const meta = await rawRead(db, META); const body = await rawRead(db, TEXT);
      await mutate(db, (tx) => damage(meta, body, tx));
      const before = [await rawRead(db, META), await rawRead(db, TEXT)];
      for (const operation of [() => read(cache), () => cache.write(row({ revision: 100 })), () => remove(cache)]) await assert.rejects(operation(), { name: 'CloudCacheCorruptionError' });
      assert.deepEqual([await rawRead(db, META), await rawRead(db, TEXT)], before);
    } finally { cache.close(); db.close(); }
  });
});

test('metadata list detects missing/unindexable timestamps but does not inspect text payloads', async (t) => {
  for (const updatedAt of [undefined, NaN, 1e100, -1]) await t.test(String(updatedAt), async () => {
    const factory = new FakeFactory(); const cache = create(factory);
    try {
      await cache.write(row()); const db = await openRaw(factory);
      try { const meta = await rawRead(db, META); await mutate(db, (tx) => { tx.objectStore(META).put({ ...meta, updatedAt }); }); }
      finally { db.close(); }
      await assert.rejects(cache.list('account'), { name: 'CloudCacheCorruptionError' });
    } finally { cache.close(); }
  });
  const factory = new FakeFactory(); const cache = create(factory); t.after(() => cache.close());
  await cache.write(row()); const db = await openRaw(factory); t.after(() => db.close());
  await mutate(db, (tx) => { tx.objectStore(TEXT).delete(identity()); });
  assert.equal((await cache.list('account')).length, 1);
  await assert.rejects(read(cache), { name: 'CloudCacheCorruptionError' });
});

test('existing malformed/future schemas reject without reset or deletion', async (t) => {
  for (const kind of ['empty', 'wrong-key', 'missing-index', 'wrong-index', 'future']) await t.test(kind, async () => {
    const factory = new FakeFactory();
    const db = await openRaw(factory, kind === 'future' ? 2 : 1, (database) => {
      if (kind === 'empty') return;
      const meta = database.createObjectStore(META, { keyPath: kind === 'wrong-key' ? 'id' : 'key' });
      database.createObjectStore(TEXT, { keyPath: 'key' });
      meta.createIndex('accountId', 'accountId');
      if (kind !== 'missing-index') meta.createIndex('account-updatedAt', kind === 'wrong-index' ? 'updatedAt' : ['accountId', 'updatedAt']);
    });
    const names = Array.from(db.objectStoreNames); db.close();
    const cache = create(factory);
    try { await assert.rejects(cache.list('account'), { name: kind === 'future' ? 'VersionError' : 'CloudCacheCorruptionError' }); }
    finally { cache.close(); }
    const reopened = await openRaw(factory, kind === 'future' ? 2 : 1);
    assert.deepEqual(Array.from(reopened.objectStoreNames), names); reopened.close();
  });
});

test('quota/security injection on second store rolls back both records; never evicts', async (t) => {
  for (const name of ['QuotaExceededError', 'SecurityError']) await t.test(name, async () => {
    const factory = new FakeFactory(); let failing = false; const failure = new DOMException('injected', name);
    const cache = create(observing(factory, (db) => transactions(db, (tx) => {
      if (tx.mode === 'readwrite') stores(tx, (store) => { if (store.name === TEXT && failing) store.put = () => { throw failure; }; });
    })));
    try {
      await cache.write(row()); failing = true;
      await assert.rejects(cache.write(row({ revision: 2, pending: { text: 'new', projectName: 'new' } })), (reason) => reason === failure);
      assert.deepEqual(await read(cache), row());
      assert.equal((await cache.list('account')).length, 1);
    } finally { cache.close(); }
  });
});

test('abort after successful write/delete requests rejects and restores the previous pair', async (t) => {
  for (const operation of ['write', 'delete'] as const) await t.test(operation, async () => {
    const factory = new FakeFactory(); let failing = false;
    const cache = create(observing(factory, (db) => transactions(db, (tx) => {
      if (tx.mode !== 'readwrite') return;
      stores(tx, (store) => {
        if (store.name !== TEXT) return;
        const method = operation === 'write' ? 'put' : 'delete';
        const original = store[method].bind(store) as (...args: unknown[]) => IDBRequest;
        Object.assign(store, { [method]: (...args: unknown[]) => {
          const request = original(...args);
          request.addEventListener('success', () => { if (failing) tx.abort(); }); return request;
        } });
      });
    })));
    try {
      await cache.write(row()); failing = true;
      await assert.rejects(operation === 'write' ? cache.write(row({ revision: 2 })) : remove(cache), { name: 'AbortError' });
      assert.deepEqual(await read(cache), row());
    } finally { cache.close(); }
  });
});

test('native asynchronous request errors propagate on transaction abort', async (t) => {
  const factory = new FakeFactory(); let failing = false;
  const cache = create(observing(factory, (db) => transactions(db, (tx) => {
    if (tx.mode === 'readwrite') stores(tx, (store) => {
      if (store.name === TEXT && failing) store.put = store.add.bind(store);
    });
  })));
  t.after(() => cache.close());
  await cache.write(row()); failing = true;
  await assert.rejects(cache.write(row({ revision: 2 })), { name: 'ConstraintError' });
  assert.deepEqual(await read(cache), row());
});

test('close aborts an active journal write before commit and forbids new operations', async () => {
  const factory = new FakeFactory(); let dispose = false;
  const cache = create(observing(factory, (db) => transactions(db, (tx) => {
    if (tx.mode === 'readwrite') stores(tx, (store) => {
      if (store.name !== TEXT) return;
      const put = store.put.bind(store);
      store.put = (...args) => { const request = put(...args); request.addEventListener('success', () => { if (dispose) cache.close(); }); return request; };
    });
  })));
  await cache.write(row()); dispose = true;
  await assert.rejects(cache.write(row({ revision: 2 })), { name: 'AbortError' });
  await assert.rejects(cache.list('account'), { name: 'CloudCacheClosedError' });
  const other = create(factory);
  try { assert.deepEqual(await read(other), row()); } finally { other.close(); }
});

test('versionchange closes its connection, and unexpected close permits safe reopen', { timeout: 3000 }, async () => {
  const factory = new FakeFactory(); let connection: IDBDatabase | undefined;
  const cache = create(observing(factory, (db) => { connection = db; }));
  try {
    await cache.write(row()); forceCloseDatabase(connection!);
    await new Promise((resolve) => setImmediate(resolve));
    assert.deepEqual(await read(cache), row());
    const upgraded = await openRaw(factory, 2);
    try { await assert.rejects(cache.list('account'), { name: 'VersionError' }); }
    finally { upgraded.close(); }
  } finally { cache.close(); }
});

function controlled() {
  const request = { onerror: null, onblocked: null, onupgradeneeded: null, onsuccess: null } as unknown as IDBOpenDBRequest;
  let opens = 0;
  return { request, factory: { open() { opens++; return request; } } as unknown as IDBFactory, opens: () => opens };
}
function send(request: IDBOpenDBRequest, name: 'success' | 'error' | 'blocked' | 'upgradeneeded', properties: Record<string, unknown> = {}) {
  Object.assign(request, properties);
  (request[`on${name}`] as ((event: unknown) => void) | null)?.call(request, { oldVersion: 0 });
}
test('timeout/blocked/dispose reject pending opens; late success closes and late upgrade aborts', async (t) => {
  for (const kind of ['timeout', 'blocked', 'dispose']) await t.test(kind, { timeout: 3000 }, async () => {
    const control = controlled(); const cache = create(control.factory, kind === 'timeout' ? 10 : 1000);
    const listing = cache.list('account'); const reading = read(cache);
    assert.equal(control.opens(), 1);
    if (kind === 'blocked') send(control.request, 'blocked');
    if (kind === 'dispose') cache.close();
    const expected = kind === 'timeout' ? 'TimeoutError' : kind === 'blocked' ? 'CloudCacheBlockedError' : 'CloudCacheClosedError';
    await Promise.all([assert.rejects(listing, { name: expected }), assert.rejects(reading, { name: expected })]);
    let aborted = 0; let closed = 0;
    send(control.request, 'upgradeneeded', { transaction: { abort() { aborted++; } } });
    send(control.request, 'success', { result: { close() { closed++; } } });
    assert.equal(aborted, 1); assert.equal(closed, 1); cache.close();
  });
});

test('close before open is idempotent; all subsequent operations reject without opening', async () => {
  const control = controlled(); const cache = create(control.factory); cache.close(); cache.close();
  for (const operation of [() => cache.list('account'), () => read(cache), () => cache.write(row()), () => remove(cache)]) await assert.rejects(operation(), { name: 'CloudCacheClosedError' });
  assert.equal(control.opens(), 0);
});

test('native open errors propagate; a failed open retries; missing/denied global IDB rejects', async () => {
  const failure = new DOMException('injected', 'SecurityError');
  const control = controlled(); const cache = create(control.factory);
  const listing = cache.list('account'); send(control.request, 'error', { error: failure });
  await assert.rejects(listing, (reason) => reason === failure); cache.close();
  const factory = new FakeFactory(); let first = true;
  const retry = create({ open(name: string, version: number) { if (first) { first = false; throw failure; } return factory.open(name, version); } } as IDBFactory);
  try { await assert.rejects(retry.list('account'), (reason) => reason === failure); assert.deepEqual(await retry.list('account'), []); }
  finally { retry.close(); }
  const previous = Object.getOwnPropertyDescriptor(globalThis, 'indexedDB');
  try {
    Object.defineProperty(globalThis, 'indexedDB', { configurable: true, value: undefined });
    const missing = createCloudCache();
    try { await assert.rejects(read(missing), { name: 'NotSupportedError' }); } finally { missing.close(); }
    Object.defineProperty(globalThis, 'indexedDB', { configurable: true, get() { throw failure; } });
    const denied = createCloudCache();
    try { await assert.rejects(read(denied), (reason) => reason === failure); } finally { denied.close(); }
  } finally { if (previous) Object.defineProperty(globalThis, 'indexedDB', previous); else Reflect.deleteProperty(globalThis, 'indexedDB'); }
});

test('zero-argument production factory uses global IndexedDB and key ranges', async () => {
  const descriptors = ['indexedDB', 'IDBKeyRange'].map((name) => [name, Object.getOwnPropertyDescriptor(globalThis, name)] as const);
  const factory = new FakeFactory();
  try {
    Object.defineProperty(globalThis, 'indexedDB', { configurable: true, value: factory });
    Object.defineProperty(globalThis, 'IDBKeyRange', { configurable: true, value: Range });
    const cache = createCloudCache();
    try {
      assert.equal(await cache.write(row()), true);
      assert.equal((await cache.list('account')).length, 1);
      assert.deepEqual(await read(cache), row());
    } finally { cache.close(); }
  } finally {
    for (const [name, descriptor] of descriptors) {
      if (descriptor) Object.defineProperty(globalThis, name, descriptor);
      else Reflect.deleteProperty(globalThis, name);
    }
  }
});

test('late first open cannot replace or close a successful retry connection', { timeout: 3000 }, async () => {
  const late = controlled(); const factory = new FakeFactory(); let first = true;
  const cache = create({ open(name: string, version: number) {
    if (first) { first = false; return late.factory.open(name, version); }
    return factory.open(name, version);
  } } as IDBFactory, 10);
  try {
    await assert.rejects(read(cache), { name: 'TimeoutError' });
    assert.equal(await cache.write(row()), true);
    let closes = 0;
    send(late.request, 'success', { result: { close() { closes++; } } });
    assert.equal(closes, 1);
    assert.deepEqual(await read(cache), row());
  } finally { cache.close(); }
});

test('quota failure creating a new row leaves no orphan metadata and preserves unrelated rows', async (t) => {
  const factory = new FakeFactory(); let failing = false;
  const cache = create(observing(factory, (db) => transactions(db, (tx) => {
    if (tx.mode === 'readwrite') stores(tx, (store) => {
      if (store.name === TEXT && failing) store.put = () => { throw new DOMException('injected', 'QuotaExceededError'); };
    });
  })));
  t.after(() => cache.close());
  await cache.write(row()); failing = true;
  await assert.rejects(cache.write(row({ item: { ...row().item, id: 'new-item' } })), { name: 'QuotaExceededError' });
  assert.equal(await cache.read('account', 'drive', 'new-item'), null);
  assert.equal((await cache.list('account')).length, 1);
  assert.deepEqual(await read(cache), row());
});

test('timestamp ties have stable reverse-primary-key order and explicit limits never evict', async (t) => {
  const cache = create(new FakeFactory()); t.after(() => cache.close());
  for (const id of ['a', 'c', 'b']) await cache.write(row({ item: { ...row().item, id } }));
  assert.deepEqual((await cache.list('account', 2)).map((value) => value.item.id), ['c', 'b']);
  assert.deepEqual((await cache.list('account')).map((value) => value.item.id), ['c', 'b', 'a']);
});
