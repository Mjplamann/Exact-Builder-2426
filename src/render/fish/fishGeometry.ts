import type { BufferGeometry } from 'three';
import type { ResolvedBody } from './archetypes';
import { ATLAS, bodyUV, cellUV } from './atlas';
import { buildCaudalFin, buildMedianFin, buildPairedFins, caudalWebLength, finEnvelope, packSideFlow } from './fins';
import { GeoBuilder, PART } from './geometryBuilder';
import { BodyProfile } from './profile';

/**
 * Procedural fish mesh: a lofted body (superellipse rings along the dorsal/ventral/width
 * outlines, with a real snout, mouth, gill cover and eye sockets), separate eye geometry, barbels
 * and special features (cowfish horns, sucker disc, halfbeak jaw, cirri), plus the translucent fin
 * sheets as a second geometry.
 *
 * Output space ("local"): total length (snout → caudal tip) = 1, origin at the middle of the
 * total length and of the body depth, +X = forward (snout), +Y = dorsal, +Z = the fish's right.
 */

export interface FishLod {
  rings: number;
  radial: number;
  finU: number;
  finW: number;
  eyeLat: number;
  eyeLon: number;
}

/** Level of detail from the adult size (tiny fish never get big on screen). */
export function lodFor(adultLengthCm: number, elongated: boolean, quality: 'thumb' | 'tank' = 'tank'): FishLod {
  const L = adultLengthCm;
  let lod: FishLod;
  if (quality === 'thumb') lod = { rings: 40, radial: 22, finU: 12, finW: 6, eyeLat: 8, eyeLon: 14 };
  else if (L < 3) lod = { rings: 26, radial: 14, finU: 8, finW: 4, eyeLat: 5, eyeLon: 8 };
  else if (L < 7) lod = { rings: 34, radial: 18, finU: 10, finW: 5, eyeLat: 6, eyeLon: 10 };
  else if (L < 18) lod = { rings: 42, radial: 22, finU: 12, finW: 6, eyeLat: 7, eyeLon: 12 };
  else lod = { rings: 52, radial: 26, finU: 14, finW: 7, eyeLat: 8, eyeLon: 14 };
  if (elongated) lod.rings = Math.round(lod.rings * 1.7);
  return lod;
}

export interface FishGeometryInfo {
  /** SL length in local units (TL = 1). */
  slLocal: number;
  /** Local x of the snout tip. */
  xSnout: number;
  /** Caudal web length in SL units. */
  caudalLen: number;
  /** Bounding half-extents (local) for picking. */
  half: [number, number, number];
  /** Fish & seahorse only (drives the texture painter's anatomy). */
  profile?: BodyProfile;
}

export interface FishGeometry {
  body: BufferGeometry;
  fins: BufferGeometry;
  info: FishGeometryInfo;
}

const clamp = (v: number, lo: number, hi: number) => (v < lo ? lo : v > hi ? hi : v);
const smooth = (e0: number, e1: number, x: number) => {
  const t = clamp((x - e0) / (e1 - e0), 0, 1);
  return t * t * (3 - 2 * t);
};

/** Ring x positions: dense at the snout (head detail) and at the caudal base. */
function ringXs(n: number, xEnd: number): number[] {
  const xs: number[] = [];
  for (let i = 1; i <= n; i++) {
    const u = i / (n + 1);
    // Blend of a cosine (dense at both ends) and a head-weighted power curve.
    const c = 0.5 - 0.5 * Math.cos(Math.PI * u);
    const h = Math.pow(u, 1.35);
    xs.push((0.55 * c + 0.45 * h) * xEnd);
  }
  return xs;
}

