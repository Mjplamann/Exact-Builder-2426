/**
 * Procedural hardscape meshes. Every builder reads the same `decorShape()` parameters that the
 * collider code uses, then adds render-only detail (surface noise, pits, colors, AO).
 *
 * Geometry is in the item's local space; the returned group carries the item transform.
 */
import { BufferGeometry, Color, DoubleSide, Group, LatheGeometry, Mesh, MeshStandardMaterial, Vector2 } from 'three';
import type { DecorItem, Quality, TankState } from '../../core/types';
import { Rng } from '../../core/rng';
import { substrateHeight, tankBounds } from '../../core/tankGeometry';
import { Noise3, smax, smoothstep, clamp01 } from '../../decor/noise';
import {
  decorShape, itemTransform, projectToSurface, sdfEval, toLocal, toWorld,
  type DecorShape, type LitterLeaf, type ShellPart, type V3,
} from '../../decor/shapes';
import { GeoBuilder, addTubes, icosphere } from './geom';
import { surfaceNets } from './surfaceNets';
import { hardscapeMaterial, tubingMaterial } from './materials';
import { leafTexture } from './textures';
import { applyUnderwater } from '../underwater';

export interface BuildCtx {
  tank: TankState;
  quality: Quality;
}

export interface BuiltDecor {
  object: Group;
  /** Meshes for picking & highlight. */
  meshes: Mesh[];
  /** True if the geometry depends on the item's world position (must rebuild on move). */
  positional: boolean;
}

const lin = (hex: string): [number, number, number] => {
  const c = new Color(hex);
  return [c.r, c.g, c.b];
};
function mix3(a: [number, number, number], b: [number, number, number], t: number): [number, number, number] {
  return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
}
function mul3(a: [number, number, number], s: number): [number, number, number] {
  return [a[0] * s, a[1] * s, a[2] * s];
}

const QUALITY_CELLS: Record<Quality, number> = { low: 26, medium: 34, high: 42, ultra: 52 };

// ---------------------------------------------------------------------------------------------
// SDF rocks & caves
// ---------------------------------------------------------------------------------------------

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
}

const ROCK_DETAIL: Record<string, RockDetail> = {
  seiryu: { amp: 0.0038, freq: 28, ridged: 0.9, oct: 3, flute: 0.0065, palette: { a: '#5c6469', b: '#7e868b', dark: '#33393d' }, film: '#5a6248' },
  'dragon-stone': { amp: 0.0042, freq: 21, ridged: 0.45, oct: 3, pits: { count: 46, r: [0.0022, 0.0055], depth: 0.6 }, palette: { a: '#72553a', b: '#9c7b50', dark: '#3a2818', accent: '#b08c5c' }, film: '#5e5a38' },
  lava: { amp: 0.003, freq: 28, ridged: 0.2, oct: 3, pits: { count: 150, r: [0.0014, 0.0042], depth: 0.7 }, palette: { a: '#3a2622', b: '#5c3226', dark: '#140d0b', accent: '#7a3a26' } },
  slate: { amp: 0.0011, freq: 16, ridged: 0.3, oct: 2, strata: { amp: 0.0007, freq: 700 }, palette: { a: '#383c40', b: '#4a4f54', dark: '#202224' }, film: '#3e4636' },
  'river-stone': { amp: 0.0014, freq: 8, ridged: 0, oct: 2, palette: { a: '#8a8378', b: '#a59c8c', dark: '#4a463f' } },
  'texas-holey': { amp: 0.0048, freq: 22, ridged: 0.85, oct: 3, pits: { count: 90, r: [0.002, 0.007], depth: 0.6 }, palette: { a: '#cfc4a8', b: '#e2d9c3', dark: '#7c705a', accent: '#b4ae9e' }, film: '#9a9468' },
  'petrified-wood': { amp: 0.0016, freq: 30, ridged: 0.5, oct: 3, palette: { a: '#86664a', b: '#a8875e', dark: '#4a3826', accent: '#8a847a' } },
  'elephant-skin': { amp: 0.0025, freq: 16, ridged: 0, oct: 2, crack: 0.0045, palette: { a: '#686158', b: '#837a6d', dark: '#34302a' }, film: '#5a5a40' },
  frodo: { amp: 0.0028, freq: 24, ridged: 0.7, oct: 3, strata: { amp: 0.0013, freq: 260 }, palette: { a: '#665c52', b: '#857766', dark: '#2e2924', accent: '#9a6436' }, film: '#5a5a40' },
  'live-rock': { amp: 0.0045, freq: 24, ridged: 0.6, oct: 3, pits: { count: 140, r: [0.0025, 0.008], depth: 0.7 }, palette: { a: '#d6d0c2', b: '#bcb3a0', dark: '#4a4238', accent: '#8a4a8a' } },
  'slate-cave': { amp: 0.0011, freq: 16, ridged: 0.3, oct: 2, strata: { amp: 0.0007, freq: 700 }, palette: { a: '#383c40', b: '#4a4f54', dark: '#202224' }, film: '#3e4636' },
  'rock-cave': { amp: 0.0032, freq: 22, ridged: 0.5, oct: 3, pits: { count: 25, r: [0.002, 0.005], depth: 0.5 }, palette: { a: '#6e675e', b: '#8c8476', dark: '#2e2a26' }, film: '#5a5a40' },
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
    for (const i of l) {
      const d = this.data;
      const dx = x - d[i * 4], dy = y - d[i * 4 + 1], dz = z - d[i * 4 + 2];
      const v = d[i * 4 + 3] - Math.sqrt(dx * dx + dy * dy + dz * dz);
      if (v > best) best = v;
    }
    return best;
  }
}

