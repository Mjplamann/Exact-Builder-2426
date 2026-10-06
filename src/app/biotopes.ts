import type { TankSize, WaterType } from '../core/types';
import { AQUASCAPES } from '../decor/aquascapes';
import type { AquascapeInfo, TankShape } from './tankTypes';

/**
 * The tank builder's knowledge of styles and sizes: which aquascapes suit a water type, the
 * substrate/background/water chemistry/equipment each style wants, and sensible dimensions for
 * each tank shape.
 *
 * OWNER: biotopes module (stub — returns the plain aquascape list).
 */
export function aquascapesFor(water: WaterType): AquascapeInfo[] {
  return AQUASCAPES.filter((a) => a.water === water || a.id === 'empty').map((a) => ({
    id: a.id,
    name: a.name,
    description: a.description,
    water: a.water,
  }));
}

/** Starting dimensions for a shape (cm). */
export const SHAPE_SIZES: Record<Exclude<TankShape, 'custom'>, { label: string; description: string; size: TankSize }> = {
  nano: { label: 'Nano', description: 'A small desktop tank for shrimp and tiny fish.', size: { widthCm: 45, heightCm: 30, depthCm: 30 } },
  cube: { label: 'Cube', description: 'Equal sides — a jewel-box view from any angle.', size: { widthCm: 60, heightCm: 60, depthCm: 60 } },
  standard: { label: 'Standard', description: 'The classic long rectangle most fish thrive in.', size: { widthCm: 120, heightCm: 50, depthCm: 50 } },
  long: { label: 'Long & shallow', description: 'A riverbank tank: lots of swimming length and surface.', size: { widthCm: 150, heightCm: 40, depthCm: 50 } },
  tall: { label: 'Tall', description: 'A column for angelfish, discus and tall plants.', size: { widthCm: 90, heightCm: 75, depthCm: 50 } },
};
