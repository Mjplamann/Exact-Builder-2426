import type { DecorItem, DecorKind, PlantInstance, PlantSpecies, TankState, WaterType } from '../core/types';
import type { PlantIndex } from '../data/plantIndex';
import { Rng } from '../core/rng';
import { substrateHeight, tankBounds } from '../core/tankGeometry';
import { catalogEntry } from './catalog';
import {
  decorShape, hostAnchor, itemTransform, itemWorldBounds, liveRockForm, sampleHostSurface, toWorld,
  type LiveRockForm, type V3,
} from './shapes';

export interface Aquascape {
  id: string;
  name: string;
  description: string;
  water: WaterType;
  /** Lay out hardscape and plants for the given tank (size/substrate already set). Deterministic per seed. */
  build(tank: TankState, plants: PlantIndex, seed: number): { decor: DecorItem[]; plants: PlantInstance[] };
}

/** φ − 1: the golden section used for focal points. */
const PHI = 0.618034;

// ---------------------------------------------------------------------------------------------
// Layout helper
// ---------------------------------------------------------------------------------------------

interface DecorOpts {
  scale?: number;
  rotY?: number;
  rotX?: number;
  rotZ?: number;
  /** Absolute base height (stacked rocks); default: substrate height. */
  y?: number;
  seed?: number;
  /** Sink the item a little into the substrate (m). */
  sink?: number;
}

/**
 * Accumulates a layout. Coordinates are meters in tank space; helper fractions:
 * u ∈ [0, 1] left → right, v ∈ [0, 1] back → front.
 */
class Scape {
  readonly decor: DecorItem[] = [];
  readonly plants: PlantInstance[] = [];
  readonly rng: Rng;
  readonly halfW: number;
  readonly halfD: number;
  readonly H: number;
  readonly surfaceY: number;
  /** Tank-size factor relative to a 120 cm show tank (scales hardscape). */
  readonly k: number;
  /** Mirror the composition left/right (seeded variety). */
  readonly flip: boolean;
  private n = 0;

  constructor(readonly tank: TankState, readonly lib: PlantIndex, readonly seed: number) {
    this.rng = new Rng(seed ^ 0x3c6ef372);
    const b = tankBounds(tank);
    this.halfW = b.halfW;
    this.halfD = b.halfD;
    this.H = b.height;
    this.surfaceY = b.surfaceY;
    this.k = Math.min(1.5, Math.max(0.38, Math.min(tank.size.widthCm / 120, (tank.size.heightCm / 50) * 1.1, (tank.size.depthCm / 50) * 1.2)));
    this.flip = this.rng.chance(0.5);
  }

  get W(): number {
    return this.halfW * 2;
  }
  get D(): number {
    return this.halfD * 2;
  }

  /** x from u (0 left … 1 right), mirrored when `flip`. */
  x(u: number): number {
    const uu = this.flip ? 1 - u : u;
    return -this.halfW + uu * this.W;
  }
  /** z from v (0 back … 1 front). */
  z(v: number): number {
    return -this.halfD + v * this.D;
  }
  /** Mirror a yaw for flipped layouts. */
  yaw(a: number): number {
    return this.flip ? Math.PI - a : a;
  }

  private id(prefix: string): string {
    return `${prefix}-${(this.seed >>> 0).toString(36)}-${(this.n++).toString(36)}`;
  }

  /** Keep a footprint inside the glass with a margin. */
  clamp(x: number, z: number, r: number): [number, number] {
    const m = 0.025 + r;
    return [Math.max(-this.halfW + m, Math.min(this.halfW - m, x)), Math.max(-this.halfD + m, Math.min(this.halfD - m, z))];
  }

  ground(x: number, z: number): number {
    return substrateHeight(this.tank, x, z);
  }

  addDecor(kind: DecorKind, variant: string, x: number, z: number, o: DecorOpts = {}): DecorItem {
    const scale = o.scale ?? 1;
    const size = catalogEntry(kind, variant).size * scale * 0.5;
    const [cx, cz] = this.clamp(x, z, size * 0.8);
    const item: DecorItem = {
      id: this.id('d'),
      kind,
      variant,
      seed: o.seed ?? this.rng.int(1, 2 ** 31 - 2),
      position: [cx, (o.y ?? this.ground(cx, cz)) - (o.sink ?? 0), cz],
      rotation: [o.rotX ?? 0, o.rotY ?? this.rng.range(0, Math.PI * 2), o.rotZ ?? 0],
      scale,
    };
    // Make sure the footprint (after rotation) stays off the glass.
    const wb = itemWorldBounds(item);
    const m = 0.02;
    let dx = 0, dz = 0;
    if (wb.min[0] < -this.halfW + m) dx = -this.halfW + m - wb.min[0];
    if (wb.max[0] > this.halfW - m) dx = this.halfW - m - wb.max[0];
    if (wb.min[2] < -this.halfD + m) dz = -this.halfD + m - wb.min[2];
    if (wb.max[2] > this.halfD - m) dz = this.halfD - m - wb.max[2];
    if (dx || dz) {
      item.position[0] += dx;
      item.position[2] += dz;
      if (o.y === undefined) item.position[1] = this.ground(item.position[0], item.position[2]) - (o.sink ?? 0);
    }
    this.decor.push(item);
    return item;
  }

  /** A seed whose live-rock silhouette is the wanted form. */
  liveRockSeed(form: LiveRockForm): number {
    for (let i = 0; i < 64; i++) {
      const s = this.rng.int(1, 2 ** 31 - 2);
      if (liveRockForm(s) === form) return s;
    }
    return this.rng.int(1, 2 ** 31 - 2);
  }

  has(speciesId: string): boolean {
    return !!this.lib.get(speciesId);
  }

  /** First species of the list that exists in the plant index. */
  pick(...ids: string[]): string | null {
    for (const id of ids) if (this.lib.get(id)) return id;
    return null;
  }

  /** True if (x, z) lies inside the footprint of a rock/cave (plants can't root there). */
  blocked(x: number, z: number, pad = 0.01): boolean {
    for (const d of this.decor) {
      if (d.kind !== 'rock' && d.kind !== 'cave') continue;
      const b = itemWorldBounds(d);
      const sx = (b.max[0] - b.min[0]) * 0.36, sz = (b.max[2] - b.min[2]) * 0.36;
      const cx = (b.max[0] + b.min[0]) / 2, cz = (b.max[2] + b.min[2]) / 2;
      if (Math.abs(x - cx) < sx + pad && Math.abs(z - cz) < sz + pad) return true;
    }
    return false;
  }

