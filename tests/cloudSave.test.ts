import { afterEach, describe, expect, it } from 'vitest';
import { CloudSave } from '../src/app/cloudSave';
import { newTank } from '../src/sim/tankFactory';

/** Minimal stand-in for the claude.ai runtime: `use('db')` / `use('user')`. */
function fakeClaude(store: Map<string, Record<string, unknown>>, uid: string | null = 'u1') {
  const db = {
    doc(path: string) {
      return {
        async get() {
          const d = store.get(path);
          return { exists: !!d, data: () => d };
        },
        async set(data: Record<string, unknown>) {
          if (JSON.stringify(data).length > 256 * 1024) throw { code: 'invalid_argument' };
          store.set(path, data);
        },
        async delete() {
          store.delete(path);
        },
      };
    },
  };
  const user = { id: async () => uid };
  return { use: async (name: string) => (name === 'db' ? db : name === 'user' ? user : null) };
}

const g = globalThis as unknown as { claude?: unknown };
afterEach(() => {
  delete g.claude;
});

describe('cloud save', () => {
  it('is absent outside a claude.ai viewer', async () => {
    expect(await CloudSave.connect(50)).toBeNull();
  });

  it('is absent without a viewer id', async () => {
    g.claude = fakeClaude(new Map(), null);
    expect(await CloudSave.connect(200)).toBeNull();
  });

  it('round-trips a large tank compressed under the document limit, in the private user path', async () => {
    const store = new Map<string, Record<string, unknown>>();
    g.claude = fakeClaude(store);
    const cloud = await CloudSave.connect(500);
    expect(cloud).not.toBeNull();
    const tank = newTank({ size: { widthCm: 120, heightCm: 50, depthCm: 50 }, water: 'freshwater', seed: 7, now: 1 });
    for (let i = 0; i < 400; i++)
      tank.fish.push({ id: `f${i}`, speciesId: 'paracheirodon-innesi', sex: 'male', bornAt: i, addedAt: i, lengthCm: 3.1, sizeFactor: 1, colorSeed: i * 7919, hunger: 0.3, health: 1, stress: 0.1, stomach: 0.4, generation: 0, pos: [0.1, 0.2, 0.05], heading: 1 });
    for (let i = 0; i < 500; i++) tank.journal.push({ at: i, kind: 'info', text: `Entry number ${i} about the tank's life` });
    expect(JSON.stringify(tank).length).toBeGreaterThan(100_000);
    cloud!.save(tank, true);
    // let the async flush finish
    for (let i = 0; i < 50 && !store.size; i++) await new Promise((r) => setTimeout(r, 20));
    expect([...store.keys()]).toEqual([`data/users/u1/tank-${tank.id}`]);
    const back = await cloud!.loadTank(tank.id);
    expect(JSON.parse(back!).fish).toHaveLength(400);
  });

  it('keeps an index of tanks, deletes queued behind saves, and reads the pre-library save', async () => {
    const store = new Map<string, Record<string, unknown>>();
    const legacy = newTank({ size: { widthCm: 60, heightCm: 36, depthCm: 30 }, water: 'freshwater', seed: 1, now: 5 });
    store.set('data/users/u1/aquarium', { json: JSON.stringify(legacy) });
    g.claude = fakeClaude(store);
    const cloud = (await CloudSave.connect(500))!;
    expect(JSON.parse((await cloud.loadLegacy())!).id).toBe(legacy.id);
    expect(await cloud.loadIndex()).toBeNull();

    cloud.saveIndex({ currentId: 'a', tanks: [], deleted: ['z'] }, true);
    const t = newTank({ size: { widthCm: 45, heightCm: 30, depthCm: 30 }, water: 'marine', seed: 2, now: 9 });
    cloud.save(t, true);
    cloud.deleteTank(t.id);
    for (let i = 0; i < 50; i++) await new Promise((r) => setTimeout(r, 10));
    expect(store.has(`data/users/u1/tank-${t.id}`)).toBe(false);
    expect(await cloud.loadIndex()).toEqual({ currentId: 'a', tanks: [], deleted: ['z'] });
  });
});
