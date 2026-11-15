import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { MechanismState, Joint, Vec2 } from '../src/types';
import { compileMechanism } from '../src/core/compile-mechanism';
import { SimulationSession } from '../src/core/simulation-session';

const j = (id: string, p: Vec2): Joint => ({ id, type: 'revolute', position: p, connectedLinkIds: [] });
for (const angle of [0, .7, Math.PI / 2]) for (const movingRail of [false, true]) test(`dynamic ${movingRail ? 'moving rail/fixed B' : 'fixed rail/free B'} angle ${angle}`, () => {
  const transform = (x: number, y: number) => ({ x: 200 + Math.cos(angle) * x - Math.sin(angle) * y, y: 100 + Math.sin(angle) * x + Math.cos(angle) * y });
  const fixed = movingRail ? ['b'] : ['a', 'c'];
  const g: MechanismState = { joints: { a: j('a', transform(0, 0)), b: j('b', transform(25, 0)), c: j('c', transform(100, 0)) },
    links: { ac: { id: 'ac', jointIds: ['a', 'c'], restLength: 100, mass: 1 } },
    bodies: { base: { id: 'base', name: 'Base', color: '#f00', jointIds: fixed, showLinks: true, useOutlineCOM: false },
      rail: { id: 'rail', name: 'Rail', color: '#0f0', jointIds: ['a', 'c'], showLinks: true, useOutlineCOM: false } },
    baseBodyId: 'base', sliders: { s: { id: 's', jointIdA: 'a', jointIdB: 'b', jointIdC: 'c', t: .25 } }, colliders: {}, outlines: {}, images: {}, tracers: {} };
  // A zero-rest handle link transfers a force to B without inventing another rigid span.
  if (!movingRail) { g.joints.handle = j('handle', transform(25, 0)); g.links.handle = { id: 'handle', jointIds: ['b', 'handle'], restLength: 0, mass: 1 }; }
  let current = compileMechanism(g); const session = new SimulationSession(current);
  let maxTravel = 0;
  for (let frame = 0; frame < 180; frame++) {
    const target = movingRail ? transform(-100, 100) : transform(frame < 90 ? 200 : -100, 100);
    const result = session.step(current, { dt: frame % 2 ? 1 / 60 : 1 / 12, gravityEnabled: true, gravityStrength: 250,
      damping: frame % 3 ? .5 : 1, dragMultiplier: 25, dragDamping: .25,
      pull: { linkId: movingRail ? 'ac' : 'handle', grabT: movingRail ? 1 : 0, target } });
    assert(result.ok, result.ok ? '' : result.error); current = { ...current, joints: result.joints };
    const a = current.joints.a.position, b = current.joints.b.position, c = current.joints.c.position;
    const dx = c.x - a.x, dy = c.y - a.y, length = Math.hypot(dx, dy), t = ((b.x-a.x)*dx+(b.y-a.y)*dy)/(length*length);
    assert(Math.abs(length - 100) / 100 < 1e-3); assert(Math.abs((b.x-a.x)*dy-(b.y-a.y)*dx)/length < .1);
    assert(t >= -1e-3 && t <= 1 + 1e-3);
    for (const id of fixed) assert.deepEqual(current.joints[id].position, g.joints[id].position);
    const id = movingRail ? 'c' : 'b'; maxTravel = Math.max(maxTravel, Math.hypot(current.joints[id].position.x - g.joints[id].position.x, current.joints[id].position.y - g.joints[id].position.y));
  }
  assert(maxTravel > 10);
});