  addPlant(speciesId: string | null, x: number, z: number, o: { growth?: number; attachTo?: DecorItem; rotY?: number } = {}): PlantInstance | null {
    if (!speciesId) return null;
    const sp = this.lib.get(speciesId);
    if (!sp) return null;
    const r = Math.min(0.06, sp.spreadCm / 200);
    const [cx, cz] = this.clamp(x, z, sp.placement === 'floating' ? r : r * 0.4);
    let y = this.ground(cx, cz);
    if (sp.placement === 'floating' || sp.form === 'floating') y = this.surfaceY;
    let px = cx, pz = cz;
    if (o.attachTo) {
      const a = hostAnchor(o.attachTo, cx, cz);
      px = a.p[0];
      pz = a.p[2];
      y = a.p[1];
    }
    const plant: PlantInstance = {
      id: this.id('p'),
      speciesId,
      seed: this.rng.int(1, 2 ** 31 - 2),
      position: [px, y, pz],
      rotationY: o.rotY ?? this.rng.range(0, Math.PI * 2),
      growth: Math.min(1, Math.max(0.05, o.growth ?? this.rng.range(0.7, 0.95))),
      plantedAt: this.tank.simTime - this.rng.range(20, 120) * 86_400_000,
      attachedTo: o.attachTo?.id,
      health: 1,
    };
    this.plants.push(plant);
    return plant;
  }

  /** World points along a driftwood item's branches (for tying epiphytes to it). */
  woodPoints(item: DecorItem, minY = 0.03, maxY = 1): V3[] {
    const shape = decorShape(item);
    const xf = itemTransform(item);
    const out: V3[] = [];
    for (const b of shape.branches ?? []) {
      if (b.r[0] < 0.004) continue;
      for (let i = 1; i < b.pts.length; i += 2) {
        const w = toWorld(xf, b.pts[i], [0, 0, 0]);
        const h = w[1] - this.ground(w[0], w[2]);
        if (h >= minY && h <= maxY && Math.abs(w[0]) < this.halfW - 0.03 && Math.abs(w[2]) < this.halfD - 0.03) out.push(w);
      }
    }
    return out;
  }

  /** Points on top of a rock (for corals / epiphytes), filtered by height above the sand. */
  rockPoints(item: DecorItem, n: number, minNy = 0.45): V3[] {
    const b = itemWorldBounds(item);
    const c: V3 = [(b.min[0] + b.max[0]) / 2, b.max[1], (b.min[2] + b.max[2]) / 2];
    const r = Math.max(b.max[0] - b.min[0], b.max[2] - b.min[2]) * 0.6;
    return sampleHostSurface(item, c, r, n * 3, this.rng)
      .filter((s) => s.n[1] >= minNy && Math.abs(s.p[0]) < this.halfW - 0.03 && Math.abs(s.p[2]) < this.halfD - 0.03)
      .slice(0, n)
      .map((s) => s.p);
  }

  /** Top surface height of a rock at (x, z) (for stacking). */
  topOf(item: DecorItem, x: number, z: number): number {
    return hostAnchor(item, x, z).p[1];
  }

  /** Scatter plants of a species along a band (background lines of vallisneria etc.). */
  band(speciesId: string | null, u0: number, u1: number, v: number, count: number, jitterV = 0.04, growth?: [number, number]): void {
    if (!speciesId) return;
    for (let i = 0; i < count; i++) {
      const u = u0 + ((i + this.rng.range(0.15, 0.85)) / count) * (u1 - u0);
      const x = this.x(u), z = this.z(v + this.rng.range(-jitterV, jitterV));
      if (this.blocked(x, z)) continue;
      this.addPlant(speciesId, x, z, { growth: growth ? this.rng.range(growth[0], growth[1]) : undefined });
    }
  }

  /** Fill an area with carpet patches (each patch ≈ the species spread). */
  carpet(speciesId: string | null, u0: number, u1: number, v0: number, v1: number, density = 1): void {
    if (!speciesId) return;
    const sp = this.lib.get(speciesId)!;
    const step = Math.max(0.06, (sp.spreadCm / 100) * 0.62) / Math.sqrt(density);
    const x0 = this.x(u0), x1 = this.x(u1);
    const lo = Math.min(x0, x1), hi = Math.max(x0, x1);
    for (let z = this.z(v0); z <= this.z(v1); z += step * 0.85) {
      for (let x = lo; x <= hi; x += step) {
        const jx = x + this.rng.range(-0.3, 0.3) * step, jz = z + this.rng.range(-0.3, 0.3) * step;
        if (this.blocked(jx, jz, -0.01)) continue;
        this.addPlant(speciesId, jx, jz, { growth: this.rng.range(0.75, 1) });
      }
    }
  }

  result(): { decor: DecorItem[]; plants: PlantInstance[] } {
    return { decor: this.decor, plants: this.plants };
  }
}

// ---------------------------------------------------------------------------------------------
// Layouts
// ---------------------------------------------------------------------------------------------

