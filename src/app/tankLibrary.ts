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
const WATERS = new Set(['freshwater', 'brackish', 'marine']);

function storage(): Storage | null {
  try {
    return typeof localStorage !== 'undefined' && localStorage ? localStorage : null;
  } catch {
    return null;
  }
}

/** A tank name fit to show: no control characters or runs of spaces, trimmed, at most 80 chars. */
export function cleanTankName(name: unknown): string {
  return typeof name === 'string'
    ? name
        .replace(/[\u0000-\u001f\u007f\u2028\u2029]/g, ' ')
        .replace(/\s+/g, ' ')
        .trim()
        .slice(0, 80)
        .trim()
    : '';
}

const finite = (v: unknown, def: number, min = 0): number => (typeof v === 'number' && Number.isFinite(v) ? Math.max(min, v) : def);

/**
 * A summary read from storage or another device, made safe to list (an older app version or a
 * damaged document must never break the tank menu). null when it has no usable id.
 */
export function cleanSummary(raw: unknown): Omit<TankSummary, 'current'> | null {
  if (!raw || typeof raw !== 'object') return null;
  const r = raw as Record<string, unknown>;
  if (typeof r.id !== 'string' || !r.id) return null;
  const sz = (r.size && typeof r.size === 'object' ? r.size : {}) as Record<string, unknown>;
  const size = { widthCm: finite(sz.widthCm, 60, 1), heightCm: finite(sz.heightCm, 36, 1), depthCm: finite(sz.depthCm, 30, 1) };
  const water = typeof r.water === 'string' && WATERS.has(r.water) ? (r.water as TankSummary['water']) : 'freshwater';
  return {
    id: r.id.slice(0, 120),
    name: cleanTankName(r.name) || (water === 'marine' ? 'My Reef' : 'My Aquarium'),
    water,
    size,
    liters: Math.round(finite(r.liters, (size.widthCm * size.heightCm * size.depthCm) / 1000)),
    animals: Math.round(finite(r.animals, 0)),
    species: Math.round(finite(r.species, 0)),
    createdAt: finite(r.createdAt, 0),
    lastSavedReal: finite(r.lastSavedReal, 0),
    aquascape: typeof r.aquascape === 'string' ? r.aquascape : undefined,
  };
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
  /** Copies this browser could not store (no storage, storage full): the only copies until a write succeeds. */
  private blobs = new Map<string, string>();
  private refused = false;

  constructor() {
    this.load();
  }

  /** Does this browser keep the collection between visits (false: private mode / blocked storage)? */
  get persistent(): boolean {
    return storage() !== null;
  }

  /** The last tank write was refused (storage full): that tank's newest copy lives only in memory. */
  get storageFull(): boolean {
    return this.refused;
  }

  private load(): void {
    const s = storage();
    try {
      const raw = s?.getItem(INDEX_KEY);
      if (raw) {
        const idx = JSON.parse(raw) as LibraryIndex;
        if (idx && Array.isArray(idx.tanks)) {
          const tanks: LibraryIndex['tanks'] = [];
          for (const t of idx.tanks) {
            const c = cleanSummary(t);
            if (c && !tanks.some((q) => q.id === c.id)) tanks.push(c);
          }
          this.index = {
            currentId: typeof idx.currentId === 'string' ? idx.currentId : null,
            tanks,
            deleted: Array.isArray(idx.deleted) ? idx.deleted.filter((x) => typeof x === 'string') : [],
          };
        }
      }
    } catch {
      /* unreadable index: start empty */
    }
    // Migrate the pre-library single save. The old key is removed only once its tank is safely
    // stored under the new one (a nearly full storage may not hold both copies at once).
    let legacy: string | null | undefined;
    try {
      legacy = s?.getItem(LEGACY_KEY);
    } catch {
      legacy = null;
    }
    if (!legacy || !s) return;
    let tank: TankState;
    try {
      tank = importTank(legacy);
    } catch {
      return; // unreadable: leave it alone
    }
    if (this.isDeleted(tank.id)) {
      this.removeLegacy(s);
      return;
    }
    const stored = this.storedJson(tank.id);
    let known: TankState | null = null;
    try {
      known = stored ? importTank(stored) : null;
    } catch {
      known = null;
    }
    if (known && known.lastSavedReal >= tank.lastSavedReal) {
      this.removeLegacy(s);
      return;
    }
    let ok = this.put(tank);
    if (!ok) {
      // Make room by dropping the old key first, and put it back if the copy still doesn't fit.
      this.removeLegacy(s);
      ok = this.put(tank);
      if (!ok) {
        try {
          s.setItem(LEGACY_KEY, legacy);
        } catch {
          /* the in-memory copy remains for this session */
        }
      }
    } else this.removeLegacy(s);
    if (!this.index.currentId || !this.has(this.index.currentId)) this.index.currentId = tank.id;
    this.writeIndex();
  }

  private removeLegacy(s: Storage): void {
    try {
      s.removeItem(LEGACY_KEY);
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

  private storedJson(id: string): string | null {
    try {
      return storage()?.getItem(TANK_PREFIX + id) ?? null;
    } catch {
      return null;
    }
  }

  get currentId(): string | null {
    return this.index.currentId;
  }

  list(): TankSummary[] {
    return this.index.tanks
      .map((t) => ({ ...t, size: { ...t.size }, current: t.id === this.index.currentId }))
      .sort((a, b) => a.createdAt - b.createdAt);
  }

  has(id: string): boolean {
    return this.index.tanks.some((t) => t.id === id);
  }

  /** Was this id deleted (here or on another device)? A new tank must never reuse one. */
  isDeleted(id: string): boolean {
    return !!this.index.deleted?.includes(id);
  }

  /** Raw JSON of a stored tank, or null. */
  read(id: string): string | null {
    return this.blobs.get(id) ?? this.storedJson(id);
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

  /**
   * Store (insert or update) a tank and its summary. Returns false if the browser refused (storage
   * full or unavailable): the copy is then kept in memory, so the tank still opens this session.
   */
  put(tank: TankState, aquascape?: string): boolean {
    let json = JSON.stringify(tank);
    if (json.length > MAX_TANK_CHARS && tank.journal.length > 100) {
      tank.journal.splice(0, tank.journal.length - 100);
      json = JSON.stringify(tank);
    }
    const prev = this.index.tanks.find((t) => t.id === tank.id);
    const sum = summarize(tank, aquascape ?? prev?.aquascape);
    if (prev) Object.assign(prev, sum);
    else this.index.tanks.push(sum);
    const s = storage();
    let ok = false;
    if (s) {
      try {
        s.setItem(TANK_PREFIX + tank.id, json);
        ok = true;
      } catch {
        ok = false;
      }
      this.refused = !ok;
    }
    // Keep memory lean once safely stored; otherwise this is the only copy.
    if (ok) this.blobs.delete(tank.id);
    else this.blobs.set(tank.id, json);
    this.writeIndex();
    return ok;
  }

  /**
   * Merge summaries learnt from elsewhere (the cloud index) without overwriting newer local ones;
   * tanks deleted elsewhere (`deleted`) are dropped here too — the open tank only when
   * `dropCurrent` (at boot, before anything is shown). Returns whether the collection changed.
   */
  mergeSummaries(remote: Omit<TankSummary, 'current'>[], deleted: string[] = [], opts: { dropCurrent?: boolean } = {}): boolean {
    let changed = false;
    const gone = new Set([...(this.index.deleted ?? []), ...deleted.filter((x) => typeof x === 'string')]);
    for (const id of gone) {
      if (this.has(id) && (opts.dropCurrent || id !== this.index.currentId)) {
        this.forget(id);
        changed = true;
      }
    }
    this.index.deleted = [...gone].slice(-MAX_TOMBSTONES);
    for (const raw of Array.isArray(remote) ? remote : []) {
      const r = cleanSummary(raw);
      if (!r || gone.has(r.id)) continue;
      const local = this.index.tanks.find((t) => t.id === r.id);
      if (!local) {
        this.index.tanks.push(r);
        changed = true;
      } else if (r.lastSavedReal > local.lastSavedReal) {
        Object.assign(local, r);
        changed = true;
      }
    }
    this.writeIndex();
    return changed;
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

  /** Drop a tank's entry from this browser only (e.g. its body can't be found anywhere). */
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
