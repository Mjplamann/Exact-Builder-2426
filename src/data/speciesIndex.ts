import type { Species, WaterType, Temperament, Zone, OrganismGroup } from '../core/types';
import { validateSpecies } from './validate';

/**
 * Von Bertalanffy growth: L(t) = L∞ − (L∞ − L0)·e^(−K·t).
 * When a species has no explicit K, derive it so that the fish reaches 75% of its
 * asymptotic length at the age of maturity — a good fit for most aquarium species.
 */
export function deriveGrowthK(s: Pick<Species, 'adultLengthCm' | 'birthLengthCm' | 'maturityMonths'>): number {
  const linf = s.adultLengthCm;
  const l0 = Math.min(s.birthLengthCm, linf * 0.5);
  const tm = Math.max(0.05, s.maturityMonths / 12);
  const target = 0.75 * linf;
  if (l0 >= target) return 3 / tm;
  return Math.log((linf - l0) / (linf - target)) / tm;
}

export interface SpeciesFilter {
  water?: WaterType | 'all';
  group?: OrganismGroup | 'all';
  family?: string;
  temperament?: Temperament | 'all';
  zone?: Zone | 'all';
  maxLengthCm?: number;
  /** Only species that fit a tank of this many liters. */
  maxTankLiters?: number;
}

export class SpeciesIndex {
  readonly all: Species[];
  private byId = new Map<string, Species>();
  private searchText = new Map<string, string>();

  constructor(list: Species[]) {
    const out: Species[] = [];
    for (const raw of list) {
      if (this.byId.has(raw.id)) {
        console.warn(`[species] duplicate id ${raw.id} — keeping first`);
        continue;
      }
      const s: Species = { ...raw, growthK: raw.growthK ?? deriveGrowthK(raw) };
      out.push(s);
      this.byId.set(s.id, s);
      this.searchText.set(
        s.id,
        `${s.commonName} ${s.scientificName} ${s.family} ${s.region} ${s.body.archetype}`.toLowerCase(),
      );
    }
    out.sort((a, b) => a.commonName.localeCompare(b.commonName));
    this.all = out;
  }

  get(id: string): Species | undefined {
    return this.byId.get(id);
  }

  get size(): number {
    return this.all.length;
  }

  families(water?: WaterType): string[] {
    const set = new Set<string>();
    for (const s of this.all) if (!water || s.water === water) set.add(s.family);
    return [...set].sort();
  }

  search(query: string, filter: SpeciesFilter = {}, limit = Infinity): Species[] {
    const terms = query.toLowerCase().split(/\s+/).filter(Boolean);
    const res: Species[] = [];
    for (const s of this.all) {
      if (filter.water && filter.water !== 'all' && s.water !== filter.water) continue;
      if (filter.group && filter.group !== 'all' && s.group !== filter.group) continue;
      if (filter.family && s.family !== filter.family) continue;
      if (filter.temperament && filter.temperament !== 'all' && s.temperament !== filter.temperament) continue;
      if (filter.zone && filter.zone !== 'all' && s.zone !== filter.zone) continue;
      if (filter.maxLengthCm && s.adultLengthCm > filter.maxLengthCm) continue;
      if (filter.maxTankLiters && s.minTankLiters > filter.maxTankLiters) continue;
      if (terms.length) {
        const text = this.searchText.get(s.id)!;
        if (!terms.every((t) => text.includes(t))) continue;
      }
      res.push(s);
      if (res.length >= limit) break;
    }
    return res;
  }
}

/** Load every species JSON file bundled under src/data/species/. */
export function loadBundledSpecies(opts: { validate?: boolean } = {}): SpeciesIndex {
  const modules = import.meta.glob('./species/*.json', { eager: true, import: 'default' }) as Record<
    string,
    Species[]
  >;
  const list: Species[] = [];
  for (const [path, entries] of Object.entries(modules)) {
    if (!Array.isArray(entries)) {
      console.warn(`[species] ${path} is not an array — skipped`);
      continue;
    }
    for (const s of entries) {
      if (opts.validate) {
        const errs = validateSpecies(s);
        if (errs.length) {
          console.warn(`[species] ${path} ${s?.id}: ${errs.join('; ')} — skipped`);
          continue;
        }
      }
      list.push(s);
    }
  }
  return new SpeciesIndex(list);
}
