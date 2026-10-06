import { describe, expect, it } from 'vitest';
import type { Species } from '../../src/core/types';
import { DEFAULT_SETTINGS, attachFish, createWorld } from '../../src/core/world';
import { validateSpecies } from '../../src/data/validate';
import { SpeciesIndex } from '../../src/data/speciesIndex';
import { newTank } from '../../src/sim/tankFactory';
import { LifeSim } from '../../src/sim/LifeSim';
import { bioloadUnits, massG } from '../../src/sim/biology';
import { PLANTS } from './helpers';

/**
 * Robustness over the whole bundled catalog: every valid species can be bought, kept for a few
 * days in a suitable tank and assessed for compatibility without throwing or producing NaNs.
 */
const files = import.meta.glob('../../src/data/species/*.json', { eager: true, import: 'default' }) as Record<string, Species[]>;
const list: Species[] = [];
for (const arr of Object.values(files)) if (Array.isArray(arr)) for (const s of arr) if (!validateSpecies(s).length) list.push(s);
const index = new SpeciesIndex(list);

describe('every species in the catalog', () => {
  it('lives, grows and is assessed without errors', { timeout: 120_000 }, () => {
    const problems: string[] = [];
    for (const sp of index.all) {
      const liters = Math.max(60, sp.minTankLiters * 1.3);
      const w = Math.min(600, Math.round(Math.cbrt(liters * 1000 * 2.5)));
      const tank = newTank({
        size: { widthCm: w, heightCm: Math.max(30, Math.round(w / 2.2)), depthCm: Math.max(30, Math.round(w / 2.2)) },
        water: sp.water,
        seed: 3,
        now: Date.UTC(2026, 0, 5, 12),
      });
      tank.equipment.heater.targetC = (sp.tempC[0] + sp.tempC[1]) / 2;
      tank.waterParams.ph = (sp.ph[0] + sp.ph[1]) / 2;
      const world = createWorld({ tank, species: index, plants: PLANTS, settings: { ...DEFAULT_SETTINGS } });
      const sim = new LifeSim(world);
      tank.equipment.autoFeeder = { enabled: true, food: sp.water === 'marine' ? 'mysis' : 'flakes', hours: [9], pinches: 1 };
      for (let i = 0; i < 2; i++) {
        const e = sim.createFish(world, sp.id, { sex: i ? 'male' : 'female' });
        if (!e) {
          problems.push(`${sp.id}: createFish failed`);
          break;
        }
        if (!(e.state.lengthCm > 0 && e.state.lengthCm <= sp.adultLengthCm * 1.6)) problems.push(`${sp.id}: sale length ${e.state.lengthCm}`);
        attachFish(world, e);
      }
      if (!(massG(sp, sp.adultLengthCm) > 0) || !(bioloadUnits(sp) > 0)) problems.push(`${sp.id}: mass/bioload`);
      try {
        const c = sim.compatibility(world, sp);
        if (!['good', 'caution', 'bad'].includes(c.level)) problems.push(`${sp.id}: compatibility level`);
        sim.catchUp(world, 2 * 86400);
      } catch (err) {
        problems.push(`${sp.id}: threw ${(err as Error).message}`);
        continue;
      }
      for (const f of world.fish)
        for (const k of ['lengthCm', 'hunger', 'health', 'stress', 'stomach'] as const)
          if (!Number.isFinite(f.state[k])) problems.push(`${sp.id}: ${k} = ${f.state[k]}`);
      for (const [k, v] of Object.entries(world.tank.waterParams))
        if (typeof v === 'number' && !Number.isFinite(v)) problems.push(`${sp.id}: water ${k} = ${v}`);
    }
    expect(index.size).toBeGreaterThan(20);
    expect(problems, problems.slice(0, 30).join('\n')).toEqual([]);
  });
});
