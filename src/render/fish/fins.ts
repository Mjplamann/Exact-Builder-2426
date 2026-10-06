import type { CaudalShape, FinShape } from '../../core/types';
import type { FinDef, ResolvedBody } from './archetypes';
import { ATLAS, cellUV, type Cell } from './atlas';
import { GeoBuilder, PART } from './geometryBuilder';
import type { BodyProfile } from './profile';

/**
 * Fin outlines for every FinShape / CaudalShape and the mesh builders for median fins (dorsal,
 * second dorsal, anal, adipose), paired fins (pectoral, pelvic) and the caudal fin.
 *
 * Fins are thin double-sided sheets. Their texture coordinates follow the pattern DSL for fins
 * (x 0 base → 1 tip, y −1 … 1 across); per-vertex `aFin` = (w, across, side·4 + flow, dist) feeds
 * the flutter / trailing animation in the vertex shader.
 *
 * Geometry is built in SL coordinates: x toward the tail, y up, z toward the fish's left.
 */

const clamp = (v: number, lo: number, hi: number) => (v < lo ? lo : v > hi ? hi : v);
const smooth = (e0: number, e1: number, x: number) => {
  const t = clamp((x - e0) / (e1 - e0), 0, 1);
  return t * t * (3 - 2 * t);
};

/** Pack side (−1, 0, 1) and flow (0..1) into one float (decoded in the shader). */
export const packSideFlow = (side: number, flow: number) => side * 4 + clamp(flow, 0, 0.99);

/** How much a fin of this shape trails and billows (0 stiff … 1 very flowing). */
export function finFlow(shape: FinShape, trail = 0): number {
  const base: Record<FinShape, number> = {
    rounded: 0.18, pointed: 0.16, falcate: 0.22, sail: 0.25, flowing: 0.8, filament: 0.7, spiny: 0.1, low: 0.2, fan: 0.25,
  };
  return clamp(base[shape] + trail * 0.4, 0, 0.95);
}

export function caudalFlow(shape: CaudalShape, size: number): number {
  switch (shape) {
    case 'veil': case 'round-flowing': return 0.9;
    case 'halfmoon': case 'delta': case 'crowntail': case 'double': return 0.75;
    case 'fan': case 'spade': return size > 0.6 ? 0.6 : 0.35;
    case 'lyre': return 0.45;
    case 'sword': return 0.3;
    case 'continuous': return 0.3;
    default: return 0.2;
  }
}

// ---------------------------------------------------------------------------------------------
// Median fins
// ---------------------------------------------------------------------------------------------

/** Ray rake (rad from vertical, toward the tail) and length at base fraction u. */
function medianRay(shape: FinShape, u: number, H: number, trail: number, out: [number, number]): void {
  let rake: number, len: number;
  switch (shape) {
    case 'pointed':
      rake = 0.5 + 0.5 * u;
      len = H * (1 - 0.8 * Math.pow(u, 0.85));
      break;
    case 'falcate':
      rake = 0.78 + 0.5 * u;
      len = H * (1 - 0.9 * Math.pow(u, 0.5)) + 0.04 * H;
      break;
    case 'sail':
      rake = 0.32 + 0.4 * u;
      len = H * (0.72 + 0.28 * Math.sin(Math.PI * (0.12 + 0.8 * u))) * (1 - 0.15 * u);
      break;
    case 'flowing':
      rake = 0.62 + 0.62 * u;
      len = H * (0.7 + 0.35 * u) + trail * Math.pow(u, 1.5);
      break;
    case 'filament': {
      rake = 0.5 + 0.5 * u;
      const fil = Math.exp(-u * 12);
      len = (H + trail) * fil + 0.3 * H * (1 - u) * (1 - fil);
      break;
    }
    case 'spiny':
      rake = 0.42 + 0.3 * u;
      len = H * (0.72 + 0.28 * Math.sin(Math.PI * (0.1 + 0.85 * u))) * (0.55 + 0.45 * smooth(0, 0.12, u));
      break;
    case 'low':
      rake = 0.72 + 0.2 * u;
      len = H * (0.85 + 0.15 * Math.sin(Math.PI * u));
      break;
    case 'fan':
      rake = -0.2 + 1.5 * u;
      len = H;
      break;
    case 'rounded':
    default:
      rake = 0.55 + 0.45 * u;
      len = H * (0.62 + 0.38 * Math.sin(Math.PI * (0.15 + 0.7 * u))) * (1 - 0.35 * u * u);
      break;
  }
  // Trailing extension for any fin with a `trail` (flowing rear rays).
  if (shape !== 'flowing' && shape !== 'filament' && trail > 0) len += trail * Math.pow(u, 2);
  out[0] = rake;
  out[1] = Math.max(len, 0.004);
}

