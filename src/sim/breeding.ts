import type { CareMode, FishEntity, Reproduction, Species, WaterParams } from '../core/types';
import type { Rng } from '../core/rng';
import { MS_PER_DAY } from '../core/clock';
import { ageMonths, asymptoticLength } from './biology';
import type { Census, SpeciesStats } from './census';
import { clamp, clamp01, outside, poisson, smoothstep } from './simMath';

/**
 * Reproduction by strategy, on the sim clock.
 *
 *  - Livebearers: a mature female with a male present conceives within days, carries for
 *    ~26 days at 25 °C (Q10 ≈ 2), and drops a brood that scales with her size (guppy 10–40).
 *    Females store sperm for months, so broods can continue after the male is gone.
 *  - Egg-carriers (Neocaridina, crayfish): berried ~28 days, then 10–30 shrimplets.
 *  - Mouthbrooders hold eggs ~3 weeks; pouch-brooding male seahorses ~2–3 weeks.
 *  - Egg-layers in a community tank spawn every week or two; the eggs are nearly all eaten
 *    unless the tank is densely planted and has few egg-eaters. Pairs of guarding species
 *    (cichlids, gouramis) raise small broods when undisturbed; demersal reef spawners (clownfish)
 *    lay eggs every couple of weeks but the larvae drift off and vanish; pelagic spawners leave
 *    nothing behind.
 *  - Large populations and overstocking shrink broods (soft cap ≈ 350 animals) — as happens in
 *    real crowded tanks where fry are eaten and water quality limits survival.
 */

/** What breeding needs from the simulation that owns it. */
export interface BreedHost {
  readonly rng: Rng;
  readonly census: Census;
  /** Refuge quality 0..1 (plant thickets, moss, floating cover). */
  readonly cover: number;
  /** Caves & shells available. */
  readonly caves: number;
  readonly careMode: CareMode;
  readonly water: WaterParams;
  /** Multiplier 1..3 shortly after a large, cool water change (classic spawning trigger). */
  waterChangeBoost(now: number): number;
  /** Fry appear now (live-born, released, hatched clutches due). */
  deliver(mother: FishEntity, count: number, how: BirthKind, now: number): void;
  /** Eggs laid now that become free-swimming fry in `days` days. */
  queueClutch(mother: FishEntity, count: number, days: number, now: number): void;
  /** A spawning with no surviving young (journaled gently, throttled). */
  noteSpawn(mother: FishEntity, now: number): void;
}

export type BirthKind = 'born' | 'shrimplets' | 'released' | 'pouch' | 'hatched' | 'raised';

/** Soft population cap: above it broods shrink, keeping the tank (and the GPU) comfortable. */
export const POPULATION_SOFT_CAP = 350;
/** Largest brood tracked as individual animals. */
const MAX_BROOD = 40;

/** Strategies whose young develop inside/on a parent (tracked with `gravidSince`). */
function carriesYoung(mode: Reproduction): boolean {
  return mode === 'livebearer' || mode === 'egg-carrier' || mode === 'mouthbrooder' || mode === 'pouch-brooder';
}

/** Days from conception/berrying/spawn to birth or release, temperature-dependent (Q10 ≈ 2). */
export function gestationDays(mode: Reproduction, tempC: number): number {
  switch (mode) {
    case 'livebearer':
      return clamp(26 * Math.pow(2, (25 - tempC) / 10), 18, 45);
    case 'egg-carrier':
      return clamp(28 * Math.pow(2, (24 - tempC) / 10), 18, 50);
    case 'mouthbrooder':
      return clamp(21 * Math.pow(2, (26 - tempC) / 10), 14, 35);
    case 'pouch-brooder':
      return clamp(18 * Math.pow(2, (26 - tempC) / 10), 12, 30);
    default:
      return 0;
  }
}

/** Days from spawning to free-swimming fry for egg-layers. */
function hatchDays(mode: Reproduction): number {
  switch (mode) {
    case 'egg-scatterer':
      return 4;
    case 'egg-depositor':
      return 6;
    case 'demersal-spawner':
      return 8;
    default:
      return 7;
  }
}

/** Expected spawnings per day once conditions are right and a partner is present. */
function spawnRate(mode: Reproduction): number {
  switch (mode) {
    case 'livebearer':
      return 0.3; // conception within a few days
    case 'egg-carrier':
      return 0.07; // mating follows a molt every few weeks
    case 'egg-scatterer':
      return 0.08;
    case 'egg-depositor':
      return 0.07;
    case 'substrate-spawner':
    case 'cave-spawner':
    case 'bubble-nester':
    case 'mouthbrooder':
      return 0.035;
    case 'demersal-spawner':
      return 0.07;
    case 'pelagic-spawner':
      return 0.12;
    case 'pouch-brooder':
      return 0.04;
    default:
      return 0;
  }
}

