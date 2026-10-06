/**
 * Pure (three.js-free) mesher for SDF hardscape: rocks, stone caves, coconut shells. Shared by the
 * main thread and the meshing worker (`rockWorker.ts`), so heavy stones can be built off-thread.
 *
 * The solid comes from the shared `decorShape()` SDF (the same one colliders and epiphyte anchors
 * use); this adds render-only relief (weathering noise, flutes, cracks, strata, vesicles), then
 * paints vertex colors (mineral mottling, relief-dependent weathering, coralline crusts, biofilm,
 * ambient occlusion).
 */
import type { DecorItem, Quality } from '../../core/types';
import { Rng } from '../../core/rng';
import { Noise3, clamp01, smax, smoothstep } from '../../decor/noise';
import { decorShape, projectToSurface, sdfEval, type V3 } from '../../decor/shapes';
import { surfaceNets } from './surfaceNets';

export interface RockMeshData {
  positions: Float32Array;
  normals: Float32Array;
  colors: Float32Array;
  /** Local position for the procedural surface-detail shader (`aDetail`). */
  det: Float32Array;
  indices: Uint32Array;
}

/** Grid cells across the largest extent per quality ('proxy' = quick placeholder). */
export const ROCK_CELLS: Record<Quality | 'proxy', number> = { proxy: 15, low: 26, medium: 34, high: 42, ultra: 52 };

type RGB = [number, number, number];

/** sRGB hex → linear RGB (same transfer function three.js uses for Color.set). */
export function linHex(hex: string): RGB {
  const n = parseInt(hex.slice(1), 16);
  const f = (c: number) => {
    const s = c / 255;
    return s <= 0.04045 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
  };
  return [f((n >> 16) & 255), f((n >> 8) & 255), f(n & 255)];
}

interface RockDetail {
  amp: number;
  freq: number;
  ridged: number;
  oct: number;
  /** Grooves instead of ridges (elephant skin cracks). */
  crack?: number;
  /** Horizontal laminations (slate/frodo). */
  strata?: { amp: number; freq: number };
  /** Vertical solution grooves (karren) on weathered limestone (m). */
  flute?: number;
  pits?: { count: number; r: [number, number]; depth: number };
  palette: { a: string; b: string; dark: string; accent?: string };
  /** Biofilm / algae film on upward faces. */
  film?: string;
  /** How strongly relief shades the color: ridges weather paler, grooves collect dark grime. */
  relief?: number;
}

