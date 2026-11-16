import assert from 'node:assert/strict';
import { test } from 'node:test';
import { writeRestartCheckpoint, approveRestart, consumeRestartApproval } from '../src/document/restart';
import type { RecoveryStorage, RecoveryDraft } from '../src/document/recovery';
function fixture() {
  let snapshot={sessionId:'A',text:'active design',displayName:'Current',interacting:false};
  let draft:RecoveryDraft|null=null;
  const storage:RecoveryStorage={async list(){return [];},async read(){return structuredClone(draft);},async write(next){if(draft&&next.revision<=draft.revision)return false;draft=structuredClone(next);return true;},async remove(){draft=null;},close(){}};
  return {storage,capture:()=>({...snapshot}),change(patch:Partial<typeof snapshot>){snapshot={...snapshot,...patch};},draft:()=>draft};
}
test('confirmed restart snapshot is written/read back even for a clean design',async()=>{
  const f=fixture();assert.equal(await writeRestartCheckpoint(f.storage,f.capture,async()=>{}),'ready');assert.equal(f.draft()?.text,'active design');
});
for(const stage of ['flush','read','write','readback']as const)test(`document changes during ${stage} refuse restart`,async()=>{
  const f=fixture();let reads=0;const read=f.storage.read,write=f.storage.write;
  f.storage.read=async id=>{if((++reads===1&&stage==='read')||(reads===2&&stage==='readback'))f.change({text:'new edit'});return read(id);};
  f.storage.write=async d=>{if(stage==='write')f.change({sessionId:'B'});return write(d);};
  assert.equal(await writeRestartCheckpoint(f.storage,f.capture,async()=>{if(stage==='flush')f.change({text:'new edit'});}),'changed');
});
for(const failure of ['quota','stale','corrupt','revision']as const)test(`${failure} checkpoint cannot authorize restart`,async()=>{
  const f=fixture();if(failure==='quota')f.storage.write=async()=>{throw new DOMException('Full','QuotaExceededError');};
  if(failure==='stale')f.storage.write=async()=>false;
  if(failure==='corrupt')f.storage.read=async()=>{throw new Error('Corruption');};
  if(failure==='revision')f.storage.read=async()=>({id:'A',text:'old',displayName:'Old',revision:Number.MAX_SAFE_INTEGER,updatedAt:1,formatVersion:1});
  assert.equal(await writeRestartCheckpoint(f.storage,f.capture,async()=>{}),'unavailable');
});
test('active gesture refuses checkpoint without any storage work',async()=>{const f=fixture();f.change({interacting:true});assert.equal(await writeRestartCheckpoint(f.storage,f.capture,async()=>assert.fail()),'changed');assert.equal(f.draft(),null);});
test('readback mismatch refuses restart',async()=>{const f=fixture();f.storage.write=async()=>true;assert.equal(await writeRestartCheckpoint(f.storage,f.capture,async()=>{}),'unavailable');});
test('beforeunload bypass is exact-document and one use only',()=>{const f=fixture();approveRestart(f.capture());assert(consumeRestartApproval(f.capture()));assert(!consumeRestartApproval(f.capture()));approveRestart(f.capture());f.change({text:'new'});assert(!consumeRestartApproval(f.capture()));});
test('account/project replacement and active gesture cannot consume another design approval',()=>{const f=fixture();approveRestart(f.capture());f.change({sessionId:'B'});assert(!consumeRestartApproval(f.capture()));approveRestart(f.capture());f.change({interacting:true});assert(!consumeRestartApproval(f.capture()));});
