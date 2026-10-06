import type { Archetype, FishEntity, FishState, FoodKind, Sex, Species } from '../core/types';
import { MS_PER_YEAR } from '../core/clock';
import { FOODS } from '../data/foods';
import { clamp } from './simMath';

/**
 * Pure per-animal biology: body mass from the body plan, von Bertalanffy growth, stomach
 * capacity & metabolic needs (allometric, temperature-dependent), Gompertz senescence and the
 * trophic relationships (gape, fin-nipping, invert-eating, grazing) the rest of the sim uses.
 *
 * Every function here is allocation-free and cheap enough for the per-fish hot path.
 */

export const MS_PER_MONTH = MS_PER_YEAR / 12;
export const SECONDS_PER_DAY = 86_400;

// ---------------------------------------------------------------------------------------------
// Allometry
// ---------------------------------------------------------------------------------------------

/** Reference animal for all allometric scaling: a generic 3 cm fish of ≈0.3 g. */
export const REF_MASS_G = 0.3;

/**
 * Standard length / total length. The caudal fin is ~18% of TL in a typical fish
 * (FishBase length–length relationships cluster around SL ≈ 0.80–0.85·TL).
 */
const SL_OVER_TL = 0.82;
/** Fish tissue density (g/cm³). */
const TISSUE_DENSITY = 1.05;

/** Body depth/width (relative to SL) when the species data leaves them to the archetype. */
const ARCHETYPE_DEPTH_WIDTH: Partial<Record<Archetype, [number, number]>> = {
  tetra: [0.28, 0.11], pencilfish: [0.17, 0.1], hatchetfish: [0.5, 0.1], headstander: [0.24, 0.13],
  piranha: [0.5, 0.18], pacu: [0.55, 0.16], barb: [0.36, 0.14], danio: [0.2, 0.1], rasbora: [0.26, 0.11],
  minnow: [0.22, 0.12], 'shark-minnow': [0.25, 0.13], carp: [0.3, 0.16], goldfish: [0.4, 0.22],
  'fancy-goldfish': [0.55, 0.35], koi: [0.3, 0.17], loach: [0.2, 0.14], botia: [0.28, 0.14],
  'hillstream-loach': [0.12, 0.3], kuhli: [0.09, 0.08], 'algae-eater': [0.2, 0.15], cichlid: [0.4, 0.15],
  'dwarf-cichlid': [0.36, 0.14], discus: [0.85, 0.1], angelfish: [0.6, 0.08], oscar: [0.42, 0.18],
  mbuna: [0.33, 0.15], frontosa: [0.42, 0.17], geophagus: [0.38, 0.15], gourami: [0.42, 0.12],
  betta: [0.28, 0.13], 'paradise-fish': [0.3, 0.12], snakehead: [0.18, 0.15], corydoras: [0.38, 0.22],
  pleco: [0.2, 0.28], otocinclus: [0.2, 0.2], catfish: [0.22, 0.18], synodontis: [0.3, 0.2],
  'glass-catfish': [0.2, 0.06], 'banjo-catfish': [0.15, 0.3], 'shark-catfish': [0.3, 0.17],
  livebearer: [0.27, 0.13], molly: [0.33, 0.14], swordtail: [0.27, 0.13], halfbeak: [0.13, 0.1],
  killifish: [0.24, 0.13], rainbowfish: [0.38, 0.11], 'blue-eye': [0.22, 0.1], ricefish: [0.22, 0.12],
  puffer: [0.4, 0.36], goby: [0.2, 0.17], sleeper: [0.24, 0.18], 'spiny-eel': [0.1, 0.08], eel: [0.08, 0.08],
  knifefish: [0.2, 0.07], elephantnose: [0.2, 0.1], bichir: [0.13, 0.13], arowana: [0.24, 0.1],
  gar: [0.13, 0.12], archerfish: [0.38, 0.13], glassfish: [0.38, 0.1], leaffish: [0.42, 0.11],
  badis: [0.3, 0.13], 'butterflyfish-fw': [0.25, 0.15], stingray: [0.08, 0.6], needlefish: [0.07, 0.06],
  scat: [0.7, 0.12], mono: [0.75, 0.1], sunfish: [0.45, 0.13], perch: [0.3, 0.14], stickleback: [0.22, 0.11],
  pike: [0.16, 0.12], lungfish: [0.14, 0.13],
  clownfish: [0.42, 0.16], damselfish: [0.45, 0.15], chromis: [0.42, 0.14], anthias: [0.36, 0.13],
  basslet: [0.3, 0.13], dottyback: [0.28, 0.13], cardinalfish: [0.38, 0.15], hawkfish: [0.3, 0.17],
  tang: [0.55, 0.11], rabbitfish: [0.45, 0.13], 'marine-angel': [0.65, 0.13], 'dwarf-angel': [0.55, 0.14],
  butterflyfish: [0.65, 0.1], 'moorish-idol': [0.8, 0.1], wrasse: [0.27, 0.13], 'fairy-wrasse': [0.26, 0.12],
  hogfish: [0.33, 0.14], parrotfish: [0.35, 0.17], blenny: [0.2, 0.15], 'marine-goby': [0.18, 0.15],
  dartfish: [0.17, 0.12], jawfish: [0.2, 0.16], dragonet: [0.2, 0.22], seahorse: [0.25, 0.15],
  pipefish: [0.06, 0.06], lionfish: [0.33, 0.16], scorpionfish: [0.33, 0.2], frogfish: [0.55, 0.4],
  grouper: [0.32, 0.17], squirrelfish: [0.38, 0.14], sweetlips: [0.4, 0.15], snapper: [0.38, 0.14],
  batfish: [0.85, 0.1], triggerfish: [0.5, 0.16], filefish: [0.5, 0.08], 'marine-puffer': [0.42, 0.38],
  boxfish: [0.38, 0.33], cowfish: [0.38, 0.33], moray: [0.08, 0.08], 'garden-eel': [0.05, 0.05],
  shark: [0.17, 0.15], ray: [0.08, 0.6],
};

