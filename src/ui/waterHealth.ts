/**
 * Water-quality assessment for the health dot, the care panel and gentle warnings. Pure (no DOM)
 * so it is unit-testable. Thresholds follow standard aquarium husbandry references:
 *  - Toxicity of ammonia comes from free NH₃, which rises ~10× per pH unit (Emerson 1975); chronic
 *    stress begins near 0.02 mg/L NH₃.
 *  - Nitrite is far less toxic in seawater (chloride competes for uptake) than in soft freshwater.
 *  - Nitrate: < 25 mg/L freshwater / < 10 mg/L reef is ideal; > 50 / > 25 harms sensitive animals.
 *  - Dissolved oxygen below ~60 % saturation (≈ 5 mg/L at 25 °C) stresses most tropical fish.
 */
import type { FishEntity, WaterParams, WaterType } from '../core/types';
import { formatTempRange, freeAmmonia, type Units } from './format';

export type HealthLevel = 'good' | 'caution' | 'bad';

export type ParamKey =
  | 'temperature'
  | 'ph'
  | 'ammonia'
  | 'nitrite'
  | 'nitrate'
  | 'gh'
  | 'kh'
  | 'salinity'
  | 'oxygen'
  | 'cycle';

export interface ParamStatus {
  level: HealthLevel;
  /** Healthy range for display (in the parameter's own unit). */
  ideal?: [number, number];
  /** Short qualifier ("free NH₃ 0.004 mg/L", "Cycling"). */
  note?: string;
}

export interface WaterIssue {
  key: ParamKey;
  level: Exclude<HealthLevel, 'good'>;
  text: string;
}

export interface WaterAssessment {
  level: HealthLevel;
  params: Record<ParamKey, ParamStatus>;
  issues: WaterIssue[];
}

/** One species' tolerances, used to judge temperature/pH/hardness against the actual inhabitants. */
export interface SpeciesTolerance {
  name: string;
  count: number;
  tempC: [number, number];
  ph: [number, number];
  dGH?: [number, number];
}

export interface RangePair {
  /** Species with the lowest upper limit. */
  low: { name: string; max: number };
  /** Species with the highest lower limit. */
  high: { name: string; min: number };
}

export interface TankNeeds {
  species: SpeciesTolerance[];
  /** Intersection of every inhabitant's range, or a sensible default when empty/conflicting. */
  tempC: [number, number];
  ph: [number, number];
  dGH: [number, number] | null;
  /** Tolerances don't overlap — someone will always be outside their comfort zone. */
  tempConflict: boolean;
  phConflict: boolean;
  /** When ranges conflict: the species wanting it coolest/most acidic vs warmest/most alkaline. */
  tempPair?: RangePair;
  phPair?: RangePair;
  /** Reef tank (corals present) — stricter nitrate. */
  reef: boolean;
  animals: number;
}

const DEFAULT_TEMP: Record<WaterType, [number, number]> = {
  freshwater: [22, 28],
  brackish: [23, 28],
  marine: [24, 27],
};
const DEFAULT_PH: Record<WaterType, [number, number]> = {
  freshwater: [6.0, 8.0],
  brackish: [7.5, 8.5],
  marine: [8.0, 8.4],
};

function intersect(ranges: [number, number][]): [number, number] | null {
  let lo = -Infinity;
  let hi = Infinity;
  for (const r of ranges) {
    lo = Math.max(lo, r[0]);
    hi = Math.min(hi, r[1]);
  }
  return ranges.length && lo <= hi ? [lo, hi] : null;
}

