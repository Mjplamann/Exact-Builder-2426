import type { DecorItem, DecorKind, PlantInstance, PlantSpecies, TankState, WaterType } from '../core/types';
import type { PlantIndex } from '../data/plantIndex';
import { Rng } from '../core/rng';
import { substrateHeight, tankBounds } from '../core/tankGeometry';
import { catalogEntry } from './catalog';
import {
  decorShape, hostAnchor, itemTransform, itemWorldBounds, liveRockForm, sampleHostSurface, sdfEval, toLocal, toWorld,
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

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

/**
 * Growth at which a plant stands `h` m tall — the inverse of the renderer's height curve
 * (`heightAt` in plantMetrics.ts), so layouts keep stems and swords under the surface.
 */
function growthForHeight(sp: PlantSpecies, h: number): number {
  const r = h / Math.max(1e-6, sp.maxHeightCm / 100);
  switch (sp.form) {
    case 'carpet':
    case 'moss':
      return (r - 0.45) / 0.55;
    case 'ball':
      return (r - 0.6) / 0.4;
    case 'floating':
      return 1;
    default:
      return (r - 0.18) / 0.82;
  }
}

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

/** A coral band for `Scape.corals`: species, slice of the rock spots (0 = highest), count, spacing (m). */
interface CoralBand {
  ids: string[];
  band: [number, number];
  count: number;
  spacing: number;
}

const _l: V3 = [0, 0, 0];

/**
 * Accumulates a layout. Coordinates are meters in tank space; helper fractions:
 * u ∈ [0, 1] left → right, v ∈ [0, 1] back → front.
 *
 * Every layout adapts to the tank it is built in: hardscape scales with `k`, counts along the
 * tank with `wf`, plants are chosen and trimmed to the water column, and nothing rises above
 * `ceiling` or touches the glass.
 */
class Scape {
  readonly decor: DecorItem[] = [];
  readonly plants: PlantInstance[] = [];
  readonly rng: Rng;
  readonly halfW: number;
  readonly halfD: number;
  readonly H: number;
  readonly surfaceY: number;
  /**
   * Composition scale relative to a 120×50×50 cm show tank (scales hardscape): mostly the width,
   * tempered by height and depth — a cube or a tall tank carries bigger pieces than its width
   * alone suggests, and a 3 m tank bigger ones than a show tank, though not 2.5× bigger.
   */
  readonly k: number;
  /** Width relative to 120 cm: how many groups and plants fit along the tank. */
  readonly wf: number;
  /** Typical water column above the substrate (m). */
  readonly water: number;
  /** Highest any hardscape may reach (m): a hand's breadth under the surface. */
  readonly ceiling: number;
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
    const { widthCm: w, heightCm: h, depthCm: d } = tank.size;
    this.k = clamp(Math.sqrt(w / 120) * Math.pow(h / 50, 0.25) * Math.pow(d / 50, 0.25), 0.32, 2.4);
    this.wf = w / 120;
    const sub = tank.substrate === 'bare' ? 0 : (tank.substrateDepthFrontCm + tank.substrateDepthBackCm) / 200;
    this.water = Math.max(0.08, b.surfaceY - sub);
    this.ceiling = b.surfaceY - Math.max(0.03, this.water * 0.15);
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

  /** An element count that grows with the tank's width. */
  count(base: number, perWidth: number): number {
    return Math.max(0, Math.round(base + perWidth * this.wf));
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
    // Make sure the piece fits: shrink pieces too large for this tank (a big root in a nano
    // tank, a stone that would break the surface), then nudge it off the glass.
    const m = 0.02;
    let wb = itemWorldBounds(item);
    const rise = Math.max(1e-6, wb.max[1] - item.position[1]);
    const fit = Math.min(
      1,
      (this.W - 2 * m) / Math.max(1e-6, wb.max[0] - wb.min[0]),
      (this.D - 2 * m) / Math.max(1e-6, wb.max[2] - wb.min[2]),
      Math.max(0, this.ceiling - item.position[1]) / rise,
    );
    if (fit < 1) {
      item.scale *= Math.max(0.12, fit * 0.97);
      wb = itemWorldBounds(item);
    }
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

  /**
   * First species of the list that suits this tank — mature height within `frac` of the water
   * column and spread within a third of the width (no Amazon sword in a desktop nano) — or else
   * the smallest one that exists.
   */
  fit(frac: number, ...ids: string[]): string | null {
    let small: PlantSpecies | null = null;
    for (const id of ids) {
      const sp = this.lib.get(id);
      if (!sp) continue;
      if (sp.maxHeightCm / 100 <= frac * this.water && sp.spreadCm / 100 <= this.W / 3) return id;
      if (!small || sp.maxHeightCm < small.maxHeightCm) small = sp;
    }
    return small?.id ?? null;
  }

  /** The species whose mature height best matches `frac` of the water column (tall stems in tall tanks). */
  reach(frac: number, ids: string[]): string | null {
    const want = frac * this.water * 100;
    let best: string | null = null, bs = Infinity;
    for (const id of ids) {
      const sp = this.lib.get(id);
      if (!sp) continue;
      const miss = sp.maxHeightCm > want ? (sp.maxHeightCm - want) * 1.5 : want - sp.maxHeightCm;
      if (miss < bs) {
        bs = miss;
        best = id;
      }
    }
    return best;
  }

  /** Vallisneria (or a shorter ribbon plant) sized to the water column. */
  ribbon(): string | null {
    if (this.water > 0.6) return this.pick('vallisneria-americana-gigantea', 'vallisneria-spiralis');
    if (this.water < 0.3) return this.pick('vallisneria-nana', 'sagittaria-subulata', 'vallisneria-spiralis');
    return this.pick('vallisneria-spiralis', 'vallisneria-americana-gigantea', 'vallisneria-nana');
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

  /** True if a world point lies inside a stone or cave (deeper than `pad`). */
  inStone(x: number, y: number, z: number, pad = 0.004): boolean {
    for (const d of this.decor) {
      if (d.kind !== 'rock' && d.kind !== 'cave') continue;
      const wb = itemWorldBounds(d);
      if (x < wb.min[0] || x > wb.max[0] || z < wb.min[2] || z > wb.max[2] || y > wb.max[1]) continue;
      const shape = decorShape(d);
      if (!shape.sdf) continue;
      const xf = itemTransform(d);
      toLocal(xf, [x, y, z], _l);
      if (sdfEval(shape.sdf, _l[0], _l[1], _l[2]) * xf.s < -pad) return true;
    }
    return false;
  }

  addPlant(speciesId: string | null, x: number, z: number, o: { growth?: number; attachTo?: DecorItem; rotY?: number } = {}): PlantInstance | null {
    if (!speciesId) return null;
    const sp = this.lib.get(speciesId);
    if (!sp) return null;
    const floating = sp.placement === 'floating' || sp.form === 'floating';
    const r = Math.min(0.06, sp.spreadCm / 200);
    const [cx, cz] = this.clamp(x, z, floating ? r : r * 0.4);
    let y = this.ground(cx, cz);
    if (floating) y = this.surfaceY;
    let px = cx, pz = cz;
    if (o.attachTo) {
      const a = hostAnchor(o.attachTo, cx, cz);
      px = a.p[0];
      pz = a.p[2];
      y = a.p[1];
    } else if (!floating && this.inStone(px, y + 0.005, pz)) {
      // Roots can't go into stone: this spot is under a rock.
      return null;
    }
    let growth = Math.min(1, Math.max(0.05, o.growth ?? this.rng.range(0.7, 0.95)));
    if (!floating && sp.form !== 'lily') {
      // Trimmed to the water column (ribbons may trail a little along the surface).
      const room = (this.surfaceY - y) * (sp.form === 'ribbon' ? 1.1 : 0.88);
      const cap = growthForHeight(sp, room);
      if (cap < 0.2) return null;
      growth = Math.min(growth, cap);
    }
    const plant: PlantInstance = {
      id: this.id('p'),
      speciesId,
      seed: this.rng.int(1, 2 ** 31 - 2),
      position: [px, y, pz],
      rotationY: o.rotY ?? this.rng.range(0, Math.PI * 2),
      growth,
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

  /** Height of the rock already under (x, z) among `among`, or the sand. */
  supportAt(x: number, z: number, among: DecorItem[]): number {
    let y = this.ground(x, z);
    for (const r of among) {
      const wb = itemWorldBounds(r);
      if (x < wb.min[0] || x > wb.max[0] || z < wb.min[2] || z > wb.max[2]) continue;
      y = Math.max(y, this.topOf(r, x, z));
    }
    return y;
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

  /**
   * Corals by light on the given rocks: each band takes a slice of the rock-top spots sorted from
   * the highest down (SPS up in the light, LPS and softies below, zoanthids and mushrooms low).
   */
  corals(rocks: DecorItem[], plan: CoralBand[]): void {
    const heightOf = (p: V3) => p[1] - this.ground(p[0], p[2]);
    const spots = rocks.flatMap((r) => this.rockPoints(r, 8, 0.35).map((p) => ({ p, host: r, h: heightOf(p) })));
    spots.sort((a, b) => b.h - a.h);
    const taken: V3[] = [];
    // A small tank starts with frags and small colonies, not the colonies of a mature show reef.
    const frag = clamp(0.55 + 0.45 * this.k, 0.6, 1);
    for (const { ids, band, count, spacing } of plan) {
      const avail = ids.filter((id) => this.has(id));
      if (!avail.length) continue;
      let n = 0;
      const lo = spots.length * band[0], hi = spots.length * band[1];
      for (let i = Math.floor(lo); i < hi && n < count; i++) {
        const sp = spots[i];
        if (taken.some((t) => Math.hypot(t[0] - sp.p[0], t[2] - sp.p[2]) < spacing)) continue;
        taken.push(sp.p);
        if (this.addPlant(avail[n % avail.length], sp.p[0], sp.p[2], { attachTo: sp.host, growth: this.rng.range(0.65, 0.95) * frag })) n++;
      }
    }
  }

  result(): { decor: DecorItem[]; plants: PlantInstance[] } {
    return { decor: this.decor, plants: this.plants };
  }
}

/**
 * A reef bommie: a base row of live rock, then smaller tiers, each bedded onto whatever is below
 * it, up to `height` above the sand (more tiers in deeper water). Returns the rocks it placed.
 */
function bommie(s: Scape, rk: number, u: number, v: number, width: number, height: number, arch: boolean): DecorItem[] {
  const list: DecorItem[] = [];
  const cx = s.x(u), cz = s.z(v);
  const maxY = Math.min(s.ceiling, s.ground(cx, cz) + height);
  const nBase = Math.max(2, Math.round(width / (0.17 * rk)));
  for (let i = 0; i < nBase; i++) {
    const t = nBase > 1 ? i / (nBase - 1) - 0.5 : 0;
    const x = cx + t * width + s.rng.range(-0.02, 0.02);
    const z = cz + s.rng.range(-0.05, 0.05) + Math.abs(t) * 0.06;
    list.push(s.addDecor('rock', 'live-rock', x, z, { scale: rk * s.rng.range(0.8, 1.05), seed: s.liveRockSeed(i % 2 ? 'shelf' : 'mound'), sink: 0.01 }));
  }
  const tiers = clamp(Math.round(height / (0.11 * rk)), 2, 6);
  for (let tier = 1; tier <= tiers; tier++) {
    const n = Math.max(1, nBase - tier);
    const narrow = Math.max(0.15, 1 - tier * (0.66 / tiers));
    for (let i = 0; i < n; i++) {
      const t = n > 1 ? i / (n - 1) - 0.5 : s.rng.range(-0.15, 0.15);
      const x = cx + t * width * narrow + s.rng.range(-0.02, 0.02);
      const z = cz + s.rng.range(-0.04, 0.02);
      const y = s.supportAt(x, z, list) - 0.025 * rk;
      const sc = rk * (tier === 1 ? s.rng.range(0.75, 0.95) : s.rng.range(0.6, 0.8)) * Math.max(0.6, 1 - (tier - 1) * 0.06);
      const form: LiveRockForm = tier === tiers || (arch && tier === 2 && i === 0) ? (arch ? 'arch' : 'shelf') : s.rng.chance(0.5) ? 'pillar' : 'mound';
      const probe: DecorItem = { id: 'probe', kind: 'rock', variant: 'live-rock', seed: s.liveRockSeed(form), position: [x, y, z], rotation: [0, 0, 0], scale: sc };
      if (itemWorldBounds(probe).max[1] > maxY) continue;
      list.push(s.addDecor('rock', 'live-rock', x, z, { scale: sc, y, seed: probe.seed, rotY: s.rng.range(0, Math.PI * 2) }));
    }
  }
  return list;
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
  const nRoots = k < 0.5 ? 2 : k > 0.8 ? 5 : 3;
  for (let i = 0; i < nRoots; i++) {
    const v = 0.25 + i * 0.06 + s.rng.range(-0.03, 0.03);
    const u = fu - 0.12 + i * 0.05 + s.rng.range(-0.03, 0.03);
    // Branches rise from the back corner toward the front-center (local +x).
    const yaw = s.yaw(-0.35 - i * 0.22 + s.rng.range(-0.15, 0.15));
    roots.push(s.addDecor('driftwood', 'branchwood', s.x(u) - 0.12 * k, s.z(v), { scale: k * s.rng.range(0.85, 1.15), rotY: yaw, sink: 0.004 }));
  }
  // A spiderwood crown where the roots cross: the focal point.
  roots.push(s.addDecor('driftwood', 'spiderwood', s.x(fu), s.z(0.38), { scale: k * 1.05, rotY: s.rng.range(0, Math.PI * 2), sink: 0.004 }));
  // A second, smaller root group on the far side for balance (a desktop tank has no room for it).
  if (s.W > 0.5) roots.push(s.addDecor('driftwood', 'branchwood', s.x(0.84), s.z(0.3), { scale: k * 0.75, rotY: s.yaw(Math.PI + 0.5), sink: 0.004 }));
  // A long tank gets a third, lower group on the other golden section, so the view isn't one lonely cluster.
  if (s.wf > 1.8) {
    for (let i = 0; i < 2; i++) {
      roots.push(s.addDecor('driftwood', 'branchwood', s.x(PHI + 0.06 + i * 0.06), s.z(0.28 + i * 0.08), { scale: k * s.rng.range(0.6, 0.75), rotY: s.yaw(Math.PI + 0.3 + i * 0.3), sink: 0.004 }));
    }
    roots.push(s.addDecor('driftwood', 'redmoor-root', s.x(PHI + 0.1), s.z(0.34), { scale: k * 0.7, sink: 0.004 }));
  }
  // Leaf litter beneath the wood and drifting into the open sand.
  s.addDecor('leaf-litter', 'catappa', s.x(fu + 0.02), s.z(0.55), { scale: k * 1.1 });
  s.addDecor('leaf-litter', 'catappa', s.x(fu - 0.12), s.z(0.68), { scale: k * 0.9 });
  s.addDecor('leaf-litter', 'oak', s.x(0.72), s.z(0.6), { scale: k });
  if (k > 0.8) s.addDecor('leaf-litter', 'guava', s.x(0.5), s.z(0.78), { scale: k * 0.8 });

  // Background curtain of vallisneria, thicker toward the sides (open middle for depth).
  const val = s.ribbon();
  s.band(val, 0.03, 0.3, 0.1, s.count(3, 9), 0.05);
  s.band(val, 0.55, 0.97, 0.1, s.count(3, 11), 0.05);
  s.band(s.water > 0.3 ? s.pick('vallisneria-americana-gigantea', 'vallisneria-spiralis') : val, 0.88, 0.98, 0.16, s.count(1, 3), 0.03);
  // Amazon swords: the classic centerpiece, off-center behind open sand (crypts in a small tank).
  const sword = s.fit(0.8, 'echinodorus-grisebachii-bleherae', 'echinodorus-ozelot', 'lagenandra-meeboldii-red', 'cryptocoryne-wendtii-green');
  s.addPlant(sword, s.x(0.66), s.z(0.32), { growth: 0.95 });
  if (k > 0.7) s.addPlant(s.fit(0.8, 'echinodorus-ozelot', 'echinodorus-grisebachii-bleherae', 'cryptocoryne-wendtii-brown'), s.x(0.78), s.z(0.42), { growth: 0.8 });
  s.addPlant(sword, s.x(0.24), s.z(0.2), { growth: 0.85 });
  if (s.wf > 1.8) for (const u of [0.5, 0.9]) s.addPlant(sword, s.x(u), s.z(s.rng.range(0.22, 0.35)), { growth: s.rng.range(0.8, 0.95) });
  // Midground crypts at the root bases.
  const crypt = s.pick('cryptocoryne-wendtii-brown', 'cryptocoryne-wendtii-green');
  for (let i = 0; i < s.count(3, 3); i++) {
    const x = s.x(fu + s.rng.range(-0.1, 0.18)), z = s.z(s.rng.range(0.42, 0.55));
    s.addPlant(i % 2 ? crypt : s.pick('cryptocoryne-wendtii-green', 'cryptocoryne-lutea'), x, z, { growth: s.rng.range(0.6, 0.9) });
  }
  // Pygmy chain sword lawn edging the sand.
  const chain = s.pick('helanthium-tenellum');
  for (let i = 0; i < s.count(1, 3); i++) s.addPlant(chain, s.x(0.75 + s.rng.range(-0.08, 0.15)), s.z(s.rng.range(0.6, 0.72)), { growth: s.rng.range(0.6, 0.9) });
  // Ferns tied to the wood.
  const woodPts = roots.flatMap((r) => s.woodPoints(r, 0.04, Math.min(0.3, s.water * 0.6)).map((p) => ({ p, host: r })));
  const fern = s.fit(0.6, 'microsorum-pteropus', 'microsorum-pteropus-narrow', 'microsorum-pteropus-windelov');
  const bolb = s.fit(0.6, 'bolbitis-heudelotii', 'microsorum-pteropus-windelov');
  for (let i = 0; i < Math.min(woodPts.length, s.count(3, 2)); i++) {
    const w = woodPts[Math.floor(s.rng.next() * woodPts.length)];
    s.addPlant(i % 3 === 2 ? bolb : fern, w.p[0], w.p[2], { attachTo: w.host, growth: s.rng.range(0.6, 0.95) });
  }
  // Frogbit drifting at the surface where the flow is calm — toward the sides and corners —
  // leaving the middle open for light shafts.
  const frog = s.pick('limnobium-laevigatum', 'salvinia-minima', 'phyllanthus-fluitans');
  for (let i = 0; i < s.count(3, 3); i++) {
    const u = s.rng.chance(0.5) ? s.rng.range(0.04, 0.26) : s.rng.range(0.72, 0.96);
    s.addPlant(frog, s.x(u), s.z(s.rng.range(0.3, 0.75)), { growth: s.rng.range(0.6, 1) });
  }
  return s.result();
}

/** A seiryu seed whose stone is tall and pointed (good oyaishi). */
function tallSeiryu(s: Scape): number {
  let best = s.rng.int(1, 2 ** 31 - 2), bestH = 0;
  for (let i = 0; i < 24; i++) {
    const seed = s.rng.int(1, 2 ** 31 - 2);
    const b = decorShape({ kind: 'rock', variant: 'seiryu', seed }).bounds;
    const ratio = b.max[1] / Math.max(b.max[0] - b.min[0], b.max[2] - b.min[2]);
    if (ratio > bestH) {
      bestH = ratio;
      best = seed;
    }
  }
  return best;
}

/** Classic Iwagumi: oyaishi, fukuishi, soeishi in seiryu, a carpet and hairgrass. */
function iwagumi(tank: TankState, lib: PlantIndex, seed: number) {
  const s = new Scape(tank, lib, seed);
  const k = s.k;
  const lean = s.rng.range(-0.18, -0.08);
  const strata = s.rng.range(0, Math.PI * 2);
  // Oyaishi: the main stone on the golden section, tallest, leaning into the open space.
  s.addDecor('rock', 'seiryu', s.x(1 - PHI), s.z(0.4), { scale: 2.5 * k, rotY: strata, rotZ: s.flip ? -lean : lean, sink: 0.012, seed: tallSeiryu(s) });
  // Fukuishi: second stone beside it, lower, facing the same way.
  s.addDecor('rock', 'seiryu', s.x(1 - PHI + 0.16), s.z(0.47), { scale: 1.6 * k, rotY: strata + 0.3, rotZ: s.flip ? -lean : lean, sink: 0.01 });
  // Soeishi: the accent stone in front of the main.
  s.addDecor('rock', 'seiryu', s.x(1 - PHI - 0.1), s.z(0.6), { scale: 0.8 * k, rotY: strata - 0.4, sink: 0.008 });
  // Suteishi: small stones that echo the group elsewhere.
  s.addDecor('rock', 'seiryu', s.x(0.78), s.z(0.52), { scale: 0.75 * k, rotY: strata + 0.6, sink: 0.008 });
  s.addDecor('rock', 'seiryu', s.x(0.86), s.z(0.4), { scale: 0.55 * k, rotY: strata + 1.1, sink: 0.006 });
  if (k > 0.7) s.addDecor('rock', 'seiryu', s.x(0.15), s.z(0.48), { scale: 0.5 * k, rotY: strata - 0.8, sink: 0.006 });
  // A long tank: the secondary group answers the main one across the open sand.
  if (s.wf > 1.8) {
    s.addDecor('rock', 'seiryu', s.x(0.72), s.z(0.36), { scale: 1.3 * k, rotY: strata + 0.2, rotZ: s.flip ? -lean : lean, sink: 0.01 });
    s.addDecor('rock', 'seiryu', s.x(0.06), s.z(0.36), { scale: 0.6 * k, rotY: strata - 0.3, sink: 0.006 });
  }
  // Carpet across the front, hairgrass toward the back so height rises gently.
  s.carpet(s.pick('micranthemum-monte-carlo', 'hemianthus-callitrichoides-cuba', 'glossostigma-elatinoides'), 0.03, 0.97, 0.45, 0.94, 1);
  const hair = s.pick('eleocharis-acicularis', 'eleocharis-parvula');
  for (let i = 0; i < s.count(6, 18); i++) {
    const u = s.rng.range(0.03, 0.97), v = s.rng.range(0.08, 0.45);
    const x = s.x(u), z = s.z(v);
    if (!s.blocked(x, z)) s.addPlant(hair, x, z, { growth: s.rng.range(0.7, 1) });
  }
  // Deep water: a taller grass meadow behind the stones keeps the frame from looking empty.
  if (s.water > 0.55) s.band(s.pick('eleocharis-montevidensis'), 0.04, 0.96, 0.06, s.count(4, 10), 0.04, [0.6, 0.9]);
  return s.result();
}

/** Dutch: terraced "streets" of stem plants in contrasting colors and textures. */
function dutch(tank: TankState, lib: PlantIndex, seed: number) {
  const s = new Scape(tank, lib, seed);
  const back = ['rotala-rotundifolia', 'hygrophila-corymbosa', 'ludwigia-palustris-super-red', 'limnophila-sessiliflora', 'rotala-hra', 'cabomba-caroliniana', 'hygrophila-difformis', 'ammannia-gracilis', 'ludwigia-repens', 'bacopa-monnieri', 'pogostemon-erectus'];
  const mid = ['alternanthera-reineckii-rosaefolia', 'rotala-macrandra', 'pogostemon-erectus', 'bacopa-caroliniana', 'ludwigia-arcuata', 'limnophila-aromatica', 'hemianthus-micranthemoides', 'alternanthera-reineckii-mini', 'hygrophila-pinnatifida'];
  const front = ['staurogyne-repens', 'hemianthus-micranthemoides', 'cryptocoryne-parva', 'lilaeopsis-brasiliensis', 'alternanthera-reineckii-mini', 'pogostemon-helferi'];
  /**
   * Streets of one species each, trimmed to a terrace height (fraction of the water column).
   * Species whose natural height is closest to the terrace are preferred, so a nano gets short
   * stems and a tall tank the tall ones.
   */
  const groups = (list: string[], v0: number, v1: number, n: number, perGroup: number, terrace: number) => {
    const want = terrace * s.water * 100;
    const avail = list
      .map((id, i) => ({ id, sp: lib.get(id), i }))
      .filter((e): e is { id: string; sp: PlantSpecies; i: number } => !!e.sp)
      .map((e) => ({ ...e, miss: Math.abs(Math.log(Math.max(want, 3) / e.sp.maxHeightCm)) + e.i * 0.04 }))
      .sort((a, b) => a.miss - b.miss)
      .slice(0, Math.max(3, Math.min(n, 6)))
      .sort((a, b) => a.i - b.i);
    if (!avail.length) return;
    for (let i = 0; i < n; i++) {
      const sp = avail[i % avail.length].sp;
      const g = clamp(growthForHeight(sp, (want / 100) * s.rng.range(0.85, 1)), 0.3, 0.95);
      // Streets run diagonally back across the tank.
      const u0 = (i + 0.1) / n, u1 = (i + 0.9) / n;
      for (let j = 0; j < perGroup; j++) {
        const t = j / Math.max(1, perGroup - 1);
        const u = u0 + (u1 - u0) * s.rng.range(0, 1);
        const v = v0 + (v1 - v0) * t + (u - 0.5) * 0.08;
        s.addPlant(sp.id, s.x(u), s.z(v), { growth: g * s.rng.range(0.92, 1.05) });
      }
    }
  };
  // Dutch terraces are dense, trimmed bushes: many bunches per street, kept at stepped heights.
  const streets = (base: number) => Math.max(3, Math.round(base * Math.min(s.wf, 2)));
  const deep = s.D > 0.8 ? 1 : 0;
  groups(back, 0.06, 0.22, streets(6), 5 + deep, 0.82);
  groups(mid, 0.3, 0.46, streets(5), 5 + deep, 0.5);
  groups(front, 0.58, 0.85, streets(5), 4 + deep, 0.2);
  // A single sword as a solitaire on the golden section.
  s.addPlant(s.fit(0.75, 'echinodorus-rubin', 'echinodorus-grisebachii-bleherae', 'lagenandra-meeboldii-red', 'cryptocoryne-wendtii-brown'), s.x(PHI), s.z(0.4), { growth: 0.9 });
  return s.result();
}

/** Malawi rockscape: stacked holey limestone with caves, open sand. */
function malawi(tank: TankState, lib: PlantIndex, seed: number) {
  const s = new Scape(tank, lib, seed);
  const k = s.k;
  const base: DecorItem[] = [];
  const n = clamp(Math.round(7 * k + 1), 4, 14);
  for (let i = 0; i < n; i++) {
    const u = 0.06 + (i / (n - 1)) * 0.88;
    // A gentle wave so the wall is deeper at the golden-section focal point.
    const v = 0.2 + 0.1 * Math.exp(-Math.pow((u - (1 - PHI)) / 0.15, 2)) + s.rng.range(-0.03, 0.03);
    base.push(s.addDecor('rock', 'texas-holey', s.x(u), s.z(v), { scale: k * s.rng.range(1.0, 1.4), sink: 0.012 }));
  }
  // Upper tiers wedged between the rocks below, leaving gaps (caves) — mbuna claim these. Deep
  // water gets a third tier, so the wall still reaches about half way up.
  let tier = base;
  const levels = s.water > 0.55 ? 3 : 2;
  for (let level = 0; level < levels; level++) {
    const next: DecorItem[] = [];
    for (let i = 0; i < tier.length - 1; i += 1) {
      if (s.rng.chance(level === 0 ? 0.25 : 0.5)) continue;
      const a = tier[i], b = tier[i + 1];
      const x = (a.position[0] + b.position[0]) / 2, z = (a.position[2] + b.position[2]) / 2 - 0.02 * level + s.rng.range(-0.02, 0.02);
      const y = Math.max(s.topOf(a, x, z), s.topOf(b, x, z)) - 0.03 * k;
      if (y - s.ground(x, z) > s.water * 0.5) continue;
      next.push(s.addDecor('rock', 'texas-holey', x, z, { scale: k * s.rng.range(0.75, 1.0) * (1 - level * 0.15), y, sink: 0 }));
    }
    if (next.length < 2) break;
    tier = next;
  }
  // A few caves and loose stones in front for territories.
  s.addDecor('cave', 'rock-cave', s.x(1 - PHI), s.z(0.48), { scale: k, rotY: s.yaw(s.rng.range(-0.3, 0.3)) });
  s.addDecor('rock', 'texas-holey', s.x(0.8), s.z(0.5), { scale: k * 0.8 });
  s.addDecor('cave', 'slate-cave', s.x(0.62), s.z(0.58), { scale: k * 0.9, rotY: s.rng.range(-0.3, 0.3) });
  if (s.wf > 1.8) {
    s.addDecor('cave', 'rock-cave', s.x(PHI + 0.2), s.z(0.45), { scale: k * 0.85, rotY: s.yaw(s.rng.range(-0.3, 0.3)) });
    s.addDecor('rock', 'texas-holey', s.x(0.15), s.z(0.55), { scale: k * 0.7 });
  }
  // Mbuna graze plants — only tough ones: anubias on a rock, onion plant in a corner.
  const host = base[Math.floor(base.length * 0.7)];
  const pts = s.rockPoints(host, 1);
  if (pts[0]) s.addPlant(s.pick('anubias-barteri', 'anubias-barteri-nana'), pts[0][0], pts[0][2], { attachTo: host });
  s.addPlant(s.water > 0.25 ? s.pick('crinum-calamistratum', 'vallisneria-americana-gigantea') : s.ribbon(), s.x(0.94), s.z(0.12));
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
  if (s.wf > 1.8) {
    roots.push(s.addDecor('driftwood', 'branchwood', s.x(PHI + 0.08), s.z(0.24), { scale: k * 0.8, rotY: s.yaw(Math.PI + 0.4), sink: 0.004 }));
    roots.push(s.addDecor('driftwood', 'redmoor-root', s.x(0.06), s.z(0.2), { scale: k * 0.7, sink: 0.004 }));
  }
  // A near-continuous carpet of fallen leaves, densest under the roots.
  const litter = ['catappa', 'oak', 'guava', 'catappa', 'oak'];
  const nLitter = Math.min(28, s.count(5, 14));
  for (let i = 0; i < nLitter; i++) {
    const u = 0.06 + ((i + s.rng.range(0, 1)) / nLitter) * 0.88;
    s.addDecor('leaf-litter', litter[i % litter.length], s.x(u), s.z(s.rng.range(0.3, 0.88)), { scale: k * s.rng.range(0.9, 1.3) });
  }
  s.addDecor('driftwood', 'spiderwood', s.x(0.38), s.z(0.22), { scale: k * 0.8, sink: 0.004 });
  const crypts = s.pick('cryptocoryne-wendtii-brown', 'cryptocoryne-beckettii');
  for (let i = 0; i < s.count(1, 3); i++) s.addPlant(crypts, s.x(s.rng.range(0.25, 0.75)), s.z(s.rng.range(0.25, 0.45)));
  const pts = roots.flatMap((r) => s.woodPoints(r, 0.04, Math.min(0.25, s.water * 0.5)).map((p) => ({ p, host: r })));
  for (let i = 0; i < Math.min(s.count(1, 2), pts.length); i++) {
    const w = pts[Math.floor(s.rng.next() * pts.length)];
    s.addPlant(s.fit(0.6, 'microsorum-pteropus-narrow', 'microsorum-pteropus', 'microsorum-pteropus-windelov'), w.p[0], w.p[2], { attachTo: w.host });
  }
  s.addPlant(s.pick('nymphaea-zenkeri', 'nymphaea-lotus-green'), s.x(0.68), s.z(0.2), { growth: 0.7 });
  const floaters = s.pick('phyllanthus-fluitans', 'salvinia-minima', 'limnobium-laevigatum');
  for (let i = 0; i < s.count(2, 4); i++) s.addPlant(floaters, s.x(s.rng.range(0.05, 0.95)), s.z(s.rng.range(0.1, 0.6)), { growth: s.rng.range(0.6, 1) });
  return s.result();
}

/** Nano shrimp tank: moss-covered wood, small crypts, buce on stone, cholla and leaves. */
function nanoShrimp(tank: TankState, lib: PlantIndex, seed: number) {
  const s = new Scape(tank, lib, seed);
  // Shrimp-scale hardscape: it grows with the tank, but stays a grove, not a forest.
  const k = Math.min(s.k, 0.75 + 0.25 * Math.max(0, s.wf - 1));
  const moss = s.pick('vesicularia-montagnei', 'taxiphyllum-barbieri');
  const flame = s.pick('taxiphyllum-flame', 'taxiphyllum-barbieri');
  /** A mossy wood-and-stone grove around (u, v). */
  const grove = (u: number, v: number, kk: number) => {
    const wood = s.addDecor('driftwood', 'spiderwood', s.x(u), s.z(v), { scale: kk * 0.9, sink: 0.003 });
    const stone = s.addDecor('rock', 'dragon-stone', s.x(u + 0.32), s.z(v + 0.05), { scale: kk * 0.9, sink: 0.006 });
    s.addDecor('rock', 'dragon-stone', s.x(u + 0.44), s.z(v + 0.15), { scale: kk * 0.55, sink: 0.004 });
    for (const p of s.woodPoints(wood, 0.03, 0.3).slice(0, 5)) s.addPlant(moss, p[0], p[2], { attachTo: wood, growth: s.rng.range(0.7, 1) });
    const tops = s.rockPoints(stone, 3);
    if (tops[0]) s.addPlant(s.pick('bucephalandra-brownie', 'anubias-nana-petite'), tops[0][0], tops[0][2], { attachTo: stone });
    if (tops[1]) s.addPlant(flame, tops[1][0], tops[1][2], { attachTo: stone });
    if (tops[2]) s.addPlant(s.pick('anubias-nana-petite', 'bucephalandra-wavy-green'), tops[2][0], tops[2][2], { attachTo: stone });
  };
  grove(1 - PHI, 0.4, k);
  if (s.wf > 1.6) grove(0.08, 0.3, k * 0.7);
  s.addDecor('driftwood', 'cholla', s.x(0.5), s.z(0.72), { scale: k, rotY: s.rng.range(-0.4, 0.4) });
  s.addDecor('leaf-litter', 'catappa', s.x(0.3), s.z(0.7), { scale: k * 0.7 });
  s.carpet(s.pick('micranthemum-monte-carlo', 'marsilea-hirsuta'), 0.05, 0.4, 0.65, 0.92, 0.8);
  for (let i = 0; i < s.count(1, 3); i++) s.addPlant(s.pick('cryptocoryne-parva', 'cryptocoryne-lutea'), s.x(s.rng.range(0.55, 0.95)), s.z(s.rng.range(0.6, 0.85)));
  // Kept trimmed below the surface, as a nano keeper would.
  s.band(s.reach(0.6, ['rotala-rotundifolia', 'hygrophila-polysperma', 'bacopa-monnieri']), 0.75, 0.97, 0.15, s.count(1, 2), 0.04, [0.38, 0.5]);
  s.addPlant(s.pick('salvinia-minima', 'lemna-minor'), s.x(0.85), s.z(0.3), { growth: 0.6 });
  return s.result();
}

/** Goldfish: smooth stones and tough, fast plants that survive grazing. */
function goldfish(tank: TankState, lib: PlantIndex, seed: number) {
  const s = new Scape(tank, lib, seed);
  const k = s.k;
  const stones: DecorItem[] = [];
  for (let i = 0; i < s.count(2, 4); i++) {
    stones.push(s.addDecor('rock', 'river-stone', s.x(s.rng.range(0.1, 0.9)), s.z(s.rng.range(0.25, 0.55)), { scale: k * s.rng.range(1.0, 2.2) }));
  }
  s.addDecor('pebbles', 'river', s.x(1 - PHI), s.z(0.68), { scale: k * 1.2 });
  s.addDecor('pebbles', 'river', s.x(0.8), s.z(0.72), { scale: k });
  s.band(s.ribbon(), 0.05, 0.95, 0.1, s.count(3, 10));
  s.addPlant(s.water > 0.25 ? s.pick('crinum-calamistratum') : null, s.x(0.9), s.z(0.2));
  for (const st of stones.slice(0, 3)) {
    const p = s.rockPoints(st, 1)[0];
    if (p) s.addPlant(s.fit(0.5, 'anubias-barteri', 'microsorum-pteropus', 'anubias-barteri-nana'), p[0], p[2], { attachTo: st });
  }
  s.addPlant(s.pick('aegagropila-linnaei'), s.x(0.55), s.z(0.8));
  s.addPlant(s.pick('aegagropila-linnaei'), s.x(0.6), s.z(0.84), { growth: 0.6 });
  s.band(s.pick('ceratophyllum-demersum', 'egeria-densa'), 0.75, 0.95, 0.2, s.count(1, 2));
  return s.result();
}

/** Nature aquarium: stones and a wood "tree" with moss canopy, carpet, ferns and stems. */
function nature(tank: TankState, lib: PlantIndex, seed: number) {
  const s = new Scape(tank, lib, seed);
  const k = s.k;
  const moss = s.pick('taxiphyllum-barbieri', 'vesicularia-montagnei');
  /** A manzanita "tree" whose upper limbs carry a few moss cushions, spaced apart, so the wood
   *  still reads as a little tree rather than a hedge. */
  const tree = (u: number, v: number, kk: number) => {
    const t = s.addDecor('driftwood', 'manzanita', s.x(u), s.z(v), { scale: kk, sink: 0.004 });
    const crownPts: V3[] = [];
    for (const p of s.woodPoints(t, 0.14 * kk, 0.6 * kk + 0.1).sort((p1, p2) => p2[1] - p1[1])) {
      if (crownPts.some((q) => Math.hypot(q[0] - p[0], q[1] - p[1], q[2] - p[2]) < 0.07 * Math.max(1, kk))) continue;
      crownPts.push(p);
      if (crownPts.length >= 4) break;
    }
    for (const p of crownPts) s.addPlant(moss, p[0], p[2], { attachTo: t, growth: s.rng.range(0.45, 0.75) });
  };
  tree(1 - PHI, 0.35, k * 1.1);
  const r1 = s.addDecor('rock', 'dragon-stone', s.x(1 - PHI - 0.06), s.z(0.48), { scale: k * 1.3, sink: 0.008 });
  s.addDecor('rock', 'dragon-stone', s.x(1 - PHI + 0.1), s.z(0.52), { scale: k * 0.9, sink: 0.006 });
  const r3 = s.addDecor('rock', 'dragon-stone', s.x(0.8), s.z(0.45), { scale: k * 1.1, sink: 0.008 });
  if (s.wf > 1.8) {
    tree(0.84, 0.3, k * 0.8);
    s.addDecor('rock', 'dragon-stone', s.x(0.7), s.z(0.5), { scale: k * 0.8, sink: 0.006 });
  }
  for (const [rock, sp] of [[r1, 'bucephalandra-brownie'], [r3, 'microsorum-pteropus-windelov']] as const) {
    const p = s.rockPoints(rock, 1)[0];
    if (p) s.addPlant(s.pick(sp, 'anubias-barteri-nana'), p[0], p[2], { attachTo: rock });
  }
  s.carpet(s.pick('micranthemum-monte-carlo', 'hemianthus-callitrichoides-cuba'), 0.03, 0.97, 0.62, 0.94, 1);
  // Background stems sized to the water: tall ones in a deep tank, short bushy ones in a nano.
  s.band(s.reach(0.8, ['rotala-rotundifolia', 'limnophila-sessiliflora', 'hygrophila-corymbosa', 'bacopa-monnieri']), 0.05, 0.4, 0.1, s.count(2, 5));
  s.band(s.reach(0.75, ['hygrophila-polysperma', 'limnophila-sessiliflora', 'hygrophila-difformis', 'pogostemon-erectus']), 0.6, 0.95, 0.1, s.count(2, 4));
  s.band(s.reach(0.65, ['ludwigia-palustris-super-red', 'rotala-macrandra', 'alternanthera-reineckii-mini']), 0.42, 0.58, 0.14, s.count(1, 1));
  for (let i = 0; i < s.count(2, 2); i++) s.addPlant(s.pick('cryptocoryne-wendtii-green', 'cryptocoryne-lutea'), s.x(s.rng.range(0.6, 0.95)), s.z(s.rng.range(0.45, 0.58)));
  s.band(s.pick('eleocharis-acicularis'), 0.1, 0.35, 0.56, s.count(2, 2), 0.03);
  return s.result();
}

/** Reef: live-rock bommies with an arch, corals placed by light, an anemone, macroalgae. */
function reef(tank: TankState, lib: PlantIndex, seed: number) {
  const s = new Scape(tank, lib, seed);
  const k = s.k;
  const rk = clamp(k * 0.85, 0.55, 1.45);
  const rocks: DecorItem[] = [];
  const reach = s.water * 0.6;
  rocks.push(...bommie(s, rk, 1 - PHI, 0.42, 0.42 * k, reach, true));
  const second = bommie(s, rk, 0.8, 0.45, 0.26 * k, reach * 0.72, false);
  rocks.push(...second);
  if (k > 0.9) rocks.push(...bommie(s, rk, 0.1, 0.32, 0.14 * k, reach * 0.45, false));
  if (s.wf > 1.8) rocks.push(...bommie(s, rk, PHI + 0.04, 0.3, 0.16 * k, reach * 0.55, false));
  // A few loose stones on the sand.
  for (let i = 0; i < 2; i++) rocks.push(s.addDecor('rock', 'live-rock', s.x(s.rng.range(0.5, 0.65)), s.z(s.rng.range(0.55, 0.7)), { scale: rk * 0.45, seed: s.liveRockSeed('mound'), sink: 0.008 }));
  s.addDecor('coral-skeleton', 'rubble', s.x(0.55), s.z(0.72), { scale: k });
  s.addDecor('coral-skeleton', 'rubble', s.x(0.2), s.z(0.65), { scale: k * 0.8 });

  // Corals by light: SPS high, LPS mid, softies/mushrooms/zoas low; sand dwellers in front.
  s.corals(rocks, [
    { ids: ['acropora-millepora', 'acropora-tenuis', 'acropora-formosa', 'seriatopora-hystrix', 'stylophora-pistillata', 'pocillopora-damicornis', 'montipora-digitata', 'acropora-hyacinthus'], band: [0, 0.25], count: Math.round(6 * k + 2), spacing: 0.09 },
    { ids: ['euphyllia-ancora', 'euphyllia-glabrescens', 'euphyllia-divisa', 'duncanopsammia-axifuga', 'caulastrea-furcata', 'montipora-capricornis', 'goniopora-lobata', 'platygyra-sinensis', 'dipsastraea-speciosa', 'favites-abdita', 'micromussa-lordhowensis', 'plerogyra-sinuosa'], band: [0.2, 0.6], count: Math.round(7 * k + 2), spacing: 0.1 },
    { ids: ['sarcophyton-toadstool', 'capnella-imbricata', 'xenia-elongata', 'sinularia-flexibilis'], band: [0.35, 0.75], count: Math.round(3 * k + 1), spacing: 0.12 },
    { ids: ['zoanthus-sociatus', 'zoanthus-rasta', 'palythoa-grandis', 'discosoma-red', 'discosoma-blue', 'rhodactis-indosinensis', 'ricordea-florida', 'ricordea-yuma', 'briareum-violaceum'], band: [0.55, 1], count: Math.round(6 * k + 2), spacing: 0.07 },
  ]);
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
  return s.result();
}

/**
 * Nano reef: one live-rock island with a ledge and a cave, a smaller stone beside it, soft
 * corals, zoanthids and mushrooms low, a few LPS higher up, an anemone for a clownfish pair once
 * there is room for one, and rubble on the sand.
 */
function nanoReef(tank: TankState, lib: PlantIndex, seed: number) {
  const s = new Scape(tank, lib, seed);
  const k = s.k;
  const rk = clamp(k * 0.8, 0.4, 1.1);
  const rocks: DecorItem[] = [];
  const island = bommie(s, rk, 1 - PHI + 0.04, 0.45, Math.max(0.12, 0.3 * k), s.water * 0.55, true);
  rocks.push(...island);
  const side = bommie(s, rk, 0.8, 0.5, Math.max(0.08, 0.14 * k), s.water * 0.3, false);
  rocks.push(...side);
  s.addDecor('coral-skeleton', 'rubble', s.x(0.58), s.z(0.75), { scale: k * 0.8 });
  s.corals(rocks, [
    { ids: ['montipora-capricornis', 'montipora-digitata', 'seriatopora-hystrix', 'duncanopsammia-axifuga'], band: [0, 0.25], count: Math.round(2 * k + 1), spacing: 0.06 },
    { ids: ['euphyllia-ancora', 'euphyllia-glabrescens', 'caulastrea-furcata', 'micromussa-lordhowensis', 'favites-abdita'], band: [0.2, 0.55], count: Math.round(3 * k + 1), spacing: 0.07 },
    { ids: ['xenia-elongata', 'clavularia-viridis', 'capnella-imbricata'], band: [0.35, 0.7], count: Math.round(2 * k + 1), spacing: 0.07 },
    { ids: ['zoanthus-sociatus', 'zoanthus-rasta', 'discosoma-red', 'discosoma-blue', 'ricordea-florida', 'rhodactis-indosinensis', 'palythoa-grandis'], band: [0.5, 1], count: Math.round(4 * k + 2), spacing: 0.05 },
  ]);
  // A bubble-tip anemone wants room to wander; below ~40 L the clownfish go without.
  const liters = (tank.size.widthCm * tank.size.heightCm * tank.size.depthCm) / 1000;
  const host = side[0] ?? island[0];
  if (liters >= 40 && host) {
    const spot = s.rockPoints(host, 4).sort((a, b) => a[1] - b[1])[1] ?? s.rockPoints(host, 1)[0];
    if (spot) s.addPlant(s.pick('entacmaea-quadricolor', 'entacmaea-quadricolor-rose'), spot[0], spot[2], { attachTo: host, growth: 0.75 });
  }
  s.addPlant(s.pick('phymanthus-crucifer'), s.x(0.36), s.z(0.82), { growth: 0.75 });
  s.addPlant(s.pick('trachyphyllia-geoffroyi', 'danafungia-scruposa'), s.x(0.62), s.z(0.84), { growth: 0.8 });
  return s.result();
}

/**
 * Fish-only with live rock: two big rock structures with open arches and swim-throughs over
 * wide sand flats, rubble and a conch — no corals, so the fish that would nip them can stay.
 */
function fowlr(tank: TankState, lib: PlantIndex, seed: number) {
  const s = new Scape(tank, lib, seed);
  const k = s.k;
  const rk = clamp(k * 0.9, 0.5, 1.6);
  /** An arch flanked by pillars and mounds, rising to `height` above the sand. */
  const structure = (u: number, v: number, kk: number, height: number) => {
    const cx = s.x(u), cz = s.z(v);
    s.addDecor('rock', 'live-rock', cx, cz, { scale: kk * 2.1, seed: s.liveRockSeed('arch'), rotY: s.yaw(s.rng.range(-0.25, 0.25)), sink: 0.012 });
    const feet: DecorItem[] = [];
    for (const side of [-1, 1]) {
      const x = cx + side * 0.26 * kk + s.rng.range(-0.02, 0.02);
      feet.push(s.addDecor('rock', 'live-rock', x, cz - 0.04 * kk, { scale: kk * s.rng.range(1.0, 1.2), seed: s.liveRockSeed('pillar'), sink: 0.012 }));
    }
    // Capstones bedded on the pillars, as high as the water allows.
    const maxY = Math.min(s.ceiling, s.ground(cx, cz) + height);
    for (const f of feet) {
      const x = f.position[0], z = f.position[2];
      const y = s.supportAt(x, z, [f]) - 0.02 * kk;
      const probe: DecorItem = { id: 'probe', kind: 'rock', variant: 'live-rock', seed: s.liveRockSeed('shelf'), position: [x, y, z], rotation: [0, 0, 0], scale: kk * 0.8 };
      if (itemWorldBounds(probe).max[1] <= maxY) s.addDecor('rock', 'live-rock', x, z, { scale: kk * 0.8, y, seed: probe.seed });
    }
    s.addDecor('rock', 'live-rock', cx + s.rng.range(-0.1, 0.1) * kk, cz + 0.16 * kk, { scale: kk * 0.55, seed: s.liveRockSeed('mound'), sink: 0.008 });
  };
  structure(1 - PHI, 0.38, rk, s.water * 0.62);
  structure(0.84, 0.42, rk * 0.7, s.water * 0.42);
  if (s.wf > 1.8) structure(PHI + 0.02, 0.3, rk * 0.6, s.water * 0.35);
  s.addDecor('coral-skeleton', 'rubble', s.x(0.55), s.z(0.7), { scale: k });
  s.addDecor('coral-skeleton', 'rubble', s.x(0.12), s.z(0.66), { scale: k * 0.8 });
  s.addDecor('shell', 'conch', s.x(0.66), s.z(0.78), { scale: Math.min(1.4, k) });
  // A little macroalgae at the rock bases — grazing for tangs and rabbitfish.
  s.addPlant(s.pick('caulerpa-prolifera', 'caulerpa-racemosa'), s.x(0.08), s.z(0.3), { growth: 0.7 });
  s.addPlant(s.pick('gracilaria-parvispora', 'halymenia-dilatata'), s.x(0.95), s.z(0.4), { growth: 0.7 });
  return s.result();
}

/**
 * Mangrove estuary: a tangle of red-mangrove prop roots arching down into a sloping bank of sand
 * and mud, fallen mangrove leaves drifted against them, open water in front. No rooted plants —
 * nothing grows in the dim, salty shade beneath a mangrove canopy.
 */
function mangrove(tank: TankState, lib: PlantIndex, seed: number) {
  const s = new Scape(tank, lib, seed);
  const k = s.k;
  const fu = 1 - PHI;
  // Root crowns: fine, branching heather roots read as the stilt roots of a mangrove stand.
  const crowns = k < 0.5 ? 1 : k > 1.3 ? 3 : 2;
  for (let i = 0; i < crowns; i++) {
    const u = fu - 0.1 + i * 0.12 + s.rng.range(-0.03, 0.03);
    s.addDecor('driftwood', i % 2 ? 'spiderwood' : 'redmoor-root', s.x(u), s.z(0.22 + i * 0.07), { scale: k * s.rng.range(1.05, 1.3), sink: 0.006 });
  }
  // Prop roots: long branches arching out of the back corner and fanning toward the front, as
  // they drop from the trunk into the mud.
  const nProps = Math.max(3, Math.round(3 + 2.5 * k));
  for (let i = 0; i < nProps; i++) {
    const t = nProps > 1 ? i / (nProps - 1) : 0.5;
    const u = 0.04 + t * (fu + 0.1) + s.rng.range(-0.03, 0.03);
    const yaw = s.yaw(-0.1 - t * 0.55 + s.rng.range(-0.15, 0.15));
    s.addDecor('driftwood', 'branchwood', s.x(u) - 0.1 * k, s.z(0.12 + t * 0.22), { scale: k * s.rng.range(0.85, 1.15), rotY: yaw, rotZ: s.rng.range(0.05, 0.2), sink: 0.008 });
  }
  // Drop roots: a few steep ones climbing toward the surface and hooking back into the bank, as if
  // they hung from the canopy above the water.
  for (let i = 0; i < (s.W > 0.5 ? 3 : 1); i++) {
    const u = fu - 0.14 + i * 0.12 + s.rng.range(-0.03, 0.03);
    s.addDecor('driftwood', 'branchwood', s.x(u), s.z(0.1 + i * 0.05), { scale: k * s.rng.range(0.8, 1.0), rotY: s.yaw(-0.25 - i * 0.2), rotZ: s.rng.range(0.65, 0.9), sink: 0.01 });
  }
  // The far bank: a smaller stand of roots leaning back the other way.
  if (s.W > 0.5) {
    s.addDecor('driftwood', 'redmoor-root', s.x(0.86), s.z(0.24), { scale: k * 0.8, sink: 0.006 });
    s.addDecor('driftwood', 'branchwood', s.x(0.92), s.z(0.2), { scale: k * 0.75, rotY: s.yaw(Math.PI + 0.45), sink: 0.008 });
  }
  if (s.wf > 1.8) {
    s.addDecor('driftwood', 'spiderwood', s.x(PHI + 0.08), s.z(0.2), { scale: k * 0.75, sink: 0.006 });
    s.addDecor('driftwood', 'branchwood', s.x(PHI + 0.02), s.z(0.18), { scale: k * 0.7, rotY: s.yaw(Math.PI + 0.25), sink: 0.008 });
  }
  // Fallen leaves drifted against the roots and scattered over the mud.
  const nLeaves = s.count(3, 6);
  for (let i = 0; i < nLeaves; i++) {
    const near = i % 2 === 0;
    const u = near ? fu + s.rng.range(-0.18, 0.15) : s.rng.range(0.05, 0.95);
    s.addDecor('leaf-litter', 'catappa', s.x(u), s.z(near ? s.rng.range(0.42, 0.6) : s.rng.range(0.55, 0.88)), { scale: k * s.rng.range(0.7, 1.1) });
  }
  // A few water-worn pebbles and empty shells where the current has sorted the sand.
  s.addDecor('pebbles', 'river', s.x(0.62), s.z(0.74), { scale: Math.min(1.3, k) });
  s.addDecor('shell', 'escargot', s.x(fu + 0.12), s.z(0.62), { scale: Math.min(1.2, k * 0.9) });
  if (s.W > 0.5) s.addDecor('shell', 'escargot', s.x(0.8), s.z(0.6), { scale: Math.min(1.1, k * 0.8) });
  return s.result();
}

/**
 * Brackish rock & sand: weathered limestone outcrops with a tide-sorted apron of rounded cobbles,
 * a leaning slate, a cave for a goby or puffer to claim, a piece of sun-bleached wood, and shells
 * on open sand.
 */
function brackishRock(tank: TankState, lib: PlantIndex, seed: number) {
  const s = new Scape(tank, lib, seed);
  const k = s.k;
  const fu = 1 - PHI;
  const strata = s.rng.range(0, Math.PI * 2);
  /** An outcrop of `n` stones around (u, v), cobbles spilling toward the front. */
  const outcrop = (u: number, v: number, kk: number, n: number, cobbles: number) => {
    s.addDecor('rock', 'seiryu', s.x(u), s.z(v), { scale: kk * 2.1, rotY: strata, sink: 0.012 });
    for (let i = 1; i < n; i++) {
      const side = i % 2 ? 1 : -1;
      s.addDecor('rock', 'seiryu', s.x(u + side * (0.07 + 0.03 * i)), s.z(v + 0.04 + 0.04 * i), { scale: kk * s.rng.range(0.9, 1.4) / (1 + i * 0.2), rotY: strata + s.rng.range(-0.5, 0.5), sink: 0.008 });
    }
    for (let i = 0; i < cobbles; i++) {
      const t = s.rng.range(-1, 1);
      s.addDecor('rock', 'river-stone', s.x(u + t * 0.14), s.z(v + 0.12 + Math.abs(t) * 0.05 + s.rng.range(0, 0.14)), { scale: kk * s.rng.range(0.7, 1.5) * (1 - Math.abs(t) * 0.35), sink: 0.004 });
    }
  };
  outcrop(fu, 0.3, k, s.W > 0.5 ? 4 : 3, s.W > 0.5 ? 6 : 3);
  s.addDecor('rock', 'slate', s.x(fu + 0.13), s.z(0.38), { scale: k * 0.9, rotY: s.yaw(0.5), rotZ: s.rng.range(0.3, 0.5) * (s.flip ? -1 : 1), sink: 0.025 });
  s.addDecor('cave', 'rock-cave', s.x(fu - 0.13), s.z(0.5), { scale: k * 0.75, rotY: s.yaw(s.rng.range(0.4, 0.8)) });
  // The answering outcrop across the open sand.
  if (s.W > 0.5) outcrop(0.84, 0.36, k * 0.7, 2, 4);
  if (s.wf > 1.8) outcrop(PHI + 0.04, 0.26, k * 0.55, 2, 3);
  s.addDecor('driftwood', 'mopani', s.x(0.57), s.z(0.34), { scale: k * 0.85, sink: 0.006 });
  // Shells and pebbles on the sand.
  s.addDecor('shell', 'conch', s.x(0.64), s.z(0.74), { scale: Math.min(1.2, k) });
  s.addDecor('shell', 'escargot', s.x(fu + 0.18), s.z(0.66), { scale: Math.min(1.2, k * 0.9) });
  s.addDecor('pebbles', 'river', s.x(0.42), s.z(0.8), { scale: Math.min(1.3, k) });
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
  { id: 'mangrove', name: 'Mangrove estuary', description: 'A tangle of mangrove prop roots arching into a sand-and-mud bank, fallen leaves and tea-tinted, gently salty water — home of bumblebee gobies, archerfish and puffers.', water: 'brackish', build: mangrove },
  { id: 'brackish-rock', name: 'Brackish rock & sand', description: 'Rounded estuary stones, slate caves and shells on open sand: territories for gobies and figure-eight puffers.', water: 'brackish', build: brackishRock },
  { id: 'nano-reef', name: 'Nano reef', description: 'A single live-rock island crowded with soft corals, zoanthids, mushrooms and a few LPS — a whole reef in a small cube.', water: 'marine', build: nanoReef },
  { id: 'fowlr', name: 'Fish-only with live rock', description: 'Big live-rock arches and swim-throughs over wide sand flats, no corals: room for angels, wrasses and puffers that would nip them.', water: 'marine', build: fowlr },
  { id: 'empty', name: 'Empty tank', description: 'Just substrate and water — a clean slate to aquascape yourself.', water: 'freshwater', build: () => ({ decor: [], plants: [] }) },
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
