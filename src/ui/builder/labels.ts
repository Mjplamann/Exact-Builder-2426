/**
 * Words for the tank menu and builder (pure): water types, one-line tank descriptions, the delete
 * confirmation and "last watched" times.
 */
import type { WaterType } from '../../core/types';
import type { TankSummary } from '../../app/tankTypes';
import { formatDuration, formatLiters, plural, type Units } from '../format';
import { formatDims } from './tankMath';

export function waterLabel(water: WaterType): string {
  return water === 'marine' ? 'Saltwater' : water === 'brackish' ? 'Brackish' : 'Freshwater';
}

/** "120 × 50 × 50 cm · 252 L" — dimensions and the water it holds. */
export function tankLine(t: Pick<TankSummary, 'size' | 'liters'>, units: Units): string {
  return `${formatDims(t.size, units)} · ${formatLiters(t.liters, units)}`;
}

export function animalsLabel(n: number): string {
  return n === 0 ? 'No animals yet' : `${n} ${plural(n, 'animal')}`;
}

/** "Open now", "Watched just now", "Last watched 3 days ago". */
export function lastWatched(t: Pick<TankSummary, 'current' | 'lastSavedReal'>, now = Date.now()): string {
  if (t.current) return 'Open now';
  const ago = Math.max(0, now - t.lastSavedReal);
  return ago < 90_000 ? 'Watched just now' : `Last watched ${formatDuration(ago)} ago`;
}

/** The delete confirmation: names the tank and what lives in it. */
export function deleteMessage(t: Pick<TankSummary, 'name' | 'animals' | 'species'>): string {
  const who =
    t.animals === 0
      ? ''
      : t.animals === 1
        ? ' and its one animal'
        : ` and its ${t.animals} animals${t.species > 1 ? ` (${t.species} species)` : ''}`;
  return `“${t.name}”${who} will be gone for good — on every device where it is saved.`;
}
