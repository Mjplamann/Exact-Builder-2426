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
  /** 0 whole-tank view … 1 close-up (zoomed past ~1.5× or following): gates close-up-only detail. */
  uCloseUp: { value: 0 },
};

/** How much of a close-up the view is: following, or zoomed in past ~1.15–1.6×. */
export function closeUpAmount(zoom: number, following: boolean): number {
  if (following) return 1;
  const t = Math.min(1, Math.max(0, (zoom - 1.15) / 0.45));
  return t * t * (3 - 2 * t);
}

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
  /** Unique meshes: per-vertex fluorescence weight from an `aGlow` attribute. */
  glowAttr?: boolean;
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
    uLightDir: GLOBALS.uLightDir,
    uPolyp: DECOR_UNIFORMS.uPolyp,
    uSwayScale: DECOR_UNIFORMS.uSwayScale,
    uSelColor: DECOR_UNIFORMS.uSelColor,
    uTransl: { value: transl },
    uFluor: { value: fluor },
    uSelU: selU ?? { value: 0 },
  };
  // The patch key must encode every code variant: three caches programs by this key.
  const variant = `${bend ? 'b' : ''}${opts.depthOnly ? 'd' : ''}${selU ? 'u' : ''}${opts.glowAttr ? 'g' : ''}`;
  addShaderPatch(
    material,
    `decor-plant-${variant}`,
    (shader: WebGLProgramParametersWithUniforms) => {
      Object.assign(shader.uniforms, uniforms);
      let vs = shader.vertexShader;
      vs = vs.replace(
        '#include <common>',
        /* glsl */ `#include <common>
attribute vec4 aSway;
${bend ? 'attribute vec4 aLeaf;\nattribute float aWidth;' : ''}
${selU || opts.depthOnly ? '' : 'attribute float aSel;'}
${opts.glowAttr ? 'attribute float aGlow;' : ''}
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
    ? `  // Leaf matrices scale uniformly by length; the width ratio is applied here so twisting
  // and bending stay proportional.
  p.x *= aWidth;
  float ext = aLeaf.w;
  float sy = 1.0;
  float kMul = 1.0;
  if (ext > 0.0) sy = mix(1.0 - ext, 1.0, uPolyp);
  else if (ext < 0.0) {
    // Pulsing polyps (xenia): arms fold inward and reopen roughly every 1.5–3 s.
    float pulse = pow(0.5 + 0.5 * sin(uTime * 2.4 + aSway.w * 5.0), 3.0);
    sy = 1.0 + ext * 0.35 * pulse;
    kMul = 1.0 - 2.4 * pulse * (-ext);
  }
  p.y *= sy;
  float tw = aLeaf.y * p.y;
  float ct = cos(tw), st = sin(tw);
  p.xz = mat2(ct, -st, st, ct) * p.xz;
  n.xz = mat2(ct, -st, st, ct) * n.xz;
  float k = aLeaf.x * kMul;
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
  // World offset back to object space. Plant matrices have orthogonal columns (rotation × scale),
  // so the inverse is the transpose with each row divided by its squared scale — far cheaper
  // per vertex than a general inverse().
  mat3 dcR = mat3(dcM);
  transformed += vec3(
    dot(dcR[0], dcOff) / max(dot(dcR[0], dcR[0]), 1e-12),
    dot(dcR[1], dcOff) / max(dot(dcR[1], dcR[1]), 1e-12),
    dot(dcR[2], dcOff) / max(dot(dcR[2], dcR[2]), 1e-12));
  ${opts.depthOnly ? '' : selU ? 'vSel = uSelU;' : 'vSel = aSel;'}
  ${bend ? 'vGlow = aLeaf.z * smoothstep(0.25, 1.0, position.y);' : opts.glowAttr ? 'vGlow = aGlow;' : 'vGlow = 1.0;'}
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
uniform vec3 uLightDir;
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
  vec3 dcV = normalize(vViewPosition);
  // Thin-leaf transmission: when we see the unlit side of a leaf, the key light shines through it
  // (∝ |N·L|, irradiance ≈ 5·daylight / π), plus light scattered inside the blade. Transmitted
  // light is deeper and more saturated than reflected light.
  vec3 dcL = normalize((viewMatrix * vec4(uLightDir, 0.0)).xyz);
  float dcNL = dot(normal, dcL);
  vec3 dcTr = diffuseColor.rgb * (0.45 + 0.55 * diffuseColor.rgb / max(max(diffuseColor.r, diffuseColor.g), max(diffuseColor.b, 0.05)));
  outgoingLight += dcTr * uTransl * (1.6 * uDaylight + 0.15 * uMoonlight) * uLightColor * (max(-dcNL, 0.0) + 0.25);
  // Fluorescence: excited by the blue part of the light (actinic), faint under moonlight.
  float dcActinic = clamp(uLightColor.b / max(uLightColor.r, 0.05), 0.4, 3.0);
  outgoingLight += uFluor * vGlow * dcActinic * (0.22 * uDaylight + 0.12 * uMoonlight);
  // Calm selection: soft rim that breathes slowly.
  float dcFres = pow(1.0 - abs(dot(normal, dcV)), 2.0);
  outgoingLight += uSelColor * vSel * (0.04 + 0.28 * dcFres) * (0.8 + 0.2 * sin(uTime * 1.4));
}
#include <opaque_fragment>`,
      );
      shader.fragmentShader = fs;
    },
    -10,
  );
}

