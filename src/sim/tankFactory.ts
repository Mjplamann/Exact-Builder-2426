import type { BackgroundKind, Equipment, SubstrateKind, TankSize, TankState, WaterParams, WaterType } from '../core/types';

export const TANK_SIZES: { id: string; label: string; size: TankSize }[] = [
  { id: 'nano', label: 'Nano · 45×30×30 cm · 40 L', size: { widthCm: 45, heightCm: 30, depthCm: 30 } },
  { id: '60p', label: '60P · 60×36×30 cm · 64 L', size: { widthCm: 60, heightCm: 36, depthCm: 30 } },
  { id: '90', label: 'Standard · 90×45×45 cm · 180 L', size: { widthCm: 90, heightCm: 45, depthCm: 45 } },
  { id: '120', label: 'Show · 120×50×50 cm · 300 L', size: { widthCm: 120, heightCm: 50, depthCm: 50 } },
  { id: '180', label: 'Grand · 180×60×60 cm · 650 L', size: { widthCm: 180, heightCm: 60, depthCm: 60 } },
  { id: '240', label: 'Public-aquarium · 240×75×75 cm · 1350 L', size: { widthCm: 240, heightCm: 75, depthCm: 75 } },
];

export function defaultWaterParams(water: WaterType, simTime: number): WaterParams {
  const marine = water === 'marine';
  const brackish = water === 'brackish';
  return {
    temperatureC: marine ? 25.5 : 25,
    ph: marine ? 8.2 : brackish ? 7.8 : 6.9,
    ammonia: 0,
    nitrite: 0,
    nitrate: 5,
    salinitySG: marine ? 1.025 : brackish ? 1.008 : 1.0,
    gh: marine ? 0 : brackish ? 12 : 6,
    kh: marine ? 8 : brackish ? 8 : 4,
    bacteria: 1, // tanks start "cycled" (seeded filter) — a fresh uncycled start is optional in settings
    glassAlgae: 0,
    surfaceAlgae: 0.05,
    tannins: 0,
    cloudiness: 0,
    oxygen: 0.95,
    lastWaterChange: simTime,
  };
}

export function defaultEquipment(water: WaterType, liters: number): Equipment {
  const marine = water === 'marine';
  // A "pinch" from the food system is ~30 mg of flakes; a real auto-feeder portion grows with
  // the tank (≈ one pinch per 40 L per feeding keeps a moderately stocked community fed).
  const pinches = Math.max(1, Math.min(10, Math.round(liters / 40)));
  return {
    filter: { type: liters > 400 ? 'sump' : liters > 120 ? 'canister' : 'hang-on-back', flowLph: Math.round(liters * (marine ? 8 : 5)), on: true },
    heater: { on: true, targetC: marine ? 25.5 : 25 },
    lights: { onHour: 9, offHour: 21, intensity: 0.85, colorTempK: marine ? 14000 : 6800, moonlight: true, rampMinutes: 45 },
    co2: false,
    autoFeeder: { enabled: false, food: marine ? 'mysis' : 'flakes', hours: [9.5, 18], pinches },
  };
}

export interface NewTankOptions {
  name?: string;
  size: TankSize;
  water: WaterType;
  substrate?: SubstrateKind;
  background?: BackgroundKind;
  seed?: number;
  /** Real ms "now" (injectable for tests). */
  now?: number;
  /**
   * Start with a mature (seeded) filter — the default — or a brand-new, uncycled one that has to
   * grow its nitrifying bacteria over the first weeks (ammonia, then nitrite spikes).
   */
  cycled?: boolean;
}

export function newTank(opts: NewTankOptions): TankState {
  const now = opts.now ?? Date.now();
  const seed = opts.seed ?? Math.floor(Math.random() * 2 ** 31);
  const liters = (opts.size.widthCm * opts.size.heightCm * opts.size.depthCm) / 1000;
  const marine = opts.water === 'marine';
  return {
    version: 1,
    id: `tank_${now.toString(36)}`,
    name: opts.name ?? (marine ? 'My Reef' : 'My Aquarium'),
    createdAt: now,
    lastSavedReal: now,
    simTime: now,
    timeScale: 1,
    size: { ...opts.size },
    water: opts.water,
    substrate: opts.substrate ?? (marine ? 'aragonite' : 'aqua-soil'),
    substrateDepthFrontCm: Math.max(2, opts.size.heightCm * 0.06),
    substrateDepthBackCm: Math.max(3, opts.size.heightCm * 0.16),
    background: opts.background ?? (marine ? 'deep-blue' : 'black'),
    waterParams: uncycledIf(defaultWaterParams(opts.water, now), opts.cycled === false),
    equipment: defaultEquipment(opts.water, liters),
    decor: [],
    plants: [],
    fish: [],
    journal: [],
    stats: { births: 0, deaths: 0, feedings: 0, waterChanges: 0 },
    seed,
  };
}

/** A brand-new filter: only a trace of nitrifying bacteria and a faint new-tank haze. */
function uncycledIf(wp: WaterParams, uncycled: boolean): WaterParams {
  if (!uncycled) return wp;
  return { ...wp, bacteria: 0.02, cloudiness: 0.08, surfaceAlgae: 0, nitrate: 2 };
}
