import { copyFile, mkdir, readFile, writeFile } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { createHash } from 'node:crypto';
import { EXAMPLE_PROJECTS } from '../../src/examples/catalog';
import { createPlayground } from './create-playground';
import { decodeDocument, encodeDocument } from '../../src/document/codec';
import type { JsonObject } from '../../src/document/codec';

export async function prepareExamples(root = fileURLToPath(new URL('../../', import.meta.url))) {
  const source = createPlayground();
  const subsets = [
    { filename: 'crank-slider.slinker', name: 'Spring-Driven Crank-Slider', bodies: ['crank', 'rod'], joints: ['crank-pivot', 'crank-pin', 'output', 'crank-rail-a', 'crank-rail-c'] },
    { filename: 'damped-carriage.slinker', name: 'Damped Carriage And End Stop', bodies: ['cart'], joints: ['cart-a', 'cart-b', 'cart-top-a', 'cart-top-c', 'cart-bottom-a', 'cart-bottom-c', 'stop-a', 'stop-b'] },
    { filename: 'torsion-gripper.slinker', name: 'Torsion-Spring Gripper', bodies: ['left-jaw', 'right-jaw'], joints: ['gripper-pivot', 'jaw-left-tip', 'jaw-right-tip'] },
  ];
  for (const subset of subsets) {
    const retained = new Set(subset.joints), bodyIds = new Set(['base', ...subset.bodies]);
    const graph = structuredClone(source);
    graph.projectName = subset.name;
    graph.joints = Object.fromEntries(Object.entries(graph.joints).filter(([id]) => retained.has(id)));
    graph.links = Object.fromEntries(Object.entries(graph.links).filter(([, link]) => link.jointIds.every(id => retained.has(id))));
    graph.bodies = Object.fromEntries(Object.entries(graph.bodies).filter(([id]) => bodyIds.has(id)));
    graph.bodies.base.jointIds = graph.bodies.base.jointIds.filter(id => retained.has(id));
    graph.outlines = Object.fromEntries(Object.entries(graph.outlines).filter(([, o]) => bodyIds.has(o.bodyId)));
    graph.tracers = Object.fromEntries(Object.entries(graph.tracers).filter(([, t]) => bodyIds.has(t.bodyId)));
    graph.forceSensors = Object.fromEntries(Object.entries(graph.forceSensors!).filter(([, s]) => !!graph.links[s.linkId]));
    graph.sliders = Object.fromEntries(Object.entries(graph.sliders).filter(([, s]) => [s.jointIdA, s.jointIdB, s.jointIdC].every(id => retained.has(id))));
    graph.colliders = Object.fromEntries(Object.entries(graph.colliders).filter(([, c]) => retained.has(c.jointIdA) && retained.has(c.jointIdC) && c.bodyIds.every(id => bodyIds.has(id))));
    graph.springs = Object.fromEntries(Object.entries(graph.springs!).filter(([, s]) => [s.anchorA, s.anchorB].every(a => a.type === 'world' || (a.type === 'joint' ? retained.has(a.jointId) : !!graph.links[a.linkId]))));
    await writeFile(join(root, 'examples', subset.filename), encodeDocument(JSON.parse(JSON.stringify(graph)) as JsonObject, '17.0.0') + '\n');
  }
  const output = join(root, 'public/examples'); await mkdir(output, { recursive: true });
  const manifest = [];
  for (const example of EXAMPLE_PROJECTS) {
    const path = join(root, 'examples', example.filename), bytes = await readFile(path);
    const decoded = decodeDocument(bytes.toString('utf8'));
    if (!decoded.ok) throw new Error('Invalid example: ' + example.filename);
    await copyFile(path, join(output, example.filename));
    manifest.push({ ...example, bytes: bytes.length, sha256: createHash('sha256').update(bytes).digest('hex'), warnings: decoded.issues.length });
  }
  const text = JSON.stringify(manifest, null, 2) + '\n';
  await writeFile(join(root, 'examples/catalog.json'), text);
  await writeFile(join(output, 'catalog.json'), text);
  return manifest;
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) console.log(JSON.stringify(await prepareExamples()));
