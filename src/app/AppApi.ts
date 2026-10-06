import type { Vector3 } from 'three';
import type {
  DecorItem,
  DecorKind,
  Equipment,
  FoodKind,
  PlantInstance,
  Settings,
  TankState,
} from '../core/types';
import type { World } from '../core/world';
import type { Engine } from '../render/Engine';
import type { FishRenderer } from '../render/fish/FishRenderer';
import type { DecorRenderer } from '../render/decor/DecorRenderer';
import type { CompatibilityReport, StockingReport } from '../sim/LifeSim';
import type { NewTankOptions } from '../sim/tankFactory';

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
  compatibility(speciesId: string): CompatibilityReport;
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
  follow(fishId: string | null): void;
  pickAt(clientX: number, clientY: number): PickResult;
  /** Where a ray through the screen point meets the substrate / the water surface. */
  substratePointAt(clientX: number, clientY: number): [number, number, number] | null;
  surfacePointAt(clientX: number, clientY: number): [number, number, number] | null;

  // Tank lifecycle
  presets(): TankPresetInfo[];
  loadPreset(presetId: string): void;
  newTank(opts: NewTankOptions): void;
  exportTank(): string;
  importTank(json: string): void;
  save(): void;

  // Settings
  updateSettings(patch: Partial<Settings>): void;
}
