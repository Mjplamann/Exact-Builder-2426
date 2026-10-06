import type { ResolvedBody } from './archetypes';

/**
 * Analytic side/top outlines and cross-sections of a fish body, in SL units (standard length:
 * x = 0 at the snout tip → x = 1 at the caudal-fin base; y up; z toward the fish's right).
 *
 *   top(x), bot(x)   dorsal and ventral outline (bot is negative)
 *   halfWidth(x)     half the body width
 *   widthLine(x)     height of the widest line of the cross-section
 *   nTop, nBot       superellipse exponents of the upper / lower half of the cross-section
 *
 * The same profile is used by the geometry builder, the texture painter (for aspect-correct
 * spots and the eye/gill/mouth landmarks) and picking.
 */

export interface HeadLandmarks {
  /** Snout extension length (tube/needle snouts). */
  snoutLen: number;
  /** Head proper length (from the end of the snout extension to the opercle edge). */
  headLen: number;
  /** Snout tip / mouth height. */
  yTip: number;
  /** Eye center and radius (right eye; the left eye mirrors z). */
  eyeX: number;
  eyeY: number;
  eyeZ: number;
  eyeR: number;
  /** Outward eye axis (unit). */
  eyeNx: number;
  eyeNy: number;
  eyeNz: number;
  /** Rictus (corner of the mouth) x, and the gape drop at the rictus. */
  rictusX: number;
  gapeDrop: number;
  /** Rear edge of the gill cover. */
  opercleX: number;
}

const clamp = (v: number, lo: number, hi: number) => (v < lo ? lo : v > hi ? hi : v);
const smooth = (e0: number, e1: number, x: number) => {
  const t = clamp((x - e0) / (e1 - e0), 0, 1);
  return t * t * (3 - 2 * t);
};
const bump = (x: number, c: number, w: number) => {
  const t = (x - c) / w;
  return Math.exp(-t * t);
};

/** Superellipse quadrant: 1 at t = 0 → 0 at t = 1 (p = 2 circle, p → 1 straight line). */
const quadrant = (t: number, p: number) => (t <= 0 ? 1 : t >= 1 ? 0 : Math.pow(1 - Math.pow(t, p), 1 / p));
/** Smooth maximum (fillet of radius ~k). */
const smax = (a: number, b: number, k: number) => 0.5 * (a + b + Math.sqrt((a - b) * (a - b) + k * k));

/** Convex head ease with an optional rounded (√-like) nose. */
function headEase(t: number, m: number, round: number): number {
  if (t <= 0) return 0;
  if (t >= 1) return 1;
  const e = 1 - Math.pow(1 - t, m);
  return Math.min(1, e + round * (Math.sqrt(t) - t) * (1 - t) * (1 - t) * 3);
}

export class BodyProfile {
  readonly body: ResolvedBody;
  readonly D: number;
  readonly W: number;
  readonly head: HeadLandmarks;
  /** Vertical offset that centers the body depth on the local origin. */
  readonly centerY: number;
  /** Exponents. */
  readonly nTop: number;
  readonly nBot: number;
  /** Widest line as a fraction of the half-depth (−1 bottom … 1 top). */
  readonly wcFrac: number;

  private Tmax: number;
  private Bmax: number;
  private xT: number;
  private xB: number;
  private xPed: number;
  private pedHalf: number;
  private pTail: number;
  private pHead: number;
  private pThroat: number;
  private xEnd: number;
  private mTop: number;
  private round: number;
  private tubeT: number;
  private tubeB: number;
  private tubeW: number;
  private tipW: number;
  private flare: number;

