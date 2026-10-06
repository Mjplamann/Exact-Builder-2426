import type { EnvState, Equipment, TankState } from '../core/types';
import type { World } from '../core/world';
import { tankBounds } from '../core/tankGeometry';
import { clamp, clamp01, lerp, smoothstep } from './simMath';

/**
 * Derive the per-frame environment (light schedule with sunrise/sunset ramps, moonlight,
 * light color from Kelvin, filter current, water tint/turbidity from tannins & cloudiness).
 *
 * OWNER: life-sim module. Runs every frame: no allocations (writes into `world.env` in place).
 */

// ---------------------------------------------------------------------------------------------
// Local time without allocating a Date per call
// ---------------------------------------------------------------------------------------------

const MS_PER_HOUR = 3_600_000;
const MS_PER_DAY = 86_400_000;
let tzCheckedAt = Number.NaN;
let tzOffsetMs = 0;

/** Local wall-clock offset at `t` (ms to add to UTC), refreshed at most once per sim hour. */
function localOffset(t: number): number {
  if (!(Math.abs(t - tzCheckedAt) < MS_PER_HOUR)) {
    tzOffsetMs = -new Date(t).getTimezoneOffset() * 60_000;
    tzCheckedAt = t;
  }
  return tzOffsetMs;
}

/** Local hour of day 0..24 at epoch ms `t` (same as `SimClock.hourOfDay`, without a Date per call). */
export function localHour(t: number): number {
  const local = t + localOffset(t);
  return (((local % MS_PER_DAY) + MS_PER_DAY) % MS_PER_DAY) / MS_PER_HOUR;
}

/** Local "day-relative" milliseconds (monotonic: local epoch ms). */
export function localMs(t: number): number {
  return t + localOffset(t);
}

// ---------------------------------------------------------------------------------------------
// Light schedule
// ---------------------------------------------------------------------------------------------

/** Hours since `from` going forward around the clock (0..24). */
function hoursAfter(h: number, from: number): number {
  return (((h - from) % 24) + 24) % 24;
}

/** Photoperiod length (h) from on to off, wrapping past midnight. */
export function photoperiodHours(l: Equipment['lights']): number {
  const p = hoursAfter(l.offHour, l.onHour);
  return p === 0 && l.offHour !== l.onHour ? 24 : p;
}

/**
 * Main light level 0..1 (before intensity) at local hour `h`: smoothstep sunrise ramp starting at
 * `onHour`, full light, then a sunset ramp that ends at `offHour`.
 */
export function lightScheduleLevel(l: Equipment['lights'], h: number): number {
  const period = photoperiodHours(l);
  if (period <= 0) return 0;
  const since = hoursAfter(h, l.onHour);
  if (since >= period) return 0;
  const ramp = clamp(l.rampMinutes / 60, 0.001, period / 2);
  const up = smoothstep(0, ramp, since);
  const down = smoothstep(0, ramp, period - since);
  return Math.min(up, down);
}

/**
 * Daily light dose relative to a reference planted-tank photoperiod (10 h at full output):
 * intensity × effective full-light hours / 10. Ramps count half.
 */
export function dailyLightDose(l: Equipment['lights']): number {
  const period = photoperiodHours(l);
  const ramp = Math.min(l.rampMinutes / 60, period / 2);
  return (clamp01(l.intensity) * Math.max(0, period - ramp)) / 10;
}

// ---------------------------------------------------------------------------------------------
// Moon
// ---------------------------------------------------------------------------------------------

/** Fraction of the lunar disc illuminated (0 new → 1 full) at epoch ms `t`. */
export function lunarIllumination(t: number): number {
  const SYNODIC = 29.530588853;
  const jd = t / MS_PER_DAY + 2440587.5;
  const phase = (((jd - 2451550.1) / SYNODIC) % 1 + 1) % 1; // 0 = new moon (6 Jan 2000 18:14 UTC)
  return (1 - Math.cos(2 * Math.PI * phase)) / 2;
}

// ---------------------------------------------------------------------------------------------
// Blackbody color
// ---------------------------------------------------------------------------------------------

/** Piecewise Gaussian used by the Wyman–Sloan–Shirley (2013) CIE 1931 fit. */
function g(x: number, mu: number, s1: number, s2: number): number {
  const t = (x - mu) / (x < mu ? s1 : s2);
  return Math.exp(-0.5 * t * t);
}

