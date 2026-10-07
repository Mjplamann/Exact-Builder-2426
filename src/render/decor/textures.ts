/**
 * Procedural leaf / frond / root textures drawn on canvas: real leaf silhouettes (alpha cutout)
 * with midrib, secondary venation, mottling, spots and edge tone. Colors are baked in sRGB per
 * species; per-instance tints add individual variation on top.
 */
import { CanvasTexture, LinearMipmapLinearFilter, ClampToEdgeWrapping, SRGBColorSpace, type Texture } from 'three';
import { Rng } from '../../core/rng';
import { Noise3 } from '../../decor/noise';

export type LeafOutline =
  | 'lanceolate' | 'ovate' | 'round' | 'needle' | 'strap' | 'heart' | 'obovate' | 'elliptic' | 'sagittate'
  | 'oak' | 'fan' | 'pinnate' | 'windelov' | 'trident' | 'lobed-hygro' | 'clover4' | 'clover3' | 'lace'
  | 'feather-whorl' | 'needle-fork' | 'moss' | 'root' | 'feathery-root' | 'squiggle' | 'star-polyp' | 'fern-frond' | 'spoon' | 'grape'
  | 'carpet-mat';

export interface LeafTexSpec {
  outline: LeafOutline;
  width: number;
  height: number;
  base: string;
  /** Color toward the tip (red tips, younger growth). */
  tip?: string;
  /** Vein color (usually a lighter tint of base). */
  vein?: string;
  veins?: 'pinnate' | 'parallel' | 'palmate' | 'none' | 'net';
  /** Fraction of the length that is petiole (stalk). */
  petiole?: number;
  spots?: { color: string; density: number; size: number };
  /** Bands across the leaf (tiger vallisneria). */
  bands?: { color: string; count: number };
  /** Edge waviness amplitude (fraction of half-width). */
  wavy?: number;
  /** Dry leaf (litter): mottled browns, holes, darker margin. */
  dry?: boolean;
  /** Fine sparkle dots (bucephalandra). */
  sparkle?: string;
  seed: number;
}

const cache = new Map<string, Texture>();

/** Get (or draw) a leaf texture. Cached by spec. */
export function leafTexture(spec: LeafTexSpec): Texture {
  const key = JSON.stringify(spec);
  const hit = cache.get(key);
  if (hit) return hit;
  const canvas = document.createElement('canvas');
  canvas.width = spec.width;
  canvas.height = spec.height;
  // CPU-backed canvas: thousands of tiny draw ops are far cheaper than on a GPU canvas.
  const ctx = canvas.getContext('2d', { willReadFrequently: true })!;
  drawLeaf(ctx, spec);
  const tex = new CanvasTexture(canvas);
  tex.colorSpace = SRGBColorSpace;
  tex.wrapS = tex.wrapT = ClampToEdgeWrapping;
  tex.minFilter = LinearMipmapLinearFilter;
  tex.anisotropy = 4;
  const mips = coverageMipmaps(canvas, ctx, LEAF_ALPHA_CUTOFF);
  if (mips) {
    tex.mipmaps = mips;
    tex.generateMipmaps = false;
  } else tex.generateMipmaps = true;
  tex.needsUpdate = true;
  cache.set(key, tex);
  return tex;
}

/** Alpha cutoff of the plant materials (alphaTest) — mip coverage is preserved around it. */
const LEAF_ALPHA_CUTOFF = 0.45;

/**
 * Coverage-preserving mip chain for alpha-tested foliage. Box-filtered mips average a fine
 * leaf's alpha toward grey, so at viewing distance moss, hairgrass and feathery whorls either
 * vanish (thin strokes fall under the cutoff) or fuse into solid blobs that read as big ivy
 * leaves. Each level's alpha is rescaled so the fraction of texels above the cutoff matches
 * the full-resolution leaf (Castaño 2010). Returns null where 2-D canvases are unavailable.
 */
