import { GLOBALS } from '../globals';

/**
 * Shared GLSL for everything that lives "in the water": the uniform block bound to GLOBALS,
 * caustic projection, depth light falloff and view-path absorption/in-scattering.
 *
 * All identifiers are prefixed `uw` so this code can be injected into materials that other
 * modules also patch (their own `uTime` etc. declarations never collide with ours).
 */

/** Mean value of the caustic texture channels (the procedural pattern's spatial mean / storage scale). */
export const CAUSTIC_MEAN = 0.16;

/** Uniform objects to merge into a material's uniforms (ShaderMaterial) or `shader.uniforms` (onBeforeCompile). */
export function uwUniforms(): Record<string, { value: unknown }> {
  return {
    uwTime: GLOBALS.uTime,
    uwDaylight: GLOBALS.uDaylight,
    uwMoonlight: GLOBALS.uMoonlight,
    uwLightColor: GLOBALS.uLightColor,
    uwWaterTint: GLOBALS.uWaterTint,
    uwTurbidity: GLOBALS.uTurbidity,
    uwSurfaceY: GLOBALS.uSurfaceY,
    uwTankHalf: GLOBALS.uTankHalf,
    uwCausticStrength: GLOBALS.uCausticStrength,
    uwCurrent: GLOBALS.uCurrent,
    uwCameraPos: GLOBALS.uCameraPos,
    uwLightDir: GLOBALS.uLightDir,
    uwVeilColor: GLOBALS.uVeilColor,
    uwVeilCeiling: GLOBALS.uVeilCeiling,
    uwCausticMap: GLOBALS.uCausticMap,
    uwCausticDrift: GLOBALS.uCausticDrift,
    uwUnderwater: GLOBALS.uUnderwater,
  };
}

export const UW_UNIFORMS_GLSL = /* glsl */ `
uniform float uwTime;
uniform float uwDaylight;
uniform float uwMoonlight;
uniform vec3 uwLightColor;
uniform vec3 uwWaterTint;
uniform float uwTurbidity;
uniform float uwSurfaceY;
uniform vec3 uwTankHalf;
uniform float uwCausticStrength;
uniform vec2 uwCurrent;
uniform vec3 uwCameraPos;
uniform vec3 uwLightDir;
uniform vec3 uwVeilColor;
uniform float uwVeilCeiling;
uniform sampler2D uwCausticMap;
uniform vec4 uwCausticDrift;
uniform float uwUnderwater;
`;

/**
 * Functions. Physical model (all distances in meters):
 *  - Light enters through the rippled surface; the ripples focus it into caustics whose pattern
 *    is fetched where the light ray through the fragment crossed the surface (two LED "sources"
 *    → two layers). Caustics come into focus a few cm below the surface and blur with depth.
 *  - Downwelling light falls off with depth: spectral absorption (red first) plus the spreading
 *    of a fixture that hangs ~30 cm above the water.
 *  - Along the view ray, water between the fragment and the front glass absorbs (Beer–Lambert,
 *    per channel) and scatters light toward the viewer (single-scattering in-scatter).
 */