const ROCK_DETAIL: Record<string, RockDetail> = {
  // Seiryu: mid blue-grey limestone, paler on weathered crests (albedo ≈ 0.2–0.3, not charcoal).
  seiryu: { amp: 0.0052, freq: 26, ridged: 0.95, oct: 3, flute: 0.009, relief: 0.55, palette: { a: '#78818a', b: '#a1aab0', dark: '#3c434a' }, film: '#66704e' },
  // Dragon stone (Ohko): crusty hardened clay, craggy and riddled with small and mid-sized holes.
  'dragon-stone': { amp: 0.006, freq: 24, ridged: 0.62, oct: 3, relief: 0.45, pits: { count: 170, r: [0.0015, 0.0048], depth: 0.7 }, palette: { a: '#7a5c40', b: '#a48458', dark: '#3e2c1c', accent: '#b8966a' }, film: '#64603e' },
  lava: { amp: 0.0034, freq: 28, ridged: 0.2, oct: 3, relief: 0.25, pits: { count: 170, r: [0.0014, 0.0042], depth: 0.7 }, palette: { a: '#3a2622', b: '#5c3226', dark: '#140d0b', accent: '#7a3a26' } },
  slate: { amp: 0.0011, freq: 16, ridged: 0.3, oct: 2, relief: 0.25, strata: { amp: 0.0007, freq: 700 }, palette: { a: '#5a6066', b: '#70777d', dark: '#30353a' }, film: '#4a5440' },
  'river-stone': { amp: 0.0014, freq: 8, ridged: 0, oct: 2, palette: { a: '#8a8378', b: '#a59c8c', dark: '#4a463f' } },
  'texas-holey': { amp: 0.0055, freq: 22, ridged: 0.85, oct: 3, relief: 0.4, pits: { count: 130, r: [0.002, 0.0075], depth: 0.6 }, palette: { a: '#cfc3a6', b: '#e4dac2', dark: '#6e624c', accent: '#aaa596' }, film: '#9a9468' },
  'petrified-wood': { amp: 0.0016, freq: 30, ridged: 0.5, oct: 3, relief: 0.3, palette: { a: '#86664a', b: '#a8875e', dark: '#4a3826', accent: '#8a847a' } },
  'elephant-skin': { amp: 0.0025, freq: 16, ridged: 0, oct: 2, relief: 0.3, crack: 0.0045, palette: { a: '#766e64', b: '#928a7c', dark: '#38332c' }, film: '#5a5a40' },
  frodo: { amp: 0.0034, freq: 24, ridged: 0.7, oct: 3, relief: 0.45, strata: { amp: 0.0013, freq: 260 }, palette: { a: '#72685c', b: '#918270', dark: '#322c26', accent: '#a06a3a' }, film: '#5a5a40' },
  // Reef rock: old coral limestone riddled with borings, cream to tan under the crusts.
  'live-rock': { amp: 0.0068, freq: 26, ridged: 0.7, oct: 3, relief: 0.4, pits: { count: 420, r: [0.0016, 0.0062], depth: 0.75 }, palette: { a: '#ddd2b6', b: '#c3ae8a', dark: '#6e5e48' } },
  'slate-cave': { amp: 0.0011, freq: 16, ridged: 0.3, oct: 2, relief: 0.25, strata: { amp: 0.0007, freq: 700 }, palette: { a: '#5a6066', b: '#70777d', dark: '#30353a' }, film: '#4a5440' },
  'rock-cave': { amp: 0.0058, freq: 24, ridged: 0.8, oct: 3, relief: 0.5, flute: 0.006, pits: { count: 90, r: [0.0016, 0.005], depth: 0.6 }, palette: { a: '#837b70', b: '#a69c8a', dark: '#3a352e', accent: '#957c5e' }, film: '#5e5e42' },
  coconut: { amp: 0.0007, freq: 70, ridged: 0.3, oct: 2, palette: { a: '#5a3a24', b: '#7a5232', dark: '#24160c', accent: '#c8a87a' } },
};

/** A spatial hash of spherical pits subtracted from the SDF surface. */
class PitSet {
  private cells = new Map<number, number[]>();
  private data: number[] = [];
  constructor(private cell: number) {}
  private key(ix: number, iy: number, iz: number): number {
    return ((ix + 512) * 1024 + (iy + 512)) * 1024 + (iz + 512);
  }
  add(x: number, y: number, z: number, r: number): void {
    const i = this.data.length / 4;
    this.data.push(x, y, z, r);
    const c = this.cell;
    for (let ix = Math.floor((x - r) / c); ix <= Math.floor((x + r) / c); ix++)
      for (let iy = Math.floor((y - r) / c); iy <= Math.floor((y + r) / c); iy++)
        for (let iz = Math.floor((z - r) / c); iz <= Math.floor((z + r) / c); iz++) {
          const k = this.key(ix, iy, iz);
          let l = this.cells.get(k);
          if (!l) this.cells.set(k, (l = []));
          l.push(i);
        }
  }
  /** Max over pits of (r − distance) (positive inside a pit). */
  carve(x: number, y: number, z: number): number {
    const l = this.cells.get(this.key(Math.floor(x / this.cell), Math.floor(y / this.cell), Math.floor(z / this.cell)));
    if (!l) return -1;
    let best = -1;
    const d = this.data;
    for (let k = 0; k < l.length; k++) {
      const i = l[k];
      const dx = x - d[i * 4], dy = y - d[i * 4 + 1], dz = z - d[i * 4 + 2];
      const v = d[i * 4 + 3] - Math.sqrt(dx * dx + dy * dy + dz * dz);
      if (v > best) best = v;
    }
    return best;
  }
}

