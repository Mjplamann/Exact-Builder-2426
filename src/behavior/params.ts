import type { Archetype, Locomotion, MouthPosition, Species, Trait } from '../core/types';
import { DEG, clamp } from './math';

/**
 * Species-derived behavior parameters. Computed once per species (cached by object identity) so
 * the per-frame code only reads plain numbers & booleans. Everything is in body lengths (BL),
 * seconds and radians; per-individual values are scaled by the live length in the brain.
 *
 * The constants come from fish biomechanics and ethology literature:
 *  - tail-beat frequency vs speed: Bainbridge (1958), U/L = 0.75·f − 1;
 *  - burst-and-coast swimming in sub/carangiform fish (Weihs 1974; Videler 1993);
 *  - routine yaw rates of 150–400°/s for small characins and ~100°/s for 15 cm cichlids,
 *    scaling roughly with L^−0.5 (Domenici & Blake 1997);
 *  - ventilation rates of 60–150 breaths/min in small tropical fish, fewer in larger ones;
 *  - mouth gape ≈ 8–15 % of total length depending on mouth position and diet.
 */

export type MoveFamily = 'swimmer' | 'walker' | 'crawler' | 'sessile';

export interface SpeciesParams {
  readonly species: Species;
  readonly move: MoveFamily;

  // ---- locomotion -------------------------------------------------------------------------
  /** Body/caudal-fin propulsion drives cruising (else median/paired fins at low speed). */
  readonly bcf: boolean;
  /** Intermittent beat-and-glide swimming (sub-/carangiform). */
  readonly burstCoast: boolean;
  /** Can hold station with paired-fin sculling. */
  readonly canHover: boolean;
  /** Can swim backwards (knifefish, bichirs, puffers, cichlids backing with pectorals). */
  readonly canReverse: boolean;
  /** Multipliers on the size-based turn-rate and acceleration limits. */
  readonly turnFactor: number;
  readonly accelFactor: number;
  /** Cruise / burst speed in BL/s (from data). */
  readonly cruise: number;
  readonly burst: number;
  /** Glide decay time constant factor (s at 4 cm; scaled by sqrt(L)). */
  readonly glideTau: number;
  /** Anguilliform/amiiform: whole-body or fin waves keep going even when slow. */
  readonly continuousWave: boolean;

  // ---- body ---------------------------------------------------------------------------------
  /** Body depth & width / length. */
  readonly depthFrac: number;
  readonly widthFrac: number;
  /** Mouth gape / length. */
  readonly gapeFrac: number;
  readonly mouth: MouthPosition;

  // ---- posture --------------------------------------------------------------------------------
  /** Extra body pitch (rad) while cruising and while resting/hovering (oblique swimmers, headstanders). */
  readonly postureCruise: number;
  readonly postureRest: number;
  /** Swims belly-up (Synodontis nigriventris). */
  readonly inverted: boolean;
  /**
   * Upright swimmer (seahorses): the body stays vertical while the animal drifts up, down or
   * sideways with its dorsal fin, so travel direction is decoupled from body pitch.
   */
  readonly upright: boolean;
  /** Max travel pitch (rad). */
  readonly maxPitch: number;

  // ---- habitat ------------------------------------------------------------------------------
  /** Preferred band of normalized height in the water column (0 substrate … 1 surface). */
  readonly zoneLo: number;
  readonly zoneHi: number;

  // ---- social ---------------------------------------------------------------------------------
  /** 0 none, 1 loose shoal, 2 polarized school. */
  readonly schooling: 0 | 1 | 2;
  /** Preferred nearest-neighbor distance (BL) when calm. */
  readonly spacing: number;
  readonly alignW: number;
  readonly cohesionW: number;
  readonly pairs: boolean;
  readonly harem: boolean;
  readonly colony: boolean;

  // ---- temperament ------------------------------------------------------------------------------
  /** 0 timid … 1 bold. */
  readonly boldness: number;
  /** 0 peaceful … 1 aggressive. */
  readonly aggression: number;

