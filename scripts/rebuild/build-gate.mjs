import { mkdir, mkdtemp, readdir, readFile, writeFile } from 'node:fs/promises';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { candidateFingerprint } from './candidate-fingerprint.mjs';
const root = fileURLToPath(new URL('../../', import.meta.url));
const stage = process.argv[2];
if (!/^g\d+$/.test(stage ?? '')) throw new Error('Provide a gate ID, for example g4.');
const parent = join(root, '.rebuild.local/gate-builds');
await mkdir(parent, { recursive: true });
const output = await mkdtemp(join(parent, stage + '-'));
const candidate = join(root, '.rebuild.local/worktrees/candidate');
const sourceStart = await candidateFingerprint();
execFileSync(process.execPath, [join(candidate, 'node_modules/typescript/bin/tsc'), '-b'], { cwd: candidate, stdio: 'inherit' });
// A fresh output directory outside source means no previous build is erased.
execFileSync(process.execPath, [join(candidate, 'node_modules/vite/bin/vite.js'), 'build', '--config',
  join(root, '.rebuild.local/configs/candidate.config.mjs'), '--outDir', output], { cwd: candidate, stdio: 'inherit' });
const sourceEnd = await candidateFingerprint();
if (sourceEnd.sourceSha256 !== sourceStart.sourceSha256) throw new Error('Source changed while building; this artifact cannot qualify a gate.');
const artifacts = [];
async function walk(dir) {
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) await walk(path);
    else if (entry.isFile()) {
      const bytes = await readFile(path);
      artifacts.push({ path: relative(output, path).replaceAll('\\', '/'), bytes: bytes.length,
        sha256: createHash('sha256').update(bytes).digest('hex') });
    }
  }
}
await walk(output);
const manifest = { createdAt: new Date().toISOString(), stage, sourceStart, sourceEnd, output, artifacts };
await writeFile(join(output, 'gate-manifest.json'), JSON.stringify(manifest, null, 2), { flag: 'wx' });
await writeFile(join(root, '.rebuild.local/current-gate-build.json'), JSON.stringify(manifest, null, 2));
console.log(JSON.stringify({ output, source: sourceStart, artifacts: artifacts.length }));
