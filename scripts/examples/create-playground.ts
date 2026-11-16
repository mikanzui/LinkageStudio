import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import type { MechanismState, MechanismSpring } from '../../src/types';
import { encodeDocument } from '../../src/document/codec';
import type { JsonObject } from '../../src/document/codec';

export function createPlayground() {
  const graph: MechanismState = { joints: {}, links: {}, bodies: {}, baseBodyId: 'base',
    sliders: {}, colliders: {}, outlines: {}, images: {}, springs: {}, tracers: {}, forceSensors: {} };
  const fixed: string[] = [];
  function joint(id: string, x: number, y: number, ground = false, label?: string) {
    graph.joints[id] = { id, position: { x, y }, type: ground ? 'fixed' : 'revolute', connectedLinkIds: [], ...(label ? { label } : {}) };
    if (ground) fixed.push(id);
  }
  function link(id: string, a: string, b: string) {
    const p = graph.joints[a].position, q = graph.joints[b].position;
    graph.links[id] = { id, jointIds: [a, b], restLength: Math.hypot(q.x - p.x, q.y - p.y), mass: 1 };
    for (const j of [a, b]) graph.joints[j].connectedLinkIds.push(id);
  }
  function body(id: string, name: string, jointIds: string[], color: string, angleOffset = 0) {
    graph.bodies[id] = { id, name, jointIds, color, showLinks: true, useOutlineCOM: false,
      ...(jointIds.length === 2 ? { frame: { jointIds: [jointIds[0], jointIds[1]] as [string, string], angleOffset } } : {}) };
  }
  function strip(id: string, length: number, halfWidth: number) {
    graph.outlines[id + '-shape'] = { id: id + '-shape', bodyId: id, name: graph.bodies[id].name, visible: true, closed: true,
      points: [{ x: -length / 2, y: -halfWidth }, { x: length / 2, y: -halfWidth }, { x: length / 2, y: halfWidth }, { x: -length / 2, y: halfWidth }] };
  }
  function slider(id: string, a: string, b: string, c: string) {
    const p = graph.joints[a].position, q = graph.joints[b].position, r = graph.joints[c].position;
    graph.sliders[id] = { id, jointIdA: a, jointIdB: b, jointIdC: c,
      t: ((q.x - p.x) * (r.x - p.x) + (q.y - p.y) * (r.y - p.y)) / ((r.x - p.x) ** 2 + (r.y - p.y) ** 2) };
  }
  function spring(s: MechanismSpring) { graph.springs![s.id] = s; }
  function tracer(id: string, bodyId: string, x: number, y: number, name: string) {
    graph.tracers[id] = { id, bodyId, localPosition: { x, y }, name, enabled: true };
  }

  joint('crank-pivot', 160, 220, true, 'Crank');
  joint('crank-pin', 220, 140);
  joint('output', 440, 220, false, 'Output');
  joint('crank-rail-a', 280, 220, true);
  joint('crank-rail-c', 580, 220, true);
  link('crank-arm', 'crank-pivot', 'crank-pin');
  link('connecting-rod', 'crank-pin', 'output');
  body('crank', 'Crank', ['crank-pivot', 'crank-pin'], '#2e9d55');
  body('rod', 'Connecting rod', ['crank-pin', 'output'], '#d28b12');
  strip('crank', 100, 9); strip('rod', graph.links['connecting-rod'].restLength, 7);
  slider('crank-slider', 'crank-rail-a', 'output', 'crank-rail-c');
  spring({ id: 'crank-return', name: 'Crank return spring', kind: 'linear', anchorA: { type: 'world', position: { x: 160, y: 60 } },
    anchorB: { type: 'joint', jointId: 'crank-pin' }, stiffness: 1200, damping: 10, restLength: 50, prestressDelta: 0 });
  tracer('crank-trace', 'crank', 50, 0, 'Crank circle');
  tracer('rod-trace', 'rod', 0, 14, 'Coupler curve');
  graph.forceSensors!['rod-load'] = { id: 'rod-load', linkId: 'connecting-rod', enabled: true, name: 'Connecting rod load' };

  joint('cart-a', 1030, 160, false, 'Carriage');
  joint('cart-b', 1030, 210);
  for (const [id, x, y] of [['cart-top-a', 760, 160], ['cart-top-c', 1130, 160], ['cart-bottom-a', 760, 210], ['cart-bottom-c', 1130, 210]] as const) joint(id, x, y, true);
  link('cart-spine', 'cart-a', 'cart-b');
  body('cart', 'Damped carriage', ['cart-a', 'cart-b'], '#168aab', -Math.PI / 2);
  graph.outlines['cart-shape'] = { id: 'cart-shape', bodyId: 'cart', name: 'Carriage plate', visible: true, closed: true,
    points: [{ x: 0, y: -38 }, { x: 60, y: -38 }, { x: 60, y: 38 }, { x: 0, y: 38 }] };
  slider('cart-top', 'cart-top-a', 'cart-a', 'cart-top-c');
  slider('cart-bottom', 'cart-bottom-a', 'cart-b', 'cart-bottom-c');
  spring({ id: 'carriage-spring', name: 'Carriage return spring', kind: 'linear', anchorA: { type: 'joint', jointId: 'cart-top-a' },
    anchorB: { type: 'joint', jointId: 'cart-a' }, stiffness: 900, damping: 10, restLength: 150, prestressDelta: 0 });
  spring({ id: 'carriage-damper', name: 'Carriage dashpot', kind: 'damper', anchorA: { type: 'joint', jointId: 'cart-bottom-a' },
    anchorB: { type: 'link', linkId: 'cart-spine', t: 1 }, stiffness: 0, damping: 40, restLength: 0, prestressDelta: 0 });
  joint('stop-a', 850, 135, true); joint('stop-b', 850, 235, true);
  graph.colliders['carriage-stop'] = { id: 'carriage-stop', jointIdA: 'stop-a', jointIdC: 'stop-b', bodyIds: ['cart'] };
  tracer('carriage-trace', 'cart', 30, 0, 'Carriage travel');

  joint('gripper-pivot', 460, 560, true, 'Gripper');
  joint('jaw-left-tip', 370, 450, false, 'Left jaw');
  joint('jaw-right-tip', 550, 450, false, 'Right jaw');
  link('left-jaw-arm', 'gripper-pivot', 'jaw-left-tip');
  link('right-jaw-arm', 'gripper-pivot', 'jaw-right-tip');
  body('left-jaw', 'Left gripper jaw', ['gripper-pivot', 'jaw-left-tip'], '#be4f86');
  body('right-jaw', 'Right gripper jaw', ['gripper-pivot', 'jaw-right-tip'], '#695cba');
  const jawLength = graph.links['left-jaw-arm'].restLength;
  strip('left-jaw', jawLength, 10); strip('right-jaw', jawLength, 10);
  spring({ id: 'gripper-torsion', name: 'Gripper torsion spring', kind: 'torsional',
    anchorA: { type: 'link', linkId: 'left-jaw-arm', t: 0 }, anchorB: { type: 'link', linkId: 'right-jaw-arm', t: 0 },
    stiffness: 8000, damping: 3000, restLength: .5, prestressDelta: 0 });
  tracer('jaw-trace', 'left-jaw', jawLength / 2, 0, 'Gripper arc');
  graph.forceSensors!['jaw-load'] = { id: 'jaw-load', linkId: 'left-jaw-arm', enabled: true, name: 'Left jaw load' };
  body('base', 'Ground', fixed, '#e15a4e'); graph.bodies.base.showLinks = false;

  return { ...graph, projectName: 'Mechanism Playground',
    simulationSettings: { gravityEnabled: false, gravityStrength: 250, damping: .98, dragMultiplier: 25, dragDamping: .25 },
    viewPreferences: { gridLevel: 'normal', showLinks: true, showVectors: false, showRulers: true, showForceUnits: false, showLoads: false, showReactions: false } };
}

export function playgroundText() {
  return encodeDocument(JSON.parse(JSON.stringify(createPlayground())) as JsonObject, '0.16.0-rebuild.4');
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const output = resolve(process.argv[2] ?? 'examples/mechanism-playground.slinker');
  await mkdir(dirname(output), { recursive: true }); await writeFile(output, playgroundText() + '\n');
  console.log(output);
}
