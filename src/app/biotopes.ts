import type { BackgroundKind, Equipment, FoodKind, SubstrateKind, TankSize, TankState, WaterParams, WaterType } from '../core/types';
import { AQUASCAPES } from '../decor/aquascapes';
import { FOODS } from '../data/foods';
import { newTank } from '../sim/tankFactory';
import type { DeepPartial } from './AppApi';
import type { AquascapeInfo, TankShape, TankSpec } from './tankTypes';

/**
 * The tank builder's knowledge of styles and sizes: which aquascapes suit a water type, the
 * substrate/background/water chemistry/equipment each style wants, sensible dimensions for each
 * tank shape — and `tankFromSpec`, the one place a builder spec becomes a tank, shared by
 * `App.createTank` and the stock advisor so advice is always checked against the water the new
 * tank really starts with.
 *
 * OWNER: biotopes module.
 */

/**
 * Where an unheated tank settles (°C). The life sim's room swings ±1.2 °C around 22 °C over the
 * day, plus a little lamp heat; a heater only ever warms the water above that.
 */
export const ROOM_TEMP_C = 22;

/** Specific gravity kept well inside the life sim's comfort bands for brackish and marine animals. */
const SG_RANGE: Record<WaterType, [number, number]> = { freshwater: [1.0, 1.0], brackish: [1.003, 1.015], marine: [1.02, 1.027] };
/** The life sim's pH floor per water type (carbonate chemistry never drops below it). */
const PH_FLOOR: Record<WaterType, number> = { freshwater: 4.0, brackish: 6.8, marine: 7.3 };

/** A biotope: how a style's water, light and equipment are set up in a real tank. */
interface Biotope {
  /** AQUASCAPES id. */
  id: string;
  water: WaterType;
  /** Display name when it differs from the layout's own (the "empty" entries). */
  name?: string;
  description?: string;
  /** Smallest tank (gross L) the layout is designed for. */
  minLiters?: number;
  substrate: SubstrateKind;
  background: BackgroundKind;
  /** Substrate depth at the front and back (cm) for a 50 cm tall tank; scaled with height. */
  slope: [number, number];
  chem: { temperatureC: number; ph: number; gh: number; kh: number; salinitySG?: number; tannins?: number };
  heater: boolean;
  light: { colorTempK: number; onHour: number; offHour: number; intensity: number };
  co2?: boolean;
  /** Filter turnover (tank volumes per hour) and, when the style calls for one, a filter type. */
  filter: { turnover: number; type?: Equipment['filter']['type'] };
  /** What the auto-feeder dispenses. */
  food: FoodKind;
  /** The layout carries corals (reef-safety rules apply to its fish). */
  corals?: boolean;
}

const EMPTY_NAME = 'Empty tank — aquascape it yourself';

/** Shared light schedules: low-tech tanks run a long, gentle day; CO₂ and reef tanks a shorter, brighter one. */
const LONG_DAY = { onHour: 9, offHour: 21 };
const SHORT_DAY = { onHour: 10, offHour: 20 };

/*
 * CO₂ tanks: the pH given is the degassed reading at lights-on. Injection drops it by a little
 * over a unit by midday in the life sim (pH 7.1 → ≈ 5.8), so these start near neutral and the
 * stock advisor checks fish against the whole daily swing.
 */
