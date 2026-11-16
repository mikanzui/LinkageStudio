import { spawn } from 'node:child_process';
import { mkdir, mkdtemp, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';
import { candidateFingerprint } from './candidate-fingerprint.mjs';

const root = fileURLToPath(new URL('../../', import.meta.url));
const through = Number(process.argv[2] ?? 5);
const url = process.argv[3] ?? 'http://127.0.0.1:5185/LinkageStudio/';
const all = [
  [1, 'verify-g1-browser.mjs'], [2, 'verify-g2-browser.mjs'], [3, 'verify-g3-browser.mjs'],
  [4, 'verify-g4-input.mjs'], [4, 'verify-g4-bodies.mjs'], [5, 'verify-g5-browser.mjs'],
  [6, 'verify-g6-browser.mjs'],
  [7, 'verify-g7-browser.mjs'],
  [8, 'verify-g8-browser.mjs'],
  [9, 'verify-g9-browser.mjs'],
  [10, 'verify-g10-production.mjs'],
];
const parent = join(root, '.rebuild.local/evidence/cumulative');
await mkdir(parent, { recursive: true });
const output = await mkdtemp(join(parent, `through-g${through}-`));
const sourceStart = await candidateFingerprint(), results = [];
const selected = all.filter(([gate]) => gate <= through).sort((a, b) => Number(b[0] === through) - Number(a[0] === through) || a[0] - b[0]);
const keepGoing = process.argv.includes('--keep-going');
const engines = process.argv.includes('--webkit-first') ? ['webkit', 'chromium'] : ['chromium', 'webkit'];
let abortedAfterFailure = false;
verification: for (const [gate, script] of selected) {
  for (const engine of engines) {
    const startedAt = new Date().toISOString();
    const args = [join(root, 'scripts/rebuild', script), engine, url];
    let log = '';
    const exitCode = await new Promise((resolve, reject) => {
      const child = spawn(process.execPath, args, { cwd: root, windowsHide: true });
      const timeout = setTimeout(() => child.kill(), 600000);
      child.stdout.on('data', data => { log += data; });
      child.stderr.on('data', data => { log += data; });
      child.on('error', error => { clearTimeout(timeout); reject(error); });
      child.on('close', code => { clearTimeout(timeout); resolve(code); });
    });
    await writeFile(join(output, `${script}-${engine}.log`), log);
    const lastJSON = log.trim().split(/\r?\n/).reverse().find(line => line.startsWith('{'));
    let evidence;
    try { evidence = JSON.parse(lastJSON); } catch { evidence = { unparsedTail: log.slice(-2000) }; }
    const result = { gate, script, engine, startedAt, finishedAt: new Date().toISOString(),
      exitCode, passed: exitCode === 0 && evidence?.passed === true, evidence };
    results.push(result);
    console.log(JSON.stringify(result));
    await writeFile(join(output, 'progress.json'), JSON.stringify({ sourceStart, results }, null, 2));
    if (!result.passed && !keepGoing) { abortedAfterFailure = true; break verification; }
  }
}
const sourceEnd = await candidateFingerprint();
const report = { output, sourceStart, sourceEnd, results, plannedRuns: selected.length * 2, abortedAfterFailure,
  passed: results.length === selected.length * 2 && sourceStart.sourceSha256 === sourceEnd.sourceSha256 && results.every(r => r.passed) };
await writeFile(join(output, 'report.json'), JSON.stringify(report, null, 2));
console.log(JSON.stringify({ output, passed: report.passed }));
if (!report.passed) process.exitCode = 1;