/** Amazon flooded-forest: arching roots, leaf litter, swords, vallisneria curtain, frogbit. */
function amazon(tank: TankState, lib: PlantIndex, seed: number) {
  const s = new Scape(tank, lib, seed);
  const k = s.k;
  // Focal root cluster on the golden section, leaning into the tank.
  const fu = 1 - PHI; // ≈ 0.382
  const roots: DecorItem[] = [];
  const nRoots = 3 + (k > 0.8 ? 2 : 0);
  for (let i = 0; i < nRoots; i++) {
    const v = 0.25 + i * 0.06 + s.rng.range(-0.03, 0.03);
    const u = fu - 0.12 + i * 0.05 + s.rng.range(-0.03, 0.03);
    // Branches rise from the back corner toward the front-center (local +x).
    const yaw = s.yaw(-0.35 - i * 0.22 + s.rng.range(-0.15, 0.15));
    roots.push(s.addDecor('driftwood', 'branchwood', s.x(u) - 0.12 * k, s.z(v), { scale: k * s.rng.range(0.85, 1.15), rotY: yaw, sink: 0.004 }));
  }
  // A spiderwood crown where the roots cross: the focal point.
  const crown = s.addDecor('driftwood', 'spiderwood', s.x(fu), s.z(0.38), { scale: k * 1.05, rotY: s.rng.range(0, Math.PI * 2), sink: 0.004 });
  // A second, smaller root group on the far side for balance.
  const far = s.addDecor('driftwood', 'branchwood', s.x(0.84), s.z(0.3), { scale: k * 0.75, rotY: s.yaw(Math.PI + 0.5), sink: 0.004 });
  // Leaf litter beneath the wood and drifting into the open sand.
  s.addDecor('leaf-litter', 'catappa', s.x(fu + 0.02), s.z(0.55), { scale: k * 1.1 });
  s.addDecor('leaf-litter', 'catappa', s.x(fu - 0.12), s.z(0.68), { scale: k * 0.9 });
  s.addDecor('leaf-litter', 'oak', s.x(0.72), s.z(0.6), { scale: k });
  if (k > 0.8) s.addDecor('leaf-litter', 'guava', s.x(0.5), s.z(0.78), { scale: k * 0.8 });

  // Background curtain of vallisneria, thicker toward the sides (open middle for depth).
  const val = s.pick('vallisneria-spiralis', 'vallisneria-americana-gigantea', 'vallisneria-nana');
  s.band(val, 0.03, 0.3, 0.1, Math.round(9 * k + 3), 0.05);
  s.band(val, 0.55, 0.97, 0.1, Math.round(11 * k + 3), 0.05);
  s.band(s.pick('vallisneria-americana-gigantea', 'vallisneria-spiralis'), 0.88, 0.98, 0.16, Math.round(3 * k + 1), 0.03);
  // Amazon swords: the classic centerpiece, off-center behind open sand.
  const sword = s.pick('echinodorus-grisebachii-bleherae', 'echinodorus-ozelot');
  s.addPlant(sword, s.x(0.66), s.z(0.32), { growth: 0.95 });
  if (k > 0.7) s.addPlant(s.pick('echinodorus-ozelot', 'echinodorus-grisebachii-bleherae'), s.x(0.78), s.z(0.42), { growth: 0.8 });
  s.addPlant(sword, s.x(0.24), s.z(0.2), { growth: 0.85 });
  // Midground crypts at the root bases.
  const crypt = s.pick('cryptocoryne-wendtii-brown', 'cryptocoryne-wendtii-green');
  for (let i = 0; i < Math.round(3 + 3 * k); i++) {
    const x = s.x(fu + s.rng.range(-0.1, 0.18)), z = s.z(s.rng.range(0.42, 0.55));
    s.addPlant(i % 2 ? crypt : s.pick('cryptocoryne-wendtii-green', 'cryptocoryne-lutea'), x, z, { growth: s.rng.range(0.6, 0.9) });
  }
  // Pygmy chain sword lawn edging the sand.
  const chain = s.pick('helanthium-tenellum');
  for (let i = 0; i < Math.round(3 * k + 1); i++) s.addPlant(chain, s.x(0.75 + s.rng.range(-0.08, 0.15)), s.z(s.rng.range(0.6, 0.72)), { growth: s.rng.range(0.6, 0.9) });
  // Ferns tied to the wood.
  const woodPts = [...roots, crown, far].flatMap((r) => s.woodPoints(r, 0.04, 0.3).map((p) => ({ p, host: r })));
  const fern = s.pick('microsorum-pteropus', 'microsorum-pteropus-narrow');
  const bolb = s.pick('bolbitis-heudelotii', 'microsorum-pteropus-windelov');
  for (let i = 0; i < Math.min(woodPts.length, Math.round(3 + 2 * k)); i++) {
    const w = woodPts[Math.floor(s.rng.next() * woodPts.length)];
    s.addPlant(i % 3 === 2 ? bolb : fern, w.p[0], w.p[2], { attachTo: w.host, growth: s.rng.range(0.6, 0.95) });
  }
  // Frogbit drifting at the surface, mostly over the back and sides, leaving light shafts.
  const frog = s.pick('limnobium-laevigatum', 'salvinia-minima', 'phyllanthus-fluitans');
  for (let i = 0; i < Math.round(3 + 3 * k); i++) {
    const u = s.rng.chance(0.5) ? s.rng.range(0.05, 0.35) : s.rng.range(0.6, 0.95);
    s.addPlant(frog, s.x(u), s.z(s.rng.range(0.1, 0.55)), { growth: s.rng.range(0.6, 1) });
  }
  return s.result();
}

/** Classic Iwagumi: oyaishi, fukuishi, soeishi in seiryu, a carpet and hairgrass. */
function iwagumi(tank: TankState, lib: PlantIndex, seed: number) {
  const s = new Scape(tank, lib, seed);
  const k = s.k;
  const lean = s.rng.range(-0.18, -0.08);
  const strata = s.rng.range(0, Math.PI * 2);
  // Oyaishi: the main stone on the golden section, tallest, leaning into the open space.
  const main = s.addDecor('rock', 'seiryu', s.x(1 - PHI), s.z(0.4), { scale: 1.9 * k, rotY: strata, rotZ: s.flip ? -lean : lean, sink: 0.01 });
  // Fukuishi: second stone beside it, lower, facing the same way.
  const second = s.addDecor('rock', 'seiryu', s.x(1 - PHI + 0.15), s.z(0.47), { scale: 1.25 * k, rotY: strata + 0.3, rotZ: s.flip ? -lean : lean, sink: 0.01 });
  // Soeishi: the accent stone in front of the main.
  s.addDecor('rock', 'seiryu', s.x(1 - PHI - 0.1), s.z(0.6), { scale: 0.8 * k, rotY: strata - 0.4, sink: 0.008 });
  // Suteishi: small stones that echo the group elsewhere.
  s.addDecor('rock', 'seiryu', s.x(0.78), s.z(0.52), { scale: 0.75 * k, rotY: strata + 0.6, sink: 0.008 });
  s.addDecor('rock', 'seiryu', s.x(0.86), s.z(0.4), { scale: 0.55 * k, rotY: strata + 1.1, sink: 0.006 });
  if (k > 0.7) s.addDecor('rock', 'seiryu', s.x(0.15), s.z(0.48), { scale: 0.5 * k, rotY: strata - 0.8, sink: 0.006 });
  void main;
  void second;
  // Carpet across the front, hairgrass toward the back so height rises gently.
  s.carpet(s.pick('micranthemum-monte-carlo', 'hemianthus-callitrichoides-cuba', 'glossostigma-elatinoides'), 0.03, 0.97, 0.45, 0.94, 1);
  const hair = s.pick('eleocharis-acicularis', 'eleocharis-parvula');
  for (let i = 0; i < Math.round(18 * k + 6); i++) {
    const u = s.rng.range(0.03, 0.97), v = s.rng.range(0.08, 0.45);
    const x = s.x(u), z = s.z(v);
    if (!s.blocked(x, z)) s.addPlant(hair, x, z, { growth: s.rng.range(0.7, 1) });
  }
  return s.result();
}