/** Summarize the inhabitants' needs. Call when the stock changes, not per frame. */
export function computeNeeds(fish: readonly FishEntity[], water: WaterType, reef = false): TankNeeds {
  const byId = new Map<string, SpeciesTolerance>();
  for (const f of fish) {
    const s = f.species;
    const t = byId.get(s.id);
    if (t) t.count++;
    else byId.set(s.id, { name: s.commonName, count: 1, tempC: s.tempC, ph: s.ph, dGH: s.dGH });
  }
  const species = [...byId.values()].sort((a, b) => b.count - a.count);
  const tI = intersect(species.map((s) => s.tempC));
  const pI = intersect(species.map((s) => s.ph));
  const pair = (get: (s: SpeciesTolerance) => [number, number]): RangePair | undefined => {
    if (!species.length) return undefined;
    let low = species[0];
    let high = species[0];
    for (const s of species) {
      if (get(s)[1] < get(low)[1]) low = s;
      if (get(s)[0] > get(high)[0]) high = s;
    }
    return { low: { name: low.name, max: get(low)[1] }, high: { name: high.name, min: get(high)[0] } };
  };
  const gI = intersect(species.filter((s) => s.dGH).map((s) => s.dGH as [number, number]));
  return {
    species,
    tempC: tI ?? (species.length ? midRange(species.map((s) => s.tempC)) : DEFAULT_TEMP[water]),
    ph: pI ?? (species.length ? midRange(species.map((s) => s.ph)) : DEFAULT_PH[water]),
    dGH: gI,
    tempConflict: species.length > 0 && !tI,
    phConflict: species.length > 0 && !pI,
    tempPair: !tI ? pair((s) => s.tempC) : undefined,
    phPair: !pI ? pair((s) => s.ph) : undefined,
    reef,
    animals: fish.length,
  };
}

/** Median-ish compromise range when tolerances don't overlap. */
function midRange(ranges: [number, number][]): [number, number] {
  const mids = ranges.map((r) => (r[0] + r[1]) / 2).sort((a, b) => a - b);
  const m = mids[Math.floor(mids.length / 2)];
  const half = Math.min(...ranges.map((r) => (r[1] - r[0]) / 2)) || 1;
  return [m - half, m + half];
}

const ORDER: Record<HealthLevel, number> = { good: 0, caution: 1, bad: 2 };
export function worst(a: HealthLevel, b: HealthLevel): HealthLevel {
  return ORDER[a] >= ORDER[b] ? a : b;
}

/** Level from "how far outside the range" with caution/bad margins. */
function rangeLevel(v: number, r: [number, number], cautionMargin: number): HealthLevel {
  const d = v < r[0] ? r[0] - v : v > r[1] ? v - r[1] : 0;
  if (d <= 1e-9) return 'good';
  return d <= cautionMargin ? 'caution' : 'bad';
}

function upper(v: number, good: number, caution: number): HealthLevel {
  return v < good ? 'good' : v < caution ? 'caution' : 'bad';
}

function lower(v: number, good: number, caution: number): HealthLevel {
  return v >= good ? 'good' : v >= caution ? 'caution' : 'bad';
}

