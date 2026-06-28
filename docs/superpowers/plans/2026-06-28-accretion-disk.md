# Accretion Disk Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a thin, lensed, glowing accretion disk (equatorial annulus, ISCO inner edge, temperature+turbulence emission, opt-in animation) to the existing Kerr renderer.

**Architecture:** A new JS physics module (`src/physics/disk.js`, unit-tested) provides ISCO radius, temperature profile, and equatorial-crossing detection, mirrored by GLSL in `shaders/kerr.frag.glsl`. Inside the existing per-pixel geodesic RK4 loop, each step tests for an equatorial-plane crossing within `[r_in, r_out]`; the first such hit is opaque and emits the disk color. `main.js` plumbs disk uniforms (recomputing the ISCO inner edge from spin) and runs a continuous render loop *only while animation is on* (otherwise render-on-demand is preserved).

**Tech Stack:** Browser, Three.js, GLSL fragment shader, lil-gui, Vitest. Same patterns as the existing codebase.

## Global Constraints

- Geometric units G=c=M=1; Boyer–Lindquist `(t,r,θ,φ)`; signature `(−,+,+,+)`; spin `a ∈ [0, 0.999]`.
- The JS physics in `src/physics/disk.js` is the tested ground truth; the GLSL must mirror it exactly (same formulas), matching the existing `kerr.js` ↔ `kerr.frag.glsl` discipline.
- Disk is a thin annulus in the equatorial plane θ=π/2, between `r_in` and `r_out`. **Opaque, first-crossing wins**; the disk hit-test runs **before** the horizon-capture and escape checks each step.
- Prograde ISCO formula (exact): `Z1 = 1 + (1−a²)^(1/3)·[(1+a)^(1/3)+(1−a)^(1/3)]`, `Z2 = √(3a²+Z1²)`, `r_isco = 3 + Z2 − √[(3−Z1)(3+Z1+2Z2)]`. (a=0 → 6, a=1 → 1.)
- Temperature profile: `T(r) = (r_in/r)^(3/4)` (Novikov–Thorne shape), 1 at the inner edge, falling outward.
- Render-on-demand (one frame per change) MUST remain intact when animation is OFF. Continuous rendering only while animation is ON.
- Per-pixel final decision order: **disk hit → disk color; else captured → black (shadow); else → background.**
- Spec: `docs/superpowers/specs/2026-06-28-accretion-disk-design.md`.

---

## File Structure

| File | Responsibility |
|------|----------------|
| `src/physics/disk.js` | NEW — `iscoRadius(a)`, `diskTemperature(r, rIn)`, `equatorialCrossingFrac(thetaPrev, thetaNext)` (tested ground truth) |
| `test/disk.test.js` | NEW — unit tests for `disk.js` |
| `test/disk-lensing.test.js` | NEW — integration test: a traced ray registers a disk hit (seam coverage) |
| `shaders/kerr.frag.glsl` | MODIFY — disk uniforms, noise/temperature/`diskEmission`, equatorial-crossing test in the RK4 loop |
| `src/main.js` | MODIFY — disk uniforms, ISCO-from-spin in `applySettings`, conditional animation render loop, `uTime` |
| `src/controls.js` | MODIFY — new "Disk" folder (enable, inner mode, outer, brightness, animate, speed) |

---

### Task 1: JS disk physics reference + unit tests

Pure-JS disk physics, TDD. The tested ground truth the shader mirrors.

**Files:**
- Create: `src/physics/disk.js`, `test/disk.test.js`

**Interfaces:**
- Produces:
  - `iscoRadius(a) → number` — prograde ISCO in units of M.
  - `diskTemperature(r, rIn) → number` — `(rIn/r)^0.75` for `r ≥ rIn`, else `0`.
  - `equatorialCrossingFrac(thetaPrev, thetaNext) → number | null` — if `(θ−π/2)` changes sign, the interpolation fraction `∈ (0,1)` of the crossing; else `null`.

- [ ] **Step 1: Write the failing tests**

