import type { FishEntity } from '../core/types';
import { type Brain, SURF_DECOR, SURF_GLASS, SURF_NONE, SURF_PLANT, SURF_SUBSTRATE } from './brain';
import { type Habitat, hit, WALL_BACK, WALL_FRONT, WALL_LEFT, WALL_RIGHT } from './habitat';
import { TAU, clamp } from './math';

/**
 * Motion of animals attached to a surface: snails and starfish gliding on their foot, shrimp,
 * crabs and crayfish walking, plecos and otocinclus holding on with their sucker mouths, gobies
 * perched on rocks. The animal moves in the tangent plane of whatever it is on (substrate, a
 * glass pane, a decor collider) and transitions between surfaces where they meet, so a nerite can
 * crawl from the sand up the front glass, along to the side pane and over a rock.
 *
 * `kin.up` is the surface normal pointing away from the surface (into the water): a snail on the
 * front glass has up = (0, 0, −1), so the viewer outside sees its foot through the glass.
 */

/** Height of the body centre above the surface it stands on (m). */
export function standoff(b: Brain): number {
  const p = b.p;
  const L = b.L;
  if (p.move === 'walker') return (0.5 * p.depthFrac + 0.09) * L;
  if (p.move === 'crawler') return 0.42 * p.depthFrac * L;
  // Fish lying on a surface (belly / sucker against it).
  return 0.45 * p.depthFrac * L;
}

function setNormal(fish: FishEntity, b: Brain, nx: number, ny: number, nz: number): void {
  b.attaches++;
  b.nx = nx;
  b.ny = ny;
  b.nz = nz;
  b.up[0] = nx;
  b.up[1] = ny;
  b.up[2] = nz;
  fish.kin.up = b.up;
  fish.kin.onSurface = true;
}

/** Re-orthogonalize kin.forward into the tangent plane of the current normal. */
function tangentForward(fish: FishEntity, b: Brain): void {
  const f = fish.kin.forward;
  const d = f[0] * b.nx + f[1] * b.ny + f[2] * b.nz;
  let x = f[0] - b.nx * d, y = f[1] - b.ny * d, z = f[2] - b.nz * d;
  let l = Math.sqrt(x * x + y * y + z * z);
  if (l < 1e-4) {
    // Facing straight into the surface: pick "up the surface" (or +x on horizontal ground).
    if (Math.abs(b.ny) < 0.9) {
      x = -b.nx * b.ny;
      y = 1 - b.ny * b.ny;
      z = -b.nz * b.ny;
    } else {
      x = 1 - b.nx * b.nx;
      y = -b.ny * b.nx;
      z = -b.nz * b.nx;
    }
    l = Math.sqrt(x * x + y * y + z * z) || 1;
  }
  f[0] = x / l;
  f[1] = y / l;
  f[2] = z / l;
}

export function attachSubstrate(h: Habitat, fish: FishEntity, b: Brain): void {
  const k = fish.kin;
  const so = standoff(b);
  b.surf = SURF_SUBSTRATE;
  b.surfIdx = -1;
  k.pos[1] = h.floor(k.pos[0], k.pos[2]) + so;
  // Never settle inside the buried base of a rock (reproject() would otherwise shove the animal
  // out a few centimetres on the next step — a visible jump).
  stepOutOfDecor(h, fish, b, so);
  h.floorNormal(k.pos[0], k.pos[2]);
  setNormal(fish, b, hit.nx, hit.ny, hit.nz);
  k.pos[1] = hit.d + so;
  tangentForward(fish, b);
}

/**
 * Walk a substrate-bound animal horizontally out of any decor it overlaps (the buried base of a
 * rock, under a low branch), turning it away. A few iterations handle unions of colliders.
 */
