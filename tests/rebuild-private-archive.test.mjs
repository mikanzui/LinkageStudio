import assert from 'node:assert/strict';
import test from 'node:test';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { prepareBrowser, verifyFixtures } from '../scripts/rebuild/prepare-browser.mjs';

// This explicit private-input check is separate from the public deterministic suite.
const packageRoot = fileURLToPath(new URL('../', import.meta.url));
const input = process.env.LINKAGE_FIXTURE_DIR;
if (!input) throw new Error('Set LINKAGE_FIXTURE_DIR for the explicit private archive tests.');
async function sandbox(t) {
  const root = await mkdtemp(join(packageRoot, '.private-test-'));
  t.after(() => {
    assert.equal(resolve(root, '..'), resolve(packageRoot));
    return rm(root, { recursive: true, force: true });
  });
  await mkdir(join(root, 'src'));
  await writeFile(join(root, 'package.json'), '{"type":"module"}');
  await writeFile(join(root, 'vite.config.ts'), 'export default {plugins:[]};');
  return root;
}

test('locally supplied originals/canonical files are copied only into a new ignored archive, with pinned hashes', async (t) => {
  const root = await sandbox(t);
  const before = await verifyFixtures(resolve(input), { originals: true });
  const result = await prepareBrowser({ harnessRoot: root, env: { LINKAGE_FIXTURE_DIR: resolve(input) }, requireTooling: false });
  assert.equal(result.fixturesVerified, true);
  assert.equal(result.archive, join(root, '.rebuild.local/portable/archive'));
  const copied = await verifyFixtures(join(result.archive, 'fixtures'));
  assert.deepEqual(copied.map(({ sha256 }) => sha256), before.map(({ sha256 }) => sha256));
  const runtime = JSON.parse(await readFile(result.runtimes));
  assert.equal(runtime.archive, result.archive);
  assert.equal(runtime.targets[0].path, root);
  const after = await verifyFixtures(resolve(input), { originals: true });
  assert.deepEqual(after.map(({ bytes }) => bytes), before.map(({ bytes }) => bytes));
});

test('an existing valid workspace archive and runtimes are reused byte-for-byte without copying fixtures', async (t) => {
  const root = await sandbox(t);
  const fixtures = await verifyFixtures(resolve(input), { originals: true });
  // Preservation branch requires canonical archive filenames, as real runtimes do.
  assert.ok(fixtures.every(({ path, name }) => path === join(resolve(input), name)));
  const runtimePath = join(root, '.rebuild.local/runtimes.json');
  await mkdir(dirname(runtimePath), { recursive: true });
  const runtime = JSON.stringify({ archive: dirname(resolve(input)), preserved: 'existing runtime sentinel' }, null, 2);
  await writeFile(runtimePath, runtime);
  const result = await prepareBrowser({ harnessRoot: root, env: {}, requireTooling: false });
  assert.equal(result.archive, dirname(resolve(input)));
  assert.equal(await readFile(runtimePath, 'utf8'), runtime);
  const after = await verifyFixtures(resolve(input));
  assert.deepEqual(after.map(({ bytes }) => bytes), fixtures.map(({ bytes }) => bytes));
  await assert.rejects(readFile(join(root, '.rebuild.local/portable/archive/fixtures/airer.slinker')), { code: 'ENOENT' });
});