// ---------------------------------------------------------------------------------------------
// Leaf micro-detail (close-ups only)
// ---------------------------------------------------------------------------------------------

export interface LeafMicro {
  /** 'parallel': longitudinal veins with ladder-like cross septa (Vallisneria, grasses, crinum);
   *  'net': the areole network of the finest veins (swords, crypts, anubias, ferns, stem leaves). */
  kind: 'parallel' | 'net';
  /** 0..1 contrast of the veins / cells. */
  strength: number;
  /** Areole size (net) or the largest vein spacing (parallel), m. */
  size: number;
  /** Veins raised (+1, thin soft leaves) or sunk into the blade (−1, leathery anubias / java fern). */
  relief?: number;
}

/**
 * Magnification-only leaf detail. Leaf textures are 16–128 px across, so at 4–8× zoom a texel
 * spans several pixels and the blade turns into soft mush. This adds what a macro lens shows —
 * the finest vein network (areoles ≈ 1 mm) or the parallel veins and cross septa of strap
 * leaves, a little cell grain — in the leaf's own physical units, faded in by the pixel
 * footprint (fwidth) so nothing changes until a feature spans several pixels, and only in
 * close-ups (DECOR_UNIFORMS.uCloseUp): the whole-tank view never takes the branch — no cost and
 * an identical image there, on any display.
 * Needs the bend variant of `patchPlant` (instanced leaf strips with `aWidth`).
 */
