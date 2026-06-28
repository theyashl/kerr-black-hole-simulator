import { describe, it, expect } from 'vitest';
import { rk4Step, rhs, horizonOuter, reflectPole } from '../src/physics/kerr.js';
import { zamoTetrad, covMetric } from '../src/camera.js';
import { iscoRadius, equatorialCrossingFrac } from '../src/physics/disk.js';

// Regression guard for the spin-axis seam: axial (L_z=0) rays along the
// projected spin axis must PASS THROUGH the pole (reflectPole), not get pinned
// at theta~0. Previously a theta-clamp pinned them, so the center image column
// disagreed with its neighbors -> a vertical artifact line. This trace mirrors
// shaders/kerr.frag.glsl (distance-proportional step + pole reflection + disk
// crossing); it agrees center-vs-neighbor only when reflection is used.
const FOV = (60 * Math.PI) / 180;
const ASPECT = 1.6;

function trace(uvx, uvy, { a, r0, th0, rIn, rOut }) {
  const t = Math.tan(FOV / 2);
  const ux = uvx * ASPECT;
  const L = [ux * t, uvy * t, -1];
  const n = Math.hypot(...L);
  const local = [L[0] / n, L[1] / n, L[2] / n];
  const nr = local[2], nth = local[1], nph = local[0];
  const { e0, er, eth, ephi } = zamoTetrad(r0, th0, a);
  const pUp = [0, 1, 2, 3].map((i) => e0[i] + nr * er[i] + nth * eth[i] + nph * ephi[i]);
  const cm = covMetric(r0, th0, a);
  const E = -(cm.gtt * pUp[0] + cm.gtp * pUp[3]);
  const Lz = cm.gtp * pUp[0] + cm.gpp * pUp[3];
  const consts = { E, Lz, a };
  let st = { r: r0, theta: th0, pr: cm.grr * pUp[1], ptheta: cm.gthth * pUp[2], phi: 0 };
  const rH = horizonOuter(a) + 1e-2;
  for (let i = 0; i < 800; i++) {
    const thPrev = st.theta, rPrev = st.r;
    // distance-proportional step, capped so |dtheta|,|dphi| per step stay small
    // (resolves near-axial turning points). Mirrors the shader.
    const k = rhs(st, consts);
    let dl = Math.min(Math.max(0.1 * (st.r - rH), 0.005), 50);
    dl = Math.min(dl, 0.05 / Math.max(Math.abs(k.dtheta), Math.abs(k.dphi), 1e-9));
    st = rk4Step(st, consts, dl);
    const refl = reflectPole(st.theta, st.phi, st.ptheta);
    st.theta = refl.theta; st.phi = refl.phi; st.ptheta = refl.ptheta;
    const frac = equatorialCrossingFrac(thPrev, st.theta);
    if (frac !== null) {
      const rHit = rPrev + (st.r - rPrev) * frac;
      if (rHit >= rIn && rHit <= rOut) return 'disk';
    }
    if (st.r < rH) return 'hole';
    if (st.r > 300) return 'sky';
  }
  return 'maxsteps';
}

describe('spin-axis seam (pole pass-through)', () => {
  // Reproduces the reported view: near-edge-on, spinning, disk on.
  const cfg = { a: 0.7, r0: 48.5888, th0: (97.3554 * Math.PI) / 180, rIn: iscoRadius(0.7), rOut: 20 };

  it('center column (uvx=0, L_z~0) agrees with its neighbor — no axial seam', () => {
    const uvys = [0.3125, 0.25, 0.1875, -0.1875, -0.25];
    for (const uvy of uvys) {
      const center = trace(0, uvy, cfg);
      const neighbor = trace(0.04, uvy, cfg);
      expect(center, `uvy=${uvy}`).toBe(neighbor);
    }
  });

  it('center rays cross the pole rather than getting pinned at it', () => {
    // An upward axial ray reaches the disk (it passes over/through the pole),
    // matching its neighbor instead of escaping to sky.
    expect(trace(0, 0.25, cfg)).toBe('disk');
  });

  it('the near-axis band is uniform — no bead oscillation', () => {
    // The residual bead artifact lived in a thin band of small-L_z rays right
    // beside the axis (uvx ~0.003-0.012), which the angular step limiter resolves.
    // At a background uvy the whole band must map to the same outcome.
    const uvy = 0.55;
    const expected = trace(0.04, uvy, cfg); // off-band reference (sky)
    for (const uvx of [0, 0.003, 0.006, 0.012]) {
      expect(trace(uvx, uvy, cfg), `uvx=${uvx}`).toBe(expected);
    }
  });
});