// Allocation-free color helpers (the per-vertex loop is hot).
function setMix(o: RGB, a: RGB, b: RGB, t: number): RGB {
  o[0] = a[0] + (b[0] - a[0]) * t;
  o[1] = a[1] + (b[1] - a[1]) * t;
  o[2] = a[2] + (b[2] - a[2]) * t;
  return o;
}
function mixInto(o: RGB, b: RGB, t: number): void {
  o[0] += (b[0] - o[0]) * t;
  o[1] += (b[1] - o[1]) * t;
  o[2] += (b[2] - o[2]) * t;
}
function scaleInto(o: RGB, s: number): void {
  o[0] *= s;
  o[1] *= s;
  o[2] *= s;
}

// Crustose coralline algae as photographed under reef lighting: rose, mauve, lilac and plum —
// a rock carries two or three of them, never a uniform violet.
const CORALLINE = ['#d08aa6', '#bf7298', '#a46aa0', '#dba4bc', '#c58a8a', '#c98e98', '#b4768e'].map(linHex);
const C_TURF = linHex('#7a7448');
const C_SPONGE = [linHex('#d89a3a'), linHex('#c8503a'), linHex('#e0c070')];
const C_BARE = linHex('#e8e0cc');

/**
 * Mesh an SDF hardscape item (rock, stone cave, coconut) at `cells` grid cells across its
 * largest extent. Deterministic per item seed.
 */