/** Minimum days between spawns. */
function refractoryDays(mode: Reproduction): number {
  switch (mode) {
    case 'egg-scatterer':
    case 'egg-depositor':
      return 6;
    case 'demersal-spawner':
      return 10;
    case 'pelagic-spawner':
      return 3;
    case 'livebearer':
    case 'egg-carrier':
      return 1;
    default:
      return 21;
  }
}

/** Eggs/young per spawning for a female of total length `len` (cm). */
export function clutchSize(mode: Reproduction, len: number): number {
  switch (mode) {
    case 'livebearer':
      return 0.9 * len * len; // guppy 5 cm → ~22, molly 10 cm → ~90 (capped)
    case 'egg-carrier':
      return 20 * (len / 2.5) ** 2; // cherry shrimp → ~20
    case 'mouthbrooder':
      return 6 + 1.6 * len; // mbuna 10 cm → ~22
    case 'pouch-brooder':
      return 30 * (len / 10) ** 2;
    case 'egg-scatterer':
      return 60 * (len / 4) ** 2.5; // tetra 4 cm → ~60, barb 7 cm → ~240
    case 'egg-depositor':
      return 15 * (len / 4.5) ** 2; // corydoras → ~15
    case 'substrate-spawner':
    case 'cave-spawner':
      return 80 * (len / 6) ** 2; // ram ~65, angelfish ~500
    case 'bubble-nester':
      return 100 * (len / 6) ** 2;
    case 'demersal-spawner':
      return 120 * (len / 7) ** 2;
    case 'pelagic-spawner':
      return 1000;
    default:
      return 0;
  }
}

/**
 * Per-day chance a small animal of length `len` is eaten, given the predators whose mouths fit
 * it and the refuge the tank offers (dense plants cut it by up to 85%).
 */
export function fryPredationHazard(census: Census, len: number, cover: number): number {
  const n = census.predatorsFor(len);
  if (n <= 0) return 0;
  return 0.3 * (1 - Math.exp(-n / 3)) * (1 - 0.85 * clamp01(cover));
}

/** Brood multiplier from population size and stocking (soft cap). */
export function populationScale(census: Census, capacityRatio: number): number {
  const n = census.fishCount;
  const pop = n < 0.75 * POPULATION_SOFT_CAP ? 1 : clamp((POPULATION_SOFT_CAP * 1.05 - n) / (0.3 * POPULATION_SOFT_CAP), 0, 1);
  const crowd = clamp((2 - capacityRatio) / 0.7, 0, 1);
  return pop * crowd;
}

/**
 * Advance one animal's reproduction by `days`. Returns nothing; births/clutches go through the host.
 */
