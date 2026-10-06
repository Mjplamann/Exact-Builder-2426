import type { Species, WaterParams } from '../core/types';
import type { World } from '../core/world';
import { waterLiters } from '../core/tankGeometry';
import {
  ageMonths,
  asymptoticLength,
  bioloadUnits,
  conspecificKey,
  gapeRatio,
  grazingWeights,
  growthTempFactor,
  isFighter,
  isInvertEater,
  isInvertebrate,
  isLongFinned,
  isPredator,
  massCoefficient,
  metabolicFactor,
} from './biology';
import { freeAmmoniaFraction } from './chemistry';
import { clamp, clamp01, outside, smoothstep } from './simMath';

/**
 * Per-step census of the tank: who lives here (per species and per conspecific group, by sex and
 * maturity), how large the predators' mouths are, how crowded it is, and — per species — how
 * stressful the water, the tank and the tankmates are. Built once per sim step in O(fish) with
 * reused objects; the O(species²) tankmate analysis only reruns when the roster changes.
 */

/** Conspecific group (a species plus its color morphs). */
export interface GroupStats {
  key: string;
  stamp: number;
  count: number;
  males: number;
  matureMales: number;
  matureFemales: number;
  /** Mature animals of unknown sex (hermaphrodite snails). */
  matureUnknown: number;
}

export interface SpeciesStats {
  species: Species;
  group: GroupStats;
  stamp: number;
  count: number;
  // --- static traits (computed once) ---
  massCoef: number;
  gapeRatio: number;
  bioload: number;
  longFinned: boolean;
  predator: boolean;
  invertEater: boolean;
  fighter: boolean;
  invert: boolean;
  grazeGlass: number;
  grazeSurface: number;
  plantEater: boolean;
  coralNipper: boolean;
  // --- per step ---
  /** Metabolic temperature factor (Q10 vs 25 °C). */
  metabolic: number;
  /** Growth thermal-performance factor. */
  growthTemp: number;
  /** L∞ multiplier and growth-rate multiplier from tank size (stunting). */
  stunt: number;
  stuntRate: number;
  envStress: number;
  envCause: string;
  toxStress: number;
  toxCause: string;
  socialStress: number;
  socialCause: string;
  /** Direct health damage per day (acute toxicity, osmotic shock, heat), and its cause. */
  acute: number;
  acuteCause: string;
}

const SOCIAL_GROUPS = new Set(['school', 'shoal', 'colony', 'harem']);

export class Census {
  stamp = 0;
  fishCount = 0;
  liters = 1;
  /** Stocking (adult bioload / capacity) and the resulting crowding stress. */
  bioload = 0;
  capacity = 1;
  ratio = 0;
  crowdStress = 0;
  /** Species present this step: `active[0..activeCount)`. */
  active: SpeciesStats[] = [];
  activeCount = 0;
  /** Sorted (ascending) gapes (cm) of every animal that can eat small prey; `Infinity` padding. */
  private gapes = new Float64Array(512);
  gapeCount = 0;
  private bySpecies = new Map<string, SpeciesStats>();
  private byGroup = new Map<string, GroupStats>();
  private socialRoster = -1;
  private socialAt = -Infinity;

  // Allocation-free stress accumulators: combined = 1 − Π(1 − sᵢ), plus the dominant cause.
  private accS = 0;
  private accMax = 0;
  private accCause = '';
  private hurtSum = 0;
  private hurtMax = 0;
  private hurtCause = '';
  private begin(): void {
    this.accS = 0;
    this.accMax = 0;
    this.accCause = '';
  }
  private acc(v: number, cause: string): void {
    if (v <= 0) return;
    this.accS = 1 - (1 - this.accS) * (1 - v);
    if (v > this.accMax) {
      this.accMax = v;
      this.accCause = cause;
    }
  }
  private hurt(perDay: number, cause: string): void {
    if (perDay <= 0) return;
    this.hurtSum += perDay;
    if (perDay > this.hurtMax) {
      this.hurtMax = perDay;
      this.hurtCause = cause;
    }
  }

