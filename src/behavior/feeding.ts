import type { FishEntity, FoodParticle } from '../core/types';
import { FOODS } from '../data/foods';
import type { Brain } from './brain';
import type { Ctx } from './context';
import type { FoodRT } from './FoodSystem';
import { clamp } from './math';
import type { SpeciesParams } from './params';

/**
 * Feeding ecology: who notices which food, who goes for it, and how bites are taken.
 *
 *  - Perception radius scales with body size, light (visual feeders) and hunger; catfish, loaches
 *    and invertebrates find food by smell in the dark.
 *  - Diet affinity comes from FOODS[kind].affinity[diet]; scavengers like anything settled.
 *  - Feeding zone: surface feeders strike floating food, mid-water fish intercept sinking food,
 *    bottom feeders take what settles; most fish rise a little when hungry.
 *  - Mouth gape (≈ 8–15 % of length) limits what can be swallowed whole; bigger items are taken
 *    in bites (a neon pecks at a wafer, a pleco rasps at it for minutes).
 *  - Competition: particles already claimed by others are less attractive, so a group spreads
 *    over a pinch of flakes instead of mobbing a single one.
 */

/** 0 satiated … 1 ravenous. */
export function appetite(fish: FishEntity): number {
  const s = fish.state;
  return clamp(s.hunger * 1.15 + (0.55 - s.stomach) * 0.6, 0, 1);
}

export function rt(food: FoodParticle): Partial<FoodRT> {
  return food as Partial<FoodRT>;
}

function nutrition0(food: FoodParticle): number {
  return rt(food).nutrition0 ?? FOODS[food.kind]?.nutrition ?? food.nutrition;
}

/** How much this species wants this food (0..1). */
export function affinity(p: SpeciesParams, food: FoodParticle): number {
  const type = FOODS[food.kind];
  if (!type) return 0;
  let a = type.affinity[p.species.diet] ?? 0;
  if (food.state === 'settled' && (p.t.scavenger || p.t['sifter-of-detritus'])) a = Math.max(a, 0.6);
  if (food.state === 'swimming') a = Math.min(1, a * 1.15); // live prey triggers hunting
  return a;
}

/**
 * Multiplier (0 = never) for taking a particle given where it is in the water column and where
 * this animal feeds.
 */
export function zoneWillingness(ctx: Ctx, b: Brain, food: FoodParticle, app: number): number {
  const p = b.p;
  const h = ctx.h;
  const zone = p.species.zone;
  if (p.move !== 'swimmer') {
    // Invertebrates: settled food; shrimp also grab food sinking right past them.
    if (food.state === 'settled') return rt(food).restOn === -2 ? 0 : 1;
    if (p.move === 'walker' && food.state === 'sinking') return 0.6;
    return 0;
  }
  if (p.species.diet === 'filter-feeder') return food.kind === 'phytoplankton' ? 1 : 0.2;
  if (food.kind === 'phytoplankton') return p.species.diet === 'planktivore' ? 0.3 : 0;
  const hf = h.heightFrac(food.pos[0], food.pos[1], food.pos[2]);
  const clinger = p.t.clings;
  if (rt(food).restOn === -2) {
    // Nori on a clip: herbivores of any zone graze it.
    return p.species.diet === 'herbivore' || p.species.diet === 'algae-grazer' || p.t['surface-grazer'] ? 1 : 0.3;
  }
  switch (food.state) {
    case 'floating':
      if (clinger) return 0;
      if (zone === 'top' || zone === 'all' || p.t['surface-skimmer']) return 1;
      if (zone === 'middle') return app > 0.2 ? 0.8 : 0;
      // Bottom fish only very occasionally rise to the surface for food.
      return app > 0.75 && !p.t['bottom-rester'] && p.species.diet === 'omnivore' ? 0.25 : 0;
    case 'sinking':
    case 'swimming':
      if (clinger) return hf < 0.15 ? 0.6 : 0;
      if (zone === 'top') return hf > 0.45 ? 1 : app > 0.6 ? 0.45 : 0;
      if (zone === 'bottom') return hf < 0.4 ? 1 : app > 0.55 ? 0.4 : 0;
      return 1;
    case 'settled':
      if (zone === 'bottom' || clinger) return 1;
      if (zone === 'all') return 0.8;
      if (zone === 'middle') return app > 0.5 ? 0.5 : 0;
      return app > 0.8 ? 0.25 : 0;
  }
  return 0;
}

/** Perception radius (m). */
export function perception(ctx: Ctx, b: Brain, app: number): number {
  const p = b.p;
  const L = b.L;
  const base = p.move === 'crawler' ? 0.25 : p.move === 'walker' ? 0.35 : 0.1 + 7 * L;
  const lightF = p.chemosensory ? 1 : 0.2 + 0.8 * ctx.light;
  return clamp(base * lightF * (0.6 + 0.8 * app) * (1 + 0.8 * b.excite), 0.06, 0.9);
}

