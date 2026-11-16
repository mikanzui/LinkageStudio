import assert from 'node:assert/strict';
import { test } from 'node:test';
import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { MechanismState, Joint, Body, Outline } from '../src/types';
import { buildCadScene, singleLineComment, validateCadScene } from '../src/core/cad-scene';
import type { CadScene, CadEntity, LegacyCadArguments } from '../src/core/cad-scene';
import { exportDXF, writeDXF } from '../src/utils/export-dxf';
import { exportSolidWorksMacro, writeSolidWorksMacro } from '../src/utils/export-solidworks';
import { cadNumber, mmToUnit, worldToUnit, dxfInsUnitsCode, scaleCadNumber } from '../src/utils/export-manager';
import type { ExportUnit } from '../src/utils/export-manager';

const joint = (id: string, x: number, y: number, fixed = false): Joint => ({ id, type: fixed ? 'fixed' : 'revolute', position: { x, y }, connectedLinkIds: [] });
const body = (id: string, name: string, jointIds: string[] = []): Body => ({ id, name, jointIds, color: '#ff0000', useOutlineCOM: false, showLinks: true });
const outline = (id: string, points: { x: number; y: number }[], closed?: boolean): Outline => ({ id, bodyId: 'shape', name: id, points, closed, visible: true });
function fixture(): MechanismState {
  return {
    joints: { a: joint('a', 0, 0, true), b: joint('b', 25, 50), u: joint('u', -25, -25),
      hidden: { ...joint('hidden', 125, 0), hidden: true }, __temp_grab: joint('__temp_grab', 50, 50) },
    bodies: { base: body('base', 'Base', ['a']), arm: body('arm', 'Arm', ['a', 'b', 'hidden', '__temp_grab']), shape: body('shape', 'Shape') },
    baseBodyId: 'base',
    links: {
      rod: { id: 'rod', jointIds: ['a', 'b'], restLength: 0, mass: 1 },
      brace: { id: 'brace', jointIds: ['a', 'hidden'], restLength: 125, mass: 1 },
      __templink_grab: { id: '__templink_grab', jointIds: ['a', '__temp_grab'], restLength: 1, mass: 1 },
    },
    outlines: {
      open: outline('open', [{ x: 0, y: 0 }, { x: 25, y: 0 }, { x: 25, y: 50 }], false),
      closed: outline('closed', [{ x: 100, y: 0 }, { x: 125, y: 0 }, { x: 125, y: 50 }]),
      two: outline('two', [{ x: 0, y: 75 }, { x: 25, y: 75 }]),
    },
    sliders: { rail: { id: 'rail', jointIdA: 'a', jointIdB: 'u', jointIdC: 'b', t: 0.5 } },
    colliders: { barrier: { id: 'barrier', jointIdA: 'a', jointIdC: 'b', bodyIds: ['arm'] } },
    images: {}, tracers: {}, springs: {}, forceSensors: {},
  };
}
function args(g: MechanismState): LegacyCadArguments {
  return [g.joints, g.links, g.bodies, g.baseBodyId, g.outlines, g.sliders, g.colliders];
}
function freeze<T>(value: T): T {
  if (value && typeof value === 'object') {
    Object.freeze(value);
    for (const child of Object.values(value)) freeze(child);
  }
  return value;
}
function near(actual: number, expected: number, tolerance = 1e-12): void {
  assert.ok(Math.abs(actual - expected) <= tolerance * Math.max(1, Math.abs(expected)), `${actual} != ${expected}`);
}

