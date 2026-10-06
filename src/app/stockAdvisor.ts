import type { PlantIndex } from '../data/plantIndex';
import type { SpeciesIndex } from '../data/speciesIndex';
import type { StockCheck, StockSuggestion, TankSpec } from './tankTypes';

/**
 * Proposes communities of animals that genuinely belong together in a planned tank (same water,
 * overlapping temperature/pH, compatible temperaments and sizes, within stocking capacity) and
 * validates hand-picked lists — using the life sim's own compatibility rules on a temporary,
 * render-free tank built from the spec.
 *
 * OWNER: biotopes module (stub — no suggestions yet).
 */
export function suggestStock(spec: TankSpec, species: SpeciesIndex, plants: PlantIndex): StockSuggestion[] {
  void spec;
  void species;
  void plants;
  return [];
}

export function checkStock(spec: TankSpec, stock: TankSpec['stock'], species: SpeciesIndex, plants: PlantIndex): StockCheck {
  void spec;
  void stock;
  void species;
  void plants;
  return { level: 'good', issues: [], stocking: 0 };
}
