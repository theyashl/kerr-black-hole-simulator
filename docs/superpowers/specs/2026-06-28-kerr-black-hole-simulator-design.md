# Kerr Black Hole Simulator (`bhs`) — v1 Design

**Date:** 2026-06-28
**Status:** Approved (brainstorming)

## Summary

A browser-based, real-time, physically-accurate **Kerr** (rotating) black hole
renderer. Each pixel backward-traces a null geodesic through Kerr spacetime until
the ray either falls through the event horizon (rendered black) or escapes to
infinity (sampled from a background sky). The user orbits the black hole with the
mouse and adjusts spin and viewing angle live.

This v1 renders the black hole **in isolation** — no accretion disk, no infalling
matter, no external objects. The spectacle is gravitational lensing of the
background sky. The integrator is architected so that external objects can be
added later as intersection tests inside the existing ray-integration loop.

## Goals

- Real-time (interactive framerate) **and** physically accurate — a true
  relativistic renderer you can move through.
- Kerr metric from the start (spin parameter `a`), with `a = 0` reproducing
  Schwarzschild as a correctness anchor.
- Visible, legible gravitational lensing via selectable backgrounds.
- Clean separation between the geodesic integrator and shading, so future work
  (accretion disk, Doppler coloring, etc.) slots in without a rewrite.

## Non-Goals (explicit v1 scope cuts — YAGNI)

- No accretion disk, jets, or any orbiting/infalling matter.
- No Doppler shift / relativistic beaming / redshift coloring (needs moving
  emitters — deferred).
- No charge (Reissner–Nordström / Kerr–Newman).
- No time evolution, mergers, or gravitational waves.
- No procedural starfield (the three chosen backgrounds cover the need).
- No automated shader unit tests (impractical); verification is visual-against-
  analytic plus conserved-quantity checks.

## Tech Stack

- **Browser** target.
- **Three.js** for the host environment: full-screen quad, camera/orbit controls,
  texture loading, uniform plumbing, render loop.
- **GLSL** fragment shader for all physics (the geodesic integration runs on the
  GPU, per pixel).
- **lil-gui** for the control panel.

## Physics — the core

Backward ray-tracing of **null geodesics in Kerr spacetime**, Boyer–Lindquist
coordinates, geometric units `G = c = M = 1`.

Metric building blocks:

```
Σ = r² + a²·cos²θ
Δ = r² − 2r + a²
```

Horizon (outer): `r₊ = 1 + √(1 − a²)`.

### Integration: Hamiltonian formulation

Geodesics integrated via the Hamiltonian `H = ½ gᵘᵛ pᵤ pᵥ`, with `H = 0` for null
rays. Because the Kerr metric is independent of `t` and `φ`, two momenta are
conserved:

- Energy: `E = −p_t`
- Axial angular momentum: `L_z = p_φ`

So per ray we evolve only `(r, θ, p_r, p_θ)` via Hamilton's equations:

```
dxⁱ/dλ  =  gⁱʲ pⱼ
dpᵢ/dλ  = −½ (∂ᵢ gᵘᵛ) pᵤ pᵥ
```

stepped with **RK4** (fixed step for v1; step clamped near the horizon).

The **Carter constant `Q`** is also conserved and is used as a free correctness
check — it should remain flat along every ray.

### Per-pixel algorithm

1. Build a local orthonormal **tetrad** at the camera, using a **ZAMO**
   (zero-angular-momentum observer) to remain well-behaved in the rotating
   spacetime.
2. Map the pixel's view-ray direction (in the local camera frame) to an initial
   null 4-momentum `pᵤ` via the tetrad. Normalize to null.
3. RK4-integrate the geodesic inward.
4. Terminate when:
   - `r < r₊ + ε`  → ray captured by horizon → **black**.
   - `r > r_escape` and moving outward → ray escaped → convert asymptotic
     direction to a sky coordinate and **sample the background**.
   - `steps > maxSteps` → safety cutoff (fall back to background sample).

This reproduces, with no special-casing: the shadow (angular radius ≈ √27 ≈ 5.2 M
at `a = 0`), the photon ring, the asymmetric/notched Kerr shadow at high spin, and
frame-dragging of the background.

## Architecture

