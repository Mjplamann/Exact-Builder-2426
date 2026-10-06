import type { FishEntity, Species, TankSize, WaterType } from '../core/types';
import { DEFAULT_SETTINGS, createWorld, makeFishEntity, type World } from '../core/world';
import { waterLiters } from '../core/tankGeometry';
import type { PlantIndex } from '../data/plantIndex';
import type { SpeciesIndex } from '../data/speciesIndex';
import { bioloadUnits, conspecificKey, isFighter, isInvertebrate, isPredator, sexLengthScale } from '../sim/biology';
import { stockingCapacity } from '../sim/census';
import { compatibilityReport } from '../sim/compatibility';
import { isCoral } from '../sim/flora';
import type { CompatibilityReport } from '../sim/LifeSim';
import { capitalize, joinList, lowerName, pluralName, withArticle } from '../sim/text';
import { ROOM_TEMP_C, heldTemperature, styleHasCorals, tankFromSpec } from './biotopes';
import type { StockCheck, StockSuggestion, TankSpec } from './tankTypes';

/**
 * Proposes communities of animals that genuinely belong together in a planned tank (same water,
 * overlapping temperature/pH, compatible temperaments and sizes, within stocking capacity) and
 * validates hand-picked lists — using the life sim's own compatibility rules on a temporary,
 * render-free tank built from the spec exactly as `App.createTank` will build it.
 *
 * How a suggestion is made: every species that could live in the planned water at all (type,
 * temperature, pH, hardness, volume, room to swim and turn) gets a beginner-friendliness score —
 * availability, tolerance, a home region that fits the style, temperament. A community template
 * (a main shoal with bottom dwellers and a clean-up crew, a centrepiece pair, a shrimp nano, a
 * Malawi rock community, a clownfish pair with cleaners…) then fills its roles with the best
 * candidates the sim accepts alongside those already chosen, sized to ≤ 80 % of capacity.
 *
 * OWNER: biotopes module.
 */

type Level = CompatibilityReport['level'];
const RANK: Record<Level, number> = { good: 0, caution: 1, bad: 2 };

/** Suggested communities fill at most this share of the tank's capacity (at adult size). */
const TARGET_FILL = 0.75;
const MAX_FILL = 0.8;
const MAX_SUGGESTIONS = 6;
/** Roles whose groups grow with a big tank. */
const SHOALS = new Set<RoleKey>(['shoal', 'tiny', 'top', 'bottom', 'bshoal', 'bigShoal', 'mshoal', 'mbuna', 'fancy', 'colony']);
/** Largest group the advisor proposes of any one species. */
const MAX_GROUP = 80;

/** Layouts with living plants that plant-eaters and diggers would wreck. */
const PLANTED = new Set(['amazon', 'dutch', 'iwagumi', 'nature', 'nano-shrimp', 'blackwater']);

/** Iconic, widely kept species: a small nudge so the classics lead (unknown ids are ignored). */
const STAPLES = new Set([
  'paracheirodon-innesi', 'paracheirodon-axelrodi', 'trigonostigma-heteromorpha', 'trigonostigma-espei', 'danio-rerio', 'hyphessobrycon-amandae',
  'boraras-brigittae', 'petitella-bleheri', 'melanotaenia-praecox', 'corydoras-aeneus', 'corydoras-panda', 'corydoras-sterbai', 'pangio-kuhlii',
  'otocinclus-vittatus', 'ancistrus-cirrhosus', 'caridina-multidentata', 'neocaridina-davidi-red-cherry', 'neritina-natalensis', 'trichopodus-leerii',
  'mikrogeophagus-ramirezi', 'betta-splendens-halfmoon-red', 'labidochromis-caeruleus', 'pseudotropheus-sp-acei', 'synodontis-petricola',
  'carassius-auratus-oranda-red', 'carassius-auratus-ryukin', 'brachygobius-doriae', 'dichotomyctere-ocellatus', 'monodactylus-argenteus',
  'scatophagus-argus', 'toxotes-jaculatrix', 'amphiprion-ocellaris', 'gramma-loreto', 'nemateleotris-magnifica', 'elacatinus-oceanops',
  'chromis-viridis', 'zebrasoma-flavescens', 'lysmata-amboinensis', 'turbo-fluctuosus', 'trochus-maculatus', 'centropyge-loricula',
]);
/** Naturalistic styles, where wild forms look right and GloFish and albinos look out of place. */
const NATURAL = new Set(['amazon', 'blackwater', 'iwagumi', 'nature', 'malawi', 'mangrove', 'brackish-rock', 'reef', 'nano-reef', 'fowlr']);
/** Specialists that rarely thrive in a home tank (obligate cleaners, pod and coral-polyp feeders). */
const DIFFICULT = new Set(['labroides-dimidiatus', 'synchiropus-splendidus', 'synchiropus-ocellatus', 'synchiropus-stellatus', 'chelmon-rostratus', 'zanclus-cornutus', 'oxymonacanthus-longirostris']);
/** Snail families that breed until they overrun a tank. */
const PLAGUE_SNAILS = new Set(['Physidae', 'Planorbidae', 'Lymnaeidae', 'Thiaridae']);

const SOUTH_AMERICA = /amazon|brazil|peru|colombia|venezuela|guian|guyana|suriname|orinoco|rio negro|paraguay|parag|bolivia|ecuador|south america|paran|xingu|tocantins|araguaia|madeira|essequibo|guapor/i;
const ASIA = /thailand|malay|borneo|sumatra|india|myanmar|burma|laos|cambodia|vietnam|china|sri lanka|java|indonesia|asia|philippines|bangladesh|nepal|singapore|kalimantan/i;
/** Home regions that suit a style (species from there get a bonus). */
const STYLE_REGION: Record<string, RegExp> = {
  amazon: SOUTH_AMERICA,
  blackwater: SOUTH_AMERICA,
  iwagumi: ASIA,
  nature: ASIA,
  'nano-shrimp': ASIA,
  malawi: /malawi/i,
  mangrove: /mangrove|estuar/i,
};

// ---------------------------------------------------------------------------------------------
// The planned tank
// ---------------------------------------------------------------------------------------------