/**
 * Bodies far from an ellipsoid: a seahorse's "length" is mostly a thin prehensile tail (a 15 cm
 * Hippocampus kuda weighs ~10 g), pipefish and needlefish are pencils, rays and stingrays are
 * flat discs with a whip tail.
 */
const FORM_FACTOR: Partial<Record<Archetype, number>> = {
  seahorse: 0.3, pipefish: 0.5, needlefish: 0.6, 'garden-eel': 0.6, stingray: 0.55, ray: 0.55,
  lionfish: 0.8, batfish: 0.75, 'moorish-idol': 0.75,
};

const massCoefCache = new WeakMap<Species, number>();

/**
 * Coefficient `a` of W(g) = a·TL³ for this species, from its body plan.
 *
 * Fish: an ellipsoid of length SL, depth d·SL and width w·SL at tissue density 1.05 g/cm³.
 * A generic body (d 0.28, w 0.13) gives a ≈ 0.011, matching the FishBase median length–weight
 * relationship (a ≈ 0.01, b ≈ 3). Discus come out at ≈ 0.026, kuhli loaches at ≈ 0.002.
 * Invertebrates use group values for soft-tissue mass (snail shells don't respire).
 */
export function massCoefficient(sp: Species): number {
  let a = massCoefCache.get(sp);
  if (a !== undefined) return a;
  switch (sp.group) {
    case 'shrimp':
      a = 0.0095; // cherry shrimp 2.5 cm ≈ 0.15 g, amano 4.5 cm ≈ 0.85 g
      break;
    case 'snail':
      a = 0.012; // flesh only: nerite 2.2 cm ≈ 0.13 g
      break;
    case 'crab':
    case 'crayfish':
      a = 0.025;
      break;
    case 'starfish':
      a = 0.006;
      break;
    case 'urchin':
      a = 0.02;
      break;
    default: {
      const dw = ARCHETYPE_DEPTH_WIDTH[sp.body.archetype];
      const d = clamp(sp.body.depth ?? dw?.[0] ?? 0.28, 0.03, 1.4);
      const w = clamp(sp.body.width ?? dw?.[1] ?? 0.13, 0.03, 1.4);
      a = TISSUE_DENSITY * (Math.PI / 6) * SL_OVER_TL ** 3 * d * w * (FORM_FACTOR[sp.body.archetype] ?? 1);
    }
  }
  massCoefCache.set(sp, a);
  return a;
}

