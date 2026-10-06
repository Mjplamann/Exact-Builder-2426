import { MathUtils, PerspectiveCamera, Vector3 } from 'three';
import type { TankState } from '../../core/types';
import { substrateHeight, tankBounds } from '../../core/tankGeometry';

/**
 * Viewer camera: frames the tank so its interior fills the screen ("eye at the glass"), adds a
 * slow breathing parallax drift, follows a focused fish and accepts gentle user pan/zoom.
 *
 * The camera always looks straight into the tank (along −z) from in front of the front glass,
 * apart from a small aim toward a followed fish, so verticals stay vertical like an
 * architectural photo. Motion uses critically damped springs: eases in and out, never overshoots.
 */

/** Vertical field of view (deg): a "normal" lens; distance is derived from it. */
const FOV = 30;
/** Drift amplitudes (m) and periods (s): a few cm of slow breathing, never seasick. */
const DRIFT_AMP = new Vector3(0.012, 0.006, 0.01);
/** Max user zoom (distance divisor) and the extra dolly when following a fish. */
const MAX_ZOOM = 2.6;
const FOCUS_ZOOM = 1.65;
/** Closest the camera may come to the front glass (m). */
const MIN_GLASS_GAP = 0.12;

/** Critically damped spring toward a target (per component). */
class Spring3 {
  readonly pos = new Vector3();
  readonly vel = new Vector3();
  constructor(public omega: number) {}
  snap(v: Vector3): void {
    this.pos.copy(v);
    this.vel.set(0, 0, 0);
  }
  step(target: Vector3, dt: number): void {
    this.pos.x = this.axis(this.pos.x, target.x, 0, dt);
    this.pos.y = this.axis(this.pos.y, target.y, 1, dt);
    this.pos.z = this.axis(this.pos.z, target.z, 2, dt);
  }
  /** Exact solution of x'' = -2ωx' - ω²(x - target) over dt (stable for any dt). */
  private axis(x: number, target: number, i: 0 | 1 | 2, dt: number): number {
    const w = this.omega;
    const e = Math.exp(-w * dt);
    const x0 = x - target;
    const v0 = this.vel.getComponent(i);
    const c = v0 + w * x0;
    this.vel.setComponent(i, (v0 - w * c * dt) * e);
    return target + (x0 + c * dt) * e;
  }
}

export class CameraRig {
  readonly camera: PerspectiveCamera;

  // Home framing (computed by frame()).
  private homeDist = 1;
  private homeCenter = new Vector3();
  /** Region of the front glass plane that may be shown: x ∈ [-halfW, halfW], y ∈ [yMin, yMax]. */
  private halfW = 0.5;
  private yMin = 0;
  private yMax = 0.5;
  private frontZ = 0.25;
  private backZ = -0.25;

  // User view (pan in meters on the glass plane, zoom = distance divisor).
  private userPan = new Vector3();
  private userZoom = 1;

  // Focus.
  private focusTarget = new Vector3();
  private hasFocus = false;
  private focusWeight = 0;

  // Smoothed pose.
  private posSpring = new Spring3(2.4);
  private aimSpring = new Spring3(2.0);
  private desiredPos = new Vector3();
  private desiredAim = new Vector3();
  private initialized = false;

  drift = true;
  private t = Math.random() * 100;

  private tmp = new Vector3();
  private tmp2 = new Vector3();

  constructor(aspect: number) {
    this.camera = new PerspectiveCamera(FOV, aspect, 0.03, 12);
  }

