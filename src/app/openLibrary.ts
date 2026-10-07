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

/**
 * A stored tank by id: this browser's copy, or the cloud's when newer (cached locally). `missing`
 * is true only when the tank is definitely nowhere (no copy here, and the cloud — if any —
 * answered that it has none); a cloud that could not be reached never counts as "missing".
 */
export async function fetchTankEx(library: TankLibrary, cloud: CloudSave | null, id: string): Promise<{ tank: TankState | null; missing: boolean }> {
  const local = library.get(id);
  let remote: TankState | null = null;
  let cloudKnows = true;
  if (cloud) {
    let read: { ok: boolean; value: string | null };
    try {
      // (Older stand-ins only have loadTank.)
      read = typeof cloud.readTank === 'function' ? await cloud.readTank(id) : { ok: true, value: await cloud.loadTank(id) };
    } catch {
      read = { ok: false, value: null };
    }
    cloudKnows = read.ok;
    if (read.value) {
      try {
        remote = importTank(read.value);
      } catch (err) {
        cloudKnows = false;
        console.warn('[tanks] cloud copy unreadable', err);
      }
    }
  }
  // A copy is filed under its id: never let a damaged body open as some other tank.
  if (local) local.id = id;
  if (remote) remote.id = id;
  const tank = newerTank(local, remote);
  if (tank && tank === remote) library.put(tank);
  return { tank, missing: !tank && cloudKnows };
}

/** A stored tank by id: this browser's copy, or the cloud's when newer (cached locally). */
export async function fetchTank(library: TankLibrary, cloud: CloudSave | null, id: string): Promise<TankState | null> {
  return (await fetchTankEx(library, cloud, id)).tank;
}

/**
 * Open the keeper's tank collection at boot: this browser's library merged with the cloud index
 * (and the pre-library single cloud save), plus the tank to show first. `tank` is null on a first
 * visit — the app then sets up its starter tank — or when no copy of any tank can be reached right
 * now (their entries are kept, so they open once the cloud answers again).
 */
export async function openLibrary(cloud: CloudSave | null): Promise<{ library: TankLibrary; tank: TankState | null }> {
  const library = new TankLibrary();
  if (cloud) {
    const [index, legacy] = await Promise.all([cloud.loadIndex(), cloud.loadLegacy()]);
    if (index) {
      // Nothing is on screen yet: a tank deleted on another device goes, even if it was open here.
      library.mergeSummaries(index.tanks, index.deleted, { dropCurrent: true });
      const cur = library.currentId;
      if ((!cur || !library.has(cur)) && index.currentId && library.has(index.currentId)) library.setCurrent(index.currentId);
    }
    if (legacy) {
      try {
        const t = importTank(legacy);
        if (!library.isDeleted(t.id)) {
          const known = library.get(t.id);
          if (!known || t.lastSavedReal > known.lastSavedReal + 1000) library.put(t);
          if (!library.currentId || !library.has(library.currentId)) library.setCurrent(t.id);
        }
      } catch {
        /* unreadable legacy save: ignore */
      }
    }
  }

  // The open tank, falling back through the collection if a copy has gone missing.
  const order = [library.currentId, ...library.list().sort((a, b) => b.lastSavedReal - a.lastSavedReal).map((t) => t.id)];
  const tried = new Set<string>();
  for (const id of order) {
    if (!id || tried.has(id)) continue;
    tried.add(id);
    const { tank, missing } = await fetchTankEx(library, cloud, id);
    if (tank) {
      library.setCurrent(tank.id);
      return { library, tank };
    }
    // Definitely gone (neither this browser nor the cloud has it): drop the stale entry here.
    if (missing) library.forget(id);
  }
  return { library, tank: null };
}
