import { createHash } from 'node:crypto';
import { mkdir, mkdtemp, readdir, readFile, copyFile, writeFile } from 'node:fs/promises';
import { join, relative, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../../', import.meta.url));
const staging = join(root, '.rebuild.local/evidence/g0');
const parent = join(root, '.rebuild.local/evidence/g0-runs');
await mkdir(parent, { recursive: true });
const stamp = new Date().toISOString().replaceAll(':', '-').replaceAll('.', '-');
const output = await mkdtemp(join(parent, `${stamp}-`));
const artifacts = [];
async function walk(path) {
  const entries = await readdir(path, { withFileTypes:true });
  const files = [];
  for (const entry of entries) {
    const name = join(path, entry.name);
    if (entry.isDirectory()) files.push(...await walk(name));
    else if (entry.isFile()) files.push(name);
  }
  return files;
}
async function capture(source, name) {
  const target = join(output, name);
  await mkdir(dirname(target), { recursive:true });
  await copyFile(source, target);
  const bytes = await readFile(target);
  artifacts.push({ path:name.replaceAll('\\','/'), bytes:bytes.length,
    sha256:createHash('sha256').update(bytes).digest('hex') });
}
for (const file of await walk(staging)) await capture(file, join('captures',relative(staging,file)));
const runtimesPath = join(root, '.rebuild.local/runtimes.json');
const runtimes = JSON.parse(await readFile(runtimesPath,'utf8'));
await capture(runtimesPath,'runtimes.json');
for (const target of runtimes.targets) await capture(target.config,`configs/${target.id}.config.mjs`);
for (const file of await walk(join(root,'scripts/rebuild'))) await capture(file,join('tooling',relative(join(root,'scripts/rebuild'),file)));
const manifest = { createdAt:new Date().toISOString(), purpose:'Sealed G0 evidence; no gate acceptance implied.',
  sourceBaseline:'.rebuild.local/baselines/2026-11-15T18-45-10-493Z-CMbWTX/manifest.json',
  artifacts };
await writeFile(join(output,'manifest.json'),`${JSON.stringify(manifest,null,2)}\n`,{flag:'wx'});
console.log(JSON.stringify({directory:relative(root,output),artifacts:artifacts.length},null,2));