export function meshRock(item: Pick<DecorItem, 'kind' | 'variant' | 'seed'>, cells: number): RockMeshData {
  const shape = decorShape(item);
  const spec = shape.sdf;
  if (!spec) return { positions: new Float32Array(0), normals: new Float32Array(0), colors: new Float32Array(0), det: new Float32Array(0), indices: new Uint32Array(0) };
  const style = shape.style;
  const P = ROCK_DETAIL[style] ?? ROCK_DETAIL.seiryu;
  const noise = new Noise3(item.seed);
  const rng = new Rng(item.seed ^ 0x51ed270b);
  const b = shape.bounds;
  const ext = Math.max(b.max[0] - b.min[0], b.max[1] - b.min[1], b.max[2] - b.min[2]);
  const proxy = cells < 20;
  const cell = Math.min(proxy ? 0.03 : 0.0068, Math.max(0.0021, ext / cells));

  // Pits sit on the (base) surface.
  let pits: PitSet | null = null;
  if (P.pits && !proxy) {
    pits = new PitSet(P.pits.r[1] * 2.2);
    const cx = (b.min[0] + b.max[0]) / 2, cy = Math.max(0.01, (b.min[1] + b.max[1]) / 2), cz = (b.min[2] + b.max[2]) / 2;
    for (let i = 0; i < P.pits.count; i++) {
      const p: V3 = [cx + rng.range(-0.6, 0.6) * (b.max[0] - b.min[0]), cy + rng.range(-0.2, 0.7) * (b.max[1] - b.min[1]), cz + rng.range(-0.6, 0.6) * (b.max[2] - b.min[2])];
      projectToSurface(spec, p);
      if (p[1] < -0.005) continue;
      // Size distribution skewed toward small pits (like real vesicles/erosion pockets).
      const r = P.pits.r[0] + (P.pits.r[1] - P.pits.r[0]) * Math.pow(rng.next(), 2.2);
      pits.add(p[0], p[1], p[2], r);
    }
  }
  // Petrified wood: an orthonormal frame around the log axis for the bark fissures.
  let axisU: V3 | null = null, axisV: V3 | null = null, axisW: V3 | null = null;
  const axisA = shape.axis?.a;
  if (shape.axis) {
    const ax = shape.axis.b[0] - shape.axis.a[0], ay = shape.axis.b[1] - shape.axis.a[1], az = shape.axis.b[2] - shape.axis.a[2];
    const l = Math.hypot(ax, ay, az) || 1;
    axisU = [ax / l, ay / l, az / l];
    const ref: V3 = Math.abs(axisU[1]) > 0.9 ? [1, 0, 0] : [0, 1, 0];
    const v: V3 = [axisU[1] * ref[2] - axisU[2] * ref[1], axisU[2] * ref[0] - axisU[0] * ref[2], axisU[0] * ref[1] - axisU[1] * ref[0]];
    const vl = Math.hypot(v[0], v[1], v[2]) || 1;
    axisV = [v[0] / vl, v[1] / vl, v[2] / vl];
    axisW = [axisU[1] * axisV[2] - axisU[2] * axisV[1], axisU[2] * axisV[0] - axisU[0] * axisV[2], axisU[0] * axisV[1] - axisU[1] * axisV[0]];
  }
  const band = P.amp * 1.6 + (P.crack ?? 0) + (P.strata?.amp ?? 0) + (P.flute ?? 0) + (P.pits ? P.pits.r[1] : 0) + (shape.axis ? 0.0025 : 0) + cell;
  const f = P.freq;
  /** Relief displacement (m, positive = outward) at a point — also drives the color. */
  const relief = (x: number, y: number, z: number): number => {
    const smoothN = noise.fbm(x * f, y * f, z * f, P.oct);
    let n = smoothN;
    if (P.ridged > 0) n = n * (1 - P.ridged) + (noise.ridged(x * f * 0.8 + 3.1, y * f * 0.8, z * f * 0.8, 2) - 0.55) * 2 * P.ridged;
    let r = n * P.amp;
    if (P.crack) {
      const cn = 1 - Math.abs(noise.noise(x * f * 1.6 + 9.2, y * f * 1.6, z * f * 1.6));
      r -= P.crack * Math.pow(cn, 10);
    }
    if (P.strata) r += P.strata.amp * Math.sin(y * P.strata.freq + smoothN * 3);
    if (P.flute) {
      // Rain-carved flutes run down the faces: noise stretched vertically, sharpened into grooves.
      const fl = 1 - Math.abs(noise.noise(x * 42 + 1.7, y * 6, z * 42));
      r -= P.flute * Math.pow(fl, 8);
    }
    if (axisU) {
      // Petrified bark: deep fissures running along the trunk.
      const px = x - axisA![0], py = y - axisA![1], pz = z - axisA![2];
      const t = px * axisU[0] + py * axisU[1] + pz * axisU[2];
      const rx = px - axisU[0] * t, ry = py - axisU[1] * t, rz = pz - axisU[2] * t;
      const ang = Math.atan2(rx * axisV![0] + ry * axisV![1] + rz * axisV![2], rx * axisW![0] + ry * axisW![1] + rz * axisW![2]);
      r -= 0.0022 * Math.pow(Math.abs(Math.sin(ang * 9 + noise.noise(t * 25, ang, 0.4) * 2.5)), 6);
    }
    return r;
  };
  const field = (x: number, y: number, z: number): number => {
    let d = sdfEval(spec, x, y, z, band);
    if (d < band && d > -band) {
      if (!proxy) d -= relief(x, y, z);
      if (pits) {
        const c = pits.carve(x, y, z);
        if (c > -0.01) d = smax(d, c, 0.0012);
      }
    }
    // Closed, flat underside a little below the substrate line.
    return Math.max(d, -0.024 - y);
  };
  const pad = band + cell * 2;
  // Faceted stones get two Newton steps (crisp planes); rounded ones need only one.
  const faceted = !proxy && (spec.cuts.length > 3 || style === 'slate' || style === 'slate-cave');
  const mesh = surfaceNets(field, [b.min[0] - pad, Math.max(b.min[1], -0.03) - pad, b.min[2] - pad], [b.max[0] + pad, b.max[1] + pad, b.max[2] + pad], cell, faceted ? 2 : 1);

  // Vertex colors: mottled mineral color, veins of accent, ambient occlusion from the field.
  const pal = { a: linHex(P.palette.a), b: linHex(P.palette.b), dark: linHex(P.palette.dark), accent: P.palette.accent ? linHex(P.palette.accent) : null };
  const film = P.film ? linHex(P.film) : null;
  // Individual stones differ a little in tone.
  const toneShift = rng.range(0.88, 1.1);
  const hueShift: RGB = [rng.range(0.96, 1.04), 1, rng.range(0.96, 1.04)];
  let river: RGB | null = null;
  if (style === 'river-stone') {
    const tones = ['#8a8378', '#6e6a64', '#9a8e7a', '#a8a092', '#5e5a54', '#b0a48c', '#7a6a58', '#8c7c6a'];
    river = linHex(tones[Math.floor(rng.next() * tones.length)]);
  }
  const riverHi: RGB | null = river ? [river[0] * 1.15, river[1] * 1.15, river[2] * 1.15] : null;
  const seiryuHi: RGB = [pal.b[0] * 1.15, pal.b[1] * 1.15, pal.b[2] * 1.15];
  // Each live rock carries its own mix of coralline species.
  const coralA = CORALLINE[Math.floor(rng.next() * CORALLINE.length)];
  const coralB = CORALLINE[Math.floor(rng.next() * CORALLINE.length)];
  const coralC = CORALLINE[Math.floor(rng.next() * CORALLINE.length)];
  // Mature reef rock is mostly encrusted (≈55–75 % of the lit surface).
  const corallineCover = rng.range(0.37, 0.47);
  const sponge = C_SPONGE[Math.floor(rng.next() * C_SPONGE.length)];
  const colors = new Float32Array(mesh.vertexCount * 3);
  const det = new Float32Array(mesh.vertexCount * 3);
  const ao = [0.005, 0.012, 0.024];
  const axis = shape.axis;
  const c: RGB = [0, 0, 0];
  const tmp: RGB = [0, 0, 0];
  const reliefK = P.relief ?? 0;
  for (let v = 0; v < mesh.vertexCount; v++) {
    const x = mesh.positions[v * 3], y = mesh.positions[v * 3 + 1], z = mesh.positions[v * 3 + 2];
    const nx = mesh.normals[v * 3], ny = mesh.normals[v * 3 + 1], nz = mesh.normals[v * 3 + 2];
    det[v * 3] = x;
    det[v * 3 + 1] = y;
    det[v * 3 + 2] = z;
    const m1 = noise.fbm(x * 9 + 11, y * 9, z * 9, 3) * 0.5 + 0.5;
    const m2 = noise.fbm(x * 31, y * 31 + 7, z * 31, 2) * 0.5 + 0.5;
    setMix(c, pal.a, pal.b, smoothstep(0.3, 0.75, m1));
    if (river && riverHi) setMix(c, river, riverHi, m1);
    mixInto(c, pal.dark, smoothstep(0.62, 0.9, m2) * 0.35);
    if (pal.accent && style !== 'live-rock') mixInto(c, pal.accent, smoothstep(0.55, 0.85, noise.fbm(x * 14 + 3, y * 22, z * 14, 2) * 0.5 + 0.5) * 0.55);
    if (style === 'seiryu') mixInto(c, seiryuHi, smoothstep(0.4, 0.95, ny) * 0.25);
    // Weathering follows the relief: crests are bleached and worn, grooves and pits hold grime.
    let rel = 0;
    if (reliefK > 0 && !proxy) {
      rel = relief(x, y, z) / (P.amp + 1e-6);
      scaleInto(c, 1 + reliefK * 0.32 * Math.max(-1.2, Math.min(1, rel)));
    }
    let inPit = 0;
    if (pits) inPit = smoothstep(-0.0015, 0.0008, pits.carve(x, y, z));
    if (style === 'live-rock') {
      // Coralline crusts: broad patches with soft, lobed margins, strongest on lit faces, a
      // second species mottled through the first, darker plum in the shade; scattered young
      // crust spots on bare rock; a faint brownish turf film on top; sponges in the borings.
      const up = clamp01(ny * 0.8 + 0.4);
      const cn = noise.fbm(x * 9 + 5, y * 9, z * 9 - 2, 4) * 0.5 + 0.5;
      const cn2 = noise.fbm(x * 28 + 1, y * 28 + 4, z * 28, 2) * 0.5 + 0.5;
      const cv = cn * 0.78 + cn2 * 0.22 + (up - 0.6) * 0.1;
      const crust = smoothstep(corallineCover, corallineCover + 0.07, cv) * (1 - inPit * 0.85);
      setMix(tmp, coralA, coralB, smoothstep(0.3, 0.7, noise.noise(x * 6 + 1, y * 6, z * 6) * 0.5 + 0.5));
      mixInto(tmp, coralC, smoothstep(0.55, 0.8, noise.noise(x * 17 + 9, y * 17, z * 17) * 0.5 + 0.5) * 0.6);
      // Fine mottling inside the crust, deeper color where it is shaded.
      scaleInto(tmp, 0.8 + 0.34 * (noise.noise(x * 70, y * 70 + 2, z * 70) * 0.5 + 0.5));
      scaleInto(tmp, 0.86 + 0.14 * up);
      const spots = smoothstep(0.68, 0.73, noise.noise(x * 60 + 3, y * 60, z * 60) * 0.5 + 0.5) * (0.35 + 0.65 * up) * (1 - crust);
      mixInto(c, tmp, Math.min(1, crust * 0.94 + spots * 0.7));
      // A faint pale growing margin around crust patches.
      const rim = smoothstep(corallineCover - 0.025, corallineCover + 0.01, cv) * (1 - smoothstep(corallineCover + 0.01, corallineCover + 0.045, cv));
      mixInto(c, C_BARE, rim * 0.25);
      const turf = smoothstep(0.66, 0.8, noise.fbm(x * 19, y * 19 + 3, z * 19, 2) * 0.5 + 0.5) * clamp01(ny) * (1 - crust * 0.7);
      mixInto(c, C_TURF, turf * 0.3);
      mixInto(c, sponge, inPit * smoothstep(0.55, 0.75, noise.noise(x * 25, y * 25, z * 25 + 4) * 0.5 + 0.5) * 0.75);
    }
    if (axis) {
      // Petrified wood: growth rings around the log axis, bark streaks along it.
      const ax = axis.b[0] - axis.a[0], ay = axis.b[1] - axis.a[1], az = axis.b[2] - axis.a[2];
      const al = Math.hypot(ax, ay, az) || 1;
      const ux = ax / al, uy = ay / al, uz = az / al;
      const px = x - axis.a[0], py = y - axis.a[1], pz = z - axis.a[2];
      const t = px * ux + py * uy + pz * uz;
      const rx = px - ux * t, ry = py - uy * t, rz = pz - uz * t;
      const r = Math.hypot(rx, ry, rz);
      const ring = 0.5 + 0.5 * Math.sin(r * 1400 + noise.noise(x * 40, y * 40, z * 40) * 4);
      const endFace = Math.abs(nx * ux + ny * uy + nz * uz);
      setMix(tmp, pal.dark, pal.b, ring);
      mixInto(c, tmp, smoothstep(0.5, 0.9, endFace) * 0.65);
      const streak = 0.5 + 0.5 * noise.noise(t * 6, Math.atan2(rz, rx) * 6, 0.5);
      mixInto(c, pal.accent ?? pal.dark, (1 - endFace) * streak * 0.35);
    }
    if (style === 'coconut') {
      // Hairy brown husk outside, pale flesh-colored inside (inner shell faces toward the center).
      const inward = -(x * nx + (y + 0.01) * ny + z * nz) / (Math.hypot(x, y + 0.01, z) || 1);
      mixInto(c, pal.accent!, smoothstep(0.2, 0.6, inward) * 0.8);
    }
    if (film) mixInto(c, film, clamp01(ny) * smoothstep(0.45, 0.8, noise.fbm(x * 7, y * 7 + 2, z * 7, 2) * 0.5 + 0.5) * 0.28);
    // Ambient occlusion: how much solid surrounds the point along its normal (base SDF — the
    // large-scale shape is what shades crevices; fine relief is handled by the bump shader).
    let occ = 0;
    for (let k = 0; k < ao.length; k++) {
      const s = ao[k];
      occ += (Math.max(0, s - Math.max(sdfEval(spec, x + nx * s, y + ny * s, z + nz * s, s), -0.024 - (y + ny * s))) / s) * (0.55 / (k + 1));
    }
    let a = clamp01(1 - occ * 0.55);
    a = 0.25 + 0.75 * a * a;
    // Pits and borings are dark inside.
    a *= 1 - inPit * 0.4;
    // Contact darkening where the stone meets the sand.
    a *= 0.62 + 0.38 * smoothstep(-0.006, 0.02, y);
    const k = a * toneShift;
    colors[v * 3] = c[0] * k * hueShift[0];
    colors[v * 3 + 1] = c[1] * k * hueShift[1];
    colors[v * 3 + 2] = c[2] * k * hueShift[2];
  }
  return { positions: mesh.positions, normals: mesh.normals, colors, det, indices: mesh.indices };
}
