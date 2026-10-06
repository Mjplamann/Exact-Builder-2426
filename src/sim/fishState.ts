import type { FishState } from '../core/types';
import type { World } from '../core/world';

/**
 * Every `FishState` in a running tank gets the same object shape (all optional keys present,
 * `undefined` when unused, in one fixed order). V8 then keeps the per-fish loops monomorphic —
 * with mixed shapes (some fish with `parents`, some with `gravidSince`, …) property access in
 * the hot loops became several times slower. `JSON.stringify` drops the undefined keys, so saves
 * are unchanged.
 */
export function canonicalFishState(s: FishState): FishState {
  return {
    id: s.id,
    speciesId: s.speciesId,
    name: s.name,
    sex: s.sex,
    bornAt: s.bornAt,
    addedAt: s.addedAt,
    lengthCm: s.lengthCm,
    sizeFactor: s.sizeFactor,
    colorSeed: s.colorSeed,
    hunger: s.hunger,
    health: s.health,
    stress: s.stress,
    stomach: s.stomach,
    generation: s.generation,
    parents: s.parents,
    lastSpawnAt: s.lastSpawnAt,
    gravidSince: s.gravidSince,
    pos: s.pos,
    heading: s.heading,
    home: s.home,
  };
}

/** Re-shape every fish of the world in place (entity and persisted list share the new object). */
export function canonicalizeWorldFish(world: World): void {
  const list = world.tank.fish;
  for (const e of world.fish) {
    const c = canonicalFishState(e.state);
    const i = list.indexOf(e.state);
    e.state = c;
    if (i >= 0) list[i] = c;
  }
}
