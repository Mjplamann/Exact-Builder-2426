import { describe, expect, it } from 'vitest';
import type { PlantSpecies } from '../src/core/types';
import { validatePlant } from '../src/data/validate';

const files = import.meta.glob('../src/data/plants/*.json', { eager: true, import: 'default' }) as Record<string, PlantSpecies[]>;

describe('plant data', () => {
  it('every entry is valid and ids are unique', () => {
    const problems: string[] = [];
    const seen = new Set<string>();
    for (const [path, list] of Object.entries(files)) {
      for (const p of list) {
        const errs = validatePlant(p);
        if (errs.length) problems.push(`${path} › ${p?.id}: ${errs.join('; ')}`);
        if (seen.has(p.id)) problems.push(`duplicate id ${p.id}`);
        seen.add(p.id);
      }
    }
    expect(problems, problems.join('\n')).toEqual([]);
  });
});