function coverageMipmaps(canvas: HTMLCanvasElement, ctx: CanvasRenderingContext2D, cutoff: number): HTMLCanvasElement[] | null {
  const W = canvas.width, H = canvas.height;
  if ((W & (W - 1)) !== 0 || (H & (H - 1)) !== 0) return null;
  const base = ctx.getImageData(0, 0, W, H)?.data;
  if (!base || base.length !== W * H * 4) return null;
  const thr = cutoff * 255;
  let covered = 0;
  for (let i = 3; i < base.length; i += 4) if (base[i] > thr) covered++;
  const target = covered / (W * H);
  const out: HTMLCanvasElement[] = [canvas];
  let prev: HTMLCanvasElement = canvas;
  let w = W, h = H;
  while (w > 1 || h > 1) {
    w = Math.max(1, w >> 1);
    h = Math.max(1, h >> 1);
    const c = document.createElement('canvas');
    c.width = w;
    c.height = h;
    const cx = c.getContext('2d', { willReadFrequently: true });
    if (!cx) return null;
    cx.imageSmoothingEnabled = true;
    cx.drawImage(prev, 0, 0, w, h);
    const img = cx.getImageData(0, 0, w, h);
    const d = img?.data;
    if (!d || d.length !== w * h * 4) return null;
    if (target > 0) {
      // Binary search the alpha scale that restores the original coverage.
      let lo = 0.25, hi = 6;
      for (let it = 0; it < 12; it++) {
        const mid = (lo + hi) / 2;
        let n = 0;
        for (let i = 3; i < d.length; i += 4) if (d[i] * mid > thr) n++;
        if (n / (w * h) < target) lo = mid;
        else hi = mid;
      }
      // Bounded: very sparse leaves (feathery whorls, hair-thin needles) would otherwise be
      // boosted into a speckled haze at distance; letting them thin out reads more naturally.
      const k = Math.min(1.8, Math.max(0.6, (lo + hi) / 2));
      for (let i = 3; i < d.length; i += 4) d[i] = Math.min(255, d[i] * k);
      cx.putImageData(img, 0, 0);
    }
    out.push(c);
    prev = c;
  }
  return out;
}


// ---------------------------------------------------------------------------------------------