function buildBody(gb: GeoBuilder, prof: BodyProfile, body: ResolvedBody, lod: FishLod): void {
  const idx0 = gb.idx.length, v0 = gb.vertexCount;
  const H = prof.head;
  const nr = lod.radial + (lod.radial % 2);
  const half = nr / 2;
  const xEnd = 1.0;
  const xs = ringXs(lod.rings, xEnd);
  const flat = clamp((body.width / Math.max(0.03, body.depth) - 0.7) / 0.8, 0, 1);
  const uv: [number, number] = [0, 0];
  const yz: [number, number] = [0, 0];

  // Per-ring arc-length parametrisation (for flat-bodied fish the texture follows the surface).
  const arcY = new Float64Array(nr + 1);
  const ringY = new Float64Array(nr + 1), ringZ = new Float64Array(nr + 1);
  // Each ring stores nr + 2 vertices: the left flank k = 0…half (dorsal → ventral midline) and the
  // right flank k = half+1…nr+1 (ventral → dorsal), so the dorsal / ventral midline vertices exist
  // once per flank. Knife-edged (lens) sections keep separate normals there — a crease where the
  // fins attach instead of a rounded, light-catching rim; rounder sections are re-smoothed below.
  const per = nr + 2;
  const jOf = (k: number) => (k <= half ? k : k - 1);

  // Snout tip pole.
  const tipY = prof.top(0);
  const tip = gb.v(0, tipY, 0, ...bodyUV(0, 0, uv), 0, PART.body, jawWeight(0, tipY), 0, 0);

  const ringStart: number[] = [];
  for (const x of xs) {
    // Ring geometry.
    let arc = 0;
    for (let j = 0; j <= nr; j++) {
      const ang = (j / nr) * Math.PI * 2;
      prof.ringPoint(x, ang, yz);
      ringY[j] = yz[0];
      ringZ[j] = j === 0 || j === nr || j === half ? 0 : yz[1];
    }
    // Arc length from the top midline down the left (j ∈ [0, nr/2]).
    const cum = new Float64Array(half + 1);
    for (let j = 1; j <= half; j++) {
      arc += Math.hypot(ringY[j] - ringY[j - 1], ringZ[j] - ringZ[j - 1]);
      cum[j] = arc;
    }
    for (let j = 0; j <= nr; j++) {
      const jj = j <= half ? j : nr - j;
      arcY[j] = 1 - (2 * cum[jj]) / Math.max(1e-6, arc);
    }
    ringStart.push(gb.vertexCount);
    for (let k = 0; k < per; k++) {
      const j = jOf(k);
      const y = ringY[j], z = ringZ[j];
      const py = prof.patternY(x, y);
      const ty = py + (arcY[j] - py) * flat;
      bodyUV(x, ty, uv);
      gb.v(x, y, z, uv[0], uv[1], x, PART.body, jawWeight(x, y), gillWeight(x, y), ty, 0, 0, 0);
    }
  }
  // Rear pole slightly behind the caudal base (inside the fin root).
  const lastX = xs[xs.length - 1];
  const endX = lastX + (xEnd - lastX) * 1.2 + 0.004;
  const endY = (prof.top(1) + prof.bot(1)) / 2;
  const end = gb.v(endX, endY, 0, ...bodyUV(1, 0, uv), endX, PART.body, 0, 0, 0);

  // Triangles. Ring winding: k increases from the top over the left flank (+z) to the belly and
  // back up the right flank; the two midline seams (k = half|half+1, k = nr+1|0) are not bridged.
  const seam = (k: number) => k === half || k === nr + 1;
  for (let k = 0; k < per; k++) {
    if (seam(k)) continue;
    gb.tri(tip, ringStart[0] + k + 1, ringStart[0] + k);
  }
  for (let r = 0; r < xs.length - 1; r++) {
    for (let k = 0; k < per; k++) {
      if (seam(k)) continue;
      const a = ringStart[r] + k, b = ringStart[r] + k + 1;
      const c = ringStart[r + 1] + k, d = ringStart[r + 1] + k + 1;
      gb.quad(a, b, d, c);
    }
  }
  const lr = ringStart[xs.length - 1];
  for (let k = 0; k < per; k++) {
    if (seam(k)) continue;
    gb.tri(lr + k, lr + k + 1, end);
  }
  gb.smoothNormals(idx0, v0);
  // Rounded midlines: average the two flanks' normals (smooth back / belly).
  const nor = gb.nor;
  const weld = (a: number, b: number) => {
    let nx = nor[a * 3] + nor[b * 3], ny = nor[a * 3 + 1] + nor[b * 3 + 1], nz = nor[a * 3 + 2] + nor[b * 3 + 2];
    const l = Math.hypot(nx, ny, nz) || 1;
    nx /= l;
    ny /= l;
    nz /= l;
    nor[a * 3] = nor[b * 3] = nx;
    nor[a * 3 + 1] = nor[b * 3 + 1] = ny;
    nor[a * 3 + 2] = nor[b * 3 + 2] = nz;
  };
  for (const rs of ringStart) {
    if (!prof.creaseTop) weld(rs, rs + nr + 1);
    if (!prof.creaseBot) weld(rs + half, rs + half + 1);
  }

  function jawWeight(x: number, y: number): number {
    if (body.mouth === 'inferior' || body.mouth === 'sucker') return 0;
    const sL = H.snoutLen;
    const xr = H.rictusX;
    if (x > xr) return 0;
    const t = clamp((x - sL * 0.85) / Math.max(1e-4, xr - sL * 0.85), 0, 1);
    const gapeY = H.yTip - H.gapeDrop * t;
    const depthHere = Math.max(0.004, prof.top(x) - prof.bot(x));
    const below = smooth(gapeY - 0.04 * depthHere, gapeY - 0.16 * depthHere, y);
    const above = smooth(gapeY + 0.03 * depthHere, gapeY + 0.2 * depthHere, y);
    const along = Math.pow(1 - clamp((x - sL) / Math.max(1e-4, xr - sL), 0, 1), 0.7);
    return along * (below - 0.15 * above);
  }

  function gillWeight(x: number, y: number): number {
    const op = H.opercleX, hl = H.headLen;
    const wx = smooth(op - 0.45 * hl, op - 0.03, x) * (1 - smooth(op - 0.005, op + 0.02, x));
    if (wx <= 0) return 0;
    const T = prof.top(x), B = prof.bot(x);
    const v = (y - B) / Math.max(1e-4, T - B);
    return wx * smooth(0.05, 0.2, v) * (1 - smooth(0.62, 0.8, v));
  }
}

