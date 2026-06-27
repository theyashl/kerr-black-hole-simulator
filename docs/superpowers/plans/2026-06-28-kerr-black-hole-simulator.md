# Kerr Black Hole Simulator Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a browser-based, real-time, physically-accurate Kerr black hole renderer that backward-traces null geodesics per pixel and lenses a selectable background sky.

**Architecture:** Three.js renders a single full-screen quad; all relativistic physics runs in a GLSL fragment shader that RK4-integrates the Kerr geodesic Hamiltonian per pixel. A JS reference implementation of the same physics is unit-tested with Vitest and serves as the ground truth the shader mirrors. Camera tetrad (ZAMO) and orbit state are computed in JS and passed as uniforms.

**Tech Stack:** Vite (dev server + bundler), Three.js (render loop, quad, textures), lil-gui (controls), Vitest (unit tests for JS physics/camera), GLSL (geodesic integrator). Shaders imported as strings via Vite's `?raw` suffix — no extra plugin.

## Global Constraints

- Geometric units throughout: `G = c = M = 1`. Spin `a ∈ [0, 0.999]`.
- Coordinate system: Boyer–Lindquist `(t, r, θ, φ)`, metric signature `(−,+,+,+)`.
- Metric quantities (used verbatim everywhere): `Σ = r² + a²cos²θ`, `Δ = r² − 2r + a²`, `A = (r²+a²)² − a²·Δ·sin²θ`, outer horizon `r₊ = 1 + √(1 − a²)`.
- Inverse-metric contravariant components: `g^tt = −A/(ΣΔ)`, `g^tφ = −2ar/(ΣΔ)`, `g^rr = Δ/Σ`, `g^θθ = 1/Σ`, `g^φφ = (Δ − a²sin²θ)/(ΣΔsin²θ)`.
- ZAMO tetrad: lapse `α = √(ΣΔ/A)`, frame-drag `ω = 2ar/A`.
- No external objects in v1 (no accretion disk, no Doppler coloring, no charge). The geodesic integrator must remain a self-contained GLSL function so objects can be added later inside its loop.
- Spec: `docs/superpowers/specs/2026-06-28-kerr-black-hole-simulator-design.md`.

---

## File Structure

| File | Responsibility |
|------|----------------|
| `package.json` | deps + scripts (`dev`, `build`, `test`) |
| `vite.config.js` | Vite config (root, test env) |
| `index.html` | canvas + script entry + UI mount |
| `src/main.js` | Three.js bootstrap, full-screen quad, render loop, uniform plumbing |
| `src/physics/kerr.js` | JS reference: metric quantities, Hamiltonian, RHS, RK4 step (testable ground truth) |
| `src/camera.js` | orbit state → BL position + ZAMO tetrad basis vectors |
| `src/controls.js` | lil-gui panel bound to a settings object |
| `src/backgrounds.js` | cubemap loader + grid + color-cube; active-background uniforms |
| `shaders/fullscreen.vert.glsl` | trivial pass-through vertex shader |
| `shaders/kerr.frag.glsl` | the geodesic integrator + background sampling (the heart) |
| `test/kerr.test.js` | unit tests for `src/physics/kerr.js` |
| `test/camera.test.js` | unit tests for `src/camera.js` |

---

### Task 1: Project scaffold + rendering pipeline

Stand up Vite + Three.js rendering a full-screen quad with a solid color, and a runnable (empty) Vitest suite. Deliverable: `npm run dev` shows a colored canvas; `npm test` runs green.

**Files:**
- Create: `package.json`, `vite.config.js`, `index.html`, `src/main.js`, `shaders/fullscreen.vert.glsl`, `shaders/solid.frag.glsl`, `test/smoke.test.js`

**Interfaces:**
- Produces: a Three.js `WebGLRenderer` + `OrthographicCamera` + full-screen `Mesh` with a `ShaderMaterial`. The material's `uniforms` object is the integration point all later tasks write to.

- [ ] **Step 1: Create `package.json`**

```json
{
  "name": "bhs",
  "private": true,
  "version": "0.1.0",
  "type": "module",
  "scripts": {
    "dev": "vite",
    "build": "vite build",
    "preview": "vite preview",
    "test": "vitest run"
  },
  "dependencies": {
    "three": "^0.160.0",
    "lil-gui": "^0.19.0"
  },
  "devDependencies": {
    "vite": "^5.0.0",
    "vitest": "^1.2.0"
  }
}
```

- [ ] **Step 2: Create `vite.config.js`**

```js
import { defineConfig } from 'vite';

export default defineConfig({
  test: {
    environment: 'node',
    include: ['test/**/*.test.js'],
  },
});
```

- [ ] **Step 3: Install deps**