function hex(c: string): [number, number, number] {
  const n = parseInt(c.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}
function rgb(c: [number, number, number], a = 1): string {
  return `rgba(${Math.round(c[0])},${Math.round(c[1])},${Math.round(c[2])},${a})`;
}
function mix(a: [number, number, number], b: [number, number, number], t: number): [number, number, number] {
  return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
}
function scale(a: [number, number, number], s: number): [number, number, number] {
  return [Math.min(255, a[0] * s), Math.min(255, a[1] * s), Math.min(255, a[2] * s)];
}

/** Half-width (0..1 of the canvas half-width) of the blade at v (0 base → 1 tip). */
function bladeWidth(outline: LeafOutline, v: number): number {
  switch (outline) {
    case 'lanceolate':
      return Math.pow(Math.sin(Math.PI * Math.pow(v, 0.75)), 0.85) * (1 - Math.pow(v, 8) * 0.2);
    case 'elliptic':
      return Math.pow(Math.sin(Math.PI * v), 0.8);
    case 'ovate':
      return Math.pow(Math.sin(Math.PI * Math.pow(v, 0.62)), 0.7);
    case 'obovate':
      return Math.pow(Math.sin(Math.PI * Math.pow(v, 1.45)), 0.65);
    case 'spoon':
      return Math.pow(Math.sin(Math.PI * Math.pow(v, 1.9)), 0.6) * 0.9 + 0.08 * (1 - v);
    case 'round':
      return Math.sqrt(Math.max(0, 1 - Math.pow(2 * v - 1, 2)));
    case 'heart':
    case 'sagittate': {
      // Cordate: lobes at the base, pointed tip.
      const body = Math.pow(Math.sin(Math.PI * Math.pow(v, 0.55)), 0.75);
      return Math.min(1, body + (v < 0.12 ? 0.15 : 0));
    }
    case 'strap':
    case 'needle':
      return v < 0.94 ? 1 - v * 0.15 : Math.sqrt(Math.max(0, 1 - Math.pow((v - 0.94) / 0.06, 2))) * (1 - v * 0.15);
    default:
      return Math.pow(Math.sin(Math.PI * Math.pow(v, 0.7)), 0.8);
  }
}

function drawLeaf(ctx: CanvasRenderingContext2D, s: LeafTexSpec): void {
  const W = s.width, H = s.height;
  const rng = new Rng(s.seed);
  const base = hex(s.base);
  const tip = s.tip ? hex(s.tip) : base;
  const vein = s.vein ? hex(s.vein) : scale(base, 1.25);
  ctx.clearRect(0, 0, W, H);

  // Special outlines with their own painters.
  switch (s.outline) {
    case 'feather-whorl':
      return paintFan(ctx, W, H, base, tip, rng, s.outline);
    case 'fan':
      return paintFan(ctx, W, H, base, tip, rng, s.outline);
    case 'needle-fork':
      return paintNeedleFork(ctx, W, H, base, tip, rng);
    case 'moss':
      return paintMoss(ctx, W, H, base, tip, rng);
    case 'root':
    case 'feathery-root':
      return paintRoot(ctx, W, H, base, tip, rng, s.outline === 'feathery-root');
    case 'squiggle':
      return paintSquiggle(ctx, W, H, base, tip, rng);
    case 'star-polyp':
      return paintStarPolyp(ctx, W, H, base, tip, rng);
    case 'fern-frond':
      return paintFernFrond(ctx, W, H, base, tip, rng);
    case 'carpet-mat':
      return paintCarpetMat(ctx, W, H, base, tip, rng);
    default:
      break;
  }

  const pet = s.petiole ?? 0;
  const cx = W / 2;
  const half = W / 2 - 1;
  const toY = (v: number) => H - 1 - v * (H - 2);
  const waviness = s.wavy ?? 0;
  const edgeNoise = (v: number, side: number) => 1 + waviness * Math.sin(v * 38 + side * 1.7) * 0.5 + waviness * 0.5 * Math.sin(v * 91 + side);

  // Silhouette path.
  const path = new Path2D();
  const N = 120;
  const pts: [number, number][] = [];
  const widthAt = (v: number, side: number): number => {
    if (v < pet) return Math.max(1.2, half * 0.07) / half;
    const bv = (v - pet) / (1 - pet);
    let w = bladeWidth(s.outline, bv);
    if (s.outline === 'oak') {
      const lobes = 4.5;
      w = Math.pow(Math.sin(Math.PI * Math.pow(bv, 0.8)), 0.7) * (0.62 + 0.38 * Math.pow(Math.abs(Math.sin(bv * Math.PI * lobes)), 0.6));
    } else if (s.outline === 'lobed-hygro' || s.outline === 'pinnate') {
      const lobes = s.outline === 'pinnate' ? 7 : 5;
      const env = Math.pow(Math.sin(Math.PI * Math.pow(bv, 0.8)), 0.8);
      const lobe = Math.pow(Math.max(0, Math.sin(bv * Math.PI * lobes * 2 + side * 0.9)), 0.5);
      w = env * (0.18 + 0.82 * lobe);
    } else if (s.outline === 'windelov' || s.outline === 'trident') {
      w = bladeWidth('lanceolate', bv) * (s.outline === 'trident' ? 0.55 : 1);
    } else if (s.outline === 'clover4' || s.outline === 'clover3') {
      w = bladeWidth('round', bv);
    } else if (s.outline === 'grape') {
      w = 0.15;
    }
    return w * edgeNoise(v, side);
  };
  for (let i = 0; i <= N; i++) {
    const v = i / N;
    pts.push([cx - widthAt(v, -1) * half, toY(v)]);
  }
  for (let i = N; i >= 0; i--) {
    const v = i / N;
    pts.push([cx + widthAt(v, 1) * half, toY(v)]);
  }
  path.moveTo(pts[0][0], pts[0][1]);
  for (const p of pts) path.lineTo(p[0], p[1]);
  path.closePath();

  ctx.save();
  if (s.outline === 'windelov' || s.outline === 'trident' || s.outline === 'clover4' || s.outline === 'clover3' || s.outline === 'lace') {
    ctx.fillStyle = '#000';
  }
  ctx.clip(path);

  // Base fill: gradient base → tip, slightly darker toward the margins.
  const g = ctx.createLinearGradient(0, H, 0, 0);
  g.addColorStop(0, rgb(scale(base, 0.85)));
  g.addColorStop(Math.max(0.01, pet), rgb(base));
  g.addColorStop(0.7, rgb(mix(base, tip, 0.35)));
  g.addColorStop(1, rgb(tip));
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, W, H);
  const mg = ctx.createLinearGradient(0, 0, W, 0);
  mg.addColorStop(0, 'rgba(0,0,0,0.22)');
  mg.addColorStop(0.3, 'rgba(0,0,0,0)');
  mg.addColorStop(0.7, 'rgba(0,0,0,0)');
  mg.addColorStop(1, 'rgba(0,0,0,0.22)');
  ctx.fillStyle = mg;
  ctx.fillRect(0, 0, W, H);

  if (s.bands) {
    for (let i = 0; i < s.bands.count; i++) {
      const y = rng.range(0, H);
      ctx.fillStyle = rgb(hex(s.bands.color), rng.range(0.25, 0.55));
      ctx.fillRect(0, y, W, rng.range(H * 0.004, H * 0.012));
    }
  }
  if (s.spots) {
    const sc = hex(s.spots.color);
    const n = Math.round(s.spots.density * 60);
    for (let i = 0; i < n; i++) {
      const x = rng.range(0, W), y = rng.range(0, H * (1 - pet * 0.9));
      const rx = s.spots.size * W * rng.range(0.4, 1.2), ry = rx * rng.range(0.6, 1.4);
      ctx.fillStyle = rgb(sc, rng.range(0.45, 0.85));
      ctx.beginPath();
      ctx.ellipse(x, y, rx, ry, rng.range(0, Math.PI), 0, Math.PI * 2);
      ctx.fill();
    }
  }

  // Venation.
  const veinStyle = s.veins ?? 'pinnate';
  const midW = Math.max(1, W * (veinStyle === 'parallel' ? 0.025 : 0.045));
  ctx.strokeStyle = rgb(vein, 0.85);
  ctx.lineWidth = midW;
  ctx.beginPath();
  ctx.moveTo(cx, H);
  ctx.lineTo(cx, toY(0.985));
  ctx.stroke();
  const blade0 = pet;
  if (veinStyle === 'pinnate' || veinStyle === 'net') {
    const pairs = s.outline === 'lanceolate' ? 14 : 9;
    ctx.lineWidth = Math.max(0.6, midW * 0.38);
    ctx.strokeStyle = rgb(vein, 0.5);
    for (let i = 1; i < pairs; i++) {
      const v = blade0 + (1 - blade0) * (i / pairs) * 0.95;
      const y = toY(v);
      for (const side of [-1, 1]) {
        const w = widthAt(Math.min(1, v + 0.06), side) * half * 0.95;
        ctx.beginPath();
        ctx.moveTo(cx, y);
        ctx.quadraticCurveTo(cx + side * w * 0.5, y - H * 0.02, cx + side * w, y - H * (s.outline === 'lanceolate' ? 0.06 : 0.04));
        ctx.stroke();
      }
    }
    if (veinStyle === 'net' || s.dry) {
      ctx.lineWidth = 0.5;
      ctx.strokeStyle = rgb(vein, 0.18);
      for (let i = 0; i < 70; i++) {
        const x = rng.range(0, W), y = rng.range(0, H);
        ctx.beginPath();
        ctx.moveTo(x, y);
        ctx.lineTo(x + rng.range(-W * 0.08, W * 0.08), y + rng.range(-H * 0.03, H * 0.03));
        ctx.stroke();
      }
    }
  } else if (veinStyle === 'parallel') {
    ctx.lineWidth = Math.max(0.5, W * 0.012);
    ctx.strokeStyle = rgb(vein, 0.3);
    for (let k = 1; k < 6; k++) {
      for (const side of [-1, 1]) {
        const x = cx + side * (k / 6) * half * 0.9;
        ctx.beginPath();
        ctx.moveTo(x, H);
        ctx.lineTo(x * 0.92 + cx * 0.08, toY(0.95));
        ctx.stroke();
      }
    }
  } else if (veinStyle === 'palmate') {
    ctx.lineWidth = Math.max(0.6, midW * 0.4);
    ctx.strokeStyle = rgb(vein, 0.55);
    const oy = toY(blade0 + 0.05);
    for (let k = -3; k <= 3; k++) {
      const a = (k / 3) * 1.25;
      ctx.beginPath();
      ctx.moveTo(cx, oy);
      ctx.lineTo(cx + Math.sin(a) * half, oy - Math.cos(a) * (H - (H - oy)) * 0.95);
      ctx.stroke();
    }
  }

  // Mottling and fine speckle in one pixel pass (cell texture, blotches; dry leaves blotchier).
  mottle(ctx, W, H, s.seed, s.dry ? 0.32 : 0.09, s.dry ? 0.1 : 0.06);
  if (s.sparkle) {
    const sc = hex(s.sparkle);
    for (let i = 0; i < 90; i++) {
      ctx.fillStyle = rgb(sc, rng.range(0.4, 0.9));
      ctx.fillRect(rng.range(0, W), rng.range(0, H * 0.95), 1.2, 1.2);
    }
  }
  if (s.dry) {
    // Dark, brittle margin and a few decay holes.
    ctx.lineWidth = Math.max(1.5, W * 0.03);
    ctx.strokeStyle = 'rgba(40,20,8,0.55)';
    ctx.stroke(path);
    ctx.globalCompositeOperation = 'destination-out';
    for (let i = 0; i < rng.int(0, 4); i++) {
      ctx.beginPath();
      ctx.ellipse(rng.range(W * 0.2, W * 0.8), rng.range(H * 0.2, H * 0.85), rng.range(W * 0.02, W * 0.07), rng.range(H * 0.01, H * 0.03), rng.range(0, 3), 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalCompositeOperation = 'source-over';
  } else {
    ctx.lineWidth = Math.max(1, W * 0.02);
    ctx.strokeStyle = rgb(scale(base, 0.7), 0.5);
    ctx.stroke(path);
  }
  ctx.restore();

  // Cut-outs for compound outlines.
  ctx.globalCompositeOperation = 'destination-out';
  if (s.outline === 'windelov' || s.outline === 'trident') {
    // Forked tips: notch the upper part repeatedly.
    const forks = s.outline === 'trident' ? 2 : 5;
    for (let i = 0; i < forks; i++) {
      const x = cx + (i - (forks - 1) / 2) * (half * (s.outline === 'trident' ? 0.5 : 0.32));
      const depth = s.outline === 'trident' ? 0.45 : rng.range(0.08, 0.2);
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x - W * 0.035, toY(1 - depth));
      ctx.lineTo(x + W * 0.035, toY(1 - depth));
      ctx.closePath();
      ctx.fill();
    }
  } else if (s.outline === 'clover4' || s.outline === 'clover3') {
    // Lobes separated by thin slits radiating from the center.
    const n = s.outline === 'clover4' ? 4 : 3;
    ctx.lineWidth = W * 0.05;
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2 + Math.PI / 4;
      ctx.beginPath();
      ctx.moveTo(cx + Math.cos(a) * W * 0.05, H / 2 + Math.sin(a) * H * 0.05);
      ctx.lineTo(cx + Math.cos(a) * W, H / 2 + Math.sin(a) * H);
      ctx.stroke();
    }
  } else if (s.outline === 'lace') {
    // Madagascar lace plant: only the vein lattice remains.
    for (let y = 0; y < H * (1 - pet); y += H * 0.022) {
      for (let x = 0; x < W; x += W * 0.11) {
        ctx.fillRect(x + W * 0.02, y + H * 0.004, W * 0.07, H * 0.013);
      }
    }
  } else if (s.outline === 'heart' || s.outline === 'sagittate') {
    // Basal notch.
    const y0 = toY(pet);
    ctx.beginPath();
    ctx.moveTo(cx, toY(pet + 0.08));
    ctx.lineTo(cx - W * 0.12, y0 + 2);
    ctx.lineTo(cx + W * 0.12, y0 + 2);
    ctx.closePath();
    if (pet < 0.05) ctx.fill();
  }
  ctx.globalCompositeOperation = 'source-over';
}

