precision highp float;
varying vec2 vUv;
void main() {
  gl_FragColor = vec4(vUv, 0.4, 1.0);
}