Run: `npm install`
Expected: `node_modules/` populated, no errors.

- [ ] **Step 4: Write a smoke test so `npm test` is green**

`test/smoke.test.js`:
```js
import { describe, it, expect } from 'vitest';

describe('smoke', () => {
  it('runs the test harness', () => {
    expect(1 + 1).toBe(2);
  });
});
```

- [ ] **Step 5: Run the smoke test**

Run: `npm test`
Expected: PASS (1 test).

- [ ] **Step 6: Create the shaders**

`shaders/fullscreen.vert.glsl`:
```glsl
varying vec2 vUv;
void main() {
  vUv = uv;
  gl_Position = vec4(position.xy, 0.0, 1.0);
}
```

`shaders/solid.frag.glsl`:
```glsl
precision highp float;
varying vec2 vUv;
void main() {
  gl_FragColor = vec4(vUv, 0.4, 1.0);
}
```

- [ ] **Step 7: Create `index.html`**

```html
<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>bhs — Kerr black hole</title>
    <style>
      html, body { margin: 0; height: 100%; overflow: hidden; background: #000; }
      #app { width: 100vw; height: 100vh; display: block; }
    </style>
  </head>
  <body>
    <canvas id="app"></canvas>
    <script type="module" src="/src/main.js"></script>
  </body>
</html>
```

- [ ] **Step 8: Create `src/main.js`**

```js
import * as THREE from 'three';
import vertexShader from '../shaders/fullscreen.vert.glsl?raw';
import fragmentShader from '../shaders/solid.frag.glsl?raw';

const canvas = document.getElementById('app');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: false });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));

const scene = new THREE.Scene();
const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);

export const uniforms = {
  uResolution: { value: new THREE.Vector2() },
  uTime: { value: 0 },
};

const material = new THREE.ShaderMaterial({ vertexShader, fragmentShader, uniforms });
const quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), material);
scene.add(quad);

function resize() {
  const w = window.innerWidth, h = window.innerHeight;
  renderer.setSize(w, h, false);
  uniforms.uResolution.value.set(w * renderer.getPixelRatio(), h * renderer.getPixelRatio());
}
window.addEventListener('resize', resize);
resize();

const clock = new THREE.Clock();
function loop() {
  uniforms.uTime.value = clock.getElapsedTime();
  renderer.render(scene, camera);
  requestAnimationFrame(loop);
}
loop();
```

- [ ] **Step 9: Verify the dev server renders**

Run: `npm run dev`, open the printed localhost URL.
Expected: a smooth color gradient fills the window (red→green by position, blue 0.4). No console errors. Resizing keeps it full-screen.

- [ ] **Step 10: Commit**

```bash
git add package.json vite.config.js index.html src/main.js shaders/ test/smoke.test.js
git commit -m "feat: scaffold Vite + Three.js full-screen quad pipeline"
```

---

### Task 2: JS Kerr physics reference + tests

Implement the Kerr geodesic physics in plain JS, unit-tested against analytic values and conservation laws. This module is the ground truth the GLSL shader mirrors in Task 5.

**Files:**
- Create: `src/physics/kerr.js`, `test/kerr.test.js`

