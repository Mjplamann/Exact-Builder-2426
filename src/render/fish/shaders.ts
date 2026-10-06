import type { WebGLProgramParametersWithUniforms } from 'three';

/**
 * GLSL for the animal shaders, injected through `addShaderPatch` (vertex deformation at a
 * negative order, before `applyUnderwater`).
 *
 * Swimming: the spine is a traveling lateral wave y(s,t) = A(s)·sin(k·s − φ), A(s) per locomotion
 * mode (Videler's envelopes), plus a C-shaped turning bend. Instead of displacing vertices
 * sideways (which stretches the body at large amplitudes), the spine's heading angle
 * ψ(s) = atan(∂y/∂s) − bend·κ·(s − s_p) is integrated from the pivot s_p (centre of mass), and
 * every cross-section is rotated by ψ — body length is preserved even in a C-start.
 *
 * Attribute layout (see geometryBuilder.ts): aSpine = (s, part, w1, w2), aFin = part data.
 * Per-instance: iAnimA = (tailPhase, tailAmp, bend, finPhase), iAnimB = (finAmp, mouth,
 * gillPhase, rest), iLook = (hue, value, saturation, juvenile), iState = (gravid, selected,
 * pale, seed).
 */

export const FISH_VERTEX_HEAD = /* glsl */ `
attribute vec4 aSpine;
attribute vec4 aFin;
attribute vec4 iAnimA;
attribute vec4 iAnimB;
attribute vec4 iLook;
attribute vec4 iState;
uniform vec4 uSwimEnv;   // c0, c1, c2, p : amplitude envelope A(s) = c0 + c1 s + c2 s^p (SL units)
uniform vec4 uSwimWave;  // k (rad/SL), sPivot, SL (local units), xSnout (local)
uniform vec4 uSwimMode;  // mode, rigidity, bendMax (rad/SL), discHalfWidth (local)
uniform vec4 uRibbon;    // sStart, sEnd, waves, amplitude (rad)
uniform vec4 uFinAnim;   // ribbon fins (1 dorsal, 2 anal, 3 both), sculling, pectoral gain, 0
uniform float uFishTime;
varying vec4 vFishLook;
varying vec4 vFishState;
varying vec4 vFishBody;

float fishEnv(float s) {
  float sc = clamp(s, 0.0, 1.0);
  float h = uSwimEnv.x + uSwimEnv.y * sc + uSwimEnv.z * pow(max(sc, 1e-4), uSwimEnv.w);
  if (s > 1.0) h += 0.6 * (uSwimEnv.y + uSwimEnv.z * uSwimEnv.w) * (s - 1.0);
  return max(h, 0.0);
}
float fishEnvD(float s) {
  if (s > 1.0) return 0.6 * (uSwimEnv.y + uSwimEnv.z * uSwimEnv.w);
  float sc = max(s, 1e-3);
  return uSwimEnv.y + uSwimEnv.z * uSwimEnv.w * pow(sc, uSwimEnv.w - 1.0);
}
// Heading angle of the spine at s.
float fishAngle(float s, float amp, float ph, float bend) {
  float a = 0.0;
  if (uSwimMode.x < 0.5) {
    float arg = uSwimWave.x * s - ph;
    a = atan((fishEnvD(s) * sin(arg) + fishEnv(s) * uSwimWave.x * cos(arg)) * amp);
  } else if (uSwimMode.x < 1.5) {
    // Ostraciiform: rigid box; peduncle + tail scull as a hinged paddle.
    a = 0.55 * amp * sin(ph) * smoothstep(0.8, 0.9, s);
  } else if (uSwimMode.x < 2.5) {
    // Rajiform: the disc is stiff laterally; only the whip tail follows a slow wave.
    float arg = 6.0 * s - ph;
    a = 0.25 * amp * smoothstep(0.55, 1.0, s) * sin(arg);
  }
  // Turning: C-shaped curvature about the pivot, stiffer toward the head.
  float d = s - uSwimWave.y;
  a -= bend * uSwimMode.z * d * (d < 0.0 ? 0.55 : 1.0);
  return a;
}
// Spine point (local x, z) at s by integrating the heading from the pivot (6 midpoint steps).
vec2 fishSpine(float s, float amp, float ph, float bend) {
  float sp = uSwimWave.y, SL = uSwimWave.z;
  float X = uSwimWave.w - sp * SL;
  float Z = 0.0;
  float ds = (s - sp) / 6.0;
  for (int i = 0; i < 6; i++) {
    float a = fishAngle(sp + (float(i) + 0.5) * ds, amp, ph, bend);
    X -= cos(a) * ds * SL;
    Z += sin(a) * ds * SL;
  }
  return vec2(X, Z);
}
vec3 fishRotY(vec3 v, float a) {
  float c = cos(a), s = sin(a);
  return vec3(c * v.x + s * v.z, v.y, -s * v.x + c * v.z);
}
vec3 fishRotAxis(vec3 v, vec3 k, float a) {
  float c = cos(a), s = sin(a);
  return v * c + cross(k, v) * s + k * dot(k, v) * (1.0 - c);
}

// Invertebrate appendages: aFin.xyz = joint pivot, aFin.w = phase offset; aSpine.z = amplitude.
void invertDeform(inout vec3 p, inout vec3 n) {
  float part = aSpine.y;
  vec3 piv = aFin.xyz;
  float off = aFin.w;
  float amp = aSpine.z;
  float ph = iAnimA.x, walk = iAnimA.y, finPh = iAnimA.w, finAmp = iAnimB.x;
  float t = uFishTime, seed = iState.w;
  vec3 d = p - piv;
  float dl = length(d);
  if (part > 20.5 && part < 21.5) {
    // Walking leg: swing about the vertical through the hip, lift during the swing phase.
    float g = ph + off;
    float sw = (0.05 + 0.4 * walk) * amp * sin(g) + 0.03 * sin(t * 0.7 + off * 3.0 + seed * 20.0);
    d = fishRotAxis(d, vec3(0.0, 1.0, 0.0), sw);
    n = fishRotAxis(n, vec3(0.0, 1.0, 0.0), sw);
    d.y += walk * amp * 0.35 * dl * max(0.0, cos(g));
    p = piv + d;
  } else if (part > 21.5 && part < 22.5) {
    // Pleopods (swimmerets) fan continuously to ventilate; harder when swimming.
    float a = (0.25 + 0.5 * finAmp) * sin(t * 9.0 + off * 1.3 + finPh) * amp;
    d = fishRotAxis(d, vec3(0.0, 0.0, 1.0), a);
    p = piv + d;
  } else if (part > 22.5 && part < 23.5) {
    // Antennae: slow lagged sweeps, bigger toward the tips.
    float w1 = sin(t * 0.9 + off * 2.0 + seed * 11.0 - dl * 8.0);
    float w2 = sin(t * 0.53 + off * 5.0 + seed * 3.0 - dl * 5.0);
    p += vec3(0.0, 0.25 * w2, 1.0 * w1) * dl * dl * 1.2 * amp;
  } else if (part > 23.5 && part < 24.5) {
    // Abdomen flex (tail flip on startle via bend).
    float a = -abs(iAnimA.z) * 0.8 * amp;
    d = fishRotAxis(d, vec3(0.0, 0.0, 1.0), a);
    n = fishRotAxis(n, vec3(0.0, 0.0, 1.0), a);
    p = piv + d;
  } else if (part > 24.5 && part < 25.5) {
    // Snail tentacles: gentle searching sway.
    p += vec3(0.0, 0.0, 1.0) * dl * 0.25 * sin(t * 0.8 + off * 2.0 + seed * 5.0) * amp;
  } else if (part > 25.5 && part < 26.5) {
    // Snail foot: pedal waves ripple along the sole.
    p.y += 0.004 * amp * sin(aSpine.x * 40.0 - ph * 2.0);
  } else if (part > 26.5 && part < 27.5) {
    // Starfish arm: very slow curl of the tip.
    float a = (0.06 * sin(t * 0.21 + off) + 0.08 * walk * sin(ph + off)) * amp * dl * 4.0;
    vec3 ax = normalize(cross(vec3(0.0, 1.0, 0.0), normalize(vec3(d.x, 0.0, d.z) + 1e-5)));
    d = fishRotAxis(d, ax, a);
    p = piv + d;
  } else if (part > 27.5 && part < 28.5) {
    // Brittle-star arm: sinuous serpentine wave along the arm.
    float a = (0.25 + 0.6 * walk) * sin(ph + off - dl * 14.0) * amp + 0.15 * sin(t * 0.5 + off * 2.0 - dl * 10.0);
    d = fishRotAxis(d, vec3(0.0, 1.0, 0.0), a * dl * 3.0);
    p = piv + d;
  } else if (part > 28.5 && part < 29.5) {
    // Urchin spines: slow independent tilting.
    vec3 ax = normalize(cross(normalize(piv + 1e-5), vec3(0.3, 1.0, 0.2)));
    float a = 0.12 * sin(t * 0.35 + off * 6.28 + seed * 9.0) * amp;
    d = fishRotAxis(d, ax, a);
    p = piv + d;
  } else if (part > 29.5 && part < 30.5) {
    // Claws: open/close with "mouth", raise a little while walking.
    float a = 0.12 * sin(t * 0.6 + off + seed * 4.0) * amp + iAnimB.y * 0.3 * amp;
    d = fishRotAxis(d, vec3(0.0, 0.0, 1.0), a);
    p = piv + d;
  } else if (part > 30.5 && part < 31.5) {
    p += vec3(0.0, 0.0, 1.0) * dl * 0.15 * sin(t * 0.4 + off + seed) * amp;
  } else if (part > 31.5 && part < 32.5) {
    // Mouthparts flick constantly (grazing).
    float a = 0.35 * sin(t * 7.0 + off * 2.0) * amp;
    d = fishRotAxis(d, vec3(0.0, 0.0, 1.0), a);
    p = piv + d;
  } else if (part > 32.5 && part < 33.5) {
    // Tail fan: spreads a little with the abdomen flex.
    float a = abs(iAnimA.z) * 0.4 * amp;
    d = fishRotAxis(d, vec3(0.0, 0.0, 1.0), -a);
    p = piv + d;
  }
}

void fishDeform(vec3 p, vec3 n, out vec3 po, out vec3 no) {
  float s = aSpine.x;
  float part = aSpine.y;
  float ph = iAnimA.x, tailAmp = iAnimA.y, bend = iAnimA.z;
  float finPh = iAnimA.w, finAmp = iAnimB.x, mouth = iAnimB.y, gillPh = iAnimB.z;
  float seed = iState.w;
  float t = uFishTime;
  float SL = uSwimWave.z;
  float mode = uSwimMode.x;
  vFishBody = vec4(s, part < 0.5 ? aFin.x : 0.0, part, 0.0);
  if (mode > 3.5) {
    invertDeform(p, n);
    po = p;
    no = n;
    return;
  }
  float amp = tailAmp * mix(uSwimMode.y, 1.0, smoothstep(0.55, 1.0, tailAmp));

  if (part > 0.5 && part < 1.5) {
    // Eyes: juveniles have proportionally bigger eyes; small independent saccades.
    vec3 c = aFin.xyz;
    vec3 d = (p - c) * (1.0 + 0.4 * iLook.w);
    float yaw = 0.14 * sin(t * 0.43 + seed * 37.0) + 0.07 * sin(t * 1.27 + seed * 11.0);
    float pitch = 0.06 * sin(t * 0.61 + seed * 23.0);
    d = fishRotY(d, yaw);
    n = fishRotY(n, yaw);
    d = fishRotAxis(d, vec3(0.0, 0.0, 1.0), pitch);
    p = c + d;
  } else if (part < 0.5) {
    // Jaw drop (breathing, bites) and gill-cover flare.
    float jaw = aSpine.z;
    p.y -= jaw * mouth * 0.06 * SL;
    p.x += max(jaw, 0.0) * mouth * 0.012 * SL;
    float flare = 0.5 + 0.5 * sin(gillPh);
    p.z += sign(p.z) * aSpine.w * (0.002 + 0.009 * flare) * SL;
    // Gravid livebearers: fuller belly.
    float g = iState.x;
    if (g > 0.0) {
      float belly = smoothstep(0.24, 0.4, s) * (1.0 - smoothstep(0.62, 0.8, s)) * smoothstep(0.1, -0.7, aFin.x);
      p += n * g * 0.07 * SL * belly;
    }
  } else {
    // Fins and barbels.
    float w = aFin.x;
    float dist = aFin.w;
    float side = floor(aFin.z / 4.0 + 0.5);
    float flow = aFin.z - side * 4.0;
    float k = uSwimWave.x;
    // Passive flutter behind the body wave, and the slow billowing of long soft fins.
    float a1 = (0.05 + 0.32 * flow) * (amp + 0.06) * sin(ph - k * s - (0.9 + 3.2 * flow) * w);
    float a2 = flow * (0.09 + 0.05 * sin(t * 0.31 + seed * 20.0)) * sin(t * (1.6 - 0.7 * flow) - 3.6 * w - s * 4.0 + seed * 6.2832);
    float ang = a1 + a2;
    bool isDorsal = part > 1.5 && part < 3.5;
    bool isAnal = part > 3.5 && part < 4.5;
    if (part > 6.5 && part < 7.5) {
      // Pectoral rowing / sculling, with a little idle motion that never stops.
      ang = uFinAnim.z * finAmp * 0.9 * sin(finPh - 1.4 * w) + 0.07 * sin(t * 2.3 + seed * 13.0) * (1.0 - 0.5 * iAnimB.w) + 0.05 * flow * sin(t * 1.1 - 2.0 * w);
    } else if (part > 5.5 && part < 6.5) {
      ang = 0.12 * finAmp * sin(finPh + 1.3) + a2 + (flow > 0.5 ? 0.25 * sin(t * 0.7 + seed * 9.0) * w : 0.0);
    } else if (part > 8.5 && part < 9.5) {
      // Barbels sway with the water and the swimming.
      ang = 0.12 * sin(t * 1.1 + s * 6.0 + seed * 5.0) + 0.2 * amp * sin(ph - 2.0);
      p += vec3(0.0, -0.3, 1.0) * dist * ang * w;
      ang = 0.0;
    }
    if (isDorsal || isAnal) {
      float rib = isDorsal ? mod(uFinAnim.x, 2.0) : step(1.5, uFinAnim.x);
      if (rib > 0.5) {
        float kr = 6.2832 * uRibbon.z / max(0.05, uRibbon.y - uRibbon.x);
        ang += uRibbon.w * (0.45 + 0.55 * max(tailAmp, 0.2)) * sin(kr * s - ph - t * 2.5) * w;
      }
      if (uFinAnim.y > 0.5) ang += 0.5 * (0.2 + tailAmp) * sin(ph) * w;
      // Resting fish fold their median fins a little.
      ang *= 1.0 - 0.3 * iAnimB.w;
    }
    if (side == 0.0) {
      p.z += dist * ang * (0.35 + 0.65 * w);
    } else {
      p += n * dist * sin(ang);
    }
  }

  if (mode > 1.5 && mode < 2.5) {
    // Rajiform: waves run back along the disc margins.
    float m = clamp(abs(p.z) / max(1e-4, uSwimMode.w), 0.0, 1.0);
    float A = 0.07 * SL * (0.3 + amp);
    p.y += A * m * m * sin(7.5 * s - ph - t * 0.0);
  }

  if (mode < 2.5) {
    float a = fishAngle(s, amp, ph, bend);
    vec2 P = fishSpine(s, amp, ph, bend);
    float dx = p.x - (uSwimWave.w - s * SL);
    float c = cos(a), sn = sin(a);
    po = vec3(P.x + c * dx + sn * p.z, p.y, P.y - sn * dx + c * p.z);
    no = vec3(c * n.x + sn * n.z, n.y, -sn * n.x + c * n.z);
  } else {
    // Seahorse: upright, no body wave; the dorsal fin shimmers (it beats at 30–70 Hz in life).
    if (part > 1.5 && part < 4.5) {
      p.z += aFin.w * 0.35 * sin(t * 37.0 - aFin.x * 5.0 - s * 40.0) * (0.4 + 0.6 * max(tailAmp, 0.3)) * aFin.x;
    }
    if (part > 6.5 && part < 7.5) p += n * aFin.w * 0.5 * sin(t * 29.0 - aFin.x * 3.0);
    // Prehensile tail curls a little tighter and looser.
    po = p;
    no = n;
  }
}
`;

