import { describe, it, expect } from 'vitest';
import { rk4Step, horizonOuter } from '../src/physics/kerr.js';
import { zamoTetrad, covMetric } from '../src/camera.js';

// Mirrors shaders/kerr.frag.glsl main(): builds the per-pixel ray from the ZAMO
// tetrad, then integrates with the SAME distance-proportional step and the SAME
// budget the shader uses. Using the real budget is the point — an earlier
// version of this test used a 12000-step budget the shader never has, which hid
// a bug where every ray timed out (black screen). Keep these in sync.
const K = 0.1;          // step coefficient (uStepSize)
const MAX_STEPS = 600;  // uMaxSteps
const ESCAPE_R = 300;   // shader escape radius
const FOV = (60 * Math.PI) / 180;

function trace(uvx, uvy, { r0 = 20, th0 = Math.PI / 2, ph0 = 0, a = 0 } = {}) {
  const t = Math.tan(FOV / 2);
  const L = [uvx * t, uvy * t, -1];
  const n = Math.hypot(...L);
  const local = [L[0] / n, L[1] / n, L[2] / n];
  const nr = local[2], nth = local[1], nph = local[0];

  const { e0, er, eth, ephi } = zamoTetrad(r0, th0, a);
  const pUp = [0, 1, 2, 3].map((i) => e0[i] + nr * er[i] + nth * eth[i] + nph * ephi[i]);

  const { gtt, gtp, grr, gthth, gpp } = covMetric(r0, th0, a);
  const E = -(gtt * pUp[0] + gtp * pUp[3]);
  const Lz = gtp * pUp[0] + gpp * pUp[3];
  const consts = { E, Lz, a };

  let st = { r: r0, theta: th0, pr: grr * pUp[1], ptheta: gthth * pUp[2], phi: ph0 };
  const rH = horizonOuter(a) + 1e-2;
  for (let i = 0; i < MAX_STEPS; i++) {
    const dl = Math.min(Math.max(K * (st.r - rH), 0.005), 50);
    st = rk4Step(st, consts, dl);
    st.theta = Math.min(Math.max(st.theta, 1e-3), Math.PI - 1e-3);
    if (st.r < rH) return 'captured';
    if (st.r > ESCAPE_R) return 'escaped';
  }
  return 'maxsteps';
}

describe('lensing ray-setup -> integration seam (a=0)', () => {
  it('center ray (uv=0,0) is captured -> shadow', () => {
    expect(trace(0, 0)).toBe('captured');
  });

  it('edge ray (uv=0.9,0) escapes to the sky', () => {
    expect(trace(0.9, 0)).toBe('escaped');
  });

  // Regression guard for the "everything times out -> black screen" bug: within
  // the real shader step budget, off-axis rays must resolve, not hit maxsteps.
  it('no ray times out within the shader budget', () => {
    const statuses = [];
    for (let gy = -1; gy <= 1; gy += 0.25)
      for (let gx = -1; gx <= 1; gx += 0.25) statuses.push(trace(gx, gy));
    expect(statuses).not.toContain('maxsteps');
    // and the frame is a real mix of shadow + sky, not uniformly one thing
    expect(statuses).toContain('captured');
    expect(statuses).toContain('escaped');
  });
});

describe('shadow size accuracy (a=0)', () => {
  it('shadow half-angle matches the analytic Schwarzschild value', () => {
    const r0 = 20;
    // bisect the capture/escape boundary along +x
    let lo = 0, hi = 1.5;
    for (let i = 0; i < 40; i++) {
      const mid = (lo + hi) / 2;
      trace(mid, 0, { r0 }) === 'captured' ? (lo = mid) : (hi = mid);
    }
    const measuredDeg = (Math.atan(((lo + hi) / 2) * Math.tan(FOV / 2)) * 180) / Math.PI;
    // Synge: sin(alpha) = sqrt(27) * sqrt(1 - 2/r0) / r0
    const analyticDeg = (Math.asin((Math.sqrt(27) * Math.sqrt(1 - 2 / r0)) / r0) * 180) / Math.PI;
    expect(Math.abs(measuredDeg - analyticDeg)).toBeLessThan(1.5);
  });
});