export interface FinBuildOpts {
  nu: number;
  nw: number;
}

/**
 * Dorsal / second dorsal / anal / adipose fin attached along the dorsal or ventral outline.
 * `twin` builds a pair of splayed sheets (fancy-goldfish paired anal fins).
 */
export function buildMedianFin(
  gb: GeoBuilder,
  prof: BodyProfile,
  fin: FinDef,
  part: number,
  cell: Cell,
  ventral: boolean,
  opts: FinBuildOpts,
  extra: { rake?: number; flow?: number; twin?: boolean; adipose?: boolean } = {},
): void {
  const sheets = extra.twin ? [-1, 1] : [0];
  const flow = extra.flow ?? finFlow(fin.shape, fin.trail);
  const ray: [number, number] = [0, 0];
  for (const sheet of sheets) {
    const idx0 = gb.idx.length, v0 = gb.vertexCount;
    const nu = opts.nu, nw = opts.nw;
    const base = new Float64Array((nu + 1) * 2);
    for (let i = 0; i <= nu; i++) {
      const u = i / nu;
      const x = fin.start + (fin.end - fin.start) * u;
      const y = ventral ? prof.bot(x) + 0.003 : prof.top(x) - 0.003;
      base[i * 2] = x;
      base[i * 2 + 1] = y;
    }
    for (let i = 0; i <= nu; i++) {
      const u = i / nu;
      medianRay(extra.adipose ? 'rounded' : fin.shape, u, fin.height, fin.trail, ray);
      let rake = ray[0] + (extra.rake ?? 0);
      const len = ray[1];
      // Flowing fins: rays curve back progressively (soft rays bend under their own drag).
      const curve = fin.shape === 'flowing' ? 0.55 : fin.shape === 'filament' ? 0.35 : 0.12;
      if (extra.adipose) rake = 0.9 + 0.5 * u;
      const bx = base[i * 2], by = base[i * 2 + 1];
      for (let j = 0; j <= nw; j++) {
        const w = j / nw;
        // Integrate along a gently curving ray (2-point midpoint is enough).
        const a = rake + curve * w;
        const r = len * w;
        const x = bx + Math.sin(rake + curve * w * 0.5) * r;
        const yOff = Math.cos(rake + curve * w * 0.5) * r;
        const y = ventral ? by - yOff : by + yOff;
        // Twin anal fins splay apart toward their tips.
        const z = sheet === 0 ? 0 : sheet * (0.004 + yOff * 0.55);
        void a;
        const [uu, vv] = cellUV(cell, w, u * 2 - 1);
        gb.v(x, y, z, uu, vv, x, part, 0, 0, w, u * 2 - 1, packSideFlow(sheet, flow), r);
      }
    }
    for (let i = 0; i < nu; i++) {
      for (let j = 0; j < nw; j++) {
        const a = v0 + i * (nw + 1) + j;
        const b = a + nw + 1;
        gb.quad(a, b, b + 1, a + 1);
      }
    }
    gb.smoothNormals(idx0, v0);
  }
}

// ---------------------------------------------------------------------------------------------
// Caudal fin
// ---------------------------------------------------------------------------------------------

/** Web (membrane) length used for total-length normalisation and the shape's main extents. */
export function caudalWebLength(shape: CaudalShape, S: number): number {
  switch (shape) {
    case 'none': return 0;
    case 'lyre': return Math.min(0.45, 0.55 * S + 0.08);
    case 'sword': return Math.min(0.34, 0.4 * S + 0.05);
    case 'halfmoon': return 0.55 * S;
    case 'crowntail': return 0.55 * S;
    case 'delta': return 0.68 * S;
    case 'fan': return 0.65 * S;
    case 'round-flowing': return 0.65 * S;
    case 'spade': return 0.75 * S;
    case 'double': return 0.72 * S;
    case 'veil': return 0.95 * S;
    case 'rounded': return 0.85 * S;
    case 'truncate': return 0.85 * S;
    default: return S;
  }
}

