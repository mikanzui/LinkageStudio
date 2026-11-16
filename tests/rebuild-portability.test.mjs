import assert from 'node:assert/strict';
import test from 'node:test';
import { createHash } from 'node:crypto';
import { mkdir, mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { resolveBrowserPaths } from '../scripts/rebuild/source-paths.mjs';
import { prepareBrowser, PRIVATE_FIXTURES, verifyFixtures } from '../scripts/rebuild/prepare-browser.mjs';
import { candidateFingerprint, assertCandidateBuild } from '../scripts/rebuild/candidate-fingerprint.mjs';
import { observationConfig } from '../scripts/rebuild/observation-config.mjs';
import { buildGate } from '../scripts/rebuild/build-gate.mjs';
import { runG9 } from '../scripts/rebuild/run-g9.mjs';

const packageRoot = fileURLToPath(new URL('../', import.meta.url));
const checkedScripts = join(packageRoot, 'scripts/rebuild');
async function sandbox(t) {
  const directory = await mkdtemp(join(packageRoot, '.test-'));
  t.after(() => {
    assert.equal(resolve(directory, '..'), resolve(packageRoot));
    return rm(directory, { recursive: true, force: true });
  });
  return directory;
}
async function put(root, name, content = '') {
  const path = join(root, name);
  await mkdir(resolve(path, '..'), { recursive: true });
  await writeFile(path, content);
  return path;
}
async function checkout(root, label = 'fixture candidate') {
  for (const name of ['src', 'public']) await mkdir(join(root, name), { recursive: true });
  for (const name of ['package-lock.json', 'index.html', 'redirect.html', 'tsconfig.app.json', 'tsconfig.json', 'eslint.config.js']) await put(root, name, label + ':' + name);
  await put(root, 'package.json', '{"type":"module"}');
  await put(root, 'vite.config.ts', 'export default { plugins: [], resolve: { alias: { existing: "preserved" }, conditions: ["custom"] } };');
  await put(root, 'src/file.ts', label);
  await put(root, 'public/icon.svg', '<svg/>');
}
async function harness(root) {
  for (const name of ['candidate-fingerprint.mjs', 'source-paths.mjs', 'observation-config.mjs']) await put(root, 'scripts/rebuild/' + name, 'fixture:' + name);
  for (const name of ['package.json', 'package-lock.json']) await put(root, 'scripts/rebuild/browser-tooling/' + name, await readFile(join(checkedScripts, 'browser-tooling', name)));
}
const configOnly = (root, env = {}) => prepareBrowser({ harnessRoot: root, env, requireFixtures: false, requireTooling: false });
const fingerprint = (root, env = {}) => candidateFingerprint({ harnessRoot: root, env, readCommit: () => 'fixture-commit' });
async function exists(path) { try { await readFile(path); return true; } catch (error) { if (error.code === 'ENOENT') return false; throw error; } }

test('public checkout falls back to repository root without worktrees or runtimes', async (t) => {
  const root = await sandbox(t); await checkout(root); await harness(root);
  const paths = resolveBrowserPaths({ harnessRoot: root, env: {} });
  assert.equal(paths.candidate, root);
  const prepared = await configOnly(root);
  assert.equal(prepared.candidate, root);
  assert.equal(prepared.fixturesVerified, false);
  assert.equal(prepared.toolingReady, false);
  assert.equal(await exists(paths.config), true);
  assert.equal(await exists(paths.runtimes), false);
  assert.deepEqual(await readdir(join(root, '.rebuild.local')), ['portable']);
});

test('workspace prefers the existing nested candidate, and explicit env selects a different source', async (t) => {
  const root = await sandbox(t); await checkout(root, 'parent'); await harness(root);
  const nested = join(root, '.rebuild.local/worktrees/candidate'); await checkout(nested, 'nested');
  const explicit = join(root, 'candidate with spaces'); await checkout(explicit, 'explicit');
  assert.equal(resolveBrowserPaths({ harnessRoot: root, env: {} }).candidate, nested);
  assert.equal(resolveBrowserPaths({ harnessRoot: root, env: { LINKAGE_CANDIDATE_DIR: explicit } }).candidate, explicit);
  assert.equal(resolveBrowserPaths({ harnessRoot: root, env: { LINKAGE_CANDIDATE_DIR: 'candidate with spaces' } }).candidate, explicit);
  const prepared = await configOnly(root, { LINKAGE_CANDIDATE_DIR: explicit });
  const generated = await readFile(prepared.config, 'utf8');
  assert.ok(generated.includes(pathToFileURL(join(explicit, 'vite.config.ts')).href));
  assert.ok(!generated.includes(pathToFileURL(join(nested, 'vite.config.ts')).href));
});

test('bad explicit source fails instead of falling back to a different checkout', async (t) => {
  const root = await sandbox(t); await checkout(root);
  for (const value of ['', ' ', 'missing', 'src']) assert.throws(() => resolveBrowserPaths({ harnessRoot: root, env: { LINKAGE_CANDIDATE_DIR: value } }));
  assert.equal(await exists(join(root, '.rebuild.local/runtimes.json')), false);
});

test('config preparation is idempotent and never alters existing runtime/config/source files', async (t) => {
  const root = await sandbox(t); await checkout(root); await harness(root);
  const runtime = await put(root, '.rebuild.local/runtimes.json', '{"untouched":"runtime"}');
  const legacy = await put(root, '.rebuild.local/configs/candidate.config.mjs', 'original workspace config');
  const paths = await configOnly(root); const before = await readFile(paths.config);
  await configOnly(root);
  assert.deepEqual(await readFile(paths.config), before);
  assert.equal(await readFile(runtime, 'utf8'), '{"untouched":"runtime"}');
  assert.equal(await readFile(legacy, 'utf8'), 'original workspace config');
  assert.equal(await readFile(join(root, 'src/file.ts'), 'utf8'), 'fixture candidate');
  await writeFile(paths.config, 'different generated config');
  await assert.rejects(configOnly(root), /Refusing to overwrite/);
  assert.equal(await readFile(paths.config, 'utf8'), 'different generated config');
});

test('full suite refuses absent private originals before config/archive/tooling writes', async (t) => {
  const root = await sandbox(t); await checkout(root); await harness(root);
  await assert.rejects(prepareBrowser({ harnessRoot: root, env: {} }), /Private fixtures are required/);
  assert.equal(await exists(join(root, '.rebuild.local/portable/configs/candidate.config.mjs')), false);
  assert.equal(await exists(join(root, '.rebuild.local/runtimes.json')), false);
});

test('fixed public fixture contract contains only canonical names, known original names and exact SHA256 pins', () => {
  assert.deepEqual(PRIVATE_FIXTURES, [
    { name: 'airer.slinker', original: 'Flap - Winged Airer (1).slinker', sha256: '8e73fd936565d2c4df4d549bcc584c438c894f717da6e54ad328a8b3ffd5e0eb' },
    { name: 'working-screen.json', original: 'WorkingScreenLow.slinker 1 (1).json', sha256: '4f1e389186a478e7e4cd7876914b072d20a964b1130718c1f62766c57dba4c07' },
  ]);
  assert.equal(Object.isFrozen(PRIVATE_FIXTURES), true);
  assert.ok(PRIVATE_FIXTURES.every(Object.isFrozen));
});

test('canonical and original filenames are recognized but incorrect hashes are always refused', async (t) => {
  const root = await sandbox(t); await checkout(root); await harness(root);
  const fixtures = join(root, 'private inputs'); await mkdir(fixtures);
  await assert.rejects(verifyFixtures(fixtures, { originals: true }), /Missing private fixture airer/);
  await put(fixtures, PRIVATE_FIXTURES[0].original, 'synthetic hash mismatch, not a mechanism');
  await assert.rejects(verifyFixtures(fixtures, { originals: true }), /SHA256 mismatch: airer/);
  await assert.rejects(prepareBrowser({ harnessRoot: root, env: { LINKAGE_FIXTURE_DIR: fixtures }, requireTooling: false }), /SHA256 mismatch/);
  assert.equal(await exists(join(root, '.rebuild.local/runtimes.json')), false);
  await put(fixtures, PRIVATE_FIXTURES[0].name, 'another synthetic mismatch');
  await assert.rejects(verifyFixtures(fixtures), /SHA256 mismatch: airer/);
});

test('empty fixture env and malformed/missing existing archives are refused without replacing runtimes', async (t) => {
  const root = await sandbox(t); await checkout(root); await harness(root);
  await assert.rejects(prepareBrowser({ harnessRoot: root, env: { LINKAGE_FIXTURE_DIR: '' }, requireTooling: false }), /nonempty/);
  const runtimePath = await put(root, '.rebuild.local/runtimes.json', '{"archive":"relative"}');
  const run = () => prepareBrowser({ harnessRoot: root, env: {}, requireTooling: false });
  await assert.rejects(run(), /must be absolute/);
  assert.equal(await readFile(runtimePath, 'utf8'), '{"archive":"relative"}');
  const body = JSON.stringify({ archive: join(root, 'missing-archive') }); await writeFile(runtimePath, body);
  await assert.rejects(run(), /Missing private fixture/);
  assert.equal(await readFile(runtimePath, 'utf8'), body);
  await writeFile(runtimePath, 'not-json'); await assert.rejects(run(), SyntaxError);
  assert.equal(await readFile(runtimePath, 'utf8'), 'not-json');
});

test('tooling package+lock are pinned to existing 1.65.1 tarball integrity, and default preparation never installs', async (t) => {
  const root = await sandbox(t); await checkout(root); await harness(root);
  const manifest = JSON.parse(await readFile(join(checkedScripts, 'browser-tooling/package.json')));
  const lock = JSON.parse(await readFile(join(checkedScripts, 'browser-tooling/package-lock.json')));
  assert.equal(manifest.dependencies.playwright, '1.65.1');
  assert.equal(lock.packages[''].dependencies.playwright, '1.65.1');
  assert.equal(lock.packages['node_modules/playwright'].version, '1.65.1');
  assert.equal(lock.packages['node_modules/playwright-core'].version, '1.65.1');
  assert.equal(lock.packages['node_modules/playwright'].integrity, 'sha512-vJ1FuoOrNwOKHUIVEvSt3jT1L+wjjDpwhwIstKtfvTh8XIG4FG4bIFuvNdMxi81LGfAhUgUZleVFaOLY4RIUUw==');
  let calls = 0;
  await assert.rejects(prepareBrowser({ harnessRoot: root, env: {}, requireFixtures: false, run() { calls++; } }), /Pinned Playwright/);
  assert.equal(calls, 0);
  assert.deepEqual(await readFile(join(root, '.rebuild.local/tooling/package-lock.json')), await readFile(join(checkedScripts, 'browser-tooling/package-lock.json')));
});

test('explicit tooling install runs npm ci only in ignored tooling with scripts/browser downloads disabled', async (t) => {
  const root = await sandbox(t); await checkout(root); await harness(root);
  const paths = resolveBrowserPaths({ harnessRoot: root, env: {} });
  const calls = [];
  await assert.rejects(prepareBrowser({ harnessRoot: root, env: {}, requireFixtures: false, installTooling: true, run(file, args, options) { calls.push({ file, args, options }); } }), /Pinned Playwright/);
  assert.equal(calls.length, 1);
  assert.deepEqual(calls[0].args.slice(-4), ['ci', '--ignore-scripts', '--no-audit', '--no-fund']);
  assert.equal(calls[0].options.cwd, paths.tooling);
  assert.equal(calls[0].options.env.PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD, '1');
});

test('already installed pinned tooling is reused; wrong versions are refused without reinstall', async (t) => {
  const root = await sandbox(t); await checkout(root); await harness(root);
  for (const name of ['playwright', 'playwright-core']) await put(root, '.rebuild.local/tooling/node_modules/' + name + '/package.json', '{"version":"1.65.1"}');
  await put(root, '.rebuild.local/tooling/node_modules/playwright/index.mjs', 'export {};');
  const prepared = await prepareBrowser({ harnessRoot: root, env: {}, requireFixtures: false, run() { assert.fail('must not install'); } });
  assert.equal(prepared.toolingReady, true);
  await put(root, '.rebuild.local/tooling/node_modules/playwright-core/package.json', '{"version":"1.65.0"}');
  await assert.rejects(prepareBrowser({ harnessRoot: root, env: {}, requireFixtures: false }), /Pinned Playwright/);
});

test('real source fingerprints work without cloud mock file and track source/config/observer changes', async (t) => {
  const root = await sandbox(t); await checkout(root); await harness(root); await configOnly(root);
  const baseline = await fingerprint(root);
  assert.equal(baseline.cloudBoundary, 'real'); assert.equal(baseline.commit, 'fixture-commit');
  assert.match(baseline.sourceSha256, /^[a-f0-9]{64}$/);
  assert.deepEqual(await fingerprint(root), baseline);
  for (const path of ['src/file.ts', '.rebuild.local/portable/configs/candidate.config.mjs', 'scripts/rebuild/observation-config.mjs', 'redirect.html', 'package-lock.json']) {
    const original = await readFile(join(root, path)); await put(root, path, Buffer.concat([original, Buffer.from('\nchanged')]));
    assert.notEqual((await fingerprint(root)).sourceSha256, baseline.sourceSha256, path);
    await put(root, path, original);
  }
});

test('cloud mock is optional in real mode, required and fingerprinted in mock mode; mode cannot collide', async (t) => {
  const root = await sandbox(t); await checkout(root); await harness(root); await configOnly(root);
  const real = await fingerprint(root);
  await assert.rejects(fingerprint(root, { LINKAGE_CLOUD_MOCK: '1' }), /ENOENT/);
  const mockPath = await put(root, 'scripts/rebuild/fixtures/msal-boundary.mjs', 'test mock A');
  assert.deepEqual(await fingerprint(root), real);
  const mock = await fingerprint(root, { LINKAGE_CLOUD_MOCK: '1' });
  assert.equal(mock.cloudBoundary, 'mock'); assert.notEqual(mock.sourceSha256, real.sourceSha256);
  assert.equal(mock.sourceFiles, real.sourceFiles + 1);
  await writeFile(mockPath, 'test mock B');
  assert.notEqual((await fingerprint(root, { LINKAGE_CLOUD_MOCK: '1' })).sourceSha256, mock.sourceSha256);
  assert.deepEqual(await fingerprint(root), real);
  await assert.rejects(fingerprint(root, { LINKAGE_CLOUD_MOCK: 'yes' }), /must be 0 or 1/);
});
test('hosting base override is validated and cannot share another path fingerprint', async (t) => {
  const root=await sandbox(t);await checkout(root);await harness(root);await configOnly(root);
  const baseline=await fingerprint(root),lower=await fingerprint(root,{VITE_BASE_PATH:'/linkage-studio/'});
  assert.equal(baseline.base,'/LinkageStudio/');assert.notEqual(lower.sourceSha256,baseline.sourceSha256);
  await assert.rejects(fingerprint(root,{VITE_BASE_PATH:'https://example.test/'}),/Invalid VITE_BASE_PATH/);
});

test('fingerprint selects explicit source rather than the nested/parent tree', async (t) => {
  const root = await sandbox(t); await checkout(root, 'root'); await harness(root);
  const nested = join(root, '.rebuild.local/worktrees/candidate'); await checkout(nested, 'nested');
  const explicit = join(root, 'chosen'); await checkout(explicit, 'chosen');
  const env = { LINKAGE_CANDIDATE_DIR: explicit }; await configOnly(root, env);
  const baseline = await fingerprint(root, env);
  await put(root, 'src/file.ts', 'parent changed'); await put(nested, 'src/file.ts', 'nested changed');
  assert.deepEqual(await fingerprint(root, env), baseline);
  await put(explicit, 'src/file.ts', 'chosen changed');
  assert.notEqual((await fingerprint(root, env)).sourceSha256, baseline.sourceSha256);
});

test('generated config imports the chosen candidate and exposes cloned read-only getters, including Sets/Maps', async (t) => {
  const root = await sandbox(t); await checkout(root); await harness(root);
  await put(root, 'scripts/rebuild/candidate-fingerprint.mjs', 'export async function candidateFingerprint(){ return { sourceSha256: "test-fingerprint" }; }');
  const paths = await configOnly(root);
  const savedMode = process.env.LINKAGE_CLOUD_MOCK;
  let config;
  try {
    delete process.env.LINKAGE_CLOUD_MOCK;
    config = (await import(pathToFileURL(paths.config).href)).default;
  } finally {
    if (savedMode === undefined) delete process.env.LINKAGE_CLOUD_MOCK;
    else process.env.LINKAGE_CLOUD_MOCK = savedMode;
  }
  assert.equal(config.root, root);
  assert.equal(config.resolve.alias.existing, 'preserved');
  const plugin = config.plugins.at(-1);
  assert.equal(plugin.transform('export {};', '/unrelated/src/store/editor-store.ts'), undefined);
  const transformed = plugin.transform('const useEditorStore = binding;', join(root, 'src/store/editor-store.ts') + '?v=1');
  assert.ok(transformed.includes('.getState()'));
  assert.ok(!transformed.includes('.setState('));
  assert.ok(!transformed.includes('import('));
  const saved = Object.getOwnPropertyDescriptor(globalThis, '__LINKAGE_G0_READ__');
  const state = { selectedIds: new Set(['joint-a']), excludedBodies: new Map([['body-a', true]]), camera: { zoom: 1 } };
  try {
    Reflect.deleteProperty(globalThis, '__LINKAGE_G0_READ__');
    Function('binding', transformed)({ getState: () => state });
    const read = globalThis.__LINKAGE_G0_READ__.editor;
    assert.deepEqual(read().selectedIds, ['joint-a']); assert.deepEqual(read().excludedBodies, { 'body-a': true });
    const output = read(); output.camera.zoom = 100; output.selectedIds.push('mutated');
    assert.equal(state.camera.zoom, 1); assert.deepEqual([...state.selectedIds], ['joint-a']);
    const html = await plugin.transformIndexHtml('<html/>');
    assert.equal(JSON.parse(html.tags[0].attrs.content).sourceSha256, 'test-fingerprint');
  } finally { if (saved) Object.defineProperty(globalThis, '__LINKAGE_G0_READ__', saved); else Reflect.deleteProperty(globalThis, '__LINKAGE_G0_READ__'); }
});

test('mock alias config preserves existing resolver settings and uses exact MSAL package match', async (t) => {
  const root = await sandbox(t); await checkout(root); await harness(root);
  await put(root, 'scripts/rebuild/candidate-fingerprint.mjs', 'export async function candidateFingerprint(){ return {}; }');
  const paths = await configOnly(root);
  const generated = observationConfig(paths);
  assert.ok(generated.includes('...original.resolve'));
  assert.ok(generated.includes('...aliases'));
  assert.ok(generated.includes('/^@azure\\/msal-browser$/'));
  assert.ok(generated.includes(JSON.stringify(paths.mock)));
  assert.ok(!generated.includes('setState('));
  assert.ok(generated.includes('const candidate = ' + JSON.stringify(paths.candidate)));
  assert.ok(!generated.includes(JSON.stringify(join(root, '.rebuild.local/worktrees/candidate'))));
  const savedMode = process.env.LINKAGE_CLOUD_MOCK;
  try {
    process.env.LINKAGE_CLOUD_MOCK = '1';
    const config = (await import(pathToFileURL(paths.config).href)).default;
    assert.deepEqual(config.resolve.conditions, ['custom']);
    assert.equal(config.resolve.alias[0].find.test('@azure/msal-browser'), true);
    assert.equal(config.resolve.alias[0].find.test('@azure/msal-browser/subpath'), false);
    assert.equal(config.resolve.alias[0].replacement, paths.mock);
    assert.deepEqual(config.resolve.alias[1], { find: 'existing', replacement: 'preserved' });
  } finally {
    if (savedMode === undefined) delete process.env.LINKAGE_CLOUD_MOCK;
    else process.env.LINKAGE_CLOUD_MOCK = savedMode;
  }
});

test('rendered fingerprint mismatch or missing identity is refused', async () => {
  const page = (value) => ({ locator: () => ({ getAttribute: async () => value }) });
  await assert.rejects(assertCandidateBuild(page(null), { sourceSha256: 'expected' }), /no test identity/);
  await assert.rejects(assertCandidateBuild(page('{"sourceSha256":"stale"}'), { sourceSha256: 'expected' }), /does not match/);
  assert.deepEqual(await assertCandidateBuild(page('{"sourceSha256":"expected"}'), { sourceSha256: 'expected' }), { sourceSha256: 'expected' });
});

test('proposed build/run entry points are import-safe and reject before any browser/server on invalid inputs', async (t) => {
  assert.equal(typeof buildGate, 'function'); assert.equal(typeof runG9, 'function');
  await assert.rejects(buildGate('../unsafe'), /Provide a gate ID/);
  const root = await sandbox(t); await checkout(root); await harness(root);
  await assert.rejects(runG9({ harnessRoot: root, env: {} }), /Cloud mock boundary is missing/);
  await put(root, 'scripts/rebuild/fixtures/msal-boundary.mjs', 'unused mock marker');
  await assert.rejects(runG9({ harnessRoot: root, env: {} }), /Private fixtures are required/);
});

test('wrong existing tooling manifest is preserved and refused, not rewritten', async (t) => {
  const root = await sandbox(t); await checkout(root); await harness(root);
  const path = await put(root, '.rebuild.local/tooling/package.json', '{"user":"owned"}');
  await assert.rejects(prepareBrowser({ harnessRoot: root, env: {}, requireFixtures: false }), /Refusing to overwrite/);
  assert.equal(await readFile(path, 'utf8'), '{"user":"owned"}');
});

test('fixtures are not embedded anywhere in the package, and lock integrity strings are not fixture hashes', async () => {
  const bytes = await readFile(join(checkedScripts, 'prepare-browser.mjs'), 'utf8');
  assert.ok(!bytes.includes('g6kFted7Nm')); assert.ok(!bytes.includes('restLength'));
  assert.equal(createHash('sha256').update('synthetic hash mismatch, not a mechanism').digest('hex') === PRIVATE_FIXTURES[0].sha256, false);
});
