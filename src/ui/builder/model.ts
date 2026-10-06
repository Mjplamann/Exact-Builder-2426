/**
 * The tank builder's state (pure, no DOM): a `TankSpec` kept in memory while the builder is open,
 * plus which choices the keeper made by hand. Picking a style fills in its suggested substrate,
 * background, chemistry and equipment — but never over something the keeper chose themselves;
 * changing the water type starts those choices afresh (a reef substrate makes no sense in a
 * river). Sizes are whole centimeters, clamped to sane limits.
 */
import type { BackgroundKind, Equipment, SubstrateKind, WaterType } from '../../core/types';
import type { SHAPE_SIZES } from '../../app/biotopes';
import type { AquascapeInfo, TankShape, TankSpec } from '../../app/tankTypes';
import { defaultEquipment } from '../../sim/tankFactory';
import { ROOM_TEMP_C, clampDim, clampSize, defaultSG, grossLiters, netLiters, withAxis, type Axis } from './tankMath';

export const STEPS = ['start', 'water', 'size', 'style', 'look', 'equipment', 'cycle', 'animals', 'review'] as const;
export type StepId = (typeof STEPS)[number];

/** Short names for the progress line, chips and review. */
export const STEP_NAMES: Record<StepId, string> = {
  start: 'Start',
  water: 'Water',
  size: 'Size & shape',
  style: 'Style',
  look: 'Substrate & background',
  equipment: 'Equipment',
  cycle: 'Filter',
  animals: 'Animals',
  review: 'Name & review',
};

export type ShapeSizes = typeof SHAPE_SIZES;

/** Choices the keeper can make by hand (a style's defaults leave them alone afterwards). */
export type TouchKey = 'substrate' | 'background' | 'slope' | 'filter' | 'heater' | 'lights' | 'co2' | 'feeder' | 'name';

const EQUIPMENT_KEYS: [TouchKey, keyof Equipment][] = [
  ['filter', 'filter'],
  ['heater', 'heater'],
  ['lights', 'lights'],
  ['co2', 'co2'],
  ['feeder', 'autoFeeder'],
];

/** What a tank of each water type gets when its style suggests nothing. */
export const WATER_LOOK: Record<WaterType, { substrate: SubstrateKind; background: BackgroundKind }> = {
  freshwater: { substrate: 'river-sand', background: 'black' },
  brackish: { substrate: 'beige-sand', background: 'dark-green' },
  marine: { substrate: 'aragonite', background: 'deep-blue' },
};

/** Friendly tank names per style (else the style's own name, title-cased). */
const STYLE_TANK_NAMES: Record<string, string> = {
  amazon: 'Amazon Riverbank',
  iwagumi: 'Stone Garden',
  dutch: 'Dutch Garden',
  malawi: 'Lake Malawi',
  blackwater: 'Blackwater Pool',
  'nano-shrimp': 'Shrimp Garden',
  goldfish: 'Goldfish Tank',
  nature: 'Nature Aquarium',
  reef: 'Coral Reef',
  mangrove: 'Mangrove Estuary',
};
const WATER_TANK_NAMES: Record<WaterType, string> = { freshwater: 'My Aquarium', brackish: 'My Estuary', marine: 'My Reef' };

export const MAX_NAME_LENGTH = 60;

function titleCase(s: string): string {
  return s.replace(/(^|\s)(\p{Ll})/gu, (_m, sp: string, c: string) => sp + c.toUpperCase());
}

export function defaultTankName(style: Pick<AquascapeInfo, 'id' | 'name'> | null, water: WaterType): string {
  if (!style || style.id === 'empty') return WATER_TANK_NAMES[water];
  return STYLE_TANK_NAMES[style.id] ?? titleCase(style.name);
}

/** `base`, or "base 2", "base 3"… when the keeper already has a tank by that name. */
export function uniqueName(base: string, existing: Iterable<string>): string {
  const taken = new Set<string>();
  for (const n of existing) taken.add(n.trim().toLowerCase());
  if (!taken.has(base.toLowerCase())) return base;
  for (let i = 2; ; i++) {
    const n = `${base} ${i}`;
    if (!taken.has(n.toLowerCase())) return n;
  }
}

