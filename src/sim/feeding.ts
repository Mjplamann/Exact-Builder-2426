import type { FishEntity, FoodKind, FoodType, Species, Zone } from '../core/types';
import type { World } from '../core/world';
import { FOODS } from '../data/foods';
import { FOOD_DRY_MG, massG, stomachCapacityMg } from './biology';

/**
 * Feeding without particles: used by the auto-feeder during catch-up (and at time scales where
 * dropped food would decay before anyone could reach it). A dispensed portion is shared out the
 * way it is in a real tank — by appetite, diet preference, where in the water column the food
 * goes, whether it fits the mouth, and who is bolder — and whatever nobody eats rots.
 */

/** How well a fish living in `zone` reaches food that behaves like `buoyancy`. */
function zoneAccess(zone: Zone, buoyancy: FoodType['buoyancy']): number {
  switch (buoyancy) {
    case 'floating':
      return zone === 'top' ? 1 : zone === 'middle' || zone === 'all' ? 0.8 : 0.35; // bottom fish get what sinks later
    case 'slow-sinking':
    case 'live-swimming':
    case 'suspended':
      return zone === 'bottom' ? 0.6 : 1;
    case 'sinking':
      return zone === 'bottom' ? 1 : zone === 'all' ? 0.8 : zone === 'middle' ? 0.55 : 0.3;
    case 'clip':
      return 0.8;
  }
}

/** Large crumbly foods can be nibbled; hard pellets that don't fit the mouth mostly can't. */
function mouthAccess(f: FishEntity, food: FoodType): number {
  const mouthM = 0.0012 * f.state.lengthCm; // ≈ 0.12 × length (cm → m)
  if (food.sizeM <= mouthM) return 1;
  switch (food.shape) {
    case 'flake':
    case 'wafer':
    case 'sheet':
    case 'slice':
    case 'cloud':
      return 0.6;
    default:
      return 0.15;
  }
}

const weights: number[] = [];
const room: number[] = [];

/** Per-species feeding temperament (cached: trait lookups are too slow for every fish & feed). */
interface FeedTraits {
  bold: number;
  scavenger: boolean;
  /** Static weight (affinity × zone access × boldness) per food kind, for each round. */
  weight: [Map<FoodKind, number>, Map<FoodKind, number>];
}
const traitCache = new WeakMap<Species, FeedTraits>();
function feedTraits(sp: Species): FeedTraits {
  let t = traitCache.get(sp);
  if (!t) {
    t = {
      bold: sp.traits.includes('bold') ? 1.25 : sp.traits.includes('shy') ? 0.7 : 1,
      scavenger: sp.traits.includes('scavenger') || sp.group !== 'fish',
      weight: [new Map(), new Map()],
    };
    traitCache.set(sp, t);
  }
  return t;
}

/** Diet × water-column × temperament weight of a species for a food, per round (cached). */
function staticWeight(sp: Species, food: FoodType, round: number): number {
  const ft = feedTraits(sp);
  const cache = ft.weight[round === 0 ? 0 : 1];
  let w = cache.get(food.kind);
  if (w === undefined) {
    let aff = food.affinity[sp.diet] ?? 0;
    if (round === 1 && ft.scavenger) aff = Math.max(aff, 0.5);
    w = aff * zoneAccess(sp.zone, food.buoyancy) * ft.bold;
    cache.set(food.kind, w);
  }
  return w;
}

/**
 * Share `pinches` of `kind` among the animals. `ingest(fish, mg)` adds food to a stomach and
 * returns the mg actually swallowed. Returns the mg nobody ate.
 */
export function feedDirect(
  world: World,
  kind: FoodKind,
  pinches: number,
  ingest: (fish: FishEntity, mg: number) => number,
): number {
  const food = FOODS[kind];
  if (!food) return 0;
  const offered = food.particlesPerPinch * Math.max(0, pinches) * (FOOD_DRY_MG[kind] ?? 1);
  let left = offered;
  const fish = world.fish;
  weights.length = fish.length;
  room.length = fish.length;
  // Two rounds: the bold and hungry get first pick, then whoever still has room cleans up.
  for (let round = 0; round < 2 && left > 1e-6; round++) {
    let total = 0;
    for (let i = 0; i < fish.length; i++) {
      const f = fish[i];
      const sw = staticWeight(f.species, food, round);
      const w = massG(f.species, f.state.lengthCm);
      const r = Math.max(0, 1 - f.state.stomach) * stomachCapacityMg(w);
      room[i] = r;
      if (sw <= 0 || r <= 0) {
        weights[i] = 0;
        continue;
      }
      const appetite = 0.15 + f.state.hunger;
      weights[i] = sw * mouthAccess(f, food) * appetite * Math.sqrt(Math.sqrt(w)) * Math.min(1, r);
      total += weights[i];
    }
    if (total <= 0) break;
    const portion = left;
    for (let i = 0; i < fish.length; i++) {
      if (weights[i] <= 0) continue;
      const want = Math.min(room[i], (portion * weights[i]) / total);
      if (want > 0) left -= ingest(fish[i], want);
    }
  }
  return Math.max(0, left);
}
