import type { App } from '../../app/App';
import type { FishState, Sex, Species } from '../../core/types';
import { Vector3 } from 'three';
import { attachFish, makeFishEntity } from '../../core/world';
import { substrateHeight } from '../../core/tankGeometry';
import { tankBounds } from '../../core/tankGeometry';
import reference from '../../data/species/reference.json';
import { resolveBody, sexMatters } from './archetypes';
import { caudalWebLength } from './fins';

/**
 * Visual-QA harness (`/?gallery=<filter>`): freezes behavior and lines up one animal per species
 * (optionally filtered by archetype/family/id substring) side-on in rows so the renderer can be
 * judged from screenshots.
 *
 * With an empty filter: the reference species plus one species per archetype found in the data.
 * Animals are young adults in proportion and coloring; by default each is scaled to fill its grid
 * cell (`realSize: true` keeps true lengths). The swim cycle is advanced here (behavior is frozen).
 *
 * OWNER: fish-rendering module.
 */

export interface GalleryOptions {
  /** Keep real body lengths instead of scaling every animal to its cell. */
  realSize?: boolean;
  /** Hide the rest of the tank contents (decor/plants) for a clean lineup (default true). */
  hideScenery?: boolean;
  /** Max animals (default 48). */
  limit?: number;
  /** Override sex (default: the more colorful sex when it differs). */
  sex?: Sex;
  /** Tail-beat amplitude 0..1 (default 0.35). */
  tailAmp?: number;
}

let raf = 0;

export function pickSpecies(app: App, filter: string, limit: number): Species[] {
  const all = app.world.species.all;
  const f = filter.trim().toLowerCase();
  if (f) {
    const terms = f.split(/[,\s]+/).filter(Boolean);
    const out: Species[] = [];
    for (const t of terms) {
      const exact = app.world.species.get(t);
      if (exact) {
        if (!out.includes(exact)) out.push(exact);
        continue;
      }
      for (const s of all) {
        if (out.length >= limit) break;
        if (out.includes(s)) continue;
        if (s.id === t || s.id.includes(t) || s.body.archetype === t || s.family.toLowerCase().includes(t) || s.commonName.toLowerCase().includes(t)) out.push(s);
      }
    }
    return out;
  }
  const out: Species[] = [];
  for (const r of reference as { id: string }[]) {
    const s = app.world.species.get(r.id);
    if (s) out.push(s);
  }
  const seen = new Set(out.map((s) => s.body.archetype));
  for (const s of all) {
    if (out.length >= limit) break;
    if (seen.has(s.body.archetype)) continue;
    seen.add(s.body.archetype);
    out.push(s);
  }
  return out.slice(0, limit);
}

/**
 * Total length (cm) that fits an animal into a cell of cellW × cellH (m): deep-bodied fish with
 * tall fins are limited by the cell height, slender ones by its width.
 */
export function fitLengthCm(sp: Species, sex: Sex, cellW: number, cellH: number): number {
  if (sp.group !== 'fish') return Math.min(cellW * 0.6, cellH * 1.1) * 100;
  const b = resolveBody(sp, sex);
  const tl = 1 + caudalWebLength(b.caudal.shape, b.caudal.size);
  const fins = 0.7 * ((b.dorsal?.height ?? 0) + (b.anal?.height ?? 0) * 0.8) + 0.4 * (b.pelvic?.height ?? 0);
  const h = b.kind === 'ray' ? 0.35 : b.kind === 'seahorse' ? 0.75 : (b.depth + fins) / tl;
  return Math.min(cellW * 0.84, (cellH * 0.86) / Math.max(0.12, h)) * 100;
}

