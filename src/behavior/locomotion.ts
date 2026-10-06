import type { FishEntity } from '../core/types';
import type { Brain } from './brain';
import { type Habitat, hit } from './habitat';
import { TAU, approach, clamp, stepToward, wrapAngle } from './math';

/**
 * Swimming biomechanics. Turns the steering desire (direction + speed) into body motion under
 * species- and size-dependent limits, and derives every animation channel the fish renderer
 * reads from FishKinematics.
 *
 * Conventions (shared with the fish renderer):
 *  - yaw ψ: forward = (cos θ·cos ψ, sin θ, cos θ·sin ψ); increasing ψ turns the fish to its right
 *    (toward +z when facing +x).
 *  - `kin.pitch` = body pitch θ (positive = head up); `kin.forward` already includes it.
 *  - `kin.roll`: rotation about the forward axis, right-hand rule — positive tilts the dorsal side
 *    toward the fish's right. Fish bank into turns (right turn → positive roll). Belly-up
 *    swimmers carry roll ≈ π.
 *  - `kin.bend` > 0 bends the body toward the fish's left (a left turn).
 *  - Tail-beat frequency from Bainbridge (1958): U/L = 0.75·f − 1, i.e. U = L(3f − 4)/4
 *    → f = (U/L + 1)/0.75, clamped to [~1.3, maxTailHz]. The tail phase keeps advancing while
 *    gliding (tailAmp → 0) so the wave restarts seamlessly on the next beat.
 */

/** Scratch for the current. */
const cur = new Float64Array(3);

export interface SwimEnv {
  h: Habitat;
  t: number;
}

