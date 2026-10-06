/**
 * Shader patches for decor & plants. All patches go through `addShaderPatch` so they compose with
 * the shared underwater patch (order 100). Vertex deformation uses negative order.
 *
 *  - `patchPlant`: leaf bending/twisting/polyp extension in leaf space, a coherent world-space
 *    sway field driven by the filter current (GLOBALS.uCurrent), trailing along the water surface,
 *    backlit leaf translucency, coral fluorescence under blue light and a calm selection glow.
 *  - `patchSurfaceDetail`: procedural micro-relief (bump), albedo/roughness variation, mineral
 *    veins and the cholla lattice for rocks, wood and shells — no textures, no seams.
 */
import { Color, Vector3, Vector4, type Material, type WebGLProgramParametersWithUniforms } from 'three';
import { GLOBALS } from '../globals';
import { addShaderPatch } from '../materialPatch';

/** Uniforms owned by the decor module (shared objects; updated once per frame). */
export const DECOR_UNIFORMS = {
  /** Polyp extension 0 (retracted, night) .. 1 (fully open, day). */
  uPolyp: { value: 1 },
  /** Global sway multiplier (quality / reduced motion). */
  uSwayScale: { value: 1 },
  /** Selection glow color (linear). */
  uSelColor: { value: new Color(0.55, 0.78, 0.9) },
};

// ---------------------------------------------------------------------------------------------
// GLSL helpers
// ---------------------------------------------------------------------------------------------

const NOISE_GLSL = /* glsl */ `
vec3 dcHash33(vec3 p) {
  p = fract(p * vec3(0.1031, 0.1030, 0.0973));
  p += dot(p, p.yxz + 33.33);
  return -1.0 + 2.0 * fract((p.xxy + p.yxx) * p.zyx);
}
float dcNoise(vec3 p) {
  vec3 i = floor(p);
  vec3 f = fract(p);
  vec3 u = f * f * (3.0 - 2.0 * f);
  float n000 = dot(dcHash33(i), f);
  float n100 = dot(dcHash33(i + vec3(1.0, 0.0, 0.0)), f - vec3(1.0, 0.0, 0.0));
  float n010 = dot(dcHash33(i + vec3(0.0, 1.0, 0.0)), f - vec3(0.0, 1.0, 0.0));
  float n110 = dot(dcHash33(i + vec3(1.0, 1.0, 0.0)), f - vec3(1.0, 1.0, 0.0));
  float n001 = dot(dcHash33(i + vec3(0.0, 0.0, 1.0)), f - vec3(0.0, 0.0, 1.0));
  float n101 = dot(dcHash33(i + vec3(1.0, 0.0, 1.0)), f - vec3(1.0, 0.0, 1.0));
  float n011 = dot(dcHash33(i + vec3(0.0, 1.0, 1.0)), f - vec3(0.0, 1.0, 1.0));
  float n111 = dot(dcHash33(i + vec3(1.0, 1.0, 1.0)), f - vec3(1.0, 1.0, 1.0));
  return mix(mix(mix(n000, n100, u.x), mix(n010, n110, u.x), u.y), mix(mix(n001, n101, u.x), mix(n011, n111, u.x), u.y), u.z) * 1.6;
}
`;

/** Bump from a screen-space height derivative (same math as three's perturbNormalArb). */
const BUMP_GLSL = /* glsl */ `
vec3 dcPerturbNormal(vec3 surf_pos, vec3 surf_norm, vec2 dHdxy, float faceDir) {
  vec3 vSigmaX = normalize(dFdx(surf_pos.xyz));
  vec3 vSigmaY = normalize(dFdy(surf_pos.xyz));
  vec3 vN = surf_norm;
  vec3 R1 = cross(vSigmaY, vN);
  vec3 R2 = cross(vN, vSigmaX);
  float fDet = dot(vSigmaX, R1) * faceDir;
  vec3 vGrad = sign(fDet) * (dHdxy.x * R1 + dHdxy.y * R2);
  return normalize(abs(fDet) * surf_norm - vGrad);
}
`;

