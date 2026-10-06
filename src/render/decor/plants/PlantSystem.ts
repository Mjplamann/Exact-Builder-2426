/**
 * Living plants & corals: builds each plant from its species + instance (deterministic per seed),
 * batches instanced parts across all plants into one InstancedMesh per part, and keeps them in
 * step with growth/health changes and selection.
 */
import {
  DynamicDrawUsage, Group, InstancedBufferAttribute, InstancedMesh, Matrix4, Vector3,
  type Mesh, type Ray,
} from 'three';
import type { PlantInstance, PlantSpecies, Quality, TankState } from '../../../core/types';
import type { World } from '../../../core/world';
import { Rng } from '../../../core/rng';
import { substrateHeight, tankBounds } from '../../../core/tankGeometry';
import { plantMetrics } from '../../../decor/plantMetrics';
import { densityOf, newBuild, type GenArgs, type Inst, type PlantBuild, type PlantCtx } from './kit';
import type { PartDef } from './parts';
import {
  genBall, genBulb, genCarpet, genEpiphyte, genFloating, genGrass, genLily, genMacroalgae, genMoss, genRibbon, genRosette, genStem,
} from './flora';
import { genCoral } from './corals';

interface Built {
  key: string;
  build: PlantBuild;
  speciesId: string;
  /** Growth quantum between rebuilds (see growthStep). */
  step: number;
  /** Cheap change detection between full syncs (quantized growth/health, transform). */
  g: number;
  h: number;
  x: number;
  z: number;
  r: number;
  /** World AABB of every instance and unique mesh (picking broad phase): min xyz, max xyz. */
  bb: Float64Array;
}

/** Extra reach (m) around leaves and stems when picking, so hair-thin blades are clickable. */
const PICK_TOL = 0.002;

interface Batch {
  def: PartDef;
  mesh: InstancedMesh;
  capacity: number;
  sway: InstancedBufferAttribute;
  leaf: InstancedBufferAttribute;
  width: InstancedBufferAttribute;
  sel: InstancedBufferAttribute;
  /** plant id → [start, count] within this batch. */
  ranges: Map<string, [number, number]>;
}

/**
 * Growth fraction between geometry rebuilds, per species: each rebuild may change a plant's
 * height or spread by at most ~5 mm, so a metre-long vallisneria or a spreading carpet grows
 * smoothly under time-lapse instead of hopping a centimetre at a time.
 */
export function growthStep(sp: PlantSpecies): number {
  const reach = Math.max(sp.maxHeightCm * 0.82, sp.spreadCm * 0.75) / 100;
  return Math.min(0.025, Math.max(0.004, 0.005 / Math.max(1e-3, reach)));
}
const _m = new Matrix4();

export class PlantSystem {
  readonly root = new Group();
  private built = new Map<string, Built>();
  private batches = new Map<string, Batch>();
  private dirtyParts = new Set<string>();
  private selected: string | null = null;
  private checkTimer = 0;
  /** Plants in the tank at the last sync (including ones whose species is unknown). */
  private syncedCount = -1;

  constructor() {
    this.root.name = 'plants';
  }

  /** Stable signature of everything that changes a plant's geometry. */
  private keyOf(p: PlantInstance, sp: PlantSpecies, tank: TankState, quality: Quality): string {
    const host = p.attachedTo ? tank.decor.find((d) => d.id === p.attachedTo) : undefined;
    const hostKey = host ? `${host.seed}:${host.position.map((v) => v.toFixed(4)).join(',')}:${host.rotation.map((v) => v.toFixed(3)).join(',')}:${host.scale.toFixed(3)}` : '';
    const g = Math.round(p.growth / growthStep(sp));
    const h = Math.round(p.health * 8);
    const b = tankBounds(tank);
    return `${p.speciesId}|${p.seed}|${g}|${h}|${p.position.map((v) => v.toFixed(4)).join(',')}|${p.rotationY.toFixed(3)}|${hostKey}|${quality}|${b.surfaceY.toFixed(3)}|${tank.substrate}|${tank.substrateDepthBackCm}|${tank.substrateDepthFrontCm}`;
  }