/** Eye ellipsoid with a domed cornea; UVs project the front onto the eye cell. */
function buildEyes(gb: GeoBuilder, prof: BodyProfile, lod: FishLod): void {
  const H = prof.head;
  const R = H.eyeR;
  const N = [H.eyeNx, H.eyeNy, H.eyeNz];
  // Tangent frame: T1 horizontal, T2 = N × T1.
  let t1 = [N[2], 0, -N[0]];
  const l1 = Math.hypot(t1[0], t1[1], t1[2]) || 1;
  t1 = [t1[0] / l1, t1[1] / l1, t1[2] / l1];
  const t2 = [N[1] * t1[2] - N[2] * t1[1], N[2] * t1[0] - N[0] * t1[2], N[0] * t1[1] - N[1] * t1[0]];
  // Fish eyes sit nearly flush in the socket; the clear cornea bulges over the lens.
  const cx = H.eyeX + N[0] * -0.22 * R, cy = H.eyeY + N[1] * -0.22 * R, cz = H.eyeZ + N[2] * -0.22 * R;
  const depthR = 0.58 * R;
  const nLat = lod.eyeLat, nLon = lod.eyeLon;
  const uv: [number, number] = [0, 0];
  for (const side of [1, -1]) {
    const v0 = gb.vertexCount;
    const sz = side; // left eye at +z (SL frame z = fish's left), right eye mirrored
    for (let i = 0; i <= nLat; i++) {
      const th = (i / nLat) * Math.PI;
      const st = Math.sin(th), ct = Math.cos(th);
      for (let j = 0; j <= nLon; j++) {
        const ph = (j / nLon) * Math.PI * 2;
        const a = Math.cos(ph) * st, b = Math.sin(ph) * st;
        const out = ct * depthR;
        let x = cx + N[0] * out + (t1[0] * a + t2[0] * b) * R;
        let y = cy + N[1] * out + (t1[1] * a + t2[1] * b) * R;
        let z = cz + N[2] * out + (t1[2] * a + t2[2] * b) * R;
        // Normal of the ellipsoid.
        let nx = N[0] * (ct / depthR) + (t1[0] * a + t2[0] * b) / R;
        let ny = N[1] * (ct / depthR) + (t1[1] * a + t2[1] * b) / R;
        let nz = N[2] * (ct / depthR) + (t1[2] * a + t2[2] * b) / R;
        const nl = Math.hypot(nx, ny, nz) || 1;
        nx /= nl;
        ny /= nl;
        nz /= nl;
        // Front hemisphere spans the whole eye disc; behind the equator stays on the rim.
        const rr = th < Math.PI / 2 ? st : 1;
        cellUV(ATLAS.eye, 0.5 + 0.5 * Math.cos(ph) * rr * (side > 0 ? 1 : -1), Math.sin(ph) * rr, uv);
        z *= sz;
        nz *= sz;
        x = x;
        y = y;
        gb.v(x, y, z, uv[0], uv[1], H.eyeX, PART.eye, 0, 0, cx, cy, cz * sz, R, nx, ny, nz);
      }
    }
    for (let i = 0; i < nLat; i++) {
      for (let j = 0; j < nLon; j++) {
        const a = v0 + i * (nLon + 1) + j;
        const b = a + nLon + 1;
        if (side > 0) gb.quad(a, b, b + 1, a + 1);
        else gb.quad(a, a + 1, b + 1, b);
      }
    }
  }
}

