/**
 * Corals and anemones (the "plants" of a reef): soft corals with swaying polyps, mushroom and
 * zoanthid colonies, large-polyp stony corals with long sweeping tentacles and fluorescent tips,
 * massive brain corals with fleshy corallites, branching SPS, sea fans and anemones.
 *
 * Polyps extend by day and retract at night (aLeaf.w + DECOR_UNIFORMS.uPolyp); xenia pulses;
 * fluorescent tissue glows under blue light (patchPlant fluorescence).
 */
import { Color, DoubleSide, Float32BufferAttribute, Mesh, MeshStandardMaterial, type BufferGeometry } from 'three';
import type { PlantSpecies } from '../../../core/types';
import { Noise3, smoothstep } from '../../../decor/noise';
import { sampleHostSurface, type V3 } from '../../../decor/shapes';
import { anemoneDisc } from '../../../decor/plantMetrics';
import { GeoBuilder } from '../geom';
import { applyUnderwater } from '../../underwater';
import { patchPlant, patchSurfaceDetail, type SurfaceDetail } from '../shaders';
import { radialTexture } from '../textures';
import { discPart, leafPart, spherePart, stemPart, tentaclePart } from './parts';
import { flexOf } from './style';
import { growSprigs, sprigMesh, type Sprig } from './flora';
import {
  add, basis, dirAround, lin, mixRGB, mulRGB, norm, pushInst, pushLeaf, pushSegment, scl, tint, use,
  type GenArgs, type Inst, type RGB,
} from './kit';

const UP: V3 = [0, 1, 0];
const has = (sp: PlantSpecies, re: RegExp) => re.test(sp.id) || re.test(sp.scientificName.toLowerCase());
const cm = (v: number | undefined, d: number) => (v ?? d) / 100;

type Style =
  | 'toadstool' | 'finger' | 'tree' | 'xenia' | 'gsp' | 'clove'
  | 'disc' | 'hairy' | 'ricordea' | 'zoa' | 'palythoa'
  | 'hammer' | 'frogspawn' | 'torch' | 'elegance' | 'duncan' | 'acan' | 'favia' | 'favites' | 'goniopora' | 'trachy' | 'plate' | 'candy' | 'bubble'
  | 'acro' | 'tenuis' | 'staghorn' | 'table' | 'cap' | 'digitata' | 'birdsnest' | 'stylophora' | 'pocillopora'
  | 'fan' | 'rod' | 'plume'
  | 'bta' | 'carpet' | 'sebae' | 'rockflower';

export function coralStyle(sp: PlantSpecies): Style {
  switch (sp.form) {
    case 'soft-coral':
      return has(sp, /sarcophyton|toadstool/) ? 'toadstool' : has(sp, /capnella|kenya/) ? 'tree' : has(sp, /xenia/) ? 'xenia' : has(sp, /briareum|star-polyp|pachyclavularia/) ? 'gsp' : has(sp, /clavularia|clove/) ? 'clove' : 'finger';
    case 'mushroom-coral':
      return has(sp, /ricordea/) ? 'ricordea' : has(sp, /rhodactis|hairy/) ? 'hairy' : 'disc';
    case 'zoanthid':
      return has(sp, /palythoa|protopalythoa/) ? 'palythoa' : 'zoa';
    case 'lps-coral':
      if (has(sp, /ancora|hammer/)) return 'hammer';
      if (has(sp, /divisa|frogspawn/)) return 'frogspawn';
      if (has(sp, /glabrescens|torch/)) return 'torch';
      if (has(sp, /catalaphyllia|elegance/)) return 'elegance';
      if (has(sp, /duncan/)) return 'duncan';
      if (has(sp, /micromussa|acanthastrea|lordhowensis|acan/)) return 'acan';
      if (has(sp, /favites/)) return 'favites';
      if (has(sp, /favia|dipsastraea|platygyra|brain/)) return 'favia';
      if (has(sp, /goniopora|alveopora/)) return 'goniopora';
      if (has(sp, /trachyphyllia|open-brain/)) return 'trachy';
      if (has(sp, /fungia|plate/)) return 'plate';
      if (has(sp, /caulastrea|candy/)) return 'candy';
      if (has(sp, /plerogyra|bubble/)) return 'bubble';
      return sp.leafShape === 'needle' ? 'torch' : sp.leafShape === 'round' ? 'favia' : 'hammer';
    case 'sps-coral':
      if (has(sp, /formosa|muricata|staghorn|cervicornis/)) return 'staghorn';
      if (has(sp, /hyacinthus|table|cytherea/)) return 'table';
      if (has(sp, /capricornis|cap/)) return 'cap';
      if (has(sp, /digitata/)) return 'digitata';
      if (has(sp, /seriatopora|birdsnest/)) return 'birdsnest';
      if (has(sp, /stylophora/)) return 'stylophora';
      if (has(sp, /pocillopora/)) return 'pocillopora';
      if (has(sp, /tenuis/)) return 'tenuis';
      return 'acro';
    case 'gorgonian':
      return has(sp, /ventalina|fan|flabellum/) ? 'fan' : has(sp, /bipinnata|plume|pseudopterogorgia/) ? 'plume' : 'rod';
    case 'anemone':
      if (has(sp, /stichodactyla|carpet/)) return 'carpet';
      if (has(sp, /heteractis|crispa|sebae|macrodactyla|long-tentacle/)) return 'sebae';
      if (has(sp, /phymanthus|epicystis|rock-flower|flower/)) return 'rockflower';
      return 'bta';
    default:
      return 'finger';
  }
}

/** Corals reach for the light: grow along the surface normal blended toward up. */
function growUp(n: V3, k = 0.7): V3 {
  return norm(add(scl(n, 1 - k), UP, k));
}

function fluorOf(sp: PlantSpecies, strength = 1): Color {
  const c = new Color(sp.color2 ?? sp.color);
  return c.multiplyScalar(strength);
}

/** Material for a unique coral mesh (vertex colors, optional relief, own selection uniform). */
function uniqueMesh(out: GenArgs['out'], geo: BufferGeometry, o: { roughness: number; transl: number; fluor?: Color; detail?: SurfaceDetail; glow?: boolean; double?: boolean; shadow?: boolean }): Mesh {
  const mat = new MeshStandardMaterial({ vertexColors: true, roughness: o.roughness, metalness: 0 });
  if (o.double) mat.side = DoubleSide;
  const sel = { value: 0 };
  if (o.detail) patchSurfaceDetail(mat, o.detail);
  patchPlant(mat, { translucency: o.transl, fluor: o.fluor, selUniform: sel, glowAttr: o.glow });
  applyUnderwater(mat);
  const mesh = new Mesh(geo, mat);
  mesh.castShadow = o.shadow ?? true;
  mesh.receiveShadow = true;
  out.meshes.push(mesh);
  out.selUniforms.push(sel);
  return mesh;
}

/** Points on the host surface (or the sand) around the anchor. */
function surfacePoints({ m, ctx, rng }: GenArgs, radius: number, count: number): { p: V3; n: V3 }[] {
  const host = m.hostId ? ctx.tank.decor.find((d) => d.id === m.hostId) : undefined;
  if (host) {
    const pts = sampleHostSurface(host, m.anchor, Math.max(0.01, radius), count, rng);
    if (pts.length) return pts;
  }
  const out: { p: V3; n: V3 }[] = [];
  for (let i = 0; i < count; i++) {
    const a = rng.range(0, Math.PI * 2), r = Math.sqrt(rng.next()) * radius;
    const x = m.anchor[0] + Math.cos(a) * r, z = m.anchor[2] + Math.sin(a) * r;
    out.push({ p: [x, host ? m.anchor[1] : ctx.ground(x, z), z], n: m.normal });
  }
  return out;
}

/** Revolve a profile (r, h) around axis `up` at `base`, with optional angular modulation. */
function lathe(gb: GeoBuilder, base: V3, up: V3, profile: [number, number][], segs: number, mod: (th: number, i: number) => [number, number], color: (i: number, th: number) => RGB, sway: Inst['s'], glow?: (i: number, th: number) => number): void {
  const [t1, t2] = basis(up);
  const start = gb.count;
  const rows = profile.length;
  for (let i = 0; i < rows; i++) {
    for (let a = 0; a <= segs; a++) {
      const th = (a / segs) * Math.PI * 2;
      const [rm, ym] = mod(th, i);
      const r = profile[i][0] * rm, h = profile[i][1] + ym;
      const dir = add(scl(t1, Math.cos(th)), t2, Math.sin(th));
      const p = add(add(base, up, h), dir, r);
      gb.vertex(p, dir, [a / segs, i / (rows - 1)], color(i, th), [Math.cos(th) * r, h, Math.sin(th) * r]);
      gb.attr('aSway', 4, sway);
      if (glow) gb.attr('aGlow', 1, [glow(i, th)]);
    }
  }
  const w = segs + 1;
  for (let i = 0; i < rows - 1; i++) {
    for (let a = 0; a < segs; a++) {
      const v0 = start + i * w + a;
      gb.tri(v0, v0 + w, v0 + 1);
      gb.tri(v0 + 1, v0 + w, v0 + w + 1);
    }
  }
}

