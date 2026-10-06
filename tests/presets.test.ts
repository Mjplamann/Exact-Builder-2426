import { describe, expect, it } from 'vitest';
import { PRESETS, buildPresetTank } from '../src/app/presets';
import { loadBundledSpecies } from '../src/data/speciesIndex';
import { loadBundledPlants } from '../src/data/plantIndex';
import { DEFAULT_SETTINGS, createWorld } from '../src/core/world';
import { LifeSim } from '../src/sim/LifeSim';
import { AQUASCAPES } from '../src/decor/aquascapes';

const species = loadBundledSpecies();
const plants = loadBundledPlants();

/**
 * Every preset must be a tank an experienced aquarist would set up: all animals exist, belong in
 * that water, and the life sim's own compatibility check raises no warnings as they are added.
 */
describe('tank presets', () => {
  for (const preset of PRESETS) {
    it(`${preset.id}: species exist, aquascape exists, stock is compatible`, () => {
      expect(AQUASCAPES.some((a) => a.id === preset.aquascape), `aquascape ${preset.aquascape}`).toBe(true);
      for (const f of preset.fish) expect(species.get(f.speciesId), `species ${f.speciesId}`).toBeDefined();

      const tank = buildPresetTank(preset, plants, 1234);
      const world = createWorld({ tank, species, plants, settings: { ...DEFAULT_SETTINGS } });
      const life = new LifeSim(world);
      const problems: string[] = [];
      for (const { speciesId, count } of preset.fish) {
        const sp = species.get(speciesId)!;
        const report = life.compatibility(world, sp);
        if (report.level !== 'good') problems.push(`${speciesId} (${report.level}): ${report.issues.join(' | ')}`);
        life.addFish(world, speciesId, count);
      }
      const stock = life.stocking(world);
      if (stock.ratio > 1) problems.push(`overstocked: ${Math.round(stock.ratio * 100)}%`);
      expect(problems, problems.join('\n')).toEqual([]);
    });
  }
});
