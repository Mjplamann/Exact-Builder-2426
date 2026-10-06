import { Group, Mesh, Raycaster, type Ray, type Vector3 } from 'three';
import type { DecorItem, TankState } from '../../core/types';
import type { World } from '../../core/world';
import type { Engine } from '../Engine';
import { buildDecor, disposeDecor, isSdfDecor, rockGeometry, type BuildCtx, type BuiltDecor } from './hardscape';
import { ROCK_CELLS, type RockMeshData } from './rockMesh';
import { RockMesher } from './rockMesher';
import { highlightMaterial } from './materials';
import { DECOR_UNIFORMS } from './shaders';
import { PlantSystem } from './plants/PlantSystem';

export interface DecorPick {
  kind: 'decor' | 'plant';
  id: string;
  point: Vector3;
}

interface Entry {
  /** Geometry signature: rebuild when it changes. */
  key: string;
  /** Transform signature: move when it changes. */
  xform: string;
  built: BuiltDecor;
}

/** Seconds (sim) for coral polyps to follow the light: they open/close over ~20 minutes. */
const POLYP_TAU_SIM = 20 * 60;

/**
 * Builds and animates hardscape (rocks, driftwood, caves, shells, leaf litter, airstones) and
 * living plants/corals from TankState. Procedural meshes are deterministic per item seed.
 */
export class DecorRenderer {
  private root = new Group();
  private hardscape = new Group();
  private plants = new PlantSystem();
  private items = new Map<string, Entry>();
  private selected: { kind: 'decor' | 'plant'; id: string } | null = null;
  private overlays: Mesh[] = [];
  private raycaster = new Raycaster();
  private tankSig = '';
  private polyp = 1;
  private quality: string | null = null;
  private mesher = new RockMesher();
  private upgrades = new Set<Promise<void>>();
  /**
   * Mesh stones off the main thread: a quick low-resolution placeholder appears at once and is
   * swapped for the detailed mesh when the worker delivers it. Off under automation (QA
   * screenshots step frames synchronously and expect final meshes) — see `settle()`.
   */
  asyncMeshing = typeof Worker !== 'undefined' && !(typeof navigator !== 'undefined' && navigator.webdriver);

  constructor(private engine: Engine) {
    this.root.name = 'decor';
    this.hardscape.name = 'hardscape';
    this.root.add(this.hardscape, this.plants.root);
    this.engine.contents.add(this.root);
  }

  /** Diff world.tank.decor / world.tank.plants against built meshes; (re)build only what changed. */
  sync(world: World): void {
    const tank = world.tank;
    const quality = world.settings.quality;
    this.quality = quality;
    const sig = tankSignature(tank);
    const tankChanged = sig !== this.tankSig;
    this.tankSig = sig;
    const seen = new Set<string>();
    for (const item of tank.decor) {
      seen.add(item.id);
      const key = `${item.kind}|${item.variant}|${item.seed}|${quality}`;
      const xform = `${item.position.map((v) => v.toFixed(5)).join(',')}|${item.rotation.map((v) => v.toFixed(4)).join(',')}|${item.scale.toFixed(4)}`;
      const cur = this.items.get(item.id);
      if (cur && cur.key === key && (cur.xform === xform || !cur.built.positional) && !(tankChanged && cur.built.positional)) {
        if (cur.xform !== xform) {
          cur.xform = xform;
          applyTransform(cur.built.object, item);
        }
        continue;
      }
      if (cur) disposeDecor(cur.built);
      try {
        const ctx: BuildCtx = { tank, quality };
        let deferred = false;
        if (isSdfDecor(item)) {
          const cells = ROCK_CELLS[quality];
          const hit = this.mesher.cached(item, cells);
          if (hit) ctx.rock = hit;
          else if (this.asyncMeshing && this.mesher.available) {
            ctx.rock = this.mesher.meshNow(item, ROCK_CELLS.proxy);
            deferred = true;
          } else ctx.rock = this.mesher.meshNow(item, cells);
        }
        const built = buildDecor(item, ctx);
        this.hardscape.add(built.object);
        this.items.set(item.id, { key, xform, built });
        if (deferred) this.deferUpgrade(item, key, ROCK_CELLS[quality]);
      } catch (err) {
        console.error(`[decor] failed to build ${item.kind}/${item.variant}`, err);
        this.items.delete(item.id);
      }
    }
    for (const [id, e] of [...this.items]) {
      if (!seen.has(id)) {
        disposeDecor(e.built);
        this.items.delete(id);
      }
    }
    this.plants.sync(world);
    this.refreshHighlight();
  }

