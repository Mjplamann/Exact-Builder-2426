import type { FishState, Reproduction, Species, WaterParams } from '../core/types';
import type { World } from '../core/world';
import { waterLiters } from '../core/tankGeometry';
import {
  MS_PER_MONTH,
  bioloadUnits,
  conspecificKey,
  gapeRatio,
  grazingWeights,
  growthK,
  growthTempFactor,
  isFighter,
  isInvertEater,
  isInvertebrate,
  isLongFinned,
  isPredator,
  massCoefficient,
  metabolicFactor,
  sexLengthScale,
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
  /** Hot species fields copied here so per-fish loops stay monomorphic (species JSON shapes vary). */
  adultMale: number;
  adultFemale: number;
  adultOther: number;
  k: number;
  maturityMonths: number;
  lifespanYears: number;
  birthLengthCm: number;
  tempLo: number;
  tempHi: number;
  phLo: number;
  phHi: number;
  reproduction: Reproduction;
  isSnail: boolean;
  isFish: boolean;
  isShrimp: boolean;
  water: Species['water'];
  minTankLiters: number;
  airGulper: boolean;
  finNipper: boolean;
  territorial: boolean;
  /** Aggressive or predatory temperament. */
  aggressive: boolean;
  semiAggressive: boolean;
  peaceful: boolean;
  zone: Species['zone'];
  /** Needs a group (school, shoal, colony, harem) of `groupSize`. */
  groupLiving: boolean;
  pairLiving: boolean;
  groupSize: number;
  // --- per step ---
  /** Metabolic temperature factor (Q10 vs 25 °C). */
  metabolic: number;
  /** Growth thermal-performance factor (and the temperature it was computed for). */
  growthTemp: number;
  growthTempAt: number;
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

/** Asymptotic length L∞ (cm, before stunting) of an individual, from the cached species stats. */
export function linfOf(st: SpeciesStats, s: Pick<FishState, 'sex' | 'sizeFactor'>): number {
  return (s.sex === 'male' ? st.adultMale : s.sex === 'female' ? st.adultFemale : st.adultOther) * (s.sizeFactor || 1);
}

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
  /** Gapes (cm) of every animal that can eat small prey; sorted lazily on first query. */
  private gapes = new Float64Array(512);
  gapeCount = 0;
  private gapesSorted = true;
  private gapeMax = 0;
  private bySpecies = new Map<string, SpeciesStats>();
  private byGroup = new Map<string, GroupStats>();
  private socialRoster = -1;
  private socialAt = -Infinity;
  private capSig = -1;
  private capAt = -Infinity;

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
      adultMale: sp.adultLengthCm * sexLengthScale(sp, 'male'),
      adultFemale: sp.adultLengthCm * sexLengthScale(sp, 'female'),
      adultOther: sp.adultLengthCm,
      k: growthK(sp),
      maturityMonths: sp.maturityMonths,
      lifespanYears: sp.lifespanYears,
      birthLengthCm: sp.birthLengthCm,
      tempLo: sp.tempC[0],
      tempHi: sp.tempC[1],
      phLo: sp.ph[0],
      phHi: sp.ph[1],
      reproduction: sp.reproduction,
      isSnail: sp.group === 'snail',
      isFish: sp.group === 'fish',
      isShrimp: sp.group === 'shrimp',
      water: sp.water,
      minTankLiters: sp.minTankLiters,
      airGulper: sp.traits.includes('air-gulper'),
      finNipper: sp.traits.includes('fin-nipper'),
      territorial: sp.traits.includes('territorial'),
      aggressive: sp.temperament === 'aggressive' || sp.temperament === 'predatory',
      semiAggressive: sp.temperament === 'semi-aggressive',
      peaceful: sp.temperament === 'peaceful',
      zone: sp.zone,
      groupLiving: SOCIAL_GROUPS.has(sp.social),
      pairLiving: sp.social === 'pair',
      groupSize: sp.groupSize,
      metabolic: 1,
      growthTemp: 1,
      growthTempAt: Number.NaN,
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
    this.capSig = -1;
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
    this.gapeMax = 0;
    this.gapesSorted = false;
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
      if ((now - s.bornAt) / MS_PER_MONTH >= st.maturityMonths && s.lengthCm >= 0.6 * linfOf(st, s)) {
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
        if (gape > this.gapeMax) this.gapeMax = gape;
      }
    }

    // Stocking & crowding.
    // Capacity depends on volume, filter and plants: refresh when they change or every 6 sim hours.
    const f = world.tank.equipment.filter;
    const capSig = world.tank.plants.length * 7 + f.flowLph * 3 + (f.on ? 1 : 0) + this.liters * 11 + f.type.length;
    if (capSig !== this.capSig || Math.abs(now - this.capAt) > 6 * 3600_000) {
      this.capacity = stockingCapacity(world);
      this.capSig = capSig;
      this.capAt = now;
    }
    this.ratio = this.bioload / Math.max(1, this.capacity);
    this.crowdStress = 0.5 * smoothstep(1.0, 1.8, this.ratio);

    const wp = world.tank.waterParams;
    const metabolic = metabolicFactor(wp.temperatureC);
    const nh3Frac = freeAmmoniaFraction(wp.ph, wp.temperatureC);
    for (let i = 0; i < this.activeCount; i++) this.environment(this.active[i], wp, co2, zen, metabolic, nh3Frac);

    const roster = this.fishCount * 1009 + this.activeCount;
    if (roster !== this.socialRoster || now - this.socialAt > 3 * 3600_000 || now < this.socialAt) {
      this.socialRoster = roster;
      this.socialAt = now;
      for (let i = 0; i < this.activeCount; i++) this.social(this.active[i]);
    }
  }

  /** Number of animals that could swallow prey of total length `lengthCm`. */
  predatorsFor(lengthCm: number): number {
    if (lengthCm >= this.gapeMax) return 0;
    if (!this.gapesSorted) {
      this.gapes.subarray(0, this.gapeCount).sort();
      this.gapesSorted = true;
    }
    // Upper bound: first gape > lengthCm in the sorted prefix.
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
    return this.gapeMax;
  }

  // ------------------------------------------------------------------------------------------

  /** Water, temperature, pH, salinity and tank-size stress for one species. */
  private environment(st: SpeciesStats, wp: WaterParams, co2: number, zen: boolean, metabolic: number, nh3Frac: number): void {
    const T = wp.temperatureC;
    st.metabolic = metabolic;
    if (st.growthTempAt !== T) {
      st.growthTemp = growthTempFactor(st.species, T);
      st.growthTempAt = T;
    }

    // --- environment --------------------------------------------------------------------------
    this.begin();
    this.hurtSum = 0;
    this.hurtMax = 0;
    this.hurtCause = '';

    // Salinity: every species has an osmotic comfort band; far outside it is quickly fatal.
    const sg = wp.salinitySG;
    const slo = st.water === 'freshwater' ? 0.998 : st.water === 'brackish' ? 1.002 : 1.019;
    const shi = st.water === 'freshwater' ? 1.004 : st.water === 'brackish' ? 1.018 : 1.028;
    const sd = outside(sg, slo, shi);
    if (sd > 0) {
      this.acc(smoothstep(0, 0.006, sd), 'salinity');
      if (sd > 0.008) this.hurt((sd - 0.008) * 150, 'salinity');
    }
    // Temperature.
    const dT = outside(T, st.tempLo, st.tempHi);
    if (dT > 0) {
      const cause = T > st.tempHi ? 'too warm' : 'too cold';
      this.acc(smoothstep(0, 5, dT), cause);
      if (dT > 3) this.hurt((dT - 3) * 0.35, cause);
    }
    // pH.
    const dP = outside(wp.ph, st.phLo, st.phHi);
    if (dP > 0) {
      this.acc(0.8 * smoothstep(0, 1.2, dP), 'ph');
      if (dP > 1.2) this.hurt((dP - 1.2) * 0.4, 'ph');
    }
    // Tank too small: cramped, and growth stunts (a goldfish in a bowl).
    const lit = this.liters / Math.max(1, st.minTankLiters);
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
      const marineFish = st.water === 'marine' && !st.invert;
      const tan = wp.ammonia * sens;
      const nh3 = tan * nh3Frac;
      this.acc(smoothstep(0.004, 0.06, nh3), 'ammonia');
      this.acc(0.4 * smoothstep(0.3, 3, tan), 'ammonia');
      if (nh3 > 0.08) this.hurt((nh3 - 0.08) * 6, 'ammonia');
      // Chloride protects marine fish from nitrite.
      const no2 = wp.nitrite * sens * (marineFish ? 0.4 : 1);
      this.acc(smoothstep(0.1, 1.5, no2), 'nitrite');
      if (no2 > 2) this.hurt((no2 - 2) * 0.2, 'nitrite');
      const no3 = wp.nitrate * (st.isShrimp ? 2 : st.invert ? 1.5 : marineFish ? 1.3 : 1);
      this.acc(0.7 * smoothstep(40, 160, no3), 'nitrate');
      if (no3 > 300) this.hurt((no3 - 300) * 0.002, 'nitrate');
      // Air-breathers (labyrinth fish, corydoras) shrug off low oxygen.
      const tol = st.airGulper ? 0.35 : 1;
      const o2 = 1 - (1 - wp.oxygen) * tol;
      this.acc(smoothstep(0.65, 0.3, o2), 'low oxygen');
      if (o2 < 0.3) this.hurt((0.3 - o2) * 5, 'low oxygen');
      this.acc(smoothstep(30, 60, co2 * (st.invert ? 1.2 : 1)), 'low oxygen');
    }
    st.toxStress = this.accS;
    st.toxCause = this.accCause;
    st.acute = zen ? 0 : this.hurtSum;
    st.acuteCause = this.hurtCause;
  }

  /** Stress from group size, rivals and tankmates for one species. */
  private social(st: SpeciesStats): void {
    const g = st.group;
    this.begin();
    // Shoaling/schooling species need company; a lone schooling fish is chronically anxious.
    if (st.groupLiving && st.groupSize > 1) {
      const deficit = clamp01(1 - (g.count - 1) / Math.max(1, st.groupSize - 1));
      if (deficit > 0) this.acc(0.45 * Math.pow(deficit, 1.2), 'lonely');
    } else if (st.pairLiving && g.count === 1) this.acc(0.06, 'lonely');
    // Rival males of fighting species; territorial rivals in a tank too small for two territories.
    if (st.fighter && g.males >= 2) this.acc(0.7, 'tankmates');
    if (st.territorial && !st.peaceful && g.count >= 2 && this.liters < 2 * st.minTankLiters) this.acc(0.15, 'tankmates');

    const adult = st.adultOther;
    for (let i = 0; i < this.activeCount; i++) {
      const o = this.active[i];
      if (o === st) continue;
      // A predator big enough to swallow us keeps us nervous.
      if (!st.invert && o.predator && o.adultOther * o.gapeRatio > adult * 0.9) this.acc(0.2, 'tankmates');
      if (st.invert && o.invertEater) this.acc(0.4, 'tankmates');
      if (o.finNipper && st.longFinned) this.acc(0.35, 'tankmates');
      if (o.aggressive && st.peaceful && !st.invert) this.acc(this.liters < 2 * o.minTankLiters ? 0.3 : 0.15, 'tankmates');
      else if (o.semiAggressive && o.territorial && st.peaceful && st.zone === o.zone && this.liters < 1.5 * o.minTankLiters)
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
