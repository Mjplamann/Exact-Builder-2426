import type { TankState, WaterParams } from '../core/types';
import type { World } from '../core/world';
import { MS_PER_DAY } from '../core/clock';
import { MS_PER_MONTH, asymptoticLength } from './biology';
import { defaultEquipment, defaultWaterParams } from './tankFactory';
import { clamp, clamp01 } from './simMath';
import { waterLiters } from '../core/tankGeometry';

/**
 * Cheap self-repair for state the simulation reads every step. Saves are sanitized on load, but
 * equipment and water can also be changed at run time (sliders, a hand-merged patch, a future UI
 * bug); a single NaN there would otherwise spread through every water parameter and be saved as
 * `null`. Runs once per `update`/`catchUp` call — a couple of dozen comparisons.
 */
export function repairTankInputs(tank: TankState): void {
  const e = tank.equipment;
  let def: ReturnType<typeof defaultEquipment> | null = null;
  const d = () => (def ??= defaultEquipment(tank.water, waterLiters(tank)));
  if (!Number.isFinite(e.heater.targetC)) e.heater.targetC = d().heater.targetC;
  const l = e.lights;
  if (!Number.isFinite(l.onHour)) l.onHour = d().lights.onHour;
  if (!Number.isFinite(l.offHour)) l.offHour = d().lights.offHour;
  if (!Number.isFinite(l.intensity)) l.intensity = d().lights.intensity;
  if (!Number.isFinite(l.rampMinutes) || l.rampMinutes < 0) l.rampMinutes = d().lights.rampMinutes;
  if (!Number.isFinite(l.colorTempK) || l.colorTempK <= 0) l.colorTempK = d().lights.colorTempK;
  if (!Number.isFinite(e.filter.flowLph) || e.filter.flowLph < 0) e.filter.flowLph = d().filter.flowLph;
  const af = e.autoFeeder;
  if (!Number.isFinite(af.pinches) || af.pinches < 0) af.pinches = 0;
  if (!Array.isArray(af.hours)) af.hours = [];

  const wp = tank.waterParams;
  let wdef: WaterParams | null = null;
  for (const k of WATER_KEYS) {
    if (!Number.isFinite(wp[k])) {
      wdef ??= defaultWaterParams(tank.water, tank.simTime);
      wp[k] = k === 'temperatureC' ? e.heater.targetC : wdef[k];
    }
  }
}

const WATER_KEYS = [
  'temperatureC', 'ph', 'ammonia', 'nitrite', 'nitrate', 'salinitySG', 'gh', 'kh', 'bacteria', 'glassAlgae',
  'surfaceAlgae', 'tannins', 'cloudiness', 'oxygen', 'lastWaterChange',
] as const satisfies readonly (keyof WaterParams)[];

/**
 * Bring loaded animals back within biology: a hand-edited or corrupted save can claim a 4 m
 * cardinal tetra (whose appetite and waste would poison the tank in a day), a birth date in the
 * future, or a pregnancy that began years ago.
 */
export function repairFishStates(world: World, now: number): void {
  for (const f of world.fish) {
    const s = f.state;
    const sp = f.species;
    s.sizeFactor = clamp(Number.isFinite(s.sizeFactor) ? s.sizeFactor : 1, 0.6, 1.4);
    const linf = asymptoticLength(sp, s);
    const lo = Math.max(0.05, sp.birthLengthCm * 0.5);
    s.lengthCm = clamp(Number.isFinite(s.lengthCm) ? s.lengthCm : lo, lo, Math.max(lo, linf * 1.2));
    if (!(s.bornAt <= now)) s.bornAt = now;
    if (!(s.addedAt <= now)) s.addedAt = now;
    s.hunger = clamp01(s.hunger);
    s.health = Number.isFinite(s.health) ? clamp01(s.health) : 1;
    s.stress = clamp01(s.stress);
    s.stomach = clamp01(s.stomach);
    if (s.gravidSince !== undefined && !(s.gravidSince <= now && now - s.gravidSince < 4 * MS_PER_MONTH)) s.gravidSince = undefined;
    if (s.lastSpawnAt !== undefined && !(s.lastSpawnAt <= now + MS_PER_DAY)) s.lastSpawnAt = undefined;
  }
}
