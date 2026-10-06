import { describe, expect, it } from 'vitest';
import {
  computeEnv,
  dailyLightDose,
  kelvinToLinearRgb,
  lightScheduleLevel,
  localHour,
  lunarIllumination,
  photoperiodHours,
} from '../../src/sim/environment';
import { makeTank } from './helpers';

function at(t: ReturnType<typeof makeTank>, hour: number) {
  const d = new Date(t.world.clock.simTime);
  d.setHours(Math.floor(hour), Math.round((hour % 1) * 60), 0, 0);
  t.world.clock.simTime = d.getTime();
  return computeEnv(t.world);
}

describe('environment', () => {
  it('local hour matches the clock', () => {
    const t = makeTank({});
    for (const h of [0, 3.5, 9.25, 13, 21.75]) {
      at(t, h);
      expect(localHour(t.world.clock.simTime)).toBeCloseTo(t.world.clock.hourOfDay(), 6);
    }
  });

  it('lights follow the schedule with smooth sunrise and sunset ramps', () => {
    const l = { onHour: 9, offHour: 21, intensity: 0.8, colorTempK: 6500, moonlight: true, rampMinutes: 60 };
    expect(lightScheduleLevel(l, 8.9)).toBe(0);
    expect(lightScheduleLevel(l, 9.5)).toBeCloseTo(0.5, 5);
    expect(lightScheduleLevel(l, 13)).toBe(1);
    expect(lightScheduleLevel(l, 20.5)).toBeCloseTo(0.5, 5);
    expect(lightScheduleLevel(l, 22)).toBe(0);
    // Wrapping past midnight.
    const night = { ...l, onHour: 20, offHour: 4 };
    expect(lightScheduleLevel(night, 23)).toBe(1);
    expect(lightScheduleLevel(night, 12)).toBe(0);
    expect(photoperiodHours(night)).toBe(8);
    expect(dailyLightDose(l)).toBeCloseTo((0.8 * 11) / 10, 5);
  });

  it('daylight, moonlight and night state', () => {
    const t = makeTank({});
    const noon = at(t, 13);
    expect(noon.daylight).toBeCloseTo(t.world.tank.equipment.lights.intensity, 5);
    expect(noon.isNight).toBe(false);
    expect(noon.moonlight).toBe(0);
    const night = at(t, 1);
    expect(night.daylight).toBe(0);
    expect(night.isNight).toBe(true);
    expect(night.moonlight).toBeGreaterThan(0.5);
    t.world.settings.dayNight = false;
    const pinned = at(t, 1);
    expect(pinned.daylight).toBeCloseTo(t.world.tank.equipment.lights.intensity, 5);
    expect(pinned.isNight).toBe(false);
  });

  it('blackbody color: 6500 K neutral, reef lamps blue, sunrise warm', () => {
    const c: [number, number, number] = [0, 0, 0];
    kelvinToLinearRgb(6500, c);
    for (const v of c) expect(v).toBeCloseTo(1, 2);
    kelvinToLinearRgb(14000, c);
    expect(c[2]).toBe(1);
    expect(c[0]).toBeLessThan(0.6);
    kelvinToLinearRgb(2300, c);
    expect(c[0]).toBe(1);
    expect(c[2]).toBeLessThan(0.1);
    const t = makeTank({});
    const sunrise = at(t, 9.2);
    expect(sunrise.lightColor[0]).toBeGreaterThan(sunrise.lightColor[2] * 1.5);
    const midday = at(t, 13);
    expect(midday.lightColor[2]).toBeGreaterThan(0.85);
  });

  it('filter current and water optics', () => {
    const t = makeTank({});
    const env = at(t, 13);
    expect(env.current.speed).toBeGreaterThanOrEqual(0.02);
    expect(env.current.speed).toBeLessThanOrEqual(0.15);
    expect(Math.hypot(...env.current.dir)).toBeCloseTo(1, 6);
    expect(env.current.origin[2]).toBeLessThan(0); // near the back glass
    expect(env.turbidity).toBeGreaterThan(0.08);
    expect(env.turbidity).toBeLessThan(0.25);
    const clearBlue = env.waterTint[2];
    t.world.tank.waterParams.tannins = 0.6;
    t.world.tank.waterParams.cloudiness = 0.5;
    const tea = computeEnv(t.world);
    expect(tea.waterTint[2]).toBeLessThan(clearBlue * 0.8);
    expect(tea.waterTint[0]).toBeGreaterThan(tea.waterTint[2]);
    expect(tea.turbidity).toBeGreaterThan(0.8);
    t.world.tank.equipment.filter.on = false;
    expect(computeEnv(t.world).current.speed).toBeLessThan(0.01);
  });

  it('lunar phase', () => {
    expect(lunarIllumination(Date.UTC(2000, 0, 6, 18, 14))).toBeLessThan(0.01); // new moon
    expect(lunarIllumination(Date.UTC(2000, 0, 21, 4, 40))).toBeGreaterThan(0.99); // full moon
  });
});