/** Ray angle (rad from the body axis, + up) and length for ray u (0 bottom … 1 top). */
function caudalRay(shape: CaudalShape, u: number, S: number, out: [number, number]): void {
  const v = u * 2 - 1, av = Math.abs(v);
  let b: number, len: number;
  switch (shape) {
    case 'deeply-forked':
      b = 0.5 * v;
      len = S * (0.25 + 0.75 * Math.pow(av, 1.2)) * (1 - 0.55 * smooth(0.88, 1, av));
      break;
    case 'emarginate':
      b = 0.48 * v;
      len = S * (0.82 + 0.18 * Math.pow(av, 1.5)) * (1 - 0.35 * smooth(0.88, 1, av));
      break;
    case 'truncate':
      b = 0.45 * v;
      len = ((0.85 * S) / Math.cos(b)) * (1 - 0.25 * smooth(0.9, 1, av));
      break;
    case 'rounded':
      b = 0.62 * v;
      len = 0.85 * S * (1 - 0.14 * av * av);
      break;
    case 'pointed':
      b = 0.5 * v;
      len = S * (1 - 0.6 * Math.pow(av, 1.4));
      break;
    case 'lunate':
      b = 0.72 * v * (1 + 0.1 * av);
      len = S * (0.35 + 0.65 * Math.pow(av, 2.2)) * (1 - 0.45 * smooth(0.92, 1, av));
      break;
    case 'lyre': {
      const web = caudalWebLength('lyre', S);
      b = 0.5 * v;
      len = web * (0.55 + 0.45 * Math.pow(av, 1.4)) * (1 - 0.3 * smooth(0.9, 1, av));
      const ext = Math.max(0, S - web * 0.8) * smooth(0.86, 0.985, av);
      if (ext > 0) {
        len += ext;
        b = 0.5 * v - 0.08 * Math.sign(v) * smooth(0.86, 0.985, av);
      }
      break;
    }
    case 'sword': {
      const web = caudalWebLength('sword', S);
      b = 0.45 * v;
      len = ((0.85 * web) / Math.cos(b)) * (1 - 0.15 * smooth(0.9, 1, av));
      if (u < 0.2) {
        const t = 1 - u / 0.2;
        len += Math.max(0, S - web) * Math.pow(t, 0.55);
        b = b * (1 - t) + (-0.12 - 0.06 * t) * t;
      }
      break;
    }
    case 'veil':
      b = 0.6 * v - 0.22;
      len = 0.95 * S * (1 + 0.22 * (1 - u)) * (0.85 + 0.15 * Math.cos((av * Math.PI) / 2));
      break;
    case 'delta':
      b = 0.78 * v;
      len = ((0.68 * S) / Math.cos(b)) * (1 - 0.08 * av * av);
      break;
    case 'halfmoon':
      b = 1.45 * v;
      len = 0.55 * S * (1 - 0.06 * av * av);
      break;
    case 'crowntail':
      b = 1.1 * v;
      len = 0.55 * S;
      break;
    case 'double':
      b = 0.6 * v;
      len = 0.72 * S * (0.78 + 0.22 * av) * (1 - 0.3 * smooth(0.9, 1, av));
      break;
    case 'fan':
      b = 0.95 * v;
      len = 0.65 * S * (1 - 0.08 * av * av);
      break;
    case 'spade':
      b = 0.7 * v;
      len = 0.75 * S * (1 - 0.45 * Math.pow(av, 1.2));
      break;
    case 'round-flowing':
      b = 1.0 * v - 0.12;
      len = 0.65 * S * (1 - 0.1 * av * av);
      break;
    case 'continuous':
      b = 0.95 * v;
      len = S * (1 - 0.45 * av * av);
      break;
    case 'forked':
    default:
      b = 0.55 * v;
      len = S * (0.5 + 0.5 * Math.pow(av, 1.3)) * (1 - 0.55 * smooth(0.9, 1, av));
      break;
  }
  out[0] = b;
  out[1] = Math.max(0.004, len);
}

/** Droop (sag of long soft fins) per shape. */
function caudalDroop(shape: CaudalShape): number {
  switch (shape) {
    case 'veil': return 0.35;
    case 'round-flowing': return 0.2;
    case 'double': return 0.15;
    case 'delta': case 'halfmoon': case 'crowntail': return 0.08;
    default: return 0;
  }
}

