import GUI from 'lil-gui';

export function initControls(settings, onChange) {
  const gui = new GUI({ title: 'Kerr black hole' });
  gui.add(settings, 'spin', 0, 0.999, 0.001).name('spin a').onChange(onChange);
  gui.add(settings, 'inclinationDeg', 1, 179, 1).name('inclination°').onChange(onChange);
  gui.add(settings, 'radius', 3, 60, 0.5).name('camera r').onChange(onChange);
  gui.add(settings, 'stepSize', 0.005, 0.1, 0.005).name('RK4 step').onChange(onChange);
  gui.add(settings, 'maxSteps', 100, 2048, 1).name('max steps').onChange(onChange);
  gui.add(settings, 'bgMode', { 'Milky Way': 0, Grid: 1, 'Color cube': 2 })
     .name('background').onChange(onChange);
  gui.add(settings, 'gridOverlay').name('grid overlay').onChange(onChange);
}

// Drag to change azimuth/inclination, wheel to zoom radius.
export function initOrbit(canvas, settings, onChange) {
  let dragging = false, lx = 0, ly = 0;
  canvas.addEventListener('pointerdown', (e) => { dragging = true; lx = e.clientX; ly = e.clientY; });
  window.addEventListener('pointerup', () => { dragging = false; });
  window.addEventListener('pointermove', (e) => {
    if (!dragging) return;
    settings.azimuthDeg = (settings.azimuthDeg + (e.clientX - lx) * 0.3) % 360;
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
