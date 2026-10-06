import { describe, expect, it } from 'vitest';
import type { WaterType } from '../src/core/types';
import { ROOM_TEMP_C, SHAPE_SIZES, SIZE_LIMITS, aquascapesFor, heldTemperature, styleHasCorals, tankFromSpec } from '../src/app/biotopes';
import type { TankSpec } from '../src/app/tankTypes';
import { AQUASCAPES } from '../src/decor/aquascapes';

const WATERS: WaterType[] = ['freshwater', 'brackish', 'marine'];

/** A builder spec that takes a style's defaults as they are, like the guided builder does. */
function specFor(water: WaterType, aquascape: string, size = SHAPE_SIZES.standard.size, patch: Partial<TankSpec> = {}): TankSpec {
  const d = aquascapesFor(water, size).find((a) => a.id === aquascape)!.defaults!;
  return {
    name: 'Test tank', water, shape: 'custom', size, aquascape, cycled: true, stock: [],
    substrate: d.substrate!, background: d.background!, substrateDepthFrontCm: d.substrateDepthFrontCm, substrateDepthBackCm: d.substrateDepthBackCm,
    waterParams: d.waterParams, equipment: d.equipment,
    ...patch,
  };
}

describe('aquascape styles per water type', () => {
  it('offers the biotopes of each water, every one buildable, with an empty tank last', () => {
    const ids = (w: WaterType) => aquascapesFor(w).map((a) => a.id);
    expect(ids('freshwater')).toEqual(['amazon', 'dutch', 'iwagumi', 'nature', 'blackwater', 'malawi', 'goldfish', 'nano-shrimp', 'empty']);
    expect(ids('brackish')).toEqual(['mangrove', 'brackish-rock', 'empty']);
    expect(ids('marine')).toEqual(['reef', 'nano-reef', 'fowlr', 'empty']);
    for (const w of WATERS) {
      for (const a of aquascapesFor(w)) {
        expect(a.water).toBe(w);
        expect(AQUASCAPES.some((s) => s.id === a.id), a.id).toBe(true);
        expect(a.name.length).toBeGreaterThan(3);
        expect(a.description.length).toBeGreaterThan(20);
        const d = a.defaults!;
        expect(d.substrate && d.background).toBeTruthy();
        expect(d.waterParams?.ph).toBeGreaterThan(5.5);
        expect(d.equipment?.heater?.targetC).toBeGreaterThanOrEqual(18);
        expect(d.equipment?.lights?.colorTempK).toBeGreaterThan(4000);
        expect(d.equipment?.autoFeeder?.food).toBeTruthy();
        if (w === 'freshwater') expect(d.waterParams?.salinitySG).toBeUndefined();
        else expect(d.waterParams?.salinitySG).toBeGreaterThan(w === 'marine' ? 1.02 : 1.002);
        if (a.id !== 'empty') expect(a.minLiters).toBeGreaterThan(0);
      }
      expect(aquascapesFor(w).at(-1)!.name).toMatch(/aquascape it yourself/);
    }
  });

  it('carries real biotope chemistry', () => {
    const fw = (id: string) => aquascapesFor('freshwater').find((a) => a.id === id)!.defaults!;
    // Blackwater: soft, acidic, tea-coloured; Malawi: hard and alkaline; goldfish: unheated.
    expect(fw('blackwater').waterParams).toMatchObject({ ph: 6.3, gh: 3 });
    expect(fw('blackwater').waterParams!.tannins!).toBeGreaterThan(0.3);
    expect(fw('malawi').waterParams!.ph!).toBeGreaterThanOrEqual(7.8);
    expect(fw('malawi').waterParams!.gh!).toBeGreaterThanOrEqual(10);
    expect(fw('goldfish').equipment!.heater!.on).toBe(false);
    expect(fw('iwagumi').equipment!.co2).toBe(true);
    expect(fw('nano-shrimp').equipment!.filter!.type).toBe('sponge');
    const mangrove = aquascapesFor('brackish').find((a) => a.id === 'mangrove')!.defaults!;
    expect(mangrove.waterParams!.salinitySG!).toBeGreaterThanOrEqual(1.005);
    expect(mangrove.waterParams!.salinitySG!).toBeLessThanOrEqual(1.01);
    expect(styleHasCorals('marine', 'reef')).toBe(true);
    expect(styleHasCorals('marine', 'nano-reef')).toBe(true);
    expect(styleHasCorals('marine', 'fowlr')).toBe(false);
    expect(styleHasCorals('freshwater', 'reef')).toBe(false);
  });

  it('scales substrate depths with the tank height and sizes the filter to its volume', () => {
    const at = (size: { widthCm: number; heightCm: number; depthCm: number }) => aquascapesFor('freshwater', size).find((a) => a.id === 'iwagumi')!.defaults!;
    const nano = at({ widthCm: 30, heightCm: 20, depthCm: 20 });
    const big = at({ widthCm: 300, heightCm: 120, depthCm: 120 });
    expect(nano.substrateDepthBackCm!).toBeLessThan(big.substrateDepthBackCm!);
    expect(nano.substrateDepthBackCm!).toBeLessThanOrEqual(5);
    expect(nano.substrateDepthFrontCm!).toBeLessThan(nano.substrateDepthBackCm!);
    expect(big.equipment!.filter!.type).toBe('sump');
    expect(big.equipment!.filter!.flowLph!).toBeGreaterThan(nano.equipment!.filter!.flowLph! * 50);
    // Without a size there's no filter to size.
    expect(aquascapesFor('freshwater').find((a) => a.id === 'amazon')!.defaults!.equipment!.filter!.flowLph).toBeUndefined();
  });

  it('shape sizes are sensible commercial tanks within the custom limits', () => {
    for (const [shape, s] of Object.entries(SHAPE_SIZES)) {
      const { widthCm: w, heightCm: h, depthCm: d } = s.size;
      expect(s.label && s.description, shape).toBeTruthy();
      expect(w).toBeGreaterThanOrEqual(SIZE_LIMITS.min.widthCm);
      expect(w).toBeLessThanOrEqual(SIZE_LIMITS.max.widthCm);
      expect(h).toBeGreaterThanOrEqual(SIZE_LIMITS.min.heightCm);
      expect(d).toBeGreaterThanOrEqual(SIZE_LIMITS.min.depthCm);
    }
    const { cube, tall, long, nano } = SHAPE_SIZES;
    expect(cube.size.widthCm).toBe(cube.size.heightCm);
    expect(cube.size.heightCm).toBe(cube.size.depthCm);
    expect(tall.size.heightCm).toBeGreaterThan(tall.size.depthCm);
    expect(long.size.heightCm).toBeLessThan(long.size.depthCm);
    expect((nano.size.widthCm * nano.size.heightCm * nano.size.depthCm) / 1000).toBeLessThan(60);
  });
});

