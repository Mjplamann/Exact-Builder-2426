import type { Settings, TankState } from '../core/types';
import { DEFAULT_SETTINGS } from '../core/world';

/**
 * Save/load the tank and settings (localStorage), and JSON export/import with migration.
 * Every storage access is guarded: storage can be unavailable (private mode, sandboxed frames).
 *
 * OWNER: life-sim module.
 */
const TANK_KEY = 'aquarium.tank.v1';
const SETTINGS_KEY = 'aquarium.settings.v1';

function storage(): Storage | null {
  try {
    return typeof localStorage !== 'undefined' ? localStorage : null;
  } catch {
    return null;
  }
}

export function saveTank(tank: TankState): boolean {
  try {
    tank.lastSavedReal = Date.now();
    storage()?.setItem(TANK_KEY, JSON.stringify(tank));
    return true;
  } catch {
    return false;
  }
}

export function loadTank(): TankState | null {
  try {
    const raw = storage()?.getItem(TANK_KEY);
    return raw ? importTank(raw) : null;
  } catch {
    return null;
  }
}

export function clearTank(): void {
  try {
    storage()?.removeItem(TANK_KEY);
  } catch {
    /* ignore */
  }
}

export function saveSettings(s: Settings): void {
  try {
    storage()?.setItem(SETTINGS_KEY, JSON.stringify(s));
  } catch {
    /* ignore */
  }
}

export function loadSettings(): Settings {
  try {
    const raw = storage()?.getItem(SETTINGS_KEY);
    return raw ? { ...DEFAULT_SETTINGS, ...JSON.parse(raw) } : { ...DEFAULT_SETTINGS };
  } catch {
    return { ...DEFAULT_SETTINGS };
  }
}

export function exportTank(tank: TankState): string {
  return JSON.stringify(tank, null, 1);
}

/** Parse + migrate + sanity-check a saved tank. Throws on invalid input. */
export function importTank(json: string): TankState {
  const t = JSON.parse(json) as TankState;
  if (!t || t.version !== 1 || !t.size || !Array.isArray(t.fish)) throw new Error('Not a valid aquarium save');
  return t;
}