/** Vertex main(): normal + position for lit materials. */
export const FISH_VERTEX_NORMAL = /* glsl */ `
  vec3 fishP; vec3 fishN;
  fishDeform(position, normal, fishP, fishN);
  vec3 objectNormal = fishN;
  #ifdef USE_TANGENT
    vec3 objectTangent = vec3( tangent.xyz );
  #endif
  vFishLook = iLook;
  vFishState = vec4(iState.x, iState.y, iState.z, iAnimB.w);
  vFishBody.w = iState.w;
`;

export const FISH_VERTEX_BEGIN = /* glsl */ `
  vec3 transformed = fishP;
  #ifdef USE_ALPHAHASH
    vPosition = vec3( position );
  #endif
`;

/** Depth/shadow materials have no normal chunk: deform the position only. */
export const FISH_VERTEX_BEGIN_DEPTH = /* glsl */ `
  vec3 fishP; vec3 fishN;
  fishDeform(position, vec3(0.0, 1.0, 0.0), fishP, fishN);
  vFishLook = iLook;
  vFishState = vec4(iState.x, iState.y, iState.z, iAnimB.w);
  vec3 transformed = fishP;
`;

export const FISH_FRAGMENT_HEAD = /* glsl */ `
uniform sampler2D uNightMap;
uniform sampler2D uOrmMap;
uniform float uNightMix;
uniform float uIridescence;
uniform vec3 uIridColor;
uniform float uGravidSpot;
uniform float uFishTime;
uniform float uTranslucency;
varying vec4 vFishLook;
varying vec4 vFishState;
varying vec4 vFishBody;
vec3 fishHue(vec3 c, float h) {
  // Rotate hue in YIQ space (cheap, keeps luminance).
  float Y = dot(c, vec3(0.299, 0.587, 0.114));
  float I = dot(c, vec3(0.596, -0.274, -0.322));
  float Q = dot(c, vec3(0.211, -0.523, 0.312));
  float cs = cos(h), sn = sin(h);
  vec2 iq = vec2(I * cs - Q * sn, I * sn + Q * cs);
  return vec3(Y + 0.956 * iq.x + 0.621 * iq.y, Y - 0.272 * iq.x - 0.647 * iq.y, Y - 1.106 * iq.x + 1.703 * iq.y);
}
`;

