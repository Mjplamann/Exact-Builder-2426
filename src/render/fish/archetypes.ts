import type {
  Appearance,
  Archetype,
  BodyPlan,
  CaudalShape,
  FinLook,
  FinShape,
  FinSpec,
  MouthPosition,
  Sex,
  SnoutShape,
  Species,
} from '../../core/types';

/**
 * Body-plan presets for every archetype, and the merge of archetype → species → sex overrides
 * into a fully specified `ResolvedBody` that the geometry/texture builders consume.
 *
 * All proportions are fractions of standard length SL (snout tip → caudal fin base), the same
 * convention as `BodyPlan`. Numbers come from typical morphometrics (FishBase body-shape
 * measurements, field-guide plates): e.g. a neon tetra is ~0.27 SL deep with a head ~0.27 SL,
 * a discus ~0.85 deep, a kuhli loach ~0.09.
 */

export interface FinDef {
  start: number;
  end: number;
  height: number;
  shape: FinShape;
  trail: number;
}

/** Cross-section family: superellipse exponents and where the widest line sits. */
export type SectionKind = 'compressed' | 'round' | 'depressed' | 'boxy' | 'triangular' | 'keeled';
/** Skin finish: drives the normal map (scales, bony scutes, plates…) and roughness. */
export type SkinKind = 'scaled' | 'naked' | 'scutes' | 'plates' | 'ganoid' | 'hex' | 'prickly' | 'rings';
/** Which geometry builder renders the animal. */
export type BodyKind =
  | 'fish'
  | 'seahorse'
  | 'ray'
  | 'shrimp'
  | 'snail'
  | 'crab'
  | 'hermit-crab'
  | 'crayfish'
  | 'starfish'
  | 'brittle-star'
  | 'urchin';

export interface ResolvedBody {
  archetype: Archetype;
  kind: BodyKind;
  depth: number;
  width: number;
  depthPos: number;
  /** Position of maximum width (fish are usually widest just behind the head). */
  widthPos: number;
  headLength: number;
  snout: SnoutShape;
  /** Extra snout/jaw extension in front of the head (tube snouts, needle jaws), SL. */
  snoutLength: number;
  mouth: MouthPosition;
  /** Gape length relative to head length. */
  mouthSize: number;
  /** Lip thickness 0..1 (sweetlips, oscars, gouramis' small mouths → low). */
  lips: number;
  eyeSize: number;
  /** Eye height: 0 = middle of the head depth, 1 = on top of the head. */
  eyeHeight: number;
  peduncle: number;
  belly: number;
  backArch: number;
  hump: number;
  /** 0 round belly .. 1 flat sole (plecos, gobies, corydoras). */
  ventralFlat: number;
  barbels: number;
  barbelLength: number;
  caudal: { shape: CaudalShape; size: number };
  dorsal: FinDef | null;
  dorsal2: FinDef | null;
  anal: FinDef | null;
  pelvic: FinDef | null;
  pectoral: FinDef | null;
  adipose: boolean;
  scaleSize: number;
  armored: boolean;
  section: SectionKind;
  skin: SkinKind;
  /** 0 = pectoral blade held against the flank, 1 = spread horizontally (plecos, hillstream loaches). */
  pectoralAngle: number;
  /** Pectoral base height, 0 = belly .. 1 = back. */
  pectoralHeight: number;
  /** Outward splay of the pelvic fins (rad-ish, 0..1). */
  pelvicSpread: number;
  /** 0 = normal peduncle; 1 = body tapers to a point (eels, knifefish). */
  tailTaper: number;
  /** Special features. */
  horns: number;
  lowerJaw: number;
  chinTrunk: number;
  cirri: number;
  scalpel: boolean;
  illicium: boolean;
  /** Fin-ray density multiplier. */
  finRays: number;
  /** Male poeciliid: the anal fin is a rod-like gonopodium. */
  gonopodium: boolean;
  /** Fancy goldfish: paired anal fins. */
  twinAnal: boolean;
}

type Preset = Partial<Omit<ResolvedBody, 'archetype'>>;

const f = (start: number, end: number, height: number, shape: FinShape = 'rounded', trail = 0): FinDef => ({
  start,
  end,
  height,
  shape,
  trail,
});

const DEFAULT: Omit<ResolvedBody, 'archetype'> = {
  kind: 'fish',
  depth: 0.3,
  width: 0.13,
  depthPos: 0.42,
  widthPos: 0.3,
  headLength: 0.27,
  snout: 'rounded',
  snoutLength: 0,
  mouth: 'terminal',
  mouthSize: 0.35,
  lips: 0.2,
  eyeSize: 0.33,
  eyeHeight: 0.32,
  peduncle: 0.4,
  belly: 0.4,
  backArch: 0,
  hump: 0,
  ventralFlat: 0,
  barbels: 0,
  barbelLength: 0.1,
  caudal: { shape: 'forked', size: 0.3 },
  dorsal: f(0.45, 0.6, 0.16, 'rounded'),
  dorsal2: null,
  anal: f(0.62, 0.8, 0.12, 'rounded'),
  pelvic: f(0.42, 0.46, 0.13, 'pointed'),
  pectoral: f(0.25, 0.28, 0.17, 'rounded'),
  adipose: false,
  scaleSize: 0.45,
  armored: false,
  section: 'compressed',
  skin: 'scaled',
  pectoralAngle: 0.15,
  pectoralHeight: 0.32,
  pelvicSpread: 0.35,
  tailTaper: 0,
  horns: 0,
  lowerJaw: 0,
  chinTrunk: 0,
  cirri: 0,
  scalpel: false,
  illicium: false,
  finRays: 1,
  gonopodium: false,
  twinAnal: false,
};

const C = (shape: CaudalShape, size: number) => ({ shape, size });

