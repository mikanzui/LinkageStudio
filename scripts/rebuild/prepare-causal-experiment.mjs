import { readFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';

const root = fileURLToPath(new URL('../../', import.meta.url));
const file = join(root, '.rebuild.local/runtimes.json');
const runtimes = JSON.parse(await readFile(file, 'utf8'));
if (runtimes.targets.some((target) => target.id === 'local-causal')) throw new Error('Experiment already exists.');
const local = runtimes.targets.find((target) => target.id === 'local');
const before = 'if (!(link.restLength > LINK_EPSILON) && currentLength > LINK_EPSILON) {';
const after = 'if (!Number.isFinite(link.restLength) || link.restLength < 0) {';
const source = await readFile(join(local.path, 'src/utils/mechanism-sim-validation.ts'), 'utf8');
if (source.split(before).length !== 2) throw new Error('Expected exactly one validation guard.');
const config = join(root, '.rebuild.local/configs/local-causal.config.mjs');
const experiment = {
  purpose: 'Single-guard causal experiment only; not a qualified rebuild fix.',
  path: 'src/utils/mechanism-sim-validation.ts', before, after,
  originalSourceSha256: createHash('sha256').update(source).digest('hex'),
};
await writeFile(config, `
import base from './local.config.mjs';
const experiment = ${JSON.stringify(experiment)};
export default {
  ...base,
  server: {...base.server, port:5184},
  plugins: [...base.plugins, {
    name:'g0-validation-causal-experiment', enforce:'pre',
    transform(code,id) {
      if (id.split('?')[0].replaceAll('\\\\','/').endsWith('/src/utils/mechanism-sim-validation.ts')) {
        if (code.split(experiment.before).length !== 2) throw new Error('Causal guard precondition failed');
        return code.replace(experiment.before,experiment.after);
      }
    },
    transformIndexHtml() {
      return [{tag:'meta',attrs:{name:'linkage-g0-experiment',content:JSON.stringify(experiment)},injectTo:'head'}];
    }
  }]
};
`, { flag: 'wx' });
runtimes.targets.push({ ...local, id:'local-causal',port:5184,config,
  url:'http://127.0.0.1:5184/LinkageStudio/',experiment });
await writeFile(file, `${JSON.stringify(runtimes, null, 2)}\n`);
console.log(JSON.stringify(experiment,null,2));
