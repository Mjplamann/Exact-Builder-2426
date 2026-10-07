import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { TankLibrary, cleanTankName } from '../src/app/tankLibrary';
import { fetchTank, openLibrary } from '../src/app/openLibrary';
import { CloudSave, mergeIndexes } from '../src/app/cloudSave';
import { newTank } from '../src/sim/tankFactory';
import type { TankState } from '../src/core/types';

/**
 * The tank collection under abuse: no storage, a full storage, malformed or unreachable cloud
 * data and a second device writing the same cloud index. Nothing here may lose a tank.
 */

class MemStorage {
  m = new Map<string, string>();
  /** Keys starting with this throw QuotaExceededError on write. */
  full: string | null = null;
  getItem(k: string) {
    return this.m.has(k) ? this.m.get(k)! : null;
  }
  setItem(k: string, v: string) {
    if (this.full !== null && k.startsWith(this.full)) throw Object.assign(new Error('full'), { name: 'QuotaExceededError' });
    this.m.set(k, String(v));
  }
  removeItem(k: string) {
    this.m.delete(k);
  }
  clear() {
    this.m.clear();
  }
  key(i: number) {
    return [...this.m.keys()][i] ?? null;
  }
  get length() {
    return this.m.size;
  }
}

const g = globalThis as unknown as { localStorage?: MemStorage; claude?: unknown };
let store: MemStorage;
beforeEach(() => {
  store = new MemStorage();
  Object.defineProperty(globalThis, 'localStorage', { configurable: true, writable: true, value: store });
});
afterEach(() => {
  delete g.claude;
});

function tank(id: string, savedAt: number, extra: Partial<TankState> = {}): TankState {
  const t = newTank({ size: { widthCm: 60, heightCm: 36, depthCm: 30 }, water: 'freshwater', seed: 3, now: 1000 });
  return { ...t, id, name: `Tank ${id}`, lastSavedReal: savedAt, ...extra };
}

type Doc = Record<string, unknown>;
/** The claude.ai runtime stand-in, shared by "devices"; `fail`/`hang` simulate a flaky network. */
function fakeClaude(docs: Map<string, Doc>, opts: { fail?: (path: string, op: 'get' | 'set' | 'delete') => boolean; hang?: (path: string) => boolean } = {}) {
  const db = {
    doc(path: string) {
      return {
        async get() {
          if (opts.hang?.(path)) return new Promise<never>(() => {});
          if (opts.fail?.(path, 'get')) throw new Error('network');
          const d = docs.get(path);
          return { exists: !!d, data: () => (d ? JSON.parse(JSON.stringify(d)) : undefined) };
        },
        async set(data: Doc) {
          if (opts.fail?.(path, 'set')) throw new Error('network');
          docs.set(path, JSON.parse(JSON.stringify(data)));
        },
        async delete() {
          if (opts.fail?.(path, 'delete')) throw new Error('network');
          docs.delete(path);
        },
      };
    },
  };
  return { use: async (name: string) => (name === 'db' ? db : name === 'user' ? { id: async () => 'u1' } : null) };
}

const settle = async (ms = 60) => {
  for (let i = 0; i < ms / 10; i++) await new Promise((r) => setTimeout(r, 10));
};

describe('tank library without usable storage', () => {
  it('keeps every tank in memory when localStorage is missing (private mode / blocked storage)', () => {
    Object.defineProperty(globalThis, 'localStorage', {
      configurable: true,
      get() {
        throw new Error('SecurityError: access denied');
      },
    });
    const lib = new TankLibrary();
    lib.put(tank('a', 10));
    lib.put(tank('b', 20));
    expect(lib.get('a')?.id).toBe('a');
    expect(lib.get('b')?.id).toBe('b');
  });

  it('reports a refused write, keeps the newest copy readable, and stores it once space frees up', () => {
    const lib = new TankLibrary();
    lib.put(tank('a', 10, { name: 'old' }));
    store.full = 'aquarium.tank.v1:';
    expect(lib.put(tank('a', 20, { name: 'new' }))).toBe(false);
    expect(lib.get('a')!.name).toBe('new');
    expect(lib.storageFull).toBe(true);
    store.full = null;
    expect(lib.put(tank('a', 30, { name: 'newer' }))).toBe(true);
    expect(lib.storageFull).toBe(false);
    expect(new TankLibrary().get('a')!.name).toBe('newer');
  });

  it('migrates the pre-library save even when storage is too full to hold both copies at once', () => {
    store.setItem('aquarium.tank.v1', JSON.stringify(tank('legacy', 50)));
    store.full = 'aquarium.tank.v1:';
    let lib = new TankLibrary();
    // Could not copy it yet: the old save must still be there.
    expect(lib.get('legacy')).not.toBeNull();
    store.full = null;
    lib = new TankLibrary();
    expect(lib.currentId).toBe('legacy');
    expect(store.getItem('aquarium.tank.v1:legacy')).not.toBeNull();
  });

  it('never lists malformed summaries (an older app version, a hand-edited cloud index)', () => {
    const lib = new TankLibrary();
    lib.put(tank('a', 10));
    lib.mergeSummaries([
      { id: 'b' } as never,
      null as never,
      { ...lib.list()[0], id: 'c', name: '   ' },
      { ...lib.list()[0], id: 'd', size: { widthCm: 'x' } } as never,
    ]);
    for (const t of lib.list()) {
      expect(typeof t.name).toBe('string');
      expect(t.name.trim().length).toBeGreaterThan(0);
      expect(Number.isFinite(t.size.widthCm)).toBe(true);
      expect(Number.isFinite(t.liters)).toBe(true);
      expect(['freshwater', 'brackish', 'marine']).toContain(t.water);
    }
    expect(lib.list().map((t) => t.id).sort()).toEqual(['a', 'b', 'c', 'd']);
  });

  it('knows which ids were deleted (an import must not reuse one)', () => {
    const lib = new TankLibrary();
    lib.put(tank('a', 10));
    lib.put(tank('b', 10));
    lib.remove('a');
    expect(lib.isDeleted('a')).toBe(true);
    expect(lib.isDeleted('b')).toBe(false);
  });
});

