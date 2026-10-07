import { describe, expect, it } from 'vitest';
import { SHAPE_SIZES, aquascapesFor } from '../src/app/biotopes';
import type { AquascapeInfo } from '../src/app/tankTypes';
import {
  BuilderModel,
  STEPS,
  defaultSlope,
  defaultStyle,
  defaultTankName,
  slopeLimits,
  stepIssue,
  uniqueName,
} from '../src/ui/builder/model';
import {
  NANO_LIMITS,
  SIZE_LIMITS,
  clampDim,
  displayRange,
  filledWeight,
  flowRange,
  formatDims,
  formatVolumeBoth,
  formatWeight,
  fromDisplayLength,
  glassKg,
  glassThicknessMm,
  grossLiters,
  netLiters,
  photoperiod,
  sizeNotes,
  toDisplayLength,
  turnover,
  turnoverAdvice,
  turnoverWord,
  usGallons,
} from '../src/ui/builder/tankMath';
import { deleteMessage, tankLine, waterLabel } from '../src/ui/builder/labels';

const FRESH: AquascapeInfo[] = [
  { id: 'amazon', name: 'Amazon flooded forest', description: '', water: 'freshwater', defaults: { substrate: 'river-sand', background: 'dark-green', waterParams: { temperatureC: 27, ph: 6.4 }, substrateDepthFrontCm: 3, substrateDepthBackCm: 9 } },
  { id: 'nano-shrimp', name: 'Shrimp nano', description: '', water: 'freshwater', minLiters: 20 },
  { id: 'goldfish', name: 'Goldfish tank', description: '', water: 'freshwater', defaults: { substrate: 'pea-gravel', equipment: { heater: { on: false } }, waterParams: { temperatureC: 20 } } },
  { id: 'empty', name: 'Bare substrate', description: '', water: 'freshwater' },
];
const MARINE: AquascapeInfo[] = [
  { id: 'big-reef', name: 'lagoon patch reef', description: '', water: 'marine', minLiters: 400 },
  { id: 'reef', name: 'Coral reef', description: '', water: 'marine', defaults: { substrate: 'aragonite', equipment: { lights: { colorTempK: 15000 } } } },
  { id: 'empty', name: 'Bare substrate', description: '', water: 'marine' },
];

describe('tank math: units', () => {
  it('converts lengths to whole cm / half inches and back', () => {
    expect(toDisplayLength(61, 'imperial')).toBe(24);
    expect(toDisplayLength(120.4, 'metric')).toBe(120);
    expect(fromDisplayLength(24, 'imperial')).toBe(61);
    expect(fromDisplayLength(47.5, 'imperial')).toBe(121);
    expect(fromDisplayLength(89.6, 'metric')).toBe(90);
    // Inch slider bounds stay inside the cm limits.
    const [lo, hi] = displayRange(SIZE_LIMITS.width, 'imperial');
    expect(lo * 2.54).toBeGreaterThanOrEqual(30);
    expect(hi * 2.54).toBeLessThanOrEqual(300);
    expect(displayRange([30, 300], 'metric')).toEqual([30, 300]);
  });

  it('formats dimensions, volumes and weights in the keeper’s units', () => {
    expect(formatDims({ widthCm: 120, depthCm: 50, heightCm: 50 }, 'metric')).toBe('120 × 50 × 50 cm');
    expect(formatDims({ widthCm: 120, depthCm: 50, heightCm: 50 }, 'imperial')).toBe('47 × 19.5 × 19.5 in');
    expect(formatVolumeBoth(300, 'metric')).toBe('300 L · 79 US gal');
    expect(formatVolumeBoth(300, 'imperial')).toBe('79 US gal · 300 L');
    expect(formatWeight(348, 'metric')).toBe('348 kg');
    expect(formatWeight(1460, 'metric')).toBe('1.5 t');
    expect(formatWeight(100, 'imperial')).toBe('220 lb');
  });
});

