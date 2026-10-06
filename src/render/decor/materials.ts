/**
 * Shared materials for hardscape (one per variant style, so all seiryu stones share a program
 * and a material) plus the calm selection-highlight overlay.
 */
import { AdditiveBlending, Color, DoubleSide, LessEqualDepth, MeshStandardMaterial, ShaderMaterial, type Material } from 'three';
import { applyUnderwater } from '../underwater';
import { GLOBALS } from '../globals';
import { DECOR_UNIFORMS, patchSurfaceDetail, type SurfaceDetail } from './shaders';

interface HardscapeLook {
  roughness: number;
  detail: SurfaceDetail;
  side?: 'double';
  tubeUv?: boolean;
}

const c = (hex: string) => new Color(hex);

/** Per-style surface character (relief scale, pores, veins…), tuned against reference photos. */
const LOOKS: Record<string, HardscapeLook> = {
  seiryu: {
    roughness: 0.82,
    detail: {
      freq: 55, bump: 0.0011, ridge: 0.65, pores: 0.08, albedoVar: 0.22, roughVar: 0.12,
      vein: { dir: [0.32, 0.9, 0.28], freq: 26, width: 0.03, warp: 0.35, strength: 0.7, color: c('#d4d6d2'), patchy: 0.3 },
    },
  },
  'dragon-stone': { roughness: 0.93, detail: { freq: 42, bump: 0.0024, ridge: 0.35, pores: 0.55, albedoVar: 0.35, roughVar: 0.08 } },
  lava: { roughness: 0.95, detail: { freq: 85, bump: 0.0018, ridge: 0.15, pores: 0.95, albedoVar: 0.45, roughVar: 0.05 } },
  slate: {
    roughness: 0.8,
    detail: {
      freq: 30, bump: 0.0005, ridge: 0.2, pores: 0, albedoVar: 0.18, roughVar: 0.18,
      vein: { dir: [0, 1, 0], freq: 520, width: 0.25, warp: 0.6, strength: 0.18, color: c('#6c7074'), patchy: 0.8 },
    },
  },
  'river-stone': { roughness: 0.5, detail: { freq: 45, bump: 0.00025, ridge: 0, pores: 0, albedoVar: 0.18, roughVar: 0.12 } },
  'texas-holey': { roughness: 0.9, detail: { freq: 38, bump: 0.0018, ridge: 0.55, pores: 0.45, albedoVar: 0.25, roughVar: 0.08 } },
  'petrified-wood': {
    roughness: 0.6,
    detail: { freq: 30, bump: 0.0008, ridge: 0.3, pores: 0, albedoVar: 0.2, roughVar: 0.15, aniso: [3, 0.6, 3] },
  },
  'elephant-skin': { roughness: 0.88, detail: { freq: 34, bump: 0.0032, ridge: 1.0, pores: 0, albedoVar: 0.25, roughVar: 0.08 } },
  frodo: {
    roughness: 0.86,
    detail: {
      freq: 48, bump: 0.0016, ridge: 0.6, pores: 0.1, albedoVar: 0.25, roughVar: 0.1,
      vein: { dir: [0.1, 1, 0.05], freq: 110, width: 0.18, warp: 1.2, strength: 0.4, color: c('#9a6a40'), patchy: 0.5 },
    },
  },
  // Porous reef limestone: fine pores darken only a little (the crusts fill most of them).
  'live-rock': { roughness: 0.92, detail: { freq: 70, bump: 0.0026, ridge: 0.35, pores: 0.4, albedoVar: 0.22, roughVar: 0.05 } },
  // Wood: aDetail = (arc around, length along, branch) → grain streaks along the length.
  spiderwood: { roughness: 0.78, detail: { freq: 1, bump: 0.0005, ridge: 0.5, albedoVar: 0.25, roughVar: 0.1, aniso: [260, 22, 1], coarse: 0.28, fissure: 0.45 } },
  'redmoor-root': { roughness: 0.74, detail: { freq: 1, bump: 0.0005, ridge: 0.5, albedoVar: 0.25, roughVar: 0.1, aniso: [260, 22, 1], coarse: 0.25, fissure: 0.4 } },
  manzanita: { roughness: 0.55, detail: { freq: 1, bump: 0.0003, ridge: 0.3, albedoVar: 0.15, roughVar: 0.1, aniso: [180, 14, 1], coarse: 0.18, fissure: 0.12 } },
  mopani: { roughness: 0.6, detail: { freq: 1, bump: 0.0007, ridge: 0.4, albedoVar: 0.18, roughVar: 0.1, aniso: [150, 16, 1], coarse: 0.22, fissure: 0.2 } },
  malaysian: { roughness: 0.8, detail: { freq: 1, bump: 0.0012, ridge: 0.8, albedoVar: 0.25, roughVar: 0.1, aniso: [220, 12, 1], coarse: 0.3, fissure: 0.6 } },
  cholla: {
    roughness: 0.85,
    side: 'double',
    tubeUv: true,
    detail: { freq: 1, bump: 0.0007, ridge: 0.6, albedoVar: 0.25, roughVar: 0.1, aniso: [200, 30, 1], lattice: { around: 7, along: 32, size: 0.2 } },
  },
  branchwood: { roughness: 0.82, detail: { freq: 1, bump: 0.0009, ridge: 0.6, albedoVar: 0.3, roughVar: 0.1, aniso: [240, 10, 1], coarse: 0.3, fissure: 0.55 } },
  // Caves & small decor.
  'slate-cave': { roughness: 0.8, detail: { freq: 30, bump: 0.0005, ridge: 0.2, albedoVar: 0.18, vein: { dir: [0, 1, 0], freq: 520, width: 0.25, warp: 0.6, strength: 0.18, color: c('#6c7074'), patchy: 0.8 } } },
  'rock-cave': { roughness: 0.88, detail: { freq: 40, bump: 0.0018, ridge: 0.45, pores: 0.25, albedoVar: 0.28 } },
  coconut: { roughness: 0.9, detail: { freq: 1, bump: 0.0009, ridge: 0.7, albedoVar: 0.3, aniso: [160, 160, 160] } },
  'clay-tube': { roughness: 0.92, side: 'double', detail: { freq: 120, bump: 0.0003, pores: 0.15, albedoVar: 0.15 } },
  pebbles: { roughness: 0.45, detail: { freq: 60, bump: 0.0002, albedoVar: 0.2 } },
  shell: { roughness: 0.42, side: 'double', detail: { freq: 1, bump: 0.0003, ridge: 0.3, albedoVar: 0.1, aniso: [1, 1, 1] } },
  airstone: { roughness: 0.95, detail: { freq: 400, bump: 0.0002, pores: 0.6, albedoVar: 0.12 } },
  plastic: { roughness: 0.35, detail: { freq: 10, bump: 0, albedoVar: 0.02 } },
  rubble: { roughness: 0.92, detail: { freq: 1, bump: 0.0009, ridge: 0.2, pores: 0.3, albedoVar: 0.08, aniso: [600, 600, 600] } },
  // Plants (unique meshes with surface relief: marimo, coral skeletons) reuse this path.
  marimo: { roughness: 1.0, detail: { freq: 700, bump: 0.0004, ridge: 0.2, albedoVar: 0.2 } },
};

