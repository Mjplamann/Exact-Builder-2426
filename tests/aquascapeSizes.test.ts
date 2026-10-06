import { describe, expect, it } from 'vitest';
import type { DecorItem, PlantSpecies, TankSize, TankState, WaterType } from '../src/core/types';
import { PlantIndex } from '../src/data/plantIndex';
import { tankBounds } from '../src/core/tankGeometry';
import { aquascapesFor, tankFromSpec } from '../src/app/biotopes';
import { AQUASCAPES } from '../src/decor/aquascapes';
import { decorShape, itemTransform, itemWorldBounds, sdfEval, toLocal, type V3 } from '../src/decor/shapes';
import { plantMetrics } from '../src/decor/plantMetrics';

const files = import.meta.glob('../src/data/plants/*.json', { eager: true, import: 'default' }) as Record<string, PlantSpecies[]>;
const plants = new PlantIndex(Object.values(files).flat());

/** Every tank the builder allows, from a desktop nano to a public-aquarium giant (W×H×D cm). */
const SIZES: Record<string, TankSize> = {
  nano: { widthCm: 45, heightCm: 30, depthCm: 30 },
  cube: { widthCm: 60, heightCm: 60, depthCm: 60 },
  standard: { widthCm: 120, heightCm: 50, depthCm: 50 },
  long: { widthCm: 150, heightCm: 40, depthCm: 50 },
  tall: { widthCm: 90, heightCm: 75, depthCm: 50 },
  tiny: { widthCm: 30, heightCm: 20, depthCm: 20 },
  huge: { widthCm: 300, heightCm: 120, depthCm: 120 },
};

const SCAPES: { id: string; water: WaterType }[] = (['freshwater', 'brackish', 'marine'] as const).flatMap((water) =>
  aquascapesFor(water).filter((a) => a.id !== 'empty').map((a) => ({ id: a.id, water })),
);

/** The tank the guided builder makes for a style at a size (style defaults, as offered). */
function tankFor(id: string, water: WaterType, size: TankSize, seed: number): TankState {
  const d = aquascapesFor(water, size).find((a) => a.id === id)!.defaults!;
  return tankFromSpec(
    {
      name: id, water, shape: 'custom', size, aquascape: id, cycled: true, stock: [],
      substrate: d.substrate!, background: d.background!, substrateDepthFrontCm: d.substrateDepthFrontCm, substrateDepthBackCm: d.substrateDepthBackCm,
      waterParams: d.waterParams, equipment: d.equipment,
    },
    { now: 1.7e12, seed },
  );
}

const STONE = new Set(['rock', 'cave']);
const HARDSCAPE = new Set(['rock', 'cave', 'driftwood']);
const _l: V3 = [0, 0, 0];

function stoneDistance(item: DecorItem, p: V3): number {
  const shape = decorShape(item);
  if (!shape.sdf) return Infinity;
  const xf = itemTransform(item);
  toLocal(xf, p, _l);
  return sdfEval(shape.sdf, _l[0], _l[1], _l[2]) * xf.s;
}

/** How deep two stones sink into each other (m), sampled through the overlap of their bounds. */
function interpenetration(a: DecorItem, b: DecorItem): number {
  const A = itemWorldBounds(a), B = itemWorldBounds(b);
  const lo = [0, 1, 2].map((k) => Math.max(A.min[k], B.min[k]));
  const hi = [0, 1, 2].map((k) => Math.min(A.max[k], B.max[k]));
  if (lo.some((v, k) => v >= hi[k])) return 0;
  const N = 6;
  let pen = 0;
  for (let i = 0; i < N; i++) {
    for (let j = 0; j < N; j++) {
      for (let k = 0; k < N; k++) {
        const p: V3 = [lo[0] + ((i + 0.5) / N) * (hi[0] - lo[0]), lo[1] + ((j + 0.5) / N) * (hi[1] - lo[1]), lo[2] + ((k + 0.5) / N) * (hi[2] - lo[2])];
        pen = Math.max(pen, Math.min(-stoneDistance(a, p), -stoneDistance(b, p)));
      }
    }
  }
  return pen;
}

