import { describe, expect, it } from 'vitest';
import { PRESETS, buildPresetTank, presetStock } from '../../src/app/presets';
import { loadBundledSpecies } from '../../src/data/speciesIndex';
import { loadBundledPlants } from '../../src/data/plantIndex';
import { DEFAULT_SETTINGS, createWorld } from '../../src/core/world';
import type { CareMode } from '../../src/core/types';
import { buildColliders } from '../../src/decor/colliders';
import { LifeSim } from '../../src/sim/LifeSim';
import { freeAmmoniaFraction } from '../../src/sim/chemistry';
import { dailyFoodNeedMg, pinchMg } from '../../src/sim/feeding';
import { DAY } from './helpers';

const species = loadBundledSpecies();
const plants = loadBundledPlants();
const NOW = Date.UTC(2026, 3, 1, 10, 0, 0);

/** A preset tank set up exactly the way the app does on first run. */
function presetTank(id: string, careMode: CareMode = 'realistic', seed = 1234) {
  const preset = PRESETS.find((p) => p.id === id)!;
  const realNow = Date.now;
  Date.now = () => NOW;
  try {
    const tank = buildPresetTank(preset, plants, seed);
    const world = createWorld({ tank, species, plants, settings: { ...DEFAULT_SETTINGS, careMode } });
    const cc = buildColliders(world.tank, plants);
    world.colliders = cc.colliders;
    world.cover = cc.cover;
    const sim = new LifeSim(world);
    for (const { speciesId, count } of presetStock(preset, species)) sim.addFish(world, speciesId, count);
    return { world, sim, preset };
  } finally {
    Date.now = realNow;
  }
}

/** Water the care panel would flag (same thresholds as src/ui/waterHealth.ts). */
function flagged(wp: { ammonia: number; nitrite: number; ph: number; temperatureC: number; bacteria: number }, salty: boolean): string[] {
  const out: string[] = [];
  if (wp.ammonia >= 0.25 || wp.ammonia * freeAmmoniaFraction(wp.ph, wp.temperatureC) >= 0.005) out.push(`ammonia ${wp.ammonia.toFixed(3)}`);
  if (wp.nitrite >= (salty ? 0.5 : 0.1)) out.push(`nitrite ${wp.nitrite.toFixed(3)}`);
  if (wp.bacteria < 0.95) out.push(`cycling ${wp.bacteria.toFixed(2)}`);
  return out;
}

describe('presets: ordinary life does not hurt', () => {
  for (const preset of PRESETS) {
    it(`${preset.id}: a month away with the default auto-feeder — healthy water, nobody dies`, () => {
      const { world, sim } = presetTank(preset.id);
      const n0 = world.fish.length;
      const wp = world.tank.waterParams;
      const salty = world.tank.water !== 'freshwater';
      const problems: string[] = [];
      for (let d = 1; d <= 30; d++) {
        sim.catchUp(world, DAY);
        for (const p of flagged(wp, salty)) problems.push(`day ${d}: ${p}`);
      }
      expect(problems.slice(0, 5), problems.join('\n')).toEqual([]);
      expect(world.tank.stats.deaths).toBe(0);
      expect(world.fish.length).toBeGreaterThanOrEqual(n0);
      // Alkalinity lasts well beyond a month without water changes.
      expect(wp.kh).toBeGreaterThan(salty ? 6 : 1);
      const hunger = world.fish.reduce((a, f) => a + f.state.hunger, 0) / world.fish.length;
      expect(hunger).toBeLessThan(0.3);
    });
  }

  it('feeder portions match what each stock will eat once grown', () => {
    for (const preset of PRESETS) {
      const { world } = presetTank(preset.id);
      const af = world.tank.equipment.autoFeeder;
      expect(af.enabled, preset.id).toBe(true);
      const offered = af.pinches * af.hours.length * pinchMg(af.food);
      const adultNeed = dailyFoodNeedMg(world, true);
      expect(offered / adultNeed, preset.id).toBeGreaterThan(0.6);
      expect(offered / adultNeed, preset.id).toBeLessThan(2);
    }
  });

  it('the default tank over a year of weekly water changes: stable water, a few surprise fry, no deaths', { timeout: 60_000 }, () => {
    const { world, sim } = presetTank(PRESETS[0].id);
    const n0 = world.fish.length;
    const wp = world.tank.waterParams;
    let worst: string[] = [];
    for (let w = 0; w < 52; w++) {
      sim.catchUp(world, 7 * DAY);
      sim.waterChange(world, 0.25);
      if (w > 2) worst = worst.concat(flagged(wp, false).map((p) => `week ${w + 1}: ${p}`));
    }
    expect(worst.slice(0, 5), worst.join('\n')).toEqual([]);
    const oldAge = world.tank.journal.filter((j) => j.kind === 'died' && /old age/.test(j.text)).length;
    expect(world.tank.stats.deaths - oldAge).toBe(0);
    // Egg-layers in a busy community rarely raise young — but now and then a few make it.
    expect(world.tank.stats.births).toBeLessThan(25);
    expect(world.fish.length).toBeGreaterThanOrEqual(n0 - 2);
    expect(world.fish.length).toBeLessThan(n0 + 20);
    expect(wp.nitrate).toBeLessThan(25);
    for (const f of world.fish) {
      expect(wp.ph, f.species.id).toBeGreaterThan(f.species.ph[0] - 0.3);
      expect(wp.ph, f.species.id).toBeLessThan(f.species.ph[1] + 0.3);
    }
  });
});