interface Cand {
  sp: Species;
  /** Beginner-friendliness for this tank (higher is better). */
  score: number;
  /** Bioload units of one adult (the sim's stocking unit). */
  units: number;
  /** Largest adult length (cm). */
  length: number;
}

/** The planned tank as the advisor sees it — built once per distinct spec, then cached. */
interface Ctx {
  world: World;
  water: WaterType;
  style: string;
  /** Temperature band the tank runs at (°C) and its pH band (CO₂ injection lowers the daytime pH). */
  temp: [number, number];
  ph: [number, number];
  gh: number;
  liters: number;
  size: TankSize;
  /** Water column above the substrate (cm). */
  waterCm: number;
  capacity: number;
  corals: boolean;
  planted: boolean;
  region: RegExp | null;
  /** Largest main-shoal fish (cm) that looks right in this tank. */
  shoalMax: number;
  /** Species that could live here at all. */
  pool: Cand[];
  roles: Map<RoleKey, Cand[]>;
  /** One stand-in animal per species, reused as residents for the sim's checks. */
  standIns: Map<string, FishEntity>;
  suggestions?: StockSuggestion[];
}

const caches = new WeakMap<SpeciesIndex, Map<string, Ctx>>();
const CACHE_SIZE = 8;

/** Everything in a spec that changes the water, the room or the capacity (not name, cycle or stock). */
function specKey(spec: TankSpec): string {
  return JSON.stringify([spec.water, spec.size, spec.substrate, spec.substrateDepthFrontCm, spec.substrateDepthBackCm, spec.aquascape, spec.waterParams ?? null, spec.equipment ?? null]);
}

function adultLength(sp: Species): number {
  return sp.adultLengthCm * Math.max(sexLengthScale(sp, 'male'), sexLengthScale(sp, 'female'));
}

const has = (sp: Species, t: Species['traits'][number]) => sp.traits.includes(t);
const genus = (sp: Species) => sp.scientificName.split(' ')[0];

function context(spec: TankSpec, species: SpeciesIndex, plants: PlantIndex): Ctx {
  let cache = caches.get(species);
  if (!cache) caches.set(species, (cache = new Map()));
  const key = specKey(spec);
  const hit = cache.get(key);
  if (hit) {
    cache.delete(key);
    cache.set(key, hit);
    return hit;
  }
  // The same construction App.createTank uses, without the layout (its plants only add a little
  // capacity, so leaving them out keeps the advice on the safe side).
  const tank = tankFromSpec(spec, { now: 0, seed: 1 });
  const corals = styleHasCorals(spec.water, spec.aquascape);
  if (corals) {
    // The reef-safety rules only ask whether there are corals: one stands in for the layout's.
    const coral = plants.all.find((p) => isCoral(p));
    if (coral) tank.plants.push({ id: 'coral', speciesId: coral.id, seed: 1, position: [0, 0, 0], rotationY: 0, growth: 0.5, plantedAt: 0, health: 1 });
  }
  const world = createWorld({ tank, species, plants, settings: { ...DEFAULT_SETTINGS } });
  const eq = tank.equipment;
  const wp = tank.waterParams;
  const T = heldTemperature(eq);
  const sub = tank.substrate === 'bare' ? 0 : (tank.substrateDepthFrontCm + tank.substrateDepthBackCm) / 2;
  const c: Ctx = {
    world,
    water: tank.water,
    style: spec.aquascape,
    // An unheated tank follows the room's daily swing; a heated one sits at its set-point.
    temp: eq.heater.on ? [T, T + 0.5] : [ROOM_TEMP_C - 1, ROOM_TEMP_C + 1.6],
    ph: [wp.ph - (eq.co2 ? 0.6 : 0.1), wp.ph + 0.1],
    gh: wp.gh,
    liters: waterLiters(tank),
    size: tank.size,
    waterCm: tank.size.heightCm - 2.5 - sub,
    capacity: stockingCapacity(world),
    corals,
    planted: PLANTED.has(spec.aquascape),
    region: STYLE_REGION[spec.aquascape] ?? null,
    shoalMax: Math.max(2.5, Math.min(12, tank.size.widthCm / 12)),
    pool: [],
    roles: new Map(),
    standIns: new Map(),
  };
  for (const sp of species.all) {
    if (!livesHere(sp, c)) continue;
    c.pool.push({ sp, score: baseScore(sp, c), units: bioloadUnits(sp), length: adultLength(sp) });
  }
  if (cache.size >= CACHE_SIZE) cache.delete(cache.keys().next().value as string);
  cache.set(key, c);
  return c;
}

/** Could this species live in the planned tank at all — water, temperature, chemistry, room? */
function livesHere(sp: Species, c: Ctx): boolean {
  if (sp.water !== c.water) return false;
  const [tlo, thi] = sp.tempC;
  if (thi < 21 || tlo > c.temp[0] + 0.2 || thi < c.temp[1] - 0.2) return false;
  if (sp.ph[0] > c.ph[0] + 0.2 || sp.ph[1] < c.ph[1] - 0.2) return false;
  if (sp.dGH && c.water === 'freshwater' && (c.gh < sp.dGH[0] - 1 || c.gh > sp.dGH[1] + 2)) return false;
  if (sp.minTankLiters > c.liters) return false;
  if (c.corals) {
    if (has(sp, 'coral-nipper')) return false;
    // Fish, crabs, stars and urchins that aren't reliably reef-safe would be a gamble with corals.
    if ((sp.group === 'fish' || sp.group === 'crab' || sp.group === 'starfish' || sp.group === 'urchin') && !has(sp, 'reef-safe')) return false;
  }
  if (sp.group !== 'fish') return true;
  // Room to cruise and to turn round; tall-bodied fish need a tall water column.
  const L = adultLength(sp);
  if (c.size.widthCm < L * (sp.zone === 'bottom' ? 4 : 6) || c.size.depthCm < L * 1.6) return false;
  const tall = sp.body.archetype === 'angelfish' || sp.body.archetype === 'discus' || (sp.body.depth ?? 0) > 0.6;
  return !tall || c.waterCm >= L * 2.5;
}

