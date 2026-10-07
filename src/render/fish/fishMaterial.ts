import {
  AddEquation,
  Color,
  CustomBlending,
  DoubleSide,
  FrontSide,
  MeshDepthMaterial,
  MeshPhysicalMaterial,
  MinEquation,
  OneFactor,
  RGBADepthPacking,
  Vector2,
  Vector4,
  ZeroFactor,
  type Texture,
} from 'three';
import type { Appearance, Species } from '../../core/types';
import { DOF_LENS } from '../env/PostFX';
import { addShaderPatch } from '../materialPatch';
import { applyUnderwater } from '../underwater';
import { hex, srgbToLinear } from './color';
import type { FishGeometryInfo } from './fishGeometry';
import { patchFishFragment, patchFishVertex } from './shaders';
import type { SwimParams } from './swim';
import { blackTexture, type FishTextures } from './textures';

/**
 * Materials for one render variant: a MeshPhysicalMaterial body (wet clearcoat, guanine
 * metalness, custom angle-dependent iridescence), a translucent double-sided fin material, and a
 * depth material for shadows. All three share the same swim uniforms so the deformation matches.
 */

/**
 * Animation clock for every animal material. The shared GLOBALS.uTime grows without bound and a
 * float32 uniform loses precision after hours (high-frequency fin flutter would start to
 * stutter), so the fish clock wraps once an hour — a single imperceptible phase hop.
 */
export const FISH_TIME = { value: 0 };
/**
 * Fin opacity above which the fin owns the depth (and so the focus) of its pixel. Clear fins
 * are ≈ 0.1–0.36 opaque (membrane … rays), so nearly the whole visible fin stays sharp with its
 * body; only the faintest membrane edge falls back to the background's blur.
 */
export const FIN_DEPTH_ALPHA = 0.06;
/** At or above this opacity a fin in focus owns its depth like the body (painted, solid parts). */
const FIN_SOLID_ALPHA = 0.5;
const FISH_TIME_WRAP = 3600;
/** 0 whole-tank view … 1 close-up (set by FishRenderer): gates the close-up scale detail. */
export const FISH_CLOSEUP = { value: 0 };
export function updateFishTime(t: number): void {
  FISH_TIME.value = t % FISH_TIME_WRAP;
}

export interface FishMaterials {
  body: MeshPhysicalMaterial;
  fins: MeshPhysicalMaterial;
  depth: MeshDepthMaterial;
  /**
   * Depth-only twin of the fins (no colour), drawn after every translucent surface during
   * close-ups: the translucent fins do not write depth (so they blend over each other in any
   * order), which would hand them the background's depth-of-field blur — a sharp body inside a
   * grey halo of melted fins, legs and antennae. With this the depth buffer holds the fins'
   * own depth wherever the membrane is more than faintly visible — except where a clear part of
   * a fin is in focus: there the depth stays the background's (seen through the fin), so depth of
   * field blurs that background like the background beside the fin, and `finMask` keeps the fin's
   * own share of the pixel sharp.
   */
  finDepth: MeshDepthMaterial;
  /**
   * Coverage of the fins in focus, for depth of field: drawn after `finDepth`, it leaves the colour
   * and depth alone and writes alpha = −(opacity × sharpness) into the HDR target (the scene's
   * alpha is ≥ 0 elsewhere). See PostFX.
   */
  finMask: MeshDepthMaterial;
  uniforms: FishUniforms;
  /** Per-frame light-dependent factors (env reflections, glow, fin transmission). */
  setLight(daylight: number, moonlight: number): void;
  dispose(): void;
}

export interface FishUniforms {
  uSwimEnv: { value: Vector4 };
  uSwimWave: { value: Vector4 };
  uSwimMode: { value: Vector4 };
  uRibbon: { value: Vector4 };
  uFinAnim: { value: Vector4 };
  uNightMap: { value: Texture };
  uOrmMap: { value: Texture };
  uNightMix: { value: number };
  uIridescence: { value: number };
  uIridColor: { value: Color };
  uGravidSpot: { value: number };
  uTranslucency: { value: number };
  /** Skin optics: wrap (soft terminator), transmission, glint strength, thin-edge rim. */
  uFishSkin: { value: Vector4 };
  /** Scale cells across the body atlas (u, v), saturation, 1 = fin sheet material. */
  uFishSkin2: { value: Vector4 };
  /** x (SL) where the scaled flank begins behind the gill cover (scale glints only behind it). */
  uFishSkin3: { value: Vector4 };
}

/** Optional per-variant skin parameters (scale lattice for glints, animal size). */
export interface SkinOpts {
  /** Scale columns along the body (0 = no scale glints: naked skin, plates, invertebrates). */
  scaleCols: number;
  /** Max depth / SL (scale rows follow from it). */
  depth: number;
  /** Adult total length in cm (small fish get a faint bright rim to read against dark water). */
  adultCm: number;
  /** Invertebrate (chitin, shells): no wrap/transmission defaults of fish skin. */
  invertebrate?: boolean;
  /** Rear edge of the gill cover (SL); the scaled flank starts behind it. */
  opercleX?: number;
}

