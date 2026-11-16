import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createCloudProjects } from '../src/cloud/projects';
import { CloudError } from '../src/cloud/types';
import type { CloudCache, CloudCacheRow, CloudItem, CloudPort } from '../src/cloud/types';

const item: CloudItem = { driveId: 'drive', id: 'one', name: 'One.slinker', eTag: 'v1', lastModifiedDateTime: '2026-11-16T10:00:00Z', size: 3 };
const clone = <T>(v: T): T => structuredClone(v);
function deferred<T>() { let resolve!: (value: T) => void; const promise = new Promise<T>(r => { resolve = r; }); return { promise, resolve }; }
function fixture() {
  let session = 'A', text = 'design', interacting = false;
  const saved: string[] = [], opened: string[] = [], uploaded: string[] = [];
  const rows = new Map<string, CloudCacheRow>();
  const key = (a: string, d: string, id: string) => JSON.stringify([a, d, id]);
  const cache: CloudCache = {
    async list(a) { return [...rows.values()].filter(r => r.accountId === a).map(r => ({ accountId: a, item: clone(r.item), revision: r.revision, updatedAt: r.updatedAt, hasPending: !!r.pending, remoteDeleted: !!r.remoteDeleted })); },
    async read(a, d, id) { return clone(rows.get(key(a,d,id)) ?? null); },
    async write(r) { const k = key(r.accountId,r.item.driveId,r.item.id); if ((rows.get(k)?.revision ?? 0) >= r.revision) return false; rows.set(k, clone(r)); return true; },
    async remove(a,d,id,rev) { const k = key(a,d,id); if (rows.get(k)?.revision !== rev) return false; return rows.delete(k); }, close() {},
  };
  const port: CloudPort = { accountId: 'account-A', async list() { return [clone(item)]; }, async load() { return { item: clone(item), text: 'remote' }; },
    async create(_name, t) { uploaded.push(t); return { ...item, eTag: 'v2' }; },
    async save(i, t) { assert.equal(i.eTag, 'v1'); uploaded.push(t); return { ...i, eTag: 'v2' }; },
    async rename(i,n) { return { ...i, name: n, eTag: 'v2' }; }, async remove() {},
  };
  const document = {
    capture: () => ({ session, text, name: 'One', signature: text, interacting }),
    validate(_text: string) {},
    open(t: string) { opened.push(t); text = t; session += '+'; }, saved(t: string) { saved.push(t); }, detached() { saved.push('detached'); },
  };
  const controller = createCloudProjects(cache, document, () => {});
  controller.select(port);
  return { controller, cache, port, rows, saved, opened, uploaded, document,
    edit(t: string) { text = t; }, switch() { session = 'B'; text = 'other'; }, gesture(v = true) { interacting = v; } };
}