/** How good a choice this species is here: hardy, easy to find, from the right place, peaceful. */
function baseScore(sp: Species, c: Ctx): number {
  // Species without an availability are the curated hobby staples (neons, otos, amano shrimp…).
  const avail = sp.availability ?? 'staple';
  let s = avail === 'staple' ? 3.5 : avail === 'common' ? 3 : avail === 'uncommon' ? 1 : -1.5;
  // Wide tolerances are the mark of a forgiving species…
  const [tlo, thi] = sp.tempC;
  s += Math.min(2, (thi - tlo) / 4) + Math.min(1.5, (sp.ph[1] - sp.ph[0]) / 1.2);
  // …and comfortably inside them beats living at the edge.
  const tMid = (tlo + thi) / 2;
  s -= Math.min(1.5, (Math.abs((c.temp[0] + c.temp[1]) / 2 - tMid) / Math.max(1, thi - tlo)) * 2);
  // Room to spare in the tank.
  s += Math.max(-0.5, Math.min(1, Math.log2(c.liters / Math.max(10, sp.minTankLiters)) * 0.4));
  if (c.region?.test(sp.region)) s += 2.5;
  if (sp.temperament === 'aggressive') s -= 2.5;
  else if (sp.temperament === 'semi-aggressive') s -= 0.6;
  if (isPredator(sp)) s -= 3;
  if (has(sp, 'fin-nipper')) s -= 2;
  // Calm to watch: animals that hide all day leave little to see.
  if (has(sp, 'nocturnal-hider')) s -= 1.5;
  if (has(sp, 'shy')) s -= 0.3;
  if (c.planted && (has(sp, 'plant-eater') || has(sp, 'digger'))) s -= 4;
  if (sp.reproduction === 'annual' || sp.lifespanYears < 1.5) s -= 2;
  if (STAPLES.has(sp.id)) s += 1;
  if (DIFFICULT.has(sp.id)) s -= 5;
  if (sp.group === 'fish' && NATURAL.has(c.style)) {
    if (/glofish/.test(sp.id)) s -= 3;
    else if (sp.variantOf) s -= 1;
  }
  // Nerites can't breed in fresh water; bladder and ramshorn snails soon carpet the glass.
  if (sp.group === 'snail') s += PLAGUE_SNAILS.has(sp.family) ? -2.5 : sp.reproduction === 'none' ? 1.5 : 0;
  return s;
}

/** A fish that looks right at this tank's scale (ideal length in cm): no tiny fish lost in a 3 m tank. */
function presence(L: number, ideal: number): number {
  return -Math.abs(Math.log(L / ideal)) * 0.8;
}

// ---------------------------------------------------------------------------------------------
// Roles and community templates
// ---------------------------------------------------------------------------------------------

type RoleKey =
  | 'shoal' | 'tiny' | 'top' | 'bottom' | 'grazer' | 'shrimp' | 'colony' | 'snail' | 'centre' | 'betta'
  | 'mbuna' | 'rockCat' | 'fancy' | 'singleTail'
  | 'bgoby' | 'bshoal' | 'puffer' | 'bigShoal' | 'archer'
  | 'clown' | 'mgoby' | 'mshoal' | 'mcentre' | 'cleaner' | 'mcrew';

const isFish = (sp: Species) => sp.group === 'fish';
const shoaling = (sp: Species) => sp.social === 'school' || sp.social === 'shoal';
const groupLiving = (sp: Species) => shoaling(sp) || sp.social === 'colony' || sp.social === 'harem';
/** Peaceful, no appetite for tankmates, no fin-nipping. */
const gentle = (sp: Species) => sp.temperament === 'peaceful' && !isPredator(sp) && !has(sp, 'fin-nipper');
const arch = (sp: Species, ...a: Species['body']['archetype'][]) => a.includes(sp.body.archetype);

