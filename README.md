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
  Tangential photon at r=3 with Lz=√27 stays within 3e-10 of r=3 over 400 RK4 steps (dl=0.01).
- Carter/Hamiltonian conservation checked in `test/kerr.test.js`.
- Manual visual checks (to be confirmed in browser):
  - [ ] Color-cube, r=60: background nearly undistorted at edges, lensing concentrated near center.
  - [ ] a=0, grid: shadow circular, photon ring is a thin bright circle; shadow angular radius ≈ atan(√27 / r).
  - [ ] a=0.9, edge-on: shadow asymmetric/flattened on the prograde side.
  - [ ] a→0.999, pole-on: shadow rounder, frame-dragging swirl visible in the grid.
  - [ ] Near-horizon robustness (r~4, a=0.99): no NaN flashes or full-screen garbage.

## Roadmap

Accretion disk, Doppler/redshift coloring, and charged (Kerr–Newman) variants
slot into the existing geodesic loop — none are built in v1.
