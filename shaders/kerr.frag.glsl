precision highp float;

uniform vec2  uResolution;
uniform vec3  uCamPos;     // Boyer-Lindquist (r, theta, phi)
uniform vec4  uE0, uER, uETH, uEPHI; // tetrad e_(a)^mu = [t,r,theta,phi]
uniform float uSpin;
uniform float uFov;        // vertical field of view (radians)
uniform int   uBgMode;     // 0 milkyway, 1 grid, 2 colorcube
uniform bool  uGridOverlay;
uniform samplerCube uCubeMap;
uniform float uStepSize;
uniform int   uMaxSteps;

uniform bool  uDiskEnabled;
uniform float uDiskInner;
uniform float uDiskOuter;
uniform float uDiskBrightness;
uniform bool  uDiskAnimate;
uniform float uDiskSpeed;
uniform float uTime;

const float PI = 3.141592653589793;
const float PIH = 1.5707963267948966; // pi/2

// Map a unit direction on the celestial sphere to a background color.
vec3 sampleBackground(vec3 dir) {
  if (uBgMode == 2) {                 // color-cube: dominant axis -> face color
    vec3 a = abs(dir);
    if (a.x >= a.y && a.x >= a.z) return dir.x > 0.0 ? vec3(1,0,0) : vec3(0,1,1);
    if (a.y >= a.z)               return dir.y > 0.0 ? vec3(0,1,0) : vec3(1,0,1);
    return dir.z > 0.0 ? vec3(0,0,1) : vec3(1,1,0);
  }
  vec3 col;
  // Negate X to match three.js's flipEnvMap=-1 convention for CubeTextureLoader
  // textures (our raw shader doesn't go through three's env-map path). If the
  // Milky Way band ever looks mirrored, remove this negation or swap px/nx.
  if (uBgMode == 0) col = textureCube(uCubeMap, vec3(-dir.x, dir.y, dir.z)).rgb;
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

// --- Kerr null-geodesic physics, mirroring src/physics/kerr.js ---
// Geometric units G=c=M=1, Boyer-Lindquist, signature (-,+,+,+).

float sigmaF(float r, float th, float a){ float c=cos(th); return r*r+a*a*c*c; }
float deltaF(float r, float a){ return r*r-2.0*r+a*a; }
float bigAF(float r, float th, float a){ float s=sin(th); float r2a2=r*r+a*a;
  return r2a2*r2a2 - a*a*deltaF(r,a)*s*s; }
float horizonOuter(float a){ return 1.0 + sqrt(max(1.0-a*a, 0.0)); }

// H = 1/2 g^{uv} p_u p_v with p_t=-E, p_phi=Lz. state=(r,theta,pr,ptheta).
float hamiltonian(vec4 st, float E, float Lz, float a){
  float r=st.x, th=st.y, pr=st.z, pth=st.w;
  float S=sigmaF(r,th,a), D=deltaF(r,a), A=bigAF(r,th,a);
  float s=sin(th); float s2=s*s;
  float gtt=-A/(S*D), gtp=-2.0*a*r/(S*D), grr=D/S, gthth=1.0/S,
        gpp=(D - a*a*s2)/(S*D*s2);
  return 0.5*(gtt*E*E - 2.0*gtp*E*Lz + gpp*Lz*Lz + grr*pr*pr + gthth*pth*pth);
}

// returns d/dlambda of (r, theta, pr, ptheta); dphi returned via out param.
vec4 rhs(vec4 st, float E, float Lz, float a, out float dphi){
  float r=st.x, th=st.y, pr=st.z, pth=st.w;
  float S=sigmaF(r,th,a), D=deltaF(r,a);
  float s=sin(th); float s2=s*s;
  float grr=D/S, gthth=1.0/S, gtp=-2.0*a*r/(S*D), gpp=(D-a*a*s2)/(S*D*s2);
  float dr=grr*pr, dth=gthth*pth;
  dphi = gtp*(-E) + gpp*Lz;
  float h=1e-4;
  float dHdr=(hamiltonian(vec4(r+h,th,pr,pth),E,Lz,a)
             -hamiltonian(vec4(r-h,th,pr,pth),E,Lz,a))/(2.0*h);
  float dHdth=(hamiltonian(vec4(r,th+h,pr,pth),E,Lz,a)
              -hamiltonian(vec4(r,th-h,pr,pth),E,Lz,a))/(2.0*h);
  return vec4(dr, dth, -dHdr, -dHdth);
}

// --- Accretion disk emission (mirrors src/physics/disk.js profile) ---
float hash21(vec2 p){ p=fract(p*vec2(123.34,456.21)); p+=dot(p,p+45.32); return fract(p.x*p.y); }
float vnoise(vec2 p){
  vec2 i=floor(p), f=fract(p);
  float a=hash21(i), b=hash21(i+vec2(1,0)), c=hash21(i+vec2(0,1)), d=hash21(i+vec2(1,1));
  vec2 u=f*f*(3.0-2.0*f);
  return mix(mix(a,b,u.x), mix(c,d,u.x), u.y);
}
float fbm(vec2 p){
  float s=0.0, amp=0.5;
  for(int i=0;i<4;i++){ s+=amp*vnoise(p); p*=2.0; amp*=0.5; }
  return s;
}
// Blackbody-style ramp: T in [0,1], 1 = hottest (inner edge).
vec3 temperatureColor(float T){
  vec3 hot  = vec3(0.85, 0.92, 1.0);  // blue-white
  vec3 mid  = vec3(1.0,  0.6,  0.2);  // orange
  vec3 cool = vec3(0.55, 0.05, 0.0);  // deep red
  return T > 0.5 ? mix(mid, hot, (T-0.5)*2.0) : mix(cool, mid, T*2.0);
}
vec3 diskEmission(float r, float phi){
  float Tp = pow(uDiskInner / r, 0.75);                 // profile, 1 at inner edge
  float edge = smoothstep(uDiskInner, uDiskInner*1.08, r)
             * (1.0 - smoothstep(uDiskOuter*0.92, uDiskOuter, r));
  float phase = uDiskAnimate ? uDiskSpeed * uTime * pow(r, -1.5) : 0.0; // Keplerian swirl
  float n = fbm(vec2(r*0.6, (phi + phase)*1.5));
  float bright = Tp * edge * mix(0.45, 1.0, n) * uDiskBrightness;
  return temperatureColor(clamp(Tp, 0.0, 1.0)) * bright;
}

void main() {
  vec2 uv = (gl_FragCoord.xy / uResolution) * 2.0 - 1.0;
  uv.x *= uResolution.x / uResolution.y;
  float a = uSpin;

  float r0 = uCamPos.x, th0 = uCamPos.y, ph0 = uCamPos.z;

  // local-frame view ray: z toward hole (-er), x=ephi(right), y=eth(up)
  float t = tan(uFov*0.5);
  vec3 local = normalize(vec3(uv.x*t, uv.y*t, -1.0));
  // tetrad components: along er = local.z (ingoing for central pixel), along eth = local.y, along ephi = local.x
  float nr = local.z, nth = local.y, nph = local.x;

  // contravariant photon 4-momentum p^mu = e0 + nr*er + nth*eth + nph*ephi
  vec4 pUp = uE0 + nr*uER + nth*uETH + nph*uEPHI;

  // lower indices with covariant metric to get p_mu (need covariant g)
  float S=sigmaF(r0,th0,a), D=deltaF(r0,a), A=bigAF(r0,th0,a);
  float s=sin(th0); float s2=s*s;
  float gtt=-(1.0-2.0*r0/S), gtp=-2.0*a*r0*s2/S, grr=S/D, gthth=S, gpp=A*s2/S;
  float pt = gtt*pUp.x + gtp*pUp.w;
  float pph= gtp*pUp.x + gpp*pUp.w;
  float pr = grr*pUp.y;
  float pth= gthth*pUp.z;

  float E = -pt;
  float Lz = pph;

  // integrate backward
  vec4 st = vec4(r0, th0, pr, pth);
  float phi = ph0;
  float rH = horizonOuter(a) + 1e-2;
  bool captured = false;
  for (int i=0; i<2048; i++) {
    if (i >= uMaxSteps) break;
    float thPrev = st.y, rPrev = st.x, phiPrev = phi; // pre-step state for disk crossing
    float dphi;
    vec4 k1 = rhs(st, E, Lz, a, dphi); float dp1=dphi;
    // Distance-proportional step, additionally capped so |dtheta| and |dphi| per
    // step stay small. This resolves the latitudinal turning point of near-axial
    // (small L_z) rays instead of overshooting it into the pole -> removes the
    // bead artifact along the spin axis. Reuses k1, so no extra rhs cost.
    float dl = clamp(uStepSize * (st.x - rH), 0.005, 50.0);
    dl = min(dl, 0.05 / max(max(abs(k1.y), abs(dp1)), 1e-9));
    vec4 k2 = rhs(st+0.5*dl*k1, E, Lz, a, dphi); float dp2=dphi;
    vec4 k3 = rhs(st+0.5*dl*k2, E, Lz, a, dphi); float dp3=dphi;
    vec4 k4 = rhs(st+dl*k3, E, Lz, a, dphi); float dp4=dphi;
    st  += (dl/6.0)*(k1+2.0*k2+2.0*k3+k4);
    phi += (dl/6.0)*(dp1+2.0*dp2+2.0*dp3+dp4);

    // Pass through the spin-axis pole instead of pinning theta there (mirrors
    // reflectPole in src/physics/kerr.js). Axial L_z=0 rays legitimately cross
    // the pole; clamping pinned them and produced a seam along the spin axis.
    // st.w = ptheta.
    if (st.y < 0.0)     { st.y = -st.y;         phi += PI; st.w = -st.w; }
    else if (st.y > PI) { st.y = 2.0*PI - st.y; phi += PI; st.w = -st.w; }
    st.y = clamp(st.y, 1e-4, PI - 1e-4); // last-resort guard against a degenerate step

    // Accretion disk: opaque first crossing of the equatorial plane within [in,out].
    if (uDiskEnabled) {
      float dPrev = thPrev - PIH;
      float dCur  = st.y  - PIH;
      if (dPrev * dCur < 0.0) {                       // crossed the equator this step
        float frac = dPrev / (dPrev - dCur);
        float rHit = mix(rPrev, st.x, frac);
        if (rHit >= uDiskInner && rHit <= uDiskOuter) {
          float phiHit = mix(phiPrev, phi, frac);
          gl_FragColor = vec4(diskEmission(rHit, phiHit), 1.0);
          return;
        }
      }
    }

    if (st.x < rH) { captured = true; break; } // fell through the horizon -> shadow
    if (st.x > 300.0) break;                    // escaped to the sky
  }

  if (captured) { gl_FragColor = vec4(0.0, 0.0, 0.0, 1.0); return; } // shadow

  // Escaped (or ran out of steps while heading out): sample the sky in the ray's
  // current outward direction. BL (r,theta,phi) -> Cartesian, y = spin axis.
  float sr = sin(st.y), cr = cos(st.y);
  vec3 escapeDir = normalize(vec3(sr*cos(phi), cr, sr*sin(phi)));
  gl_FragColor = vec4(sampleBackground(escapeDir), 1.0);
}
