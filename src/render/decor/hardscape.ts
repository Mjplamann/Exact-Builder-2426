/**
 * Procedural hardscape meshes. Every builder reads the same `decorShape()` parameters that the
 * collider code uses, then adds render-only detail (surface noise, pits, colors, AO).
 *
 * Geometry is in the item's local space; the returned group carries the item transform.
 */
import { BufferAttribute, BufferGeometry, Color, DoubleSide, Group, LatheGeometry, Mesh, MeshStandardMaterial, Vector2 } from 'three';
import type { DecorItem, Quality, TankState } from '../../core/types';
import { Rng } from '../../core/rng';
import { substrateHeight, tankBounds } from '../../core/tankGeometry';
import { Noise3, smax, smoothstep, clamp01 } from '../../decor/noise';
import {
  decorShape, itemTransform, projectToSurface, sdfEval, toLocal, toWorld,
  type Branch, type DecorShape, type LitterLeaf, type ShellPart, type V3,
} from '../../decor/shapes';
import { GeoBuilder, addTubes, icosphere } from './geom';
import { ROCK_CELLS, meshRock, type RockMeshData } from './rockMesh';
import { hardscapeMaterial, tubingMaterial } from './materials';
import { leafTexture } from './textures';
import { applyUnderwater } from '../underwater';

