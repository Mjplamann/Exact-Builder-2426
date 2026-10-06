import type { PlantSpecies, WaterType } from '../core/types';
import { validatePlant } from './validate';

export class PlantIndex {
  readonly all: PlantSpecies[];
  private byId = new Map<string, PlantSpecies>();

  constructor(list: PlantSpecies[]) {
    const out: PlantSpecies[] = [];
    for (const p of list) {
      if (this.byId.has(p.id)) continue;
      this.byId.set(p.id, p);
      out.push(p);
    }
    out.sort((a, b) => a.commonName.localeCompare(b.commonName));
    this.all = out;
  }

  get(id: string): PlantSpecies | undefined {
    return this.byId.get(id);
  }

  forWater(water: WaterType): PlantSpecies[] {
    return this.all.filter((p) => p.water === water || (water === 'brackish' && p.water === 'freshwater'));
  }
}

export function loadBundledPlants(opts: { validate?: boolean } = {}): PlantIndex {
  const modules = import.meta.glob('./plants/*.json', { eager: true, import: 'default' }) as Record<string, PlantSpecies[]>;
  const list: PlantSpecies[] = [];
  for (const [path, entries] of Object.entries(modules)) {
    if (!Array.isArray(entries)) continue;
    for (const p of entries) {
      if (opts.validate) {
        const errs = validatePlant(p);
        if (errs.length) {
          console.warn(`[plants] ${path} ${p?.id}: ${errs.join('; ')} — skipped`);
          continue;
        }
      }
      list.push(p);
    }
  }
  return new PlantIndex(list);
}