/** Planck spectrum ∫ against the CIE 1931 2° observer (Wyman et al. multi-lobe fit) → linear sRGB. */
function blackbodyLinearRgb(kelvin: number, out: Float64Array, o: number): void {
  let X = 0, Y = 0, Z = 0;
  const c2 = 1.4387769e-2; // m·K
  for (let nm = 380; nm <= 780; nm += 5) {
    const lm = nm * 1e-9;
    const b = 1 / (lm ** 5 * (Math.exp(c2 / (lm * kelvin)) - 1));
    const xb = 1.056 * g(nm, 599.8, 37.9, 31.0) + 0.362 * g(nm, 442.0, 16.0, 26.7) - 0.065 * g(nm, 501.1, 20.4, 26.2);
    const yb = 0.821 * g(nm, 568.8, 46.9, 40.5) + 0.286 * g(nm, 530.9, 16.3, 31.1);
    const zb = 1.217 * g(nm, 437.0, 11.8, 36.0) + 0.681 * g(nm, 459.0, 26.0, 13.8);
    X += b * xb;
    Y += b * yb;
    Z += b * zb;
  }
  // XYZ → linear sRGB (D65).
  out[o] = 3.2406 * X - 1.5372 * Y - 0.4986 * Z;
  out[o + 1] = -0.9689 * X + 1.8758 * Y + 0.0415 * Z;
  out[o + 2] = 0.0557 * X - 0.204 * Y + 1.057 * Z;
}

const K_MIN = 1000;
const K_MAX = 40000;
const K_STEP = 50;
const K_COUNT = (K_MAX - K_MIN) / K_STEP + 1;
/** Lazily-filled table of white-balanced colors (rgb per 50 K). NaN = not yet computed. */
const kTable = new Float64Array(K_COUNT * 3).fill(Number.NaN);
const white = new Float64Array(3);
let whiteReady = false;

function tableEntry(i: number): number {
  const o = i * 3;
  if (Number.isNaN(kTable[o])) {
    if (!whiteReady) {
      blackbodyLinearRgb(6500, white, 0);
      whiteReady = true;
    }
    blackbodyLinearRgb(K_MIN + i * K_STEP, kTable, o);
    // White-balance so a 6500 K lamp renders neutral, then normalize to the brightest channel.
    let m = 0;
    for (let c = 0; c < 3; c++) {
      kTable[o + c] = Math.max(0, kTable[o + c] / white[c]);
      m = Math.max(m, kTable[o + c]);
    }
    for (let c = 0; c < 3; c++) kTable[o + c] /= m || 1;
  }
  return o;
}

/**
 * Linear-RGB color of a blackbody lamp at `kelvin`, white-balanced to 6500 K (→ [1,1,1]) and
 * normalized so the brightest channel is 1. 2700 K ≈ warm orange-white, 14000 K ≈ reef blue.
 * Writes into `out` (no allocation).
 */
export function kelvinToLinearRgb(kelvin: number, out: [number, number, number] | Float64Array): void {
  const k = clamp(kelvin, K_MIN, K_MAX - 1);
  const f = (k - K_MIN) / K_STEP;
  const i = Math.floor(f);
  const t = f - i;
  const a = tableEntry(i);
  const b = tableEntry(Math.min(K_COUNT - 1, i + 1));
  out[0] = kTable[a] + (kTable[b] - kTable[a]) * t;
  out[1] = kTable[a + 1] + (kTable[b + 1] - kTable[a + 1]) * t;
  out[2] = kTable[a + 2] + (kTable[b + 2] - kTable[a + 2]) * t;
}

// ---------------------------------------------------------------------------------------------
// Room light (real local time)
// ---------------------------------------------------------------------------------------------

let roomCheckedReal = -Infinity;
let roomHour = 12;

/** Ambient light of the viewer's room from the *real* local hour: daylight, evening lamps, night. */
export function roomLightAtHour(h: number): number {
  const day = smoothstep(6, 8.5, h) * (1 - smoothstep(17.5, 20, h));
  const lamps = smoothstep(17, 19, h) * (1 - smoothstep(22.5, 24, h));
  return 0.03 + 0.32 * day + 0.12 * lamps;
}

// ---------------------------------------------------------------------------------------------
// Water current & optics
// ---------------------------------------------------------------------------------------------

/** Relative jet strength of each filter's return. */
const FILTER_JET: Record<Equipment['filter']['type'], number> = {
  sponge: 0.35,
  internal: 0.8,
  'hang-on-back': 0.85,
  canister: 1,
  sump: 1.15,
};

/** Net-volume turnover per hour for the current filter. */
export function filterTurnover(tank: Pick<TankState, 'size' | 'equipment'>): number {
  const liters = (tank.size.widthCm * tank.size.depthCm * tank.size.heightCm) / 1000;
  return tank.equipment.filter.flowLph / Math.max(1, liters);
}

/** Sunrise/sunset color: the lamp starts at a warm 2300 K and warms up to its rated color (mired-space blend). */
const RAMP_KELVIN = 2300;

