import * as THREE from 'three';
import vertexShader from '../shaders/fullscreen.vert.glsl?raw';
import fragmentShader from '../shaders/kerr.frag.glsl?raw';
import { loadBackground } from './backgrounds.js';
import { orbitToPosition, zamoTetrad } from './camera.js';
import { initControls, initOrbit } from './controls.js';

const canvas = document.getElementById('app');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: false });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));

const scene = new THREE.Scene();
const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);

const bg = loadBackground(renderer);

export const uniforms = {
  uResolution: { value: new THREE.Vector2() },
  uTime: { value: 0 },
  uCamPos: { value: new THREE.Vector3() },
  uE0: { value: new THREE.Vector4() },
  uER: { value: new THREE.Vector4() },
  uETH: { value: new THREE.Vector4() },
  uEPHI: { value: new THREE.Vector4() },
  uSpin: { value: 0 },
  uFov: { value: THREE.MathUtils.degToRad(60) },
  uBgMode: { value: 0 },
  uGridOverlay: { value: false },
  uCubeMap: { value: bg.cubeTexture },
  uStepSize: { value: 0 },
  uMaxSteps: { value: 0 },
};

const settings = {
  spin: 0.7, inclinationDeg: 90, azimuthDeg: 0, radius: 20,
  stepSize: 0.04, maxSteps: 600, bgMode: 1, gridOverlay: false,
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

initControls(settings, applySettings);
initOrbit(canvas, settings, applySettings);
applySettings();

const clock = new THREE.Clock();
function loop() {
  uniforms.uTime.value = clock.getElapsedTime();
  renderer.render(scene, camera);
  requestAnimationFrame(loop);
}
loop();
