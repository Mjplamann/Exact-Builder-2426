import { describe, expect, it } from 'vitest';
import {
  formatAge,
  formatAgeRange,
  formatLength,
  formatTemp,
  formatTempRange,
  freeAmmonia,
  kelvinToHex,
  oxygenSaturationMgL,
  pluralName,
  timeScaleLabel,
  humanActivity,
  localizeUnits,
  formatFlow,
  scheduleIsOn,
} from '../src/ui/format';
import { searchRank } from '../src/ui/panels/FishPanel';
import { birthMessage } from '../src/ui/Notifier';
import { ThumbnailLoader } from '../src/ui/thumbs';
import type { FishRenderer } from '../src/render/fish/FishRenderer';
import { assessWater, computeNeeds } from '../src/ui/waterHealth';
import { foodMatch, bestFood } from '../src/ui/panels/FeedPanel';
import { FOODS } from '../src/data/foods';
import { defaultWaterParams } from '../src/sim/tankFactory';
import { silhouetteSvg } from '../src/ui/silhouette';
import { bubbleBank, bubbleDamping, bubbleSamples, glassTapSamples, loopNoise, makeRandom, minnaert } from '../src/audio/synth';
import reference from '../src/data/species/reference.json';
import type { FishEntity, Species } from '../src/core/types';

const DAY = 86_400_000;
const species = reference as unknown as Species[];
const byId = (id: string) => species.find((s) => s.id === id)!;
const fishOf = (id: string, n = 1): FishEntity[] =>
  Array.from({ length: n }, () => ({ species: byId(id) }) as unknown as FishEntity);