/** One fixed sub-step of free-swimming motion. */
export function integrateSwimmer(env: SwimEnv, fish: FishEntity, b: Brain, dt: number): void {
  const p = b.p;
  const L = b.L;
  const k = fish.kin;

  // ---- heading (yaw) ------------------------------------------------------------------------
  const dhor = Math.sqrt(b.dx * b.dx + b.dz * b.dz);
  let wantYaw = dhor > 0.04 ? Math.atan2(b.dz, b.dx) : b.yaw;
  // Fin-driven swimmers back up a short way instead of turning round (knifefish, cichlids,
  // puffers): a slow desire pointing behind them, while station-keeping.
  let backing = false;
  if (p.canReverse && b.hold && b.turnBoost < 1.2 && b.ds > 0 && b.ds < 0.45 * p.cruise * L && Math.cos(wantYaw - b.yaw) < -0.6) {
    backing = true;
    wantYaw = wrapAngle(wantYaw + Math.PI);
  }
  const err = wrapAngle(wantYaw - b.yaw);
  // Routine turns need thrust: body-caudal swimmers turn slowly when barely moving, paired-fin
  // swimmers (angels, gouramis, puffers) can pivot on the spot but deliberately.
  const sRel = clamp(Math.abs(b.speed) / Math.max(1e-4, 0.8 * b.p.cruise * b.L), 0, 1);
  const lowSpeedTurn = b.turnBoost > 1.2 ? 1 : b.p.bcf && !b.hold ? 0.3 + 0.7 * sRel : 0.45 + 0.55 * sRel;
  const wMax = b.turnMax * b.turnBoost * lowSpeedTurn;
  // Proportional heading control with a yaw-acceleration limit (fish can't snap to a new yaw rate).
  const gain = 2.6 + 2 * (b.turnBoost - 1);
  const wWant = clamp(err * gain, -wMax, wMax);
  const alpha = wMax * (b.turnBoost > 1.5 ? 30 : 7);
  b.yawRate = stepToward(b.yawRate, wWant, alpha * dt);
  b.yaw = wrapAngle(b.yaw + b.yawRate * dt);

  // ---- travel pitch ------------------------------------------------------------------------
  const wantPitch = clamp(Math.atan2(b.dy, Math.max(1e-4, dhor)), -b.pitchLimit, b.pitchLimit);
  const pitchRate = (0.9 + 0.5 * b.turnBoost) * Math.min(2.5, b.turnMax * 0.45);
  b.pitch = stepToward(b.pitch, approach(b.pitch, wantPitch, 0.12, dt), pitchRate * dt);

  // ---- speed: beat-and-glide or continuous ---------------------------------------------------
  const cruise = p.cruise * L;
  // Slow down while turning hard (except during escapes), as real fish do.
  const align = Math.cos(err);
  let target = backing ? -b.ds * 0.8 : b.ds;
  if (b.turnBoost < 1.5 && !backing) target *= 0.35 + 0.65 * Math.max(0, align);
  const prevSpeed = b.speed;
  let effortTarget: number;
  const glideTau = p.glideTau * Math.sqrt(Math.max(0.005, L) / 0.04);
  const useBurstCoast = p.burstCoast && !b.hold && target > 0.2 * cruise && target < 0.6 * p.burst * L && b.turnBoost < 1.5;
  if (target < 0) {
    // Backing up with fin undulation (knifefish, cichlids reversing out of a crevice).
    b.speed = stepToward(b.speed, Math.max(target, -0.6 * cruise), b.accel * 0.6 * dt);
    effortTarget = 0.25;
    b.beating = false;
  } else if (useBurstCoast) {
    const hi = target * 1.28, lo = target * 0.72;
    if (b.beating) {
      b.speed = stepToward(b.speed, hi * 1.04, b.accel * 1.5 * b.accelBoost * dt);
      b.beatT += dt;
      // A beat bout lasts a few tail cycles.
      const f = (b.speed / L + 1) / 0.75;
      if (b.speed >= hi || b.beatT * f > 3.5) b.beating = false;
      effortTarget = clamp(0.3 + (0.9 * (b.speed / L)) / p.burst + 0.35 * (hi - b.speed) / hi, 0.2, 1);
    } else {
      b.speed *= Math.exp(-dt / glideTau);
      effortTarget = 0;
      if (b.speed <= lo) {
        b.beating = true;
        b.beatT = 0;
      }
    }
  } else {
    b.beating = true;
    const up = target > b.speed;
    const a = up ? b.accel * b.accelBoost : b.accel * (b.hold ? 1.6 : 2.2) + b.speed / (glideTau * 2);
    b.speed = stepToward(b.speed, target, a * dt);
    effortTarget = clamp(0.12 + (1.1 * (b.speed / L)) / p.burst + (up ? 0.6 * Math.min(1, (target - b.speed) / Math.max(1e-4, cruise)) : 0), 0, 1);
  }
  const accelNow = (b.speed - prevSpeed) / Math.max(1e-5, dt);
  b.effort = approach(b.effort, effortTarget, 0.08, dt);

  // ---- velocity & position -------------------------------------------------------------------
  const cp = Math.cos(b.pitch);
  const tx = cp * Math.cos(b.yaw), ty = Math.sin(b.pitch), tz = cp * Math.sin(b.yaw);
  env.h.current(env.h.world.env, env.t, k.pos[0], k.pos[1], k.pos[2], cur);
  // Fish compensate for the current almost completely while swimming; slow / resting fish drift more.
  const drift = b.hold ? 0.3 : b.speed < 0.3 * cruise ? 0.25 : 0.1;
  b.vx = tx * b.speed + cur[0] * drift;
  b.vy = ty * b.speed + cur[1] * drift * 0.5;
  b.vz = tz * b.speed + cur[2] * drift;
  k.pos[0] += b.vx * dt;
  k.pos[1] += b.vy * dt;
  k.pos[2] += b.vz * dt;

  // ---- body attitude --------------------------------------------------------------------------
  const pitchCap = p.maxPitch + Math.abs(b.posture) + (b.pitchLimit > p.maxPitch ? b.pitchLimit - p.maxPitch : 0);
  b.bodyPitch = approach(b.bodyPitch, clamp(b.pitch + b.posture, -pitchCap, pitchCap), b.turnBoost > 1.5 ? 0.08 : 0.35, dt);
  const speedRel = clamp(Math.abs(b.speed) / Math.max(1e-4, cruise), 0, 2);
  const bank = clamp(b.yawRate * (0.06 + 0.1 * speedRel), -0.38, 0.38);
  b.roll = approach(b.roll, bank, 0.22, dt);
  const bendTarget = clamp(-b.yawRate / (b.turnMax * 1.1), -1, 1) * (b.turnBoost > 1.5 ? 1 : 0.75);
  b.bend = approach(b.bend, bendTarget, b.turnBoost > 1.5 ? 0.03 : 0.08, dt);

  // ---- hard constraints --------------------------------------------------------------------------
  constrainSwimmer(env.h, fish, b);

  // ---- rhythms: tail, fins ------------------------------------------------------------------------
  const sAbs = Math.abs(b.speed);
  const fTail = clamp((sAbs / L + 1) / 0.75, 1.3, b.tailHzMax);
  k.tailPhase = (k.tailPhase + TAU * fTail * dt) % (TAU * 64);
  let tailT: number;
  if (p.bcf) {
    tailT = b.beating ? b.effort : 0;
    if (b.hold && sAbs < 0.3 * cruise) tailT = Math.max(tailT * 0.4, 0.06);
    if (p.continuousWave) tailT = Math.max(tailT, sAbs > 0.05 * cruise ? 0.22 : 0.06);
    tailT = Math.max(tailT, b.thrash);
  } else {
    // Median/paired-fin swimmers keep the body stiff until they need speed.
    const tailOn = clamp((sAbs / L - 1.3 * p.cruise) / Math.max(0.2, p.cruise), 0, 1);
    tailT = Math.max(0.04, b.effort * tailOn, b.thrash);
    if (b.turnBoost > 1.5) tailT = 1;
  }
  b.tailAmp = approach(b.tailAmp, tailT, 0.07, dt);

  // Pectoral sculling: strong when hovering or braking, tucked when cruising fast.
  const braking = clamp(-accelNow / Math.max(1e-4, L * 2), 0, 1);
  let finT = p.bcf ? 0.12 + 0.5 * clamp(1 - speedRel, 0, 1) : 0.3 + 0.55 * clamp(1.2 - speedRel * 0.6, 0, 1);
  if (b.hold) finT = Math.max(finT, 0.45);
  finT = Math.max(finT, 0.75 * braking);
  if (speedRel > 1.6) finT *= 0.4;
  finT = Math.max(finT * (1 - 0.6 * b.rest), b.flare);
  b.finAmp = approach(b.finAmp, finT, 0.15, dt);
  const fFin = p.finHz * Math.pow(0.08 / Math.max(0.005, L), 0.3) * (0.6 + 0.7 * b.finAmp) * (1 - 0.4 * b.rest);
  k.finPhase = (k.finPhase + TAU * fFin * dt) % (TAU * 64);
}

