import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { createPlayground, playgroundText } from '../scripts/examples/create-playground';
import { decodeDocument } from '../src/document/codec';
import { compileMechanism } from '../src/core/compile-mechanism';
import { SimulationSession } from '../src/core/simulation-session';

test('playground file is reproducible and decodes without warnings', () => {
  const text = playgroundText(); assert.equal(readFileSync(new URL('../examples/mechanism-playground.slinker', import.meta.url), 'utf8').replace(/\r\n/g, '\n').trimEnd(), text);
  const decoded = decodeDocument(text); assert(decoded.ok); assert.deepEqual(decoded.issues, []);
});

test('all three playground mechanisms move automatically and stay constrained for ten seconds', () => {
  const source = createPlayground(), unchanged = structuredClone(source);
  let graph = compileMechanism(source); const session = new SimulationSession(graph);
  const travel = { output: 0, 'cart-a': 0, 'jaw-left-tip': 0, 'jaw-right-tip': 0 };
  let cartMin = Infinity, maximumLengthError = 0;
  for (let i = 0; i < 600; i++) {
    const frame = session.step(graph, { ...source.simulationSettings, dt: 1 / 60, pull: null, analysis: true });
    assert(frame.ok, frame.ok ? '' : frame.error); graph = { ...graph, joints: frame.joints };
    maximumLengthError = Math.max(maximumLengthError, frame.result.residual);
    for (const id of Object.keys(travel) as (keyof typeof travel)[]) {
      const a = source.joints[id].position, b = graph.joints[id].position;
      travel[id] = Math.max(travel[id], Math.hypot(b.x - a.x, b.y - a.y));
    }
    cartMin = Math.min(cartMin, graph.joints['cart-a'].position.x);
    for (const id of source.bodies.base.jointIds) assert.deepEqual(graph.joints[id].position, source.joints[id].position);
    assert(Math.abs(graph.joints.output.position.y - 220) < .1);
    assert(Math.abs(graph.joints['cart-a'].position.y - 160) < .1);
    assert(Math.abs(graph.joints['cart-b'].position.y - 210) < .1);
    assert(graph.joints['cart-a'].position.x >= 850 - .1);
  }
  assert(travel.output > 35, JSON.stringify(travel)); assert(travel['cart-a'] > 140, JSON.stringify(travel));
  assert(travel['jaw-left-tip'] > 30 && travel['jaw-right-tip'] > 30, JSON.stringify(travel));
  assert(cartMin < 852, 'Carriage must actually reach its stop, not merely stay on the allowed side');
  assert(maximumLengthError < .1); assert.deepEqual(source, unchanged);
  console.log({ travel, cartMin, maximumLengthError });
});
