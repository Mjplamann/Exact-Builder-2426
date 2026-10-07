import { MathUtils, PerspectiveCamera, Vector3 } from 'three';
import type { TankState } from '../../core/types';
import { substrateHeight, tankBounds } from '../../core/tankGeometry';

/**
 * Viewer camera: frames the tank so its interior fills the screen ("eye at the glass"), adds a
 * slow breathing parallax drift, zooms like a telephoto lens through the front glass and follows
 * an animal closely like a patient wildlife cameraman.
 *
 * The camera always looks straight into the tank (along −z) from in front of the front glass,
 * apart from a small aim toward a followed animal, so verticals stay vertical like an
 * architectural photo. Motion uses critically damped springs: eases in and out, never overshoots.
 *
 * Optics of looking into water through a flat front pane:
 *  - Eye height: a seated viewer's eye (or a photographer's lens) sits above the middle of the
 *    frame, ~2/3 of the way up. The camera is raised by EYE_LIFT of the visible height and the
 *    frame is re-centred with a lens shift (like a shift lens), so the framing on the front
 *    glass is unchanged and verticals stay vertical.
 *  - Refraction: a point at distance d behind a flat water/air interface appears at d/n
 *    (paraxial, n = 1.333), so a real tank looks shallower than it is and the total-internal-
 *    reflection band under the surface is a slim strip. For everything behind the glass, the
 *    view from an eye at distance L in front of the glass through that compression is exactly
 *    the view from a "virtual eye" n·L in front of the glass with a lens n× longer (tan of the
 *    half-angle ÷ n): same framing on the glass, same apparent depth. So the rig works out the
 *    real viewer's pose and then places the three.js camera at that virtual eye with the
 *    narrower field. Everything stays a standard perspective camera in true world space —
 *    shading, shadows, caustics, picking (`unproject`, raycasting) and `project()` need no
 *    special cases at any zoom, and `camera.position` is the point all in-water lines of sight
 *    converge on (the right eye for water path lengths and underwater view angles).
 *  - Zoom: 1× frames the whole tank with a ~50 mm-equivalent lens. Zooming in walks a little
 *    closer to the glass (distance ∝ zoom^−DOLLY, never nearer than MIN_GLASS_GAP) and narrows
 *    the lens for the rest, so at 8× it is a ~200 mm telephoto: compressed perspective and a
 *    shallow depth of field, like macro aquarium photography rather than a fisheye.
 *
 * View state = the frame centre on the front-glass plane (x, y in m) + ln(zoom), smoothed by one
 * critically damped spring whose rate depends on who moves the camera: direct input settles in
 * ~0.2 s, framing transitions take 2–4 s, and following tracks with heavy damping on position
 * (tail beats and darts never shake the camera) and a quicker small aim that keeps the animal
 * in frame.
 */

/** A moving subject for the camera: live arrays read every frame (no per-frame allocation). */
export interface FollowSubject {
  pos: [number, number, number];
  lengthM: number;
  forward?: [number, number, number];
}

/** Vertical field of view (deg) at 1×: a ~50 mm "normal" lens; distance is derived from it. */
const FOV = 26;
/** How far above the frame centre the eye sits, as a fraction of the visible height (≈ eye at 2/3 height). */
const EYE_LIFT = 0.17;
/** Refractive index of water (front glass plane = refraction interface). */
const WATER_N = 1.333;
/** Drift amplitudes (m) at 1× (scaled by 1/zoom: a long lens is on a steadier tripod). */
const DRIFT_AMP = new Vector3(0.012, 0.006, 0.01);
/** Telephoto range: 1× frames the whole tank; 8× ≈ a 200 mm lens on full frame. */
export const MAX_ZOOM = 8;
/** One wheel notch / zoom button press. */
export const ZOOM_STEP = 1.12;
const LN_STEP = Math.log(ZOOM_STEP);
const LN_MAX = Math.log(MAX_ZOOM);
/** Share of the zoom done by walking up to the glass (distance ∝ zoom^−DOLLY); the lens does the rest. */
const DOLLY = 0.35;
/**
 * Most of a tank's height the whole-tank view may crop when the screen is wider than the tank
 * (cubes and tall tanks on a landscape screen). Beyond it the tank is shown narrower than the
 * screen, framed by the dark room, so a tall tank never loses its surface and its substrate.
 */
const MAX_HEIGHT_CROP = 0.22;
/** Closest the camera may come to the front glass (m). */
const MIN_GLASS_GAP = 0.12;
/** How much of the screen width a followed animal may be asked to span. */
export const FILL_MIN = 0.05;
export const FILL_MAX = 0.6;

// Spring rates (1/s) of the critically damped framing (settle to ~2 % in ≈ 5.8/ω).
/** Direct input (wheel, pinch, drag, buttons). */
const OMEGA_USER = 22;
/** "Back to the whole tank". */
const OMEGA_RESET = 6;
/** Following: framing position and zoom (faster, up to the max, for animals that cross the frame quickly)… */
const OMEGA_FOLLOW = 1.9;
const OMEGA_FOLLOW_MAX = 4.5;
/** …a user's change of framing while following… */
const OMEGA_FILL = 7;
/** …and the aim, which takes up what the slow framing lags behind. */
const OMEGA_AIM = 5;
/** Start of a framing transition (to/between/from animals); ramps up over the transition. */
const OMEGA_TRANSITION = 1.1;
/** Free view after a transition back from an animal. */
const OMEGA_SETTLE = 2.6;
/** The aim may turn the camera by at most this fraction of the half field (verticals stay vertical). */
const AIM_MAX = 0.35;
/** Rule of thirds: the subject sits this far (NDC) from the centre, away from where it is heading. */
const LEAD = 0.26;
/** Velocity look-ahead of the framing target, as a share of the spring's lag (2/ω) it takes up. */
const PREDICT = 0.7;
/**
 * Depth of field: effective aperture h/(4N) of a full-frame sensor (h = 24 mm) at f/16 (m) — the
 * stopped-down lens of an aquarium macro photographer.
 */
const DOF_APERTURE = 0.024 / (4 * 16);

