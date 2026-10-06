import type { Collider, CoverPoint, DecorKind, EnvState } from '../core/types';
import type { World } from '../core/world';
import { substrateHeight, tankBounds, type TankBounds } from '../core/tankGeometry';
import { clamp, smoothstep } from './math';

/**
 * Spatial knowledge of the tank shared by the behavior and food systems: glass walls, substrate,
 * surface, decor colliders (signed distance fields + a 2-D column grid for fast lookup), cover
 * points, perches, and the filter-driven water current. Rebuilt on environment changes; every
 * query is allocation-free and writes into the module-level `hit` scratch.
 */

/** Result scratch for distance queries: signed distance `d` and outward unit normal `n`. */
export interface SdfHit {
  d: number;
  nx: number;
  ny: number;
  nz: number;
}

export const hit: SdfHit = { d: 0, nx: 0, ny: 1, nz: 0 };

/** Glass walls: 0 left (−x), 1 right (+x), 2 back (−z), 3 front (+z). */
export const WALL_LEFT = 0, WALL_RIGHT = 1, WALL_BACK = 2, WALL_FRONT = 3;

const GRID_CELL = 0.08;
const GRID_PAD = 0.12;

export class Habitat {
  b: TankBounds = { halfW: 0.6, height: 0.5, halfD: 0.25, surfaceY: 0.475 };
  world!: World;
  colliders: Collider[] = [];
  cover: CoverPoint[] = [];
  /** Decor kind of each collider's owner (undefined for plants / unknown). */
  colliderKind: (DecorKind | 'plant' | undefined)[] = [];
  /** Per-collider cached rotation (box) — cos/sin of rotationY. */
  private cosR = new Float64Array(0);
  private sinR = new Float64Array(0);
  /** Column grid over xz: indices of colliders whose padded footprint overlaps the cell. */
  private gx = 1;
  private gz = 1;
  private gStart = new Int32Array(2);
  private gItems = new Int32Array(0);
  /** Perch candidates: top points of decor (x,y,z, collider index). */
  perches = new Float64Array(0);
  perchOwner = new Int32Array(0);
  perchCount = 0;
  /** Number of animals currently using each cover point (maintained by the behavior system). */
  coverUse = new Int32Array(0);
  /** Version counter, bumped on every rebuild (brains re-validate cached indices). */
  version = 0;
  /**
   * Bounding sphere of each collider (x, y, z, r): an exact lower bound on its distance field
   * (a shape inside a ball is never closer than the ball), used to skip most exact SDF
   * evaluations in `nearestDecor`.
   */
  private bsph = new Float64Array(0);
  /**
   * Substrate heightfield cache. `substrateHeight` evaluates two octaves of value noise (and
   * allocates a bounds object) per call, and the behavior/food systems ask for the floor
   * thousands of times per frame; a 5 mm bilinear grid matches it to ~0.01 mm.
   */
  private hf = new Float32Array(0);
  private hfNx = 2;
  private hfNz = 2;
  private hfInvX = 1;
  private hfInvZ = 1;
  private hfBare = true;
  private hfSig = '';
  /** Tank the caches were built for (rebuild on resize / substrate change / tank swap). */
  private sigTank: object | null = null;
  private sigW = 0;
  private sigH = 0;
  private sigD = 0;
  private sigSub = '';
  private sigF = 0;
  private sigB = 0;

  /** Refresh per-frame derived values; rebuild caches if the tank changed (allocation-free check). */
  sync(world: World): void {
    this.world = world;
    const t = world.tank;
    if (
      t !== this.sigTank || t.size.widthCm !== this.sigW || t.size.heightCm !== this.sigH || t.size.depthCm !== this.sigD ||
      t.substrate !== this.sigSub || t.substrateDepthFrontCm !== this.sigF || t.substrateDepthBackCm !== this.sigB ||
      this.colliders !== world.colliders || this.cover !== world.cover
    ) this.rebuild(world);
  }

