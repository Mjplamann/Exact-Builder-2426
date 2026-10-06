import type { World } from '../core/world';
import type { FishEntity, Species } from '../core/types';
import { tankBounds } from '../core/tankGeometry';

/**
 * Documentary "tour" mode: the camera drifts from one interesting animal to the next (an active
 * shoal, a cleaner at work, a goby on its perch, a shrimp grazing…), lingering ~20–40 s on each
 * with gentle framing, then easing back to the whole tank now and then. Stops on any user action
 * (the App ends it; the camera keeps the current shot).
 *
 * What makes a good subject: activity (moving, feeding, cleaning, displaying, schooling), size
 * and colour (species appearance), being in plain view (not tucked into a cave or thicket, not
 * behind rock or wood, not far back at the rear glass), and the hour — a diurnal fish asleep at
 * night is a poor subject; nocturnal ones come into their own after dark. Recent subjects and
 * species are avoided. Choices are weighted draws, so the tour never feels mechanical; pass a
 * seeded `random` for reproducible tours.
 *
 * OWNER: camera module.
 */
export interface TourHost {
  world: World;
  /** Follow an animal (null = back to the whole tank). */
  followAnimal(fishId: string | null, fill?: number): void;
}

export interface TourOptions {
  /** Uniform [0, 1) source (default Math.random); seed it for reproducible tours. */
  random?: () => number;
}

/** Shot lengths (s): an animal, the extra for a spectacular one, a whole-tank interlude, the opening. */
const SUBJECT_SECONDS: readonly [number, number] = [20, 40];
const SPECTACULAR_EXTRA = 10;
const WIDE_SECONDS: readonly [number, number] = [10, 20];
const OPENING_SECONDS = 5;
/** A subject that stays out of sight this long is left. */
const HIDDEN_GRACE = 3;
/** How often the current subject is checked (s). */
const CHECK_SECONDS = 0.5;
/** Subjects and species remembered to avoid repeats. */
const HISTORY = 6;
/** Below this score nothing is worth a close-up (e.g. everyone asleep): stay wide. */
const MIN_SCORE = 0.04;
/** Framing (fraction of the screen width) of a medium shot; close shots use the camera's default by size. */
const MEDIUM_FILL = 0.13;

/** Activity labels (kin.activity) → how watchable that behaviour is. First match wins. */
const LABELS: readonly [RegExp, number][] = [
  [/hid|buried|withdrawn|sleep|burrow|frozen|keeping still|heading for cover/, 0.05],
  [/feed|eat|hunt|taking aim|stalk|food/, 1.8],
  [/clean|client|posing/, 1.7],
  [/flar|chas|nipping|digging a pit|spawn/, 1.5],
  [/school|shoal/, 1.3],
  [/graz|sift|forag|picking|rasp|nibbl|rooting|looking for|biofilm/, 1.35],
  [/anemone|perch|hopping|hover|watching you|coming to see you|exploring|patrol|skimming|leaf|lying in wait/, 1.2],
  [/rest|pausing|slowing down/, 0.45],
];
/** Out of sight: asleep in cover, buried, withdrawn… (an anemone's clownfish is very much in sight). */
const HIDDEN = /hid|buried|withdrawn|sleep|burrow|frozen/;

const clamp01 = (v: number) => (v < 0 ? 0 : v > 1 ? 1 : v);

const colourCache = new Map<string, number>();

/** Chroma (max − min channel, 0..1) of a #rrggbb colour. */
function chroma(hex: string | undefined): number {
  if (!hex || hex.length < 7 || hex[0] !== '#') return 0;
  const v = parseInt(hex.slice(1, 7), 16);
  if (!Number.isFinite(v)) return 0;
  const r = (v >> 16) & 255, g = (v >> 8) & 255, b = v & 255;
  return (Math.max(r, g, b) - Math.min(r, g, b)) / 255;
}