`test/disk.test.js`:
```js
import { describe, it, expect } from 'vitest';
import { iscoRadius, diskTemperature, equatorialCrossingFrac } from '../src/physics/disk.js';

describe('iscoRadius (prograde)', () => {
  it('is 6 at a=0 (Schwarzschild)', () => {
    expect(iscoRadius(0)).toBeCloseTo(6, 10);
  });
  it('is 1 at a=1 (extremal prograde)', () => {
    expect(iscoRadius(1)).toBeCloseTo(1, 6);
  });
  it('decreases monotonically with spin', () => {
    expect(iscoRadius(0)).toBeGreaterThan(iscoRadius(0.5));
    expect(iscoRadius(0.5)).toBeGreaterThan(iscoRadius(0.9));
    expect(iscoRadius(0.9)).toBeGreaterThan(iscoRadius(0.998));
  });
});

describe('diskTemperature', () => {
  it('is 1 at the inner edge', () => {
    expect(diskTemperature(6, 6)).toBeCloseTo(1, 10);
  });
  it('falls off outward as (rIn/r)^0.75', () => {
    expect(diskTemperature(12, 6)).toBeCloseTo(Math.pow(0.5, 0.75), 10);
    expect(diskTemperature(12, 6)).toBeLessThan(diskTemperature(6, 6));
  });
  it('is 0 inside the inner edge', () => {
    expect(diskTemperature(4, 6)).toBe(0);
  });
});

describe('equatorialCrossingFrac', () => {
  it('detects a crossing and interpolates the fraction', () => {
    const f = equatorialCrossingFrac(Math.PI / 2 - 0.1, Math.PI / 2 + 0.1);
    expect(f).toBeCloseTo(0.5, 6);
  });
  it('returns null when both states are on the same side', () => {
    expect(equatorialCrossingFrac(1.0, 1.2)).toBeNull();          // both below pi/2
    expect(equatorialCrossingFrac(2.0, 2.2)).toBeNull();          // both above pi/2
  });
  it('interpolates an off-center crossing', () => {
    // prev just below, next far above -> crossing near the start
    const f = equatorialCrossingFrac(Math.PI / 2 - 0.01, Math.PI / 2 + 0.09);
    expect(f).toBeCloseTo(0.1, 6);
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npm test`
Expected: FAIL — `src/physics/disk.js` missing.

- [ ] **Step 3: Implement `src/physics/disk.js`**

```js
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

// If theta crosses pi/2 between the two states, return the interpolation
// fraction in (0,1) of the crossing; otherwise null.
export function equatorialCrossingFrac(thetaPrev, thetaNext) {
  const dPrev = thetaPrev - Math.PI / 2;
  const dNext = thetaNext - Math.PI / 2;
  if (dPrev * dNext >= 0) return null;
  return dPrev / (dPrev - dNext);
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npm test`
Expected: PASS (disk tests + all existing tests).

- [ ] **Step 5: Commit**

```bash
git add src/physics/disk.js test/disk.test.js
git commit -m "feat: JS accretion-disk physics (ISCO, temperature, equatorial crossing)"
```

---

### Task 2: Shader disk rendering + main.js uniforms

Render the lensed disk: add disk uniforms, emission, and the equatorial-crossing hit-test inside the geodesic loop; plumb uniforms (and ISCO-from-spin) in `main.js`. Includes a JS integration test mirroring the shader's disk hit, to protect the wiring.

**Files:**
- Modify: `shaders/kerr.frag.glsl`, `src/main.js`
- Create: `test/disk-lensing.test.js`

**Interfaces:**
- Consumes: `iscoRadius` from `src/physics/disk.js`; `equatorialCrossingFrac`, `diskTemperature` (for the integration test); `rk4Step`, `horizonOuter` from `kerr.js`; `zamoTetrad`, `covMetric` from `camera.js`.
- Produces (shader uniforms, set by `main.js`): `uDiskEnabled` (bool), `uDiskInner` (float), `uDiskOuter` (float), `uDiskBrightness` (float), `uDiskAnimate` (bool), `uDiskSpeed` (float), `uTime` (float).

- [ ] **Step 1: Add disk uniforms + emission helpers to the shader**

