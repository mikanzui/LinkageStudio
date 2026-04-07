import { describe, expect, it } from 'vitest';
import { deserializeMechanism, serializeMechanism } from './file-io';
import type { Body, Joint, Link, MechanismSpring } from '../types';

const baseBodyId = 'base';

function minimalMechanism(): {
  joints: Record<string, Joint>;
  links: Record<string, Link>;
  bodies: Record<string, Body>;
  springs: Record<string, MechanismSpring>;
} {
  const joints: Record<string, Joint> = {
    j1: { id: 'j1', type: 'fixed', position: { x: 0, y: 0 }, connectedLinkIds: [] },
    j2: { id: 'j2', type: 'revolute', position: { x: 100, y: 0 }, connectedLinkIds: ['l1'] },
  };
  const links: Record<string, Link> = {
    l1: { id: 'l1', jointIds: ['j1', 'j2'], restLength: 100, mass: 1 },
  };
  const bodies: Record<string, Body> = {
    [baseBodyId]: {
      id: baseBodyId,
      name: 'Base',
      color: '#E53935',
      jointIds: ['j1'],
      useOutlineCOM: false,
      showLinks: true,
    },
    b1: {
      id: 'b1',
      name: 'Body 1',
      color: '#4CAF50',
      jointIds: ['j2'],
      useOutlineCOM: false,
      showLinks: true,
    },
  };
  const springs: Record<string, MechanismSpring> = {
    sp1: {
      id: 'sp1',
      kind: 'linear',
      anchorA: { type: 'joint', jointId: 'j1' },
      anchorB: { type: 'link', linkId: 'l1', t: 0.25 },
      stiffness: 120,
      damping: 8,
      restLength: 0.1,
      prestressDelta: 0.02,
    },
  };
  return { joints, links, bodies, springs };
}

describe('serializeMechanism / deserializeMechanism springs', () => {
  it('round-trips springs with anchors', () => {
    const { joints, links, bodies, springs } = minimalMechanism();
    const json = serializeMechanism(joints, links, bodies, baseBodyId, {}, undefined, undefined, undefined, undefined, springs);
    const out = deserializeMechanism(json);
    expect(out).not.toBeNull();
    expect(out!.springs?.sp1).toBeDefined();
    const sp = out!.springs!.sp1;
    expect(sp.kind).toBe('linear');
    expect(sp.stiffness).toBe(120);
    expect(sp.damping).toBe(8);
    expect(sp.restLength).toBeCloseTo(0.1);
    expect(sp.prestressDelta).toBeCloseTo(0.02);
    expect(sp.anchorA).toEqual({ type: 'joint', jointId: 'j1' });
    expect(sp.anchorB).toEqual({ type: 'link', linkId: 'l1', t: 0.25 });
  });
});