  rebuild(world: World): void {
    const t = world.tank;
    this.world = world;
    this.sigTank = t;
    this.sigW = t.size.widthCm;
    this.sigH = t.size.heightCm;
    this.sigD = t.size.depthCm;
    this.sigSub = t.substrate;
    this.sigF = t.substrateDepthFrontCm;
    this.sigB = t.substrateDepthBackCm;
    this.b = tankBounds(t);
    this.colliders = world.colliders;
    this.cover = world.cover;
    this.version++;
    const n = this.colliders.length;
    this.cosR = new Float64Array(n);
    this.sinR = new Float64Array(n);
    const kinds = new Map<string, DecorKind>();
    for (const d of t.decor) kinds.set(d.id, d.kind);
    const plantIds = new Set(t.plants.map((p) => p.id));
    this.colliderKind = this.colliders.map((c) => kinds.get(c.ownerId) ?? (plantIds.has(c.ownerId) ? 'plant' : undefined));
    this.bsph = new Float64Array(n * 4);
    for (let i = 0; i < n; i++) {
      const c = this.colliders[i];
      const o = i * 4;
      if (c.type === 'box') {
        this.cosR[i] = Math.cos(c.rotationY);
        this.sinR[i] = Math.sin(c.rotationY);
        this.bsph[o] = c.center[0];
        this.bsph[o + 1] = c.center[1];
        this.bsph[o + 2] = c.center[2];
        this.bsph[o + 3] = Math.hypot(c.halfExtents[0], c.halfExtents[1], c.halfExtents[2]);
      } else if (c.type === 'capsule') {
        this.bsph[o] = (c.a[0] + c.b[0]) / 2;
        this.bsph[o + 1] = (c.a[1] + c.b[1]) / 2;
        this.bsph[o + 2] = (c.a[2] + c.b[2]) / 2;
        this.bsph[o + 3] = Math.hypot(c.b[0] - c.a[0], c.b[1] - c.a[1], c.b[2] - c.a[2]) / 2 + c.radius;
      } else {
        this.bsph[o] = c.center[0];
        this.bsph[o + 1] = c.center[1];
        this.bsph[o + 2] = c.center[2];
        this.bsph[o + 3] = c.radius;
      }
    }
    this.buildHeightfield();
    this.buildGrid();
    this.buildPerches();
    this.coverUse = new Int32Array(this.cover.length);
  }

  // -------------------------------------------------------------------------------------------
  // Column grid
  // -------------------------------------------------------------------------------------------

  private buildGrid(): void {
    const { halfW, halfD } = this.b;
    this.gx = Math.max(1, Math.ceil((2 * halfW) / GRID_CELL));
    this.gz = Math.max(1, Math.ceil((2 * halfD) / GRID_CELL));
    const cells = this.gx * this.gz;
    const lists: number[][] = [];
    for (let i = 0; i < cells; i++) lists.push([]);
    for (let i = 0; i < this.colliders.length; i++) {
      const bb = this.footprint(i);
      const x0 = clamp(Math.floor((bb[0] - GRID_PAD + halfW) / GRID_CELL), 0, this.gx - 1);
      const x1 = clamp(Math.floor((bb[1] + GRID_PAD + halfW) / GRID_CELL), 0, this.gx - 1);
      const z0 = clamp(Math.floor((bb[2] - GRID_PAD + halfD) / GRID_CELL), 0, this.gz - 1);
      const z1 = clamp(Math.floor((bb[3] + GRID_PAD + halfD) / GRID_CELL), 0, this.gz - 1);
      for (let z = z0; z <= z1; z++) for (let x = x0; x <= x1; x++) lists[z * this.gx + x].push(i);
    }
    this.gStart = new Int32Array(cells + 1);
    let total = 0;
    for (let c = 0; c < cells; c++) {
      this.gStart[c] = total;
      total += lists[c].length;
    }
    this.gStart[cells] = total;
    this.gItems = new Int32Array(total);
    for (let c = 0; c < cells; c++) this.gItems.set(lists[c], this.gStart[c]);
  }