/** One entry per Archetype (the compiler enforces completeness). */
export const ARCHETYPE_PRESETS: Record<Archetype, Preset> = {
  // ---------------------------------------------------------------- characins
  tetra: {
    depth: 0.3, width: 0.12, depthPos: 0.4, headLength: 0.27, eyeSize: 0.4, peduncle: 0.38, belly: 0.4,
    caudal: C('forked', 0.3), dorsal: f(0.47, 0.57, 0.16), anal: f(0.6, 0.86, 0.11, 'low'),
    pelvic: f(0.42, 0.45, 0.13), pectoral: f(0.25, 0.28, 0.16), adipose: true, scaleSize: 0.4,
  },
  pencilfish: {
    depth: 0.17, width: 0.1, depthPos: 0.45, headLength: 0.24, snout: 'pointed', mouthSize: 0.15, eyeSize: 0.36,
    peduncle: 0.45, belly: 0.3, caudal: C('emarginate', 0.24), dorsal: f(0.52, 0.6, 0.12), anal: f(0.68, 0.82, 0.12),
    pelvic: f(0.44, 0.47, 0.1), pectoral: f(0.23, 0.26, 0.13), scaleSize: 0.45, section: 'round',
  },
  hatchetfish: {
    depth: 0.5, width: 0.1, depthPos: 0.3, headLength: 0.25, snout: 'upturned', mouth: 'superior', eyeSize: 0.45,
    eyeHeight: 0.55, peduncle: 0.3, belly: 1, backArch: -1, caudal: C('forked', 0.28), dorsal: f(0.62, 0.7, 0.12),
    anal: f(0.62, 0.9, 0.08, 'low'), pelvic: f(0.45, 0.47, 0.05), pectoral: f(0.17, 0.21, 0.42, 'pointed'),
    pectoralHeight: 0.7, pectoralAngle: 0.35, section: 'keeled', scaleSize: 0.35,
  },
  headstander: {
    depth: 0.24, width: 0.12, depthPos: 0.45, headLength: 0.22, snout: 'pointed', mouth: 'terminal', mouthSize: 0.18,
    eyeSize: 0.33, caudal: C('forked', 0.3), dorsal: f(0.4, 0.52, 0.18), anal: f(0.72, 0.84, 0.12), scaleSize: 0.55,
    section: 'round',
  },
  piranha: {
    depth: 0.55, width: 0.18, depthPos: 0.45, headLength: 0.3, snout: 'blunt', mouthSize: 0.6, lips: 0.1,
    eyeSize: 0.3, peduncle: 0.25, belly: 0.7, caudal: C('emarginate', 0.28), dorsal: f(0.48, 0.6, 0.2),
    anal: f(0.65, 0.9, 0.12), adipose: true, scaleSize: 0.15, lowerJaw: 0.02,
  },
  pacu: {
    depth: 0.65, width: 0.12, depthPos: 0.45, headLength: 0.25, snout: 'blunt', mouthSize: 0.3, eyeSize: 0.33,
    peduncle: 0.22, belly: 0.6, caudal: C('forked', 0.3), dorsal: f(0.45, 0.58, 0.3, 'falcate'),
    anal: f(0.6, 0.95, 0.15, 'falcate'), adipose: true, scaleSize: 0.15,
  },
  // ---------------------------------------------------------------- cyprinids & co.
  barb: {
    depth: 0.38, width: 0.15, depthPos: 0.42, headLength: 0.27, eyeSize: 0.35, peduncle: 0.42, belly: 0.45,
    caudal: C('forked', 0.3), dorsal: f(0.42, 0.55, 0.25, 'pointed'), anal: f(0.68, 0.8, 0.15),
    scaleSize: 0.8, backArch: 0.2,
  },
  danio: {
    depth: 0.2, width: 0.1, depthPos: 0.42, headLength: 0.22, snout: 'pointed', mouth: 'superior', eyeSize: 0.36,
    peduncle: 0.45, belly: 0.3, caudal: C('forked', 0.32), dorsal: f(0.52, 0.64, 0.14), anal: f(0.58, 0.78, 0.13),
    barbels: 2, barbelLength: 0.05, scaleSize: 0.35,
  },
  rasbora: {
    depth: 0.26, width: 0.11, depthPos: 0.42, headLength: 0.25, snout: 'pointed', mouth: 'superior', eyeSize: 0.38,
    caudal: C('forked', 0.32), dorsal: f(0.48, 0.58, 0.16, 'pointed'), anal: f(0.62, 0.74, 0.12), scaleSize: 0.5,
  },
  minnow: {
    depth: 0.22, width: 0.12, headLength: 0.25, eyeSize: 0.33, caudal: C('forked', 0.3), dorsal: f(0.48, 0.6, 0.16),
    anal: f(0.62, 0.75, 0.12), scaleSize: 0.35, section: 'round',
  },
  'shark-minnow': {
    depth: 0.27, width: 0.14, depthPos: 0.38, headLength: 0.24, mouth: 'subterminal', barbels: 4, barbelLength: 0.03,
    eyeSize: 0.3, caudal: C('deeply-forked', 0.36), dorsal: f(0.33, 0.47, 0.32, 'falcate'), anal: f(0.68, 0.78, 0.13),
    scaleSize: 0.5, section: 'round',
  },
  carp: {
    depth: 0.33, width: 0.17, depthPos: 0.4, headLength: 0.25, mouth: 'subterminal', barbels: 4, barbelLength: 0.05,
    eyeSize: 0.22, caudal: C('forked', 0.28), dorsal: f(0.38, 0.72, 0.14), anal: f(0.7, 0.8, 0.12), scaleSize: 0.85,
    section: 'round', backArch: 0.3,
  },
  goldfish: {
    depth: 0.38, width: 0.18, depthPos: 0.42, headLength: 0.26, eyeSize: 0.3, belly: 0.5, caudal: C('forked', 0.32),
    dorsal: f(0.4, 0.72, 0.18), anal: f(0.7, 0.8, 0.12), scaleSize: 0.85, backArch: 0.25,
  },
  'fancy-goldfish': {
    depth: 0.62, width: 0.4, depthPos: 0.45, headLength: 0.28, snout: 'blunt', eyeSize: 0.33, peduncle: 0.35,
    belly: 1, backArch: 0.6, caudal: C('double', 0.85), dorsal: f(0.35, 0.65, 0.35, 'flowing'),
    anal: f(0.72, 0.82, 0.18, 'flowing'), pelvic: f(0.4, 0.45, 0.2, 'rounded'), pectoral: f(0.27, 0.3, 0.2),
    scaleSize: 0.9, section: 'round', twinAnal: true,
  },
  koi: {
    depth: 0.28, width: 0.16, depthPos: 0.4, headLength: 0.25, mouth: 'subterminal', barbels: 4, barbelLength: 0.05,
    eyeSize: 0.22, caudal: C('forked', 0.28), dorsal: f(0.38, 0.7, 0.14), anal: f(0.7, 0.8, 0.12), scaleSize: 0.85,
    section: 'round', backArch: 0.2,
  },
  loach: {
    depth: 0.16, width: 0.12, depthPos: 0.4, headLength: 0.22, mouth: 'inferior', barbels: 6, barbelLength: 0.04,
    eyeSize: 0.22, eyeHeight: 0.5, peduncle: 0.5, ventralFlat: 0.5, caudal: C('emarginate', 0.24),
    dorsal: f(0.42, 0.55, 0.16), anal: f(0.72, 0.8, 0.11), pelvic: f(0.45, 0.48, 0.12), scaleSize: 0.1,
    section: 'round', skin: 'naked',
  },
  botia: {
    depth: 0.28, width: 0.13, depthPos: 0.42, headLength: 0.28, snout: 'pointed', mouth: 'inferior', barbels: 8,
    barbelLength: 0.04, eyeSize: 0.2, eyeHeight: 0.45, caudal: C('deeply-forked', 0.32), dorsal: f(0.45, 0.58, 0.18),
    anal: f(0.72, 0.8, 0.12), scaleSize: 0.1, backArch: 0.4, ventralFlat: 0.3, skin: 'naked',
  },
  'hillstream-loach': {
    depth: 0.13, width: 0.3, depthPos: 0.3, widthPos: 0.25, headLength: 0.22, mouth: 'inferior', eyeSize: 0.2,
    eyeHeight: 0.85, section: 'depressed', ventralFlat: 1, pectoral: f(0.14, 0.3, 0.34, 'fan'),
    pelvic: f(0.4, 0.52, 0.24, 'fan'), dorsal: f(0.42, 0.55, 0.12), anal: f(0.72, 0.8, 0.08),
    caudal: C('emarginate', 0.24), pectoralAngle: 1, pectoralHeight: 0.15, pelvicSpread: 1, scaleSize: 0.1,
    skin: 'naked',
  },
  kuhli: {
    depth: 0.09, width: 0.08, depthPos: 0.45, headLength: 0.12, mouth: 'inferior', barbels: 6, barbelLength: 0.03,
    eyeSize: 0.18, eyeHeight: 0.5, peduncle: 0.75, tailTaper: 0.35, dorsal: f(0.7, 0.77, 0.06, 'low'),
    anal: f(0.82, 0.87, 0.05, 'low'), pelvic: f(0.5, 0.52, 0.04), pectoral: f(0.13, 0.15, 0.06),
    caudal: C('rounded', 0.1), scaleSize: 0, section: 'round', skin: 'naked',
  },
  'algae-eater': {
    depth: 0.2, width: 0.15, headLength: 0.22, mouth: 'inferior', barbels: 2, barbelLength: 0.04, eyeSize: 0.26,
    eyeHeight: 0.5, caudal: C('forked', 0.3), dorsal: f(0.36, 0.5, 0.2, 'pointed'), anal: f(0.72, 0.8, 0.12),
    ventralFlat: 0.4, section: 'round', scaleSize: 0.5,
  },
  // ---------------------------------------------------------------- cichlids
  cichlid: {
    depth: 0.42, width: 0.16, depthPos: 0.4, headLength: 0.32, mouthSize: 0.45, lips: 0.45, eyeSize: 0.3,
    peduncle: 0.45, caudal: C('rounded', 0.28), dorsal: f(0.3, 0.88, 0.18, 'spiny'), anal: f(0.62, 0.9, 0.18, 'pointed'),
    pelvic: f(0.36, 0.4, 0.22, 'pointed'), pectoral: f(0.3, 0.33, 0.2), scaleSize: 0.55,
  },
  'dwarf-cichlid': {
    depth: 0.36, width: 0.14, depthPos: 0.42, headLength: 0.32, mouthSize: 0.35, lips: 0.3, eyeSize: 0.33,
    caudal: C('rounded', 0.3), dorsal: f(0.3, 0.86, 0.2, 'spiny'), anal: f(0.62, 0.88, 0.16, 'pointed'),
    pelvic: f(0.36, 0.4, 0.2, 'pointed'), pectoral: f(0.3, 0.33, 0.18), scaleSize: 0.5,
  },
  discus: {
    depth: 0.85, width: 0.1, depthPos: 0.48, headLength: 0.25, snout: 'blunt', mouthSize: 0.2, eyeSize: 0.35,
    peduncle: 0.25, belly: 0.5, caudal: C('truncate', 0.25), dorsal: f(0.3, 0.92, 0.16, 'low'),
    anal: f(0.42, 0.92, 0.16, 'low'), pelvic: f(0.38, 0.42, 0.18, 'pointed'), pectoral: f(0.3, 0.33, 0.14),
    scaleSize: 0.2,
  },
  angelfish: {
    depth: 0.62, width: 0.08, depthPos: 0.42, headLength: 0.28, snout: 'pointed', mouthSize: 0.25, eyeSize: 0.36,
    peduncle: 0.28, backArch: -0.2, caudal: C('lyre', 0.45), dorsal: f(0.38, 0.86, 0.85, 'falcate'),
    anal: f(0.45, 0.86, 0.85, 'falcate'), pelvic: f(0.36, 0.4, 0.75, 'filament', 0.3), pectoral: f(0.3, 0.33, 0.14),
    scaleSize: 0.35,
  },
  oscar: {
    depth: 0.42, width: 0.2, depthPos: 0.42, headLength: 0.33, mouthSize: 0.55, lips: 0.7, eyeSize: 0.25, belly: 0.5,
    caudal: C('rounded', 0.28), dorsal: f(0.3, 0.86, 0.18, 'spiny'), anal: f(0.62, 0.88, 0.2), scaleSize: 0.3,
  },
  mbuna: {
    depth: 0.32, width: 0.15, headLength: 0.3, snout: 'blunt', eyeSize: 0.3, lips: 0.45, caudal: C('emarginate', 0.28),
    dorsal: f(0.3, 0.88, 0.15, 'spiny'), anal: f(0.65, 0.88, 0.15, 'pointed'), pelvic: f(0.36, 0.4, 0.18, 'pointed'),
    scaleSize: 0.4,
  },
  frontosa: {
    depth: 0.42, width: 0.16, headLength: 0.33, hump: 0.8, snout: 'blunt', mouthSize: 0.5, lips: 0.6, eyeSize: 0.28,
    caudal: C('emarginate', 0.3), dorsal: f(0.28, 0.88, 0.18, 'spiny'), anal: f(0.65, 0.9, 0.2, 'pointed'),
    pelvic: f(0.36, 0.4, 0.3, 'pointed'), scaleSize: 0.4,
  },
  geophagus: {
    depth: 0.38, width: 0.15, headLength: 0.38, snout: 'pointed', mouth: 'subterminal', eyeSize: 0.3, eyeHeight: 0.6,
    caudal: C('emarginate', 0.3), dorsal: f(0.3, 0.88, 0.2, 'spiny'), anal: f(0.65, 0.88, 0.18, 'pointed'),
    pelvic: f(0.36, 0.4, 0.28, 'pointed'), scaleSize: 0.5,
  },
  // ---------------------------------------------------------------- anabantoids & snakeheads
  gourami: {
    depth: 0.38, width: 0.13, depthPos: 0.45, headLength: 0.27, snout: 'pointed', mouth: 'superior', mouthSize: 0.2,
    eyeSize: 0.33, peduncle: 0.4, caudal: C('emarginate', 0.3), dorsal: f(0.5, 0.72, 0.12, 'pointed'),
    anal: f(0.3, 0.92, 0.18, 'rounded'), pelvic: f(0.3, 0.32, 0.8, 'filament', 0.3), pectoral: f(0.27, 0.3, 0.17),
    scaleSize: 0.35,
  },
  betta: {
    depth: 0.27, width: 0.13, depthPos: 0.45, headLength: 0.27, mouth: 'superior', mouthSize: 0.25, eyeSize: 0.33,
    peduncle: 0.45, caudal: C('rounded', 0.45), dorsal: f(0.5, 0.72, 0.3, 'flowing'),
    anal: f(0.4, 0.92, 0.3, 'flowing'), pelvic: f(0.3, 0.34, 0.4, 'filament'), pectoral: f(0.27, 0.3, 0.16),
    scaleSize: 0.55,
  },
  'paradise-fish': {
    depth: 0.3, width: 0.12, headLength: 0.27, mouth: 'superior', eyeSize: 0.32, caudal: C('lyre', 0.5),
    dorsal: f(0.45, 0.75, 0.25, 'pointed'), anal: f(0.35, 0.9, 0.25, 'pointed'), pelvic: f(0.3, 0.33, 0.3, 'filament'),
    scaleSize: 0.5,
  },
  snakehead: {
    depth: 0.17, width: 0.15, depthPos: 0.4, headLength: 0.3, mouthSize: 0.55, eyeSize: 0.2, eyeHeight: 0.55,
    caudal: C('rounded', 0.22), dorsal: f(0.3, 0.95, 0.1, 'low'), anal: f(0.5, 0.95, 0.09, 'low'),
    pelvic: f(0.32, 0.36, 0.08), scaleSize: 0.45, section: 'round',
  },
  // ---------------------------------------------------------------- catfishes
  corydoras: {
    depth: 0.38, width: 0.22, depthPos: 0.35, widthPos: 0.3, headLength: 0.33, snout: 'blunt', mouth: 'inferior',
    barbels: 6, barbelLength: 0.07, eyeSize: 0.3, eyeHeight: 0.6, peduncle: 0.4, ventralFlat: 0.8, armored: true,
    adipose: true, backArch: 0.6, caudal: C('forked', 0.28), dorsal: f(0.32, 0.42, 0.3, 'pointed'),
    anal: f(0.68, 0.75, 0.12), pelvic: f(0.45, 0.5, 0.14), pectoral: f(0.28, 0.31, 0.24, 'pointed'),
    pectoralAngle: 0.55, pectoralHeight: 0.15, section: 'triangular', skin: 'scutes', scaleSize: 0,
  },
  pleco: {
    depth: 0.2, width: 0.3, depthPos: 0.3, widthPos: 0.28, headLength: 0.33, snout: 'rounded', mouth: 'sucker',
    eyeSize: 0.22, eyeHeight: 0.9, section: 'depressed', ventralFlat: 1, armored: true, adipose: true,
    caudal: C('emarginate', 0.3), dorsal: f(0.3, 0.5, 0.32, 'sail'), anal: f(0.62, 0.68, 0.1),
    pelvic: f(0.4, 0.5, 0.22), pectoral: f(0.22, 0.28, 0.28, 'pointed'), pectoralAngle: 1, pectoralHeight: 0.12,
    pelvicSpread: 0.9, tailTaper: 0.15, scaleSize: 0, skin: 'plates',
  },
  otocinclus: {
    depth: 0.18, width: 0.18, depthPos: 0.33, headLength: 0.28, mouth: 'sucker', eyeSize: 0.25, eyeHeight: 0.7,
    armored: true, ventralFlat: 0.7, caudal: C('emarginate', 0.28), dorsal: f(0.38, 0.48, 0.2, 'pointed'),
    anal: f(0.66, 0.72, 0.08), pelvic: f(0.42, 0.48, 0.14), pectoral: f(0.24, 0.28, 0.2, 'pointed'),
    pectoralAngle: 0.8, pectoralHeight: 0.15, section: 'depressed', skin: 'plates', scaleSize: 0,
  },
  catfish: {
    depth: 0.2, width: 0.16, depthPos: 0.35, headLength: 0.27, mouth: 'subterminal', mouthSize: 0.5, barbels: 6,
    barbelLength: 0.45, eyeSize: 0.22, eyeHeight: 0.5, adipose: true, caudal: C('forked', 0.3),
    dorsal: f(0.3, 0.38, 0.22, 'pointed'), anal: f(0.62, 0.82, 0.12), pectoral: f(0.26, 0.29, 0.2, 'pointed'),
    pectoralAngle: 0.5, pectoralHeight: 0.2, section: 'round', skin: 'naked', scaleSize: 0,
  },
  synodontis: {
    depth: 0.3, width: 0.18, depthPos: 0.38, headLength: 0.3, snout: 'pointed', mouth: 'inferior', barbels: 6,
    barbelLength: 0.25, eyeSize: 0.35, eyeHeight: 0.55, adipose: true, backArch: 0.4,
    caudal: C('deeply-forked', 0.32), dorsal: f(0.3, 0.38, 0.32, 'pointed'), anal: f(0.7, 0.8, 0.12),
    pectoral: f(0.27, 0.3, 0.24, 'pointed'), pectoralAngle: 0.4, section: 'round', skin: 'naked', scaleSize: 0,
  },
  'glass-catfish': {
    depth: 0.2, width: 0.07, depthPos: 0.3, headLength: 0.2, snout: 'pointed', mouth: 'superior', barbels: 2,
    barbelLength: 0.25, eyeSize: 0.35, caudal: C('forked', 0.32), dorsal: null, anal: f(0.33, 0.98, 0.08, 'low'),
    pelvic: f(0.3, 0.32, 0.05), pectoral: f(0.2, 0.22, 0.12), skin: 'naked', scaleSize: 0, tailTaper: 0.2,
  },
  'banjo-catfish': {
    depth: 0.15, width: 0.4, depthPos: 0.25, widthPos: 0.22, headLength: 0.4, eyeSize: 0.15, eyeHeight: 0.9,
    barbels: 6, barbelLength: 0.06, caudal: C('truncate', 0.15), dorsal: f(0.3, 0.4, 0.15),
    anal: f(0.55, 0.85, 0.06, 'low'), pectoral: f(0.2, 0.26, 0.2, 'pointed'), pectoralAngle: 0.9, pectoralHeight: 0.2,
    section: 'depressed', ventralFlat: 1, tailTaper: 0.3, skin: 'prickly', scaleSize: 0,
  },
  'shark-catfish': {
    depth: 0.27, width: 0.15, depthPos: 0.35, headLength: 0.25, mouth: 'subterminal', barbels: 4, barbelLength: 0.05,
    eyeSize: 0.28, eyeHeight: -0.2, adipose: true, caudal: C('deeply-forked', 0.35), dorsal: f(0.3, 0.38, 0.3, 'falcate'),
    anal: f(0.55, 0.85, 0.1), pectoral: f(0.24, 0.27, 0.2, 'pointed'), skin: 'naked', scaleSize: 0,
  },
  // ---------------------------------------------------------------- livebearers & killies
  livebearer: {
    depth: 0.27, width: 0.13, depthPos: 0.4, headLength: 0.25, mouth: 'superior', mouthSize: 0.2, eyeSize: 0.38,
    belly: 0.5, peduncle: 0.5, caudal: C('rounded', 0.32), dorsal: f(0.52, 0.64, 0.14), anal: f(0.55, 0.62, 0.12),
    pelvic: f(0.42, 0.45, 0.1), scaleSize: 0.5,
  },
  molly: {
    depth: 0.32, width: 0.15, headLength: 0.25, mouth: 'superior', mouthSize: 0.2, eyeSize: 0.33, belly: 0.55,
    peduncle: 0.55, caudal: C('truncate', 0.3), dorsal: f(0.4, 0.68, 0.2), anal: f(0.55, 0.62, 0.12), scaleSize: 0.5,
  },
  swordtail: {
    depth: 0.27, width: 0.13, headLength: 0.25, mouth: 'superior', mouthSize: 0.2, eyeSize: 0.33, belly: 0.45,
    peduncle: 0.5, caudal: C('truncate', 0.28), dorsal: f(0.42, 0.62, 0.16), anal: f(0.55, 0.62, 0.12),
    scaleSize: 0.5,
  },
  halfbeak: {
    depth: 0.14, width: 0.1, headLength: 0.22, snout: 'pointed', mouth: 'superior', mouthSize: 0.15, lowerJaw: 0.16,
    eyeSize: 0.35, eyeHeight: 0.45, caudal: C('rounded', 0.22), dorsal: f(0.68, 0.8, 0.12), anal: f(0.62, 0.8, 0.12),
    section: 'round', scaleSize: 0.4,
  },
  killifish: {
    depth: 0.25, width: 0.12, headLength: 0.27, mouth: 'superior', eyeSize: 0.35, eyeHeight: 0.45, peduncle: 0.5,
    backArch: -0.3, caudal: C('rounded', 0.3), dorsal: f(0.6, 0.76, 0.18), anal: f(0.55, 0.78, 0.18),
    scaleSize: 0.45,
  },
  rainbowfish: {
    depth: 0.35, width: 0.12, depthPos: 0.45, headLength: 0.24, snout: 'pointed', mouthSize: 0.2, eyeSize: 0.38,
    peduncle: 0.38, backArch: 0.4, caudal: C('forked', 0.3), dorsal: f(0.42, 0.5, 0.12, 'spiny'),
    dorsal2: f(0.55, 0.8, 0.2, 'pointed'), anal: f(0.47, 0.82, 0.18, 'pointed'), scaleSize: 0.55,
  },
  'blue-eye': {
    depth: 0.22, width: 0.1, headLength: 0.24, mouth: 'superior', mouthSize: 0.2, eyeSize: 0.45,
    caudal: C('emarginate', 0.3), dorsal: f(0.48, 0.54, 0.12), dorsal2: f(0.6, 0.76, 0.18, 'flowing'),
    anal: f(0.55, 0.78, 0.18, 'flowing'), scaleSize: 0.5,
  },
  ricefish: {
    depth: 0.2, width: 0.12, headLength: 0.24, mouth: 'superior', eyeSize: 0.42, backArch: -0.4,
    caudal: C('truncate', 0.25), dorsal: f(0.68, 0.75, 0.1), anal: f(0.5, 0.85, 0.12, 'low'), scaleSize: 0.4,
  },
  // ---------------------------------------------------------------- oddballs
  puffer: {
    depth: 0.42, width: 0.42, depthPos: 0.4, widthPos: 0.38, headLength: 0.38, snout: 'beak', mouthSize: 0.22,
    eyeSize: 0.36, eyeHeight: 0.6, peduncle: 0.3, belly: 0.8, caudal: C('rounded', 0.25),
    dorsal: f(0.66, 0.72, 0.13), anal: f(0.68, 0.74, 0.11), pelvic: null, pectoral: f(0.36, 0.4, 0.12, 'fan'),
    pectoralHeight: 0.45, section: 'round', skin: 'prickly', scaleSize: 0,
  },
  goby: {
    depth: 0.2, width: 0.16, depthPos: 0.35, headLength: 0.28, snout: 'blunt', eyeSize: 0.3, eyeHeight: 0.85,
    ventralFlat: 0.6, caudal: C('rounded', 0.25), dorsal: f(0.3, 0.42, 0.18), dorsal2: f(0.5, 0.8, 0.16),
    anal: f(0.55, 0.8, 0.12), pelvic: f(0.3, 0.38, 0.14, 'fan'), pectoral: f(0.25, 0.3, 0.22, 'fan'),
    pectoralHeight: 0.3, scaleSize: 0.4, section: 'round',
  },
  sleeper: {
    depth: 0.25, width: 0.15, headLength: 0.3, mouth: 'superior', mouthSize: 0.45, eyeSize: 0.3, eyeHeight: 0.6,
    caudal: C('rounded', 0.25), dorsal: f(0.32, 0.45, 0.18), dorsal2: f(0.52, 0.78, 0.18), anal: f(0.58, 0.8, 0.15),
    pelvic: f(0.3, 0.36, 0.14), scaleSize: 0.45,
  },
  'spiny-eel': {
    depth: 0.11, width: 0.08, depthPos: 0.45, headLength: 0.18, snout: 'tubular', snoutLength: 0.05, mouth: 'inferior',
    eyeSize: 0.25, eyeHeight: 0.4, dorsal: f(0.35, 0.95, 0.045, 'low'), anal: f(0.6, 0.95, 0.05, 'low'),
    caudal: C('continuous', 0.08), pectoral: f(0.18, 0.2, 0.06), pelvic: null, tailTaper: 0.3, section: 'round',
    skin: 'naked', scaleSize: 0,
  },
  eel: {
    depth: 0.08, width: 0.07, depthPos: 0.45, headLength: 0.14, eyeSize: 0.2, eyeHeight: 0.45,
    dorsal: f(0.35, 1, 0.04, 'low'), anal: f(0.45, 1, 0.04, 'low'), caudal: C('continuous', 0.06),
    pectoral: f(0.15, 0.17, 0.05), pelvic: null, tailTaper: 0.5, section: 'round', skin: 'naked', scaleSize: 0,
  },
  knifefish: {
    depth: 0.18, width: 0.08, depthPos: 0.3, headLength: 0.16, snout: 'blunt', eyeSize: 0.2, eyeHeight: 0.4,
    tailTaper: 0.9, dorsal: null, anal: f(0.18, 0.97, 0.1, 'low'), caudal: C('pointed', 0.05),
    pectoral: f(0.18, 0.2, 0.08), pelvic: null, skin: 'naked', scaleSize: 0.05, finRays: 2.5,
  },
  elephantnose: {
    depth: 0.2, width: 0.1, depthPos: 0.45, headLength: 0.25, mouthSize: 0.15, chinTrunk: 0.12, eyeSize: 0.12,
    peduncle: 0.2, dorsal: f(0.66, 0.86, 0.1, 'low'), anal: f(0.62, 0.86, 0.1, 'low'), caudal: C('deeply-forked', 0.28),
    pelvic: f(0.42, 0.44, 0.06), scaleSize: 0.05, skin: 'naked',
  },
  bichir: {
    depth: 0.12, width: 0.11, headLength: 0.2, eyeSize: 0.18, eyeHeight: 0.5, dorsal: f(0.35, 0.92, 0.06, 'spiny'),
    anal: f(0.85, 0.92, 0.05), caudal: C('rounded', 0.12), pectoral: f(0.18, 0.22, 0.12, 'fan'),
    pelvic: f(0.75, 0.78, 0.05), section: 'round', skin: 'ganoid', scaleSize: 0.7,
  },
  arowana: {
    depth: 0.24, width: 0.1, depthPos: 0.4, headLength: 0.24, snout: 'upturned', mouth: 'superior', mouthSize: 0.6,
    barbels: 2, barbelLength: 0.06, eyeSize: 0.25, eyeHeight: 0.5, backArch: -0.6, dorsal: f(0.62, 0.9, 0.08, 'low'),
    anal: f(0.58, 0.92, 0.08, 'low'), caudal: C('rounded', 0.2), pectoral: f(0.2, 0.24, 0.2, 'pointed'),
    scaleSize: 1,
  },
  gar: {
    depth: 0.12, width: 0.11, headLength: 0.3, snout: 'duckbill', snoutLength: 0.16, eyeSize: 0.2, eyeHeight: 0.5,
    dorsal: f(0.75, 0.85, 0.08), anal: f(0.75, 0.85, 0.08), caudal: C('rounded', 0.18), section: 'round',
    skin: 'ganoid', scaleSize: 0.7,
  },
  archerfish: {
    depth: 0.38, width: 0.13, headLength: 0.3, snout: 'pointed', mouth: 'superior', mouthSize: 0.45, eyeSize: 0.38,
    eyeHeight: 0.6, backArch: -1, belly: 0.6, dorsal: f(0.55, 0.75, 0.2, 'spiny'), anal: f(0.55, 0.85, 0.2),
    caudal: C('truncate', 0.25), scaleSize: 0.5,
  },
  glassfish: {
    depth: 0.4, width: 0.1, headLength: 0.3, snout: 'pointed', mouth: 'superior', eyeSize: 0.4,
    dorsal: f(0.35, 0.5, 0.25, 'spiny'), dorsal2: f(0.55, 0.8, 0.18, 'pointed'), anal: f(0.58, 0.82, 0.18, 'pointed'),
    caudal: C('deeply-forked', 0.3), scaleSize: 0.3,
  },
  leaffish: {
    depth: 0.48, width: 0.08, headLength: 0.4, snout: 'pointed', mouthSize: 0.7, eyeSize: 0.25, barbels: 1,
    barbelLength: 0.08, dorsal: f(0.35, 0.9, 0.15, 'spiny'), anal: f(0.6, 0.9, 0.15), caudal: C('rounded', 0.25),
    scaleSize: 0.3,
  },
  badis: {
    depth: 0.3, width: 0.12, headLength: 0.3, eyeSize: 0.33, caudal: C('rounded', 0.28),
    dorsal: f(0.3, 0.88, 0.18, 'spiny'), anal: f(0.62, 0.86, 0.15), scaleSize: 0.5,
  },
  'butterflyfish-fw': {
    depth: 0.2, width: 0.15, headLength: 0.28, mouth: 'superior', mouthSize: 0.5, eyeSize: 0.32, eyeHeight: 0.6,
    backArch: -1, pectoral: f(0.18, 0.25, 0.45, 'fan'), pectoralAngle: 0.95, pectoralHeight: 0.75,
    pelvic: f(0.38, 0.4, 0.4, 'filament'), dorsal: f(0.72, 0.8, 0.1), anal: f(0.6, 0.9, 0.12),
    caudal: C('pointed', 0.3), scaleSize: 0.45,
  },
  stingray: {
    kind: 'ray', depth: 0.09, width: 0.9, depthPos: 0.3, widthPos: 0.3, headLength: 0.2, mouth: 'inferior',
    eyeSize: 0.25, eyeHeight: 1, dorsal: null, dorsal2: null, anal: null, pectoral: null,
    pelvic: f(0.5, 0.58, 0.08, 'rounded'), caudal: C('none', 0), section: 'depressed', ventralFlat: 1,
    tailTaper: 1, skin: 'naked', scaleSize: 0,
  },
  needlefish: {
    depth: 0.08, width: 0.07, headLength: 0.32, snout: 'elongate', snoutLength: 0.22, eyeSize: 0.25,
    eyeHeight: 0.5, dorsal: f(0.75, 0.88, 0.08), anal: f(0.72, 0.88, 0.08), caudal: C('truncate', 0.15),
    section: 'round', scaleSize: 0.2,
  },
  scat: {
    depth: 0.65, width: 0.12, headLength: 0.25, snout: 'blunt', mouthSize: 0.2, eyeSize: 0.32,
    dorsal: f(0.3, 0.88, 0.22, 'spiny'), anal: f(0.6, 0.88, 0.2), caudal: C('truncate', 0.25), scaleSize: 0.2,
  },
  mono: {
    depth: 0.75, width: 0.08, headLength: 0.25, snout: 'pointed', mouthSize: 0.2, eyeSize: 0.4,
    dorsal: f(0.36, 0.75, 0.6, 'falcate'), anal: f(0.4, 0.75, 0.6, 'falcate'), pelvic: null,
    caudal: C('truncate', 0.22), scaleSize: 0.25,
  },
  sunfish: {
    depth: 0.45, width: 0.14, headLength: 0.3, eyeSize: 0.3, dorsal: f(0.3, 0.88, 0.2, 'spiny'),
    anal: f(0.6, 0.88, 0.15), caudal: C('emarginate', 0.3), scaleSize: 0.5,
  },
  perch: {
    depth: 0.3, width: 0.15, headLength: 0.3, snout: 'pointed', mouthSize: 0.5, eyeSize: 0.3,
    dorsal: f(0.28, 0.5, 0.2, 'spiny'), dorsal2: f(0.53, 0.75, 0.17), anal: f(0.62, 0.78, 0.14),
    caudal: C('emarginate', 0.28), scaleSize: 0.5,
  },
  stickleback: {
    depth: 0.24, width: 0.12, headLength: 0.3, snout: 'pointed', mouth: 'superior', eyeSize: 0.36, peduncle: 0.2,
    dorsal: f(0.55, 0.78, 0.12), anal: f(0.6, 0.78, 0.1), caudal: C('truncate', 0.22), pelvic: f(0.4, 0.43, 0.1, 'spiny'),
    skin: 'scutes', scaleSize: 0.2,
  },
  pike: {
    depth: 0.17, width: 0.13, headLength: 0.3, snout: 'duckbill', snoutLength: 0.05, mouthSize: 0.6, eyeSize: 0.25,
    eyeHeight: 0.6, dorsal: f(0.72, 0.85, 0.14), anal: f(0.74, 0.86, 0.12), caudal: C('forked', 0.25),
    section: 'round', scaleSize: 0.3,
  },
  lungfish: {
    depth: 0.13, width: 0.12, headLength: 0.18, eyeSize: 0.15, eyeHeight: 0.4, pectoral: f(0.18, 0.2, 0.25, 'filament'),
    pelvic: f(0.55, 0.57, 0.22, 'filament'), dorsal: f(0.5, 1, 0.06, 'low'), anal: f(0.7, 1, 0.05, 'low'),
    caudal: C('continuous', 0.06), tailTaper: 0.6, section: 'round', skin: 'naked', scaleSize: 0.15,
  },
  // ---------------------------------------------------------------- marine: damsels & relatives
  clownfish: {
    depth: 0.42, width: 0.15, headLength: 0.3, eyeSize: 0.33, peduncle: 0.45, caudal: C('rounded', 0.3),
    dorsal: f(0.3, 0.88, 0.22, 'spiny'), anal: f(0.6, 0.88, 0.18), pelvic: f(0.35, 0.4, 0.18),
    pectoral: f(0.3, 0.33, 0.18), scaleSize: 0.3,
  },
  damselfish: {
    depth: 0.45, width: 0.14, headLength: 0.28, mouthSize: 0.25, eyeSize: 0.36, caudal: C('forked', 0.3),
    dorsal: f(0.3, 0.88, 0.2, 'spiny'), anal: f(0.6, 0.88, 0.2, 'pointed'), pelvic: f(0.35, 0.4, 0.2, 'pointed'),
    scaleSize: 0.4,
  },
  chromis: {
    depth: 0.4, width: 0.13, headLength: 0.27, mouthSize: 0.25, eyeSize: 0.38, caudal: C('deeply-forked', 0.35),
    dorsal: f(0.3, 0.85, 0.18, 'spiny'), anal: f(0.6, 0.85, 0.18, 'pointed'), pelvic: f(0.35, 0.4, 0.2, 'pointed'),
    scaleSize: 0.4,
  },
  anthias: {
    depth: 0.36, width: 0.13, headLength: 0.28, snout: 'pointed', eyeSize: 0.38, caudal: C('lunate', 0.38),
    dorsal: f(0.28, 0.85, 0.18, 'spiny'), anal: f(0.6, 0.85, 0.18, 'pointed'), pelvic: f(0.32, 0.36, 0.28, 'pointed'),
    scaleSize: 0.35,
  },
  basslet: {
    depth: 0.3, width: 0.13, headLength: 0.28, eyeSize: 0.36, caudal: C('emarginate', 0.3),
    dorsal: f(0.3, 0.88, 0.16), anal: f(0.6, 0.88, 0.16), pelvic: f(0.32, 0.36, 0.25, 'pointed'), scaleSize: 0.35,
  },
  dottyback: {
    depth: 0.28, width: 0.13, headLength: 0.28, eyeSize: 0.35, caudal: C('rounded', 0.28),
    dorsal: f(0.3, 0.86, 0.13), anal: f(0.6, 0.86, 0.12), scaleSize: 0.3,
  },
  cardinalfish: {
    depth: 0.42, width: 0.15, headLength: 0.35, mouthSize: 0.5, eyeSize: 0.45, peduncle: 0.4,
    dorsal: f(0.35, 0.45, 0.25, 'spiny'), dorsal2: f(0.55, 0.68, 0.25, 'pointed'), anal: f(0.6, 0.72, 0.2, 'pointed'),
    pelvic: f(0.33, 0.37, 0.22, 'pointed'), caudal: C('forked', 0.3), scaleSize: 0.5,
  },
  hawkfish: {
    depth: 0.3, width: 0.15, headLength: 0.3, eyeSize: 0.35, eyeHeight: 0.6, cirri: 1,
    dorsal: f(0.3, 0.85, 0.2, 'spiny'), anal: f(0.62, 0.85, 0.15), pectoral: f(0.3, 0.34, 0.25),
    pectoralHeight: 0.25, caudal: C('truncate', 0.28), scaleSize: 0.4,
  },
  // ---------------------------------------------------------------- surgeons, angels, butterflies
  tang: {
    depth: 0.55, width: 0.11, depthPos: 0.45, headLength: 0.28, snout: 'rounded', mouthSize: 0.18, eyeSize: 0.28,
    eyeHeight: 0.55, peduncle: 0.25, scalpel: true, caudal: C('emarginate', 0.32), dorsal: f(0.25, 0.88, 0.15),
    anal: f(0.45, 0.88, 0.15), pelvic: f(0.36, 0.4, 0.12), pectoral: f(0.28, 0.32, 0.22, 'pointed'),
    pectoralHeight: 0.42, scaleSize: 0.1,
  },
  rabbitfish: {
    depth: 0.4, width: 0.12, headLength: 0.25, snout: 'blunt', mouthSize: 0.15, eyeSize: 0.33,
    dorsal: f(0.25, 0.9, 0.15, 'spiny'), anal: f(0.55, 0.9, 0.12, 'spiny'), caudal: C('emarginate', 0.3),
    scaleSize: 0.1,
  },
  'marine-angel': {
    depth: 0.6, width: 0.12, depthPos: 0.45, headLength: 0.25, snout: 'blunt', mouthSize: 0.18, eyeSize: 0.28,
    dorsal: f(0.3, 0.92, 0.3, 'rounded'), anal: f(0.45, 0.92, 0.28), caudal: C('rounded', 0.28),
    pelvic: f(0.34, 0.38, 0.2, 'pointed'), scaleSize: 0.2,
  },
  'dwarf-angel': {
    depth: 0.48, width: 0.13, headLength: 0.27, mouthSize: 0.18, eyeSize: 0.33, dorsal: f(0.3, 0.9, 0.2),
    anal: f(0.52, 0.9, 0.18), caudal: C('rounded', 0.28), pelvic: f(0.34, 0.38, 0.18, 'pointed'), scaleSize: 0.25,
  },
  butterflyfish: {
    depth: 0.62, width: 0.09, depthPos: 0.45, headLength: 0.3, snout: 'pointed', mouthSize: 0.15, eyeSize: 0.3,
    dorsal: f(0.3, 0.92, 0.2), anal: f(0.5, 0.92, 0.2), caudal: C('truncate', 0.25), pelvic: f(0.36, 0.4, 0.18, 'pointed'),
    scaleSize: 0.3,
  },
  'moorish-idol': {
    depth: 0.7, width: 0.08, depthPos: 0.45, headLength: 0.3, snout: 'tubular', snoutLength: 0.1, mouthSize: 0.15,
    eyeSize: 0.3, eyeHeight: 0.5, dorsal: f(0.28, 0.85, 1.0, 'filament', 0.8), anal: f(0.45, 0.85, 0.4, 'falcate'),
    caudal: C('lunate', 0.3), pelvic: f(0.36, 0.4, 0.2, 'pointed'), scaleSize: 0.1,
  },
  // ---------------------------------------------------------------- wrasses
  wrasse: {
    depth: 0.26, width: 0.13, headLength: 0.28, snout: 'pointed', mouthSize: 0.25, lips: 0.45, eyeSize: 0.28,
    dorsal: f(0.25, 0.88, 0.11), anal: f(0.55, 0.88, 0.1), caudal: C('rounded', 0.25),
    pectoral: f(0.28, 0.32, 0.18, 'pointed'), pectoralHeight: 0.42, scaleSize: 0.45,
  },
  'fairy-wrasse': {
    depth: 0.27, width: 0.12, headLength: 0.27, snout: 'pointed', mouthSize: 0.22, eyeSize: 0.35,
    dorsal: f(0.25, 0.9, 0.15), anal: f(0.55, 0.9, 0.13), caudal: C('rounded', 0.3),
    pelvic: f(0.33, 0.37, 0.25, 'pointed'), pectoral: f(0.28, 0.32, 0.18, 'pointed'), pectoralHeight: 0.42,
    scaleSize: 0.45,
  },
  hogfish: {
    depth: 0.35, width: 0.14, headLength: 0.32, snout: 'pointed', lips: 0.4, eyeSize: 0.28,
    dorsal: f(0.25, 0.88, 0.15, 'spiny'), anal: f(0.6, 0.88, 0.14), caudal: C('truncate', 0.28), scaleSize: 0.5,
  },
  parrotfish: {
    depth: 0.35, width: 0.16, headLength: 0.28, snout: 'beak', mouthSize: 0.2, eyeSize: 0.25,
    dorsal: f(0.28, 0.88, 0.12), anal: f(0.6, 0.88, 0.11), caudal: C('emarginate', 0.3), scaleSize: 0.9,
  },
  // ---------------------------------------------------------------- blennies, gobies & co.
  blenny: {
    depth: 0.2, width: 0.13, headLength: 0.22, snout: 'blunt', mouth: 'subterminal', eyeSize: 0.33, eyeHeight: 0.8,
    cirri: 1, dorsal: f(0.22, 0.92, 0.14), anal: f(0.5, 0.9, 0.1), caudal: C('rounded', 0.22),
    pelvic: f(0.18, 0.2, 0.12), pectoral: f(0.22, 0.26, 0.2, 'fan'), ventralFlat: 0.4, skin: 'naked', scaleSize: 0,
  },
  'marine-goby': {
    depth: 0.2, width: 0.15, headLength: 0.28, snout: 'blunt', eyeSize: 0.3, eyeHeight: 0.8, ventralFlat: 0.5,
    caudal: C('rounded', 0.28), dorsal: f(0.3, 0.42, 0.18), dorsal2: f(0.5, 0.8, 0.16), anal: f(0.55, 0.8, 0.12),
    pelvic: f(0.3, 0.38, 0.14, 'fan'), pectoral: f(0.25, 0.3, 0.2, 'fan'), section: 'round', scaleSize: 0.3,
  },
  dartfish: {
    depth: 0.17, width: 0.11, headLength: 0.22, mouth: 'superior', eyeSize: 0.33, dorsal: f(0.25, 0.34, 0.6, 'filament'),
    dorsal2: f(0.48, 0.86, 0.16), anal: f(0.5, 0.86, 0.14), caudal: C('rounded', 0.3), scaleSize: 0.2,
  },
  jawfish: {
    depth: 0.18, width: 0.14, headLength: 0.32, mouthSize: 0.6, eyeSize: 0.4, eyeHeight: 0.8, tailTaper: 0.2,
    dorsal: f(0.28, 0.92, 0.1, 'low'), anal: f(0.5, 0.92, 0.09, 'low'), caudal: C('rounded', 0.25), scaleSize: 0.2,
    section: 'round',
  },
  dragonet: {
    depth: 0.2, width: 0.22, depthPos: 0.35, headLength: 0.3, snout: 'pointed', mouth: 'subterminal', mouthSize: 0.15,
    eyeSize: 0.4, eyeHeight: 0.85, ventralFlat: 0.7, section: 'depressed', dorsal: f(0.3, 0.42, 0.3, 'spiny'),
    dorsal2: f(0.5, 0.82, 0.2), anal: f(0.55, 0.82, 0.12), pelvic: f(0.22, 0.3, 0.2, 'fan'),
    pectoral: f(0.28, 0.33, 0.2, 'fan'), pectoralAngle: 0.6, pelvicSpread: 0.9, caudal: C('rounded', 0.3),
    skin: 'naked', scaleSize: 0,
  },
  // ---------------------------------------------------------------- syngnathids, scorpaenids & big reef fish
  seahorse: {
    kind: 'seahorse', depth: 0.25, width: 0.14, headLength: 0.2, snout: 'tubular', mouthSize: 0.1, eyeSize: 0.3,
    dorsal: f(0.45, 0.6, 0.08, 'fan'), anal: null, pelvic: null, pectoral: f(0.2, 0.22, 0.05, 'fan'),
    caudal: C('none', 0), skin: 'rings', scaleSize: 0,
  },
  pipefish: {
    depth: 0.06, width: 0.06, headLength: 0.18, snout: 'tubular', snoutLength: 0.08, mouthSize: 0.1, eyeSize: 0.3,
    eyeHeight: 0.5, dorsal: f(0.45, 0.6, 0.05, 'low'), anal: null, pelvic: null, pectoral: f(0.18, 0.19, 0.03, 'fan'),
    caudal: C('fan', 0.06), section: 'boxy', skin: 'rings', scaleSize: 0,
  },
  lionfish: {
    depth: 0.35, width: 0.15, headLength: 0.35, snout: 'blunt', mouthSize: 0.55, eyeSize: 0.3, eyeHeight: 0.6, cirri: 1,
    dorsal: f(0.28, 0.58, 0.6, 'spiny'), dorsal2: f(0.6, 0.85, 0.25), anal: f(0.65, 0.82, 0.2),
    pectoral: f(0.3, 0.36, 0.65, 'fan'), pectoralAngle: 0.5, pelvic: f(0.35, 0.4, 0.3), caudal: C('rounded', 0.28),
    finRays: 0.7, skin: 'naked', scaleSize: 0.15,
  },
  scorpionfish: {
    depth: 0.35, width: 0.2, headLength: 0.4, snout: 'blunt', mouth: 'superior', mouthSize: 0.6, eyeSize: 0.25,
    eyeHeight: 0.75, cirri: 1, dorsal: f(0.28, 0.85, 0.22, 'spiny'), anal: f(0.62, 0.82, 0.18),
    pectoral: f(0.3, 0.36, 0.3, 'fan'), caudal: C('rounded', 0.25), skin: 'naked', scaleSize: 0.15,
  },
  frogfish: {
    depth: 0.55, width: 0.4, depthPos: 0.45, headLength: 0.4, snout: 'blunt', mouth: 'superior', mouthSize: 0.7,
    eyeSize: 0.15, eyeHeight: 0.6, illicium: true, belly: 0.8, dorsal: f(0.45, 0.85, 0.25), anal: f(0.65, 0.85, 0.15),
    pectoral: f(0.45, 0.5, 0.2), pectoralHeight: 0.2, pelvic: f(0.3, 0.35, 0.15), caudal: C('rounded', 0.25),
    section: 'round', skin: 'prickly', scaleSize: 0,
  },
  grouper: {
    depth: 0.3, width: 0.16, headLength: 0.38, snout: 'pointed', mouthSize: 0.55, lowerJaw: 0.02, eyeSize: 0.22,
    eyeHeight: 0.55, dorsal: f(0.3, 0.85, 0.14, 'spiny'), anal: f(0.65, 0.85, 0.14), caudal: C('rounded', 0.25),
    scaleSize: 0.2,
  },
  squirrelfish: {
    depth: 0.33, width: 0.14, headLength: 0.3, snout: 'pointed', eyeSize: 0.5, dorsal: f(0.28, 0.6, 0.22, 'spiny'),
    dorsal2: f(0.62, 0.78, 0.2, 'pointed'), anal: f(0.65, 0.8, 0.2, 'pointed'), caudal: C('deeply-forked', 0.32),
    scaleSize: 0.8,
  },
  sweetlips: {
    depth: 0.38, width: 0.15, headLength: 0.3, snout: 'blunt', lips: 1, eyeSize: 0.28, dorsal: f(0.3, 0.88, 0.15, 'spiny'),
    anal: f(0.62, 0.86, 0.15), caudal: C('truncate', 0.28), scaleSize: 0.35,
  },
  snapper: {
    depth: 0.35, width: 0.14, headLength: 0.32, snout: 'pointed', mouthSize: 0.45, eyeSize: 0.3,
    dorsal: f(0.3, 0.85, 0.16, 'spiny'), anal: f(0.65, 0.82, 0.15, 'pointed'), caudal: C('emarginate', 0.3),
    scaleSize: 0.5,
  },
  batfish: {
    depth: 0.75, width: 0.1, headLength: 0.25, snout: 'blunt', eyeSize: 0.3, dorsal: f(0.3, 0.85, 0.9, 'falcate'),
    anal: f(0.4, 0.85, 0.8, 'falcate'), pelvic: f(0.3, 0.34, 0.4, 'pointed'), caudal: C('emarginate', 0.25),
    scaleSize: 0.25,
  },
  // ---------------------------------------------------------------- tetraodontiforms, eels, elasmobranchs
  triggerfish: {
    depth: 0.5, width: 0.13, depthPos: 0.45, headLength: 0.38, snout: 'pointed', mouthSize: 0.15, eyeSize: 0.25,
    eyeHeight: 0.8, dorsal: f(0.36, 0.42, 0.18, 'spiny'), dorsal2: f(0.55, 0.85, 0.18), anal: f(0.55, 0.85, 0.17),
    pelvic: null, caudal: C('truncate', 0.28), skin: 'plates', scaleSize: 0.6,
  },
  filefish: {
    depth: 0.5, width: 0.08, headLength: 0.33, snout: 'pointed', mouthSize: 0.12, eyeSize: 0.28, eyeHeight: 0.8,
    dorsal: f(0.3, 0.33, 0.2, 'spiny'), dorsal2: f(0.55, 0.85, 0.12), anal: f(0.55, 0.85, 0.12), pelvic: null,
    caudal: C('rounded', 0.28), skin: 'prickly', scaleSize: 0,
  },
  'marine-puffer': {
    depth: 0.45, width: 0.4, depthPos: 0.4, widthPos: 0.38, headLength: 0.38, snout: 'beak', mouthSize: 0.2,
    eyeSize: 0.3, eyeHeight: 0.6, belly: 0.8, peduncle: 0.3, caudal: C('rounded', 0.25), dorsal: f(0.66, 0.72, 0.13),
    anal: f(0.68, 0.74, 0.11), pelvic: null, pectoral: f(0.36, 0.4, 0.12, 'fan'), pectoralHeight: 0.45,
    section: 'round', skin: 'prickly', scaleSize: 0,
  },
  boxfish: {
    depth: 0.38, width: 0.32, depthPos: 0.45, widthPos: 0.45, headLength: 0.3, snout: 'blunt', mouthSize: 0.12,
    lips: 0.6, eyeSize: 0.33, eyeHeight: 0.6, peduncle: 0.18, ventralFlat: 1, armored: true,
    dorsal: f(0.66, 0.72, 0.1), anal: f(0.7, 0.75, 0.08), pelvic: null, pectoral: f(0.32, 0.36, 0.1, 'fan'),
    pectoralHeight: 0.4, caudal: C('rounded', 0.3), section: 'boxy', skin: 'hex', scaleSize: 0,
  },
  cowfish: {
    depth: 0.36, width: 0.3, depthPos: 0.45, widthPos: 0.45, headLength: 0.3, snout: 'blunt', mouthSize: 0.12,
    lips: 0.6, eyeSize: 0.33, eyeHeight: 0.7, peduncle: 0.18, ventralFlat: 1, armored: true, horns: 1,
    dorsal: f(0.66, 0.72, 0.1), anal: f(0.7, 0.75, 0.08), pelvic: null, pectoral: f(0.32, 0.36, 0.1, 'fan'),
    pectoralHeight: 0.4, caudal: C('rounded', 0.4), section: 'triangular', skin: 'hex', scaleSize: 0,
  },
  moray: {
    depth: 0.1, width: 0.08, depthPos: 0.4, headLength: 0.15, snout: 'pointed', mouthSize: 0.75, eyeSize: 0.2,
    eyeHeight: 0.5, dorsal: f(0.15, 1, 0.05, 'low'), anal: f(0.45, 1, 0.04, 'low'), caudal: C('continuous', 0.05),
    pectoral: null, pelvic: null, tailTaper: 0.6, section: 'round', skin: 'naked', scaleSize: 0,
  },
  'garden-eel': {
    depth: 0.04, width: 0.04, headLength: 0.08, mouth: 'superior', eyeSize: 0.4, eyeHeight: 0.4,
    dorsal: f(0.15, 1, 0.02, 'low'), anal: f(0.5, 1, 0.015, 'low'), caudal: C('continuous', 0.03),
    pectoral: f(0.09, 0.1, 0.02), pelvic: null, tailTaper: 0.8, section: 'round', skin: 'naked', scaleSize: 0,
  },
  shark: {
    depth: 0.13, width: 0.13, depthPos: 0.35, headLength: 0.2, mouth: 'subterminal', barbels: 2, barbelLength: 0.03,
    eyeSize: 0.15, eyeHeight: 0.6, dorsal: f(0.45, 0.52, 0.1, 'pointed'), dorsal2: f(0.6, 0.66, 0.09, 'pointed'),
    anal: f(0.7, 0.76, 0.06), pectoral: f(0.2, 0.28, 0.18), pectoralAngle: 0.7, pelvic: f(0.42, 0.5, 0.12),
    pelvicSpread: 0.8, caudal: C('pointed', 0.3), section: 'round', skin: 'naked', scaleSize: 0, tailTaper: 0.2,
  },
  ray: {
    kind: 'ray', depth: 0.08, width: 0.75, depthPos: 0.3, widthPos: 0.3, headLength: 0.2, mouth: 'inferior',
    eyeSize: 0.28, eyeHeight: 1, dorsal: null, dorsal2: null, anal: null, pectoral: null,
    pelvic: f(0.5, 0.58, 0.08, 'rounded'), caudal: C('none', 0), section: 'depressed', ventralFlat: 1,
    tailTaper: 1, skin: 'naked', scaleSize: 0,
  },
  // ---------------------------------------------------------------- invertebrates (own builders)
  shrimp: { kind: 'shrimp', depth: 0.23, width: 0.17, backArch: 0.45 },
  snail: { kind: 'snail', depth: 0.6, width: 0.7 },
  crab: { kind: 'crab', depth: 0.35, width: 0.9 },
  'hermit-crab': { kind: 'hermit-crab', depth: 0.6, width: 0.5 },
  crayfish: { kind: 'crayfish', depth: 0.22, width: 0.3 },
  starfish: { kind: 'starfish', depth: 0.12, width: 1 },
  'brittle-star': { kind: 'brittle-star', depth: 0.08, width: 0.5 },
  urchin: { kind: 'urchin', depth: 0.5, width: 1 },
};