export function breedingTick(
  host: BreedHost,
  f: FishEntity,
  st: SpeciesStats,
  now: number,
  days: number,
  capacityRatio: number,
): void {
  const sp = f.species;
  const mode = sp.reproduction;
  if (mode === 'none' || mode === 'annual') return;
  const s = f.state;
  const isCarrier =
    mode === 'pouch-brooder'
      ? s.sex === 'male'
      : s.sex === 'female' || (s.sex === 'unknown' && sp.group === 'snail');
  if (!isCarrier) return;
  const wp = host.water;

  // --- young on board ------------------------------------------------------------------------
  if (s.gravidSince !== undefined && carriesYoung(mode)) {
    // A starving or very sick parent resorbs or drops the brood.
    if (s.health < 0.25) {
      s.gravidSince = undefined;
      return;
    }
    const due = s.gravidSince + gestationDays(mode, wp.temperatureC) * MS_PER_DAY;
    if (now >= due) {
      const first = s.lastSpawnAt === undefined;
      const len = s.lengthCm;
      let mean = clutchSize(mode, len) * (first ? 0.6 : 1);
      // Mouthbrooders' and seahorses' young are released into a tank full of mouths.
      if (mode === 'mouthbrooder') mean *= 0.6 * Math.exp(-(host.census.fishCount - st.group.count) / 30) * (0.5 + 0.5 * host.cover);
      if (mode === 'pouch-brooder') mean *= 0.02;
      if (mode === 'egg-carrier') mean *= 0.9;
      mean *= populationScale(host.census, capacityRatio);
      // In gentle/zen modes nothing is eaten on screen: only the fry that would have made it are born.
      if (host.careMode !== 'realistic') mean *= expectedEarlySurvival(host, sp);
      const count = Math.min(MAX_BROOD, poisson(mean, () => host.rng.next()));
      s.gravidSince = undefined;
      s.lastSpawnAt = now;
      const how: BirthKind =
        mode === 'livebearer' ? 'born' : mode === 'egg-carrier' ? 'shrimplets' : mode === 'mouthbrooder' ? 'released' : 'pouch';
      if (count > 0) host.deliver(f, count, how, now);
    }
    return;
  }

  // --- ready to breed? -----------------------------------------------------------------------
  const age = ageMonths(s, now);
  if (age < sp.maturityMonths || s.lengthCm < 0.6 * asymptoticLength(sp, s)) return;
  if (s.lastSpawnAt !== undefined && now - s.lastSpawnAt < refractoryDays(mode) * MS_PER_DAY) return;

  const g = st.group;
  const sperm = mode === 'livebearer' && s.lastSpawnAt !== undefined && now - s.lastSpawnAt < 180 * MS_PER_DAY;
  const partner =
    mode === 'pouch-brooder'
      ? g.matureFemales > 0
      : s.sex === 'unknown'
        ? g.matureUnknown >= 2
        : g.matureMales > 0 || sperm;
  if (!partner) return;

  // Condition: healthy, fed, calm, in temperature, not senescent.
  const dT = outside(wp.temperatureC, sp.tempC[0], sp.tempC[1]);
  if (dT > 0.5) return;
  const q =
    smoothstep(0.55, 0.85, s.health) *
    (1 - smoothstep(0.35, 0.65, s.hunger)) *
    (1 - smoothstep(0.3, 0.6, s.stress)) *
    (age / 12 > 0.85 * sp.lifespanYears ? 0.3 : 1) *
    (outside(wp.ph, sp.ph[0], sp.ph[1]) > 0.3 ? 0.3 : 1);
  if (q <= 0.01) return;

  let rate = spawnRate(mode) * q * (sperm && g.matureMales === 0 ? 0.35 : 1);
  if (mode === 'egg-scatterer' || mode === 'egg-depositor' || mode === 'substrate-spawner' || mode === 'cave-spawner')
    rate *= host.waterChangeBoost(now);
  if (mode === 'cave-spawner') rate *= host.caves > 0 ? 1 : 0.25;
  if (host.rng.next() >= 1 - Math.exp(-rate * days)) return;

  // --- it happens ----------------------------------------------------------------------------
  if (carriesYoung(mode)) {
    s.gravidSince = now;
    return;
  }
  const experienced = s.lastSpawnAt !== undefined;
  s.lastSpawnAt = now;
  const eggs = clutchSize(mode, s.lengthCm);
  const survival = eggSurvival(host, st, mode, experienced);
  const mean = eggs * survival * populationScale(host.census, capacityRatio);
  const count = Math.min(MAX_BROOD, poisson(mean, () => host.rng.next()));
  if (count > 0) host.queueClutch(f, count, hatchDays(mode), now);
  else host.noteSpawn(f, now);
}

/** Expected fraction of eggs that become free-swimming fry, by strategy and tank. */
function eggSurvival(host: BreedHost, st: SpeciesStats, mode: Reproduction, experienced: boolean): number {
  const c = host.census;
  const others = Math.max(0, c.fishCount - st.group.count);
  switch (mode) {
    case 'egg-scatterer':
    case 'egg-depositor': {
      // Every fish (parents included) eats eggs; only dense cover and few mouths let any hatch.
      const eaters = c.predatorsFor(0.12);
      const base = mode === 'egg-scatterer' ? 0.06 : 0.1;
      return base * Math.pow(host.cover, 1.5) * Math.exp(-eaters / 4);
    }
    case 'substrate-spawner':
    case 'cave-spawner':
    case 'bubble-nester': {
      const site = mode === 'cave-spawner' ? (host.caves > 0 ? 1 : 0.4) : 0.6 + 0.4 * host.cover;
      return 0.3 * Math.exp(-others / 12) * site * (experienced ? 1 : 0.35);
    }
    case 'demersal-spawner':
    case 'pelagic-spawner':
      return 0; // larvae drift into the water column and the filter
    default:
      return 0;
  }
}

/** For gentle/zen: the share of live-born young that would survive their first weeks. */
function expectedEarlySurvival(host: BreedHost, sp: Species): number {
  const h = fryPredationHazard(host.census, sp.birthLengthCm, host.cover);
  return Math.exp(-h * 18);
}