/** A gentle back-to-front slope for a tank of this height (as new tanks get by default). */
export function defaultSlope(heightCm: number): { front: number; back: number } {
  const half = (v: number) => Math.round(v * 2) / 2;
  return { front: Math.max(2, half(heightCm * 0.06)), back: Math.max(3, half(heightCm * 0.16)) };
}

/** Deepest sensible substrate for this height (front is kept shallow so the glass stays clear). */
export function slopeLimits(heightCm: number): { front: number; back: number } {
  return { front: Math.max(1, Math.min(15, Math.round(heightCm * 0.3))), back: Math.max(2, Math.round(heightCm * 0.35)) };
}

/** The style to preselect: the first real scape that suits the volume. */
export function defaultStyle(styles: readonly AquascapeInfo[], liters: number): AquascapeInfo | null {
  const real = styles.filter((s) => s.id !== 'empty');
  return real.find((s) => (s.minLiters ?? 0) <= liters) ?? real[0] ?? styles[0] ?? null;
}

function deepMerge(target: Record<string, unknown>, patch: Record<string, unknown>): void {
  for (const [k, v] of Object.entries(patch)) {
    if (v === undefined) continue;
    const cur = target[k];
    if (v && typeof v === 'object' && !Array.isArray(v) && cur && typeof cur === 'object' && !Array.isArray(cur)) deepMerge(cur as Record<string, unknown>, v as Record<string, unknown>);
    else target[k] = Array.isArray(v) ? [...v] : v;
  }
}

function clone<T>(v: T): T {
  return JSON.parse(JSON.stringify(v)) as T;
}

export class BuilderModel {
  readonly spec: TankSpec;
  readonly touched = new Set<TouchKey>();
  /** The chosen style (null only when the water type offers none). */
  style: AquascapeInfo | null = null;
  private initial: string;

  /**
   * @param shapes        starting dimensions per shape (`app.shapeSizes()`)
   * @param styles        the styles for freshwater, the starting water (`app.aquascapes('freshwater')`)
   * @param existingNames names already in the collection (a new tank gets a distinct one)
   */
  constructor(
    private shapes: ShapeSizes,
    styles: readonly AquascapeInfo[],
    private existingNames: readonly string[] = [],
  ) {
    const size = { ...shapes.standard.size };
    const slope = defaultSlope(size.heightCm);
    this.spec = {
      name: '',
      water: 'freshwater',
      shape: 'standard',
      size,
      substrate: WATER_LOOK.freshwater.substrate,
      background: WATER_LOOK.freshwater.background,
      substrateDepthFrontCm: slope.front,
      substrateDepthBackCm: slope.back,
      aquascape: 'empty',
      equipment: defaultEquipment('freshwater', grossLiters(size)),
      cycled: true,
      stock: [],
    };
    this.applyStyle(defaultStyle(styles, this.liters));
    this.initial = JSON.stringify(this.spec);
  }

  /** The builder always holds a complete equipment set (the spec type allows a partial one). */
  get equipment(): Equipment {
    return this.spec.equipment as Equipment;
  }

  /** Nominal volume (L). */
  get liters(): number {
    return grossLiters(this.spec.size);
  }

  /** Water held once the substrate is in (L). */
  get netLiters(): number {
    const s = this.spec;
    return netLiters({ size: s.size, substrate: s.substrate, substrateDepthFrontCm: s.substrateDepthFrontCm ?? 0, substrateDepthBackCm: s.substrateDepthBackCm ?? 0 });
  }

  get sg(): number {
    return this.spec.waterParams?.salinitySG ?? defaultSG(this.spec.water);
  }

  get animals(): number {
    let n = 0;
    for (const q of this.spec.stock) n += q.count;
    return n;
  }

  /** Anything chosen since the builder opened (closing then asks first). */
  get changed(): boolean {
    return JSON.stringify(this.spec) !== this.initial;
  }

