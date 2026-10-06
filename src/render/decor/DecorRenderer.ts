import type { Ray, Vector3 } from 'three';
import type { World } from '../../core/world';
import type { Engine } from '../Engine';

export interface DecorPick {
  kind: 'decor' | 'plant';
  id: string;
  point: Vector3;
}

/**
 * Builds and animates hardscape (rocks, driftwood, caves, shells, leaf litter, airstones) and
 * living plants/corals from TankState. Procedural meshes are deterministic per item seed.
 *
 * OWNER: decor module. Placeholder: renders nothing.
 */
export class DecorRenderer {
  constructor(private engine: Engine) {}

  /** Diff world.tank.decor / world.tank.plants against built meshes; (re)build only what changed. */
  sync(world: World): void {
    void world;
    void this.engine;
  }

  /** Plant sway in current, growth scaling, coral polyp pulsing, selection glow. */
  update(world: World, dt: number): void {
    void world;
    void dt;
  }

  pick(ray: Ray): DecorPick | null {
    void ray;
    return null;
  }

  setSelected(sel: { kind: 'decor' | 'plant'; id: string } | null): void {
    void sel;
  }

  dispose(): void {}
}
