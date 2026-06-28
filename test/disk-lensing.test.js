import { describe, it, expect } from 'vitest';
import { rk4Step, horizonOuter } from '../src/physics/kerr.js';
import { zamoTetrad, covMetric } from '../src/camera.js';
import { iscoRadius, equatorialCrossingFrac } from '../src/physics/disk.js';

const FOV = (60 * Math.PI) / 180;

// Returns {hit:boolean, rHit:number|null} mirroring the shader disk logic.
function traceDisk(uvx, uvy, { r0 = 20, th0, a = 0, rIn, rOut = 20 } = {}) {
  const t = Math.tan(FOV / 2);
  const L = [uvx * t, uvy * t, -1]; const n = Math.hypot(...L);
  const local = [L[0] / n, L[1] / n, L[2] / n];
  const nr = local[2], nth = local[1], nph = local[0];
  const { e0, er, eth, ephi } = zamoTetrad(r0, th0, a);
  const pUp = [0, 1, 2, 3].map((i) => e0[i] + nr * er[i] + nth * eth[i] + nph * ephi[i]);
  const { gtt, gtp, grr, gthth, gpp } = covMetric(r0, th0, a);
  const E = -(gtt * pUp[0] + gtp * pUp[3]);
  const Lz = gtp * pUp[0] + gpp * pUp[3];
  const consts = { E, Lz, a };
  let st = { r: r0, theta: th0, pr: grr * pUp[1], ptheta: gthth * pUp[2], phi: 0 };
  const rH = horizonOuter(a) + 1e-2;
  for (let i = 0; i < 600; i++) {
    const thPrev = st.theta, rPrev = st.r;
    const dl = Math.min(Math.max(0.1 * (st.r - rH), 0.005), 50);
    st = rk4Step(st, consts, dl);
    st.theta = Math.min(Math.max(st.theta, 1e-3), Math.PI - 1e-3);
    const frac = equatorialCrossingFrac(thPrev, st.theta);
    if (frac !== null) {
      const rHit = rPrev + (st.r - rPrev) * frac;
      if (rHit >= rIn && rHit <= rOut) return { hit: true, rHit };
    }
    if (st.r < rH) return { hit: false, rHit: null };
    if (st.r > 300) return { hit: false, rHit: null };
  }
  return { hit: false, rHit: null };
}

describe('disk hit detection (a=0, inclined camera)', () => {
  const rIn = iscoRadius(0); // 6
  it('a ray angled toward the equatorial plane hits the disk', () => {
    // Camera 30deg above the equator (th0=60deg); look slightly "down" toward the plane.
    // uvy > 0 maps to nth > 0 (increasing theta -> toward equator) in this tetrad convention.
    const res = traceDisk(0.0, 0.4, { th0: (60 * Math.PI) / 180, rIn, rOut: 20 });
    expect(res.hit).toBe(true);
    expect(res.rHit).toBeGreaterThanOrEqual(rIn);
    expect(res.rHit).toBeLessThanOrEqual(20);
  });
  it('a ray aimed up and away from the disk does not hit it', () => {
    const res = traceDisk(0.0, -0.9, { th0: (60 * Math.PI) / 180, rIn, rOut: 20 });
    expect(res.hit).toBe(false);
  });
});
