/**
 * Geometry building blocks for procedural decor & plants: an accumulating geometry builder,
 * indexed icospheres, swept tubes along branch polylines (wood, stems, coral), leaf strips and
 * tentacles. Everything is built once per item/species and cached by the callers.
 */
import { BufferAttribute, BufferGeometry, Float32BufferAttribute, Uint32BufferAttribute } from 'three';
import type { Branch, V3 } from '../../decor/shapes';
import { Noise3 } from '../../decor/noise';

/** Accumulates vertex streams, then emits a BufferGeometry. */
export class GeoBuilder {
  pos: number[] = [];
  nrm: number[] = [];
  uv: number[] = [];
  col: number[] = [];
  det: number[] = [];
  idx: number[] = [];
  extra = new Map<string, { size: number; data: number[] }>();

  get count(): number {
    return this.pos.length / 3;
  }

  vertex(p: ArrayLike<number>, n: ArrayLike<number>, uv?: ArrayLike<number>, c?: ArrayLike<number>, d?: ArrayLike<number>): number {
    const i = this.count;
    this.pos.push(p[0], p[1], p[2]);
    this.nrm.push(n[0], n[1], n[2]);
    if (uv) this.uv.push(uv[0], uv[1]);
    if (c) this.col.push(c[0], c[1], c[2]);
    if (d) this.det.push(d[0], d[1], d[2]);
    return i;
  }

  attr(name: string, size: number, values: ArrayLike<number>): void {
    let e = this.extra.get(name);
    if (!e) this.extra.set(name, (e = { size, data: [] }));
    for (let i = 0; i < values.length; i++) e.data.push(values[i]);
  }

  tri(a: number, b: number, c: number): void {
    this.idx.push(a, b, c);
  }

  build(): BufferGeometry {
    const g = new BufferGeometry();
    const n = this.count;
    g.setAttribute('position', new Float32BufferAttribute(this.pos, 3));
    g.setAttribute('normal', new Float32BufferAttribute(this.nrm, 3));
    if (this.uv.length === n * 2) g.setAttribute('uv', new Float32BufferAttribute(this.uv, 2));
    if (this.col.length === n * 3) g.setAttribute('color', new Float32BufferAttribute(this.col, 3));
    if (this.det.length === n * 3) g.setAttribute('aDetail', new Float32BufferAttribute(this.det, 3));
    for (const [name, e] of this.extra) if (e.data.length === n * e.size) g.setAttribute(name, new Float32BufferAttribute(e.data, e.size));
    g.setIndex(n > 65535 ? new Uint32BufferAttribute(this.idx, 1) : new BufferAttribute(new Uint16Array(this.idx), 1));
    g.computeBoundingSphere();
    g.computeBoundingBox();
    return g;
  }
}

// ---------------------------------------------------------------------------------------------
// Icosphere
// ---------------------------------------------------------------------------------------------

const icoCache = new Map<number, { p: Float32Array; i: Uint32Array }>();

/** Unit icosphere (indexed, welded). detail 0..5. */
export function icosphere(detail: number): { p: Float32Array; i: Uint32Array } {
  const hit = icoCache.get(detail);
  if (hit) return hit;
  const t = (1 + Math.sqrt(5)) / 2;
  let verts: number[][] = [
    [-1, t, 0], [1, t, 0], [-1, -t, 0], [1, -t, 0], [0, -1, t], [0, 1, t], [0, -1, -t], [0, 1, -t], [t, 0, -1], [t, 0, 1], [-t, 0, -1], [-t, 0, 1],
  ].map((v) => {
    const l = Math.hypot(v[0], v[1], v[2]);
    return [v[0] / l, v[1] / l, v[2] / l];
  });
  let faces = [
    [0, 11, 5], [0, 5, 1], [0, 1, 7], [0, 7, 10], [0, 10, 11], [1, 5, 9], [5, 11, 4], [11, 10, 2], [10, 7, 6], [7, 1, 8],
    [3, 9, 4], [3, 4, 2], [3, 2, 6], [3, 6, 8], [3, 8, 9], [4, 9, 5], [2, 4, 11], [6, 2, 10], [8, 6, 7], [9, 8, 1],
  ];
  for (let d = 0; d < detail; d++) {
    const mid = new Map<string, number>();
    const m = (a: number, b: number) => {
      const key = a < b ? `${a}_${b}` : `${b}_${a}`;
      let r = mid.get(key);
      if (r === undefined) {
        const va = verts[a], vb = verts[b];
        const v = [(va[0] + vb[0]) / 2, (va[1] + vb[1]) / 2, (va[2] + vb[2]) / 2];
        const l = Math.hypot(v[0], v[1], v[2]);
        r = verts.length;
        verts.push([v[0] / l, v[1] / l, v[2] / l]);
        mid.set(key, r);
      }
      return r;
    };
    const nf: number[][] = [];
    for (const [a, b, c] of faces) {
      const ab = m(a, b), bc = m(b, c), ca = m(c, a);
      nf.push([a, ab, ca], [b, bc, ab], [c, ca, bc], [ab, bc, ca]);
    }
    faces = nf;
    verts = verts.slice();
  }
  const out = { p: new Float32Array(verts.flat()), i: new Uint32Array(faces.flat()) };
  icoCache.set(detail, out);
  return out;
}

