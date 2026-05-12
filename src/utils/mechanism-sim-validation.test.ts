import { describe, expect, it } from 'vitest';
import { validateMechanismForSimulateStep } from './mechanism-sim-validation';
import type { ColliderConstraint, Joint, Link, SliderConstraint } from '../types';

function j(id: string, x: number, y: number, t: Joint['type'] = 'revolute'): Joint {
  return { id, type: t, position: { x, y }, connectedLinkIds: [] };
}

describe('validateMechanismForSimulateStep', () => {
  it('passes simple valid mechanism', () => {
    const joints: Record<string, Joint> = { a: j('a', 0, 0, 'fixed'), b: j('b', 100, 0) };
    const links: Record<string, Link> = { l: { id: 'l', jointIds: ['a', 'b'], restLength: 100, mass: 1 } };
    expect(validateMechanismForSimulateStep(joints, links).ok).toBe(true);
  });

  it('fails on NaN joint', () => {
    const joints: Record<string, Joint> = { a: { ...j('a', NaN, 0), type: 'fixed' } };
    expect(validateMechanismForSimulateStep(joints, {}).ok).toBe(false);
  });

  it('fails on degenerate link rest length', () => {
    const joints: Record<string, Joint> = { a: j('a', 0, 0, 'fixed'), b: j('b', 1, 0) };
    const links: Record<string, Link> = { l: { id: 'l', jointIds: ['a', 'b'], restLength: 0, mass: 1 } };
    expect(validateMechanismForSimulateStep(joints, links).ok).toBe(false);
  });

  /** Issue #16: extends pre-sim guardrails beyond joints+links (same helper as simulate tick uses). */
  it('passes when optional sliders reference valid joints', () => {
    const joints: Record<string, Joint> = {
      a: j('a', 0, 0, 'fixed'),
      b: j('b', 50, 0),
      c: j('c', 100, 0),
    };
    const links: Record<string, Link> = { l: { id: 'l', jointIds: ['a', 'c'], restLength: 100, mass: 1 } };
    const sliders: Record<string, SliderConstraint> = {
      s1: { id: 's1', jointIdA: 'a', jointIdB: 'b', jointIdC: 'c', t: 0.5 },
    };
    expect(validateMechanismForSimulateStep(joints, links, sliders).ok).toBe(true);
  });

  it('fails when a slider references a missing joint (#16)', () => {
    const joints: Record<string, Joint> = { a: j('a', 0, 0, 'fixed'), b: j('b', 50, 0) };
    const sliders: Record<string, SliderConstraint> = {
      s1: { id: 's1', jointIdA: 'a', jointIdB: 'b', jointIdC: 'missing', t: 0.5 },
    };
    const r = validateMechanismForSimulateStep(joints, {}, sliders);
    expect(r.ok).toBe(false);
    expect(r.reason).toMatch(/slider/i);
  });

  it('fails when a collider references a missing joint (#16)', () => {
    const joints: Record<string, Joint> = { a: j('a', 0, 0, 'fixed') };
    const colliders: Record<string, ColliderConstraint> = {
      c1: { id: 'c1', jointIdA: 'a', jointIdC: 'ghost', bodyIds: [] },
    };
    const r = validateMechanismForSimulateStep(joints, {}, undefined, colliders);
    expect(r.ok).toBe(false);
    expect(r.reason).toMatch(/collider/i);
  });
});