/** Cabomba fan / feathery whorl leaf: palmately forked filaments radiating from the base. */
function paintFan(ctx: CanvasRenderingContext2D, W: number, H: number, base: [number, number, number], tip: [number, number, number], rng: Rng, kind: LeafOutline): void {
  const ox = W / 2, oy = H - 2;
  const rays = kind === 'fan' ? 9 : 7;
  const spread = kind === 'fan' ? 1.25 : 0.55;
  const draw = (x: number, y: number, a: number, len: number, w: number, depth: number) => {
    const ex = x + Math.sin(a) * len, ey = y - Math.cos(a) * len;
    const g = ctx.createLinearGradient(x, y, ex, ey);
    g.addColorStop(0, rgb(base));
    g.addColorStop(1, rgb(mix(base, tip, 0.6 + depth * 0.15)));
    ctx.strokeStyle = g;
    ctx.lineWidth = w;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.quadraticCurveTo(x + Math.sin(a) * len * 0.5 + rng.range(-1, 1), y - Math.cos(a) * len * 0.5, ex, ey);
    ctx.stroke();
    if (depth < 3) {
      const n = 2;
      for (let i = 0; i < n; i++) draw(ex, ey, a + (i - 0.5) * rng.range(0.25, 0.5), len * 0.62, Math.max(0.8, w * 0.75), depth + 1);
    }
  };
  for (let i = 0; i < rays; i++) {
    const a = ((i / (rays - 1)) - 0.5) * 2 * spread;
    draw(ox, oy, a, H * (kind === 'fan' ? 0.36 : 0.4) * (1 - Math.abs(a) * 0.15), Math.max(1.2, W * 0.025), 0);
  }
}

