import type { TankState } from '../core/types';
import { importTank } from '../sim/persistence';
import type { CloudSave } from './cloudSave';
import { TankLibrary } from './tankLibrary';

/** Newer of two copies of the same tank (the cloud copy wins only when clearly newer). */
export function newerTank(local: TankState | null, remote: TankState | null): TankState | null {
  if (!remote) return local;
  if (!local) return remote;
  return remote.lastSavedReal > local.lastSavedReal + 1000 ? remote : local;
}

/** A stored tank by id: this browser's copy, or the cloud's when newer (cached locally). */
export async function fetchTank(library: TankLibrary, cloud: CloudSave | null, id: string): Promise<TankState | null> {
  const local = library.get(id);
  let remote: TankState | null = null;
  if (cloud) {
    const json = await cloud.loadTank(id);
    if (json) {
      try {
        remote = importTank(json);
      } catch (err) {
        console.warn('[tanks] cloud copy unreadable', err);
      }
    }
  }
  const tank = newerTank(local, remote);
  if (tank && tank === remote) library.put(tank);
  return tank;
}

/**
 * Open the keeper's tank collection at boot: this browser's library merged with the cloud index
 * (and the pre-library single cloud save), plus the tank to show first. `tank` is null on a first
 * visit — the app then sets up its starter tank.
 */
export async function openLibrary(cloud: CloudSave | null): Promise<{ library: TankLibrary; tank: TankState | null }> {
  const library = new TankLibrary();
  if (cloud) {
    const [index, legacy] = await Promise.all([cloud.loadIndex(), cloud.loadLegacy()]);
    if (index) {
      library.mergeSummaries(index.tanks, index.deleted);
      const cur = library.currentId;
      if ((!cur || !library.has(cur)) && index.currentId && library.has(index.currentId)) library.setCurrent(index.currentId);
    }
    if (legacy) {
      try {
        const t = importTank(legacy);
        if (!(index?.deleted ?? []).includes(t.id)) {
          const known = library.get(t.id);
          if (!known || t.lastSavedReal > known.lastSavedReal + 1000) library.put(t);
          if (!library.currentId) library.setCurrent(t.id);
        }
      } catch {
        /* unreadable legacy save: ignore */
      }
    }
  }

  // The open tank, falling back through the collection if a copy has gone missing.
  const order = [library.currentId, ...library.list().sort((a, b) => b.lastSavedReal - a.lastSavedReal).map((t) => t.id)];
  for (const id of order) {
    if (!id) continue;
    const tank = await fetchTank(library, cloud, id);
    if (tank) {
      library.setCurrent(tank.id);
      return { library, tank };
    }
    // Neither this browser nor the cloud can provide it right now.
    library.forget(id);
  }
  return { library, tank: null };
}