function stepOutOfDecor(h: Habitat, fish: FishEntity, b: Brain, so: number): void {
  const k = fish.kin;
  const f = k.forward;
  let turnX = 0, turnZ = 0;
  for (let it = 0; it < 6; it++) {
    const dd = h.nearestDecor(k.pos[0], k.pos[1], k.pos[2], b.shelterOwner);
    if (dd >= so * 0.9 || h.nearestIndex < 0) break;
    const ci = h.nearestIndex;
    let nx = hit.nx, nz = hit.nz;
    let hl = Math.sqrt(nx * nx + nz * nz);
    if (hl < 0.25) {
      // Under a low branch: use the horizontal gradient of the distance field.
      const e = 0.004, x = k.pos[0], y = k.pos[1], z = k.pos[2];
      nx = h.sdf(ci, x + e, y, z) - h.sdf(ci, x - e, y, z);
      nz = h.sdf(ci, x, y, z + e) - h.sdf(ci, x, y, z - e);
      hl = Math.sqrt(nx * nx + nz * nz);
      if (hl < 1e-6) {
        nx = -f[0];
        nz = -f[2];
        hl = Math.sqrt(nx * nx + nz * nz) || 1;
      }
      nx /= hl;
      nz /= hl;
      hl = 0.35;
    } else {
      nx /= hl;
      nz /= hl;
    }
    const push = (so - dd) / Math.max(0.35, hl) + 0.001;
    k.pos[0] += nx * push;
    k.pos[2] += nz * push;
    k.pos[1] = h.floor(k.pos[0], k.pos[2]) + so;
    turnX = nx;
    turnZ = nz;
  }
  const B = h.b;
  k.pos[0] = clamp(k.pos[0], -B.halfW + so, B.halfW - so);
  k.pos[2] = clamp(k.pos[2], -B.halfD + so, B.halfD - so);
  const d = f[0] * turnX + f[2] * turnZ;
  if (d < 0) {
    f[0] -= 1.6 * d * turnX;
    f[2] -= 1.6 * d * turnZ;
  }
}


export function attachGlass(h: Habitat, fish: FishEntity, b: Brain, wall: number): void {
  const k = fish.kin;
  const so = standoff(b);
  const B = h.b;
  h.wallNormal(wall);
  b.surf = SURF_GLASS;
  b.surfIdx = wall;
  setNormal(fish, b, hit.nx, hit.ny, hit.nz);
  if (wall === WALL_LEFT) k.pos[0] = -B.halfW + so;
  else if (wall === WALL_RIGHT) k.pos[0] = B.halfW - so;
  else if (wall === WALL_BACK) k.pos[2] = -B.halfD + so;
  else k.pos[2] = B.halfD - so;
  const fl = h.floor(k.pos[0], k.pos[2]);
  k.pos[1] = clamp(k.pos[1], fl + so + 0.002, B.surfaceY - so - 0.004);
  tangentForward(fish, b);
}

export function attachDecor(h: Habitat, fish: FishEntity, b: Brain, ci: number): void {
  const k = fish.kin;
  const so = standoff(b);
  b.surf = SURF_DECOR;
  b.surfIdx = ci;
  h.projectToCollider(ci, k.pos, so);
  // The buried part of a rock is underground: step onto the substrate instead.
  if (k.pos[1] < h.floor(k.pos[0], k.pos[2]) + so) {
    attachSubstrate(h, fish, b);
    return;
  }
  setNormal(fish, b, hit.nx, hit.ny, hit.nz);
  tangentForward(fish, b);
}

/** Perch inside a plant thicket (shrimp on leaves): stationary, roughly upright. */
export function attachPlant(fish: FishEntity, b: Brain): void {
  b.surf = SURF_PLANT;
  b.surfIdx = -1;
  setNormal(fish, b, 0, 1, 0);
  tangentForward(fish, b);
}

/** Let go of the surface; swimming resumes from the current orientation. */
export function detach(fish: FishEntity, b: Brain): void {
  const k = fish.kin;
  b.surf = SURF_NONE;
  b.surfIdx = -1;
  k.up = undefined;
  k.onSurface = false;
  const f = k.forward;
  b.yaw = Math.atan2(f[2], f[0]);
  // Keep the actual body attitude (a goby on a sloping rock, a pleco on the glass) and let the
  // swimming controller level it out over the next moments — snapping it level would swing the
  // head or tail into the rock and the body would be shoved out in a single frame.
  b.pitch = clamp(Math.asin(clamp(f[1], -1, 1)), -1.2, 1.2);
  b.bodyPitch = b.pitch;
  b.yawRate = 0;
}

/**
 * Attach to whichever surface is nearest (substrate, glass or decor), if within `reach` m.
 * Returns true when attached.
 */