/** Live body mass (g) of an animal of this species at total length `lengthCm`. */
export function massG(sp: Species, lengthCm: number): number {
  return massCoefficient(sp) * lengthCm * lengthCm * lengthCm;
}

// ---------------------------------------------------------------------------------------------
// Feeding & metabolism
// ---------------------------------------------------------------------------------------------

/**
 * Satiating meal (stomach = 1) as dry-food mass: 1.2% of body mass (≈ 4–5% wet weight, the
 * typical voluntary meal of small tropical fish). A 0.3 g neon fills with ~3.6 mg — two or three
 * flake pieces; a 50 g angelfish needs ~600 mg.
 */
export const STOMACH_MG_PER_G = 12;

/** Daily food need (in own stomachfuls) of the reference fish at 25 °C. */
export const NEED_STOMACHS_PER_DAY_REF = 0.6;

/** Gastric evacuation time constant of the reference fish at 25 °C (h). 90% emptied ≈ 2.3 τ ≈ 6 h. */
export const DIGESTION_TAU_REF_H = 2.6;

/** Q10 of fish metabolism (digestion, oxygen use, excretion) — 2–3 for most teleosts. */
export const METABOLIC_Q10 = 2.3;

/**
 * Dry mass (mg) of one food particle of each kind as dispensed by the food system. These are the
 * real-world masses of the items the renderer draws (a 4 mm flake fragment ≈ 1.2 mg, a 6 mm
 * floating stick ≈ 12 mg, a frozen krill ≈ 15 mg dry), so a pinch of flakes is ≈ 30 mg.
 */
export const FOOD_DRY_MG: Record<FoodKind, number> = {
  flakes: 1.2,
  'spirulina-flakes': 1.2,
  'micro-pellets': 0.25,
  'floating-pellets': 12,
  'sinking-pellets': 8,
  'algae-wafers': 150,
  bloodworms: 0.6,
  'brine-shrimp': 0.15,
  daphnia: 0.03,
  mysis: 1.2,
  krill: 15,
  nori: 150,
  zucchini: 120,
  'fruit-flies': 0.3,
  'shrimp-pellets': 3,
  phytoplankton: 0.01,
};

/** Nitrogen in typical aquarium food (40–45% crude protein × 16% N). */
export const FOOD_N_FRACTION = 0.065;

/** mg of dry food represented by one unit of `FoodParticle.nutrition` of this kind. */
export function foodMgPerNutrition(kind: FoodKind): number {
  const f = FOODS[kind];
  const mg = FOOD_DRY_MG[kind];
  if (!f || !mg || !(f.nutrition > 0)) return 10;
  return mg / f.nutrition;
}

/** Temperature multiplier of metabolic rates relative to 25 °C. */
export function metabolicFactor(tempC: number): number {
  return Math.pow(METABOLIC_Q10, (clamp(tempC, 2, 40) - 25) / 10);
}

/** Stomach capacity (mg dry food) of an animal of mass `w` g. */
export function stomachCapacityMg(w: number): number {
  return STOMACH_MG_PER_G * w;
}

/**
 * Mass-specific metabolic scaling (W/W₀)^−0.2: big animals need less food relative to their
 * size, digest more slowly and survive starvation longer (metabolic rate ∝ W^0.8).
 */
export function sizeRateScale(w: number): number {
  return Math.exp(-0.2 * Math.log(Math.max(1e-5, w) / REF_MASS_G));
}

/**
 * How much nutrition (in `FoodParticle.nutrition` units of this kind) would fill this animal's
 * stomach right now. Exported for the behavior/food systems so bite sizes can follow appetite.
 */
export function appetiteNutrition(fish: FishEntity, kind: FoodKind): number {
  const room = Math.max(0, 1 - fish.state.stomach);
  return (room * stomachCapacityMg(massG(fish.species, fish.state.lengthCm))) / foodMgPerNutrition(kind);
}

// ---------------------------------------------------------------------------------------------
// Growth (von Bertalanffy) & maturity
// ---------------------------------------------------------------------------------------------

export function sexLengthScale(sp: Species, sex: Sex): number {
  const s = sex === 'male' ? sp.male?.lengthScale : sex === 'female' ? sp.female?.lengthScale : undefined;
  return s && s > 0 ? s : 1;
}