  sync(world: World): void {
    const tank = world.tank;
    const quality = world.settings.quality;
    const seen = new Set<string>();
    for (const p of tank.plants) {
      const sp = world.plants.get(p.speciesId);
      if (!sp) continue;
      seen.add(p.id);
      const key = this.keyOf(p, sp, tank, quality);
      const cur = this.built.get(p.id);
      if (cur && cur.key === key) continue;
      if (cur) this.drop(p.id, cur);
      const build = this.buildPlant(sp, p, tank, quality);
      const step = growthStep(sp);
      this.built.set(p.id, { key, build, speciesId: sp.id, step, g: Math.round(p.growth / step), h: Math.round(p.health * 8), x: p.position[0], z: p.position[2], r: p.rotationY, bb: worldBounds(build) });
      for (const k of build.parts.keys()) this.dirtyParts.add(k);
      for (const mesh of build.meshes) {
        mesh.userData.plantId = p.id;
        // The Engine turns shadows on for every mesh unless told otherwise.
        if (!mesh.castShadow) mesh.userData.castShadow = false;
        this.root.add(mesh);
      }
    }
    for (const [id, b] of [...this.built]) if (!seen.has(id)) this.drop(id, b);
    this.syncedCount = tank.plants.length;
    this.flush();
    if (this.selected) this.applySelection(this.selected, 1);
  }

  private drop(id: string, b: Built): void {
    for (const k of b.build.parts.keys()) this.dirtyParts.add(k);
    for (const mesh of b.build.meshes) {
      mesh.removeFromParent();
      mesh.geometry.dispose();
      (mesh.material as { dispose(): void }).dispose();
    }
    this.built.delete(id);
  }

  private buildPlant(sp: PlantSpecies, p: PlantInstance, tank: TankState, quality: Quality): PlantBuild {
    const m = plantMetrics(sp, p, tank);
    const ctx: PlantCtx = {
      tank,
      quality,
      density: densityOf(quality),
      surfaceY: tankBounds(tank).surfaceY,
      ground: (x, z) => substrateHeight(tank, x, z),
    };
    const out = newBuild(m);
    const args: GenArgs = { sp, p, m, ctx, rng: new Rng(p.seed ^ 0x1b873593), out };
    try {
      switch (sp.form) {
        case 'rosette':
          genRosette(args);
          break;
        case 'ribbon':
        case 'seagrass':
          genRibbon(args);
          break;
        case 'stem':
        case 'fine-stem':
          genStem(args);
          break;
        case 'epiphyte-fern':
        case 'epiphyte-broadleaf':
          genEpiphyte(args);
          break;
        case 'carpet':
          genCarpet(args);
          break;
        case 'grass':
          genGrass(args);
          break;
        case 'moss':
          genMoss(args);
          break;
        case 'floating':
          genFloating(args);
          break;
        case 'lily':
          genLily(args);
          break;
        case 'bulb':
          genBulb(args);
          break;
        case 'ball':
          genBall(args);
          break;
        case 'macroalgae':
          genMacroalgae(args);
          break;
        default:
          genCoral(args);
      }
    } catch (err) {
      console.error(`[decor] failed to build plant ${sp.id}`, err);
    }
    return out;
  }

  /** Rewrite every batch whose instances changed. */
  private flush(): void {
    if (!this.dirtyParts.size) return;
    for (const key of this.dirtyParts) {
      const lists: { id: string; inst: Inst[]; def: PartDef }[] = [];
      for (const [id, b] of this.built) {
        const u = b.build.parts.get(key);
        if (u && u.inst.length) lists.push({ id, inst: u.inst, def: u.def });
      }
      const total = lists.reduce((n, l) => n + l.inst.length, 0);
      let batch = this.batches.get(key);
      if (!total) {
        if (batch) batch.mesh.visible = false;
        continue;
      }
      if (!batch || batch.capacity < total) {
        if (batch) {
          batch.mesh.removeFromParent();
          batch.mesh.geometry.dispose();
          batch.mesh.dispose();
        }
        batch = this.makeBatch(lists[0].def, Math.ceil(total * 1.3) + 16);
        this.batches.set(key, batch);
      }
      batch.ranges.clear();
      let i = 0;
      const sw = batch.sway.array as Float32Array, lf = batch.leaf.array as Float32Array, se = batch.sel.array as Float32Array;
      const wd = batch.width.array as Float32Array;
      for (const l of lists) {
        batch.ranges.set(l.id, [i, l.inst.length]);
        for (const it of l.inst) {
          _m.fromArray(it.m);
          batch.mesh.setMatrixAt(i, _m);
          batch.mesh.instanceColor!.setXYZ(i, it.c[0], it.c[1], it.c[2]);
          sw.set(it.s, i * 4);
          lf.set(it.l, i * 4);
          wd[i] = it.w;
          se[i] = 0;
          i++;
        }
      }
      batch.mesh.count = total;
      batch.mesh.visible = true;
      batch.mesh.instanceMatrix.needsUpdate = true;
      batch.mesh.instanceColor!.needsUpdate = true;
      batch.sway.needsUpdate = true;
      batch.leaf.needsUpdate = true;
      batch.width.needsUpdate = true;
      batch.sel.needsUpdate = true;
    }
    this.dirtyParts.clear();
  }