describe('tankFromSpec', () => {
  it('applies the style chemistry, substrate and equipment', () => {
    const t = tankFromSpec(specFor('freshwater', 'blackwater'), { now: 1.7e12, seed: 3 });
    expect(t.water).toBe('freshwater');
    expect(t.substrate).toBe('river-sand');
    expect(t.background).toBe('black');
    expect(t.waterParams).toMatchObject({ ph: 6.3, gh: 3, kh: 3, tannins: 0.45, salinitySG: 1.0 });
    expect(t.waterParams.temperatureC).toBe(27);
    expect(t.equipment.heater).toEqual({ on: true, targetC: 27 });
    expect(t.equipment.lights.colorTempK).toBe(5600);
    expect(t.equipment.autoFeeder.food).toBe('flakes');
    // The life sim sizes the portion to the stock while the feeder is on its first pinch.
    expect(t.equipment.autoFeeder.pinches).toBe(1);
    expect(t.aquascape).toBe('blackwater');
    expect(t.name).toBe('Test tank');
    expect(t.waterParams.bacteria).toBeGreaterThanOrEqual(1);
  });

  it('keeps salt where it belongs and within the life sim’s bands', () => {
    const br = tankFromSpec(specFor('brackish', 'mangrove'));
    expect(br.waterParams.salinitySG).toBeCloseTo(1.006, 4);
    const mar = tankFromSpec(specFor('marine', 'reef'));
    expect(mar.waterParams.salinitySG).toBeCloseTo(1.025, 4);
    expect(mar.equipment.co2).toBe(false);
    // A freshwater tank is never salty, whatever the spec says; silly values are clamped.
    const fw = tankFromSpec(specFor('freshwater', 'amazon', undefined, { waterParams: { salinitySG: 1.02, ph: 2, gh: -4 } }));
    expect(fw.waterParams.salinitySG).toBe(1.0);
    expect(fw.waterParams.ph).toBe(4);
    expect(fw.waterParams.gh).toBe(0);
    const reefLow = tankFromSpec(specFor('marine', 'reef', undefined, { waterParams: { salinitySG: 1.005, ph: 6 } }));
    expect(reefLow.waterParams.salinitySG).toBeGreaterThanOrEqual(1.02);
    expect(reefLow.waterParams.ph).toBeGreaterThanOrEqual(7.3);
  });

  it('starts at the heater’s temperature, or the room’s when unheated', () => {
    const warm = tankFromSpec(specFor('freshwater', 'amazon', undefined, { equipment: { heater: { on: true, targetC: 28 } } }));
    expect(warm.waterParams.temperatureC).toBe(28);
    // Heaters only heat: a set-point below the room leaves the water at room temperature.
    const cool = tankFromSpec(specFor('freshwater', 'amazon', undefined, { equipment: { heater: { on: true, targetC: 19 } } }));
    expect(cool.waterParams.temperatureC).toBe(ROOM_TEMP_C);
    expect(heldTemperature(cool.equipment)).toBe(ROOM_TEMP_C);
    const goldfish = tankFromSpec(specFor('freshwater', 'goldfish'));
    expect(goldfish.equipment.heater.on).toBe(false);
    expect(goldfish.waterParams.temperatureC).toBe(ROOM_TEMP_C);
  });

  it('starts a fishless cycle with an immature filter', () => {
    const t = tankFromSpec(specFor('freshwater', 'amazon', undefined, { cycled: false }));
    expect(t.waterParams.bacteria).toBeLessThan(0.1);
    expect(tankFromSpec(specFor('freshwater', 'amazon')).waterParams.bacteria).toBeGreaterThanOrEqual(1);
  });

  it('sanitizes sizes, depths and hand-edited equipment', () => {
    const t = tankFromSpec(
      specFor('freshwater', 'empty', { widthCm: 5000, heightCm: 3, depthCm: Number.NaN }, {
        substrateDepthFrontCm: 50, substrateDepthBackCm: -2,
        equipment: { filter: { type: 'bogus' as 'sump', flowLph: Number.POSITIVE_INFINITY }, lights: { intensity: 7, onHour: -3 }, autoFeeder: { food: 'cake' as 'flakes' } },
      }),
    );
    expect(t.size).toEqual({ widthCm: SIZE_LIMITS.max.widthCm, heightCm: SIZE_LIMITS.min.heightCm, depthCm: SIZE_LIMITS.min.depthCm });
    expect(t.substrateDepthFrontCm).toBeLessThanOrEqual(t.size.heightCm * 0.4);
    expect(t.substrateDepthBackCm).toBe(0);
    expect(['canister', 'hang-on-back', 'sponge', 'internal', 'sump']).toContain(t.equipment.filter.type);
    expect(Number.isFinite(t.equipment.filter.flowLph)).toBe(true);
    expect(t.equipment.lights.intensity).toBe(1);
    expect(t.equipment.lights.onHour).toBe(0);
    expect(t.equipment.autoFeeder.food).toBe('flakes');
  });
});