const cache = new Map<string, MeshStandardMaterial>();

export function hardscapeLook(style: string): HardscapeLook {
  return LOOKS[style] ?? LOOKS.seiryu;
}

/** Shared vertex-colored, procedurally detailed material for a hardscape style. */
export function hardscapeMaterial(style: string): MeshStandardMaterial {
  const hit = cache.get(style);
  if (hit) return hit;
  const look = hardscapeLook(style);
  const m = new MeshStandardMaterial({ color: 0xffffff, vertexColors: true, roughness: look.roughness, metalness: 0 });
  if (look.side === 'double') m.side = DoubleSide;
  m.name = `decor-${style}`;
  if (look.tubeUv) m.defines = { ...(m.defines ?? {}), DC_TUBE_UV: '' };
  patchSurfaceDetail(m, look.detail);
  applyUnderwater(m);
  cache.set(style, m);
  return m;
}

/** Transparent silicone airline tubing. */
let tubing: MeshStandardMaterial | null = null;
export function tubingMaterial(): MeshStandardMaterial {
  if (tubing) return tubing;
  tubing = new MeshStandardMaterial({ color: 0x9fb3a8, roughness: 0.25, metalness: 0, transparent: true, opacity: 0.55, depthWrite: false });
  tubing.name = 'decor-tubing';
  applyUnderwater(tubing);
  return tubing;
}

/** Soft additive rim for the selected decor item (calm, slowly breathing). */
let highlight: ShaderMaterial | null = null;
export function highlightMaterial(): Material {
  if (highlight) return highlight;
  highlight = new ShaderMaterial({
    uniforms: { uTime: GLOBALS.uTime, uColor: DECOR_UNIFORMS.uSelColor },
    vertexShader: /* glsl */ `
      varying vec3 vN;
      varying vec3 vV;
      void main() {
        vec4 wp = modelMatrix * vec4(position, 1.0);
        vec4 mv = viewMatrix * wp;
        vN = normalize(normalMatrix * normal);
        vV = -mv.xyz;
        gl_Position = projectionMatrix * mv;
      }`,
    fragmentShader: /* glsl */ `
      uniform float uTime;
      uniform vec3 uColor;
      varying vec3 vN;
      varying vec3 vV;
      void main() {
        float f = pow(1.0 - abs(dot(normalize(vN), normalize(vV))), 2.2);
        float breathe = 0.8 + 0.2 * sin(uTime * 1.4);
        gl_FragColor = vec4(uColor * (0.06 + 0.55 * f) * breathe, 1.0);
      }`,
    blending: AdditiveBlending,
    transparent: true,
    depthWrite: false,
    depthFunc: LessEqualDepth,
    polygonOffset: true,
    polygonOffsetFactor: -1,
    polygonOffsetUnits: -1,
  });
  highlight.name = 'decor-highlight';
  return highlight;
}