/** Assess the water against standard thresholds and the inhabitants' tolerances. */
export function assessWater(wp: WaterParams, water: WaterType, needs: TankNeeds, units: Units = 'metric'): WaterAssessment {
  const issues: WaterIssue[] = [];
  const marine = water === 'marine';
  const salty = water !== 'freshwater';
  const push = (key: ParamKey, level: HealthLevel, text: string) => {
    if (level !== 'good') issues.push({ key, level, text });
  };

  // Temperature — per species, so the message can name who is uncomfortable.
  let temp: HealthLevel = rangeLevel(wp.temperatureC, needs.tempC, 1.5);
  for (const s of needs.species) {
    const l = rangeLevel(wp.temperatureC, s.tempC, 1.5);
    if (l !== 'good') {
      temp = worst(temp, l);
      const warm = wp.temperatureC > s.tempC[1];
      push('temperature', l, `${warm ? 'Too warm' : 'Too cool'} for the ${s.name} (${formatTempRange(s.tempC, units)})`);
      break; // one named example is enough; the dot reflects the worst
    }
  }
  if (!needs.species.length) push('temperature', temp, wp.temperatureC > needs.tempC[1] ? 'The water is warm' : 'The water is cool');

  // pH
  let ph: HealthLevel = rangeLevel(wp.ph, needs.ph, 0.5);
  for (const s of needs.species) {
    const l = rangeLevel(wp.ph, s.ph, 0.5);
    if (l !== 'good') {
      ph = worst(ph, l);
      push('ph', l, `pH ${wp.ph.toFixed(1)} is outside the ${s.name}’s range (${s.ph[0]}–${s.ph[1]})`);
      break;
    }
  }

  // Ammonia: worst of total-ammonia test-kit bands and the free-NH₃ toxicity.
  const nh3 = freeAmmonia(wp.ammonia, wp.ph, wp.temperatureC);
  const ammonia = worst(upper(wp.ammonia, 0.25, 1), upper(nh3, 0.005, 0.02));
  push('ammonia', ammonia, `Ammonia ${wp.ammonia.toFixed(2)} mg/L — a partial water change will help`);

  const nitrite = salty ? upper(wp.nitrite, 0.5, 2) : upper(wp.nitrite, 0.1, 0.5);
  push('nitrite', nitrite, `Nitrite ${wp.nitrite.toFixed(2)} mg/L — the filter bacteria are struggling`);

  const nitrate = needs.reef ? upper(wp.nitrate, 10, 25) : upper(wp.nitrate, 25, 50);
  push('nitrate', nitrate, `Nitrate has built up to ${Math.round(wp.nitrate)} mg/L — time for a water change`);

  const oxygen = lower(wp.oxygen, 0.8, 0.6);
  push('oxygen', oxygen, `Oxygen is low (${Math.round(wp.oxygen * 100)} % saturation)`);

  // Salinity
  let salinity: HealthLevel = 'good';
  let salIdeal: [number, number] = [1.0, 1.002];
  if (marine) {
    salIdeal = [1.023, 1.026];
    salinity = rangeLevel(wp.salinitySG, salIdeal, 0.003);
  } else if (water === 'brackish') {
    salIdeal = [1.004, 1.012];
    salinity = rangeLevel(wp.salinitySG, salIdeal, 0.004);
  } else salinity = wp.salinitySG > 1.003 ? 'caution' : 'good';
  push('salinity', salinity, `Salinity ${wp.salinitySG.toFixed(3)} is off target`);

  // Hardness — chronic rather than acute, so at most "caution" and kept out of the overall dot.
  const ghIdeal: [number, number] = needs.dGH ?? (salty ? [8, 20] : [3, 12]);
  const gh: HealthLevel = salty ? 'good' : rangeLevel(wp.gh, ghIdeal, 1e9) === 'good' ? 'good' : 'caution';
  const khIdeal: [number, number] = marine ? [7, 12] : salty ? [8, 14] : [2, 10];
  const kh: HealthLevel = rangeLevel(wp.kh, khIdeal, 1e9) === 'good' ? 'good' : 'caution';

  // Nitrogen cycle
  const cycled = wp.bacteria >= 0.95;
  const cycleLevel: HealthLevel = cycled ? 'good' : wp.bacteria >= 0.5 || needs.animals === 0 ? 'caution' : 'bad';
  const cycleNote = cycled ? 'Cycled' : wp.bacteria >= 0.5 ? 'Maturing' : 'Cycling';
  if (!cycled && needs.animals > 0) push('cycle', cycleLevel, 'The filter is still cycling — feed lightly and test often');

  const params: Record<ParamKey, ParamStatus> = {
    temperature: { level: temp, ideal: needs.tempC },
    ph: { level: ph, ideal: needs.ph },
    ammonia: { level: ammonia, ideal: [0, 0.25], note: `free NH₃ ${nh3 < 0.001 ? '< 0.001' : nh3.toFixed(3)} mg/L` },
    nitrite: { level: nitrite, ideal: [0, salty ? 0.5 : 0.1] },
    nitrate: { level: nitrate, ideal: [0, needs.reef ? 10 : 25] },
    gh: { level: gh, ideal: ghIdeal },
    kh: { level: kh, ideal: khIdeal },
    salinity: { level: salinity, ideal: salIdeal },
    oxygen: { level: oxygen, ideal: [0.8, 1] },
    cycle: { level: cycleLevel, note: cycleNote },
  };

  let level: HealthLevel = 'good';
  for (const k of ['temperature', 'ph', 'ammonia', 'nitrite', 'nitrate', 'oxygen', 'salinity', 'cycle'] as const) {
    level = worst(level, params[k].level);
  }
  issues.sort((a, b) => ORDER[b.level] - ORDER[a.level]);
  return { level, params, issues };
}

/** Plain-language label for the overall state. */
export function healthLabel(level: HealthLevel): string {
  return level === 'good' ? 'Water is healthy' : level === 'caution' ? 'Water needs attention' : 'Water is unhealthy';
}