/** Critically damped spring toward a target (per component). */
class Spring3 {
  readonly pos = new Vector3();
  readonly vel = new Vector3();
  snap(v: Vector3): void {
    this.pos.copy(v);
    this.vel.set(0, 0, 0);
  }
  step(target: Vector3, dt: number, wx: number, wy = wx, wz = wx): void {
    this.pos.x = this.axis(this.pos.x, target.x, 0, wx, dt);
    this.pos.y = this.axis(this.pos.y, target.y, 1, wy, dt);
    this.pos.z = this.axis(this.pos.z, target.z, 2, wz, dt);
  }
  /** Exact solution of x'' = -2ωx' - ω²(x - target) over dt (stable for any dt). */
  private axis(x: number, target: number, i: 0 | 1 | 2, w: number, dt: number): number {
    const e = Math.exp(-w * dt);
    const x0 = x - target;
    const v0 = this.vel.getComponent(i);
    const c = v0 + w * x0;
    this.vel.setComponent(i, (v0 - w * c * dt) * e);
    return target + (x0 + c * dt) * e;
  }
}

const smooth01 = (t: number) => (t <= 0 ? 0 : t >= 1 ? 1 : t * t * (3 - 2 * t));

/** Default framing of an animal by size: small fish ~0.22 of the screen width, larger ones ~0.3. */
export function defaultFill(lengthM: number): number {
  const t = MathUtils.clamp(Math.log(Math.max(1e-3, lengthM) / 0.03) / Math.log(5), 0, 1);
  return 0.22 + 0.08 * t;
}

/** A piece of the aquascape seen through the front glass: its x extent (m) and visual weight. */
export interface ScapeMass {
  x0: number;
  x1: number;
  w: number;
}

/**
 * Where a window `win` m wide (the whole-tank view of a phone held upright) shows most of the
 * aquascape: the x (window centre, inside ±(halfW − win/2)) holding the largest share of the
 * scape's weight, then centred on what it holds (weighted by how much of each piece is in view).
 * A previous focus is kept while it still shows nearly as much (no hop between two equal
 * bommies). 0 for an empty tank or a window as wide as the tank.
 */
export function scapeFocusX(items: readonly ScapeMass[], halfW: number, win: number, prev?: number): number {
  const lim = halfW - win / 2;
  if (!(lim > 1e-4) || !(win > 0) || items.length === 0) return 0;
  const score = (c: number) => {
    let s = 0;
    for (const it of items) {
      const ov = Math.min(it.x1, c + win / 2) - Math.max(it.x0, c - win / 2);
      if (ov > 0) s += (it.w * ov) / Math.max(1e-4, it.x1 - it.x0);
    }
    // A slight preference for the middle of the tank among equals.
    return s * (1 - 0.06 * (c / halfW) * (c / halfW));
  };
  const N = 48;
  let best = 0;
  let bestS = -1;
  for (let i = 0; i <= N; i++) {
    const c = -lim + (2 * lim * i) / N;
    const sc = score(c);
    if (sc > bestS + 1e-12) {
      bestS = sc;
      best = c;
    }
  }
  if (!(bestS > 0)) return 0;
  let c = best;
  if (prev !== undefined && Number.isFinite(prev)) {
    const p = MathUtils.clamp(prev, -lim, lim);
    if (score(p) >= 0.9 * bestS) c = p;
  }
  // Centre on what the window holds (a few mean-shift steps).
  for (let k = 0; k < 4; k++) {
    let sw = 0;
    let sx = 0;
    for (const it of items) {
      const a = Math.max(it.x0, c - win / 2);
      const b = Math.min(it.x1, c + win / 2);
      if (b <= a) continue;
      const w = (it.w * (b - a)) / Math.max(1e-4, it.x1 - it.x0);
      sw += w;
      sx += w * (a + b) / 2;
    }
    if (!(sw > 0)) break;
    c = MathUtils.clamp(sx / sw, -lim, lim);
  }
  return c;
}

export class CameraRig {
  readonly camera: PerspectiveCamera;

  // Home framing (computed by frame()).
  /** Real eye–glass distance at 1× (m). */
  private homeDist = 1;
  /** Visible height on the front-glass plane at 1× (m). */
  private homeH = 0.4;
  private homeY = 0.2;
  /**
   * Home frame centre x: the middle of the tank, except where a phone held upright shows only a
   * slice of a wide tank — then the slice that holds the aquascape's focus (see setScape).
   */
  private homeX = 0;
  /** The aquascape's pieces (x extents + weights) for the portrait home framing. */
  private scape: ScapeMass[] = [];
  private aspect = 1;
  /** Region of the front glass plane that may be shown: x ∈ [-halfW, halfW], y ∈ [yMin, yMax]. */
  private halfW = 0.5;
  private yMin = 0;
  private yMax = 0.5;
  private frontZ = 0.25;
  /** Back glass in true space and as it appears through the front glass. */
  private backTrue = -0.25;
  private backZ = -0.25;

  // Free view target: frame centre (x, y) on the glass plane and ln(zoom) in z.
  private free = new Vector3(0, 0.2, 0);
  private freeOmega = OMEGA_USER;
  /** True-space depth (z) the lens focuses at when not following (zoom anchor / tank middle). */
  private freeFocusZ = 0;

  // Smoothed framing (x, y, ln zoom) and aim (tangents of the extra yaw/pitch, real space).
  private view = new Spring3();
  private aim = new Spring3();
  private desired = new Vector3();
  private aimTarget = new Vector3();
  private initialized = false;

  // Following.
  private subject: FollowSubject | null = null;
  /** Requested fill (fraction of the screen width), 0 = by size. */
  private fill = 0;
  /** Seconds left of quick (user-driven) zoom response while following. */
  private fillT = 0;
  /** Filtered subject: framing track, quick aim track, velocity and heading (true space). */
  private sp = new Vector3();
  private spFast = new Vector3();
  private sv = new Vector3();
  private sf = new Vector3(1, 0, 0);
  private spPrev = new Vector3();
  /** Last computed follow target (x, y, ln zoom). */
  private followTarget = new Vector3();
  /** 0..1 how much we are following (eased; drives depth of field). */
  private followW = 0;
  /** Framing spring rate for the current subject (eased with how fast it crosses the frame). */
  private followOmega = OMEGA_FOLLOW;
  /**
   * The uncovered part of the screen (NDC) a followed animal is framed in — all of it, unless the
   * animal's card or a panel covers the middle (see setSafeArea).
   */
  private safe = { x0: -1, x1: 1, y0: -1, y1: 1 };
  /** 0..1 of the rule-of-thirds lead there is room for (a big animal that fills the frame is centred). */
  private leadRoom = 1;