  // ---- feeding --------------------------------------------------------------------------------
  /** How eagerly the species reacts to food (0..1). */
  readonly enthusiasm: number;
  /** Finds food by smell/barbels in the dark (catfish, loaches, invertebrates). */
  readonly chemosensory: boolean;

  // ---- rhythms ----------------------------------------------------------------------------------
  /** Pectoral fin beat (Hz at 8 cm) and ventilation (Hz at 5 cm) base rates. */
  readonly finHz: number;
  readonly gillHz: number;

  // ---- trait flags (hot-path booleans) ----------------------------------------------------------
  readonly t: TraitFlags;
}

export type TraitFlags = { readonly [K in Trait]: boolean };

const ALL_TRAITS: Trait[] = [
  'tight-schooling', 'surface-skimmer', 'jumper', 'glass-grazer', 'surface-grazer', 'sand-sifter', 'digger',
  'burrower', 'cave-dweller', 'shy', 'bold', 'hoverer', 'bottom-rester', 'perches', 'hops', 'clings',
  'air-gulper', 'fin-nipper', 'plant-eater', 'algae-eater', 'scavenger', 'cleaner', 'territorial',
  'pair-bonding', 'anemone-host', 'sand-sleeper', 'mucus-cocoon', 'night-coloration', 'oblique-swimmer',
  'head-stander', 'upside-down', 'wood-eater', 'ambush', 'drifter', 'spitter', 'flarer', 'predator',
  'invert-eater', 'coral-nipper', 'reef-safe', 'nocturnal-hider', 'curious', 'sifter-of-detritus', 'molts',
  'climbs',
];

/** Typical body depth / length for archetypes whose depth differs a lot from a generic fish. */
const ARCHETYPE_DEPTH: Partial<Record<Archetype, number>> = {
  discus: 0.8, angelfish: 0.62, 'marine-angel': 0.55, 'dwarf-angel': 0.5, butterflyfish: 0.6,
  'butterflyfish-fw': 0.3, 'moorish-idol': 0.7, batfish: 0.8, tang: 0.55, rabbitfish: 0.45,
  hatchetfish: 0.45, piranha: 0.5, pacu: 0.55, mono: 0.75, scat: 0.6, 'fancy-goldfish': 0.55,
  goldfish: 0.4, gourami: 0.4, oscar: 0.42, cichlid: 0.38, frontosa: 0.4, mbuna: 0.32, geophagus: 0.36,
  'dwarf-cichlid': 0.35, damselfish: 0.45, clownfish: 0.4, chromis: 0.42, anthias: 0.35, triggerfish: 0.5,
  filefish: 0.5, boxfish: 0.45, cowfish: 0.45, puffer: 0.4, 'marine-puffer': 0.42, leaffish: 0.4,
  badis: 0.3, sunfish: 0.45, molly: 0.33, livebearer: 0.28, betta: 0.3, 'paradise-fish': 0.3,
  barb: 0.38, tetra: 0.3, glassfish: 0.38, sweetlips: 0.35, snapper: 0.35, grouper: 0.32,
  eel: 0.07, kuhli: 0.09, 'spiny-eel': 0.09, moray: 0.09, 'garden-eel': 0.05, pipefish: 0.06,
  needlefish: 0.08, gar: 0.12, pike: 0.16, bichir: 0.13, lungfish: 0.12, knifefish: 0.18,
  elephantnose: 0.2, arowana: 0.22, loach: 0.16, botia: 0.26, 'hillstream-loach': 0.14,
  pleco: 0.2, otocinclus: 0.2, corydoras: 0.33, catfish: 0.22, synodontis: 0.3, 'banjo-catfish': 0.2,
  stingray: 0.08, ray: 0.08, seahorse: 0.25, shark: 0.18, 'shark-catfish': 0.25, 'shark-minnow': 0.25,
  goby: 0.18, 'marine-goby': 0.18, blenny: 0.2, dartfish: 0.16, jawfish: 0.2, dragonet: 0.18,
  hawkfish: 0.28, lionfish: 0.35, scorpionfish: 0.3, frogfish: 0.5,
  shrimp: 0.2, snail: 0.6, crab: 0.35, 'hermit-crab': 0.6, crayfish: 0.22, starfish: 0.12,
  'brittle-star': 0.08, urchin: 0.5,
};

