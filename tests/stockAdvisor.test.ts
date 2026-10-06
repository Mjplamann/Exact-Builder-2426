import { describe, expect, it } from 'vitest';
import type { TankSize, WaterType } from '../src/core/types';
import { DEFAULT_SETTINGS, createWorld } from '../src/core/world';
import { SpeciesIndex, loadBundledSpecies } from '../src/data/speciesIndex';
import { loadBundledPlants } from '../src/data/plantIndex';
import { LifeSim } from '../src/sim/LifeSim';
import { conspecificKey, isFighter } from '../src/sim/biology';
import { aquascapesFor, tankFromSpec } from '../src/app/biotopes';
import { checkStock, suggestStock } from '../src/app/stockAdvisor';
import type { StockSuggestion, TankSpec } from '../src/app/tankTypes';
import { AQUASCAPES } from '../src/decor/aquascapes';

const species = loadBundledSpecies();
const plants = loadBundledPlants();

const SIZES: Record<string, TankSize> = {
  nano: { widthCm: 45, heightCm: 30, depthCm: 30 },
  cube: { widthCm: 60, heightCm: 60, depthCm: 60 },
  standard: { widthCm: 120, heightCm: 50, depthCm: 50 },
  long: { widthCm: 150, heightCm: 40, depthCm: 50 },
  tall: { widthCm: 90, heightCm: 75, depthCm: 50 },
  tiny: { widthCm: 30, heightCm: 20, depthCm: 20 },
  huge: { widthCm: 300, heightCm: 120, depthCm: 120 },
};
const WATERS: WaterType[] = ['freshwater', 'brackish', 'marine'];

function specFor(water: WaterType, aquascape: string, size: TankSize, patch: Partial<TankSpec> = {}): TankSpec {
  const d = aquascapesFor(water, size).find((a) => a.id === aquascape)!.defaults!;
  return {
    name: 'Planned', water, shape: 'custom', size, aquascape, cycled: true, stock: [],
    substrate: d.substrate!, background: d.background!, substrateDepthFrontCm: d.substrateDepthFrontCm, substrateDepthBackCm: d.substrateDepthBackCm,
    waterParams: d.waterParams, equipment: d.equipment,
    ...patch,
  };
}

/**
 * Set the tank up exactly as App.createTank would (layout included) and add the community the way
 * the app does, asking the life sim about each species first — the same check the care panel runs.
 */
function simVerdict(spec: TankSpec, s: StockSuggestion): { worst: 'good' | 'caution' | 'bad'; problems: string[]; ratio: number } {
  const tank = tankFromSpec(spec, { now: 1.7e12, seed: 99 });
  const scape = AQUASCAPES.find((a) => a.id === spec.aquascape)!;
  const built = scape.build(tank, plants, tank.seed);
  tank.decor = built.decor;
  tank.plants = built.plants;
  const world = createWorld({ tank, species, plants, settings: { ...DEFAULT_SETTINGS } });
  const life = new LifeSim(world);
  const rank = { good: 0, caution: 1, bad: 2 } as const;
  let worst: 'good' | 'caution' | 'bad' = 'good';
  const problems: string[] = [];
  for (const { speciesId, count } of s.stock) {
    const r = life.compatibility(world, species.get(speciesId)!, count);
    if (rank[r.level] > rank[worst]) worst = r.level;
    if (r.level !== 'good') problems.push(`${speciesId}: ${r.issues.join(' | ')}`);
    life.addFish(world, speciesId, count);
  }
  return { worst, problems, ratio: life.stocking(world).ratio };
}