  /** (Re)compute the home framing for a tank and the current aspect. */
  frame(tank: TankState, aspect: number): void {
    const b = tankBounds(tank);
    this.camera.aspect = aspect;
    this.camera.updateProjectionMatrix();
    this.halfW = b.halfW;
    this.frontZ = b.halfD;
    this.backZ = -b.halfD;
    // Front-glass rectangle to cover: from a little below the substrate line (so its
    // cross-section shows at the bottom) to just above the waterline (meniscus at the top).
    let frontSub = 0;
    for (let i = 0; i <= 8; i++) frontSub += substrateHeight(tank, (i / 8 - 0.5) * 2 * b.halfW * 0.9, b.halfD);
    frontSub /= 9;
    this.yMin = tank.substrate === 'bare' ? 0.004 : frontSub * 0.2;
    this.yMax = b.surfaceY + 0.007;
    const rectW = 2 * b.halfW;
    const rectH = this.yMax - this.yMin;
    // Overscan: stay inside the rectangle by the drift amplitude plus 1%.
    const inset = 1 - 0.01;
    const tanHalf = Math.tan(MathUtils.degToRad(FOV) / 2);
    let visH: number;
    let cy: number;
    if (rectW / rectH > aspect) {
      visH = rectH * inset - 2 * DRIFT_AMP.y;
      cy = (this.yMin + this.yMax) / 2;
    } else {
      // Viewport wider than the tank: fit the width, crop vertically — favour keeping the
      // waterline (crop 35% from the top, 65% from the bottom).
      const visW = rectW * inset - 2 * DRIFT_AMP.x;
      visH = visW / aspect;
      const crop = rectH - visH;
      cy = this.yMax - crop * 0.35 - visH / 2;
    }
    this.homeDist = visH / 2 / tanHalf;
    this.homeCenter.set(0, cy, 0);
    this.clampUser();
    if (!this.initialized) {
      this.computeDesired();
      this.posSpring.snap(this.desiredPos);
      this.aimSpring.snap(this.desiredAim);
      this.initialized = true;
    }
  }

  /** Snap to the desired pose (no animation), e.g. after a tank reset. */
  snap(): void {
    this.computeDesired();
    this.posSpring.snap(this.desiredPos);
    this.aimSpring.snap(this.desiredAim);
  }

  setFocus(target: Vector3 | null): void {
    if (target) {
      this.focusTarget.copy(target);
      this.hasFocus = true;
    } else {
      this.hasFocus = false;
    }
  }

  /**
   * Pan by (dx, dy) fractions of the visible half-width/height (positive = view moves right/up)
   * and zoom by dz (positive = closer; 1 ≈ one "notch" of ~12%). Clamped so the view never
   * leaves the front glass.
   */
  nudge(dx: number, dy: number, dz: number): void {
    const dist = this.homeDist / this.userZoom;
    const tanHalf = Math.tan(MathUtils.degToRad(FOV) / 2);
    const visH = 2 * dist * tanHalf;
    const visW = visH * this.camera.aspect;
    this.userPan.x += MathUtils.clamp(dx, -1, 1) * visW * 0.5;
    this.userPan.y += MathUtils.clamp(dy, -1, 1) * visH * 0.5;
    this.userZoom = MathUtils.clamp(this.userZoom * Math.exp(MathUtils.clamp(dz, -3, 3) * 0.12), 1, MAX_ZOOM);
    this.clampUser();
  }

  /** Keep the user's pan inside the region the current zoom allows. */
  private clampUser(): void {
    const dist = this.homeDist / this.userZoom;
    const lim = this.panLimits(dist, this.tmp2);
    this.userPan.x = MathUtils.clamp(this.userPan.x, -lim.x, lim.x);
    this.userPan.y = MathUtils.clamp(this.userPan.y, lim.y, lim.z);
  }

  /** For a camera at `dist` from the glass: max |x| and the y range (as offsets from homeCenter). */
  private panLimits(dist: number, out: Vector3): Vector3 {
    const tanHalf = Math.tan(MathUtils.degToRad(FOV) / 2);
    const visH = 2 * dist * tanHalf;
    const visW = visH * this.camera.aspect;
    const mx = Math.max(0, this.halfW * 0.995 - visW / 2 - DRIFT_AMP.x);
    const lo = this.yMin + visH / 2 + DRIFT_AMP.y - this.homeCenter.y;
    const hi = this.yMax - visH / 2 - DRIFT_AMP.y - this.homeCenter.y;
    out.set(mx, Math.min(lo, hi, 0), Math.max(lo, hi, 0));
    if (lo > hi) out.set(mx, (lo + hi) / 2, (lo + hi) / 2);
    return out;
  }