// ---------------------------------------------------------------------------------------------
// Plant patch
// ---------------------------------------------------------------------------------------------

export interface PlantPatchOptions {
  /** Instanced leaf/tentacle geometry that bends in leaf space (uses `aLeaf`). */
  bend?: boolean;
  /** Backlit translucency 0..1 (thin leaves ≈ 0.5, leathery anubias ≈ 0.12). */
  translucency?: number;
  /** Fluorescent emission color (corals) — multiplied by per-instance glow. */
  fluor?: Color;
  /** Depth/distance material variant (shadow pass): vertex part only. */
  depthOnly?: boolean;
  /** Per-material selection uniform instead of the `aSel` attribute (unique meshes). */
  selUniform?: { value: number };
}

/**
 * Patch a plant/coral material. Expects geometry attributes:
 *   aSway (vec4): base y of the plant, plant height (m, negative for hanging parts), flexibility, phase
 *   aLeaf (vec4, bend only): curvature (rad per unit length), twist (rad), glow 0..1, extension
 *     (>0: polyp retracts by this fraction at night; <0: pulses by |ext|, xenia)
 *   aSel (float, unless selUniform): selection 0..1
 */
export function patchPlant(material: Material, opts: PlantPatchOptions = {}): void {
  const bend = !!opts.bend;
  const transl = opts.translucency ?? 0;
  const fluor = opts.fluor ?? new Color(0, 0, 0);
  const selU = opts.selUniform;
  const uniforms = {
    uTime: GLOBALS.uTime,
    uCurrent: GLOBALS.uCurrent,
    uSurfaceY: GLOBALS.uSurfaceY,
    uDaylight: GLOBALS.uDaylight,
    uMoonlight: GLOBALS.uMoonlight,
    uLightColor: GLOBALS.uLightColor,
    uPolyp: DECOR_UNIFORMS.uPolyp,
    uSwayScale: DECOR_UNIFORMS.uSwayScale,
    uSelColor: DECOR_UNIFORMS.uSelColor,
    uTransl: { value: transl },
    uFluor: { value: fluor },
    uSelU: selU ?? { value: 0 },
  };
  addShaderPatch(
    material,
    'decor-plant',
    (shader: WebGLProgramParametersWithUniforms) => {
      Object.assign(shader.uniforms, uniforms);
      let vs = shader.vertexShader;
      vs = vs.replace(
        '#include <common>',
        /* glsl */ `#include <common>
attribute vec4 aSway;
${bend ? 'attribute vec4 aLeaf;' : ''}
${selU || opts.depthOnly ? '' : 'attribute float aSel;'}
uniform float uTime;
uniform vec2 uCurrent;
uniform float uSurfaceY;
uniform float uPolyp;
uniform float uSwayScale;
${selU ? 'uniform float uSelU;' : ''}
varying float vSel;
varying float vGlow;
varying float vAlong;

// Leaf-space deformation: twist around the leaf axis, then bend along a circular arc (y-z plane).
vec3 dcLeafBend(vec3 p, inout vec3 n) {
${
  bend
    ? `  float ext = aLeaf.w;
  float sy = 1.0;
  if (ext > 0.0) sy = mix(1.0 - ext, 1.0, uPolyp);
  else if (ext < 0.0) sy = 1.0 + ext * (0.5 + 0.5 * sin(uTime * 2.2 + aSway.w * 3.0));
  p.y *= sy;
  float tw = aLeaf.y * p.y;
  float ct = cos(tw), st = sin(tw);
  p.xz = mat2(ct, -st, st, ct) * p.xz;
  n.xz = mat2(ct, -st, st, ct) * n.xz;
  float k = aLeaf.x;
  if (abs(k) > 1e-3) {
    float a = k * p.y;
    float sa = sin(a), ca = cos(a);
    vec3 q = vec3(p.x, sa / k, (1.0 - ca) / k);
    q += vec3(0.0, -sa, ca) * p.z;
    n = vec3(n.x, n.y * ca - n.z * sa, n.y * sa + n.z * ca);
    p = q;
  }`
    : ''
}
  return p;
}

// Coherent sway field (world space): cantilever-like deflection with height, slow gusts that
// travel with the flow, faster leaf flutter, and trailing along the surface.
vec3 dcSway(vec3 wp, vec3 leafDir) {
  float H = aSway.y;
  float h = clamp((wp.y - aSway.x) / (abs(H) > 1e-4 ? H : 1e-4), 0.0, 1.6);
  float w = h * h * aSway.z;
  float sp = length(uCurrent);
  vec2 dir = sp > 1e-5 ? uCurrent / sp : vec2(1.0, 0.0);
  vec2 perp = vec2(-dir.y, dir.x);
  float along = dot(wp.xz, dir);
  float t = uTime;
  float gust = 0.6 + 0.4 * sin(along * 4.0 - t * 0.45 + aSway.w * 0.25) * sin(along * 1.7 - t * 0.21 + 1.3);
  float flutter = sin(t * 1.35 + aSway.w + wp.y * 8.0) * 0.6 + sin(t * 2.3 + aSway.w * 1.7 + wp.y * 15.0) * 0.4;
  float amb = sp + 0.01;
  vec2 d = dir * (sp * 2.4 * gust + amb * 0.32 * flutter) + perp * (amb * 0.4 * sin(t * 0.9 + aSway.w * 2.3 + wp.y * 5.0));
  vec3 off = vec3(d.x, 0.0, d.y) * w * abs(H) * uSwayScale;
  // Preserve length roughly: bending sideways lowers the tip.
  if (H > 0.0) off.y = -dot(off.xz, off.xz) / max(2.0 * H * max(h, 0.1), 1e-3);
  // Anything that would poke through the surface lies along it instead.
  float top = uSurfaceY - 0.004;
  float y = wp.y + off.y;
  if (y > top) {
    float ex = y - top;
    off.y -= ex;
    vec2 ld = leafDir.xz;
    float ll = length(ld);
    vec2 trail = normalize(dir * 0.9 + (ll > 1e-3 ? ld / ll : perp) * 1.4 + 1e-4);
    off.xz += trail * ex;
  }
  return off;
}
`,
      );
      vs = vs.replace(
        '#include <beginnormal_vertex>',
        /* glsl */ `#include <beginnormal_vertex>
{
  vec3 dcP = vec3(position);
  dcLeafBend(dcP, objectNormal);
}`,
      );
      vs = vs.replace(
        '#include <begin_vertex>',
        /* glsl */ `#include <begin_vertex>
{
  vec3 dcN = vec3(0.0, 0.0, 1.0);
  transformed = dcLeafBend(transformed, dcN);
  mat4 dcM = modelMatrix;
  #ifdef USE_INSTANCING
    dcM = modelMatrix * instanceMatrix;
  #endif
  vec3 dcW = (dcM * vec4(transformed, 1.0)).xyz;
  vec3 dcDir = normalize(mat3(dcM) * vec3(0.0, 1.0, 0.0));
  vec3 dcOff = dcSway(dcW, dcDir);
  transformed += inverse(mat3(dcM)) * dcOff;
  ${opts.depthOnly ? '' : selU ? 'vSel = uSelU;' : 'vSel = aSel;'}
  ${bend ? 'vGlow = aLeaf.z * smoothstep(0.25, 1.0, position.y);' : 'vGlow = 1.0;'}
  vAlong = position.y;
}`,
      );
      shader.vertexShader = vs;
      if (opts.depthOnly) return;

      let fs = shader.fragmentShader;
      fs = fs.replace(
        '#include <common>',
        /* glsl */ `#include <common>
uniform float uTransl;
uniform vec3 uFluor;
uniform float uDaylight;
uniform float uMoonlight;
uniform vec3 uLightColor;
uniform float uTime;
uniform vec3 uSelColor;
varying float vSel;
varying float vGlow;
varying float vAlong;
`,
      );
      fs = fs.replace(
        '#include <opaque_fragment>',
        /* glsl */ `{
  vec3 dcUpV = normalize((viewMatrix * vec4(0.0, 1.0, 0.0, 0.0)).xyz);
  vec3 dcV = normalize(vViewPosition);
  // Light from above passing through the leaf toward the viewer.
  float dcBack = clamp(-dot(normal, dcUpV), 0.0, 1.0) * 0.75 + 0.25 * clamp(dot(-dcV, dcUpV) * 2.0, 0.0, 1.0);
  outgoingLight += diffuseColor.rgb * (0.55 + 0.45 * diffuseColor.rgb) * uTransl * dcBack * uLightColor * (0.12 + 0.88 * uDaylight);
  // Fluorescence: excited by the blue part of the light (actinic), faint under moonlight.
  float dcActinic = clamp(uLightColor.b / max(uLightColor.r, 0.05), 0.4, 3.0);
  outgoingLight += uFluor * vGlow * dcActinic * (0.22 * uDaylight + 0.35 * uMoonlight);
  // Calm selection: soft rim that breathes slowly.
  float dcFres = pow(1.0 - abs(dot(normal, dcV)), 2.0);
  outgoingLight += uSelColor * vSel * (0.12 + 0.5 * dcFres) * (0.8 + 0.2 * sin(uTime * 1.4));
}
#include <opaque_fragment>`,
      );
      shader.fragmentShader = fs;
    },
    -10,
  );
}