export interface BuildCtx {
  tank: TankState;
  quality: Quality;
  /** Pre-meshed SDF data (from the cache or the meshing worker); meshed here when absent. */
  rock?: RockMeshData;
  /** Mesh SDF items at this resolution instead of the quality's (placeholders). */
  rockCells?: number;
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

// ---------------------------------------------------------------------------------------------
// SDF rocks & caves (meshed by the pure mesher in rockMesh.ts — also run in a worker)
// ---------------------------------------------------------------------------------------------

/** Wrap mesher output in a BufferGeometry (attributes share the typed arrays). */
export function rockGeometry(data: RockMeshData): BufferGeometry {
  const g = new BufferGeometry();
  g.setAttribute('position', new BufferAttribute(data.positions, 3));
  g.setAttribute('normal', new BufferAttribute(data.normals, 3));
  g.setAttribute('color', new BufferAttribute(data.colors, 3));
  g.setAttribute('aDetail', new BufferAttribute(data.det, 3));
  const n = data.positions.length / 3;
  g.setIndex(n > 65535 ? new BufferAttribute(data.indices, 1) : new BufferAttribute(Uint16Array.from(data.indices), 1));
  g.computeBoundingSphere();
  g.computeBoundingBox();
  return g;
}

/** True if this item is meshed from an SDF (the expensive kind, worth building off-thread). */
export function isSdfDecor(item: Pick<DecorItem, 'kind' | 'variant' | 'seed'>): boolean {
  return (item.kind === 'rock' || item.kind === 'cave') && !!decorShape(item).sdf;
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
  /** Oval / lobed cross-section amplitude. */
  lobes: number;
  /** Knots per meter of thicker branches. */
  knots: number;
  /** Fine render-only twigs per meter of branches (spiderwood crowns, broken side shoots). */
  twigs: number;
  /** Sun-bleached, silvery weathering on upper faces (0..1). */
  weather: number;
  /** Color of knots and of fresh breaks. */
  knot: string;
  fresh: string;
}

const WOOD_LOOK: Record<string, WoodLook> = {
  spiderwood: { a: '#8e6c4a', b: '#b8966c', dark: '#4e3a28', gnarl: 0.14, gnarlFreq: 40, lobes: 0.12, knots: 4, twigs: 26, weather: 0.25, knot: '#4a3220', fresh: '#c8a878' },
  'redmoor-root': { a: '#6c3e2c', b: '#8c5440', dark: '#3a2016', gnarl: 0.12, gnarlFreq: 45, lobes: 0.1, knots: 4, twigs: 18, weather: 0.15, knot: '#2e1a10', fresh: '#a8724e' },
  manzanita: { a: '#6e3a2a', b: '#8e4e38', dark: '#3e2018', gnarl: 0.06, gnarlFreq: 25, lobes: 0.08, knots: 3, twigs: 6, weather: 0.12, knot: '#3a1c12', fresh: '#b07a52' },
  mopani: { a: '#3e2618', b: '#4e301e', dark: '#24160c', gnarl: 0.28, gnarlFreq: 14, twoTone: '#a8855a', lobes: 0.2, knots: 3, twigs: 0, weather: 0.1, knot: '#1e120a', fresh: '#a8855a' },
  malaysian: { a: '#44301f', b: '#5e422c', dark: '#24180f', gnarl: 0.16, gnarlFreq: 18, grooves: 0.12, lobes: 0.16, knots: 3, twigs: 0, weather: 0.15, knot: '#1e140c', fresh: '#7a5a3a' },
  cholla: { a: '#a88c64', b: '#c2a67a', dark: '#5e4a32', gnarl: 0.04, gnarlFreq: 20, lobes: 0.03, knots: 0, twigs: 0, weather: 0.1, knot: '#5e4a32', fresh: '#c2a67a' },
  branchwood: { a: '#6e5a46', b: '#9a8266', dark: '#3a2e24', gnarl: 0.1, gnarlFreq: 30, lobes: 0.1, knots: 5, twigs: 5, weather: 0.35, knot: '#30241a', fresh: '#b0946c' },
  rubble: { a: '#dcd2bc', b: '#ece4d2', dark: '#9c907a', gnarl: 0.18, gnarlFreq: 60, lobes: 0.15, knots: 0, twigs: 0, weather: 0, knot: '#9c907a', fresh: '#f2ecdc' },
};

/**
 * Render-only fine twigs (not part of the shared shape, so colliders and epiphyte anchors are
 * unaffected): short, tapering side shoots and broken stubs along the wood.
 */
function woodTwigs(branches: Branch[], perMeter: number, seed: number, sizeK: number): Branch[] {
  if (perMeter <= 0) return [];
  const rng = new Rng(seed ^ 0x7a1c);
  const out: Branch[] = [];
  for (const b of branches) {
    let len = 0;
    for (let i = 1; i < b.pts.length; i++) len += Math.hypot(b.pts[i][0] - b.pts[i - 1][0], b.pts[i][1] - b.pts[i - 1][1], b.pts[i][2] - b.pts[i - 1][2]);
    // Thick trunks carry fewer twigs than the fine crown.
    const n = Math.floor(len * perMeter * (b.depth > 0 ? 1.4 : 0.6) + rng.next());
    for (let k = 0; k < n; k++) {
      const i = 1 + Math.floor(rng.next() * Math.max(1, b.pts.length - 2));
      if (i >= b.pts.length - 1) continue;
      const base = b.pts[i];
      if (base[1] < 0.004) continue; // not under the sand
      const tan = vnorm3([b.pts[i + 1][0] - b.pts[i - 1][0], b.pts[i + 1][1] - b.pts[i - 1][1], b.pts[i + 1][2] - b.pts[i - 1][2]]);
      const rnd = vnorm3([rng.range(-1, 1), rng.range(-0.4, 1), rng.range(-1, 1)]);
      let d = vnorm3([tan[0] * 0.55 + rnd[0], tan[1] * 0.55 + rnd[1] + 0.25, tan[2] * 0.55 + rnd[2]]);
      const r0 = Math.min(b.r[i] * 0.45, 0.0017 * sizeK) * rng.range(0.7, 1.1);
      if (r0 < 0.0005) continue;
      // Some are long, wiry shoots; many are short stubs.
      const L = (rng.chance(0.35) ? rng.range(0.03, 0.065) : rng.range(0.008, 0.025)) * sizeK;
      const steps = 4;
      const pts: V3[] = [[base[0] - d[0] * b.r[i] * 0.5, base[1] - d[1] * b.r[i] * 0.5, base[2] - d[2] * b.r[i] * 0.5]];
      const rs: number[] = [r0];
      let p = pts[0];
      for (let s = 1; s <= steps; s++) {
        d = vnorm3([d[0] + rng.range(-0.25, 0.25), d[1] + rng.range(-0.2, 0.25), d[2] + rng.range(-0.25, 0.25)]);
        p = [p[0] + d[0] * (L / steps), p[1] + d[1] * (L / steps), p[2] + d[2] * (L / steps)];
        if (p[1] < 0.002) p[1] = 0.002;
        pts.push(p);
        rs.push(r0 * (1 - 0.55 * (s / steps)));
      }
      out.push({ pts, r: rs, parent: -1, depth: b.depth + 1 });
    }
  }
  return out;
}

function vnorm3(v: V3): V3 {
  const l = Math.hypot(v[0], v[1], v[2]) || 1;
  return [v[0] / l, v[1] / l, v[2] / l];
}

function woodGeometry(item: DecorItem, shape: DecorShape, quality: Quality): BufferGeometry {
  const rubble = shape.kind === 'coral-skeleton';
  const look = WOOD_LOOK[rubble ? 'rubble' : shape.style] ?? WOOD_LOOK.branchwood;
  const noise = new Noise3(item.seed ^ 0x77);
  const prng = new Rng(item.seed ^ 0x3d17);
  const q = quality === 'low' ? 0.6 : quality === 'medium' ? 0.8 : quality === 'ultra' ? 1.25 : 1;
  // Every piece of wood has its own tone: lighter/darker, warmer/cooler.
  const tone = prng.range(0.84, 1.14);
  const warm: [number, number, number] = [1 + prng.range(-0.05, 0.07), 1, 1 - prng.range(-0.05, 0.08)];
  const A = mul3(lin(look.a), tone), B = mul3(lin(look.b), tone), D = lin(look.dark), T2 = look.twoTone ? lin(look.twoTone) : null;
  const K = lin(look.knot), F = lin(look.fresh);
  const gb = new GeoBuilder();
  const branches = shape.branches ?? [];
  // Twigs are generated in the item's local space at natural size (scale is applied by the group).
  const twigs = quality === 'low' ? [] : woodTwigs(branches, look.twigs * (quality === 'medium' ? 0.7 : 1), item.seed, 1);
  const all = twigs.length ? [...branches, ...twigs] : branches;
  const nShape = branches.length;
  addTubes(gb, all, {
    segments: (r) => Math.round((r > 0.02 ? 14 : r > 0.008 ? 10 : r > 0.004 ? 7 : r > 0.0018 ? 5 : 4) * q),
    gnarl: look.gnarl,
    gnarlFreq: look.gnarlFreq,
    grooves: look.grooves,
    grooveCount: 5,
    lobes: look.lobes,
    knots: look.knots,
    capTips: !shape.hollow,
    // Fine ends taper to points; anything thicker ended in a break (driftwood is snapped wood).
    tip: (r, bi) => (bi >= nShape || r < 0.0028 ? 'point' : rubble ? 'round' : 'broken'),
    // Trunk butts lying on (not buried in) the sand are snapped off too.
    capStart: (r, bi, depth, start) => (shape.hollow || depth > 0 || bi >= nShape || start[1] < -r * 0.6 ? 'open' : rubble ? 'round' : 'broken'),
    subdiv: quality === 'low' ? 1 : 2,
    hollow: shape.hollow ? 0.78 : undefined,
    seed: item.seed,
    color: (p, n, along, t, bi, depth, _around, mark) => {
      const g = noise.fbm(along * 9 + bi, p[1] * 3, bi * 0.7, 3) * 0.5 + 0.5;
      let c = mix3(A, B, smoothstep(0.25, 0.8, g));
      // Grain: long streaks along the fibres, from fine lines to broad bands.
      const ang = Math.atan2(n[2], n[0]);
      const streak = noise.noise(along * 2.5 + bi * 3, ang * 1.2, 0.3) * 0.6 + noise.noise(along * 7 + bi, ang * 3.1, 2.7) * 0.4;
      c = mul3(c, 0.84 + 0.3 * (streak * 0.5 + 0.5));
      if (T2) {
        // Mopani: pale sapwood showing through dark heartwood in sandblasted patches.
        const s = noise.fbm(along * 6 + bi * 2, n[0] * 1.5, n[2] * 1.5 + p[1] * 8, 3) * 0.5 + 0.5;
        c = mix3(c, T2, smoothstep(0.48, 0.6, s) * 0.85);
      }
      // Weathering: upper faces bleach toward silver-grey, patchily.
      if (look.weather > 0) {
        const lum = (c[0] + c[1] + c[2]) / 3;
        const silver: [number, number, number] = [lum * 1.35, lum * 1.33, lum * 1.28];
        const patch = smoothstep(0.35, 0.75, noise.fbm(p[0] * 30 + 5, p[1] * 30, p[2] * 30, 2) * 0.5 + 0.5);
        c = mix3(c, silver, look.weather * smoothstep(0.1, 0.85, n[1]) * (0.4 + 0.6 * patch));
      }
      if (mark > 0) c = mix3(c, K, Math.min(1, mark * 1.2) * 0.8);
      else if (mark < 0) c = mix3(c, F, -mark * 0.75);
      // Crotches (young branch bases) and undersides are shaded; contact with sand darker still.
      let a = 1;
      if (depth > 0) a *= 0.72 + 0.28 * smoothstep(0, 0.12, t);
      a *= 0.8 + 0.2 * clamp01(n[1] * 0.5 + 0.6);
      a *= rubble ? 0.85 + 0.15 * smoothstep(-0.003, 0.01, p[1]) : 0.6 + 0.4 * smoothstep(-0.005, 0.025, p[1]);
      c = mix3(c, D, (1 - a) * 0.6);
      c = mul3(c, 0.75 + 0.25 * a);
      return [c[0] * warm[0], c[1] * warm[1], c[2] * warm[2]];
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
  // Escargot shells are 3–4 cm: a lighter sweep keeps a cluster of them to a few thousand tris.
  const nT = Math.round(turns * (conch ? 30 : 20)), nS = conch ? 20 : 14;
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
      if (shape.sdf) add(rockGeometry(ctx.rock ?? meshRock(item, ctx.rockCells ?? ROCK_CELLS[ctx.quality])), hardscapeMaterial(shape.style));
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

