import type { Collider, CoverPoint, TankState } from '../core/types';
import type { PlantIndex } from '../data/plantIndex';

/**
 * Approximate every decor item (and dense plants) with simple colliders for fish avoidance and
 * list shelter points for shy / cave-dwelling animals. Must agree with the procedural meshes
 * generated from the same item seeds.
 *
 * OWNER: decor module. Placeholder: a sphere per item.
 */
export function buildColliders(tank: TankState, plants: PlantIndex): { colliders: Collider[]; cover: CoverPoint[] } {
  void plants;
  const colliders: Collider[] = tank.decor.map((d) => ({
    type: 'sphere',
    center: [d.position[0], d.position[1] + 0.04 * d.scale, d.position[2]],
    radius: 0.06 * d.scale,
    ownerId: d.id,
  }));
  return { colliders, cover: [] };
}