/** After map_fragment: night/rest coloration, individuality, stress pallor, gravid spot. */
export const FISH_FRAGMENT_COLOR = /* glsl */ `
  {
    float restK = vFishState.w;
    #ifdef USE_MAP
      if (uNightMix > 0.0 && restK > 0.0) {
        vec3 nightC = texture2D(uNightMap, vMapUv).rgb;
        diffuseColor.rgb = mix(diffuseColor.rgb, nightC, restK * uNightMix);
      }
    #endif
    vec3 c = fishHue(diffuseColor.rgb, vFishLook.x);
    #ifdef USE_MAP
      // Individuality: faint seed-dependent mottling over the body so no two fish are clones.
      if (vFishBody.z < 0.5) {
        float sd = vFishBody.w * 37.0;
        vec2 q = vMapUv * vec2(9.0, 7.0) + sd;
        float n = sin(q.x * 2.1 + sin(q.y * 1.7 + sd)) * sin(q.y * 2.6 + sin(q.x * 1.3 - sd));
        c *= 1.0 + 0.07 * n;
      }
    #endif
    float l = dot(c, vec3(0.2126, 0.7152, 0.0722));
    c = max(mix(vec3(l), c, vFishLook.z), 0.0) * vFishLook.y;
    // Resting (night) fish pale and dull as chromatophores contract.
    float rest = restK * (1.0 - 0.6 * uNightMix);
    l = dot(c, vec3(0.2126, 0.7152, 0.0722));
    c = mix(c, vec3(l) * 0.82, rest * 0.5);
    // Stress / poor health: washed-out colors.
    c = mix(c, vec3(l) * 1.02 + 0.03, clamp(vFishState.z, 0.0, 1.0) * 0.55);
    // Gravid spot of pregnant livebearers, just above the anal fin.
    if (vFishBody.z < 0.5 && vFishState.x > 0.0) {
      vec2 d = vec2((vFishBody.x - 0.6) / 0.06, (vFishBody.y + 0.42) / 0.22);
      float g = (1.0 - smoothstep(0.6, 1.0, length(d))) * vFishState.x * uGravidSpot;
      c *= 1.0 - 0.75 * g;
    }
    diffuseColor.rgb = c;
  }
`;