  // ------------------------------------------------------------------------------------------
  // Water, size, style
  // ------------------------------------------------------------------------------------------

  /** A new water type: its own styles, look and equipment (hand-made choices start afresh; animals too). */
  setWater(water: WaterType, styles: readonly AquascapeInfo[]): void {
    const s = this.spec;
    if (water === s.water) return;
    s.water = water;
    s.stock = [];
    for (const k of ['substrate', 'background', 'filter', 'heater', 'lights', 'co2', 'feeder'] as const) this.touched.delete(k);
    this.applyStyle(defaultStyle(styles, this.liters));
  }

  setShape(shape: TankShape): void {
    const s = this.spec;
    s.shape = shape;
    s.size = shape === 'custom' ? clampSize(s.size, 'custom') : { ...this.shapes[shape].size };
    this.sizeChanged();
  }

  /** One dimension (cm). Reshaping a ready shape makes it a custom tank — a nano stays a nano. */
  setDim(axis: Axis, cm: number): void {
    const s = this.spec;
    if (s.shape !== 'nano' && s.shape !== 'custom') s.shape = 'custom';
    s.size = withAxis(s.size, axis, clampDim(cm, axis, s.shape));
    this.sizeChanged();
  }

  private sizeChanged(): void {
    const s = this.spec;
    s.size = clampSize(s.size, s.shape);
    this.fitSlope();
    // Untouched filters are re-sized for the new volume.
    if (!this.touched.has('filter')) this.equipment.filter = this.baseEquipment().filter;
  }

  /** Apply a style and its suggestions (to everything the keeper has not chosen by hand). */
  applyStyle(style: AquascapeInfo | null): void {
    const s = this.spec;
    this.style = style;
    s.aquascape = style?.id ?? 'empty';
    const d = style?.defaults ?? {};
    const look = WATER_LOOK[s.water];
    if (!this.touched.has('substrate')) s.substrate = d.substrate ?? look.substrate;
    if (!this.touched.has('background')) s.background = d.background ?? look.background;
    this.fitSlope();
    s.waterParams = d.waterParams ? { ...d.waterParams } : undefined;
    const base = this.baseEquipment();
    const eq = this.equipment as unknown as Record<string, unknown>;
    for (const [key, group] of EQUIPMENT_KEYS) if (!this.touched.has(key)) eq[group] = clone(base[group]);
    if (!this.touched.has('heater')) {
      // The style's water temperature sets the heater, unless the style set the heater itself.
      const temp = d.waterParams?.temperatureC;
      if (temp !== undefined && d.equipment?.heater?.targetC === undefined && this.equipment.heater.on) this.equipment.heater.targetC = Math.min(32, Math.max(18, temp));
    }
    this.syncTemperature();
    if (!this.touched.has('name')) s.name = uniqueName(defaultTankName(style, s.water), this.existingNames);
  }

  /** Equipment for this water and volume, with the style's suggestions on top. */
  private baseEquipment(): Equipment {
    const eq = defaultEquipment(this.spec.water, this.liters);
    const d = this.style?.defaults?.equipment;
    if (d) deepMerge(eq as unknown as Record<string, unknown>, d as Record<string, unknown>);
    return eq;
  }

  /** Untouched slopes follow the style (or the height); hand-set ones are only kept within reach. */
  private fitSlope(): void {
    const s = this.spec;
    const h = s.size.heightCm;
    const lim = slopeLimits(h);
    if (!this.touched.has('slope')) {
      const def = defaultSlope(h);
      s.substrateDepthFrontCm = this.style?.defaults?.substrateDepthFrontCm ?? def.front;
      s.substrateDepthBackCm = this.style?.defaults?.substrateDepthBackCm ?? def.back;
    }
    s.substrateDepthFrontCm = Math.min(lim.front, Math.max(0, s.substrateDepthFrontCm ?? 0));
    s.substrateDepthBackCm = Math.min(lim.back, Math.max(0, s.substrateDepthBackCm ?? 0));
  }

