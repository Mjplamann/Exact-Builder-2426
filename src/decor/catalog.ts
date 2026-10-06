import type { DecorKind, WaterType } from '../core/types';

export interface DecorVariant {
  kind: DecorKind;
  variant: string;
  name: string;
  description: string;
  /** Which tanks it suits. */
  water: WaterType[];
  /** Natural footprint (m) at scale 1 — used for placement spacing and UI. */
  size: number;
  /** Adds tannins over time (driftwood, leaf litter). */
  tannins?: number;
  /** Raises pH/KH over time (limestone, coral, holey rock). */
  buffersPh?: boolean;
}

/**
 * Everything a keeper can place. OWNER: decor module (expand with all variants it can render).
 */
export const DECOR_CATALOG: DecorVariant[] = [
  { kind: 'rock', variant: 'seiryu', name: 'Seiryu stone', description: 'Blue-grey limestone with sharp white veins — the classic Iwagumi stone.', water: ['freshwater', 'brackish', 'marine'], size: 0.14, buffersPh: true },
  { kind: 'driftwood', variant: 'spiderwood', name: 'Spider wood', description: 'Fine, branching root wood that arches over the scape.', water: ['freshwater', 'brackish'], size: 0.3, tannins: 0.3 },
  { kind: 'airstone', variant: 'cylinder', name: 'Air stone', description: 'Releases a curtain of fine bubbles that ripple the surface.', water: ['freshwater', 'brackish', 'marine'], size: 0.04 },
];