describe('tank math: volume & weight', () => {
  const size = { widthCm: 120, depthCm: 50, heightCm: 50 };
  const fill = { size, substrate: 'river-sand' as const, substrateDepthFrontCm: 3, substrateDepthBackCm: 8 };

  it('gross and net liters, US gallons', () => {
    expect(grossLiters(size)).toBe(300);
    expect(usGallons(300)).toBeCloseTo(79.25, 2);
    // 120 × 50 × (50 − 2.5 freeboard − 5.5 cm substrate) = 252 L
    expect(netLiters(fill)).toBeCloseTo(252, 5);
    expect(netLiters({ ...fill, substrate: 'bare' })).toBeCloseTo(285, 5);
  });

  it('glass gets thicker with height; weight adds water × SG, glass and substrate', () => {
    expect(glassThicknessMm(30)).toBe(5);
    expect(glassThicknessMm(50)).toBe(8);
    expect(glassThicknessMm(75)).toBe(15);
    expect(glassThicknessMm(120)).toBe(25);
    for (let h = 20; h < 120; h += 5) expect(glassThicknessMm(h + 5)).toBeGreaterThanOrEqual(glassThicknessMm(h));
    // 2.3 m² of 8 mm glass at 2.5 kg/m²/mm
    expect(glassKg(size)).toBeCloseTo(46, 5);
    const fresh = filledWeight(fill, 1);
    expect(fresh.water).toBeCloseTo(252, 5);
    expect(fresh.substrate).toBeCloseTo(120 * 50 * 5.5 / 1000 * 1.5, 5);
    expect(fresh.total).toBeCloseTo(fresh.water + fresh.glass + fresh.substrate, 8);
    // Seawater is heavier.
    expect(filledWeight(fill, 1.025).water).toBeCloseTo(252 * 1.025, 5);
    expect(filledWeight({ ...fill, substrate: 'bare' }, 1).substrate).toBe(0);
  });

  it('gentle notes for small, tall, cube and heavy tanks', () => {
    const nano = { size: { widthCm: 30, depthCm: 25, heightCm: 25 }, substrate: 'aqua-soil' as const, substrateDepthFrontCm: 2, substrateDepthBackCm: 4 };
    expect(sizeNotes(nano, 'nano', 1, 'metric').join(' ')).toMatch(/Under 40 L/);
    const cube = { ...nano, size: { widthCm: 60, depthCm: 60, heightCm: 60 } };
    expect(sizeNotes(cube, 'cube', 1, 'metric').join(' ')).toMatch(/cube has no long swimming runs/);
    const tall = { ...nano, size: { widthCm: 120, depthCm: 60, heightCm: 90 } };
    const tallNotes = sizeNotes(tall, 'tall', 1, 'metric').join(' ');
    expect(tallNotes).toMatch(/reaching in/);
    expect(tallNotes).toMatch(/weighs about/);
    expect(sizeNotes(nano, 'nano', 1, 'imperial').join(' ')).toMatch(/Under 11 gal/);
  });

  it('filter turnover advice and wording', () => {
    expect(turnover(1500, { widthCm: 120, depthCm: 50, heightCm: 50 })).toBe(5);
    const reef = turnoverAdvice('marine', 'reef');
    expect(reef.lo).toBeGreaterThanOrEqual(8);
    expect(turnoverWord(5, reef)).toBe('Gentle');
    expect(turnoverWord(12, reef)).toBe('Just right');
    expect(turnoverWord(5, turnoverAdvice('freshwater', 'amazon'))).toBe('Just right');
    expect(turnoverWord(9, turnoverAdvice('freshwater', 'nano-shrimp'))).toBe('Strong');
    const [lo, hi] = flowRange({ widthCm: 120, depthCm: 50, heightCm: 50 }, 'freshwater');
    expect(lo).toBe(600);
    expect(hi).toBe(3600);
    expect(photoperiod(9, 21)).toBe(12);
    expect(photoperiod(18, 2)).toBe(8);
  });
});

