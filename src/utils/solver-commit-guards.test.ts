import { describe, it, expect } from 'vitest';
import { jointPositionsFinite } from './solver-commit-guards';

describe('jointPositionsFinite', () => {
  it('returns true for empty map', () => {
    expect(jointPositionsFinite(new Map())).toBe(true);
  });

  it('returns false for NaN', () => {
    const m = new Map([['a', { x: NaN, y: 0 }]]);
    expect(jointPositionsFinite(m)).toBe(false);
  });

  it('returns true for finite positions', () => {
    const m = new Map([
      ['a', { x: 1, y: -2 }],
      ['b', { x: 0, y: 0 }],
    ]);
    expect(jointPositionsFinite(m)).toBe(true);
  });
});
