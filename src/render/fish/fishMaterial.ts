import {
  Color,
  DoubleSide,
  FrontSide,
  MeshDepthMaterial,
  MeshPhysicalMaterial,
  RGBADepthPacking,
  Vector2,
  Vector4,
  type Texture,
} from 'three';
import type { Appearance, Species } from '../../core/types';
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
const FISH_TIME_WRAP = 3600;
export function updateFishTime(t: number): void {
  FISH_TIME.value = t % FISH_TIME_WRAP;
}

export interface FishMaterials {
  body: MeshPhysicalMaterial;
  fins: MeshPhysicalMaterial;
  depth: MeshDepthMaterial;
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

  const vertexPatch = (depthOnly: boolean) => (shader: Parameters<Parameters<typeof addShaderPatch>[2]>[0]) => {
    Object.assign(shader.uniforms, uniforms);
    shader.uniforms.uFishTime = FISH_TIME;
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
    },
  };
}