  constructor(body: ResolvedBody) {
    this.body = body;
    const b = body;
    const D = (this.D = b.depth);
    this.W = b.width;
    const sL = clamp(b.snoutLength, 0, 0.4);

    // Fraction of the max depth above the body axis.
    let a = 0.52 + 0.05 * b.backArch - 0.1 * Math.max(0, b.belly - 0.5);
    if (b.section === 'keeled') a = 0.3;
    if (b.section === 'depressed' || b.ventralFlat > 0.7) a = Math.max(a, 0.58);
    this.Tmax = a * D;
    this.Bmax = (1 - a) * D * (1 + 0.16 * (b.belly - 0.4));
    this.xT = clamp(Math.max(b.depthPos, sL + 0.1), 0.15, 0.7);
    this.xB = clamp(Math.max(b.depthPos + 0.04 + 0.06 * b.belly, sL + 0.12), 0.18, 0.72);
    const taper = clamp(b.tailTaper, 0, 1);
    this.xPed = 0.9 + 0.08 * taper;
    this.pedHalf = 0.5 * D * clamp(b.peduncle, 0.08, 1) * (1 - 0.88 * taper);
    this.flare = 1.12 - 0.12 * taper;
    // Outline behind the deepest point: a superellipse quadrant — nearly straight taper in
    // slender fish, a round disc in deep-bodied ones (discus, angelfish) — filleted into the
    // peduncle.
    this.pTail = (1.25 + 0.9 * clamp((D - 0.25) / 0.55, 0, 1)) * (1 - 0.2 * taper);
    this.xEnd = this.xPed + 0.05;
    if (b.skin === 'hex') {
      // The rigid carapace ends abruptly where the free peduncle begins.
      this.pTail = 3.2;
      this.xEnd = 0.8;
    }

    // Snout shape → head ease exponents and nose roundness.
    const sn = b.snout;
    this.mTop = sn === 'blunt' ? 3.4 : sn === 'pointed' ? 1.75 : sn === 'upturned' ? 1.6 : sn === 'beak' ? 2.8 : sn === 'elongate' || sn === 'duckbill' ? 1.5 : sn === 'tubular' ? 1.9 : 2.4;
    this.mTop *= 1 - 0.25 * b.backArch;
    this.pHead = (sn === 'blunt' ? 2.3 : sn === 'pointed' ? 1.3 : sn === 'upturned' ? 1.45 : sn === 'beak' ? 2.1 : sn === 'rounded' ? 1.85 : 1.6) * (1 + 0.12 * b.backArch);
    this.pThroat = sn === 'blunt' ? 1.9 : sn === 'pointed' ? 1.35 : 1.6;
    // Boxfish & cowfish: the carapace is a rounded box in side view too.
    if (b.section === 'boxy' && b.skin === 'hex') {
      this.pHead = 3.2;
      this.pThroat = 3.2;
    } else if (b.section === 'triangular' && b.skin === 'hex') {
      this.pHead = 2.6;
      this.pThroat = 3.4;
    }
    this.round = sn === 'blunt' ? 0.85 : sn === 'rounded' ? 0.5 : sn === 'beak' ? 0.6 : sn === 'upturned' ? 0.35 : sn === 'tubular' ? 0.4 : 0.18;
    this.tipW = (sn === 'blunt' || sn === 'beak' ? 0.34 : sn === 'rounded' ? 0.24 : 0.15) * (D / Math.max(0.02, b.width) > 3 ? 0.7 : 1);

    // Tube / needle / duckbill snout radii.
    if (sL > 0) {
      if (sn === 'duckbill') {
        this.tubeW = 0.045 + 0.1 * b.width;
        this.tubeT = this.tubeB = 0.25 * this.tubeW;
      } else if (sn === 'elongate') {
        this.tubeW = this.tubeT = this.tubeB = 0.012 + 0.04 * D;
      } else {
        this.tubeT = this.tubeB = 0.02 + 0.06 * D;
        this.tubeW = this.tubeT * 0.9;
      }
    } else {
      this.tubeT = this.tubeB = this.tubeW = 0;
    }

    // Snout-tip (mouth) height as a fraction from the bottom to the top of the head.
    const tipFrac =
      b.mouth === 'superior' ? (sn === 'upturned' ? 0.82 : 0.74) :
      b.mouth === 'terminal' ? 0.56 :
      b.mouth === 'subterminal' ? 0.45 :
      b.mouth === 'inferior' ? 0.36 : 0.28;
    this.head = {} as HeadLandmarks;
    const yTip = -this.Bmax + tipFrac * (this.Tmax + this.Bmax);
    // Keep the tip inside a sensible band (very deep fish still have a small snout).
    this.head.yTip = clamp(yTip * Math.min(1, 0.35 / Math.max(0.05, D)) , -this.Bmax * 0.8, this.Tmax * 0.8);

    // Cross-section family.
    let nTop = 2, nBot = 2, wc = 0;
    const dw = D / Math.max(0.02, b.width);
    switch (b.section) {
      case 'compressed':
        nTop = 2 - 0.35 * clamp((dw - 2) / 4, 0, 1);
        nBot = nTop + 0.1;
        break;
      case 'round':
        nTop = 2.2;
        nBot = 2.2;
        break;
      case 'depressed':
        nTop = 2.3;
        nBot = 4.2;
        wc = -0.45;
        break;
      case 'boxy':
        nTop = 4;
        nBot = 5;
        break;
      case 'triangular':
        nTop = 1.45;
        nBot = 4.2;
        wc = -0.45;
        break;
      case 'keeled':
        nTop = 2.2;
        nBot = 1.25;
        wc = 0.35;
        break;
    }
    const vf = clamp(b.ventralFlat, 0, 1);
    nBot = nBot + (Math.max(nBot, 4.5) - nBot) * vf;
    wc = wc + (Math.min(wc, -0.5) - wc) * vf * 0.7;
    this.nTop = nTop;
    this.nBot = nBot;
    this.wcFrac = wc;

    // Head landmarks.
    const HL = clamp(b.headLength, 0.06, 0.6);
    const headLen = Math.max(0.06, HL - sL);
    this.head.snoutLen = sL;
    this.head.headLen = headLen;
    const E = clamp(b.eyeSize, 0.05, 0.7) * HL;
    const eyeR = Math.min(E / 2, 0.42 * D, 0.45 * Math.max(0.02, b.width) + 0.02);
    const eyeX = sL + Math.max(0.36 * headLen, 0.025 + 1.25 * eyeR);
    this.head.eyeX = eyeX;
    this.head.eyeR = eyeR;
    this.head.rictusX = sL + clamp(b.mouthSize, 0.05, 1) * headLen * 0.85 + 0.01;
    this.head.gapeDrop = (b.mouth === 'superior' ? 0.45 : b.mouth === 'terminal' ? 0.2 : 0.1) * (this.head.rictusX - sL) * (0.6 + D);
    this.head.opercleX = sL + headLen * 0.96;

    // Vertical centering: middle of the extreme dorsal and ventral outline.
    let tMax = -1, bMin = 1;
    for (let i = 0; i <= 64; i++) {
      const x = i / 64;
      tMax = Math.max(tMax, this.top(x));
      bMin = Math.min(bMin, this.bot(x));
    }
    this.centerY = (tMax + bMin) / 2;

    // Eye center height and its spot on the surface.
    const T = this.top(eyeX), B = this.bot(eyeX);
    const mid = (T + B) / 2, half = (T - B) / 2;
    if (b.eyeHeight >= 0.95) {
      // Eyes on top of the head (rays, flatfish-like bottom dwellers): ring angle from the top.
      const ang = 0.45; // radians from the dorsal midline
      const p = this.ringPoint(eyeX, ang);
      this.head.eyeY = p[0];
      this.head.eyeZ = p[1];
    } else {
      let ey = mid + (0.12 + 0.55 * b.eyeHeight) * half;
      ey = Math.min(ey, T - eyeR * 1.15);
      ey = Math.max(ey, B + eyeR * 1.15);
      this.head.eyeY = ey;
      this.head.eyeZ = this.surfaceZ(eyeX, ey);
    }
    // Outward axis: surface normal of the cross-section at the eye, tilted slightly forward.
    const n = this.sectionNormal(eyeX, this.head.eyeY, this.head.eyeZ);
    const fwd = 0.18;
    const len = Math.hypot(n[0] + fwd, n[1], n[2]);
    this.head.eyeNx = (n[0] + fwd) / len;
    this.head.eyeNy = n[1] / len;
    this.head.eyeNz = n[2] / len;
  }

