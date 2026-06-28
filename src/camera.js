import { sigma, delta, bigA } from './physics/kerr.js';

// Orbit state -> Boyer-Lindquist position. Inclination is the polar angle theta
// (pi/2 = equatorial/edge-on, ~0 = pole-on). Azimuth rotates around the spin axis.
export function orbitToPosition({ radius, inclination, azimuth }) {
  return { r: radius, theta: inclination, phi: azimuth };
}

// Covariant metric components g_{uv}.
export function covMetric(r, theta, a) {
  const S = sigma(r, theta, a);
  const s = Math.sin(theta);
  const s2 = s * s;
  const A = bigA(r, theta, a);
  return {
    gtt: -(1 - 2 * r / S),
    gtp: -2 * a * r * s2 / S,
    grr: S / delta(r, a),
    gthth: S,
    gpp: (A * s2) / S,
  };
}

// ZAMO (locally non-rotating) orthonormal tetrad, e_(a)^mu in order [t,r,theta,phi].
export function zamoTetrad(r, theta, a) {
  const S = sigma(r, theta, a);
  const D = delta(r, a);
  const A = bigA(r, theta, a);
  const s = Math.sin(theta);
  const alpha = Math.sqrt((S * D) / A); // lapse
  const omega = (2 * a * r) / A;        // frame-drag angular velocity
  return {
    e0:   [1 / alpha, 0, 0, omega / alpha],
    er:   [0, Math.sqrt(D / S), 0, 0],
    eth:  [0, 0, 1 / Math.sqrt(S), 0],
    ephi: [0, 0, 0, Math.sqrt(S / A) / s],
  };
}
