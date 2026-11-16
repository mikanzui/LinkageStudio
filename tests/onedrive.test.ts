import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createOneDriveClient } from '../src/cloud/onedrive';
import { CloudError, type CloudErrorCode, type CloudItem } from '../src/cloud/types';

const origin = 'https://graph.microsoft.com/v1.0';
const folderPath = origin + '/me/drive/root:/Documents/LinkageStudio';
const childrenPath = origin + '/drives/drive-1/items/folder-1/children';
const metadataPath = origin + '/drives/drive-1/items/file-1';
const firstMetadataPath = metadataPath;
const source: CloudItem = {
  driveId: 'drive-1', id: 'file-1', name: 'Mechanism.slinker', eTag: '"base,1"',
  lastModifiedDateTime: '2026-11-16T07:00:00Z', size: 3,
};

function remote(changes: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id: source.id, name: source.name, eTag: source.eTag, lastModifiedDateTime: source.lastModifiedDateTime,
    size: source.size, parentReference: { driveId: source.driveId }, file: {}, ...changes,
  };
}

function folder(changes: Record<string, unknown> = {}): Record<string, unknown> {
  const result = remote({ id: 'folder-1', name: 'LinkageStudio', folder: {}, ...changes });
  delete result.file;
  return result;
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
}

type Call = { url: string; init: RequestInit };
type Step = Response | Error | ((call: Call) => Response | Promise<Response>);

function harness(steps: Step[]) {
  const calls: Call[] = [];
  let tokens = 0;
  const fetch: typeof globalThis.fetch = async (input, init) => {
    const call = { url: String(input), init: init ?? {} };
    calls.push(call);
    const step = steps.shift();
    assert.ok(step, `Unexpected request ${call.url}`);
    if (step instanceof Error) throw step;
    return typeof step === 'function' ? step(call) : step;
  };
  const options = { accountId: 'account-1', token: async () => { tokens++; return 'secret-token'; }, fetch };
  return {
    client: createOneDriveClient(options), options, calls,
    tokens: () => tokens,
    done: () => assert.equal(steps.length, 0, 'All expected mock responses must be consumed'),
  };
}

async function rejects(operation: Promise<unknown>, code: CloudErrorCode, status?: number): Promise<CloudError> {
  let caught: unknown;
  try { await operation; } catch (error) { caught = error; }
  assert.ok(caught instanceof CloudError);
  assert.equal(caught.code, code);
  assert.equal(caught.status, status);
  for (const secret of ['secret-token', 'download-secret', 'provider-secret']) {
    assert.ok(!`${caught.message}${caught.stack}${JSON.stringify(caught)}`.includes(secret));
  }
  return caught;
}

function assertGraph(call: Call, method: string, path: string, etag?: string): void {
  assert.equal(call.url, path);
  assert.equal(call.init.method ?? 'GET', method);
  assert.equal(new Headers(call.init.headers).get('Authorization'), 'Bearer secret-token');
  assert.equal(new Headers(call.init.headers).get('If-Match'), etag ?? null);
  assert.equal(call.init.credentials, 'omit');
  assert.equal(call.init.redirect, 'error');
  assert.equal(call.init.cache, 'no-store');
  assert.ok(call.init.signal instanceof AbortSignal);
}

test('listing reads the existing folder and follows only the expected Graph children path', async () => {
  const h = harness([
    json(folder()),
    json({ value: [remote(), remote({ name: 'notes.txt' }), folder({ name: 'nested.slinker' })], '@odata.nextLink': childrenPath + '?$skiptoken=page2' }),
    json({ value: [remote({ id: 'file-2', name: 'Upper.SLINKER' })] }),
  ]);
  const result = await h.client.list();
  assert.deepEqual(result, [source, { ...source, id: 'file-2', name: 'Upper.SLINKER' }]);
  assert.equal(h.tokens(), 3);
  assertGraph(h.calls[0]!, 'GET', folderPath);
  assertGraph(h.calls[1]!, 'GET', childrenPath + '?$top=100');
  assertGraph(h.calls[2]!, 'GET', childrenPath + '?$skiptoken=page2');
  assert.ok(h.calls.every(call => (call.init.method ?? 'GET') === 'GET'));
  h.done();
});