const BIOTOPES: Biotope[] = [
  // --- freshwater ---------------------------------------------------------------------------------
  {
    id: 'amazon', water: 'freshwater', minLiters: 100,
    substrate: 'river-sand', background: 'black', slope: [3, 7],
    chem: { temperatureC: 26, ph: 6.7, gh: 5, kh: 3, tannins: 0.1 },
    heater: true, light: { colorTempK: 6500, ...LONG_DAY, intensity: 0.75 },
    filter: { turnover: 5 }, food: 'flakes',
  },
  {
    id: 'dutch', water: 'freshwater', minLiters: 60,
    substrate: 'aqua-soil', background: 'black', slope: [4, 8],
    chem: { temperatureC: 25, ph: 7.1, gh: 6, kh: 4 },
    heater: true, light: { colorTempK: 6800, ...SHORT_DAY, intensity: 1 }, co2: true,
    filter: { turnover: 6 }, food: 'flakes',
  },
  {
    id: 'iwagumi', water: 'freshwater', minLiters: 20,
    substrate: 'aqua-soil', background: 'frosted', slope: [2.5, 9],
    chem: { temperatureC: 25, ph: 7.1, gh: 4, kh: 3 },
    heater: true, light: { colorTempK: 7000, ...SHORT_DAY, intensity: 1 }, co2: true,
    filter: { turnover: 6 }, food: 'micro-pellets',
  },
  {
    id: 'nature', water: 'freshwater', minLiters: 30,
    substrate: 'aqua-soil', background: 'frosted', slope: [3, 9],
    chem: { temperatureC: 25.5, ph: 7.1, gh: 5, kh: 3 },
    heater: true, light: { colorTempK: 6800, ...SHORT_DAY, intensity: 0.9 }, co2: true,
    filter: { turnover: 6 }, food: 'flakes',
  },
  {
    // Soft and acidic, but with enough carbonate (3 dKH) that nitrification can't strip it bare
    // between water changes — pure blackwater (KH 0–1) crashes without RO top-ups.
    id: 'blackwater', water: 'freshwater', minLiters: 54,
    substrate: 'river-sand', background: 'black', slope: [3, 5],
    chem: { temperatureC: 27, ph: 6.3, gh: 3, kh: 3, tannins: 0.45 },
    heater: true, light: { colorTempK: 5600, ...LONG_DAY, intensity: 0.55 },
    filter: { turnover: 4 }, food: 'flakes',
  },
  {
    id: 'malawi', water: 'freshwater', minLiters: 200,
    substrate: 'white-sand', background: 'gradient-blue', slope: [4, 5],
    chem: { temperatureC: 26, ph: 8.0, gh: 12, kh: 10 },
    heater: true, light: { colorTempK: 10000, ...LONG_DAY, intensity: 0.85 },
    filter: { turnover: 8 }, food: 'flakes',
  },
  {
    // Goldfish are cool-water fish: no heater, a strong filter for a messy, hungry bioload.
    id: 'goldfish', water: 'freshwater', minLiters: 100,
    substrate: 'pea-gravel', background: 'gradient-blue', slope: [3, 4],
    chem: { temperatureC: ROOM_TEMP_C, ph: 7.4, gh: 10, kh: 6 },
    heater: false, light: { colorTempK: 6500, ...LONG_DAY, intensity: 0.75 },
    filter: { turnover: 8 }, food: 'sinking-pellets',
  },
  {
    // A sponge filter: gentle flow and nothing that can swallow a baby shrimp.
    id: 'nano-shrimp', water: 'freshwater', minLiters: 10,
    substrate: 'aqua-soil', background: 'black', slope: [3, 6],
    chem: { temperatureC: 24, ph: 7.0, gh: 7, kh: 3 },
    heater: true, light: { colorTempK: 6500, ...LONG_DAY, intensity: 0.7 },
    filter: { turnover: 4, type: 'sponge' }, food: 'micro-pellets',
  },
  {
    id: 'empty', water: 'freshwater', name: EMPTY_NAME,
    description: 'Just substrate and clear, neutral water: arrange your own stones, wood and plants.',
    substrate: 'aqua-soil', background: 'black', slope: [3, 6],
    chem: { temperatureC: 25, ph: 7.0, gh: 6, kh: 4 },
    heater: true, light: { colorTempK: 6800, ...LONG_DAY, intensity: 0.85 },
    filter: { turnover: 5 }, food: 'flakes',
  },

  // --- brackish -----------------------------------------------------------------------------------
  {
    // Low-end brackish: the range estuary gobies and puffers are kept in; tea-tinted by the roots.
    id: 'mangrove', water: 'brackish', minLiters: 60,
    substrate: 'river-sand', background: 'dark-green', slope: [3, 8],
    chem: { temperatureC: 27, ph: 7.8, gh: 12, kh: 8, salinitySG: 1.006, tannins: 0.25 },
    heater: true, light: { colorTempK: 6000, ...LONG_DAY, intensity: 0.75 },
    filter: { turnover: 5 }, food: 'mysis',
  },
  {
    id: 'brackish-rock', water: 'brackish', minLiters: 40,
    substrate: 'beige-sand', background: 'gradient-blue', slope: [3, 5],
    chem: { temperatureC: 26, ph: 8.0, gh: 14, kh: 10, salinitySG: 1.008 },
    heater: true, light: { colorTempK: 7500, ...LONG_DAY, intensity: 0.8 },
    filter: { turnover: 6 }, food: 'mysis',
  },
  {
    id: 'empty', water: 'brackish', name: EMPTY_NAME,
    description: 'Sand and gently salty water (SG 1.008) — build your own estuary.',
    substrate: 'beige-sand', background: 'gradient-blue', slope: [3, 5],
    chem: { temperatureC: 26, ph: 7.8, gh: 12, kh: 8, salinitySG: 1.008 },
    heater: true, light: { colorTempK: 7000, ...LONG_DAY, intensity: 0.8 },
    filter: { turnover: 5 }, food: 'mysis',
  },

  // --- marine -------------------------------------------------------------------------------------
  {
    id: 'reef', water: 'marine', minLiters: 150,
    substrate: 'aragonite', background: 'deep-blue', slope: [4, 5],
    chem: { temperatureC: 25.5, ph: 8.2, gh: 0, kh: 8, salinitySG: 1.025 },
    heater: true, light: { colorTempK: 14000, ...SHORT_DAY, intensity: 0.9 },
    filter: { turnover: 10 }, food: 'mysis', corals: true,
  },
  {
    id: 'nano-reef', water: 'marine', minLiters: 30,
    substrate: 'aragonite', background: 'deep-blue', slope: [3, 4],
    chem: { temperatureC: 25.5, ph: 8.2, gh: 0, kh: 8, salinitySG: 1.025 },
    heater: true, light: { colorTempK: 15000, ...SHORT_DAY, intensity: 0.85 },
    filter: { turnover: 10 }, food: 'mysis', corals: true,
  },
  {
    id: 'fowlr', water: 'marine', minLiters: 200,
    substrate: 'white-sand', background: 'deep-blue', slope: [4, 5],
    chem: { temperatureC: 25.5, ph: 8.2, gh: 0, kh: 8, salinitySG: 1.024 },
    heater: true, light: { colorTempK: 12000, ...LONG_DAY, intensity: 0.75 },
    filter: { turnover: 8 }, food: 'mysis',
  },
  {
    id: 'empty', water: 'marine', name: EMPTY_NAME,
    description: 'Aragonite sand and natural sea water (SG 1.025) — add your own live rock and corals.',
    substrate: 'aragonite', background: 'deep-blue', slope: [4, 5],
    chem: { temperatureC: 25.5, ph: 8.2, gh: 0, kh: 8, salinitySG: 1.025 },
    heater: true, light: { colorTempK: 14000, ...LONG_DAY, intensity: 0.85 },
    filter: { turnover: 8 }, food: 'mysis',
  },
];

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));
const finite = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);
const grossLiters = (s: TankSize) => (s.widthCm * s.heightCm * s.depthCm) / 1000;

