import { describe, it, expect } from 'vitest';
import {
  sigma, delta, bigA, horizonOuter, invMetric, hamiltonian, rhs, rk4Step, reflectPole,
} from '../src/physics/kerr.js';

describe('reflectPole', () => {
  it('passes a ray through the north pole (theta<0)', () => {
    const r = reflectPole(-0.05, 1.0, -2.0);
    expect(r.theta).toBeCloseTo(0.05, 12);
    expect(r.phi).toBeCloseTo(1.0 + Math.PI, 12);
    expect(r.ptheta).toBeCloseTo(2.0, 12);
  });
  it('passes a ray through the south pole (theta>pi)', () => {
    const r = reflectPole(Math.PI + 0.05, 1.0, 2.0);
    expect(r.theta).toBeCloseTo(Math.PI - 0.05, 12);
    expect(r.phi).toBeCloseTo(1.0 + Math.PI, 12);
    expect(r.ptheta).toBeCloseTo(-2.0, 12);
  });
  it('leaves an in-range theta unchanged', () => {
    const r = reflectPole(1.2, 0.5, 0.3);
    expect(r.theta).toBe(1.2);
    expect(r.phi).toBe(0.5);
    expect(r.ptheta).toBe(0.3);
  });
});

describe('metric quantities', () => {
  it('Schwarzschild horizon is r=2 when a=0', () => {
    expect(horizonOuter(0)).toBeCloseTo(2, 12);
  });
  it('extremal horizon is r=1 when a=1', () => {
    expect(horizonOuter(1)).toBeCloseTo(1, 12);
  });
  it('horizon for a=0.5 is 1+sqrt(0.75)', () => {
    expect(horizonOuter(0.5)).toBeCloseTo(1 + Math.sqrt(0.75), 12);
  });
  it('Sigma and Delta reduce correctly at a=0', () => {
    // a=0: Sigma=r^2, Delta=r^2-2r
    expect(sigma(3, 1.0, 0)).toBeCloseTo(9, 12);
    expect(delta(3, 0)).toBeCloseTo(3, 12); // 9-6
  });
  it('A reduces to (r^2)^2 at a=0', () => {
    expect(bigA(3, 1.0, 0)).toBeCloseTo(81, 12);
  });
});

describe('inverse metric', () => {
  it('g^rr = Delta/Sigma', () => {
    const { grr } = invMetric(4, Math.PI / 2, 0.6);
    expect(grr).toBeCloseTo(delta(4, 0.6) / sigma(4, Math.PI / 2, 0.6), 12);
  });
  it('g^thth = 1/Sigma', () => {
    const { gthth } = invMetric(4, Math.PI / 3, 0.6);
    expect(gthth).toBeCloseTo(1 / sigma(4, Math.PI / 3, 0.6), 12);
  });
});

// A photon initialized null (H=0) must stay null and H conserved under RK4.
function nullRay(a) {
  const r = 10, theta = Math.PI / 2;
  const E = 1, Lz = 2.0;
  const { grr, gtt, gtp, gpp } = invMetric(r, theta, a);
  // Solve H=0 for pr (purely radial-ish ray): choose ptheta=0.
  // 0 = 1/2(gtt E^2 - 2 gtp E Lz + gpp Lz^2 + grr pr^2)
  const rest = gtt * E * E - 2 * gtp * E * Lz + gpp * Lz * Lz;
  const pr2 = -rest / grr; // grr>0; rest<0 for a real photon here
  const pr = -Math.sqrt(Math.max(pr2, 0)); // ingoing
  return { state: { r, theta, pr, ptheta: 0, phi: 0 }, consts: { E, Lz, a } };
}

describe('Hamiltonian conservation (null geodesic)', () => {
  it('H starts ~0 for a null-initialized ray', () => {
    const { state, consts } = nullRay(0.7);
    expect(hamiltonian(state, consts)).toBeCloseTo(0, 8);
  });
  it('|H| stays small over many RK4 steps', () => {
    let { state, consts } = nullRay(0.7);
    const h0 = hamiltonian(state, consts);
    for (let i = 0; i < 2000; i++) {
      if (state.r < horizonOuter(consts.a) + 0.01 || state.r > 50) break;
      state = rk4Step(state, consts, 0.004);
    }
    expect(Math.abs(hamiltonian(state, consts) - h0)).toBeLessThan(1e-3);
  });
});

describe('rhs', () => {
  it('dr = g^rr * pr', () => {
    const state = { r: 8, theta: Math.PI / 2, pr: -0.5, ptheta: 0, phi: 0 };
    const consts = { E: 1, Lz: 1.5, a: 0.4 };
    const { dr } = rhs(state, consts);
    const { grr } = invMetric(8, Math.PI / 2, 0.4);
    expect(dr).toBeCloseTo(grr * -0.5, 10);
  });
});