const ARCHETYPE_WIDTH: Partial<Record<Archetype, number>> = {
  pleco: 0.24, otocinclus: 0.18, corydoras: 0.2, loach: 0.14, 'hillstream-loach': 0.22, catfish: 0.18,
  'banjo-catfish': 0.3, stingray: 0.9, ray: 0.9, goldfish: 0.2, 'fancy-goldfish': 0.3, puffer: 0.3,
  'marine-puffer': 0.32, boxfish: 0.35, cowfish: 0.35, frogfish: 0.35, discus: 0.1, angelfish: 0.09,
  hatchetfish: 0.08, crab: 0.9, 'hermit-crab': 0.5, starfish: 1.0, 'brittle-star': 0.5, urchin: 1.0,
  snail: 0.7, shrimp: 0.18, crayfish: 0.3, dragonet: 0.22, goby: 0.17, blenny: 0.17,
};

const MOUTH_BY_ARCHETYPE: Partial<Record<Archetype, MouthPosition>> = {
  pleco: 'sucker', otocinclus: 'sucker', 'algae-eater': 'sucker', 'hillstream-loach': 'sucker',
  corydoras: 'inferior', loach: 'inferior', botia: 'inferior', catfish: 'subterminal', synodontis: 'inferior',
  'banjo-catfish': 'inferior', kuhli: 'inferior', stingray: 'inferior', ray: 'inferior', elephantnose: 'inferior',
  hatchetfish: 'superior', halfbeak: 'superior', killifish: 'superior', danio: 'superior',
  livebearer: 'superior', molly: 'superior', swordtail: 'superior', archerfish: 'superior', betta: 'superior',
  'blue-eye': 'superior', ricefish: 'superior', needlefish: 'superior', arowana: 'superior',
};

const LOCO_TURN: Record<Locomotion, number> = {
  anguilliform: 0.8, subcarangiform: 1, carangiform: 0.95, thunniform: 0.5, ostraciiform: 0.85,
  tetraodontiform: 1.2, balistiform: 1, labriform: 1.1, amiiform: 0.65, gymnotiform: 0.9, rajiform: 0.7,
  seahorse: 0.55, walker: 1.2, crawler: 0.6, sessile: 0,
};

const LOCO_ACCEL: Record<Locomotion, number> = {
  anguilliform: 0.7, subcarangiform: 1, carangiform: 1.15, thunniform: 0.8, ostraciiform: 0.5,
  tetraodontiform: 0.6, balistiform: 0.7, labriform: 0.85, amiiform: 0.6, gymnotiform: 0.7, rajiform: 0.7,
  seahorse: 0.3, walker: 1, crawler: 0.3, sessile: 0,
};

const cache = new WeakMap<Species, SpeciesParams>();

/** Cached behavior parameters for a species. */
export function paramsFor(s: Species): SpeciesParams {
  let p = cache.get(s);
  if (!p) {
    p = derive(s);
    cache.set(s, p);
  }
  return p;
}

