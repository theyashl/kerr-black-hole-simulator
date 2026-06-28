import * as THREE from 'three';
import vertexShader from '../shaders/fullscreen.vert.glsl?raw';
import fragmentShader from '../shaders/kerr.frag.glsl?raw';
import { loadBackground } from './backgrounds.js';
import { orbitToPosition, zamoTetrad } from './camera.js';
import { initControls, initOrbit } from './controls.js';

const canvas = document.getElementById('app');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: false });
// Render at 1x device pixels; the actual buffer size is driven by
// settings.resolutionScale below (downscale then let CSS upscale the canvas).
renderer.setPixelRatio(1);

const scene = new THREE.Scene();
const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);

// requestRender is hoisted (function declaration), so it's safe to reference
// here for the async cube-load callback that fires later.
const bg = loadBackground(renderer, () => requestRender());

export const uniforms = {
  uResolution: { value: new THREE.Vector2() },
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
  // Perf knobs — 'Balanced' defaults are laptop-friendly. Crank via Quality preset.
  // stepSize is the distance-proportional step coefficient K (~0.1 is accurate).
  quality: 'Balanced', resolutionScale: 0.6,
  stepSize: 0.1, maxSteps: 600, bgMode: 1, gridOverlay: false,
};

const material = new THREE.ShaderMaterial({ vertexShader, fragmentShader, uniforms });
const quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), material);
scene.add(quad);

// --- Render on demand -------------------------------------------------------
// The image only changes when the user moves something, so we render a single
// frame per change instead of looping forever (which pinned the GPU at 100%).
let renderScheduled = false;
function requestRender() {
  if (renderScheduled || document.hidden) return;
  renderScheduled = true;
  requestAnimationFrame(() => {
    renderScheduled = false;
    renderer.render(scene, camera);
  });
}

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

// Apply resolutionScale to the draw buffer; CSS keeps the canvas full-window so
// the browser upscales the smaller buffer (big perf win on retina displays).
function applyResolution() {
  const w = Math.max(1, Math.round(window.innerWidth * settings.resolutionScale));
  const h = Math.max(1, Math.round(window.innerHeight * settings.resolutionScale));
  renderer.setSize(w, h, false);
  uniforms.uResolution.value.set(w, h);
}

function applySettings() {
  applyResolution();
  uniforms.uSpin.value = settings.spin;
  uniforms.uCamPos.value.set(settings.radius,
    THREE.MathUtils.degToRad(settings.inclinationDeg),
    THREE.MathUtils.degToRad(settings.azimuthDeg));
  uniforms.uStepSize.value = settings.stepSize;
  uniforms.uMaxSteps.value = Math.round(settings.maxSteps);
  uniforms.uBgMode.value = Number(settings.bgMode);
  uniforms.uGridOverlay.value = settings.gridOverlay;
  updateCamera();
  requestRender();
}

window.addEventListener('resize', applySettings);
// Don't schedule work while the tab is hidden; redraw once it's visible again.
document.addEventListener('visibilitychange', () => { if (!document.hidden) requestRender(); });

initControls(settings, applySettings);
initOrbit(canvas, settings, applySettings);
applySettings();
