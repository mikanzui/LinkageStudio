import { mkdir, mkdtemp, readdir, readFile, writeFile } from 'node:fs/promises';
import { join, relative } from 'node:path';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { candidateFingerprint } from './candidate-fingerprint.mjs';
import { prepareBrowser } from './prepare-browser.mjs';
import { isMain } from './source-paths.mjs';

export async function buildGate(stage, { harnessRoot, env = process.env, run = execFileSync } = {}) {
  if (!/^g\d+$/.test(stage ?? '')) throw new Error('Provide a gate ID, for example g4.');
  const paths = await prepareBrowser({ harnessRoot, env, requireFixtures: false, requireTooling: false });
  const parent = join(paths.local, 'gate-builds');
  await mkdir(parent, { recursive: true });
  const output = await mkdtemp(join(parent, stage + '-'));
  const fingerprintOptions = { harnessRoot: paths.root, candidateDir: paths.candidate, configPath: paths.config, env };
  const sourceStart = await candidateFingerprint(fingerprintOptions);
  const childEnv = { ...process.env, ...env, LINKAGE_CANDIDATE_DIR: paths.candidate };
  run(process.execPath, [join(paths.candidate, 'node_modules/typescript/bin/tsc'), '-b'], { cwd: paths.candidate, env: childEnv, stdio: 'inherit', windowsHide: true });
  // A fresh ignored output directory means no previous build is erased.
  run(process.execPath, [join(paths.candidate, 'node_modules/vite/bin/vite.js'), 'build', '--config', paths.config, '--outDir', output], { cwd: paths.candidate, env: childEnv, stdio: 'inherit', windowsHide: true });
  const sourceEnd = await candidateFingerprint(fingerprintOptions);
  if (sourceEnd.sourceSha256 !== sourceStart.sourceSha256) throw new Error('Source changed while building; this artifact cannot qualify a gate.');
  const artifacts = [];
  async function walk(dir) {
    for (const entry of await readdir(dir, { withFileTypes: true })) {
      const path = join(dir, entry.name);
      if (entry.isSymbolicLink()) throw new Error('Gate artifacts cannot be symlinks/junctions.');
      if (entry.isDirectory()) await walk(path);
      else if (entry.isFile()) {
        const bytes = await readFile(path);
        artifacts.push({ path: relative(output, path).replaceAll('\\', '/'), bytes: bytes.length, sha256: createHash('sha256').update(bytes).digest('hex') });
      }
    }
  }
  await walk(output);
  const manifest = { createdAt: new Date().toISOString(), stage, sourceStart, sourceEnd, output, artifacts };
  await writeFile(join(output, 'gate-manifest.json'), JSON.stringify(manifest, null, 2), { flag: 'wx' });
  await writeFile(join(paths.local, 'current-gate-build.json'), JSON.stringify(manifest, null, 2));
  return manifest;
}

if (isMain(import.meta.url)) {
  const manifest = await buildGate(process.argv[2]);
  console.log(JSON.stringify({ output: manifest.output, source: manifest.sourceStart, artifacts: manifest.artifacts.length }));
}
