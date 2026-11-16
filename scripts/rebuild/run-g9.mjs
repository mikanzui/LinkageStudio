import { spawn } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { createServer } from 'node:net';
import { prepareBrowser } from './prepare-browser.mjs';
import { isMain } from './source-paths.mjs';

export async function runG9({ harnessRoot, env: inputEnv = process.env, cumulative = false, through = 9, installTooling = false } = {}) {
  if (![9,10].includes(through)) throw new Error('Supported cumulative stages are 9 and 10.');
  const env = { ...inputEnv, LINKAGE_CLOUD_MOCK: '1' };
  const paths = await prepareBrowser({ harnessRoot, env, installTooling });
  env.LINKAGE_CANDIDATE_DIR = paths.candidate;
  async function run(args, cwd = paths.root) {
    const child = spawn(process.execPath, args, { cwd, env: { ...process.env, ...env }, windowsHide: true, stdio: 'inherit' });
    const code = await new Promise((resolve, reject) => { child.on('error', reject); child.on('exit', resolve); });
    if (code !== 0) throw new Error(`Child failed (${code}): ${args[0]}`);
  }
  await run([join(paths.root, 'scripts/rebuild/build-gate.mjs'), 'g'+through]);
  const manifest = JSON.parse(await readFile(join(paths.local, 'current-gate-build.json'), 'utf8'));
  const socket = createServer();
  await new Promise((resolve, reject) => { socket.once('error', reject); socket.listen(0, '127.0.0.1', resolve); });
  const port = socket.address().port;
  await new Promise((resolve, reject) => socket.close((error) => error ? reject(error) : resolve()));
  const url = `http://127.0.0.1:${port}${manifest.sourceStart.base}`;
  const server = spawn(process.execPath, [join(paths.candidate, 'node_modules/vite/bin/vite.js'), 'preview', '--config', paths.config, '--host', '127.0.0.1', '--port', String(port), '--strictPort', '--outDir', manifest.output], { cwd: paths.candidate, env: { ...process.env, ...env }, windowsHide: true, stdio: 'inherit' });
  let launchError;
  let exited = false;
  server.once('error', (error) => { launchError = error; });
  server.once('exit', () => { exited = true; });
  try {
    let ready = false;
    for (let i = 0; i < 100; i++) {
      if (launchError) throw launchError;
      if (exited) throw new Error('Preview exited before becoming ready.');
      try { if ((await fetch(url, { signal: AbortSignal.timeout(1000) })).ok) { ready = true; break; } } catch { /* Retry until the bounded readiness deadline. */ }
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
    if (!ready) throw new Error('Preview did not become ready.');
    if (cumulative) await run([join(paths.root, 'scripts/rebuild/verify-cumulative.mjs'), String(through), url, '--webkit-first']);
    else for (const engine of ['webkit', 'chromium']) await run([join(paths.root, 'scripts/rebuild/verify-g9-browser.mjs'), engine, url]);
  } finally {
    if (!exited && !launchError) {
      const stopped = new Promise((resolve) => server.once('exit', resolve));
      server.kill();
      await stopped;
    }
  }
}

if (isMain(import.meta.url)) {
  const flags = new Set(process.argv.slice(2));
  for (const flag of flags) if (!['--cumulative', '--through-g10', '--install-tooling'].includes(flag)) throw new Error(`Unknown G9 option: ${flag}`);
  await runG9({ cumulative: flags.has('--cumulative'), through: flags.has('--through-g10') ? 10 : 9, installTooling: flags.has('--install-tooling') });
}