In `shaders/kerr.frag.glsl`, add after the existing uniform block (after `uniform int uMaxSteps;`):
```glsl
uniform bool  uDiskEnabled;
uniform float uDiskInner;
uniform float uDiskOuter;
uniform float uDiskBrightness;
uniform bool  uDiskAnimate;
uniform float uDiskSpeed;
uniform float uTime;

const float PIH = 1.5707963267948966; // pi/2
```

Then add these functions just above `void main()`:
```glsl
// --- Accretion disk emission (mirrors src/physics/disk.js profile) ---
float hash21(vec2 p){ p=fract(p*vec2(123.34,456.21)); p+=dot(p,p+45.32); return fract(p.x*p.y); }
float vnoise(vec2 p){
  vec2 i=floor(p), f=fract(p);
  float a=hash21(i), b=hash21(i+vec2(1,0)), c=hash21(i+vec2(0,1)), d=hash21(i+vec2(1,1));
  vec2 u=f*f*(3.0-2.0*f);
  return mix(mix(a,b,u.x), mix(c,d,u.x), u.y);
}
float fbm(vec2 p){
  float s=0.0, amp=0.5;
  for(int i=0;i<4;i++){ s+=amp*vnoise(p); p*=2.0; amp*=0.5; }
  return s;
}
// Blackbody-style ramp: T in [0,1], 1 = hottest (inner edge).
vec3 temperatureColor(float T){
  vec3 hot  = vec3(0.85, 0.92, 1.0);  // blue-white
  vec3 mid  = vec3(1.0,  0.6,  0.2);  // orange
  vec3 cool = vec3(0.55, 0.05, 0.0);  // deep red
  return T > 0.5 ? mix(mid, hot, (T-0.5)*2.0) : mix(cool, mid, T*2.0);
}
vec3 diskEmission(float r, float phi){
  float Tp = pow(uDiskInner / r, 0.75);                 // profile, 1 at inner edge
  float edge = smoothstep(uDiskInner, uDiskInner*1.08, r)
             * (1.0 - smoothstep(uDiskOuter*0.92, uDiskOuter, r));
  float phase = uDiskAnimate ? uDiskSpeed * uTime * pow(r, -1.5) : 0.0; // Keplerian swirl
  float n = fbm(vec2(r*0.6, (phi + phase)*1.5));
  float bright = Tp * edge * mix(0.45, 1.0, n) * uDiskBrightness;
  return temperatureColor(clamp(Tp, 0.0, 1.0)) * bright;
}
```

- [ ] **Step 2: Add the equatorial-crossing hit-test inside the integration loop**