describe('format', () => {
  it('ages read naturally', () => {
    expect(formatAge(3 * 3600_000)).toBe('a few hours');
    expect(formatAge(5 * DAY)).toBe('5 days');
    expect(formatAge(21 * DAY)).toBe('3 weeks');
    expect(formatAge(122 * DAY)).toBe('4 months');
    expect(formatAge(456 * DAY)).toBe('15 months');
    expect(formatAge(800 * DAY)).toBe('2 years 2 months');
    expect(formatAgeRange(122 * DAY, 213 * DAY)).toBe('4–7 months');
    expect(formatAgeRange(21 * DAY, 61 * DAY)).toBe('3 weeks – 2 months');
  });

  it('units convert', () => {
    expect(formatLength(3.5, 'metric')).toBe('3.5 cm');
    expect(formatLength(25.4, 'imperial')).toBe('10 in');
    expect(formatTemp(25, 'imperial')).toBe('77.0 °F');
    expect(formatTempRange([20, 26], 'metric')).toBe('20–26 °C');
  });

  it('time-scale labels', () => {
    expect(timeScaleLabel(1440)).toBe('1 min = 1 day');
    expect(timeScaleLabel(3)).toBe('×3');
  });

  it('plural common names', () => {
    expect(pluralName('Neon Tetra')).toBe('Neon Tetras');
    expect(pluralName('Panda Cory')).toBe('Panda Cories');
    expect(pluralName('Amano Shrimp')).toBe('Amano Shrimp');
    expect(pluralName('Clownfish')).toBe('Clownfish');
  });

  it('humanizes behavior labels', () => {
    expect(humanActivity('forage-bottom')).toBe('Foraging');
    expect(humanActivity('school')).toBe('Swimming with the shoal');
    expect(humanActivity('weird_thing')).toBe('Weird thing');
  });

  it('water chemistry helpers follow published fits', () => {
    // ~8.26 mg/L at 25 °C fresh; seawater ~20 % less.
    expect(oxygenSaturationMgL(25, 1)).toBeCloseTo(8.26, 1);
    expect(oxygenSaturationMgL(25, 1.025)).toBeLessThan(7);
    // Free NH3 fraction: ~0.6 % at pH 7 / 25 °C, ~7 % at pH 8.2.
    expect(freeAmmonia(1, 7, 25)).toBeCloseTo(0.0056, 3);
    expect(freeAmmonia(1, 8.2, 25)).toBeGreaterThan(0.06);
    expect(kelvinToHex(6500)).toMatch(/^#ff/);
  });
});

describe('water health', () => {
  it('a fresh tank with compatible fish is healthy', () => {
    const fish = [...fishOf('paracheirodon-axelrodi', 10), ...fishOf('corydoras-panda', 6)];
    const needs = computeNeeds(fish, 'freshwater');
    const wp = { ...defaultWaterParams('freshwater', 0), temperatureC: 24 };
    const a = assessWater(wp, 'freshwater', needs);
    expect(a.level).toBe('good');
    expect(a.issues).toHaveLength(0);
  });

  it('flags ammonia, names uncomfortable species, and detects range conflicts', () => {
    const fish = [...fishOf('paracheirodon-innesi', 10), ...fishOf('mikrogeophagus-ramirezi', 2)];
    const needs = computeNeeds(fish, 'freshwater');
    const wp = { ...defaultWaterParams('freshwater', 0), ammonia: 1.2, ph: 7.4, temperatureC: 31 };
    const a = assessWater(wp, 'freshwater', needs);
    expect(a.level).toBe('bad');
    expect(a.params.ammonia.level).toBe('bad');
    expect(a.issues.some((i) => i.key === 'temperature' && /Too warm/.test(i.text))).toBe(true);
    const conflicting = computeNeeds([...fishOf('corydoras-panda', 3), ...fishOf('mikrogeophagus-ramirezi', 2)], 'freshwater');
    if (conflicting.tempConflict) expect(conflicting.tempPair).toBeDefined();
  });

  it('nitrite is judged more leniently in seawater', () => {
    const needs = computeNeeds([], 'marine');
    const wp = { ...defaultWaterParams('marine', 0), nitrite: 0.3 };
    expect(assessWater(wp, 'marine', needs).params.nitrite.level).toBe('good');
    const fw = { ...defaultWaterParams('freshwater', 0), nitrite: 0.3 };
    expect(assessWater(fw, 'freshwater', computeNeeds([], 'freshwater')).params.nitrite.level).toBe('caution');
  });
});

describe('food matching', () => {
  it('prefers foods that suit the stock', () => {
    const tetras = fishOf('paracheirodon-innesi', 10);
    expect(foodMatch(FOODS.flakes, tetras).score).toBeGreaterThan(foodMatch(FOODS.nori, tetras).score);
    expect(foodMatch(FOODS.flakes, tetras).fans).toContain('Neon Tetra');
    expect(bestFood([], 'marine')).toBe('mysis');
  });
});

describe('silhouettes', () => {
  it('draws a portrait for every reference species', () => {
    for (const s of species) {
      const svg = silhouetteSvg(s);
      expect(svg.startsWith('<svg')).toBe(true);
      expect(svg).not.toMatch(/NaN|undefined|Infinity/);
    }
  });
});

describe('audio synthesis', () => {
  it('bubbles ring at the Minnaert frequency and decay', () => {
    expect(minnaert(0.003)).toBeCloseTo(1087, 0);
    const sr = 48000;
    const b = bubbleSamples(sr, 0.003, 1);
    // Damping from van den Doel: ~93 /s at 1.1 kHz → ~74 ms to −60 dB.
    expect(bubbleDamping(1087)).toBeGreaterThan(80);
    expect(b.length / sr).toBeLessThan(0.1);
    const head = Math.max(...Array.from(b.subarray(0, 600), Math.abs));
    const tail = Math.max(...Array.from(b.subarray(b.length - 600), Math.abs));
    expect(tail).toBeLessThan(head * 0.01);
  });

  it('noise loops are bounded and zero-mean; one-shots are finite', () => {
    const rnd = makeRandom(7);
    const n = loopNoise(8000, 1, 'brown', rnd);
    let mean = 0;
    let peak = 0;
    for (const v of n) {
      mean += v;
      peak = Math.max(peak, Math.abs(v));
    }
    expect(Math.abs(mean / n.length)).toBeLessThan(1e-3);
    expect(peak).toBeLessThanOrEqual(0.9 + 1e-6);
    const tap = glassTapSamples(8000, rnd);
    expect(tap.every((v) => Number.isFinite(v))).toBe(true);
    expect(bubbleBank(8000, 6, 0.001, 0.003, rnd)).toHaveLength(6);
  });
});

describe('review regressions (UI)', () => {
  it('rewrites metric quantities from other modules for imperial viewers', () => {
    const u = 'imperial' as const;
    expect(localizeUnits('Arrow cichlids need at least 300 L; this tank holds about 252 L.', u)).toBe(
      'Arrow cichlids need at least 79 gal; this tank holds about 67 gal.',
    );
    expect(localizeUnits('They like 23–29 °C; the water is 25.5 °C.', u)).toBe('They like 73–84 °F; the water is 77.9 °F.');
    expect(localizeUnits('Adult Oscars (35 cm) eat anything', u)).toBe('Adult Oscars (14 in) eat anything');
    expect(localizeUnits('Flow 1,500 L/h', u)).toBe('Flow 396 gal/h');
    expect(localizeUnits('Ammonia 0.25 mg/L · Lights', u)).toBe('Ammonia 0.25 mg/L · Lights');
    expect(localizeUnits('They like 23–29 °C', 'metric')).toBe('They like 23–29 °C');
    expect(formatFlow(1500, 'metric')).toBe('1,500 L/h');
  });

  it('water issues follow the display units', () => {
    const needs = computeNeeds(fishOf('paracheirodon-innesi', 10), 'freshwater');
    const wp = { ...defaultWaterParams('freshwater', 0), temperatureC: 31 };
    const t = assessWater(wp, 'freshwater', needs, 'imperial').issues.find((i) => i.key === 'temperature')!.text;
    expect(t).toMatch(/°F/);
    expect(t).not.toMatch(/°C/);
  });

  it('light schedules that run past midnight are on after dark', () => {
    expect(scheduleIsOn(13, 9, 21)).toBe(true);
    expect(scheduleIsOn(22, 9, 21)).toBe(false);
    expect(scheduleIsOn(23, 18, 2)).toBe(true);
    expect(scheduleIsOn(1.5, 18, 2)).toBe(true);
    expect(scheduleIsOn(12, 18, 2)).toBe(false);
    expect(scheduleIsOn(12, 8, 8)).toBe(false);
  });

  it('catalog search puts the exact name first', () => {
    const names: [string, string][] = [
      ['Albino Neon Tetra', 'Paracheirodon innesi'],
      ['Black Neon Tetra', 'Hyphessobrycon herbertaxelrodi'],
      ['Neon Tetra', 'Paracheirodon innesi'],
      ['Green Neon Tetra', 'Paracheirodon simulans'],
    ];
    const ranked = [...names].sort((a, b) => searchRank(a[0], a[1], 'neon tetra') - searchRank(b[0], b[1], 'neon tetra'));
    expect(ranked[0][0]).toBe('Neon Tetra');
    expect(searchRank('Neon Tetra', 'Paracheirodon innesi', 'neon')).toBeLessThan(searchRank('Black Neon Tetra', 'x', 'neon'));
    expect(searchRank('Cardinal Tetra', 'Paracheirodon axelrodi', 'paracheirodon')).toBe(3);
    expect(searchRank('Anything', 'x', '')).toBe(0);
  });

  it('brood messages read naturally for fish and invertebrates', () => {
    expect(birthMessage('Neon Tetra', 'fish', 1)).toBe('A Neon tetra fry was born');
    expect(birthMessage('Guppy', 'fish', 7)).toBe('7 Guppy fry were born');
    expect(birthMessage('Cherry Shrimp', 'shrimp', 12)).toBe('12 young Cherry shrimp appeared');
    expect(birthMessage('Ramshorn Snail', 'snail', 3)).toBe('3 young Ramshorn snails appeared');
  });

  it('portrait requests scrolled out of view are dropped, others kept', () => {
    const never = new Promise<string>(() => {});
    const loader = new ThumbnailLoader({ thumbnail: () => never } as unknown as FishRenderer);
    const sp = (id: string) => ({ id }) as unknown as Species;
    loader.request(sp('a'), 128, () => {}, 'catalog'); // starts rendering immediately
    loader.request(sp('b'), 128, () => {}, 'catalog');
    loader.request(sp('c'), 128, () => {}, 'catalog');
    loader.request(sp('d'), 256, () => {}); // a detail page portrait
    expect(loader.pending).toBe(3);
    loader.cancelPending('catalog', (id) => id === 'c');
    expect(loader.pending).toBe(2); // c (still visible) and d (not the catalog's)
    loader.cancelPending();
    expect(loader.pending).toBe(0);
  });
});