  // Framing transition (start/switch/end of a follow): elapsed, length, kind, where it started.
  private transT = 0;
  private transDur = 0;
  private transSwitch = false;
  private transFrom = new Vector3();

  // Optics this frame.
  /** Tangent of the real lens's half vertical field. */
  private tanR = Math.tan(MathUtils.degToRad(FOV) / 2);
  /** Lens shift: tangent of the frame centre's angle below the optical axis (≤ 0). */
  private shiftTan = 0;
  private focusInv = 1;
  private focusReady = false;
  private viewDir = new Vector3(0, 0, -1);

  drift = true;
  private t = Math.random() * 100;

  private tmp = new Vector3();
  private tmp2 = new Vector3();
  private lim = new Vector3();
  /** For setFocus(point) callers: a still subject. */
  private pointSubject: FollowSubject = { pos: [0, 0, 0], lengthM: 0.05 };

  /** Refractive index of the water behind the front glass (1 = no refraction). */
  private readonly n = WATER_N;

  constructor(aspect: number) {
    this.camera = new PerspectiveCamera(FOV, aspect, 0.03, 12);
    this.aspect = aspect;
  }

  // ------------------------------------------------------------------------------------------
  // Optics
  // ------------------------------------------------------------------------------------------

  /** Lens-shift term of the projection (element [9]), for cameras that must match this one (the surface mirror). */
  get projShiftY(): number {
    return this.shiftTan / this.tanR;
  }

  /** Current (animated) zoom, 1 … MAX_ZOOM. */
  get zoom(): number {
    return Math.exp(this.view.pos.z);
  }

  /** Target zoom: the free view's, or the framing the followed animal is heading for. */
  get targetZoom(): number {
    return Math.exp(this.subject ? this.followTarget.z : this.free.z);
  }

  get isFollowing(): boolean {
    return this.subject !== null;
  }

  /** Requested framing of the followed animal (fraction of the screen width). */
  get followFill(): number {
    return this.fill || defaultFill(this.subject?.lengthM ?? 0.03);
  }

  /** Focus distance (m, along the view axis from `camera.position`, true space — what the depth buffer measures). */
  get focusDistance(): number {
    return 1 / this.focusInv;
  }

  /**
   * Circle of confusion as a fraction of the frame height per unit of |1/focus − 1/depth|
   * (depths as in `focusDistance`). Thin lens: c/h = h/(4N·tan²) · |1/s₁ − 1/s₂| for the real
   * lens; in the virtual-eye space distances are n× and the tangent ÷n, hence the factor n.
   */
  get dofScale(): number {
    return (DOF_APERTURE * this.n) / (this.tanR * this.tanR);
  }

  /** 0..1 how much depth of field to show: when following, and fading in past ~1.4× zoom. */
  get dofAmount(): number {
    return Math.max(this.followW, smooth01((this.zoom - 1.35) / 0.65));
  }

  /** Distances (as `focusDistance`) to the front and back glass: the depth range that can be in view. */
  get glassDistance(): number {
    return Math.max(1e-3, this.camera.position.z - this.frontZ);
  }
  get backDistance(): number {
    return Math.max(1e-3, this.camera.position.z - this.backTrue);
  }

  /** True-space point → where it appears through the front glass (z compressed toward the glass). */
  toApparent(v: Vector3): Vector3 {
    if (v.z < this.frontZ) v.z = this.frontZ + (v.z - this.frontZ) / this.n;
    return v;
  }

  /**
   * Field of view (refraction: n× longer lens) + lens shift. Idempotent; call after anything
   * that may have reset the projection (resize).
   */
  applyProjection(): void {
    const cam = this.camera;
    const fov = MathUtils.radToDeg(2 * Math.atan(this.tanR / this.n));
    if (cam.fov !== fov) cam.fov = fov;
    cam.updateMatrixWorld();
    cam.updateProjectionMatrix();
    // Lens shift: the frame centre sits shiftTan below the axis (same NDC offset for the real
    // and the virtual eye, both tangents scale by 1/n).
    cam.projectionMatrix.elements[9] += this.projShiftY;
    cam.projectionMatrixInverse.copy(cam.projectionMatrix).invert();
  }

  /** Real eye–glass distance at zoom z (before drift). */
  private distAt(z: number): number {
    return Math.max(MIN_GLASS_GAP, this.homeDist * Math.pow(z, -DOLLY));
  }

  /** Tangent of the real lens's half vertical field at zoom z (visible height on the glass = homeH / z). */
  private tanAt(z: number): number {
    return this.homeH / (2 * z * this.distAt(z));
  }

  /** Visible width (m) at an apparent depth dS behind the front glass, at ln zoom lz. */
  private widthAt(lz: number, dS: number): number {
    const z = Math.exp(lz);
    return ((this.aspect * this.homeH) / z) * (1 + dS / this.distAt(z));
  }

  /** ln zoom at which the visible width at apparent depth dS equals `want` (clamped to the lens range). */
  private solveZoom(want: number, dS: number): number {
    let lo = 0;
    let hi = LN_MAX;
    if (this.widthAt(hi, dS) >= want) return hi;
    if (this.widthAt(lo, dS) <= want) return lo;
    for (let i = 0; i < 20; i++) {
      const m = (lo + hi) / 2;
      if (this.widthAt(m, dS) > want) lo = m;
      else hi = m;
    }
    return (lo + hi) / 2;
  }

  /**
   * Frame centre (x, y on the glass plane) at ln zoom `lz` that shows the true-space point `p` at
   * screen NDC (sx, sy) — the inverse of the projection with the eye lift and lens shift (no aim,
   * no drift). Writes x, y of `out`.
   */
  private centreFor(p: Vector3, sx: number, sy: number, lz: number, out: Vector3): Vector3 {
    const z = Math.exp(lz);
    const dist = this.distAt(z);
    const tan = this.tanAt(z);
    const lift = EYE_LIFT * 2 * dist * tan;
    const dS = p.z < this.frontZ ? (this.frontZ - p.z) / this.n : 0;
    out.x = p.x - sx * (dist + dS) * tan * this.aspect;
    out.y = p.y - lift - (sy * tan - lift / dist) * (dist + dS);
    return out;
  }

