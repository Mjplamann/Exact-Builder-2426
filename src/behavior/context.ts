import type { EnvState, FishEntity, FoodParticle } from '../core/types';
import type { World } from '../core/world';
import type { Brain } from './brain';
import { Habitat } from './habitat';
import { FastRng, clamp, smoothstep } from './math';
import type { SpeciesParams } from './params';
import { SpatialHash } from './spatialHash';

/**
 * A moving rally point for a sub-group of a shoal. Shoals in tanks are not one rigid ball: a
 * few loose sub-groups roam the tank, meet, merge and split. Each fish follows its sub-group's
 * anchor (plus a personal offset) while local rules — separation, alignment, cohesion — shape
 * the group. Fear merges all sub-groups into one compact shoal.
 */
export class Anchor {
  x = 0;
  y = 0;
  z = 0;
  vx = 0;
  vy = 0;
  vz = 0;
  tx = 0;
  ty = 0;
  tz = 0;
  timer = 0;
  members = 0;
  placed = false;
}

export class SpeciesGroup {
  count = 0;
  sumL = 0;
  meanL = 0.04;
  fear = 0;
  rest = 0;
  excite = 0;
  /** Centroid of members (m), for anchor initialisation. */
  cx = 0;
  cy = 0;
  cz = 0;
  anchors: Anchor[] = [];
  nAnchors = 1;
  /** Radius of each sub-group (m). */
  radius = 0.1;
  /** Feeding surge target (food drop point) and its timer. */
  surgeX = 0;
  surgeZ = 0;
  surgeT = 0;
  constructor(readonly p: SpeciesParams) {}
}

/** Shared per-frame state handed to every behavior routine. */
export class Ctx {
  world!: World;
  env!: EnvState;
  readonly h = new Habitat();
  readonly hash = new SpatialHash();
  /** Neighbor scratch (indices into world.fish). */
  readonly nbr = new Int32Array(40);
  /** Brains parallel to world.fish (this frame). */
  brains: Brain[] = [];
  readonly groups = new Map<string, SpeciesGroup>();
  /** Same groups as an array (iterated every frame without allocating an iterator). */
  readonly groupList: SpeciesGroup[] = [];
  readonly cur = new Float64Array(3);
  readonly v3 = new Float64Array(3);
  rng = new FastRng(12345);
  /** Real seconds since start, frame dt. */
  t = 0;
  dt = 0;
  /** Light the fish perceive (0 dark … 1 full daylight) and its rate of change. */
  light = 1;
  /** How strongly the light pattern says "night" (0..1). */
  dark = 0;
  timeScale = 1;
  /** Glass-tap habituation (0..1). */
  habituation = 0;
  onEat: (fish: FishEntity, food: FoodParticle, amount: number) => void = () => {};

  group(id: string, p: SpeciesParams): SpeciesGroup {
    let g = this.groups.get(id);
    if (!g) {
      g = new SpeciesGroup(p);
      this.groups.set(id, g);
      this.groupList.push(g);
    }
    return g;
  }