/** Hornwort / rotala wallichii needle leaf, forked once or twice. */
function paintNeedleFork(ctx: CanvasRenderingContext2D, W: number, H: number, base: [number, number, number], tip: [number, number, number], rng: Rng): void {
  const cx = W / 2;
  ctx.lineCap = 'round';
  const g = ctx.createLinearGradient(0, H, 0, 0);
  g.addColorStop(0, rgb(scale(base, 0.85)));
  g.addColorStop(1, rgb(tip));
  ctx.strokeStyle = g;
  ctx.lineWidth = Math.max(1.5, W * 0.18);
  ctx.beginPath();
  ctx.moveTo(cx, H);
  ctx.lineTo(cx, H * 0.45);
  ctx.stroke();
  ctx.lineWidth = Math.max(1.2, W * 0.13);
  for (const side of [-1, 1]) {
    ctx.beginPath();
    ctx.moveTo(cx, H * 0.47);
    ctx.quadraticCurveTo(cx + side * W * 0.12, H * 0.25, cx + side * W * rng.range(0.22, 0.32), 2);
    ctx.stroke();
  }
}

/** Moss sprig: a wiry stem with tiny overlapping leaves along it, branching. */
function paintMoss(ctx: CanvasRenderingContext2D, W: number, H: number, base: [number, number, number], tip: [number, number, number], rng: Rng): void {
  const branch = (x: number, y: number, a: number, len: number, depth: number) => {
    const steps = Math.max(4, Math.round(len / 3));
    let px = x, py = y, ang = a;
    for (let i = 0; i < steps; i++) {
      ang += rng.range(-0.12, 0.12);
      const nx = px + Math.sin(ang) * (len / steps), ny = py - Math.cos(ang) * (len / steps);
      const t = (H - ny) / H;
      ctx.strokeStyle = rgb(mix(scale(base, 0.75), tip, t * 0.8));
      ctx.lineWidth = Math.max(1.5, W * 0.04);
      ctx.beginPath();
      ctx.moveTo(px, py);
      ctx.lineTo(nx, ny);
      ctx.stroke();
      // Tiny leaves either side.
      for (const side of [-1, 1]) {
        ctx.fillStyle = rgb(mix(base, tip, t * 0.7 + rng.range(-0.1, 0.1)), 0.9);
        ctx.beginPath();
        ctx.ellipse(nx + side * W * 0.04, ny, W * 0.055, H * 0.02, ang + side * 0.7, 0, Math.PI * 2);
        ctx.fill();
      }
      if (depth < 2 && rng.chance(0.3)) branch(nx, ny, ang + rng.range(0.4, 0.9) * (rng.chance(0.5) ? 1 : -1), len * rng.range(0.35, 0.55), depth + 1);
      px = nx;
      py = ny;
    }
  };
  branch(W / 2, H - 1, 0, H * 0.95, 0);
}