// ---------------------------------------------------------------------------------------------
// Soft corals
// ---------------------------------------------------------------------------------------------

/** Short soft-coral polyp (shared per species; the first caller's thickness wins). */
function polypTuft(sp: PlantSpecies, rr = 0.07): ReturnType<typeof tentaclePart> {
  const base = lin(sp.color), tip = lin(sp.color2 ?? sp.color);
  return tentaclePart(`${sp.id}/polyp`, { rr, taper: 0.6, tip: 'point', rows: 4, radial: 4 }, { transl: 0.6, roughness: 0.6, fluor: fluorOf(sp, 0.5) }, { base: mixRGB(base, tip, 0.5), tip, from: 0.3 });
}

function genToadstool(a: GenArgs): void {
  const { sp, m, rng, out, ctx } = a;
  const g = m.growth;
  const H = Math.max(0.04, m.height);
  const up = growUp(m.normal, 0.8);
  const rc = Math.max(0.03, m.spread / 2);
  const rs = rc * 0.24;
  const hs = H * 0.55;
  const ct = Math.max(0.01, rc * 0.12);
  const prof: [number, number][] = [
    [rs * 1.3, -0.005], [rs * 1.08, hs * 0.12], [rs * 0.95, hs * 0.5], [rs, hs * 0.85], [rc * 0.5, hs + ct * 0.15],
    [rc * 0.85, hs + ct * 0.3], [rc, hs + ct * 0.6], [rc * 0.97, hs + ct * 0.95], [rc * 0.75, hs + ct * 1.25], [rc * 0.4, hs + ct * 1.45], [0.001, hs + ct * 1.5],
  ];
  const noise = new Noise3(a.p.seed);
  const stalk = mulRGB(lin(sp.color), [1.12, 1.1, 1.05]);
  const cap = lin(sp.color);
  const ph = rng.range(0, 6.28);
  const gb = new GeoBuilder();
  lathe(
    gb, m.anchor, up, prof, 40,
    (th, i) => (i >= 4 ? [1 + 0.1 * Math.sin(th * 5 + ph) + 0.05 * noise.noise(th * 2, i, 0.3), -(i >= 5 && i <= 7 ? 1 : 0) * rc * 0.12 * (0.5 + 0.5 * Math.sin(th * 4 + ph))] : [1 + 0.04 * Math.sin(th * 3), 0]),
    (i) => (i < 4 ? stalk : mixRGB(cap, stalk, i === 4 ? 0.5 : 0)),
    [m.anchor[1], H, flexOf(sp) * 0.4, ph],
  );
  uniqueMesh(out, gb.build(), { roughness: 0.55, transl: 0.35, detail: { freq: 400, bump: 0.0002, albedoVar: 0.08 } });
  // Polyps over the cap top: by day a fuzzy lawn, by night the cap turns smooth.
  const tufts = use(out, polypTuft(sp));
  const n = Math.round((120 + 380 * g) * ctx.density);
  const [t1, t2] = basis(up);
  for (let i = 0; i < n; i++) {
    const r = Math.sqrt(rng.next()) * rc * 0.95;
    const th = rng.range(0, Math.PI * 2);
    const rr = r * (1 + 0.1 * Math.sin(th * 5 + ph));
    const capY = hs + ct * (1.5 - 0.9 * Math.pow(r / rc, 2)) - (r > rc * 0.75 ? rc * 0.06 * (0.5 + 0.5 * Math.sin(th * 4 + ph)) : 0);
    const p = add(add(m.anchor, up, capY), add(scl(t1, Math.cos(th)), t2, Math.sin(th)), rr);
    const dir = norm(add(add(up, add(scl(t1, Math.cos(th)), t2, Math.sin(th)), (r / rc) * 0.6), [rng.range(-1, 1), rng.range(-1, 1), rng.range(-1, 1)], 0.2));
    const L = cm(sp.leafLength, 1) * rng.range(0.6, 1.2);
    pushLeaf(tufts, p, dir, [rng.range(-1, 1), 0, rng.range(-1, 1)], L * 0.14, L, tint(rng, 0.12, a.p.health), [m.anchor[1], H, 0.35, ph + i], [rng.range(-0.4, 0.6), 0, 0.3, 0.85]);
  }
  out.proxy = { a: m.anchor, b: add(m.anchor, up, H), r: rc };
}

function genBranchySoft(a: GenArgs, style: 'finger' | 'tree'): void {
  const { sp, m, rng, out, ctx } = a;
  const g = m.growth;
  const H = Math.max(0.04, m.height);
  const up = growUp(m.normal, 0.75);
  const finger = style === 'finger';
  const sprigs = growSprigs(rng, m.anchor, up, finger
    ? { trunks: Math.round(3 + 3 * g), len: H * 0.75, r0: 0.01, tipR: 0.0065, spread: 0.55, branchProb: 0.22, angle: [0.35, 0.7], depth: 2, wander: 0.12, upBias: 0.12, step: 0.008 }
    : { trunks: 1 + (g > 0.6 ? 1 : 0), len: H * 0.85, r0: 0.007, tipR: 0.0022, spread: 0.3, branchProb: 0.38, angle: [0.5, 0.9], depth: 3, wander: 0.15, upBias: 0.08, step: 0.006 });
  const base = lin(sp.color), hi = lin(sp.color2 ?? sp.color);
  const ph = rng.range(0, 6.28);
  const sway: Inst['s'] = [m.anchor[1], H, flexOf(sp), ph];
  const geo = sprigMesh(sprigs, (t, depth) => mixRGB(base, mixRGB(base, hi, 0.35), Math.min(1, t * 0.6 + depth * 0.15)), sway, finger ? 9 : 6);
  uniqueMesh(out, geo, { roughness: 0.6, transl: 0.3, detail: { freq: 500, bump: 0.00025, albedoVar: 0.1 } });
  const tufts = use(out, polypTuft(sp, 0.08));
  const n = Math.round((finger ? 220 : 260) * (0.4 + 0.6 * g) * ctx.density);
  for (let i = 0; i < n; i++) {
    const s = sprigs[Math.floor(rng.next() * sprigs.length)];
    // Tree: polyps cluster at the twig ends; finger: all over the lobes.
    const k = finger ? Math.floor(rng.next() * s.pts.length) : Math.max(0, s.pts.length - 1 - Math.floor(rng.next() * Math.min(4, s.pts.length)));
    if (!finger && s.depth === 0 && rng.chance(0.8)) continue;
    const p = s.pts[k];
    const nx = s.pts[Math.min(s.pts.length - 1, k + 1)], pv = s.pts[Math.max(0, k - 1)];
    const tdir = norm([nx[0] - pv[0], nx[1] - pv[1], nx[2] - pv[2]]);
    const [b1, b2] = basis(tdir);
    const ang = rng.range(0, Math.PI * 2);
    const rad = norm(add(scl(b1, Math.cos(ang)), b2, Math.sin(ang)));
    const pos = add(p, rad, s.r[k] * 0.95);
    const dir = norm(add(rad, tdir, 0.5));
    const L = cm(sp.leafLength, 0.7) * rng.range(0.6, 1.2);
    pushLeaf(tufts, pos, dir, tdir, L * 0.15, L, tint(rng, 0.1, a.p.health), sway, [rng.range(-0.3, 0.5), 0, 0.2, 0.85]);
  }
}

function genXenia(a: GenArgs): void {
  const { sp, m, rng, out, ctx } = a;
  const g = m.growth;
  const stems = use(out, stemPart());
  const arms = use(out, tentaclePart(`${sp.id}/arm`, { rr: 0.06, taper: 0.4, tip: 'point', rows: 6, radial: 4 }, { transl: 0.7, roughness: 0.5, fluor: fluorOf(sp, 0.3) }, { base: lin(sp.color), tip: lin(sp.color2 ?? sp.color), from: 0.5 }));
  const up = growUp(m.normal, 0.8);
  const nStalks = Math.max(2, Math.round((3 + 8 * g) * Math.min(1, ctx.density + 0.3)));
  const H = Math.max(0.02, m.height);
  for (let s = 0; s < nStalks; s++) {
    const pts = surfacePoints(a, m.spread * 0.35, 1);
    const base = pts[0]?.p ?? m.anchor;
    const dir = norm(add(up, [rng.range(-1, 1), rng.range(-0.2, 0.3), rng.range(-1, 1)], 0.35));
    const h = H * rng.range(0.5, 0.95);
    const top = add(base, dir, h);
    const ph = rng.range(0, 6.28);
    const sway: Inst['s'] = [m.anchor[1], H * 1.3, 0.55, ph];
    pushSegment(stems, base, top, rng.range(0.0035, 0.005), mulRGB(lin(sp.color), [0.95, 0.93, 0.9]), sway);
    const polyps = rng.int(5, 11);
    for (let p = 0; p < polyps; p++) {
      const pd = norm(add(dir, [rng.range(-1, 1), rng.range(-0.1, 0.6), rng.range(-1, 1)], 0.65));
      const center = add(top, pd, rng.range(0.003, 0.009));
      const phP = ph + p * 0.9;
      for (let k = 0; k < 8; k++) {
        const { dir: ad, bend } = dirAround(pd, (k / 8) * Math.PI * 2, 0.7);
        const L = cm(sp.leafLength, 1.4) * rng.range(0.8, 1.15);
        // Pulsing: negative extension → the arms fold in and reopen.
        pushLeaf(arms, center, ad, bend, L * 0.1, L, tint(rng, 0.08, a.p.health), [m.anchor[1], H * 1.3, 0.55, phP], [0.9, 0, 0.25, -0.75]);
      }
    }
  }
}

