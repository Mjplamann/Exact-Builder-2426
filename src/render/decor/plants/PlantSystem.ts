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
import type { V3 } from '../../../decor/shapes';
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
  /** Cheap change detection between full syncs (quantized growth/health, transform). */
  g: number;
  h: number;
  x: number;
  z: number;
  r: number;
}

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

const GROWTH_STEP = 0.025;
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
  private keyOf(p: PlantInstance, tank: TankState, quality: Quality): string {
    const host = p.attachedTo ? tank.decor.find((d) => d.id === p.attachedTo) : undefined;
    const hostKey = host ? `${host.seed}:${host.position.map((v) => v.toFixed(4)).join(',')}:${host.rotation.map((v) => v.toFixed(3)).join(',')}:${host.scale.toFixed(3)}` : '';
    const g = Math.round(p.growth / GROWTH_STEP);
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
      const key = this.keyOf(p, tank, quality);
      const cur = this.built.get(p.id);
      if (cur && cur.key === key) continue;
      if (cur) this.drop(p.id, cur);
      const build = this.buildPlant(sp, p, tank, quality);
      this.built.set(p.id, { key, build, speciesId: sp.id, g: Math.round(p.growth / GROWTH_STEP), h: Math.round(p.health * 8), x: p.position[0], z: p.position[2], r: p.rotationY });
      for (const k of build.parts.keys()) this.dirtyParts.add(k);
      for (const mesh of build.meshes) {
        mesh.userData.plantId = p.id;
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
      changed = b.g !== Math.round(p.growth / GROWTH_STEP) || b.h !== Math.round(p.health * 8) || b.x !== p.position[0] || b.z !== p.position[2] || b.r !== p.rotationY;
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

  /** Ray vs. plant proxies (capsules). Returns the nearest hit. */
  pick(ray: Ray): { id: string; distance: number; point: Vector3 } | null {
    let best: { id: string; distance: number; point: Vector3 } | null = null;
    const a = new Vector3(), b = new Vector3(), pr = new Vector3(), ps = new Vector3();
    for (const [id, bt] of this.built) {
      const px = bt.build.proxy;
      a.set(...(px.a as V3));
      b.set(...(px.b as V3));
      const d2 = ray.distanceSqToSegment(a, b, pr, ps);
      if (d2 > px.r * px.r) continue;
      const dist = ray.origin.distanceTo(pr) - Math.sqrt(Math.max(0, px.r * px.r - d2)) * 0.5;
      if (!best || dist < best.distance) best = { id, distance: dist, point: ps.clone() };
    }
    return best;
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