  /** The new tank starts at the temperature it will settle at: the heater's, or the room's. */
  private syncTemperature(): void {
    const s = this.spec;
    const heater = this.equipment.heater;
    const styleTemp = this.style?.defaults?.waterParams?.temperatureC;
    const t = heater.on ? heater.targetC : this.touched.has('heater') ? ROOM_TEMP_C : (styleTemp ?? ROOM_TEMP_C);
    s.waterParams = { ...(s.waterParams ?? {}), temperatureC: t };
  }

  // ------------------------------------------------------------------------------------------
  // Look & equipment (hand-made choices)
  // ------------------------------------------------------------------------------------------

  setSubstrate(kind: SubstrateKind): void {
    this.touched.add('substrate');
    this.spec.substrate = kind;
  }

  setBackground(kind: BackgroundKind): void {
    this.touched.add('background');
    this.spec.background = kind;
  }

  setSlope(patch: { front?: number; back?: number }): void {
    this.touched.add('slope');
    if (patch.front !== undefined) this.spec.substrateDepthFrontCm = patch.front;
    if (patch.back !== undefined) this.spec.substrateDepthBackCm = patch.back;
    this.fitSlope();
  }

  setFilter(patch: Partial<Equipment['filter']>): void {
    this.touched.add('filter');
    Object.assign(this.equipment.filter, patch);
  }

  setHeater(patch: Partial<Equipment['heater']>): void {
    this.touched.add('heater');
    Object.assign(this.equipment.heater, patch);
    this.syncTemperature();
  }

  setLights(patch: Partial<Equipment['lights']>): void {
    this.touched.add('lights');
    Object.assign(this.equipment.lights, patch);
  }

  setCo2(on: boolean): void {
    this.touched.add('co2');
    this.equipment.co2 = on;
  }

  setFeeder(on: boolean): void {
    this.touched.add('feeder');
    this.equipment.autoFeeder.enabled = on;
  }

  setCycled(cycled: boolean): void {
    this.spec.cycled = cycled;
  }

  // ------------------------------------------------------------------------------------------
  // Animals & name
  // ------------------------------------------------------------------------------------------

  setStock(list: readonly { speciesId: string; count: number }[]): void {
    const merged = new Map<string, number>();
    for (const q of list) if (q.count > 0) merged.set(q.speciesId, (merged.get(q.speciesId) ?? 0) + Math.round(q.count));
    this.spec.stock = [...merged].map(([speciesId, count]) => ({ speciesId, count }));
  }

  /** Set how many of one species (0 removes it; new species join at the end). */
  setCount(speciesId: string, count: number): void {
    const n = Math.max(0, Math.min(99, Math.round(count)));
    const list = this.spec.stock;
    const i = list.findIndex((q) => q.speciesId === speciesId);
    if (i >= 0) {
      if (n > 0) list[i] = { speciesId, count: n };
      else list.splice(i, 1);
    } else if (n > 0) list.push({ speciesId, count: n });
  }

  countOf(speciesId: string): number {
    return this.spec.stock.find((q) => q.speciesId === speciesId)?.count ?? 0;
  }

  setName(name: string): void {
    this.touched.add('name');
    this.spec.name = name.slice(0, MAX_NAME_LENGTH);
  }

  /** A copy for `app.createTank` (trimmed name, animals with a count). */
  toSpec(): TankSpec {
    const out = clone(this.spec);
    out.name = out.name.trim();
    out.stock = out.stock.filter((q) => q.count > 0);
    return out;
  }
}

/** Why a step can't be left forward yet (null = fine). */
export function stepIssue(step: StepId, spec: TankSpec): string | null {
  switch (step) {
    case 'size': {
      const ok = clampSize(spec.size, spec.shape);
      return ok.widthCm === spec.size.widthCm && ok.depthCm === spec.size.depthCm && ok.heightCm === spec.size.heightCm ? null : 'Those dimensions are outside what this tank can be.';
    }
    case 'review':
      if (!spec.name.trim()) return 'Give your tank a name.';
      return spec.name.trim().length > MAX_NAME_LENGTH ? 'That name is a little long.' : null;
    default:
      return null;
  }
}