describe('stock suggestions', () => {
  for (const water of WATERS) {
    for (const { id } of aquascapesFor(water)) {
      it(`${water} ${id}: every suggestion at every size is a community the life sim accepts`, () => {
        for (const [sizeName, size] of Object.entries(SIZES)) {
          const spec = specFor(water, id, size);
          const list = suggestStock(spec, species, plants);
          const where = `${water} ${id} ${sizeName}`;
          expect(list.length, where).toBeLessThanOrEqual(6);
          expect(new Set(list.map((s) => s.id)).size, `${where} ids`).toBe(list.length);
          for (const s of list) {
            const at = `${where} “${s.title}”`;
            expect(s.title.length && s.description.length, at).toBeTruthy();
            expect(s.level, at).not.toBe('bad');
            if (s.level === 'caution') expect(s.notes?.length, `${at} caution without a reason`).toBeGreaterThan(0);
            expect(s.stocking, `${at} stocking`).toBeLessThanOrEqual(0.8);
            expect(s.stocking, `${at} stocking`).toBeGreaterThan(0);
            const groups = new Map<string, number>();
            for (const q of s.stock) {
              const sp = species.get(q.speciesId)!;
              expect(sp, `${at} ${q.speciesId}`).toBeDefined();
              expect(sp.water, `${at} ${q.speciesId} water`).toBe(water);
              expect(Number.isInteger(q.count) && q.count >= 1, `${at} ${q.speciesId} count`).toBe(true);
              if (isFighter(sp)) expect(q.count, `${at} rival males`).toBe(1);
              groups.set(conspecificKey(sp), (groups.get(conspecificKey(sp)) ?? 0) + q.count);
            }
            for (const q of s.stock) {
              const sp = species.get(q.speciesId)!;
              if (['school', 'shoal', 'colony', 'harem'].includes(sp.social)) expect(groups.get(conspecificKey(sp))!, `${at} ${q.speciesId} group`).toBeGreaterThanOrEqual(sp.groupSize);
            }
            // The life sim, in the real tank with its layout, agrees.
            const v = simVerdict(spec, s);
            expect(v.worst, `${at}\n${v.problems.join('\n')}`).not.toBe('bad');
            if (s.level === 'good') expect(v.worst, `${at}\n${v.problems.join('\n')}`).toBe('good');
            expect(v.ratio, `${at} sim stocking`).toBeLessThanOrEqual(0.8);
          }
        }
      });
    }
  }

  it('offers three to six communities for typical tanks', () => {
    const typical: [WaterType, string, TankSize][] = [
      ['freshwater', 'amazon', SIZES.standard], ['freshwater', 'dutch', SIZES.standard], ['freshwater', 'iwagumi', SIZES.cube],
      ['freshwater', 'nature', SIZES.tall], ['freshwater', 'blackwater', SIZES.standard], ['freshwater', 'malawi', SIZES.standard],
      ['freshwater', 'goldfish', SIZES.standard], ['freshwater', 'nano-shrimp', SIZES.nano], ['freshwater', 'empty', SIZES.long],
      ['brackish', 'mangrove', SIZES.standard], ['brackish', 'brackish-rock', SIZES.standard], ['brackish', 'mangrove', SIZES.huge],
      ['marine', 'reef', SIZES.standard], ['marine', 'nano-reef', SIZES.cube], ['marine', 'fowlr', SIZES.standard], ['marine', 'reef', SIZES.huge],
    ];
    for (const [water, id, size] of typical) {
      const n = suggestStock(specFor(water, id, size), species, plants).length;
      expect(n, `${water} ${id} ${size.widthCm} cm`).toBeGreaterThanOrEqual(3);
      expect(n).toBeLessThanOrEqual(6);
    }
  });

  it('fits the style', () => {
    const all = (water: WaterType, id: string, size: TankSize) => suggestStock(specFor(water, id, size), species, plants);
    const sp = (q: { speciesId: string }) => species.get(q.speciesId)!;
    // Goldfish: goldfish only, and nothing tropical in the unheated water.
    for (const s of all('freshwater', 'goldfish', SIZES.standard)) for (const q of s.stock) expect(sp(q).body.archetype).toMatch(/goldfish/);
    // Malawi: rock-dwelling cichlids of the lake, with a catfish at most.
    for (const s of all('freshwater', 'malawi', SIZES.huge)) {
      for (const q of s.stock) if (sp(q).family === 'Cichlidae') expect(sp(q).region).toMatch(/Malawi/);
    }
    // Amazon: led by South American fish.
    for (const s of all('freshwater', 'amazon', SIZES.standard)) expect(sp(s.stock[0]).region).toMatch(/Amazon|Brazil|Peru|Colombia|Negro|Orinoco|Guian|Paragua|Bolivia|Venezuela|South America|Guyana|Paran/i);
    // Iwagumi: a school of small fish against the stones.
    for (const s of all('freshwater', 'iwagumi', SIZES.standard)) expect(sp(s.stock[0]).adultLengthCm).toBeLessThanOrEqual(5);
    // A shrimp nano always has shrimp.
    for (const s of all('freshwater', 'nano-shrimp', SIZES.nano)) expect(s.stock.some((q) => sp(q).group === 'shrimp')).toBe(true);
    // A reef with corals takes only reef-safe fish; a fish-only tank leads with fish a reef can't keep.
    for (const s of all('marine', 'reef', SIZES.standard)) for (const q of s.stock) if (sp(q).group === 'fish') expect(sp(q).traits).toContain('reef-safe');
    expect(all('marine', 'fowlr', SIZES.standard).some((s) => s.stock.some((q) => sp(q).group === 'fish' && !sp(q).traits.includes('reef-safe')))).toBe(true);
    // A clownfish pair with a cleaner and a crew is among the reef's offers.
    expect(all('marine', 'reef', SIZES.standard).some((s) => s.stock.some((q) => sp(q).body.archetype === 'clownfish') && s.stock.some((q) => sp(q).traits.includes('cleaner')))).toBe(true);
    // Brackish: bumblebee-type gobies are on the list.
    expect(all('brackish', 'mangrove', SIZES.standard).some((s) => s.stock.some((q) => sp(q).body.archetype === 'goby'))).toBe(true);
  });

  it('respects the biotope chemistry and the heater', () => {
    const ok = (s: StockSuggestion[], ph: number, temp: number) => {
      for (const x of s) {
        for (const q of x.stock) {
          const sp = species.get(q.speciesId)!;
          expect(sp.ph[0] - 0.2, `${sp.id} pH`).toBeLessThanOrEqual(ph);
          expect(sp.ph[1] + 0.2, `${sp.id} pH`).toBeGreaterThanOrEqual(ph);
          expect(sp.tempC[0], `${sp.id} °C`).toBeLessThanOrEqual(temp + 0.2);
          expect(sp.tempC[1], `${sp.id} °C`).toBeGreaterThanOrEqual(temp);
        }
      }
    };
    ok(suggestStock(specFor('freshwater', 'blackwater', SIZES.standard), species, plants), 6.3, 27);
    ok(suggestStock(specFor('freshwater', 'malawi', SIZES.standard), species, plants), 8.0, 26);
    // A hot discus-style tank only gets fish that like it hot.
    ok(suggestStock(specFor('freshwater', 'amazon', SIZES.tall, { equipment: { heater: { on: true, targetC: 29 } } }), species, plants), 6.7, 29);
  });

  it('is fast, cached, and hands out copies', () => {
    const fresh = new SpeciesIndex(species.all);
    const spec = specFor('freshwater', 'amazon', SIZES.standard);
    const t0 = performance.now();
    const a = suggestStock(spec, fresh, plants);
    const first = performance.now() - t0;
    const t1 = performance.now();
    suggestStock(spec, fresh, plants);
    const cached = performance.now() - t1;
    // Generous bounds (CI machines vary); typically ~20–40 ms and well under 1 ms cached.
    expect(first).toBeLessThan(1000);
    expect(cached).toBeLessThan(20);
    a[0].stock[0].count = 999;
    a.length = 0;
    expect(suggestStock(spec, fresh, plants)[0].stock[0].count).not.toBe(999);
  });
});

