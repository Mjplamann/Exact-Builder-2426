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
  pico: { widthCm: 20, heightCm: 15, depthCm: 15 },
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

const nameMatches = (common: string, phrase: string) => phrase.toLowerCase().includes(common.replace(/\s*\(.*\)/, '').toLowerCase());

describe('what an experienced aquarist would suggest', () => {
  const all = (water: WaterType, id: string, size: TankSize, patch: Partial<TankSpec> = {}) => suggestStock(specFor(water, id, size, patch), species, plants);
  const sp = (q: { speciesId: string }) => species.get(q.speciesId)!;
  const ids = (list: StockSuggestion[]) => list.flatMap((s) => s.stock.map((q) => q.speciesId));
  const genusOf = (q: { speciesId: string }) => sp(q).scientificName.split(' ')[0];

  it('gives CO₂ planted tanks their algae crew (Amano shrimp, otocinclus) and the Iwagumi its one big school', () => {
    for (const [id, size] of [['iwagumi', SIZES.cube], ['dutch', SIZES.standard], ['nature', SIZES.tall]] as const) {
      const list = all('freshwater', id, size);
      expect(ids(list).some((x) => /caridina-multidentata|otocinclus/.test(x)), id).toBe(true);
    }
    const iwagumi = all('freshwater', 'iwagumi', SIZES.cube);
    expect(iwagumi.some((s) => s.description.startsWith('A stone garden with one big school'))).toBe(true);
    // No wood-rasping pleco in a stone garden.
    for (const s of iwagumi) for (const q of s.stock) expect(sp(q).traits, q.speciesId).not.toContain('wood-eater');
  });

  it('keeps mbuna and peacocks/haps apart, with Rift Lake catfish only', () => {
    for (const size of [SIZES.standard, SIZES.long, SIZES.huge]) {
      for (const s of all('freshwater', 'malawi', size)) {
        const cichlids = s.stock.filter((q) => sp(q).family === 'Cichlidae');
        const mbuna = cichlids.filter((q) => sp(q).body.archetype === 'mbuna').length;
        expect(mbuna === 0 || mbuna === cichlids.length, `${s.title}: mbuna mixed with haps`).toBe(true);
        for (const q of s.stock) if (sp(q).family !== 'Cichlidae') expect(sp(q).body.archetype, `${s.title}: ${q.speciesId}`).toBe('synodontis');
      }
    }
    expect(all('freshwater', 'malawi', SIZES.huge).some((s) => s.description.startsWith('Peacocks and haps'))).toBe(true);
  });

  it('never puts a betta with dwarf shrimp, nor in a shrimp nano', () => {
    for (const [id, size] of [['empty', SIZES.nano], ['iwagumi', SIZES.nano], ['amazon', SIZES.nano], ['nano-shrimp', SIZES.nano], ['nano-shrimp', SIZES.tiny]] as const) {
      for (const s of all('freshwater', id, size)) {
        if (!s.stock.some((q) => isFighter(sp(q)))) continue;
        expect(id, s.title).not.toBe('nano-shrimp');
        for (const q of s.stock) if (sp(q).group === 'shrimp') expect(sp(q).adultLengthCm, `${s.title}: ${q.speciesId}`).toBeGreaterThanOrEqual(4);
      }
    }
  });

  it('only suggests gobies and shrimp whose host is in the tank, and no notoriously hard feeders', () => {
    for (const [id, size] of [['reef', SIZES.standard], ['reef', SIZES.cube], ['nano-reef', SIZES.nano], ['fowlr', SIZES.standard], ['reef', SIZES.huge]] as const) {
      for (const s of all('marine', id, size)) {
        for (const q of s.stock) {
          // There are no whip corals in any layout, and no corals or anemone at all in a fish-only tank.
          expect(genusOf(q), `${id} ${s.title}`).not.toBe('Bryaninops');
          if (id === 'fowlr') {
            expect(genusOf(q), `${s.title}`).not.toBe('Gobiodon');
            if (sp(q).group === 'shrimp') expect(sp(q).traits, `${s.title}: ${q.speciesId}`).not.toContain('anemone-host');
          }
          expect(['koumansetta-rainfordi', 'labroides-dimidiatus', 'synchiropus-splendidus']).not.toContain(q.speciesId);
        }
      }
    }
  });

  it('sizes the clean-up crew by the animal and the tank', () => {
    for (const [water, id, size] of [['marine', 'reef', SIZES.cube], ['marine', 'nano-reef', SIZES.nano], ['marine', 'reef', SIZES.huge], ['freshwater', 'amazon', SIZES.standard], ['freshwater', 'empty', SIZES.huge]] as const) {
      const liters = (size.widthCm * size.heightCm * size.depthCm) / 1000;
      for (const s of all(water, id, size)) {
        for (const q of s.stock) {
          const a = sp(q);
          if (a.group !== 'snail' || a.social !== 'solitary') continue;
          // A fighting conch wants ~100 L of sand to itself; small grazers a few litres each.
          const perAnimal = liters / q.count;
          expect(perAnimal, `${s.title}: ${q.count} × ${q.speciesId} in ${Math.round(liters)} L`).toBeGreaterThanOrEqual(water === 'marine' ? 1.5 * a.adultLengthCm ** 2 : 4 * a.adultLengthCm ** 2);
          expect(q.count).toBeLessThanOrEqual(30);
        }
      }
    }
    // A big reef gets a real crew, not six snails.
    const show = all('marine', 'reef', SIZES.huge);
    expect(show.some((s) => s.stock.some((q) => sp(q).group === 'snail' && q.count >= 15))).toBe(true);
  });

  it('suggests forgiving centrepieces, not delicate ones, for an ordinary community tank', () => {
    for (const [id, size] of [['amazon', { widthCm: 60, heightCm: 40, depthCm: 50 }], ['amazon', SIZES.standard], ['dutch', SIZES.standard], ['nature', SIZES.tall], ['empty', SIZES.long]] as const) {
      for (const s of all('freshwater', id, size)) for (const q of s.stock) expect(q.speciesId, `${id} ${s.title}`).not.toMatch(/^(mikrogeophagus-ramirezi|symphysodon-|trichogaster-lalius)/);
    }
  });

  it('introduces the biggest of two showpieces as the centrepiece', () => {
    for (const s of all('marine', 'reef', SIZES.huge)) {
      const m = /, an? ([^,]+?) as the centrepiece/.exec(s.description);
      if (!m) continue;
      const centre = s.stock.find((q) => nameMatches(sp(q).commonName, m[1]))!;
      expect(centre, `${s.title}: ${m[1]}`).toBeDefined();
      const showpieces = s.stock.filter((q) => sp(q).group === 'fish' && ['tang', 'dwarf-angel', 'wrasse', 'basslet', 'dottyback', 'rabbitfish'].includes(sp(q).body.archetype) && q.count === 1);
      for (const o of showpieces) expect(sp(centre).adultLengthCm, s.title).toBeGreaterThanOrEqual(sp(o).adultLengthCm);
    }
  });

  it('fills a show tank with a community worth its size', () => {
    for (const [water, id] of [['marine', 'reef'], ['freshwater', 'amazon'], ['freshwater', 'malawi'], ['marine', 'fowlr']] as const) {
      const list = all(water, id, SIZES.huge);
      expect(list.length, id).toBeGreaterThanOrEqual(3);
      for (const s of list) expect(s.stocking, `${id} “${s.title}”`).toBeGreaterThanOrEqual(0.12);
    }
    // Big peaceful cichlids lead one of the big Amazon communities; a big reef gets a big shoal and a tang-sized showpiece.
    expect(all('freshwater', 'amazon', SIZES.huge).some((s) => s.stock.some((q) => sp(q).family === 'Cichlidae' && sp(q).adultLengthCm >= 15 && q.count >= 5))).toBe(true);
    expect(all('marine', 'reef', SIZES.huge).some((s) => s.stock.some((q) => q.count >= 20 && sp(q).group === 'fish') && s.stock.some((q) => sp(q).adultLengthCm >= 15))).toBe(true);
  });
});