/** 0..1 how colourful a species looks: saturated body/pattern/fin colours, iridescence, pattern richness. */
export function colourfulness(sp: Species): number {
  const hit = colourCache.get(sp.id);
  if (hit !== undefined) return hit;
  const look = sp.look;
  let c = Math.max(chroma(look.base), chroma(look.dorsal), chroma(look.ventral) * 0.6, chroma(look.fin) * (look.finOpacity ?? 0.5));
  for (const p of look.patterns ?? []) c = Math.max(c, chroma(p.color) * (p.type === 'speckle' ? 0.4 : 1));
  for (const f of Object.values(look.fins ?? {})) if (f) c = Math.max(c, chroma(f.color) * (f.opacity ?? 0.6), chroma(f.edge) * 0.8);
  const v = clamp01(0.6 * c + 0.25 * (look.iridescence ?? 0) + 0.15 * Math.min(1, (look.patterns?.length ?? 0) / 3));
  colourCache.set(sp.id, v);
  return v;
}

/** Inside a cave, overhang, crevice, burrow or plant thicket (an anemone does not hide its fish). */
function inCover(world: World, f: FishEntity): boolean {
  const p = f.kin.pos;
  const cover = world.cover;
  for (let i = 0; i < cover.length; i++) {
    const c = cover[i];
    if (c.kind === 'anemone') continue;
    const dx = p[0] - c.position[0], dy = p[1] - c.position[1], dz = p[2] - c.position[2];
    if (dx * dx + dy * dy + dz * dz < c.radius * c.radius) return true;
  }
  return false;
}

/** Entry/exit of a line o + d·t (t ∈ [t0, t1]) through the slab |x| ≤ e; returns the narrowed t1, or −1 if missed. */
function slab(o: number, d: number, e: number, t0: number, t1: number, out: { t0: number }): number {
  if (Math.abs(d) < 1e-9) return Math.abs(o) > e ? -1 : t1;
  let a = (-e - o) / d;
  let b = (e - o) / d;
  if (a > b) {
    const t = a;
    a = b;
    b = t;
  }
  out.t0 = Math.max(t0, a);
  return Math.min(t1, b);
}
const slabT = { t0: 0 };

/** Squared distance from point (px,py,pz) to segment a→b. */
function segDist2(px: number, py: number, pz: number, ax: number, ay: number, az: number, bx: number, by: number, bz: number): number {
  const ux = bx - ax, uy = by - ay, uz = bz - az;
  const l2 = ux * ux + uy * uy + uz * uz;
  const t = l2 > 0 ? clamp01(((px - ax) * ux + (py - ay) * uy + (pz - az) * uz) / l2) : 0;
  const dx = ax + ux * t - px, dy = ay + uy * t - py, dz = az + uz * t - pz;
  return dx * dx + dy * dy + dz * dz;
}

/**
 * Rock, wood or other decor between the animal and the front glass (the line of sight of a
 * viewer in front of it). Capsules are tested by sampling the line against the capsule axis.
 */
export function occluded(world: World, f: FishEntity): boolean {
  const p = f.kin.pos;
  const front = world.tank.size.depthCm / 200;
  const ax = p[0], ay = p[1], az = p[2];
  if (front - az < 0.01) return false;
  const colliders = world.colliders;
  for (let i = 0; i < colliders.length; i++) {
    const c = colliders[i];
    if (c.type === 'sphere') {
      const ctr = c.center;
      // Only what lies in front of the animal can hide it.
      if (ctr[2] + c.radius < az) continue;
      if (segDist2(ctr[0], ctr[1], ctr[2], ax, ay, az, ax, ay, front) < c.radius * c.radius) return true;
    } else if (c.type === 'capsule') {
      if (Math.max(c.a[2], c.b[2]) + c.radius < az) continue;
      // Closest approach of the sight line (x = ax, y = ay, z from az to front) to the capsule axis.
      for (let i = 0; i <= 8; i++) {
        const t = i / 8;
        const qx = c.a[0] + (c.b[0] - c.a[0]) * t, qy = c.a[1] + (c.b[1] - c.a[1]) * t, qz = c.a[2] + (c.b[2] - c.a[2]) * t;
        if (segDist2(qx, qy, qz, ax, ay, az, ax, ay, front) < c.radius * c.radius) return true;
      }
    } else {
      // Box (rotated about y): the sight line runs along +z; slab test in the box frame.
      const cs = Math.cos(c.rotationY), sn = Math.sin(c.rotationY);
      const ox = ax - c.center[0], oy = ay - c.center[1], oz = az - c.center[2];
      const h = c.halfExtents;
      if (Math.abs(oy) > h[1]) continue;
      // Local frame: x' = cos·x − sin·z, z' = sin·x + cos·z (three.js rotation about +y, inverted).
      const lx = cs * ox - sn * oz, lz = sn * ox + cs * oz;
      slabT.t0 = 0;
      let t1 = slab(lx, -sn, h[0], 0, front - az, slabT);
      if (t1 < 0) continue;
      t1 = slab(lz, cs, h[2], slabT.t0, t1, slabT);
      if (t1 >= 0 && slabT.t0 <= t1) return true;
    }
  }
  return false;
}