/** Who can fill each role, plus a role-specific nudge to the score. */
const ROLES: Record<RoleKey, { test(sp: Species, c: Ctx, L: number): boolean; bonus?(sp: Species, c: Ctx, L: number): number }> = {
  shoal: {
    test: (sp, c, L) => isFish(sp) && shoaling(sp) && sp.groupSize >= 5 && sp.zone !== 'bottom' && gentle(sp) && L <= c.shoalMax,
    // Polarized schools are the most striking; an Iwagumi wants small fish against big stones.
    bonus: (sp, c, L) =>
      (sp.social === 'school' || has(sp, 'tight-schooling') ? 0.8 : 0) + (c.style === 'iwagumi' && L <= 4 ? 1.5 : 0) + presence(L, Math.min(10, Math.max(2.5, c.size.widthCm / 30))),
  },
  tiny: { test: (sp, _c, L) => isFish(sp) && shoaling(sp) && sp.groupSize >= 5 && sp.zone !== 'bottom' && gentle(sp) && L <= 3 },
  top: { test: (sp, c, L) => isFish(sp) && groupLiving(sp) && sp.zone === 'top' && gentle(sp) && L <= Math.min(7, c.shoalMax) },
  bottom: {
    test: (sp, c, L) =>
      isFish(sp) && sp.zone === 'bottom' && shoaling(sp) && sp.groupSize >= 3 && gentle(sp) && L <= Math.min(12, c.shoalMax * 1.5) &&
      !has(sp, 'cave-dweller') && !has(sp, 'clings') && !arch(sp, 'algae-eater') && !(c.planted && has(sp, 'digger')),
    bonus: (sp) => (has(sp, 'sand-sifter') || has(sp, 'scavenger') ? 0.5 : 0),
  },
  grazer: {
    test: (sp, c, L) => isFish(sp) && gentle(sp) && (has(sp, 'glass-grazer') || (has(sp, 'clings') && has(sp, 'algae-eater'))) && L <= 15 && !(c.planted && has(sp, 'plant-eater')),
  },
  shrimp: {
    test: (sp, _c, L) => sp.group === 'shrimp' && sp.temperament === 'peaceful' && L <= 5 && sp.diet !== 'filter-feeder' && !has(sp, 'invert-eater') && !has(sp, 'nocturnal-hider'),
    bonus: (sp) => (has(sp, 'algae-eater') ? 0.5 : 0),
  },
  snail: {
    // Never the snails that arrive uninvited and breed until they carpet the glass.
    test: (sp, c) =>
      sp.group === 'snail' && (has(sp, 'glass-grazer') || sp.diet === 'algae-grazer') && !PLAGUE_SNAILS.has(sp.family) && !has(sp, 'invert-eater') && !has(sp, 'burrower') && !(c.planted && has(sp, 'plant-eater')),
  },
  colony: { test: (sp, _c, L) => sp.group === 'shrimp' && sp.groupSize >= 8 && sp.temperament === 'peaceful' && L <= 4 && !has(sp, 'invert-eater') },
  centre: {
    test: (sp, c, L) =>
      isFish(sp) && (sp.social === 'pair' || sp.social === 'harem' || sp.social === 'solitary') && !isFighter(sp) &&
      L >= 4 && L <= Math.min(18, c.size.widthCm / 6) && sp.temperament !== 'aggressive' && !has(sp, 'nocturnal-hider') &&
      (!isPredator(sp) || arch(sp, 'angelfish')) && (sp.zone !== 'bottom' || arch(sp, 'dwarf-cichlid', 'geophagus')) && !has(sp, 'clings'),
    bonus: (sp, c, L) => (has(sp, 'hoverer') ? 0.6 : 0) + presence(L, Math.min(18, Math.max(5, c.size.widthCm / 12))),
  },
  betta: { test: (sp) => isFish(sp) && isFighter(sp) },
  mbuna: {
    test: (sp, c, L) => isFish(sp) && sp.family === 'Cichlidae' && /malawi/i.test(sp.region) && sp.social !== 'solitary' && !isPredator(sp) && L <= c.size.widthCm / 9,
    // Milder mbuna keep a mixed rock community calm.
    bonus: (sp) => (sp.temperament === 'aggressive' ? -1 : 0.5),
  },
  rockCat: { test: (sp, _c, L) => isFish(sp) && sp.zone === 'bottom' && arch(sp, 'synodontis', 'pleco', 'catfish') && L <= 15 && sp.temperament !== 'aggressive' && !isPredator(sp) },
  fancy: { test: (sp) => isFish(sp) && arch(sp, 'fancy-goldfish') },
  singleTail: { test: (sp) => isFish(sp) && arch(sp, 'goldfish') && conspecificKey(sp) === 'carassius-auratus' },
  bgoby: { test: (sp, _c, L) => isFish(sp) && arch(sp, 'goby', 'marine-goby') && L <= 9 && !has(sp, 'jumper') && !isPredator(sp) },
  bshoal: { test: (sp, _c, L) => isFish(sp) && shoaling(sp) && L <= 6 && gentle(sp) },
  puffer: { test: (sp, _c, L) => isFish(sp) && arch(sp, 'puffer') && L <= 10 },
  bigShoal: { test: (sp, _c, L) => isFish(sp) && shoaling(sp) && L >= 12 && sp.temperament === 'peaceful' && !isPredator(sp) && !has(sp, 'fin-nipper') && !has(sp, 'nocturnal-hider') },
  archer: { test: (sp) => isFish(sp) && arch(sp, 'archerfish') },
  clown: { test: (sp) => isFish(sp) && arch(sp, 'clownfish') && sp.temperament !== 'aggressive' },
  mgoby: {
    test: (sp, _c, L) => isFish(sp) && arch(sp, 'marine-goby', 'dartfish', 'blenny', 'jawfish') && L <= 10 && sp.temperament !== 'aggressive' && !isPredator(sp),
    bonus: (sp) => (sp.temperament === 'peaceful' ? 0.5 : 0),
  },
  mshoal: { test: (sp) => isFish(sp) && arch(sp, 'chromis', 'anthias', 'cardinalfish', 'fairy-wrasse') && sp.temperament === 'peaceful' && groupLiving(sp) },
  mcentre: {
    test: (sp, c, L) =>
      isFish(sp) && arch(sp, 'tang', 'dwarf-angel', 'wrasse', 'basslet', 'dottyback', 'rabbitfish') && sp.temperament !== 'aggressive' && !isPredator(sp) && L <= c.size.widthCm / 6,
    // Fish-only tanks exist for the fish a reef can't keep: dwarf angels, tangs, bigger wrasses.
    bonus: (sp, c) => (c.style === 'fowlr' && !has(sp, 'reef-safe') ? 2 : 0),
  },
  cleaner: { test: (sp) => sp.group === 'shrimp' && (has(sp, 'cleaner') || has(sp, 'anemone-host')) && sp.temperament === 'peaceful' },
  mcrew: {
    test: (sp) => (sp.group === 'snail' && (has(sp, 'algae-eater') || has(sp, 'sand-sifter'))) || (arch(sp, 'hermit-crab') && sp.temperament === 'peaceful'),
    bonus: (sp) => (sp.group === 'snail' ? 0.5 : 0),
  },
};

interface Slot {
  role: RoleKey;
  /** Share of the stocking budget this role may use (group sizes grow with it). */
  share: number;
  optional?: boolean;
  /** Upper bound on the count, as a multiple of the species' group size (default 2). */
  max?: number;
}

interface Template {
  id: string;
  /** How the community is introduced in its description. */
  intro: string;
  when(c: Ctx): boolean;
  slots: Slot[];
}

const tropicalFw = (c: Ctx) => c.water === 'freshwater' && c.style !== 'goldfish' && c.style !== 'malawi' && c.temp[0] >= 22;

