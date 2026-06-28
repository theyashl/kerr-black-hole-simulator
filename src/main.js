import * as THREE from 'three';
import vertexShader from '../shaders/fullscreen.vert.glsl?raw';
import fragmentShader from '../shaders/kerr.frag.glsl?raw';
import { loadBackground } from './backgrounds.js';
import { orbitToPosition, zamoTetrad } from './camera.js';

const canvas = document.getElementById('app');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: false });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));

const scene = new THREE.Scene();
const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);

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
updateCamera();
function loop() {
  uniforms.uTime.value = clock.getElapsedTime();
  updateCamera();
  renderer.render(scene, camera);
  requestAnimationFrame(loop);
}
loop();