export function attachNearest(h: Habitat, fish: FishEntity, b: Brain, reach: number, allowGlass = true, allowDecor = true): boolean {
  const k = fish.kin;
  const B = h.b;
  const x = k.pos[0], y = k.pos[1], z = k.pos[2];
  let best = y - h.floor(x, z);
  let kind = SURF_SUBSTRATE, idx = -1;
  if (allowGlass) {
    const dl = x + B.halfW, dr = B.halfW - x, db = z + B.halfD, df = B.halfD - z;
    if (dl < best) { best = dl; kind = SURF_GLASS; idx = WALL_LEFT; }
    if (dr < best) { best = dr; kind = SURF_GLASS; idx = WALL_RIGHT; }
    if (db < best) { best = db; kind = SURF_GLASS; idx = WALL_BACK; }
    if (df < best) { best = df; kind = SURF_GLASS; idx = WALL_FRONT; }
  }
  if (allowDecor) {
    const d = h.nearestDecor(x, y, z);
    if (d < best && h.nearestIndex >= 0) {
      best = d;
      kind = SURF_DECOR;
      idx = h.nearestIndex;
    }
  }
  if (best > reach) return false;
  if (kind === SURF_SUBSTRATE) attachSubstrate(h, fish, b);
  else if (kind === SURF_GLASS) attachGlass(h, fish, b, idx);
  else attachDecor(h, fish, b, idx);
  return true;
}

/**
 * One sub-step of walking/crawling toward (b.sx, b.sy, b.sz) at speed b.ds over the current
 * surface, with surface transitions.
 *  - `climbs`: may move onto glass and decor (snails, climbing shrimp, clinging fish).
 *  - `lateral`: crabs walk sideways — the body stays perpendicular to the direction of travel.
 */
export function integrateSurface(h: Habitat, fish: FishEntity, b: Brain, dt: number, climbs: boolean, lateral: boolean): void {
  const k = fish.kin;
  if (b.surf === SURF_PLANT) {
    b.speed = 0;
    b.vx = b.vy = b.vz = 0;
    return;
  }
  tangentForward(fish, b);
  const f = k.forward;
  const nx = b.nx, ny = b.ny, nz = b.nz;
  // Left vector (n × f).
  let lx = ny * f[2] - nz * f[1], ly = nz * f[0] - nx * f[2], lz = nx * f[1] - ny * f[0];

  // Desired direction in the tangent plane.
  let dx = b.sx - k.pos[0], dy = b.sy - k.pos[1], dz = b.sz - k.pos[2];
  if (!b.hasSurfTarget) {
    dx = f[0];
    dy = f[1];
    dz = f[2];
  }
  const dn = dx * nx + dy * ny + dz * nz;
  dx -= nx * dn;
  dy -= ny * dn;
  dz -= nz * dn;
  const dl = Math.sqrt(dx * dx + dy * dy + dz * dz);
  let moveSign = 1;
  if (dl > 1e-5) {
    dx /= dl;
    dy /= dl;
    dz /= dl;
    // Which body axis should point along d? (forward, or ±left for crabs.)
    let ax = f[0], ay = f[1], az = f[2];
    if (lateral) {
      const side = dx * lx + dy * ly + dz * lz;
      moveSign = side >= 0 ? 1 : -1;
      ax = lx * moveSign;
      ay = ly * moveSign;
      az = lz * moveSign;
    }
    // Signed angle from axis to d about n.
    const cx = ay * dz - az * dy, cy = az * dx - ax * dz, cz = ax * dy - ay * dx;
    const sinA = cx * nx + cy * ny + cz * nz;
    const cosA = ax * dx + ay * dy + az * dz;
    const ang = Math.atan2(sinA, cosA);
    const maxTurn = b.turnMax * b.turnBoost * dt;
    const th = clamp(ang, -maxTurn, maxTurn);
    if (Math.abs(th) > 1e-6) {
      const c = Math.cos(th), s = Math.sin(th);
      // Rotate f about n (f ⟂ n): f' = f·c + (n × f)·s
      const fx = f[0] * c + lx * s, fy = f[1] * c + ly * s, fz = f[2] * c + lz * s;
      f[0] = fx;
      f[1] = fy;
      f[2] = fz;
      lx = ny * f[2] - nz * f[1];
      ly = nz * f[0] - nx * f[2];
      lz = nx * f[1] - ny * f[0];
    }
    // Slow down when the body still has to swing round (and when nearly there).
    const slow = Math.max(0, Math.cos(ang)) * clamp(dl / Math.max(0.004, b.L * 0.5), 0.15, 1);
    b.speed = b.ds * (0.25 + 0.75 * slow);
  } else {
    b.speed = 0;
  }
  if (!b.hasSurfTarget) b.speed = b.ds;

  // Move.
  let mx = f[0], my = f[1], mz = f[2];
  if (lateral) {
    mx = lx * moveSign;
    my = ly * moveSign;
    mz = lz * moveSign;
  }
  b.vx = mx * b.speed;
  b.vy = my * b.speed;
  b.vz = mz * b.speed;
  k.pos[0] += b.vx * dt;
  k.pos[1] += b.vy * dt;
  k.pos[2] += b.vz * dt;

  reproject(h, fish, b, climbs);
}

