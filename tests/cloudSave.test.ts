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
    expect([...store.keys()]).toEqual(['data/users/u1/aquarium']);
    const back = await cloud!.load();
    expect(JSON.parse(back!).fish).toHaveLength(400);
  });
});
