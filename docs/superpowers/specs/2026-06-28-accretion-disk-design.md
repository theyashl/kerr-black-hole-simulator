# Accretion Disk — v1 Design

**Date:** 2026-06-28
**Status:** Approved (brainstorming)
**Roadmap:** Sub-project 1 of 4 (disk → Doppler/redshift → polish/UX → spacetime physics viz).

## Summary

Add a thin, glowing accretion disk to the Kerr black hole renderer. The disk is a
flat annulus in the equatorial plane, lensed by the same null geodesics already
integrated per pixel — producing the iconic warped look (the far side of the disk
bent up and over the shadow, the underside curving below). Emission follows a
physically-motivated temperature profile modulated by procedural turbulence. The
disk is opaque (first ray–plane crossing wins). Animation (differential rotation)
is an opt-in toggle that preserves the render-on-demand model when off.

This is the first expansion beyond the v1 lensing renderer. It is explicitly
architected so the next sub-projects slot in: the thin disk leaves room for a
volumetric upgrade, and each hit captures enough state (radius, azimuth, photon
momentum, disk 4-velocity) for the Doppler/redshift stage to multiply in a
shift factor with no rework.

## Goals

- A thin equatorial accretion disk, lensed correctly by the existing geodesic
  integrator (the "Interstellar/EHT" look).
- Physically-motivated emission: radial temperature falloff + blackbody-style
  color, modulated by procedural turbulence.
- Inner edge defaults to the ISCO (spin-dependent); outer edge configurable.
- Opt-in animation (differential rotation) that does not break render-on-demand
  when disabled.
- Clean isolation so the disk can be turned on/off and so future stages
  (volumetric disk, Doppler) attach without rewrites.

## Non-Goals (v1 scope cuts — YAGNI)

- No volumetric / thick disk (the thin disk is the foundation; hooks left).
- No Doppler beaming or gravitational/transverse redshift coloring (sub-project
  2; the hit captures the state it will need).
- No semi-transparency / emission accumulation along the ray (opaque first-hit
  only).
- No self-shadowing, no secondary-image emission accumulation.
- No retrograde-disk option (prograde ISCO only).

## Tech Stack

Unchanged from v1: browser, Three.js full-screen quad, GLSL fragment shader for
physics, lil-gui controls, Vitest for the JS reference. New physics lives in a
JS reference module mirrored by the shader, consistent with the existing
`src/physics/kerr.js` ↔ `shaders/kerr.frag.glsl` pattern.

## Geometry & Ray–Disk Intersection

The disk is an infinitely-thin annulus in the **equatorial plane** (θ = π/2),
between `r_in` and `r_out` (Boyer–Lindquist radius), geometric units G=c=M=1.

Inside the existing geodesic RK4 loop, after each integration step, detect an
**equatorial-plane crossing**: the sign of `(θ − π/2)` differs between the
pre-step and post-step state. On a crossing, linearly interpolate the crossing
radius `r_cross` from the two straddling states. If `r_in ≤ r_cross ≤ r_out`, it
is a **disk hit**.

The equatorial-plane crossing is far from the polar axis, so it is unaffected by
the existing pole clamp (`θ ∈ [1e-3, π−1e-3]`).

**Opacity — opaque, first-hit wins.** On the first disk hit, the ray stops and
takes the disk's color; integration ends. This is correct for the iconic look:
the over-the-top far side and the underside are *different rays* whose first hit
lands on different parts of the disk. The disk hit-test runs **before** the
horizon-capture and escape checks each step.

## Emission (temperature + turbulence)

At the hit point `(r_cross, φ)`:

- **Radial temperature profile:** `T(r) = (r_in / r)^(3/4)` (Novikov–Thorne
  shape), normalized to 1 at the inner edge and falling outward, with a soft
  brightness cutoff approaching `r_in` and `r_out`.
- **Color:** map `T` through a blackbody-style ramp (hot blue-white inner →
  cooler orange/red outer).
- **Turbulence:** procedural fbm noise in `(r, φ)` modulating brightness for
  swirling gas bands (e.g. `brightness *= mix(0.6, 1.0, noise)`).
- All of this lives in a self-contained GLSL function `diskEmission(r, phi, t)`
  so the future volumetric mode reuses it.

## Extent — inner edge = ISCO

`r_in` defaults to the **ISCO** (innermost stable circular orbit), the physical
inner edge of a thin disk, computed from spin `a` (prograde):