export function buildCaudalFin(gb: GeoBuilder, prof: BodyProfile, body: ResolvedBody, opts: FinBuildOpts): void {
  const shape = body.caudal.shape;
  if (shape === 'none') return;
  const S = Math.max(0.02, body.caudal.size);
  const x0 = 0.985;
  const T = prof.top(1), B = prof.bot(1);
  const yc = (T + B) / 2;
  const hb = Math.max(0.006, ((T - B) / 2) * (shape === 'continuous' ? 0.9 : 1.05));
  const flow = caudalFlow(shape, S);
  const droop = caudalDroop(shape);
  // Extra rays near the lobe edges so lyre filaments and lobe tips stay crisp.
  const nu = opts.nu + (shape === 'lyre' || shape === 'sword' ? 6 : 0);
  const nw = opts.nw;
  const uOf = (i: number) => {
    const t = i / nu;
    // Slightly denser at both edges.
    return t - 0.06 * Math.sin(2 * Math.PI * t);
  };
  const sheets = shape === 'double' ? [-1, 1] : [0];
  const ray: [number, number] = [0, 0];
  for (const sheet of sheets) {
    const idx0 = gb.idx.length, v0 = gb.vertexCount;
    for (let i = 0; i <= nu; i++) {
      const u = uOf(i);
      caudalRay(shape, u, S, ray);
      const b = ray[0], len = ray[1];
      const bx = x0, by = yc + (u * 2 - 1) * hb;
      for (let j = 0; j <= nw; j++) {
        const w = j / nw;
        const r = len * w;
        const x = bx + Math.cos(b) * r;
        let y = by + Math.sin(b) * r;
        const p = x - x0;
        y -= droop * p * p;
        // Twin tails (fancy goldfish): joined along the top edge, splayed apart below.
        const z = sheet === 0 ? 0 : sheet * Math.max(0, (by + hb * 0.9 - y)) * 0.6 * (0.3 + 0.7 * w);
        const [uu, vv] = cellUV(ATLAS.caudal, w, u * 2 - 1);
        gb.v(x, y, z, uu, vv, x, PART.caudal, 0, 0, w, u * 2 - 1, packSideFlow(sheet, flow), r);
      }
    }
    for (let i = 0; i < nu; i++) {
      for (let j = 0; j < nw; j++) {
        const a = v0 + i * (nw + 1) + j;
        const c = a + nw + 1;
        gb.quad(a, c, c + 1, a + 1);
      }
    }
    gb.smoothNormals(idx0, v0);
  }
}

// ---------------------------------------------------------------------------------------------
// Paired fins
// ---------------------------------------------------------------------------------------------

/** Ray angle (rad, + toward the leading edge) and length for paired-fin ray u. */
function pairedRay(shape: FinShape, u: number, H: number, trail: number, out: [number, number]): void {
  let b: number, len: number;
  switch (shape) {
    case 'pointed':
      b = -0.35 + 0.5 * u;
      len = H * (0.35 + 0.65 * Math.pow(u, 1.2));
      break;
    case 'falcate':
      b = -0.3 + 0.4 * u;
      len = H * (0.25 + 0.75 * u * u);
      break;
    case 'fan':
      b = -0.85 + 1.6 * u;
      len = H * (0.82 + 0.18 * Math.sin(Math.PI * u));
      break;
    case 'filament': {
      b = -0.05 + 0.1 * u;
      len = (H + trail) * (0.25 + 0.75 * smooth(0.3, 1, u));
      break;
    }
    case 'flowing':
      b = -0.5 + 0.6 * u;
      len = H * (0.7 + 0.3 * Math.sin(Math.PI * (0.2 + 0.7 * u))) + trail * u;
      break;
    case 'sail':
    case 'spiny':
    case 'low':
    case 'rounded':
    default:
      b = -0.55 + 0.8 * u;
      len = H * (0.6 + 0.4 * Math.sin(Math.PI * (0.25 + 0.6 * u)));
      break;
  }
  out[0] = b;
  out[1] = Math.max(0.003, len);
}

/**
 * Pectoral or pelvic fin pair. Built flat in fin space (p back along the fin, q across), then
 * rotated into place on each flank.
 */