  /** Stats record for a species (created on first sight). */
  stats(sp: Species): SpeciesStats {
    let st = this.bySpecies.get(sp.id);
    if (st && st.species === sp) return st;
    const key = conspecificKey(sp);
    let group = this.byGroup.get(key);
    if (!group) {
      group = { key, stamp: -1, count: 0, males: 0, matureMales: 0, matureFemales: 0, matureUnknown: 0 };
      this.byGroup.set(key, group);
    }
    const g = grazingWeights(sp);
    st = {
      species: sp,
      group,
      stamp: -1,
      count: 0,
      massCoef: massCoefficient(sp),
      gapeRatio: gapeRatio(sp),
      bioload: bioloadUnits(sp),
      longFinned: isLongFinned(sp),
      predator: isPredator(sp),
      invertEater: isInvertEater(sp),
      fighter: isFighter(sp),
      invert: isInvertebrate(sp),
      grazeGlass: g.glass,
      grazeSurface: g.surface,
      plantEater: sp.traits.includes('plant-eater'),
      coralNipper: sp.traits.includes('coral-nipper'),
      metabolic: 1,
      growthTemp: 1,
      stunt: 1,
      stuntRate: 1,
      envStress: 0,
      envCause: '',
      toxStress: 0,
      toxCause: '',
      socialStress: 0,
      socialCause: '',
      acute: 0,
      acuteCause: '',
    };
    this.bySpecies.set(sp.id, st);
    return st;
  }

  /** Forget everything (tank replaced). */
  reset(): void {
    this.bySpecies.clear();
    this.byGroup.clear();
    this.socialRoster = -1;
    this.socialAt = -Infinity;
  }

  /** Mark the roster as changed so tankmate relations are re-evaluated. */
  invalidateSocial(): void {
    this.socialRoster = -1;
  }

  /** Count animals and derive every per-species factor for this step. */
  build(world: World, now: number, co2: number, zen: boolean): void {
    const stamp = ++this.stamp;
    this.liters = waterLiters(world.tank);
    this.activeCount = 0;
    this.gapeCount = 0;
    this.bioload = 0;
    let gapes = this.gapes;
    const fish = world.fish;
    this.fishCount = fish.length;
    for (let i = 0; i < fish.length; i++) {
      const f = fish[i];
      const st = this.stats(f.species);
      if (st.stamp !== stamp) {
        st.stamp = stamp;
        st.count = 0;
        if (this.activeCount < this.active.length) this.active[this.activeCount] = st;
        else this.active.push(st);
        this.activeCount++;
      }
      st.count++;
      this.bioload += st.bioload;
      const g = st.group;
      if (g.stamp !== stamp) {
        g.stamp = stamp;
        g.count = g.males = g.matureMales = g.matureFemales = g.matureUnknown = 0;
      }
      g.count++;
      const s = f.state;
      if (s.sex === 'male') g.males++;
      const sp = f.species;
      if (ageMonths(s, now) >= sp.maturityMonths && s.lengthCm >= 0.6 * asymptoticLength(sp, s)) {
        if (s.sex === 'male') g.matureMales++;
        else if (s.sex === 'female') g.matureFemales++;
        else g.matureUnknown++;
      }
      const gape = s.lengthCm * st.gapeRatio;
      if (gape > 0.05) {
        if (this.gapeCount >= gapes.length) {
          const bigger = new Float64Array(gapes.length * 2);
          bigger.set(gapes);
          gapes = this.gapes = bigger;
        }
        gapes[this.gapeCount++] = gape;
      }
    }
    gapes.fill(Infinity, this.gapeCount);
    gapes.sort();

    // Stocking & crowding.
    this.capacity = stockingCapacity(world);
    this.ratio = this.bioload / Math.max(1, this.capacity);
    this.crowdStress = 0.5 * smoothstep(1.0, 1.8, this.ratio);

    const wp = world.tank.waterParams;
    for (let i = 0; i < this.activeCount; i++) this.environment(this.active[i], world, wp, co2, zen);

    const roster = this.fishCount * 1009 + this.activeCount;
    if (roster !== this.socialRoster || now - this.socialAt > 3 * 3600_000 || now < this.socialAt) {
      this.socialRoster = roster;
      this.socialAt = now;
      for (let i = 0; i < this.activeCount; i++) this.social(this.active[i]);
    }
  }

  /** Number of animals that could swallow prey of total length `lengthCm`. */
  predatorsFor(lengthCm: number): number {
    // Upper bound: first gape > lengthCm in the sorted array.
    let lo = 0, hi = this.gapeCount;
    while (lo < hi) {
      const mid = (lo + hi) >>> 1;
      if (this.gapes[mid] > lengthCm) hi = mid;
      else lo = mid + 1;
    }
    return this.gapeCount - lo;
  }

