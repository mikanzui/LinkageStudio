import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import type { MechanismState } from '../../src/types';
import { computeBodyTransform, worldToLocal } from '../../src/core/body-transform';
import { encodeDocument } from '../../src/document/codec';
import type { JsonObject } from '../../src/document/codec';

export function createScissorLift() {
  const graph: MechanismState = {
    joints: {}, links: {}, bodies: {}, baseBodyId: 'base', sliders: {}, colliders: {},
    outlines: {}, images: {}, springs: {}, tracers: {}, forceSensors: {},
  };
  const floorY = 800;
  const positions = {
    A: [200, floorY], railMin: [330, floorY], railMax: [560, floorY], B: [520, floorY],
    C: [200, 580], D: [520, 580], M: [360, 690],
    E: [200, 360], F: [520, 360], N: [360, 470], L: [160, 360], R: [760, 360],
  } as const;
  const fixed = ['A', 'railMin', 'railMax'];
  for (const [id, [x, y]] of Object.entries(positions)) {
    graph.joints[id] = {
      id, position: { x, y }, type: fixed.includes(id) ? 'fixed' : 'revolute',
      connectedLinkIds: [], label: id,
    };
  }

  function body(id: string, name: string, jointIds: string[], color: string, frame: [string, string]) {
    graph.bodies[id] = {
      id, name, jointIds, color, showLinks: id !== 'base', useOutlineCOM: false,
      frame: { jointIds: frame, angleOffset: 0 },
    };
    for (let i = 0; i < jointIds.length; i++) {
      for (let j = i + 1; j < jointIds.length; j++) {
        const [a, b] = [jointIds[i], jointIds[j]].sort();
        const linkId = `link_${a}_${b}`;
        if (graph.links[linkId]) continue;
        const p = graph.joints[a].position, q = graph.joints[b].position;
        graph.links[linkId] = { id: linkId, jointIds: [a, b], restLength: Math.hypot(q.x - p.x, q.y - p.y), mass: 1 };
        graph.joints[a].connectedLinkIds.push(linkId);
        graph.joints[b].connectedLinkIds.push(linkId);
      }
    }
  }
  function rectangle(id: string, bodyId: string, points: { x: number; y: number }[]) {
    graph.outlines[id] = {
      id, bodyId, name: graph.bodies[bodyId].name, visible: true, closed: true, points,
    };
  }
  function arm(id: string, name: string, jointIds: [string, string, string], color: string) {
    body(id, name, jointIds, color, [jointIds[0], jointIds[2]]);
    const a = graph.joints[jointIds[0]].position, b = graph.joints[jointIds[2]].position;
    const halfLength = Math.hypot(b.x - a.x, b.y - a.y) / 2 + 10;
    rectangle(`${id}-outline`, id, [
      { x: -halfLength, y: -9 }, { x: halfLength, y: -9 },
      { x: halfLength, y: 9 }, { x: -halfLength, y: 9 },
    ]);
  }
  arm('lower-rising', 'Lower rising arm', ['A', 'M', 'D'], '#29935b');
  arm('lower-falling', 'Lower crossing arm', ['B', 'M', 'C'], '#d48a18');
  arm('upper-rising', 'Upper rising arm', ['C', 'N', 'F'], '#347ec5');
  arm('upper-falling', 'Upper crossing arm', ['D', 'N', 'E'], '#c54b7c');
  // F slides on the platform but must not become one of its rigid members.
  body('platform', 'Lift platform / moving rail', ['L', 'E', 'R'], '#188e9a', ['L', 'R']);
  body('base', 'Fixed floor rail', fixed, '#68706d', ['A', 'railMax']);
  for (const [id, bodyId, left, right, y, halfWidth] of [
    ['platform-outline', 'platform', 150, 770, 360, 12],
    ['base-outline', 'base', 185, 575, floorY, 8],
  ] as const) {
    const transform = computeBodyTransform(graph.bodies[bodyId], graph.joints);
    rectangle(id, bodyId, [
      { x: left, y: y - halfWidth }, { x: right, y: y - halfWidth },
      { x: right, y: y + halfWidth }, { x: left, y: y + halfWidth },
    ].map(point => worldToLocal(point, transform)));
  }
  graph.sliders['floor-slider'] = {
    id: 'floor-slider', jointIdA: 'railMin', jointIdB: 'B', jointIdC: 'railMax', t: 190 / 230,
  };
  graph.sliders['platform-slider'] = {
    id: 'platform-slider', jointIdA: 'L', jointIdB: 'F', jointIdC: 'R', t: 360 / 600,
  };
  graph.springs!['lift-assist'] = {
    id: 'lift-assist', name: 'Platform lift assist', kind: 'linear',
    anchorA: { type: 'world', position: { x: 760, y: 0 } }, anchorB: { type: 'joint', jointId: 'R' },
    stiffness: 2500, damping: 10, restLength: 180, prestressDelta: 0,
  };
  graph.springs!['lift-damper'] = {
    id: 'lift-damper', name: 'Lift dashpot', kind: 'damper',
    anchorA: { type: 'world', position: { x: 200, y: 0 } }, anchorB: { type: 'joint', jointId: 'E' },
    stiffness: 0, damping: 400, restLength: 0, prestressDelta: 0,
  };
  graph.tracers['platform-trace'] = {
    id: 'platform-trace', bodyId: 'platform', name: 'Platform vertical travel', enabled: true,
    localPosition: worldToLocal({ x: 760, y: 348 }, computeBodyTransform(graph.bodies.platform, graph.joints)),
  };
  graph.tracers['scissor-trace'] = {
    id: 'scissor-trace', bodyId: 'lower-rising', name: 'Lower center arc', enabled: true,
    localPosition: { x: 0, y: 0 },
  };
  graph.forceSensors!['arm-load'] = {
    id: 'arm-load', name: 'Lower arm model load', linkId: 'link_A_D', enabled: true,
  };
  return {
    ...graph, projectName: 'Spring-Assisted Two-Stage Scissor Lift',
    simulationSettings: {
      gravityEnabled: false, gravityStrength: 250, damping: .93, dragMultiplier: 25, dragDamping: .25,
    },
    viewPreferences: {
      gridLevel: 'normal', showLinks: true, showVectors: false, showRulers: true,
      showForceUnits: false, showLoads: false, showReactions: false,
    },
  };
}

export function scissorLiftText() {
  return encodeDocument(JSON.parse(JSON.stringify(createScissorLift())) as JsonObject, '17.0.0');
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const output = resolve(process.argv[2] ?? 'examples/spring-scissor-lift.slinker');
  await mkdir(dirname(output), { recursive: true });
  await writeFile(output, scissorLiftText() + '\n');
  console.log(output);
}