  // ------------------------------------------------------------------------------------------
  // Framing limits
  // ------------------------------------------------------------------------------------------

  /** Frame-centre limits at zoom z: max |x|, then the y range — the view never leaves the front glass. */
  private limits(z: number, out: Vector3): Vector3 {
    const visH = this.homeH / z;
    const visW = visH * this.aspect;
    const mx = Math.max(0, this.halfW * 0.995 - visW / 2 - DRIFT_AMP.x / z);
    let lo = this.yMin + visH / 2 + DRIFT_AMP.y / z;
    let hi = this.yMax - visH / 2 - DRIFT_AMP.y / z;
    if (lo > hi) lo = hi = (lo + hi) / 2;
    // The home framing is always allowed (it may crop a little differently at 1×).
    out.set(mx, Math.min(lo, this.homeY), Math.max(hi, this.homeY));
    return out;
  }

  /** Clamp a view state (x, y, ln zoom) into the lens range and the glass. Returns true if x/y moved. */
  private clampView(v: Vector3): boolean {
    v.z = MathUtils.clamp(v.z, 0, LN_MAX);
    const lim = this.limits(Math.exp(v.z), this.lim);
    const x = MathUtils.clamp(v.x, -lim.x, lim.x);
    const y = MathUtils.clamp(v.y, lim.y, lim.z);
    const moved = x !== v.x || y !== v.y;
    v.x = x;
    v.y = y;
    return moved;
  }