  /** Rays: a round disc (front ~55% of the length) and a thin whip tail. */
  private rayDisc(x: number): number {
    const cx = 0.29, rx = 0.29;
    const u = (x - cx) / rx;
    return u >= 1 || u <= -1 ? 0 : Math.pow(1 - u * u, 0.55);
  }
  private rayTail(x: number): number {
    const t = clamp((x - 0.45) / 0.55, 0, 1);
    return x < 0.4 ? 0 : 0.03 * (1 - 0.85 * t);
  }

  /** Peduncle half-depth band (flares slightly toward the caudal base). */
  private pedBand(x: number): number {
    const t = smooth(this.xPed, 1, x);
    return 0.93 * this.pedHalf * (1 + (this.flare - 1) * t * t);
  }

  /** Dorsal outline height at x (SL units, not yet centered). */
  top(x: number): number {
    const b = this.body;
    if (b.kind === 'ray') return Math.max(this.D * 0.6 * Math.pow(this.rayDisc(x), 0.8), this.rayTail(x) * 0.8, x < 0.02 ? 0 : 0.002);
    const sL = this.head.snoutLen ?? Math.max(0, b.snoutLength);
    const yTip = this.head.yTip ?? 0;
    let y: number;
    if (x <= sL && sL > 0) {
      const t = x / sL;
      const r = this.tubeT * (this.body.snout === 'elongate' ? Math.min(1, 0.25 + 0.75 * t) : headEase(Math.min(1, t * 6), 2, 0.8));
      y = yTip + r;
    } else if (x < this.xT) {
      const u = (this.xT - x) / (this.xT - sL);
      const base = yTip + this.tubeT;
      y = base + (this.Tmax - base) * quadrant(u, sL > 0 ? 1.5 : this.pHead);
    } else {
      const t = (x - this.xT) / (this.xEnd - this.xT);
      y = smax(this.Tmax * quadrant(t, this.pTail), this.pedBand(x), this.pedHalf * 0.6);
    }
    // Back arch and nuchal hump.
    y += 0.05 * this.D * b.backArch * bump(x, b.depthPos, 0.22) * smooth(sL, sL + 0.1, x);
    if (b.hump > 0) y += b.hump * 0.2 * this.D * bump(x, sL + 0.55 * Math.max(0.06, b.headLength - sL), 0.1);
    return y;
  }