interface ParsedDXF {
  version: string; errors: number; fixes: number; insunits: number | null;
  layers: { name: string; color: number }[];
  entities: { type: string; layer: string; points: number[][]; radius?: number; closed?: boolean; linetype?: string }[];
}
function cadPython(): string {
  if (process.env.CAD_PYTHON !== undefined) {
    assert.ok(process.env.CAD_PYTHON.trim(), 'CAD_PYTHON must name a Python executable, not an empty string.');
    return process.env.CAD_PYTHON;
  }
  let directory = dirname(fileURLToPath(import.meta.url));
  for (;;) {
    for (const relative of ['cad-tooling/Scripts/python.exe', 'cad-tooling/bin/python', '.venv/Scripts/python.exe', '.venv/bin/python']) {
      const candidate = join(directory, relative);
      if (existsSync(candidate)) return candidate;
    }
    const parent = dirname(directory);
    if (parent === directory) break;
    directory = parent;
  }
  for (const command of ['python', 'python3']) {
    const probe = spawnSync(command, ['-B', '-c', 'import sys; print(sys.version_info.major)'], { encoding: 'utf8', windowsHide: true, timeout: 10_000 });
    if (!probe.error && probe.status === 0 && probe.stdout.trim() === '3') return command;
  }
  throw new Error('CAD tests require Python 3 with ezdxf==1.4.5. Set CAD_PYTHON to its executable; install the pinned requirements-cad.txt. Independent CAD tests are never skipped.');
}
const python = cadPython();
function readDXF(dxf: string): ParsedDXF {
  const result = spawnSync(python, ['-B', '-c', `
import io, json, sys, ezdxf
assert ezdxf.__version__ == '1.4.5', 'CAD tests require ezdxf==1.4.5, got ' + ezdxf.__version__
doc = ezdxf.read(io.StringIO(json.load(sys.stdin)['dxf']))
audit = doc.audit()
entities = []
for e in doc.modelspace():
    item = {'type': e.dxftype(), 'layer': e.dxf.layer, 'points': [], 'linetype': e.dxf.get('linetype', 'BYLAYER')}
    if e.dxftype() == 'LINE': item['points'] = [list(e.dxf.start), list(e.dxf.end)]
    if e.dxftype() == 'CIRCLE': item.update(points=[list(e.dxf.center)], radius=e.dxf.radius)
    if e.dxftype() == 'POLYLINE': item.update(points=[list(v.dxf.location) for v in e.vertices], closed=e.is_closed)
    entities.append(item)
print(json.dumps({'version': doc.dxfversion, 'errors': len(audit.errors), 'fixes': len(audit.fixes),
    'insunits': doc.header.get('$INSUNITS'), 'layers': [{'name': l.dxf.name, 'color': l.dxf.color} for l in doc.layers], 'entities': entities}))
`], { input: JSON.stringify({ dxf }), encoding: 'utf8', windowsHide: true, timeout: 20_000 });
  assert.equal(result.error, undefined, `CAD_PYTHON=${python}: ${String(result.error)}. Python 3 and ezdxf==1.4.5 are required; see requirements-cad.txt.`);
  assert.equal(result.status, 0, `CAD_PYTHON=${python}: ${result.stderr}. Install pinned requirements-cad.txt; CAD tests are not optional.`);
  return JSON.parse(result.stdout) as ParsedDXF;
}