/** Floating-plant roots: a pale root with fine lateral hairs (feathery: long branched hairs). */
function paintRoot(ctx: CanvasRenderingContext2D, W: number, H: number, base: [number, number, number], tip: [number, number, number], rng: Rng, feathery: boolean): void {
  const cx = W / 2;
  ctx.lineCap = 'round';
  ctx.strokeStyle = rgb(base, 0.95);
  ctx.lineWidth = Math.max(1.2, W * 0.07);
  ctx.beginPath();
  ctx.moveTo(cx, H);
  ctx.bezierCurveTo(cx + W * 0.05, H * 0.6, cx - W * 0.04, H * 0.3, cx, 1);
  ctx.stroke();
  const hairs = feathery ? 90 : 40;
  for (let i = 0; i < hairs; i++) {
    const y = rng.range(H * 0.05, H * 0.92);
    const side = rng.chance(0.5) ? 1 : -1;
    const len = W * (feathery ? rng.range(0.2, 0.48) : rng.range(0.06, 0.18));
    ctx.strokeStyle = rgb(mix(base, tip, y / H), feathery ? 0.6 : 0.45);
    ctx.lineWidth = 0.7;
    ctx.beginPath();
    ctx.moveTo(cx, y);
    ctx.lineTo(cx + side * len, y + len * 0.5);
    ctx.stroke();
  }
}

/** Chaetomorpha: tangled, wiry filaments. */
function paintSquiggle(ctx: CanvasRenderingContext2D, W: number, H: number, base: [number, number, number], tip: [number, number, number], rng: Rng): void {
  ctx.lineCap = 'round';
  for (let k = 0; k < 7; k++) {
    let x = rng.range(0, W), y = rng.range(0, H);
    let a = rng.range(0, Math.PI * 2);
    ctx.strokeStyle = rgb(mix(base, tip, rng.next()), 0.95);
    ctx.lineWidth = Math.max(1, W * 0.025);
    ctx.beginPath();
    ctx.moveTo(x, y);
    for (let i = 0; i < 40; i++) {
      a += rng.range(-0.6, 0.6);
      x = Math.min(W - 1, Math.max(1, x + Math.cos(a) * W * 0.04));
      y = Math.min(H - 1, Math.max(1, y + Math.sin(a) * H * 0.04));
      ctx.lineTo(x, y);
    }
    ctx.stroke();
  }
}