function sdfRockGeometry(item: DecorItem, shape: DecorShape, quality: Quality): BufferGeometry {
  const spec = shape.sdf!;
  const style = shape.style;
  const P = ROCK_DETAIL[style] ?? ROCK_DETAIL.seiryu;
  const noise = new Noise3(item.seed);
  const rng = new Rng(item.seed ^ 0x51ed270b);
  const b = shape.bounds;
  const ext = Math.max(b.max[0] - b.min[0], b.max[1] - b.min[1], b.max[2] - b.min[2]);
  const cell = Math.min(0.0068, Math.max(0.0021, ext / QUALITY_CELLS[quality]));

  // Pits sit on the (base) surface.
  let pits: PitSet | null = null;
  if (P.pits) {
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
  const field = (x: number, y: number, z: number): number => {
    let d = sdfEval(spec, x, y, z);
    if (d < band && d > -band) {
      const smoothN = noise.fbm(x * f, y * f, z * f, P.oct);
      let n = smoothN;
      if (P.ridged > 0) n = n * (1 - P.ridged) + (noise.ridged(x * f * 0.8 + 3.1, y * f * 0.8, z * f * 0.8, 2) - 0.55) * 2 * P.ridged;
      d -= n * P.amp;
      if (P.crack) {
        const cn = 1 - Math.abs(noise.noise(x * f * 1.6 + 9.2, y * f * 1.6, z * f * 1.6));
        d += P.crack * Math.pow(cn, 10);
      }
      if (P.strata) d -= P.strata.amp * Math.sin(y * P.strata.freq + smoothN * 3);
      if (P.flute) {
        // Rain-carved flutes run down the faces: noise stretched vertically, sharpened into grooves.
        const fl = 1 - Math.abs(noise.noise(x * 42 + 1.7, y * 6, z * 42));
        d += P.flute * Math.pow(fl, 8);
      }
      if (axisU) {
        // Petrified bark: deep fissures running along the trunk.
        const px = x - axisA![0], py = y - axisA![1], pz = z - axisA![2];
        const t = px * axisU[0] + py * axisU[1] + pz * axisU[2];
        const rx = px - axisU[0] * t, ry = py - axisU[1] * t, rz = pz - axisU[2] * t;
        const ang = Math.atan2(rx * axisV![0] + ry * axisV![1] + rz * axisV![2], rx * axisW![0] + ry * axisW![1] + rz * axisW![2]);
        d += 0.0022 * Math.pow(Math.abs(Math.sin(ang * 9 + noise.noise(t * 25, ang, 0.4) * 2.5)), 6);
      }
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
  const faceted = spec.cuts.length > 3 || style === 'slate' || style === 'slate-cave';
  const mesh = surfaceNets(field, [b.min[0] - pad, Math.max(b.min[1], -0.03) - pad, b.min[2] - pad], [b.max[0] + pad, b.max[1] + pad, b.max[2] + pad], cell, faceted ? 2 : 1);

  // Vertex colors: mottled mineral color, veins of accent, ambient occlusion from the field.
  const pal = { a: lin(P.palette.a), b: lin(P.palette.b), dark: lin(P.palette.dark), accent: P.palette.accent ? lin(P.palette.accent) : null };
  const film = P.film ? lin(P.film) : null;
  // Individual stones differ a little in tone.
  const toneShift = rng.range(0.88, 1.1);
  const hueShift: [number, number, number] = [rng.range(0.96, 1.04), 1, rng.range(0.96, 1.04)];
  let river: [number, number, number] | null = null;
  if (style === 'river-stone') {
    const tones = ['#8a8378', '#6e6a64', '#9a8e7a', '#a8a092', '#5e5a54', '#b0a48c', '#7a6a58', '#8c7c6a'];
    river = lin(tones[Math.floor(rng.next() * tones.length)]);
  }
  const colors = new Float32Array(mesh.vertexCount * 3);
  const det = new Float32Array(mesh.vertexCount * 3);
  const ao = [0.005, 0.012, 0.024];
  const coralline = [lin('#a45aa4'), lin('#cc7aa2'), lin('#b04a8c'), lin('#c09ad0')];
  const axis = shape.axis;
  for (let v = 0; v < mesh.vertexCount; v++) {
    const x = mesh.positions[v * 3], y = mesh.positions[v * 3 + 1], z = mesh.positions[v * 3 + 2];
    const nx = mesh.normals[v * 3], ny = mesh.normals[v * 3 + 1], nz = mesh.normals[v * 3 + 2];
    det[v * 3] = x;
    det[v * 3 + 1] = y;
    det[v * 3 + 2] = z;
    const m1 = noise.fbm(x * 9 + 11, y * 9, z * 9, 3) * 0.5 + 0.5;
    const m2 = noise.fbm(x * 31, y * 31 + 7, z * 31, 2) * 0.5 + 0.5;
    let c = mix3(pal.a, pal.b, smoothstep(0.3, 0.75, m1));
    if (river) c = mix3(river, mul3(river, 1.15), m1);
    c = mix3(c, pal.dark, smoothstep(0.62, 0.9, m2) * 0.35);
    if (pal.accent && style !== 'live-rock') c = mix3(c, pal.accent, smoothstep(0.55, 0.85, noise.fbm(x * 14 + 3, y * 22, z * 14, 2) * 0.5 + 0.5) * 0.55);
    if (style === 'seiryu') c = mix3(c, mul3(pal.b, 1.15), smoothstep(0.4, 0.95, ny) * 0.25);
    if (style === 'live-rock') {
      // Coralline algae: pink/purple crusts, strongest on lit, upward faces; turf algae in patches.
      const cn = noise.fbm(x * 13 + 5, y * 13, z * 13 - 2, 3) * 0.5 + 0.5;
      const pick = coralline[Math.floor((noise.noise(x * 4 + 1, y * 4, z * 4) * 0.5 + 0.5) * 3.99)];
      const cover = smoothstep(0.42, 0.62, cn) * (0.45 + 0.55 * clamp01(ny * 0.8 + 0.4));
      c = mix3(c, pick, cover * 0.9);
      const turf = smoothstep(0.62, 0.78, noise.fbm(x * 21, y * 21 + 3, z * 21, 2) * 0.5 + 0.5) * clamp01(ny);
      c = mix3(c, lin('#5e6a3a'), turf * 0.55);
      const sponge = smoothstep(0.8, 0.9, noise.noise(x * 30, y * 30, z * 30 + 4) * 0.5 + 0.5);
      c = mix3(c, lin('#d8a040'), sponge * 0.5);
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
      c = mix3(c, mix3(pal.dark, pal.b, ring), smoothstep(0.5, 0.9, endFace) * 0.65);
      const streak = 0.5 + 0.5 * noise.noise(t * 6, Math.atan2(rz, rx) * 6, 0.5);
      c = mix3(c, pal.accent ?? pal.dark, (1 - endFace) * streak * 0.35);
    }
    if (style === 'coconut') {
      // Hairy brown husk outside, pale flesh-colored inside (inner shell faces toward the center).
      const inward = -(x * nx + (y + 0.01) * ny + z * nz) / (Math.hypot(x, y + 0.01, z) || 1);
      c = mix3(c, pal.accent!, smoothstep(0.2, 0.6, inward) * 0.8);
    }
    if (film) c = mix3(c, film, clamp01(ny) * smoothstep(0.45, 0.8, noise.fbm(x * 7, y * 7 + 2, z * 7, 2) * 0.5 + 0.5) * 0.28);
    // Ambient occlusion: how much solid surrounds the point along its normal (base SDF — the
    // large-scale shape is what shades crevices; fine relief is handled by the bump shader).
    let occ = 0;
    for (let k = 0; k < ao.length; k++) {
      const s = ao[k];
      occ += (s - Math.max(sdfEval(spec, x + nx * s, y + ny * s, z + nz * s), -0.024 - (y + ny * s))) / s * (0.55 / (k + 1));
    }
    let a = clamp01(1 - occ * 0.55);
    a = 0.25 + 0.75 * a * a;
    // Contact darkening where the stone meets the sand.
    a *= 0.62 + 0.38 * smoothstep(-0.006, 0.02, y);
    c = mul3(c, a * toneShift);
    colors[v * 3] = c[0] * hueShift[0];
    colors[v * 3 + 1] = c[1] * hueShift[1];
    colors[v * 3 + 2] = c[2] * hueShift[2];
  }
  const gb = new GeoBuilder();
  gb.pos = Array.from(mesh.positions);
  gb.nrm = Array.from(mesh.normals);
  gb.col = Array.from(colors);
  gb.det = Array.from(det);
  gb.idx = Array.from(mesh.indices);
  return gb.build();
}

// ---------------------------------------------------------------------------------------------
// Driftwood & rubble
// ---------------------------------------------------------------------------------------------

interface WoodLook {
  a: string;
  b: string;
  dark: string;
  gnarl: number;
  gnarlFreq: number;
  grooves?: number;
  twoTone?: string;
}

const WOOD_LOOK: Record<string, WoodLook> = {
  spiderwood: { a: '#9c7a56', b: '#bc9a70', dark: '#5a4430', gnarl: 0.14, gnarlFreq: 40 },
  'redmoor-root': { a: '#6c3e2c', b: '#8c5440', dark: '#3a2016', gnarl: 0.12, gnarlFreq: 45 },
  manzanita: { a: '#6e3a2a', b: '#8e4e38', dark: '#3e2018', gnarl: 0.06, gnarlFreq: 25 },
  mopani: { a: '#3e2618', b: '#4e301e', dark: '#24160c', gnarl: 0.28, gnarlFreq: 14, twoTone: '#a8855a' },
  malaysian: { a: '#44301f', b: '#5e422c', dark: '#24180f', gnarl: 0.16, gnarlFreq: 18, grooves: 0.12 },
  cholla: { a: '#a88c64', b: '#c2a67a', dark: '#5e4a32', gnarl: 0.04, gnarlFreq: 20 },
  branchwood: { a: '#7c6650', b: '#9c8468', dark: '#40342a', gnarl: 0.09, gnarlFreq: 30 },
  rubble: { a: '#dcd2bc', b: '#ece4d2', dark: '#9c907a', gnarl: 0.18, gnarlFreq: 60 },
};

function woodGeometry(item: DecorItem, shape: DecorShape, quality: Quality): BufferGeometry {
  const look = WOOD_LOOK[shape.kind === 'coral-skeleton' ? 'rubble' : shape.style] ?? WOOD_LOOK.branchwood;
  const noise = new Noise3(item.seed ^ 0x77);
  const q = quality === 'low' ? 0.6 : quality === 'medium' ? 0.8 : quality === 'ultra' ? 1.25 : 1;
  const A = lin(look.a), B = lin(look.b), D = lin(look.dark), T2 = look.twoTone ? lin(look.twoTone) : null;
  const gb = new GeoBuilder();
  const branches = shape.branches ?? [];
  addTubes(gb, branches, {
    segments: (r) => Math.round((r > 0.02 ? 12 : r > 0.008 ? 9 : r > 0.004 ? 7 : 5) * q),
    gnarl: look.gnarl,
    gnarlFreq: look.gnarlFreq,
    grooves: look.grooves,
    grooveCount: 5,
    capTips: !shape.hollow,
    subdiv: quality === 'low' ? 1 : 2,
    hollow: shape.hollow ? 0.78 : undefined,
    seed: item.seed,
    color: (p, n, along, t, bi, depth) => {
      const g = noise.fbm(along * 9 + bi, p[1] * 3, bi * 0.7, 3) * 0.5 + 0.5;
      let c = mix3(A, B, smoothstep(0.25, 0.8, g));
      // Long streaks along the grain.
      c = mul3(c, 0.88 + 0.24 * (noise.noise(along * 2.5 + bi * 3, Math.atan2(n[2], n[0]) * 1.2, 0.3) * 0.5 + 0.5));
      if (T2) {
        // Mopani: pale sapwood showing through dark heartwood in sandblasted patches.
        const s = noise.fbm(along * 6 + bi * 2, n[0] * 1.5, n[2] * 1.5 + p[1] * 8, 3) * 0.5 + 0.5;
        c = mix3(c, T2, smoothstep(0.48, 0.6, s) * 0.85);
      }
      // Crotches (young branch bases) and undersides are shaded; contact with sand darker still.
      let a = 1;
      if (depth > 0) a *= 0.72 + 0.28 * smoothstep(0, 0.12, t);
      a *= 0.86 + 0.14 * clamp01(n[1] * 0.5 + 0.6);
      a *= shape.kind === 'coral-skeleton' ? 0.85 + 0.15 * smoothstep(-0.003, 0.01, p[1]) : 0.6 + 0.4 * smoothstep(-0.005, 0.025, p[1]);
      c = mix3(c, D, (1 - a) * 0.6);
      return mul3(c, 0.75 + 0.25 * a);
    },
  });
  return gb.build();
}

// ---------------------------------------------------------------------------------------------
// Pebbles
// ---------------------------------------------------------------------------------------------

function pebbleGeometry(item: DecorItem, shape: DecorShape): BufferGeometry {
  const ico = icosphere(3);
  const gb = new GeoBuilder();
  const dark = shape.style === 'black';
  const tones = dark ? ['#2a2a2c', '#333336', '#1e1f21', '#3c3a38', '#26282a'] : ['#8a8378', '#6e6a64', '#a39682', '#bdb4a2', '#5e5a54', '#b8a888', '#7c6a56', '#d2cabc', '#8e7c66'];
  for (const p of shape.pebbles ?? []) {
    const noise = new Noise3(p.seed);
    const base = lin(tones[Math.floor(p.tone * tones.length) % tones.length]);
    const cs = Math.cos(p.rotY), sn = Math.sin(p.rotY);
    const start = gb.count;
    for (let k = 0; k < ico.p.length; k += 3) {
      const ux = ico.p[k], uy = ico.p[k + 1], uz = ico.p[k + 2];
      const bump = 1 + 0.08 * noise.fbm(ux * 1.6, uy * 1.6, uz * 1.6, 2);
      // Flatten the underside a little (stones rest on their flattest face).
      const fy = uy < 0 ? uy * 0.75 : uy;
      const lx = ux * p.r[0] * bump, ly = fy * p.r[1] * bump, lz = uz * p.r[2] * bump;
      const x = p.c[0] + lx * cs - lz * sn, y = p.c[1] + ly, z = p.c[2] + lx * sn + lz * cs;
      // Ellipsoid normal (approx).
      const gx = ux / p.r[0], gy = fy / p.r[1], gz = uz / p.r[2];
      const nl = Math.hypot(gx, gy, gz) || 1;
      const nx0 = gx / nl, nz0 = gz / nl;
      const n = [nx0 * cs - nz0 * sn, gy / nl, nx0 * sn + nz0 * cs];
      const speck = noise.noise(x * 400, y * 400, z * 400) * 0.08;
      const band = Math.abs(noise.noise(x * 60 + 3, y * 60, z * 60)) < 0.05 && !dark ? 0.25 : 0;
      let c = mul3(base, 1 + speck + noise.fbm(x * 50, y * 50, z * 50, 2) * 0.12);
      c = mix3(c, [0.85, 0.83, 0.8], band);
      c = mul3(c, 0.65 + 0.35 * smoothstep(-0.002, p.r[1] * 0.9, y));
      gb.vertex([x, y, z], n, undefined, c, [x, y, z]);
    }
    for (let k = 0; k < ico.i.length; k += 3) gb.tri(start + ico.i[k], start + ico.i[k + 1], start + ico.i[k + 2]);
  }
  return gb.build();
}

// ---------------------------------------------------------------------------------------------
// Leaf litter
// ---------------------------------------------------------------------------------------------

const LITTER_TEX: Record<string, { outline: 'obovate' | 'oak' | 'elliptic'; base: string; tip: string; vein: string; aspect: number }> = {
  catappa: { outline: 'obovate', base: '#8a5530', tip: '#9a6236', vein: '#b88656', aspect: 0.55 },
  oak: { outline: 'oak', base: '#86603a', tip: '#946a42', vein: '#b08a5e', aspect: 0.55 },
  guava: { outline: 'elliptic', base: '#76603c', tip: '#806842', vein: '#a08a62', aspect: 0.45 },
};

const litterMats = new Map<string, MeshStandardMaterial>();
function litterMaterial(style: string): MeshStandardMaterial {
  const hit = litterMats.get(style);
  if (hit) return hit;
  const L = LITTER_TEX[style] ?? LITTER_TEX.catappa;
  const map = leafTexture({ outline: L.outline, width: 128, height: 256, base: L.base, tip: L.tip, vein: L.vein, veins: 'pinnate', petiole: 0.06, dry: true, seed: 7 });
  const m = new MeshStandardMaterial({ map, vertexColors: true, alphaTest: 0.5, side: DoubleSide, roughness: 0.78, metalness: 0 });
  m.name = `decor-litter-${style}`;
  applyUnderwater(m);
  litterMats.set(style, m);
  return m;
}

function litterGeometry(item: DecorItem, shape: DecorShape, ctx: BuildCtx): BufferGeometry {
  const xf = itemTransform(item);
  const gb = new GeoBuilder();
  const L = LITTER_TEX[shape.style] ?? LITTER_TEX.catappa;
  const cols = 7, rows = 10;
  const leaves: LitterLeaf[] = shape.leaves ?? [];
  // Stack order: later leaves lie on top of earlier ones.
  leaves.forEach((leaf, li) => {
    const rng = new Rng(leaf.seed);
    const len = leaf.len;
    const wid = len * L.aspect;
    // Rest on the sand: local y offset from the substrate under this leaf.
    const wc = toWorld(xf, leaf.c, [0, 0, 0]);
    const ground = substrateHeight(ctx.tank, wc[0], wc[2]);
    const lc = toLocal(xf, [wc[0], ground, wc[2]], [0, 0, 0]);
    const yBase = lc[1] + 0.0012 + li * 0.0009;
    const cs = Math.cos(leaf.rotY), sn = Math.sin(leaf.rotY);
    // Dry tone: catappa ranges from tan-orange to dark chocolate; slight greenish olive for guava.
    const tone = 0.7 + leaf.tone * 0.5;
    const tint: [number, number, number] = [tone * rng.range(0.95, 1.08), tone * rng.range(0.9, 1.0), tone * rng.range(0.85, 0.98)];
    const start = gb.count;
    for (let j = 0; j <= rows; j++) {
      const v = j / rows;
      for (let i = 0; i < cols; i++) {
        const u = i / (cols - 1);
        const x = (u - 0.5) * wid;
        const yLen = (v - 0.5) * len;
        // Dried leaves curl: margins roll up, the blade bows along the midrib, tips lift.
        const e = Math.abs(u - 0.5) * 2;
        const lift = leaf.curl * (0.22 * wid * e * e + 0.06 * len * Math.pow(Math.abs(v - 0.5) * 2, 2.2)) + 0.002 * Math.sin(v * 9 + li);
        const lx = x * cs - yLen * sn + leaf.c[0];
        const lz = x * sn + yLen * cs + leaf.c[2];
        const ly = yBase + lift + leaf.tilt[0] * x + leaf.tilt[1] * yLen;
        const c = mul3(tint, 0.7 + 0.3 * smoothstep(0, 0.012, lift));
        gb.vertex([lx, ly, lz], [0, 1, 0], [u, v], c, [lx, ly, lz]);
      }
    }
    for (let j = 0; j < rows; j++) {
      for (let i = 0; i < cols - 1; i++) {
        const a = start + j * cols + i, b2 = a + 1, c2 = a + cols, d = c2 + 1;
        gb.tri(a, d, b2);
        gb.tri(a, c2, d);
      }
    }
  });
  const g = gb.build();
  g.computeVertexNormals();
  return g;
}

// ---------------------------------------------------------------------------------------------
// Shells (parametric logarithmic spiral)
// ---------------------------------------------------------------------------------------------

function shellGeometry(shape: DecorShape): BufferGeometry {
  const gb = new GeoBuilder();
  const conch = shape.style === 'conch';
  for (const s of shape.shells ?? []) addShell(gb, s, conch);
  const g = gb.build();
  g.computeVertexNormals();
  return g;
}

function addShell(gb: GeoBuilder, s: ShellPart, conch: boolean): void {
  const noise = new Noise3(s.seed);
  const turns = conch ? 5.5 : 4.2;
  const W = conch ? 2.3 : 2.1; // whorl expansion per turn
  const k = Math.log(W) / (Math.PI * 2);
  const ratio = conch ? 0.62 : 0.86; // aperture radius / distance from axis
  const spire = conch ? 1.25 : 0.55; // axial drop per radius
  const nT = Math.round(turns * 34), nS = 22;
  const thetaMax = turns * Math.PI * 2;
  const pts: number[][] = [];
  let maxR = 0;
  const base = conch ? lin('#d8c4a4') : lin('#9c7a50');
  const band = conch ? lin('#b88a6a') : lin('#4e3622');
  const lip = conch ? lin('#e89a86') : lin('#d8c4a8');
  for (let i = 0; i <= nT; i++) {
    const th = (i / nT) * thetaMax;
    const R = Math.exp(k * (th - thetaMax));
    const a = R * ratio;
    const cx = Math.cos(th) * R, cz = Math.sin(th) * R, cy = -spire * R;
    const last = i / nT;
    for (let j = 0; j <= nS; j++) {
      const sa = (j / nS) * Math.PI * 2;
      // Aperture section: ellipse in the plane of the radial direction and the axis.
      let ra = a, ry = a * (conch ? 1.35 : 1.0);
      // Conch: knobs on the shoulder and a flared outer lip at the end.
      if (conch) {
        const shoulder = Math.max(0, Math.cos(sa - 0.6));
        ra *= 1 + 0.28 * shoulder * Math.max(0, Math.sin(th * 4.5)) * (1 - last * 0.3);
        if (last > 0.86) ra *= 1 + ((last - 0.86) / 0.14) * 0.9 * Math.max(0, Math.cos(sa));
      }
      const rx = Math.cos(sa) * ra, ryy = Math.sin(sa) * ry;
      const px = cx + Math.cos(th) * rx, pz = cz + Math.sin(th) * rx, py = cy + ryy;
      const growth = 0.5 + 0.5 * Math.sin(th * 30);
      let c = mix3(base, band, (conch ? 0.25 : 0.55) * smoothstep(0.3, 0.7, noise.noise(sa * 1.2, th * 0.4, 0.5) * 0.5 + 0.5));
      if (!conch) c = mix3(c, band, Math.pow(Math.abs(Math.sin(sa * 2 + 0.6)), 14) * 0.7);
      c = mul3(c, 0.9 + 0.1 * growth);
      if (last > 0.95) c = mix3(c, lip, (last - 0.95) / 0.05);
      // Inside of the aperture (toward the coil axis) is darker/pinker.
      if (conch && Math.cos(sa) < -0.2 && last > 0.8) c = mix3(c, lip, 0.6);
      pts.push([px, py, pz, ...c]);
      maxR = Math.max(maxR, Math.hypot(px, pz), Math.abs(py));
    }
  }
  // Normalize to the requested size, orient (axis = +y), then place.
  const sc = s.size / (2 * maxR);
  const [ex, ey, ez] = s.rot;
  const cxr = Math.cos(ex), sxr = Math.sin(ex), cyr = Math.cos(ey), syr = Math.sin(ey), czr = Math.cos(ez), szr = Math.sin(ez);
  const start = gb.count;
  for (const p of pts) {
    let x = p[0] * sc, y = (p[1] + spire * 0.5) * sc, z = p[2] * sc;
    // Euler XYZ (matches three): R = Rx·Ry·Rz applied to v → Rz first.
    let t = x * czr - y * szr;
    y = x * szr + y * czr;
    x = t;
    t = x * cyr + z * syr;
    z = -x * syr + z * cyr;
    x = t;
    t = y * cxr - z * sxr;
    z = y * sxr + z * cxr;
    y = t;
    gb.vertex([x + s.c[0], y + s.c[1], z + s.c[2]], [0, 1, 0], undefined, [p[3], p[4], p[5]], [x * 40, y * 40, z * 40]);
  }
  const w = nS + 1;
  for (let i = 0; i < nT; i++) {
    for (let j = 0; j < nS; j++) {
      const a = start + i * w + j, b = a + 1, c = a + w, d = c + 1;
      gb.tri(a, c, b);
      gb.tri(b, c, d);
    }
  }
}

// ---------------------------------------------------------------------------------------------
// Clay pleco cave
// ---------------------------------------------------------------------------------------------

function clayTubeGeometry(shape: DecorShape, seed: number): BufferGeometry {
  const t = shape.tube!;
  const L = t.len, ro = t.rOut, ri = t.rIn;
  const pts: Vector2[] = [];
  // Profile (r, y) with y along the tube: closed rounded back, straight wall, rounded lip, inner wall.
  for (let i = 0; i <= 6; i++) {
    const a = (i / 6) * (Math.PI / 2);
    pts.push(new Vector2(Math.sin(a) * ro, -L / 2 - Math.cos(a) * ro * 0.35));
  }
  for (let i = 1; i <= 10; i++) pts.push(new Vector2(ro, -L / 2 + (i / 10) * L));
  for (let i = 1; i <= 5; i++) {
    const a = (i / 5) * Math.PI;
    pts.push(new Vector2((ro + ri) / 2 + Math.cos(a) * (ro - ri) / 2, L / 2 + Math.sin(a) * (ro - ri) * 0.5));
  }
  for (let i = 1; i <= 10; i++) pts.push(new Vector2(ri, L / 2 - (i / 10) * (L - 0.006)));
  for (let i = 1; i <= 6; i++) {
    const a = (i / 6) * (Math.PI / 2);
    pts.push(new Vector2(Math.cos(a) * ri, -L / 2 + 0.006 - Math.sin(a) * ri * 0.3));
  }
  const lathe = new LatheGeometry(pts.reverse(), 28);
  // Lay it down: lathe axis y → z, raise to rest on the substrate.
  lathe.rotateX(Math.PI / 2);
  lathe.translate(0, t.axisY, 0);
  const pos = lathe.getAttribute('position');
  const nrm = lathe.getAttribute('normal');
  const noise = new Noise3(seed);
  const terracotta = lin('#9a5434'), fired = lin('#b4683e'), soot = lin('#3a2418');
  const gb = new GeoBuilder();
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i), y = pos.getY(i), z = pos.getZ(i);
    const rr = Math.hypot(x, y - t.axisY);
    const inner = rr < (ro + ri) / 2 - 0.0005 && z < L / 2 - 0.001;
    let c = mix3(terracotta, fired, noise.fbm(x * 40, y * 40, z * 40, 3) * 0.5 + 0.5);
    if (inner) c = mix3(c, soot, 0.55 + 0.4 * smoothstep(L / 2, -L / 2, z));
    c = mul3(c, 0.7 + 0.3 * smoothstep(0, 0.012, y));
    gb.vertex([x, y, z], [nrm.getX(i), nrm.getY(i), nrm.getZ(i)], undefined, c, [x, y, z]);
  }
  const idx = lathe.getIndex();
  if (idx) for (let i = 0; i < idx.count; i += 3) gb.tri(idx.getX(i), idx.getX(i + 1), idx.getX(i + 2));
  else for (let i = 0; i < pos.count; i += 3) gb.tri(i, i + 1, i + 2);
  lathe.dispose();
  return gb.build();
}

// ---------------------------------------------------------------------------------------------
// Airstones (+ airline tubing to the back glass)
// ---------------------------------------------------------------------------------------------

function airstoneObjects(item: DecorItem, shape: DecorShape, ctx: BuildCtx): Mesh[] {
  const a = shape.airstone!;
  const stone = new GeoBuilder();
  const plastic = new GeoBuilder();
  const ceramic = a.type === 'disc' ? lin('#d6d8d4') : lin('#7e8c92');
  const grey = lin('#2c3034');
  const ring = (gb: GeoBuilder, r: number, y0: number, y1: number, col: [number, number, number], top: boolean, axisX = false, len = 0) => {
    const seg = 20;
    const start = gb.count;
    for (let j = 0; j <= 1; j++) {
      for (let s = 0; s <= seg; s++) {
        const th = (s / seg) * Math.PI * 2;
        const c = Math.cos(th), sn = Math.sin(th);
        if (axisX) {
          const x = j === 0 ? -len / 2 : len / 2;
          gb.vertex([x, y0 + r + c * r, sn * r], [0, c, sn], undefined, col, [x, c * r, sn * r]);
        } else {
          const y = j === 0 ? y0 : y1;
          gb.vertex([c * r, y, sn * r], [c, 0, sn], undefined, col, [c * r, y, sn * r]);
        }
      }
    }
    const w = seg + 1;
    for (let s = 0; s < seg; s++) {
      gb.tri(start + s, start + w + s, start + s + 1);
      gb.tri(start + s + 1, start + w + s, start + w + s + 1);
    }
    if (top && !axisX) {
      const cTop = gb.vertex([0, y1, 0], [0, 1, 0], undefined, col, [0, y1, 0]);
      for (let s = 0; s < seg; s++) gb.tri(start + w + s, cTop, start + w + s + 1);
    }
  };
  let nipple: V3 = [0, 0.004, 0];
  if (a.type === 'cylinder') {
    ring(plastic, a.r * 1.05, -0.002, 0.004, grey, true);
    ring(stone, a.r, 0.004, a.h, ceramic, true);
    nipple = [a.r * 1.05, 0.002, 0];
  } else if (a.type === 'disc') {
    ring(plastic, a.r, -0.002, a.h * 0.75, grey, false);
    ring(stone, a.r * 0.88, a.h * 0.7, a.h * 0.8, ceramic, true);
    nipple = [a.r, 0.004, 0];
  } else {
    ring(stone, a.h * 0.5, 0, 0, ceramic, false, true, a.len);
    nipple = [a.len / 2, a.h * 0.5, 0];
  }
  const meshes: Mesh[] = [];
  const sm = new Mesh(stone.build(), hardscapeMaterial('airstone'));
  meshes.push(sm);
  if (plastic.count) meshes.push(new Mesh(plastic.build(), hardscapeMaterial('plastic')));
  // Airline tubing: along the sand to the back glass, then straight up to the rim.
  const xf = itemTransform(item);
  const b = tankBounds(ctx.tank);
  const wStart = toWorld(xf, nipple, [0, 0, 0]);
  const backZ = -b.halfD + 0.008;
  const pts: V3[] = [];
  const steps = 10;
  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    const x = wStart[0] + Math.sin(t * Math.PI) * 0.01;
    const z = wStart[2] + (backZ - wStart[2]) * t;
    pts.push([x, substrateHeight(ctx.tank, x, z) + 0.003 + 0.002 * Math.sin(t * 7), z]);
  }
  const top = b.height - 0.005;
  for (let i = 1; i <= 6; i++) pts.push([pts[steps][0], pts[steps][1] + (top - pts[steps][1]) * (i / 6), backZ]);
  const local = pts.map((p) => toLocal(xf, p, [0, 0, 0]));
  const tb = new GeoBuilder();
  addTubes(tb, [{ pts: local, r: local.map(() => 0.0024 / xf.s), parent: -1, depth: 0 }], { segments: () => 7, gnarl: 0, gnarlFreq: 1, capTips: false, subdiv: 2, seed: 1 });
  const tube = new Mesh(tb.build(), tubingMaterial());
  tube.renderOrder = 2;
  meshes.push(tube);
  return meshes;
}