test('listing an absent folder returns empty without creating anything', async () => {
  const h = harness([json({ error: 'provider-secret' }, 404)]);
  assert.deepEqual(await h.client.list(), []);
  assert.equal(h.calls.length, 1);
  h.done();
});

for (const [status, code] of [[401, 'auth'], [403, 'auth'], [409, 'conflict'], [412, 'conflict'], [507, 'quota'], [429, 'transient'], [503, 'transient'], [400, 'invalid'], [418, 'unknown']] as const) {
  test(`folder lookup ${status} is sanitized ${code}, never an implicit folder create`, async () => {
    for (const operation of ['create', 'list'] as const) {
      const h = harness([json({ error: { message: 'provider-secret secret-token download-secret' } }, status)]);
      await rejects(operation === 'list' ? h.client.list() : h.client.create('New', 'abc'), code, status);
      assert.equal(h.calls.length, 1);
      h.done();
    }
  });
}

for (const link of [
  'https://evil.example/v1.0/drives/drive-1/items/folder-1/children',
  'https://graph.microsoft.com.evil.example/v1.0/drives/drive-1/items/folder-1/children',
  'http://graph.microsoft.com/v1.0/drives/drive-1/items/folder-1/children',
  'https://graph.microsoft.com:444/v1.0/drives/drive-1/items/folder-1/children',
  'https://secret-token@graph.microsoft.com/v1.0/drives/drive-1/items/folder-1/children',
  origin + '/drives/other/items/folder-1/children',
  origin + '/drives/drive-1/items/other/children',
  origin + '/me',
  childrenPath.replace('/v1.0/', '/beta/'),
  childrenPath + '#secret',
  childrenPath + '?$expand=children',
  childrenPath + '?$skiptoken=a&$skiptoken=b',
  childrenPath + '?$top=1&$TOP=2',
  '/v1.0/drives/drive-1/items/folder-1/children',
  childrenPath + '\\evil',
  childrenPath + '?$skiptoken=' + 'x'.repeat(8_200),
]) {
  test(`hostile nextLink rejected before another token: ${link.slice(0, 90)}`, async () => {
    const h = harness([json(folder()), json({ value: [], '@odata.nextLink': link })]);
    await rejects(h.client.list(), 'invalid');
    assert.equal(h.tokens(), 2);
    assert.equal(h.calls.length, 2);
    h.done();
  });
}

test('cyclic nextLink is refused without a third page request', async () => {
  const next = childrenPath + '?$skiptoken=loop';
  const h = harness([json(folder()), json({ value: [], '@odata.nextLink': next }), json({ value: [], '@odata.nextLink': next })]);
  await rejects(h.client.list(), 'invalid');
  assert.equal(h.tokens(), 3);
  h.done();
});

test('listing stops at fifty pages even when every page has a fresh token', async () => {
  const pages = Array.from({ length: 50 }, (_, i) => json({ value: [], '@odata.nextLink': childrenPath + '?$skiptoken=' + i }));
  const h = harness([json(folder()), ...pages]);
  await rejects(h.client.list(), 'invalid');
  assert.equal(h.tokens(), 51);
  h.done();
});

test('listing counts every entry, not just matching projects, toward the 5000-entry bound', async () => {
  const h = harness([json(folder()), json({ value: Array.from({ length: 5_001 }, () => ({ name: 'notes.txt' })) })]);
  await rejects(h.client.list(), 'invalid');
  h.done();
});

for (const bad of [
  {}, { value: {} }, { value: [null] }, { value: [{ name: 2 }] },
  { value: [], '@odata.nextLink': null }, { value: [], '@odata.nextLink': 3 },
  { value: [remote({ id: '../escape' })] },
  { value: [remote({ id: 'https://evil.example' })] },
  { value: [remote({ parentReference: { driveId: 'other' } })] },
  { value: [remote(), remote()] },
  { value: [remote({ eTag: '' })] },
  { value: [remote({ eTag: 'tag\r\nsecret-token' })] },
  { value: [remote({ size: -1 })] },
  { value: [remote({ size: 0.5 })] },
  { value: [remote({ lastModifiedDateTime: 'not-a-date' })] },
  { value: [remote({ remoteItem: {} })] },
  { value: [remote({ deleted: {} })] },
  { value: [remote({ file: null })] },
]) {
  test(`malformed listing fails atomically: ${JSON.stringify(bad).slice(0, 100)}`, async () => {
    const h = harness([json(folder()), json(bad)]);
    await rejects(h.client.list(), 'invalid');
    h.done();
  });
}

