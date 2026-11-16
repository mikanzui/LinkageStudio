import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync } from 'node:fs';
import { cp, mkdir, readFile, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../../', import.meta.url));
const archive = join(root, '.rebuild.local/baselines/2026-11-15T18-45-10-493Z-CMbWTX');
const manifest = JSON.parse(await readFile(join(archive, 'manifest.json'), 'utf8'));
const sha = (data) => createHash('sha256').update(data).digest('hex');
const git = (args, cwd = root) => execFileSync('git', args, { cwd, encoding: 'utf8' });
for (const artifact of manifest.artifacts) {
  if (sha(await readFile(join(archive, artifact.path))) !== artifact.sha256) {
    throw new Error(`Archive integrity failed: ${artifact.path}`);
  }
}

const targets = [
  { id: 'upstream', commit: manifest.upstream, port: 5181, base: '/linkage-studio/' },
  { id: 'local', commit: manifest.head, port: 5182, base: '/LinkageStudio/', patch: true },
  { id: 'candidate', commit: manifest.upstream, port: 5183, base: '/linkage-studio/' },
];
const configDir = join(root, '.rebuild.local/configs');
await mkdir(configDir, { recursive: true });

for (const target of targets) {
  const path = join(root, '.rebuild.local/worktrees', target.id);
  if (existsSync(path)) throw new Error(`Will not overwrite existing worktree: ${path}`);
  const args = ['worktree', 'add'];
  if (target.id === 'candidate') args.push('-b', 'rebuild/g0-candidate');
  else args.push('--detach');
  args.push(path, target.commit);
  git(args);
  if (target.patch) {
    git(['apply', '--check', join(archive, 'working-tree.patch')], path);
    git(['apply', join(archive, 'working-tree.patch')], path);
    await cp(join(archive, 'untracked-source/src'), join(path, 'src'), { recursive: true });
  }
  target.path = path;
  target.config = join(configDir, `${target.id}.config.mjs`);
  target.url = `http://127.0.0.1:${target.port}${target.base}`;
  target.patchSha256 = target.patch
    ? manifest.artifacts.find((artifact) => artifact.path === 'working-tree.patch').sha256
    : null;
  const identity = { id: target.id, commit: target.commit, patchSha256: target.patchSha256 };
  const stores = {
    mechanism: ['useMechanismStore', 'joints, links, bodies, baseBodyId, outlines, sliders, colliders, angleConstraints, springs, forceSensors, legacySavedLinks'],
    editor: ['useEditorStore', 'mode, activeTool, createTool, camera, simDrag, savedPositions, leftCollapsed, rightCollapsed, projectName'],
    simulation: ['useSimulationStore', 'time, dof, gravityEnabled, gravityStrength, damping, dragMultiplier, dragDamping, speed, isPlaying, stepError, driverJointId, driverLinkId'],
  };
  const config = `
import original from ${JSON.stringify(`${path.replaceAll('\\', '/')}/vite.config.ts`)};
const stores = ${JSON.stringify(stores)};
const identity = ${JSON.stringify(identity)};
export default {
  ...original,
  root: ${JSON.stringify(path.replaceAll('\\', '/'))},
  cacheDir: ${JSON.stringify(`${path.replaceAll('\\', '/')}/node_modules/.vite-g0`)},
  server: { host: '127.0.0.1', port: ${target.port}, strictPort: true },
  plugins: [...original.plugins, {
    name: 'g0-read-only-observation',
    transform(code, id) {
      const clean = id.split('?')[0].replaceAll('\\\\', '/');
      for (const [name, [binding, fields]] of Object.entries(stores)) {
        if (clean.endsWith('/src/store/' + name + '-store.ts')) {
          return code + '\\n;globalThis.__LINKAGE_G0_READ__ ??= {}; globalThis.__LINKAGE_G0_READ__.' + name
            + ' = () => { const {' + fields + '} = ' + binding + '.getState(); return JSON.parse(JSON.stringify({' + fields + '})); };';
        }
      }
    },
    transformIndexHtml(html) {
      return { html, tags: [
        {tag:'meta', attrs:{name:'linkage-g0-build', content:JSON.stringify(identity)}, injectTo:'head'}
      ] };
    }
  }]
};
`;
  await writeFile(target.config, config, { flag: 'wx' });
}
await writeFile(join(root, '.rebuild.local/runtimes.json'), `${JSON.stringify({
  createdAt: new Date().toISOString(),
  archive: resolve(archive),
  identityPolicy: 'Read-only observation appended by dev-server transform to the actual store modules. No imports or state mutation from the browser test.',
  targets,
}, null, 2)}\n`, { flag: 'wx' });
console.log(JSON.stringify(targets, null, 2));
