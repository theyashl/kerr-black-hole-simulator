# Milky Way cubemap

These six faces (`px nx py ny pz nz`.jpg) are the photoreal background sampled by
`bgMode = 0` (Milky Way) in the simulator. They are generated from an
equirectangular panorama by `tools/equirect-to-cubemap.py`.

## Attribution

The bundled faces are derived from the **ESO Milky Way panorama** by
**Serge Brunier / ESO**, licensed **CC BY 4.0**.
Source: https://www.eso.org/public/images/eso0932a/

If you redistribute these images, keep the attribution.

## Regenerate / replace

To rebuild from any equirectangular (2:1) panorama:

```bash
npm run skybox -- path/to/panorama.jpg public/assets/milkyway 1024 jpg
# or directly:
python3 tools/equirect-to-cubemap.py path/to/panorama.jpg public/assets/milkyway 1024 jpg
```

Requires Python 3 with `pillow` and `numpy` (`pip install pillow numpy`).

### Other free panorama sources
- **NASA "Deep Star Maps 2020"** (public domain): https://svs.gsfc.nasa.gov/4851
- **Poly Haven** night-sky HDRIs (CC0): https://polyhaven.com/hdris
- **wwwtyro space-3d** (procedural, exports cube faces directly): https://wwwtyro.github.io/space-3d/

## Orientation note

Faces use the standard OpenGL cube convention; the shader negates X when sampling
to match three.js's `flipEnvMap` convention for `CubeTextureLoader`. If the
galactic band looks mirrored, either remove that negation in
`shaders/kerr.frag.glsl` (`sampleBackground`) or swap `px.jpg` ↔ `nx.jpg`.
