import type { Vector3 } from 'three';
import type {
  DecorItem,
  DecorKind,
  Equipment,
  FoodKind,
  PlantInstance,
  Settings,
  TankState,
  TankSize,
  WaterType,
} from '../core/types';
import type { World } from '../core/world';
import type { Engine } from '../render/Engine';
import type { FishRenderer } from '../render/fish/FishRenderer';
import type { DecorRenderer } from '../render/decor/DecorRenderer';
import type { CompatibilityReport, StockingReport } from '../sim/LifeSim';
import type { NewTankOptions } from '../sim/tankFactory';
import type { SHAPE_SIZES } from './biotopes';
import type { AquascapeInfo, StockCheck, StockSuggestion, TankSpec, TankSummary } from './tankTypes';

export type DeepPartial<T> = { [K in keyof T]?: T[K] extends object ? DeepPartial<T[K]> : T[K] };

export type PickResult =
  | { kind: 'fish'; id: string }
  | { kind: 'decor'; id: string; point: Vector3 }
  | { kind: 'plant'; id: string; point: Vector3 }
  | { kind: 'substrate'; point: Vector3 }
  | { kind: 'water'; point: Vector3 }
  | { kind: 'none' };

export interface TankPresetInfo {
  id: string;
  name: string;
  description: string;
  water: TankState['water'];
}

/**
 * Everything the UI may do. The UI never mutates `world` directly — it calls these actions,
 * which keep persistence, events, renderers and simulation consistent.
 */
export interface AppApi {
  readonly world: World;
  readonly engine: Engine;
  readonly fishRenderer: FishRenderer;
  readonly decorRenderer: DecorRenderer;

  // Animals
  addFish(speciesId: string, count: number): void;
  removeFish(fishId: string): void;
  renameFish(fishId: string, name: string): void;
  /** Would adding `count` (default: a sensible first group) of this species suit the tank? */
  compatibility(speciesId: string, count?: number): CompatibilityReport;
  stocking(): StockingReport;

  // Feeding & interaction
  feed(kind: FoodKind, at?: [number, number, number], pinches?: number): void;
  tapGlass(at: [number, number, number]): void;

  // Care
  waterChange(fraction: number): void;
  cleanGlass(): void;
  trimPlants(): void;
  setEquipment(patch: DeepPartial<Equipment>): void;
  setTimeScale(scale: number): void;
  setPaused(paused: boolean): void;

  // Decor & plants
  addDecor(kind: DecorKind, variant: string, at?: [number, number]): DecorItem;
  updateDecor(id: string, patch: Partial<Omit<DecorItem, 'id'>>): void;
  removeDecor(id: string): void;
  addPlant(speciesId: string, at?: [number, number], attachTo?: string): PlantInstance | null;
  updatePlant(id: string, patch: Partial<Omit<PlantInstance, 'id'>>): void;
  removePlant(id: string): void;
  /** Change tank-level look: substrate kind/depths, background. */
  setTankLook(patch: Partial<Pick<TankState, 'substrate' | 'substrateDepthFrontCm' | 'substrateDepthBackCm' | 'background' | 'name'>>): void;

  // Selection & camera
  select(sel: { fishId?: string; decorId?: string; plantId?: string }): void;
  /**
   * Follow an animal closely (null = stop). `fill` = fraction of the screen width it should span
   * (≈0.08 distant … 0.45 tight close-up; default chosen by the camera). Ends a tour.
   * Emits 'view-changed'.
   */
  follow(fishId: string | null, opts?: { fill?: number }): void;
  /** Tighter/looser framing of the followed animal. */
  setFollowFill(fill: number): void;
  /**
   * The part of the screen (client px) left uncovered by the animal's card or an open panel: a
   * followed animal is framed there (the camera comes closer if the glass would otherwise stop
   * it). null = the whole screen.
   */
  setFollowSafeArea(area: { left: number; top: number; right: number; bottom: number } | null): void;
  /**
   * Zoom by wheel-notch steps (positive = closer), toward a screen point when given (pinch centre,
   * cursor). While following, zoom changes how tightly the animal is framed.
   */
  zoomBy(steps: number, anchorClientX?: number, anchorClientY?: number): void;
  setZoom(zoom: number): void;
  /**
   * 1 = whole tank; `max` ≈ 8× telephoto through the front glass. `atHome`: the view rests on the
   * whole-tank framing — false while following, zoomed in, or panned away from it at 1× (cubes and
   * tall tanks on a wide screen, wide tanks on a phone held upright can be panned at 1×).
   */
  getZoom(): { zoom: number; min: number; max: number; atHome: boolean };
  /** Pan a zoomed view by fractions of the visible half-width/height (ends a tour). */
  panBy(dx: number, dy: number): void;
  /** Back to the whole-tank view (stops following and touring). */
  resetView(): void;
  /** Documentary tour: the camera drifts between interesting animals. Emits 'view-changed'. */
  setTour(on: boolean): void;
  isTouring(): boolean;
  pickAt(clientX: number, clientY: number): PickResult;
  /** Where a ray through the screen point meets the substrate / the water surface. */
  substratePointAt(clientX: number, clientY: number): [number, number, number] | null;
  surfacePointAt(clientX: number, clientY: number): [number, number, number] | null;

  // Tank lifecycle
  presets(): TankPresetInfo[];
  /** Set up a ready-made tank as a NEW tank in the collection and switch to it. */
  loadPreset(presetId: string): void;
  /** Add an empty tank to the collection and switch to it. */
  newTank(opts: NewTankOptions): void;
  exportTank(): string;
  /** Import a saved tank as a NEW tank in the collection and switch to it. Throws on bad input. */
  importTank(json: string): void;
  save(): void;

  // Tank collection (every tank keeps living while another is open). All emit 'tanks-changed'.
  listTanks(): TankSummary[];
  currentTankId(): string;
  /** Open another tank (it catches up on the time it spent unwatched). false if it can't be loaded. */
  switchTank(id: string): Promise<boolean>;
  /** Build a tank from the guided builder's spec, add it to the collection and switch to it. Returns its id. */
  createTank(spec: TankSpec): string;
  renameTank(id: string, name: string): Promise<void>;
  /** Copy a tank (not opened). Returns the copy's id. */
  duplicateTank(id: string): Promise<string | null>;
  /** Delete a tank (switching away first if it is open). false for the last remaining tank. */
  deleteTank(id: string): Promise<boolean>;

  // Guided tank builder
  /** Aquascape styles for a water type (with suggested substrate/background/chemistry/equipment). */
  aquascapes(water: WaterType, size?: TankSize): AquascapeInfo[];
  /** Starting dimensions per tank shape. */
  shapeSizes(): typeof SHAPE_SIZES;
  /** Communities that genuinely suit the planned tank, best first. */
  suggestStock(spec: TankSpec): StockSuggestion[];
  /** Validate a hand-picked stock list against the planned tank. */
  checkStock(spec: TankSpec, stock: TankSpec['stock']): StockCheck;

  // Settings
  updateSettings(patch: Partial<Settings>): void;
}