  /** Ventral outline at x (negative). */
  bot(x: number): number {
    const b = this.body;
    if (b.kind === 'ray') return -Math.max(this.D * 0.4 * Math.pow(this.rayDisc(x), 0.6), this.rayTail(x) * 0.8, x < 0.02 ? 0 : 0.002);
    const sL = this.head.snoutLen ?? Math.max(0, b.snoutLength);
    const yTip = this.head.yTip ?? 0;
    let y: number;
    if (x <= sL && sL > 0) {
      const t = x / sL;
      const r = this.tubeB * (this.body.snout === 'elongate' ? Math.min(1, 0.25 + 0.75 * t) : headEase(Math.min(1, t * 6), 2, 0.8));
      y = yTip - r;
    } else if (x < this.xB) {
      const u = (this.xB - x) / (this.xB - sL);
      const base = yTip - this.tubeB;
      y = base + (-this.Bmax - base) * quadrant(u, sL > 0 ? 1.5 : this.pThroat);
    } else {
      const t = (x - this.xB) / (this.xEnd - this.xB);
      y = -smax(this.Bmax * quadrant(t, this.pTail * 0.95), this.pedBand(x), this.pedHalf * 0.6);
    }
    // Lower jaw extension (halfbeaks) is separate geometry; keep the outline clean here.
    return y;
  }

  /** Half width at x. */
  halfWidth(x: number): number {
    const b = this.body;
    if (b.kind === 'ray') return Math.max(0.5 * b.width * this.rayDisc(x), this.rayTail(x), 0.0005);
    const sL = this.head.snoutLen ?? 0;
    const Wm = 0.5 * b.width;
    const xw = clamp(Math.max(b.widthPos, sL + 0.08), 0.12, 0.6);
    let w: number;
    if (x <= sL && sL > 0) {
      const t = x / sL;
      w = this.tubeW * (this.body.snout === 'elongate' ? Math.min(1, 0.25 + 0.75 * t) : headEase(Math.min(1, t * 6), 2, 0.8));
    } else if (x < xw) {
      const t = (x - sL) / (xw - sL);
      const base = this.tubeW;
      const tipBoost = this.tipW * Wm;
      w = base + (Wm - base) * headEase(t, 1.6 + this.round, sL > 0 ? 0.1 : 0.4 + this.round * 0.6);
      // Blunt snouts are wide right at the front.
      w = Math.max(w, Math.min(Wm, tipBoost * headEase(t * 4, 2, 0.9)));
    } else {
      const t = clamp((x - xw) / (1 - xw), 0, 1);
      const ped = 0.3 * (1 - 0.5 * clamp(b.tailTaper, 0, 1));
      const e = 0.5 + 0.5 * Math.cos(Math.PI * Math.pow(t, 0.9));
      w = Wm * (ped + (1 - ped) * e);
    }
    // Never wider than reasonable for a very deep but thin fish near the tail.
    return Math.max(0.0005, w);
  }