/** Dutch: terraced "streets" of stem plants in contrasting colors and textures. */
function dutch(tank: TankState, lib: PlantIndex, seed: number) {
  const s = new Scape(tank, lib, seed);
  const k = s.k;
  const back = ['rotala-rotundifolia', 'hygrophila-corymbosa', 'ludwigia-palustris-super-red', 'limnophila-sessiliflora', 'rotala-hra', 'cabomba-caroliniana', 'hygrophila-difformis'];
  const mid = ['alternanthera-reineckii-rosaefolia', 'rotala-macrandra', 'pogostemon-erectus', 'bacopa-caroliniana', 'ludwigia-arcuata', 'limnophila-aromatica'];
  const front = ['staurogyne-repens', 'hemianthus-micranthemoides', 'cryptocoryne-parva', 'lilaeopsis-brasiliensis', 'alternanthera-reineckii-mini', 'pogostemon-helferi'];
  const groups = (list: string[], v0: number, v1: number, n: number, perGroup: number) => {
    const avail = list.filter((id) => s.has(id));
    if (!avail.length) return;
    for (let i = 0; i < n; i++) {
      const sp = avail[i % avail.length];
      // Streets run diagonally back across the tank.
      const u0 = (i + 0.1) / n, u1 = (i + 0.9) / n;
      for (let j = 0; j < perGroup; j++) {
        const t = j / Math.max(1, perGroup - 1);
        const u = u0 + (u1 - u0) * s.rng.range(0, 1);
        const v = v0 + (v1 - v0) * t + (u - 0.5) * 0.08;
        s.addPlant(sp, s.x(u), s.z(v), { growth: s.rng.range(0.75, 1) });
      }
    }
  };
  groups(back, 0.06, 0.22, Math.max(3, Math.round(6 * k)), 3);
  groups(mid, 0.3, 0.46, Math.max(3, Math.round(5 * k)), 3);
  groups(front, 0.58, 0.85, Math.max(3, Math.round(5 * k)), 3);
  // A single sword as a solitaire, and a few stones edging a terrace.
  s.addPlant(s.pick('echinodorus-rubin', 'echinodorus-grisebachii-bleherae'), s.x(PHI), s.z(0.4), { growth: 0.9 });
  s.addDecor('rock', 'river-stone', s.x(0.3), s.z(0.56), { scale: 0.9 * k });
  s.addDecor('rock', 'river-stone', s.x(0.36), s.z(0.6), { scale: 0.6 * k });
  return s.result();
}

/** Malawi rockscape: stacked holey limestone with caves, open sand. */
function malawi(tank: TankState, lib: PlantIndex, seed: number) {
  const s = new Scape(tank, lib, seed);
  const k = s.k;
  const base: DecorItem[] = [];
  const n = Math.max(4, Math.round(7 * k + 1));
  for (let i = 0; i < n; i++) {
    const u = 0.06 + (i / (n - 1)) * 0.88;
    // A gentle wave so the wall is deeper at the golden-section focal point.
    const v = 0.2 + 0.1 * Math.exp(-Math.pow((u - (1 - PHI)) / 0.15, 2)) + s.rng.range(-0.03, 0.03);
    base.push(s.addDecor('rock', 'texas-holey', s.x(u), s.z(v), { scale: k * s.rng.range(1.0, 1.4), sink: 0.012 }));
  }
  // Second tier on top of the base rocks, leaving gaps (caves) between them.
  for (let i = 0; i < base.length - 1; i += 1) {
    if (s.rng.chance(0.3)) continue;
    const a = base[i], b = base[i + 1];
    const x = (a.position[0] + b.position[0]) / 2, z = (a.position[2] + b.position[2]) / 2 + s.rng.range(-0.02, 0.02);
    const y = Math.max(s.topOf(a, x, z), s.topOf(b, x, z)) - 0.03 * k;
    s.addDecor('rock', 'texas-holey', x, z, { scale: k * s.rng.range(0.8, 1.1), y, sink: 0 });
  }
  // A few caves and loose stones in front for territories.
  s.addDecor('cave', 'rock-cave', s.x(1 - PHI), s.z(0.48), { scale: k, rotY: s.yaw(s.rng.range(-0.3, 0.3)) });
  s.addDecor('rock', 'texas-holey', s.x(0.8), s.z(0.5), { scale: k * 0.8 });
  s.addDecor('cave', 'slate-cave', s.x(0.62), s.z(0.58), { scale: k * 0.9, rotY: s.rng.range(-0.3, 0.3) });
  // Mbuna graze plants — only tough ones: anubias on a rock, onion plant in a corner.
  const host = base[Math.floor(base.length * 0.7)];
  const pts = s.rockPoints(host, 1);
  if (pts[0]) s.addPlant(s.pick('anubias-barteri', 'anubias-barteri-nana'), pts[0][0], pts[0][2], { attachTo: host });
  s.addPlant(s.pick('crinum-calamistratum', 'vallisneria-americana-gigantea'), s.x(0.94), s.z(0.12));
  return s.result();
}

