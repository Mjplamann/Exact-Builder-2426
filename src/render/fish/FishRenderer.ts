import { Group, Matrix4, Ray, Vector3, type InstancedBufferAttribute, type InstancedMesh, type Texture } from 'three';
import type { FishEntity, FishKinematics, Sex, Species } from '../../core/types';
import type { World } from '../../core/world';
import { MS_PER_DAY } from '../../core/clock';
import type { Engine } from '../Engine';
import { sexMatters, variantKey } from './archetypes';
import { createUnderwaterEnv } from './envMap';
import { ThumbnailRenderer } from './thumbnails';
import { FishVariant } from './variant';
import { updateFishTime } from './fishMaterial';
import { GLOBALS } from '../globals';

/**
 * Renders every living animal: procedural bodies & fins per species (built from BodyPlan +
 * Appearance), swim undulation in the vertex shader driven by FishKinematics, instancing per
 * species × sex variant (two draw calls each: opaque body, translucent fins), selection
 * highlight, picking, and catalog thumbnails.
 *
 * Per frame and per animal the update writes one 4×4 matrix and four vec4 attributes into
 * preallocated typed arrays — no allocations in the hot path.
 */

/** Days from fertilisation to birth used to grow the gravid belly (Poecilia ≈ 24–30 days). */
const GESTATION_DAYS = 26;
/** Phases are wrapped by a multiple of 2π before upload (seamless; keeps float32 precision). */
const PHASE_WRAP = Math.PI * 2 * 1024;

// Scratch (module-level, reused).
const _basis = new Float32Array(9);
const _inv = new Matrix4();
const _ro = new Vector3();
const _rd = new Vector3();
const _cam = new Vector3();

/** Orientation basis from kinematics: X = forward, Y = up (with roll), Z = X × Y (the right side). */
function basisFromKin(k: FishKinematics, out: Float32Array): void {
  let fx = k.forward[0], fy = k.forward[1], fz = k.forward[2];
  let l = Math.hypot(fx, fy, fz);
  if (!(l > 1e-6)) {
    fx = 1;
    fy = 0;
    fz = 0;
    l = 1;
  }
  fx /= l;
  fy /= l;
  fz /= l;
  let ux: number, uy: number, uz: number;
  if (k.up) {
    ux = k.up[0];
    uy = k.up[1];
    uz = k.up[2];
  } else {
    ux = 0;
    uy = 1;
    uz = 0;
  }
  // Gram-Schmidt against forward.
  let d = ux * fx + uy * fy + uz * fz;
  ux -= fx * d;
  uy -= fy * d;
  uz -= fz * d;
  l = Math.hypot(ux, uy, uz);
  if (l < 1e-4) {
    // Forward is (anti)parallel to up: pick any perpendicular.
    ux = -fy;
    uy = fx;
    uz = 0;
    d = ux * fx + uy * fy;
    ux -= fx * d;
    uy -= fy * d;
    uz -= fz * d;
    l = Math.hypot(ux, uy, uz) || 1;
  }
  ux /= l;
  uy /= l;
  uz /= l;
  // Right = forward × up.
  let rx = fy * uz - fz * uy, ry = fz * ux - fx * uz, rz = fx * uy - fy * ux;
  const roll = k.roll || 0;
  if (roll !== 0) {
    const c = Math.cos(roll), s = Math.sin(roll);
    const nux = ux * c + rx * s, nuy = uy * c + ry * s, nuz = uz * c + rz * s;
    ux = nux;
    uy = nuy;
    uz = nuz;
    rx = fy * uz - fz * uy;
    ry = fz * ux - fx * uz;
    rz = fx * uy - fy * ux;
  }
  out[0] = fx; out[1] = fy; out[2] = fz;
  out[3] = ux; out[4] = uy; out[5] = uz;
  out[6] = rx; out[7] = ry; out[8] = rz;
}

/** Flag an instance buffer for upload (capacity is ≤ 1.6× the live count, so uploading the
 *  whole buffer is cheaper than allocating update-range records every frame). */
