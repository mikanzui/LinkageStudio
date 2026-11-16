import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { decodeDocument, encodeDocument } from '../src/document/codec';

const fixture = (name: string) => readFileSync(new URL(`../../../baselines/2026-11-15T18-45-10-493Z-CMbWTX/fixtures/${name}`, import.meta.url), 'utf8');
for (const name of ['airer.slinker', 'working-screen.json']) {
  test(`${name}: complete legacy payload round-trips with explicit stable model`, () => {
    const original = JSON.parse(fixture(name));
    const decoded = decodeDocument(JSON.stringify(original));
    assert.equal(decoded.ok, true);
    if (!decoded.ok) return;
    const next = JSON.parse(encodeDocument(decoded.context.source, 'rebuild-g1', decoded.context));
    for (const key of Object.keys(original)) assert.deepEqual(next[key], original[key], key);
    assert.equal(next.sourceVersion, original.version);
    assert.equal(next.simulationModel, 'saved-links-v1');
    assert.equal(next.schemaVersion, 1);
    const reopened = decodeDocument(JSON.stringify(next));
    assert.equal(reopened.ok, true);
    if (reopened.ok) assert.equal(JSON.parse(encodeDocument(reopened.context.source, 'rebuild-g2', reopened.context)).sourceVersion, original.version);
    assert.deepEqual(decoded.context.source, original);
  });
}
const valid = () => JSON.parse(fixture('airer.slinker'));
test('legitimate zero rest length is valid and unchanged', () => {
  const d = valid();
  assert(Object.values(d.links).some(x => (x as { restLength: number }).restLength === 0));
  assert.equal(decodeDocument(JSON.stringify(d)).ok, true);
});
for (const bad of [-1, null, '1']) test(`invalid rest length ${bad} rejected with entity path`, () => {
  const d = valid(); const id = Object.keys(d.links)[0]; d.links[id].restLength = bad;
  const result = decodeDocument(JSON.stringify(d));
  assert.equal(result.ok, false);
  assert(result.issues.some(x => x.path === `links.${id}.restLength`));
});
for (const text of ['{', 'null', '[]', '{}', '{"__proto__":{},"joints":{},"bodies":{},"baseBodyId":"base"}']) test(`malformed input ${text.slice(0, 24)} is rejected`, () => assert.equal(decodeDocument(text).ok, false));
for (const [key, value] of [['schemaVersion', 99], ['simulationModel', 'unknown-v99'], ['documentFormat', 'different']]) test(`unsupported ${key} rejected without guessing`, () => {
  const d = valid(); d[key] = value;
  assert.equal(decodeDocument(JSON.stringify(d)).ok, false);
});
test('missing link endpoint is fatal; stale optional barrier is retained with warning', () => {
  const d = valid(); const id = Object.keys(d.links)[0]; d.links[id].jointIds[0] = 'missing';
  assert.equal(decodeDocument(JSON.stringify(d)).ok, false);
  const original = decodeDocument(fixture('airer.slinker'));
  assert.equal(original.ok, true);
  assert(original.issues.some(x => x.path.startsWith('colliders.') && x.severity === 'warning'));
});
test('unknown root/entity data is preserved, while deleted core entities stay deleted', () => {
  const d = valid(); const id = Object.keys(d.joints)[0];
  d.futureSprings = { future: { anchor: { x: 1, y: 2 } } }; d.joints[id].custom = { label: 'kept' };
  const result = decodeDocument(JSON.stringify(d)); assert(result.ok);
  const current = structuredClone(d); delete current.futureSprings; delete current.joints[id].custom;
  const next = JSON.parse(encodeDocument(current, 'new', result.context));
  assert.deepEqual(next.futureSprings, d.futureSprings); assert.deepEqual(next.joints[id].custom, d.joints[id].custom);
  current.outlines = {};
  assert.deepEqual(JSON.parse(encodeDocument(current, 'new', result.context)).outlines, {});
});
test('non-finite coordinates and invalid camera rejected', () => {
  const d = valid(); d.viewPreferences.camera.zoom = 0;
  assert.equal(decodeDocument(JSON.stringify(d)).ok, false);
  d.viewPreferences.camera.zoom = 1; d.joints[Object.keys(d.joints)[0]].position.x = null;
  assert.equal(decodeDocument(JSON.stringify(d)).ok, false);
});
