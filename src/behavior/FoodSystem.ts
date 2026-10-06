import type { FoodKind, FoodParticle } from '../core/types';
import type { World } from '../core/world';

/**
 * Food physics: floating on the surface film (drifting with the filter current), fluttering down,
 * sinking, settling on substrate/decor, live foods swimming, and decay of uneaten food.
 *
 * OWNER: behavior module.
 */
export class FoodSystem {
  /** Called when uneaten food rots away (LifeSim adds ammonia). */
  onDecay: (food: FoodParticle) => void = () => {};
  private nextId = 1;

  /** Drop `pinches` pinches of a food at x,z (y ignored: floating foods start on the surface, others just below). */
  drop(world: World, kind: FoodKind, at: [number, number, number], pinches = 1): void {
    void world;
    void kind;
    void at;
    void pinches;
    void this.nextId;
  }

  /** Physics in real seconds; decay in sim seconds. */
  update(world: World, dt: number, simDt: number): void {
    void world;
    void dt;
    void simDt;
  }

  /** Take up to `amount` nutrition from a particle; removes it when exhausted. Returns nutrition taken. */
  consume(world: World, food: FoodParticle, amount: number): number {
    const taken = Math.min(amount, food.nutrition);
    food.nutrition -= taken;
    if (food.nutrition <= 1e-6) {
      food.state = 'eaten';
      const i = world.food.indexOf(food);
      if (i >= 0) world.food.splice(i, 1);
    }
    return taken;
  }
}
