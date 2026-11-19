import { spawn } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { createServer } from 'node:net';
import { resolveBrowserPaths } from './source-paths.mjs';

const paths = resolveBrowserPaths();
const production = process.argv.includes('--production');
const uiOnly = process.argv.includes('--ui16-only');
const bundled = process.argv.includes('--bundled-chromium');
for (const flag of process.argv.slice(2)) if (!['--production','--ui16-only','--bundled-chromium'].includes(flag)) throw new Error('Unknown option: '+flag);
if (production && uiOnly) throw new Error('Choose production or UI16 observation, not both');
if (bundled && !production) throw new Error('Bundled Chromium is qualified only for production smoke');
const manifest = production ? { output: join(paths.candidate, 'dist'), sourceStart: { base: '/LinkageStudio/' } }
  : JSON.parse(await readFile(join(paths.local, 'current-gate-build.json'), 'utf8'));
const socket = createServer();
await new Promise(resolve => socket.listen(0, '127.0.0.1', resolve));
const port = socket.address().port;
await new Promise(resolve => socket.close(resolve));
const url = `http://127.0.0.1:${port}${manifest.sourceStart.base}`;
const server = spawn(process.execPath, [join(paths.candidate, 'node_modules/vite/bin/vite.js'), 'preview', '--config', production ? join(paths.candidate,'vite.config.ts') : paths.config,
  '--host', '127.0.0.1', '--port', String(port), '--strictPort', '--outDir', manifest.output],
  { cwd: paths.candidate, windowsHide: true, stdio: 'inherit' });
let stopped = false;
server.on('exit', () => { stopped = true; });
try {
  let ready = false;
  for (let i = 0; i < 100; i++) {
    if (stopped) throw new Error('Preview exited before ready');
    try { ready = (await fetch(url, { signal: AbortSignal.timeout(500) })).ok; } catch { /* bounded readiness retry */ }
    if (ready) break;
    await new Promise(resolve => setTimeout(resolve, 100));
  }
  if (!ready) throw new Error('Preview readiness deadline exceeded');
  for (const engine of ['chromium', 'webkit']) {
    for (const script of production ? ['verify-pages-live.mjs','verify-drawing-live.mjs'] : uiOnly ? ['verify-ui16-browser.mjs'] : ['verify-g5-browser.mjs', 'verify-g4-input.mjs']) {
      const child = spawn(process.execPath, [join(paths.root, 'scripts/rebuild', script), engine, url, ...(bundled ? ['--bundled-chromium'] : [])],
        { cwd: paths.root, windowsHide: true, stdio: 'inherit' });
      const code = await new Promise((resolve, reject) => { child.on('exit', resolve); child.on('error', reject); });
      if (code !== 0) throw new Error(`${script} ${engine} failed (${code})`);
    }
  }
} finally {
  if (!stopped) { const done = new Promise(resolve => server.once('exit', resolve)); server.kill(); await done; }
}
