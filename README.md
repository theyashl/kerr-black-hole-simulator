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
- Spin `a`, inclination, camera radius, background mode.
- **Quality preset** (Performance / Balanced / Quality) and a Performance folder with
  render resolution, RK4 step, and max steps.

## Performance

This is a per-pixel geodesic ray tracer — it's GPU-heavy. To keep it laptop-friendly:

- **Renders on demand** — a frame is drawn only when you change something, so a static
  view uses ~0% GPU (no continuous render loop pinning the card).
- **Resolution scale** — renders below native resolution and upscales (default 0.65).
- **Quality presets** trade resolution / step count for speed. Start on **Balanced**;
  use **Quality** only with a discrete GPU. Drop to **Performance** on integrated graphics.
- Rendering pauses while the browser tab is hidden.

A discrete GPU handles **Quality** comfortably; integrated graphics (Intel Iris, base
Apple M-series) should stay on **Balanced**/**Performance**.

## Backgrounds

- **Milky Way cubemap** (bundled — ESO panorama by Serge Brunier / ESO, CC BY 4.0), lat/long grid, color-cube (dev).
- Swap in your own sky: `npm run skybox -- panorama.jpg public/assets/milkyway 1024 jpg`. See `public/assets/milkyway/README.md`.

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