/** Asymptotic length L∞ (cm) of an individual before environmental stunting. */
export function asymptoticLength(sp: Species, s: Pick<FishState, 'sex' | 'sizeFactor'>): number {
  return sp.adultLengthCm * (s.sizeFactor || 1) * sexLengthScale(sp, s.sex);
}

/** Growth constant K (per year) — always set by SpeciesIndex, derived here as a fallback. */
export function growthK(sp: Species): number {
  if (sp.growthK && sp.growthK > 0) return sp.growthK;
  const linf = sp.adultLengthCm;
  const l0 = Math.min(sp.birthLengthCm, linf * 0.5);
  const tm = Math.max(0.05, sp.maturityMonths / 12);
  return Math.log((linf - l0) / (linf - 0.75 * linf)) / tm;
}

/** Von Bertalanffy length at age (years): L(t) = L∞ − (L∞ − L₀)·e^(−K·t). */
export function vbLength(linf: number, l0: number, k: number, ageYears: number): number {
  return linf - (linf - Math.min(l0, linf)) * Math.exp(-k * Math.max(0, ageYears));
}

/** Inverse of `vbLength`: age (years) at which length L is reached (∞ if never). */
export function vbAgeAtLength(linf: number, l0: number, k: number, length: number): number {
  if (length <= l0) return 0;
  if (length >= linf) return Infinity;
  return Math.log((linf - l0) / (linf - length)) / k;
}

/**
 * Temperature at which this species grows best: ~70% of the way up its range (fish growth peaks
 * a little below the upper tolerance limit).
 */
export function optimalGrowthTemp(sp: Species): number {
  const [lo, hi] = sp.tempC;
  return lo + 0.7 * (hi - lo);
}

/**
 * Thermal performance of growth: Q10 ≈ 2 below the optimum, a steep decline above it, and a
 * stall a few degrees outside the tolerated range.
 */
export function growthTempFactor(sp: Species, tempC: number): number {
  const [lo, hi] = sp.tempC;
  const opt = optimalGrowthTemp(sp);
  if (tempC <= opt) {
    let f = Math.pow(2, (tempC - opt) / 10);
    if (tempC < lo) f *= Math.max(0, 1 - 0.25 * (lo - tempC));
    return f;
  }
  const x = (tempC - opt) / (hi + 3 - opt);
  return Math.max(0, 1 - x * x);
}

/** Age in months at sim time `now`. */
export function ageMonths(s: Pick<FishState, 'bornAt'>, now: number): number {
  return (now - s.bornAt) / MS_PER_MONTH;
}

// ---------------------------------------------------------------------------------------------
// Senescence (Gompertz)
// ---------------------------------------------------------------------------------------------

/**
 * Gompertz shape: hazard h(t) = a·e^(b·t) with b = SHAPE / lifespan. SHAPE = 9 makes ~89% of
 * animals reach 80% of the typical lifespan and almost none exceed 120% — the steep late-life
 * mortality seen in captive fish.
 */
const GOMPERTZ_SHAPE = 9;
const GOMPERTZ_NORM = Math.LN2 / (Math.exp(GOMPERTZ_SHAPE) - 1);

/**
 * Probability of dying of old age between ages t0 and t1 (years) for a species with median
 * lifespan L: 1 − exp(−(a/b)(e^(b·t1) − e^(b·t0))), a/b = ln2/(e^SHAPE − 1).
 */
export function oldAgeDeathProbability(lifespanYears: number, t0: number, t1: number): number {
  const b = GOMPERTZ_SHAPE / Math.max(0.1, lifespanYears);
  const dLambda = GOMPERTZ_NORM * (Math.exp(b * t1) - Math.exp(b * t0));
  return 1 - Math.exp(-Math.max(0, dLambda));
}

// ---------------------------------------------------------------------------------------------
// Trophic relationships & traits
// ---------------------------------------------------------------------------------------------

export function isInvertebrate(sp: Species): boolean {
  return sp.group !== 'fish';
}

export function isPredator(sp: Species): boolean {
  return (
    sp.diet === 'piscivore' ||
    sp.temperament === 'predatory' ||
    sp.traits.includes('predator') ||
    sp.traits.includes('ambush')
  );
}

