import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { lstat, mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, isAbsolute, join, relative, resolve, sep } from 'node:path';
import { isMain, npmInvocation, resolveBrowserPaths } from './source-paths.mjs';
import { observationConfig } from './observation-config.mjs';

export const PRIVATE_FIXTURES = Object.freeze([
  Object.freeze({ name: 'airer.slinker', original: 'Flap - Winged Airer (1).slinker', sha256: '8e73fd936565d2c4df4d549bcc584c438c894f717da6e54ad328a8b3ffd5e0eb' }),
  Object.freeze({ name: 'working-screen.json', original: 'WorkingScreenLow.slinker 1 (1).json', sha256: '4f1e389186a478e7e4cd7876914b072d20a964b1130718c1f62766c57dba4c07' }),
]);
const sha = (bytes) => createHash('sha256').update(bytes).digest('hex');
const missing = (error) => error?.code === 'ENOENT';

async function optionalFile(path) {
  try { return await readFile(path); } catch (error) { if (missing(error)) return null; throw error; }
}
async function safeLocal(paths, destination) {
  const rel = relative(paths.local, resolve(destination));
  if (isAbsolute(rel) || rel === '..' || rel.startsWith('..' + sep)) throw new Error('Refusing a write outside .rebuild.local.');
  // Refuse junctions/symlinks in output ancestors rather than following them.
  let current = paths.root;
  for (const part of relative(paths.root, resolve(destination)).split(sep)) {
    current = join(current, part);
    try { if ((await lstat(current)).isSymbolicLink()) throw new Error('Refusing a symlink/junction output path.'); }
    catch (error) { if (!missing(error)) throw error; }
  }
}
async function ensureFile(paths, destination, content) {
  await safeLocal(paths, destination);
  const previous = await optionalFile(destination);
  const bytes = Buffer.isBuffer(content) ? content : Buffer.from(content);
  if (previous) {
    if (!previous.equals(bytes)) throw new Error(`Refusing to overwrite existing bootstrap file: ${destination}`);
    return false;
  }
  await mkdir(dirname(destination), { recursive: true });
  await writeFile(destination, bytes, { flag: 'wx' });
  return true;
}
export async function verifyFixtures(directory, { originals = false } = {}) {
  const found = [];
  for (const fixture of PRIVATE_FIXTURES) {
    const choices = originals ? [fixture.name, fixture.original] : [fixture.name];
    let selected;
    for (const name of choices) {
      const path = join(directory, name);
      const bytes = await optionalFile(path);
      if (bytes === null) continue;
      if (sha(bytes) !== fixture.sha256) throw new Error(`Private fixture SHA256 mismatch: ${fixture.name}`);
      selected = { ...fixture, path, bytes };
      break;
    }
    if (!selected) throw new Error(`Missing private fixture ${fixture.name}. Set LINKAGE_FIXTURE_DIR to the directory containing the two original or canonical files.`);
    found.push(selected);
  }
  return found;
}