/**
 * Compute the environment for the current frame. Writes into and returns `world.env`.
 */
export function computeEnv(world: World): EnvState {
  const t = world.tank;
  const env = world.env;
  const l = t.equipment.lights;
  const simTime = world.clock.simTime;
  const hour = localHour(simTime);
  const b = tankBounds(t);
  const marine = t.water === 'marine';
  const wp = t.waterParams;

  // --- light schedule -------------------------------------------------------------------------
  const intensity = clamp01(l.intensity);
  const level = world.settings.dayNight ? lightScheduleLevel(l, hour) : 1;
  env.hour = hour;
  env.daylight = intensity * level;
  env.isNight = level < 0.02;
  if (l.moonlight && world.settings.dayNight) {
    // Blue moonlight LEDs fade in as the main light dims; a controller following the lunar
    // cycle (as many do) brightens them a little toward full moon.
    env.moonlight = (1 - smoothstep(0, 0.5, level)) * (0.7 + 0.3 * lunarIllumination(simTime));
  } else {
    env.moonlight = 0;
  }

  // Color: rated Kelvin at full output; during the ramps a warm sunrise/sunset hue (mired blend).
  const rated = clamp(l.colorTempK || 6500, 1500, 30000);
  // Deep orange only while dim; already a warm white at half output.
  const warmth = world.settings.dayNight ? Math.pow(1 - smoothstep(0.05, 0.9, level), 1.5) : 0;
  const mired = lerp(1e6 / rated, 1e6 / RAMP_KELVIN, warmth);
  kelvinToLinearRgb(1e6 / mired, env.lightColor);

  // Room light follows the viewer's real clock (sampled every few seconds).
  const real = world.clock.realSeconds;
  if (real - roomCheckedReal > 5 || real < roomCheckedReal) {
    const d = new Date();
    roomHour = d.getHours() + d.getMinutes() / 60;
    roomCheckedReal = real;
  }
  env.roomLight = roomLightAtHour(roomHour);
  env.surfaceY = b.surfaceY;

  // --- filter current -------------------------------------------------------------------------
  // Outlet near the back top-left corner; the jet runs along the long axis and bends slightly
  // toward the front glass. Bulk speed in tank-scale circulation is 2–15 cm/s: it grows with
  // turnover (√, jet entrainment) and the return type (a sponge filter barely stirs).
  const f = t.equipment.filter;
  const cur = env.current;
  cur.origin[0] = -b.halfW + Math.min(0.06, b.halfW * 0.2);
  cur.origin[1] = b.surfaceY - Math.min(0.06, b.surfaceY * 0.15);
  cur.origin[2] = -b.halfD + Math.min(0.05, b.halfD * 0.3);
  const dx = 1, dz = 0.18;
  const inv = 1 / Math.hypot(dx, dz);
  cur.dir[0] = dx * inv;
  cur.dir[1] = 0;
  cur.dir[2] = dz * inv;
  if (f.on && f.flowLph > 0) {
    const turnover = filterTurnover(t);
    cur.speed = clamp(0.015 + 0.055 * Math.sqrt(turnover / 5) * FILTER_JET[f.type], 0.02, 0.15);
  } else {
    // Only convection and airstones stir the water.
    let air = false;
    for (let i = 0; i < t.decor.length; i++) if (t.decor[i].kind === 'airstone') air = true;
    cur.speed = air ? 0.01 : 0.003;
  }

  // --- water tint & turbidity -----------------------------------------------------------------
  // Clear freshwater has a faint green cast, reef water reads bluer; tannins add amber (humic
  // acids absorb blue strongly), suspended bacteria/particles add a milky veil.
  const tan = clamp01(wp.tannins);
  const cloud = clamp01(wp.cloudiness);
  let r = marine ? 0.8 : t.water === 'brackish' ? 0.83 : 0.84;
  let gg = marine ? 0.94 : 0.95;
  let bb = marine ? 1.0 : t.water === 'brackish' ? 0.93 : 0.91;
  r *= 1 - 0.08 * tan;
  gg *= 1 - 0.3 * tan;
  bb *= 1 - 0.62 * tan;
  const milk = 0.65 * cloud;
  env.waterTint[0] = lerp(r, 0.9, milk);
  env.waterTint[1] = lerp(gg, 0.9, milk);
  env.waterTint[2] = lerp(bb, 0.86, milk);
  // Clear tank ≈ 0.1–0.2 /m (marine reef water clearer still); haze and tea-colored water are
  // both strongly scattering/absorbing.
  env.turbidity = (marine ? 0.09 : 0.13) + 1.6 * cloud * cloud + 0.9 * cloud + 0.35 * tan;
  return env;
}
