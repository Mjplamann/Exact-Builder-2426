import type { BufferGeometry } from 'three';
import type { ResolvedBody } from './archetypes';
import { buildFishParts, lodFor, type FishGeometryInfo } from './fishGeometry';
import { PART, type GeoBuilder } from './geometryBuilder';

/**
 * Seahorse: the loft can't express an upright animal whose head sits at a right angle to the
 * trunk and whose prehensile tail curls forward. We build a straight "unrolled" seahorse with the
 * normal body/eye/fin builders (tube snout, coronet hump, bony rings, fan dorsal fin) and warp it
 * along a planar centerline: snout → head (horizontal) → neck bend → upright trunk with a pot
 * belly → tail curling forward into a spiral.
 *
 * Length convention: straightened length (coronet to tail tip) = 1, like a ruler laid along it.
 */

const bump = (x: number, c: number, w: number) => Math.exp(-(((x - c) / w) ** 2));

/** Curvature (rad per unit length) along the unrolled body. */
function curvature(x: number): number {
  if (x < 0.19) return 0;
  if (x < 0.29) return 18.5; // neck: head turns ~100° to the upright trunk
  if (x < 0.5) return -1.6; // trunk: gently convex back, belly forward
  const t = (x - 0.5) / 0.5;
  return 1.5 + 17 * Math.pow(t, 1.6); // tail curls forward and up into a spiral
}

export function buildSeahorse(body: ResolvedBody, detail: number): { body: BufferGeometry; fins: BufferGeometry; info: FishGeometryInfo } {
  const male = false;
  // The unrolled body plan (proportions of Hippocampus: snout ~0.4 head, head ~0.2 length).
  const straight: ResolvedBody = {
    ...body,
    kind: 'fish',
    depth: Math.max(0.1, Math.min(0.2, body.depth * 0.55)),
    width: Math.max(0.06, Math.min(0.12, body.width * 0.6)),
    depthPos: 0.36,
    widthPos: 0.34,
    headLength: 0.22,
    snout: 'tubular',
    snoutLength: 0.09,
    mouth: 'terminal',
    mouthSize: 0.08,
    eyeSize: Math.max(0.2, Math.min(0.32, body.eyeSize)),
    eyeHeight: 0.35,
    peduncle: 0.25,
    belly: 0.9,
    hump: 0.6,
    tailTaper: 1,
    caudal: { shape: 'none', size: 0 },
    dorsal: body.dorsal ?? { start: 0.44, end: 0.54, height: 0.06, shape: 'fan', trail: 0 },
    dorsal2: null,
    anal: null,
    pelvic: null,
    pectoral: body.pectoral ?? { start: 0.25, end: 0.26, height: 0.045, shape: 'fan', trail: 0 },
    barbels: 0,
    adipose: false,
    section: 'boxy',
    skin: 'rings',
  };
  if (straight.dorsal) straight.dorsal = { ...straight.dorsal, shape: 'fan', start: Math.max(0.4, straight.dorsal.start), end: Math.min(0.58, Math.max(straight.dorsal.end, straight.dorsal.start + 0.08)) };
  const lod = lodFor(12, true);
  lod.rings = Math.round(lod.rings * detail);
  const { gb, fb, prof } = buildFishParts(straight, lod);

  // Integrate the centerline: tangent angle φ(x), position C(x).
  const N = 400;
  const cx = new Float64Array(N + 1), cy = new Float64Array(N + 1), ph = new Float64Array(N + 1);
  let phi = Math.PI - 0.22; // snout tip → head runs back and slightly up
  let px = 0, py = 0;
  for (let i = 0; i <= N; i++) {
    const x = i / N;
    cx[i] = px;
    cy[i] = py;
    ph[i] = phi;
    const dx = 1 / N;
    phi += curvature(x + dx / 2) * dx;
    px += Math.cos(phi) * dx;
    py += Math.sin(phi) * dx;
  }
  const sample = (x: number) => {
    const f = Math.min(N, Math.max(0, x * N));
    const i = Math.min(N - 1, Math.floor(f));
    const t = f - i;
    return [cx[i] + (cx[i + 1] - cx[i]) * t, cy[i] + (cy[i + 1] - cy[i]) * t, ph[i] + (ph[i + 1] - ph[i]) * t];
  };
  // Bounds for centering.
  let minX = 1e9, maxX = -1e9, minY = 1e9, maxY = -1e9;
  for (let i = 0; i <= N; i++) {
    minX = Math.min(minX, cx[i]);
    maxX = Math.max(maxX, cx[i]);
    minY = Math.min(minY, cy[i]);
    maxY = Math.max(maxY, cy[i]);
  }
  const ox = (minX + maxX) / 2, oy = (minY + maxY) / 2;
  const centerY = prof.centerY;

  // Warp: straight (x along, y dorsal, z left) → curled (X forward, Y up, Z right).
  const warp = (g: GeoBuilder) => {
    const p = g.pos, n = g.nor, f = g.fin, s = g.spine;
    for (let i = 0, vi = 0; i < p.length; i += 3, vi++) {
      const x = Math.min(1, Math.max(0, p[i]));
      const extra = p[i] - x; // beyond the ends (snout tip / tail)
      let y = p[i + 1] - centerY;
      let z = p[i + 2];
      // Neck pinch, big head, pot belly (and brood pouch).
      const radial = 1 - 0.28 * bump(x, 0.27, 0.035) + 0.12 * bump(x, 0.16, 0.05);
      y *= radial;
      z *= radial;
      if (y < 0) y *= 1 + 0.35 * bump(x, 0.42, 0.08) + (male ? 0.5 * bump(x, 0.5, 0.05) : 0);
      const [Cx, Cy, a] = sample(x);
      const tx = Math.cos(a), ty = Math.sin(a);
      // Dorsal normal Nd = (ty, −tx); lateral B = (0, 0, −1) maps straight +z (left) to −Z.
      p[i] = Cx + tx * extra + ty * y - ox;
      p[i + 1] = Cy + ty * extra - tx * y - oy;
      p[i + 2] = -z;
      const nx = n[i], ny = n[i + 1], nz = n[i + 2];
      n[i] = tx * nx + ty * ny;
      n[i + 1] = ty * nx - tx * ny;
      n[i + 2] = -nz;
      const part = s[vi * 4 + 1];
      const fi = vi * 4;
      if (part === PART.eye) {
        const ex = Math.min(1, Math.max(0, f[fi]));
        const [Ex, Ey, ea] = sample(ex);
        const ey = (f[fi + 1] - centerY) * (1 + 0.12 * bump(ex, 0.16, 0.05));
        const etx = Math.cos(ea), ety = Math.sin(ea);
        f[fi] = Ex + ety * ey - ox;
        f[fi + 1] = Ey - etx * ey - oy;
        f[fi + 2] = -f[fi + 2];
      } else if (part !== PART.body) {
        const zf = f[fi + 2];
        const side = Math.floor(zf / 4 + 0.5);
        f[fi + 2] = -side * 4 + (zf - side * 4);
      }
    }
  };
  warp(gb);
  warp(fb);

  const half: [number, number, number] = [(maxX - minX) / 2 + 0.03, (maxY - minY) / 2 + 0.03, straight.width * 0.6];
  return {
    body: gb.build(),
    fins: fb.build(),
    info: { slLocal: 1, xSnout: maxX - ox, caudalLen: 0, half, profile: prof },
  };
}
