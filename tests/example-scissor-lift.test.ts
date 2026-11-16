import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { createScissorLift, scissorLiftText } from '../scripts/examples/create-scissor-lift';
import { decodeDocument, encodeDocument } from '../src/document/codec';
import { compileMechanism, maximumLinkError } from '../src/core/compile-mechanism';
import { computeBodyTransform, localToWorld } from '../src/core/body-transform';
import { SimulationSession } from '../src/core/simulation-session';
import type { FrameOptions } from '../src/core/simulation-session';

type Graph = ReturnType<typeof compileMechanism>;

function railError(graph: Graph, id: string) {
  const rail = graph.sliders[id];
  const a = graph.joints[rail.jointIdA].position, b = graph.joints[rail.jointIdB].position;
  const c = graph.joints[rail.jointIdC].position;
  const dx = c.x - a.x, dy = c.y - a.y, length = Math.hypot(dx, dy);
  assert(length > 1);
  const t = ((b.x - a.x) * dx + (b.y - a.y) * dy) / length ** 2;
  return Math.max(Math.abs((b.x - a.x) * dy - (b.y - a.y) * dx) / length, Math.max(0, -t, t - 1) * length);
}

test('scissor lift is reproducible, lossless and contains only explicit public source data', () => {
  const source = createScissorLift(), unchanged = structuredClone(source), text = scissorLiftText();
  assert.equal(readFileSync(new URL('../examples/spring-scissor-lift.slinker', import.meta.url), 'utf8').replace(/\r\n/g, '\n'), text + '\n');
  assert.equal(scissorLiftText(), text);
  const decoded = decodeDocument(text);
  assert(decoded.ok); assert.deepEqual(decoded.issues, []);
  assert.equal(decoded.context.source.writerVersion, '17.0.0');
  assert.equal(encodeDocument(decoded.context.source, '17.0.0'), text);
  for (const key of Object.keys(source) as (keyof typeof source)[]) assert.deepEqual(decoded.context.source[key], source[key]);
  assert.equal(Object.keys(source.joints).length, 12);
  assert.equal(Object.keys(source.links).length, 18);
  assert.equal(Object.keys(source.bodies).length, 6);
  assert.equal(Object.keys(source.outlines).length, 6);
  assert.equal(Object.keys(source.tracers).length, 2);
  assert.equal(Object.keys(source.forceSensors!).length, 1);
  assert(!source.bodies.platform.jointIds.includes('F'));
  assert.equal(source.bodies.base.showLinks, false);
  for (const body of Object.values(source.bodies)) {
    assert(body.frame);
    for (let i = 0; i < body.jointIds.length; i++) {
      for (let j = i + 1; j < body.jointIds.length; j++) {
        const [a, b] = [body.jointIds[i], body.jointIds[j]].sort();
        assert(source.links[`link_${a}_${b}`]);
      }
    }
  }
  const graph = compileMechanism(source);
  assert(Object.keys(graph.joints).length > Object.keys(source.joints).length, 'Compiler must derive its own braces');
  assert(!Object.values(source.joints).some(joint => joint.hidden));
  assert.deepEqual(source, unchanged);
});

