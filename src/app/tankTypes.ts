import type { BackgroundKind, Equipment, SubstrateKind, TankSize, WaterParams, WaterType } from '../core/types';
import type { CompatibilityReport } from '../sim/LifeSim';
import type { DeepPartial } from './AppApi';

/** One tank in the keeper's collection (what the tank menu lists). */
export interface TankSummary {
  id: string;
  name: string;
  water: WaterType;
  size: TankSize;
  liters: number;
  animals: number;
  species: number;
  createdAt: number;
  /** Real ms when this tank was last open (it keeps living while away). */
  lastSavedReal: number;
  /** Aquascape style it was built from, when known. */
  aquascape?: string;
  current: boolean;
}

/** Tank proportions offered by the builder (the size is always explicit; shape is a starting point). */
export type TankShape = 'standard' | 'cube' | 'long' | 'tall' | 'nano' | 'custom';

/** Everything the guided builder decides; `App.createTank(spec)` turns it into a living tank. */
export interface TankSpec {
  name: string;
  water: WaterType;
  shape: TankShape;
  size: TankSize;
  substrate: SubstrateKind;
  background: BackgroundKind;
  substrateDepthFrontCm?: number;
  substrateDepthBackCm?: number;
  /** AQUASCAPES id ('empty' = bare substrate to aquascape yourself). */
  aquascape: string;
  /** Biotope water chemistry (soft & acidic blackwater, hard Malawi, brackish SG…). */
  waterParams?: Partial<WaterParams>;
  equipment?: DeepPartial<Equipment>;
  /** true = mature, seeded filter (fish can go in today); false = fishless cycle from scratch. */
  cycled: boolean;
  stock: { speciesId: string; count: number }[];
}

/** An aquascape style the builder offers for a water type. */
export interface AquascapeInfo {
  id: string;
  name: string;
  description: string;
  water: WaterType;
  /** Smallest tank (L) the layout is designed for; it adapts to anything larger. */
  minLiters?: number;
  /** Suggested substrate/background/water/equipment for this style. */
  defaults?: Partial<Pick<TankSpec, 'substrate' | 'background' | 'waterParams' | 'equipment' | 'substrateDepthFrontCm' | 'substrateDepthBackCm'>>;
}

/** A ready-to-add community the stock advisor proposes for a spec. */
export interface StockSuggestion {
  id: string;
  title: string;
  description: string;
  stock: { speciesId: string; count: number }[];
  /** Worst compatibility level across the community in this tank. */
  level: CompatibilityReport['level'];
  /** Fraction of the tank's stocking capacity this community uses (adult size). */
  stocking: number;
  /** Why a 'caution' community is still worth considering (the life sim's own words). */
  notes?: string[];
}

/** Validation of a hand-picked stock list against a spec. */
export interface StockCheck {
  level: CompatibilityReport['level'];
  /** Per-species issues, worst first. */
  issues: { speciesId: string; level: CompatibilityReport['level']; text: string }[];
  stocking: number;
}