/** A thin tapered tube (barbel, cirrus, horn, lure). */
function tube(
  gb: GeoBuilder,
  ax: number, ay: number, az: number,
  dx: number, dy: number, dz: number,
  len: number, r0: number, r1: number,
  gravity: number, segs: number, sides: number,
  part: number, sAttach: number, uvx: number, uvy: number, flow: number,
): void {
  const v0 = gb.vertexCount;
  const dl = Math.hypot(dx, dy, dz) || 1;
  dx /= dl;
  dy /= dl;
  dz /= dl;
  const uv: [number, number] = [0, 0];
  bodyUV(uvx, uvy, uv);
  let px = ax, py = ay, pz = az;
  let tx = dx, ty = dy, tz = dz;
  for (let i = 0; i <= segs; i++) {
    const t = i / segs;
    if (i > 0) {
      const step = len / segs;
      // Bend toward gravity / backward sweep progressively.
      ty -= gravity * step * 4;
      const l = Math.hypot(tx, ty, tz) || 1;
      tx /= l;
      ty /= l;
      tz /= l;
      px += tx * step;
      py += ty * step;
      pz += tz * step;
    }
    // Frame around the tangent.
    let ux = -ty, uy = tx, uz = 0;
    if (Math.abs(tz) > 0.9) {
      ux = 0;
      uy = tz;
      uz = -ty;
    }
    let ul = Math.hypot(ux, uy, uz) || 1;
    ux /= ul;
    uy /= ul;
    uz /= ul;
    let wx = ty * uz - tz * uy, wy = tz * ux - tx * uz, wz = tx * uy - ty * ux;
    ul = Math.hypot(wx, wy, wz) || 1;
    wx /= ul;
    wy /= ul;
    wz /= ul;
    const r = r0 + (r1 - r0) * t;
    for (let j = 0; j < sides; j++) {
      const a = (j / sides) * Math.PI * 2;
      const ca = Math.cos(a), sa = Math.sin(a);
      const nx = ux * ca + wx * sa, ny = uy * ca + wy * sa, nz = uz * ca + wz * sa;
      gb.v(px + nx * r, py + ny * r, pz + nz * r, uv[0], uv[1], sAttach, part, 0, 0, t, 0, packSideFlow(az >= 0 ? 1 : -1, flow), len * t, nx, ny, nz);
    }
  }
  for (let i = 0; i < segs; i++) {
    for (let j = 0; j < sides; j++) {
      const a = v0 + i * sides + j, b = v0 + i * sides + ((j + 1) % sides);
      const c = a + sides, d = b + sides;
      gb.quad(a, b, d, c);
    }
  }
  // Cap the tip.
  const tip = gb.v(px + tx * r1, py + ty * r1, pz + tz * r1, uv[0], uv[1], sAttach, part, 0, 0, 1, 0, packSideFlow(az >= 0 ? 1 : -1, flow), len, tx, ty, tz);
  for (let j = 0; j < sides; j++) gb.tri(v0 + segs * sides + j, v0 + segs * sides + ((j + 1) % sides), tip);
}