  /** Height of the widest line at x. */
  widthLine(x: number): number {
    const T = this.top(x), B = this.bot(x);
    return (T + B) / 2 + this.wcFrac * (T - B) / 2;
  }

  /**
   * Point on the cross-section ring at x for ring angle `ang` (0 = dorsal midline, π/2 = right
   * flank, π = belly). Returns [y, z] (not centered).
   */
  ringPoint(x: number, ang: number, out: [number, number] = [0, 0]): [number, number] {
    const T = this.top(x), B = this.bot(x);
    const wc = (T + B) / 2 + this.wcFrac * (T - B) / 2;
    const hw = this.halfWidth(x);
    const c = Math.cos(ang), s = Math.sin(ang);
    if (c >= 0) {
      const e = 2 / this.nTop;
      out[0] = wc + (T - wc) * Math.pow(c, e);
      out[1] = hw * Math.sign(s) * Math.pow(Math.abs(s), e);
    } else {
      const e = 2 / this.nBot;
      out[0] = wc - (wc - B) * Math.pow(-c, e);
      out[1] = hw * Math.sign(s) * Math.pow(Math.abs(s), e);
    }
    return out;
  }

  /** Surface |z| at height y on the cross-section at x. */
  surfaceZ(x: number, y: number): number {
    const T = this.top(x), B = this.bot(x);
    const wc = (T + B) / 2 + this.wcFrac * (T - B) / 2;
    const hw = this.halfWidth(x);
    if (y >= wc) {
      const v = clamp((y - wc) / Math.max(1e-5, T - wc), 0, 1);
      return hw * Math.pow(1 - Math.pow(v, this.nTop), 1 / this.nTop);
    }
    const v = clamp((wc - y) / Math.max(1e-5, wc - B), 0, 1);
    return hw * Math.pow(1 - Math.pow(v, this.nBot), 1 / this.nBot);
  }

  /** Approximate outward surface normal of the body at (x, y, z) via finite differences. */
  sectionNormal(x: number, y: number, z: number): [number, number, number] {
    const h = 0.004;
    const zx = (this.surfaceZ(x + h, y) - this.surfaceZ(x - h, y)) / (2 * h);
    const zy = (this.surfaceZ(x, y + h) - this.surfaceZ(x, y - h)) / (2 * h);
    // Surface z = f(x, y): normal ∝ (−fx, −fy, 1).
    const nx = -zx, ny = -zy, nz = 1;
    const l = Math.hypot(nx, ny, nz);
    void z;
    return [nx / l, ny / l, nz / l];
  }

  /** Projected pattern-y (−1 belly … +1 back) of height y at x (side-photo mapping). */
  patternY(x: number, y: number): number {
    const T = this.top(x), B = this.bot(x);
    const mid = (T + B) / 2, half = Math.max(1e-5, (T - B) / 2);
    return clamp((y - mid) / half, -1, 1);
  }

  /** Inverse of `patternY`: body height for a pattern y at x. */
  heightForPatternY(x: number, py: number): number {
    const T = this.top(x), B = this.bot(x);
    return (T + B) / 2 + (py * (T - B)) / 2;
  }

  /**
   * Physical half-height of the texture's y range at x (for round spots): the projected depth for
   * normal fish, the half arc over the back for flat ones (rays, plecos).
   */
  textureHalfHeight(x: number): number {
    const flat = clamp((this.body.width / Math.max(0.03, this.body.depth) - 0.7) / 0.8, 0, 1);
    const hd = this.halfDepth(x);
    return hd * (1 - flat) + (this.halfWidth(x) * 1.2 + hd) * flat;
  }

  /** Half the visible depth at x (for aspect-correct texture painting). */
  halfDepth(x: number): number {
    return Math.max(1e-4, (this.top(x) - this.bot(x)) / 2);
  }
}