test('explicit create uses folder identity, encoded filename, and conflictBehavior=fail', async () => {
  const h = harness([json(folder()), json(remote({ id: 'new-file', name: 'A # 50%.slinker' }), 201)]);
  const created = await h.client.create('A # 50%', 'abc');
  assert.equal(created.id, 'new-file');
  assertGraph(h.calls[1]!, 'PUT', origin + '/drives/drive-1/items/folder-1:/A%20%23%2050%25.slinker:/content?@microsoft.graph.conflictBehavior=fail');
  assert.equal(h.calls[1]!.init.body, 'abc');
  h.done();
});

test('only 404 allows creation of Documents and LinkageStudio, both conflict-fail', async () => {
  const h = harness([
    json({}, 404), json({}, 404),
    json(folder({ id: 'documents', name: 'Documents' }), 201), json(folder(), 201),
    json(remote({ id: 'new-file', name: 'New.slinker' }), 201),
  ]);
  await h.client.create('New', 'abc');
  assertGraph(h.calls[1]!, 'GET', origin + '/me/drive/root:/Documents');
  assertGraph(h.calls[2]!, 'POST', origin + '/me/drive/root/children');
  assertGraph(h.calls[3]!, 'POST', origin + '/drives/drive-1/items/documents/children');
  for (const call of [h.calls[2]!, h.calls[3]!]) {
    assert.deepEqual(JSON.parse(String(call.init.body)), {
      name: call === h.calls[2] ? 'Documents' : 'LinkageStudio', folder: {}, '@microsoft.graph.conflictBehavior': 'fail',
    });
  }
  h.done();
});

test('an existing Documents folder is reused after the project folder returns 404', async () => {
  const h = harness([json({}, 404), json(folder({ id: 'documents', name: 'Documents' })), json(folder(), 201), json(remote({ name: 'New.slinker' }), 201)]);
  await h.client.create('New', 'abc');
  assertGraph(h.calls[2]!, 'POST', origin + '/drives/drive-1/items/documents/children');
  h.done();
});

test('403 at Documents lookup does not create either folder', async () => {
  const h = harness([json({}, 404), json({}, 403)]);
  await rejects(h.client.create('New', 'abc'), 'auth', 403);
  assert.ok(h.calls.every(call => (call.init.method ?? 'GET') === 'GET'));
  h.done();
});

test('racing folder creation conflict does not retry or proceed to upload', async () => {
  const h = harness([json({}, 404), json(folder({ id: 'documents', name: 'Documents' })), json({}, 409)]);
  await rejects(h.client.create('New', 'abc'), 'conflict', 409);
  assert.equal(h.calls.length, 3);
  h.done();
});

for (const method of ['save', 'rename', 'remove'] as const) {
  test(`${method} captures immutable identity and original If-Match before token await`, async () => {
    const mutable = { ...source };
    const snapshot = { ...mutable };
    let release!: (token: string) => void;
    const pending = new Promise<string>(resolve => { release = resolve; });
    const h = harness([method === 'remove' ? new Response(null, { status: 204 }) : json(remote({ eTag: '"next,2"', name: method === 'rename' ? 'Renamed.slinker' : source.name }))]);
    const client = createOneDriveClient({ ...h.options, token: () => pending });
    const operation = method === 'save' ? client.save(mutable, 'abc') : method === 'rename' ? client.rename(mutable, 'Renamed') : client.remove(mutable);
    mutable.id = 'replaced'; mutable.driveId = 'other'; mutable.eTag = '"newer"'; mutable.name = 'Replaced.slinker';
    release('secret-token');
    await operation;
    const path = method === 'save' ? metadataPath + '/content' : method === 'rename' ? metadataPath + '?@microsoft.graph.conflictBehavior=fail' : metadataPath;
    assertGraph(h.calls[0]!, method === 'save' ? 'PUT' : method === 'rename' ? 'PATCH' : 'DELETE', path, snapshot.eTag);
    if (method === 'rename') assert.deepEqual(JSON.parse(String(h.calls[0]!.init.body)), { name: 'Renamed.slinker' });
    assert.deepEqual(mutable, { ...snapshot, id: 'replaced', driveId: 'other', eTag: '"newer"', name: 'Replaced.slinker' });
    h.done();
  });

  for (const [status, code] of [[409, 'conflict'], [412, 'conflict'], [404, 'missing'], [401, 'auth'], [403, 'auth'], [507, 'quota']] as const) {
    test(`${method} ${status} propagates ${code}, never refreshes or retries`, async () => {
      const h = harness([json({ error: 'provider-secret' }, status)]);
      const frozen = Object.freeze({ ...source });
      await rejects(method === 'save' ? h.client.save(frozen, 'abc') : method === 'rename' ? h.client.rename(frozen, 'New') : h.client.remove(frozen), code, status);
      assert.deepEqual(frozen, source);
      assert.equal(h.calls.length, 1);
      h.done();
    });
  }
}