function genMatPolyps(a: GenArgs, clove: boolean): void {
  const { sp, m, rng, out, ctx } = a;
  const g = m.growth;
  const R = Math.max(0.02, m.spread / 2);
  const matTex = { outline: 'round' as const, width: 64, height: 64, base: sp.color, tip: sp.color, veins: 'none' as const, seed: 5 };
  const mat = use(out, leafPart(`${sp.id}/mat`, matTex, { rows: 1, cup: 0 }, { transl: 0.2, roughness: 0.7 }));
  const starTex = { outline: 'star-polyp' as const, width: 64, height: 64, base: sp.color, tip: sp.color2 ?? sp.color, seed: 6 };
  const stars = use(out, leafPart(`${sp.id}/star`, starTex, { rows: 1 }, { transl: 0.6, roughness: 0.5, fluor: fluorOf(sp, 0.7), shadow: false }));
  const stalks = use(out, tentaclePart(`${sp.id}/stalk`, { rr: 0.18, taper: 0.1, tip: 'flat', rows: 2, radial: 5 }, { transl: 0.4, roughness: 0.6 }, { base: lin(sp.color), tip: lin(sp.color), from: 0.5 }));
  // The encrusting mat.
  for (const s of surfacePoints(a, R, Math.round((25 + 70 * g) * ctx.density))) {
    const [t1] = basis(s.n);
    const D = rng.range(0.02, 0.035);
    pushLeaf(mat, add(add(s.p, s.n, 0.0015), t1, -D / 2), t1, s.n, D, D, tint(rng, 0.12, a.p.health), [m.anchor[1], 0.1, 0.02, 0], [0, 0, 0, 0]);
  }
  // Polyps standing on short stalks, opening into eight-armed stars by day.
  const n = Math.round((clove ? 25 + 50 * g : 150 + 450 * g) * ctx.density);
  const ph = rng.range(0, 6.28);
  for (const s of surfacePoints(a, R * 0.95, n)) {
    const dir = norm(add(s.n, [rng.range(-1, 1), rng.range(-1, 1), rng.range(-1, 1)], 0.25));
    const h = (clove ? 0.012 : 0.004) * rng.range(0.7, 1.2);
    pushLeaf(stalks, s.p, dir, [1, 0, 0], h * 0.5, h, tint(rng, 0.1), [m.anchor[1], 0.05, 0.3, ph], [0, 0, 0, 0.6]);
    const top = add(s.p, dir, h * 0.9);
    const [t1] = basis(dir);
    const D = cm(sp.leafLength, 0.8) * rng.range(0.8, 1.2) * (clove ? 1.6 : 1);
    pushLeaf(stars, add(top, t1, -D / 2), t1, dir, D, D, tint(rng, 0.1, a.p.health), [m.anchor[1], 0.05, 0.4, ph + s.p[0] * 50], [clove ? 0.4 : 0.15, 0, 0.6, 0.85]);
  }
  out.proxy = { a: m.anchor, b: add(m.anchor, m.normal, 0.02), r: R };
}

// ---------------------------------------------------------------------------------------------
// Mushrooms & zoanthids
// ---------------------------------------------------------------------------------------------

function mushroomDisc(sp: PlantSpecies, style: Style) {
  const tex = radialTexture({
    base: sp.color,
    center: sp.color2 ?? sp.color,
    rim: style === 'disc' ? mixHex(sp.color, '#000000', 0.25) : undefined,
    stripes: style === 'disc' ? { count: 36, amount: 0.35 } : undefined,
    spots: style === 'disc' ? { color: mixHex(sp.color, '#ffffff', 0.35), density: 0.5, size: 0.04 } : undefined,
    seed: 11,
  });
  return discPart(`${sp.id}/disc`, (r, th) => 0.18 * (1 - r * r) - 0.12 * Math.exp(-r * r * 60) + 0.05 * r * Math.sin(th * 7), { map: tex, transl: 0.45, roughness: 0.4, fluor: fluorOf(sp, 0.6) });
}

function genMushroom(a: GenArgs, style: Style): void {
  const { sp, m, rng, out } = a;
  const g = m.growth;
  const discs = use(out, mushroomDisc(sp, style));
  const stems = use(out, stemPart());
  const bumps = style === 'ricordea' ? use(out, spherePart('glossy')) : null;
  const hairs = style === 'hairy' ? use(out, tentaclePart(`${sp.id}/hair`, { rr: 0.12, taper: 0.3, tip: 'knob', rows: 3, radial: 4, tipDetail: 0 }, { transl: 0.5, roughness: 0.6, fluor: fluorOf(sp, 0.4) }, { base: lin(sp.color), tip: lin(sp.color2 ?? sp.color), from: 0.3 })) : null;
  const n = Math.max(1, Math.round(1 + 6 * g));
  const pts = surfacePoints(a, Math.max(0.02, m.spread * 0.45), n);
  const ph = rng.range(0, 6.28);
  for (const s of pts) {
    const up = growUp(s.n, 0.45);
    const D = cm(sp.leafLength, 4) * rng.range(0.65, 1.1) * (0.6 + 0.4 * g);
    const R = D / 2;
    const h = rng.range(0.004, 0.009);
    const top = add(s.p, up, h);
    pushSegment(stems, s.p, top, R * 0.22, mulRGB(lin(sp.color), [0.8, 0.8, 0.8]), [m.anchor[1], 0.05, 0.1, ph]);
    // Disc: x/z radius R, y (height profile) scaled by R as well.
    const [t1] = basis(up);
    pushInst(discs, top, up, t1, R, R, R, tint(rng, 0.1, a.p.health), [m.anchor[1], 0.05, 0.12, ph]);
    if (bumps) {
      const nb = Math.round(18 + 22 * rng.next());
      const c2 = lin(sp.color2 ?? sp.color), c1 = lin(sp.color);
      for (let i = 0; i < nb; i++) {
        const rr = Math.sqrt(rng.next()) * R * 0.85, th = rng.range(0, Math.PI * 2);
        const [b1, b2] = basis(up);
        const p = add(add(top, up, 0.18 * R * (1 - (rr / R) ** 2) + 0.001), add(scl(b1, Math.cos(th)), b2, Math.sin(th)), rr);
        const br = R * rng.range(0.06, 0.11);
        pushInst(bumps, p, up, b1, br, br * 0.8, br, mixRGB(c1, c2, rr / R < 0.3 ? 0.9 : rng.next() * 0.5), [m.anchor[1], 0.05, 0.12, ph]);
      }
    }
    if (hairs) {
      const nh = Math.round(50 + 50 * rng.next());
      for (let i = 0; i < nh; i++) {
        const rr = Math.sqrt(rng.next()) * R * 0.9, th = rng.range(0, Math.PI * 2);
        const [b1, b2] = basis(up);
        const dirR = add(scl(b1, Math.cos(th)), b2, Math.sin(th));
        const p = add(add(top, up, 0.18 * R * (1 - (rr / R) ** 2)), dirR, rr);
        const L = R * rng.range(0.12, 0.22);
        pushLeaf(hairs, p, norm(add(up, dirR, 0.4)), dirR, L * 0.3, L, tint(rng, 0.1), [m.anchor[1], 0.05, 0.2, ph], [0.3, 0, 0.5, 0.4]);
      }
    }
  }
  out.proxy = { a: m.anchor, b: add(m.anchor, m.normal, 0.03), r: Math.max(0.03, m.spread / 2) };
}

