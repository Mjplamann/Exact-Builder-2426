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

// Extinction per meter per channel: absorption implied by the tint (its value is the
// transmittance over ~1 m) plus wavelength-neutral scattering from suspended matter.
vec3 uwExtinction() {
  return -log(clamp(uwWaterTint, vec3(0.03), vec3(1.0))) + vec3(uwTurbidity);
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
  vec2 uvA = sA * (1.0 / 0.19) + uwCausticDrift.xy;
  vec2 uvB = mat2(0.8, 0.6, -0.6, 0.8) * sB * (1.0 / 0.27) + uwCausticDrift.zw;
  // Focus: the pattern sharpens over the first ~8 cm, then blurs slowly (mip bias) with depth.
  float blur = clamp((depth - 0.10) * 4.5, 0.0, 2.6);
  // Chromatic dispersion: red and blue focus at slightly different points.
  vec2 disp = vec2(0.0045, 0.003) * (0.6 + depth * 4.0);
  vec3 a = vec3(
    texture(uwCausticMap, uvA + disp, blur).r,
    texture(uwCausticMap, uvA, blur).r,
    texture(uwCausticMap, uvA - disp, blur).r);
  float b = texture(uwCausticMap, uvB, blur + 0.4).b;
  vec3 c = (a + vec3(b)) * (0.5 / UW_CAUSTIC_MEAN);
  // Contrast: develops below the surface, fades as the pattern blurs deep down.
  float contrast = smoothstep(0.0, 0.07, depth) * mix(0.95, 0.45, clamp(depth / 0.6, 0.0, 1.0));
  // Vertical faces see stretched, weaker caustics; downward faces get none (no direct light anyway).
  contrast *= mix(0.35, 1.0, smoothstep(-0.1, 0.75, n.y));
  return max(vec3(0.0), vec3(1.0) + (c - 1.0) * contrast * strength);
}

// Downwelling-light attenuation with depth (spectral absorption + fixture beam spread).
vec3 uwDepthAtten(float depth) {
  depth = max(depth, 0.0);
  vec3 absorb = exp(-uwExtinction() * depth * 0.8);
  float spread = pow(0.38 / (0.38 + depth), 0.6);
  return absorb * spread;
}

// Blend a shaded color toward the water veil for the path p → front glass → camera.
vec3 uwVeil(vec3 col, vec3 p) {
  vec3 d = uwCameraPos - p;
  if (d.z <= 1e-4) return col;
  float t = clamp((uwTankHalf.z - p.z) / d.z, 0.0, 1.0);   // fraction of the segment inside the tank
  float y0 = p.y, y1 = p.y + d.y * t;
  float lo = min(y0, y1), hi = max(y0, y1);
  float wet = hi - lo < 1e-5 ? step(lo, uwVeilCeiling) : clamp((uwVeilCeiling - lo) / (hi - lo), 0.0, 1.0);
  float L = length(d) * t * wet;
  vec3 T = exp(-uwExtinction() * L);
  // In-scattered light is brighter near the lamp-lit surface than near the floor.
  float ym = 0.5 * (y0 + y1);
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