function markDirty(a: InstancedBufferAttribute): void {
  a.needsUpdate = true;
}

export class FishRenderer {
  private engine: Engine;
  /** All animal meshes live under this group (child of engine.contents). */
  readonly group = new Group();
  private variants = new Map<string, FishVariant>();
  /** Same variants as an array (iterated every frame without allocating an iterator). */
  private variantList: FishVariant[] = [];
  private envMap: Texture | null = null;
  private studioEnv: Texture | null = null;
  private thumbs: ThumbnailRenderer | null = null;
  private thumbCache = new Map<string, string>();
  private thumbPending = new Map<string, Promise<string>>();
  private thumbChain: Promise<unknown> = Promise.resolve();
  private selectedId: string | null = null;
  private selT = 0;
  private prevSelId: string | null = null;
  private prevSelT = 0;
  private sortDist = new Float32Array(64);

  constructor(engine: Engine) {
    this.engine = engine;
    this.group.name = 'animals';
    engine.contents.add(this.group);
    try {
      this.envMap = createUnderwaterEnv(engine.renderer, 'tank');
    } catch (err) {
      console.warn('[fish] environment probe unavailable', err);
    }
  }

  /** Ensure render resources exist for exactly the animals in `world.fish`. Idempotent; call after add/remove/birth/death/reset. */
  sync(world: World): void {
    for (const v of this.variants.values()) v.members.length = 0;
    for (const f of world.fish) {
      const sex: Sex = sexMatters(f.species, f.state.sex) ? f.state.sex : 'unknown';
      const key = variantKey(f.species, sex);
      let v = this.variants.get(key);
      if (!v) {
        try {
          v = new FishVariant(key, f.species, sex, { envMap: this.envMap, underwater: true });
        } catch (err) {
          console.error(`[fish] could not build ${key}`, err);
          continue;
        }
        this.variants.set(key, v);
        this.group.add(v.bodyMesh, v.finMesh);
      }
      v.members.push(f);
    }
    for (const [key, v] of this.variants) {
      if (v.members.length === 0) {
        v.dispose();
        this.variants.delete(key);
        continue;
      }
      v.ensureCapacity(v.members.length, (old, fresh) => {
        for (const m of old) this.group.remove(m);
        this.group.add(...fresh);
      });
    }
    this.variantList = [...this.variants.values()];
    let maxN = 0;
    for (const v of this.variantList) maxN = Math.max(maxN, v.members.length);
    if (this.sortDist.length < maxN) this.sortDist = new Float32Array(Math.ceil(maxN * 1.5));
  }