function genZoanthid(a: GenArgs, paly: boolean): void {
  const { sp, m, rng, out, ctx } = a;
  const g = m.growth;
  const stems = use(out, stemPart());
  const tex = radialTexture({
    base: sp.color,
    center: sp.color2 ?? sp.color,
    rim: mixHex(sp.color, '#000000', 0.2),
    ring: { at: 0.28, width: 0.08, color: mixHex(sp.color2 ?? sp.color, '#ffffff', 0.3) },
    stripes: { count: 24, amount: 0.25 },
    seed: 13,
  });
  const discs = use(out, discPart(`${sp.id}/oral`, (r) => -0.08 * (1 - r) + 0.05 * r * r, { map: tex, transl: 0.4, roughness: 0.35, fluor: fluorOf(sp, 0.9) }));
  const tent = use(out, tentaclePart(`${sp.id}/tent`, { rr: 0.14, taper: 0.7, tip: 'point', rows: 3, radial: 4 }, { transl: 0.5, roughness: 0.5, fluor: fluorOf(sp, 0.3) }, { base: lin(sp.color), tip: mulRGB(lin(sp.color), [1.15, 1.15, 1.1]), from: 0.2 }));
  const n = Math.round((paly ? 8 + 30 * g : 12 + 60 * g) * ctx.density);
  const R = Math.max(0.015, m.spread / 2);
  const ph = rng.range(0, 6.28);
  const colCol = mulRGB(lin(sp.color), [0.7, 0.68, 0.6]);
  for (const s of surfacePoints(a, R, n)) {
    const up = norm(add(growUp(s.n, 0.35), [rng.range(-1, 1), rng.range(-1, 1), rng.range(-1, 1)], 0.15));
    const D = cm(sp.leafLength, 1) * rng.range(0.75, 1.15);
    const r = D / 2;
    const h = r * rng.range(0.8, 2.2) * (0.6 + 0.4 * g);
    const top = add(s.p, up, h);
    pushSegment(stems, add(s.p, up, -0.002), top, r * 0.6, colCol, [m.anchor[1], 0.05, 0.08, ph]);
    const [t1, t2] = basis(up);
    pushInst(discs, top, up, t1, r, r, r, tint(rng, 0.08, a.p.health), [m.anchor[1], 0.05, 0.08, ph]);
    const nt = paly ? 22 : 18;
    for (let k = 0; k < nt; k++) {
      const th = (k / nt) * Math.PI * 2 + rng.range(-0.05, 0.05);
      const rd = add(scl(t1, Math.cos(th)), t2, Math.sin(th));
      const L = r * rng.range(0.55, 0.8);
      pushLeaf(tent, add(top, rd, r * 0.92), norm(add(rd, up, 0.45)), rd, L * 0.3, L, tint(rng, 0.06), [m.anchor[1], 0.05, 0.15, ph + k], [0.5, 0, 0.4, 0.7]);
    }
  }
  out.proxy = { a: m.anchor, b: add(m.anchor, m.normal, 0.02), r: R };
}

function mixHex(a: string, b: string, t: number): string {
  const pa = parseInt(a.slice(1), 16), pb = parseInt(b.slice(1), 16);
  const ch = (s: number) => Math.round(((pa >> s) & 255) * (1 - t) + ((pb >> s) & 255) * t);
  return `#${((ch(16) << 16) | (ch(8) << 8) | ch(0)).toString(16).padStart(6, '0')}`;
}

// ---------------------------------------------------------------------------------------------
// Large-polyp stony corals
// ---------------------------------------------------------------------------------------------

function genEuphyllia(a: GenArgs, style: 'hammer' | 'frogspawn' | 'torch' | 'elegance'): void {
  const { sp, m, rng, out, ctx } = a;
  const g = m.growth;
  const up = growUp(m.normal, 0.75);
  const tip = style === 'hammer' ? 'hammer' : style === 'frogspawn' ? 'branched' : style === 'torch' ? 'knob' : 'knob';
  const base = lin(sp.color), tipC = lin(sp.color2 ?? sp.color);
  const tent = use(out, tentaclePart(`${sp.id}/tentacle`, { rr: style === 'torch' ? 0.035 : 0.045, taper: 0.25, tip, rows: 10, radial: 6, tipScale: style === 'elegance' ? 1.3 : 1 }, { transl: 0.65, roughness: 0.35, fluor: fluorOf(sp, 1) }, { base, tip: tipC, from: style === 'torch' || style === 'elegance' ? 0.88 : 0.8 }));
  const stems = use(out, stemPart());
  const heads = style === 'elegance' ? 1 : Math.max(1, Math.round(1 + 4 * g));
  const ph = rng.range(0, 6.28);
  const H = Math.max(0.04, m.height);
  const L0 = cm(sp.leafLength, 6);
  const skel = lin('#8c8478');
  for (let hI = 0; hI < heads; hI++) {
    const off = hI === 0 ? [0, 0] : [rng.range(-1, 1) * m.spread * 0.22, rng.range(-1, 1) * m.spread * 0.22];
    const [t1, t2] = basis(up);
    const baseP = add(add(m.anchor, t1, off[0]), t2, off[1]);
    const hr = rng.range(0.012, 0.02);
    const top = add(baseP, norm(add(up, [rng.range(-0.3, 0.3), 0, rng.range(-0.3, 0.3)], 1)), style === 'elegance' ? 0.006 : rng.range(0.015, 0.035));
    if (style !== 'elegance') pushSegment(stems, baseP, top, hr, skel, [m.anchor[1], 1, 0, 0]);
    else {
      const disc = use(out, discPart(`${sp.id}/disc`, (r, th) => 0.1 * Math.sin(th * 3) * r * r, { map: radialTexture({ base: sp.color, center: mixHex(sp.color, '#ffffff', 0.2), stripes: { count: 28, amount: 0.3 }, seed: 9 }), transl: 0.5, roughness: 0.35, fluor: fluorOf(sp, 0.3) }));
      pushInst(disc, top, up, t1, m.spread * 0.3, m.spread * 0.3, m.spread * 0.3, tint(rng, 0.05), [m.anchor[1], H, 0.2, ph]);
    }
    const nT = Math.round((style === 'elegance' ? 70 : 28) * (0.5 + 0.5 * g) * Math.min(1.2, ctx.density + 0.2));
    const rad = style === 'elegance' ? m.spread * 0.25 : hr * 1.1;
    for (let i = 0; i < nT; i++) {
      const rr = Math.sqrt(rng.next()) * rad, th = rng.range(0, Math.PI * 2);
      const rd = add(scl(t1, Math.cos(th)), t2, Math.sin(th));
      const p = add(top, rd, rr);
      const spread = 0.25 + 0.9 * (rr / rad);
      const { dir, bend } = dirAround(up, th, spread * rng.range(0.6, 1.0));
      const L = L0 * rng.range(0.55, 1.1) * (0.45 + 0.55 * g);
      pushLeaf(tent, p, dir, bend, L, L, tint(rng, 0.08, a.p.health), [m.anchor[1], H, flexOf(sp), ph + i * 0.21], [rng.range(0.3, 1.2), rng.range(-0.3, 0.3), 0.7, 0.55]);
    }
  }
}

function genDuncan(a: GenArgs): void {
  const { sp, m, rng, out } = a;
  const g = m.growth;
  const up = growUp(m.normal, 0.7);
  const H = Math.max(0.03, m.height);
  const sprigs = growSprigs(rng, m.anchor, up, { trunks: Math.round(2 + 4 * g), len: H * 0.7, r0: 0.0055, tipR: 0.0055, spread: 0.6, branchProb: 0.25, angle: [0.3, 0.6], depth: 1, wander: 0.1, upBias: 0.15, step: 0.008 });
  const skel = lin('#7a6e5e');
  uniqueMesh(out, sprigMesh(sprigs, () => skel, [m.anchor[1], 1, 0, 0], 7, false), { roughness: 0.8, transl: 0.05, detail: { freq: 600, bump: 0.0003, pores: 0.5, albedoVar: 0.15 } });
  const disc = use(out, discPart(`${sp.id}/oral`, (r) => 0.06 * (1 - r * r) - 0.1 * Math.exp(-r * r * 40), { map: radialTexture({ base: sp.color, center: mixHex(sp.color, '#ffffff', 0.35), stripes: { count: 20, amount: 0.3 }, seed: 17 }), transl: 0.5, roughness: 0.35, fluor: fluorOf(sp, 0.5) }));
  const tent = use(out, tentaclePart(`${sp.id}/tent`, { rr: 0.1, taper: 0.4, tip: 'knob', rows: 4, radial: 5 }, { transl: 0.6, roughness: 0.4, fluor: fluorOf(sp, 0.6) }, { base: lin(sp.color2 ?? sp.color), tip: mulRGB(lin(sp.color2 ?? sp.color), [1.2, 1.2, 1.2]), from: 0.6 }));
  const ph = rng.range(0, 6.28);
  for (const s of sprigs) {
    const n = s.pts.length;
    const tipP = s.pts[n - 1];
    const d = norm([tipP[0] - s.pts[n - 2][0], tipP[1] - s.pts[n - 2][1], tipP[2] - s.pts[n - 2][2]]);
    const R = cm(sp.leafLength, 1.5) * 0.5 * rng.range(0.85, 1.15);
    const [t1, t2] = basis(d);
    pushInst(disc, tipP, d, t1, R, R, R, tint(rng, 0.08, a.p.health), [m.anchor[1], H, 0.15, ph]);
    for (let k = 0; k < 16; k++) {
      const th = (k / 16) * Math.PI * 2;
      const rd = add(scl(t1, Math.cos(th)), t2, Math.sin(th));
      const L = R * rng.range(0.7, 1.0);
      pushLeaf(tent, add(tipP, rd, R * 0.95), norm(add(rd, d, 0.6)), rd, L * 0.2, L, tint(rng, 0.06), [m.anchor[1], H, 0.3, ph + k], [0.6, 0, 0.5, 0.6]);
    }
  }
}