// ---------------------------------------------------------------------------------------------
// Entry point
// ---------------------------------------------------------------------------------------------

export function buildDecor(item: DecorItem, ctx: BuildCtx): BuiltDecor {
  const shape = decorShape(item);
  const group = new Group();
  group.name = `decor:${item.id}`;
  const xf = itemTransform(item);
  group.position.set(...xf.pos);
  group.rotation.set(item.rotation[0], item.rotation[1], item.rotation[2]);
  group.scale.setScalar(xf.s);
  const meshes: Mesh[] = [];
  let positional = false;
  const add = (geo: BufferGeometry, mat: MeshStandardMaterial | MeshStandardMaterial[]) => {
    const m = new Mesh(geo, mat as MeshStandardMaterial);
    meshes.push(m);
  };
  switch (item.kind) {
    case 'rock':
    case 'cave':
      if (shape.sdf) add(sdfRockGeometry(item, shape, ctx.quality), hardscapeMaterial(shape.style));
      else if (shape.tube) add(clayTubeGeometry(shape, item.seed), hardscapeMaterial('clay-tube'));
      break;
    case 'driftwood':
      add(woodGeometry(item, shape, ctx.quality), hardscapeMaterial(shape.style));
      break;
    case 'coral-skeleton':
      add(woodGeometry(item, shape, ctx.quality), hardscapeMaterial('rubble'));
      break;
    case 'pebbles':
      add(pebbleGeometry(item, shape), hardscapeMaterial('pebbles'));
      break;
    case 'leaf-litter':
      add(litterGeometry(item, shape, ctx), litterMaterial(shape.style));
      positional = true;
      break;
    case 'shell':
      add(shellGeometry(shape), hardscapeMaterial('shell'));
      break;
    case 'airstone':
      meshes.push(...airstoneObjects(item, shape, ctx));
      positional = true;
      break;
  }
  for (const m of meshes) {
    m.castShadow = m.material !== tubingMaterial();
    m.receiveShadow = true;
    m.userData.decorId = item.id;
    group.add(m);
  }
  return { object: group, meshes, positional };
}

/** Dispose geometries of a built item (materials are shared). */
export function disposeDecor(b: BuiltDecor): void {
  for (const m of b.meshes) m.geometry.dispose();
  b.object.removeFromParent();
}