const TEMPLATES: Template[] = [
  // --- freshwater -------------------------------------------------------------------------------
  {
    id: 'iwagumi', intro: 'A stone garden with one big school',
    when: (c) => c.water === 'freshwater' && c.style === 'iwagumi',
    slots: [{ role: 'shoal', share: 0.6, max: 4 }, { role: 'shrimp', share: 0.06 }, { role: 'grazer', share: 0.1, optional: true }],
  },
  {
    id: 'community', intro: 'A classic peaceful community',
    when: (c) => tropicalFw(c) && c.style !== 'nano-shrimp' && c.liters >= 45,
    slots: [{ role: 'shoal', share: 0.42, max: 3 }, { role: 'bottom', share: 0.25, optional: true }, { role: 'grazer', share: 0.08, optional: true }, { role: 'shrimp', share: 0.04, optional: true }, { role: 'snail', share: 0.02, optional: true }],
  },
  {
    id: 'centrepiece', intro: 'A centrepiece with a supporting cast',
    when: (c) => tropicalFw(c) && c.style !== 'nano-shrimp' && c.style !== 'iwagumi' && c.liters >= 60,
    slots: [{ role: 'centre', share: 0.25, max: 1 }, { role: 'shoal', share: 0.35, max: 3 }, { role: 'bottom', share: 0.2, optional: true }, { role: 'grazer', share: 0.06, optional: true }, { role: 'snail', share: 0.02, optional: true }],
  },
  {
    id: 'two-levels', intro: 'Shoals at two levels of the water',
    when: (c) => tropicalFw(c) && c.style !== 'nano-shrimp' && c.liters >= 80,
    slots: [{ role: 'shoal', share: 0.35, max: 3 }, { role: 'top', share: 0.2 }, { role: 'bottom', share: 0.2, optional: true }, { role: 'grazer', share: 0.06, optional: true }],
  },
  {
    id: 'nano', intro: 'Tiny fish with a shrimp colony',
    when: (c) => tropicalFw(c) && c.liters < 120,
    slots: [{ role: 'tiny', share: 0.45, max: 2 }, { role: 'shrimp', share: 0.1 }, { role: 'snail', share: 0.03, optional: true }],
  },
  {
    id: 'shrimp', intro: 'A shrimp colony',
    when: (c) => c.water === 'freshwater' && c.style !== 'goldfish' && c.style !== 'malawi' && (c.liters < 120 || c.style === 'nano-shrimp'),
    slots: [{ role: 'colony', share: 0.4, max: 2.5 }, { role: 'snail', share: 0.05, optional: true }],
  },
  {
    id: 'betta', intro: 'A single betta',
    when: (c) => tropicalFw(c) && c.liters < 120,
    slots: [{ role: 'betta', share: 0.4 }, { role: 'snail', share: 0.04, optional: true }, { role: 'shrimp', share: 0.04, optional: true }],
  },
  {
    id: 'mbuna', intro: 'A Lake Malawi rock community',
    when: (c) => c.water === 'freshwater' && (c.style === 'malawi' || c.ph[0] >= 7.6),
    slots: [{ role: 'mbuna', share: 0.3, max: 1.6 }, { role: 'mbuna', share: 0.3, max: 1.6 }, { role: 'mbuna', share: 0.22, max: 1.6, optional: true }, { role: 'rockCat', share: 0.1, optional: true }],
  },
  {
    id: 'mbuna-colony', intro: 'One Malawi species, kept as a colony',
    when: (c) => c.water === 'freshwater' && (c.style === 'malawi' || c.ph[0] >= 7.6),
    slots: [{ role: 'mbuna', share: 0.6, max: 2.5 }, { role: 'rockCat', share: 0.12, optional: true }],
  },
  {
    id: 'fancy-mix', intro: 'Fancy goldfish of different varieties',
    when: (c) => c.water === 'freshwater' && (c.style === 'goldfish' || c.temp[1] <= 24),
    slots: [{ role: 'fancy', share: 0.34, max: 0.67 }, { role: 'fancy', share: 0.33, max: 0.67 }, { role: 'fancy', share: 0.33, max: 0.67, optional: true }],
  },
  {
    id: 'fancy-group', intro: 'A group of one fancy goldfish variety',
    when: (c) => c.water === 'freshwater' && (c.style === 'goldfish' || c.temp[1] <= 24),
    slots: [{ role: 'fancy', share: 1, max: 2 }],
  },
  {
    id: 'single-tail', intro: 'Single-tailed goldfish, fast swimmers that need a big tank',
    when: (c) => c.water === 'freshwater' && (c.style === 'goldfish' || c.temp[1] <= 24) && c.liters >= 400,
    slots: [{ role: 'singleTail', share: 1, max: 1.7 }],
  },
  // --- brackish -----------------------------------------------------------------------------------
  {
    id: 'gobies', intro: 'An estuary goby colony',
    when: (c) => c.water === 'brackish',
    slots: [{ role: 'bgoby', share: 0.5, max: 1.5 }, { role: 'bshoal', share: 0.3, optional: true }],
  },
  {
    id: 'puffer', intro: 'A puffer on its own — puffers are best kept alone',
    when: (c) => c.water === 'brackish',
    slots: [{ role: 'puffer', share: 0.8 }],
  },
  {
    id: 'big-shoals', intro: 'Silver shoals of the open estuary',
    when: (c) => c.water === 'brackish',
    slots: [{ role: 'bigShoal', share: 0.45, max: 1.6 }, { role: 'bigShoal', share: 0.35, max: 1.6, optional: true }],
  },
  {
    id: 'archers', intro: 'Archerfish hunting at the surface, with a shoal below',
    when: (c) => c.water === 'brackish',
    slots: [{ role: 'archer', share: 0.4, max: 1.5 }, { role: 'bigShoal', share: 0.35, max: 1.5, optional: true }],
  },
  // --- marine -------------------------------------------------------------------------------------
  {
    id: 'fish-only', intro: 'Fish a reef can’t keep, with live rock to graze',
    when: (c) => c.water === 'marine' && c.style === 'fowlr',
    slots: [{ role: 'mcentre', share: 0.35 }, { role: 'mcentre', share: 0.25, optional: true }, { role: 'mshoal', share: 0.2, optional: true }, { role: 'mcrew', share: 0.05, optional: true }],
  },
  {
    id: 'clowns', intro: 'Clownfish with a clean-up crew',
    when: (c) => c.water === 'marine',
    slots: [{ role: 'clown', share: 0.3 }, { role: 'cleaner', share: 0.05, optional: true }, { role: 'mgoby', share: 0.15, optional: true }, { role: 'mcrew', share: 0.05, optional: true }],
  },
  {
    id: 'clowns-shoal', intro: 'Clownfish and a shoal over the rock',
    when: (c) => c.water === 'marine',
    slots: [{ role: 'clown', share: 0.2 }, { role: 'mshoal', share: 0.3 }, { role: 'mgoby', share: 0.12, optional: true }, { role: 'cleaner', share: 0.05, optional: true }, { role: 'mcrew', share: 0.05, optional: true }],
  },
  {
    id: 'reef-centre', intro: 'A centrepiece fish with reef companions',
    when: (c) => c.water === 'marine',
    slots: [{ role: 'mcentre', share: 0.35 }, { role: 'clown', share: 0.2, optional: true }, { role: 'mgoby', share: 0.1, optional: true }, { role: 'cleaner', share: 0.05, optional: true }, { role: 'mcrew', share: 0.05, optional: true }],
  },
  {
    id: 'gobies-shrimp', intro: 'Gobies and blennies with shrimp',
    when: (c) => c.water === 'marine',
    slots: [{ role: 'mgoby', share: 0.25 }, { role: 'mgoby', share: 0.2, optional: true }, { role: 'cleaner', share: 0.05, optional: true }, { role: 'mcrew', share: 0.05, optional: true }],
  },
  {
    id: 'invert-nano', intro: 'Shrimp and snails',
    when: (c) => c.water === 'marine' && c.liters < 120,
    slots: [{ role: 'cleaner', share: 0.3, max: 2 }, { role: 'mcrew', share: 0.2, optional: true }],
  },
];