function derive(s: Species): SpeciesParams {
  const flags = {} as Record<Trait, boolean>;
  for (const t of ALL_TRAITS) flags[t] = false;
  for (const t of s.traits ?? []) flags[t] = true;
  const t = flags as TraitFlags;
  const arch = s.body?.archetype;
  const loco = s.locomotion;

  let move: MoveFamily = 'swimmer';
  if (s.group === 'shrimp' || s.group === 'crab' || s.group === 'crayfish' || loco === 'walker') move = 'walker';
  else if (s.group === 'snail' || s.group === 'starfish' || s.group === 'urchin' || loco === 'crawler') move = 'crawler';
  else if (loco === 'sessile') move = 'sessile';

  const bcf = loco === 'subcarangiform' || loco === 'carangiform' || loco === 'thunniform' || loco === 'anguilliform';
  const burstCoast = loco === 'subcarangiform' || loco === 'carangiform';
  const mpf = !bcf && move === 'swimmer';
  const canHover = mpf || t.hoverer;
  const canReverse = loco === 'gymnotiform' || loco === 'amiiform' || loco === 'tetraodontiform' ||
    loco === 'balistiform' || loco === 'ostraciiform' || loco === 'labriform' || loco === 'seahorse';

  const depthFrac = clamp(s.body?.depth ?? ARCHETYPE_DEPTH[arch] ?? 0.28, 0.03, 1.2);
  const widthFrac = clamp(s.body?.width ?? ARCHETYPE_WIDTH[arch] ?? 0.12, 0.03, 1.2);

  const mouth: MouthPosition = s.body?.mouth ?? MOUTH_BY_ARCHETYPE[arch] ?? 'terminal';
  let gape = mouth === 'sucker' ? 0.07 : mouth === 'inferior' ? 0.085 : mouth === 'subterminal' ? 0.095 : 0.11;
  if (s.diet === 'piscivore' || t.predator) gape += 0.05;
  else if (s.diet === 'carnivore') gape += 0.02;
  else if (s.diet === 'planktivore') gape -= 0.01;
  else if (s.diet === 'herbivore' || s.diet === 'algae-grazer') gape -= 0.015;
  if (t.ambush) gape += 0.04; // lionfish, frogfish, leaffish: enormous gapes
  gape = clamp(gape, 0.05, 0.22);

  // Postures (radians): Nannostomus eques swims ~30–40° head-up; headstanders hang ~45° head-down.
  let postureCruise = 0, postureRest = 0;
  if (t['oblique-swimmer']) {
    postureCruise = 32 * DEG;
    postureRest = 40 * DEG;
  }
  if (t['head-stander']) {
    postureCruise = -14 * DEG;
    postureRest = -45 * DEG;
  }
  if (t.drifter) postureRest = Math.min(postureRest, -18 * DEG);

  // Zone bands in normalized water-column height.
  let zoneLo = 0.3, zoneHi = 0.75;
  switch (s.zone) {
    case 'top': zoneLo = 0.74; zoneHi = 0.95; break;
    case 'middle': zoneLo = 0.3; zoneHi = 0.74; break;
    case 'bottom': zoneLo = 0.02; zoneHi = 0.24; break;
    case 'all': zoneLo = 0.08; zoneHi = 0.9; break;
  }
  if (t['surface-skimmer']) {
    zoneLo = 0.95;
    zoneHi = 0.995;
  }

  // Social structure.
  let schooling: 0 | 1 | 2 = 0;
  let spacing = 3, alignW = 0, cohesionW = 0;
  if (move === 'swimmer') {
    if (s.social === 'school' || t['tight-schooling']) {
      schooling = 2;
      spacing = t['tight-schooling'] ? 0.9 : 1.2;
      alignW = t['tight-schooling'] ? 1.3 : 1.0;
      cohesionW = 1.0;
    } else if (s.social === 'shoal') {
      schooling = 1;
      spacing = 2.2;
      alignW = 0.3;
      cohesionW = 0.55;
    } else if (s.social === 'colony') {
      schooling = 1;
      spacing = 3.5;
      alignW = 0.1;
      cohesionW = 0.25;
    }
  }

  let boldness = 0.5;
  if (t.shy) boldness -= 0.3;
  if (t['nocturnal-hider']) boldness -= 0.1;
  if (t.bold) boldness += 0.3;
  if (t.curious) boldness += 0.15;
  if (s.temperament === 'aggressive' || s.temperament === 'predatory') boldness += 0.15;
  boldness += clamp(Math.log2(Math.max(1, s.adultLengthCm) / 8) * 0.08, -0.1, 0.25);
  boldness = clamp(boldness, 0.05, 0.95);

  const aggression = s.temperament === 'aggressive' ? 0.75 : s.temperament === 'predatory' ? 0.5 : s.temperament === 'semi-aggressive' ? 0.35 : 0.05;

  let enthusiasm = 0.65;
  if (s.diet === 'omnivore' || s.diet === 'carnivore' || s.diet === 'insectivore' || s.diet === 'piscivore') enthusiasm = 0.8;
  if (s.diet === 'algae-grazer' || s.diet === 'filter-feeder') enthusiasm = 0.35;
  if (s.diet === 'detritivore' || s.diet === 'scavenger') enthusiasm = 0.55;
  if (t.bold) enthusiasm += 0.12;
  if (t.shy) enthusiasm -= 0.12;
  if (move === 'crawler') enthusiasm = 0.3;
  enthusiasm = clamp(enthusiasm, 0.1, 1);

  const chemosensory = move !== 'swimmer' || (s.body?.barbels ?? 0) > 0 ||
    ['corydoras', 'loach', 'botia', 'kuhli', 'catfish', 'synodontis', 'pleco', 'banjo-catfish', 'shark-catfish', 'elephantnose', 'knifefish', 'spiny-eel', 'eel', 'moray', 'stingray'].includes(arch);

  const maxPitch = (loco === 'anguilliform' ? 35 : t['air-gulper'] ? 30 : 25) * DEG;

  return {
    species: s,
    move,
    bcf,
    burstCoast,
    canHover,
    canReverse,
    turnFactor: LOCO_TURN[loco] ?? 1,
    accelFactor: LOCO_ACCEL[loco] ?? 1,
    cruise: Math.max(0.02, s.cruiseSpeed),
    burst: Math.max(s.cruiseSpeed, s.burstSpeed),
    glideTau: loco === 'carangiform' ? 0.42 : 0.34,
    continuousWave: loco === 'anguilliform' || loco === 'amiiform' || loco === 'gymnotiform' || loco === 'rajiform' || loco === 'thunniform',
    depthFrac,
    widthFrac,
    gapeFrac: gape,
    mouth,
    postureCruise,
    postureRest,
    inverted: t['upside-down'],
    upright: loco === 'seahorse',
    maxPitch,
    zoneLo,
    zoneHi,
    schooling,
    spacing,
    alignW,
    cohesionW,
    pairs: s.social === 'pair' || t['pair-bonding'],
    harem: s.social === 'harem',
    colony: s.social === 'colony',
    boldness,
    aggression,
    enthusiasm,
    chemosensory,
    finHz: loco === 'seahorse' ? 9 : mpf ? 2.6 : 2.0,
    gillHz: 1.3,
    t,
  };
}