function buildBarbels(gb: GeoBuilder, prof: BodyProfile, body: ResolvedBody): void {
  const n = Math.round(clamp(body.barbels, 0, 12));
  if (n <= 0 || body.barbelLength <= 0) return;
  const H = prof.head;
  const L = clamp(body.barbelLength, 0.01, 1.2);
  const D = body.depth;
  const r0 = clamp(0.006 + 0.012 * D, 0.004, 0.012) * (L > 0.3 ? 1.2 : 1);
  // Bristlenose-type snout tentacles (many short fleshy bristles on top of the snout).
  if (body.archetype === 'pleco' && n > 4) {
    for (let i = 0; i < n; i++) {
      const k = i / Math.max(1, n - 1);
      const side = i % 2 === 0 ? 1 : -1;
      const x = H.snoutLen + 0.02 + 0.12 * k;
      const y = prof.top(x) - 0.004;
      const z = side * prof.halfWidth(x) * (0.25 + 0.5 * ((i * 0.37) % 1));
      tube(gb, x, y, z, -0.4, 1, side * 0.5, L * (0.6 + 0.6 * ((i * 0.61) % 1)), r0 * 1.4, r0 * 0.6, 0.05, 4, 5, PART.barbel, x, x, 0.9, 0.3);
    }
    return;
  }
  if (n <= 0) return;
  const pairs = Math.ceil(n / 2);
  for (let p = 0; p < pairs; p++) {
    // Pair 0: maxillary (corner of the mouth), 1: mandibular (chin), 2+: rostral/nasal.
    const kind = p % 3;
    let x: number, y: number, dx: number, dy: number, dz: number, len: number;
    if (body.mouth === 'inferior' || body.mouth === 'sucker') {
      // Fleshy barbels hanging from the lips under the snout, feeling the substrate.
      x = H.snoutLen + 0.025 + 0.025 * p;
      y = prof.bot(x) + 0.006;
      dx = -0.45;
      dy = -0.9;
      dz = 0.35 + 0.25 * p;
      len = L * (1 - 0.2 * p);
    } else if (kind === 0) {
      x = Math.max(H.snoutLen + 0.01, H.rictusX - 0.01);
      y = H.yTip - H.gapeDrop;
      dx = L > 0.25 ? 0.25 : -0.6;
      dy = -0.25;
      dz = 0.7;
      len = L;
    } else if (kind === 1) {
      x = H.snoutLen + 0.03 + 0.02 * p;
      y = prof.bot(x) + 0.003;
      dx = -0.4;
      dy = -0.85;
      dz = 0.3;
      len = L * 0.55;
    } else {
      x = H.snoutLen + 0.01;
      y = H.yTip + 0.01;
      dx = -0.8;
      dy = 0.2;
      dz = 0.5;
      len = L * 0.4;
    }
    const gravity = len > 0.2 ? 0.25 : 0.08;
    for (const side of [1, -1]) {
      if (p * 2 + (side > 0 ? 0 : 1) >= n) break;
      const z = side * Math.max(0.002, prof.surfaceZ(x, y) * 0.8);
      tube(gb, x, y, z, dx, dy, dz * side, len, r0 * 1.25, r0 * 0.4, gravity + 0.1, len > 0.2 ? 8 : 5, 5, PART.barbel, x, x, -0.6, 0.6);
    }
  }
}