function biotope(water: WaterType, id: string): Biotope | undefined {
  return BIOTOPES.find((b) => b.water === water && b.id === id);
}

/** Filter the factory would fit, unless the style asks for a particular one (sumps for bigger reefs). */
function filterType(b: Biotope, liters: number): Equipment['filter']['type'] {
  if (b.filter.type) return b.filter.type;
  if (b.water === 'marine' && liters >= 200) return 'sump';
  return liters > 400 ? 'sump' : liters > 120 ? 'canister' : 'hang-on-back';
}

/** Substrate depths scaled to the tank height (a 9 cm Iwagumi slope would bury a 20 cm nano). */
function slopeFor(b: Biotope, size?: TankSize): [number, number] {
  const f = size ? clamp(size.heightCm / 50, 0.55, 1.4) : 1;
  const round = (v: number) => Math.round(v * 2) / 2;
  return [Math.max(1.5, round(b.slope[0] * f)), Math.max(2, round(b.slope[1] * f))];
}

function defaultsFor(b: Biotope, size?: TankSize): NonNullable<AquascapeInfo['defaults']> {
  const [front, back] = slopeFor(b, size);
  const waterParams: Partial<WaterParams> = { temperatureC: b.chem.temperatureC, ph: b.chem.ph, gh: b.chem.gh, kh: b.chem.kh, tannins: b.chem.tannins ?? 0 };
  if (b.water !== 'freshwater') waterParams.salinitySG = b.chem.salinitySG;
  const filter: DeepPartial<Equipment['filter']> = {};
  if (size) {
    const liters = grossLiters(size);
    filter.type = filterType(b, liters);
    filter.flowLph = Math.round((liters * b.filter.turnover) / 10) * 10;
  } else if (b.filter.type) filter.type = b.filter.type;
  return {
    substrate: b.substrate,
    background: b.background,
    substrateDepthFrontCm: front,
    substrateDepthBackCm: back,
    waterParams,
    equipment: {
      heater: { on: b.heater, targetC: b.heater ? b.chem.temperatureC : 20 },
      lights: { ...b.light },
      co2: !!b.co2,
      filter,
      autoFeeder: { food: b.food },
    },
  };
}