/** Massive corals: dome with Voronoi corallites (acan: fleshy polyps; favia/favites: cups). */
function genMassive(a: GenArgs, style: 'acan' | 'favia' | 'favites' | 'goniopora'): void {
  const { sp, m, rng, out, ctx } = a;
  const g = m.growth;
  const up = growUp(m.normal, 0.6);
  const R = Math.max(0.025, (m.spread / 2) * (0.55 + 0.45 * g));
  const Hd = Math.max(0.015, Math.min(m.height, R * (style === 'goniopora' ? 0.9 : 0.75)));
  const cellR = style === 'acan' ? cm(sp.leafLength, 1.8) * 0.5 : style === 'goniopora' ? 0.006 : cm(sp.leafLength, 1) * 0.5;
  // Corallite centers spread over the dome (dart throwing).
  const domeArea = Math.PI * R * R * 1.6;
  const nCells = Math.min(160, Math.round(domeArea / (Math.PI * cellR * cellR * 1.1)));
  const cells: { u: number; v: number; c: RGB; c2: RGB }[] = [];
  // A colony shares its colors (one genotype): species color with per-polyp variation, and for
  // acans an occasional second morph color where the colony grew together.
  const accent = style === 'acan' ? lin(['#e07a2a', '#3ab070', '#8a3ab0', '#d04a7a'][Math.floor(rng.next() * 4)]) : null;
  for (let i = 0, tries = 0; i < nCells && tries < nCells * 8; tries++) {
    const u = rng.range(-1, 1), v = rng.range(-1, 1);
    if (u * u + v * v > 1) continue;
    const minD = (cellR / R) * 1.5;
    if (cells.some((c) => Math.hypot(c.u - u, c.v - v) < minD)) continue;
    let base = mulRGB(lin(sp.color), tint(rng, 0.18));
    if (accent && rng.chance(0.18)) base = mixRGB(base, accent, 0.7);
    cells.push({ u, v, c: base, c2: mulRGB(lin(sp.color2 ?? sp.color), tint(rng, 0.15)) });
    i++;
  }
  const [t1, t2] = basis(up);
  const noise = new Noise3(a.p.seed);
  const gb = new GeoBuilder();
  const rings = 40, segs = 96;
  const ph = rng.range(0, 6.28);
  const pos = (u: number, v: number, disp: number): { p: V3; n: V3 } => {
    const r = Math.min(1, Math.hypot(u, v));
    const h = Hd * Math.sqrt(Math.max(0, 1 - r * r)) * (0.92 + 0.08 * noise.noise(u * 3, v * 3, 0.5)) - 0.003;
    const nrm = norm(add(add(scl(up, Math.max(0.05, 1 - r)), t1, u * 0.9), t2, v * 0.9));
    const p = add(add(add(m.anchor, up, h), t1, u * R), t2, v * R);
    return { p: add(p, nrm, disp), n: nrm };
  };
  const vertsStart = gb.count;
  for (let j = 0; j <= rings; j++) {
    const r = j / rings;
    for (let k = 0; k <= segs; k++) {
      const th = (k / segs) * Math.PI * 2;
      const u = Math.cos(th) * r * 1.02, v = Math.sin(th) * r * 1.02;
      // Nearest and second nearest corallite.
      let d1 = 9, d2 = 9, ci = 0;
      for (let c = 0; c < cells.length; c++) {
        const d = Math.hypot(cells[c].u - u, cells[c].v - v);
        if (d < d1) {
          d2 = d1;
          d1 = d;
          ci = c;
        } else if (d < d2) d2 = d;
      }
      const wall = (d2 - d1) * R; // distance to the corallite wall (m)
      const fromC = d1 * R;
      let disp = 0, glow = 0;
      const cell = cells[ci] ?? { c: lin(sp.color), c2: lin(sp.color2 ?? sp.color) };
      let col: RGB;
      if (style === 'acan') {
        // Swollen fleshy polyps with a mouth, deep valleys between.
        disp = cellR * 0.35 * smoothstep(0, cellR * 0.5, wall) - cellR * 0.25 * Math.exp(-Math.pow(fromC / (cellR * 0.18), 2));
        const center = Math.exp(-Math.pow(fromC / (cellR * 0.35), 2));
        col = mixRGB(mulRGB(cell.c, [0.7, 0.7, 0.7]), cell.c2, center);
        col = mixRGB(col, mulRGB(cell.c, [0.45, 0.45, 0.45]), 1 - smoothstep(0, cellR * 0.25, wall));
        glow = center;
      } else if (style === 'goniopora') {
        disp = -cellR * 0.2 * Math.exp(-Math.pow(fromC / (cellR * 0.5), 2));
        col = mulRGB(lin(sp.color), [0.8, 0.8, 0.75]);
      } else {
        // Cups with raised septa walls; favites share walls (thinner), favia have gaps.
        const wallW = style === 'favites' ? cellR * 0.12 : cellR * 0.22;
        disp = cellR * 0.3 * (1 - smoothstep(0, wallW, wall)) - cellR * 0.35 * (1 - smoothstep(0, cellR * 0.9, fromC));
        const septa = 0.5 + 0.5 * Math.cos(Math.atan2(v - (cells[ci]?.v ?? 0), u - (cells[ci]?.u ?? 0)) * 24);
        const center = Math.exp(-Math.pow(fromC / (cellR * 0.4), 2));
        col = mixRGB(lin(sp.color), mulRGB(lin(sp.color), [1.25, 1.2, 1.1]), (1 - smoothstep(0, wallW, wall)) * 0.6 + septa * 0.1 * (1 - center));
        col = mixRGB(col, cell.c2, center * 0.85);
        glow = center;
      }
      if (r > 0.98) disp -= 0.002;
      const ao = 0.55 + 0.45 * smoothstep(-cellR * 0.3, cellR * 0.3, disp);
      const q = pos(u, v, disp);
      gb.vertex(q.p, q.n, [u * 0.5 + 0.5, v * 0.5 + 0.5], mulRGB(col, [ao, ao, ao]), [u * R, v * R, 0]);
      gb.attr('aSway', 4, [m.anchor[1], 1, 0, ph]);
      gb.attr('aGlow', 1, [glow]);
    }
  }
  const w = segs + 1;
  for (let j = 0; j < rings; j++) {
    for (let k = 0; k < segs; k++) {
      const v0 = vertsStart + j * w + k;
      gb.tri(v0, v0 + 1, v0 + w);
      gb.tri(v0 + 1, v0 + w + 1, v0 + w);
    }
  }
  const geo = gb.build();
  geo.computeVertexNormals();
  uniqueMesh(out, geo, { roughness: style === 'acan' ? 0.3 : 0.55, transl: style === 'acan' ? 0.4 : 0.15, fluor: fluorOf(sp, style === 'acan' ? 0.6 : 1), glow: true, detail: { freq: 700, bump: 0.00018, albedoVar: 0.08 } });
  if (style === 'goniopora') {
    const tent = use(out, tentaclePart(`${sp.id}/polyp`, { rr: 0.06, taper: 0.1, tip: 'branched', rows: 8, radial: 5, tipScale: 1.4 }, { transl: 0.6, roughness: 0.45, fluor: fluorOf(sp, 0.5) }, { base: lin(sp.color), tip: lin(sp.color2 ?? sp.color), from: 0.7 }));
    const n = Math.round((120 + 230 * g) * ctx.density);
    for (let i = 0; i < n; i++) {
      const rr = Math.sqrt(rng.next()) * 0.95, th = rng.range(0, Math.PI * 2);
      const q = pos(Math.cos(th) * rr, Math.sin(th) * rr, 0);
      const L = cm(sp.leafLength, 3) * rng.range(0.6, 1.1) * (0.5 + 0.5 * g);
      pushLeaf(tent, q.p, norm(add(q.n, [rng.range(-1, 1), rng.range(-1, 1), rng.range(-1, 1)], 0.15)), [rng.range(-1, 1), 0, rng.range(-1, 1)], L * 0.12, L, tint(rng, 0.08, a.p.health), [m.anchor[1], Hd + L, 0.65, ph + i * 0.3], [rng.range(0, 0.6), 0, 0.5, 0.75]);
    }
  }
  out.proxy = { a: m.anchor, b: add(m.anchor, up, Hd), r: R };
}

