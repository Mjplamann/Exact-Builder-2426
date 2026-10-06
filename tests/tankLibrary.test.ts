import { beforeEach, describe, expect, it } from 'vitest';
import { TankLibrary } from '../src/app/tankLibrary';
import { openLibrary } from '../src/app/openLibrary';
import type { CloudSave } from '../src/app/cloudSave';
import { newTank } from '../src/sim/tankFactory';
import type { TankState } from '../src/core/types';

/** In-memory localStorage stand-in. */
class MemStorage {
  private m = new Map<string, string>();
  getItem(k: string) {
    return this.m.has(k) ? this.m.get(k)! : null;
  }
  setItem(k: string, v: string) {
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

const g = globalThis as unknown as { localStorage?: MemStorage };
beforeEach(() => {
  g.localStorage = new MemStorage();
});

function tank(id: string, savedAt: number, extra: Partial<TankState> = {}): TankState {
  const t = newTank({ size: { widthCm: 60, heightCm: 36, depthCm: 30 }, water: 'freshwater', seed: 3, now: 1000 });
  return { ...t, id, name: `Tank ${id}`, lastSavedReal: savedAt, ...extra };
}

/** Fake cloud with fixed bodies (no network). */
function fakeCloud(bodies: Record<string, TankState>, index: Parameters<TankLibrary['mergeSummaries']>[0] | null, deleted: string[] = [], legacy?: TankState) {
  return {
    loadIndex: async () => (index ? { currentId: index[0]?.id ?? null, tanks: index, deleted } : null),
    loadLegacy: async () => (legacy ? JSON.stringify(legacy) : null),
    loadTank: async (id: string) => (bodies[id] ? JSON.stringify(bodies[id]) : null),
  } as unknown as CloudSave;
}

describe('tank library', () => {
  it('stores several tanks, lists them by creation, renames and removes', () => {
    const lib = new TankLibrary();
    lib.put(tank('a', 10, { createdAt: 1 }));
    lib.put(tank('b', 20, { createdAt: 2, water: 'marine' }));
    lib.setCurrent('b');
    expect(lib.list().map((t) => [t.id, t.current])).toEqual([
      ['a', false],
      ['b', true],
    ]);
    lib.rename('a', 'Shrimp cube');
    expect(new TankLibrary().get('a')!.name).toBe('Shrimp cube');
    lib.remove('b');
    const again = new TankLibrary();
    expect(again.list().map((t) => t.id)).toEqual(['a']);
    expect(again.currentId).toBe('a');
    expect(again.snapshot().deleted).toEqual(['b']);
  });

  it('migrates the pre-library single save', () => {
    const old = tank('legacy', 50);
    g.localStorage!.setItem('aquarium.tank.v1', JSON.stringify(old));
    const lib = new TankLibrary();
    expect(lib.currentId).toBe('legacy');
    expect(lib.get('legacy')!.name).toBe('Tank legacy');
    expect(g.localStorage!.getItem('aquarium.tank.v1')).toBeNull();
  });

  it('merges cloud summaries: newer wins, deleted elsewhere stays deleted', () => {
    const lib = new TankLibrary();
    lib.put(tank('a', 10));
    lib.put(tank('b', 10));
    lib.put(tank('c', 10));
    lib.setCurrent('a');
    const lib2 = new TankLibrary();
    lib2.mergeSummaries(
      [
        { ...lib.list()[0], name: 'newer', lastSavedReal: 99 },
        { ...lib.list()[1], id: 'd' },
      ],
      ['b'],
    );
    const ids = lib2.list().map((t) => t.id);
    expect(ids).toContain('d');
    expect(ids).not.toContain('b');
    expect(lib2.list().find((t) => t.id === 'a')!.name).toBe('newer');
  });
});

describe('opening the collection at boot', () => {
  it('first visit: nothing anywhere → no tank (starter tank is built by the app)', async () => {
    const r = await openLibrary(null);
    expect(r.tank).toBeNull();
  });

  it('a new device gets the cloud tanks; the cloud copy wins when newer', async () => {
    const remote = tank('r1', 5000);
    const lib = new TankLibrary();
    const sum = { ...(lib.put(remote), lib.list()[0]) };
    g.localStorage = new MemStorage(); // a different device
    const r = await openLibrary(fakeCloud({ r1: remote }, [sum]));
    expect(r.tank!.id).toBe('r1');
    expect(r.library.get('r1')).not.toBeNull(); // cached locally
  });

  it('keeps the local copy when it is newer than the cloud', async () => {
    const local = tank('x', 9000, { name: 'local' });
    const lib = new TankLibrary();
    lib.put(local);
    lib.setCurrent('x');
    const r = await openLibrary(fakeCloud({ x: { ...local, name: 'cloud', lastSavedReal: 100 } }, [lib.list()[0]]));
    expect(r.tank!.name).toBe('local');
  });

  it('imports the pre-library cloud save on a new device', async () => {
    const r = await openLibrary(fakeCloud({}, null, [], tank('old', 77)));
    expect(r.tank!.id).toBe('old');
  });

  it('falls back to another tank when the current one cannot be found', async () => {
    const lib = new TankLibrary();
    lib.put(tank('a', 10));
    lib.mergeSummaries([{ ...lib.list()[0], id: 'ghost', lastSavedReal: 999 }]);
    lib.setCurrent('ghost');
    const r = await openLibrary(fakeCloud({}, null));
    expect(r.tank!.id).toBe('a');
    expect(r.library.has('ghost')).toBe(false);
    expect(r.library.snapshot().deleted ?? []).not.toContain('ghost');
  });
});
