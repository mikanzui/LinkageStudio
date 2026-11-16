import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { IPublicClientApplication } from '@azure/msal-browser';
import { createCloudAuth } from '../src/cloud/auth';

function fixture() {
  const account = { homeAccountId: 'A', username: 'a@example.test' };
  let loads = 0, popups = 0, silents = 0;
  let accounts = [account];
  const fake = {
    async initialize() {}, getAllAccounts: () => accounts,
    async loginPopup() { popups++; return { account }; },
    async acquireTokenSilent(request: { account: typeof account }) { silents++; return { account: request.account, accessToken: 'test-token' }; },
    async clearCache(request: { account: typeof account }) { accounts = accounts.filter(a => a.homeAccountId !== request.account.homeAccountId); },
  };
  const auth = createCloudAuth(async () => { loads++; return fake as unknown as IPublicClientApplication; });
  return { auth, fake, counts: () => ({ loads, popups, silents }) };
}
test('guest auth is lazy; concurrent initialize calls share a single SDK instance', async () => {
  const f = fixture(); assert.deepEqual(f.counts(), { loads:0,popups:0,silents:0 }); assert.deepEqual(f.auth.accounts(),[]);
  await Promise.all([f.auth.initialize(),f.auth.initialize()]); assert.equal(f.counts().loads,1); assert.equal(f.auth.accounts()[0].id,'A');
});
test('silent token uses explicit account and never triggers a popup', async () => {
  const f=fixture(); await f.auth.initialize(); assert.equal(await f.auth.token('A'),'test-token');
  assert.deepEqual(f.counts(),{loads:1,popups:0,silents:1}); await assert.rejects(f.auth.token('B'),/Reconnect/);
});
test('expired credentials expose sanitized failure with no interactive fallback', async () => {
  const f=fixture(); await f.auth.initialize(); f.fake.acquireTokenSilent=async()=>{throw new Error('secret-token https://private');};
  await assert.rejects(f.auth.token('A'),e=>e instanceof Error && /Reconnect/.test(e.message) && !/secret|https:/.test(e.message));
  assert.equal(f.counts().popups,0);
});
test('local disconnect removes only the requested account', async () => {
  const f=fixture(); await f.auth.initialize(); await f.auth.signOut('A'); assert.deepEqual(f.auth.accounts(),[]); await assert.rejects(f.auth.token('A'));
});
test('explicit sign-in connects an account without background interactions', async () => {
  const f=fixture(); await f.auth.initialize(); assert.equal((await f.auth.signIn()).id,'A'); assert.equal(f.counts().popups,1);
});
test('wrong-account token is rejected', async () => {
  const f=fixture(); await f.auth.initialize(); f.fake.acquireTokenSilent=async()=>({account:{homeAccountId:'B',username:'b'},accessToken:'wrong'});
  await assert.rejects(f.auth.token('A'),/Reconnect/);
});
test('failed initialization can retry and does not print provider errors', async () => {
  let attempts=0; const f=fixture();
  const auth=createCloudAuth(async()=>{if(++attempts===1)throw new Error('secret');return f.fake as unknown as IPublicClientApplication;});
  await assert.rejects(auth.initialize(),/could not initialize/); await auth.initialize(); assert.equal(auth.accounts().length,1);
});
test('uninitialized sign-in is rejected rather than awaiting and losing activation', async () => {
  const f=fixture(); await assert.rejects(f.auth.signIn(),/not ready/); assert.equal(f.counts().loads,0);
});
test('disconnect and popup operations cannot overlap and clear newly acquired account tokens',async()=>{
  const f=fixture();await f.auth.initialize();let resolve!:()=>void;f.fake.clearCache=()=>new Promise<void>(r=>{resolve=r;});
  const op=f.auth.signOut('A');await assert.rejects(f.auth.signIn(),/already in progress/);resolve();await op;await f.auth.signIn();assert.equal(f.counts().popups,1);
});