/** Free-living open brain (folded fleshy valleys) and plate coral (radial septa). */
function genFreeLiving(a: GenArgs, style: 'trachy' | 'plate'): void {
  const { sp, m, rng, out } = a;
  const g = m.growth;
  const R = Math.max(0.03, (m.spread / 2) * (0.6 + 0.4 * g));
  const Hm = Math.max(0.01, m.height * (style === 'trachy' ? 0.55 : 0.8));
  const yaw = a.p.rotationY;
  const cy = Math.cos(yaw), sy = Math.sin(yaw);
  const ell = style === 'trachy' ? 0.72 : 1;
  const noise = new Noise3(a.p.seed);
  const gb = new GeoBuilder();
  const rings = 36, segs = 96;
  const c1 = lin(sp.color), c2 = lin(sp.color2 ?? sp.color);
  const ph = rng.range(0, 6.28);
  for (let j = 0; j <= rings; j++) {
    const r = j / rings;
    for (let k = 0; k <= segs; k++) {
      const th = (k / segs) * Math.PI * 2;
      const lu = Math.cos(th) * r, lv = Math.sin(th) * r * ell;
      let h = Hm * Math.pow(Math.max(0, 1 - r * r), 0.6);
      let col: RGB, glow = 0;
      if (style === 'trachy') {
        // Meandering valleys between fleshy folds (domain-warped ridge lines), valleys fluorescent.
        const wx = lu * 3.4 + noise.noise(lu * 1.6, lv * 1.6, 0.3) * 0.9;
        const wy = lv * 3.4 + noise.noise(lu * 1.6 + 4.1, lv * 1.6, 0.7) * 0.9;
        const ridge = Math.pow(1 - Math.abs(noise.noise(wx, wy, 1.9)), 6);
        const fold = smoothstep(0.25, 0.85, ridge);
        h += Hm * 0.16 * fold * (1 - r * 0.6) - Hm * 0.05 * (1 - fold);
        col = mixRGB(mixRGB(c2, c1, 0.25), mixRGB(c1, c2, 0.1), fold);
        col = mulRGB(col, [0.8 + 0.3 * fold, 0.8 + 0.3 * fold, 0.8 + 0.3 * fold]);
        glow = 1 - fold;
      } else {
        const septa = Math.pow(Math.abs(Math.sin(th * 34 + noise.noise(r * 4, th, 0.2) * 0.5)), 0.4);
        h += 0.0018 * septa * smoothstep(0.1, 0.25, r);
        const slit = Math.exp(-Math.pow(lv / 0.04, 2)) * (Math.abs(lu) < 0.35 ? 1 : 0);
        h -= 0.004 * slit;
        col = mixRGB(mulRGB(c1, [0.75 + 0.35 * septa, 0.75 + 0.35 * septa, 0.75 + 0.3 * septa]), c2, smoothstep(0.75, 1, r) * 0.6);
        glow = smoothstep(0.8, 1, r) * 0.6;
      }
      const wx = (lu * cy - lv * sy) * R, wz = (lu * sy + lv * cy) * R;
      const x = m.anchor[0] + wx, z = m.anchor[2] + wz;
      const y = a.ctx.ground(x, z) + h - 0.002;
      gb.vertex([x, y, z], [0, 1, 0], [lu * 0.5 + 0.5, lv * 0.5 + 0.5], col, [wx, h, wz]);
      gb.attr('aSway', 4, [m.anchor[1], 1, 0, ph]);
      gb.attr('aGlow', 1, [glow]);
    }
  }
  const w = segs + 1;
  for (let j = 0; j < rings; j++) {
    for (let k = 0; k < segs; k++) {
      const v0 = j * w + k;
      gb.tri(v0, v0 + 1, v0 + w);
      gb.tri(v0 + 1, v0 + w + 1, v0 + w);
    }
  }
  const geo = gb.build();
  geo.computeVertexNormals();
  uniqueMesh(out, geo, { roughness: style === 'trachy' ? 0.32 : 0.6, transl: style === 'trachy' ? 0.45 : 0.1, fluor: fluorOf(sp, 0.9), glow: true, detail: { freq: 500, bump: 0.0002, albedoVar: 0.06 } });
  out.proxy = { a: m.anchor, b: add(m.anchor, UP, Hm), r: R };
}

function genCandy(a: GenArgs): void {
  const { sp, m, rng, out } = a;
  const g = m.growth;
  const up = growUp(m.normal, 0.7);
  const H = Math.max(0.03, m.height);
  const sprigs = growSprigs(rng, m.anchor, up, { trunks: Math.round(3 + 5 * g), len: H * 0.75, r0: 0.0065, tipR: 0.0065, spread: 0.5, branchProb: 0.2, angle: [0.25, 0.5], depth: 1, wander: 0.08, upBias: 0.2, step: 0.008 });
  uniqueMesh(out, sprigMesh(sprigs, () => lin('#6a5e4a'), [m.anchor[1], 1, 0, 0], 8, false), { roughness: 0.8, transl: 0.05, detail: { freq: 500, bump: 0.0003, pores: 0.4, albedoVar: 0.12 } });
  const tex = radialTexture({ base: sp.color, center: sp.color2 ?? sp.color, stripes: { count: 14, amount: 0.55, color: mixHex(sp.color, '#ffffff', 0.35) }, seed: 21 });
  const cap = use(out, discPart(`${sp.id}/cap`, (r) => 0.35 * (1 - r * r) - 0.15 * Math.exp(-r * r * 30), { map: tex, transl: 0.4, roughness: 0.35, fluor: fluorOf(sp, 0.9) }));
  const ph = rng.range(0, 6.28);
  for (const s of sprigs) {
    const n = s.pts.length;
    const tipP = s.pts[n - 1];
    const d = norm([tipP[0] - s.pts[n - 2][0], tipP[1] - s.pts[n - 2][1], tipP[2] - s.pts[n - 2][2]]);
    const R = s.r[n - 1] * 1.25;
    pushInst(cap, tipP, d, basis(d)[0], R, R, R, tint(rng, 0.08, a.p.health), [m.anchor[1], H, 0.1, ph]);
  }
}

function genBubble(a: GenArgs): void {
  const { sp, m, rng, out } = a;
  const g = m.growth;
  const up = growUp(m.normal, 0.6);
  const ves = use(out, spherePart('vesicle'));
  const R = Math.max(0.03, (m.spread / 2) * (0.5 + 0.5 * g));
  const Hd = Math.max(0.02, m.height * 0.6);
  const [t1, t2] = basis(up);
  const n = Math.round(30 + 60 * g);
  const c1 = lin(sp.color), c2 = lin(sp.color2 ?? sp.color);
  const ph = rng.range(0, 6.28);
  for (let i = 0; i < n; i++) {
    const rr = Math.sqrt(rng.next()) * 0.95, th = rng.range(0, Math.PI * 2);
    const h = Hd * Math.sqrt(Math.max(0, 1 - rr * rr));
    const p = add(add(add(m.anchor, up, h), t1, Math.cos(th) * rr * R), t2, Math.sin(th) * rr * R);
    const r = cm(sp.leafLength, 2.5) * 0.5 * rng.range(0.6, 1.1);
    const e = rng.range(0.85, 1.2);
    pushInst(ves, p, norm(add(up, [rng.range(-1, 1), 0, rng.range(-1, 1)], 0.3)), t1, r, r * e, r, mixRGB(c1, c2, rng.next() * 0.5), [m.anchor[1], Hd * 2, 0.08, ph]);
  }
  out.proxy = { a: m.anchor, b: add(m.anchor, up, Hd), r: R };
}

// ---------------------------------------------------------------------------------------------
// Small-polyp stony corals (branching skeletons)
// ---------------------------------------------------------------------------------------------