/** Blackwater igarapé: deep leaf litter, roots and tea-colored water with sparse plants. */
function blackwater(tank: TankState, lib: PlantIndex, seed: number) {
  const s = new Scape(tank, lib, seed);
  const k = s.k;
  const roots = [
    s.addDecor('driftwood', 'redmoor-root', s.x(1 - PHI), s.z(0.32), { scale: k * 1.1, sink: 0.004 }),
    s.addDecor('driftwood', 'spiderwood', s.x(0.82), s.z(0.25), { scale: k * 0.9, sink: 0.004 }),
    s.addDecor('driftwood', 'branchwood', s.x(0.2), s.z(0.3), { scale: k, rotY: s.yaw(-0.4), sink: 0.004 }),
    s.addDecor('driftwood', 'malaysian', s.x(0.55), s.z(0.45), { scale: k * 0.9, rotY: s.rng.range(0, 6.28), sink: 0.006 }),
  ];
  const litter = ['catappa', 'oak', 'guava', 'catappa', 'oak'];
  for (let i = 0; i < Math.round(6 * k + 3); i++) {
    s.addDecor('leaf-litter', litter[i % litter.length], s.x(s.rng.range(0.08, 0.92)), s.z(s.rng.range(0.35, 0.85)), { scale: k * s.rng.range(0.8, 1.2) });
  }
  const crypts = s.pick('cryptocoryne-wendtii-brown', 'cryptocoryne-beckettii');
  for (let i = 0; i < Math.round(3 * k + 1); i++) s.addPlant(crypts, s.x(s.rng.range(0.25, 0.75)), s.z(s.rng.range(0.25, 0.45)));
  const pts = roots.flatMap((r) => s.woodPoints(r, 0.04, 0.25).map((p) => ({ p, host: r })));
  for (let i = 0; i < Math.min(3, pts.length); i++) {
    const w = pts[Math.floor(s.rng.next() * pts.length)];
    s.addPlant(s.pick('microsorum-pteropus-narrow', 'microsorum-pteropus'), w.p[0], w.p[2], { attachTo: w.host });
  }
  s.addPlant(s.pick('nymphaea-zenkeri', 'nymphaea-lotus-green'), s.x(0.68), s.z(0.2), { growth: 0.7 });
  const floaters = s.pick('phyllanthus-fluitans', 'salvinia-minima', 'limnobium-laevigatum');
  for (let i = 0; i < Math.round(4 * k + 2); i++) s.addPlant(floaters, s.x(s.rng.range(0.05, 0.95)), s.z(s.rng.range(0.1, 0.6)), { growth: s.rng.range(0.6, 1) });
  return s.result();
}

/** Nano shrimp tank: moss-covered wood, small crypts, buce on stone, cholla and leaves. */
function nanoShrimp(tank: TankState, lib: PlantIndex, seed: number) {
  const s = new Scape(tank, lib, seed);
  const k = Math.min(s.k, 0.75);
  const wood = s.addDecor('driftwood', 'spiderwood', s.x(1 - PHI), s.z(0.4), { scale: k * 0.9, sink: 0.003 });
  const stone = s.addDecor('rock', 'dragon-stone', s.x(0.7), s.z(0.45), { scale: k * 0.9, sink: 0.006 });
  s.addDecor('rock', 'dragon-stone', s.x(0.82), s.z(0.55), { scale: k * 0.55, sink: 0.004 });
  s.addDecor('driftwood', 'cholla', s.x(0.5), s.z(0.72), { scale: k, rotY: s.rng.range(-0.4, 0.4) });
  s.addDecor('leaf-litter', 'catappa', s.x(0.3), s.z(0.7), { scale: k * 0.7 });
  const moss = s.pick('vesicularia-montagnei', 'taxiphyllum-barbieri');
  for (const p of s.woodPoints(wood, 0.03, 0.3).slice(0, 5)) s.addPlant(moss, p[0], p[2], { attachTo: wood, growth: s.rng.range(0.7, 1) });
  const flame = s.pick('taxiphyllum-flame', 'taxiphyllum-barbieri');
  const tops = s.rockPoints(stone, 3);
  if (tops[0]) s.addPlant(s.pick('bucephalandra-brownie', 'anubias-nana-petite'), tops[0][0], tops[0][2], { attachTo: stone });
  if (tops[1]) s.addPlant(flame, tops[1][0], tops[1][2], { attachTo: stone });
  if (tops[2]) s.addPlant(s.pick('anubias-nana-petite', 'bucephalandra-wavy-green'), tops[2][0], tops[2][2], { attachTo: stone });
  s.carpet(s.pick('micranthemum-monte-carlo', 'marsilea-hirsuta'), 0.05, 0.4, 0.65, 0.92, 0.8);
  for (let i = 0; i < 4; i++) s.addPlant(s.pick('cryptocoryne-parva', 'cryptocoryne-lutea'), s.x(s.rng.range(0.55, 0.95)), s.z(s.rng.range(0.6, 0.85)));
  s.band(s.pick('rotala-rotundifolia', 'hygrophila-polysperma'), 0.75, 0.97, 0.15, 3);
  s.addPlant(s.pick('salvinia-minima', 'lemna-minor'), s.x(0.85), s.z(0.3), { growth: 0.6 });
  return s.result();
}

/** Goldfish: smooth stones and tough, fast plants that survive grazing. */
function goldfish(tank: TankState, lib: PlantIndex, seed: number) {
  const s = new Scape(tank, lib, seed);
  const k = s.k;
  const stones: DecorItem[] = [];
  for (let i = 0; i < Math.round(4 * k + 2); i++) {
    stones.push(s.addDecor('rock', 'river-stone', s.x(s.rng.range(0.1, 0.9)), s.z(s.rng.range(0.25, 0.55)), { scale: k * s.rng.range(1.0, 2.2) }));
  }
  s.addDecor('pebbles', 'river', s.x(1 - PHI), s.z(0.68), { scale: k * 1.2 });
  s.addDecor('pebbles', 'river', s.x(0.8), s.z(0.72), { scale: k });
  s.band(s.pick('vallisneria-americana-gigantea', 'vallisneria-spiralis'), 0.05, 0.95, 0.1, Math.round(10 * k + 3));
  s.addPlant(s.pick('crinum-calamistratum'), s.x(0.9), s.z(0.2));
  for (const st of stones.slice(0, 3)) {
    const p = s.rockPoints(st, 1)[0];
    if (p) s.addPlant(s.pick('anubias-barteri', 'microsorum-pteropus'), p[0], p[2], { attachTo: st });
  }
  s.addPlant(s.pick('aegagropila-linnaei'), s.x(0.55), s.z(0.8));
  s.addPlant(s.pick('aegagropila-linnaei'), s.x(0.6), s.z(0.84), { growth: 0.6 });
  s.band(s.pick('ceratophyllum-demersum', 'egeria-densa'), 0.75, 0.95, 0.2, 3);
  return s.result();
}

