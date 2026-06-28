import { describe, it, expect } from 'vitest';
import { orbitToPosition, covMetric, zamoTetrad } from '../src/camera.js';

// Inner product of two 4-vectors under covariant metric g_{uv}.
function dot(g, u, v) {
  // order: t, r, theta, phi ; only gtt, gtp(=gtp symmetric), grr, gthth, gpp nonzero
  return (
    g.gtt * u[0] * v[0] +
    g.gtp * (u[0] * v[3] + u[3] * v[0]) +
    g.grr * u[1] * v[1] +
    g.gthth * u[2] * v[2] +
    g.gpp * u[3] * v[3]
  );
}

describe('orbitToPosition', () => {
  it('maps inclination to polar angle theta', () => {
    const p = orbitToPosition({ radius: 20, inclination: Math.PI / 2, azimuth: 0 });
    expect(p.r).toBeCloseTo(20, 12);
    expect(p.theta).toBeCloseTo(Math.PI / 2, 12); // equatorial
  });
});

describe('ZAMO tetrad orthonormality', () => {
  const cases = [
    { r: 15, theta: Math.PI / 2, a: 0.0 },
    { r: 8, theta: Math.PI / 3, a: 0.7 },
    { r: 5, theta: Math.PI / 2, a: 0.9 },
  ];
  for (const { r, theta, a } of cases) {
    it(`is orthonormal at r=${r}, a=${a}`, () => {
      const g = covMetric(r, theta, a);
      const { e0, er, eth, ephi } = zamoTetrad(r, theta, a);
      // timelike unit
      expect(dot(g, e0, e0)).toBeCloseTo(-1, 8);
      // spacelike units
      expect(dot(g, er, er)).toBeCloseTo(1, 8);
      expect(dot(g, eth, eth)).toBeCloseTo(1, 8);
      expect(dot(g, ephi, ephi)).toBeCloseTo(1, 8);
      // orthogonality (sample pairs)
      expect(dot(g, e0, ephi)).toBeCloseTo(0, 8);
      expect(dot(g, er, eth)).toBeCloseTo(0, 8);
      expect(dot(g, e0, er)).toBeCloseTo(0, 8);
    });
  }
});