  /** xz footprint [minX, maxX, minZ, maxZ] of collider i. */
  private footprint(i: number): [number, number, number, number] {
    const c = this.colliders[i];
    if (c.type === 'sphere') return [c.center[0] - c.radius, c.center[0] + c.radius, c.center[2] - c.radius, c.center[2] + c.radius];
    if (c.type === 'capsule')
      return [
        Math.min(c.a[0], c.b[0]) - c.radius, Math.max(c.a[0], c.b[0]) + c.radius,
        Math.min(c.a[2], c.b[2]) - c.radius, Math.max(c.a[2], c.b[2]) + c.radius,
      ];
    const co = Math.abs(this.cosR[i]), si = Math.abs(this.sinR[i]);
    const ex = co * c.halfExtents[0] + si * c.halfExtents[2];
    const ez = si * c.halfExtents[0] + co * c.halfExtents[2];
    return [c.center[0] - ex, c.center[0] + ex, c.center[2] - ez, c.center[2] + ez];
  }

  /** Start/end into `gridItems()` for the column containing (x, z). */
  cellRange(x: number, z: number): number {
    const ix = clamp(Math.floor((x + this.b.halfW) / GRID_CELL), 0, this.gx - 1);
    const iz = clamp(Math.floor((z + this.b.halfD) / GRID_CELL), 0, this.gz - 1);
    return iz * this.gx + ix;
  }
  cellStart(cell: number): number {
    return this.gStart[cell];
  }
  cellEnd(cell: number): number {
    return this.gStart[cell + 1];
  }
  cellItem(k: number): number {
    return this.gItems[k];
  }

  // -------------------------------------------------------------------------------------------
  // Signed distance to decor
  // -------------------------------------------------------------------------------------------

  /** Signed distance from p to collider i (negative inside) with outward normal → `hit`. */
  sdf(i: number, x: number, y: number, z: number): number {
    const c = this.colliders[i];
    if (c.type === 'sphere') {
      const dx = x - c.center[0], dy = y - c.center[1], dz = z - c.center[2];
      const l = Math.sqrt(dx * dx + dy * dy + dz * dz);
      if (l > 1e-9) {
        hit.nx = dx / l;
        hit.ny = dy / l;
        hit.nz = dz / l;
      } else {
        hit.nx = 0;
        hit.ny = 1;
        hit.nz = 0;
      }
      return (hit.d = l - c.radius);
    }
    if (c.type === 'capsule') {
      const ax = c.a[0], ay = c.a[1], az = c.a[2];
      const bx = c.b[0] - ax, by = c.b[1] - ay, bz = c.b[2] - az;
      const bb = bx * bx + by * by + bz * bz;
      let t = bb > 1e-12 ? ((x - ax) * bx + (y - ay) * by + (z - az) * bz) / bb : 0;
      t = t < 0 ? 0 : t > 1 ? 1 : t;
      const dx = x - (ax + bx * t), dy = y - (ay + by * t), dz = z - (az + bz * t);
      const l = Math.sqrt(dx * dx + dy * dy + dz * dz);
      if (l > 1e-9) {
        hit.nx = dx / l;
        hit.ny = dy / l;
        hit.nz = dz / l;
      } else {
        hit.nx = 0;
        hit.ny = 1;
        hit.nz = 0;
      }
      return (hit.d = l - c.radius);
    }
    // Box rotated about Y: into local space, standard box SDF, normal back to world.
    const co = this.cosR[i], si = this.sinR[i];
    const rx = x - c.center[0], ry = y - c.center[1], rz = z - c.center[2];
    const lx = co * rx - si * rz;
    const lz = si * rx + co * rz;
    const ly = ry;
    const hx = c.halfExtents[0], hy = c.halfExtents[1], hz = c.halfExtents[2];
    const qx = Math.abs(lx) - hx, qy = Math.abs(ly) - hy, qz = Math.abs(lz) - hz;
    let nlx = 0, nly = 0, nlz = 0, d: number;
    if (qx > 0 || qy > 0 || qz > 0) {
      const ox = qx > 0 ? qx : 0, oy = qy > 0 ? qy : 0, oz = qz > 0 ? qz : 0;
      d = Math.sqrt(ox * ox + oy * oy + oz * oz);
      nlx = (ox * Math.sign(lx)) / d;
      nly = (oy * Math.sign(ly)) / d;
      nlz = (oz * Math.sign(lz)) / d;
    } else {
      if (qx >= qy && qx >= qz) {
        d = qx;
        nlx = Math.sign(lx) || 1;
      } else if (qy >= qz) {
        d = qy;
        nly = Math.sign(ly) || 1;
      } else {
        d = qz;
        nlz = Math.sign(lz) || 1;
      }
    }
    // Rotate the local normal back: inverse of (lx = co·rx − si·rz, lz = si·rx + co·rz).
    hit.nx = co * nlx + si * nlz;
    hit.ny = nly;
    hit.nz = -si * nlx + co * nlz;
    return (hit.d = d);
  }

