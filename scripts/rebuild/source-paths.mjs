import { existsSync, realpathSync, statSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

export const defaultHarnessRoot = fileURLToPath(new URL('../../', import.meta.url));

export function resolveBrowserPaths({ harnessRoot = defaultHarnessRoot, env = process.env } = {}) {
  const root = realpathSync(resolve(harnessRoot));
  const nested = join(root, '.rebuild.local/worktrees/candidate');
  const explicit = env.LINKAGE_CANDIDATE_DIR;
  if (explicit !== undefined && !explicit.trim()) throw new Error('LINKAGE_CANDIDATE_DIR must be a nonempty directory.');
  const candidate = realpathSync(explicit !== undefined ? resolve(root, explicit) : existsSync(nested) ? nested : root);
  // Harness scripts may be in the parent workspace; source is never aliased by a junction.
  for (const name of ['package.json', 'vite.config.ts']) {
    if (!statSync(join(candidate, name)).isFile()) throw new Error(`Candidate is missing ${name}.`);
  }
  if (!statSync(join(candidate, 'src')).isDirectory()) throw new Error('Candidate is missing src/.');
  return {
    root, candidate, local: join(root, '.rebuild.local'), tooling: join(root, '.rebuild.local/tooling'),
    config: join(root, '.rebuild.local/portable/configs/candidate.config.mjs'),
    runtimes: join(root, '.rebuild.local/runtimes.json'),
    archive: join(root, '.rebuild.local/portable/archive'),
    mock: join(root, 'scripts/rebuild/fixtures/msal-boundary.mjs'),
    fingerprint: join(root, 'scripts/rebuild/candidate-fingerprint.mjs'),
    toolingTemplate: join(root, 'scripts/rebuild/browser-tooling'),
  };
}

export function isMain(metaUrl) {
  return !!process.argv[1] && resolve(process.argv[1]) === fileURLToPath(metaUrl);
}

export function npmInvocation() {
  const cli = process.env.npm_execpath ?? join(dirname(process.execPath), 'node_modules/npm/bin/npm-cli.js');
  return existsSync(cli)
    ? { file: process.execPath, prefix: [cli], shell: false }
    : { file: process.platform === 'win32' ? 'npm.cmd' : 'npm', prefix: [], shell: process.platform === 'win32' };
}