// ---------------------------------------------------------------------------------------------
// Procedural surface detail (rocks, wood, shells)
// ---------------------------------------------------------------------------------------------

export interface SurfaceDetail {
  /** Base frequency (cycles per meter) of the relief. */
  freq: number;
  /** Bump height (m). */
  bump: number;
  /** 0 smooth noise .. 1 sharp ridges (weathered limestone, wrinkles). */
  ridge?: number;
  /** Pores / pits 0..1 (lava, dragon stone, coral). */
  pores?: number;
  /** Albedo variation amount. */
  albedoVar?: number;
  /** Roughness variation. */
  roughVar?: number;
  /** Anisotropic frequency multipliers (wood grain: around ≫ along). */
  aniso?: [number, number, number];
  /** Mineral veins / layering. */
  vein?: { dir: [number, number, number]; freq: number; width: number; warp: number; strength: number; color: Color; patchy?: number };
  /** Cholla lattice holes (uses uv: x around 0..1, y along in meters). */
  lattice?: { around: number; along: number; size: number };
  /** Selection uniform shared with the highlight overlay (unused when absent). */
}

/** Patch a rock/wood material with procedural relief. Geometry needs `aDetail` (vec3). */
export function patchSurfaceDetail(material: Material, d: SurfaceDetail): void {
  const vein = d.vein;
  const uniforms = {
    uDetail: { value: new Vector4(d.freq, d.bump, d.ridge ?? 0, d.pores ?? 0) },
    uDetail2: { value: new Vector4(d.albedoVar ?? 0.2, d.roughVar ?? 0.15, 0, 0) },
    uAniso: { value: new Vector3(...(d.aniso ?? [1, 1, 1])) },
    uVeinDir: { value: new Vector4(...(vein?.dir ?? [0, 1, 0]), vein?.freq ?? 0) },
    uVeinP: { value: new Vector4(vein?.width ?? 0, vein?.warp ?? 0, vein?.strength ?? 0, vein?.patchy ?? 0.5) },
    uVeinColor: { value: vein?.color ?? new Color(1, 1, 1) },
    uLattice: { value: new Vector4(d.lattice ? 1 : 0, d.lattice?.around ?? 0, d.lattice?.along ?? 0, d.lattice?.size ?? 0) },
  };
  addShaderPatch(
    material,
    'decor-surface',
    (shader) => {
      Object.assign(shader.uniforms, uniforms);
      shader.vertexShader = shader.vertexShader
        .replace(
          '#include <common>',
          `#include <common>
attribute vec3 aDetail;
varying vec3 vDetail;
varying vec2 vTubeUv;`,
        )
        .replace(
          '#include <begin_vertex>',
          `#include <begin_vertex>
vDetail = aDetail;
#ifdef DC_TUBE_UV
vTubeUv = uv;
#else
vTubeUv = vec2(0.0);
#endif`,
        );
      let fs = shader.fragmentShader;
      fs = fs.replace(
        '#include <common>',
        `#include <common>
uniform vec4 uDetail;
uniform vec4 uDetail2;
uniform vec3 uAniso;
uniform vec4 uVeinDir;
uniform vec4 uVeinP;
uniform vec3 uVeinColor;
uniform vec4 uLattice;
varying vec3 vDetail;
varying vec2 vTubeUv;
${NOISE_GLSL}
${BUMP_GLSL}
float dcH;
float dcPore;
float dcN2;
float dcFade;`,
      );
      // Height field + albedo variation (before lighting).
      fs = fs.replace(
        '#include <color_fragment>',
        `#include <color_fragment>
{
  if (uLattice.x > 0.5) {
    vec2 g = vec2(vTubeUv.x * uLattice.y, vTubeUv.y * uLattice.z);
    g.x += 0.5 * mod(floor(g.y), 2.0);
    vec2 c = fract(g) - 0.5;
    float wob = dcNoise(vec3(vTubeUv * vec2(9.0, 40.0), 1.7)) * 0.08;
    if (length(c * vec2(1.0, 0.75)) < uLattice.w + wob) discard;
  }
  vec3 P = vDetail * uAniso * uDetail.x;
  vec3 fw = fwidth(P);
  dcFade = 1.0 - smoothstep(0.35, 1.2, max(fw.x, max(fw.y, fw.z)) * 2.0);
  float n1 = dcNoise(P);
  dcN2 = dcNoise(P * 2.71 + 7.13);
  float n3 = dcNoise(P * 6.93 + 3.31) * dcFade;
  float rid = 1.0 - abs(dcNoise(P * 1.37 + 11.0));
  float h = n1 * 0.5 + dcN2 * 0.32 + n3 * 0.18;
  h = mix(h, rid * rid * 1.6 - 0.8, uDetail.z);
  dcPore = smoothstep(0.42, 0.62, dcNoise(P * 3.3 + 2.0) * 0.5 + 0.5) * uDetail.w;
  h -= dcPore * 1.2;
  dcH = h;
  diffuseColor.rgb *= clamp(1.0 + uDetail2.x * (n1 * 0.45 + n3 * 0.4) - dcPore * 0.45, 0.2, 1.6);
  if (uVeinDir.w > 0.0) {
    float s = dot(vDetail, uVeinDir.xyz) * uVeinDir.w + n1 * uVeinP.y;
    float v = 1.0 - smoothstep(uVeinP.x, uVeinP.x * 2.2 + 0.02, abs(sin(s)));
    float patchy = smoothstep(-0.1, 0.35, dcNoise(vDetail * 9.0 + 5.0) + uVeinP.w - 0.5);
    diffuseColor.rgb = mix(diffuseColor.rgb, uVeinColor, v * uVeinP.z * patchy);
  }
}`,
      );
      fs = fs.replace(
        '#include <roughnessmap_fragment>',
        `#include <roughnessmap_fragment>
roughnessFactor = clamp(roughnessFactor + uDetail2.y * dcN2 + dcPore * 0.15, 0.05, 1.0);`,
      );
      fs = fs.replace(
        '#include <normal_fragment_maps>',
        `#include <normal_fragment_maps>
{
  float H = dcH * uDetail.y * dcFade;
  vec2 dHdxy = vec2(dFdx(H), dFdy(H));
  normal = dcPerturbNormal(-vViewPosition, normal, dHdxy, faceDirection);
}`,
      );
      shader.fragmentShader = fs;
    },
    -5,
  );
}