for (const method of ['create', 'save', 'rename', 'remove'] as const) {
  test(`${method} lost response never resolves success and never retries the write`, async () => {
    const steps: Step[] = method === 'create' ? [json(folder()), new TypeError('provider-secret secret-token')] : [new TypeError('provider-secret secret-token')];
    const h = harness(steps);
    const promise = method === 'create' ? h.client.create('New', 'abc') : method === 'save' ? h.client.save(source, 'abc') : method === 'rename' ? h.client.rename(source, 'New') : h.client.remove(source);
    await rejects(promise, 'offline');
    assert.equal(h.calls.filter(call => ['PUT', 'PATCH', 'DELETE'].includes(call.init.method ?? '')).length, 1);
    h.done();
  });
}

test('create conflict cannot overwrite or silently rename the existing document', async () => {
  const h = harness([json(folder()), json({}, 409)]);
  await rejects(h.client.create('Existing', 'abc'), 'conflict', 409);
  assert.equal(h.calls.length, 2);
  assert.equal(new URL(h.calls[1]!.url).searchParams.get('@microsoft.graph.conflictBehavior'), 'fail');
  h.done();
});

test('load uses full metadata, no bearer or cookies on download, and rechecks ETag', async () => {
  const preauthenticated = 'https://files.example/project?download-secret';
  const h = harness([json(remote({ '@microsoft.graph.downloadUrl': preauthenticated })), new Response('abc'), json(remote())]);
  const frozen = Object.freeze({ ...source });
  const result = await h.client.load(frozen);
  assert.deepEqual(result, { item: source, text: 'abc' });
  assertGraph(h.calls[0]!, 'GET', firstMetadataPath);
  assert.equal(h.calls[1]!.url, preauthenticated);
  assert.equal(new Headers(h.calls[1]!.init.headers).get('Authorization'), null);
  assert.equal(new Headers(h.calls[1]!.init.headers).get('Cookie'), null);
  assert.equal(h.calls[1]!.init.credentials, 'omit');
  assert.equal(h.calls[1]!.init.mode, 'cors');
  assert.equal(h.calls[1]!.init.redirect, 'error');
  assertGraph(h.calls[2]!, 'GET', metadataPath);
  assert.equal(h.tokens(), 2);
  assert.ok(!JSON.stringify(result).includes('download-secret'));
  assert.deepEqual(frozen, source);
  result.item.name = 'Changed.slinker';
  assert.equal(frozen.name, 'Mechanism.slinker');
  h.done();
});

test('load works when the business drive omits download annotations from projections', async () => {
  const h = harness([
    call => json(remote(new URL(call.url).searchParams.has('$select') ? {} : { '@microsoft.graph.downloadUrl': 'https://files.example/?download-secret' })),
    new Response('abc'), json(remote()),
  ]);
  assert.equal((await h.client.load(source)).text, 'abc');
  h.done();
});

test('load exposes only a static stage and HTTP status for provider failure', async () => {
  const h = harness([json({ error: { message: 'provider-secret secret-token download-secret' } }, 400)]);
  const error = await rejects(h.client.load(source), 'invalid', 400);
  assert.match(error.message, /\(remote metadata, HTTP 400\)$/);
  h.done();
});

test('load distinguishes missing download address without exposing metadata', async () => {
  const h = harness([json(remote({ extra: 'provider-secret' }))]);
  const error = await rejects(h.client.load(source), 'invalid');
  assert.match(error.message, /\(missing download address\)$/);
  assert.equal(h.calls.length, 1);
  h.done();
});

