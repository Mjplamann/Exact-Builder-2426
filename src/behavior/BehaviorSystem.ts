import type { FishEntity, FoodParticle } from '../core/types';
import type { World } from '../core/world';
import { clampToWater, tankBounds } from '../core/tankGeometry';

/**
 * Moves every animal like its real counterpart: schooling/shoaling, hovering, bottom foraging,
 * glass grazing, hiding, territorial chases, resting at night, startle escapes, feeding, and
 * the biomechanics that drive the swim animation (tail-beat frequency from speed, glides, bends).
 *
 * Writes `fish.kin` every frame. Reads `world.colliders`, `world.cover`, `world.food`, `world.env`.
 *
 * OWNER: behavior module. Placeholder: slow random drift.
 */
export class BehaviorSystem {
  /** Set by the app: called when an animal takes a bite. `amount` is the nutrition taken. */
  onEat: (fish: FishEntity, food: FoodParticle, amount: number) => void = () => {};

  constructor(world: World) {
    void world;
  }

  /** Decor/plants changed: world.colliders & world.cover were rebuilt. Refresh any caches. */
  onEnvironmentChanged(world: World): void {
    void world;
  }

  /** Advance behavior and kinematics by real `dt` seconds. */
  update(world: World, dt: number): void {
    const t = world.clock.realSeconds;
    for (const f of world.fish) {
      const k = f.kin;
      const ph = f.state.colorSeed % 1000;
      k.vel = [Math.cos(t * 0.3 + ph) * 0.03, Math.sin(t * 0.21 + ph) * 0.005, Math.sin(t * 0.17 + ph) * 0.01];
      k.pos = clampToWater(world.tank, [k.pos[0] + k.vel[0] * dt, k.pos[1] + k.vel[1] * dt, k.pos[2] + k.vel[2] * dt]);
      k.speed = Math.hypot(...k.vel);
      k.tailPhase += dt * 8;
    }
  }

  /** Give a newly added/born animal a natural starting position, heading and state. */
  placeNewFish(world: World, fish: FishEntity, near?: [number, number, number]): void {
    const b = tankBounds(world.tank);
    const p: [number, number, number] = near ?? [(Math.random() - 0.5) * b.halfW, b.surfaceY - 0.05, (Math.random() - 0.5) * b.halfD];
    fish.kin.pos = clampToWater(world.tank, p);
  }

  /** Something startled the tank (glass tap, decor moved, sudden light). */
  startle(world: World, at: [number, number, number], strength: number): void {
    void world;
    void at;
    void strength;
  }
}
