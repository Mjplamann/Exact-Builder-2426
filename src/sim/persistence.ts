import type {
  BackgroundKind,
  DecorItem,
  DecorKind,
  Equipment,
  FishState,
  FoodKind,
  JournalEntry,
  PlantInstance,
  Settings,
  SubstrateKind,
  TankState,
  WaterParams,
  WaterType,
} from '../core/types';
import { DEFAULT_SETTINGS } from '../core/world';
import { hashString } from '../core/rng';
import { FOODS } from '../data/foods';
import { defaultEquipment, defaultWaterParams } from './tankFactory';
import { canonicalFishState } from './fishState';

/**
 * Save/load the tank and settings (localStorage), and JSON export/import with migration.
 * Every storage access is guarded: storage can be unavailable (private mode, sandboxed frames),
 * full, or hold a save from an older/newer version or a hand-edited file.
 *
 * OWNER: life-sim module.
 */
const TANK_KEY = 'aquarium.tank.v1';
const SETTINGS_KEY = 'aquarium.settings.v1';
/** Current save format. Bump and add a migration when `TankState` changes shape. */
export const SAVE_VERSION = 1;
/** localStorage is ~5 MB per origin (UTF-16 → ~2.5M chars to be safe across browsers). */
const MAX_SAVE_CHARS = 2_400_000;
/** Imports larger than this are rejected outright. */
const MAX_IMPORT_CHARS = 20_000_000;
const JOURNAL_MAX = 500;

