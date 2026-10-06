import { describe, expect, it } from 'vitest';
import { DEFAULT_SETTINGS } from '../../src/core/world';
import { exportTank, importTank, loadSettings, loadTank, sanitizeSettings, saveTank } from '../../src/sim/persistence';
import { newTank } from '../../src/sim/tankFactory';
import { makeTank, stock } from './helpers';

describe('persistence', () => {
  it('round-trips a living tank through export/import', () => {
    const t = makeTank({});
    stock(t, 'paracheirodon-innesi', 5);
    t.world.tank.fish[0].name = 'Pip';
    t.world.tank.decor.push({ id: 'd1', kind: 'rock', variant: 'seiryu', seed: 7, position: [0.1, 0.02, -0.05], rotation: [0, 1, 0], scale: 1.2 });
    t.world.tank.journal.push({ at: 1, kind: 'info', text: 'Hello' });
    const back = importTank(exportTank(t.world.tank));
    expect(JSON.parse(JSON.stringify(back))).toEqual(JSON.parse(JSON.stringify(t.world.tank)));
  });

  it('rejects malformed input with friendly errors', () => {
    expect(() => importTank('')).toThrow(/empty/);
    expect(() => importTank('{nope')).toThrow(/JSON/);
    expect(() => importTank('[]')).toThrow(/Not an aquarium save/);
    expect(() => importTank(JSON.stringify({ version: 1, fish: [] }))).toThrow(/size/);
    expect(() => importTank(JSON.stringify({ version: 1, size: { widthCm: 60, heightCm: 30, depthCm: 30 } }))).toThrow(/animals/);
    expect(() => importTank(JSON.stringify({ version: 1, size: { widthCm: 'x', heightCm: 30, depthCm: 30 }, fish: [] }))).toThrow(/size/);
    expect(() => importTank(JSON.stringify({ ...newTank({ size: { widthCm: 60, heightCm: 30, depthCm: 30 }, water: 'freshwater' }), version: 99 }))).toThrow(/newer/);
  });

  it('migrates unversioned saves and repairs bad fields', () => {
    const raw = {
      size: { widthCm: 60, heightCm: 36, depthCm: 30 },
      water: 'freshwater',
      fish: [
        { id: 'a', speciesId: 'paracheirodon-innesi', lengthCm: 2.5, health: 7, hunger: -1, sex: 'robot' },
        { id: 'b', speciesId: 'x' }, // no length → dropped
        { id: 'a', speciesId: 'paracheirodon-innesi', lengthCm: 3 }, // duplicate id → dropped
        'garbage',
      ],
      plants: [{ id: 'p', speciesId: 'rotala', position: [0, 0, 0], growth: 5 }, { id: 'q', speciesId: 'rotala' }],
      decor: [{ id: 'd', kind: 'volcano', position: [0, 0, 0] }, { id: 'e', kind: 'rock', variant: 'lava', position: [0, 0, 0] }],
      waterParams: { ph: 'acid', nitrate: 40 },
      equipment: { lights: { onHour: 30 }, autoFeeder: { food: 'pizza', hours: [9, 'x', 30] } },
      journal: [{ at: 5, kind: 'nope', text: 'kept' }, { kind: 'info' }],
    };
    const t = importTank(JSON.stringify(raw));
    expect(t.version).toBe(1);
    expect(t.fish).toHaveLength(1);
    expect(t.fish[0].health).toBe(1);
    expect(t.fish[0].hunger).toBe(0);
    expect(t.fish[0].sex).toBe('unknown');
    expect(t.plants).toHaveLength(1);
    expect(t.plants[0].growth).toBe(1);
    expect(t.decor.map((d) => d.id)).toEqual(['e']);
    expect(t.waterParams.ph).toBe(6.9);
    expect(t.waterParams.nitrate).toBe(40);
    expect(t.equipment.lights.onHour).toBe(24);
    expect(t.equipment.autoFeeder.food).toBe('flakes');
    expect(t.equipment.autoFeeder.hours).toEqual([9]);
    expect(t.journal).toEqual([{ at: 5, kind: 'info', text: 'kept' }]);
  });

  it('works without localStorage', () => {
    expect(saveTank(newTank({ size: { widthCm: 60, heightCm: 30, depthCm: 30 }, water: 'freshwater' }))).toBe(false);
    expect(loadTank()).toBeNull();
    expect(loadSettings()).toEqual(DEFAULT_SETTINGS);
  });

  it('settings are validated against the defaults', () => {
    const s = sanitizeSettings({ quality: 'insane', careMode: 'zen', volume: 7, sound: 'yes', dayNight: false, extra: 1 });
    expect(s.quality).toBe(DEFAULT_SETTINGS.quality);
    expect(s.careMode).toBe('zen');
    expect(s.volume).toBe(1);
    expect(s.sound).toBe(DEFAULT_SETTINGS.sound);
    expect(s.dayNight).toBe(false);
    expect((s as unknown as Record<string, unknown>).extra).toBeUndefined();
    expect(sanitizeSettings(null)).toEqual(DEFAULT_SETTINGS);
  });
});
