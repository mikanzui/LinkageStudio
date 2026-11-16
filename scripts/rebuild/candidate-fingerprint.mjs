import { createHash } from 'node:crypto';
import { readFile, readdir } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import { join, relative } from 'node:path';
import { resolveBrowserPaths } from './source-paths.mjs';

async function walk(dir) {
  const files = [];
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    if (entry.isSymbolicLink()) throw new Error('Source fingerprint refuses symlinks/junctions.');
    if (entry.isDirectory()) files.push(...await walk(path));
    else if (entry.isFile()) files.push(path);
    else throw new Error('Source fingerprint encountered a nonregular file.');
  }
  return files;
}

export async function candidateFingerprint({ harnessRoot, candidateDir, configPath, env = process.env,
  readCommit = (cwd) => execFileSync('git', ['rev-parse', 'HEAD'], { cwd, encoding: 'utf8', windowsHide: true }).trim(),
} = {}) {
  const paths = resolveBrowserPaths({ harnessRoot, env: candidateDir ? { ...env, LINKAGE_CANDIDATE_DIR: candidateDir } : env });
  if (env.LINKAGE_CLOUD_MOCK !== undefined && !['0', '1'].includes(env.LINKAGE_CLOUD_MOCK)) throw new Error('LINKAGE_CLOUD_MOCK must be 0 or 1.');
  const mode = env.LINKAGE_CLOUD_MOCK === '1' ? 'mock' : 'real';
  const base = env.VITE_BASE_PATH || '/LinkageStudio/';
  if (!/^\/(?:[A-Za-z0-9_-]+\/)*$/.test(base)) throw new Error('Invalid VITE_BASE_PATH.');
  const hash = createHash('sha256');
  hash.update('cloudBoundary=' + mode + '\0');
  hash.update('base=' + base + '\0');
  const source = [...await walk(join(paths.candidate, 'src')), ...await walk(join(paths.candidate, 'public')),
    ...['index.html', 'redirect.html', 'package.json', 'package-lock.json', 'vite.config.ts', 'tsconfig.app.json', 'tsconfig.json', 'eslint.config.js'].map((name) => join(paths.candidate, name))];
  const files = source.map((path) => ({ path, label: 'candidate/' + relative(paths.candidate, path).replaceAll('\\', '/') }));
  files.push({ path: configPath ?? paths.config, label: 'observer/config.mjs' });
  for (const name of ['candidate-fingerprint.mjs', 'source-paths.mjs', 'observation-config.mjs']) files.push({ path: join(paths.root, 'scripts/rebuild', name), label: 'observer/' + name });
  if (mode === 'mock') files.push({ path: paths.mock, label: 'observer/msal-boundary.mjs' });
  files.sort((a, b) => a.label < b.label ? -1 : a.label > b.label ? 1 : 0);
  for (const { path, label } of files) {
    hash.update(label); hash.update('\0'); hash.update(await readFile(path)); hash.update('\0');
  }
  return { commit: readCommit(paths.candidate), sourceSha256: hash.digest('hex'), sourceFiles: files.length, cloudBoundary: mode, base };
}

export async function assertCandidateBuild(page, expected) {
  const raw = await page.locator('meta[name="linkage-g0-build"]').getAttribute('content');
  if (!raw) throw new Error('The rendered build has no test identity.');
  const actual = JSON.parse(raw);
  if (actual.sourceSha256 !== expected.sourceSha256) throw new Error('Rendered build does not match the pinned source fingerprint. Rebuild the preview.');
  return actual;
}