interface MacroCall { type: string; values: number[]; construction: boolean }
function readMacro(text: string): MacroCall[] {
  // A separate strict reader of emitted numeric API calls, not the production scene iterator.
  const calls: MacroCall[] = [];
  for (const line of text.replace(/ _\r?\n\s*/g, ' ').split(/\r?\n/)) {
    const match = /^ {4}Set segment = SketchMgr\.(CreateLine|CreateCircleByRadius)\(([^()]*)\)$/.exec(line);
    if (match) {
      const literals = match[2].split(',').map(item => item.trim());
      assert.equal(literals.length, match[1] === 'CreateLine' ? 6 : 4);
      assert.ok(literals.every(item => /^-?\d+(?:\.\d+)?#$/.test(item)), match[2]);
      const values = literals.map(item => Number(item.slice(0, -1)));
      assert.ok(values.every(Number.isFinite));
      calls.push({ type: match[1], values, construction: false });
    }
    if (line.trim().startsWith('segment.ConstructionGeometry =')) {
      assert.ok(calls.length);
      assert.match(line, / = (True|False)$/);
      calls[calls.length - 1].construction = line.endsWith('True');
    }
  }
  return calls;
}

test('pure scene preserves caller pose, source IDs, distinct shared pivots and detached geometry', () => {
  const g = freeze(fixture()), before = JSON.stringify(g);
  const scene = buildCadScene(g);
  assert.equal(scene.entities.length, 10);
  assert.equal(scene.warnings.length, 0);
  assert.equal(new Set(scene.entities.map(e => e.id)).size, 10);
  assert.equal(scene.entities.filter(e => e.kind === 'joint' && e.sourceId === 'a').length, 2);
  assert.ok(scene.entities.some(e => e.kind === 'joint' && e.sourceId === 'u' && e.layer === 'Unowned'));
  assert.ok(!scene.entities.some(e => e.sourceId.includes('hidden') || e.sourceId.includes('__temp')));
  const b = scene.entities.find(e => e.sourceId === 'b');
  assert.ok(b?.type === 'circle');
  assert.deepEqual(b.center, { x: 25, y: 50 });
  assert.notEqual(b.center, g.joints.b.position);
  assert.equal(b.radius, 3.75);
  const a = scene.entities.find(e => e.sourceId === 'a' && e.type === 'circle');
  assert.ok(a?.type === 'circle');
  assert.equal(a.radius, 5);
  assert.equal(JSON.stringify(g), before);
});

test('layer names are ASCII/R12-safe, bounded and unique including reserved/case/truncation collisions', () => {
  const g = fixture();
  const names = ['Sliders', 'sliders', 'Colliders', 'Unowned', '0', 'A/B', 'A?B', '', 'x'.repeat(50), 'x'.repeat(45) + 'z', '\r\n0\nEOF\u2028'];
  g.bodies = Object.fromEntries(names.map((name, i) => [`b${i}`, body(`b${i}`, name, ['a'])]));
  const scene = buildCadScene(g);
  assert.equal(new Set(scene.layers.map(l => l.name.toLowerCase())).size, scene.layers.length);
  for (const layer of scene.layers) assert.match(layer.name, /^[A-Za-z0-9_-]{1,31}$/);
  const independent = readDXF(writeDXF(scene, 'mm'));
  assert.equal(new Set(independent.layers.map(l => l.name.toLowerCase())).size, independent.layers.length);
  assert.ok(scene.layers.every(l => independent.layers.some(actual => actual.name === l.name)));
  assert.deepEqual(scene.layers.filter(l => l.purpose === 'body').map(l => l.sourceBodyId), names.map((_, i) => `b${i}`));
  const ids = scene.entities.filter(e => e.kind === 'joint').map(e => e.id);
  for (const b of Object.values(g.bodies)) b.name = 'renamed';
  assert.deepEqual(buildCadScene(g).entities.filter(e => e.kind === 'joint').map(e => e.id), ids);
});

test('body-local outline uses the candidate stable body frame once without mutating inputs', () => {
  const g = fixture();
  g.joints = { a: joint('a', 100, 50), b: joint('b', 100, 100) };
  g.bodies = { shape: { ...body('shape', 'Rotated', ['a', 'b']), frame: { jointIds: ['a', 'b'], angleOffset: 0 } } };
  g.links = {}; g.sliders = {}; g.colliders = {};
  g.outlines = { open: outline('open', [{ x: 0, y: 0 }, { x: 25, y: 0 }, { x: 25, y: 50 }], false) };
  const before = JSON.stringify(g);
  const entity = buildCadScene(g).entities.find(e => e.kind === 'outline');
  assert.ok(entity?.type === 'polyline');
  const expected = [[100, 75], [100, 100], [50, 100]];
  entity.points.forEach((p, i) => { near(p.x, expected[i][0]); near(p.y, expected[i][1]); });
  assert.equal(entity.closed, false);
  assert.equal(JSON.stringify(g), before);
});

test('first non-Base link owner controls visibility and guides survive global or owner-hidden links', () => {
  const g = fixture();
  g.bodies = { base: g.bodies.base, first: { ...body('first', 'First', ['a', 'b']), showLinks: false }, arm: g.bodies.arm, shape: g.bodies.shape };
  assert.equal(buildCadScene(g).entities.filter(e => e.kind === 'link').length, 0);
  g.bodies.first.showLinks = true; g.bodies.arm.showLinks = false;
  assert.deepEqual(buildCadScene(g).entities.filter(e => e.kind === 'link').map(e => e.layer), ['First']);
  const noLinks = buildCadScene(g, false);
  assert.equal(noLinks.entities.filter(e => e.kind === 'link').length, 0);
  assert.equal(noLinks.entities.filter(e => e.kind === 'slider' || e.kind === 'collider').length, 2);
});

test('hidden joint endpoints, invisible outlines and temporary guides do not export', () => {
  const g = fixture();
  g.joints.b.hidden = true;
  g.outlines.open.visible = false;
  g.sliders.rail.jointIdC = 'hidden';
  g.colliders.barrier.jointIdC = '__temp_grab';
  const scene = buildCadScene(g);
  assert.ok(!scene.entities.some(e => ['rod', 'open', 'rail', 'barrier'].includes(e.sourceId)));
  assert.ok(scene.entities.some(e => e.sourceId === 'closed'));
});

test('unknown visibility metadata does not change the renderer-defined CAD geometry', () => {
  const g = fixture(); Object.assign(g.joints.b, { visible: false }); Object.assign(g.links.rod, { visible: false, hidden: true });
  const scene = buildCadScene(g);
  assert(scene.entities.some(e => e.kind === 'link' && e.sourceId === 'rod'));
  assert(scene.entities.some(e => e.kind === 'joint' && e.sourceId === 'b'));
});

test('valid shorthand hex body colors retain their CAD color instead of becoming white', () => {
  const g = fixture(); g.bodies.arm.color = '#f00'; const scene = buildCadScene(g);
  assert.equal(scene.layers.find(layer => layer.sourceBodyId === 'arm')!.color, '#ff0000');
  assert(!scene.warnings.some(w => w.code === 'invalid-color' && w.sourceId === 'arm'));
});

test('stale optional barrier references warn while exportable legacy geometry survives', () => {
  const g = fixture();
  g.colliders.stale = { id: 'stale', jointIdA: 'missing', jointIdC: 'b', bodyIds: [] };
  const scene = buildCadScene(g);
  assert.equal(scene.entities.length, 10);
  assert.ok(scene.warnings.some(w => w.sourceId === 'stale' && w.code === 'missing-reference'));
  assert.doesNotThrow(() => writeDXF(scene, 'mm'));
});

test('deduplicate within one body, not across separate body layers', () => {
  const g = fixture();
  g.bodies.arm.jointIds.push('a', 'b', 'a');
  const scene = buildCadScene(g);
  assert.equal(scene.entities.filter(e => e.kind === 'joint').length, 4);
});

test('open/legacy-closed paths and two-point outlines have correct independent macro edge counts', () => {
  const scene = buildCadScene(fixture());
  const paths = scene.entities.filter(e => e.kind === 'outline');
  assert.deepEqual(paths.map(e => [e.sourceId, e.type, e.type === 'polyline' ? e.closed : false]),
    [['open', 'polyline', false], ['closed', 'polyline', true], ['two', 'line', false]]);
  const calls = readMacro(writeSolidWorksMacro(scene, 'mm'));
  assert.equal(calls.filter(c => c.type === 'CreateCircleByRadius').length, 4);
  assert.equal(calls.filter(c => c.type === 'CreateLine').length, 9); // 2 open + 3 closed + 1 segment + 3 guides/link
  assert.equal(calls.filter(c => c.construction).length, 3);
  const cutEdges = calls.filter(c => c.type === 'CreateLine' && !c.construction);
  assert.deepEqual(cutEdges[0].values, [0, 0, 0, 0.01, 0, 0]);
  assert.deepEqual(cutEdges[1].values, [0.01, 0, 0, 0.01, -0.02, 0]);
  cutEdges[5].values.forEach((value, i) => near(value, [0, -0.03, 0, 0.01, -0.03, 0][i]));
});

for (const [unit, ten, twenty, thirty, radius, fixedRadius] of [
  ['mm', 10, 20, 30, 1.5, 2], ['cm', 1, 2, 3, 0.15, 0.2], ['m', 0.01, 0.02, 0.03, 0.0015, 0.002],
  ['in', 10 / 25.4, 20 / 25.4, 30 / 25.4, 1.5 / 25.4, 2 / 25.4],
] as const) test(`ezdxf 1.4.5 independently audits ${unit} dimensions, layers, color, open/closed flags and radii`, () => {
  const dxf = writeDXF(buildCadScene(fixture()), unit);
  const parsed = readDXF(dxf);
  assert.equal(parsed.version, 'AC1009');
  assert.equal(parsed.errors, 0); assert.equal(parsed.fixes, 0);
  assert.equal(parsed.insunits, null);
  assert.ok(!dxf.includes('$INSUNITS'));
  assert.ok(dxf.includes(`coordinate unit: ${unit}`));
  assert.equal(parsed.entities.length, 10);
  assert.equal(parsed.layers.find(l => l.name === 'Arm')?.color, 1);
  const pivot = parsed.entities.find(e => e.type === 'CIRCLE' && e.layer === 'Arm' && e.points[0][0] > 0)!;
  near(pivot.points[0][0], ten); near(pivot.points[0][1], -twenty); near(pivot.radius!, radius);
  const fixed = parsed.entities.find(e => e.type === 'CIRCLE' && e.layer === 'Base')!;
  near(fixed.radius!, fixedRadius);
  const paths = parsed.entities.filter(e => e.type === 'POLYLINE');
  assert.deepEqual(paths.map(p => p.closed), [false, true]);
  assert.equal(paths[0].points.length, 3);
  near(paths[0].points[2][0], ten); near(paths[0].points[2][1], -twenty);
  const segment = parsed.entities.find(e => e.type === 'LINE' && e.layer === 'Shape')!;
  near(segment.points[1][0] - segment.points[0][0], ten);
  near(segment.points[0][1], -thirty);
  assert.equal(parsed.entities.filter(e => e.layer === 'Sliders').length, 1);
  assert.equal(parsed.entities.filter(e => e.layer === 'Colliders').length, 1);
  assert.equal(parsed.entities.filter(e => e.layer === 'Unowned').length, 1);
  assert.equal(parsed.entities.filter(e => e.linetype === 'DASHED').length, 3);
});

test('SolidWorks numeric geometry remains identical meters across display units', () => {
  const scene = buildCadScene(fixture());
  const reference = readMacro(writeSolidWorksMacro(scene, 'mm'));
  const enums = { mm: 'swMM', cm: 'swCM', m: 'swMETER', in: 'swINCHES' };
  for (const unit of ['mm', 'cm', 'm', 'in'] as const) {
    const text = writeSolidWorksMacro(scene, unit);
    assert.deepEqual(readMacro(text), reference);
    assert.ok(text.includes(`Part.SetUnits ${enums[unit]}, swDECIMAL, 0, 8, False`));
  }
  assert.ok(reference.some(c => c.type === 'CreateCircleByRadius' && c.values[0] === 0.01 && c.values[1] === -0.02 && c.values[3] === 0.0015));
});

test('macro uses documented late-bound template, plane and sketch APIs with actionable failure cleanup', () => {
  const text = writeSolidWorksMacro(buildCadScene(fixture()), 'mm');
  assert.ok(text.includes('GetDocumentTemplate(swDocPART, "", 0, 0#, 0#)'));
  assert.ok(text.includes('Const swDECIMAL = 1'));
  assert.ok(text.includes('swApp.NewDocument(templatePath, 0, 0#, 0#)'));
  assert.ok(text.includes('feat.GetTypeName2 = "RefPlane"'));
  assert.ok(text.includes('selected = feat.Select2(False, 0)'));
  assert.ok(text.includes('Set activeSketch = SketchMgr.ActiveSketch'));
  assert.ok(text.includes('If segment Is Nothing Then'));
  assert.ok(text.includes('If databaseChanged Then SketchMgr.AddToDB = previousAddToDB'));
  assert.ok(text.includes('If sketchOpen Then SketchMgr.InsertSketch True'));
  assert.ok(!text.includes('GetUserPreferenceStringValue'));
  assert.ok(!text.includes('SelectByID2("Front Plane"'));
  assert.ok(!text.replace(/\r\n/g, '').includes('\n'));
});

test('malicious names, source IDs, labels and warning comments cannot add DXF records or executable VB lines', () => {
  const g = fixture();
  const baseline = writeSolidWorksMacro(buildCadScene(g), 'mm');
  const malicious = '\r\n0\nENDSEC\n0\nEOF\u2028\u2029\x00\t\nShell "calc.exe"\r\nEnd Sub\nSub hacked()\n_';
  g.bodies.arm.name = malicious;
  g.joints.b.label = malicious;
  g.outlines.open.name = malicious;
  const scene = buildCadScene(g);
  const edited: CadScene = { ...scene, warnings: [{ code: 'omitted-content', message: malicious }],
    entities: scene.entities.map(e => ({ ...e, sourceId: malicious })) };
  const macro = writeSolidWorksMacro(edited, 'mm');
  const executable = (text: string) => text.split(/\r?\n/).filter(line => !line.trim().startsWith("'") && line.trim());
  assert.deepEqual(executable(macro), executable(baseline));
  assert.equal(readDXF(writeDXF(edited, 'mm')).entities.length, 10);
  assert.ok(!singleLineComment(malicious).includes('\n'));
  assert.ok(singleLineComment(malicious).endsWith('.'));
});

test('omission counts cover full graph without manufacturing spring rigid links or mutating save data', () => {
  const g = fixture();
  g.images.img = { id: 'img', bodyId: 'arm', src: 'data:image/png;base64,AAAA', position: { x: 0, y: 0 }, scale: 1, rotation: 0, opacity: 1, visible: true, naturalWidth: 1, naturalHeight: 1 };
  g.tracers.t = { id: 't', bodyId: 'arm', localPosition: { x: 0, y: 0 }, enabled: true };
  g.springs!.s = { id: 's', kind: 'linear', anchorA: { type: 'joint', jointId: 'a' }, anchorB: { type: 'joint', jointId: 'b' }, stiffness: 1, damping: 0, restLength: 25, prestressDelta: 0 };
  g.forceSensors!.sensor = { id: 'sensor', linkId: 'rod', enabled: true };
  g.joints.b.externalForce = { x: 0, y: 10 };
  const before = JSON.stringify(g), scene = buildCadScene(freeze(g));
  assert.deepEqual(scene.omissions, { images: 1, tracers: 1, springs: 1, forceSensors: 1, analysisOverlays: 1 });
  assert.equal(scene.warnings.filter(w => w.code === 'omitted-content').length, 5);
  assert.equal(scene.entities.length, 10);
  assert.equal(scene.entities.filter(e => e.kind === 'link').length, 1);
  assert.equal(JSON.stringify(g), before);
});

test('degenerate geometry warns; exact duplicate vertices removed without small-edge clamping', () => {
  const g = fixture();
  g.joints.b.position = { x: 0, y: 0 };
  g.outlines = {
    repeat: outline('repeat', [{ x: 0, y: 0 }, { x: 0, y: 0 }, { x: 1e-12, y: 0 }, { x: 1e-12, y: 1e-12 }, { x: 0, y: 0 }]),
    collapsed: outline('collapsed', [{ x: 0, y: 0 }, { x: 0, y: 0 }]),
    short: outline('short', [{ x: 0, y: 0 }]),
  };
  const scene = buildCadScene(g);
  assert.ok(!scene.entities.some(e => ['rod', 'rail', 'barrier', 'collapsed', 'short'].includes(e.sourceId)));
  assert.ok(scene.warnings.some(w => w.code === 'unsupported-geometry'));
  const repeat = scene.entities.find(e => e.sourceId === 'repeat');
  assert.ok(repeat?.type === 'polyline');
  assert.equal(repeat.points.length, 3);
  assert.ok(writeDXF(scene, 'mm').includes('0.0000000000004'));
  assert.ok(readMacro(writeSolidWorksMacro(scene, 'm')).some(c => c.values.some(n => n > 0 && n < 1e-14)));
});

test('empty scene, invalid color fallback and stale body memberships have explicit outcomes', () => {
  const g = fixture();
  g.bodies.arm.color = 'not a color';
  g.bodies.arm.jointIds.push('missing');
  const scene = buildCadScene(g);
  assert.equal(scene.layers.find(l => l.sourceBodyId === 'arm')?.color, '#ffffff');
  assert.ok(scene.warnings.some(w => w.code === 'invalid-color'));
  assert.ok(scene.warnings.some(w => w.code === 'missing-reference'));
  const empty: MechanismState = { joints: {}, links: {}, bodies: {}, baseBodyId: '', outlines: {}, images: {}, tracers: {}, sliders: {}, colliders: {} };
  assert.equal(readDXF(writeDXF(buildCadScene(empty), 'mm')).entities.length, 0);
});

test('small and large finite numbers round-trip without fixed-decimal truncation or exponent/dialect ambiguity', () => {
  for (const value of [0, -0, 1e-12, -1e-200, 1e22, -1e100, Number.MIN_VALUE, Number.MAX_VALUE, 123456789.12345679]) {
    const text = cadNumber(value);
    assert.ok(!/[eE]/.test(text));
    assert.equal(Number(text), value === 0 ? 0 : value);
  }
  const g = fixture();
  g.joints.u.position = { x: 1e12 + 0.125, y: 1e-9 };
  const scene = buildCadScene(g), parsed = readDXF(writeDXF(scene, 'mm'));
  const unowned = parsed.entities.find(e => e.layer === 'Unowned')!;
  near(unowned.points[0][0], 400000000000.05, Number.EPSILON);
  near(unowned.points[0][1], -4e-10, 1e-20);
  const macro = readMacro(writeSolidWorksMacro(scene, 'mm')).find(c => c.values[0] > 1e8)!;
  near(macro.values[0], 400000000.00005, Number.EPSILON);
});

test('very large finite geometry keeps macro physical lines within the Visual Basic limit', () => {
  const scene: CadScene = { ...buildCadScene(fixture()), entities: [{
    id: 'large', sourceId: 'large', label: '', layer: 'Unowned', type: 'line', kind: 'outline', construction: false,
    start: { x: 1e300, y: -1e300 }, end: { x: -1e300, y: 1e300 },
  }] };
  const macro = writeSolidWorksMacro(scene, 'mm');
  assert.ok(macro.includes('CreateLine( _\r\n'));
  assert.ok(macro.split('\r\n').every(line => line.length <= 1023));
  const calls = readMacro(macro);
  assert.equal(calls.length, 1);
  near(calls[0].values[0], 4e296, Number.EPSILON);
  near(calls[0].values[1], 4e296, Number.EPSILON);
  near(calls[0].values[3], -4e296, Number.EPSILON);
  assert.equal(readDXF(writeDXF(scene, 'mm')).entities.length, 1);
});

test('independent DXF checks distinguish a deliberately reclosed trimmed path and wrong scale', () => {
  const dxf = writeDXF(buildCadScene(fixture()), 'mm');
  const reclosed = dxf.replace('POLYLINE\n8\nShape\n66\n1\n70\n0\n', 'POLYLINE\n8\nShape\n66\n1\n70\n1\n');
  assert.notEqual(dxf, reclosed);
  const badPath = readDXF(reclosed).entities.find(e => e.type === 'POLYLINE')!;
  assert.throws(() => assert.equal(badPath.closed, false));
  const wrongScale = readDXF(writeDXF(buildCadScene(fixture()), 'cm')).entities.find(e => e.type === 'POLYLINE')!;
  assert.throws(() => near(wrongScale.points[1][0], 10));
});

for (const invalid of ['ft', '', 'MM', undefined, null, 0, '__proto__']) test(`invalid runtime unit ${String(invalid)} is rejected by writers and unit helpers`, () => {
  const unit = invalid as ExportUnit;
  const scene = buildCadScene(fixture());
  for (const fn of [worldToUnit, mmToUnit, dxfInsUnitsCode]) assert.throws(() => fn(unit), /Unsupported CAD unit/);
  assert.throws(() => writeDXF(scene, unit), /Unsupported CAD unit/);
  assert.throws(() => writeSolidWorksMacro(scene, unit), /Unsupported CAD unit/);
});

for (const bad of [NaN, Infinity, -Infinity]) test(`nonfinite geometry ${bad} rejects rather than producing corrupt CAD`, () => {
  const g = fixture(); g.joints.b.position = { x: bad, y: 0 };
  assert.throws(() => buildCadScene(g), /finite/);
  const g2 = fixture(); g2.outlines.open.points[0] = { x: 0, y: bad };
  assert.throws(() => buildCadScene(g2), /finite/);
  assert.throws(() => cadNumber(bad), /finite/);
});

test('unit conversion underflow/overflow fails explicitly and finite scaled geometry is never clamped', () => {
  assert.throws(() => scaleCadNumber(Number.MIN_VALUE, 0.0004), /underflow/);
  assert.throws(() => scaleCadNumber(Number.MAX_VALUE, 1000), /overflow/);
  const g = fixture(); g.joints.u.position = { x: Number.MIN_VALUE, y: 1 };
  assert.throws(() => writeDXF(buildCadScene(g), 'm'), /underflow/);
  assert.throws(() => writeSolidWorksMacro(buildCadScene(g), 'm'), /underflow/);
});

test('distinct endpoints that collapse under unit conversion are rejected rather than silently merged', () => {
  const scene: CadScene = {
    ...buildCadScene(fixture()),
    entities: [{ id: 'nearby', sourceId: 'nearby', label: '', layer: 'Unowned', kind: 'outline', type: 'line',
      start: { x: 3, y: 0 }, end: { x: 3.0000000000000004, y: 0 }, construction: false }],
  };
  assert.throws(() => writeDXF(scene, 'mm'), /loses segment precision/);
  assert.doesNotThrow(() => writeDXF(scene, 'm'));
});

test('public writers reject unsafe, duplicate, nonfinite or zero-length manually supplied scenes', () => {
  const scene = buildCadScene(fixture());
  const writeBoth = (value: CadScene) => {
    assert.throws(() => writeDXF(value, 'mm'));
    assert.throws(() => writeSolidWorksMacro(value, 'mm'));
  };
  writeBoth({ ...scene, layers: [...scene.layers, scene.layers[0]] });
  writeBoth({ ...scene, layers: [{ ...scene.layers[0], name: 'bad\n0\nEOF' }] });
  writeBoth({ ...scene, entities: [...scene.entities, scene.entities[0]] });
  const source = { id: 'bad', sourceId: 'bad', layer: 'Unowned', label: '' };
  const invalidEntities: CadEntity[] = [
    { ...source, type: 'circle', kind: 'joint', center: { x: 0, y: 0 }, radius: -1 },
    { ...source, type: 'circle', kind: 'joint', center: { x: Infinity, y: 0 }, radius: 1 },
    { ...source, type: 'line', kind: 'outline', construction: false, start: { x: 1, y: 1 }, end: { x: 1, y: 1 } },
    { ...source, type: 'polyline', kind: 'outline', construction: false, points: [{ x: 0, y: 0 }, { x: 1, y: 0 }], closed: true },
  ];
  for (const entity of invalidEntities) writeBoth({ ...scene, entities: [entity] });
  assert.doesNotThrow(() => validateCadScene(scene));
});

test('legacy wrapper positional signatures and defaults remain compatible with the full-graph writers', () => {
  const g = fixture(), scene = buildCadScene(g);
  assert.equal(exportDXF(...args(g)), writeDXF(scene, 'mm'));
  assert.equal(exportSolidWorksMacro(...args(g)), writeSolidWorksMacro(scene, 'mm'));
  assert.equal(exportDXF(...args(g), false, 'in'), writeDXF(buildCadScene(g, false), 'in'));
  assert.equal(exportSolidWorksMacro(...args(g), false, 'cm'), writeSolidWorksMacro(buildCadScene(g, false), 'cm'));
});