/** Eight-armed star polyp (GSP, clove polyps) seen from above. */
function paintStarPolyp(ctx: CanvasRenderingContext2D, W: number, H: number, base: [number, number, number], tip: [number, number, number], rng: Rng): void {
  const cx = W / 2, cy = H / 2;
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2 + rng.range(-0.1, 0.1);
    const len = W * 0.46;
    const g = ctx.createLinearGradient(cx, cy, cx + Math.cos(a) * len, cy + Math.sin(a) * len);
    g.addColorStop(0, rgb(scale(tip, 1.1)));
    g.addColorStop(1, rgb(mix(tip, base, 0.25)));
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.ellipse(cx + Math.cos(a) * len * 0.5, cy + Math.sin(a) * len * 0.5, len * 0.5, W * 0.055, a, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.fillStyle = rgb(scale(tip, 0.6));
  ctx.beginPath();
  ctx.arc(cx, cy, W * 0.07, 0, Math.PI * 2);
  ctx.fill();
}

/** Fern-like frond (Christmas / phoenix moss): a triangular pinnate frond. */
function paintFernFrond(ctx: CanvasRenderingContext2D, W: number, H: number, base: [number, number, number], tip: [number, number, number], rng: Rng): void {
  const cx = W / 2;
  ctx.lineCap = 'round';
  ctx.strokeStyle = rgb(scale(base, 0.8));
  ctx.lineWidth = Math.max(2, W * 0.05);
  ctx.beginPath();
  ctx.moveTo(cx, H);
  ctx.lineTo(cx, 2);
  ctx.stroke();
  const n = 14;
  for (let i = 1; i < n; i++) {
    const v = i / n;
    const y = H - v * H;
    const len = (1 - v) * W * 0.46 + W * 0.04;
    for (const side of [-1, 1]) {
      ctx.strokeStyle = rgb(mix(base, tip, v + rng.range(-0.1, 0.1)));
      ctx.lineWidth = Math.max(2, W * 0.07);
      ctx.beginPath();
      ctx.moveTo(cx, y);
      ctx.quadraticCurveTo(cx + side * len * 0.6, y - H * 0.01, cx + side * len, y - H * 0.03);
      ctx.stroke();
    }
  }
}

/** Low-frequency blotches + per-pixel speckle applied to opaque pixels. */
/**
 * Per-texel speckle value in [0, 1). A plain XOR of two multiplicative hashes keeps the top bits
 * of each term a slow sawtooth (period ≈ 11 texels across, ≈ 6 along), which painted a regular
 * diamond lattice over every leaf — invisible across the room, a checkered net at 6× zoom. The
 * finalizer mixes the bits so neighbouring texels are independent.
 */
export function speckleHash(x: number, y: number, seed: number): number {
  let h = Math.imul(x + 1, 374761393) ^ Math.imul(y + 7, 668265263) ^ Math.imul(seed | 0, 1274126177);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
}

function mottle(ctx: CanvasRenderingContext2D, W: number, H: number, seed: number, blotch: number, speckle: number): void {
  const img = ctx.getImageData(0, 0, W, H);
  const d = img.data;
  const noise = new Noise3(seed);
  const fx = 6 / W, fy = 6 / Math.max(W, H * 0.5);
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const i = (y * W + x) * 4;
      if (d[i + 3] === 0) continue;
      const n = noise.fbm(x * fx, y * fy, 0.37, 3);
      const h = speckleHash(x, y, seed) - 0.5;
      const f = 1 + n * blotch * 1.6 + h * speckle * 2;
      d[i] = Math.min(255, d[i] * f * (n > 0 ? 1 + n * blotch * 0.3 : 1));
      d[i + 1] = Math.min(255, d[i + 1] * f);
      d[i + 2] = Math.min(255, d[i + 2] * f * (n > 0 ? 1 - n * blotch * 0.2 : 1));
    }
  }
  ctx.putImageData(img, 0, 0);
}

// ---------------------------------------------------------------------------------------------
// Radial patterns (mushroom corals, zoanthid & anemone oral discs, candy-cane caps)
// ---------------------------------------------------------------------------------------------

export interface RadialTexSpec {
  base: string;
  /** Mouth / center color. */
  center: string;
  /** Outer rim color (zoanthid skirt, mushroom margin). */
  rim?: string;
  /** Radial stripes (count, darkness 0..1). */
  stripes?: { count: number; amount: number; color?: string };
  /** Speckles / spots. */
  spots?: { color: string; density: number; size: number };
  /** Concentric ring at a fraction of the radius. */
  ring?: { at: number; width: number; color: string };
  size?: number;
  seed: number;
}

const radialCache = new Map<string, Texture>();

