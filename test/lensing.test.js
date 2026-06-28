import { describe, it, expect } from 'vitest';
import { rk4Step, horizonOuter } from '../src/physics/kerr.js';
import { zamoTetrad, covMetric } from '../src/camera.js';

// Replicates the shader's central-ray construction (ray setup -> integration seam)
// using the JS reference modules, so the convention that decides whether the
// shadow renders is covered by a unit test. Mirrors shaders/kerr.frag.glsl.
function traceRay(uv) {
  const r0 = 20, theta0 = Math.PI / 2, phi0 = 0, a = 0;
  const uFov = (60 * Math.PI) / 180;
  const t = Math.tan(uFov / 2);

  // local-frame view ray: z toward hole (-1), x = ephi (right), y = eth (up)
  const lx = uv.x * t, ly = uv.y * t, lz = -1;
  const len = Math.hypot(lx, ly, lz);
  const local = [lx / len, ly / len, lz / len];

  // FIXED convention: nr = local.z (ingoing for central pixel)
  const nr = local[2], nth = local[1], nph = local[0];

  const { e0, er, eth, ephi } = zamoTetrad(r0, theta0, a);
  // contravariant photon 4-momentum p^mu = e0 + nr*er + nth*eth + nph*ephi
  const pUp = [0, 1, 2, 3].map(
    (i) => e0[i] + nr * er[i] + nth * eth[i] + nph * ephi[i]
  );

  const { gtt, gtp, grr, gthth, gpp } = covMetric(r0, theta0, a);
  const pt = gtt * pUp[0] + gtp * pUp[3];
  const pph = gtp * pUp[0] + gpp * pUp[3];
  const pr = grr * pUp[1];
  const pth = gthth * pUp[2];

  const E = -pt, Lz = pph;
  const consts = { E, Lz, a };

  let state = { r: r0, theta: theta0, pr, ptheta: pth, phi: phi0 };
  const rH = horizonOuter(a) + 1e-2;
  // dl/iteration cap sized so an escaping ray has enough path length to reach
  // the r>1000 escape radius (matches FIX 3 shader threshold).
  const dl = 0.1;
  for (let i = 0; i < 12000; i++) {
    state = rk4Step(state, consts, dl);
    if (state.r < rH) return 'captured';
    if (state.r > 1000) return 'escaped';
  }
  return 'maxsteps';
}

describe('lensing ray-setup -> integration seam (a=0)', () => {
  it('center ray (uv=0,0) is captured -> shadow', () => {
    expect(traceRay({ x: 0, y: 0 })).toBe('captured');
  });
  it('edge ray (uv=0.9,0) escapes to the sky', () => {
    expect(traceRay({ x: 0.9, y: 0 })).toBe('escaped');
  });
});