export function runGallery(app: App, filter: string, opts: GalleryOptions = {}): void {
  cancelAnimationFrame(raf);
  app.debug.freezeBehavior = true;
  app.debug.freezeLife = true;
  const world = app.world;
  const species = pickSpecies(app, filter, opts.limit ?? 48);
  // Replace the stock with the lineup (no events: this is a QA view, not a tank change).
  world.fish = [];
  world.fishById.clear();
  world.tank.fish = [];
  const b = tankBounds(world.tank);
  const n = Math.max(1, species.length);
  // Lay the grid out in the part of the tank the camera actually sees, on a plane toward the
  // front glass.
  const planeZ = b.halfD * 0.35;
  const cam = app.engine.camera;
  cam.updateMatrixWorld();
  // Any two NDC depths of a pixel unproject onto the same 3D line, whatever the projection
  // (the environment uses an off-axis refractive projection), so intersect that line.
  const onPlane = (nx: number, ny: number) => {
    const p1 = new Vector3(nx, ny, -0.5).unproject(cam);
    const p2 = new Vector3(nx, ny, 0.5).unproject(cam);
    const d = p2.sub(p1);
    const t = (planeZ - p1.z) / (Math.abs(d.z) > 1e-9 ? d.z : 1e-9);
    return p1.addScaledVector(d, t);
  };
  const lo = onPlane(-1, -1), hi = onPlane(1, 1);
  const left = Math.max(-b.halfW, lo.x), right = Math.min(b.halfW, hi.x);
  const floor = Math.max(lo.y, substrateHeight(world.tank, 0, planeZ) + 0.02);
  const top = Math.min(hi.y, b.surfaceY - 0.02);
  const W = (right - left) * 0.94;
  const H = (top - floor) * 0.94;
  const x0 = (left + right) / 2 - W / 2;
  const yTop = (top + floor) / 2 + H / 2;
  const aspect = W / Math.max(0.01, H);
  const cols = Math.max(1, Math.round(Math.sqrt(n * aspect * 0.55)));
  const rows = Math.ceil(n / cols);
  const cellW = W / cols, cellH = H / rows;
  const now = world.clock.simTime;
  species.forEach((sp, i) => {
    const c = i % cols, r = Math.floor(i / cols);
    // The species entry describes the showier sex; a female override marks the duller one.
    const sex: Sex = opts.sex ?? (sexMatters(sp, 'male') ? 'male' : 'unknown');
    const lengthCm = opts.realSize ? sp.adultLengthCm * 0.85 : Math.min(fitLengthCm(sp, sex, cellW, cellH), 60);
    const state: FishState = {
      id: `gallery-${i}-${sp.id}`,
      speciesId: sp.id,
      sex,
      bornAt: now - 365 * 86_400_000,
      addedAt: now,
      lengthCm,
      sizeFactor: 1,
      colorSeed: 1000 + i * 7919,
      hunger: 0,
      health: 1,
      stress: 0,
      stomach: 0.5,
      generation: 0,
      pos: [x0 + (c + 0.5) * cellW, yTop - (r + 0.5) * cellH, planeZ],
      heading: 0,
    };
    const e = makeFishEntity(world, state);
    if (!e) return;
    e.kin.forward = [1, 0, 0];
    // Flat animals are shown from above (as you'd see them on the bottom), tilted toward the glass.
    const a = sp.body.archetype;
    if (a === 'ray' || a === 'stingray' || a === 'starfish' || a === 'brittle-star') {
      const l = Math.hypot(1, 1.1);
      e.kin.up = [0, 1 / l, 1.1 / l];
    }
    e.kin.tailAmp = opts.tailAmp ?? 0.35;
    e.kin.finAmp = 0.35;
    e.kin.tailPhase = i * 1.3;
    attachFish(world, e);
  });
  if (opts.hideScenery !== false) {
    for (const child of app.engine.contents.children) if (child !== app.fishRenderer.group) child.visible = false;
  }
  app.fishRenderer.sync(world);

  // Drive the animation channels ourselves: tail beats at the species' cruising frequency
  // (Bainbridge: f = (U/L + 1) / 0.75), slowed for visibility in slow software rendering.
  let last = performance.now();
  const tick = (t: number) => {
    const dt = Math.min(0.1, (t - last) / 1000);
    last = t;
    for (const f of world.fish) {
      const k = f.kin;
      const cruise = f.species.cruiseSpeed || 1;
      const hz = Math.min(2.5, ((cruise + 1) / 0.75) * 0.35);
      k.tailPhase += Math.PI * 2 * hz * dt;
      k.finPhase += Math.PI * 2 * 1.4 * dt;
      k.gillPhase += Math.PI * 2 * 1.1 * dt;
      k.mouth = 0.12 * (0.5 + 0.5 * Math.sin(k.gillPhase + Math.PI / 2));
    }
    raf = requestAnimationFrame(tick);
  };
  raf = requestAnimationFrame(tick);
}

/** Stop the gallery animation loop (behavior stays frozen until the app re-enables it). */
export function stopGallery(): void {
  cancelAnimationFrame(raf);
}