  private computeDesired(): void {
    // User view.
    const userDist = this.homeDist / this.userZoom;
    const ux = this.homeCenter.x + this.userPan.x;
    const uy = this.homeCenter.y + this.userPan.y;
    let x = ux, y = uy, dist = userDist;
    let aimX = ux, aimY = uy;
    const w = this.focusWeight;
    if (w > 0) {
      // Follow: dolly in and center the fish as far as the glass allows; aim a little
      // toward it when the framing is clamped (e.g. a fish right under the surface).
      const fd = Math.min(userDist, this.homeDist / FOCUS_ZOOM);
      const lim = this.panLimits(fd, this.tmp2);
      const f = this.focusTarget;
      const fx = MathUtils.clamp(f.x, this.homeCenter.x - lim.x, this.homeCenter.x + lim.x);
      const fy = MathUtils.clamp(f.y, this.homeCenter.y + lim.y, this.homeCenter.y + lim.z);
      x = MathUtils.lerp(ux, fx, w);
      y = MathUtils.lerp(uy, fy, w);
      dist = MathUtils.lerp(userDist, fd, w);
      // Aim point: at the fish depth, partly toward the fish (≤ ~5° off-axis).
      const reach = Math.max(0.05, this.frontZ + dist - f.z) * 0.09;
      aimX = MathUtils.lerp(ux, x + MathUtils.clamp(f.x - x, -reach, reach), w);
      aimY = MathUtils.lerp(uy, y + MathUtils.clamp(f.y - y, -reach, reach), w);
    }
    const camZ = this.frontZ + Math.max(MIN_GLASS_GAP, dist);
    this.desiredPos.set(x, y, camZ);
    // Aim at the tank's mid-depth so drift pivots there (front glass moves little, back moves opposite).
    this.desiredAim.set(aimX, aimY, (this.frontZ + this.backZ) / 2);
  }

  private wave(period: number, phase: number): number {
    return Math.sin((this.t * Math.PI * 2) / period + phase);
  }

  update(dt: number): void {
    this.t += dt;
    // Ease focus weight in/out over ~1.5 s.
    const target = this.hasFocus ? 1 : 0;
    this.focusWeight += (target - this.focusWeight) * (1 - Math.exp(-dt * 1.6));
    if (Math.abs(this.focusWeight - target) < 1e-4) this.focusWeight = target;
    this.computeDesired();
    this.posSpring.step(this.desiredPos, dt);
    this.aimSpring.step(this.desiredAim, dt);

    const cam = this.camera;
    cam.position.copy(this.posSpring.pos);
    const aim = this.tmp.copy(this.aimSpring.pos);
    if (this.drift) {
      // Sum of slow incommensurate sines: smooth, never repeating, sub-0.05 Hz.
      cam.position.x += DRIFT_AMP.x * (0.65 * this.wave(37, 0.3) + 0.35 * this.wave(23.3, 2.1));
      cam.position.y += DRIFT_AMP.y * (0.6 * this.wave(43, 1.7) + 0.4 * this.wave(29.1, 0.4));
      cam.position.z += DRIFT_AMP.z * (0.7 * this.wave(53, 2.9) + 0.3 * this.wave(31.7, 1.2));
    }
    // Never cross the front glass.
    cam.position.z = Math.max(cam.position.z, this.frontZ + MIN_GLASS_GAP);
    cam.up.set(0, 1, 0);
    cam.lookAt(aim);
    cam.updateMatrixWorld();
  }
}
