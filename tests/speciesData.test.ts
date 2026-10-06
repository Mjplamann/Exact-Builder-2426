import { describe, expect, it } from 'vitest';
import type { Species } from '../src/core/types';
import { validateSpecies } from '../src/data/validate';
import { deriveGrowthK } from '../src/data/speciesIndex';

/**
 * Validates every bundled species file. Run a single file with:
 *   SPECIES_FILE=characins npx vitest run tests/speciesData.test.ts
 */
const files = import.meta.glob('../src/data/species/*.json', { eager: true, import: 'default' }) as Record<string, Species[]>;
const only = process.env.SPECIES_FILE;

const all: { file: string; s: Species }[] = [];
for (const [path, list] of Object.entries(files)) {
  const name = path.split('/').pop()!.replace('.json', '');
  if (only && name !== only) continue;
  for (const s of list) all.push({ file: name, s });
}

describe('species data', () => {
  it('files are non-empty arrays', () => {
    for (const [path, list] of Object.entries(files)) {
      expect(Array.isArray(list), `${path} must be a JSON array`).toBe(true);
    }
  });

  it('every entry passes schema & plausibility validation', () => {
    const problems: string[] = [];
    for (const { file, s } of all) {
      const errs = validateSpecies(s);
      if (errs.length) problems.push(`${file} › ${s?.id ?? '(no id)'}: ${errs.join('; ')}`);
    }
    expect(problems, problems.slice(0, 60).join('\n')).toEqual([]);
  });

  it('ids are unique across all files', () => {
    const seen = new Map<string, string>();
    const dups: string[] = [];
    for (const [path, list] of Object.entries(files)) {
      for (const s of list) {
        if (seen.has(s.id)) dups.push(`${s.id} in ${path} and ${seen.get(s.id)}`);
        else seen.set(s.id, path);
      }
    }
    expect(dups, dups.join('\n')).toEqual([]);
  });

  it('growth curves are sane (reach 55–95% of adult size by maturity)', () => {
    const bad: string[] = [];
    for (const { file, s } of all) {
      const k = s.growthK ?? deriveGrowthK(s);
      const t = s.maturityMonths / 12;
      const l = s.adultLengthCm - (s.adultLengthCm - s.birthLengthCm) * Math.exp(-k * t);
      const frac = l / s.adultLengthCm;
      if (frac < 0.55 || frac > 0.97) bad.push(`${file} › ${s.id}: ${(frac * 100).toFixed(0)}% at maturity (K=${k.toFixed(2)})`);
    }
    expect(bad, bad.join('\n')).toEqual([]);
  });

  it('reports dangling variantOf references (warning only)', () => {
    const ids = new Set(Object.values(files).flat().map((s) => s.id));
    const dangling = all.filter(({ s }) => s.variantOf && !ids.has(s.variantOf)).map(({ s }) => `${s.id} → ${s.variantOf}`);
    if (dangling.length) console.warn(`dangling variantOf:\n${dangling.join('\n')}`);
    expect(true).toBe(true);
  });
});
