import type { EnvState } from '../core/types';
import type { World } from '../core/world';
import { tankBounds } from '../core/tankGeometry';

/**
 * Derive the per-frame environment (light schedule with sunrise/sunset ramps, moonlight,
 * light color from Kelvin, filter current, water tint/turbidity from tannins & cloudiness).
 *
 * OWNER: life-sim module. Placeholder: simple on/off schedule.
 */
export function computeEnv(world: World): EnvState {
  const t = world.tank;
  const hour = world.clock.hourOfDay();
  const l = t.equipment.lights;
  const on = !world.settings.dayNight || (hour >= l.onHour && hour < l.offHour);
  const b = tankBounds(t);
  const env = world.env;
  env.hour = hour;
  env.daylight = on ? l.intensity : 0;
  env.moonlight = !on && l.moonlight ? 0.25 : 0;
  env.roomLight = 0.2;
  env.isNight = !on;
  env.lightColor = [1, 1, 1];
  env.surfaceY = b.surfaceY;
  env.current = { dir: [1, 0, 0], speed: t.equipment.filter.on ? 0.06 : 0, origin: [-b.halfW + 0.05, b.surfaceY - 0.05, -b.halfD + 0.05] };
  env.waterTint = [0.85, 0.95, 0.95];
  env.turbidity = 0.15;
  return env;
}
