import type { TankState } from '../core/types';
import { waterLiters } from '../core/tankGeometry';
import { importTank } from '../sim/persistence';
import type { TankSummary } from './tankTypes';

/**
 * The keeper's collection of tanks, stored in this browser: an index (summaries + which tank is
 * open) plus one JSON blob per tank. Tanks that are not open keep their `lastSavedReal`, so when
 * one is reopened the life sim catches up on the time it spent unwatched — every tank keeps living.
 *
 * Every storage access is guarded (private mode, quota, sandboxed frames): the library then just
 * lives in memory for the session.
 */

const INDEX_KEY = 'aquarium.tanks.v1';
const TANK_PREFIX = 'aquarium.tank.v1:';
/** Pre-library single-tank save (migrated on first run). */
const LEGACY_KEY = 'aquarium.tank.v1';
/** Above this a tank's journal is trimmed before storing (localStorage is ~5 MB per site). */
const MAX_TANK_CHARS = 1_500_000;

export interface LibraryIndex {
  currentId: string | null;
  tanks: Omit<TankSummary, 'current'>[];
  /** Recently deleted tank ids, so another device's stale copy doesn't bring them back. */
  deleted?: string[];
}

const MAX_TOMBSTONES = 100;

function storage(): Storage | null {
  try {
    return typeof localStorage !== 'undefined' ? localStorage : null;
  } catch {
    return null;
  }
}

export function summarize(tank: TankState, aquascape?: string): Omit<TankSummary, 'current'> {
  return {
    id: tank.id,
    name: tank.name,
    water: tank.water,
    size: { ...tank.size },
    liters: Math.round(waterLiters(tank)),
    animals: tank.fish.length,
    species: new Set(tank.fish.map((f) => f.speciesId)).size,
    createdAt: tank.createdAt,
    lastSavedReal: tank.lastSavedReal,
    aquascape: aquascape ?? tank.aquascape,
  };
}

export class TankLibrary {
  private index: LibraryIndex = { currentId: null, tanks: [], deleted: [] };
  /** In-memory copies (also the only copies when storage is unavailable). */
  private blobs = new Map<string, string>();

  constructor() {
    this.load();
  }

  private load(): void {
    const s = storage();
    try {
      const raw = s?.getItem(INDEX_KEY);
      if (raw) {
        const idx = JSON.parse(raw) as LibraryIndex;
        if (idx && Array.isArray(idx.tanks))
          this.index = {
            currentId: idx.currentId ?? null,
            tanks: idx.tanks.filter((t) => t && typeof t.id === 'string'),
            deleted: Array.isArray(idx.deleted) ? idx.deleted.filter((x) => typeof x === 'string') : [],
          };
      }
    } catch {
      /* unreadable index: start empty */
    }
    // Migrate the pre-library single save.
    try {
      const legacy = s?.getItem(LEGACY_KEY);
      if (legacy && !this.index.tanks.length) {
        const tank = importTank(legacy);
        this.put(tank);
        this.index.currentId = tank.id;
        this.writeIndex();
      }
      if (legacy) s?.removeItem(LEGACY_KEY);
    } catch {
      /* ignore */
    }
  }

  private writeIndex(): void {
    try {
      storage()?.setItem(INDEX_KEY, JSON.stringify(this.index));
    } catch {
      /* quota / unavailable */
    }
  }

  get currentId(): string | null {
    return this.index.currentId;
  }

  list(): TankSummary[] {
    return this.index.tanks
      .map((t) => ({ ...t, current: t.id === this.index.currentId }))
      .sort((a, b) => a.createdAt - b.createdAt);
  }

  has(id: string): boolean {
    return this.index.tanks.some((t) => t.id === id);
  }

  /** Raw JSON of a stored tank, or null. */
  read(id: string): string | null {
    const mem = this.blobs.get(id);
    if (mem) return mem;
    try {
      return storage()?.getItem(TANK_PREFIX + id) ?? null;
    } catch {
      return null;
    }
  }

  /** Parsed tank, or null when missing/unreadable. */
  get(id: string): TankState | null {
    const raw = this.read(id);
    if (!raw) return null;
    try {
      return importTank(raw);
    } catch {
      return null;
    }
  }

  /** Store (insert or update) a tank and its summary. Returns false if the browser refused. */
  put(tank: TankState, aquascape?: string): boolean {
    let json = JSON.stringify(tank);
    if (json.length > MAX_TANK_CHARS && tank.journal.length > 100) {
      tank.journal.splice(0, tank.journal.length - 100);
      json = JSON.stringify(tank);
    }
    this.blobs.set(tank.id, json);
    const prev = this.index.tanks.find((t) => t.id === tank.id);
    const sum = summarize(tank, aquascape ?? prev?.aquascape);
    if (prev) Object.assign(prev, sum);
    else this.index.tanks.push(sum);
    let ok = true;
    try {
      storage()?.setItem(TANK_PREFIX + tank.id, json);
      // Keep memory lean once safely stored.
      this.blobs.delete(tank.id);
    } catch {
      ok = false;
    }
    this.writeIndex();
    return ok;
  }

  /**
   * Merge summaries learnt from elsewhere (the cloud index) without overwriting newer local ones;
   * tanks deleted elsewhere (`deleted`) are dropped here too.
   */
  mergeSummaries(remote: Omit<TankSummary, 'current'>[], deleted: string[] = []): void {
    const gone = new Set([...(this.index.deleted ?? []), ...deleted]);
    for (const id of deleted) if (this.has(id) && id !== this.index.currentId) this.remove(id);
    this.index.deleted = [...gone].slice(-MAX_TOMBSTONES);
    for (const r of remote) {
      if (gone.has(r.id)) continue;
      const local = this.index.tanks.find((t) => t.id === r.id);
      if (!local) this.index.tanks.push({ ...r });
      else if (r.lastSavedReal > local.lastSavedReal) Object.assign(local, r);
    }
    this.writeIndex();
  }

  /** Refresh a tank's summary (e.g. the open tank's animal count) without storing its body. */
  touch(tank: TankState): void {
    const prev = this.index.tanks.find((t) => t.id === tank.id);
    if (prev) Object.assign(prev, summarize(tank, prev.aquascape));
  }

  setCurrent(id: string): void {
    this.index.currentId = id;
    this.writeIndex();
  }

  rename(id: string, name: string): void {
    const t = this.index.tanks.find((q) => q.id === id);
    if (!t) return;
    t.name = name;
    const tank = this.get(id);
    if (tank) {
      tank.name = name;
      this.put(tank);
    } else this.writeIndex();
  }

  /** Delete a tank (remembered, so other devices drop their copies too). */
  remove(id: string): void {
    this.index.deleted = [...(this.index.deleted ?? []).filter((x) => x !== id), id].slice(-MAX_TOMBSTONES);
    this.forget(id);
  }

  /** Drop a tank's entry from this browser only (e.g. its body can't be found right now). */
  forget(id: string): void {
    this.index.tanks = this.index.tanks.filter((t) => t.id !== id);
    this.blobs.delete(id);
    try {
      storage()?.removeItem(TANK_PREFIX + id);
    } catch {
      /* ignore */
    }
    if (this.index.currentId === id) this.index.currentId = this.index.tanks[0]?.id ?? null;
    this.writeIndex();
  }

  /** Index snapshot for syncing to the cloud. */
  snapshot(): LibraryIndex {
    return { currentId: this.index.currentId, tanks: this.index.tanks.map((t) => ({ ...t, size: { ...t.size } })), deleted: [...(this.index.deleted ?? [])] };
  }
}