  private makeBatch(def: PartDef, capacity: number): Batch {
    // Each batch owns a geometry clone so instanced attributes are per batch.
    const geo = def.geometry.clone();
    const sway = new InstancedBufferAttribute(new Float32Array(capacity * 4), 4);
    const leaf = new InstancedBufferAttribute(new Float32Array(capacity * 4), 4);
    const width = new InstancedBufferAttribute(new Float32Array(capacity).fill(1), 1);
    const sel = new InstancedBufferAttribute(new Float32Array(capacity), 1);
    sel.setUsage(DynamicDrawUsage);
    geo.setAttribute('aSway', sway);
    geo.setAttribute('aLeaf', leaf);
    geo.setAttribute('aWidth', width);
    geo.setAttribute('aSel', sel);
    const mesh = new InstancedMesh(geo, def.material, capacity);
    mesh.instanceColor = new InstancedBufferAttribute(new Float32Array(capacity * 3), 3);
    mesh.count = 0;
    mesh.frustumCulled = false;
    mesh.castShadow = def.castShadow;
    // The Engine enables shadows on every mesh unless opted out: tiny parts (carpet mats, roots,
    // star polyps) would only add cost to the shadow pass.
    if (!def.castShadow) mesh.userData.castShadow = false;
    mesh.receiveShadow = true;
    if (def.depth) mesh.customDepthMaterial = def.depth;
    mesh.name = `plants:${def.key}`;
    this.root.add(mesh);
    return { def, mesh, capacity, sway, leaf, width, sel, ranges: new Map() };
  }

  /** Re-check growth / health a few times a second (life sim changes them in sim time). */
  update(world: World, dt: number): void {
    this.checkTimer -= dt;
    if (this.checkTimer > 0) return;
    this.checkTimer = 0.75;
    // Growth & health change in sim time (LifeSim); positions change through events (sync).
    // Allocation-free scan; a full keyed sync only when something actually moved or grew.
    const tank = world.tank;
    let changed = this.syncedCount !== tank.plants.length;
    for (let i = 0; i < tank.plants.length && !changed; i++) {
      const p = tank.plants[i];
      const b = this.built.get(p.id);
      if (!b) continue; // unknown species — never built, nothing to update
      changed = b.g !== Math.round(p.growth / b.step) || b.h !== Math.round(p.health * 8) || b.x !== p.position[0] || b.z !== p.position[2] || b.r !== p.rotationY;
    }
    if (changed) this.sync(world);
  }

  setSelected(id: string | null): void {
    if (this.selected === id) return;
    if (this.selected) this.applySelection(this.selected, 0);
    this.selected = id;
    if (id) this.applySelection(id, 1);
  }

  private applySelection(id: string, v: number): void {
    for (const batch of this.batches.values()) {
      const r = batch.ranges.get(id);
      if (!r) continue;
      const arr = batch.sel.array as Float32Array;
      arr.fill(v, r[0], r[0] + r[1]);
      batch.sel.needsUpdate = true;
    }
    const b = this.built.get(id);
    if (b) for (const u of b.build.selUniforms) u.value = v;
  }

