import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdir, mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../../', import.meta.url));
const upstream = '3dfe10512e105f863a582ce5cc4b3bb8a2006306';
const sha256 = (bytes) => createHash('sha256').update(bytes).digest('hex');
const git = (...args) => execFileSync('git', ['-C', root, ...args], {
  encoding: 'utf8',
  maxBuffer: 32 * 1024 * 1024,
});

// Read-only Git operations and a fresh ignored output folder preserve the workspace.
const head = git('rev-parse', 'HEAD').trim();
git('cat-file', '-e', `${upstream}^{commit}`);
const ignoredParent = join(root, '.rebuild.local');
const ignoreCheck = git('check-ignore', '--', '.rebuild.local/probe');
if (!ignoreCheck.trim()) throw new Error('Archive directory must be Git-ignored.');
await mkdir(join(ignoredParent, 'baselines'), { recursive: true });
const stamp = new Date().toISOString().replaceAll(':', '-').replaceAll('.', '-');
const output = await mkdtemp(join(ignoredParent, 'baselines', `${stamp}-`));
const artifacts = [];

async function save(name, bytes) {
  const data = Buffer.isBuffer(bytes) ? bytes : Buffer.from(bytes, 'utf8');
  const destination = join(output, name);
  await mkdir(dirname(destination), { recursive: true });
  await writeFile(destination, data, { flag: 'wx' });
  artifacts.push({ path: name.replaceAll('\\', '/'), bytes: data.length, sha256: sha256(data) });
}

for (const [label, commit] of [['upstream', upstream], ['local-head', head]]) {
  const filename = `${label}.zip`;
  git('archive', '--format=zip', `--output=${join(output, filename)}`, commit);
  const bytes = await readFile(join(output, filename));
  artifacts.push({ path: filename, bytes: bytes.length, sha256: sha256(bytes) });
}
await save('working-tree.patch', git('diff', 'HEAD', '--binary', '--full-index', '--no-ext-diff'));
await save('staged.patch', git('diff', '--cached', '--binary', '--full-index', '--no-ext-diff'));
await save('status.txt', git('status', '--short'));
await save('package-lock.json', await readFile(join(root, 'package-lock.json')));

const untrackedSource = git('ls-files', '--others', '--exclude-standard', '-z', '--', 'src')
  .split('\0').filter(Boolean);
for (const path of untrackedSource) {
  await save(join('untracked-source', path), await readFile(join(root, path)));
}

const inputs = [
  {
    id: 'airer',
    source: 'C:/Users/jaket/Downloads/Flap - Winged Airer (1).slinker',
    name: 'fixtures/airer.slinker',
    expectedSha256: '8E73FD936565D2C4DF4D549BCC584C438C894F717DA6E54AD328A8B3FFD5E0EB',
    required: true,
  },
  {
    id: 'working-screen',
    source: 'C:/Users/jaket/Downloads/WorkingScreenLow.slinker 1 (1).json',
    name: 'fixtures/working-screen.json',
    expectedSha256: '4F1E389186A478E7E4CD7876914B072D20A964B1130718C1F62766C57DBA4C07',
    required: true,
  },
  {
    id: 'historical-airer-open',
    source: 'C:/Users/jaket/AppData/Local/Temp/codex-clipboard-67361434-4776-4ea9-9d58-852b4de90201.png',
    name: 'references/historical-airer-open.png',
    required: false,
  },
  {
    id: 'historical-airer-stuck',
    source: 'C:/Users/jaket/AppData/Local/Temp/codex-clipboard-d3dec47e-f0cc-4dbc-87c7-fbc5ef890594.png',
    name: 'references/historical-airer-stuck.png',
    required: false,
  },
];
const capturedInputs = [];
for (const input of inputs) {
  let bytes;
  try {
    bytes = await readFile(input.source);
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
    capturedInputs.push({ ...input, status: 'MISSING' });
    continue;
  }
  const hash = sha256(bytes);
  const matches = !input.expectedSha256 || hash.toUpperCase() === input.expectedSha256;
  await save(input.name, bytes);
  capturedInputs.push({ ...input, sha256: hash, status: matches ? 'ARCHIVED' : 'HASH_MISMATCH' });
}

const complete = capturedInputs.filter((entry) => entry.required)
  .every((entry) => entry.status === 'ARCHIVED');
const manifest = {
  formatVersion: 1,
  createdAt: new Date().toISOString(),
  head,
  upstream,
  mergeBase: git('merge-base', head, upstream).trim(),
  node: process.version,
  platform: process.platform,
  captureScriptSha256: sha256(await readFile(fileURLToPath(import.meta.url))),
  baselineInputsComplete: complete,
  browserGatePassed: false,
  scope: 'Committed source archives + tracked diff from HEAD + untracked src files + specified fixtures/references. No dependencies, credentials or full browser state.',
  restore: 'Extract local-head.zip into a separate directory, apply working-tree.patch there, then copy untracked-source/src into its src. Do not apply staged.patch a second time; it is staging evidence only.',
  inputs: capturedInputs,
  artifacts,
};
await writeFile(join(output, 'manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`, { flag: 'wx' });
console.log(JSON.stringify({
  manifest: relative(root, join(output, 'manifest.json')),
  baselineInputsComplete: complete,
  inputs: capturedInputs.map(({ id, status }) => ({ id, status })),
  artifactCount: artifacts.length,
}, null, 2));
if (!complete) process.exitCode = 1;