/** Nature aquarium: stones and a wood "tree" with moss canopy, carpet, ferns and stems. */
function nature(tank: TankState, lib: PlantIndex, seed: number) {
  const s = new Scape(tank, lib, seed);
  const k = s.k;
  const tree = s.addDecor('driftwood', 'manzanita', s.x(1 - PHI), s.z(0.35), { scale: k * 1.1, sink: 0.004 });
  const r1 = s.addDecor('rock', 'dragon-stone', s.x(1 - PHI - 0.06), s.z(0.48), { scale: k * 1.3, sink: 0.008 });
  s.addDecor('rock', 'dragon-stone', s.x(1 - PHI + 0.1), s.z(0.52), { scale: k * 0.9, sink: 0.006 });
  const r3 = s.addDecor('rock', 'dragon-stone', s.x(0.8), s.z(0.45), { scale: k * 1.1, sink: 0.008 });
  // Moss canopy on the upper branches.
  const moss = s.pick('taxiphyllum-barbieri', 'vesicularia-montagnei');
  for (const p of s.woodPoints(tree, 0.12, 0.6).filter((_, i) => i % 2 === 0).slice(0, 8)) s.addPlant(moss, p[0], p[2], { attachTo: tree, growth: s.rng.range(0.7, 1) });
  for (const [rock, sp] of [[r1, 'bucephalandra-brownie'], [r3, 'microsorum-pteropus-windelov']] as const) {
    const p = s.rockPoints(rock, 1)[0];
    if (p) s.addPlant(s.pick(sp, 'anubias-barteri-nana'), p[0], p[2], { attachTo: rock });
  }
  s.carpet(s.pick('micranthemum-monte-carlo', 'hemianthus-callitrichoides-cuba'), 0.03, 0.97, 0.62, 0.94, 1);
  s.band(s.pick('rotala-rotundifolia'), 0.05, 0.4, 0.1, Math.round(5 * k + 2));
  s.band(s.pick('hygrophila-polysperma', 'limnophila-sessiliflora'), 0.6, 0.95, 0.1, Math.round(4 * k + 2));
  s.band(s.pick('ludwigia-palustris-super-red', 'rotala-macrandra'), 0.42, 0.58, 0.14, 2);
  for (let i = 0; i < 4; i++) s.addPlant(s.pick('cryptocoryne-wendtii-green', 'cryptocoryne-lutea'), s.x(s.rng.range(0.6, 0.95)), s.z(s.rng.range(0.45, 0.58)));
  s.band(s.pick('eleocharis-acicularis'), 0.1, 0.35, 0.56, 4, 0.03);
  return s.result();
}