/** Keep the animal glued to its surface and handle surface-to-surface transitions. */
export function reproject(h: Habitat, fish: FishEntity, b: Brain, climbs: boolean): void {
  const k = fish.kin;
  const B = h.b;
  const so = standoff(b);
  const f = k.forward;
  const minX = -B.halfW + so, maxX = B.halfW - so, minZ = -B.halfD + so, maxZ = B.halfD - so;

  if (b.surf === SURF_SUBSTRATE) {
    // Walls.
    let wall = -1;
    if (k.pos[0] < minX) wall = WALL_LEFT;
    else if (k.pos[0] > maxX) wall = WALL_RIGHT;
    else if (k.pos[2] < minZ) wall = WALL_BACK;
    else if (k.pos[2] > maxZ) wall = WALL_FRONT;
    if (wall >= 0) {
      if (climbs) {
        attachGlass(h, fish, b, wall);
        return;
      }
      k.pos[0] = clamp(k.pos[0], minX, maxX);
      k.pos[2] = clamp(k.pos[2], minZ, maxZ);
      // Turn away from the glass.
      h.wallNormal(wall);
      const d = f[0] * hit.nx + f[2] * hit.nz;
      if (d < 0) {
        f[0] -= 2 * d * hit.nx;
        f[2] -= 2 * d * hit.nz;
      }
    }
    // Decor: climb onto it, or step around its base.
    const dd = h.nearestDecor(k.pos[0], k.pos[1], k.pos[2], b.shelterOwner);
    if (dd < so * 0.9 && h.nearestIndex >= 0) {
      if (climbs) {
        attachDecor(h, fish, b, h.nearestIndex);
        // (attachDecor may fall back to the substrate; TS keeps the earlier narrowing.)
        if ((b.surf as number) === SURF_DECOR) return;
      }
      stepOutOfDecor(h, fish, b, so);
    }
    h.floorNormal(k.pos[0], k.pos[2]);
    k.pos[1] = hit.d + so;
    setNormal(fish, b, hit.nx, hit.ny, hit.nz);
    return;
  }

  if (b.surf === SURF_GLASS) {
    const w = b.surfIdx;
    if (w === WALL_LEFT) k.pos[0] = minX;
    else if (w === WALL_RIGHT) k.pos[0] = maxX;
    else if (w === WALL_BACK) k.pos[2] = minZ;
    else k.pos[2] = maxZ;
    // Corner onto the neighbouring pane.
    if (w === WALL_FRONT || w === WALL_BACK) {
      if (k.pos[0] < minX) {
        k.pos[0] = minX;
        if (climbs) return attachGlass(h, fish, b, WALL_LEFT);
      } else if (k.pos[0] > maxX) {
        k.pos[0] = maxX;
        if (climbs) return attachGlass(h, fish, b, WALL_RIGHT);
      }
    } else {
      if (k.pos[2] < minZ) {
        k.pos[2] = minZ;
        if (climbs) return attachGlass(h, fish, b, WALL_BACK);
      } else if (k.pos[2] > maxZ) {
        k.pos[2] = maxZ;
        if (climbs) return attachGlass(h, fish, b, WALL_FRONT);
      }
    }
    const fl = h.floor(k.pos[0], k.pos[2]);
    if (k.pos[1] < fl + so) {
      k.pos[1] = fl + so;
      attachSubstrate(h, fish, b);
      return;
    }
    const top = B.surfaceY - so - 0.004;
    if (k.pos[1] > top) {
      k.pos[1] = top;
      if (f[1] > 0) f[1] = -f[1] * 0.5; // turn back down along the waterline
    }
    // Decor leaning on the glass.
    const dd = h.nearestDecor(k.pos[0], k.pos[1], k.pos[2], b.shelterOwner);
    if (dd < so * 0.8 && h.nearestIndex >= 0) {
      attachDecor(h, fish, b, h.nearestIndex);
      return;
    }
    h.wallNormal(w);
    setNormal(fish, b, hit.nx, hit.ny, hit.nz);
    return;
  }

  if (b.surf === SURF_DECOR) {
    const ci = b.surfIdx;
    if (ci < 0 || ci >= h.colliders.length) {
      attachNearest(h, fish, b, 1, climbs, true);
      return;
    }
    h.projectToCollider(ci, k.pos, so);
    const nx = hit.nx, ny = hit.ny, nz = hit.nz;
    // Another decor piece in the way? Step onto it.
    const dd = h.nearestDecor(k.pos[0], k.pos[1], k.pos[2]);
    if (h.nearestIndex >= 0 && h.nearestIndex !== ci && dd < so * 0.7) {
      attachDecor(h, fish, b, h.nearestIndex);
      return;
    }
    // Reached the substrate.
    const fl = h.floor(k.pos[0], k.pos[2]);
    if (k.pos[1] < fl + so * 1.05) {
      attachSubstrate(h, fish, b);
      return;
    }
    // Reached the glass.
    if (k.pos[0] < minX || k.pos[0] > maxX || k.pos[2] < minZ || k.pos[2] > maxZ) {
      const wall = k.pos[0] < minX ? WALL_LEFT : k.pos[0] > maxX ? WALL_RIGHT : k.pos[2] < minZ ? WALL_BACK : WALL_FRONT;
      if (climbs) {
        attachGlass(h, fish, b, wall);
        return;
      }
      k.pos[0] = clamp(k.pos[0], minX, maxX);
      k.pos[2] = clamp(k.pos[2], minZ, maxZ);
    }
    if (k.pos[1] > B.surfaceY - so - 0.004) {
      k.pos[1] = B.surfaceY - so - 0.004;
    }
    // Non-climbers can only stand on gentle slopes: on a steep face they lose their footing
    // (fish swim off, walkers and crawlers drop — see BehaviorSystem.integrate) rather than
    // being teleported to the substrate below.
    if (!climbs && ny < 0.35) {
      k.pos[0] += nx * 0.002;
      k.pos[1] += ny * 0.002;
      k.pos[2] += nz * 0.002;
      detach(fish, b);
      return;
    }
    setNormal(fish, b, nx, ny, nz);
  }
}