describe('living with the advice', () => {
  /**
   * The water drifts after setup — CO₂ injection swings the pH by over a unit each day, a fresh
   * tank degasses — so follow suggested communities through four days and nights in the sim.
   */
  const cases: [WaterType, string, TankSize][] = [
    ['freshwater', 'iwagumi', SIZES.standard], ['freshwater', 'dutch', SIZES.standard], ['freshwater', 'nature', SIZES.cube],
    ['freshwater', 'amazon', SIZES.standard], ['freshwater', 'nano-shrimp', SIZES.nano], ['freshwater', 'malawi', SIZES.standard],
    ['freshwater', 'goldfish', SIZES.standard], ['brackish', 'mangrove', SIZES.standard], ['marine', 'reef', SIZES.cube],
  ];
  for (const [water, id, size] of cases) {
    it(`${id}: suggestions stay within the sim's comfort through the daily cycle`, () => {
      const spec = specFor(water, id, size);
      for (const s of suggestStock(spec, species, plants).slice(0, 3)) {
        const tank = tankFromSpec(spec, { now: Date.UTC(2026, 5, 1, 6), seed: 21 });
        const built = AQUASCAPES.find((a) => a.id === id)!.build(tank, plants, tank.seed);
        tank.decor = built.decor;
        tank.plants = built.plants;
        const world = createWorld({ tank, species, plants, settings: { ...DEFAULT_SETTINGS } });
        const life = new LifeSim(world);
        for (const q of s.stock) life.addFish(world, q.speciesId, q.count);
        const seen = new Set<string>();
        for (let step = 0; step < 4 * 24 * 4; step++) {
          world.clock.simTime += 900_000;
          life.update(world, 900);
          if (step % 8) continue;
          for (const q of s.stock) {
            const sp = species.get(q.speciesId)!;
            // The sim's check asks about adding one more: for a lone fighter that is a rival male.
            if (isFighter(sp)) continue;
            const r = life.compatibility(world, sp, 0);
            // Water and tankmates as they are — not the stocking or group-size advice about adding more.
            const own = r.issues.filter((t) => !/^Adding|can jump|feel secure in groups|do best as a bonded pair/.test(t));
            if (r.level !== 'good' && own.length) seen.add(`${q.speciesId} at pH ${world.tank.waterParams.ph.toFixed(2)}, ${world.tank.waterParams.temperatureC.toFixed(1)} °C: ${own[0]}`);
          }
        }
        if (s.level === 'good') expect([...seen], `${id} “${s.title}”`).toEqual([]);
      }
    });
  }
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