  /** Largest gape in the tank (cm). */
  get maxGape(): number {
    return this.gapeCount > 0 ? this.gapes[this.gapeCount - 1] : 0;
  }

  // ------------------------------------------------------------------------------------------

  /** Water, temperature, pH, salinity and tank-size stress for one species. */
  private environment(st: SpeciesStats, world: World, wp: WaterParams, co2: number, zen: boolean): void {
    const sp = st.species;
    const T = wp.temperatureC;
    st.metabolic = metabolicFactor(T);
    st.growthTemp = growthTempFactor(sp, T);

    // --- environment --------------------------------------------------------------------------
    this.begin();
    this.hurtSum = 0;
    this.hurtMax = 0;
    this.hurtCause = '';

    // Salinity: every species has an osmotic comfort band; far outside it is quickly fatal.
    const sg = wp.salinitySG;
    const slo = sp.water === 'freshwater' ? 0.998 : sp.water === 'brackish' ? 1.002 : 1.019;
    const shi = sp.water === 'freshwater' ? 1.004 : sp.water === 'brackish' ? 1.018 : 1.028;
    const sd = outside(sg, slo, shi);
    if (sd > 0) {
      this.acc(smoothstep(0, 0.006, sd), 'salinity');
      if (sd > 0.008) this.hurt((sd - 0.008) * 150, 'salinity');
    }
    // Temperature.
    const dT = outside(T, sp.tempC[0], sp.tempC[1]);
    if (dT > 0) {
      const cause = T > sp.tempC[1] ? 'too warm' : 'too cold';
      this.acc(smoothstep(0, 5, dT), cause);
      if (dT > 3) this.hurt((dT - 3) * 0.35, cause);
    }
    // pH.
    const dP = outside(wp.ph, sp.ph[0], sp.ph[1]);
    if (dP > 0) {
      this.acc(0.8 * smoothstep(0, 1.2, dP), 'ph');
      if (dP > 1.2) this.hurt((dP - 1.2) * 0.4, 'ph');
    }
    // Tank too small: cramped, and growth stunts (a goldfish in a bowl).
    const lit = this.liters / Math.max(1, sp.minTankLiters);
    if (lit < 1) {
      this.acc(0.08 + 0.25 * (1 - lit), 'cramped');
      st.stunt = clamp(0.6 + 0.4 * Math.sqrt(lit), 0.6, 1);
      st.stuntRate = 0.75 + 0.25 * lit;
    } else {
      st.stunt = 1;
      st.stuntRate = 1;
    }
    st.envStress = this.accS;
    st.envCause = this.accCause;

    // --- water quality (zen keeps the water healthy) ------------------------------------------
    this.begin();
    if (!zen) {
      const sens = st.invert ? 1.6 : 1;
      const marineFish = sp.water === 'marine' && !st.invert;
      const tan = wp.ammonia * sens;
      const nh3 = tan * freeAmmoniaFraction(wp.ph, T);
      this.acc(smoothstep(0.004, 0.06, nh3), 'ammonia');
      this.acc(0.4 * smoothstep(0.3, 3, tan), 'ammonia');
      if (nh3 > 0.08) this.hurt((nh3 - 0.08) * 6, 'ammonia');
      // Chloride protects marine fish from nitrite.
      const no2 = wp.nitrite * sens * (marineFish ? 0.4 : 1);
      this.acc(smoothstep(0.1, 1.5, no2), 'nitrite');
      if (no2 > 2) this.hurt((no2 - 2) * 0.2, 'nitrite');
      const no3 = wp.nitrate * (sp.group === 'shrimp' ? 2 : st.invert ? 1.5 : marineFish ? 1.3 : 1);
      this.acc(0.7 * smoothstep(40, 160, no3), 'nitrate');
      if (no3 > 300) this.hurt((no3 - 300) * 0.002, 'nitrate');
      // Air-breathers (labyrinth fish, corydoras) shrug off low oxygen.
      const tol = sp.traits.includes('air-gulper') ? 0.35 : 1;
      const o2 = 1 - (1 - wp.oxygen) * tol;
      this.acc(smoothstep(0.65, 0.3, o2), 'low oxygen');
      if (o2 < 0.3) this.hurt((0.3 - o2) * 5, 'low oxygen');
      this.acc(smoothstep(30, 60, co2 * (st.invert ? 1.2 : 1)), 'low oxygen');
    }
    st.toxStress = this.accS;
    st.toxCause = this.accCause;
    st.acute = zen ? 0 : this.hurtSum;
    st.acuteCause = this.hurtCause;
    void world;
  }