describe('tank builder model', () => {
  it('starts from a standard freshwater tank with a suitable style already applied', () => {
    const m = new BuilderModel(SHAPE_SIZES, FRESH, []);
    const s = m.spec;
    expect(s.water).toBe('freshwater');
    expect(s.shape).toBe('standard');
    expect(s.size).toEqual(SHAPE_SIZES.standard.size);
    expect(s.aquascape).toBe('amazon');
    expect(s.substrate).toBe('river-sand');
    expect(s.background).toBe('dark-green');
    expect([s.substrateDepthFrontCm, s.substrateDepthBackCm]).toEqual([3, 9]);
    expect(s.name).toBe('Amazon Riverbank');
    expect(s.cycled).toBe(true);
    expect(s.stock).toEqual([]);
    // The style's warm soft water sets the heater and the starting temperature.
    expect(m.equipment.heater.targetC).toBe(27);
    expect(s.waterParams).toMatchObject({ temperatureC: 27, ph: 6.4 });
    expect(m.changed).toBe(false);
  });

  it('style defaults never override a hand-made choice', () => {
    const m = new BuilderModel(SHAPE_SIZES, FRESH, []);
    m.setBackground('frosted');
    m.applyStyle(FRESH[2]); // goldfish
    expect(m.spec.substrate).toBe('pea-gravel');
    expect(m.spec.background).toBe('frosted');
    // Unheated, at the style's cool temperature.
    expect(m.equipment.heater.on).toBe(false);
    expect(m.spec.waterParams?.temperatureC).toBe(20);
    expect(m.spec.name).toBe('Goldfish Tank');
    // A keeper-set heater wins over the next style's temperature.
    m.setHeater({ on: true, targetC: 24 });
    m.applyStyle(FRESH[0]);
    expect(m.equipment.heater.targetC).toBe(24);
    expect(m.spec.waterParams?.temperatureC).toBe(24);
    expect(m.spec.waterParams?.ph).toBe(6.4);
    m.setHeater({ on: false });
    expect(m.spec.waterParams?.temperatureC).toBe(22);
    // A name the keeper typed stays.
    m.setName('Living room');
    m.applyStyle(FRESH[3]);
    expect(m.spec.name).toBe('Living room');
    expect(m.changed).toBe(true);
  });

  it('a new water type brings its own style, look and equipment and drops the animals', () => {
    const m = new BuilderModel(SHAPE_SIZES, FRESH, []);
    m.setSubstrate('black-gravel');
    m.setStock([{ speciesId: 'paracheirodon-axelrodi', count: 12 }]);
    m.setWater('marine', MARINE);
    // The 400 L lagoon doesn't suit 300 L: the first suitable style is preselected.
    expect(m.spec.aquascape).toBe('reef');
    expect(m.spec.substrate).toBe('aragonite');
    expect(m.spec.background).toBe('deep-blue');
    expect(m.equipment.lights.colorTempK).toBe(15000);
    expect(m.equipment.filter.flowLph).toBe(Math.round(300 * 8));
    expect(m.spec.stock).toEqual([]);
    expect(m.spec.name).toBe('Coral Reef');
  });

  it('sizes: shapes set dimensions, edits clamp and make a custom tank (a nano stays a nano)', () => {
    const m = new BuilderModel(SHAPE_SIZES, FRESH, []);
    m.setShape('cube');
    expect(m.spec.size).toEqual(SHAPE_SIZES.cube.size);
    m.setDim('width', 80);
    expect(m.spec.shape).toBe('custom');
    m.setDim('width', 1000);
    expect(m.spec.size.widthCm).toBe(SIZE_LIMITS.width[1]);
    m.setDim('height', 5);
    expect(m.spec.size.heightCm).toBe(SIZE_LIMITS.height[0]);
    m.setShape('nano');
    m.setDim('width', 22);
    expect(m.spec.shape).toBe('nano');
    expect(m.spec.size.widthCm).toBe(22);
    m.setDim('depth', 2);
    expect(m.spec.size.depthCm).toBe(NANO_LIMITS.depth[0]);
    // Leaving the nano for a custom tank brings it back within the usual limits.
    m.setShape('custom');
    expect(m.spec.size.widthCm).toBe(SIZE_LIMITS.width[0]);
    expect(clampDim(Number.NaN, 'width', 'custom')).toBe(SIZE_LIMITS.width[0]);
    expect(clampDim(44.6, 'depth', 'custom')).toBe(45);
  });

  it('an untouched filter and slope follow the size; touched ones are kept (within reach)', () => {
    const m = new BuilderModel(SHAPE_SIZES, FRESH, []);
    m.setShape('nano');
    expect(m.equipment.filter.flowLph).toBe(Math.round(m.liters * 5));
    expect(m.equipment.filter.type).toBe('hang-on-back');
    m.setFilter({ type: 'sponge', flowLph: 150 });
    m.setShape('standard');
    expect(m.equipment.filter).toMatchObject({ type: 'sponge', flowLph: 150 });
    m.setSlope({ front: 6, back: 15 });
    m.setShape('nano');
    const lim = slopeLimits(30);
    expect(m.spec.substrateDepthFrontCm).toBeLessThanOrEqual(lim.front);
    expect(m.spec.substrateDepthBackCm).toBe(lim.back);
    expect(defaultSlope(50)).toEqual({ front: 3, back: 8 });
  });

  it('style suggestions follow the tank as it is resized', () => {
    const fresh = aquascapesFor('freshwater');
    const m = new BuilderModel(SHAPE_SIZES, fresh, [], (w, size) => aquascapesFor(w, size));
    m.applyStyle(fresh.find((s) => s.id === 'iwagumi')!);
    const tall = m.spec.substrateDepthBackCm!;
    const flowStd = m.equipment.filter.flowLph;
    m.setShape('nano');
    // Depths are scaled for the 30 cm nano rather than clamped from a 50 cm tank's.
    expect(m.spec.substrateDepthBackCm!).toBeLessThan(tall);
    expect(m.spec.substrateDepthBackCm!).toBeLessThan(slopeLimits(30).back);
    expect(m.equipment.filter.flowLph).toBeLessThan(flowStd);
    m.setShape('standard');
    expect(m.spec.substrateDepthBackCm).toBe(tall);
    expect(m.style?.id).toBe('iwagumi');
  });

  it('stock lists merge, clamp and drop empty entries', () => {
    const m = new BuilderModel(SHAPE_SIZES, FRESH, []);
    m.setStock([{ speciesId: 'a', count: 3 }, { speciesId: 'b', count: 0 }, { speciesId: 'a', count: 2 }]);
    expect(m.spec.stock).toEqual([{ speciesId: 'a', count: 5 }]);
    m.setCount('c', 4);
    m.setCount('a', 0);
    m.setCount('c', 500);
    expect(m.spec.stock).toEqual([{ speciesId: 'c', count: 99 }]);
    expect(m.animals).toBe(99);
    expect(m.countOf('a')).toBe(0);
  });

  it('a spec for createTank is a trimmed copy', () => {
    const m = new BuilderModel(SHAPE_SIZES, FRESH, []);
    m.setName('  Riverbank  ');
    const spec = m.toSpec();
    expect(spec.name).toBe('Riverbank');
    spec.size.widthCm = 1;
    expect(m.spec.size.widthCm).toBe(SHAPE_SIZES.standard.size.widthCm);
  });
});