function genSps(a: GenArgs, style: Style): void {
  const { sp, m, rng, out } = a;
  const g = m.growth;
  const up = growUp(m.normal, 0.8);
  const H = Math.max(0.025, m.height);
  const W = Math.max(0.03, m.spread / 2);
  const base = lin(sp.color), tip = lin(sp.color2 ?? sp.color);
  const ph = rng.range(0, 6.28);
  if (style === 'cap') {
    genMontiCap(a, up);
    return;
  }
  let sprigs: Sprig[];
  const sc = 0.45 + 0.55 * g;
  switch (style) {
    case 'staghorn':
      sprigs = growSprigs(rng, m.anchor, up, { trunks: Math.round(3 + 3 * g), len: H * 0.9 * sc, r0: 0.0075, tipR: 0.0055, spread: 0.9, branchProb: 0.13, angle: [0.4, 0.8], depth: 2, wander: 0.07, upBias: 0.06, step: 0.01 });
      break;
    case 'table': {
      // A short stalk and a flat, finely branched table.
      const stalkTop = add(m.anchor, up, H * 0.45);
      sprigs = [{ pts: [m.anchor, add(m.anchor, up, H * 0.25), stalkTop], r: [0.012, 0.01, 0.009], depth: 0 }];
      sprigs.push(...growSprigs(rng, stalkTop, up, { trunks: 12, len: W * sc, r0: 0.004, tipR: 0.0028, spread: 6, branchProb: 0.42, angle: [0.25, 0.5], depth: 2, wander: 0.05, upBias: 0, planar: up, step: 0.01, maxSprigs: 70 }));
      // Upturned branchlets on the table.
      const extra: Sprig[] = [];
      for (const s of sprigs.slice(1)) for (let i = 1; i < s.pts.length; i += 3) extra.push({ pts: [s.pts[i], add(s.pts[i], norm(add(up, [rng.range(-1, 1), 0, rng.range(-1, 1)], 0.2)), rng.range(0.005, 0.012))], r: [0.0026, 0.0022], depth: 3 });
      sprigs.push(...extra);
      break;
    }
    case 'digitata':
      sprigs = growSprigs(rng, m.anchor, up, { trunks: Math.round(4 + 4 * g), len: H * 0.85 * sc, r0: 0.0065, tipR: 0.0055, spread: 0.6, branchProb: 0.2, angle: [0.3, 0.6], depth: 2, wander: 0.1, upBias: 0.18, step: 0.008 });
      break;
    case 'birdsnest':
      sprigs = growSprigs(rng, m.anchor, up, { trunks: Math.round(8 + 6 * g), len: H * 0.75 * sc, r0: 0.0024, tipR: 0.0007, spread: 0.9, branchProb: 0.45, angle: [0.4, 0.9], depth: 3, wander: 0.28, upBias: 0.08, step: 0.008, maxSprigs: 110 });
      break;
    case 'stylophora':
      sprigs = growSprigs(rng, m.anchor, up, { trunks: Math.round(4 + 3 * g), len: H * 0.8 * sc, r0: 0.0075, tipR: 0.0065, spread: 0.7, branchProb: 0.3, angle: [0.35, 0.7], depth: 2, wander: 0.12, upBias: 0.12, step: 0.008 });
      break;
    case 'pocillopora':
      sprigs = growSprigs(rng, m.anchor, up, { trunks: Math.round(5 + 4 * g), len: H * 0.75 * sc, r0: 0.0062, tipR: 0.005, spread: 0.7, branchProb: 0.4, angle: [0.35, 0.7], depth: 3, wander: 0.16, upBias: 0.12, step: 0.007 });
      break;
    case 'tenuis':
      sprigs = growSprigs(rng, m.anchor, up, { trunks: Math.round(8 + 6 * g), len: H * 0.7 * sc, r0: 0.0045, tipR: 0.003, spread: 1.6, branchProb: 0.35, angle: [0.25, 0.55], depth: 2, wander: 0.1, upBias: 0.12, step: 0.007 });
      break;
    default:
      // Corymbose acropora: many short upright branchlets from a spreading base.
      sprigs = growSprigs(rng, m.anchor, up, { trunks: Math.round(8 + 8 * g), len: H * 0.7 * sc, r0: 0.0048, tipR: 0.0034, spread: 1.0, branchProb: 0.32, angle: [0.25, 0.5], depth: 2, wander: 0.09, upBias: 0.22, step: 0.007 });
  }
  const bumpy = style === 'pocillopora' || style === 'stylophora';
  const geo = sprigMesh(sprigs, (t, depth) => mixRGB(base, tip, smoothstep(0.65, 1, t) * (depth >= 1 || style === 'staghorn' ? 1 : 0.6)), [m.anchor[1], H, 0, ph], style === 'birdsnest' ? 5 : 7);
  // Tips glow (growing tips are pale/fluorescent).
  const uvs = geo.getAttribute('uv');
  const glowArr = new Float32Array(uvs.count);
  for (let i = 0; i < uvs.count; i++) glowArr[i] = smoothstep(0.7, 1, uvs.getY(i));
  geo.setAttribute('aGlow', new Float32BufferAttribute(glowArr, 1));
  uniqueMesh(out, geo, { roughness: 0.7, transl: 0.12, fluor: fluorOf(sp, 0.8), glow: true, detail: { freq: bumpy ? 260 : 650, bump: bumpy ? 0.0007 : 0.00035, pores: 0.7, ridge: 0.2, albedoVar: 0.12 } });
  out.proxy = { a: m.anchor, b: add(m.anchor, up, H), r: W };
}

function genMontiCap(a: GenArgs, up: V3): void {
  const { sp, m, rng, out } = a;
  const g = m.growth;
  const gb = new GeoBuilder();
  const base = lin(sp.color), rim = lin(sp.color2 ?? sp.color);
  const plates = Math.max(1, Math.round(1 + 2.5 * g));
  const [t1, t2] = basis(up);
  const ph = rng.range(0, 6.28);
  const noise = new Noise3(a.p.seed);
  for (let pI = 0; pI < plates; pI++) {
    const R = (m.spread / 2) * (0.5 + 0.5 * g) * rng.range(0.6, 1.0) * (1 - pI * 0.15);
    const th0 = rng.range(0, Math.PI * 2);
    const span = rng.range(3.4, 5.0);
    const y0 = pI * 0.018 + rng.range(0, 0.006);
    const rise = rng.range(0.01, 0.025);
    const rows = 10, cols = 40;
    const start = gb.count;
    for (let j = 0; j <= rows; j++) {
      const r = 0.006 + (j / rows) * R;
      for (let k = 0; k <= cols; k++) {
        const th = th0 + (k / cols) * span;
        const tt = k / cols;
        const wave = 0.004 * Math.sin(th * 5 + noise.noise(r * 30, th, 0.5));
        const y = y0 + rise * tt - (r / R) * 0.012 + wave * (r / R);
        const dir = add(scl(t1, Math.cos(th)), t2, Math.sin(th));
        const p = add(add(m.anchor, up, y + 0.004), dir, r);
        const edge = smoothstep(0.75, 1, j / rows);
        gb.vertex(p, up, [k / cols, j / rows], mixRGB(base, rim, edge), [Math.cos(th) * r, y, Math.sin(th) * r]);
        gb.attr('aSway', 4, [m.anchor[1], 1, 0, ph]);
        gb.attr('aGlow', 1, [edge]);
      }
    }
    const w = cols + 1;
    for (let j = 0; j < rows; j++) {
      for (let k = 0; k < cols; k++) {
        const v0 = start + j * w + k;
        gb.tri(v0, v0 + 1, v0 + w);
        gb.tri(v0 + 1, v0 + w + 1, v0 + w);
      }
    }
  }
  const geo = gb.build();
  geo.computeVertexNormals();
  uniqueMesh(out, geo, { roughness: 0.7, transl: 0.2, fluor: fluorOf(sp, 0.8), glow: true, double: true, detail: { freq: 700, bump: 0.0003, pores: 0.6, albedoVar: 0.1 } });
}

// ---------------------------------------------------------------------------------------------
// Gorgonians
// ---------------------------------------------------------------------------------------------

function genGorgonian(a: GenArgs, style: 'fan' | 'rod' | 'plume'): void {
  const { sp, m, rng, out, ctx } = a;
  const g = m.growth;
  const H = Math.max(0.05, m.height);
  const up = growUp(m.normal, 0.9);
  const yaw = a.p.rotationY;
  const planeN = norm([Math.sin(yaw) * 0.5 + 0.35, 0, Math.cos(yaw)]);
  const base = lin(sp.color), hi = lin(sp.color2 ?? sp.color);
  const ph = rng.range(0, 6.28);
  const sway: Inst['s'] = [m.anchor[1], H, flexOf(sp), ph];
  let sprigs: Sprig[];
  if (style === 'fan') {
    sprigs = growSprigs(rng, m.anchor, up, { trunks: 2, len: H * 0.55, r0: 0.004, tipR: 0.0011, spread: 0.6, branchProb: 0.45, angle: [0.25, 0.6], depth: 5, wander: 0.08, upBias: 0.1, planar: planeN, step: 0.011, maxSprigs: 160 });
    // Anastomoses: the fan's mesh of cross-links between neighbouring branches.
    const pts = sprigs.flatMap((s, si) => s.pts.map((p, i) => ({ p, si, r: s.r[i] }))).filter((q, i) => i % 2 === 0);
    const links: Sprig[] = [];
    for (let i = 0; i < pts.length && links.length < 140; i++) {
      for (let j = i + 1; j < pts.length; j++) {
        if (pts[i].si === pts[j].si) continue;
        const d = Math.hypot(pts[i].p[0] - pts[j].p[0], pts[i].p[1] - pts[j].p[1], pts[i].p[2] - pts[j].p[2]);
        if (d > 0.004 && d < 0.014 && rng.chance(0.35)) {
          links.push({ pts: [pts[i].p, pts[j].p], r: [0.0009, 0.0009], depth: 6 });
          break;
        }
      }
    }
    sprigs.push(...links);
  } else if (style === 'plume') {
    sprigs = growSprigs(rng, m.anchor, up, { trunks: Math.round(2 + 2 * g), len: H * 0.9, r0: 0.003, tipR: 0.0011, spread: 0.35, branchProb: 0.6, angle: [0.5, 0.8], depth: 2, wander: 0.06, upBias: 0.15, step: 0.014, maxSprigs: 100 });
  } else {
    sprigs = growSprigs(rng, m.anchor, up, { trunks: Math.round(1 + 2 * g), len: H * 0.8, r0: 0.0075, tipR: 0.0055, spread: 0.4, branchProb: 0.22, angle: [0.4, 0.75], depth: 2, wander: 0.07, upBias: 0.3, step: 0.012 });
  }
  const geo = sprigMesh(sprigs, (t, depth) => mixRGB(base, hi, Math.min(1, t * 0.3 + depth * 0.08)), sway, style === 'rod' ? 7 : 4);
  uniqueMesh(out, geo, { roughness: 0.75, transl: 0.25, detail: { freq: style === 'rod' ? 300 : 800, bump: style === 'rod' ? 0.0006 : 0.0002, ridge: 0.3, albedoVar: 0.12 } });
  if (style === 'rod') {
    // Extended polyps make the rods soft and furry by day.
    const tufts = use(out, polypTuft(sp, 0.1));
    const n = Math.round((150 + 350 * g) * ctx.density);
    for (let i = 0; i < n; i++) {
      const s = sprigs[Math.floor(rng.next() * sprigs.length)];
      const k = Math.floor(rng.next() * s.pts.length);
      const nx = s.pts[Math.min(s.pts.length - 1, k + 1)], pv = s.pts[Math.max(0, k - 1)];
      const td = norm([nx[0] - pv[0], nx[1] - pv[1], nx[2] - pv[2]]);
      const [b1, b2] = basis(td);
      const ang = rng.range(0, Math.PI * 2);
      const rd = norm(add(scl(b1, Math.cos(ang)), b2, Math.sin(ang)));
      const L = 0.005 * rng.range(0.7, 1.2);
      pushLeaf(tufts, add(s.pts[k], rd, s.r[k] * 0.9), norm(add(rd, td, 0.3)), td, L * 0.2, L, tint(rng, 0.08, a.p.health), sway, [0.2, 0, 0.1, 0.9]);
    }
  }
  out.proxy = { a: m.anchor, b: add(m.anchor, up, H), r: Math.max(0.03, m.spread / 2) };
}