  /** Request the detailed mesh of a stone shown as a placeholder; swap it in when ready. */
  private deferUpgrade(item: DecorItem, key: string, cells: number): void {
    const id = item.id;
    const p = this.mesher.request(item, cells).then(
      (data) => this.upgrade(id, key, data),
      (err) => console.error('[decor] meshing failed', err),
    );
    this.upgrades.add(p);
    void p.finally(() => this.upgrades.delete(p));
  }

  private upgrade(id: string, key: string, data: RockMeshData): void {
    const e = this.items.get(id);
    if (!e || e.key !== key) return; // removed or rebuilt meanwhile
    const mesh = e.built.meshes[0];
    if (!mesh) return;
    const old = mesh.geometry;
    mesh.geometry = rockGeometry(data);
    old.dispose();
    if (this.selected?.kind === 'decor' && this.selected.id === id) this.refreshHighlight();
  }

  /** Resolves once every stone has its detailed mesh (QA / screenshots). */
  async settle(): Promise<void> {
    while (this.upgrades.size) await Promise.all([...this.upgrades]);
  }

  /** Plant sway in current, growth scaling, coral polyp pulsing, selection glow. */
  update(world: World, dt: number): void {
    // Polyps extend with the light and retract at night, lagging the lights by minutes (sim time).
    const env = world.env;
    const target = Math.min(1, env.daylight * 1.4 + env.moonlight * 0.25);
    const simDt = dt * Math.max(1, world.clock.paused ? 0 : world.clock.timeScale);
    const k = 1 - Math.exp(-simDt / POLYP_TAU_SIM);
    this.polyp += (target - this.polyp) * Math.min(1, Math.max(k, dt * 0.02));
    DECOR_UNIFORMS.uPolyp.value = this.polyp;
    // Quality changes arrive as a settings event the App doesn't forward to us: rebuild densities.
    if (this.quality !== null && world.settings.quality !== this.quality) this.sync(world);
    this.plants.update(world, dt);
  }

  pick(ray: Ray): DecorPick | null {
    this.raycaster.ray.copy(ray);
    this.raycaster.near = 0;
    this.raycaster.far = 50;
    const meshes: Mesh[] = [];
    for (const e of this.items.values()) meshes.push(...e.built.meshes);
    const hits = this.raycaster.intersectObjects(meshes, false);
    const decorHit = hits.find((h) => h.object.userData.decorId);
    const uniq = this.raycaster.intersectObjects(this.plants.uniqueMeshes(), false)[0];
    const plantHit = this.plants.pick(ray);
    let best: DecorPick | null = null;
    let bestD = Infinity;
    if (decorHit) {
      best = { kind: 'decor', id: decorHit.object.userData.decorId as string, point: decorHit.point.clone() };
      bestD = decorHit.distance;
    }
    if (uniq && uniq.distance < bestD) {
      best = { kind: 'plant', id: uniq.object.userData.plantId as string, point: uniq.point.clone() };
      bestD = uniq.distance;
    }
    if (plantHit && plantHit.distance < bestD) best = { kind: 'plant', id: plantHit.id, point: plantHit.point };
    return best;
  }

  setSelected(sel: { kind: 'decor' | 'plant'; id: string } | null): void {
    this.selected = sel;
    this.plants.setSelected(sel?.kind === 'plant' ? sel.id : null);
    this.refreshHighlight();
  }

  private refreshHighlight(): void {
    for (const o of this.overlays) o.removeFromParent();
    this.overlays = [];
    if (this.selected?.kind !== 'decor') return;
    const e = this.items.get(this.selected.id);
    if (!e) return;
    for (const m of e.built.meshes) {
      const o = new Mesh(m.geometry, highlightMaterial());
      o.renderOrder = 5;
      o.userData.overlay = true;
      m.add(o);
      this.overlays.push(o);
    }
  }

  dispose(): void {
    for (const e of this.items.values()) disposeDecor(e.built);
    this.items.clear();
    this.mesher.dispose();
    this.plants.dispose();
    this.root.removeFromParent();
  }
}

function applyTransform(obj: Group, item: DecorItem): void {
  obj.position.set(item.position[0], item.position[1], item.position[2]);
  obj.rotation.set(item.rotation[0], item.rotation[1], item.rotation[2]);
  obj.scale.setScalar(item.scale > 0 ? item.scale : 1);
}

function tankSignature(t: TankState): string {
  return `${t.size.widthCm}x${t.size.heightCm}x${t.size.depthCm}|${t.substrate}|${t.substrateDepthFrontCm}|${t.substrateDepthBackCm}|${t.seed}`;
}
