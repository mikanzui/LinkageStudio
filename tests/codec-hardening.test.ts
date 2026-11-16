import test from 'node:test';
import assert from 'node:assert/strict';
import { MAX_DOCUMENT_CHARACTERS, MAX_DOCUMENT_DEPTH, MAX_DOCUMENT_VALUES, MAX_DOCUMENT_ISSUES, MAX_ENTITY_ID_LENGTH } from '../src/document/limits';
import { importProject, projectText } from '../src/document/project';
import { useMechanismStore as store } from '../src/store/mechanism-store';
import { useEditorStore as editor } from '../src/store/editor-store';
import { useSimulationStore as simulation } from '../src/store/simulation-store';

Object.assign(globalThis, { __APP_VERSION__: 'rebuild-g8-test' });
const { decodeDocument } = await import(process.env.REBUILD_CODEC_UNDER_TEST ?? '../src/document/codec');
function document() {
  return { version: '0.11.14', joints: {
    a: { id: 'a', type: 'fixed', position: { x: 0, y: 0 }, connectedLinkIds: ['ab'] },
    b: { id: 'b', type: 'revolute', position: { x: 100, y: 0 }, connectedLinkIds: ['ab'] },
  }, links: { ab: { id: 'ab', jointIds: ['a', 'b'], restLength: 100, mass: 1 } },
    bodies: { base: { id: 'base', name: 'Base', color: '#f00', jointIds: ['a'] }, rod: { id: 'rod', name: 'Rod', color: '#0f0', jointIds: ['a', 'b'] } },
    baseBodyId: 'base', outlines: {}, colliders: {}, projectName: 'Codec test', simulationSettings: { damping: .5, dragDamping: .25 } };
}
const decode = (data: unknown) => decodeDocument(JSON.stringify(data));
const invalid = (data: unknown, reason: RegExp) => { const result = decode(data); assert(!result.ok); assert(result.issues.some(i => reason.test(i.message))); return result; };

test('leading UTF-8 BOM is tolerated without changing source fields', () => {
  const data = document(), result = decodeDocument('\uFEFF' + JSON.stringify(data)); assert(result.ok); assert.deepEqual(result.context.source, data);
});
test('deep input is refused with bounded diagnostics rather than throwing a stack overflow', () => {
  const prefix = JSON.stringify(document()).slice(0, -1);
  const text = `${prefix},"metadata":${'['.repeat(10_000)}0${']'.repeat(10_000)}}`;
  let result: ReturnType<typeof decodeDocument>; assert.doesNotThrow(() => { result = decodeDocument(text); });
  assert(!result!.ok); assert.match(result!.issues[0].message, /nesting/);
});
test('depth limit admits bounded extensions and refuses the next unsupported depth', () => {
  const data = document(); const prefix = JSON.stringify(data).slice(0, -1);
  assert(decodeDocument(`${prefix},"extension":${'['.repeat(MAX_DOCUMENT_DEPTH - 2)}0${']'.repeat(MAX_DOCUMENT_DEPTH - 2)}}`).ok);
  assert(!decodeDocument(`${prefix},"extension":${'['.repeat(MAX_DOCUMENT_DEPTH + 1)}0${']'.repeat(MAX_DOCUMENT_DEPTH + 1)}}`).ok);
});
test('broad extension arrays have a supported value budget', () => {
  invalid({ ...document(), extension: new Array(MAX_DOCUMENT_VALUES).fill(0) }, /too many/);
});
test('oversized text is refused before JSON parsing', () => {
  const result = decodeDocument(' '.repeat(MAX_DOCUMENT_CHARACTERS + 1)); assert(!result.ok); assert.match(result.issues[0].message, /file limit/);
});
test('oversized property names have an explicit bounded refusal', () => {
  invalid({ ...document(), ['x'.repeat(513)]: true }, /Property names/);
});
test('selectable identities cannot ambiguously refer to both a joint and a shape', () => {
  invalid({ ...document(), outlines: { a: { id: 'a', bodyId: 'rod', points: [{ x: 0, y: 0 }, { x: 20, y: 0 }] } } }, /Selectable ID/);
});
test('body-owner identities may share a name with a selectable entity namespace', () => {
  const data = document(); data.bodies.a = { ...data.bodies.rod, id: 'a' }; assert(decode(data).ok);
});
for (const id of ['', 'x'.repeat(MAX_ENTITY_ID_LENGTH + 1)]) test(`invalid entity ID length ${id.length} is refused`, () => {
  const data = document(); Object.assign(data.joints, { [id]: { ...data.joints.a, id } }); invalid(data, /stable entity ID/);
});
test('duplicate body memberships are refused instead of distorting centroids and weights', () => {
  const data = document(); data.bodies.rod.jointIds.push('a'); invalid(data, /only once/);
});
for (const field of ['damping', 'dragDamping']) for (const value of [-1, 1.0001]) test(`imported ${field}=${value} cannot bypass numeric field limits`, () => {
  const data = document(); data.simulationSettings[field] = value; invalid(data, /finite number/);
});
test('diagnostics remain bounded, retaining an error after many legacy warnings', () => {
  const data = document(); data.colliders = Object.fromEntries(Array.from({ length: 200 }, (_, i) => [`wall${i}`, { id: `wall${i}`, jointIdA: 'missing', jointIdC: 'missing', bodyIds: ['missing'] }]));
  const result = decode({ ...data, projectName: {} }); assert(!result.ok); assert(result.issues.length <= MAX_DOCUMENT_ISSUES);
  assert(result.issues.some(i => i.severity === 'error'));
});
test('envelope writer version is text rather than unchecked structured metadata', () => { invalid({ ...document(), writerVersion: {} }, /Writer version/); });
test('newly rejected input leaves current document, history, view and runtime unchanged', () => {
  assert(importProject(JSON.stringify(document())).ok);
  const before = store.getState(), view = editor.getState(), runtime = simulation.getState(), text = projectText();
  const bad = document(); bad.bodies.rod.jointIds.push('a'); assert(!importProject(JSON.stringify(bad)).ok);
  assert.equal(store.getState(), before); assert.equal(editor.getState(), view); assert.equal(simulation.getState(), runtime); assert.equal(projectText(), text);
});
test('empty project and outline names remain intentionally empty after save/reopen', () => {
  const data = { ...document(), projectName: '', outlines: { shape: { id: 'shape', bodyId: 'rod', name: '', visible: true, points: [{ x: 0, y: 0 }, { x: 20, y: 0 }] } } };
  assert(importProject(JSON.stringify(data)).ok); const saved = projectText(); assert(importProject(saved).ok);
  assert.equal(editor.getState().projectName, ''); assert.equal(store.getState().outlines.shape.name, ''); assert.equal(projectText(), saved);
});
test('legacy image with no visibility field defaults to visible', () => {
  const data = { ...document(), images: { image: { id: 'image', bodyId: 'rod', src: 'data:image/png;base64,AA==', position: { x: 20, y: 0 }, scale: 1, rotation: 0, opacity: 1, naturalWidth: 1, naturalHeight: 1 } } };
  assert(importProject(JSON.stringify(data)).ok); assert.equal(store.getState().images.image.visible, true);
  const saved = projectText(); assert(importProject(saved).ok); assert.equal(store.getState().images.image.visible, true);
});