/** Before emissivemap_fragment: angle-dependent structural color (iridescence). */
export const FISH_FRAGMENT_IRID = /* glsl */ `
  #ifdef USE_MAP
  {
    float iri = texture2D(uOrmMap, vMapUv).r * uIridescence * (1.0 - 0.7 * vFishState.w);
    if (iri > 0.002) {
      vec3 V = normalize(vViewPosition);
      float ndv = clamp(abs(dot(normal, V)), 0.0, 1.0);
      float g = pow(1.0 - ndv, 1.4);
      // Guanine platelets: the reflected color swings toward the sheen color off-axis.
      vec3 sheen = uIridColor * (0.55 + 0.45 * ndv);
      diffuseColor.rgb = mix(diffuseColor.rgb, sheen, iri * (0.3 + 0.55 * g));
      metalnessFactor = mix(metalnessFactor, 0.9, iri * 0.55);
      roughnessFactor = mix(roughnessFactor, 0.18, iri * 0.5);
    }
  }
  #endif
`;

/**
 * Before emissivemap_fragment: light under water arrives from above, so undersides sit in the
 * animal's own shadow (cheap directional occlusion on top of the scene lighting).
 */
export const FISH_FRAGMENT_TOPLIGHT = /* glsl */ `
  {
    vec3 fishWN = inverseTransformDirection(normal, viewMatrix);
    diffuseColor.rgb *= 0.68 + 0.32 * smoothstep(-0.85, 0.55, fishWN.y);
  }
`;