export function buildPairedFins(
  gb: GeoBuilder,
  prof: BodyProfile,
  body: ResolvedBody,
  fin: FinDef,
  kind: 'pectoral' | 'pelvic',
  opts: FinBuildOpts,
): void {
  const part = kind === 'pectoral' ? PART.pectoral : PART.pelvic;
  const cell = kind === 'pectoral' ? ATLAS.pectoral : ATLAS.pelvic;
  const H = Math.max(0.01, fin.height);
  const flow = finFlow(fin.shape, fin.trail);
  const xb = (fin.start + fin.end) / 2;
  const T = prof.top(xb), B = prof.bot(xb);
  let by: number, bz: number;
  const filament = fin.shape === 'filament';
  const baseLen = filament ? Math.max(0.006, H * 0.06) : clamp(Math.max(fin.end - fin.start, 0.18 * H), 0.012, 0.25);
  // Orientation (radians).
  let abduct: number, tilt: number, droop: number;
  if (kind === 'pectoral') {
    by = B + clamp(body.pectoralHeight, 0.05, 0.9) * (T - B);
    bz = prof.surfaceZ(xb, by) * 0.92;
    abduct = 0.3 + 0.35 * body.pectoralAngle;
    tilt = body.pectoralAngle * 1.35;
    droop = 0.18 - 0.1 * body.pectoralAngle;
  } else {
    by = B + 0.004;
    bz = Math.max(0.002, prof.halfWidth(xb) * (0.25 + 0.35 * body.pelvicSpread));
    abduct = 0.1 + 0.25 * body.pelvicSpread;
    tilt = 0.25 + body.pelvicSpread * 1.1;
    droop = filament ? 0.55 : 0.6 - 0.35 * body.pelvicSpread;
  }
  const nu = Math.max(4, Math.round(opts.nu * (filament ? 0.4 : 0.7)));
  const nw = opts.nw;
  const ray: [number, number] = [0, 0];
  for (const side of [1, -1]) {
    const idx0 = gb.idx.length, v0 = gb.vertexCount;
    for (let i = 0; i <= nu; i++) {
      const u = i / nu;
      pairedRay(fin.shape, u, H, fin.trail, ray);
      const b = ray[0], len = ray[1];
      // Base runs along q (vertical in fin space) — leading edge on top for pectorals.
      const q0 = (u - 0.5) * baseLen;
      for (let j = 0; j <= nw; j++) {
        const w = j / nw;
        const r = len * w;
        // Fin space: p back, q up, n out (+ = away from the body).
        let p = Math.cos(b) * r;
        let q = q0 + Math.sin(b) * r;
        let n = 0;
        // Filaments sag a little with distance.
        if (filament) q -= 0.15 * p * p / Math.max(0.05, H);
        // Droop (rotate down about the out axis): p,q.
        const cd = Math.cos(droop), sd = Math.sin(droop);
        [p, q] = [p * cd + q * sd, -p * sd + q * cd];
        // Tilt: roll about the fin's length axis so the blade lies flatter (q into n).
        const ct = Math.cos(tilt), st = Math.sin(tilt);
        [q, n] = [q * ct - n * st, q * st + n * ct];
        // Abduct: swing the fin out from the flank around the vertical (p into n).
        const ca = Math.cos(abduct), sa = Math.sin(abduct);
        [p, n] = [p * ca - n * sa, n * ca + p * sa];
        const x = xb + p;
        const y = by + q;
        const z = side * (bz + n);
        const [uu, vv] = cellUV(cell, w, u * 2 - 1);
        gb.v(x, y, z, uu, vv, xb, part, 0, 0, w, u * 2 - 1, packSideFlow(side, flow), r);
      }
    }
    for (let i = 0; i < nu; i++) {
      for (let j = 0; j < nw; j++) {
        const a = v0 + i * (nw + 1) + j;
        const c = a + nw + 1;
        if (side > 0) gb.quad(a, c, c + 1, a + 1);
        else gb.quad(a, a + 1, c + 1, c);
      }
    }
    gb.smoothNormals(idx0, v0);
  }
}

/** Number of fin rays to paint for a fin of base length `baseLen` (SL units). */
export function rayCount(kind: 'dorsal' | 'anal' | 'caudal' | 'pectoral' | 'pelvic' | 'dorsal2', fin: FinDef | null, body: ResolvedBody): number {
  const k = body.finRays;
  switch (kind) {
    case 'caudal': return Math.round(clamp(18 * k, 8, 40));
    case 'pectoral': return Math.round(clamp(12 * k, 6, 24));
    case 'pelvic': return Math.round(clamp(6 * k, 3, 12));
    default: {
      const base = fin ? fin.end - fin.start : 0.15;
      return Math.round(clamp((6 + base * 40) * k, 4, 60));
    }
  }
}
