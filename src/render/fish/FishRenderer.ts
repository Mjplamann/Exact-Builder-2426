import { Mesh, MeshStandardMaterial, SphereGeometry, type Ray } from 'three';
import type { Species } from '../../core/types';
import type { World } from '../../core/world';
import type { Engine } from '../Engine';

/**
 * Renders every living animal: procedural bodies & fins per species (built from BodyPlan +
 * Appearance), swim undulation in the vertex shader driven by FishKinematics, instancing per
 * species, selection highlight, picking, and catalog thumbnails.
 *
 * OWNER: fish-rendering module. Placeholder implementation draws spheres.
 */
export class FishRenderer {
  private engine: Engine;
  private meshes = new Map<string, Mesh>();
  private geo = new SphereGeometry(1, 12, 8);
  private mat = new MeshStandardMaterial({ color: 0xff8844 });

  constructor(engine: Engine) {
    this.engine = engine;
  }

  /** Ensure render resources exist for exactly the animals in `world.fish`. Idempotent; call after add/remove/birth/death/reset. */
  sync(world: World): void {
    const alive = new Set(world.fish.map((f) => f.state.id));
    for (const [id, m] of this.meshes) {
      if (!alive.has(id)) {
        this.engine.contents.remove(m);
        this.meshes.delete(id);
      }
    }
    for (const f of world.fish) {
      if (!this.meshes.has(f.state.id)) {
        const m = new Mesh(this.geo, this.mat);
        this.engine.contents.add(m);
        this.meshes.set(f.state.id, m);
      }
    }
  }

  /** Per frame: push kinematics (position, orientation, swim phase/amp, bend, size) to the GPU. */
  update(world: World, dt: number): void {
    void dt;
    for (const f of world.fish) {
      const m = this.meshes.get(f.state.id);
      if (!m) continue;
      m.position.set(f.kin.pos[0], f.kin.pos[1], f.kin.pos[2]);
      const r = f.state.lengthCm / 200;
      m.scale.set(r, r * 0.4, r * 0.25);
    }
  }

  /** Nearest animal hit by the ray, or null. */
  pick(ray: Ray, world: World): string | null {
    void ray;
    void world;
    return null;
  }

  setSelected(fishId: string | null): void {
    void fishId;
  }

  /** A data-URL portrait (3/4 side view on transparent background) of the species, cached per id+size. */
  async thumbnail(species: Species, size = 160): Promise<string> {
    void species;
    void size;
    return '';
  }

  dispose(): void {
    for (const m of this.meshes.values()) this.engine.contents.remove(m);
    this.meshes.clear();
    this.geo.dispose();
    this.mat.dispose();
  }
}