function release(b: Brain): void {
  if (b.food) {
    const r = rt(b.food);
    if (r.claims !== undefined && r.claims > 0) r.claims--;
  }
  b.food = null;
  b.nibbling = false;
}

export function claim(b: Brain, food: FoodParticle | null): void {
  if (b.food === food) return;
  release(b);
  b.food = food;
  if (food) {
    const r = rt(food);
    if (r.claims !== undefined) r.claims++;
  }
}

export function dropFood(b: Brain): void {
  release(b);
}

/** Is the brain's food target still edible and in the world? */
export function foodValid(ctx: Ctx, b: Brain): boolean {
  const f = b.food;
  if (!f) return false;
  if (f.state === 'eaten' || f.nutrition <= 0) {
    release(b);
    return false;
  }
  return true;
}

/**
 * Look for the best particle to go for. Sets b.food (claimed) and returns true when found.
 * O(food) — called on a throttle (every ~0.15–0.5 s per animal).
 */
export function scanForFood(ctx: Ctx, fish: FishEntity, b: Brain, app: number): boolean {
  const list = ctx.world.food;
  if (app < 0.1 || list.length === 0) {
    if (b.food) release(b);
    return false;
  }
  const R = perception(ctx, b, app);
  const k = fish.kin;
  const px = k.pos[0], py = k.pos[1], pz = k.pos[2];
  let best: FoodParticle | null = null, bestS = Infinity;
  for (let i = 0; i < list.length; i++) {
    const f = list[i];
    if (f.state === 'eaten') continue;
    const dx = f.pos[0] - px, dy = f.pos[1] - py, dz = f.pos[2] - pz;
    const d2 = dx * dx + dy * dy + dz * dz;
    if (d2 > R * R) continue;
    const aff = affinity(b.p, f);
    if (aff < 0.12) continue;
    const z = zoneWillingness(ctx, b, f, app);
    if (z <= 0) continue;
    const claims = rt(f).claims ?? 0;
    // Big items can be shared; small ones are "taken" once someone is on them.
    const share = f.sizeM > b.p.gapeFrac * b.L * 1.5 ? 0.15 : 0.9;
    let s = (Math.sqrt(d2) * (1 + share * claims)) / (aff * z);
    if (f === b.food) s *= 0.6; // stick with the current target
    if (s < bestS) {
      bestS = s;
      best = f;
    }
  }
  claim(b, best);
  return best !== null;
}

/**
 * Take a bite of b.food if the mouth is on it. Returns true if a bite was taken.
 * `reach` is the snout-to-food distance (m) that counts as contact.
 */
export function tryBite(ctx: Ctx, fish: FishEntity, b: Brain, mx: number, my: number, mz: number, reach: number): boolean {
  const f = b.food;
  if (!f || b.biteT > 0) return false;
  const dx = f.pos[0] - mx, dy = f.pos[1] - my, dz = f.pos[2] - mz;
  if (dx * dx + dy * dy + dz * dz > reach * reach) return false;
  const p = b.p;
  const gape = p.gapeFrac * b.L;
  let amount: number;
  let interval: number;
  if (p.move === 'crawler') {
    amount = nutrition0(f) * 0.04; // radula rasping
    interval = ctx.rng.range(1.4, 2.6);
  } else if (p.move === 'walker') {
    amount = Math.min(f.nutrition, nutrition0(f) * (f.sizeM < b.L * 0.12 ? 1 : 0.08));
    interval = ctx.rng.range(0.45, 0.8);
  } else if (f.sizeM <= gape * 1.15) {
    amount = f.nutrition; // swallowed whole
    interval = clamp(0.25 + b.L * 5, 0.3, 1.0) * (1.15 - 0.35 * b.excite);
  } else {
    // Bite out of a big item: ~ (gape/size)² of its area per bite; suckermouths rasp.
    const frac = p.mouth === 'sucker' ? 0.03 : clamp(0.6 * (gape / f.sizeM) ** 2, 0.01, 0.5);
    amount = nutrition0(f) * frac;
    interval = p.mouth === 'sucker' ? ctx.rng.range(0.9, 1.6) : clamp(0.35 + b.L * 5, 0.4, 1.1);
  }
  b.biteT = interval;
  b.snap = p.move === 'swimmer' ? 1 : 0;
  const before = f.nutrition;
  ctx.onEat(fish, f, Math.max(1e-4, amount));
  const gone = f.state === 'eaten' || f.nutrition <= 1e-6;
  // Fish chew a moment after a whole mouthful; nibblers keep going.
  if (p.move === 'swimmer') b.chewT = Math.max(b.chewT, gone ? 0.25 + 0.4 * clamp(f.sizeM / Math.max(1e-4, gape), 0, 1) : 0.15);
  if (gone) {
    release(b);
    b.scanT = 0.05;
  } else {
    b.nibbling = before - f.nutrition < before; // partial bite: keep nibbling
  }
  return true;
}