  /** Stress from group size, rivals and tankmates for one species. */
  private social(st: SpeciesStats): void {
    const sp = st.species;
    const g = st.group;
    this.begin();
    // Shoaling/schooling species need company; a lone schooling fish is chronically anxious.
    if (SOCIAL_GROUPS.has(sp.social) && sp.groupSize > 1) {
      const deficit = clamp01(1 - (g.count - 1) / Math.max(1, sp.groupSize - 1));
      if (deficit > 0) this.acc(0.45 * Math.pow(deficit, 1.2), 'lonely');
    } else if (sp.social === 'pair' && g.count === 1) this.acc(0.06, 'lonely');
    // Rival males of fighting species.
    if (st.fighter && g.males >= 2) this.acc(0.7, 'tankmates');
    if (sp.traits.includes('territorial') && sp.temperament !== 'peaceful' && g.count >= 2 && this.liters < 2 * sp.minTankLiters)
      this.acc(0.15, 'tankmates');

    for (let i = 0; i < this.activeCount; i++) {
      const o = this.active[i];
      if (o === st) continue;
      const os = o.species;
      // A predator big enough to swallow us keeps us nervous.
      if (!st.invert && os.adultLengthCm * o.gapeRatio > sp.adultLengthCm * 0.9 && o.predator) this.acc(0.2, 'tankmates');
      if (st.invert && o.invertEater) this.acc(0.4, 'tankmates');
      if (o.species.traits.includes('fin-nipper') && st.longFinned) this.acc(0.35, 'tankmates');
      if ((os.temperament === 'aggressive' || os.temperament === 'predatory') && sp.temperament === 'peaceful' && !st.invert)
        this.acc(this.liters < 2 * os.minTankLiters ? 0.3 : 0.15, 'tankmates');
      else if (
        os.temperament === 'semi-aggressive' &&
        os.traits.includes('territorial') &&
        sp.temperament === 'peaceful' &&
        sp.zone === os.zone &&
        this.liters < 1.5 * os.minTankLiters
      )
        this.acc(0.08, 'tankmates');
    }
    st.socialStress = this.accS;
    st.socialCause = this.accCause;
  }
}

// ---------------------------------------------------------------------------------------------
// Stocking capacity
// ---------------------------------------------------------------------------------------------

/**
 * What the tank can support, in the same "cm of small fish" units as `bioloadUnits`:
 * ≈1.15 cm/L for a well-filtered freshwater tank (the 1 cm/L rule with good filtration), half
 * that for a reef, scaled by filter turnover & type and helped a little by plants.
 */
export function stockingCapacity(world: World): number {
  const tank = world.tank;
  const liters = waterLiters(tank);
  const f = tank.equipment.filter;
  const gross = (tank.size.widthCm * tank.size.depthCm * tank.size.heightCm) / 1000;
  const turnover = f.flowLph / Math.max(1, gross);
  const typeEff = f.type === 'sponge' ? 0.85 : f.type === 'hang-on-back' ? 0.95 : f.type === 'internal' ? 0.9 : f.type === 'sump' ? 1.15 : 1;
  const filter = f.on ? clamp(0.55 + 0.45 * Math.sqrt(turnover / 5), 0.55, 1.3) * typeEff : 0.35;
  let plantArea = 0;
  for (const p of tank.plants) {
    const ps = world.plants.get(p.speciesId);
    if (ps && ps.water !== 'marine') plantArea += (ps.spreadCm / 100) ** 2 * p.growth;
  }
  const floor = (tank.size.widthCm * tank.size.depthCm) / 1e4;
  const plants = 1 + 0.15 * clamp01(plantArea / Math.max(0.01, floor));
  const waterF = tank.water === 'marine' ? 0.5 : tank.water === 'brackish' ? 0.8 : 1;
  return liters * 1.15 * filter * plants * waterF;
}