```
Z1 = 1 + (1 - a²)^(1/3) · [ (1 + a)^(1/3) + (1 - a)^(1/3) ]
Z2 = sqrt(3a² + Z1²)
r_isco = 3 + Z2 − sqrt[ (3 − Z1)(3 + Z1 + 2·Z2) ]
```

This gives 6M at a=0 (Schwarzschild) and → 1M as a→1 (extremal prograde). `r_in`
can be switched to a manual value; `r_out` is a slider (default ~20M).

## Animation

Default **off**, preserving render-on-demand (no continuous GPU use). When toggled
**on**:

- The turbulence field's azimuthal phase advances with `uTime` using
  **differential rotation** Ω(r) (inner gas orbits faster than outer), so the
  disk visibly swirls with shear.
- `main.js` switches to a continuous `requestAnimationFrame` loop **only while
  the toggle is on**; turning it off returns to render-on-demand.

## Architecture & Components

```
src/physics/disk.js   (new)  iscoRadius(a), diskTemperature(r, rIn),
                              equatorial-crossing helper — testable, mirrored in shader
shaders/kerr.frag.glsl       + disk uniforms, plane-crossing test in the RK4 loop,
                              diskEmission(r, phi, t)
src/main.js                  + disk uniforms; conditional render loop (continuous
                              only while animation on, else render-on-demand)
src/controls.js              + disk folder (on/off, inner ISCO/manual, outer radius,
                              brightness, animate toggle + speed)
test/disk.test.js     (new)  ISCO values, temperature falloff, crossing detector
```

### Final per-pixel decision (shader)

Per ray, in order: **disk hit → disk color**; else **captured → black (shadow)**;
else **escaped/maxsteps → background**. The disk hit is detected during
integration and short-circuits the rest.

### Doppler-readiness (sub-project 2)

Each disk hit records `r_cross`, `φ`, the photon 4-momentum, and the disk
matter's circular-orbit 4-velocity (prograde geodesic at `r_cross`). Stage 2
computes the redshift/beaming factor `g` from these and multiplies the emitted
temperature and brightness. v1 records/derives what it needs but applies `g = 1`.

## Controls (lil-gui — new "Disk" folder)

- **disk** — on/off (default on)
- **inner edge** — ISCO (auto, spin-linked) vs manual radius
- **outer radius** — slider (default ~20M)
- **brightness** — intensity multiplier
- **animate** — on/off (default off) + **speed** slider

## Data Flow

`lil-gui (disk settings)` → uniforms (`uDiskEnabled, uDiskInner, uDiskOuter,
uDiskBrightness, uDiskAnimate, uDiskSpeed`) and `uTime` (advanced only while
animating) → `kerr.frag.glsl` tests each ray against the disk during integration
→ emits disk color on hit. `r_in` is recomputed from spin via `iscoRadius(a)`
when in ISCO mode (JS side, written to `uDiskInner`).

## Numerical Care

- Interpolate the crossing radius from the straddling states rather than testing
  exact equality (a fixed step rarely lands on θ = π/2).
- With distance-proportional stepping, far-field steps are large; a disk crossing
  in the weak field is still captured because the sign change of `(θ − π/2)` is
  detected regardless of step size (the radius interpolation handles the gap).
  Near the inner edge, steps are already small (close to the hole), so crossing
  resolution is fine.
- Guard `r_in < r_out`; clamp brightness ≥ 0.

## Verification

- **JS unit tests** (`test/disk.test.js`): `iscoRadius(0)=6`, `iscoRadius(1)≈1`,
  monotonic `iscoRadius` decrease in spin; `diskTemperature` monotonic falloff
  and = 1 at `r_in`; equatorial-crossing helper flags a known plane-crossing ray
  and rejects a non-crossing one. Mirror-consistency with the shader formulas.
- **Visual ladder** (browser, human): disk appears with the far-side-over-the-top
  lensing; symmetric at a=0, asymmetric/brighter-on-one-side-geometrically at
  high spin; inner edge tightens as spin increases (ISCO mode); render-on-demand
  preserved when animation is off; smooth swirl when on.

## Future Expansion Hooks

- **Volumetric disk:** replace single-crossing with volume marching between disk
  surfaces, reusing `diskEmission`.
- **Doppler/redshift (sub-project 2):** multiply emitted T/brightness by the
  redshift factor `g` from the recorded photon momentum and disk 4-velocity.
- **Retrograde disk / tilted disk:** generalize the plane and ISCO sign.