  /**
   * Ray vs. the plants' instanced parts (leaves, stems, polyps, pads): each instance is tested
   * against the bounds of its own deformed shape in its local frame (a bent leaf as three
   * boxes along its arc), so a click between two sword leaves reaches the stone behind them and
   * a ray skimming over a carpet misses it. Unique meshes (coral skeletons, marimo) are
   * raycast exactly by the caller. Returns the nearest hit.
   */
  pick(ray: Ray): { id: string; distance: number; point: Vector3 } | null {
    let bestT = Infinity;
    let bestId: string | null = null;
    const o = ray.origin, d = ray.direction;
    for (const [id, bt] of this.built) {
      const bb = bt.bb;
      const tb = slab(o.x, o.y, o.z, d.x, d.y, d.z, bb[0] - PICK_TOL, bb[1] - PICK_TOL, bb[2] - PICK_TOL, bb[3] + PICK_TOL, bb[4] + PICK_TOL, bb[5] + PICK_TOL);
      if (tb >= bestT) continue;
      for (const u of bt.build.parts.values()) {
        const t = pickPart(u.def, u.inst, o.x, o.y, o.z, d.x, d.y, d.z, bestT);
        if (t < bestT) {
          bestT = t;
          bestId = id;
        }
      }
    }
    if (!bestId) return null;
    return { id: bestId, distance: bestT, point: ray.at(bestT, new Vector3()) };
  }

  /** Unique meshes for precise picking (corals, marimo). */
  uniqueMeshes(): Mesh[] {
    const out: Mesh[] = [];
    for (const b of this.built.values()) out.push(...b.build.meshes);
    return out;
  }

  dispose(): void {
    for (const [id, b] of [...this.built]) this.drop(id, b);
    for (const batch of this.batches.values()) {
      batch.mesh.removeFromParent();
      batch.mesh.geometry.dispose();
      batch.mesh.dispose();
    }
    this.batches.clear();
  }
}

// ---------------------------------------------------------------------------------------------
// Picking helpers
// ---------------------------------------------------------------------------------------------

/** Ray (o + t·d) vs. axis-aligned box: entry distance, 0 when starting inside, Infinity on a miss. */
function slab(ox: number, oy: number, oz: number, dx: number, dy: number, dz: number, x0: number, y0: number, z0: number, x1: number, y1: number, z1: number): number {
  let tn = 0, tf = Infinity;
  if (Math.abs(dx) < 1e-12) {
    if (ox < x0 || ox > x1) return Infinity;
  } else {
    let a = (x0 - ox) / dx, b = (x1 - ox) / dx;
    if (a > b) [a, b] = [b, a];
    if (a > tn) tn = a;
    if (b < tf) tf = b;
    if (tn > tf) return Infinity;
  }
  if (Math.abs(dy) < 1e-12) {
    if (oy < y0 || oy > y1) return Infinity;
  } else {
    let a = (y0 - oy) / dy, b = (y1 - oy) / dy;
    if (a > b) [a, b] = [b, a];
    if (a > tn) tn = a;
    if (b < tf) tf = b;
    if (tn > tf) return Infinity;
  }
  if (Math.abs(dz) < 1e-12) {
    if (oz < z0 || oz > z1) return Infinity;
  } else {
    let a = (z0 - oz) / dz, b = (z1 - oz) / dz;
    if (a > b) [a, b] = [b, a];
    if (a > tn) tn = a;
    if (b < tf) tf = b;
    if (tn > tf) return Infinity;
  }
  return tn;
}

/** Point on a leaf's bend arc (leaf space, unit length) at v: [y, z]. */
function arcAt(k: number, v: number): [number, number] {
  if (Math.abs(k) < 1e-3) return [v, 0];
  return [Math.sin(k * v) / k, (1 - Math.cos(k * v)) / k];
}