In `shaders/kerr.frag.glsl`, the loop currently reads (note `phi` is updated each step):
```glsl
  for (int i=0; i<2048; i++) {
    if (i >= uMaxSteps) break;
    float dl = clamp(uStepSize * (st.x - rH), 0.005, 50.0);
    float dphi;
    vec4 k1 = rhs(st, E, Lz, a, dphi); float dp1=dphi;
    vec4 k2 = rhs(st+0.5*dl*k1, E, Lz, a, dphi); float dp2=dphi;
    vec4 k3 = rhs(st+0.5*dl*k2, E, Lz, a, dphi); float dp3=dphi;
    vec4 k4 = rhs(st+dl*k3, E, Lz, a, dphi); float dp4=dphi;
    st  += (dl/6.0)*(k1+2.0*k2+2.0*k3+k4);
    phi += (dl/6.0)*(dp1+2.0*dp2+2.0*dp3+dp4);

    // keep theta off the poles so sin(theta) never hits 0 (avoids NaN on axis crossing)
    st.y = clamp(st.y, 1e-3, PI - 1e-3);

    if (st.x < rH) { captured = true; break; } // fell through the horizon -> shadow
    if (st.x > 300.0) break;                    // escaped to the sky
  }
```
Replace it with (adds `thPrev/rPrev/phiPrev` capture and the disk hit-test before the capture/escape checks):
```glsl
  for (int i=0; i<2048; i++) {
    if (i >= uMaxSteps) break;
    float thPrev = st.y, rPrev = st.x, phiPrev = phi; // pre-step state for disk crossing
    float dl = clamp(uStepSize * (st.x - rH), 0.005, 50.0);
    float dphi;
    vec4 k1 = rhs(st, E, Lz, a, dphi); float dp1=dphi;
    vec4 k2 = rhs(st+0.5*dl*k1, E, Lz, a, dphi); float dp2=dphi;
    vec4 k3 = rhs(st+0.5*dl*k2, E, Lz, a, dphi); float dp3=dphi;
    vec4 k4 = rhs(st+dl*k3, E, Lz, a, dphi); float dp4=dphi;
    st  += (dl/6.0)*(k1+2.0*k2+2.0*k3+k4);
    phi += (dl/6.0)*(dp1+2.0*dp2+2.0*dp3+dp4);

    // keep theta off the poles so sin(theta) never hits 0 (avoids NaN on axis crossing)
    st.y = clamp(st.y, 1e-3, PI - 1e-3);

    // Accretion disk: opaque first crossing of the equatorial plane within [in,out].
    if (uDiskEnabled) {
      float dPrev = thPrev - PIH;
      float dCur  = st.y  - PIH;
      if (dPrev * dCur < 0.0) {                       // crossed the equator this step
        float frac = dPrev / (dPrev - dCur);
        float rHit = mix(rPrev, st.x, frac);
        if (rHit >= uDiskInner && rHit <= uDiskOuter) {
          float phiHit = mix(phiPrev, phi, frac);
          gl_FragColor = vec4(diskEmission(rHit, phiHit), 1.0);
          return;
        }
      }
    }

    if (st.x < rH) { captured = true; break; } // fell through the horizon -> shadow
    if (st.x > 300.0) break;                    // escaped to the sky
  }
```

- [ ] **Step 3: Add disk uniforms + ISCO wiring in `main.js`**

In `src/main.js`, add the import near the top imports:
```js
import { iscoRadius } from './physics/disk.js';
```
Add these entries to the `uniforms` object:
```js
  uDiskEnabled: { value: true },
  uDiskInner: { value: 6 },
  uDiskOuter: { value: 20 },
  uDiskBrightness: { value: 1.0 },
  uDiskAnimate: { value: false },
  uDiskSpeed: { value: 1.0 },
  uTime: { value: 0 },
```
Add these keys to the `settings` object:
```js
  diskEnabled: true, diskInnerMode: 'ISCO', diskInnerManual: 6,
  diskOuter: 20, diskBrightness: 1.0, diskAnimate: false, diskSpeed: 1.0,
```
In `applySettings()`, before the final `updateCamera(); requestRender();`, add:
```js
  uniforms.uDiskEnabled.value = settings.diskEnabled;
  uniforms.uDiskInner.value = settings.diskInnerMode === 'ISCO'
    ? iscoRadius(settings.spin) : settings.diskInnerManual;
  uniforms.uDiskOuter.value = settings.diskOuter;
  uniforms.uDiskBrightness.value = settings.diskBrightness;
  uniforms.uDiskAnimate.value = settings.diskAnimate;
  uniforms.uDiskSpeed.value = settings.diskSpeed;
```

- [ ] **Step 4: Write the disk-hit integration test**

`test/disk-lensing.test.js` — mirrors the shader's ray setup + disk crossing using the JS modules, so the disk wiring is covered (the same kind of seam test that caught the black-screen bug). An inclined camera (θ₀=60°) shooting a ray angled toward the equatorial plane must register a disk hit within `[rIn, rOut]`; a ray aimed away from the disk must not.
```js
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
    const res = traceDisk(0.0, -0.4, { th0: (60 * Math.PI) / 180, rIn, rOut: 20 });
    expect(res.hit).toBe(true);
    expect(res.rHit).toBeGreaterThanOrEqual(rIn);
    expect(res.rHit).toBeLessThanOrEqual(20);
  });
  it('a ray aimed up and away from the disk does not hit it', () => {
    const res = traceDisk(0.0, 0.9, { th0: (60 * Math.PI) / 180, rIn, rOut: 20 });
    expect(res.hit).toBe(false);
  });
});
```

- [ ] **Step 5: Run the integration test (and full suite)**

