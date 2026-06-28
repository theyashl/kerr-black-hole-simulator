import GUI from 'lil-gui';

// Quality presets jointly set the perf-sensitive knobs (render resolution, step
// count, step size). 'Balanced' is the laptop-friendly default; 'Quality' is for
// machines with a discrete GPU.
// Accuracy (step coefficient K, max steps) is held fixed across presets so the
// shadow stays correct; presets trade only render resolution for speed.
const PRESETS = {
  Performance: { resolutionScale: 0.4, maxSteps: 600, stepSize: 0.1 },
  Balanced: { resolutionScale: 0.6, maxSteps: 600, stepSize: 0.1 },
  Quality: { resolutionScale: 1.0, maxSteps: 800, stepSize: 0.1 },
};

export function initControls(settings, onChange) {
  const gui = new GUI({ title: 'Kerr black hole' });

  gui.add(settings, 'quality', Object.keys(PRESETS)).name('quality preset')
     .onChange((name) => {
       Object.assign(settings, PRESETS[name]);
       gui.controllersRecursive().forEach((c) => c.updateDisplay());
       onChange();
     });

  gui.add(settings, 'spin', 0, 0.999, 0.001).name('spin a').onChange(onChange);
  gui.add(settings, 'inclinationDeg', 1, 179, 1).name('inclination°').onChange(onChange);
  gui.add(settings, 'radius', 3, 60, 0.5).name('camera r').onChange(onChange);
  gui.add(settings, 'bgMode', { 'Milky Way': 0, Grid: 1, 'Color cube': 2 })
     .name('background').onChange(onChange);
  gui.add(settings, 'gridOverlay').name('grid overlay').onChange(onChange);

  // Advanced perf knobs (also moved by the preset above).
  const perf = gui.addFolder('Performance');
  perf.add(settings, 'resolutionScale', 0.25, 1.0, 0.05).name('resolution').onChange(onChange);
  perf.add(settings, 'stepSize', 0.04, 0.2, 0.01).name('step K (lower=finer)').onChange(onChange);
  perf.add(settings, 'maxSteps', 100, 2048, 1).name('max steps').onChange(onChange);
}

// Drag to change azimuth/inclination, wheel to zoom radius.
export function initOrbit(canvas, settings, onChange) {
  let dragging = false, lx = 0, ly = 0;
  canvas.addEventListener('pointerdown', (e) => { dragging = true; lx = e.clientX; ly = e.clientY; });
  window.addEventListener('pointerup', () => { dragging = false; });
  window.addEventListener('pointermove', (e) => {
    if (!dragging) return;
    settings.azimuthDeg = ((settings.azimuthDeg + (e.clientX - lx) * 0.3) % 360 + 360) % 360;
    settings.inclinationDeg = Math.min(179, Math.max(1, settings.inclinationDeg - (e.clientY - ly) * 0.3));
    lx = e.clientX; ly = e.clientY;
    onChange();
  });
  canvas.addEventListener('wheel', (e) => {
    e.preventDefault();
    settings.radius = Math.min(60, Math.max(3, settings.radius + e.deltaY * 0.01));
    onChange();
  }, { passive: false });
}