// ---------------------------------------------------------------------------------------------
// Anemones
// ---------------------------------------------------------------------------------------------

function genAnemone(a: GenArgs, style: 'bta' | 'carpet' | 'sebae' | 'rockflower'): void {
  const { sp, m, rng, out, ctx } = a;
  const g = m.growth;
  const disc = anemoneDisc(m);
  const up = norm([disc[0] - m.anchor[0], disc[1] - m.anchor[1], disc[2] - m.anchor[2]]);
  const [t1, t2] = basis(up);
  const ph = rng.range(0, 6.28);
  const H = Math.max(0.02, m.height);
  const discR = style === 'carpet' ? (m.spread / 2) * (0.7 + 0.3 * g) : style === 'rockflower' ? (m.spread / 2) * 0.8 : (m.spread / 2) * (0.25 + 0.1 * g);
  const colH = Math.hypot(disc[0] - m.anchor[0], disc[1] - m.anchor[1], disc[2] - m.anchor[2]);
  // Column (foot wedged in the rock, flaring to the oral disc).
  if (style === 'bta' || style === 'sebae') {
    const gb = new GeoBuilder();
    const cr = discR * 0.55;
    const col = mulRGB(lin(sp.color), [0.85, 0.8, 0.72]);
    lathe(gb, m.anchor, up, [[cr * 0.9, -0.01], [cr * 0.8, colH * 0.3], [cr * 0.85, colH * 0.7], [cr * 1.15, colH * 0.95], [discR * 0.9, colH * 1.0]], 28, (th) => [1 + 0.06 * Math.sin(th * 3 + ph), 0], () => col, [m.anchor[1], H, 0.15, ph]);
    uniqueMesh(out, gb.build(), { roughness: 0.45, transl: 0.3, detail: { freq: 300, bump: 0.0003, albedoVar: 0.1 } });
  }
  // Oral disc.
  const tex = radialTexture({
    base: style === 'rockflower' ? sp.color : mixHex(sp.color, '#000000', 0.15),
    center: mixHex(sp.color2 ?? sp.color, '#ffffff', 0.3),
    stripes: { count: style === 'rockflower' ? 16 : 40, amount: style === 'rockflower' ? 0.6 : 0.3, color: style === 'rockflower' ? sp.color2 : undefined },
    ring: style === 'rockflower' ? { at: 0.7, width: 0.12, color: sp.color2 ?? sp.color } : undefined,
    seed: 23,
  });
  const discP = use(out, discPart(`${sp.id}/disc`, (r, th) => (style === 'carpet' ? 0.16 * Math.sin(th * 2 + 0.5) * r * r + 0.05 * Math.sin(th * 9) * r : 0.05 * Math.sin(th * 5) * r) - 0.08 * Math.exp(-r * r * 50), { map: tex, transl: 0.4, roughness: 0.45, fluor: fluorOf(sp, 0.4) }));
  pushInst(discP, disc, up, t1, discR, discR, discR, tint(rng, 0.05, a.p.health), [m.anchor[1], H, 0.12, ph]);
  // Tentacles.
  const tipShape = style === 'bta' ? 'bulb' : style === 'sebae' ? 'point' : 'knob';
  const base = lin(sp.color), tipC = lin(sp.color2 ?? sp.color);
  const tent = use(out, tentaclePart(
    `${sp.id}/tentacle`,
    { rr: style === 'bta' ? 0.085 : style === 'sebae' ? 0.05 : 0.16, taper: style === 'sebae' ? 0.7 : 0.25, tip: tipShape, rows: style === 'carpet' || style === 'rockflower' ? 3 : 9, radial: style === 'carpet' ? 4 : 6, tipScale: style === 'bta' ? 1.0 : 1, tipDetail: style === 'carpet' ? 0 : 1 },
    { transl: 0.6, roughness: 0.35, fluor: fluorOf(sp, 0.7) },
    { base, tip: tipC, from: style === 'bta' ? 0.72 : 0.6, ring: style === 'bta' ? lin('#f0e8e0') : undefined },
  ));
  const n = Math.round((style === 'carpet' ? 450 + 700 * g : style === 'rockflower' ? 50 + 40 * g : 70 + 110 * g) * Math.min(1.2, ctx.density + 0.2));
  const L0 = cm(sp.leafLength, 5);
  for (let i = 0; i < n; i++) {
    let rr: number;
    if (style === 'rockflower') rr = rng.range(0.82, 1.0);
    else if (style === 'carpet') rr = Math.sqrt(rng.next()) * 0.98;
    else rr = rng.range(0.25, 1.0);
    const th = rng.range(0, Math.PI * 2);
    const rd = add(scl(t1, Math.cos(th)), t2, Math.sin(th));
    const hDisc = (style === 'carpet' ? 0.16 * Math.sin(th * 2 + 0.5) * rr * rr : 0.05 * Math.sin(th * 5) * rr) * discR;
    const p = add(add(disc, rd, rr * discR), up, hDisc);
    const outward = style === 'carpet' ? rng.range(0, 0.3) : 0.2 + rr * (style === 'sebae' ? 1.0 : 0.9);
    const { dir, bend } = dirAround(up, th, outward * rng.range(0.8, 1.15));
    const L = L0 * rng.range(0.6, 1.1) * (style === 'carpet' || style === 'rockflower' ? 1 : 0.5 + 0.5 * g);
    pushLeaf(tent, p, dir, bend, L, L, tint(rng, 0.08, a.p.health), [m.anchor[1], H + L, flexOf(sp) * (style === 'carpet' ? 0.3 : 1), ph + i * 0.17], [style === 'carpet' ? rng.range(-0.2, 0.3) : rng.range(0.2, 0.9), rng.range(-0.3, 0.3), 0.6, style === 'carpet' ? 0.2 : 0.3]);
  }
  out.proxy = { a: m.anchor, b: disc, r: Math.max(0.03, discR + L0 * 0.4) };
}

// ---------------------------------------------------------------------------------------------

/** Corals & anemones dispatcher. */
export function genCoral(args: GenArgs): void {
  const style = coralStyle(args.sp);
  switch (style) {
    case 'toadstool':
      return genToadstool(args);
    case 'finger':
    case 'tree':
      return genBranchySoft(args, style);
    case 'xenia':
      return genXenia(args);
    case 'gsp':
    case 'clove':
      return genMatPolyps(args, style === 'clove');
    case 'disc':
    case 'hairy':
    case 'ricordea':
      return genMushroom(args, style);
    case 'zoa':
    case 'palythoa':
      return genZoanthid(args, style === 'palythoa');
    case 'hammer':
    case 'frogspawn':
    case 'torch':
    case 'elegance':
      return genEuphyllia(args, style);
    case 'duncan':
      return genDuncan(args);
    case 'acan':
    case 'favia':
    case 'favites':
    case 'goniopora':
      return genMassive(args, style);
    case 'trachy':
    case 'plate':
      return genFreeLiving(args, style);
    case 'candy':
      return genCandy(args);
    case 'bubble':
      return genBubble(args);
    case 'fan':
    case 'rod':
    case 'plume':
      return genGorgonian(args, style);
    case 'bta':
    case 'carpet':
    case 'sebae':
    case 'rockflower':
      return genAnemone(args, style);
    default:
      return genSps(args, style);
  }
}