// ---------------------------------------------------------------------------------------------
// Swept tubes along branch polylines
// ---------------------------------------------------------------------------------------------

export type TipStyle = 'round' | 'point' | 'broken' | 'open';

export interface TubeOptions {
  /** Radial segments for a given radius (m). */
  segments: (r: number) => number;
  /** Radius modulation amplitude (gnarls, knobs) relative to radius. */
  gnarl: number;
  gnarlFreq: number;
  /** Longitudinal grooves: amplitude relative to radius, count around. */
  grooves?: number;
  grooveCount?: number;
  /**
   * Irregular cross-section: oval / three-lobed sections that slowly twist along the branch
   * (wood is never a perfect cylinder). Amplitude relative to radius.
   */
  lobes?: number;
  /** Knots (bulging, darker branch scars) per meter of branches thicker than 3 mm. */
  knots?: number;
  /** Round off branch tips. */
  capTips: boolean;
  /**
   * Per-branch tip style (default: round when capTips). 'point' tapers to a fine point (twigs),
   * 'broken' leaves a jagged, splintered break, 'open' leaves the end open.
   */
  tip?: (endRadius: number, branch: number, depth: number) => TipStyle;
  /** Close the start of a branch too (trunk ends lying on the sand); default open. */
  capStart?: (startRadius: number, branch: number, depth: number, start: V3) => TipStyle;
  /** Subdivide each polyline segment (Catmull-Rom) for smooth curves. */
  subdiv: number;
  /**
   * Optional per-vertex color. `mark` is 0..1 where the surface is a knot (> 0 while on a knot)
   * or a fresh break (negative values, −1 at the broken face).
   */
  color?: (p: V3, n: V3, along: number, t: number, branch: number, depth: number, around: number, mark: number) => [number, number, number];
  /** Optional extra per-vertex attribute (e.g. plant sway data). */
  extra?: { name: string; size: number; fn: (p: V3, along: number, t: number, branch: number) => number[] };
  /** Hollow tube (cholla): inner wall at this fraction of the radius, open ends. */
  hollow?: number;
  seed: number;
}

function catmull(p0: V3, p1: V3, p2: V3, p3: V3, t: number): V3 {
  const t2 = t * t, t3 = t2 * t;
  const f = (a: number, b: number, c: number, d: number) => 0.5 * (2 * b + (-a + c) * t + (2 * a - 5 * b + 4 * c - d) * t2 + (-a + 3 * b - 3 * c + d) * t3);
  return [f(p0[0], p1[0], p2[0], p3[0]), f(p0[1], p1[1], p2[1], p3[1]), f(p0[2], p1[2], p2[2], p3[2])];
}