/** Archetypes whose males have a gonopodium (rod-shaped anal fin). */
const POECILIIDS = new Set<Archetype>(['livebearer', 'molly', 'swordtail', 'halfbeak']);

/** Sex-specific archetype defaults that species data rarely restates. */
function sexDefaults(arch: Archetype, sex: Sex, hasCaudalOverride: boolean): Preset {
  const out: Preset = {};
  if (sex === 'male' && POECILIIDS.has(arch)) {
    out.gonopodium = true;
    out.belly = 0.25;
    if (arch === 'swordtail' && !hasCaudalOverride) out.caudal = { shape: 'sword', size: 0.85 };
  }
  return out;
}

/** Does the sex change the look of this species (→ separate render variant)? */
export function sexMatters(sp: Species, sex: Sex): boolean {
  if (sex === 'unknown') return false;
  const ov = sex === 'male' ? sp.male : sp.female;
  if (ov && (ov.look || ov.body)) return true;
  return sex === 'male' && POECILIIDS.has(sp.body.archetype);
}

/** Render-variant key: one instanced mesh per species × visually distinct sex. */
export function variantKey(sp: Species, sex: Sex): string {
  return sexMatters(sp, sex) ? `${sp.id}|${sex}` : sp.id;
}

const clamp = (v: number, lo: number, hi: number) => (v < lo ? lo : v > hi ? hi : v);

