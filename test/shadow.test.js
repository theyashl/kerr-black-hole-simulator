import { describe, it, expect } from 'vitest';
import { rk4Step, horizonOuter } from '../src/physics/kerr.js';

describe('Schwarzschild photon sphere (a=0)', () => {
  it('a tangential photon at r=3 with b=sqrt(27) stays near r=3', () => {
    const a = 0;
    const r = 3, theta = Math.PI / 2;
    const E = 1, Lz = Math.sqrt(27);
    // tangential => pr = 0 ; ptheta = 0 (equatorial). H should be ~0 here.
    let state = { r, theta, pr: 0, ptheta: 0, phi: 0 };
    const consts = { E, Lz, a };
    let maxDev = 0;
    for (let i = 0; i < 400; i++) {
      state = rk4Step(state, consts, 0.01);
      maxDev = Math.max(maxDev, Math.abs(state.r - 3));
      if (state.r < horizonOuter(a) + 0.01) break;
    }
    expect(maxDev).toBeLessThan(0.05); // stays on the photon sphere
  });
});