// ---------------------------------------------------------------------------------------------
// Building a community
// ---------------------------------------------------------------------------------------------

interface Pick {
  sp: Species;
  role: RoleKey;
  count: number;
  score: number;
}

/** Candidates for a role, best first (cached per tank). */
function rolePool(c: Ctx, role: RoleKey): Cand[] {
  let list = c.roles.get(role);
  if (list) return list;
  const def = ROLES[role];
  list = c.pool
    .filter((p) => def.test(p.sp, c, p.length))
    .map((p) => ({ ...p, score: p.score + (def.bonus?.(p.sp, c, p.length) ?? 0) }))
    .sort((a, b) => b.score - a.score || a.sp.id.localeCompare(b.sp.id));
  c.roles.set(role, list);
  return list;
}

/** One stand-in animal of a species (for the sim's checks, presence is what matters). */
function standIn(c: Ctx, sp: Species): FishEntity {
  let e = c.standIns.get(sp.id);
  if (!e) {
    e = makeFishEntity(c.world, {
      id: `advisor-${sp.id}`, speciesId: sp.id, sex: 'male', bornAt: 0, addedAt: 0, lengthCm: sp.adultLengthCm, sizeFactor: 1,
      colorSeed: 1, hunger: 0, health: 1, stress: 0, stomach: 0, generation: 0, pos: [0, 0.1, 0],
    })!;
    c.standIns.set(sp.id, e);
  }
  return e;
}

/** The sim's verdict on `sp` joining the others in `among` (one of each stands in). */
function verdictWith(c: Ctx, sp: Species, among: Species[]): CompatibilityReport {
  const fish = c.world.fish;
  fish.length = 0;
  for (const o of among) if (o !== sp) fish.push(standIn(c, o));
  // Count 1: the stocking question is answered separately, for the whole community.
  const r = compatibilityReport(c.world, sp, 1);
  fish.length = 0;
  return r;
}

/** How many of a species this slot takes within the remaining budget (0 = can't be afforded). */
function countFor(cand: Cand, slot: Slot, c: Ctx, budget: number, sharedBy: number): number {
  const sp = cand.sp;
  const share = slot.share * TARGET_FILL * c.capacity;
  let n: number;
  let min = 1;
  if (isFighter(sp)) n = 1;
  else if (sp.social === 'pair') n = min = sp.groupSize >= 2 ? 2 : 1;
  else if (sp.social === 'solitary' || sp.groupSize <= 1) {
    // A clean-up crew scales with the tank; a solitary fish is just one.
    n = isInvertebrate(sp) ? Math.max(1, Math.min(sp.group === 'snail' ? 6 : 3, Math.round(c.liters / (sp.group === 'snail' ? 35 : 80)))) : 1;
  } else {
    // Group-living: never below the group size (varieties of one species share it). A big
    // tank takes bigger groups — thirty neons are lost in three metres of water.
    min = Math.max(1, Math.ceil(sp.groupSize / sharedBy));
    const roomy = SHOALS.has(slot.role) ? Math.max(1, Math.sqrt(c.liters / 400)) : 1;
    const max = Math.max(min, Math.min(MAX_GROUP, Math.round(sp.groupSize * (slot.max ?? 2) * roomy)));
    n = Math.max(min, Math.min(max, Math.floor(share / cand.units)));
  }
  while (n > min && n * cand.units > budget) n--;
  return n * cand.units <= budget ? n : 0;
}

/** What makes two leads "the same": the species (a colour morph is the same fish), except for goldfish, where varieties are the point. */
function leadKey(role: RoleKey, sp: Species): string {
  return role === 'fancy' || role === 'singleTail' ? sp.id : conspecificKey(sp);
}