export const UW_FUNCTIONS_GLSL = /* glsl */ `
#ifndef UW_FUNCTIONS
#define UW_FUNCTIONS

#define UW_CAUSTIC_MEAN ${CAUSTIC_MEAN.toFixed(4)}
// Biased lookups exist only in fragment shaders; vertex users #define UW_VERTEX first.
#ifdef UW_VERTEX
#define UW_TEXB(s, uv, b) textureLod(s, uv, b)
#else
#define UW_TEXB(s, uv, b) texture(s, uv, b)
#endif

// Extinction per meter per channel: absorption implied by the tint (its value is the
// transmittance over ~1 m) plus wavelength-neutral scattering from suspended matter (with a
// small floor: even polished tank water scatters, which is what softly veils the back wall).
vec3 uwExtinction() {
  return -log(clamp(uwWaterTint, vec3(0.03), vec3(1.0))) + vec3(uwTurbidity + 0.05);
}

// Where the light that reaches p crossed the water surface, following direction L (toward the light).
vec2 uwSurfaceEntry(vec3 p, vec3 L) {
  return p.xz + L.xz * ((uwSurfaceY - p.y) / max(L.y, 0.25));
}

// Second LED of the fixture: mirrored a little across the tank so the two caustic layers
// (and light shafts) cross at a slight angle, like a real multi-emitter bar.
vec3 uwLightDir2() {
  return normalize(vec3(-0.7 * uwLightDir.x - 0.10, uwLightDir.y, 0.6 * uwLightDir.z + 0.05));
}

// Caustic irradiance modulation (mean ≈ 1) for a point p with world-space normal n.
vec3 uwCaustics(vec3 p, vec3 n) {
  float depth = uwSurfaceY - p.y;
  float strength = uwCausticStrength * clamp(uwDaylight + 0.35 * uwMoonlight, 0.0, 1.0);
  if (depth <= 0.0 || strength <= 0.001) return vec3(1.0);
  vec2 sA = uwSurfaceEntry(p, uwLightDir);
  vec2 sB = uwSurfaceEntry(p, uwLightDir2());
  // Tile sizes (m): cells of 2–5 cm, as from filter ripples of 3–8 cm wavelength.
  vec2 uvA = sA * (1.0 / 0.13) + uwCausticDrift.xy;
  vec2 uvB = mat2(0.8, 0.6, -0.6, 0.8) * sB * (1.0 / 0.17) + uwCausticDrift.zw;
  // Focus: the pattern sharpens over the first ~8 cm, then blurs slowly (mip bias) with depth.
  float blur = clamp((depth - 0.18) * 2.2, 0.0, 1.4);
  // Chromatic dispersion: red and blue focus at slightly different points.
  vec2 disp = vec2(0.0045, 0.003) * (0.6 + depth * 4.0);
  vec3 a = vec3(
    UW_TEXB(uwCausticMap, uvA + disp, blur).r,
    UW_TEXB(uwCausticMap, uvA, blur).r,
    UW_TEXB(uwCausticMap, uvA - disp, blur).r);
  float b = UW_TEXB(uwCausticMap, uvB, blur + 0.4).b;
  vec3 c = (a + vec3(b)) * (0.5 / UW_CAUSTIC_MEAN);
  // Contrast: develops below the surface, fades as the pattern blurs deep down.
  float contrast = smoothstep(0.0, 0.07, depth) * mix(1.0, 0.62, clamp(depth / 0.6, 0.0, 1.0));
  // Vertical faces see stretched, weaker caustics; downward faces get none (no direct light anyway).
  contrast *= mix(0.35, 1.0, smoothstep(-0.1, 0.75, n.y));
  return max(vec3(0.0), vec3(1.0) + (c - 1.0) * contrast * strength);
}

float uwBeamHash(vec2 p) {
  vec3 p3 = fract(vec3(p.xyx) * 0.1031);
  p3 += dot(p3, p3.yzx + 33.33);
  return fract((p3.x + p3.y) * p3.z);
}
float uwBeamNoise(vec2 p) {
  vec2 i = floor(p), f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(mix(uwBeamHash(i), uwBeamHash(i + vec2(1.0, 0.0)), u.x),
             mix(uwBeamHash(i + vec2(0.0, 1.0)), uwBeamHash(i + vec2(1.0, 1.0)), u.x), u.y);
}

// Light-beam field through p (lights up the drifting motes; the visible beams are GodRays):
// light focused by the surface ripples streams down from the fixture's two emitter groups. A lamp h above the water appears n·h above it from below,
// so each beam is a straight line from that virtual source — beams fan out and slant away from
// the emitters instead of hanging as parallel vertical curtains. Only the strongest focus spots
// make beams, in slowly drifting patches; beams widen, blur and fade with depth.
// Returns ~0 almost everywhere and up to ~1–2 inside a beam (before the light level).
float uwBeams(vec3 p) {
  float depth = uwSurfaceY - p.y;
  if (depth <= 0.0) return 0.0;
  const float HV = 0.5;                       // virtual source height above the surface (m)
  float sum = 0.0;
  for (int i = 0; i < 2; i++) {
    float sx = i == 0 ? -0.42 : 0.38;
    vec3 src = vec3(sx * uwTankHalf.x, uwSurfaceY + HV, 0.3 * uwTankHalf.z);
    vec2 e = src.xz + (p.xz - src.xz) * (HV / (HV + depth));   // where the beam crossed the surface
    vec2 uv = (i == 0 ? e : mat2(0.8, 0.6, -0.6, 0.8) * e) * (1.0 / 0.23)
            + (i == 0 ? uwCausticDrift.xy : uwCausticDrift.zw) * 0.3;
    float s = textureLod(uwCausticMap, uv, 1.7 + depth * 4.0).g / UW_CAUSTIC_MEAN;
    float focus = pow(max(s - 1.35, 0.0), 1.4);
    // Beams come and go in broad, slow patches (the ripple field is never uniform).
    float patchy = smoothstep(0.42, 0.85, uwBeamNoise(e * 3.1 + vec2(float(i) * 7.3 + uwTime * 0.023, uwTime * -0.017)));
    sum += focus * patchy;
  }
  // Develop over the first cm, fade over ~25 cm (spreading + scattering out of the beam).
  return sum * smoothstep(0.0, 0.015, depth) * exp(-depth / 0.25);
}

// Downwelling-light attenuation with depth (spectral absorption + fixture beam spread).
vec3 uwDepthAtten(float depth) {
  depth = max(depth, 0.0);
  vec3 absorb = exp(-uwExtinction() * depth * 0.8);
  float spread = pow(0.38 / (0.38 + depth), 0.6);
  return absorb * spread;
}

// Length of water (m) on the view path p → front glass → camera, and the mean height of that path.
float uwViewPath(vec3 p, out float ymid) {
  vec3 d = uwCameraPos - p;
  ymid = p.y;
  if (d.z <= 1e-4) return 0.0;
  float t = clamp((uwTankHalf.z - p.z) / d.z, 0.0, 1.0);   // fraction of the segment inside the tank
  float y0 = p.y, y1 = p.y + d.y * t;
  float lo = min(y0, y1), hi = max(y0, y1);
  float wet = hi - lo < 1e-5 ? step(lo, uwVeilCeiling) : clamp((uwVeilCeiling - lo) / (hi - lo), 0.0, 1.0);
  ymid = 0.5 * (y0 + y1);
  return length(d) * t * wet;
}

// Fraction of light from p that reaches the viewer (for additive effects: shafts, glints).
vec3 uwTransmittance(vec3 p) {
  float ym;
  return exp(-uwExtinction() * uwViewPath(p, ym));
}

// Blend a shaded color toward the water veil for the path p → front glass → camera.
vec3 uwVeil(vec3 col, vec3 p) {
  float ym;
  float L = uwViewPath(p, ym);
  vec3 T = exp(-uwExtinction() * L);
  // In-scattered light is brighter near the lamp-lit surface than near the floor.
  float bright = mix(0.6, 1.15, clamp(ym / max(uwSurfaceY, 0.05), 0.0, 1.0));
  return col * T + uwVeilColor * bright * (1.0 - T);
}
#endif
`;

