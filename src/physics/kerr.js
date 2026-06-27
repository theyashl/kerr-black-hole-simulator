// Kerr null-geodesic physics, geometric units G=c=M=1, Boyer-Lindquist (-,+,+,+).
// Reference implementation mirrored by shaders/kerr.frag.glsl.

export function sigma(r, theta, a) {
  const c = Math.cos(theta);
  return r * r + a * a * c * c;
}

export function delta(r, a) {
  return r * r - 2 * r + a * a;
}

export function bigA(r, theta, a) {
  const s = Math.sin(theta);
  const r2a2 = r * r + a * a;
  return r2a2 * r2a2 - a * a * delta(r, a) * s * s;
}

export function horizonOuter(a) {
  return 1 + Math.sqrt(Math.max(1 - a * a, 0));
}

// Contravariant (inverse) metric components.
export function invMetric(r, theta, a) {
  const S = sigma(r, theta, a);
  const D = delta(r, a);
  const A = bigA(r, theta, a);
  const s = Math.sin(theta);
  const s2 = s * s;
  return {
    gtt: -A / (S * D),
    gtp: -2 * a * r / (S * D),
    grr: D / S,
    gthth: 1 / S,
    gpp: (D - a * a * s2) / (S * D * s2),
  };
}

// H = 1/2 g^{uv} p_u p_v with p_t=-E, p_phi=Lz conserved.
export function hamiltonian(state, consts) {
  const { r, theta, pr, ptheta } = state;
  const { E, Lz, a } = consts;
  const { gtt, gtp, grr, gthth, gpp } = invMetric(r, theta, a);
  return 0.5 * (
    gtt * E * E
    - 2 * gtp * E * Lz
    + gpp * Lz * Lz
    + grr * pr * pr
    + gthth * ptheta * ptheta
  );
}

// Hamilton's equations. dpr/dtheta-momenta from central finite differences.
export function rhs(state, consts) {
  const { r, theta, pr, ptheta } = state;
  const { E, Lz, a } = consts;
  const { gtt, gtp, grr, gthth, gpp } = invMetric(r, theta, a);

  const dr = grr * pr;
  const dtheta = gthth * ptheta;
  const dphi = gtp * (-E) + gpp * Lz; // dphi/dlambda = g^{phi t} p_t + g^{phi phi} p_phi

  const h = 1e-5;
  const dHdr =
    (hamiltonian({ ...state, r: r + h }, consts) -
     hamiltonian({ ...state, r: r - h }, consts)) / (2 * h);
  const dHdth =
    (hamiltonian({ ...state, theta: theta + h }, consts) -
     hamiltonian({ ...state, theta: theta - h }, consts)) / (2 * h);

  return { dr, dtheta, dpr: -dHdr, dptheta: -dHdth, dphi };
}

export function rk4Step(state, consts, dl) {
  const add = (s, k, f) => ({
    r: s.r + k.dr * f,
    theta: s.theta + k.dtheta * f,
    pr: s.pr + k.dpr * f,
    ptheta: s.ptheta + k.dptheta * f,
    phi: s.phi + k.dphi * f,
  });
  const k1 = rhs(state, consts);
  const k2 = rhs(add(state, k1, dl / 2), consts);
  const k3 = rhs(add(state, k2, dl / 2), consts);
  const k4 = rhs(add(state, k3, dl), consts);
  return {
    r: state.r + (dl / 6) * (k1.dr + 2 * k2.dr + 2 * k3.dr + k4.dr),
    theta: state.theta + (dl / 6) * (k1.dtheta + 2 * k2.dtheta + 2 * k3.dtheta + k4.dtheta),
    pr: state.pr + (dl / 6) * (k1.dpr + 2 * k2.dpr + 2 * k3.dpr + k4.dpr),
    ptheta: state.ptheta + (dl / 6) * (k1.dptheta + 2 * k2.dptheta + 2 * k3.dptheta + k4.dptheta),
    phi: state.phi + (dl / 6) * (k1.dphi + 2 * k2.dphi + 2 * k3.dphi + k4.dphi),
  };
}
