import { describe, expect, it } from 'vitest';
import {
  equilibriumRestLength,
  linearSpringAccelerationOnB,
  siStiffnessToSim,
  siDampingToSim,
} from './spring-forces';

describe('equilibriumRestLength', () => {
  it('adds prestress to natural rest', () => {
    expect(equilibriumRestLength(100, 5)).toBe(105);
    expect(equilibriumRestLength(100, -10)).toBe(90);
  });
});

describe('linearSpringAccelerationOnB', () => {
  it('returns zero when A and B coincide (degenerate length)', () => {
    const a = linearSpringAccelerationOnB(
      { x: 0, y: 0 },
      { x: 0, y: 0 },
      { x: 0, y: 0 },
      { x: 1, y: 0 },
      10,
      0,
      0,
    );
    expect(a.ax).toBe(0);
    expect(a.ay).toBe(0);
  });

  it('has no force when length matches equilibrium', () => {
    const a = linearSpringAccelerationOnB(
      { x: 0, y: 0 },
      { x: 100, y: 0 },
      { x: 0, y: 0 },
      { x: 0, y: 0 },
      10,
      0,
      100,
    );
    expect(a.ax).toBeCloseTo(0, 6);
    expect(a.ay).toBeCloseTo(0, 6);
  });

  it('pulls B toward A when stretched along +x', () => {
    const k = 2;
    const LEq = 50;
    const a = linearSpringAccelerationOnB(
      { x: 0, y: 0 },
      { x: 100, y: 0 },
      { x: 0, y: 0 },
      { x: 0, y: 0 },
      k,
      0,
      LEq,
    );
    // e = 50, u = (1,0), F = -k*e*u = -100
    expect(a.ax).toBeCloseTo(-100, 5);
    expect(a.ay).toBeCloseTo(0, 5);
  });

  it('pushes B away when compressed', () => {
    const k = 1;
    const a = linearSpringAccelerationOnB(
      { x: 0, y: 0 },
      { x: 40, y: 0 },
      { x: 0, y: 0 },
      { x: 0, y: 0 },
      k,
      0,
      100,
    );
    // e = -60, F = -k*e*u = +60
    expect(a.ax).toBeCloseTo(60, 5);
    expect(a.ay).toBeCloseTo(0, 5);
  });

  it('damping opposes relative motion along the spring', () => {
    const k = 0;
    const c = 10;
    const a = linearSpringAccelerationOnB(
      { x: 0, y: 0 },
      { x: 100, y: 0 },
      { x: 0, y: 0 },
      { x: 50, y: 0 },
      k,
      c,
      100,
    );
    // v_rel = (50,0), u = (1,0), valong = 50, f = -500, a = (-500, 0)
    expect(a.ax).toBeCloseTo(-500, 5);
    expect(a.ay).toBeCloseTo(0, 5);
  });
});

describe('SI scaling helpers', () => {
  it('maps positive SI to positive sim factors', () => {
    expect(siStiffnessToSim(100)).toBeGreaterThan(0);
    expect(siDampingToSim(5)).toBeGreaterThan(0);
  });
});