/**
 * Keep the whole body (snout, tail and flanks) inside the water volume and out of decor.
 * Soft avoidance in steering keeps this from engaging most of the time.
 */
export function constrainSwimmer(h: Habitat, fish: FishEntity, b: Brain): void {
  const k = fish.kin;
  const p = b.p;
  const L = b.L;
  const cp = Math.cos(b.bodyPitch);
  const fx = cp * Math.cos(b.yaw), fy = Math.sin(b.bodyPitch), fz = cp * Math.sin(b.yaw);
  const rSide = 0.5 * p.widthFrac * L + 0.002;
  const rVert = 0.5 * p.depthFrac * L + 0.002;
  const half = 0.47 * L;
  const B = h.b;

  // Decor first (then glass so we never get pushed through the glass by a rock). Fish in open
  // water (centre farther than half a body from any decor) need no further checks.
  const d0 = h.colliders.length > 0 ? h.nearestDecor(k.pos[0], k.pos[1], k.pos[2], b.shelterOwner) : Infinity;
  const nearDecor = d0 < half + Math.max(rSide, rVert) + 0.005;
  for (let it = 0; it < (nearDecor ? 2 : 0); it++) {
    for (let s = -1; s <= 1; s++) {
      const off = s * half * 0.9;
      const px = k.pos[0] + fx * off, py = k.pos[1] + fy * off, pz = k.pos[2] + fz * off;
      const d = h.nearestDecor(px, py, pz, b.shelterOwner);
      const need = s === 0 ? Math.min(rSide, rVert) : 0.0025;
      if (d < need) {
        const push = need - d;
        k.pos[0] += hit.nx * push;
        k.pos[1] += hit.ny * push;
        k.pos[2] += hit.nz * push;
        if (s === 1) b.speed *= 0.92; // nosed into a rock: lose a little speed
      }
    }
  }

  // (Capped so a fish longer than the tank is deep still keeps its centre inside.)
  const ex = Math.min(half * Math.abs(fx) + rSide, B.halfW * 0.98);
  const ez = Math.min(half * Math.abs(fz) + rSide, B.halfD * 0.98);
  const ey = half * Math.abs(fy) + rVert;
  k.pos[0] = clamp(k.pos[0], -B.halfW + ex, B.halfW - ex);
  k.pos[2] = clamp(k.pos[2], -B.halfD + ez, B.halfD - ez);
  // Substrate under the belly, snout and tail (pitched fish and slopes).
  const fc = h.floor(k.pos[0], k.pos[2]);
  const fsn = h.floor(k.pos[0] + fx * half, k.pos[2] + fz * half) - fy * half;
  const ftl = h.floor(k.pos[0] - fx * half, k.pos[2] - fz * half) + fy * half;
  const minY = b.floorOk
    ? Math.max(fc + rVert * 0.85 * cp, fsn + 0.001, ftl + rVert * 0.3)
    : Math.max(fc + rVert, fsn + rVert * 0.5, ftl + rVert * 0.5) + 0.002;
  const maxY = h.b.surfaceY - (b.surfaceOk ? Math.max(0.001, half * Math.max(0, fy) * 0.98 + rVert * 0.25) : ey + 0.003);
  if (k.pos[1] < minY) k.pos[1] = minY;
  if (k.pos[1] > maxY) k.pos[1] = Math.max(minY, maxY);
  if (k.pos[1] > B.surfaceY - 0.002) k.pos[1] = B.surfaceY - 0.002;

  // Rare case: wedged between a rock and the substrate/glass (the decor push and the floor or
  // wall clamp fight). Escape sideways along the horizontal distance gradient, then upward.
  const need = Math.min(rSide, rVert) * 0.5;
  let d = nearDecor ? h.nearestDecor(k.pos[0], k.pos[1], k.pos[2], b.shelterOwner) : Infinity;
  if (d < need && h.nearestIndex >= 0) {
    const ci = h.nearestIndex;
    const e = 0.004, x = k.pos[0], y = k.pos[1], z = k.pos[2];
    const gx = h.sdf(ci, x + e, y, z) - h.sdf(ci, x - e, y, z);
    const gz = h.sdf(ci, x, y, z + e) - h.sdf(ci, x, y, z - e);
    const gl = Math.sqrt(gx * gx + gz * gz);
    if (gl > 1e-6) {
      const step = need - d + 0.002;
      k.pos[0] = clamp(k.pos[0] + (gx / gl) * step * 1.5, -B.halfW + ex, B.halfW - ex);
      k.pos[2] = clamp(k.pos[2] + (gz / gl) * step * 1.5, -B.halfD + ez, B.halfD - ez);
      d = h.nearestDecor(k.pos[0], k.pos[1], k.pos[2], b.shelterOwner);
    }
    for (let it = 0; it < 12 && d < need; it++) {
      k.pos[1] = Math.min(maxY, k.pos[1] + Math.max(0.004, need - d));
      d = h.nearestDecor(k.pos[0], k.pos[1], k.pos[2], b.shelterOwner);
      if (k.pos[1] >= maxY) break;
    }
  }
}