function finFrom(spec: FinSpec, fallback: FinDef | null): FinDef {
  const start = clamp(spec.start, 0, 1.05);
  const end = clamp(Math.max(spec.end, start + 0.005), 0, 1.05);
  return {
    start,
    end,
    height: clamp(spec.height, 0, 2.5),
    shape: spec.shape ?? fallback?.shape ?? 'rounded',
    trail: clamp(spec.trail ?? 0, 0, 2.5),
  };
}

const FIN_KEYS = ['dorsal', 'dorsal2', 'anal', 'pelvic', 'pectoral'] as const;

function applyPlan(out: ResolvedBody, plan: Partial<BodyPlan> | undefined, archFins: ResolvedBody): void {
  if (!plan) return;
  const num = (k: keyof BodyPlan & keyof ResolvedBody, lo: number, hi: number) => {
    const v = plan[k];
    if (typeof v === 'number' && Number.isFinite(v)) (out as unknown as Record<string, number>)[k] = clamp(v, lo, hi);
  };
  num('depth', 0.03, 1.4);
  num('width', 0.02, 1.4);
  num('depthPos', 0.15, 0.75);
  num('headLength', 0.06, 0.6);
  num('eyeSize', 0.05, 0.7);
  num('peduncle', 0.08, 1);
  num('belly', 0, 1);
  num('backArch', -1, 1);
  num('hump', 0, 1);
  num('barbels', 0, 12);
  num('barbelLength', 0, 1.5);
  num('scaleSize', 0, 1);
  if (plan.snout) out.snout = plan.snout;
  if (plan.mouth) out.mouth = plan.mouth;
  if (typeof plan.adipose === 'boolean') out.adipose = plan.adipose;
  if (typeof plan.armored === 'boolean') {
    out.armored = plan.armored;
    if (plan.armored && out.skin === 'scaled') out.skin = 'scutes';
  }
  if (plan.caudal) {
    out.caudal = {
      shape: plan.caudal.shape ?? out.caudal.shape,
      size: clamp(plan.caudal.size ?? out.caudal.size ?? 0.3, 0, 2.5),
    };
  }
  for (const k of FIN_KEYS) {
    const v = plan[k];
    if (v === null) out[k] = null;
    else if (v && typeof v === 'object') out[k] = finFrom(v, out[k] ?? archFins[k] ?? DEFAULT[k]);
  }
}

