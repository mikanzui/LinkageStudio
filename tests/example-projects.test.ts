import assert from 'node:assert/strict';
import test from 'node:test';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { createExampleProjects } from '../src/document/example-projects';
import { EXAMPLE_PROJECTS, exampleAssetPath } from '../src/examples/catalog';
import { decodeDocument } from '../src/document/codec';
import { MAX_DOCUMENT_CHARACTERS } from '../src/document/limits';
import { compileMechanism } from '../src/core/compile-mechanism';
import { SimulationSession } from '../src/core/simulation-session';
import { deserializeMechanism } from '../src/utils/file-io';

const example = EXAMPLE_PROJECTS[0];
const valid = readFileSync(new URL('../examples/spring-scissor-lift.slinker', import.meta.url), 'utf8');
function setup(load: (e: typeof example, s: AbortSignal) => Promise<string> = async () => valid) {
  let snapshot = { session: 'a', signature: 'original', editable: true, dirty: false };
  const opened: string[] = [], notices: string[] = [];
  const runtime = createExampleProjects(load, {
    capture: () => ({ ...snapshot }),
    open: text => { opened.push(text); return { ok: true, issues: [] }; },
    opened: e => notices.push(e.id),
  }, () => {});
  return { runtime, opened, notices, change: (patch: Partial<typeof snapshot>) => { snapshot = { ...snapshot, ...patch }; } };
}
test('seven public examples decode, have exact mirror/catalog bytes and safe subpath URLs', () => {
  const manifest = JSON.parse(readFileSync(new URL('../examples/catalog.json', import.meta.url), 'utf8'));
  assert.equal(EXAMPLE_PROJECTS.length, 7);
  assert.equal(new Set(EXAMPLE_PROJECTS.map(e => e.id)).size, 7);
  assert.deepEqual(manifest.map((e: { id: string }) => e.id), EXAMPLE_PROJECTS.map(e => e.id));
  for (const e of EXAMPLE_PROJECTS) {
    const bytes = readFileSync(new URL('../examples/' + e.filename, import.meta.url));
    assert.deepEqual(readFileSync(new URL('../public/examples/' + e.filename, import.meta.url)), bytes);
    assert(decodeDocument(bytes.toString('utf8')).ok, e.filename);
    const row = manifest.find((m: { id: string }) => m.id === e.id);
    assert.equal(row.sha256, createHash('sha256').update(bytes).digest('hex'));
    assert.equal(row.bytes, bytes.length);
    assert.equal(exampleAssetPath(e, '/LinkageStudio/'), '/LinkageStudio/examples/' + e.filename);
    assert.equal(exampleAssetPath(e, '/'), '/examples/' + e.filename);
  }
  assert.equal(manifest.find((e: { id: string }) => e.id === 'winged-airer').sha256, '8e73fd936565d2c4df4d549bcc584c438c894f717da6e54ad328a8b3ffd5e0eb');
  assert.equal(manifest.find((e: { id: string }) => e.id === 'working-screen').sha256, '4f1e389186a478e7e4cd7876914b072d20a964b1130718c1f62766c57dba4c07');
});
test('example URLs refuse unknown entries and unsafe deployment roots', () => {
  assert.throws(() => exampleAssetPath({ ...example, filename: '../secret' }, '/LinkageStudio/'));
  for (const base of ['https://evil.test/', '//evil.test/', '/../../', '/LinkageStudio', '/a?token/']) assert.throws(() => exampleAssetPath(example, base));
});
test('clean example opens once; dirty example requires explicit discard', async () => {
  const s = setup(); await s.runtime.open(example); assert.equal(s.opened.length, 1); assert.deepEqual(s.notices, [example.id]);
  s.change({ dirty: true }); await s.runtime.open(example); assert.equal(s.opened.length, 1); assert.equal(s.runtime.state().pending?.id, example.id);
  s.runtime.discardAndOpen(); s.runtime.discardAndOpen(); assert.equal(s.opened.length, 2);
});
test('cancel preserves unsaved design and invalidates confirmation', async () => {
  const s = setup(); s.change({ dirty: true }); await s.runtime.open(example); s.runtime.cancel(); s.runtime.discardAndOpen();
  assert.equal(s.opened.length, 0); assert.equal(s.runtime.state().pending, null);
});
for (const patch of [{ session: 'b' }, { signature: 'edited' }, { editable: false }]) test('late fetch cannot replace changed design ' + JSON.stringify(patch), async () => {
  let resolve!: (text: string) => void;
  const s = setup(() => new Promise(r => { resolve = r; })); const work = s.runtime.open(example); s.change(patch); resolve(valid); await work;
  assert.equal(s.opened.length, 0); assert.match(s.runtime.state().error, /changed/);
});
test('close/dispose aborts network and ignores a fetch that disregards abort', async () => {
  let resolve!: (text: string) => void, signal!: AbortSignal;
  const s = setup((_, abort) => { signal = abort; return new Promise(r => { resolve = r; }); });
  const work = s.runtime.open(example); s.runtime.dispose(); assert(signal.aborted); resolve(valid); await work; assert.equal(s.opened.length, 0);
});
test('newer example owns completion; old out-of-order fetch is ignored', async () => {
  const resolves: ((text: string) => void)[] = [];
  const s = setup(() => new Promise(r => resolves.push(r)));
  const a = s.runtime.open(example), b = s.runtime.open(EXAMPLE_PROJECTS[3]); resolves[1](valid); await b; resolves[0](valid); await a;
  assert.equal(s.opened.length, 1); assert.deepEqual(s.notices, ['playground']);
});
for (const text of ['{bad', 'x'.repeat(MAX_DOCUMENT_CHARACTERS + 1)]) test('invalid or oversized example never replaces the design: ' + text.length, async () => {
  const s = setup(async () => text); await s.runtime.open(example); assert.equal(s.opened.length, 0); assert.match(s.runtime.state().error, /invalid/);
});
test('network failure is local, retryable and does not call open', async () => {
  let fail = true; const s = setup(async () => { if (fail) throw new Error('offline'); return valid; });
  await s.runtime.open(example); assert.equal(s.opened.length, 0); assert.equal(s.runtime.state().loading, false);
  fail = false; await s.runtime.open(example); assert.equal(s.opened.length, 1);
});
test('save-first rebases a confirmed rename but cannot navigate a different session', async () => {
  const s = setup(); s.change({ dirty: true }); await s.runtime.open(example); s.change({ signature: 'renamed', dirty: false }); s.runtime.saved();
  s.runtime.discardAndOpen(); assert.equal(s.opened.length, 1);
  s.change({ dirty: true }); await s.runtime.open(example); s.change({ session: 'b' }); s.runtime.saved(); s.runtime.discardAndOpen(); assert.equal(s.opened.length, 1);
});
test('editing during confirmation or simulation mode prevents replacement', async () => {
  const s = setup(); s.change({ dirty: true }); await s.runtime.open(example); s.change({ signature: 'newer edit' }); s.runtime.discardAndOpen();
  assert.equal(s.opened.length, 0); s.change({ editable: false }); await s.runtime.open(example); assert.equal(s.opened.length, 0);
});
test('three standalone playground details really move and retain their constraint graph', () => {
  const checks = [{ id: 'crank-slider', joint: 'output', distance: 35 }, { id: 'carriage', joint: 'cart-a', distance: 140 }, { id: 'gripper', joint: 'jaw-left-tip', distance: 30 }];
  for (const check of checks) {
    const e = EXAMPLE_PROJECTS.find(e => e.id === check.id)!;
    const decoded = decodeDocument(readFileSync(new URL('../examples/' + e.filename, import.meta.url), 'utf8')); assert(decoded.ok); assert.equal(decoded.issues.length, 0);
    const source = deserializeMechanism(readFileSync(new URL('../examples/' + e.filename, import.meta.url), 'utf8')); assert(source);
    let graph = compileMechanism(source); const original = structuredClone(graph), session = new SimulationSession(graph); let distance = 0;
    for (let i = 0; i < 600; i++) {
      const frame = session.step(graph, { ...source.simulationSettings, dt: 1 / 60, pull: null, analysis: true });
      assert(frame.ok, frame.ok ? '' : frame.error); graph = { ...graph, joints: frame.joints }; assert(frame.result.residual < .1);
      const p = graph.joints[check.joint].position, q = original.joints[check.joint].position; distance = Math.max(distance, Math.hypot(p.x - q.x, p.y - q.y));
      for (const id of original.bodies.base.jointIds) assert.deepEqual(graph.joints[id].position, original.joints[id].position);
    }
    assert(distance > check.distance, `${check.id}: ${distance}`);
  }
});