test('load identifies download failure without exposing the preauthenticated URL', async () => {
  const h = harness([json(remote({ '@microsoft.graph.downloadUrl': 'https://files.example/?download-secret' })), json({ error: 'provider-secret' }, 403)]);
  const error = await rejects(h.client.load(source), 'auth', 403);
  assert.match(error.message, /\(download response, HTTP 403\)$/);
  h.done();
});

test('load refuses a stale captured ETag before downloading', async () => {
  const h = harness([json(remote({ eTag: '"newer"', '@microsoft.graph.downloadUrl': 'https://files.example/?download-secret' }))]);
  await rejects(h.client.load(source), 'conflict');
  assert.equal(h.calls.length, 1);
  h.done();
});

test('load rejects metadata ETag changing during download', async () => {
  const h = harness([json(remote({ '@microsoft.graph.downloadUrl': 'https://files.example/?download-secret' })), new Response('abc'), json(remote({ eTag: '"newer"' }))]);
  await rejects(h.client.load(source), 'conflict');
  assert.equal(h.calls.length, 3);
  h.done();
});

test('load rejects changed metadata size even with an unchanged ETag', async () => {
  const h = harness([json(remote({ '@microsoft.graph.downloadUrl': 'https://files.example/?download-secret' })), new Response('abc'), json(remote({ size: 4 }))]);
  await rejects(h.client.load(source), 'conflict');
  h.done();
});

for (const url of [undefined, 'http://files.example/?download-secret', 'https://user:password@files.example/?download-secret', 'https://localhost/x', 'https://127.0.0.1/x', 'https://[::1]/x', 'https://files.local/x', 'https://foo.localhost/x', 'https://files.example:444/x', 'https://files.example/x#fragment', 'file:///tmp/project', 'data:text/plain,secret', 'https://files.example/\\evil']) {
  test(`load rejects an unsafe preauthenticated URL without contacting it: ${String(url)}`, async () => {
    const h = harness([json(remote({ '@microsoft.graph.downloadUrl': url }))]);
    await rejects(h.client.load(source), 'invalid');
    assert.equal(h.calls.length, 1);
    assert.equal(h.tokens(), 1);
    h.done();
  });
}

for (const changes of [{ id: 'other' }, { parentReference: { driveId: 'other' } }, { eTag: null }, { file: null }]) {
  test(`load rejects malformed or swapped metadata: ${JSON.stringify(changes)}`, async () => {
    const h = harness([json(remote({ ...changes, '@microsoft.graph.downloadUrl': 'https://files.example/?download-secret' }))]);
    await rejects(h.client.load(source), 'invalid');
    h.done();
  });
}

test('load rejects a different identity in the post-download metadata', async () => {
  const h = harness([json(remote({ '@microsoft.graph.downloadUrl': 'https://files.example/?download-secret' })), new Response('abc'), json(remote({ id: 'other' }))]);
  await rejects(h.client.load(source), 'invalid');
  h.done();
});

test('UTF-8 decoding spans chunks, preserves BOM, and does not interpret project schema', async () => {
  const text = '\ufeff{"futureSchema":999,"label":"\u00e9\ud83d\ude00"}';
  const bytes = new TextEncoder().encode(text);
  const h = harness([
    json(remote({ size: bytes.length, '@microsoft.graph.downloadUrl': 'https://files.example/?download-secret' })),
    new Response(new ReadableStream<Uint8Array>({ start(controller) { for (const byte of bytes) controller.enqueue(Uint8Array.of(byte)); controller.close(); } })),
    json(remote({ size: bytes.length })),
  ]);
  assert.equal((await h.client.load({ ...source, size: bytes.length })).text, text);
  h.done();
});

test('invalid UTF-8 is rejected instead of repaired destructively', async () => {
  const h = harness([json(remote({ '@microsoft.graph.downloadUrl': 'https://files.example/?download-secret' })), new Response(Uint8Array.of(0xc3, 0x28, 0xff))]);
  await rejects(h.client.load(source), 'invalid');
  h.done();
});

test('truncated download is rejected after metadata verification', async () => {
  const h = harness([json(remote({ '@microsoft.graph.downloadUrl': 'https://files.example/?download-secret' })), new Response('ab'), json(remote())]);
  await rejects(h.client.load(source), 'invalid');
  h.done();
});