/** A round, radially patterned texture (uv = planar projection of a unit disc). */
export function radialTexture(spec: RadialTexSpec): Texture {
  const key = JSON.stringify(spec);
  const hit = radialCache.get(key);
  if (hit) return hit;
  const N = spec.size ?? 128;
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = N;
  const ctx = canvas.getContext('2d', { willReadFrequently: true })!;
  const img = ctx.createImageData(N, N);
  const d = img.data;
  const base = hex(spec.base), center = hex(spec.center), rim = spec.rim ? hex(spec.rim) : base;
  const stripeCol = spec.stripes?.color ? hex(spec.stripes.color) : scale(base, 0.6);
  const noise = new Noise3(spec.seed);
  const rng = new Rng(spec.seed);
  const spots: [number, number, number][] = [];
  if (spec.spots) for (let i = 0; i < spec.spots.density * 80; i++) spots.push([rng.range(-1, 1), rng.range(-1, 1), spec.spots.size * rng.range(0.5, 1.3)]);
  const spotCol = spec.spots ? hex(spec.spots.color) : base;
  const ringCol = spec.ring ? hex(spec.ring.color) : base;
  for (let y = 0; y < N; y++) {
    for (let x = 0; x < N; x++) {
      const u = (x + 0.5) / N * 2 - 1, v = (y + 0.5) / N * 2 - 1;
      const r = Math.hypot(u, v);
      const a = Math.atan2(v, u);
      let c = mix(center, base, Math.min(1, Math.max(0, (r - 0.08) / 0.22)));
      if (spec.rim) c = mix(c, rim, Math.min(1, Math.max(0, (r - 0.62) / 0.3)));
      if (spec.ring) c = mix(c, ringCol, Math.max(0, 1 - Math.abs(r - spec.ring.at) / spec.ring.width));
      if (spec.stripes) {
        const sline = Math.pow(Math.abs(Math.sin(a * spec.stripes.count * 0.5 + noise.noise(r * 3, a, 0.5) * 0.6)), 6);
        c = mix(c, stripeCol, sline * spec.stripes.amount * Math.min(1, r * 3));
      }
      for (const s of spots) {
        const dd = Math.hypot(u - s[0], v - s[1]);
        if (dd < s[2]) c = mix(c, spotCol, Math.min(1, (s[2] - dd) / (s[2] * 0.4)) * 0.85);
      }
      const n = noise.fbm(u * 5, v * 5, 0.2, 3);
      c = scale(c, 1 + n * 0.15);
      const i = (y * N + x) * 4;
      d[i] = c[0];
      d[i + 1] = c[1];
      d[i + 2] = c[2];
      d[i + 3] = 255;
    }
  }
  ctx.putImageData(img, 0, 0);
  const tex = new CanvasTexture(canvas);
  tex.colorSpace = SRGBColorSpace;
  tex.minFilter = LinearMipmapLinearFilter;
  tex.anisotropy = 4;
  radialCache.set(key, tex);
  return tex;
}

/** A patch of densely packed tiny leaves (carpet underlayer), fading out at a soft round edge. */
function paintCarpetMat(ctx: CanvasRenderingContext2D, W: number, H: number, base: [number, number, number], tip: [number, number, number], rng: Rng): void {
  const cx = W / 2, cy = H / 2, R = Math.min(W, H) / 2 - 1;
  // Shadowed depths of the mat first, then layers of leaves getting lighter toward the top.
  for (let layer = 0; layer < 3; layer++) {
    const n = layer === 0 ? 140 : 220;
    for (let i = 0; i < n; i++) {
      const a = rng.range(0, Math.PI * 2), r = Math.sqrt(rng.next()) * R * (layer === 0 ? 0.85 : 0.97);
      const x = cx + Math.cos(a) * r, y = cy + Math.sin(a) * r;
      const lr = W * rng.range(0.025, 0.045);
      const shade = (0.45 + layer * 0.22) * rng.range(0.85, 1.12);
      const c = mix(base, tip, rng.next() * 0.5);
      ctx.fillStyle = rgb(scale(c, shade));
      ctx.beginPath();
      ctx.ellipse(x, y, lr, lr * rng.range(0.6, 0.9), rng.range(0, Math.PI), 0, Math.PI * 2);
      ctx.fill();
      if (layer === 2 && rng.chance(0.5)) {
        ctx.fillStyle = rgb(scale(c, shade * 1.25), 0.5);
        ctx.beginPath();
        ctx.ellipse(x - lr * 0.2, y - lr * 0.2, lr * 0.4, lr * 0.25, 0.6, 0, Math.PI * 2);
        ctx.fill();
      }
    }
  }
}