```
bhs/
├── index.html              # canvas + UI panel mount
├── src/
│   ├── main.js             # Three.js bootstrap, render loop, uniform plumbing
│   ├── controls.js         # lil-gui sliders → uniforms
│   ├── camera.js           # orbit-camera state → camera position + tetrad basis
│   └── backgrounds.js      # skybox cubemap / grid / color-cube switching
├── shaders/
│   ├── fullscreen.vert.glsl  # trivial pass-through vertex shader
│   └── kerr.frag.glsl        # geodesic integrator + shading (the heart)
└── assets/
    └── milkyway/           # cubemap face textures
```

Three.js renders a single full-screen quad; **all physics lives in
`kerr.frag.glsl`**. The integrator is a self-contained GLSL function,
`integrateGeodesic(...)`, returning either `HORIZON` or an escape direction. This
isolation is deliberate: adding external objects later means adding an
intersection test inside the existing integration loop, with no rewrite of the
core.

### Component responsibilities

- **`main.js`** — owns the Three.js renderer, scene (just the quad), and the
  per-frame loop; reads camera + control state and writes uniforms.
- **`camera.js`** — converts orbit state (radius, azimuth, inclination) into the
  camera's Boyer–Lindquist position and the ZAMO tetrad basis vectors passed as
  uniforms.
- **`controls.js`** — builds the lil-gui panel and binds it to a plain settings
  object consumed by `main.js`.
- **`backgrounds.js`** — loads the Milky Way cubemap and constructs the grid and
  color-cube backgrounds; exposes the active background to the shader (cubemap
  sampler + mode uniform).
- **`kerr.frag.glsl`** — tetrad setup, ray initialization, RK4 geodesic
  integration, termination logic, background sampling.

## Controls (lil-gui)

- **Orbit camera** — drag to rotate around the hole, scroll to zoom (camera
  radius).
- **Spin `a`** — slider `0` → `0.999` (Schwarzschild → near-extremal).
- **Inclination** — edge-on (equatorial) → pole-on viewing angle.
- **Quality** — RK4 step size, max steps.
- **Background** — mode dropdown (Milky Way / grid / color-cube) + grid overlay
  toggle.

## Data Flow

One-way, re-rendered every frame:

```
lil-gui (controls.js) ─┐
                       ├─► settings object ─► uniforms ─► kerr.frag.glsl ─► frame
orbit state (camera.js)┘    (a, inclination,            (per-pixel
                            stepSize, maxSteps,          integration +
                            bgMode, camPos, tetrad)      bg sampling)
```

## Backgrounds

Three selectable backgrounds, all lensed identically by the geodesic escape
directions:

1. **Milky Way skybox** — real 360° star-field cubemap; the photorealistic look
   (galaxy smeared into the Einstein ring).
2. **Coordinate grid** — lat/long grid on the celestial sphere; makes distortion
   legible (straight lines bent into the photon ring). Toggleable over the skybox.
3. **Color-cube** — each sky direction a distinct color; a development/verification
   aid to confirm where each ray lands.

## Numerical Care

- Guard coordinate singularities: horizon (`r → r₊`) and polar axis
  (`θ → 0, π`) with epsilons.
- Clamp/shrink the RK4 step near the horizon where the geometry steepens.
- Escape radius chosen large enough that asymptotic direction is well-defined;
  `maxSteps` cutoff prevents infinite loops on near-photon-sphere rays.

## Verification Ladder

1. **Color-cube + distant camera** → background ≈ undistorted (sanity check on
   ray-direction mapping).
2. **`a = 0` matches analytic Schwarzschild** → shadow angular radius √27 — the
   primary ground truth.
3. **Carter constant drift ≈ 0** along sample rays (debug readout).
4. **Extremal `a → 1` silhouette** matches published Kerr shadow shapes
   (asymmetric, flattened on the prograde side).
5. Optional: a small JS-side reference integrator for a handful of rays to
   cross-check the GLSL implementation.

## Future Expansion Hooks (not built in v1)

- **Accretion disk** — intersection test against the equatorial plane inside the
  integration loop; the integrator already produces the full path.
- **Doppler / redshift coloring** — once emitters exist, color by the
  energy-shift factor using the already-tracked photon momentum.
- **Charge / Kerr–Newman** — extend `Δ` and the inverse metric; the Hamiltonian
  machinery is unchanged.
