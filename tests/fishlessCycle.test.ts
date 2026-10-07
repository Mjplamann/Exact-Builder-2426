import { describe, expect, it, vi } from 'vitest';
import type { JournalEntry, TankSize } from '../src/core/types';
import { DEFAULT_SETTINGS, createWorld, type World } from '../src/core/world';
import { loadBundledSpecies } from '../src/data/speciesIndex';
import { loadBundledPlants } from '../src/data/plantIndex';
import { FISHLESS_CYCLE_DONE, LifeSim } from '../src/sim/LifeSim';
import { defaultWaterParams } from '../src/sim/tankFactory';
import { FISHLESS_AMMONIA_PPM, SHAPE_SIZES, aquascapesFor, tankFromSpec } from '../src/app/biotopes';
import { AQUASCAPES } from '../src/decor/aquascapes';
import { Notifier } from '../src/ui/Notifier';
import { assessWater, computeNeeds } from '../src/ui/waterHealth';

/**
 * A fishless cycle: the builder doses an empty tank with ammonia so the filter bacteria can grow
 * before any animal moves in. That ammonia (and the nitrite it turns into) is the point, not a
 * problem — nobody should be told to change the water — and the keeper hears once when it's done.
 */
const species = loadBundledSpecies();
const plants = loadBundledPlants();

function fishlessTank(style = 'empty', size: TankSize = SHAPE_SIZES.standard.size): { world: World; life: LifeSim; said: { message: string; level: string }[]; journal: JournalEntry[] } {
  const d = aquascapesFor('freshwater', size).find((a) => a.id === style)!.defaults!;
  const tank = tankFromSpec(
    {
      name: 'Cycling', water: 'freshwater', shape: 'custom', size, aquascape: style, cycled: false, stock: [],
      substrate: d.substrate!, background: d.background!, substrateDepthFrontCm: d.substrateDepthFrontCm, substrateDepthBackCm: d.substrateDepthBackCm,
      waterParams: d.waterParams, equipment: d.equipment,
    },
    { now: Date.UTC(2026, 5, 1, 12), seed: 5 },
  );
  const built = AQUASCAPES.find((a) => a.id === style)!.build(tank, plants, tank.seed);
  tank.decor = built.decor;
  tank.plants = built.plants;
  return watch(createWorld({ tank, species, plants, settings: { ...DEFAULT_SETTINGS } }));
}

function watch(world: World): { world: World; life: LifeSim; said: { message: string; level: string }[]; journal: JournalEntry[] } {
  const said: { message: string; level: string }[] = [];
  const journal: JournalEntry[] = [];
  world.events.on('notify', (e) => said.push(e));
  world.events.on('journal', ({ entry }) => journal.push(entry));
  return { world, life: new LifeSim(world), said, journal };
}

/** Live time-lapse: 15-minute steps, a real second apart. */
function days(t: { world: World; life: LifeSim }, n: number): void {
  for (let i = 0; i < n * 96; i++) {
    t.world.clock.simTime += 900_000;
    t.world.clock.realSeconds += 1;
    t.life.update(t.world, 900);
  }
}

const nagging = (j: JournalEntry[]) => j.filter((e) => /Ammonia has appeared|Nitrite is rising|water quality/.test(e.text));
const done = (j: JournalEntry[]) => j.filter((e) => e.text === FISHLESS_CYCLE_DONE);

