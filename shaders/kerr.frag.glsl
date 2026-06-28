precision highp float;

varying vec2 vUv;

uniform vec2  uResolution;
uniform vec3  uCamPos;     // Boyer-Lindquist (r, theta, phi)
uniform vec4  uE0, uER, uETH, uEPHI; // tetrad e_(a)^mu = [t,r,theta,phi]
uniform float uSpin;
uniform float uFov;        // vertical field of view (radians)
uniform int   uBgMode;     // 0 milkyway, 1 grid, 2 colorcube
uniform bool  uGridOverlay;
uniform samplerCube uCubeMap;

const float PI = 3.141592653589793;

// Map a unit direction on the celestial sphere to a background color.
vec3 sampleBackground(vec3 dir) {
  if (uBgMode == 2) {                 // color-cube: dominant axis -> face color
    vec3 a = abs(dir);
    if (a.x >= a.y && a.x >= a.z) return dir.x > 0.0 ? vec3(1,0,0) : vec3(0,1,1);
    if (a.y >= a.z)               return dir.y > 0.0 ? vec3(0,1,0) : vec3(1,0,1);
    return dir.z > 0.0 ? vec3(0,0,1) : vec3(1,1,0);
  }
  vec3 col;
  if (uBgMode == 0) col = textureCube(uCubeMap, dir).rgb;
  else              col = vec3(0.02); // grid mode base
  if (uBgMode == 1 || uGridOverlay) { // lat/long grid lines
    float lat = asin(clamp(dir.y, -1.0, 1.0));
    float lon = atan(dir.z, dir.x);
    float g = max(
      smoothstep(0.0, 0.04, abs(fract(lat / (PI/12.0)) - 0.5) * 2.0 - 0.96),
      smoothstep(0.0, 0.04, abs(fract(lon / (PI/12.0)) - 0.5) * 2.0 - 0.96));
    col = mix(col, vec3(0.2, 0.9, 0.5), g);
  }
  return col;
}

// Convert a BL position + a coordinate-basis direction into an approximate flat
// celestial direction (valid far from the hole; Task 5 replaces this with the
// integrated geodesic escape direction).
vec3 blToCartesianDir(vec3 camDir) {
  // camDir given in local frame (x=right/ephi, y=up/eth, z=forward/-er)
  return normalize(camDir);
}

void main() {
  vec2 uv = (gl_FragCoord.xy / uResolution) * 2.0 - 1.0;
  uv.x *= uResolution.x / uResolution.y;

  float t = tan(uFov * 0.5);
  // local-frame ray: forward toward the hole is -er => local z, up = eth, right = ephi
  vec3 local = normalize(vec3(uv.x * t, uv.y * t, -1.0)); // z<0 = toward hole
  // Build a flat sky direction from the local frame just for this task.
  vec3 dir = blToCartesianDir(vec3(local.x, local.y, -local.z));
  gl_FragColor = vec4(sampleBackground(dir), 1.0);
}