  /**
   * Nearest decor surface to p within the column grid: returns the distance (Infinity if none)
   * and leaves its normal in `hit`; `nearestIndex` gets the collider index. `ignoreOwner` lets an
   * animal slip inside the cave/thicket it is sheltering in.
   */
  nearestIndex = -1;
  nearestDecor(x: number, y: number, z: number, ignoreOwner?: string): number {
    const cell = this.cellRange(x, z);
    const bs = this.bsph;
    let best = Infinity, bx = 0, by = 1, bz = 0, bi = -1;
    for (let k = this.gStart[cell], e = this.gStart[cell + 1]; k < e; k++) {
      const i = this.gItems[k];
      if (ignoreOwner !== undefined && this.colliders[i].ownerId === ignoreOwner) continue;
      if (best !== Infinity) {
        // Exact pruning: sdf_i ≥ |p − c_i| − r_i, so skip when that bound is already ≥ best.
        const o = i * 4;
        const lim = best + bs[o + 3];
        if (lim <= 0) continue;
        const ex = x - bs[o], ey = y - bs[o + 1], ez = z - bs[o + 2];
        if (ex * ex + ey * ey + ez * ez >= lim * lim) continue;
      }
      const d = this.sdf(i, x, y, z);
      if (d < best) {
        best = d;
        bx = hit.nx;
        by = hit.ny;
        bz = hit.nz;
        bi = i;
      }
    }
    hit.d = best;
    hit.nx = bx;
    hit.ny = by;
    hit.nz = bz;
    this.nearestIndex = bi;
    return best;
  }

  /** Move p (in place) onto the surface of collider i, offset by `standoff` along the normal. */
  projectToCollider(i: number, p: [number, number, number] | Float64Array, standoff: number): void {
    for (let it = 0; it < 4; it++) {
      const d = this.sdf(i, p[0], p[1], p[2]) - standoff;
      p[0] -= hit.nx * d;
      p[1] -= hit.ny * d;
      p[2] -= hit.nz * d;
      if (Math.abs(d) < 1e-4) break;
    }
    this.sdf(i, p[0], p[1], p[2]);
  }

  // -------------------------------------------------------------------------------------------
  // Substrate, walls, surface
  // -------------------------------------------------------------------------------------------

  /** (Re)sample the substrate heightfield when the tank's substrate geometry changed. */
  private buildHeightfield(): void {
    const t = this.world.tank;
    const { halfW, halfD } = this.b;
    const sig = `${halfW}|${halfD}|${t.substrate}|${t.substrateDepthFrontCm}|${t.substrateDepthBackCm}|${t.seed}`;
    if (sig === this.hfSig && this.hf.length > 0) return;
    this.hfSig = sig;
    this.hfBare = t.substrate === 'bare';
    const cell = 0.005;
    const nx = Math.max(2, Math.ceil((2 * halfW) / cell) + 1);
    const nz = Math.max(2, Math.ceil((2 * halfD) / cell) + 1);
    this.hfNx = nx;
    this.hfNz = nz;
    this.hfInvX = (nx - 1) / Math.max(1e-6, 2 * halfW);
    this.hfInvZ = (nz - 1) / Math.max(1e-6, 2 * halfD);
    this.hf = new Float32Array(nx * nz);
    for (let j = 0; j < nz; j++) {
      const z = -halfD + j / this.hfInvZ;
      for (let i = 0; i < nx; i++) this.hf[j * nx + i] = substrateHeight(t, -halfW + i / this.hfInvX, z);
    }
  }

