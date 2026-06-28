// Accretion-disk physics, geometric units G=c=M=1. Mirrored by shaders/kerr.frag.glsl.

// Prograde innermost stable circular orbit (Bardeen-Press-Teukolsky).
export function iscoRadius(a) {
  const z1 = 1 + Math.cbrt(1 - a * a) * (Math.cbrt(1 + a) + Math.cbrt(1 - a));
  const z2 = Math.sqrt(3 * a * a + z1 * z1);
  return 3 + z2 - Math.sqrt((3 - z1) * (3 + z1 + 2 * z2));
}

// Novikov-Thorne-shaped radial profile, normalized to 1 at the inner edge.
export function diskTemperature(r, rIn) {
  if (r < rIn) return 0;
  return Math.pow(rIn / r, 0.75);
}

// Ensure the outer radius sits above the inner edge (avoids a zero/negative-width
// annulus when inner is set larger than outer in manual mode).
export function clampDiskOuter(inner, outer) {
  return Math.max(outer, inner * 1.1);
}

// If theta crosses pi/2 between the two states, return the interpolation
// fraction in (0,1) of the crossing; otherwise null.
export function equatorialCrossingFrac(thetaPrev, thetaNext) {
  const dPrev = thetaPrev - Math.PI / 2;
  const dNext = thetaNext - Math.PI / 2;
  if (dPrev * dNext >= 0) return null;
  return dPrev / (dPrev - dNext);
}
