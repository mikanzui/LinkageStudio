import { createHash } from 'node:crypto';
import { readFile, readdir } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
const root = fileURLToPath(new URL('../../', import.meta.url));
const candidate = join(root, '.rebuild.local/worktrees/candidate');
async function walk(dir) {
  const files = [];
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) files.push(...await walk(path)); else if (entry.isFile()) files.push(path);
  }
  return files;
}
export async function candidateFingerprint() {
  const hash = createHash('sha256');
  const files = [...await walk(join(candidate, 'src')), ...await walk(join(candidate, 'public')), ...['index.html', 'package.json', 'package-lock.json', 'vite.config.ts', 'tsconfig.app.json', 'tsconfig.json', 'eslint.config.js'].map(f => join(candidate, f)), join(root,'.rebuild.local/configs/candidate.config.mjs')].sort();
  for (const path of files) { hash.update(relative(root,path).replaceAll('\\', '/')); hash.update('\0'); hash.update(await readFile(path)); hash.update('\0'); }
  return { commit: execFileSync('git', ['rev-parse', 'HEAD'], { cwd: candidate, encoding: 'utf8' }).trim(), sourceSha256: hash.digest('hex'), sourceFiles: files.length };
}

export async function assertCandidateBuild(page, expected) {
  const raw = await page.locator('meta[name="linkage-g0-build"]').getAttribute('content');
  if (!raw) throw new Error('The rendered build has no test identity.');
  const actual = JSON.parse(raw);
  if (actual.sourceSha256 !== expected.sourceSha256) throw new Error('Rendered build does not match the pinned source fingerprint. Rebuild the preview.');
  return actual;
}