/** Fill a template's slots with the best candidates the sim accepts together. */
function fill(t: Template, c: Ctx, used: Map<string, number>, leads: Set<string>): Pick[] | null {
  const picks: Pick[] = [];
  let budget = TARGET_FILL * c.capacity;
  for (const slot of t.slots) {
    // Fancy goldfish varieties share one group between their slots.
    const sharedBy = slot.role === 'fancy' ? t.slots.filter((s) => s.role === 'fancy').length : 1;
    const cands = rolePool(c, slot.role);
    let best: { cand: Cand; n: number; score: number } | null = null;
    let fallback: { cand: Cand; n: number; score: number } | null = null;
    let tries = 0;
    for (const cand of cands) {
      // Vary the lead between suggestions (a colour morph is the same fish) and lean on staples a
      // little less each time they appear.
      const kin = conspecificKey(cand.sp);
      if (!picks.length && leads.has(leadKey(slot.role, cand.sp))) continue;
      // Sorted by base score, so nothing further down can beat the best found so far.
      if (best && cand.score <= best.score) break;
      const score = cand.score - (used.get(kin) ?? 0) * 2;
      // One species per role, and no two of a genus (rivals at best, hybrids at worst) — except
      // fancy goldfish varieties, which are kept together.
      if (picks.some((p) => p.sp.id === cand.sp.id || (slot.role !== 'fancy' && (conspecificKey(p.sp) === kin || genus(p.sp) === genus(cand.sp))))) continue;
      if (++tries > 40) break;
      const n = countFor(cand, slot, c, budget, sharedBy);
      if (!n) continue;
      const others = picks.map((p) => p.sp);
      const level = verdictWith(c, cand.sp, others).level;
      if (level === 'bad') continue;
      // Every resident must also be happy with the newcomer (the checks run both ways).
      let worst: Level = level;
      for (const p of picks) {
        const r = verdictWith(c, p.sp, [...others, cand.sp]).level;
        if (RANK[r] > RANK[worst]) worst = r;
      }
      if (worst === 'bad') continue;
      if (worst !== 'good') {
        fallback ??= { cand, n, score };
        continue;
      }
      if (!best || score > best.score) best = { cand, n, score };
    }
    const chosen = best ?? fallback;
    if (!chosen) {
      if (slot.optional) continue;
      return null;
    }
    picks.push({ sp: chosen.cand.sp, role: slot.role, count: chosen.n, score: chosen.score });
    budget -= chosen.n * chosen.cand.units;
  }
  if (!picks.length) return null;
  // Varieties sharing a group must add up to it.
  const groups = new Map<string, number>();
  for (const p of picks) groups.set(conspecificKey(p.sp), (groups.get(conspecificKey(p.sp)) ?? 0) + p.count);
  for (const p of picks) if (groupLiving(p.sp) && (groups.get(conspecificKey(p.sp)) ?? 0) < p.sp.groupSize) return null;
  return picks;
}

/** The sim's verdict on a whole community: worst level, its reasons, and the stocking it reaches. */
function assess(c: Ctx, picks: { sp: Species; count: number }[]): { level: Level; notes: string[]; stocking: number } {
  let level: Level = 'good';
  const notes: string[] = [];
  const all = picks.map((p) => p.sp);
  for (const p of picks) {
    const r = verdictWith(c, p.sp, all);
    if (RANK[r.level] > RANK[level]) level = r.level;
    if (r.level !== 'good' && r.issues[0] && !notes.includes(r.issues[0])) notes.push(r.issues[0]);
  }
  let load = 0;
  for (const p of picks) load += bioloadUnits(p.sp) * p.count;
  return { level, notes, stocking: load / Math.max(1e-6, c.capacity) };
}

// ---------------------------------------------------------------------------------------------
// Words
// ---------------------------------------------------------------------------------------------

