import assert from 'node:assert/strict';
import { test, after } from 'node:test';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const require = createRequire(import.meta.url);
const workboxRequire = createRequire(require.resolve('workbox-build'));
const estreeRequire = createRequire(require.resolve('@typescript-eslint/typescript-estree'));
const glob = workboxRequire('glob');
const minimatch = estreeRequire('minimatch');
const output = fs.mkdtempSync(path.join(tmpdir(), 'linkage-toolchain-test-'));
for (const [name,content] of [['index.html','<html>main</html>'],['redirect.html','<html>bridge</html>'],['icon-192.svg','<svg/>'],['icon-512.svg','<svg/>'],['a.js','export {};'],['a.css','body{}'],['icon-192.png','PNG'],['icon-512.png','PNG'],['b.js','export {};'],['b.css','html{}']]) fs.writeFileSync(path.join(output,name),content);
after(()=>{assert.equal(path.dirname(path.resolve(output)),path.resolve(tmpdir()));assert(path.basename(output).startsWith('linkage-toolchain-test-'));fs.rmSync(output,{recursive:true,force:true});});

test('Workbox resolves the actual patched glob override, not an unused root package', () => {
  assert.equal(workboxRequire('glob/package.json').version, '14.0.6');
  assert.equal(estreeRequire('minimatch/package.json').version, '11.0.8');
});

test('cross-major glob override enumerates exactly the independently walked build assets', () => {
  const actual = glob.globSync('**/*.{js,css,html,svg,png,ico}', { cwd: output, follow: true, ignore: ['**/node_modules/**/*', 'sw.js', 'workbox-*.js'] }).map(name => name.replaceAll('\\', '/')).sort();
  const expected = [];
  function walk(directory) {
    for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
      const absolute = path.join(directory, entry.name);
      if (entry.isDirectory()) walk(absolute);
      else if (/\.(js|css|html|svg|png|ico)$/.test(entry.name) && entry.name !== 'sw.js' && !entry.name.startsWith('workbox-')) expected.push(path.relative(output, absolute).replaceAll('\\', '/'));
    }
  }
  walk(output);
  assert.ok(expected.includes('index.html'));
  assert.ok(expected.includes('redirect.html'));
  assert.ok(expected.includes('icon-192.svg'));
  assert.deepEqual(actual, expected.sort());
});

test('Workbox getManifest consumes the override and hashes both HTML entrypoints and icons', async () => {
  const { getManifest } = require('workbox-build');
  const result = await getManifest({ globDirectory: output, globPatterns: ['**/*.{js,css,html,svg,png,ico}'], globIgnores: ['sw.js', 'workbox-*.js'] });
  assert.deepEqual(result.warnings, []);
  assert.ok(result.manifestEntries.every(entry => !entry.url.includes('\\')), 'Workbox must normalize Windows paths to URL separators');
  for (const name of ['index.html', 'redirect.html', 'icon-192.svg', 'icon-512.svg']) {
    const entry = result.manifestEntries.find(entry => entry.url === name);
    assert.ok(entry, name);
    assert.match(entry.revision, /^[a-f0-9]{32}$/);
  }
  assert.ok(result.count >= 10);
});

test('glob cancellation rejects a pre-aborted walk without filesystem traversal', async () => {
  const controller = new AbortController();
  controller.abort(new Error('bounded-sidecar-abort'));
  let reads = 0;
  const countedFs = {
    ...fs,
    readdir(...args) { reads++; return fs.readdir(...args); },
    readdirSync(...args) { reads++; return fs.readdirSync(...args); },
    promises: { ...fs.promises, async readdir(...args) { reads++; return fs.promises.readdir(...args); } },
  };
  await assert.rejects(glob.glob('**/*', { cwd: output, signal: controller.signal, fs: countedFs }), /bounded-sidecar-abort/);
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(reads, 0);
});

test('typescript-estree patched minimatch retains the matching APIs used for ignore patterns', () => {
  assert.equal(minimatch.minimatch('src/cloud/onedrive.ts', '**/*.ts'), true);
  assert.equal(minimatch.minimatch('src/Editor.tsx', '**/*.ts'), false);
  assert.equal(minimatch.minimatch('src/.hidden.ts', '**/*.ts'), false);
  assert.equal(minimatch.minimatch('src/.hidden.ts', '**/*.ts', { dot: true }), true);
  assert.equal(new minimatch.Minimatch('**/*.{ts,tsx}').match('src/Editor.tsx'), true);
  assert.equal(new minimatch.Minimatch('**/*.{ts,tsx}').match('src/project.json'), false);
});

test('remaining node-resolve deepmerge call merges only the static internal defaults', () => {
  const ts = require('typescript');
  const source = ts.createSourceFile('node-resolve.cjs', fs.readFileSync(require.resolve('@rollup/plugin-node-resolve'), 'utf8'), ts.ScriptTarget.Latest, true, ts.ScriptKind.JS);
  const calls = [];
  let defaults;
  function visit(node) {
    if (ts.isCallExpression(node) && ts.isIdentifier(node.expression) && node.expression.text === 'deepMerge') calls.push(node);
    if (ts.isVariableDeclaration(node) && ts.isIdentifier(node.name) && node.name.text === 'defaults') defaults = node.initializer;
    ts.forEachChild(node, visit);
  }
  visit(source);
  assert.equal(calls.length, 1);
  assert.equal(calls[0].arguments[0].getText(source), '{}');
  assert.equal(calls[0].arguments[1].getText(source), 'defaults');
  assert.ok(defaults && ts.isObjectLiteralExpression(defaults));
  for (const property of defaults.properties) {
    assert.ok(ts.isPropertyAssignment(property));
    const value = property.initializer;
    assert.ok(ts.isArrayLiteralExpression(value) || value.kind === ts.SyntaxKind.TrueKeyword || value.kind === ts.SyntaxKind.FalseKeyword);
    if (ts.isArrayLiteralExpression(value)) for (const element of value.elements) assert.ok(ts.isStringLiteral(element));
  }
});