/**
 * How worth watching an animal is right now (≥ 0, ~1 for a typical active fish in plain view).
 * Activity × size × colour × visibility × time of day; novelty is applied by the Tour.
 */
export function scoreAnimal(world: World, f: FishEntity): number {
  const sp = f.species;
  const k = f.kin;
  const lenCm = Math.max(0.3, f.state.lengthCm);
  const lenM = lenCm / 100;
  if (!(Number.isFinite(k.pos[0]) && Number.isFinite(k.pos[1]) && Number.isFinite(k.pos[2]))) return 0;
  // Activity: speed in body lengths per second, and what it is doing.
  let s = 0.35 + 0.45 * clamp01(k.speed / lenM / 2);
  const label = k.activity || '';
  for (const [re, w] of LABELS) {
    if (re.test(label)) {
      s *= w;
      break;
    }
  }
  // Size (2 cm … 16 cm+) and colour.
  s *= 0.6 + 0.4 * clamp01(Math.log2(lenCm / 2) / 3);
  s *= 0.55 + 0.45 * colourfulness(sp);
  // In plain view: toward the front glass, out of cover, not behind decor.
  const b = tankBounds(world.tank);
  s *= 0.4 + 0.6 * clamp01((k.pos[2] + b.halfD) / (2 * b.halfD));
  if (inCover(world, f)) s *= 0.3;
  if (occluded(world, f)) s *= 0.3;
  // Time of day.
  const env = world.env;
  const night = env.isNight || env.daylight < 0.12;
  if (sp.activity === 'nocturnal') s *= night ? 1.6 : k.rest > 0.5 ? 0.3 : 0.8;
  else if (sp.activity === 'crepuscular') s *= env.daylight > 0.05 && env.daylight < 0.6 ? 1.4 : night ? 1 : 0.9;
  else if (night) s *= k.rest > 0.5 ? 0.12 : 0.5;
  return s;
}

type Phase = 'idle' | 'wide' | 'subject';

export class Tour {
  active = false;
  private phase: Phase = 'idle';
  private subject: string | null = null;
  /** Time left in the current shot (s). */
  private timer = 0;
  private checkT = 0;
  private hiddenT = 0;
  private shotsSinceWide = 0;
  /** Recent subjects / species, most recent last. */
  private recent: string[] = [];
  private recentSpecies: string[] = [];
  private scores = new Float64Array(64);
  private random: () => number;

  constructor(
    private host: TourHost,
    opts: TourOptions = {},
  ) {
    this.random = opts.random ?? Math.random;
  }

  /** The animal being featured (null during whole-tank shots or when stopped). */
  get subjectId(): string | null {
    return this.active ? this.subject : null;
  }

  /** Begin with a short whole-tank opening, then move from animal to animal. */
  start(): void {
    this.active = true;
    this.phase = 'wide';
    this.subject = null;
    this.timer = OPENING_SECONDS;
    this.shotsSinceWide = 0;
    this.hiddenT = 0;
    if (this.host.world.follow) this.host.followAnimal(null);
  }

  /** Stop touring. The camera keeps its current shot (the App decides what happens next). */
  stop(): void {
    this.active = false;
    this.phase = 'idle';
    this.subject = null;
  }

  /** Per frame. No allocations; the (rare) choice of a new subject scores every animal once. */
  update(dt: number): void {
    if (!this.active) return;
    this.timer -= dt;
    if (this.phase === 'subject') {
      const world = this.host.world;
      const f = this.subject ? world.fishById.get(this.subject) : undefined;
      // Gone (died, removed, another tank) or dropped by the App: move on now.
      if (!f || world.follow !== this.subject) {
        this.next(true);
        return;
      }
      this.checkT -= dt;
      if (this.checkT <= 0) {
        this.checkT = CHECK_SECONDS;
        const hidden = HIDDEN.test(f.kin.activity || '') || (inCover(world, f) && f.kin.speed < 0.3 * (f.state.lengthCm / 100)) || occluded(world, f);
        this.hiddenT = hidden ? this.hiddenT + CHECK_SECONDS : 0;
        if (this.hiddenT >= HIDDEN_GRACE) {
          this.next(true);
          return;
        }
      }
    }
    if (this.timer <= 0) this.next(false);
  }