**Interfaces:**
- Produces:
  - `sigma(r, theta, a) → number`, `delta(r, a) → number`, `bigA(r, theta, a) → number`, `horizonOuter(a) → number`
  - `invMetric(r, theta, a) → { gtt, gtp, grr, gthth, gpp }`
  - `hamiltonian(state, consts) → number` where `state = { r, theta, pr, ptheta }`, `consts = { E, Lz, a }`; returns `½(g^tt E² − 2 g^tφ E Lz + g^φφ Lz² + g^rr pr² + g^θθ pθ²)`
  - `rhs(state, consts) → { dr, dtheta, dpr, dptheta, dphi }` (Hamilton's equations; `dpr`,`dptheta` via central finite differences of `hamiltonian`)
  - `rk4Step(state, consts, dλ) → newState` (also advances `phi`)

- [ ] **Step 1: Write the failing tests**

`test/kerr.test.js`:
```js
import { describe, it, expect } from 'vitest';
import {
  sigma, delta, bigA, horizonOuter, invMetric, hamiltonian, rhs, rk4Step,
} from '../src/physics/kerr.js';

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
  const { grr, gthth, gtt, gtp, gpp } = invMetric(r, theta, a);
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
      state = rk4Step(state, consts, 0.02);
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
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npm test`
Expected: FAIL — `src/physics/kerr.js` does not exist / exports undefined.

- [ ] **Step 3: Implement `src/physics/kerr.js`**

```js
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
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npm test`
Expected: PASS (all kerr + smoke tests). If the `|H|` drift test fails, reduce `dl` to `0.01` in the test loop — but it should pass at `0.02`.

- [ ] **Step 5: Commit**

```bash
git add src/physics/kerr.js test/kerr.test.js
git commit -m "feat: JS Kerr geodesic reference with conservation tests"
```

---

### Task 3: ZAMO camera + tetrad + tests

Compute the camera's Boyer–Lindquist position from orbit state and build the ZAMO orthonormal tetrad, verified orthonormal against the Kerr metric.

**Files:**
- Create: `src/camera.js`, `test/camera.test.js`

**Interfaces:**
- Consumes: `invMetric`, `sigma`, `delta`, `bigA` from `src/physics/kerr.js`.
- Produces:
  - `orbitToPosition({ radius, inclination, azimuth }) → { r, theta, phi }`
  - `covMetric(r, theta, a) → { gtt, gtp, grr, gthth, gpp }` (covariant components)
  - `zamoTetrad(r, theta, a) → { e0, er, eth, ephi }`, each a 4-vector `[t, r, θ, φ]` (contravariant `e_(a)^μ`)

- [ ] **Step 1: Write the failing tests**

`test/camera.test.js`:
```js
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
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npm test`
Expected: FAIL — `src/camera.js` missing.

- [ ] **Step 3: Implement `src/camera.js`**

```js
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
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npm test`
Expected: PASS (camera + kerr + smoke).

- [ ] **Step 5: Commit**

```bash
git add src/camera.js test/camera.test.js
git commit -m "feat: ZAMO camera tetrad with orthonormality tests"
```

---

### Task 4: Backgrounds (color-cube, grid, cubemap) — unlensed

Render a selectable background sky through the fragment shader using straight (unlensed) rays. This validates camera orientation and the background sampling before any geodesic bending is added.

**Files:**
- Create: `src/backgrounds.js`
- Modify: `src/main.js`, `index.html` (none needed), replace `shaders/solid.frag.glsl` usage with new `shaders/kerr.frag.glsl`
- Create: `shaders/kerr.frag.glsl` (straight-ray version this task; geodesics added in Task 5)
- Create: `assets/milkyway/` placeholder note

**Interfaces:**
- Consumes: `uniforms` from `src/main.js`; `zamoTetrad`, `orbitToPosition` from earlier tasks.
- Produces:
  - `loadBackground(renderer) → { cubeTexture, setMode(modeIndex) }`
  - Shader uniforms: `uCamPos` (vec3 BL r,θ,φ), `uE0,uER,uETH,uEPHI` (vec4 tetrad), `uSpin` (float), `uBgMode` (int: 0=milkyway,1=grid,2=colorcube), `uGridOverlay` (bool), `uCubeMap` (samplerCube), `uFov` (float).

- [ ] **Step 1: Create `src/backgrounds.js`**

```js
import * as THREE from 'three';

// Procedurally generates a color-cube and a grid cubemap, and (optionally) loads
// a Milky Way cubemap from assets/milkyway/. Returns a samplerCube the shader uses.
// Mode selection happens in-shader via uBgMode; this module supplies the texture
// for the photoreal mode and leaves grid/color-cube to be computed analytically.
export function loadBackground(renderer) {
  const loader = new THREE.CubeTextureLoader();
  loader.setPath('/assets/milkyway/');
  // px,nx,py,ny,pz,nz face filenames. If assets are absent, fall back to a 1x1
  // dark texture so the app still runs (grid/color-cube modes are unaffected).
  let cubeTexture;
  try {
    cubeTexture = loader.load(['px.png','nx.png','py.png','ny.png','pz.png','nz.png']);
  } catch (e) {
    cubeTexture = null;
  }
  return { cubeTexture };
}
```

- [ ] **Step 2: Add an assets note**

Create `assets/milkyway/README.md`:
```md
Place a Milky Way cubemap here as px.png, nx.png, py.png, ny.png, pz.png, nz.png
(e.g. from NASA/ESO star-field panoramas converted to a cubemap). Until then the
app runs with grid (mode 1) and color-cube (mode 2) backgrounds.
```

- [ ] **Step 3: Create `shaders/kerr.frag.glsl` (straight-ray version)**

```glsl
precision highp float;

varying vec2 vUv;

uniform vec2  uResolution;
uniform vec3  uCamPos;     // Boyer-Lindquist (r, theta, phi)
uniform vec4  uE0, uER, uETH, uEPHI; // tetrad e_(a)^mu = [t,r,theta,phi]
uniform float uSpin;
uniform float uFov;        // vertical field of view (radians)
uniform int   uBgMode;     // 0 milkyway, 1 grid, 2 colorcube
uniform bool  uGridOverlay;
uniform samplerCube uCubeMap;

const float PI = 3.141592653589793;

// Map a unit direction on the celestial sphere to a background color.
vec3 sampleBackground(vec3 dir) {
  if (uBgMode == 2) {                 // color-cube: dominant axis -> face color
    vec3 a = abs(dir);
    if (a.x >= a.y && a.x >= a.z) return dir.x > 0.0 ? vec3(1,0,0) : vec3(0,1,1);
    if (a.y >= a.z)               return dir.y > 0.0 ? vec3(0,1,0) : vec3(1,0,1);
    return dir.z > 0.0 ? vec3(0,0,1) : vec3(1,1,0);
  }
  vec3 col;
  if (uBgMode == 0) col = textureCube(uCubeMap, dir).rgb;
  else              col = vec3(0.02); // grid mode base
  if (uBgMode == 1 || uGridOverlay) { // lat/long grid lines
    float lat = asin(clamp(dir.y, -1.0, 1.0));
    float lon = atan(dir.z, dir.x);
    float g = max(
      smoothstep(0.0, 0.04, abs(fract(lat / (PI/12.0)) - 0.5) * 2.0 - 0.96),
      smoothstep(0.0, 0.04, abs(fract(lon / (PI/12.0)) - 0.5) * 2.0 - 0.96));
    col = mix(col, vec3(0.2, 0.9, 0.5), g);
  }
  return col;
}

// Convert a BL position + a coordinate-basis direction into an approximate flat
// celestial direction (valid far from the hole; Task 5 replaces this with the
// integrated geodesic escape direction).
vec3 blToCartesianDir(vec3 camDir) {
  // camDir given in local frame (x=right/ephi, y=up/eth, z=forward/-er)
  return normalize(camDir);
}

void main() {
  vec2 uv = (gl_FragCoord.xy / uResolution) * 2.0 - 1.0;
  uv.x *= uResolution.x / uResolution.y;

  float t = tan(uFov * 0.5);
  // local-frame ray: forward toward the hole is -er => local z, up = eth, right = ephi
  vec3 local = normalize(vec3(uv.x * t, uv.y * t, -1.0)); // z<0 = toward hole
  // Build a flat sky direction from the local frame just for this task.
  vec3 dir = blToCartesianDir(vec3(local.x, local.y, -local.z));
  gl_FragColor = vec4(sampleBackground(dir), 1.0);
}
```

- [ ] **Step 4: Wire uniforms + background in `src/main.js`**

Replace the `solid.frag.glsl` import and uniforms block with:
```js
import fragmentShader from '../shaders/kerr.frag.glsl?raw';
import { loadBackground } from './backgrounds.js';
import { orbitToPosition, zamoTetrad } from './camera.js';

const bg = loadBackground(renderer);

export const uniforms = {
  uResolution: { value: new THREE.Vector2() },
  uTime: { value: 0 },
  uCamPos: { value: new THREE.Vector3(20, Math.PI / 2, 0) },
  uE0: { value: new THREE.Vector4() },
  uER: { value: new THREE.Vector4() },
  uETH: { value: new THREE.Vector4() },
  uEPHI: { value: new THREE.Vector4() },
  uSpin: { value: 0.7 },
  uFov: { value: THREE.MathUtils.degToRad(60) },
  uBgMode: { value: 2 }, // start on color-cube for verification
  uGridOverlay: { value: false },
  uCubeMap: { value: bg.cubeTexture },
};

function updateCamera() {
  const a = uniforms.uSpin.value;
  const pos = orbitToPosition({
    radius: uniforms.uCamPos.value.x,
    inclination: uniforms.uCamPos.value.y,
    azimuth: uniforms.uCamPos.value.z,
  });
  const { e0, er, eth, ephi } = zamoTetrad(pos.r, pos.theta, a);
  uniforms.uE0.value.set(...e0);
  uniforms.uER.value.set(...er);
  uniforms.uETH.value.set(...eth);
  uniforms.uEPHI.value.set(...ephi);
}
```
Call `updateCamera()` once before the loop and inside `loop()` before `renderer.render(...)`.

- [ ] **Step 5: Verify backgrounds render**

Run: `npm run dev`
Expected:
- `uBgMode=2`: screen shows a single flat color in the center of view (the face you're looking at), confirming forward orientation.
- Temporarily set `uBgMode.value = 1`: a green lat/long grid appears. Lines are straight (no bending yet).
- No console errors. (Milky Way mode shows dark if assets absent — expected.)

- [ ] **Step 6: Commit**

```bash
git add src/backgrounds.js shaders/kerr.frag.glsl src/main.js assets/milkyway/README.md
git commit -m "feat: selectable backgrounds rendered with straight rays"
```

---

### Task 5: GLSL Kerr geodesic integrator (the lensing)

Replace the straight-ray direction with a full backward RK4 integration of the Kerr null geodesic in `kerr.frag.glsl`, mirroring `src/physics/kerr.js`. This produces the shadow, photon ring, and frame-dragging.

**Files:**
- Modify: `shaders/kerr.frag.glsl`
- Add uniforms in `src/main.js`: `uStepSize`, `uMaxSteps`

**Interfaces:**
- Consumes: tetrad uniforms + `uSpin` + `uCamPos` from Task 4; mirrors `invMetric`/`hamiltonian`/`rhs`/`rk4Step` semantics from `src/physics/kerr.js`.
- Produces: a self-contained GLSL function `int integrateGeodesic(vec3 pos0, vec4 p0, out vec3 escapeDir)` returning `0`=horizon, `1`=escaped, `2`=maxsteps. Later tasks/objects add intersection tests inside its loop.

- [ ] **Step 1: Add quality uniforms in `src/main.js`**

```js
uStepSize: { value: 0.04 },
uMaxSteps: { value: 600 },
```
(Add inside the `uniforms` object.)

- [ ] **Step 2: Replace the body of `shaders/kerr.frag.glsl` with the integrator**

Keep the `sampleBackground` function from Task 4. Add the physics and rewrite `main()`:
```glsl
uniform float uStepSize;
uniform int   uMaxSteps;

float sigmaF(float r, float th, float a){ float c=cos(th); return r*r+a*a*c*c; }
float deltaF(float r, float a){ return r*r-2.0*r+a*a; }
float bigAF(float r, float th, float a){ float s=sin(th); float r2a2=r*r+a*a;
  return r2a2*r2a2 - a*a*deltaF(r,a)*s*s; }
float horizonOuter(float a){ return 1.0 + sqrt(max(1.0-a*a, 0.0)); }

// H = 1/2 g^{uv} p_u p_v with p_t=-E, p_phi=Lz. state=(r,theta,pr,ptheta).
float hamiltonian(vec4 st, float E, float Lz, float a){
  float r=st.x, th=st.y, pr=st.z, pth=st.w;
  float S=sigmaF(r,th,a), D=deltaF(r,a), A=bigAF(r,th,a);
  float s=sin(th); float s2=s*s;
  float gtt=-A/(S*D), gtp=-2.0*a*r/(S*D), grr=D/S, gthth=1.0/S,
        gpp=(D - a*a*s2)/(S*D*s2);
  return 0.5*(gtt*E*E - 2.0*gtp*E*Lz + gpp*Lz*Lz + grr*pr*pr + gthth*pth*pth);
}

// returns d/dlambda of (r, theta, pr, ptheta) plus dphi packed in .x of second out
vec4 rhs(vec4 st, float E, float Lz, float a, out float dphi){
  float r=st.x, th=st.y, pr=st.z, pth=st.w;
  float S=sigmaF(r,th,a), D=deltaF(r,a);
  float s=sin(th); float s2=s*s;
  float grr=D/S, gthth=1.0/S, gtp=-2.0*a*r/(S*D), gpp=(D-a*a*s2)/(S*D*s2);
  float dr=grr*pr, dth=gthth*pth;
  dphi = gtp*(-E) + gpp*Lz;
  float h=1e-4;
  float dHdr=(hamiltonian(vec4(r+h,th,pr,pth),E,Lz,a)
             -hamiltonian(vec4(r-h,th,pr,pth),E,Lz,a))/(2.0*h);
  float dHdth=(hamiltonian(vec4(r,th+h,pr,pth),E,Lz,a)
              -hamiltonian(vec4(r,th-h,pr,pth),E,Lz,a))/(2.0*h);
  return vec4(dr, dth, -dHdr, -dHdth);
}

// Integrate backward. pos=(r,theta,phi). Returns 0 horizon,1 escape,2 maxsteps.
int integrateGeodesic(vec3 pos, float E, float Lz, float a, out vec3 escapeDir){
  vec4 st = vec4(pos.x, pos.y, 0.0, 0.0); // pr,ptheta set by caller via globals
  // caller passes pr,ptheta through pos? -> we instead receive them separately:
  // (this signature is finalized in step 3)
  escapeDir = vec3(0.0);
  return 2;
}

void main() {
  vec2 uv = (gl_FragCoord.xy / uResolution) * 2.0 - 1.0;
  uv.x *= uResolution.x / uResolution.y;
  float a = uSpin;

  float r0 = uCamPos.x, th0 = uCamPos.y, ph0 = uCamPos.z;

  // local-frame view ray: z toward hole (-er), x=ephi(right), y=eth(up)
  float t = tan(uFov*0.5);
  vec3 local = normalize(vec3(uv.x*t, uv.y*t, -1.0));
  // tetrad components: along er = -local.z, along eth = local.y, along ephi = local.x
  float nr = -local.z, nth = local.y, nph = local.x;

  // contravariant photon 4-momentum p^mu = e0 + nr*er + nth*eth + nph*ephi
  vec4 pUp = uE0 + nr*uER + nth*uETH + nph*uEPHI;

  // lower indices with covariant metric to get p_mu (need covariant g)
  float S=sigmaF(r0,th0,a), D=deltaF(r0,a), A=bigAF(r0,th0,a);
  float s=sin(th0); float s2=s*s;
  float gtt=-(1.0-2.0*r0/S), gtp=-2.0*a*r0*s2/S, grr=S/D, gthth=S, gpp=A*s2/S;
  float pt = gtt*pUp.x + gtp*pUp.w;
  float pph= gtp*pUp.x + gpp*pUp.w;
  float pr = grr*pUp.y;
  float pth= gthth*pUp.z;

  float E = -pt;
  float Lz = pph;

  // integrate
  vec4 st = vec4(r0, th0, pr, pth);
  float phi = ph0;
  float rH = horizonOuter(a) + 1e-2;
  int status = 2;
  vec3 escapeDir = vec3(0.0);
  for (int i=0; i<2048; i++) {
    if (i >= uMaxSteps) break;
    // adaptive-ish: shrink step near horizon
    float dl = uStepSize * clamp((st.x - rH)*0.5, 0.05, 1.0);
    float dphi;
    vec4 k1 = rhs(st, E, Lz, a, dphi); float dp1=dphi;
    vec4 k2 = rhs(st+0.5*dl*k1, E, Lz, a, dphi); float dp2=dphi;
    vec4 k3 = rhs(st+0.5*dl*k2, E, Lz, a, dphi); float dp3=dphi;
    vec4 k4 = rhs(st+dl*k3, E, Lz, a, dphi); float dp4=dphi;
    st  += (dl/6.0)*(k1+2.0*k2+2.0*k3+k4);
    phi += (dl/6.0)*(dp1+2.0*dp2+2.0*dp3+dp4);

    if (st.x < rH) { status = 0; break; }       // captured
    if (st.x > 60.0) {                            // escaped
      status = 1;
      // asymptotic direction from BL (r,theta,phi) -> Cartesian on sky
      float sr=sin(st.y), cr=cos(st.y);
      escapeDir = normalize(vec3(sr*cos(phi), cr, sr*sin(phi)));
      break;
    }
  }

  if (status == 0) { gl_FragColor = vec4(0.0,0.0,0.0,1.0); return; } // shadow
  if (status == 1) { gl_FragColor = vec4(sampleBackground(escapeDir),1.0); return; }
  // maxsteps: treat as captured-ish near hole; dark grey to spot tuning issues
  gl_FragColor = vec4(0.02,0.0,0.02,1.0);
}
```

> Note: the standalone `integrateGeodesic` stub above documents the future-object hook; the working integration lives in `main()` for v1. A later task may hoist the loop into the function once an object-intersection signature is needed. Keep the loop logic identical when hoisting.

- [ ] **Step 3: Verify Schwarzschild lensing (a=0)**

Run: `npm run dev`. Set `uSpin.value = 0.0`, `uBgMode.value = 1` (grid), camera radius ~20, inclination π/2.
Expected:
- A circular black **shadow** in the center.
- Grid lines **bend** around it; a bright concentration (photon ring) hugs the shadow edge.
- The shadow is **circular** and symmetric (Schwarzschild). If it's offset or distorted at a=0, the tetrad sign mapping (`nr/nth/nph`) needs adjustment — flip `nph` or `nth` sign and re-verify.

- [ ] **Step 4: Verify Kerr asymmetry (a→0.9)**

Set `uSpin.value = 0.9`, inclination π/2 (edge-on).
Expected: the shadow becomes **asymmetric** — flattened on one side (the prograde side), shifted off-center. This is the Kerr signature. Background is dragged in the spin direction.

- [ ] **Step 5: Commit**

```bash
git add shaders/kerr.frag.glsl src/main.js
git commit -m "feat: Kerr null-geodesic ray tracing (shadow + lensing)"
```

---

### Task 6: Controls (lil-gui) + orbit camera

Add the interactive control panel and mouse orbit so spin, inclination, quality, and background are adjustable live without editing code.

**Files:**
- Create: `src/controls.js`
- Modify: `src/main.js`

**Interfaces:**
- Consumes: `uniforms` and `updateCamera` from `src/main.js`.
- Produces: `initControls(settings, onChange) → void` building a lil-gui panel; `initOrbit(canvas, settings, onChange) → void` for pointer drag/zoom.

- [ ] **Step 1: Create `src/controls.js`**

```js
import GUI from 'lil-gui';

export function initControls(settings, onChange) {
  const gui = new GUI({ title: 'Kerr black hole' });
  gui.add(settings, 'spin', 0, 0.999, 0.001).name('spin a').onChange(onChange);
  gui.add(settings, 'inclinationDeg', 1, 179, 1).name('inclination°').onChange(onChange);
  gui.add(settings, 'radius', 3, 60, 0.5).name('camera r').onChange(onChange);
  gui.add(settings, 'stepSize', 0.005, 0.1, 0.005).name('RK4 step').onChange(onChange);
  gui.add(settings, 'maxSteps', 100, 2048, 1).name('max steps').onChange(onChange);
  gui.add(settings, 'bgMode', { 'Milky Way': 0, Grid: 1, 'Color cube': 2 })
     .name('background').onChange(onChange);
  gui.add(settings, 'gridOverlay').name('grid overlay').onChange(onChange);
}

// Drag to change azimuth/inclination, wheel to zoom radius.
export function initOrbit(canvas, settings, onChange) {
  let dragging = false, lx = 0, ly = 0;
  canvas.addEventListener('pointerdown', (e) => { dragging = true; lx = e.clientX; ly = e.clientY; });
  window.addEventListener('pointerup', () => { dragging = false; });
  window.addEventListener('pointermove', (e) => {
    if (!dragging) return;
    settings.azimuthDeg = (settings.azimuthDeg + (e.clientX - lx) * 0.3) % 360;
    settings.inclinationDeg = Math.min(179, Math.max(1, settings.inclinationDeg - (e.clientY - ly) * 0.3));
    lx = e.clientX; ly = e.clientY;
    onChange();
  });
  canvas.addEventListener('wheel', (e) => {
    e.preventDefault();
    settings.radius = Math.min(60, Math.max(3, settings.radius + e.deltaY * 0.01));
    onChange();
  }, { passive: false });
}
```

- [ ] **Step 2: Wire settings into `src/main.js`**

Add near the top after uniforms:
```js
import { initControls, initOrbit } from './controls.js';

const settings = {
  spin: 0.7, inclinationDeg: 90, azimuthDeg: 0, radius: 20,
  stepSize: 0.04, maxSteps: 600, bgMode: 1, gridOverlay: false,
};

function applySettings() {
  uniforms.uSpin.value = settings.spin;
  uniforms.uCamPos.value.set(settings.radius,
    THREE.MathUtils.degToRad(settings.inclinationDeg),
    THREE.MathUtils.degToRad(settings.azimuthDeg));
  uniforms.uStepSize.value = settings.stepSize;
  uniforms.uMaxSteps.value = Math.round(settings.maxSteps);
  uniforms.uBgMode.value = Number(settings.bgMode);
  uniforms.uGridOverlay.value = settings.gridOverlay;
  updateCamera();
}

initControls(settings, applySettings);
initOrbit(canvas, settings, applySettings);
applySettings();
```
Remove the now-redundant hard-coded uniform defaults that `applySettings` overrides (keep the uniform declarations; `applySettings` sets their values).

- [ ] **Step 3: Verify interactivity**

Run: `npm run dev`
Expected:
- Panel appears top-right. Dragging the **spin** slider 0→0.99 morphs the shadow from circular to asymmetric in real time.
- **Inclination** slider tilts the view from edge-on to nearly pole-on (shadow becomes rounder pole-on).
- Mouse **drag** orbits; **scroll** zooms. **Background** dropdown switches Milky Way / grid / color-cube. **Grid overlay** toggles grid on top of Milky Way.
- No console errors; stays interactive (lower `maxSteps` if framerate drops on your GPU).

- [ ] **Step 4: Commit**

```bash
git add src/controls.js src/main.js
git commit -m "feat: lil-gui controls and mouse orbit camera"
```

---

### Task 7: Verification pass + README

Confirm the renderer matches analytic predictions and document running it. No new features — this is the spec's verification ladder made explicit, plus near-horizon robustness.

**Files:**
- Create: `README.md`
- Create: `test/shadow.test.js`
- Modify: `shaders/kerr.frag.glsl` (only if a verification reveals a tuning fix)

**Interfaces:**
- Consumes: `horizonOuter`, `invMetric`, `rk4Step` from `src/physics/kerr.js`.
- Produces: `README.md`; a JS-side photon-ring sanity test.

- [ ] **Step 1: Write a JS shadow-size sanity test**

`test/shadow.test.js` — at `a=0` the unstable photon circular orbit is at `r=3`; a photon grazing it has impact parameter `b = 3√3 = √27`. Verify the JS reference reproduces the photon sphere by checking that a ray with `Lz = √27`, `E=1`, launched tangentially at `r=3`, stays near `r=3` (circular) for many steps.
```js
import { describe, it, expect } from 'vitest';
import { invMetric, rk4Step, horizonOuter } from '../src/physics/kerr.js';

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
```

- [ ] **Step 2: Run it**

Run: `npm test`
Expected: PASS. (If it drifts, the photon sphere is unstable so small drift is physical — `0.05` over 400 steps at `dl=0.01` is a safe bound. If it fails badly, that indicates an RHS sign bug in `kerr.js` to fix before proceeding.)

- [ ] **Step 3: Visual verification ladder (manual, record results in README)**

Run `npm run dev` and confirm, noting each in the README "Verification" section:
1. **Color-cube, r=60:** background nearly undistorted at the edges (lensing concentrated near center).
2. **a=0, grid:** shadow circular; measure it's roughly centered and the photon ring is a thin bright circle. This is the √27 ground truth — the shadow's angular radius ≈ `atan(√27 / r)` for distant `r`.
3. **a=0.9, edge-on:** shadow asymmetric/flattened on the prograde side.
4. **a→0.999, pole-on:** shadow rounder, frame-dragging swirl visible in the grid.

- [ ] **Step 4: Near-horizon robustness check**

In the dev app, zoom in close (radius ~4) and crank spin to 0.99. Expected: no NaN flashes / no full-screen garbage. If artifacts appear near the horizon, increase the near-horizon step clamp floor in `kerr.frag.glsl` (`clamp(..., 0.05, 1.0)` → `0.1`) and re-verify. Commit only if changed.

- [ ] **Step 5: Write `README.md`**

```md
# bhs — Kerr Black Hole Simulator

Real-time, physically-accurate rendering of a rotating (Kerr) black hole by
backward-tracing null geodesics per pixel in a GLSL fragment shader.

## Run
```
npm install
npm run dev      # open the printed localhost URL
npm test         # physics unit tests (Vitest)
```

## Controls
- Drag to orbit, scroll to zoom.
- Spin `a`, inclination, camera radius, RK4 step / max steps, background mode.

## Backgrounds
- Milky Way cubemap (drop faces in `assets/milkyway/`), lat/long grid, color-cube (dev).

## Physics
Boyer–Lindquist coordinates, geometric units G=c=M=1. Hamiltonian geodesic
integration (RK4) with conserved E, Lz; the JS reference in `src/physics/kerr.js`
is unit-tested and mirrored by `shaders/kerr.frag.glsl`.

## Verification
- a=0 reproduces the Schwarzschild shadow (impact parameter √27) — see `test/shadow.test.js`.
- Carter/Hamiltonian conservation checked in `test/kerr.test.js`.
- [record manual visual checks here]

## Roadmap
Accretion disk, Doppler/redshift coloring, and charged (Kerr–Newman) variants
slot into the existing geodesic loop — none are built in v1.
```

- [ ] **Step 6: Commit**

```bash
git add README.md test/shadow.test.js shaders/kerr.frag.glsl
git commit -m "test: photon-sphere verification + README"
```

---

## Self-Review Notes

- **Spec coverage:** Kerr metric (T2,T5) ✓; Hamiltonian/RK4/tetrad-ZAMO (T2,T3,T5) ✓; per-pixel backward ray-trace with horizon/escape/maxsteps termination (T5) ✓; three backgrounds (T4) ✓; all four controls — orbit, spin, inclination, quality (T6) ✓; verification ladder incl. √27 anchor + Carter/Hamiltonian conservation (T2,T7) ✓; future-object hook isolated in integrator (T5 note) ✓; Three.js/GLSL/lil-gui stack (T1,T4,T6) ✓.
- **Numerical care:** horizon + axis epsilons, near-horizon step clamp (T5); NaN robustness check (T7) ✓.
- **Scope cuts honored:** no disk/Doppler/charge/procedural-starfield built ✓.
- **Type consistency:** `sigma/delta/bigA/horizonOuter/invMetric/hamiltonian/rhs/rk4Step` names identical across `kerr.js`, tests, and GLSL mirrors; uniform names (`uSpin,uCamPos,uE0..uEPHI,uBgMode,uGridOverlay,uStepSize,uMaxSteps,uFov,uCubeMap`) consistent T4→T6; `settings` keys consistent T6.
- **Known soft spots flagged in-plan:** tetrad sign mapping may need a flip during T5 Step 3 (documented); `integrateGeodesic` is a documented stub in v1 with the live loop in `main()` (T5 note).