  floor(x: number, z: number): number {
    if (this.hfBare) return this.hf.length > 0 ? 0 : substrateHeight(this.world.tank, x, z);
    // Outside the glass the substrate formula only depends on the clamped coordinates.
    const nx = this.hfNx, nz = this.hfNz;
    let u = (x + this.b.halfW) * this.hfInvX;
    let v = (z + this.b.halfD) * this.hfInvZ;
    u = u < 0 ? 0 : u > nx - 1.000001 ? nx - 1.000001 : u;
    v = v < 0 ? 0 : v > nz - 1.000001 ? nz - 1.000001 : v;
    const i = u | 0, j = v | 0;
    const fu = u - i, fv = v - j;
    const hf = this.hf;
    const o = j * nx + i;
    const a = hf[o] + (hf[o + 1] - hf[o]) * fu;
    const c = hf[o + nx] + (hf[o + nx + 1] - hf[o + nx]) * fu;
    return a + (c - a) * fv;
  }

  /** Substrate surface normal at (x, z) → `hit` (d = height). */
  floorNormal(x: number, z: number): SdfHit {
    const e = 0.01;
    const h = this.floor(x, z);
    const hx = this.floor(x + e, z) - this.floor(x - e, z);
    const hz = this.floor(x, z + e) - this.floor(x, z - e);
    const nx = -hx / (2 * e), nz = -hz / (2 * e);
    const l = Math.sqrt(nx * nx + 1 + nz * nz);
    hit.nx = nx / l;
    hit.ny = 1 / l;
    hit.nz = nz / l;
    hit.d = h;
    return hit;
  }

  /** Normalized height of y in the water column at (x, z): 0 on the substrate, 1 at the surface. */
  heightFrac(x: number, y: number, z: number): number {
    const f = this.floor(x, z);
    return (y - f) / Math.max(0.02, this.b.surfaceY - f);
  }

  /** y for a normalized height h at (x, z). */
  yAtFrac(x: number, z: number, h: number): number {
    const f = this.floor(x, z);
    return f + (this.b.surfaceY - f) * h;
  }

  /** Inward normal of glass wall w → hit (d unused). */
  wallNormal(w: number): SdfHit {
    hit.nx = w === WALL_LEFT ? 1 : w === WALL_RIGHT ? -1 : 0;
    hit.ny = 0;
    hit.nz = w === WALL_BACK ? 1 : w === WALL_FRONT ? -1 : 0;
    return hit;
  }

  // -------------------------------------------------------------------------------------------
  // Perches & cover
  // -------------------------------------------------------------------------------------------

  private buildPerches(): void {
    const n = this.colliders.length;
    this.perches = new Float64Array(n * 3);
    this.perchOwner = new Int32Array(n);
    let k = 0;
    const p = new Float64Array(3);
    for (let i = 0; i < n; i++) {
      const c = this.colliders[i];
      if (this.colliderKind[i] === 'plant') continue;
      let x: number, y: number, z: number;
      if (c.type === 'sphere') {
        x = c.center[0];
        y = c.center[1] + c.radius;
        z = c.center[2];
      } else if (c.type === 'capsule') {
        const top = c.a[1] > c.b[1] ? c.a : c.b;
        x = top[0];
        y = top[1] + c.radius;
        z = top[2];
      } else {
        x = c.center[0];
        y = c.center[1] + c.halfExtents[1];
        z = c.center[2];
      }
      // Settle the candidate onto the actual top of the union of colliders.
      p[0] = x;
      p[1] = y + 0.02;
      p[2] = z;
      this.projectToCollider(i, p, 0);
      if (hit.ny < 0.55) continue; // too steep to sit on
      if (p[1] > this.b.surfaceY - 0.03 || p[1] < this.floor(p[0], p[2]) + 0.005) continue;
      if (Math.abs(p[0]) > this.b.halfW - 0.01 || Math.abs(p[2]) > this.b.halfD - 0.01) continue;
      this.perches[k * 3] = p[0];
      this.perches[k * 3 + 1] = p[1];
      this.perches[k * 3 + 2] = p[2];
      this.perchOwner[k] = i;
      k++;
    }
    this.perchCount = k;
  }