function norm3(v: V3): V3 {
  const l = Math.hypot(v[0], v[1], v[2]) || 1;
  return [v[0] / l, v[1] / l, v[2] / l];
}
function cross3(a: V3, b: V3): V3 {
  return [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
}

/** Append tubes for every branch to `gb`. */
export function addTubes(gb: GeoBuilder, branches: Branch[], o: TubeOptions): void {
  const noise = new Noise3(o.seed);
  branches.forEach((br, bi) => {
    if (br.pts.length < 2) return;
    // Smooth the polyline.
    const P: V3[] = [];
    const R: number[] = [];
    const n = br.pts.length;
    for (let i = 0; i < n - 1; i++) {
      const p0 = br.pts[Math.max(0, i - 1)], p1 = br.pts[i], p2 = br.pts[i + 1], p3 = br.pts[Math.min(n - 1, i + 2)];
      for (let s = 0; s < o.subdiv; s++) {
        const t = s / o.subdiv;
        P.push(catmull(p0, p1, p2, p3, t));
        R.push(br.r[i] + (br.r[i + 1] - br.r[i]) * t);
      }
    }
    P.push(br.pts[n - 1]);
    R.push(br.r[n - 1]);
    const m = P.length;
    // Arc length.
    const L: number[] = [0];
    for (let i = 1; i < m; i++) L.push(L[i - 1] + Math.hypot(P[i][0] - P[i - 1][0], P[i][1] - P[i - 1][1], P[i][2] - P[i - 1][2]));
    const total = L[m - 1] || 1;
    const tipStyle: TipStyle = o.hollow ? 'open' : o.tip ? o.tip(R[m - 1], bi, br.depth) : o.capTips ? 'round' : 'open';
    // A pointed tip tapers the last few rings toward the end.
    if (tipStyle === 'point') {
      const zone = Math.min(total * 0.5, R[0] * 6 + 0.006);
      for (let i = 0; i < m; i++) {
        const u = (total - L[i]) / zone;
        if (u < 1) R[i] *= 0.35 + 0.65 * Math.sqrt(Math.max(0, u));
      }
    }
    // Knots: a few bulging scars at random places on thicker branches.
    const knots: { s: number; th: number; size: number }[] = [];
    if (o.knots && R[0] > 0.003) {
      const count = Math.floor(total * o.knots + noise.noise(bi * 3.7, 0.5, 0.5) * 0.5 + 0.5);
      for (let k = 0; k < count; k++) {
        const h1 = noise.noise(bi * 1.31 + k * 7.1, 2.2, 0.3) * 0.5 + 0.5;
        const h2 = noise.noise(bi * 0.73 + k * 3.3, 5.1, 0.9) * 0.5 + 0.5;
        knots.push({ s: total * (0.12 + 0.76 * h1), th: h2 * Math.PI * 2, size: 0.7 + 0.6 * h1 });
      }
    }
    // Parallel-transport frames.
    const T: V3[] = [];
    for (let i = 0; i < m; i++) {
      const a = P[Math.max(0, i - 1)], b = P[Math.min(m - 1, i + 1)];
      T.push(norm3([b[0] - a[0], b[1] - a[1], b[2] - a[2]]));
    }
    let N: V3 = norm3(cross3(T[0], Math.abs(T[0][1]) < 0.9 ? [0, 1, 0] : [1, 0, 0]));
    const frames: { N: V3; B: V3 }[] = [];
    for (let i = 0; i < m; i++) {
      const t = T[i];
      const d = N[0] * t[0] + N[1] * t[1] + N[2] * t[2];
      N = norm3([N[0] - t[0] * d, N[1] - t[1] * d, N[2] - t[2] * d]);
      frames.push({ N, B: cross3(t, N) });
    }
    const segs = Math.max(3, o.segments(R[0]));
    const ringStart: number[] = [];
    const layers = o.hollow ? [1, o.hollow] : [1];
    const startIndexByLayer: number[][] = [];
    /** Outer radius scale and knot mark at (ring i, angle th). */
    const shapeAt = (i: number, th: number, c: number, s: number): [number, number] => {
      const along = L[i];
      let k = 1 + o.gnarl * noise.noise(along * o.gnarlFreq, c * 0.8 + bi * 1.3, s * 0.8);
      if (o.grooves) k *= 1 + o.grooves * Math.sin(th * (o.grooveCount ?? 5) + along * 22 + bi);
      if (o.lobes) {
        const ph2 = noise.noise(along * 6 + bi * 2.1, 1.7, 0.2) * 3.5, ph3 = noise.noise(along * 9 + bi * 1.4, 4.3, 0.6) * 4;
        k *= 1 + o.lobes * (0.65 * Math.cos(2 * th + ph2) + 0.35 * Math.cos(3 * th + ph3));
      }
      let mark = 0;
      for (const kn of knots) {
        const ds = (along - kn.s) / Math.max(0.002, R[i] * 1.1 * kn.size);
        if (ds > 3 || ds < -3) continue;
        let dth = Math.abs(th - kn.th) % (Math.PI * 2);
        if (dth > Math.PI) dth = Math.PI * 2 - dth;
        const w = Math.exp(-ds * ds - (dth / 0.75) ** 2);
        k *= 1 + 0.3 * w;
        mark = Math.max(mark, w);
      }
      return [k, mark];
    };
    for (const layer of layers) {
      const starts: number[] = [];
      for (let i = 0; i < m; i++) {
        starts.push(gb.count);
        const { N: Ni, B: Bi } = frames[i];
        const along = L[i];
        for (let a = 0; a <= segs; a++) {
          const th = (a / segs) * Math.PI * 2;
          const c = Math.cos(th), s = Math.sin(th);
          const dir: V3 = [Ni[0] * c + Bi[0] * s, Ni[1] * c + Bi[1] * s, Ni[2] * c + Bi[2] * s];
          let rr = R[i] * layer;
          let mark = 0;
          if (layer === 1) {
            const [k, mk] = shapeAt(i, a === segs ? 0 : th, c, s);
            rr *= k;
            mark = mk;
          }
          const p: V3 = [P[i][0] + dir[0] * rr, P[i][1] + dir[1] * rr, P[i][2] + dir[2] * rr];
          const nn: V3 = layer === 1 ? dir : [-dir[0], -dir[1], -dir[2]];
          const col = o.color ? o.color(p, nn, along, along / total, bi, br.depth, a / segs, mark) : undefined;
          gb.vertex(p, nn, [a / segs, along], col, [th * R[i], along, bi * 1.37 + (layer === 1 ? 0 : 0.5)]);
          if (o.extra) gb.attr(o.extra.name, o.extra.size, o.extra.fn(p, along, along / total, bi));
        }
      }
      startIndexByLayer.push(starts);
    }
    for (let li = 0; li < layers.length; li++) {
      const starts = startIndexByLayer[li];
      const inner = li === 1;
      for (let i = 0; i < m - 1; i++) {
        for (let a = 0; a < segs; a++) {
          const v0 = starts[i] + a, v1 = starts[i] + a + 1, v2 = starts[i + 1] + a, v3 = starts[i + 1] + a + 1;
          // Outer wall faces outward (normal = N·cos + B·sin); the hollow inner wall faces in.
          if (inner) {
            gb.tri(v0, v2, v1);
            gb.tri(v1, v2, v3);
          } else {
            gb.tri(v0, v1, v2);
            gb.tri(v1, v3, v2);
          }
        }
      }
    }
    ringStart.push(...startIndexByLayer[0]);
    if (o.hollow) {
      // Annular rims at both ends.
      for (const i of [0, m - 1]) {
        const so = startIndexByLayer[0][i], si = startIndexByLayer[1][i];
        for (let a = 0; a < segs; a++) {
          if (i === 0) {
            gb.tri(so + a, si + a, so + a + 1);
            gb.tri(so + a + 1, si + a, si + a + 1);
          } else {
            gb.tri(so + a, so + a + 1, si + a);
            gb.tri(so + a + 1, si + a + 1, si + a);
          }
        }
      }
      return;
    }
    /** Close an end: i = ring index, sgn = +1 at the tip, −1 at the start (reversed winding). */
    const cap = (i: number, sgn: 1 | -1, style: TipStyle): void => {
      if (style === 'open') return;
      const t: V3 = [T[i][0] * sgn, T[i][1] * sgn, T[i][2] * sgn];
      const { N: Ni, B: Bi } = frames[i];
      let prev = ringStart[i];
      const rTip = R[i];
      const tri = (a: number, b: number, c: number) => (sgn > 0 ? gb.tri(a, b, c) : gb.tri(a, c, b));
      const ringAt = (k: number, f: number, jag: number, mark: number): void => {
        const start = gb.count;
        for (let a = 0; a <= segs; a++) {
          const th = (a / segs) * Math.PI * 2;
          const c = Math.cos(th), s = Math.sin(th);
          const dir: V3 = [Ni[0] * c + Bi[0] * s, Ni[1] * c + Bi[1] * s, Ni[2] * c + Bi[2] * s];
          // Splinters: the break line wanders along the branch axis.
          const kk = k + (jag ? jag * (noise.noise(Math.cos(th) * 1.7 + bi + sgn, Math.sin(th) * 1.7, 3.3) * 0.8 + 0.6 * Math.max(0, noise.noise(th * 2.3 + bi, 0.4 + sgn, 7.7))) : 0);
          const ff = f * (style === 'round' || style === 'broken' ? shapeAt(i, a === segs ? 0 : th, c, s)[0] : 1);
          const p: V3 = [P[i][0] + dir[0] * rTip * ff + t[0] * rTip * kk, P[i][1] + dir[1] * rTip * ff + t[1] * rTip * kk, P[i][2] + dir[2] * rTip * ff + t[2] * rTip * kk];
          const nn = style === 'broken' && f < 0.9 ? t : norm3([dir[0] * f + t[0] * k, dir[1] * f + t[1] * k, dir[2] * f + t[2] * k]);
          const col = o.color ? o.color(p, nn, L[i], i === 0 ? 0 : 1, bi, br.depth, a / segs, mark) : undefined;
          gb.vertex(p, nn, [a / segs, L[i] + sgn * rTip * kk], col, [th * rTip, L[i] + sgn * rTip * kk, bi * 1.37]);
          if (o.extra) gb.attr(o.extra.name, o.extra.size, o.extra.fn(p, L[i], i === 0 ? 0 : 1, bi));
        }
        for (let a = 0; a < segs; a++) {
          tri(prev + a, prev + a + 1, start + a);
          tri(prev + a + 1, start + a + 1, start + a);
        }
        prev = start;
      };
      let tipK: number, tipMark = 0;
      if (style === 'broken') {
        // A snapped end: the wall runs on in splinters, then a rough, slightly sunken face.
        ringAt(0.25, 1.0, 1.1, -0.5);
        ringAt(0.35, 0.55, 0.9, -1);
        tipK = 0.1;
        tipMark = -1;
      } else if (style === 'point') {
        ringAt(0.9, 0.6, 0, 0);
        ringAt(2.2, 0.28, 0, 0);
        tipK = 3.6;
      } else {
        ringAt(0.55, 0.75, 0, 0);
        ringAt(0.9, 0.35, 0, 0);
        tipK = 1.05;
      }
      const tipP: V3 = [P[i][0] + t[0] * rTip * tipK, P[i][1] + t[1] * rTip * tipK, P[i][2] + t[2] * rTip * tipK];
      const col = o.color ? o.color(tipP, t, L[i], i === 0 ? 0 : 1, bi, br.depth, 0, tipMark) : undefined;
      const tip = gb.vertex(tipP, t, [0.5, L[i] + sgn * rTip], col, [0, L[i] + sgn * rTip, bi * 1.37]);
      if (o.extra) gb.attr(o.extra.name, o.extra.size, o.extra.fn(tipP, L[i], i === 0 ? 0 : 1, bi));
      for (let a = 0; a < segs; a++) tri(prev + a, prev + a + 1, tip);
    };
    cap(m - 1, 1, tipStyle);
    if (o.capStart) cap(0, -1, o.capStart(R[0], bi, br.depth, P[0]));
  });
}

// ---------------------------------------------------------------------------------------------
// Unit parts for instancing
// ---------------------------------------------------------------------------------------------

/**
 * Leaf strip: x ∈ [-0.5, 0.5] across, y ∈ [0, 1] along, front normal +z.
 * `fold` makes a V-shaped midrib crease (z offset ∝ |x|), `ruffle` waves the edges,
 * `cup` curls the edges toward +z.
 */
export function leafStrip(opts: { rows: number; cols?: number; fold?: number; ruffle?: number; ruffleFreq?: number; cup?: number }): BufferGeometry {
  const rows = Math.max(1, opts.rows);
  const cols = opts.cols ?? 3;
  const gb = new GeoBuilder();
  for (let j = 0; j <= rows; j++) {
    const v = j / rows;
    for (let i = 0; i < cols; i++) {
      const u = i / (cols - 1);
      const x = u - 0.5;
      const edge = Math.abs(x) * 2;
      let z = (opts.fold ?? 0) * Math.abs(x) + (opts.cup ?? 0) * x * x;
      if (opts.ruffle) z += opts.ruffle * edge * edge * Math.sin(v * (opts.ruffleFreq ?? 20) * Math.PI * 2 + (x > 0 ? 0 : 1.3));
      gb.vertex([x, v, z], [0, 0, 1], [u, v]);
    }
  }
  for (let j = 0; j < rows; j++) {
    for (let i = 0; i < cols - 1; i++) {
      const a = j * cols + i, b = a + 1, c = a + cols, d = c + 1;
      gb.tri(a, b, d);
      gb.tri(a, d, c);
    }
  }
  return gb.build();
}

/** Open cylinder of radius 1 from y=0 to y=1 (stems, petioles, roots, columns). */
export function unitCylinder(radial: number, rows = 1, capTop = false): BufferGeometry {
  const gb = new GeoBuilder();
  for (let j = 0; j <= rows; j++) {
    for (let a = 0; a <= radial; a++) {
      const th = (a / radial) * Math.PI * 2;
      const c = Math.cos(th), s = Math.sin(th);
      gb.vertex([c, j / rows, s], [c, 0, s], [a / radial, j / rows]);
    }
  }
  const w = radial + 1;
  for (let j = 0; j < rows; j++) {
    for (let a = 0; a < radial; a++) {
      const v0 = j * w + a;
      gb.tri(v0, v0 + w, v0 + 1);
      gb.tri(v0 + 1, v0 + w, v0 + w + 1);
    }
  }
  if (capTop) {
    const c = gb.vertex([0, 1, 0], [0, 1, 0], [0.5, 1]);
    const ring = rows * w;
    for (let a = 0; a < radial; a++) gb.tri(ring + a, c, ring + a + 1);
  }
  return gb.build();
}

/**
 * Tentacle / polyp along +y (0..1) with radius `rr` (fraction of length) tapering to the tip, and
 * an optional tip shape. Front normal for bending is +z.
 */
export function tentacle(opts: { rr: number; taper: number; tip: 'point' | 'bulb' | 'knob' | 'hammer' | 'branched' | 'flat'; rows?: number; radial?: number; tipScale?: number; tipDetail?: number }): BufferGeometry {
  const rows = opts.rows ?? 8;
  const radial = opts.radial ?? 6;
  const gb = new GeoBuilder();
  const rAt = (v: number) => opts.rr * (1 - opts.taper * v);
  for (let j = 0; j <= rows; j++) {
    const v = j / rows;
    const r = opts.tip === 'point' ? rAt(v) * (1 - Math.pow(v, 6)) + 0.0005 : rAt(v);
    for (let a = 0; a <= radial; a++) {
      const th = (a / radial) * Math.PI * 2;
      const c = Math.cos(th), s = Math.sin(th);
      gb.vertex([c * r, v, s * r], [c, 0, s], [a / radial, v]);
    }
  }
  const w = radial + 1;
  for (let j = 0; j < rows; j++) {
    for (let a = 0; a < radial; a++) {
      const v0 = j * w + a;
      gb.tri(v0, v0 + w, v0 + 1);
      gb.tri(v0 + 1, v0 + w, v0 + w + 1);
    }
  }
  const ts = opts.tipScale ?? 1;
  const blob = (cx: number, cy: number, cz: number, rx: number, ry: number, rz: number, detail = 1) => {
    const ico = icosphere(detail);
    const base = gb.count;
    for (let k = 0; k < ico.p.length; k += 3) {
      const x = ico.p[k], y = ico.p[k + 1], z = ico.p[k + 2];
      gb.vertex([cx + x * rx, cy + y * ry, cz + z * rz], norm3([x / rx, y / ry, z / rz]), [0.5, 1]);
    }
    for (let k = 0; k < ico.i.length; k += 3) gb.tri(base + ico.i[k], base + ico.i[k + 1], base + ico.i[k + 2]);
  };
  const rt = rAt(1);
  // Tip blobs are a few millimetres on screen: low-detail icospheres (detail 1 = 80 triangles).
  const td = opts.tipDetail ?? 1;
  switch (opts.tip) {
    case 'bulb':
      blob(0, 1, 0, rt * 2.0 * ts, rt * 2.4 * ts, rt * 2.0 * ts, td);
      break;
    case 'knob':
      blob(0, 1 + rt * 0.6, 0, rt * 1.5 * ts, rt * 1.5 * ts, rt * 1.5 * ts, td);
      break;
    case 'hammer':
      blob(0, 1, 0, rt * 4.5 * ts, rt * 1.4 * ts, rt * 1.6 * ts, td);
      break;
    case 'branched':
      for (let b = 0; b < 5; b++) {
        const a = (b / 5) * Math.PI * 2;
        blob(Math.cos(a) * rt * 1.6 * ts, 1 + (b % 2) * rt, Math.sin(a) * rt * 1.6 * ts, rt * 1.3 * ts, rt * 1.3 * ts, rt * 1.3 * ts, 0);
      }
      break;
    case 'flat': {
      const c = gb.vertex([0, 1, 0], [0, 1, 0], [0.5, 1]);
      const ring = rows * w;
      for (let a = 0; a < radial; a++) gb.tri(ring + a, c, ring + a + 1);
      break;
    }
    default:
      break;
  }
  return gb.build();
}

/** Unit sphere (radius 1) — bubbles, grapes, bulbs. */
export function unitSphere(detail: number): BufferGeometry {
  const ico = icosphere(detail);
  const gb = new GeoBuilder();
  for (let k = 0; k < ico.p.length; k += 3) {
    const p = [ico.p[k], ico.p[k + 1], ico.p[k + 2]];
    gb.vertex(p, p, [Math.atan2(p[2], p[0]) / (Math.PI * 2) + 0.5, p[1] * 0.5 + 0.5]);
  }
  for (let k = 0; k < ico.i.length; k += 3) gb.tri(ico.i[k], ico.i[k + 1], ico.i[k + 2]);
  return gb.build();
}

/**
 * Radial disc in the x-z plane facing +y, radius 1, with a height profile h(r, θ) — mushroom
 * corals, oral discs, lily pads, toadstool caps. uv = (polar → planar).
 */
export function disc(rings: number, segs: number, h: (r: number, th: number) => number, underside = false): BufferGeometry {
  const gb = new GeoBuilder();
  const c = gb.vertex([0, h(0, 0), 0], [0, 1, 0], [0.5, 0.5]);
  for (let j = 1; j <= rings; j++) {
    const r = j / rings;
    for (let a = 0; a < segs; a++) {
      const th = (a / segs) * Math.PI * 2;
      const x = Math.cos(th) * r, z = Math.sin(th) * r;
      gb.vertex([x, h(r, th), z], [0, 1, 0], [0.5 + x * 0.5, 0.5 + z * 0.5]);
    }
  }
  for (let a = 0; a < segs; a++) gb.tri(c, 1 + ((a + 1) % segs), 1 + a);
  for (let j = 1; j < rings; j++) {
    const r0 = 1 + (j - 1) * segs, r1 = 1 + j * segs;
    for (let a = 0; a < segs; a++) {
      const a1 = (a + 1) % segs;
      gb.tri(r0 + a, r0 + a1, r1 + a1);
      gb.tri(r0 + a, r1 + a1, r1 + a);
    }
  }
  if (underside) {
    // Slightly lowered mirror surface so the disc has thickness from below.
    const off = gb.count;
    const n = gb.count;
    for (let k = 0; k < n; k++) {
      gb.vertex([gb.pos[k * 3], gb.pos[k * 3 + 1] - 0.06, gb.pos[k * 3 + 2]], [0, -1, 0], [gb.uv[k * 2], gb.uv[k * 2 + 1]]);
    }
    const tris = gb.idx.length;
    for (let k = 0; k < tris; k += 3) gb.tri(gb.idx[k] + off, gb.idx[k + 2] + off, gb.idx[k + 1] + off);
  }
  const g = gb.build();
  g.computeVertexNormals();
  return g;
}
