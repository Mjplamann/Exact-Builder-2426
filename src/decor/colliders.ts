import type { Collider, CoverPoint, PlantForm, TankState } from '../core/types';
import type { PlantIndex } from '../data/plantIndex';
import { substrateHeight } from '../core/tankGeometry';
import { decorShape, itemTransform, toWorld, type ItemXf, type V3 } from './shapes';
import { anemoneDisc, plantMetrics } from './plantMetrics';

/**
 * Approximate every decor item (and dense plants) with simple colliders for fish avoidance and
 * list shelter points for shy / cave-dwelling animals. Must agree with the procedural meshes
 * generated from the same item seeds — both read the same `decorShape()` parameters.
 *
 * Pure: no rendering imports; deterministic for a given tank.
 */
export function buildColliders(tank: TankState, plants: PlantIndex): { colliders: Collider[]; cover: CoverPoint[] } {
  const colliders: Collider[] = [];
  const cover: CoverPoint[] = [];
  const w: V3 = [0, 0, 0];

  for (const item of tank.decor) {
    const shape = decorShape(item);
    const xf = itemTransform(item);
    const s = xf.s;
    for (const c of shape.colliders) {
      if (c.type === 'sphere') {
        colliders.push({ type: 'sphere', center: tw(xf, c.a, w), radius: (c.radius ?? 0.01) * s, ownerId: item.id, cover: c.cover });
      } else if (c.type === 'capsule' && c.b) {
        colliders.push({ type: 'capsule', a: tw(xf, c.a, w), b: tw(xf, c.b, w), radius: (c.radius ?? 0.01) * s, ownerId: item.id, cover: c.cover });
      } else if (c.type === 'box' && c.half) {
        colliders.push({
          type: 'box',
          center: tw(xf, c.a, w),
          halfExtents: [c.half[0] * s, c.half[1] * s, c.half[2] * s],
          rotationY: (c.rotY ?? 0) + item.rotation[1],
          ownerId: item.id,
          cover: c.cover,
        });
      }
    }
    for (const cv of shape.cover) {
      cover.push({ position: tw(xf, cv.p, w), radius: cv.radius * s, ownerId: item.id, kind: cv.kind });
    }
  }

  // Crevices between neighbouring rocks: where two rock footprints nearly touch, small animals
  // (shrimp, gobies, blennies, plecos) find a gap at the base.
  const rocks = tank.decor.filter((d) => d.kind === 'rock' || d.kind === 'cave');
  const crevices: [number, number, number][] = [];
  for (let i = 0; i < rocks.length; i++) {
    for (let j = i + 1; j < rocks.length; j++) {
      const a = rocks[i], b = rocks[j];
      const ra = footprint(a), rb = footprint(b);
      const dx = b.position[0] - a.position[0], dz = b.position[2] - a.position[2];
      const d = Math.hypot(dx, dz);
      const gap = d - ra - rb;
      // Only rocks resting on the substrate form a crevice at its level.
      const onSand = (it: typeof a) => it.position[1] - substrateHeight(tank, it.position[0], it.position[2]) < 0.02;
      if (gap > -Math.min(ra, rb) * 0.6 && gap < 0.03 && onSand(a) && onSand(b)) {
        const t = ra / (ra + rb || 1);
        const p: [number, number, number] = [a.position[0] + dx * t, Math.min(a.position[1], b.position[1]) + 0.015, a.position[2] + dz * t];
        if (crevices.some((q) => Math.hypot(q[0] - p[0], q[2] - p[2]) < 0.05)) continue;
        crevices.push(p);
        cover.push({ position: p, radius: Math.max(0.012, Math.min(0.035, (ra + rb) * 0.12)), ownerId: a.id, kind: 'crevice' });
      }
    }
  }

  // Plants: thickets as cover, anemones as hosts, hard corals as obstacles.
  for (const p of tank.plants) {
    const sp = plants.get(p.speciesId);
    if (!sp) continue;
    const m = plantMetrics(sp, p, tank);
    const [ax, ay, az] = m.anchor;
    switch (sp.form) {
      case 'anemone': {
        const disc = anemoneDisc(m);
        cover.push({ position: disc, radius: Math.max(0.03, m.spread * 0.45), ownerId: p.id, kind: 'anemone' });
        break;
      }
      case 'floating': {
        // Surface fish (hatchetfish, bettas, fry) shelter under floating mats.
        cover.push({ position: [ax, ay - 0.03, az], radius: Math.max(0.03, m.spread * 0.45), ownerId: p.id, kind: 'plants' });
        break;
      }
      case 'sps-coral':
      case 'lps-coral': {
        const r = Math.max(0.015, Math.min(m.spread, m.height * 1.4) * 0.38);
        if (isMassive(sp.form, sp.id)) {
          colliders.push({ type: 'sphere', center: [ax, ay + r * 0.6, az], radius: r, ownerId: p.id });
        }
        if (sp.form === 'sps-coral' && m.spread > 0.06) {
          // Chromis and gobies dive into branching acropora.
          cover.push({ position: [ax, ay + m.height * 0.5, az], radius: m.spread * 0.35, ownerId: p.id, kind: 'plants' });
        }
        break;
      }
      default: {
        if (THICKET.has(sp.form) && m.height > 0.04 && m.spread > 0.03) {
          const up = Math.min(m.height * 0.35, 0.14);
          cover.push({ position: [ax, ay + up, az], radius: Math.min(0.12, Math.max(0.025, m.spread * 0.4)), ownerId: p.id, kind: 'plants' });
        }
      }
    }
  }
  return { colliders, cover };
}

/** Plant forms dense enough to hide fish. */
const THICKET = new Set<PlantForm>(['rosette', 'ribbon', 'stem', 'fine-stem', 'epiphyte-fern', 'epiphyte-broadleaf', 'bulb', 'lily', 'moss', 'macroalgae', 'seagrass', 'soft-coral', 'gorgonian', 'grass']);

/** Stony corals that form a solid head fish must swim around. */
function isMassive(form: PlantForm, id: string): boolean {
  if (form === 'sps-coral') return !/digitata|seriatopora|birdsnest/.test(id);
  return /favia|favites|brain|platygyra|goniopora|acan|lobophyllia|trachyphyllia|bubble|plerogyra|caulastrea|candy/.test(id);
}

function tw(xf: ItemXf, p: V3, tmp: V3): [number, number, number] {
  toWorld(xf, p, tmp);
  return [tmp[0], tmp[1], tmp[2]];
}

function footprint(item: { kind: string; variant: string; seed: number; scale: number }): number {
  const shape = decorShape(item as never);
  const b = shape.bounds;
  return Math.max(0.01, (Math.max(b.max[0] - b.min[0], b.max[2] - b.min[2]) / 2) * (item.scale || 1));
}
