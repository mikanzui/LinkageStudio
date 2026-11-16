import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { access, mkdir, mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

// Sidecar only. No store imports, mounted-state writes, server or config ownership.
const graphKeys = ['joints', 'links', 'bodies', 'baseBodyId', 'outlines', 'images', 'sliders', 'colliders', 'tracers', 'springs', 'forceSensors'];
function graphOnly(g) {
  const graph = Object.fromEntries(graphKeys.map(k => [k, g[k] ?? {}]));
  // Only recognized, hidden, regenerated body braces are outside authored persistence.
  const braces = new Set(Object.keys(graph.bodies).map(id => `__brace_${id}`).filter(id => graph.joints[id]?.hidden === true));
  graph.joints = Object.fromEntries(Object.entries(graph.joints).filter(([id]) => !braces.has(id)));
  graph.links = Object.fromEntries(Object.entries(graph.links).filter(([, l]) => !l.jointIds.some(id => braces.has(id))));
  return graph;
}
const sha = bytes => createHash('sha256').update(bytes).digest('hex');
const body = (id, jointIds, color) => ({ id, name: id, jointIds, color, showLinks: true, useOutlineCOM: false });
const joint = (id, x, y, type = 'revolute') => ({ id, type, position: { x, y }, connectedLinkIds: [], label: id });
function fixture() {
  const g = { version: '0.12.3', projectName: 'G8 complete mechanism',
    oldForkMetadata: { author: 'G7 retained author', nested: { revision: 8, note: 'Keep source metadata' } },
    joints: { anchor: joint('anchor', 75, 180, 'fixed'), handle: joint('handle', 75, 300), wingTip: joint('wingTip', 195, 180),
      railA: joint('railA', 250, 180, 'fixed'), railB: joint('railB', 300, 180), railC: joint('railC', 350, 180, 'fixed') },
    links: { rod: { id: 'rod', jointIds: ['anchor', 'handle'], restLength: 120, mass: 1 },
      wingLink: { id: 'wingLink', jointIds: ['anchor', 'wingTip'], restLength: 120, mass: 1 } },
    bodies: { base: body('base', ['anchor', 'railA', 'railC'], '#e53935'), rod: body('rod', ['anchor', 'handle'], '#4caf50'),
      wing: body('wing', ['anchor', 'wingTip'], '#9c27b0'), carriage: body('carriage', ['railB'], '#42a5f5') }, baseBodyId: 'base',
    outlines: { closed: { id: 'closed', bodyId: 'rod', name: 'Closed outline', visible: true, closed: true,
      points: [{ x: -15, y: -20 }, { x: 15, y: -20 }, { x: 15, y: 20 }] },
    open: { id: 'open', bodyId: 'rod', name: 'Trimmed open path', visible: true, closed: false,
      points: [{ x: 20, y: 25 }, { x: 35, y: 25 }, { x: 35, y: 40 }] } },
    images: { bitmap: { id: 'bitmap', bodyId: 'rod',
      src: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII=',
      position: { x: 110, y: 240 }, scale: 8, rotation: .25, flipX: true, opacity: .75, visible: true, naturalWidth: 1, naturalHeight: 1 } },
    sliders: { rail: { id: 'rail', jointIdA: 'railA', jointIdB: 'railB', jointIdC: 'railC', t: .5 } },
    colliders: { barrier: { id: 'barrier', jointIdA: 'railA', jointIdC: 'railC', bodyIds: ['rod'] } },
    tracers: { path: { id: 'path', name: 'Saved path', bodyId: 'rod', localPosition: { x: 10, y: 20 }, enabled: true } },
    springs: {}, forceSensors: { probe: { id: 'probe', linkId: 'rod', name: 'Rod load', enabled: true } },
    viewPreferences: { camera: { zoom: 1, pan: { x: 0, y: 0 } }, gridLevel: 'off', showRulers: false, showLinks: true,
      showVectors: false, showLoads: false, showReactions: false },
    simulationSettings: { gravityEnabled: true, gravityStrength: 250, damping: .5, dragMultiplier: 25, dragDamping: .25 } };
  for (const [id, kind, anchorA, anchorB] of [
    ['linear', 'linear', { type: 'joint', jointId: 'anchor' }, { type: 'joint', jointId: 'handle' }],
    ['damper', 'damper', { type: 'link', linkId: 'rod', t: .25 }, { type: 'world', position: { x: 160, y: 230 } }],
    ['torsion', 'torsional', { type: 'link', linkId: 'rod', t: 0 }, { type: 'link', linkId: 'wingLink', t: 0 }],
  ]) g.springs[id] = { id, kind, anchorA, anchorB, stiffness: kind === 'damper' ? 0 : 2,
    damping: .2, restLength: kind === 'torsional' ? .5 : 120, prestressDelta: 0, name: id };
  for (const link of Object.values(g.links)) for (const id of link.jointIds) g.joints[id].connectedLinkIds.push(link.id);
  for (const key of graphKeys.filter(k => k !== 'baseBodyId')) for (const entity of Object.values(g[key])) entity.extension = { preserve: key, revision: 8 };
  return g;
}
function assertSubset(actual, expected, path = '$') {
  if (Array.isArray(expected)) { assert.equal(actual?.length, expected.length, `${path} length`); expected.forEach((v, i) => assertSubset(actual[i], v, `${path}[${i}]`)); }
  else if (expected !== null && typeof expected === 'object') {
    for (const [k, v] of Object.entries(expected)) if (k !== 'connectedLinkIds') assertSubset(actual?.[k], v, `${path}.${k}`);
  } else assert.deepEqual(actual, expected, path);
}
async function findRoot() {
  let dir = dirname(fileURLToPath(import.meta.url));
  for (;;) {
    try { await access(join(dir, 'scripts/rebuild/candidate-fingerprint.mjs')); return dir; } catch { /* Walk to the workspace root. */ }
    const parent = dirname(dir); assert.notEqual(parent, dir, 'Cannot locate rebuild workspace'); dir = parent;
  }
}
// Native IDB is the persisted-input boundary, not a second document/store instance.
async function recoveryBoundary(page, seed) {
  return page.evaluate(seed => new Promise((resolve, reject) => {
    const request = indexedDB.open('linkage-studio-rebuild-recovery', 1);
    request.onupgradeneeded = () => {
      const db = request.result;
      db.createObjectStore('draft-meta', { keyPath: 'id' }).createIndex('updatedAt', 'updatedAt');
      db.createObjectStore('draft-text', { keyPath: 'id' });
    };
    request.onerror = () => reject(request.error);
    request.onsuccess = () => {
      const db = request.result, tx = db.transaction(['draft-meta', 'draft-text'], seed ? 'readwrite' : 'readonly');
      let rows, texts;
      if (seed) for (const row of seed) {
        const { text, ...meta } = row; tx.objectStore('draft-meta').put(meta); tx.objectStore('draft-text').put({ id: meta.id, text });
      }
      else {
        const a = tx.objectStore('draft-meta').getAll(), b = tx.objectStore('draft-text').getAll();
        a.onsuccess = () => { rows = a.result; }; b.onsuccess = () => { texts = b.result; };
      }
      tx.oncomplete = () => { db.close(); resolve(seed ? null : rows.map(row => ({ ...row, text: texts.find(t => t.id === row.id)?.text }))); };
      tx.onabort = tx.onerror = () => { db.close(); reject(tx.error ?? new Error('IDB transaction failed')); };
    };
  }), seed ?? null);
}
function installBoundaries({ saveMode, storageMode }) {
  const boundary = globalThis.__g8Boundary = { calls: [], writes: [], quota: storageMode === 'quota', events: [] };
  Object.defineProperty(window, 'showSaveFilePicker', { configurable: true, value: saveMode.startsWith('fallback') ? undefined : async options => {
    boundary.calls.push({ stage: 'picker', options });
    if (saveMode === 'cancel') throw new DOMException('Injected picker cancellation', 'AbortError');
    if (saveMode === 'picker-failure') throw new DOMException('Injected picker failure', 'NotAllowedError');
    return { name: options.suggestedName, async createWritable() {
      boundary.calls.push({ stage: 'createWritable' });
      return { async write(text) { boundary.calls.push({ stage: 'write' });
        if (saveMode === 'write-failure') throw new DOMException('Injected write failure', 'QuotaExceededError'); boundary.writes.push(text); },
      async close() { boundary.calls.push({ stage: 'close' }); if (saveMode === 'close-failure') throw new Error('Injected close failure'); },
      async abort() { boundary.calls.push({ stage: 'abort' }); } };
    } };
  } });
  if (storageMode === 'denied') {
    const open = IDBFactory.prototype.open;
    IDBFactory.prototype.open = function(name, ...args) {
      if (name === 'linkage-studio-rebuild-recovery') throw new DOMException('Injected storage denial', 'SecurityError');
      return open.call(this, name, ...args);
    };
  }
  if (storageMode === 'quota') {
    const put = IDBObjectStore.prototype.put;
    IDBObjectStore.prototype.put = function(...args) {
      if (boundary.quota && this.transaction.db.name === 'linkage-studio-rebuild-recovery') {
        boundary.calls.push({ stage: 'quota-put', store: this.name }); throw new DOMException('Injected recovery quota', 'QuotaExceededError');
      }
      return put.apply(this, args);
    };
  }
  for (const type of ['pointerdown', 'pointerup', 'pointercancel', 'click', 'keydown']) document.addEventListener(type, e => {
    const el = e.target.closest?.('button,input,select,canvas,a') ?? e.target;
    const internalFileClick = type === 'click' && !e.isTrusted && el.isConnected
      && ((el.matches?.('input[type="file"]') && el.getBoundingClientRect().bottom < 0)
        || (el.matches?.('a[download]') && el.href.startsWith('blob:') && (el.hidden || el.style.display === 'none')));
    boundary.events.push({ type, trusted: e.isTrusted, internalFileClick, key: e.key, pointerType: e.pointerType,
      tag: el.tagName, label: el.getAttribute?.('aria-label') ?? el.title });
  }, true);
}

async function selfTest() {
  const f = fixture();
  for (const k of graphKeys.filter(k => k !== 'baseBodyId')) assert(Object.keys(f[k]).length > 0, `${k} fixture coverage`);
  assertSubset(structuredClone(f), f);
  const runtime = structuredClone(f); runtime.joints.__brace_base = { id: '__brace_base', hidden: true };
  assert.deepEqual(graphOnly(runtime), graphOnly(f));
  runtime.joints.authoredHidden = { id: 'authoredHidden', hidden: true };
  assert.notDeepEqual(graphOnly(runtime), graphOnly(f), 'Never hide arbitrary authored IDs');
  const torsion = f.springs.torsion, a = torsion.anchorA, b = torsion.anchorB;
  assert.equal(a.type, 'link'); assert.equal(b.type, 'link'); assert.notEqual(a.linkId, b.linkId);
  assert([0, 1].includes(a.t) && [0, 1].includes(b.t));
  assert.equal(f.links[a.linkId].jointIds[a.t], f.links[b.linkId].jointIds[b.t]);
  assert.notEqual(f.links[a.linkId].jointIds[1 - a.t], f.links[b.linkId].jointIds[1 - b.t]);
  const lost = structuredClone(f); delete lost.forceSensors.probe;
  assert.throws(() => assertSubset(lost, f));
  const changed = structuredClone(f); changed.outlines.open.closed = true;
  assert.throws(() => assertSubset(changed, f));
  const extensionLost = structuredClone(f); delete extensionLost.springs.linear.extension;
  assert.throws(() => assertSubset(extensionLost, f));
  const root = await findRoot();
  await access(join(root, '.rebuild.local/tooling/node_modules/playwright/index.mjs'));
  console.log(JSON.stringify({ selfTest: 'PASS', browserRun: 'NOT RUN', fixtureFamilies: graphKeys, workerUsage: 'UNKNOWN' }));
}

async function main() {
  if (process.argv.includes('--self-test')) return selfTest();
  const engine = process.argv[2] ?? 'chromium', url = process.argv[3] ?? process.env.LINKAGE_CANDIDATE_URL;
  assert(['chromium', 'webkit'].includes(engine), 'Use chromium or webkit');
  assert(url, 'Supply the lead-approved, frozen candidate URL'); new URL(url);
  const root = await findRoot();
  const { chromium, webkit } = await import(pathToFileURL(join(root, '.rebuild.local/tooling/node_modules/playwright/index.mjs')).href);
  const { candidateFingerprint, assertCandidateBuild } = await import(pathToFileURL(join(root, 'scripts/rebuild/candidate-fingerprint.mjs')).href);
  const startedAt = new Date().toISOString(), sourceStart = await candidateFingerprint();
  const harness = await readFile(fileURLToPath(import.meta.url));
  const parent = join(root, '.rebuild.local/evidence/g8'); await mkdir(parent, { recursive: true });
  const output = await mkdtemp(join(parent, `${engine}-browser-`));
  await writeFile(join(output, 'harness.mjs'), harness);
  await writeFile(join(output, 'fixture.slinker'), JSON.stringify(fixture(), null, 2));
  const profiles = [{ id: 'desktop', width: 1440, height: 1000, touch: false, dpr: 1 },
    { id: 'tablet', width: 1024, height: 1366, touch: true, dpr: 2 },
    { id: 'split', width: 512, height: 900, touch: true, dpr: 2 }];
  const scenarios = [], add = (id, work, boundary = {}) => scenarios.push({ id, work, saveMode: 'fallback', ...boundary });
  add('all-entity-download-reopen', async t => {
    const f = fixture(); await t.open(f); const before = await t.design();
    const saved = await t.saveDownload('complete-clean'); assertSubset(saved.json, f); assert.deepEqual(graphOnly(saved.json), before.graph);
    await t.rename('G8 dirty downloaded copy'); const dirty = await t.design();
    const download = await t.saveDownload('complete-dirty'); assert.equal(download.json.projectName, dirty.name);
    assertSubset(download.json.oldForkMetadata, f.oldForkMetadata); assert.deepEqual(graphOnly(download.json), dirty.graph);
    await t.assertDirty(); await t.openPath(download.path, dirty.name, true); assert.deepEqual(await t.design(), dirty);
    await t.check('roundtrip-all-families-and-source-metadata', { original: before, savedSha256: download.sha256 });
  });
  for (const mode of ['confirmed', 'cancel', 'picker-failure', 'write-failure', 'close-failure', 'fallback-cancel']) {
    add(`save-${mode}`, async t => {
      await t.open(fixture()); await t.rename(`G8 ${mode}`); const before = await t.design();
      await t.save(); assert.deepEqual(await t.design(), before, 'Save outcome cannot change authored graph/name');
      const boundary = await t.page.evaluate(() => ({ calls: __g8Boundary.calls, writes: __g8Boundary.writes }));
      if (mode === 'confirmed') {
        assert.deepEqual(boundary.calls.map(x => x.stage), ['picker', 'createWritable', 'write', 'close']);
        assert.equal(boundary.writes.length, 1); assert.deepEqual(graphOnly(JSON.parse(boundary.writes[0])), before.graph);
        await t.assertClean();
      } else {
        if (mode === 'write-failure' || mode === 'close-failure') assert.equal(boundary.calls.at(-1).stage, 'abort');
        if (mode === 'cancel' || mode === 'picker-failure') assert.equal(boundary.calls.length, 1);
        await t.assertDirty();
        assert.match(await t.feedback(), mode.includes('failure') ? /fail/i : /cancel/i);
      }
      await t.check('save-outcome-and-dirty-truth', boundary);
    }, { saveMode: mode });
  }
  add('dirty-open-clear-and-picker-retry', async t => {
    await t.open(fixture()); await t.rename('G8 navigation sentinel'); const before = await t.design();
    for (const command of ['Open', 'Clear All']) {
      await t.activate(t.button(command)); const modal = t.dialog('Unsaved Changes'); await modal.waitFor();
      await t.checkModal(modal); await t.activate(modal.getByRole('button', { name: 'Cancel', exact: true }));
      await modal.waitFor({ state: 'hidden' });
      assert(await t.button(command).evaluate(el => document.activeElement === el), 'Cancel restores navigation trigger focus');
      assert.deepEqual(await t.design(), before); await t.assertDirty();
      await t.activate(t.button(command)); await modal.waitFor(); await t.page.keyboard.press('Escape');
      await modal.waitFor({ state: 'hidden' }); assert.deepEqual(await t.design(), before);
      assert(await t.button(command).evaluate(el => document.activeElement === el), 'Escape restores navigation trigger focus');
    }
    await t.activate(t.button('Open')); let modal = t.dialog('Unsaved Changes'); await modal.waitFor();
    await t.activate(modal.getByRole('button', { name: 'Save first', exact: true })); await t.idle();
    assert.deepEqual(await t.design(), before); assert(await modal.isVisible(), 'Cancelled save-first retains unsaved dialog');
    await t.activate(modal.getByRole('button', { name: 'Cancel', exact: true })); await t.assertDirty();
    await t.open(fixture(), true); const pristine = await t.design();
    await t.cancelPicker(); assert.deepEqual(await t.design(), pristine); await t.assertClean();
    await t.open(fixture()); await t.rename('G8 clear sentinel');
    await t.activate(t.button('Clear All')); modal = t.dialog('Unsaved Changes'); await modal.waitFor();
    await t.activate(modal.getByRole('button', { name: 'Discard and clear', exact: true })); await modal.waitFor({ state: 'hidden' });
    assert.equal(Object.values((await t.read()).graph.joints).filter(j => !j.hidden).length, 0);
    await t.check('custom-cancel-Escape-save-first-cancel-discard-and-picker-retry');
  }, { saveMode: 'cancel' });
  add('save-first-confirmed-open', async t => {
    await t.open(fixture()); await t.rename('G8 save before opening'); const before = await t.design();
    const chooser = t.event('filechooser'); await t.activate(t.button('Open'));
    const modal = t.dialog('Unsaved Changes'); await modal.waitFor(); await t.activate(modal.getByRole('button', { name: 'Save first', exact: true }));
    const savedModal = t.dialog('Open File'); await savedModal.waitFor();
    await t.activate(savedModal.getByRole('button', { name: 'Open file', exact: true }));
    const f = fixture(); f.projectName = 'G8 second file'; await t.setChooser(await chooser, f); await t.waitName(f.projectName);
    const writes = await t.page.evaluate(() => __g8Boundary.writes); assert.equal(writes.length, 1);
    assert.deepEqual(graphOnly(JSON.parse(writes[0])), before.graph); assert.equal(JSON.parse(writes[0]).projectName, before.name);
    await t.assertClean(); await t.check('confirmed-save-precedes-open');
  }, { saveMode: 'confirmed' });
  add('download-save-first-cannot-navigate', async t => {
    await t.open(fixture()); await t.rename('G8 download is not confirmed'); const before = await t.design();
    await t.activate(t.button('Open')); const modal = t.dialog('Unsaved Changes'); await modal.waitFor();
    await t.download(modal.getByRole('button', { name: 'Save first', exact: true }), 'save-first-unconfirmed.slinker', true);
    await t.idle(); assert(await modal.isVisible(), 'Download cannot authorize destructive navigation');
    assert.deepEqual(await t.design(), before); await t.activate(modal.getByRole('button', { name: 'Cancel', exact: true }));
    await t.assertDirty(); await t.check('download-save-first-not-confirmed');
  });
  add('recovery-autosave-reload-restore', async t => {
    await t.open(fixture()); await t.rename('G8 recover dirty graph'); const before = await t.design();
    const drafts = await t.waitDraft(before.name); assert.equal(drafts.length, 1); assert.deepEqual(graphOnly(JSON.parse(drafts[0].text)), before.graph);
    await t.reload(); const modal = t.dialog('Recovery Drafts'); await modal.waitFor();
    await t.selectDraft(before.name); await t.checkModal(modal);
    const download = await t.download(modal.getByRole('link', { name: 'Download recovery file', exact: true }), 'recovery-raw.slinker');
    assert.equal(download.text, drafts[0].text); await t.activate(modal.getByRole('button', { name: 'Restore copy', exact: true }));
    await modal.waitFor({ state: 'hidden' }); assert.deepEqual(await t.design(), before); await t.assertDirty();
    await t.check('real-IDB-autosave-reload-download-restore-forces-dirty', { drafts });
  });
  for (const kind of ['invalid-json', 'future-schema']) add(`recovery-${kind}`, async t => {
    await t.open(fixture()); await t.rename('G8 current sentinel'); const before = await t.design();
    await t.activate(t.button('Recovery')); const modal = t.dialog('Recovery Drafts'); await modal.waitFor();
    await t.selectDraft(`G8 ${kind}`); const download = await t.download(modal.getByRole('link', { name: 'Download recovery file', exact: true }), `${kind}.slinker`);
    assert.equal(download.text, t.seed[0].text, 'Invalid/future draft must remain byte-for-byte downloadable');
    await t.native('confirm', true, () => t.activate(modal.getByRole('button', { name: 'Restore copy', exact: true })));
    await modal.getByRole('alert').waitFor(); assert.deepEqual(await t.design(), before, 'Restore refusal is atomic');
    const original = await recoveryBoundary(t.page); assert(original.some(d => d.id === t.seed[0].id && d.text === t.seed[0].text));
    await t.native('confirm', false, () => t.activate(modal.getByRole('button', { name: 'Discard recovery draft', exact: true })));
    assert((await recoveryBoundary(t.page)).some(d => d.id === t.seed[0].id));
    await t.native('confirm', true, () => t.activate(modal.getByRole('button', { name: 'Discard recovery draft', exact: true })));
    await t.poll(async () => !(await recoveryBoundary(t.page)).some(d => d.id === t.seed[0].id), 'Discard removes only selected persisted draft');
    assert.deepEqual(await t.design(), before); await t.activate(modal.getByRole('button', { name: 'Later', exact: true })); await t.assertDirty();
    await t.check('opaque-download-atomic-refusal-and-confirmed-discard');
  }, { seed: [{ id: `seed-${kind}`, displayName: `G8 ${kind}`, updatedAt: 1000, revision: 1, formatVersion: 1,
    text: kind === 'invalid-json' ? '{broken G8 JSON\n' : JSON.stringify({ ...fixture(), schemaVersion: 999 }) }] });
  add('recovery-unrepresentable-timestamp', async t => {
    await t.activate(t.button('Recovery')); const modal = t.dialog('Recovery Drafts'); await modal.waitFor();
    await t.selectDraft('G8 unknown timestamp');
    assert.match(await modal.innerText(), /Unknown date/);
    const downloaded = await t.download(modal.getByRole('link', { name: 'Download recovery file', exact: true }), 'unknown-timestamp.slinker');
    assert.equal(downloaded.text, t.seed[0].text);
    await t.activate(modal.getByRole('button', { name: 'Restore copy', exact: true })); await modal.waitFor({ state: 'hidden' });
    assert.equal((await t.read()).editor.projectName, fixture().projectName); await t.assertDirty();
    await t.check('unrepresentable-date-retains-recoverable-text');
  }, { seed: [{ id: 'unknown-timestamp', displayName: 'G8 unknown timestamp', updatedAt: 1e100, revision: 1, formatVersion: 1, text: JSON.stringify(fixture()) }] });
  for (const storageMode of ['quota', 'denied']) add(`recovery-storage-${storageMode}`, async t => {
    await t.open(fixture()); await t.rename(`G8 storage ${storageMode}`); const before = await t.design();
    await t.page.waitForFunction(() => document.querySelector('[aria-label="Recovery"]')?.getAttribute('data-recovery-status') === 'unavailable');
    assert.deepEqual(await t.design(), before); await t.assertDirty();
    const download = await t.saveDownload(`storage-${storageMode}-escape`); assert.deepEqual(graphOnly(download.json), before.graph);
    if (storageMode === 'quota') {
      assert((await t.page.evaluate(() => __g8Boundary.calls)).some(c => c.stage === 'quota-put'));
      await t.page.evaluate(() => { __g8Boundary.quota = false; });
      await t.rename('G8 quota retry'); await t.waitDraft('G8 quota retry'); await t.assertDirty();
    }
    await t.check('storage-failure-no-data-loss-and-download-escape');
  }, { storageMode });
  add('held-gesture-excluded-from-recovery', async t => {
    await t.open(fixture()); await t.rename('G8 held gesture'); await t.collapse(); await t.activate(t.button('Fit mechanism'));
    const initial = await t.waitDraft('G8 held gesture'), before = await t.design();
    await t.activate(t.button('Select'));
    const canvas = t.page.locator('.canvas-container canvas'), r = await canvas.boundingBox(); assert(r);
    const state = await t.read(), camera = state.editor.camera, handle = state.graph.joints.handle.position;
    const p = { x: r.x + camera.pan.x + handle.x * camera.zoom, y: r.y + camera.pan.y + handle.y * camera.zoom }, q = { x: p.x + 60, y: p.y - 40 };
    assert(await t.page.evaluate(p => document.elementFromPoint(p.x, p.y)?.matches('.canvas-container canvas'), p));
    const cdp = engine === 'chromium' && t.profile.touch ? await t.context.newCDPSession(t.page) : null;
    try {
      if (cdp) await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ ...p, id: 8 }] });
      else { await t.page.mouse.move(p.x, p.y); await t.page.mouse.down(); }
      if (cdp) await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ ...q, id: 8 }] });
      else await t.page.mouse.move(q.x, q.y, { steps: 10 });
      await t.page.waitForTimeout(1600); const held = await t.read();
      assert.notDeepEqual(graphOnly(held.graph), before.graph, 'Actually hold a moved authored joint, not an idle preview or no-op');
      assert.deepEqual(await recoveryBoundary(t.page), initial, 'Held graph must not overwrite committed recovery');
      await t.check('held-native-input-not-autosaved', { held });
      if (cdp) await cdp.send('Input.dispatchTouchEvent', { type: 'touchCancel', touchPoints: [] }); else await t.page.keyboard.press('Escape');
    } finally {
      if (cdp) { await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] }).catch(() => {}); await cdp.detach(); }
      else await t.page.mouse.up();
    }
    assert.deepEqual((await t.design()).graph, before.graph); await t.page.waitForTimeout(1400);
    for (const draft of await recoveryBoundary(t.page)) assert.deepEqual(graphOnly(JSON.parse(draft.text)), before.graph);
    await t.check('gesture-cancel-no-orphan-in-memory-or-storage');
  });
  add('CAD-dialog-download-units-and-modal-isolation', async t => {
    await t.open(fixture()); await t.rename('G8 CAD specimen'); const before = await t.design();
    await t.target(t.button('Export CAD'), 'Export CAD'); await t.activate(t.button('Export CAD'));
    const modal = t.dialog('Export CAD'); await modal.waitFor(); await t.checkModal(modal);
    await t.page.keyboard.press('Escape'); await modal.waitFor({ state: 'hidden' });
    assert(await t.button('Export CAD').evaluate(el => document.activeElement === el), 'Escape restores export trigger focus');
    for (const format of ['dxf', 'solidworks']) for (const unit of ['mm', 'cm', 'm', 'in']) {
      await t.activate(t.button('Export CAD')); await modal.waitFor();
      await t.target(modal.getByLabel('Format', { exact: true }), 'CAD format'); await t.target(modal.getByLabel('Units', { exact: true }), 'CAD units');
      await modal.getByLabel('Format', { exact: true }).selectOption(format); await modal.getByLabel('Units', { exact: true }).selectOption(unit);
      const text = await modal.innerText(); assert.match(text, /image/i); assert.match(text, /spring/i); assert.match(text, /trac|sensor/i);
      assert.match(text, /omit|not (?:included|exported|supported)/i);
      assert(text.includes(format === 'solidworks' ? 'New Part sketch; layer colors are not preserved. Target-app qualification pending.' : 'R12 coordinates only; import units must match.'), 'Visible format limitations');
      await t.target(modal.getByRole('button', { name: 'Export', exact: true }), 'CAD Export');
      const extension = format === 'dxf' ? 'dxf' : 'swb', expectedName = `${before.name}-${unit}.${extension}`;
      const download = await t.download(modal.getByRole('button', { name: 'Export', exact: true }), `cad-${unit}.${extension}`);
      assert.equal(download.filename, expectedName); assert(download.text.length > 100, 'CAD download is nonempty');
      await t.check('CAD-downloaded-for-independent-reader', { format, unit, filename: download.filename, sha256: download.sha256,
        path: download.path, dialogText: text, dimensions: 'UNVERIFIED: lead independent parser/CAD owns acceptance' });
      if (await modal.isVisible()) { await t.page.keyboard.press('Escape'); await modal.waitFor({ state: 'hidden' }); }
      assert.deepEqual(await t.design(), before, 'CAD export never changes authored graph/name');
    }
    await t.assertDirty();
  });

  const selectedProfiles = profiles.filter(p => !process.env.G8_PROFILE || p.id === process.env.G8_PROFILE);
  const selectedScenarios = scenarios.filter(s => !process.env.G8_SCENARIO || s.id.includes(process.env.G8_SCENARIO));
  assert(selectedProfiles.length && selectedScenarios.length, 'Filters must select at least one profile and scenario');
  const partial = selectedProfiles.length !== profiles.length || selectedScenarios.length !== scenarios.length;
  const results = [];
  const browser = engine === 'webkit' ? await webkit.launch({ headless: true }) : await chromium.launch({ channel: 'chrome', headless: true });
  try {
    for (const profile of selectedProfiles) for (const scenario of selectedScenarios) {
      const dir = join(output, `${profile.id}-${scenario.id}`); await mkdir(dir);
      const context = await browser.newContext({ viewport: { width: profile.width, height: profile.height }, deviceScaleFactor: profile.dpr,
        hasTouch: profile.touch, isMobile: profile.touch, serviceWorkers: 'block', acceptDownloads: true });
      await context.addInitScript(installBoundaries, { saveMode: scenario.saveMode, storageMode: scenario.storageMode });
      await context.tracing.start({ screenshots: false, snapshots: true, sources: false });
      const page = await context.newPage(); page.setDefaultTimeout(10000);
      const errors = [], checks = [], targets = [], dialogs = []; let sequence = 0, nativePlan = null, build;
      const started = Date.now(); let failure;
      page.on('pageerror', e => errors.push({ type: 'pageerror', message: e.message }));
      page.on('console', m => { if (m.type() === 'error') errors.push({ type: 'console', message: m.text() }); });
      page.on('dialog', async d => {
        const planned = nativePlan; dialogs.push({ type: d.type(), message: d.message(), planned: !!planned });
        try {
          if (!planned || planned.type !== d.type()) { errors.push({ type: 'unexpected-native-dialog', message: `${d.type()}: ${d.message()}` }); await d.dismiss(); return; }
          nativePlan = null;
          if (planned.accept) await d.accept(planned.text); else await d.dismiss();
          planned.resolve();
        } catch (error) { planned?.reject(error); errors.push({ type: 'dialog-handler', message: String(error) }); }
      });
      const t = { page, context, profile, seed: scenario.seed, dir,
        button: name => page.getByRole('button', { name, exact: true }), dialog: name => page.getByRole('dialog', { name, exact: true }),
        event(type) { const pending = page.waitForEvent(type); pending.catch(() => {}); return pending; },
        activate: el => profile.touch ? el.tap() : el.click(),
        read: () => page.evaluate(() => ({ graph: __LINKAGE_G0_READ__.mechanism(), editor: __LINKAGE_G0_READ__.editor(), simulation: __LINKAGE_G0_READ__.simulation() })),
        async design() { const s = await t.read(); return { graph: graphOnly(s.graph), name: s.editor.projectName }; },
        async check(name, extra = {}, screenshot = true) {
          const stem = `${String(++sequence).padStart(3, '0')}-${name}`;
          await writeFile(join(dir, `${stem}.json`), JSON.stringify({ state: await t.read(), extra }, null, 2));
          if (screenshot) await page.screenshot({ path: join(dir, `${stem}.png`), fullPage: true }); checks.push({ name, passed: true });
        },
        async poll(predicate, message, timeout = 12000) {
          const start = Date.now(); while (Date.now() - start < timeout) { if (await predicate()) return; await page.waitForTimeout(80); } assert.fail(message);
        },
        async idle() { await page.waitForFunction(() => document.querySelector('.top-bar')?.getAttribute('aria-busy') === 'false'); },
        async feedback() { return page.locator('.project-feedback').innerText(); },
        async native(type, accept, action, text) {
          assert.equal(nativePlan, null); let resolve, reject;
          const seen = new Promise((res, rej) => { resolve = res; reject = rej; }); nativePlan = { type, accept, text, resolve, reject };
          try { await action(); await Promise.race([seen, page.waitForTimeout(10000).then(() => { throw new Error(`Expected native ${type} dialog`); })]); }
          finally { nativePlan = null; }
        },
        async setChooser(chooser, f) {
          await chooser.setFiles({ name: 'g8-fixture.slinker', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(f)) });
        },
        async waitName(name) { await page.waitForFunction(name => __LINKAGE_G0_READ__.editor().projectName === name, name); await t.idle(); },
        async open(f, dirty = false) {
          const chooser = t.event('filechooser'); await t.activate(t.button('Open'));
          if (dirty) { const modal = t.dialog('Unsaved Changes'); await modal.waitFor(); await t.activate(modal.getByRole('button', { name: 'Discard and open', exact: true })); }
          await t.setChooser(await chooser, f); await t.waitName(f.projectName);
        },
        async openPath(path, name, dirty = false) {
          const chooser = t.event('filechooser'); await t.activate(t.button('Open'));
          if (dirty) { const modal = t.dialog('Unsaved Changes'); await modal.waitFor(); await t.activate(modal.getByRole('button', { name: 'Discard and open', exact: true })); }
          await (await chooser).setFiles(path); await t.waitName(name);
        },
        async rename(name) { await t.activate(page.getByTitle('Rename project', { exact: true }));
          const input = page.getByLabel('Project name', { exact: true }); await input.fill(name); await input.press('Enter'); await t.waitName(name); },
        async save() {
          if (scenario.saveMode === 'fallback-cancel') await t.native('prompt', false, () => t.activate(t.button('Save')));
          else await t.activate(t.button('Save')); await t.idle();
        },
        async download(el, filename, prompt = false) {
          const pending = t.event('download');
          if (prompt) await t.native('prompt', true, () => t.activate(el), filename); else await t.activate(el);
          const download = await pending; assert.equal(await download.failure(), null); const path = join(dir, filename);
          await download.saveAs(path); const text = await readFile(path, 'utf8');
          return { path, text, filename: download.suggestedFilename(), sha256: sha(text) };
        },
        async saveDownload(filename) { const d = await t.download(t.button('Save'), `${filename}.slinker`, true); await t.idle(); return { ...d, json: JSON.parse(d.text) }; },
        async assertDirty() {
          const before = await t.design(); await t.activate(t.button('Open')); const modal = t.dialog('Unsaved Changes'); await modal.waitFor();
          await t.activate(modal.getByRole('button', { name: 'Cancel', exact: true })); await modal.waitFor({ state: 'hidden' }); assert.deepEqual(await t.design(), before);
        },
        async cancelPicker() {
          const chooser = t.event('filechooser'); await t.activate(t.button('Open')); const opened = await chooser;
          // Playwright cannot dismiss an OS Files picker. Dispatch only the adapter's native-input cancel boundary.
          await opened.element().dispatchEvent('cancel'); await t.idle(); assert.match(await t.feedback(), /cancel/i);
        },
        async assertClean() { await t.cancelPicker(); },
        async reload() { await t.native('beforeunload', true, () => page.reload()); await t.mounted(); },
        async mounted() {
          await page.waitForFunction(() => !!globalThis.__LINKAGE_G0_READ__?.simulation); await page.locator('.splash-screen').waitFor({ state: 'detached' });
          build = await assertCandidateBuild(page, sourceStart); await t.idle();
          for (const key of graphKeys) assert(key in (await t.read()).graph, `Observer missing ${key}`);
        },
        async waitDraft(name) { let drafts; await t.poll(async () => { drafts = await recoveryBoundary(page); return drafts.some(d => d.displayName === name && typeof d.text === 'string'); }, `No recovery draft for ${name}`); return drafts; },
        async selectDraft(name) {
          const modal = t.dialog('Recovery Drafts'), row = modal.locator('label').filter({ has: page.locator('strong').filter({ hasText: name }) });
          assert.equal(await row.count(), 1, 'Unique named recovery row'); await t.target(row, 'Recovery draft row'); await t.activate(row.getByRole('radio'));
          await t.poll(async () => await row.getByRole('radio').isChecked()
            && await modal.getByRole('link', { name: 'Download recovery file', exact: true }).getAttribute('aria-disabled') !== 'true', 'Selected draft text did not load');
        },
        async collapse() { for (const name of ['Collapse toolbar', 'Collapse panel']) { const el = page.getByTitle(name, { exact: true }); if (await el.count()) await t.activate(el); } },
        async target(el, label) {
          await el.scrollIntoViewIfNeeded(); const r = await el.evaluate(el => { const r = el.getBoundingClientRect(), x = r.x + r.width / 2, y = r.y + r.height / 2;
            const hit = document.elementFromPoint(x, y); return { width: r.width, height: r.height, reachable: x >= 0 && x < innerWidth && y >= 0 && y < innerHeight && (hit === el || el.contains(hit)) }; });
          targets.push({ label, ...r }); assert(r.reachable, `${label} hit region`); if (profile.touch) assert(r.width >= 44 && r.height >= 44, `${label} 44px coarse target`);
        },
        async checkModal(modal) {
          assert.equal(await modal.evaluate(el => el.tagName), 'DIALOG', 'Use actual native modal dialog');
          assert(await modal.evaluate(el => el.matches(':modal')), 'Dialog must use showModal, not a visual overlay');
          const before = await t.design(), editor = (await t.read()).editor;
          const saveCalls = await page.evaluate(() => __g8Boundary.calls.length);
          let pickerCalls = 0; const count = () => { pickerCalls++; }; page.on('filechooser', count);
          try {
            for (const key of ['Control+z', 'Control+y', 'Delete', 'j', 'Control+s', 'Control+o']) await page.keyboard.press(key);
            for (let i = 0; i < 12; i++) { await page.keyboard.press(i % 3 === 0 ? 'Shift+Tab' : 'Tab');
              assert(await modal.evaluate(el => el.contains(document.activeElement)), 'Keyboard focus must stay in modal'); }
          } finally { page.off('filechooser', count); }
          assert.equal(pickerCalls, 0, 'Modal shortcuts cannot open file chooser'); assert.deepEqual(await t.design(), before, 'Modal shortcuts cannot edit/undo mounted project');
          assert.equal(await page.evaluate(() => __g8Boundary.calls.length), saveCalls, 'Modal shortcuts cannot save behind dialog');
          const after = (await t.read()).editor;
          for (const key of ['activeTool', 'createTool', 'mode', 'selectedIds']) assert.deepEqual(after[key], editor[key], `Modal isolates editor.${key}`);
          await t.target(modal.getByRole('button', { name: /^(Close recovery|Later|Export|Cancel)$/ }).first(), 'Modal primary/close control');
        },
      };
      try {
        if (scenario.seed) {
          await page.route(url, route => route.fulfill({ contentType: 'text/html', body: '<!doctype html><title>G8 isolated storage seed</title>' }));
          await page.goto(url); await recoveryBoundary(page, scenario.seed); await page.unroute(url); await page.goto(url);
        } else await page.goto(url);
        await t.mounted();
        const autoRecovery = t.dialog('Recovery Drafts'); if (scenario.seed) { await autoRecovery.waitFor(); await t.activate(autoRecovery.getByRole('button', { name: 'Later', exact: true })); }
        await scenario.work(t);
        await t.check('scenario-complete');
      } catch (e) {
        failure = e.stack ?? String(e);
        await writeFile(join(dir, 'FAILED.json'), JSON.stringify({ failure, state: await t.read().catch(() => null) }, null, 2));
        await page.screenshot({ path: join(dir, 'FAILED.png'), fullPage: true }).catch(() => {});
      } finally {
        const events = await page.evaluate(() => __g8Boundary.events).catch(() => []);
        if (events.some(e => !e.trusted && !e.internalFileClick)) errors.push({ type: 'untrusted-input', message: 'Only offscreen adapter file/download clicks may be synthetic' });
        if (!events.some(e => e.trusted && (e.type === 'click' || e.type === 'keydown'))) errors.push({ type: 'no-trusted-input', message: 'Scenario did not exercise native UI' });
        const result = { profile, scenario: scenario.id, build, passed: !failure && !errors.length, failure, elapsedMs: Date.now() - started,
          checks, targets, errors, dialogs, boundaries: { save: scenario.saveMode, storage: scenario.storageMode ?? 'native', seed: !!scenario.seed } };
        results.push(result); await writeFile(join(dir, 'events.json'), JSON.stringify(events, null, 2));
        await writeFile(join(dir, 'report.json'), JSON.stringify(result, null, 2));
        await context.tracing.stop({ path: join(dir, 'trace.zip') }); await context.close();
        await writeFile(join(output, 'progress.json'), JSON.stringify(results, null, 2));
        console.log(JSON.stringify({ profile: profile.id, scenario: scenario.id, passed: result.passed, failure }));
      }
    }
  } finally { await browser.close(); }
  const sourceEnd = await candidateFingerprint(), stableSource = sourceStart.sourceSha256 === sourceEnd.sourceSha256;
  const report = { startedAt, finishedAt: new Date().toISOString(), engine, url, output, harnessSha256: sha(harness), fixtureSha256: sha(JSON.stringify(fixture())),
    sourceStart, sourceEnd, stableSource, partial, results, selectedChecksPassed: stableSource && results.every(r => r.passed),
    passed: !partial && stableSource && results.length === profiles.length * scenarios.length && results.every(r => r.passed),
    gateAcceptance: false, physicalIPadVerified: false, workerUsage: 'UNKNOWN', comparisons: ['C02', 'C10', 'C11', 'C12', 'C13'], screens: ['S09', 'S10', 'S11'],
    limits: ['Lead owns frozen build, integration, cumulative G1-G7, original/reopened Airer/WorkingScreen motion and gate acceptance.',
      'No physical iPad/Safari/Files/Home Screen/Pencil/VoiceOver qualification. WebKit coarse taps are native; held canvas gesture uses mouse/Escape in WebKit.',
      'Picker cancellation dispatches a cancel event only at the actual offscreen file input; OS picker dismissal/retry is not certified.',
      'FSA save outcomes and quota/denied failures are injected browser-boundary tests, not durable real-filesystem or real-disk-quota certification.',
      'CAD files and metadata are captured only; dimensions, visibility, independent parser, LibreCAD and SolidWorks execution remain lead-owned UNVERIFIED.'] };
  await writeFile(join(output, 'report.json'), JSON.stringify(report, null, 2));
  console.log(JSON.stringify({ output, passed: report.passed, selectedChecksPassed: report.selectedChecksPassed, partial, gateAcceptance: false }));
  if (!report.selectedChecksPassed) process.exitCode = 1;
}
await main();
