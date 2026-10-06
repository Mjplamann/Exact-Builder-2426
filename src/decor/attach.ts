/**
 * Keeping epiphytes, mosses and corals on their host when the host is edited.
 *
 * Attached plants store a world position on the host's surface. When the host is moved, turned
 * or resized, those positions must follow it rigidly — otherwise the next anchor lookup finds
 * them beside the stone (or on a different branch) and they slide off. Pure: no rendering.
 */
import type { DecorItem, TankState } from '../core/types';
import { itemTransform, toLocal, toWorld, type V3 } from './shapes';

export type HostPose = Pick<DecorItem, 'position' | 'rotation' | 'scale'>;

/** Snapshot of a decor item's transform (take it before applying an edit). */
export function hostPose(item: HostPose): HostPose {
  return { position: [...item.position], rotation: [...item.rotation], scale: item.scale };
}

/**
 * Carry every plant attached to `item` from the host's previous pose `before` to its current
 * pose: the attachment point keeps its place on the host, and the plant turns with it.
 * Returns the ids of the plants that moved (mutates `tank.plants`).
 */
export function carryAttached(tank: TankState, item: DecorItem, before: HostPose): string[] {
  const from = itemTransform(before);
  const to = itemTransform(item);
  const same =
    from.s === to.s &&
    before.position.every((v, i) => v === item.position[i]) &&
    before.rotation.every((v, i) => v === item.rotation[i]);
  if (same) return [];
  const moved: string[] = [];
  const l: V3 = [0, 0, 0];
  const w: V3 = [0, 0, 0];
  const dYaw = item.rotation[1] - before.rotation[1];
  for (const p of tank.plants) {
    if (p.attachedTo !== item.id) continue;
    toLocal(from, p.position, l);
    toWorld(to, l, w);
    p.position = [w[0], w[1], w[2]];
    p.rotationY += dYaw;
    moved.push(p.id);
  }
  return moved;
}