  /** Update anchor counts, positions and targets (once per frame). */
  updateGroups(dt: number): void {
    const h = this.h;
    const B = h.b;
    for (let gi = 0; gi < this.groupList.length; gi++) {
      const g = this.groupList[gi];
      if (g.count === 0) continue;
      g.meanL = g.sumL / g.count;
      g.fear /= g.count;
      g.rest /= g.count;
      g.excite /= g.count;
      g.cx /= g.count;
      g.cy /= g.count;
      g.cz /= g.count;
      const p = g.p;
      let want = 1;
      if (p.schooling === 2) want = g.count > 18 ? 2 : 1;
      else if (p.schooling === 1) want = clamp(Math.round(g.count / (p.colony ? 5 : 7)), 1, 3);
      if (g.fear > 0.3 || g.rest > 0.55 || g.excite > 0.4) want = 1;
      g.nAnchors = want;
      while (g.anchors.length < want) g.anchors.push(new Anchor());
      const per = g.count / want;
      const fearTight = 1 - 0.45 * smoothstep(0.1, 0.6, g.fear);
      g.radius = clamp(p.spacing * g.meanL * Math.cbrt(Math.max(1, per)) * 0.75 * fearTight, 1.2 * g.meanL, 0.4);
      for (let i = 0; i < want; i++) {
        const a = g.anchors[i];
        if (!a.placed) {
          a.x = g.cx + (i ? (this.rng.signed() * 0.2) : 0);
          a.y = g.cy;
          a.z = g.cz;
          a.placed = true;
          this.retarget(g, a);
        }
        // Merging: sub-groups beyond the active count drift onto anchor 0.
        a.timer += dt;
        const dx = a.tx - a.x, dy = a.ty - a.y, dz = a.tz - a.z;
        const d = Math.sqrt(dx * dx + dy * dy + dz * dz);
        if (d < Math.max(0.03, g.radius * 0.6) || a.timer > 30) this.retarget(g, a);
        // Anchors glide at ~half cruising speed, slower at rest, faster when scared or feeding.
        const speed = p.cruise * g.meanL * (0.55 - 0.45 * g.rest) * (1 + 0.8 * g.fear + 0.6 * g.excite);
        const inv = d > 1e-6 ? speed / d : 0;
        // Smooth heading changes so the whole shoal turns in sweeping arcs.
        const k = Math.min(1, dt / 2.5);
        a.vx += (dx * inv - a.vx) * k;
        a.vy += (dy * inv - a.vy) * k;
        a.vz += (dz * inv - a.vz) * k;
        a.x += a.vx * dt;
        a.y += a.vy * dt;
        a.z += a.vz * dt;
        const m = Math.min(0.1, g.radius * 0.5 + g.meanL);
        a.x = clamp(a.x, -B.halfW + m, B.halfW - m);
        a.z = clamp(a.z, -B.halfD + m, B.halfD - m);
        a.y = clamp(a.y, h.floor(a.x, a.z) + g.meanL, B.surfaceY - g.meanL);
      }
      // Inactive anchors converge on anchor 0 so re-splitting starts from the group.
      for (let i = want; i < g.anchors.length; i++) {
        const a = g.anchors[i], a0 = g.anchors[0];
        a.x += (a0.x - a.x) * Math.min(1, dt);
        a.y += (a0.y - a.y) * Math.min(1, dt);
        a.z += (a0.z - a.z) * Math.min(1, dt);
        a.tx = a0.tx;
        a.ty = a0.ty;
        a.tz = a0.tz;
      }
      if (g.surgeT > 0) g.surgeT -= dt;
    }
  }

  /** Choose a new destination for a sub-group anchor within the species' zone. */
  retarget(g: SpeciesGroup, a: Anchor): void {
    const h = this.h;
    const B = h.b;
    const p = g.p;
    const m = Math.min(Math.max(0.06, g.radius + g.meanL * 1.5), Math.min(B.halfW, B.halfD) * 0.8);
    a.timer = this.rng.range(0, 10);
    for (let tries = 0; tries < 6; tries++) {
      let x = this.rng.range(-B.halfW + m, B.halfW - m);
      // Prefer the middle of the depth (fish avoid hugging front & back glass).
      let z = this.rng.range(-B.halfD + m, B.halfD - m) * 0.8;
      let hf = p.zoneLo + (p.zoneHi - p.zoneLo) * this.rng.next();
      if (g.rest > 0.4) {
        // At night shoals sink and gather low among plants.
        hf = Math.max(0.12, Math.min(hf, p.zoneLo * 0.6 + 0.08));
        const cover = this.pickCover('plants', x, z);
        if (cover >= 0) {
          const c = h.cover[cover];
          x = c.position[0] + this.rng.signed() * c.radius;
          z = c.position[2] + this.rng.signed() * c.radius;
        }
      }
      if (g.surgeT > 0) {
        // Feeding surge: the shoal heads for where food went in, high in the water.
        x = g.surgeX + this.rng.signed() * 0.05;
        z = g.surgeZ + this.rng.signed() * 0.05;
        hf = Math.max(hf, 0.7);
      }
      if (g.fear > 0.3) {
        // Frightened shoals bunch low and toward the back, close to cover.
        hf = Math.min(hf, 0.4);
        z = -B.halfD * 0.4 + this.rng.signed() * 0.05;
      }
      x = clamp(x, -B.halfW + m, B.halfW - m);
      z = clamp(z, -B.halfD + m, B.halfD - m);
      const y = h.yAtFrac(x, z, clamp(hf, 0.03, 0.97));
      if (h.nearestDecor(x, y, z) > g.radius * 0.5 || tries === 5) {
        a.tx = x;
        a.ty = y;
        a.tz = z;
        return;
      }
    }
  }

  /** Index of a cover point of the given kind (or any kind when null) near (x,z), or −1. */
  pickCover(kind: string | null, x: number, z: number, maxDist = 0.6): number {
    const cov = this.h.cover;
    let best = -1, bestS = Infinity;
    for (let i = 0; i < cov.length; i++) {
      const c = cov[i];
      if (kind && c.kind !== kind) continue;
      const dx = c.position[0] - x, dz = c.position[2] - z;
      const d = Math.sqrt(dx * dx + dz * dz);
      if (d > maxDist) continue;
      const s = d + this.rng.next() * 0.15;
      if (s < bestS) {
        bestS = s;
        best = i;
      }
    }
    return best;
  }
}
