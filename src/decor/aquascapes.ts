import type { DecorItem, PlantInstance, TankState, WaterType } from '../core/types';
import type { PlantIndex } from '../data/plantIndex';

export interface Aquascape {
  id: string;
  name: string;
  description: string;
  water: WaterType;
  /** Lay out hardscape and plants for the given tank (size/substrate already set). Deterministic per seed. */
  build(tank: TankState, plants: PlantIndex, seed: number): { decor: DecorItem[]; plants: PlantInstance[] };
}

/** OWNER: decor module — beautiful, natural layouts (Iwagumi, Dutch, Amazon blackwater, Malawi rockscape, reef...). */
export const AQUASCAPES: Aquascape[] = [
  {
    id: 'empty',
    name: 'Bare substrate',
    description: 'A clean slate.',
    water: 'freshwater',
    build: () => ({ decor: [], plants: [] }),
  },
];