export async function prepareBrowser({
  harnessRoot, env = process.env, requireFixtures = true, requireTooling = true,
  installTooling = false, installBrowsers = false, run = execFileSync,
} = {}) {
  const paths = resolveBrowserPaths({ harnessRoot, env });
  if (env.LINKAGE_CLOUD_MOCK !== undefined && !['0', '1'].includes(env.LINKAGE_CLOUD_MOCK)) throw new Error('LINKAGE_CLOUD_MOCK must be 0 or 1.');
  if (env.LINKAGE_CLOUD_MOCK === '1' && await optionalFile(paths.mock) === null) throw new Error('Cloud mock boundary is missing.');
  let archive = null;
  let fixtures = null;
  if (requireFixtures) {
    if (env.LINKAGE_FIXTURE_DIR !== undefined) {
      if (!env.LINKAGE_FIXTURE_DIR.trim()) throw new Error('LINKAGE_FIXTURE_DIR must be nonempty.');
      fixtures = await verifyFixtures(resolve(paths.root, env.LINKAGE_FIXTURE_DIR), { originals: true });
    }
    const existing = await optionalFile(paths.runtimes);
    if (existing) {
      const runtime = JSON.parse(existing);
      if (typeof runtime.archive !== 'string' || !isAbsolute(runtime.archive)) throw new Error('Existing runtimes.json archive must be absolute; refusing to replace it.');
      await verifyFixtures(join(runtime.archive, 'fixtures'));
      archive = runtime.archive;
    } else {
      if (!fixtures) throw new Error('Private fixtures are required for the full suite. Set LINKAGE_FIXTURE_DIR; no synthetic fallback is permitted.');
      archive = paths.archive;
      // Validate the entire pair before writing any fixture content.
      for (const fixture of fixtures) await safeLocal(paths, join(archive, 'fixtures', fixture.name));
      for (const fixture of fixtures) await ensureFile(paths, join(archive, 'fixtures', fixture.name), fixture.bytes);
    }
  }
  // Generated files never replace existing workspace configs or source files.
  await ensureFile(paths, paths.config, observationConfig(paths));
  if (requireFixtures && await optionalFile(paths.runtimes) === null) {
    const runtime = { archive, identityPolicy: 'Read-only observation of the actual source modules; private fixtures verified by SHA256.', targets: [{ id: 'candidate', path: paths.candidate, config: paths.config, port: 5183, base: '/linkage-studio/', url: 'http://127.0.0.1:5183/linkage-studio/' }] };
    await ensureFile(paths, paths.runtimes, JSON.stringify(runtime, null, 2) + '\n');
  }
  let toolingReady = false;
  if (requireTooling || installTooling || installBrowsers) {
    for (const name of ['package.json', 'package-lock.json']) await ensureFile(paths, join(paths.tooling, name), await readFile(join(paths.toolingTemplate, name)));
    async function installed() {
      const versions = await Promise.all(['playwright', 'playwright-core'].map(async (name) => {
        const bytes = await optionalFile(join(paths.tooling, 'node_modules', name, 'package.json'));
        return bytes ? JSON.parse(bytes).version : null;
      }));
      return versions.every((version) => version === '1.65.1') && await optionalFile(join(paths.tooling, 'node_modules/playwright/index.mjs')) !== null;
    }
    toolingReady = await installed();
    if (!toolingReady && installTooling) {
      await safeLocal(paths, join(paths.tooling, 'node_modules'));
      const npm = npmInvocation();
      run(npm.file, [...npm.prefix, 'ci', '--ignore-scripts', '--no-audit', '--no-fund'], { cwd: paths.tooling, env: { ...process.env, ...env, PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD: '1' }, stdio: 'inherit', windowsHide: true, shell: npm.shell });
      toolingReady = await installed();
    }
    if (!toolingReady) throw new Error('Pinned Playwright 1.65.1 tooling is absent. Run prepare-browser.mjs --install-tooling (npm ci only in ignored tooling).');
    if (installBrowsers) run(process.execPath, [join(paths.tooling, 'node_modules/playwright/cli.js'), 'install', 'chromium', 'webkit'], { cwd: paths.root, env: { ...process.env, ...env }, stdio: 'inherit', windowsHide: true });
  }
  return { ...paths, archive, fixturesVerified: requireFixtures, toolingReady };
}

if (isMain(import.meta.url)) {
  const flags = new Set(process.argv.slice(2));
  const allowed = new Set(['--config-only', '--install-tooling', '--install-browsers']);
  for (const flag of flags) if (!allowed.has(flag)) throw new Error(`Unknown bootstrap option: ${flag}`);
  const configOnly = flags.has('--config-only');
  const result = await prepareBrowser({ requireFixtures: !configOnly, requireTooling: !configOnly, installTooling: flags.has('--install-tooling'), installBrowsers: flags.has('--install-browsers') });
  console.log(JSON.stringify(result));
}