/** Reef: live-rock bommies with an arch, corals placed by light, an anemone, macroalgae. */
function reef(tank: TankState, lib: PlantIndex, seed: number) {
  const s = new Scape(tank, lib, seed);
  const k = s.k;
  const rocks: DecorItem[] = [];
  const bommie = (u: number, v: number, size: number, arch: boolean) => {
    const list: DecorItem[] = [];
    const n = Math.max(2, Math.round(3 * size));
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2 + s.rng.range(-0.4, 0.4);
      const r = 0.09 * k * size;
      list.push(s.addDecor('rock', 'live-rock', s.x(u) + Math.cos(a) * r, s.z(v) + Math.sin(a) * r * 0.6, { scale: k * s.rng.range(0.9, 1.25) * Math.sqrt(size), seed: s.liveRockSeed(i === 0 ? 'mound' : s.rng.chance(0.5) ? 'pillar' : 'mound'), sink: 0.015 }));
    }
    // Stack a shelf or arch on top.
    const top = list[0];
    const tx = s.x(u) + s.rng.range(-0.03, 0.03), tz = s.z(v);
    const ty = Math.max(...list.map((r) => s.topOf(r, tx, tz))) - 0.05 * k;
    list.push(s.addDecor('rock', 'live-rock', tx, tz, { scale: k * 1.1 * Math.sqrt(size), y: ty, seed: s.liveRockSeed(arch ? 'arch' : 'shelf'), rotY: s.rng.range(-0.4, 0.4) }));
    void top;
    rocks.push(...list);
    return list;
  };
  const main = bommie(1 - PHI, 0.38, 1.6, true);
  const second = bommie(0.8, 0.42, 1.0, false);
  if (k > 0.9) bommie(0.08, 0.3, 0.6, false);
  s.addDecor('coral-skeleton', 'rubble', s.x(0.55), s.z(0.72), { scale: k });
  s.addDecor('coral-skeleton', 'rubble', s.x(0.2), s.z(0.65), { scale: k * 0.8 });

  // Corals by light: SPS high, LPS mid, softies/mushrooms/zoas low; sand dwellers in front.
  const heightOf = (p: V3) => p[1] - s.ground(p[0], p[2]);
  const spots = rocks.flatMap((r) => s.rockPoints(r, 8, 0.35).map((p) => ({ p, host: r, h: heightOf(p) })));
  spots.sort((a, b) => b.h - a.h);
  const taken: V3[] = [];
  const place = (ids: string[], band: [number, number], count: number, spacing: number) => {
    const avail = ids.filter((id) => s.has(id));
    if (!avail.length) return;
    let n = 0;
    const lo = spots.length * band[0], hi = spots.length * band[1];
    for (let i = Math.floor(lo); i < hi && n < count; i++) {
      const sp = spots[i];
      if (taken.some((t) => Math.hypot(t[0] - sp.p[0], t[2] - sp.p[2]) < spacing)) continue;
      taken.push(sp.p);
      s.addPlant(avail[n % avail.length], sp.p[0], sp.p[2], { attachTo: sp.host, growth: s.rng.range(0.65, 0.95) });
      n++;
    }
  };
  place(['acropora-millepora', 'acropora-tenuis', 'acropora-formosa', 'seriatopora-hystrix', 'stylophora-pistillata', 'pocillopora-damicornis', 'montipora-digitata', 'acropora-hyacinthus'], [0, 0.25], Math.round(6 * k + 2), 0.09);
  place(['euphyllia-ancora', 'euphyllia-glabrescens', 'euphyllia-divisa', 'duncanopsammia-axifuga', 'caulastrea-furcata', 'montipora-capricornis', 'goniopora-lobata', 'dipsastraea-speciosa', 'favites-abdita', 'micromussa-lordhowensis', 'plerogyra-sinuosa'], [0.2, 0.6], Math.round(7 * k + 2), 0.1);
  place(['sarcophyton-toadstool', 'capnella-imbricata', 'xenia-elongata', 'sinularia-flexibilis'], [0.35, 0.75], Math.round(3 * k + 1), 0.12);
  place(['zoanthus-sociatus', 'zoanthus-rasta', 'palythoa-grandis', 'discosoma-red', 'discosoma-blue', 'rhodactis-indosinensis', 'ricordea-florida', 'ricordea-yuma', 'briareum-violaceum'], [0.55, 1], Math.round(6 * k + 2), 0.07);
  // The clownfish anemone: in a crevice on the second bommie, mid height.
  const bta = s.pick('entacmaea-quadricolor', 'entacmaea-quadricolor-rose', 'heteractis-crispa');
  const anemoneSpot = s.rockPoints(second[0], 4).sort((a, b) => a[1] - b[1])[1] ?? s.rockPoints(second[0], 1)[0];
  if (anemoneSpot) s.addPlant(bta, anemoneSpot[0], anemoneSpot[2], { attachTo: second[0], growth: 0.9 });
  // Gorgonians at the back for height and movement.
  s.addPlant(s.pick('gorgonia-ventalina', 'antillogorgia-bipinnata'), s.x(0.65), s.z(0.12), { growth: 0.85, rotY: 0 });
  s.addPlant(s.pick('antillogorgia-bipinnata', 'eunicea-knobby'), s.x(0.3), s.z(0.1), { growth: 0.8 });
  s.addPlant(s.pick('eunicea-knobby'), s.x(0.92), s.z(0.18), { growth: 0.75 });
  // Sand dwellers in the open foreground.
  s.addPlant(s.pick('trachyphyllia-geoffroyi'), s.x(0.45), s.z(0.75), { growth: 0.9 });
  s.addPlant(s.pick('danafungia-scruposa'), s.x(0.68), s.z(0.8), { growth: 0.85 });
  s.addPlant(s.pick('phymanthus-crucifer'), s.x(0.32), s.z(0.82), { growth: 0.8 });
  // Macroalgae tucked at the base of the rockwork.
  s.addPlant(s.pick('halymenia-dilatata', 'gracilaria-parvispora'), s.x(0.06), s.z(0.2));
  s.addPlant(s.pick('caulerpa-racemosa', 'caulerpa-prolifera'), s.x(0.94), s.z(0.65), { growth: 0.7 });
  void main;
  return s.result();
}

/** OWNER: decor module — beautiful, natural layouts (Iwagumi, Dutch, Amazon blackwater, Malawi rockscape, reef...). */
export const AQUASCAPES: Aquascape[] = [
  { id: 'amazon', name: 'Amazon flooded forest', description: 'Arching roots over river sand, a carpet of fallen leaves, Amazon swords, a vallisneria curtain and frogbit at the surface.', water: 'freshwater', build: amazon },
  { id: 'reef', name: 'Coral reef', description: 'Live-rock bommies with an arch and open sand, corals arranged by light: SPS at the top, LPS and softies below, a bubble-tip anemone for clownfish.', water: 'marine', build: reef },
  { id: 'iwagumi', name: 'Iwagumi', description: 'Three seiryu stones in the classic oyaishi–fukuishi–soeishi grouping over a lush carpet and hairgrass meadow.', water: 'freshwater', build: iwagumi },
  { id: 'dutch', name: 'Dutch garden', description: 'Terraced streets of stem plants in contrasting colors and leaf textures, rising toward the back.', water: 'freshwater', build: dutch },
  { id: 'malawi', name: 'Malawi rockscape', description: 'Stacked holey limestone with caves and territories over open sand, the home of mbuna.', water: 'freshwater', build: malawi },
  { id: 'blackwater', name: 'Blackwater igarapé', description: 'Deep leaf litter, tangled roots and floating plants in tea-colored water.', water: 'freshwater', build: blackwater },
  { id: 'nano-shrimp', name: 'Shrimp nano', description: 'Moss-covered wood, crypts and bucephalandra on stone, cholla and catappa leaves for grazing shrimp.', water: 'freshwater', build: nanoShrimp },
  { id: 'goldfish', name: 'Goldfish tank', description: 'Smooth river stones, pebbles and tough, fast plants that stand up to grazing goldfish.', water: 'freshwater', build: goldfish },
  { id: 'nature', name: 'Nature aquarium', description: 'A moss-crowned wood tree among dragon stones, a carpet in front and stems behind.', water: 'freshwater', build: nature },
  { id: 'empty', name: 'Bare substrate', description: 'A clean slate.', water: 'freshwater', build: () => ({ decor: [], plants: [] }) },
];

// ---------------------------------------------------------------------------------------------
// Placement suggestions for the editor
// ---------------------------------------------------------------------------------------------

export interface PlacementSuggestion {
  /** Tank-space x, z (m). */
  at: [number, number];
  /** Host decor for epiphytes / corals. */
  attachTo?: string;
}

/**
 * Suggest a natural spot for a new item: hardscape on the golden sections and toward the back,
 * small decor near existing hardscape, plants by their placement band (fore/mid/background),
 * epiphytes and corals on the least crowded suitable host, floaters away from other floaters.
 * Deterministic for a given tank state.
 */