test('partial content is not mistaken for a complete project', async () => {
  const h = harness([json(remote({ '@microsoft.graph.downloadUrl': 'https://files.example/?download-secret' })), new Response('a', { status: 206 })]);
  await rejects(h.client.load(source), 'unknown', 206);
  h.done();
});

test('oversized metadata size rejects before contacting the download host', async () => {
  const h = harness([json(remote({ size: 96_000_001, '@microsoft.graph.downloadUrl': 'https://files.example/?download-secret' }))]);
  await rejects(h.client.load(source), 'invalid');
  h.done();
});

test('content-length cannot bypass the byte limit or consume a forbidden body', async () => {
  let pulls = 0;
  let cancelled = false;
  const response = new Response(new ReadableStream<Uint8Array>({ pull() { pulls++; }, cancel() { cancelled = true; } }, { highWaterMark: 0 }), { headers: { 'Content-Length': '96000001' } });
  const h = harness([json(remote({ '@microsoft.graph.downloadUrl': 'https://files.example/?download-secret' })), response]);
  await rejects(h.client.load(source), 'invalid');
  assert.equal(pulls, 0);
  assert.equal(cancelled, true);
  h.done();
});

test('stream byte count is bounded even without content-length', async () => {
  let cancelled = false;
  // A single oversized chunk must be refused before the UTF-8 decoder runs.
  const h = harness([
    json(remote({ '@microsoft.graph.downloadUrl': 'https://files.example/?download-secret' })),
    new Response(new ReadableStream<Uint8Array>({ start(controller) { controller.enqueue(new Uint8Array(96_000_001)); }, cancel() { cancelled = true; } })),
  ]);
  await rejects(h.client.load(source), 'invalid');
  assert.equal(cancelled, true);
  h.done();
});

test('stream character count is bounded independently of bytes', async () => {
  let cancelled = false;
  const chunk = new Uint8Array(1_000_000).fill(97);
  let sent = 0;
  const h = harness([
    json(remote({ size: 33_000_000, '@microsoft.graph.downloadUrl': 'https://files.example/?download-secret' })),
    new Response(new ReadableStream<Uint8Array>({ pull(controller) { controller.enqueue(chunk); if (++sent === 33) controller.close(); }, cancel() { cancelled = true; } }, { highWaterMark: 0 })),
  ]);
  await rejects(h.client.load({ ...source, size: 33_000_000 }), 'invalid');
  assert.ok(cancelled || sent === 33);
  h.done();
});

test('exact 32-million-character upload is accepted unchanged', async () => {
  const text = 'a'.repeat(32_000_000);
  const h = harness([json(remote({ eTag: '"next"', size: text.length }))]);
  const result = await h.client.save(Object.freeze({ ...source }), text);
  assert.equal(result.size, 32_000_000);
  assert.equal(h.calls[0]!.init.body, text);
  h.done();
});

test('oversized or ill-formed source text is rejected before any token or request', async () => {
  for (const text of ['a'.repeat(32_000_001), '\ud800', '\udc00', 'a\ud800b']) {
    for (const operation of ['save', 'create'] as const) {
      const h = harness([]);
      await rejects(operation === 'save' ? h.client.save(source, text) : h.client.create('New', text), 'invalid');
      assert.equal(h.tokens(), 0);
      assert.equal(h.calls.length, 0);
    }
  }
});

for (const name of ['../other', 'a/b', 'a\\b', 'a:bad', 'bad?', 'trailing.', ' space ', '.slinker', '', 'a'.repeat(256), '\ud800']) {
  test(`invalid filename fails before token: ${name.slice(0, 40)}`, async () => {
    const h = harness([]);
    await rejects(h.client.create(name, 'abc'), 'invalid');
    await rejects(h.client.rename(source, name), 'invalid');
    assert.equal(h.tokens(), 0);
  });
}

for (const changes of [{ id: '..' }, { id: 'x/y' }, { id: 'x%2fy' }, { id: 'x?secret' }, { driveId: 'https://evil.example' }, { eTag: '' }, { eTag: 'bad\r\nheader' }, { size: NaN }]) {
  test(`invalid input identity is refused before token: ${JSON.stringify(changes)}`, async () => {
    const h = harness([]);
    await rejects(h.client.save({ ...source, ...changes }, 'abc'), 'invalid');
    assert.equal(h.tokens(), 0);
  });
}