/**
 * Aquascape styles for a water type, best known first, each with the substrate, background,
 * water chemistry and equipment of its biotope. Pass the planned `size` to get substrate depths
 * scaled to the tank's height and a filter sized for its volume; without it the depths are for a
 * 50 cm tall tank and the filter is left to the factory default. The last entry is always an empty
 * tank (id 'empty') with plain water of that type.
 */
export function aquascapesFor(water: WaterType, size?: TankSize): AquascapeInfo[] {
  const out: AquascapeInfo[] = [];
  for (const b of BIOTOPES) {
    if (b.water !== water) continue;
    const scape = AQUASCAPES.find((a) => a.id === b.id);
    if (!scape) continue;
    out.push({
      id: b.id,
      name: b.name ?? scape.name,
      description: b.description ?? scape.description,
      water,
      ...(b.minLiters ? { minLiters: b.minLiters } : {}),
      defaults: defaultsFor(b, size),
    });
  }
  return out;
}

/** Whether a style's layout carries corals (so its fish must be reef-safe). */
export function styleHasCorals(water: WaterType, aquascape: string): boolean {
  return !!biotope(water, aquascape)?.corals;
}

/**
 * Starting dimensions for a shape (cm) — common commercial sizes. Gross volume, water volume and
 * weight are derived by the builder from the size.
 */
export const SHAPE_SIZES: Record<Exclude<TankShape, 'custom'>, { label: string; description: string; size: TankSize }> = {
  nano: {
    label: 'Nano',
    description: 'A desktop tank for a shrimp colony, a betta or a small shoal of tiny fish. Small volumes change quickly, so it rewards a gentle hand.',
    size: { widthCm: 45, heightCm: 30, depthCm: 30 },
  },
  cube: {
    label: 'Cube',
    description: 'Equal sides — a jewel box you can enjoy from any angle. A favourite for nano reefs and Iwagumi stone gardens.',
    size: { widthCm: 60, heightCm: 60, depthCm: 60 },
  },
  standard: {
    label: 'Standard',
    description: 'The classic 120 cm rectangle: room for shoals to swim, stable water, and space for almost any community.',
    size: { widthCm: 120, heightCm: 50, depthCm: 50 },
  },
  long: {
    label: 'Long & shallow',
    description: 'A riverbank tank: lots of swimming length and surface for fast shoals, loaches and gobies; easy to light and to reach into.',
    size: { widthCm: 150, heightCm: 40, depthCm: 50 },
  },
  tall: {
    label: 'Tall',
    description: 'A deep column of water for angelfish, discus and tall stem plants — and plenty of light needed to reach the bottom.',
    size: { widthCm: 90, heightCm: 75, depthCm: 50 },
  },
};

/** Dimensions the builder accepts for a custom tank (cm). */
export const SIZE_LIMITS: { min: TankSize; max: TankSize } = {
  min: { widthCm: 30, heightCm: 20, depthCm: 20 },
  max: { widthCm: 300, heightCm: 120, depthCm: 120 },
};

// ---------------------------------------------------------------------------------------------
// Spec → tank
// ---------------------------------------------------------------------------------------------

/** Temperature the tank holds: the heater's set-point, or the room's when unheated (heaters only heat). */
export function heldTemperature(eq: Pick<Equipment, 'heater'>): number {
  return eq.heater.on ? Math.max(ROOM_TEMP_C, eq.heater.targetC) : ROOM_TEMP_C;
}

const FILTER_TYPES: Equipment['filter']['type'][] = ['canister', 'hang-on-back', 'sponge', 'internal', 'sump'];