export function suggestPlacement(
  tank: TankState,
  what: { decor: { kind: DecorKind; variant: string } } | { plant: PlantSpecies },
  plants?: PlantIndex,
): PlacementSuggestion {
  const b = tankBounds(tank);
  const rng = new Rng((tank.seed ^ (tank.decor.length * 7919) ^ (tank.plants.length * 104729)) >>> 0);
  const footprints = tank.decor.map((d) => {
    const wb = itemWorldBounds(d);
    return { x: (wb.min[0] + wb.max[0]) / 2, z: (wb.min[2] + wb.max[2]) / 2, r: Math.max(wb.max[0] - wb.min[0], wb.max[2] - wb.min[2]) / 2, item: d };
  });
  const plantSpots = tank.plants.map((p) => ({ x: p.position[0], z: p.position[2], r: (plants?.get(p.speciesId)?.spreadCm ?? 10) / 200, sp: plants?.get(p.speciesId), p }));
  const best = (cands: [number, number][], score: (x: number, z: number) => number): [number, number] => {
    let bs = -Infinity, bp = cands[0];
    for (const c of cands) {
      const v = score(c[0], c[1]) + rng.next() * 0.01;
      if (v > bs) {
        bs = v;
        bp = c;
      }
    }
    return bp;
  };
  const grid = (r: number, v0 = 0, v1 = 1): [number, number][] => {
    const out: [number, number][] = [];
    for (let i = 0; i <= 16; i++) {
      for (let j = 0; j <= 8; j++) {
        const x = -b.halfW + r + 0.03 + (i / 16) * (b.halfW * 2 - 2 * (r + 0.03));
        const z = -b.halfD + r + 0.03 + (v0 + (j / 8) * (v1 - v0)) * (b.halfD * 2 - 2 * (r + 0.03));
        out.push([x, z]);
      }
    }
    return out;
  };
  const crowd = (x: number, z: number, r: number) => {
    let c = 0;
    for (const f of footprints) c += Math.max(0, r + f.r - Math.hypot(x - f.x, z - f.z));
    return c;
  };
  const golden = (x: number) => {
    const u = (x + b.halfW) / (2 * b.halfW);
    return Math.max(Math.exp(-Math.pow((u - (1 - PHI)) / 0.08, 2)), Math.exp(-Math.pow((u - PHI) / 0.08, 2)));
  };

  if ('decor' in what) {
    const cat = catalogEntry(what.decor.kind, what.decor.variant);
    const r = cat.size / 2;
    const kind = what.decor.kind;
    if (kind === 'airstone') {
      return { at: best(grid(r, 0, 0.15), (x, z) => -crowd(x, z, 0.05) + Math.abs(x) / b.halfW - (z + b.halfD)) };
    }
    if (kind === 'leaf-litter' || kind === 'pebbles' || kind === 'shell') {
      // Nestle against existing hardscape in the front half.
      return {
        at: best(grid(r, 0.4, 1), (x, z) => {
          let near = 0;
          for (const f of footprints) near = Math.max(near, Math.exp(-Math.pow((Math.hypot(x - f.x, z - f.z) - f.r) / 0.06, 2)));
          return near - crowd(x, z, r) * 6 - Math.abs(x) / b.halfW * 0.2;
        }),
      };
    }
    // Hardscape: big pieces toward the back on the golden sections, never overlapping much.
    const big = cat.size > 0.15;
    return {
      at: best(grid(r, 0.05, big ? 0.6 : 0.8), (x, z) => golden(x) * 1.2 - crowd(x, z, r) * 8 - (big ? (z + b.halfD) / (2 * b.halfD) : 0) * 0.6),
    };
  }

  const sp = what.plant;
  if (sp.placement === 'epiphyte' || sp.form.endsWith('coral') || sp.form === 'zoanthid' || sp.form === 'gorgonian') {
    const hosts = footprints.filter((f) => f.item.kind === 'driftwood' || f.item.kind === 'rock' || f.item.kind === 'cave');
    if (hosts.length) {
      // Corals by light need: high light → tall rocks; low light → low rocks / undersides.
      const want = sp.light === 'high' ? 1 : sp.light === 'low' ? 0 : 0.5;
      let bestHost = hosts[0], bs = -Infinity;
      for (const h of hosts) {
        const wb = itemWorldBounds(h.item);
        const height = (wb.max[1] - substrateHeight(tank, h.x, h.z)) / b.height;
        const load = plantSpots.filter((p) => p.p.attachedTo === h.item.id).length;
        const sc = -load * 0.3 - Math.abs(height * 2 - want) + rng.next() * 0.05;
        if (sc > bs) {
          bs = sc;
          bestHost = h;
        }
      }
      const pts = sampleHostSurface(bestHost.item, [bestHost.x, itemWorldBounds(bestHost.item).max[1], bestHost.z], bestHost.r, 12, rng).filter((s) => s.n[1] > 0.3);
      const pick = pts.sort((a, c) => (sp.light === 'low' ? a.p[1] - c.p[1] : c.p[1] - a.p[1]))[0];
      if (pick) return { at: [pick.p[0], pick.p[2]], attachTo: bestHost.item.id };
    }
  }
  if (sp.placement === 'floating' || sp.form === 'floating') {
    return { at: best(grid(0.05, 0, 0.6), (x, z) => -plantSpots.filter((p) => p.sp?.form === 'floating').reduce((a, p) => a + Math.max(0, 0.12 - Math.hypot(x - p.x, z - p.z)), 0) * 10 + Math.abs(x) / b.halfW * 0.3) };
  }
  const band: [number, number] = sp.placement === 'foreground' ? [0.62, 0.92] : sp.placement === 'midground' ? [0.38, 0.62] : [0.05, 0.3];
  const r = sp.spreadCm / 200;
  return {
    at: best(grid(r * 0.5, band[0], band[1]), (x, z) => {
      let overlap = 0;
      for (const p of plantSpots) overlap += Math.max(0, r + p.r - Math.hypot(x - p.x, z - p.z));
      // Prefer to grow beside (not inside) hardscape; keep the front-center open.
      const inRock = footprints.some((f) => (f.item.kind === 'rock' || f.item.kind === 'cave') && Math.hypot(x - f.x, z - f.z) < f.r * 0.8) ? 5 : 0;
      const openFront = sp.placement !== 'foreground' ? 0 : Math.exp(-Math.pow(x / (b.halfW * 0.4), 2)) * 0.3;
      return -overlap * 4 - inRock - openFront + golden(x) * 0.15;
    }),
  };
}