export function swimUniforms(swim: SwimParams, info: FishGeometryInfo, halfWidthLocal: number): Pick<FishUniforms, 'uSwimEnv' | 'uSwimWave' | 'uSwimMode' | 'uRibbon' | 'uFinAnim'> {
  return {
    uSwimEnv: { value: new Vector4(...swim.env) },
    uSwimWave: { value: new Vector4(swim.k, swim.pivot, info.slLocal, info.xSnout) },
    uSwimMode: { value: new Vector4(swim.mode, swim.rigid, swim.bendMax, halfWidthLocal) },
    uRibbon: { value: new Vector4(swim.ribbonStart, swim.ribbonEnd, swim.ribbonWaves, swim.ribbonAmp) },
    uFinAnim: { value: new Vector4(swim.ribbonFins, swim.scull ? 1 : 0, swim.pectoralGain, 0) },
  };
}

export function createFishMaterials(
  sp: Species,
  look: Appearance,
  tex: FishTextures,
  swim: Pick<FishUniforms, 'uSwimEnv' | 'uSwimWave' | 'uSwimMode' | 'uRibbon' | 'uFinAnim'>,
  envMap: Texture | null,
  opts: { underwater: boolean; livebearer: boolean; skinGloss?: number; skin?: SkinOpts },
): FishMaterials {
  const translucency = Math.min(1, Math.max(0, look.translucency ?? 0));
  const transparentBody = translucency > 0.42;
  const iridC = hex(look.iridescenceColor ?? '#9fd8ff');
  const sk = opts.skin ?? { scaleCols: 0, depth: 0.3, adultCm: 8 };
  const smallK = Math.min(1, Math.max(0, (7 - sk.adultCm) / 5));
  const inv = !!sk.invertebrate;
  const bodySkin = new Vector4(
    inv ? 0.12 + 0.3 * translucency : 0.15 + 0.32 * translucency + 0.08 * smallK,
    inv ? 0.5 * translucency : 0.7 * translucency + 0.3 * smallK,
    sk.scaleCols > 0 ? 1 : 0,
    inv ? 0.25 * translucency : 0.3 * smallK + 0.35 * translucency,
  );
  const bodySkin2 = new Vector4(sk.scaleCols, 3.125 * sk.depth * sk.scaleCols, inv ? 0.94 : 0.9, 0);
  // Fins: thin membranes — strongly wrapped and transmitting, no scale glints.
  const finSkin = new Vector4(inv ? 0.3 : 0.55, inv ? 0.35 : 0.85, 0, 0);
  const finSkin2 = new Vector4(0, 0, inv ? 0.94 : 0.9, 1);
  const uniforms: FishUniforms = {
    ...swim,
    uNightMap: { value: tex.night ?? blackTexture() },
    uOrmMap: { value: tex.orm },
    uNightMix: { value: tex.night ? 1 : 0 },
    uIridescence: { value: Math.min(1, Math.max(0, look.iridescence ?? 0)) },
    uIridColor: { value: new Color(srgbToLinear(iridC[0]), srgbToLinear(iridC[1]), srgbToLinear(iridC[2])) },
    uGravidSpot: { value: opts.livebearer ? 1 : 0 },
    uTranslucency: { value: translucency },
    uFishSkin: { value: bodySkin },
    uFishSkin2: { value: bodySkin2 },
    uFishSkin3: { value: new Vector4(sk.opercleX ?? 0.25, 0, 0, 0) },
  };

  const body = new MeshPhysicalMaterial({
    map: tex.map,
    normalMap: tex.normal,
    normalScale: new Vector2(1, 1),
    roughnessMap: tex.orm,
    metalnessMap: tex.orm,
    roughness: 1,
    metalness: 1,
    // Under water the skin/water refractive-index step is tiny (n ≈ 1.37 vs 1.33), so fish skin
    // has almost no surface glare; their shine is guanine (metalness). Relative IOR of 1.33 and a
    // per-texel specular intensity (ORM alpha) keep only the eye lens and shells glinting.
    ior: 1.33,
    specularIntensity: 1,
    specularIntensityMap: tex.orm,
    emissive: new Color(1, 1, 1),
    emissiveMap: tex.emissive,
    emissiveIntensity: 0,
    envMap,
    envMapIntensity: 1,
    side: FrontSide,
    transparent: transparentBody,
    depthWrite: true,
  });
  body.name = `fish-body:${sp.id}`;

  const fins = new MeshPhysicalMaterial({
    ior: 1.33,
    specularIntensity: 0.6,
    map: tex.map,
    normalMap: tex.normal,
    normalScale: new Vector2(0.6, 0.6),
    roughnessMap: tex.orm,
    roughness: 1,
    metalness: 0,
    emissive: new Color(1, 1, 1),
    emissiveMap: tex.map,
    emissiveIntensity: 0,
    envMap,
    envMapIntensity: 0.6,
    side: DoubleSide,
    transparent: true,
    depthWrite: false,
    alphaTest: 0.012,
  });
  fins.forceSinglePass = true;
  fins.name = `fish-fins:${sp.id}`;

  const depth = new MeshDepthMaterial({ depthPacking: RGBADepthPacking });
  depth.name = `fish-depth:${sp.id}`;

  // Translucent (transparent list) so it sorts after the fins themselves; it never writes colour.
  const finDepth = new MeshDepthMaterial({ map: tex.map, alphaTest: FIN_DEPTH_ALPHA, side: DoubleSide, transparent: true, depthWrite: true, colorWrite: false });
  finDepth.forceSinglePass = true;
  finDepth.name = `fish-fin-depth:${sp.id}`;
  // Its blending keeps the colour and the most-covering fin's mask (min of negatives) in alpha.
  const finMask = new MeshDepthMaterial({
    map: tex.map,
    alphaTest: FIN_DEPTH_ALPHA,
    side: DoubleSide,
    transparent: true,
    depthWrite: false,
    blending: CustomBlending,
    blendEquation: AddEquation,
    blendSrc: ZeroFactor,
    blendDst: OneFactor,
    blendEquationAlpha: MinEquation,
    blendSrcAlpha: OneFactor,
    blendDstAlpha: OneFactor,
  });
  finMask.forceSinglePass = true;
  finMask.name = `fish-fin-mask:${sp.id}`;

  const vertexPatch = (depthOnly: boolean) => (shader: Parameters<Parameters<typeof addShaderPatch>[2]>[0]) => {
    Object.assign(shader.uniforms, uniforms);
    shader.uniforms.uFishTime = FISH_TIME;
    shader.uniforms.uFishCloseUp = FISH_CLOSEUP;
    patchFishVertex(shader, depthOnly);
  };
  addShaderPatch(body, 'fish-swim', (shader) => {
    vertexPatch(false)(shader);
    patchFishFragment(shader, true);
  }, -10);
  const finUniforms = { uFishSkin: { value: finSkin }, uFishSkin2: { value: finSkin2 } };
  addShaderPatch(fins, 'fish-swim', (shader) => {
    vertexPatch(false)(shader);
    Object.assign(shader.uniforms, finUniforms);
    patchFishFragment(shader, false);
  }, -10);
  addShaderPatch(depth, 'fish-swim-depth', vertexPatch(true), -10);
  addShaderPatch(finDepth, 'fish-swim-depth', vertexPatch(true), -10);
  addShaderPatch(finMask, 'fish-swim-depth', vertexPatch(true), -10);
  // How sharp this fragment is under the current lens (1 in focus … 0 blurred), as PostFX sees it.
  const lensGlsl = /* glsl */ `
    uniform vec3 uDofCoc;
    uniform vec2 uDofClip;
    float finSharp() {
      float d = uDofClip.x * uDofClip.y / (uDofClip.y - gl_FragCoord.z * (uDofClip.y - uDofClip.x));
      return 1.0 - smoothstep(0.35, 1.25, abs(uDofCoc.x * (uDofCoc.y - 1.0 / d)));
    }`;
  const finLens = (body: string) => (shader: Parameters<Parameters<typeof addShaderPatch>[2]>[0]) => {
    shader.uniforms.uDofCoc = DOF_LENS.uCoc;
    shader.uniforms.uDofClip = DOF_LENS.uClip;
    const fs = shader.fragmentShader.replace('void main() {', `${lensGlsl}\nvoid main() {`);
    const at = fs.lastIndexOf('}');
    shader.fragmentShader = `${fs.slice(0, at)}${body}\n${fs.slice(at)}`;
  };
  // Clear parts of a fin in focus leave the depth to the background behind them.
  // (Distinct patch keys: the key is what tells their programs apart.)
  addShaderPatch(finDepth, 'fin-lens-depth', finLens(`  if (diffuseColor.a < ${FIN_SOLID_ALPHA.toFixed(2)} && finSharp() > 0.5) discard;`));
  addShaderPatch(
    finMask,
    'fin-lens-mask',
    finLens(`  float finM = diffuseColor.a * finSharp();
  if (finM < 0.004) discard;
  gl_FragColor = vec4(0.0, 0.0, 0.0, -finM);`),
  );
  if (opts.underwater) {
    applyUnderwater(body);
    applyUnderwater(fins);
  }

  const glow = tex.hasGlow ? 1 : 0;
  // (Light through the thin fin membranes is real transmission in the shader now; only a trace
  // of self-lit fin colour remains so fins never go dead-black against dark water.)
  const finTrans = 0.015;
  return {
    body,
    fins,
    depth,
    finDepth,
    finMask,
    uniforms,
    setLight(daylight: number, moonlight: number) {
      const env = 0.12 + 0.88 * daylight + 0.35 * moonlight;
      body.envMapIntensity = env;
      fins.envMapIntensity = env * 0.6;
      body.emissiveIntensity = glow * (0.15 + 0.85 * daylight) * 0.9;
      fins.emissiveIntensity = finTrans * (0.1 + 0.9 * daylight);
    },
    dispose() {
      body.dispose();
      fins.dispose();
      depth.dispose();
      finDepth.dispose();
      finMask.dispose();
    },
  };
}