/** Merge a (possibly partial, possibly hand-edited) equipment patch, keeping only sane values. */
function mergeEquipment(eq: Equipment, p: DeepPartial<Equipment>): void {
  const f = p.filter;
  if (f) {
    if (f.type && FILTER_TYPES.includes(f.type)) eq.filter.type = f.type;
    if (finite(f.flowLph)) eq.filter.flowLph = clamp(Math.round(f.flowLph), 0, 50_000);
    if (typeof f.on === 'boolean') eq.filter.on = f.on;
  }
  const h = p.heater;
  if (h) {
    if (typeof h.on === 'boolean') eq.heater.on = h.on;
    if (finite(h.targetC)) eq.heater.targetC = clamp(h.targetC, 18, 32);
  }
  const l = p.lights;
  if (l) {
    if (finite(l.onHour)) eq.lights.onHour = clamp(l.onHour, 0, 24);
    if (finite(l.offHour)) eq.lights.offHour = clamp(l.offHour, 0, 24);
    if (finite(l.intensity)) eq.lights.intensity = clamp(l.intensity, 0, 1);
    if (finite(l.colorTempK)) eq.lights.colorTempK = clamp(l.colorTempK, 2700, 20_000);
    if (typeof l.moonlight === 'boolean') eq.lights.moonlight = l.moonlight;
    if (finite(l.rampMinutes)) eq.lights.rampMinutes = clamp(l.rampMinutes, 0, 180);
  }
  if (typeof p.co2 === 'boolean') eq.co2 = p.co2;
  const a = p.autoFeeder;
  if (a) {
    if (typeof a.enabled === 'boolean') eq.autoFeeder.enabled = a.enabled;
    if (a.food && a.food in FOODS) eq.autoFeeder.food = a.food;
    if (Array.isArray(a.hours)) {
      const hours = a.hours.filter(finite).map((x) => clamp(x, 0, 23.99));
      if (hours.length) eq.autoFeeder.hours = hours.slice(0, 6);
    }
    if (finite(a.pinches)) eq.autoFeeder.pinches = clamp(Math.round(a.pinches), 1, 40);
  }
}

/** Builder sizes are whole centimetres within the accepted range. */
function sanitizeSize(s: TankSize): TankSize {
  const dim = (v: number, lo: number, hi: number) => clamp(Math.round(finite(v) ? v : lo), lo, hi);
  const { min, max } = SIZE_LIMITS;
  return {
    widthCm: dim(s.widthCm, min.widthCm, max.widthCm),
    heightCm: dim(s.heightCm, min.heightCm, max.heightCm),
    depthCm: dim(s.depthCm, min.depthCm, max.depthCm),
  };
}

/**
 * The tank a builder spec describes — water, chemistry, substrate and equipment, but no decor,
 * plants or animals yet. `App.createTank` lays the aquascape out on it; the stock advisor checks
 * communities against it.
 *
 * The starting temperature follows the heater (room temperature when unheated); a fishless-cycle
 * spec (`cycled: false`) starts with a brand-new filter.
 */
export function tankFromSpec(spec: TankSpec, opts: { now?: number; seed?: number } = {}): TankState {
  const size = sanitizeSize(spec.size);
  const water = spec.water;
  const tank = newTank({
    name: (spec.name ?? '').trim().slice(0, 80) || undefined,
    size,
    water,
    substrate: spec.substrate,
    background: spec.background,
    cycled: spec.cycled,
    now: opts.now,
    seed: opts.seed,
  });
  const h = size.heightCm;
  if (finite(spec.substrateDepthFrontCm)) tank.substrateDepthFrontCm = clamp(spec.substrateDepthFrontCm, 0, h * 0.4);
  if (finite(spec.substrateDepthBackCm)) tank.substrateDepthBackCm = clamp(spec.substrateDepthBackCm, 0, h * 0.5);
  if (spec.equipment) mergeEquipment(tank.equipment, spec.equipment);
  // Reef chemistry can't take CO₂ injection; nothing in a marine tank wants it.
  if (water === 'marine') tank.equipment.co2 = false;

  const wp = tank.waterParams;
  const c = spec.waterParams ?? {};
  if (finite(c.ph)) wp.ph = clamp(c.ph, PH_FLOOR[water], 9.2);
  if (finite(c.gh)) wp.gh = clamp(c.gh, 0, 40);
  if (finite(c.kh)) wp.kh = clamp(c.kh, 0, 30);
  if (finite(c.tannins)) wp.tannins = clamp(c.tannins, 0, 1);
  const [sgLo, sgHi] = SG_RANGE[water];
  wp.salinitySG = water === 'freshwater' ? 1.0 : clamp(finite(c.salinitySG) ? c.salinitySG : wp.salinitySG, sgLo, sgHi);
  // An unheated tank starts where the room keeps it (a keeper may know their room runs cool or warm).
  wp.temperatureC = tank.equipment.heater.on ? heldTemperature(tank.equipment) : finite(c.temperatureC) ? clamp(c.temperatureC, ROOM_TEMP_C - 2, ROOM_TEMP_C + 2) : ROOM_TEMP_C;
  if (spec.aquascape) tank.aquascape = spec.aquascape;
  return tank;
}