/** Uniforms + functions, ready to prepend to a fragment shader. */
export const UW_PARS_GLSL = UW_UNIFORMS_GLSL + UW_FUNCTIONS_GLSL;

/** Small hash/noise helpers shared by env shaders. */
export const NOISE_GLSL = /* glsl */ `
#ifndef UW_NOISE
#define UW_NOISE
float uwHash12(vec2 p) {
  vec3 p3 = fract(vec3(p.xyx) * 0.1031);
  p3 += dot(p3, p3.yzx + 33.33);
  return fract((p3.x + p3.y) * p3.z);
}
float uwNoise(vec2 p) {
  vec2 i = floor(p), f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(mix(uwHash12(i), uwHash12(i + vec2(1.0, 0.0)), u.x),
             mix(uwHash12(i + vec2(0.0, 1.0)), uwHash12(i + vec2(1.0, 1.0)), u.x), u.y);
}
float uwFbm(vec2 p) {
  float v = 0.0, a = 0.5;
  for (int i = 0; i < 5; i++) { v += a * uwNoise(p); p = mat2(1.6, 1.2, -1.2, 1.6) * p; a *= 0.5; }
  return v;
}
#endif
`;

/**
 * Soft shadows for the key light (replaces three's hard BasicShadowMap lookup in every material
 * patched by `applyUnderwater`). Percentage-closer soft shadows with a physical model of the
 * fixture and the water:
 *  - the LED bar is long along x and narrow along z, ~30 cm above the water, so the penumbra
 *    grows with the occluder→receiver distance, several times faster along the bar than across;
 *  - water scatters light into the shadow (fill from the unshadowed water column), so a shadow's
 *    density falls off with the occluder's distance — a fish near the sand casts a soft, light
 *    shadow; one 30 cm up barely shades it;
 *  - receiver-plane depth bias keeps the large kernels from self-shadowing sloped surfaces.
 * Requires renderer.shadowMap.type = BasicShadowMap (raw depth texture, sampler2D).
 */