/**
 * Breathing, mouth, gills and the rest of the per-frame animation outputs. Called once per frame
 * after all sub-steps (for swimmers and surface animals alike).
 */
export function animateBreathing(fish: FishEntity, b: Brain, dt: number, t: number): void {
  const k = fish.kin;
  const L = Math.max(0.005, b.L);
  // Ventilation: ~1.3 Hz at 5 cm (≈80 breaths/min), slower in big fish; faster with stress and
  // effort; slower at rest.
  const stress = Math.max(b.fear, fish.state.stress * 0.6);
  const fGill = b.p.gillHz * Math.pow(0.05 / L, 0.25) * (1 + 0.7 * stress + 0.5 * b.effort) * (1 - 0.35 * b.rest);
  k.gillPhase = (k.gillPhase + TAU * fGill * dt) % (TAU * 64);
  // Mouth opens just before the opercula (buccal pump): phase-lead of ~90°.
  const amp = 0.1 + 0.08 * stress + 0.05 * b.effort;
  b.breath = approach(b.breath, amp, 0.5, dt);
  let mouth = b.breath * (0.5 + 0.5 * Math.sin(k.gillPhase + Math.PI * 0.5));
  if (b.chewT > 0) {
    b.chewT -= dt;
    mouth = Math.max(mouth, 0.18 + 0.22 * (0.5 + 0.5 * Math.sin(t * TAU * 3.2)));
  }
  if (b.snap > 0) {
    b.snap = Math.max(0, b.snap - dt / 0.16);
    // Suction strike: fast opening, slower closing.
    const s = b.snap;
    mouth = Math.max(mouth, s > 0.75 ? (1 - s) * 4 : s / 0.75);
  }
  if (b.flare > 0.3) mouth = Math.max(mouth, 0.3 * b.flare);
  k.mouth = clamp(mouth, 0, 1);
}