  /** Is the point inside any decor collider (other than `ignoreOwner`) by more than `tol`? */
  insideDecor(x: number, y: number, z: number, tol = 0, ignoreOwner?: string): boolean {
    return this.nearestDecor(x, y, z, ignoreOwner) < -tol;
  }

  // -------------------------------------------------------------------------------------------
  // Water current
  // -------------------------------------------------------------------------------------------

  /**
   * Filter-driven circulation at p (m/s) → out[0..2]. A surface jet leaves the outflow along
   * `env.current.dir`, weakens with distance, dives at the far glass and returns slower along
   * the bottom; a little slow turbulence keeps it alive. Typical speeds: a few cm/s near the
   * outflow, ~1 cm/s in the lower water column.
   */
  current(env: EnvState, t: number, x: number, y: number, z: number, out: Float64Array | number[]): void {
    const cur = env.current;
    const s = cur.speed;
    if (s <= 0) {
      out[0] = out[1] = out[2] = 0;
      return;
    }
    const b = this.b;
    const dx = cur.dir[0], dz = cur.dir[2];
    const ox = cur.origin[0], oz = cur.origin[2];
    // Coordinates along / across the jet axis.
    const along = (x - ox) * dx + (z - oz) * dz;
    const across = -(x - ox) * dz + (z - oz) * dx;
    const span = Math.max(0.2, Math.abs(dx) * 2 * b.halfW + Math.abs(dz) * 2 * b.halfD);
    const u = clamp(along / span, 0, 1); // 0 at the outflow wall → 1 at the far wall
    const h = clamp(y / Math.max(0.05, b.surfaceY), 0, 1);
    // Vertical profile: forward flow in the upper water, gentle return flow near the bottom.
    const prof = 0.9 * smoothstep(0.35, 1, h) - 0.28 * (1 - smoothstep(0.0, 0.45, h));
    const decay = 0.35 + 0.65 * Math.exp(-Math.max(0, along) / 0.45);
    const lateral = Math.exp(-(across * across) / (2 * 0.35 * 0.35)) * 0.6 + 0.4;
    let ua = s * prof * decay * lateral;
    // Downwelling near the far wall, upwelling near the outflow wall (mass continuity).
    const w = s * 0.22 * (smoothstep(0.7, 1, u) * -1 + (1 - smoothstep(0, 0.25, u)) * 0.6) * Math.sin(Math.PI * clamp(h, 0.05, 0.95));
    // Slow eddies (cheap analytic turbulence).
    const tx = Math.sin(x * 7.1 + t * 0.21) * Math.cos(z * 5.3 - t * 0.17);
    const tz = Math.cos(x * 6.3 - t * 0.19) * Math.sin(y * 8.7 + t * 0.23);
    const ty = Math.sin(z * 6.9 + t * 0.15) * Math.cos(x * 4.1 + t * 0.13);
    const turb = s * 0.18;
    // Flow along the far wall must turn: fade the along-axis part as we approach it.
    ua *= 1 - smoothstep(0.85, 1, u) * 0.7;
    out[0] = dx * ua + tx * turb;
    out[1] = w + ty * turb * 0.4;
    out[2] = dz * ua + tz * turb;
  }
}
