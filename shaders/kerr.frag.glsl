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
  int status = 2;
  vec3 escapeDir = vec3(0.0);
  for (int i=0; i<2048; i++) {
    if (i >= uMaxSteps) break;
    // adaptive-ish: shrink step near horizon
    float dl = uStepSize * clamp((st.x - rH)*0.5, 0.05, 1.0);
    float dphi;
    vec4 k1 = rhs(st, E, Lz, a, dphi); float dp1=dphi;
    vec4 k2 = rhs(st+0.5*dl*k1, E, Lz, a, dphi); float dp2=dphi;
    vec4 k3 = rhs(st+0.5*dl*k2, E, Lz, a, dphi); float dp3=dphi;
    vec4 k4 = rhs(st+dl*k3, E, Lz, a, dphi); float dp4=dphi;
    st  += (dl/6.0)*(k1+2.0*k2+2.0*k3+k4);
    phi += (dl/6.0)*(dp1+2.0*dp2+2.0*dp3+dp4);

    // keep theta off the poles so sin(theta) never hits 0 (avoids NaN on axis crossing)
    st.y = clamp(st.y, 1e-3, PI - 1e-3);

    if (st.x < rH) { status = 0; break; }       // captured
    if (st.x > 1000.0) {                          // escaped
      status = 1;
      // asymptotic direction from BL (r,theta,phi) -> Cartesian on sky
      float sr=sin(st.y), cr=cos(st.y);
      escapeDir = normalize(vec3(sr*cos(phi), cr, sr*sin(phi)));
      break;
    }
  }

  if (status == 0) { gl_FragColor = vec4(0.0,0.0,0.0,1.0); return; } // shadow
  if (status == 1) { gl_FragColor = vec4(sampleBackground(escapeDir),1.0); return; }
  // maxsteps: treat as captured-ish near hole; dark grey to spot tuning issues
  gl_FragColor = vec4(0.02,0.0,0.02,1.0);
}