function runMotion(manual: boolean) {
  const source = createScissorLift(), unchanged = structuredClone(source);
  let graph = compileMechanism(source);
  const session = new SimulationSession(graph);
  const fixedPositions = new Map([...graph.fixedIds].map(id => [id, structuredClone(graph.joints[id].position)]));
  let maximumLinkResidual = 0, maximumRailError = 0, maximumRise = 0, floorTravel = 0, maximumSensorLoad = 0;
  let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
  for (let i = 0; i < 600; i++) {
    const pull: FrameOptions['pull'] = manual ? {
      linkId: 'link_E_R', grabT: 1,
      target: { x: 760, y: 360 - 160 * Math.min(1, i / 180) },
    } : null;
    const frame = session.step(graph, { ...source.simulationSettings, dt: 1 / 60, pull, analysis: true });
    assert(frame.ok, frame.ok ? '' : `Frame ${i}: ${frame.error}`);
    graph = { ...graph, joints: frame.joints };
    maximumLinkResidual = Math.max(maximumLinkResidual, maximumLinkError(graph.joints, graph.links));
    for (const id of Object.keys(graph.sliders)) maximumRailError = Math.max(maximumRailError, railError(graph, id));
    for (const [id, position] of fixedPositions) assert.deepEqual(graph.joints[id].position, position);
    for (const joint of Object.values(graph.joints)) {
      assert(Number.isFinite(joint.position.x) && Number.isFinite(joint.position.y));
    }
    const points = Object.values(graph.joints).filter(j => !j.hidden).map(j => j.position);
    for (const spring of Object.values(graph.springs!)) {
      for (const anchor of [spring.anchorA, spring.anchorB]) if (anchor.type === 'world') points.push(anchor.position);
    }
    for (const outline of Object.values(graph.outlines)) {
      const transform = computeBodyTransform(graph.bodies[outline.bodyId], graph.joints);
      points.push(...outline.points.map(point => localToWorld(point, transform)));
    }
    for (const tracer of Object.values(graph.tracers)) {
      points.push(localToWorld(tracer.localPosition, computeBodyTransform(graph.bodies[tracer.bodyId], graph.joints)));
    }
    for (const point of points) {
      assert(Number.isFinite(point.x) && Number.isFinite(point.y));
      assert(point.x >= 140 && point.x <= 780 && point.y >= -1 && point.y <= 815, `Visible point out of fit envelope: ${JSON.stringify(point)}`);
      minX = Math.min(minX, point.x); maxX = Math.max(maxX, point.x);
      minY = Math.min(minY, point.y); maxY = Math.max(maxY, point.y);
    }
    assert(Math.abs(graph.joints.R.position.x - 760) < .1);
    assert(Math.abs(graph.joints.E.position.y - graph.joints.R.position.y) < .1);
    assert(graph.joints.B.position.x >= 330 - .1 && graph.joints.B.position.x <= 560 + .1);
    maximumRise = Math.max(maximumRise, 360 - graph.joints.R.position.y);
    floorTravel = Math.max(floorTravel, 520 - graph.joints.B.position.x);
    const load = frame.result.forceAnalysis?.linkForces.get(source.forceSensors!['arm-load'].linkId)?.axialForce;
    assert(typeof load === 'number' && Number.isFinite(load), 'Moving arm sensor must return a finite model load');
    maximumSensorLoad = Math.max(maximumSensorLoad, Math.abs(load));
  }
  assert(maximumLinkResidual < .1, `Link residual ${maximumLinkResidual}`);
  assert(maximumRailError < .1, `Rail error ${maximumRailError}`);
  assert(maximumRise > 80, `Platform rise ${maximumRise}`);
  assert(floorTravel > 30, `Floor slider travel ${floorTravel}`);
  assert(maximumSensorLoad > 0);
  assert(minX < maxX && minY < maxY && minY === 0);
  assert.deepEqual(graph.springs, source.springs, 'World anchors and spring parameters must remain exact');
  assert.deepEqual(source, unchanged);
  console.log({ manual, maximumRise, floorTravel, maximumLinkResidual, maximumRailError, maximumSensorLoad,
    bounds: { minX, maxX, minY, maxY }, finalPlatformY: graph.joints.R.position.y });
  return graph;
}

test('spring lift runs automatically for ten seconds at 60Hz within links, rails and fit bounds', () => {
  runMotion(false);
});

test('controlled manual platform pull produces coordinated two-stage lift response', () => {
  const graph = runMotion(true);
  assert(Math.abs(graph.joints.R.position.y - 200) < 5, 'Platform must follow the pull target, not only move under its spring');
  assert(graph.joints.B.position.x < 490);
  assert(graph.joints.C.position.y < 540 && graph.joints.N.position.y < 410);
});