function buildExtras(gb: GeoBuilder, prof: BodyProfile, body: ResolvedBody): void {
  const H = prof.head;
  // Cowfish horns: a pair above the eyes pointing forward, a pair at the rear of the carapace.
  if (body.horns > 0) {
    // Long, tapering bony horns: a forward pair over the eyes and a backward pair at the rear
    // corners of the carapace floor.
    const k = body.horns;
    const hx = H.eyeX - 0.005, hy = prof.top(hx) - 0.012;
    for (const side of [1, -1]) {
      const hz = side * prof.halfWidth(hx) * 0.3;
      tube(gb, hx, hy, hz, -1, 0.22, side * 0.12, 0.17 * k, 0.017, 0.0015, 0, 6, 6, PART.body, hx, hx, 0.85, 0.5);
      const rx = 0.74, ry = prof.bot(rx) + 0.012;
      const rz = side * prof.halfWidth(rx) * 0.7;
      tube(gb, rx, ry, rz, 1, -0.12, side * 0.2, 0.16 * k, 0.015, 0.0015, 0, 6, 6, PART.body, rx, rx, -0.85, 0.5);
    }
  }
  // Rays: a serrated venomous spine on top of the tail, pointing back.
  if (body.kind === 'ray' && body.tailTaper >= 0.9) {
    const sx = 0.66, sy = prof.top(sx) - 0.001;
    tube(gb, sx, sy, 0, 1, 0.12, 0, 0.075, 0.0045, 0.0006, 0, 5, 4, PART.body, sx, sx, 0.2, 0.9);
  }
  // Cirri: small fleshy tentacles above the eyes (blennies, hawkfish, lionfish).
  if (body.cirri > 0) {
    for (const side of [1, -1]) {
      const cx = H.eyeX, cy = H.eyeY + H.eyeR * 1.05, cz = side * H.eyeZ * 0.8;
      tube(gb, cx, cy, cz, -0.2, 1, side * 0.2, 0.05 * body.cirri + H.eyeR * 0.6, 0.006, 0.002, 0.02, 3, 4, PART.barbel, cx, cx, 0.6, 0.4);
    }
  }
  // Frogfish lure.
  if (body.illicium) {
    const x = H.snoutLen + 0.02, y = prof.top(x) - 0.005;
    tube(gb, x, y, 0, -0.5, 1, 0, 0.14, 0.006, 0.004, 0.05, 5, 4, PART.barbel, x, x, 0.9, 0.5);
  }
  // Halfbeak: the lower jaw projects far beyond the snout as a flat blade.
  if (body.lowerJaw > 0.01) {
    const L = body.lowerJaw;
    const y = H.yTip - 0.006;
    const w = Math.max(0.004, prof.halfWidth(0.03) * 0.5);
    const uv: [number, number] = [0, 0];
    bodyUV(0.01, -0.2, uv);
    const idx0 = gb.idx.length, v0 = gb.vertexCount;
    const n = 6;
    for (let i = 0; i <= n; i++) {
      const t = i / n;
      const x = 0.04 - (L + 0.04) * t;
      const ww = w * (1 - 0.85 * t);
      const hh = 0.006 * (1 - 0.6 * t);
      gb.v(x, y + hh, 0, uv[0], uv[1], 0, PART.body);
      gb.v(x, y, ww, uv[0], uv[1], 0, PART.body);
      gb.v(x, y - hh, 0, uv[0], uv[1], 0, PART.body);
      gb.v(x, y, -ww, uv[0], uv[1], 0, PART.body);
    }
    for (let i = 0; i < n; i++) {
      for (let j = 0; j < 4; j++) {
        const a = v0 + i * 4 + j, b = v0 + i * 4 + ((j + 1) % 4);
        gb.quad(a, a + 4, b + 4, b);
      }
    }
    gb.smoothNormals(idx0, v0);
  }
  // Sucker mouth: an oval disc of lips under the snout.
  if (body.mouth === 'sucker') {
    const cx = H.snoutLen + 0.075 * (0.6 + body.headLength);
    const cy = prof.bot(cx) - 0.002;
    const rx = 0.06 * (0.5 + body.headLength), rz = prof.halfWidth(cx) * 0.62;
    const uv: [number, number] = [0, 0];
    bodyUV(cx, -0.98, uv);
    const idx0 = gb.idx.length, v0 = gb.vertexCount;
    const seg = 14;
    const c = gb.v(cx, cy - 0.006, 0, uv[0], uv[1], cx, PART.body);
    for (let i = 0; i < seg; i++) {
      const a = (i / seg) * Math.PI * 2;
      gb.v(cx + Math.cos(a) * rx, cy + 0.004, Math.sin(a) * rz, uv[0], uv[1], cx, PART.body);
    }
    for (let i = 0; i < seg; i++) gb.tri(c, v0 + 1 + i, v0 + 1 + ((i + 1) % seg));
    gb.smoothNormals(idx0, v0);
  }
}

/**
 * Move from SL coordinates (x tailward, z = fish's left) to local render space (TL = 1,
 * +X forward, +Z the fish's right, centered). A 180° turn about Y keeps triangle winding.
 */
export function finalize(gb: GeoBuilder, x0: number, cy: number, k: number): void {
  const p = gb.pos, n = gb.nor, f = gb.fin, s = gb.spine;
  for (let i = 0, vi = 0; i < p.length; i += 3, vi++) {
    p[i] = (x0 - p[i]) * k;
    p[i + 1] = (p[i + 1] - cy) * k;
    p[i + 2] = -p[i + 2] * k;
    n[i] = -n[i];
    n[i + 2] = -n[i + 2];
    const part = s[vi * 4 + 1];
    const fi = vi * 4;
    if (part === PART.eye) {
      f[fi] = (x0 - f[fi]) * k;
      f[fi + 1] = (f[fi + 1] - cy) * k;
      f[fi + 2] = -f[fi + 2] * k;
      f[fi + 3] *= k;
    } else if (part !== PART.body) {
      // Fins / barbels: distance from the base into local units; mirror side.
      f[fi + 3] *= k;
      const z = f[fi + 2];
      const side = Math.floor(z / 4 + 0.5);
      const flow = z - side * 4;
      f[fi + 2] = -side * 4 + flow;
    }
  }
}