export function patchLeafMicro(material: Material, m: LeafMicro): void {
  const uniforms = {
    uLeafMicro: { value: new Vector4(m.kind === 'parallel' ? 1 : 2, m.strength, m.size, m.relief ?? 1) },
    uCloseUp: DECOR_UNIFORMS.uCloseUp,
  };
  addShaderPatch(
    material,
    'decor-leaf-micro',
    (shader: WebGLProgramParametersWithUniforms) => {
      Object.assign(shader.uniforms, uniforms);
      shader.vertexShader = shader.vertexShader
        .replace('#include <common>', '#include <common>\nvarying vec2 vLeafDim;')
        .replace(
          '#include <begin_vertex>',
          /* glsl */ `#include <begin_vertex>
{
  // Leaf strips span x ∈ [−½, ½]·aWidth, y ∈ [0, 1] before the (uniform) length scale.
  mat4 lmM = modelMatrix;
  #ifdef USE_INSTANCING
    lmM = modelMatrix * instanceMatrix;
  #endif
  vLeafDim = vec2(length(lmM[0].xyz) * aWidth, length(lmM[1].xyz));
}`,
        );
      let fs = shader.fragmentShader;
      fs = fs.replace(
        '#include <common>',
        /* glsl */ `#include <common>
uniform vec4 uLeafMicro; // kind (1 parallel, 2 net), strength, size (m), relief sign
uniform float uCloseUp;
varying vec2 vLeafDim;
float lmH = 0.0;
float lmHash(vec2 p) {
  vec3 p3 = fract(vec3(p.xyx) * 0.1031);
  p3 += dot(p3, p3.yzx + 33.33);
  return fract((p3.x + p3.y) * p3.z);
}
vec2 lmHash2(vec2 p) {
  vec3 p3 = fract(vec3(p.xyx) * vec3(0.1031, 0.1030, 0.0973));
  p3 += dot(p3, p3.yzx + 33.33);
  return fract((p3.xx + p3.yz) * p3.zy);
}
float lmValue(vec2 p) {
  vec2 i = floor(p), f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(mix(lmHash(i), lmHash(i + vec2(1.0, 0.0)), u.x), mix(lmHash(i + vec2(0.0, 1.0)), lmHash(i + vec2(1.0, 1.0)), u.x), u.y);
}`,
      );
      fs = fs.replace(
        '#include <map_fragment>',
        /* glsl */ `#include <map_fragment>
#ifdef USE_MAP
{
  vec2 lmP = vMapUv * vLeafDim;           // position on the blade (m): across, along
  vec2 lmFw = max(fwidth(lmP), vec2(1e-7)); // pixel footprint (m)
  float lmPx = max(lmFw.x, lmFw.y);
  float lmS = uLeafMicro.z;
  // Fade in once the coarsest micro feature spans ≥ 3 px (fully at 7 px).
  // (Close-ups only: on a high-DPI screen the whole-tank view resolves front leaves almost as
  // finely, and it must look — and cost — exactly as before.)
  float lmFade = smoothstep(3.0, 7.0, lmS / lmPx) * uLeafMicro.y * uCloseUp;
  if (lmFade > 0.002) {
    float vein = 0.0, cellShade = 0.0;
    if (uLeafMicro.x < 1.5) {
      // Parallel veins (spacing scales with the blade width, ≥ 0.45 mm) with a finer vein midway,
      // and cross septa at staggered heights in every channel: the ladder of a strap leaf.
      float sv = clamp(vLeafDim.x / 7.0, 4.5e-4, lmS);
      float xu = lmP.x / sv;
      float d = abs(fract(xu + 0.5) - 0.5) * sv;
      float dm = abs(fract(xu) - 0.5) * sv; // to the finer vein midway between two main ones
      vein = 1.0 - smoothstep(0.05 * sv, 0.05 * sv + 1.5 * lmFw.x, d);
      vein += 0.45 * (1.0 - smoothstep(0.025 * sv, 0.025 * sv + 1.5 * lmFw.x, dm)) * smoothstep(3.0, 7.0, 0.5 * sv / lmFw.x);
      float ch = floor(xu * 2.0);
      float sc = sv * (1.6 + 1.2 * lmHash(vec2(ch, 3.1)));
      float yv = lmP.y / sc + lmHash(vec2(ch, 7.7));
      float dc = abs(fract(yv) - 0.5) * sc;
      float septum = (1.0 - smoothstep(0.03 * sv, 0.03 * sv + 1.5 * lmFw.y, 0.5 * sc - dc)) * smoothstep(3.0, 7.0, sc / lmFw.y);
      vein = max(vein, 0.55 * septum);
      // Channels between veins: elongated cells, slightly darker in the middle (air lacunae).
      cellShade = -0.5 * (1.0 - abs(fract(xu * 2.0) - 0.5) * 2.0) + 0.6 * (lmValue(lmP * vec2(1.0 / (0.12 * sv), 1.0 / (0.6 * sv))) - 0.5);
    } else {
      // Areoles: the smallest vein-bounded fields (Voronoi cells, jittered), each gently domed.
      vec2 q = lmP / lmS;
      vec2 qi = floor(q), qf = fract(q);
      float F1 = 8.0, F2 = 8.0;
      vec2 cid = qi;
      for (int j = -1; j <= 1; j++) {
        for (int k = -1; k <= 1; k++) {
          vec2 o = vec2(float(j), float(k));
          vec2 r = o + 0.1 + 0.8 * lmHash2(qi + o) - qf;
          float dd = dot(r, r);
          if (dd < F1) { F2 = F1; F1 = dd; cid = qi + o; }
          else if (dd < F2) F2 = dd;
        }
      }
      float e = (sqrt(F2) - sqrt(F1)) * 0.5 * lmS; // ≈ distance to the cell wall (m)
      vein = 1.0 - smoothstep(0.035 * lmS, 0.035 * lmS + 1.5 * lmPx, e);
      cellShade = 0.35 * (lmHash(cid) - 0.5) - 0.4 * (1.0 - smoothstep(0.0, 0.18 * lmS, e)) * (1.0 - vein);
    }
    // Chlorophyll grain (≈ 0.2 mm), only where it is resolved.
    float grain = (lmValue(lmP / 2.0e-4) - 0.5) * smoothstep(3.0, 6.0, 2.0e-4 / lmPx);
    float rel = uLeafMicro.w;
    // Veins carry less chlorophyll: paler and a touch less saturated; sunken veins sit in shade.
    vec3 c = diffuseColor.rgb;
    float l = dot(c, vec3(0.2126, 0.7152, 0.0722));
    vec3 veinC = mix(c, vec3(l), 0.25) * (rel > 0.0 ? 1.22 : 0.82);
    c = mix(c, veinC, vein * lmFade);
    c *= 1.0 + lmFade * (0.1 * cellShade + 0.08 * grain);
    diffuseColor.rgb = c;
    // Relief (m): veins ±12 µm, domed cells, faint grain.
    lmH = lmFade * (rel * 1.2e-5 * vein - 4.0e-6 * cellShade + 1.5e-6 * grain);
  }
}
#endif`,
      );
      fs = fs.replace(
        '#include <normal_fragment_maps>',
        /* glsl */ `#include <normal_fragment_maps>
{
  // Bump from the micro relief (derivatives taken outside the branch above).
  vec2 lmD = vec2(dFdx(lmH), dFdy(lmH));
  if (dot(lmD, lmD) > 0.0) {
    vec3 sp = -vViewPosition;
    vec3 sx = normalize(dFdx(sp)), sy = normalize(dFdy(sp));
    vec3 R1 = cross(sy, normal), R2 = cross(normal, sx);
    float det = dot(sx, R1) * faceDirection;
    vec3 g = sign(det) * (lmD.x * R1 + lmD.y * R2);
    normal = normalize(abs(det) * normal - g);
  }
}`,
      );
      shader.fragmentShader = fs;
    },
    -9,
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
  /**
   * Coarse albedo streaks (amplitude) at a third of the base frequency, never faded with
   * distance — the grain that still reads on wood seen from across the room.
   */
  coarse?: number;
  /** Dark checks / fissures along the grain (0..1), antialiased by distance. */
  fissure?: number;
  /** Selection uniform shared with the highlight overlay (unused when absent). */
}

/** Patch a rock/wood material with procedural relief. Geometry needs `aDetail` (vec3). */
export function patchSurfaceDetail(material: Material, d: SurfaceDetail): void {
  const vein = d.vein;
  const uniforms = {
    uDetail: { value: new Vector4(d.freq, d.bump, d.ridge ?? 0, d.pores ?? 0) },
    uDetail2: { value: new Vector4(d.albedoVar ?? 0.2, d.roughVar ?? 0.15, d.coarse ?? 0, d.fissure ?? 0) },
    uAniso: { value: new Vector3(...(d.aniso ?? [1, 1, 1])) },
    uVeinDir: { value: new Vector4(...(vein?.dir ?? [0, 1, 0]), vein?.freq ?? 0) },
    uVeinP: { value: new Vector4(vein?.width ?? 0, vein?.warp ?? 0, vein?.strength ?? 0, vein?.patchy ?? 0.5) },
    uVeinColor: { value: vein?.color ?? new Color(1, 1, 1) },
    uLattice: { value: new Vector4(d.lattice ? 1 : 0, d.lattice?.around ?? 0, d.lattice?.along ?? 0, d.lattice?.size ?? 0) },
  };
  addShaderPatch(
    material,
    `decor-surface${d.lattice ? '-lattice' : ''}`,
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
  if (uDetail2.z > 0.0 || uDetail2.w > 0.0) {
    // Coarse grain and fissures (wood): streaks a few centimetres long that survive distance,
    // and thin dark checks that fade out before they would alias.
    vec3 Pc = P * 0.3;
    vec3 fwc3 = fwidth(Pc);
    float fwc = max(fwc3.x, max(fwc3.y, fwc3.z));
    float nc = dcNoise(Pc + 1.7) * 0.7 + dcNoise(Pc * 2.3 + 4.1) * 0.3;
    diffuseColor.rgb *= 1.0 + uDetail2.z * nc;
    float fz = 1.0 - abs(dcNoise(Pc * vec3(1.6, 0.7, 1.0) + 5.3));
    float fis = pow(fz, 10.0) * (1.0 - smoothstep(0.5, 1.6, fwc * 2.0));
    diffuseColor.rgb *= 1.0 - uDetail2.w * fis;
    h -= fis * 1.2 * uDetail2.w;
    dcH = h;
  }
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