describe('cloud failures never cost a tank', () => {
  it('a cloud read that never answers falls back to this browser’s copy', async () => {
    const docs = new Map<string, Doc>();
    g.claude = fakeClaude(docs, { hang: (p) => p.includes('tank-') });
    const cloud = (await CloudSave.connect(500))!;
    cloud.readTimeoutMs = 80;
    const lib = new TankLibrary();
    lib.put(tank('a', 10));
    const t = await fetchTank(lib, cloud, 'a');
    expect(t?.id).toBe('a');
  });

  it('a transient cloud failure at boot does not drop tanks from the collection', async () => {
    const docs = new Map<string, Doc>();
    // Device 1 saved two tanks to the cloud.
    g.claude = fakeClaude(docs);
    let cloud = (await CloudSave.connect(500))!;
    const lib1 = new TankLibrary();
    lib1.put(tank('a', 10));
    lib1.put(tank('b', 20));
    lib1.setCurrent('b');
    cloud.save(lib1.get('a')!, true);
    cloud.save(lib1.get('b')!, true);
    cloud.saveIndex(lib1.snapshot(), true);
    await settle();
    expect(docs.has('data/users/u1/tanks')).toBe(true);

    // The phone's storage was evicted, and tank bodies can't be read right now.
    store = new MemStorage();
    Object.defineProperty(globalThis, 'localStorage', { configurable: true, writable: true, value: store });
    g.claude = fakeClaude(docs, { fail: (p, op) => op === 'get' && p.includes('tank-') });
    cloud = (await CloudSave.connect(500))!;
    const { library, tank: open } = await openLibrary(cloud);
    expect(open).toBeNull();
    // Both tanks are still known (they open once the network is back)…
    expect(library.list().map((t) => t.id).sort()).toEqual(['a', 'b']);
    // …and the starter tank the app then saves doesn't wipe them from the cloud index.
    const starter = tank('s', 30);
    library.put(starter);
    library.setCurrent('s');
    cloud.saveIndex(library.snapshot(), true);
    await settle();
    const idx = docs.get('data/users/u1/tanks') as { tanks: { id: string }[] };
    expect(idx.tanks.map((t) => t.id).sort()).toEqual(['a', 'b', 's']);
  });

  it('a tank the cloud definitively lacks (and this browser too) is dropped at boot', async () => {
    const docs = new Map<string, Doc>();
    g.claude = fakeClaude(docs);
    const cloud = (await CloudSave.connect(500))!;
    const lib = new TankLibrary();
    lib.put(tank('a', 10));
    lib.mergeSummaries([{ ...lib.list()[0], id: 'ghost', lastSavedReal: 999 }]);
    lib.setCurrent('ghost');
    const r = await openLibrary(cloud);
    expect(r.tank!.id).toBe('a');
    expect(r.library.has('ghost')).toBe(false);
  });

  it('an index that cannot be read is not overwritten blindly', async () => {
    const docs = new Map<string, Doc>();
    docs.set('data/users/u1/tanks', { currentId: 'x', tanks: [{ id: 'x' }], deleted: [] });
    g.claude = fakeClaude(docs, { fail: (p, op) => op === 'get' && p.endsWith('/tanks') });
    const cloud = (await CloudSave.connect(500))!;
    cloud.saveIndex({ currentId: 'y', tanks: [], deleted: [] }, true);
    await settle();
    expect((docs.get('data/users/u1/tanks') as { currentId: string }).currentId).toBe('x');
  });
});