export const UW_SHADOW_PARS_GLSL = /* glsl */ `
#if defined( USE_SHADOWMAP ) && defined( SHADOWMAP_TYPE_BASIC ) && NUM_DIR_LIGHT_SHADOWS > 0
#define UW_PCSS 1
uniform vec4 uwShadowFrame; // frustum width (m), height (m), depth range (m), blocker search distance (m)
uniform vec4 uwShadowSoft;  // penumbra per m of occluder distance along map x, along map y; min penumbra (m); scatter fill distance (m)
uniform vec2 uwShadowTaps;  // blocker-search taps, filter taps (quality; ≤ 16 each)
vec2 uwShadowGrad;          // receiver-plane depth gradient d(depth)/d(uv) of the key-light shadow coord

vec2 uwReceiverPlane(vec4 sc) {
  vec3 p = sc.xyz / sc.w;
  vec3 dx = dFdx(p), dy = dFdy(p);
  float det = dx.x * dy.y - dx.y * dy.x;
  if (abs(det) < 1e-12) return vec2(0.0);
  vec2 g = vec2(dy.y * dx.z - dx.y * dy.z, dx.x * dy.z - dy.x * dx.z) / det;
  // Silhouettes and grazing angles produce huge gradients: cap at ~70° slope.
  float cap = 2.7 * uwShadowFrame.x / uwShadowFrame.z;
  float l = length(g);
  return l > cap ? g * (cap / l) : g;
}

float uwIGN(vec2 p) {
  return fract(52.9829189 * fract(dot(p, vec2(0.06711056, 0.00583715))));
}
vec2 uwVogel(int i, int n, float phi) {
  float r = sqrt((float(i) + 0.5) / float(n));
  float th = float(i) * 2.399963229728653 + phi;
  return vec2(cos(th), sin(th)) * r;
}

float uwShadowPCSS(sampler2D shadowMap, vec2 shadowMapSize, float shadowIntensity, float shadowBias, float shadowRadius, vec4 shadowCoord) {
  shadowCoord.xyz /= shadowCoord.w;
  shadowCoord.z += shadowBias;
  if (shadowCoord.x < 0.0 || shadowCoord.x > 1.0 || shadowCoord.y < 0.0 || shadowCoord.y > 1.0 || shadowCoord.z > 1.0) return 1.0;
  float zr = shadowCoord.z;
  vec2 uv = shadowCoord.xy;
  vec2 g = uwShadowGrad;
  vec2 texel = 1.0 / shadowMapSize;
  vec2 m2uv = 1.0 / uwShadowFrame.xy;
  float eps = 1.5 * texel.x * length(g) + 0.002 / uwShadowFrame.z;   // ~2 mm + one texel of slope
  float phi = uwIGN(gl_FragCoord.xy) * 6.2831853;

  // 1) Blocker search over the largest penumbra worth considering (+ the centre texel).
  vec2 sr = uwShadowSoft.xy * uwShadowFrame.w * m2uv + 2.0 * texel;
  float zb = 0.0, nb = 0.0;
  {
    float d = texture2D(shadowMap, uv).r;
    if (d < zr - eps) { zb += d; nb += 1.0; }
  }
  int nb0 = int(uwShadowTaps.x), nf = int(uwShadowTaps.y);
  // Tolerance grows with distance from the receiver point: the receiver plane is only a local
  // fit, and undulating sand or a curved rock must not shadow itself (~12% slope deviation).
  float tol = 0.12 * uwShadowFrame.x / uwShadowFrame.z;
  for (int i = 0; i < 16; i++) {
    if (i >= nb0) break;
    vec2 o = uwVogel(i, nb0, phi) * sr;
    float d = texture2D(shadowMap, uv + o).r;
    if (d < zr + dot(g, o) - eps - tol * length(o * vec2(1.0, uwShadowFrame.y / uwShadowFrame.x))) { zb += d; nb += 1.0; }
  }
  if (nb < 0.5) return 1.0;
  zb /= nb;
  float dist = max(zr - zb, 0.0) * uwShadowFrame.z;           // occluder → receiver (m)

  // 2) Filter with the penumbra of that distance (anisotropic: wider along the bar).
  vec2 pen = max(uwShadowSoft.xy * dist, vec2(uwShadowSoft.z)) * m2uv + 1.25 * texel;
  float lit = 0.0;
  for (int i = 0; i < 16; i++) {
    if (i >= nf) break;
    vec2 o = uwVogel(i, nf, phi + 1.7) * pen;
    lit += step(zr + dot(g, o) - eps - tol * length(o * vec2(1.0, uwShadowFrame.y / uwShadowFrame.x)), texture2D(shadowMap, uv + o).r);
  }
  lit /= float(nf);
  // 3) In-scattered light fills shadows of distant occluders.
  float density = shadowIntensity * exp(-dist / uwShadowSoft.w);
  return mix(1.0, lit, density);
}
#define getShadow uwShadowPCSS
#endif
`;

/** Main-body prologue that evaluates derivative-based data in uniform control flow. */
export const UW_SHADOW_MAIN_GLSL = /* glsl */ `
#ifdef UW_PCSS
  uwShadowGrad = uwReceiverPlane(vDirectionalShadowCoord[0]);
#endif
`;