  /** (Re)compute the home framing for a tank and the current aspect. */
  frame(tank: TankState, aspect: number): void {
    const b = tankBounds(tank);
    // A view resting on the whole tank stays on it through a resize or a phone's rotation (the
    // new home framing may crop differently); a closer view keeps its spot, clamped to the glass.
    const atHome = this.initialized && this.isHome(this.free);
    const prevAspect = this.aspect;
    this.camera.aspect = aspect;
    this.camera.updateProjectionMatrix();
    this.aspect = aspect;
    this.halfW = b.halfW;
    this.frontZ = b.halfD;
    this.backTrue = -b.halfD;
    // The middle of the tank as it appears through the glass (depth compressed by n).
    this.backZ = b.halfD - (2 * b.halfD) / this.n;
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
      // Viewport wider than the tank: fit the width and crop vertically — but never more than
      // MAX_HEIGHT_CROP of the height; past that the dark room frames the sides. Favour the
      // waterline (crop 20% from the top, 80% from the bottom).
      const visW = rectW * inset - 2 * DRIFT_AMP.x;
      visH = Math.min(rectH * inset - 2 * DRIFT_AMP.y, Math.max(visW / aspect, rectH * (1 - MAX_HEIGHT_CROP)));
      const crop = Math.max(0, rectH - visH);
      cy = this.yMax - crop * 0.2 - visH / 2;
    }
    this.homeH = visH;
    this.homeDist = visH / 2 / tanHalf;
    this.homeY = cy;
    this.homeX = this.portraitFocus(this.homeX);
    if (!this.initialized) {
      this.free.set(this.homeX, cy, 0);
      this.initialized = true;
      this.clampView(this.free);
      this.snap();
    } else {
      if (atHome) this.free.set(this.homeX, cy, 0);
      this.clampView(this.free);
      if (Math.abs(aspect / prevAspect - 1) > 0.02) this.reframeAfterResize();
    }
    this.applyProjection();
  }

  /**
   * Home x for the current screen: on a phone held upright (portrait) facing a tank wider than the
   * screen, the whole-tank view is a slice of the tank — centred on the aquascape's focus rather
   * than on whatever open water lies at the middle. Landscape screens keep the centred framing.
   */
  private portraitFocus(prev?: number): number {
    if (!(this.aspect < 1)) return 0;
    const visW = this.homeH * this.aspect;
    const lim = Math.max(0, this.halfW * 0.995 - visW / 2 - DRIFT_AMP.x);
    if (!(lim > 1e-4)) return 0;
    // The window in the middle depth of the tank (perspective: the back shows a little more).
    const win = visW * (1 + (this.frontZ - this.backZ) / 2 / Math.max(1e-3, this.homeDist));
    return MathUtils.clamp(scapeFocusX(this.scape, this.halfW, win, prev), -lim, lim);
  }

  /**
   * The aquascape's pieces (x extents and visual weights; see ScapeMass) for the portrait home
   * framing. The home framing follows; a view resting on the whole tank moves with it (`snap`: at
   * once, e.g. for a tank just opened; otherwise a slow glide), any other view is left alone.
   */
  setScape(items: readonly ScapeMass[], opts: { snap?: boolean } = {}): void {
    this.scape = items.filter((m) => Number.isFinite(m.x0) && Number.isFinite(m.x1) && m.x1 > m.x0 && m.w > 0);
    if (!this.initialized) return;
    const wasHome = this.isHome(this.free);
    const x = this.portraitFocus(opts.snap ? undefined : this.homeX);
    if (Math.abs(x - this.homeX) < 1e-6) return;
    this.homeX = x;
    if (!wasHome) return;
    this.free.x = x;
    this.clampView(this.free);
    // While following, the free view (where "stop following" returns to) just moves with it.
    if (this.subject) return;
    if (opts.snap) {
      this.snap();
    } else {
      this.freeOmega = OMEGA_SETTLE;
      this.startTransition(false);
    }
  }

  /** Is the view state (x, y, ln zoom) the whole-tank framing (within a hair of it)? */
  private isHome(v: Vector3): boolean {
    const visH = this.homeH;
    return v.z < 1e-3 && Math.abs(v.x - this.homeX) <= 0.02 * visH * this.aspect + 1e-6 && Math.abs(v.y - this.homeY) <= 0.02 * visH + 1e-6;
  }

  /**
   * The view rests on (or is heading for) the whole-tank framing: not following, at 1×, and not
   * panned away from home — at 1× a cube or tall tank on a wide screen, or a wide tank on a phone
   * held upright, can still be panned.
   */
  get atHome(): boolean {
    return !this.subject && this.isHome(this.free);
  }

  /**
   * The screen changed shape (a phone turned, a window resized): the picture is recomposed at
   * once — like a cut — rather than drifting there over seconds. A followed animal keeps its
   * framing (fill of the new width); a free view lands on its (clamped) target. A framing
   * transition already under way carries on by itself.
   */
  private reframeAfterResize(): void {
    if (this.transDur > 0 && this.transT < this.transDur) return;
    if (this.subject) {
      this.followTargetFor(this.followTarget);
      this.view.pos.copy(this.followTarget);
    } else {
      this.view.pos.copy(this.free);
    }
    this.view.vel.set(0, 0, 0);
    this.aim.snap(this.aimTarget.set(0, 0, 0));
  }

  // ------------------------------------------------------------------------------------------
  // Free view (zoom / pan)
  // ------------------------------------------------------------------------------------------

  /** Back to the whole-tank framing (does not stop a follow). `gentle`: a slow documentary pull-back. */
  resetView(gentle = false): void {
    this.free.set(this.homeX, this.homeY, 0);
    this.clampView(this.free);
    this.freeFocusZ = 0;
    this.userMoved(gentle ? OMEGA_SETTLE : OMEGA_RESET);
    if (gentle) this.startTransition(false);
  }

  /** Snap to the desired pose (no animation), e.g. after a tank reset. */
  snap(): void {
    if (this.subject) {
      const p = this.subject.pos;
      this.sp.set(p[0], p[1], p[2]);
      this.spFast.copy(this.sp);
      this.sv.set(0, 0, 0);
      this.followTargetFor(this.desired);
      this.followW = 1;
    } else {
      this.desired.copy(this.free);
      this.followW = 0;
    }
    this.view.snap(this.desired);
    this.aim.snap(this.aimTarget.set(0, 0, 0));
    this.transDur = 0;
    this.focusReady = false;
  }

  /**
   * Zoom by wheel-notch steps (positive = closer; fractional for trackpads and pinch). With an
   * anchor (screen NDC + the true-space point under it), that point stays under the anchor once
   * the zoom settles (classic zoom-to-cursor). While following, zoom frames the animal tighter
   * or looser instead. Steps accumulate into the target, so rapid input never stutters.
   */
  zoomBy(steps: number, ndcX?: number, ndcY?: number, anchor?: Vector3 | null): void {
    if (!Number.isFinite(steps) || steps === 0) return;
    if (this.subject) {
      this.scaleFill(Math.pow(ZOOM_STEP, steps));
      return;
    }
    this.zoomTo(this.free.z + steps * LN_STEP, ndcX, ndcY, anchor);
  }

  /** Absolute zoom (1 = whole tank … MAX_ZOOM). While following, scales the framing to match. */
  setZoom(zoom: number): void {
    if (!Number.isFinite(zoom)) return;
    if (this.subject) {
      this.scaleFill(MathUtils.clamp(zoom, 1, MAX_ZOOM) / this.targetZoom);
      return;
    }
    this.zoomTo(Math.log(MathUtils.clamp(zoom, 1, MAX_ZOOM)));
  }

  private zoomTo(lz: number, ndcX?: number, ndcY?: number, anchor?: Vector3 | null): void {
    const f = this.free;
    const lz0 = f.z;
    lz = MathUtils.clamp(lz, 0, LN_MAX);
    const z0 = Math.exp(lz0);
    const z1 = Math.exp(lz);
    if (anchor && ndcX !== undefined && ndcY !== undefined && Number.isFinite(ndcX) && Number.isFinite(ndcY)) {
      // Keep the anchored point where it is on screen at the new zoom.
      this.centreFor(anchor, ndcX, ndcY, lz, f);
      this.freeFocusZ = MathUtils.clamp(anchor.z, this.backTrue, this.frontZ);
      // Zooming out, drift back toward the home framing as 1× approaches.
      if (lz < lz0) {
        const w = smooth01((2 - z1) / 1);
        f.x += (this.homeX - f.x) * w;
        f.y += (this.homeY - f.y) * w;
      }
    } else if (lz < lz0 && z0 > 1) {
      // Zooming out about the centre: re-centre proportionally, home exactly at 1×.
      const r = (1 - 1 / z1) / (1 - 1 / z0);
      f.x = this.homeX + (f.x - this.homeX) * r;
      f.y = this.homeY + (f.y - this.homeY) * r;
    }
    if (lz <= 1e-4) this.freeFocusZ = 0;
    f.z = lz;
    this.clampView(f);
    this.userMoved(OMEGA_USER);
  }

  /**
   * Pan by (dx, dy) fractions of the visible half-width/height (positive = view moves right/up),
   * measured at the depth the lens is focused on: what is in focus moves exactly with the finger
   * (nearer things a little faster, the back of the tank slower — parallax). Clamped so the view
   * never leaves the front glass. Ignored while following (the App releases the animal first).
   */
  panBy(dx: number, dy: number): void {
    if (this.subject || !(Number.isFinite(dx) && Number.isFinite(dy))) return;
    const z = Math.exp(this.free.z);
    const dS = Math.max(0, this.frontZ - this.freeFocusZ) / this.n;
    const visH = (this.homeH / z) * (1 + dS / this.distAt(z));
    this.free.x += MathUtils.clamp(dx, -1, 1) * visH * this.aspect * 0.5;
    this.free.y += MathUtils.clamp(dy, -1, 1) * visH * 0.5;
    this.clampView(this.free);
    this.userMoved(OMEGA_USER);
  }

  /** Old combined API: pan (dx, dy) + zoom dz notches (positive = closer). */
  nudge(dx: number, dy: number, dz: number): void {
    if (dx || dy) this.panBy(dx, dy);
    if (dz) this.zoomBy(MathUtils.clamp(dz, -3, 3));
  }

  private userMoved(omega: number): void {
    this.freeOmega = omega;
    if (!this.subject) this.transDur = 0;
  }

  // ------------------------------------------------------------------------------------------
  // Following
  // ------------------------------------------------------------------------------------------

  /**
   * Follow a subject (its arrays are read every frame). Calling again — even with the same live
   * object, now holding another animal — glides to the new subject over 2–4 s. null eases back
   * to the free view (`hold`: stay where the camera is and make that the free view).
   */
  follow(subject: FollowSubject | null, opts: { fill?: number; hold?: boolean } = {}): void {
    const was = this.subject;
    if (subject) {
      this.subject = subject;
      this.fill = opts.fill !== undefined && Number.isFinite(opts.fill) ? MathUtils.clamp(opts.fill, FILL_MIN, FILL_MAX) : 0;
      this.fillT = 0;
      const p = subject.pos;
      this.sp.set(p[0], p[1], p[2]);
      this.spFast.copy(this.sp);
      this.sv.set(0, 0, 0);
      const f = subject.forward;
      if (f) this.sf.set(f[0], f[1], f[2]);
      this.followOmega = OMEGA_FOLLOW;
      this.startTransition(was !== null);
      this.followTargetFor(this.followTarget);
    } else if (was) {
      this.subject = null;
      if (opts.hold) {
        // Turn the aim into framing (same picture), and make that the free view.
        const v = this.view.pos;
        const z = Math.exp(v.z);
        const reach = this.distAt(z) + Math.max(0, this.frontZ - this.sp.z) / this.n;
        v.x += this.aim.pos.x * reach;
        v.y += this.aim.pos.y * reach;
        this.aim.snap(this.aimTarget.set(0, 0, 0));
        this.free.copy(v);
        this.clampView(this.free);
        this.freeFocusZ = MathUtils.clamp(this.sp.z, this.backTrue, this.frontZ);
        this.userMoved(OMEGA_USER);
      } else {
        this.freeOmega = OMEGA_SETTLE;
        this.startTransition(false);
      }
    }
  }

  /** Tighter/looser framing of the followed animal (fraction of the screen width, 0.05–0.6). */
  setFollowFill(fill: number): void {
    if (!Number.isFinite(fill)) return;
    this.fill = MathUtils.clamp(fill, FILL_MIN, FILL_MAX);
    this.fillT = 0.8;
  }

  /**
   * Frame a followed animal inside this part of the screen (NDC, x0 < x1, y0 < y1), e.g. beside its
   * card or above a sheet, so it is never hidden behind them; the framing glides there like any
   * other reframing. Full screen = (−1, 1, −1, 1).
   */
  setSafeArea(x0: number, x1: number, y0: number, y1: number): void {
    if (![x0, x1, y0, y1].every(Number.isFinite)) return;
    const s = this.safe;
    s.x0 = MathUtils.clamp(Math.min(x0, x1), -1, 1);
    s.x1 = MathUtils.clamp(Math.max(x0, x1), -1, 1);
    s.y0 = MathUtils.clamp(Math.min(y0, y1), -1, 1);
    s.y1 = MathUtils.clamp(Math.max(y0, y1), -1, 1);
    // Never a sliver: at least a fifth of the screen each way, around its centre.
    for (const [a, b] of [['x0', 'x1'], ['y0', 'y1']] as const) {
      const c = (s[a] + s[b]) / 2;
      const half = Math.max(0.2, (s[b] - s[a]) / 2);
      s[a] = Math.max(-1, Math.min(c, 1 - half) - half);
      s[b] = s[a] + 2 * half;
    }
  }

  /** The fill actually used: as requested, but never wider than ~80 % of the uncovered width. */
  private get framingFill(): number {
    return Math.min(this.followFill, 0.8 * ((this.safe.x1 - this.safe.x0) / 2));
  }

  /**
   * Scale the followed animal's framing, within what the lens can reach at its depth (so a pinch
   * past the end of the range never leaves a dead zone to pinch back through).
   */
  private scaleFill(factor: number): void {
    const s = this.subject!;
    const dS = Math.max(0, this.frontZ - this.sp.z) / this.n;
    const len = Math.max(1e-3, s.lengthM);
    const lo = Math.max(FILL_MIN, len / this.widthAt(0, dS));
    const hi = Math.min(FILL_MAX, len / this.widthAt(LN_MAX, dS), 0.8 * ((this.safe.x1 - this.safe.x0) / 2));
    const cur = MathUtils.clamp(this.framingFill, Math.min(lo, hi), Math.max(lo, hi));
    this.setFollowFill(MathUtils.clamp(cur * factor, Math.min(lo, hi), Math.max(lo, hi)));
  }

  /** Focus the free view at this true-space depth (z), e.g. what lies under the frame centre. */
  focusAt(z: number): void {
    if (Number.isFinite(z)) this.freeFocusZ = MathUtils.clamp(z, this.backTrue, this.frontZ);
  }

  /** Old API: keep a still point in view (null = back to the free view). */
  setFocus(target: Vector3 | null): void {
    const s = this.pointSubject;
    if (target) {
      s.pos[0] = target.x;
      s.pos[1] = target.y;
      s.pos[2] = target.z;
      if (this.subject !== s) this.follow(s);
    } else if (this.subject === s) {
      this.follow(null);
    }
  }

  private startTransition(switching: boolean): void {
    this.transFrom.copy(this.view.pos);
    this.transT = 0;
    this.transSwitch = switching;
    this.transDur = 3;
  }

  /**
   * Framing target for the (filtered) subject: zoom so its body spans `fill` of the screen width
   * at its depth, frame centre so it sits a little behind the middle (room to swim into), a bit
   * ahead of where it is now (velocity look-ahead), inside the glass. Writes (x, y, ln zoom).
   */
  private followTargetFor(out: Vector3): Vector3 {
    const s = this.subject!;
    const b = this.tmp2;
    // Predicted position, kept inside the tank.
    b.copy(this.sv).multiplyScalar((PREDICT * 2) / this.followOmega).add(this.sp);
    b.x = MathUtils.clamp(b.x, -this.halfW, this.halfW);
    b.z = MathUtils.clamp(b.z, this.backTrue, this.frontZ);
    const dS = (this.frontZ - b.z) / this.n;
    let lz = this.solveZoom(Math.max(1e-3, s.lengthM) / this.framingFill, dS);
    // An animal too big for the lead (a 40 cm fish seen through a phone held upright) is centred.
    const halfNdc = Math.max(1e-3, s.lengthM) / this.widthAt(lz, dS);
    this.leadRoom = MathUtils.clamp((0.9 - halfNdc) / LEAD, 0, 1);
    // Gliding to a far-off animal: pull back first so both are in view, then push in.
    if (this.transSwitch && this.transT < this.transDur) {
      const zT = Math.exp(lz);
      const visH = this.homeH / zT;
      const need = Math.max(Math.abs(b.x - this.transFrom.x) + visH * this.aspect, (Math.abs(b.y - this.transFrom.y) + visH) * this.aspect);
      const span = Math.max(0, Math.log((this.aspect * this.homeH) / need));
      if (span < lz) lz = MathUtils.lerp(span, lz, smooth01((this.transT / this.transDur - 0.35) / 0.5));
    }
    this.leadNdc(this.tmp);
    const sx = this.tmp.x;
    const sy = this.tmp.y;
    this.placeAt(b, sx, sy, lz, out);
    // Part of the screen is covered (the animal's card, a sheet) and the glass stops the frame
    // from putting the animal in the free part at this zoom: come closer until it fits there.
    const sa = this.safe;
    if ((sa.x0 > -1 || sa.x1 < 1 || sa.y0 > -1 || sa.y1 < 1) && !(this.transSwitch && this.transT < this.transDur) && !this.inSafe(b, out)) {
      let lo = lz;
      let hi = LN_MAX;
      this.placeAt(b, sx, sy, hi, out);
      if (this.inSafe(b, out)) {
        for (let i = 0; i < 14; i++) {
          const m = (lo + hi) / 2;
          this.placeAt(b, sx, sy, m, out);
          if (this.inSafe(b, out)) hi = m;
          else lo = m;
        }
        this.placeAt(b, sx, sy, hi, out);
      } else this.placeAt(b, sx, sy, lz, out);
    }
    return out;
  }

  /** Framing (x, y, ln zoom) that puts `p` at screen NDC (sx, sy), kept on the glass. */
  private placeAt(p: Vector3, sx: number, sy: number, lz: number, out: Vector3): void {
    this.centreFor(p, sx, sy, lz, out);
    out.z = lz;
    this.clampView(out);
  }

  /** Does the framing `v` show the true-space point `p` well inside the uncovered area? */
  private inSafe(p: Vector3, v: Vector3): boolean {
    const z = Math.exp(v.z);
    const dist = this.distAt(z);
    const tan = this.tanAt(z);
    const lift = EYE_LIFT * 2 * dist * tan;
    const reach = dist + Math.max(0, this.frontZ - p.z) / this.n;
    const nx = (p.x - v.x) / (reach * tan * this.aspect);
    const ny = ((p.y - v.y - lift) / reach + lift / dist) / tan;
    const s = this.safe;
    const mx = 0.4 * ((s.x1 - s.x0) / 2);
    const my = 0.4 * ((s.y1 - s.y0) / 2);
    return nx >= s.x0 + mx && nx <= s.x1 - mx && ny >= s.y0 + my && ny <= s.y1 - my;
  }

  /** Where on screen (NDC) the subject should sit: away from its heading (rule of thirds), in the uncovered area. */
  private leadNdc(out: Vector3): Vector3 {
    const f = this.sf;
    const len = Math.max(0.35, f.length());
    const s = this.safe;
    const hx = (s.x1 - s.x0) / 2;
    const hy = (s.y1 - s.y0) / 2;
    const lead = LEAD * this.leadRoom;
    out.set(s.x0 + hx - lead * hx * MathUtils.clamp(f.x / len, -1, 1), s.y0 + hy - 0.3 * lead * hy * MathUtils.clamp(f.y / len, -1, 1), 0);
    return out;
  }

  /** Per-frame filters on the subject: quick track for the aim, slow track + velocity + heading for framing. */
  private trackSubject(dt: number): void {
    const s = this.subject!;
    const p = s.pos;
    if (!(Number.isFinite(p[0]) && Number.isFinite(p[1]) && Number.isFinite(p[2])) || dt <= 0) return;
    const aF = 1 - Math.exp(-dt / 0.12);
    this.spFast.x += (p[0] - this.spFast.x) * aF;
    this.spFast.y += (p[1] - this.spFast.y) * aF;
    this.spFast.z += (p[2] - this.spFast.z) * aF;
    this.spPrev.copy(this.sp);
    const aS = 1 - Math.exp(-dt / 0.3);
    this.sp.x += (p[0] - this.sp.x) * aS;
    this.sp.y += (p[1] - this.sp.y) * aS;
    this.sp.z += (p[2] - this.sp.z) * aS;
    const aV = 1 - Math.exp(-dt / 0.6);
    const inv = 1 / dt;
    this.sv.x += ((this.sp.x - this.spPrev.x) * inv - this.sv.x) * aV;
    this.sv.y += ((this.sp.y - this.spPrev.y) * inv - this.sv.y) * aV;
    this.sv.z += ((this.sp.z - this.spPrev.z) * inv - this.sv.z) * aV;
    const f = s.forward;
    if (f) {
      const aH = 1 - Math.exp(-dt / 0.8);
      this.sf.x += (f[0] - this.sf.x) * aH;
      this.sf.y += (f[1] - this.sf.y) * aH;
      this.sf.z += (f[2] - this.sf.z) * aH;
    }
  }

  /**
   * Aim (tangents of yaw/pitch, real space) that brings the quick subject track to its screen
   * spot from the current (smoothed) framing: what the slow framing has not caught up with yet.
   * Small, and never so far that the frame edge would leave the front glass.
   */
  private aimFor(out: Vector3, weight: number): Vector3 {
    const v = this.view.pos;
    const z = Math.exp(v.z);
    const dist = this.distAt(z);
    const tan = this.tanAt(z);
    const lift = EYE_LIFT * 2 * dist * tan;
    const p = this.spFast;
    const reach = dist + Math.max(0, this.frontZ - p.z) / this.n;
    // Where the subject appears now (NDC) vs where it should be.
    const ex = (p.x - v.x) / (reach * tan * this.aspect);
    const ey = ((p.y - v.y - lift) / reach + lift / dist) / tan;
    const lead = this.leadNdc(this.tmp);
    let ax = (ex - lead.x) * tan * this.aspect;
    let ay = (ey - lead.y) * tan;
    ax = MathUtils.clamp(ax, -AIM_MAX * tan * this.aspect, AIM_MAX * tan * this.aspect);
    ay = MathUtils.clamp(ay, -AIM_MAX * tan, AIM_MAX * tan);
    // Keep the frame on the glass: its centre on the glass moves by dist·tan(aim).
    const lim = this.limits(z, this.lim);
    ax = MathUtils.clamp(ax, Math.min(0, (-lim.x - v.x) / dist), Math.max(0, (lim.x - v.x) / dist));
    ay = MathUtils.clamp(ay, Math.min(0, (lim.y - v.y) / dist), Math.max(0, (lim.z - v.y) / dist));
    return out.set(ax * weight, ay * weight, 0);
  }

  // ------------------------------------------------------------------------------------------
  // Per frame
  // ------------------------------------------------------------------------------------------

  private wave(period: number, phase: number): number {
    return Math.sin((this.t * Math.PI * 2) / period + phase);
  }

  update(dt: number): void {
    dt = Math.max(0, dt);
    this.t += dt;
    this.transT += dt;
    const k = this.transDur > 0 ? smooth01(this.transT / this.transDur) : 1;

    // Targets and spring rates.
    if (this.subject) {
      this.trackSubject(dt);
      // Tighter tracking when the animal crosses the frame quickly (a small, busy fish at high zoom).
      const across = Math.hypot(this.sv.x, this.sv.y) / this.widthAt(this.view.pos.z, Math.max(0, this.frontZ - this.sp.z) / this.n);
      const wSteady = Math.min(OMEGA_FOLLOW_MAX, OMEGA_FOLLOW * (1 + 3 * across));
      this.followOmega += (wSteady - this.followOmega) * (1 - Math.exp(-dt / 1.2));
      this.followTargetFor(this.followTarget);
      this.desired.copy(this.followTarget);
      const w = MathUtils.lerp(OMEGA_TRANSITION, this.followOmega, k);
      this.fillT = Math.max(0, this.fillT - dt);
      this.view.step(this.desired, dt, w, w, this.fillT > 0 ? Math.max(w, OMEGA_FILL) : w);
      if (this.clampView(this.view.pos)) this.view.vel.set(0, 0, this.view.vel.z);
      // The aim joins in late in a transition, so the camera never whips toward a new animal.
      this.aimFor(this.aimTarget, this.transDur > 0 ? smooth01((this.transT / this.transDur - 0.25) / 0.75) : 1);
    } else {
      this.desired.copy(this.free);
      const w = k < 1 ? MathUtils.lerp(OMEGA_TRANSITION, this.freeOmega, k) : this.freeOmega;
      this.view.step(this.desired, dt, w);
      if (this.clampView(this.view.pos)) this.view.vel.set(0, 0, this.view.vel.z);
      this.aimTarget.set(0, 0, 0);
    }
    this.aim.step(this.aimTarget, dt, OMEGA_AIM);
    this.followW += ((this.subject ? 1 : 0) - this.followW) * (1 - Math.exp(-dt / 0.8));

    // Pose of the real viewer.
    const v = this.view.pos;
    const z = Math.exp(v.z);
    const dist = this.distAt(z);
    this.tanR = this.tanAt(z);
    const cam = this.camera;
    cam.position.set(v.x, v.y, this.frontZ + dist);
    if (this.drift) {
      // Sum of slow incommensurate sines: smooth, never repeating, sub-0.05 Hz.
      const s = 1 / z;
      cam.position.x += s * DRIFT_AMP.x * (0.65 * this.wave(37, 0.3) + 0.35 * this.wave(23.3, 2.1));
      cam.position.y += s * DRIFT_AMP.y * (0.6 * this.wave(43, 1.7) + 0.4 * this.wave(29.1, 0.4));
      cam.position.z += s * DRIFT_AMP.z * (0.7 * this.wave(53, 2.9) + 0.3 * this.wave(31.7, 1.2));
    }
    // Never cross the front glass.
    cam.position.z = Math.max(cam.position.z, this.frontZ + MIN_GLASS_GAP);
    // Raise the eye above the frame centre and shift the lens back down by the same amount on
    // the glass plane: same framing, seen from ~2/3 of the way up.
    const glassDist = cam.position.z - this.frontZ;
    const lift = EYE_LIFT * 2 * glassDist * this.tanR;
    cam.position.y += lift;
    this.shiftTan = -lift / glassDist;
    // Look at the tank's (apparent) mid-depth, turned by the aim, so drift pivots there (front
    // glass moves little, back moves opposite).
    const midZ = (this.frontZ + this.backZ) / 2;
    const reach = this.frontZ + dist - midZ;
    const dir = this.tmp.set(v.x + this.aim.pos.x * reach, v.y + lift + this.aim.pos.y * reach, midZ).sub(cam.position);
    // Real viewer pose → the equivalent virtual eye n× farther from the glass. Its lens is n×
    // longer, so an aim tilt keeps the same image shift with its tangent divided by n.
    dir.x /= this.n;
    dir.y /= this.n;
    dir.normalize();
    this.viewDir.copy(dir);
    cam.position.z = this.frontZ + glassDist * this.n;
    cam.up.set(0, 1, 0);
    cam.lookAt(this.tmp2.copy(cam.position).add(dir));
    this.applyProjection();

    // Focus: the followed animal (its quick track: the depth of field is a few mm at 8×), else
    // the zoom anchor's depth (or the tank middle). Pulled like an autofocus, evenly in diopters.
    let fd: number;
    if (this.subject) fd = this.tmp.copy(this.spFast).sub(cam.position).dot(this.viewDir);
    else fd = (cam.position.z - this.freeFocusZ) / Math.max(0.2, -this.viewDir.z);
    fd = MathUtils.clamp(fd, this.glassDistance + 0.005, this.backDistance + 0.05);
    if (!this.focusReady) {
      this.focusInv = 1 / fd;
      this.focusReady = true;
    } else {
      this.focusInv += (1 / fd - this.focusInv) * (1 - Math.exp(-dt / (this.subject ? 0.1 : 0.25)));
    }
  }
}
