import type { World } from '../../core/world';
import type { Engine } from '../Engine';

/**
 * Draws food particles (flakes, pellets, wafers, worms, live brine shrimp...) with instancing.
 * OWNER: behavior module (with the food physics).
 */
export class FoodRenderer {
  constructor(private engine: Engine) {}
  update(world: World, dt: number): void {
    void world;
    void dt;
    void this.engine;
  }
  dispose(): void {}
}