/** Mid-sentence name; possessives keep their capital ("Hengel’s rasbora", "Sterba's cory"). */
function nameOf(sp: Species): string {
  // A bracketed trade or variety name ("Betta (Red dragon scale)") reads badly mid-sentence; the
  // stock list shows the full name.
  const common = sp.commonName.replace(/\s*\([^)]*\)/g, '').trim() || sp.commonName;
  const orig = common.split(' ');
  return lowerName(common)
    .split(' ')
    .map((w, i) => (/[’']s$/.test(w) && orig[i] ? orig[i] : w))
    .join(' ');
}

/** Plural that leaves a quoted variety alone: "umbrella dwarf cichlid 'Opal'" → "umbrella dwarf cichlids 'Opal'". */
function pluralOf(name: string): string {
  const m = /^(.*?)(\s+['‘"].*)$/.exec(name);
  return m ? pluralName(m[1]) + m[2] : pluralName(name);
}

function phrase(p: Pick, c: Ctx, again: boolean): string {
  const name = nameOf(p.sp);
  const many = pluralOf(name);
  const n = p.count;
  const some = n === 1 ? withArticle(name) : `${n} ${many}`;
  const pair = n === 2 && (p.sp.social === 'pair' || has(p.sp, 'pair-bonding')) ? `a pair of ${many}` : p.sp.social === 'harem' && n > 2 ? `a male ${name} with ${n - 1} females` : some;
  switch (p.role) {
    case 'shoal':
    case 'tiny':
      return `${p.sp.social === 'school' || has(p.sp, 'tight-schooling') ? 'a school' : 'a shoal'} of ${n} ${many} in midwater`;
    case 'top':
      return `${some} near the surface`;
    case 'bottom':
      return `${some} ${has(p.sp, 'sand-sifter') ? 'sifting the sand' : 'foraging along the bottom'}`;
    case 'grazer':
      return `${some} grazing algae from the glass and leaves`;
    case 'shrimp':
    case 'colony':
      return n >= 8 ? `a colony of ${n} ${many} picking over the wood and leaves` : `${some} picking over the wood and leaves`;
    case 'snail':
      return `${some} tidying the algae`;
    case 'centre':
    case 'betta':
    case 'mcentre':
      return again ? pair : `${pair} as the centrepiece`;
    case 'rockCat':
      return `${some} slipping between the stones`;
    case 'bgoby':
      return `${some} perched among the roots and stones`;
    case 'bshoal':
    case 'bigShoal':
    case 'mshoal':
      return p.sp.social === 'harem' ? `${pair} over the rock` : `a shoal of ${n} ${many}${p.role === 'mshoal' ? ' over the rock' : ''}`;
    case 'archer':
      return `${some} watching the surface for insects`;
    case 'clown':
      return `${pair}${c.corals ? ' in their anemone' : ''}`;
    case 'mgoby':
      return `${pair} perched at the foot of the rock`;
    case 'cleaner':
      return n === 2 && has(p.sp, 'cleaner') ? `${pair} running a cleaning station` : some;
    case 'mcrew':
      return `${some} grazing the rock and sand`;
    default:
      return some;
  }
}

function title(picks: Pick[]): string {
  const many = (p: Pick) => (p.count === 1 ? nameOf(p.sp) : pluralOf(nameOf(p.sp)));
  const lead = picks[0];
  const second = picks.find((p, i) => i > 0 && p.role !== 'snail' && p.role !== 'mcrew') ?? picks[1];
  return capitalize(second ? `${many(lead)} & ${many(second)}` : many(lead));
}

/** Forgiving all round: easy to find, peaceful, and tolerant of a wide range of water. */
function hardy(sp: Species): boolean {
  const avail = sp.availability ?? 'common';
  return avail === 'common' && sp.temperament === 'peaceful' && sp.tempC[1] - sp.tempC[0] >= 5 && sp.ph[1] - sp.ph[0] >= 1.4;
}

function describe(t: Template, picks: Pick[], c: Ctx, level: Level, notes: string[]): string {
  let text = `${t.intro}: ${joinList(picks.map((p, i) => phrase(p, c, picks.slice(0, i).some((q) => q.role === p.role))))}.`;
  if (level === 'good' && picks.every((p) => hardy(p.sp))) text += ' Hardy and forgiving — a good first community.';
  if (level === 'caution' && notes[0]) text += ` Worth knowing: ${notes[0].charAt(0).toLowerCase()}${notes[0].slice(1)}`;
  return text;
}

// ---------------------------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------------------------

/**
 * Three to six communities that genuinely suit the planned tank, best first: same water type,
 * comfortable at the heater's temperature and the biotope's pH and hardness, room to swim, groups
 * at their proper size, every pairing accepted by the life sim (good, or at worst 'caution' with
 * the reason in `notes`), at no more than 80 % of the tank's capacity. Fewer when the tank is too
 * small or too unusual for more (an empty list for, say, goldfish in a desktop nano).
 * Cached per spec; typically a few milliseconds after the first call.
 */
export function suggestStock(spec: TankSpec, species: SpeciesIndex, plants: PlantIndex): StockSuggestion[] {
  const c = context(spec, species, plants);
  if (c.suggestions) return c.suggestions.map((s) => ({ ...s, stock: s.stock.map((q) => ({ ...q })) }));
  const found: { s: StockSuggestion; order: number }[] = [];
  const seen = new Set<string>();
  const used = new Map<string, number>();
  const leads = new Set<string>();
  const templates = TEMPLATES.filter((t) => t.when(c));
  // Two passes: each template's best community, then (while there is room) a variation with a
  // different lead species.
  for (let pass = 0; pass < 2 && found.length < MAX_SUGGESTIONS; pass++) {
    templates.forEach((t, ti) => {
      if (found.length >= MAX_SUGGESTIONS) return;
      const picks = fill(t, c, used, leads);
      if (!picks) return;
      const key = picks.map((p) => p.sp.id).sort().join('|');
      if (seen.has(key)) return;
      const { level, notes, stocking } = assess(c, picks);
      if (level === 'bad' || stocking > MAX_FILL) return;
      seen.add(key);
      leads.add(leadKey(picks[0].role, picks[0].sp));
      for (const p of picks) used.set(conspecificKey(p.sp), (used.get(conspecificKey(p.sp)) ?? 0) + 1);
      found.push({
        order: pass * 100 + ti + RANK[level] * 1000,
        s: {
          id: `${t.id}:${picks[0].sp.id}`,
          title: title(picks),
          description: describe(t, picks, c, level, notes),
          stock: picks.map((p) => ({ speciesId: p.sp.id, count: p.count })),
          level,
          stocking: Math.round(stocking * 1000) / 1000,
          ...(notes.length && level !== 'good' ? { notes } : {}),
        },
      });
    });
  }
  c.suggestions = found.sort((a, b) => a.order - b.order).map((f) => f.s);
  return suggestStock(spec, species, plants);
}

/**
 * Check a hand-picked stock list against the planned tank with the life sim's rules: each
 * species against all the others (worst issue first), group sizes, rival males, and how full the
 * tank would be at adult size.
 */
export function checkStock(spec: TankSpec, stock: TankSpec['stock'], species: SpeciesIndex, plants: PlantIndex): StockCheck {
  const c = context(spec, species, plants);
  const issues: StockCheck['issues'] = [];
  const counts = new Map<string, number>();
  for (const q of stock) {
    const n = Math.round(q.count);
    if (n > 0) counts.set(q.speciesId, (counts.get(q.speciesId) ?? 0) + n);
  }
  const picks: { sp: Species; count: number }[] = [];
  for (const [id, count] of counts) {
    const sp = species.get(id);
    if (sp) picks.push({ sp, count });
    else issues.push({ speciesId: id, level: 'bad', text: 'This species is not in the catalog.' });
  }
  const all = picks.map((p) => p.sp);
  const group = new Map<string, number>();
  for (const p of picks) group.set(conspecificKey(p.sp), (group.get(conspecificKey(p.sp)) ?? 0) + p.count);
  let load = 0;
  for (const p of picks) {
    load += bioloadUnits(p.sp) * p.count;
    const they = capitalize(pluralOf(nameOf(p.sp)));
    const r = verdictWith(c, p.sp, all);
    if (r.level !== 'good' && r.issues[0]) issues.push({ speciesId: p.sp.id, level: r.level, text: r.issues[0] });
    const mates = group.get(conspecificKey(p.sp)) ?? p.count;
    if (isFighter(p.sp) && mates >= 2) issues.push({ speciesId: p.sp.id, level: 'bad', text: `Male ${pluralOf(nameOf(p.sp))} fight to the death — keep only one male per tank.` });
    else if (groupLiving(p.sp) && p.sp.groupSize > 1 && mates < p.sp.groupSize)
      issues.push({ speciesId: p.sp.id, level: 'caution', text: `${they} feel secure in groups — keep at least ${p.sp.groupSize}.` });
  }
  const ratio = load / Math.max(1e-6, c.capacity);
  if (picks.length && ratio > 1) {
    // Pinned on the heaviest species: that is where a smaller group helps most.
    const heavy = picks.reduce((a, b) => (bioloadUnits(b.sp) * b.count > bioloadUnits(a.sp) * a.count ? b : a));
    issues.push({
      speciesId: heavy.sp.id,
      level: ratio > 1.3 ? 'bad' : 'caution',
      text: ratio > 1.3 ? `Together they would bring the tank to ${Math.round(ratio * 100)}% of what it can support.` : `Together they would fill the tank to ${Math.round(ratio * 100)}% of its capacity.`,
    });
  }
  issues.sort((a, b) => RANK[b.level] - RANK[a.level]);
  let level: Level = 'good';
  for (const i of issues) if (RANK[i.level] > RANK[level]) level = i.level;
  return { level, issues, stocking: Math.round(ratio * 1000) / 1000 };
}