/**
 * Size-scaled limits for one individual of length `L` (m). Returned through `out` to avoid
 * allocation; see Brain for where they are stored.
 */
export function maxTurnRate(p: SpeciesParams, Lm: number): number {
  // ~5 rad/s (≈290°/s) for a 4 cm fish, ~2.6 rad/s for 15 cm, ~1.8 rad/s for 30 cm.
  const Lcm = Math.max(0.5, Lm * 100);
  return clamp(5 * Math.pow(4 / Lcm, 0.5) * p.turnFactor, 0.35, 8);
}

/** Routine acceleration limit (m/s²): ~2.5 BL/s² for small fish, less per BL for big ones. */
export function routineAccel(p: SpeciesParams, Lm: number): number {
  const Lcm = Math.max(0.5, Lm * 100);
  return clamp(2.6 * Lm * Math.pow(4 / Lcm, 0.25) * p.accelFactor, 0.004, 1.2);
}

/** Fast-start acceleration (m/s²): tens of BL/s², capped (~0.8 g) — the C-start escape. */
export function burstAccel(p: SpeciesParams, Lm: number): number {
  return clamp(45 * Lm * p.accelFactor, 0.05, 8);
}

/** Maximum tail-beat frequency we let the animation reach (Hz). Bigger fish beat slower. */
export function maxTailHz(Lm: number): number {
  const Lcm = Math.max(0.5, Lm * 100);
  // Biological limits are ~20–30 Hz for 3–5 cm fish; we also stay under ~14 Hz so the wave
  // never strobes against a 60 Hz display.
  return clamp(22 * Math.pow(4 / Lcm, 0.35), 3, 14);
}
