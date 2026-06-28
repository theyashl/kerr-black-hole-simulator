#!/usr/bin/env python3
"""Convert an equirectangular (2:1) panorama into 6 cube-map faces named for
Three.js CubeTextureLoader: px, nx, py, ny, pz, nz.

Uses the standard OpenGL/WebGL cube-map face convention. The simulator's shader
samples the cube with a flipped X (matching Three.js's flipEnvMap=-1 for
CubeTextureLoader textures), so faces are generated un-flipped here.

Usage:
    python3 tools/equirect-to-cubemap.py INPUT.jpg OUTDIR [FACE_SIZE] [FORMAT]

FORMAT is "jpg" (default, small — best for star backgrounds) or "png" (lossless).

Example:
    python3 tools/equirect-to-cubemap.py milkyway.jpg assets/milkyway 1024 jpg
"""
import os
import sys
import math

import numpy as np
from PIL import Image


def main():
    if len(sys.argv) < 3:
        print(__doc__)
        sys.exit(1)
    inp, outdir = sys.argv[1], sys.argv[2]
    n = int(sys.argv[3]) if len(sys.argv) > 3 else 1024
    fmt = (sys.argv[4] if len(sys.argv) > 4 else "jpg").lower().lstrip(".")
    if fmt not in ("jpg", "jpeg", "png"):
        print(f"unknown format {fmt!r} (use jpg or png)")
        sys.exit(1)
    ext = "jpg" if fmt in ("jpg", "jpeg") else "png"

    Image.MAX_IMAGE_PIXELS = None  # allow large panoramas
    src = np.asarray(Image.open(inp).convert("RGB"))
    h, w, _ = src.shape
    if abs(w / h - 2.0) > 0.05:
        print(f"warning: input aspect {w/h:.3f} is not 2:1 (equirectangular expected)")

    # Per-face 2D coords s,t in [-1,1]; s points right, t points up
    # (image row 0 = top = t=+1).
    lin = (np.arange(n) + 0.5) / n * 2.0 - 1.0
    s, t = np.meshgrid(lin, -lin)
    one = np.ones_like(s)

    # Standard cube-map face -> 3D direction (right-handed, +Y up).
    faces = {
        "px": ( one,  -t,  -s),
        "nx": (-one,  -t,   s),
        "py": (   s,  one,  t),
        "ny": (   s, -one, -t),
        "pz": (   s,  -t,  one),
        "nz": (  -s,  -t, -one),
    }

    os.makedirs(outdir, exist_ok=True)
    for name, (x, y, z) in faces.items():
        norm = np.sqrt(x * x + y * y + z * z)
        x, y, z = x / norm, y / norm, z / norm
        lon = np.arctan2(z, x)              # azimuth around +Y axis
        lat = np.arcsin(np.clip(y, -1.0, 1.0))
        u = (lon / (2.0 * math.pi) + 0.5) % 1.0
        v = 0.5 - lat / math.pi            # v=0 at north pole (top of image)
        sx = np.clip((u * w).astype(np.int64), 0, w - 1)
        sy = np.clip((v * h).astype(np.int64), 0, h - 1)
        out = src[sy, sx]
        path = os.path.join(outdir, f"{name}.{ext}")
        img = Image.fromarray(out, "RGB")
        if ext == "jpg":
            img.save(path, quality=92, optimize=True)
        else:
            img.save(path)
        print(f"wrote {path}  ({n}x{n})")


if __name__ == "__main__":
    main()