  /** Per frame: push kinematics (position, orientation, swim phase/amp, bend, size) to the GPU. */
  update(world: World, dt: number): void {
    const env = world.env;
    updateFishTime(GLOBALS.uTime.value);
    // Calm selection fades (~0.4 s in, ~0.6 s out).
    this.selT = Math.min(1, this.selT + dt / 0.4);
    this.prevSelT = Math.max(0, this.prevSelT - dt / 0.6);
    // Camera position in the animals' space (for back-to-front fin sorting).
    this.group.updateWorldMatrix(true, false);
    _inv.copy(this.group.matrixWorld).invert();
    _cam.copy(this.engine.camera.position).applyMatrix4(_inv);
    const simTime = world.clock.simTime;

    const list = this.variantList;
    for (let vi = 0; vi < list.length; vi++) {
      const v = list[vi];
      v.mats.setLight(env.daylight, env.moonlight);
      const members = v.members;
      const n = members.length;
      // Insertion sort by distance (descending); nearly sorted frame to frame → ~O(n).
      const dist = this.sortDist;
      for (let i = 0; i < n; i++) {
        const p = members[i].kin.pos;
        const dx = p[0] - _cam.x, dy = p[1] - _cam.y, dz = p[2] - _cam.z;
        dist[i] = dx * dx + dy * dy + dz * dz;
      }
      for (let i = 1; i < n; i++) {
        const dv = dist[i], fv = members[i];
        let j = i - 1;
        while (j >= 0 && dist[j] < dv) {
          dist[j + 1] = dist[j];
          members[j + 1] = members[j];
          j--;
        }
        dist[j + 1] = dv;
        members[j + 1] = fv;
      }

      const mat = v.bodyMesh.instanceMatrix.array as Float32Array;
      const A = v.aA.array as Float32Array, B = v.aB.array as Float32Array;
      const L = v.aLook.array as Float32Array, S = v.aState.array as Float32Array;
      const sp = v.species;
      for (let i = 0; i < n; i++) {
        const f = members[i];
        const k = f.kin;
        const st = f.state;
        basisFromKin(k, _basis);
        const s = Math.max(0.0005, st.lengthCm / 100);
        const o = i * 16;
        mat[o] = _basis[0] * s; mat[o + 1] = _basis[1] * s; mat[o + 2] = _basis[2] * s; mat[o + 3] = 0;
        mat[o + 4] = _basis[3] * s; mat[o + 5] = _basis[4] * s; mat[o + 6] = _basis[5] * s; mat[o + 7] = 0;
        mat[o + 8] = _basis[6] * s; mat[o + 9] = _basis[7] * s; mat[o + 10] = _basis[8] * s; mat[o + 11] = 0;
        mat[o + 12] = k.pos[0]; mat[o + 13] = k.pos[1]; mat[o + 14] = k.pos[2]; mat[o + 15] = 1;
        const q = i * 4;
        A[q] = k.tailPhase % PHASE_WRAP;
        A[q + 1] = k.tailAmp;
        A[q + 2] = k.bend;
        A[q + 3] = k.finPhase % PHASE_WRAP;
        B[q] = k.finAmp;
        B[q + 1] = k.mouth;
        B[q + 2] = k.gillPhase % PHASE_WRAP;
        B[q + 3] = k.rest;
        FishVariant.individual(st.colorSeed, L, q);
        const sexScale = st.sex === 'male' ? sp.male?.lengthScale ?? 1 : st.sex === 'female' ? sp.female?.lengthScale ?? 1 : 1;
        const adult = sp.adultLengthCm * sexScale * (st.sizeFactor || 1);
        L[q + 3] = Math.min(0.95, Math.max(0, 1 - st.lengthCm / (adult * 0.5)));
        let gravid = 0;
        if (st.gravidSince !== undefined && st.gravidSince !== null) {
          gravid = Math.min(1, Math.max(0, (simTime - st.gravidSince) / (GESTATION_DAYS * MS_PER_DAY)));
          gravid = 0.15 + 0.85 * gravid;
        }
        S[q] = gravid;
        const id = st.id;
        S[q + 1] = id === this.selectedId ? this.selT : id === this.prevSelId ? this.prevSelT : 0;
        S[q + 2] = Math.min(0.8, Math.max(0, (st.stress ?? 0) * 0.45 + (1 - (st.health ?? 1)) * 0.7 - 0.05));
        S[q + 3] = (st.colorSeed % 1000) / 1000;
      }
      v.bodyMesh.count = n;
      v.finMesh.count = n;
      markDirty(v.bodyMesh.instanceMatrix);
      markDirty(v.aA);
      markDirty(v.aB);
      markDirty(v.aLook);
      markDirty(v.aState);
    }
  }