/** Advance a walking gait / crawling foot wave and picking/rasping mouth for surface animals. */
export function animateSurface(fish: FishEntity, b: Brain, dt: number, picking: boolean, t: number): void {
  const k = fish.kin;
  const p = b.p;
  const L = Math.max(0.004, b.L);
  const v = Math.abs(b.speed);
  if (p.move === 'walker') {
    // Stride length ≈ 0.3 BL: step frequency from speed (shrimp ~2–4 Hz while walking).
    const fStep = v > 1e-4 ? clamp(v / (0.3 * L), 0.8, 6) : 0;
    b.gaitPhase = (b.gaitPhase + TAU * fStep * dt) % (TAU * 64);
    k.tailPhase = b.gaitPhase;
    b.tailAmp = v > 1e-4 ? clamp(0.35 + v / (L * 1.2), 0, 1) : Math.max(0, b.tailAmp - dt * 4);
    // Pleopods (swimmerets) fan gently all the time for ventilation; picking claws move fast.
    k.finPhase = (k.finPhase + TAU * 3 * dt) % (TAU * 64);
    b.finAmp = 0.25;
    k.mouth = picking ? 0.5 + 0.5 * Math.sin(t * TAU * 4.2 + b.noiseSeed) : Math.max(0, k.mouth - dt * 3);
  } else if (p.move === 'crawler') {
    // Pedal waves of the snail foot: ~1 Hz, amplitude when moving.
    k.tailPhase = (k.tailPhase + TAU * (0.6 + v / (0.05 * L + 1e-4)) * dt) % (TAU * 64);
    b.tailAmp = v > 1e-5 ? 0.5 : Math.max(0, b.tailAmp - dt);
    b.finAmp = 0;
    // Radula rasping ~1.2 Hz while grazing.
    k.mouth = picking ? 0.5 + 0.5 * Math.sin(t * TAU * 1.2 + b.noiseSeed) : 0;
  } else {
    // Fish holding onto a surface: small tail wiggles when shuffling, slow fin fanning, sucker rasping.
    const shuffle = v > 1e-4 ? clamp(v / (0.5 * p.cruise * L + 1e-4), 0, 1) : 0;
    k.tailPhase = (k.tailPhase + TAU * (2 + 4 * shuffle) * dt) % (TAU * 64);
    b.tailAmp += ((0.05 + 0.55 * shuffle) - b.tailAmp) * Math.min(1, dt / 0.1);
    k.finPhase = (k.finPhase + TAU * 1.4 * dt) % (TAU * 64);
    b.finAmp += ((0.12 + 0.2 * shuffle) - b.finAmp) * Math.min(1, dt / 0.2);
  }
  k.tailAmp = b.tailAmp;
  k.finAmp = b.finAmp;
  k.speed = v;
  k.vel[0] = b.vx;
  k.vel[1] = b.vy;
  k.vel[2] = b.vz;
  const f = k.forward;
  k.pitch = Math.asin(clamp(f[1], -1, 1));
  k.roll = 0;
  k.bend = 0;
}