describe('stock check', () => {
  const amazon = specFor('freshwater', 'amazon', SIZES.standard);

  it('agrees with the suggestions it made', () => {
    for (const s of suggestStock(amazon, species, plants)) {
      const c = checkStock(amazon, s.stock, species, plants);
      expect(c.level).toBe(s.level);
      expect(c.stocking).toBeCloseTo(s.stocking, 2);
    }
    expect(checkStock(amazon, [], species, plants)).toEqual({ level: 'good', issues: [], stocking: 0 });
  });

  it('flags predators, wrong water, small groups, rival males, unknown species and overstocking — worst first', () => {
    const tall = specFor('freshwater', 'amazon', SIZES.tall);
    const eaten = checkStock(tall, [{ speciesId: 'pterophyllum-scalare', count: 2 }, { speciesId: 'paracheirodon-innesi', count: 12 }], species, plants);
    expect(eaten.level).toBe('bad');
    expect(eaten.issues.some((i) => i.level === 'bad' && /eat/.test(i.text))).toBe(true);

    const salt = checkStock(amazon, [{ speciesId: 'amphiprion-ocellaris', count: 2 }], species, plants);
    expect(salt.level).toBe('bad');
    expect(salt.issues[0].speciesId).toBe('amphiprion-ocellaris');

    const lonely = checkStock(amazon, [{ speciesId: 'paracheirodon-axelrodi', count: 3 }], species, plants);
    expect(lonely.level).toBe('caution');
    expect(lonely.issues[0].text).toMatch(/groups/);

    const fight = checkStock(amazon, [{ speciesId: 'betta-splendens-halfmoon-red', count: 1 }, { speciesId: 'betta-splendens-halfmoon-red', count: 1 }], species, plants);
    expect(fight.issues.some((i) => i.level === 'bad' && /fight/.test(i.text))).toBe(true);

    const unknown = checkStock(amazon, [{ speciesId: 'no-such-fish', count: 2 }], species, plants);
    expect(unknown.issues[0]).toMatchObject({ speciesId: 'no-such-fish', level: 'bad' });

    const nano = specFor('freshwater', 'nano-shrimp', SIZES.nano);
    const crowded = checkStock(nano, [{ speciesId: 'boraras-brigittae', count: 120 }, { speciesId: 'neocaridina-davidi-red-cherry', count: 20 }], species, plants);
    expect(crowded.level).toBe('bad');
    expect(crowded.stocking).toBeGreaterThan(1.3);
    expect(crowded.issues.some((i) => /support|capacity/.test(i.text))).toBe(true);

    for (const c of [eaten, salt, lonely, fight, crowded]) {
      const rank = { good: 0, caution: 1, bad: 2 };
      for (let i = 1; i < c.issues.length; i++) expect(rank[c.issues[i - 1].level]).toBeGreaterThanOrEqual(rank[c.issues[i].level]);
    }
  });

  it('is quick', () => {
    const stock = suggestStock(amazon, species, plants)[0].stock;
    const t0 = performance.now();
    for (let i = 0; i < 10; i++) checkStock(amazon, stock, species, plants);
    expect((performance.now() - t0) / 10).toBeLessThan(40);
  });
});