function storage(): Storage | null {
  try {
    return typeof localStorage !== 'undefined' ? localStorage : null;
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------------------------
// Tank
// ---------------------------------------------------------------------------------------------

/**
 * Save the tank. If the serialized tank is too large (a very long journal) the journal is
 * trimmed; if storage is full or unavailable this returns false and nothing is thrown.
 */
export function saveTank(tank: TankState): boolean {
  const st = storage();
  if (!st) return false;
  try {
    tank.lastSavedReal = Date.now();
    let json = JSON.stringify(tank);
    if (json.length > MAX_SAVE_CHARS && tank.journal.length > 100) {
      tank.journal.splice(0, tank.journal.length - 100);
      json = JSON.stringify(tank);
    }
    if (json.length > MAX_SAVE_CHARS) return false;
    st.setItem(TANK_KEY, json);
    return true;
  } catch {
    return false;
  }
}

export function loadTank(): TankState | null {
  try {
    const raw = storage()?.getItem(TANK_KEY);
    return raw ? importTank(raw) : null;
  } catch (err) {
    console.warn('[persistence] saved tank could not be loaded — starting fresh', err);
    return null;
  }
}

export function clearTank(): void {
  try {
    storage()?.removeItem(TANK_KEY);
  } catch {
    /* ignore */
  }
}

export function exportTank(tank: TankState): string {
  return JSON.stringify(tank, null, 1);
}

/** Parse + migrate + sanity-check a saved tank. Throws a friendly Error on invalid input. */
export function importTank(json: string): TankState {
  if (typeof json !== 'string' || json.length === 0) throw new Error('The file is empty.');
  if (json.length > MAX_IMPORT_CHARS) throw new Error('The file is too large to be an aquarium save.');
  let raw: unknown;
  try {
    raw = JSON.parse(json);
  } catch {
    throw new Error('The file is not valid JSON.');
  }
  return sanitizeTank(migrateTank(raw));
}

// ---------------------------------------------------------------------------------------------
// Migration
// ---------------------------------------------------------------------------------------------

type Raw = Record<string, unknown>;

/**
 * Migration hook: upgrade any older save to the current format, step by step. Saves without a
 * version predate versioning and are treated as v0 (same shape as v1 minus newer fields, which
 * sanitizing fills in).
 */
const MIGRATIONS: Record<number, (t: Raw) => Raw> = {
  0: (t) => ({ ...t, version: 1 }),
};

export function migrateTank(raw: unknown): Raw {
  if (!isObj(raw)) throw new Error('Not an aquarium save.');
  let t = raw as Raw;
  let v = typeof t.version === 'number' ? t.version : 0;
  if (v > SAVE_VERSION) throw new Error('This save comes from a newer version of the aquarium.');
  while (v < SAVE_VERSION) {
    const m = MIGRATIONS[v];
    if (!m) throw new Error(`Cannot upgrade a version ${v} save.`);
    t = m(t);
    v = typeof t.version === 'number' ? t.version : v + 1;
  }
  return t;
}

// ---------------------------------------------------------------------------------------------
// Validation / sanitizing
// ---------------------------------------------------------------------------------------------

const WATER_TYPES: WaterType[] = ['freshwater', 'brackish', 'marine'];
const SUBSTRATES: SubstrateKind[] = [
  'white-sand', 'beige-sand', 'black-sand', 'river-sand', 'fine-gravel', 'pea-gravel', 'aqua-soil', 'black-gravel',
  'crushed-coral', 'aragonite', 'bare',
];
const BACKGROUNDS: BackgroundKind[] = ['black', 'deep-blue', 'frosted', 'gradient-blue', 'dark-green', 'clear'];
const DECOR_KINDS: DecorKind[] = ['rock', 'driftwood', 'cave', 'pebbles', 'leaf-litter', 'shell', 'airstone', 'coral-skeleton'];
const JOURNAL_KINDS: JournalEntry['kind'][] = ['added', 'removed', 'born', 'died', 'milestone', 'care', 'info', 'warning'];
const FILTERS: Equipment['filter']['type'][] = ['canister', 'hang-on-back', 'sponge', 'internal', 'sump'];

function isObj(v: unknown): v is Raw {
  return !!v && typeof v === 'object' && !Array.isArray(v);
}
function num(v: unknown, def: number, min = -Infinity, max = Infinity): number {
  return typeof v === 'number' && Number.isFinite(v) ? Math.min(max, Math.max(min, v)) : def;
}
function str(v: unknown, def: string, maxLen = 200): string {
  return typeof v === 'string' && v.length > 0 ? v.slice(0, maxLen) : def;
}
function oneOf<T extends string>(v: unknown, allowed: readonly T[], def: T): T {
  return typeof v === 'string' && (allowed as readonly string[]).includes(v) ? (v as T) : def;
}
function vec3(v: unknown): [number, number, number] | null {
  if (!Array.isArray(v) || v.length !== 3) return null;
  const out = v.map((x) => (typeof x === 'number' && Number.isFinite(x) ? x : NaN));
  return out.some(Number.isNaN) ? null : (out as [number, number, number]);
}

/**
 * Turn anything that claims to be a tank into a valid `TankState`: structural problems that make
 * the tank meaningless (no size, no fish list) throw; individual bad entries are dropped and
 * missing/odd values fall back to sensible defaults and plausible ranges.
 */
export function sanitizeTank(t: Raw): TankState {
  if (!isObj(t.size)) throw new Error('Not an aquarium save (missing tank size).');
  const sz = t.size as Raw;
  const size = {
    widthCm: num(sz.widthCm, NaN, 15, 600),
    heightCm: num(sz.heightCm, NaN, 15, 300),
    depthCm: num(sz.depthCm, NaN, 15, 300),
  };
  if (!Number.isFinite(size.widthCm) || !Number.isFinite(size.heightCm) || !Number.isFinite(size.depthCm))
    throw new Error('Not an aquarium save (invalid tank size).');
  if (!Array.isArray(t.fish)) throw new Error('Not an aquarium save (missing animals).');

  const now = Date.now();
  const water = oneOf(t.water, WATER_TYPES, 'freshwater');
  const simTime = num(t.simTime, now, 0, 8.64e15);
  const liters = (size.widthCm * size.heightCm * size.depthCm) / 1000;

  // Water parameters.
  const wpDef = defaultWaterParams(water, simTime);
  const wpRaw = isObj(t.waterParams) ? t.waterParams : {};
  const waterParams: WaterParams = {
    temperatureC: num(wpRaw.temperatureC, wpDef.temperatureC, 0, 40),
    ph: num(wpRaw.ph, wpDef.ph, 3, 10.5),
    ammonia: num(wpRaw.ammonia, 0, 0, 50),
    nitrite: num(wpRaw.nitrite, 0, 0, 50),
    nitrate: num(wpRaw.nitrate, wpDef.nitrate, 0, 1000),
    salinitySG: num(wpRaw.salinitySG, wpDef.salinitySG, 0.995, 1.04),
    gh: num(wpRaw.gh, wpDef.gh, 0, 40),
    kh: num(wpRaw.kh, wpDef.kh, 0, 30),
    bacteria: num(wpRaw.bacteria, wpDef.bacteria, 0, 3),
    glassAlgae: num(wpRaw.glassAlgae, 0, 0, 1),
    surfaceAlgae: num(wpRaw.surfaceAlgae, wpDef.surfaceAlgae, 0, 1),
    tannins: num(wpRaw.tannins, 0, 0, 1),
    cloudiness: num(wpRaw.cloudiness, 0, 0, 1),
    oxygen: num(wpRaw.oxygen, wpDef.oxygen, 0, 1.2),
    lastWaterChange: num(wpRaw.lastWaterChange, simTime, 0, 8.64e15),
  };

  // Equipment.
  const eqDef = defaultEquipment(water, liters);
  const eqRaw = isObj(t.equipment) ? t.equipment : {};
  const fRaw = isObj(eqRaw.filter) ? eqRaw.filter : {};
  const hRaw = isObj(eqRaw.heater) ? eqRaw.heater : {};
  const lRaw = isObj(eqRaw.lights) ? eqRaw.lights : {};
  const aRaw = isObj(eqRaw.autoFeeder) ? eqRaw.autoFeeder : {};
  const foodKinds = Object.keys(FOODS) as FoodKind[];
  const equipment: Equipment = {
    filter: {
      type: oneOf(fRaw.type, FILTERS, eqDef.filter.type),
      flowLph: num(fRaw.flowLph, eqDef.filter.flowLph, 0, 100_000),
      on: typeof fRaw.on === 'boolean' ? fRaw.on : true,
    },
    heater: {
      on: typeof hRaw.on === 'boolean' ? hRaw.on : eqDef.heater.on,
      targetC: num(hRaw.targetC, eqDef.heater.targetC, 10, 34),
    },
    lights: {
      onHour: num(lRaw.onHour, eqDef.lights.onHour, 0, 24),
      offHour: num(lRaw.offHour, eqDef.lights.offHour, 0, 24),
      intensity: num(lRaw.intensity, eqDef.lights.intensity, 0, 1),
      colorTempK: num(lRaw.colorTempK, eqDef.lights.colorTempK, 1500, 30000),
      moonlight: typeof lRaw.moonlight === 'boolean' ? lRaw.moonlight : eqDef.lights.moonlight,
      rampMinutes: num(lRaw.rampMinutes, eqDef.lights.rampMinutes, 0, 240),
    },
    co2: typeof eqRaw.co2 === 'boolean' ? eqRaw.co2 : false,
    autoFeeder: {
      enabled: typeof aRaw.enabled === 'boolean' ? aRaw.enabled : false,
      food: oneOf(aRaw.food, foodKinds, eqDef.autoFeeder.food),
      hours: Array.isArray(aRaw.hours)
        ? aRaw.hours.filter((h): h is number => typeof h === 'number' && Number.isFinite(h) && h >= 0 && h < 24).slice(0, 8)
        : eqDef.autoFeeder.hours,
      pinches: num(aRaw.pinches, eqDef.autoFeeder.pinches, 0, 20),
    },
  };

  // Fish.
  const seenIds = new Set<string>();
  const fish: FishState[] = [];
  for (const r of t.fish as unknown[]) {
    const f = sanitizeFish(r, simTime);
    if (!f || seenIds.has(f.id)) continue;
    seenIds.add(f.id);
    fish.push(f);
  }

  // Plants.
  const plants: PlantInstance[] = [];
  const plantIds = new Set<string>();
  for (const r of Array.isArray(t.plants) ? t.plants : []) {
    if (!isObj(r) || typeof r.id !== 'string' || typeof r.speciesId !== 'string') continue;
    const pos = vec3(r.position);
    if (!pos || plantIds.has(r.id)) continue;
    plantIds.add(r.id);
    const p: PlantInstance = {
      id: r.id,
      speciesId: r.speciesId,
      seed: num(r.seed, hashString(r.id), 0, 2 ** 32) >>> 0,
      position: pos,
      rotationY: num(r.rotationY, 0),
      growth: num(r.growth, 0.5, 0.03, 1),
      plantedAt: num(r.plantedAt, simTime),
      health: num(r.health, 1, 0, 1),
    };
    if (typeof r.attachedTo === 'string') p.attachedTo = r.attachedTo;
    plants.push(p);
  }

  // Decor.
  const decor: DecorItem[] = [];
  const decorIds = new Set<string>();
  for (const r of Array.isArray(t.decor) ? t.decor : []) {
    if (!isObj(r) || typeof r.id !== 'string' || decorIds.has(r.id)) continue;
    const kind = oneOf(r.kind, DECOR_KINDS, '' as DecorKind);
    const pos = vec3(r.position);
    if (!kind || !pos) continue;
    decorIds.add(r.id);
    decor.push({
      id: r.id,
      kind,
      variant: str(r.variant, 'default', 60),
      seed: num(r.seed, hashString(r.id), 0, 2 ** 32) >>> 0,
      position: pos,
      rotation: vec3(r.rotation) ?? [0, 0, 0],
      scale: num(r.scale, 1, 0.05, 10),
    });
  }

  // Journal.
  const journal: JournalEntry[] = [];
  for (const r of Array.isArray(t.journal) ? t.journal : []) {
    if (!isObj(r) || typeof r.text !== 'string') continue;
    const e: JournalEntry = { at: num(r.at, simTime), kind: oneOf(r.kind, JOURNAL_KINDS, 'info'), text: r.text.slice(0, 500) };
    if (typeof r.fishId === 'string') e.fishId = r.fishId;
    journal.push(e);
  }
  if (journal.length > JOURNAL_MAX) journal.splice(0, journal.length - JOURNAL_MAX);

  const statsRaw = isObj(t.stats) ? t.stats : {};
  const marine = water === 'marine';
  const heightCm = size.heightCm;
  const aquascape = typeof t.aquascape === 'string' && /^[a-z0-9-]{1,40}$/.test(t.aquascape) ? t.aquascape : undefined;
  return {
    version: 1,
    id: str(t.id, `tank_${now.toString(36)}`, 80),
    name: str(t.name, marine ? 'My Reef' : 'My Aquarium', 80),
    createdAt: num(t.createdAt, simTime, 0),
    lastSavedReal: num(t.lastSavedReal, now, 0),
    simTime,
    timeScale: num(t.timeScale, 1, 0, 1_000_000),
    size,
    water,
    substrate: oneOf(t.substrate, SUBSTRATES, marine ? 'aragonite' : 'aqua-soil'),
    substrateDepthFrontCm: num(t.substrateDepthFrontCm, Math.max(2, heightCm * 0.06), 0, heightCm * 0.4),
    substrateDepthBackCm: num(t.substrateDepthBackCm, Math.max(3, heightCm * 0.16), 0, heightCm * 0.5),
    background: oneOf(t.background, BACKGROUNDS, marine ? 'deep-blue' : 'black'),
    waterParams,
    equipment,
    decor,
    plants,
    fish,
    journal,
    stats: {
      births: num(statsRaw.births, 0, 0),
      deaths: num(statsRaw.deaths, 0, 0),
      feedings: num(statsRaw.feedings, 0, 0),
      waterChanges: num(statsRaw.waterChanges, 0, 0),
    },
    seed: num(t.seed, hashString(str(t.id, 'tank')), 0, 2 ** 32) >>> 0,
    ...(aquascape ? { aquascape } : {}),
  };
}

function sanitizeFish(r: unknown, simTime: number): FishState | null {
  if (!isObj(r) || typeof r.id !== 'string' || typeof r.speciesId !== 'string') return null;
  const lengthCm = num(r.lengthCm, NaN, 0.05, 400);
  if (!Number.isFinite(lengthCm)) return null;
  const sex = oneOf(r.sex, ['male', 'female', 'unknown'] as const, 'unknown');
  const f: FishState = {
    id: r.id.slice(0, 80),
    speciesId: r.speciesId.slice(0, 120),
    sex,
    bornAt: num(r.bornAt, simTime - 180 * 86_400_000),
    addedAt: num(r.addedAt, simTime),
    lengthCm,
    sizeFactor: num(r.sizeFactor, 1, 0.6, 1.4),
    colorSeed: num(r.colorSeed, hashString(r.id), 0, 2 ** 32) >>> 0,
    hunger: num(r.hunger, 0.3, 0, 1),
    health: num(r.health, 1, 0, 1),
    stress: num(r.stress, 0.2, 0, 1),
    stomach: num(r.stomach, 0.3, 0, 1),
    generation: Math.round(num(r.generation, 0, 0, 10_000)),
  };
  if (typeof r.name === 'string' && r.name.trim()) f.name = r.name.trim().slice(0, 40);
  if (Array.isArray(r.parents) && r.parents.length >= 1 && r.parents.length <= 2 && r.parents.every((p) => typeof p === 'string'))
    f.parents = r.parents.slice(0, 2) as [string, string] | [string];
  if (typeof r.lastSpawnAt === 'number' && Number.isFinite(r.lastSpawnAt)) f.lastSpawnAt = r.lastSpawnAt;
  if (typeof r.gravidSince === 'number' && Number.isFinite(r.gravidSince)) f.gravidSince = r.gravidSince;
  const pos = vec3(r.pos);
  if (pos) f.pos = pos;
  if (typeof r.heading === 'number' && Number.isFinite(r.heading)) f.heading = r.heading;
  const home = vec3(r.home);
  if (home) f.home = home;
  return canonicalFishState(f);
}

// ---------------------------------------------------------------------------------------------
// Settings
// ---------------------------------------------------------------------------------------------

export function saveSettings(s: Settings): void {
  try {
    storage()?.setItem(SETTINGS_KEY, JSON.stringify(s));
  } catch {
    /* ignore */
  }
}

/** Load settings, keeping only well-typed known keys (anything else falls back to defaults). */
export function loadSettings(): Settings {
  try {
    const raw = storage()?.getItem(SETTINGS_KEY);
    return raw ? sanitizeSettings(JSON.parse(raw)) : { ...DEFAULT_SETTINGS };
  } catch {
    return { ...DEFAULT_SETTINGS };
  }
}

export function sanitizeSettings(raw: unknown): Settings {
  const d = DEFAULT_SETTINGS;
  if (!isObj(raw)) return { ...d };
  // Keep every key the defaults know about whose type matches (future settings included)…
  const out: Record<string, unknown> = { ...d };
  for (const k of Object.keys(d)) {
    const v = raw[k];
    const def = (d as unknown as Record<string, unknown>)[k];
    if (typeof v === typeof def && (typeof v !== 'number' || Number.isFinite(v))) out[k] = v;
  }
  const s = out as unknown as Settings;
  // …then enforce enumerations and ranges.
  s.quality = oneOf(s.quality, ['low', 'medium', 'high', 'ultra'] as const, d.quality);
  s.careMode = oneOf(s.careMode, ['realistic', 'gentle', 'zen'] as const, d.careMode);
  s.units = oneOf(s.units, ['metric', 'imperial'] as const, d.units);
  s.volume = num(s.volume, d.volume, 0, 1);
  return s;
}
