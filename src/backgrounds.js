import * as THREE from 'three';

// Procedurally generates a color-cube and a grid cubemap, and (optionally) loads
// a Milky Way cubemap from assets/milkyway/. Returns a samplerCube the shader uses.
// Mode selection happens in-shader via uBgMode; this module supplies the texture
// for the photoreal mode and leaves grid/color-cube to be computed analytically.
// onLoad (optional) is called once the cube faces finish loading, so a
// render-on-demand host can draw a frame to actually show them.
export function loadBackground(renderer, onLoad) {
  const loader = new THREE.CubeTextureLoader();
  loader.setPath('/assets/milkyway/');
  // px,nx,py,ny,pz,nz face filenames. If assets are absent, fall back to a 1x1
  // dark texture so the app still runs (grid/color-cube modes are unaffected).
  let cubeTexture;
  try {
    cubeTexture = loader.load(
      ['px.jpg','nx.jpg','py.jpg','ny.jpg','pz.jpg','nz.jpg'],
      onLoad,
    );
  } catch (e) {
    cubeTexture = null;
  }
  return { cubeTexture };
}