const smallestSide = (it: DecorItem) => {
  const b = itemWorldBounds(it);
  return Math.min(b.max[0] - b.min[0], b.max[1] - b.min[1], b.max[2] - b.min[2]);
};

describe('aquascapes at every tank size', () => {
  for (const { id, water } of SCAPES) {
    it(`${id}: contained, sized to the tank, nothing sunk into stone or above the surface`, () => {
      const scape = AQUASCAPES.find((a) => a.id === id)!;
      for (const [sizeName, size] of Object.entries(SIZES)) {
        for (const seed of [11, 4242]) {
          const where = `${id} ${sizeName} seed ${seed}`;
          const tank = tankFor(id, water, size, seed);
          const built = scape.build(tank, plants, tank.seed);
          if (seed === 11) expect(JSON.stringify(scape.build(tank, plants, tank.seed)), `${where} deterministic`).toBe(JSON.stringify(built));
          const b = tankBounds(tank);
          const W = b.halfW * 2;
          tank.decor = built.decor;
          tank.plants = built.plants;

          // Performance budget: a calm scene, not a rubble field.
          expect(built.decor.length, `${where} decor count`).toBeLessThanOrEqual(45);
          expect(built.plants.length, `${where} plant count`).toBeLessThanOrEqual(200);
          expect(built.decor.length + built.plants.length, `${where} empty`).toBeGreaterThan(3);

          // Off the glass, under the surface.
          let biggest = 0;
          for (const d of built.decor) {
            const wb = itemWorldBounds(d);
            expect(wb.min[0], `${where} ${d.variant} left glass`).toBeGreaterThan(-b.halfW + 0.005);
            expect(wb.max[0], `${where} ${d.variant} right glass`).toBeLessThan(b.halfW - 0.005);
            expect(wb.min[2], `${where} ${d.variant} back glass`).toBeGreaterThan(-b.halfD + 0.005);
            expect(wb.max[2], `${where} ${d.variant} front glass`).toBeLessThan(b.halfD - 0.005);
            expect(wb.max[1], `${where} ${d.variant} breaks the surface`).toBeLessThan(b.surfaceY - 0.01);
            if (HARDSCAPE.has(d.kind)) biggest = Math.max(biggest, wb.max[0] - wb.min[0], wb.max[2] - wb.min[2]);
          }
          // Rocks, not boulders, in a nano; not pebbles in a 3 m tank.
          if (biggest > 0) {
            expect(biggest, `${where} largest piece`).toBeLessThanOrEqual(0.9 * W);
            if (sizeName === 'huge') expect(biggest, `${where} largest piece`).toBeGreaterThanOrEqual(0.1 * W);
          }

          // Stones rest against (or are bedded onto) each other, never sunk deep into one another.
          const stones = built.decor.filter((d) => STONE.has(d.kind));
          for (let i = 0; i < stones.length; i++) {
            for (let j = i + 1; j < stones.length; j++) {
              const pen = interpenetration(stones[i], stones[j]);
              const allowed = Math.max(0.012, 0.36 * Math.min(smallestSide(stones[i]), smallestSide(stones[j])));
              expect(pen, `${where} ${stones[i].variant} sunk into ${stones[j].variant}`).toBeLessThanOrEqual(allowed);
            }
          }

          // Plants: right water, rooted in sand (not stone), under the surface, hosts that exist.
          const ids = new Set(built.decor.map((d) => d.id));
          expect(new Set(built.plants.map((p) => p.id)).size).toBe(built.plants.length);
          for (const p of built.plants) {
            const sp = plants.get(p.speciesId)!;
            expect(sp, p.speciesId).toBeDefined();
            expect(sp.water === water || (water === 'brackish' && sp.water === 'freshwater'), `${where} ${p.speciesId} water`).toBe(true);
            if (p.attachedTo) expect(ids.has(p.attachedTo), `${where} ${p.speciesId} host`).toBe(true);
            const floating = sp.placement === 'floating' || sp.form === 'floating';
            if (!p.attachedTo && !floating) {
              for (const s of stones) expect(stoneDistance(s, [p.position[0], p.position[1] + 0.005, p.position[2]]), `${where} ${p.speciesId} rooted in stone`).toBeGreaterThan(-0.004);
            }
            if (!floating && !['ribbon', 'lily', 'bulb'].includes(sp.form)) {
              const m = plantMetrics(sp, p, tank);
              expect(m.height, `${where} ${p.speciesId} pokes out of the water`).toBeLessThanOrEqual(b.surfaceY - m.anchor[1] + 1e-6);
            }
          }
          const rooted = built.plants.filter((p) => !p.attachedTo);
          for (let i = 0; i < rooted.length; i++) {
            for (let j = i + 1; j < rooted.length; j++) {
              const a = rooted[i], c = rooted[j];
              if (a.speciesId === c.speciesId) expect(Math.hypot(a.position[0] - c.position[0], a.position[2] - c.position[2]), `${where} ${a.speciesId} stacked`).toBeGreaterThan(0.004);
            }
          }
        }
      }
    });
  }

  it('builds its focal point on a golden section', () => {
    for (const id of ['iwagumi', 'nature', 'malawi', 'reef', 'nano-reef', 'fowlr', 'brackish-rock', 'nano-shrimp']) {
      const water = SCAPES.find((s) => s.id === id)!.water;
      for (const [sizeName, size] of Object.entries(SIZES)) for (const seed of [7, 4242, 90210]) {
        const tank = tankFor(id, water, size, seed);
        const built = AQUASCAPES.find((a) => a.id === id)!.build(tank, plants, tank.seed);
        const b = tankBounds(tank);
        // The tallest piece of hardscape (by its top) is the focal point.
        let tallest = built.decor[0], top = -1;
        for (const d of built.decor) {
          if (!HARDSCAPE.has(d.kind)) continue;
          const wb = itemWorldBounds(d);
          if (wb.max[1] > top) {
            top = wb.max[1];
            tallest = d;
          }
        }
        const wb = itemWorldBounds(tallest);
        const u = ((wb.min[0] + wb.max[0]) / 2 + b.halfW) / (2 * b.halfW);
        expect(Math.min(Math.abs(u - 0.382), Math.abs(u - 0.618)), `${id} ${sizeName} seed ${seed} focal at u=${u.toFixed(2)}`).toBeLessThan(0.17);
      }
    }
  });

  it('chooses plants by the height of the water: tall stems in tall tanks, short ones in a nano', () => {
    const tallest = (id: string, size: TankSize) => {
      const tank = tankFor(id, 'freshwater', size, 5);
      const built = AQUASCAPES.find((a) => a.id === id)!.build(tank, plants, tank.seed);
      return Math.max(...built.plants.map((p) => plants.get(p.speciesId)!).filter((sp) => sp.form === 'stem' || sp.form === 'fine-stem').map((sp) => sp.maxHeightCm));
    };
    expect(tallest('dutch', SIZES.tall)).toBeGreaterThan(tallest('dutch', SIZES.tiny));
    expect(tallest('nature', SIZES.tall)).toBeGreaterThanOrEqual(tallest('nature', SIZES.nano));
    // No Amazon sword crowding a desktop tank.
    const tiny = tankFor('amazon', 'freshwater', SIZES.tiny, 5);
    const built = AQUASCAPES.find((a) => a.id === 'amazon')!.build(tiny, plants, tiny.seed);
    expect(built.plants.some((p) => p.speciesId.startsWith('echinodorus'))).toBe(false);
  });

  it('scales hardscape with the tank', () => {
    const scaleOf = (id: string, water: WaterType, size: TankSize) => {
      const tank = tankFor(id, water, size, 3);
      const built = AQUASCAPES.find((a) => a.id === id)!.build(tank, plants, tank.seed);
      return Math.max(...built.decor.filter((d) => HARDSCAPE.has(d.kind)).map((d) => d.scale));
    };
    for (const { id, water } of SCAPES) {
      if (id === 'dutch') continue;
      expect(scaleOf(id, water, SIZES.huge), id).toBeGreaterThan(scaleOf(id, water, SIZES.nano));
    }
  });
});