describe('fishless cycle', () => {
  it('feeds the bacteria in peace, then says once that the filter is ready for fish', () => {
    const t = fishlessTank();
    expect(t.world.tank.waterParams.ammonia).toBe(FISHLESS_AMMONIA_PPM);
    days(t, 20);
    expect(t.world.tank.waterParams.nitrite).toBeGreaterThan(0.25); // mid-cycle
    expect(nagging(t.journal)).toEqual([]);
    expect(done(t.journal)).toEqual([]);
    days(t, 25);
    expect(nagging(t.journal)).toEqual([]);
    expect(done(t.journal)).toHaveLength(1);
    const at = (done(t.journal)[0].at - Date.UTC(2026, 5, 1, 12)) / 86_400_000;
    expect(at).toBeGreaterThan(20);
    expect(at).toBeLessThan(42);
    expect(t.said.filter((s) => s.message === FISHLESS_CYCLE_DONE)).toEqual([{ message: FISHLESS_CYCLE_DONE, level: 'success' }]);
    // It's done: the tank opened again later doesn't say it a second time.
    const again = watch(t.world);
    again.world.tank = JSON.parse(JSON.stringify(t.world.tank));
    days(again, 5);
    expect(again.life.catchUp(again.world, 10 * 86_400).text).not.toContain('fishless');
    expect(done(again.journal)).toEqual([]);
    expect(again.said.filter((s) => s.message === FISHLESS_CYCLE_DONE)).toEqual([]);
  });

  it('carries on across a reload in its nitrite phase; an absence that finishes it says so on the welcome-back card', () => {
    const t = fishlessTank('dutch');
    days(t, 21);
    const wp = t.world.tank.waterParams;
    expect(wp.ammonia).toBeLessThan(0.05);
    expect(wp.nitrite).toBeGreaterThan(0.05);
    t.world.tank.simTime = t.world.clock.simTime;
    const back = watch(t.world);
    back.world.tank = JSON.parse(JSON.stringify(t.world.tank));
    const summary = back.life.catchUp(back.world, 21 * 86_400);
    expect(summary.text).toContain(FISHLESS_CYCLE_DONE);
    expect(summary.text).not.toMatch(/water quality has slipped/);
    expect(done(back.journal)).toHaveLength(1);
    expect(nagging(back.journal)).toEqual([]);
  });

  it('a tank with animals is still warned about ammonia and nitrite', () => {
    const t = fishlessTank();
    t.world.tank.waterParams.ammonia = 0;
    t.life.addFish(t.world, 'paracheirodon-innesi', 12);
    t.life.addFish(t.world, 'corydoras-paleatus', 6);
    days(t, 12);
    expect(nagging(t.journal).length).toBeGreaterThan(0);
  });
});

describe('fishless cycle in the water panel and reminders', () => {
  const cycling = { ...defaultWaterParams('freshwater', 0), ammonia: 2, nitrite: 1.5, bacteria: 0.4, temperatureC: 25 };

  it('an empty tank’s ammonia and nitrite read as a cycle at work ("caution"), not as a call for a water change', () => {
    const a = assessWater(cycling, 'freshwater', computeNeeds([], 'freshwater'));
    expect(a.params.ammonia.level).toBe('caution');
    expect(a.params.nitrite.level).toBe('caution');
    expect(a.level).toBe('caution');
    expect(a.issues.map((i) => i.text)).toEqual(['Fishless cycle — feeding the new bacteria; add fish once ammonia and nitrite read zero']);
    // Once both read zero the note goes.
    expect(assessWater({ ...cycling, ammonia: 0, nitrite: 0, bacteria: 1.2 }, 'freshwater', computeNeeds([], 'freshwater')).issues).toEqual([]);
    // With animals in the water it is a real problem again.
    const stocked = assessWater(cycling, 'freshwater', { ...computeNeeds([], 'freshwater'), animals: 6 });
    expect(stocked.params.ammonia.level).toBe('bad');
    expect(stocked.issues.some((i) => /partial water change/.test(i.text))).toBe(true);
  });

  it('no water-change reminders for a fishless cycle; they come back with animals', () => {
    const world = {
      settings: { careMode: 'realistic' },
      tank: { waterParams: { ...cycling } },
      clock: { simTime: 0 },
      fish: [],
      events: { on: () => () => {} },
    } as unknown as World;
    const said: string[] = [];
    const n = new Notifier(world, (m) => said.push(m));
    let now = 0;
    const spy = vi.spyOn(performance, 'now').mockImplementation(() => now);
    const run = (needs: ReturnType<typeof computeNeeds>) => {
      for (let i = 0; i < 600; i++) {
        now += 1000;
        world.clock.simTime += 3_600_000;
        n.check(needs, 'metric');
      }
    };
    run(computeNeeds([], 'freshwater'));
    expect(said).toEqual([]);
    run({ ...computeNeeds([], 'freshwater'), animals: 4 });
    expect(said.some((m) => /Ammonia has risen/.test(m))).toBe(true);
    expect(said.some((m) => /Nitrite is/.test(m))).toBe(true);
    spy.mockRestore();
    n.dispose();
  });
});