describe('two devices, one cloud', () => {
  it('index writes merge: a tank made on the phone survives the desktop’s next save, and the desktop learns of it', async () => {
    const docs = new Map<string, Doc>();
    g.claude = fakeClaude(docs);
    const desktop = (await CloudSave.connect(500))!;
    const phone = (await CloudSave.connect(500))!;
    const libD = new TankLibrary();
    libD.put(tank('a', 10));
    libD.setCurrent('a');
    desktop.saveIndex(libD.snapshot(), true);
    await settle();

    // The phone (its own storage) adds a tank.
    const deskStore = store;
    store = new MemStorage();
    Object.defineProperty(globalThis, 'localStorage', { configurable: true, writable: true, value: store });
    const { library: libP } = await openLibrary(phone);
    libP.put(tank('p', 50, { createdAt: 5000 }));
    libP.setCurrent('p');
    phone.saveIndex(libP.snapshot(), true);
    await settle();

    // Back on the desktop (still running, never rebooted): its next index write keeps the phone's tank.
    Object.defineProperty(globalThis, 'localStorage', { configurable: true, writable: true, value: deskStore });
    let learnt: string[] = [];
    desktop.onRemoteIndex = (idx) => {
      libD.mergeSummaries(idx.tanks, idx.deleted);
      learnt = libD.list().map((t) => t.id);
    };
    desktop.saveIndex(libD.snapshot(), true);
    await settle();
    const idx = docs.get('data/users/u1/tanks') as { tanks: { id: string }[]; currentId: string };
    expect(idx.tanks.map((t) => t.id).sort()).toEqual(['a', 'p']);
    expect(learnt.sort()).toEqual(['a', 'p']);
  });

  it('a deletion on one device sticks even when the other writes its older index afterwards', async () => {
    const docs = new Map<string, Doc>();
    g.claude = fakeClaude(docs);
    const one = (await CloudSave.connect(500))!;
    const two = (await CloudSave.connect(500))!;
    const lib = new TankLibrary();
    lib.put(tank('a', 10));
    lib.put(tank('b', 10));
    lib.setCurrent('a');
    const stale = lib.snapshot();
    lib.remove('b');
    one.saveIndex(lib.snapshot(), true);
    await settle();
    two.saveIndex(stale, true);
    await settle();
    const idx = docs.get('data/users/u1/tanks') as { tanks: { id: string }[]; deleted: string[] };
    expect(idx.tanks.map((t) => t.id)).toEqual(['a']);
    expect(idx.deleted).toContain('b');
  });

  it('a tank deleted on another device does not open at boot here', async () => {
    const lib = new TankLibrary();
    lib.put(tank('a', 10));
    lib.put(tank('b', 20));
    lib.setCurrent('b');
    const cloud = {
      loadIndex: async () => ({ currentId: 'a', tanks: lib.snapshot().tanks.filter((t) => t.id === 'a'), deleted: ['b'] }),
      loadLegacy: async () => null,
      loadTank: async () => null,
      readTank: async () => ({ json: null, ok: true }),
    } as unknown as CloudSave;
    const r = await openLibrary(cloud);
    expect(r.tank!.id).toBe('a');
    expect(r.library.has('b')).toBe(false);
  });
});

describe('names and merges', () => {
  it('cleans tank names: trimmed, single-spaced, no control characters, at most 80 chars', () => {
    expect(cleanTankName('  Shrimp \n\t cube  ')).toBe('Shrimp cube');
    expect(cleanTankName('\u0000\u2028')).toBe('');
    expect(cleanTankName('x'.repeat(200))).toHaveLength(80);
    expect(cleanTankName(42)).toBe('');
  });

  it('mergeIndexes keeps the newer summary, both sides’ tanks and deletions, and this device’s open tank', () => {
    const base = { name: 'n', water: 'freshwater' as const, size: { widthCm: 60, heightCm: 36, depthCm: 30 }, liters: 50, animals: 0, species: 0, createdAt: 1 };
    const local = {
      currentId: 'a',
      tanks: [
        { ...base, id: 'a', name: 'local a', lastSavedReal: 10 },
        { ...base, id: 'b', name: 'local b', lastSavedReal: 5 },
      ],
      deleted: ['x'],
    };
    const remote = {
      currentId: 'c',
      tanks: [
        { ...base, id: 'a', name: 'remote a', lastSavedReal: 9 },
        { ...base, id: 'b', name: 'remote b', lastSavedReal: 7 },
        { ...base, id: 'c', name: 'remote c', lastSavedReal: 7 },
        { ...base, id: 'x', name: 'deleted here', lastSavedReal: 99 },
      ],
      deleted: ['y'],
    };
    const m = mergeIndexes(local, remote);
    expect(m.currentId).toBe('a');
    expect(Object.fromEntries(m.tanks.map((t) => [t.id, t.name]))).toEqual({ a: 'local a', b: 'remote b', c: 'remote c' });
    expect(m.deleted!.sort()).toEqual(['x', 'y']);
  });
});