test('all identity segments, including exclamation marks, are encoded', async () => {
  const captured = { ...source, driveId: 'b!drive', id: 'item!one' };
  const h = harness([json(remote({ id: 'item!one', parentReference: { driveId: 'b!drive' } }))]);
  await h.client.save(captured, 'abc');
  assertGraph(h.calls[0]!, 'PUT', origin + '/drives/b%21drive/items/item%21one/content', source.eTag);
  h.done();
});

test('metadata JSON itself is bounded and malformed success is not a saved confirmation', async () => {
  for (const response of [new Response('not-json provider-secret'), json(null), json({}), new Response(' '.repeat(2_000_001))]) {
    const h = harness([response]);
    await rejects(h.client.save(source, 'abc'), 'invalid');
    assert.equal(h.calls.length, 1);
    h.done();
  }
});

test('write response must retain the requested drive and item identity', async () => {
  for (const response of [remote({ id: 'other' }), remote({ parentReference: { driveId: 'other' } })]) {
    const h = harness([json(response)]);
    await rejects(h.client.save(source, 'abc'), 'invalid');
    h.done();
  }
});

test('pre-cancelled operations acquire no tokens and perform no requests', async () => {
  const h = harness([]);
  const controller = new AbortController(); controller.abort('provider-secret');
  for (const operation of [h.client.list(controller.signal), h.client.load(source, controller.signal), h.client.create('New', 'abc', controller.signal), h.client.save(source, 'abc', controller.signal), h.client.rename(source, 'New', controller.signal), h.client.remove(source, controller.signal)]) {
    await rejects(operation, 'cancelled');
  }
  assert.equal(h.tokens(), 0);
  assert.equal(h.calls.length, 0);
});

test('cancellation while token is unresolved completes without waiting or sending it later', async () => {
  let release!: (token: string) => void;
  const controller = new AbortController();
  const h = harness([]);
  const client = createOneDriveClient({ ...h.options, token: () => new Promise(resolve => { release = resolve; }) });
  const operation = client.save(source, 'abc', controller.signal);
  await Promise.resolve();
  controller.abort('provider-secret');
  await rejects(operation, 'cancelled');
  release('secret-token');
  await Promise.resolve();
  assert.equal(h.calls.length, 0);
});

test('cancellation aborts an in-flight write even if injected fetch ignores the signal', async () => {
  const controller = new AbortController();
  let called!: () => void;
  const started = new Promise<void>(resolve => { called = resolve; });
  const h = harness([() => { called(); return new Promise<Response>(() => undefined); }]);
  const operation = h.client.save(source, 'abc', controller.signal);
  await started; controller.abort('provider-secret');
  await rejects(operation, 'cancelled');
  assert.equal(h.calls[0]!.init.signal!.aborted, true);
  assert.equal(h.calls.length, 1);
  h.done();
});

test('cancellation during download cancels the reader and prevents a final metadata request', async () => {
  const controller = new AbortController();
  let read!: () => void;
  const started = new Promise<void>(resolve => { read = resolve; });
  let cancelled = false;
  const h = harness([
    json(remote({ '@microsoft.graph.downloadUrl': 'https://files.example/?download-secret' })),
    new Response(new ReadableStream<Uint8Array>({ pull() { read(); }, cancel() { cancelled = true; } }, { highWaterMark: 0 })),
  ]);
  const operation = h.client.load(source, controller.signal);
  await started; controller.abort('provider-secret');
  await rejects(operation, 'cancelled');
  assert.equal(cancelled, true);
  assert.equal(h.calls.length, 2);
  h.done();
});

test('finite timeout covers a token getter which never resolves', async t => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const h = harness([]);
  const client = createOneDriveClient({ ...h.options, token: () => new Promise<string>(() => undefined) });
  const operation = client.save(source, 'abc');
  await Promise.resolve();
  t.mock.timers.tick(30_000);
  await rejects(operation, 'transient');
  assert.equal(h.calls.length, 0);
});

test('finite timeout covers a fetch which never resolves and aborts its signal', async t => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  let called!: () => void;
  const started = new Promise<void>(resolve => { called = resolve; });
  const h = harness([() => { called(); return new Promise<Response>(() => undefined); }]);
  const operation = h.client.save(source, 'abc');
  await started; t.mock.timers.tick(30_000);
  await rejects(operation, 'transient');
  assert.equal(h.calls[0]!.init.signal!.aborted, true);
  h.done();
});