/** Build body + fin geometry in SL coordinates (before the move to local render space). */
export function buildFishParts(body: ResolvedBody, lod: FishLod): { gb: GeoBuilder; fb: GeoBuilder; prof: BodyProfile; cLen: number } {
  const prof = new BodyProfile(body);
  const cLen = caudalWebLength(body.caudal.shape, body.caudal.size);

  // ---- opaque: body, eyes, barbels, extras ----
  const gb = new GeoBuilder();
  buildBody(gb, prof, body, lod);
  buildEyes(gb, prof, lod);
  buildBarbels(gb, prof, body);
  buildExtras(gb, prof, body);

  // ---- translucent fins ----
  const fb = new GeoBuilder();
  const fo = { nu: lod.finU, nw: lod.finW };
  const nuFor = (f: { start: number; end: number }) => Math.max(4, Math.round(fo.nu * clamp((f.end - f.start) * 4 + 0.5, 0.6, 1.6)));
  if (body.dorsal) {
    const envelope = finEnvelope(prof, body, body.dorsal, false) ?? undefined;
    buildMedianFin(fb, prof, body.dorsal, PART.dorsal, ATLAS.dorsal, false, { nu: nuFor(body.dorsal) + (envelope ? 4 : 0), nw: fo.nw }, { envelope });
  }
  if (body.dorsal2) buildMedianFin(fb, prof, body.dorsal2, PART.dorsal2, ATLAS.dorsal2, false, fo);
  if (body.anal) {
    if (body.gonopodium) {
      const g = { start: body.anal.start - 0.04, end: body.anal.start, height: 0.2, shape: 'pointed' as const, trail: 0 };
      buildMedianFin(fb, prof, g, PART.anal, ATLAS.anal, true, { nu: 3, nw: fo.nw }, { rake: 0.75, flow: 0.05 });
    } else {
      const envelope = body.twinAnal ? undefined : finEnvelope(prof, body, body.anal, true) ?? undefined;
      buildMedianFin(fb, prof, body.anal, PART.anal, ATLAS.anal, true, { nu: nuFor(body.anal) + (envelope ? 4 : 0), nw: fo.nw }, { twin: body.twinAnal, envelope });
    }
  }
  if (body.adipose && (!body.dorsal || body.dorsal.end < 0.8)) {
    const ad = { start: 0.8, end: 0.88, height: 0.05 + 0.08 * body.depth, shape: 'rounded' as const, trail: 0 };
    buildMedianFin(fb, prof, ad, PART.adipose, ATLAS.adipose, false, { nu: 5, nw: 3 }, { adipose: true, flow: 0.05 });
  }
  buildCaudalFin(fb, prof, body, { nu: fo.nu + 4, nw: fo.nw + 1 });
  if (body.pectoral) buildPairedFins(fb, prof, body, body.pectoral, 'pectoral', fo);
  if (body.pelvic) buildPairedFins(fb, prof, body, body.pelvic, 'pelvic', fo);
  return { gb, fb, prof, cLen };
}

export function buildFishGeometry(body: ResolvedBody, lod: FishLod): FishGeometry {
  const { gb, fb, prof, cLen } = buildFishParts(body, lod);
  const tlSL = 1 + cLen;
  const k = 1 / tlSL;
  const x0 = 0.5 * (1 + Math.min(cLen, 0.4));
  const cy = prof.centerY;
  finalize(gb, x0, cy, k);
  finalize(fb, x0, cy, k);

  // Picking half-extents (local): body depth + some of the fins.
  const depthMax = (prof.top(prof.body.depthPos) - prof.bot(prof.body.depthPos)) * k;
  const finBoost = Math.max(body.dorsal?.height ?? 0, body.anal?.height ?? 0) * 0.5 * k;
  const half: [number, number, number] = [0.5, depthMax * 0.5 + finBoost * 0.6, Math.max(body.width * 0.5 * k, 0.03)];
  if (body.kind === 'ray') half[2] = body.width * 0.5 * k;

  return {
    body: gb.build(),
    fins: fb.build(),
    info: { slLocal: k, xSnout: x0 * k, caudalLen: cLen, half, profile: prof },
  };
}