describe('builder steps & names', () => {
  it('validates the steps that can be invalid', () => {
    const m = new BuilderModel(SHAPE_SIZES, FRESH, []);
    for (const s of STEPS) expect(stepIssue(s, m.spec)).toBeNull();
    m.setName('   ');
    expect(stepIssue('review', m.spec)).toMatch(/name/);
    expect(stepIssue('size', { ...m.spec, size: { widthCm: 10, depthCm: 50, heightCm: 50 } })).not.toBeNull();
  });

  it('names follow the style and stay distinct within the collection', () => {
    expect(defaultTankName({ id: 'amazon', name: 'Amazon flooded forest' }, 'freshwater')).toBe('Amazon Riverbank');
    expect(defaultTankName({ id: 'red-sea', name: 'red sea fringing reef' }, 'marine')).toBe('Red Sea Fringing Reef');
    expect(defaultTankName({ id: 'empty', name: 'Bare substrate' }, 'brackish')).toBe('My Estuary');
    expect(uniqueName('Coral Reef', ['coral reef', 'Coral Reef 2'])).toBe('Coral Reef 3');
    expect(uniqueName('Coral Reef', [])).toBe('Coral Reef');
    const m = new BuilderModel(SHAPE_SIZES, FRESH, ['Amazon Riverbank']);
    expect(m.spec.name).toBe('Amazon Riverbank 2');
  });

  it('prefers a style that fits the volume', () => {
    expect(defaultStyle(MARINE, 100)?.id).toBe('reef');
    expect(defaultStyle(MARINE, 500)?.id).toBe('big-reef');
    expect(defaultStyle([{ id: 'empty', name: 'Bare', description: '', water: 'brackish' }], 100)?.id).toBe('empty');
    expect(defaultStyle([], 100)).toBeNull();
  });
});

describe('tank menu labels', () => {
  const tank = { id: 't1', name: 'Rio Negro', water: 'freshwater' as const, size: { widthCm: 120, depthCm: 50, heightCm: 50 }, liters: 252, animals: 24, species: 6, createdAt: 0, lastSavedReal: 0, current: true };

  it('describes a tank in the keeper’s units', () => {
    expect(waterLabel('marine')).toBe('Saltwater');
    expect(tankLine(tank, 'metric')).toBe('120 × 50 × 50 cm · 252 L');
    expect(tankLine(tank, 'imperial')).toBe('47 × 19.5 × 19.5 in · 67 gal');
  });

  it('the delete confirmation names the tank and its animals', () => {
    expect(deleteMessage(tank)).toBe('“Rio Negro” and its 24 animals (6 species) will be gone for good — on every device where it is saved.');
    expect(deleteMessage({ ...tank, animals: 1, species: 1 })).toMatch(/its one animal will be gone/);
    expect(deleteMessage({ ...tank, animals: 0, species: 0 })).toMatch(/^“Rio Negro” will be gone for good/);
  });
});