test('finite timeout covers a stalled download stream and cancels it', async t => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  let read!: () => void;
  const started = new Promise<void>(resolve => { read = resolve; });
  let cancelled = false;
  const h = harness([
    json(remote({ '@microsoft.graph.downloadUrl': 'https://files.example/?download-secret' })),
    new Response(new ReadableStream<Uint8Array>({ pull() { read(); }, cancel() { cancelled = true; } }, { highWaterMark: 0 })),
  ]);
  const operation = h.client.load(source);
  await started; t.mock.timers.tick(30_000);
  await rejects(operation, 'transient');
  assert.equal(cancelled, true);
  h.done();
});

test('token failures are sanitized auth failures with no fetch', async () => {
  const h = harness([]);
  const client = createOneDriveClient({ ...h.options, token: async () => { throw new Error('provider-secret secret-token'); } });
  await rejects(client.save(source, 'abc'), 'auth');
  assert.equal(h.calls.length, 0);
});

test('account, token getter and fetch are captured for the lifetime of a frozen client', async () => {
  const h = harness([json(remote())]);
  h.options.accountId = 'other-account';
  h.options.token = async () => { throw new Error('Must not call a replacement getter'); };
  h.options.fetch = async () => { throw new Error('Must not use a replacement fetch'); };
  assert.throws(() => { (h.client as { accountId: string }).accountId = 'different'; }, TypeError);
  assert.equal(h.client.accountId, 'account-1');
  await h.client.save(source, 'abc');
  assert.equal(h.tokens(), 1);
  h.done();
});

test('responses are cloned and provider-only properties do not enter CloudItem DTOs', async () => {
  const h = harness([json(remote({ eTag: '"next"', '@microsoft.graph.downloadUrl': 'https://files.example/?download-secret', extra: { data: 'provider-secret' } }))]);
  const original = Object.freeze({ ...source });
  const result = await h.client.save(original, 'abc');
  assert.deepEqual(Object.keys(result).sort(), ['driveId', 'eTag', 'id', 'lastModifiedDateTime', 'name', 'size']);
  assert.deepEqual(original, source);
  assert.notEqual(result, original);
  h.done();
});

for (const eTag of ['*', ' * ', '"one", "two"', 'unquoted', '"bad\u0100"']) {
  test(`ETag must be one entity tag, never a wildcard or header list: ${eTag}`, async () => {
    const h = harness([]);
    await rejects(h.client.save({ ...source, eTag }, 'abc'), 'invalid');
    assert.equal(h.tokens(), 0);
    assert.equal(h.calls.length, 0);
  });
}

test('cancelled write remains failed when ignored fetch completes late, and late body is disposed', async () => {
  let release!: (response: Response) => void;
  let called!: () => void;
  const started = new Promise<void>(resolve => { called = resolve; });
  const h = harness([() => { called(); return new Promise<Response>(resolve => { release = resolve; }); }]);
  const controller = new AbortController();
  const operation = h.client.save(source, 'abc', controller.signal);
  await started; controller.abort();
  await rejects(operation, 'cancelled');
  let cancelled = false;
  release(new Response(new ReadableStream<Uint8Array>({ cancel() { cancelled = true; } }, { highWaterMark: 0 })));
  await new Promise<void>(resolve => setImmediate(resolve));
  assert.equal(cancelled, true);
  assert.equal(h.calls.length, 1);
  h.done();
});

test('cyclic pagination recognizes reordered equivalent query parameters', async () => {
  const h = harness([
    json(folder()),
    json({ value: [], '@odata.nextLink': childrenPath + '?$skiptoken=loop&$top=100' }),
    json({ value: [], '@odata.nextLink': childrenPath + '?$top=100&$skiptoken=loop' }),
  ]);
  await rejects(h.client.list(), 'invalid');
  assert.equal(h.calls.length, 3);
  assert.equal(h.tokens(), 3);
  h.done();
});

test('malformed folder facets fail without triggering creation', async () => {
  const h = harness([json(remote({ id: 'folder-1', name: 'LinkageStudio', folder: {} }))]);
  await rejects(h.client.create('New', 'abc'), 'invalid');
  assert.equal(h.calls.length, 1);
  h.done();
});