/**
 * Archetype preset → species body → sex override (and sex-specific archetype defaults).
 * Always returns a complete, sanitized body plan, even for unusual data.
 */
export function resolveBody(sp: Species, sex: Sex): ResolvedBody {
  const arch: Archetype = ARCHETYPE_PRESETS[sp.body.archetype] ? sp.body.archetype : 'tetra';
  const preset = ARCHETYPE_PRESETS[arch];
  const base: ResolvedBody = { ...DEFAULT, ...preset, archetype: arch };
  // Deep-copy fins so later mutation never leaks into the shared preset table.
  for (const k of FIN_KEYS) base[k] = base[k] ? { ...base[k]! } : null;
  base.caudal = { ...base.caudal };
  const out: ResolvedBody = { ...base };
  applyPlan(out, sp.body, base);
  const ov = sex === 'male' ? sp.male : sex === 'female' ? sp.female : undefined;
  const sexPre = sexDefaults(arch, sex, !!(ov?.body?.caudal || sp.body.caudal));
  Object.assign(out, sexPre);
  applyPlan(out, ov?.body, base);
  // Only male swordtails carry the sword, even if the species entry put it on the species body.
  if (sex === 'female' && out.caudal.shape === 'sword' && !ov?.body?.caudal) out.caudal = { shape: 'truncate', size: 0.3 };
  // Gonopodium: males' anal fin is a narrow forward rod, unless data defines an anal fin for males.
  if (out.gonopodium && ov?.body?.anal) out.gonopodium = false;
  // Fish living with their tail continuous with the fins.
  if (out.caudal.shape === 'continuous') {
    if (out.dorsal) out.dorsal.end = Math.max(out.dorsal.end, 1);
    if (out.anal) out.anal.end = Math.max(out.anal.end, 1);
  }
  return out;
}

/** Appearance with the sex override merged on top (fins merged per fin). */
export function resolveLook(sp: Species, sex: Sex): Appearance {
  const base = sp.look;
  const ov = sex === 'male' ? sp.male?.look : sex === 'female' ? sp.female?.look : undefined;
  if (!ov) return base;
  const out: Appearance = { ...base, ...ov } as Appearance;
  if (base.fins || ov.fins) {
    const fins: NonNullable<Appearance['fins']> = {};
    for (const k of ['dorsal', 'caudal', 'anal', 'pelvic', 'pectoral'] as const) {
      const a = base.fins?.[k], b = ov.fins?.[k];
      if (a || b) fins[k] = { ...(a ?? {}), ...(b ?? {}) } as FinLook;
    }
    out.fins = fins;
  }
  return out;
}