/**
 * Largest prey (total length, cm) an animal of this species & length can swallow. Piscivores
 * take fish up to ~1/3 of their own length; ordinary omnivores/carnivores still eat fry and
 * shrimplets up to ~15%; grazers and filter-feeders only slurp eggs.
 */
export function gapeRatio(sp: Species): number {
  if (sp.group === 'crab' || sp.group === 'crayfish') return 0.25;
  if (sp.group !== 'fish') return 0;
  if (isPredator(sp)) return 0.35;
  switch (sp.diet) {
    case 'herbivore':
    case 'algae-grazer':
    case 'detritivore':
    case 'filter-feeder':
      return 0.04;
    default:
      return 0.15;
  }
}

const LONG_CAUDALS = new Set(['veil', 'delta', 'halfmoon', 'crowntail', 'double', 'round-flowing', 'fan']);

/** Long, flowing fins that fin-nippers target (bettas, angelfish, fancy goldfish, veiltails). */
export function isLongFinned(sp: Species): boolean {
  const b = sp.body;
  if (b.archetype === 'betta' || b.archetype === 'angelfish' || b.archetype === 'fancy-goldfish') return true;
  if (b.caudal && LONG_CAUDALS.has(b.caudal.shape)) return true;
  for (const f of [b.dorsal, b.anal, b.pelvic]) {
    if (f && (f.shape === 'flowing' || f.shape === 'filament') && (f.trail ?? 0) > 0.2) return true;
  }
  return false;
}

/** Animals that hunt shrimp and snails as a matter of course. */
export function isInvertEater(sp: Species): boolean {
  if (sp.traits.includes('invert-eater')) return true;
  const a = sp.body.archetype;
  return a === 'puffer' || a === 'marine-puffer' || a === 'botia' || a === 'triggerfish' || a === 'hogfish';
}

/** Male bettas (and other 'flarer' fighters) fight to the death with rival males. */
export function isFighter(sp: Species): boolean {
  return sp.traits.includes('flarer') && sp.temperament === 'aggressive';
}

export function isCichlid(sp: Species): boolean {
  return sp.family === 'Cichlidae';
}

/** Group key for conspecific behavior & breeding: color morphs shoal and breed with the wild type. */
export function conspecificKey(sp: Species): string {
  return sp.variantOf ?? sp.id;
}

/**
 * How much of an animal's diet can come from grazing biofilm/algae on the glass and on surfaces
 * (rock, wood, leaves). Values are weights 0..1 for each pool.
 */
export function grazingWeights(sp: Species): { glass: number; surface: number } {
  const t = sp.traits;
  let glass = t.includes('glass-grazer') ? 1 : 0;
  let surface =
    t.includes('surface-grazer') || t.includes('algae-eater') || t.includes('wood-eater') || t.includes('sifter-of-detritus')
      ? 1
      : 0;
  if (sp.group === 'snail') glass = Math.max(glass, 1), surface = Math.max(surface, 1);
  if (sp.group === 'shrimp' || sp.group === 'crab' || sp.group === 'crayfish' || sp.group === 'urchin') surface = Math.max(surface, 1);
  if (sp.diet === 'algae-grazer' || sp.diet === 'detritivore') surface = Math.max(surface, 1);
  else if (sp.diet === 'herbivore') surface = Math.max(surface, 0.6);
  if (t.includes('scavenger') || sp.diet === 'scavenger') surface = Math.max(surface, 0.3);
  return { glass, surface };
}

// ---------------------------------------------------------------------------------------------
// Stocking
// ---------------------------------------------------------------------------------------------

/**
 * Bioload of one adult in "centimetres of small fish" — the unit of the classic 1 cm/L rule —
 * corrected for size and build: a 5 cm generic fish counts 5; bigger fish count more than their
 * length (L^1.6, between the plain length rule and metabolic mass) and deep/heavy bodies more
 * than slender ones (√ of the mass coefficient).
 * Invertebrates count 30% (tiny metabolic load per cm).
 */
export function bioloadUnits(sp: Species): number {
  const male = sexLengthScale(sp, 'male');
  const female = sexLengthScale(sp, 'female');
  const l = sp.adultLengthCm * (male + female) * 0.5;
  const build = Math.sqrt(massCoefficient(sp) / 0.011);
  const u = 5 * Math.pow(l / 5, 1.6) * build;
  return isInvertebrate(sp) ? u * 0.3 : u;
}
