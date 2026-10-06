import {
  Color,
  DoubleSide,
  FrontSide,
  MeshDepthMaterial,
  MeshPhysicalMaterial,
  MeshStandardMaterial,
  RGBADepthPacking,
  Vector2,
  Vector4,
  type Texture,
} from 'three';
import type { Appearance, Species } from '../../core/types';
import { GLOBALS } from '../globals';
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

export interface FishMaterials {
  body: MeshPhysicalMaterial;
  fins: MeshStandardMaterial;
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
  opts: { underwater: boolean; livebearer: boolean; skinGloss?: number },
): FishMaterials {
  const translucency = Math.min(1, Math.max(0, look.translucency ?? 0));
  const transparentBody = translucency > 0.42;
  const iridC = hex(look.iridescenceColor ?? '#9fd8ff');
  const uniforms: FishUniforms = {
    ...swim,
    uNightMap: { value: tex.night ?? blackTexture() },
    uOrmMap: { value: tex.orm },
    uNightMix: { value: tex.night ? 1 : 0 },
    uIridescence: { value: Math.min(1, Math.max(0, look.iridescence ?? 0)) },
    uIridColor: { value: new Color(srgbToLinear(iridC[0]), srgbToLinear(iridC[1]), srgbToLinear(iridC[2])) },
    uGravidSpot: { value: opts.livebearer ? 1 : 0 },
    uTranslucency: { value: translucency },
  };

  const gloss = opts.skinGloss ?? 1;
  const body = new MeshPhysicalMaterial({
    map: tex.map,
    normalMap: tex.normal,
    normalScale: new Vector2(1, 1),
    roughnessMap: tex.orm,
    metalnessMap: tex.orm,
    roughness: 1,
    metalness: 1,
    clearcoat: 0.55 * gloss,
    clearcoatRoughness: 0.22,
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

  const fins = new MeshStandardMaterial({
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
    shader.uniforms.uFishTime = GLOBALS.uTime;
    patchFishVertex(shader, depthOnly);
  };
  addShaderPatch(body, 'fish-swim', (shader, r) => {
    vertexPatch(false)(shader);
    patchFishFragment(shader, true);
    void r;
  }, -10);
  addShaderPatch(fins, 'fish-swim', (shader) => {
    vertexPatch(false)(shader);
    patchFishFragment(shader, false);
  }, -10);
  addShaderPatch(depth, 'fish-swim-depth', vertexPatch(true), -10);
  if (opts.underwater) {
    applyUnderwater(body);
    applyUnderwater(fins);
  }

  const glow = tex.hasGlow ? 1 : 0;
  // Thin fins transmit light: a faint self-lit term in the fin's own color, stronger for clear fins.
  const finTrans = 0.1 + 0.12 * (1 - Math.min(1, look.finOpacity));
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