/** After emissivemap_fragment: soft rim glow for the selected animal. */
export const FISH_FRAGMENT_RIM = /* glsl */ `
  {
    float sel = vFishState.y;
    if (sel > 0.001) {
      vec3 V = normalize(vViewPosition);
      float fres = pow(1.0 - clamp(abs(dot(normal, V)), 0.0, 1.0), 2.2);
      totalEmissiveRadiance += vec3(0.5, 0.78, 1.0) * fres * sel * (0.5 + 0.18 * sin(uFishTime * 1.4));
    }
  }
`;

/** Insert `code` after the first occurrence of `anchor` (no-op if missing). */
export function injectAfter(src: string, anchor: string, code: string): string {
  const i = src.indexOf(anchor);
  if (i < 0) return src;
  return src.slice(0, i + anchor.length) + '\n' + code + src.slice(i + anchor.length);
}

export function injectBefore(src: string, anchor: string, code: string): string {
  const i = src.indexOf(anchor);
  if (i < 0) return src;
  return src.slice(0, i) + code + '\n' + src.slice(i);
}

/** Vertex patch for lit materials (normal + position). */
export function patchFishVertex(shader: WebGLProgramParametersWithUniforms, depthOnly: boolean): void {
  let vs = shader.vertexShader;
  vs = vs.replace('void main() {', `${FISH_VERTEX_HEAD}\nvoid main() {`);
  if (depthOnly || !vs.includes('#include <beginnormal_vertex>')) {
    vs = vs.replace('#include <begin_vertex>', FISH_VERTEX_BEGIN_DEPTH);
  } else {
    vs = vs.replace('#include <beginnormal_vertex>', FISH_VERTEX_NORMAL);
    vs = vs.replace('#include <begin_vertex>', FISH_VERTEX_BEGIN);
  }
  shader.vertexShader = vs;
}

/** Fragment patch for lit materials. */
export function patchFishFragment(shader: WebGLProgramParametersWithUniforms, withIrid: boolean): void {
  let fs = shader.fragmentShader;
  fs = fs.replace('void main() {', `${FISH_FRAGMENT_HEAD}\nvoid main() {`);
  fs = injectAfter(fs, '#include <map_fragment>', FISH_FRAGMENT_COLOR);
  if (withIrid) fs = injectBefore(fs, '#include <emissivemap_fragment>', FISH_FRAGMENT_IRID);
  fs = injectBefore(fs, '#include <emissivemap_fragment>', FISH_FRAGMENT_TOPLIGHT);
  fs = injectAfter(fs, '#include <emissivemap_fragment>', FISH_FRAGMENT_RIM);
  shader.fragmentShader = fs;
}