/** Nearest hit (< maxT) of a ray on the instances of one part. */
function pickPart(def: PartDef, inst: Inst[], ox: number, oy: number, oz: number, dx: number, dy: number, dz: number, maxT: number): number {
  const g = def.geometry;
  if (!g.boundingBox) g.computeBoundingBox();
  const gb = g.boundingBox!;
  let best = maxT;
  for (let i = 0; i < inst.length; i++) {
    const it = inst[i];
    const m = it.m;
    const sx2 = m[0] * m[0] + m[1] * m[1] + m[2] * m[2];
    const sy2 = m[4] * m[4] + m[5] * m[5] + m[6] * m[6];
    const sz2 = m[8] * m[8] + m[9] * m[9] + m[10] * m[10];
    if (sx2 < 1e-16 || sy2 < 1e-16 || sz2 < 1e-16) continue;
    // Instance matrices have orthogonal columns (rotation × scale): invert by projection.
    const px = ox - m[12], py = oy - m[13], pz = oz - m[14];
    const lox = (m[0] * px + m[1] * py + m[2] * pz) / sx2, loy = (m[4] * px + m[5] * py + m[6] * pz) / sy2, loz = (m[8] * px + m[9] * py + m[10] * pz) / sz2;
    const ldx = (m[0] * dx + m[1] * dy + m[2] * dz) / sx2, ldy = (m[4] * dx + m[5] * dy + m[6] * dz) / sy2, ldz = (m[8] * dx + m[9] * dy + m[10] * dz) / sz2;
    const tx = PICK_TOL / Math.sqrt(sx2), ty = PICK_TOL / Math.sqrt(sy2), tz = PICK_TOL / Math.sqrt(sz2);
    if (!def.bend) {
      const t = slab(lox, loy, loz, ldx, ldy, ldz, gb.min.x - tx, gb.min.y - ty, gb.min.z - tz, gb.max.x + tx, gb.max.y + ty, gb.max.z + tz);
      if (t < best) best = t;
      continue;
    }
    // Bending part: the shader scales x by the width ratio, twists around the axis and bends
    // the blade along a circular arc of total angle k (see dcLeafBend).
    const k = it.l[0];
    const hx = Math.max(Math.abs(gb.min.x), Math.abs(gb.max.x)) * it.w;
    const thick = Math.max(Math.abs(gb.min.z), Math.abs(gb.max.z));
    const leak = hx * Math.min(1, Math.abs(it.l[1]));
    const e = thick + leak;
    const v0 = Math.max(0, gb.min.y), v1 = gb.max.y;
    for (let s = 0; s < 3; s++) {
      const a = arcAt(k, v0 + ((v1 - v0) * s) / 3), b = arcAt(k, v0 + ((v1 - v0) * (s + 1)) / 3);
      const t = slab(
        lox, loy, loz, ldx, ldy, ldz,
        -hx - leak - tx, Math.min(a[0], b[0]) - e - ty, Math.min(a[1], b[1]) - e - tz,
        hx + leak + tx, Math.max(a[0], b[0]) + e + ty, Math.max(a[1], b[1]) + e + tz,
      );
      if (t < best) best = t;
    }
  }
  return best;
}

/** World AABB of a plant build (instances by their part's bounding sphere, unique meshes). */
function worldBounds(build: PlantBuild): Float64Array {
  const bb = new Float64Array([Infinity, Infinity, Infinity, -Infinity, -Infinity, -Infinity]);
  const grow = (x: number, y: number, z: number, r: number) => {
    if (x - r < bb[0]) bb[0] = x - r;
    if (y - r < bb[1]) bb[1] = y - r;
    if (z - r < bb[2]) bb[2] = z - r;
    if (x + r > bb[3]) bb[3] = x + r;
    if (y + r > bb[4]) bb[4] = y + r;
    if (z + r > bb[5]) bb[5] = z + r;
  };
  for (const u of build.parts.values()) {
    const g = u.def.geometry;
    if (!g.boundingSphere) g.computeBoundingSphere();
    const bs = g.boundingSphere!;
    for (const it of u.inst) {
      const m = it.m;
      const s = Math.sqrt(Math.max(m[0] * m[0] + m[1] * m[1] + m[2] * m[2], m[4] * m[4] + m[5] * m[5] + m[6] * m[6], m[8] * m[8] + m[9] * m[9] + m[10] * m[10]));
      if (u.def.bend) {
        // A bent blade stays within its (unit) length of the base, plus its half width.
        grow(m[12], m[13], m[14], s * Math.max(1, bs.radius + bs.center.length()) * Math.max(1, it.w));
      } else {
        const c = bs.center;
        grow(m[12] + m[0] * c.x + m[4] * c.y + m[8] * c.z, m[13] + m[1] * c.x + m[5] * c.y + m[9] * c.z, m[14] + m[2] * c.x + m[6] * c.y + m[10] * c.z, s * bs.radius);
      }
    }
  }
  for (const mesh of build.meshes) {
    const g = mesh.geometry;
    if (!g.boundingBox) g.computeBoundingBox();
    const b = g.boundingBox!;
    grow(b.min.x, b.min.y, b.min.z, 0);
    grow(b.max.x, b.max.y, b.max.z, 0);
  }
  if (bb[0] > bb[3]) {
    const p = build.proxy;
    grow(p.a[0], p.a[1], p.a[2], p.r);
    grow(p.b[0], p.b[1], p.b[2], p.r);
  }
  return bb;
}