  /** Nearest animal hit by the ray, or null. */
  pick(ray: Ray, world: World): string | null {
    void world;
    this.group.updateWorldMatrix(true, false);
    _inv.copy(this.group.matrixWorld).invert();
    const ro = _ro.copy(ray.origin).applyMatrix4(_inv);
    const rd = _rd.copy(ray.direction).transformDirection(_inv);
    let best: string | null = null;
    let bestT = Infinity;
    for (const v of this.variantList) {
      const h = v.info.half;
      for (const f of v.members) {
        const s = Math.max(0.0005, f.state.lengthCm / 100);
        // Generous ellipsoid (small fish are hard to click), at least ~1.2 cm across.
        const minR = 0.006 / s;
        const ax = Math.max(h[0] * 1.1, minR), ay = Math.max(h[1] * 1.25, minR), az = Math.max(h[2] * 1.4, minR);
        basisFromKin(f.kin, _basis);
        const px = ro.x - f.kin.pos[0], py = ro.y - f.kin.pos[1], pz = ro.z - f.kin.pos[2];
        // Into the fish frame (orthonormal basis), then unit-sphere space.
        const ox = (px * _basis[0] + py * _basis[1] + pz * _basis[2]) / (s * ax);
        const oy = (px * _basis[3] + py * _basis[4] + pz * _basis[5]) / (s * ay);
        const oz = (px * _basis[6] + py * _basis[7] + pz * _basis[8]) / (s * az);
        const dx = (rd.x * _basis[0] + rd.y * _basis[1] + rd.z * _basis[2]) / (s * ax);
        const dy = (rd.x * _basis[3] + rd.y * _basis[4] + rd.z * _basis[5]) / (s * ay);
        const dz = (rd.x * _basis[6] + rd.y * _basis[7] + rd.z * _basis[8]) / (s * az);
        const a = dx * dx + dy * dy + dz * dz;
        const b = 2 * (ox * dx + oy * dy + oz * dz);
        const c = ox * ox + oy * oy + oz * oz - 1;
        const disc = b * b - 4 * a * c;
        if (disc < 0) continue;
        const t = (-b - Math.sqrt(disc)) / (2 * a);
        if (t > 0 && t < bestT) {
          bestT = t;
          best = f.state.id;
        }
      }
    }
    return best;
  }

  setSelected(fishId: string | null): void {
    if (fishId === this.selectedId) return;
    if (this.selectedId) {
      this.prevSelId = this.selectedId;
      this.prevSelT = this.selT;
    }
    this.selectedId = fishId;
    this.selT = 0;
  }

  /** A data-URL portrait (3/4 side view on transparent background) of the species, cached per id+size. */
  async thumbnail(species: Species, size = 160): Promise<string> {
    const key = `${species.id}@${size}`;
    const cached = this.thumbCache.get(key);
    if (cached !== undefined) return cached;
    const pending = this.thumbPending.get(key);
    if (pending) return pending;
    // Serialize renders and yield between them so scrolling stays smooth.
    const p = this.thumbChain.then(
      () =>
        new Promise<string>((resolve) => {
          setTimeout(() => {
            let url = '';
            try {
              if (!this.thumbs) {
                this.studioEnv = createUnderwaterEnv(this.engine.renderer, 'studio');
                this.thumbs = new ThumbnailRenderer(this.engine.renderer, this.studioEnv);
              }
              url = this.thumbs.render(species, size);
            } catch (err) {
              console.warn(`[fish] thumbnail failed for ${species.id}`, err);
            }
            this.thumbCache.set(key, url);
            this.thumbPending.delete(key);
            resolve(url);
          }, 0);
        }),
    );
    this.thumbChain = p.catch(() => undefined);
    this.thumbPending.set(key, p);
    return p;
  }

  /** Render variants currently alive (for diagnostics / gallery). */
  get variantCount(): number {
    return this.variants.size;
  }

  /** Meshes (for diagnostics). */
  meshes(): InstancedMesh[] {
    const out: InstancedMesh[] = [];
    for (const v of this.variants.values()) out.push(v.bodyMesh, v.finMesh);
    return out;
  }

  /** Members by fish (testing / gallery). */
  variantOf(fish: FishEntity): FishVariant | undefined {
    for (const v of this.variants.values()) if (v.members.includes(fish)) return v;
    return undefined;
  }

  dispose(): void {
    for (const v of this.variantList) v.dispose();
    this.variants.clear();
    this.variantList = [];
    this.engine.contents.remove(this.group);
    this.thumbs?.dispose();
    this.envMap?.dispose();
    this.studioEnv?.dispose();
  }
}