Run: `npm test`
Expected: PASS. If the "hits the disk" case fails, the `uvy` sign convention may be inverted for this camera orientation — flip the sign of the `uvy` in the *hitting* test case and confirm it then hits (the disk is below the camera's look direction when tilted above the plane). Note the chosen sign in the report. The full suite (kerr, camera, shadow, lensing, disk, disk-lensing) must pass.

- [ ] **Step 6: Verify the build compiles**

Run: `npm run build`
Expected: SUCCESS. (Vite bundles the shader as a string; this confirms JS wiring. The live visual check — disk appears, lensed over/under the shadow — is performed by the human in Task 5, since a subagent cannot open a browser. State this in the report.)

- [ ] **Step 7: Commit**

```bash
git add shaders/kerr.frag.glsl src/main.js test/disk-lensing.test.js
git commit -m "feat: lensed accretion disk rendering (equatorial crossing + emission)"
```

---

### Task 3: Disk controls (lil-gui)

Expose the disk settings in a new lil-gui folder so they're adjustable live.

**Files:**
- Modify: `src/controls.js`

**Interfaces:**
- Consumes: the `settings` keys added in Task 2 (`diskEnabled, diskInnerMode, diskInnerManual, diskOuter, diskBrightness, diskAnimate, diskSpeed`) and the `onChange` callback.

- [ ] **Step 1: Add the Disk folder in `initControls`**

In `src/controls.js`, inside `initControls`, after the existing `gui.add(settings, 'gridOverlay')...` line (and before the `Performance` folder), add:
```js
  const disk = gui.addFolder('Disk');
  disk.add(settings, 'diskEnabled').name('disk on').onChange(onChange);
  disk.add(settings, 'diskInnerMode', { 'ISCO (auto)': 'ISCO', Manual: 'Manual' })
      .name('inner edge').onChange(onChange);
  disk.add(settings, 'diskInnerManual', 1.5, 20, 0.5).name('inner r (manual)').onChange(onChange);
  disk.add(settings, 'diskOuter', 6, 50, 0.5).name('outer r').onChange(onChange);
  disk.add(settings, 'diskBrightness', 0.0, 3.0, 0.05).name('brightness').onChange(onChange);
  disk.add(settings, 'diskAnimate').name('animate').onChange(onChange);
  disk.add(settings, 'diskSpeed', 0.0, 5.0, 0.1).name('spin speed').onChange(onChange);
```

- [ ] **Step 2: Verify build + wiring**

Run: `npm run build`
Expected: SUCCESS. Self-audit: every added control binds a `settings` key that `applySettings()` (Task 2) consumes and writes to a uniform. The live check (panel shows a Disk folder; toggling `disk on`, changing `outer r`/`brightness`, switching `inner edge` to Manual all update the view) is the human's job in Task 5.

- [ ] **Step 3: Commit**

```bash
git add src/controls.js
git commit -m "feat: lil-gui controls for the accretion disk"
```

---

### Task 4: Animation render loop

Make the disk swirl when `animate` is on, using a continuous render loop **only while animating** — preserving render-on-demand otherwise.

**Files:**
- Modify: `src/main.js`

**Interfaces:**
- Consumes: `settings.diskAnimate`, `uniforms.uTime`, the existing `renderer`, `scene`, `camera`, `requestRender`.

- [ ] **Step 1: Add the conditional animation loop in `main.js`**

In `src/main.js`, after the `requestRender()` definition block, add:
```js
// Continuous render loop — runs ONLY while the disk animation toggle is on, so
// render-on-demand (and idle ~0% GPU) is preserved the rest of the time.
let animating = false;
const animClock = new THREE.Clock();
function animationLoop() {
  if (!settings.diskAnimate) { animating = false; return; } // stop -> back to on-demand
  uniforms.uTime.value = animClock.getElapsedTime();
  renderer.render(scene, camera);
  requestAnimationFrame(animationLoop);
}
function syncAnimation() {
  if (settings.diskAnimate && !animating) {
    animating = true;
    animClock.start();
    requestAnimationFrame(animationLoop);
  }
}
```
Then in `applySettings()`, add `syncAnimation();` immediately before the final `requestRender();` line.

- [ ] **Step 2: Verify build**

Run: `npm run build`
Expected: SUCCESS. Self-audit: when `diskAnimate` is false, `animationLoop` early-returns and sets `animating=false` (no continuous rendering); when toggled true, `syncAnimation()` starts exactly one loop (the `!animating` guard prevents stacking multiple loops on repeated toggles). The live check (smooth swirl when on; GPU idle when off) is the human's job in Task 5.

- [ ] **Step 3: Run the full test suite (no regressions)**

Run: `npm test`
Expected: PASS (all suites; this task adds no tests but must not break existing ones).

- [ ] **Step 4: Commit**

```bash
git add src/main.js
git commit -m "feat: opt-in disk animation loop (preserves render-on-demand when off)"
```

---

### Task 5: README + visual verification

Document the disk and record the human visual checks.

**Files:**
- Modify: `README.md`

**Interfaces:**
- None (docs only).

- [ ] **Step 1: Add a Disk section to `README.md`**

In `README.md`, add after the `## Backgrounds` section:
```md
## Accretion disk

- Thin glowing disk in the equatorial plane, lensed by the same geodesics — the
  far side bends up over the shadow, the underside curves below.
- Inner edge defaults to the **ISCO** (spin-dependent: 6M at a=0, tightening as
  spin rises); outer radius, brightness, and inner mode (ISCO/manual) are in the
  **Disk** control folder.
- Emission is a Novikov–Thorne temperature profile (`T ∝ (r_in/r)^¾`, blue-white
  inner → red outer) modulated by procedural turbulence.
- **Animate** swirls the gas (differential/Keplerian rotation). It uses a
  continuous render loop, so it's **off by default** to keep idle GPU at ~0%.

### Disk verification (browser)
- [ ] Disk on, a=0, inclination ~75°: glowing ring with the far side lensed up
      over the shadow and the underside visible below.
- [ ] Increase spin → the disk inner edge tightens (ISCO mode).
- [ ] Switch background to Milky Way: disk renders over the star field.
- [ ] Animate on → smooth swirl; Animate off → still image, GPU idle.
```

- [ ] **Step 2: Verify the suite still passes and the build is clean**

Run: `npm test && npm run build`
Expected: PASS + SUCCESS.

- [ ] **Step 3: Commit**

```bash
git add README.md
git commit -m "docs: document the accretion disk + verification checklist"
```

---

## Self-Review Notes

- **Spec coverage:** thin equatorial disk + ray–plane intersection (T2) ✓; opaque first-hit, hit-test before capture/escape (T2) ✓; temperature+turbulence emission with blackbody ramp (T2) ✓; ISCO inner edge spin-dependent + manual override (T1 `iscoRadius`, T2 wiring, T3 control) ✓; outer radius (T2/T3) ✓; animation opt-in with render-on-demand preserved when off (T4) ✓; controls folder (T3) ✓; JS unit tests + mirror discipline (T1) ✓; disk-hit seam integration test (T2) ✓; final decision order disk→shadow→background (T2) ✓; README + visual ladder (T5) ✓.
- **Doppler-readiness:** the hit computes `rHit, phiHit` and the integrator already tracks the photon momentum; sub-project 2 multiplies in `g`. Not built here (per scope).
- **Type/name consistency:** `iscoRadius`, `diskTemperature`, `equatorialCrossingFrac` identical across `disk.js`, tests, and shader mirror; uniform names (`uDiskEnabled/Inner/Outer/Brightness/Animate/Speed`, `uTime`) consistent T2↔T3↔T4; `settings` keys (`diskEnabled, diskInnerMode, diskInnerManual, diskOuter, diskBrightness, diskAnimate, diskSpeed`) consistent T2↔T3.
- **Known soft spots flagged in-plan:** the integration-test `uvy` sign may need a flip on first run (T2 Step 5, documented); the live visual confirmation is deferred to the human (T2/T3/T4 build-only verification, T5 checklist) — consistent with the headless constraint.
- **Render-on-demand invariant:** only Task 4 introduces continuous rendering, gated strictly on `settings.diskAnimate`; when off, `animationLoop` returns immediately.
