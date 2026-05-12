import { describe, expect, it } from 'vitest';
import { validateMechanismForSimulateStep } from './mechanism-sim-validation';
import type { Joint, Link } from '../types';

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
});