test('guest initialization has no network or storage activity', () => {
  const f = fixture(); f.controller.select(null);
  assert.equal(f.controller.state().accountId, null); assert.equal(f.rows.size, 0); assert.equal(f.uploaded.length, 0);
});
test('unbound guest ticks never serialize the current document',async()=>{
  const f=fixture();let captures=0;const capture=f.document.capture;f.document.capture=()=>{captures++;return capture();};
  await f.controller.tick();await f.controller.tick();assert.equal(captures,0);assert.equal(f.rows.size,0);assert.deepEqual(f.uploaded,[]);
});
test('cloud acknowledgement marks captured content saved; newer edits remain separate', async () => {
  const f = fixture(), wait = deferred<CloudItem>(); f.port.create = async () => wait.promise;
  const op = f.controller.save(); f.edit('newer'); wait.resolve(item); await op;
  assert.deepEqual(f.saved, ['design']); assert.equal(f.controller.state().binding?.text, 'design');
});
for (const action of ['account', 'project', 'dispose'] as const) test(`late save cannot mark a replacement ${action} saved`, async () => {
  const f = fixture(), wait = deferred<CloudItem>(); f.port.create = async () => wait.promise;
  const op = f.controller.save();
  if (action === 'account') f.controller.select({ ...f.port, accountId: 'account-B' });
  if (action === 'project') f.switch();
  if (action === 'dispose') f.controller.dispose();
  wait.resolve(item); await op; assert.deepEqual(f.saved, []);
});
for (const code of ['conflict','quota','auth','offline','transient'] as const) test(`${code} upload retains pending content and does not clear dirty baseline`, async () => {
  const f = fixture(); await f.controller.open(item); f.edit('pending');
  f.port.save = async () => { throw new CloudError(code, 'Failed safely'); };
  await f.controller.save(); assert.deepEqual(f.saved, []);
  assert.equal((await f.cache.read('account-A', 'drive', 'one'))?.pending?.text, 'pending');
  assert.equal(f.controller.state().error, code);
});
test('bound save commits pending journal before calling transport', async () => {
  const f = fixture(); await f.controller.open(item); f.edit('authored');
  f.port.save = async i => {
    assert.equal((await f.cache.read('account-A','drive','one'))?.pending?.text, 'authored');
    return { ...i, eTag: 'v2' };
  };
  await f.controller.save(); assert.deepEqual(f.saved, ['authored']);
  const row = await f.cache.read('account-A','drive','one'); assert.equal(row?.text, 'authored'); assert.equal(row?.pending, undefined);
});
test('cache quota before upload refuses the upload rather than losing the pending copy', async () => {
  const f = fixture(); await f.controller.open(item); f.edit('edit');
  f.cache.write = async () => { throw new CloudError('quota','Storage full'); };
  await f.controller.save(); assert.deepEqual(f.uploaded, []); assert.deepEqual(f.saved, []);
});
test('remote acknowledgement survives cache failure with explicit offline warning', async () => {
  const f = fixture(); f.cache.write = async () => { throw new CloudError('quota','Full'); };
  await f.controller.save(); assert.deepEqual(f.saved, ['design']); assert.match(f.controller.state().status, /offline cache/);
});
test('another-tab higher cache revision prevents upload', async () => {
  const f = fixture(); await f.controller.open(item);
  await f.cache.write({ accountId:'account-A',item,text:'other-tab',revision:3,updatedAt:10,pending:{text:'other edit',projectName:'Other'} });
  await f.controller.save(); assert.deepEqual(f.uploaded, []); assert.equal(f.controller.state().error,'conflict');
});
test('remote open never erases an existing offline draft', async () => {
  const f = fixture(); await f.cache.write({ accountId:'account-A',item,text:'known',revision:1,updatedAt:10,pending:{text:'offline',projectName:'One'} });
  await f.controller.open(item); assert.deepEqual(f.opened, []); assert.equal(f.controller.state().error, 'conflict');
  await f.controller.open(item,true); assert.deepEqual(f.opened, ['offline']); assert.equal(f.controller.state().binding?.text,'known');
});
for (const change of ['account','project','edit'] as const) test(`late open refuses changed ${change}`, async () => {
  const f=fixture(), wait=deferred<{item:CloudItem;text:string}>(); f.port.load=async()=>wait.promise;
  const op=f.controller.open(item);
  if(change==='account') f.controller.select({...f.port,accountId:'B'});
  if(change==='project') f.switch(); if(change==='edit') f.edit('new');
  wait.resolve({item,text:'remote'}); await op; assert.deepEqual(f.opened,[]);
});
test('autosave is opt-in, defers gestures, coalesces and follows cloud baseline not local save', async () => {
  const f=fixture(); await f.controller.open(item); f.edit('latest'); await f.controller.tick(); assert.deepEqual(f.uploaded,[]);
  f.controller.autosave(true); f.gesture(); await f.controller.tick(); assert.deepEqual(f.uploaded,[]);
  f.gesture(false); await f.controller.tick(); assert.deepEqual(f.uploaded,['latest']); await f.controller.tick(); assert.equal(f.uploaded.length,1);
});
test('failed autosave stops automatic retries and retains draft', async () => {
  const f=fixture(); await f.controller.open(item); f.edit('latest'); f.controller.autosave(true); let calls=0;
  f.port.save=async()=>{calls++;throw new CloudError('offline','Offline');};
  await f.controller.tick(); await f.controller.tick(); assert.equal(calls,1);
});
test('project replacement detaches autosave before it can upload the new graph', async () => {
  const f=fixture(); await f.controller.open(item); f.controller.autosave(true); f.switch(); await f.controller.tick();
  assert.equal(f.controller.state().binding,null); assert.deepEqual(f.uploaded,[]);
});
test('rename uses immutable ID and leaves document content untouched', async () => {
  const f=fixture(); await f.controller.open(item); await f.controller.refresh(); await f.controller.rename(item,'Renamed.slinker');
  assert.equal(f.controller.state().binding?.item.id,'one'); assert.equal(f.controller.state().binding?.item.name,'Renamed.slinker');
  assert.equal(f.controller.state().cached.find(r=>r.item.id==='one')?.item.name,'Renamed.slinker');
  assert.deepEqual(f.opened,['remote']); assert.deepEqual(f.saved,[]);
});
test('delete detaches current cloud document and preserves local cached copy', async () => {
  const f=fixture(); await f.controller.open(item); await f.controller.remove(item);
  assert.equal(f.controller.state().binding,null); assert.deepEqual(f.saved,['detached']);
  assert.equal((await f.cache.read('account-A','drive','one'))?.remoteDeleted,true);
  assert.equal(f.controller.state().cached.find(r=>r.item.id==='one')?.remoteDeleted,true);
});
test('malformed remote document cannot replace known-good cache or current design', async () => {
  const f=fixture();await f.controller.open(item);const before=await f.cache.read('account-A','drive','one');
  f.document.validate=()=>{throw new CloudError('invalid','Invalid document');};
  await f.controller.open(item);assert.deepEqual(await f.cache.read('account-A','drive','one'),before);assert.deepEqual(f.opened,['remote']);
});
test('explicit draft discard retains confirmed copy and never changes current document', async () => {
  const f=fixture();await f.cache.write({accountId:'account-A',item,text:'confirmed',revision:1,updatedAt:10,pending:{text:'draft',projectName:'One'}});
  await f.controller.discardPending(item);const row=await f.cache.read('account-A','drive','one');assert.equal(row?.text,'confirmed');assert.equal(row?.pending,undefined);assert.deepEqual(f.opened,[]);assert.deepEqual(f.saved,[]);
});
for (const action of ['rename','remove'] as const) test(`${action} acknowledgement is not hidden by offline-cache failure`, async () => {
  const f=fixture();await f.controller.open(item);f.cache.read=async()=>{throw new Error('Storage unavailable');};
  if(action==='rename'){await f.controller.rename(item,'New.slinker');assert.equal(f.controller.state().binding?.item.name,'New.slinker');assert.match(f.controller.state().status,/renamed.*cache was not updated/);}
  else {await f.controller.remove(item);assert.equal(f.controller.state().binding,null);assert.deepEqual(f.saved,['detached']);assert.match(f.controller.state().status,/Deleted from OneDrive/);}
});
test('cancel aborts a slow listing and ignores its eventual response without trapping guest editing',async()=>{
  const f=fixture(),wait=deferred<CloudItem[]>();let signal:AbortSignal|undefined;f.port.list=async s=>{signal=s;return wait.promise;};
  const op=f.controller.refresh();await new Promise(r=>setTimeout(r,0));f.controller.cancel();assert.equal(signal?.aborted,true);assert.equal(f.controller.state().busy,false);
  wait.resolve([item]);await op;assert.deepEqual(f.controller.state().items,[]);assert.equal(f.controller.state().error,'cancelled');
});
test('cancelled sent save cannot mark the local design saved on a late acknowledgement',async()=>{
  const f=fixture(),wait=deferred<CloudItem>();f.port.create=async()=>wait.promise;const op=f.controller.save();f.controller.cancel();wait.resolve(item);await op;assert.deepEqual(f.saved,[]);assert.equal(f.controller.state().binding,null);
});
test('cancel during pending-journal write prevents a request which has not yet been sent',async()=>{
  const f=fixture();await f.controller.open(item);const wait=deferred<boolean>();f.cache.write=async()=>wait.promise;
  const op=f.controller.save();await new Promise(r=>setTimeout(r,0));f.controller.cancel();wait.resolve(true);await op;assert.deepEqual(f.uploaded,[]);assert.deepEqual(f.saved,[]);
});