  /** Next shot: another animal, or now and then the whole tank. `lost`: the subject went out of sight. */
  private next(lost: boolean): void {
    const wantWide = this.phase === 'subject' && !lost && (this.shotsSinceWide >= 4 || (this.shotsSinceWide >= 2 && this.random() < 0.3));
    if (!wantWide) {
      const f = this.choose();
      if (f) {
        this.feature(f);
        return;
      }
    }
    this.wide();
  }

  private wide(): void {
    this.phase = 'wide';
    this.subject = null;
    this.timer = WIDE_SECONDS[0] + (WIDE_SECONDS[1] - WIDE_SECONDS[0]) * this.random();
    this.shotsSinceWide = 0;
    if (this.host.world.follow) this.host.followAnimal(null);
  }

  private feature(f: FishEntity): void {
    const id = f.state.id;
    const label = f.kin.activity || '';
    const spectacular = /feed|eat|hunt|clean|client|flar|spawn|anemone/.test(label) || colourfulness(f.species) > 0.75;
    this.phase = 'subject';
    this.subject = id;
    this.timer = SUBJECT_SECONDS[0] + (SUBJECT_SECONDS[1] - SUBJECT_SECONDS[0]) * this.random() + (spectacular ? SPECTACULAR_EXTRA : 0);
    this.checkT = CHECK_SECONDS;
    this.hiddenT = 0;
    this.shotsSinceWide++;
    this.remember(this.recent, id);
    this.remember(this.recentSpecies, f.species.id);
    // Framing varies: close (the camera's default by size) or medium, which suits shoals.
    const shoal = /school|shoal/.test(label);
    const medium = f.state.lengthCm > 2.2 && this.random() < (shoal ? 0.65 : 0.3);
    this.host.followAnimal(id, medium ? MEDIUM_FILL : undefined);
  }

  private remember(list: string[], id: string): void {
    const i = list.indexOf(id);
    if (i >= 0) list.splice(i, 1);
    list.push(id);
    if (list.length > HISTORY) list.shift();
  }

  /** Weighted draw (score²) among the animals worth a look; null when none is. */
  private choose(): FishEntity | null {
    const world = this.host.world;
    const fish = world.fish;
    if (fish.length === 0) return null;
    if (this.scores.length < fish.length) this.scores = new Float64Array(Math.ceil(fish.length * 1.5));
    const scores = this.scores;
    const lastSpecies = this.recentSpecies[this.recentSpecies.length - 1];
    let best = 0;
    let bestRaw = 0;
    for (let i = 0; i < fish.length; i++) {
      const f = fish[i];
      let s = scoreAnimal(world, f);
      if (s > bestRaw) bestRaw = s;
      // Novelty: recent subjects and species step back (they are still better than nothing).
      const r = this.recent.indexOf(f.state.id);
      if (r >= 0) s *= f.state.id === this.subject ? 0 : 0.03 + 0.1 * (1 - (r + 1) / this.recent.length);
      if (f.species.id === lastSpecies) s *= 0.35;
      else if (this.recentSpecies.includes(f.species.id)) s *= 0.7;
      scores[i] = s;
      if (s > best) best = s;
    }
    if (bestRaw < MIN_SCORE || best <= 0) return null;
    // Only the better half of the field is in the running; squared weights favour the best.
    const floor = best * 0.3;
    let total = 0;
    for (let i = 0; i < fish.length; i++) total += scores[i] >= floor ? scores[i] * scores[i] : 0;
    let x = this.random() * total;
    let last = -1;
    for (let i = 0; i < fish.length; i++) {
      if (scores[i] < floor) continue;
      last = i;
      x -= scores[i] * scores[i];
      if (x <= 0) return fish[i];
    }
    return last >= 0 ? fish[last] : null;
  }
}
