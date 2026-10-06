/**
 * Generators for true plants and macroalgae: rosettes, ribbons, stem bunches, feathery whorls,
 * epiphytic ferns & anubias, carpets, hairgrass, moss, floating plants, lilies, bulbs, marimo,
 * seagrass and marine macroalgae. Each writes instances into a PlantBuild.
 *
 * Proportions follow the species data: leaf length/width (cm), mature height & spread, growth
 * fraction. Leaves are arranged by real phyllotaxy (golden-angle rosettes, decussate pairs,
 * whorls) and age (older outer leaves larger and darker, young leaves paler and smaller).
 */
import { Mesh, MeshStandardMaterial, type BufferGeometry } from 'three';
import type { PlantSpecies } from '../../../core/types';
import { Rng } from '../../../core/rng';
import { Noise3, smoothstep } from '../../../decor/noise';
import { sampleHostSurface, type V3 } from '../../../decor/shapes';
import { GeoBuilder, icosphere } from '../geom';
import { applyUnderwater } from '../../underwater';
import { patchPlant, patchSurfaceDetail } from '../shaders';
import { leafPart, spherePart, stemPart } from './parts';
import { flexOf, leafLook, tipColored } from './style';
import {
  add, basis, dirAround, lin, mixRGB, mulRGB, norm, pushInst, pushLeaf, pushSegment, ratio, scl, tint, use,
  type GenArgs, type Inst, type RGB,
} from './kit';

const GOLDEN = 2.39996323;
const UP: V3 = [0, 1, 0];
const has = (sp: PlantSpecies, re: RegExp) => re.test(sp.id) || re.test(sp.scientificName.toLowerCase());
const cm = (v: number | undefined, d: number) => (v ?? d) / 100;

function speciesLeaf(sp: PlantSpecies) {
  const look = leafLook(sp);
  return leafPart(`${sp.id}/leaf`, look.tex, { rows: look.rows, fold: look.fold, ruffle: look.ruffle, ruffleFreq: look.ruffleFreq, cup: look.cup }, { transl: look.transl, roughness: look.roughness });
}

function phase(rng: Rng): number {
  return rng.range(0, Math.PI * 2);
}

/**
 * An independent random stream per sub-part (stem, tuft…): when a plant grows and one stem
 * gains nodes, the other stems keep their exact shape instead of reshuffling.
 */
function subRng(seed: number, i: number): Rng {
  return new Rng((Math.imul(seed ^ 0x9e3779b9, 0x85ebca6b) + Math.imul(i + 1, 0xc2b2ae35)) >>> 0);
}

// ---------------------------------------------------------------------------------------------
// Rosette: swords, crypts, downoi, lagenandra, water sprite
// ---------------------------------------------------------------------------------------------

export function genRosette({ sp, p, m, rng, out }: GenArgs): void {
  const list = use(out, speciesLeaf(sp));
  const g = m.growth;
  const sword = has(sp, /echinodorus/);
  const crypt = has(sp, /cryptocoryne|lagenandra/);
  const flatStar = has(sp, /pogostemon-helferi/);
  const Nmax = sword ? 22 : flatStar ? 18 : has(sp, /parva/) ? 14 : crypt ? 12 : 14;
  const N = Math.max(3, Math.round((3 + (Nmax - 3) * g) * rng.range(0.85, 1.15)));
  const leafLen = cm(sp.leafLength, sp.maxHeightCm * 0.7);
  const leafW = cm(sp.leafWidth, sp.leafLength ? sp.leafLength * 0.2 : 2);
  const [outerP, innerP] = sword ? [1.0, 0.22] : flatStar ? [1.35, 0.7] : has(sp, /parva/) ? [0.55, 0.15] : crypt ? [0.85, 0.28] : [0.85, 0.25];
  const flex = flexOf(sp);
  const ph = phase(rng);
  const sway: Inst['s'] = [m.anchor[1], Math.max(0.03, m.height), flex, ph];
  const up = norm(add(scl(m.normal, 0.6), UP, 0.6));
  for (let i = 0; i < N; i++) {
    const a = N > 1 ? i / (N - 1) : 0.5; // 0 = oldest outer leaf → 1 = youngest heart leaf
    const yaw = p.rotationY + i * GOLDEN + rng.range(-0.25, 0.25);
    const pitch = outerP + (innerP - outerP) * a + rng.range(-0.12, 0.12);
    const young = a > 0.78 ? 1 - ((a - 0.78) / 0.22) * 0.55 : 0.88 + 0.12 * (a / 0.78);
    const size = (0.32 + 0.68 * g) * young * rng.range(0.86, 1.1);
    const L = leafLen * size;
    const W = leafW * size;
    const { dir, bend } = dirAround(up, yaw, pitch);
    const base = add(m.anchor, dir, 0.004);
    const curv = rng.range(0.35, 0.8) * (0.55 + 0.7 * (1 - a));
    const c = mulRGB(tint(rng, 0.12, p.health, 0.82 + 0.3 * a), a > 0.85 ? [1.04, 1.06, 0.92] : [1, 1, 1]);
    pushLeaf(list, base, dir, bend, W, L, c, [sway[0], sway[1], flex, ph + i * 0.37], [curv, rng.range(-0.25, 0.25), 0, 0]);
  }
}

// ---------------------------------------------------------------------------------------------
// Ribbon: vallisneria, sagittaria, crinum, crypt balansae; seagrass
// ---------------------------------------------------------------------------------------------

export function genRibbon({ sp, p, m, ctx, rng, out }: GenArgs): void {
  const list = use(out, speciesLeaf(sp));
  const g = m.growth;
  const sea = sp.form === 'seagrass';
  const Nmax = sea ? 6 : has(sp, /sagittaria/) ? 9 : has(sp, /crinum|balansae/) ? 9 : 13;
  const shoots = sea ? Math.max(1, Math.round(1 + g * 3)) : 1;
  const leafLen = cm(sp.leafLength, sp.maxHeightCm);
  const leafW = cm(sp.leafWidth, 0.8);
  const spiral = has(sp, /spiralis/) && !has(sp, /tiger/);
  const flex = flexOf(sp);
  const water = Math.max(0.05, ctx.surfaceY - m.anchor[1]);
  const H = Math.min(water, leafLen * (0.3 + 0.7 * g));
  for (let s = 0; s < shoots; s++) {
    const off = s === 0 ? [0, 0] : [rng.range(-1, 1) * m.spread * 0.4, rng.range(-1, 1) * m.spread * 0.3];
    const ax = m.anchor[0] + off[0], az = m.anchor[2] + off[1];
    const base: V3 = [ax, s === 0 ? m.anchor[1] : ctx.ground(ax, az), az];
    const N = Math.max(2, Math.round((2 + (Nmax - 2) * g) * rng.range(0.8, 1.15)));
    const ph = phase(rng);
    for (let i = 0; i < N; i++) {
      const yaw = p.rotationY + i * GOLDEN + rng.range(-0.4, 0.4);
      const outer = i / N;
      // Buoyant ribbons rise almost vertically; long ones only lean a few degrees and bend
      // gently (the total bend is limited by length so a metre-long leaf doesn't fan out).
      const L = leafLen * (0.3 + 0.7 * g) * rng.range(0.5, 1.04);
      const pitch = rng.range(0.01, 0.07) + outer * (sea ? 0.22 : 0.09) * Math.min(1, 0.35 / Math.max(0.1, L));
      const { dir, bend } = dirAround(UP, yaw, pitch);
      const curv = Math.min(rng.range(0.08, 0.45) * (sea ? 1.2 : 1), 0.13 / Math.max(0.05, L));
      const twist = spiral ? rng.range(0.8, 2.6) * (rng.chance(0.5) ? 1 : -1) : rng.range(-0.5, 0.5);
      // Mixed ages: older outer leaves darker, a few yellowing.
      let c = tint(rng, 0.22, p.health, 0.78 + 0.32 * rng.next());
      if (rng.chance(0.14)) c = mulRGB(c, [0.92, 0.86, 0.55]);
      pushLeaf(list, add(base, dir, 0.002), dir, bend, leafW * rng.range(0.85, 1.1), L, c, [base[1], H, flex, ph + i * 0.61], [curv, twist, 0, 0]);
    }
  }
}

// ---------------------------------------------------------------------------------------------
// Stem plants & fine-leaved stems
// ---------------------------------------------------------------------------------------------

function whorlCount(sp: PlantSpecies): number {
  if (has(sp, /ceratophyllum/)) return 9;
  if (has(sp, /limnophila-sessiliflora/)) return 8;
  if (has(sp, /wallichii/)) return 10;
  if (has(sp, /myriophyllum/)) return 5;
  if (has(sp, /pogostemon-erectus/)) return 7;
  if (has(sp, /egeria/)) return 4;
  if (has(sp, /hydrocotyle/)) return 1;
  return 2;
}

export function genStem({ sp, p, m, ctx, rng, out }: GenArgs): void {
  const fine = sp.form === 'fine-stem';
  const leaves = use(out, speciesLeaf(sp));
  const stems = use(out, stemPart());
  const g = m.growth;
  const H = m.height;
  const water = ctx.surfaceY - m.anchor[1];
  const leafLen = cm(sp.leafLength, 2);
  const leafW = cm(sp.leafWidth, sp.leafLength ? sp.leafLength * 0.4 : 0.8);
  const whorl = whorlCount(sp);
  const cabomba = has(sp, /cabomba/);
  const hornwort = has(sp, /ceratophyllum/);
  // Real internodes: ~0.5× leaf length for opposite-leaved stems, much tighter for whorled ones.
  const internode0 = Math.min(0.035, Math.max(0.0035, leafLen * (fine ? (cabomba ? 0.42 : 0.3) : whorl === 4 ? 0.4 : 0.55)));
  const stemR = Math.min(0.003, Math.max(0.0008, 0.0006 + leafLen * 0.035));
  const nStemsMax = Math.min(9, Math.max(3, Math.round((sp.spreadCm / 100) / 0.016)));
  const nStems = Math.max(2, Math.round(nStemsMax * (0.5 + 0.5 * g) * rng.range(0.85, 1.15)));
  const flex = flexOf(sp);
  const red = tipColored(sp) ? ratio(sp) : null;
  const baseCol = lin(sp.color);
  const stemCol: RGB = red ? mixRGB(mulRGB(baseCol, [1.05, 0.8, 0.75]), lin(sp.color2!), 0.35) : mulRGB(baseCol, [0.95, 1.0, 0.8]);
  const ph0 = phase(rng);
  for (let s = 0; s < nStems; s++) {
    const rng = subRng(p.seed, s);
    const a0 = rng.range(0, Math.PI * 2);
    const r0 = Math.sqrt(rng.next()) * (sp.spreadCm / 100) * 0.22;
    let pos: V3 = [m.anchor[0] + Math.cos(a0) * r0, 0, m.anchor[2] + Math.sin(a0) * r0];
    pos[1] = ctx.ground(pos[0], pos[2]) - 0.004;
    const hs = Math.max(0.02, H * rng.range(0.72, 1.06));
    let d = norm([Math.cos(a0) * rng.range(0, 0.15), 1, Math.sin(a0) * rng.range(0, 0.15)]);
    const ph = ph0 + s * 0.9;
    const swayS: Inst['s'] = [m.anchor[1], Math.min(Math.max(0.03, hs), water), flex, ph];
    let len = 0;
    let node = 0;
    let rot = rng.range(0, Math.PI);
    while (len < hs) {
      const t = len / hs;
      // Fox-tail tips: internodes shorten toward the apex.
      const internode = internode0 * (fine ? 1 - 0.6 * t * t : 1 - 0.35 * t * t) * rng.range(0.9, 1.1);
      const w = rng.range(-1, 1);
      d = norm([d[0] + w * 0.03, d[1] + 0.02, d[2] + rng.range(-1, 1) * 0.03]);
      const next = add(pos, d, internode);
      pushSegment(stems, pos, next, stemR * (1 - 0.35 * t), mulRGB(stemCol, tint(rng, 0.08, p.health)), swayS);
      // Leaves at the node.
      const shaded = t < 0.12 && hs > 0.15 && g > 0.6 && rng.chance(0.75);
      if (!shaded && node > 0) {
        const apex = t > 0.86 ? 1 - ((t - 0.86) / 0.14) * 0.62 : 1;
        const sizeF = apex * (0.92 + 0.08 * Math.min(1, t * 4)) * rng.range(0.88, 1.1);
        const L = leafLen * sizeF;
        // Feathery / forked leaf cards carry the whole divided leaf in their texture: the card is
        // as wide as the leaf's spread, not as its (sub-millimetre) segments.
        const W = (cabomba ? leafLen : fine ? Math.max(leafW, leafLen * 0.45) : leafW) * sizeF;
        // Lower leaves stand out; leaves near the tip close up around the growing point.
        const pitch = (fine ? (cabomba ? 1.35 : hornwort ? 0.75 : 0.9) : 1.25) - (fine && cabomba ? 0.5 : 0.85) * smoothstep(0.72, 1, t) + rng.range(-0.12, 0.12);
        const [e1, e2] = basis(d);
        for (let k = 0; k < whorl; k++) {
          const phi = rot + (k / whorl) * Math.PI * 2 + rng.range(-0.08, 0.08);
          const o = norm(add(scl(e1, Math.cos(phi)), e2, Math.sin(phi)));
          const dir = norm(add(scl(d, Math.cos(pitch)), o, Math.sin(pitch)));
          const bend = norm(add(scl(o, Math.cos(pitch)), d, -Math.sin(pitch)));
          let c = tint(rng, 0.12, p.health, 0.82 + 0.25 * t);
          if (red) c = mulRGB(c, mixRGB([1, 1, 1], red, smoothstep(0.55, 1, t) * (sp.light === 'high' ? 0.9 : 0.7)));
          const curv = cabomba ? rng.range(-0.1, 0.2) : rng.range(0.15, 0.55);
          pushLeaf(leaves, next, dir, bend, W, L, c, swayS, [curv, rng.range(-0.2, 0.2), 0, 0]);
        }
      }
      rot += whorl === 2 ? Math.PI / 2 : whorl === 1 ? GOLDEN : Math.PI / whorl;
      pos = next;
      len += internode;
      node++;
      if (node > 400) break;
    }
  }
}

// ---------------------------------------------------------------------------------------------
// Epiphytes: java fern / bolbitis, anubias / bucephalandra
// ---------------------------------------------------------------------------------------------

export function genEpiphyte({ sp, p, m, rng, out }: GenArgs): void {
  const fern = sp.form === 'epiphyte-fern';
  const leaves = use(out, speciesLeaf(sp));
  const stems = use(out, stemPart());
  const g = m.growth;
  const n = m.normal;
  const up = norm(add(scl(n, 0.55), UP, 0.65));
  const [t1, t2] = basis(up);
  const yaw = p.rotationY;
  const rdir = norm(add(scl(t1, Math.cos(yaw)), t2, Math.sin(yaw)));
  const leafLen = cm(sp.leafLength, fern ? 18 : 8);
  const leafW = cm(sp.leafWidth, fern ? 3 : 4);
  const big = sp.maxHeightCm >= 20;
  const rhizR = fern ? 0.0022 : Math.min(0.006, Math.max(0.0018, leafW * 0.08));
  const rhizL = Math.max(0.012, m.spread * (fern ? 0.35 : 0.3) * (0.4 + 0.6 * g));
  const rhizCol: RGB = fern ? lin('#3a3a22') : mixRGB(lin(sp.color), lin('#5a5a30'), 0.5);
  const flex = flexOf(sp);
  const ph = phase(rng);
  const sway: Inst['s'] = [m.anchor[1], Math.max(0.03, m.height), flex, ph];
  // Rhizome lies on the host surface.
  const rStart = add(add(m.anchor, rdir, -rhizL / 2), n, rhizR * 0.6);
  const rpts: V3[] = [];
  for (let i = 0; i <= 4; i++) rpts.push(add(add(rStart, rdir, (rhizL * i) / 4), n, Math.sin(i * 1.7) * rhizR * 0.6));
  for (let i = 0; i < 4; i++) pushSegment(stems, rpts[i], rpts[i + 1], rhizR, mulRGB(rhizCol, tint(rng, 0.1)), [m.anchor[1], 1, 0, 0]);
  // Wiry roots gripping the host: they run along its surface (two short segments that follow
  // the surface and dip slightly toward it), dark on ferns, pale green-brown on anubias.
  const roots = fern ? rng.int(5, 9) : rng.int(3, 6);
  const side = cross3(n, rdir);
  for (let i = 0; i < roots; i++) {
    const a = rpts[rng.int(0, 4)];
    const along = norm(add(add(rdir, side, rng.range(-1.2, 1.2)), n, -0.25));
    const L = rng.range(0.008, 0.022) * (fern ? 1 : 1.3);
    const mid = add(a, along, L * 0.5);
    const end = add(add(mid, along, L * 0.5), n, -0.002);
    const col = fern ? lin('#1e1a12') : lin('#6e6a46');
    const r = fern ? 0.0004 : 0.0007;
    pushSegment(stems, a, mid, r, col, [m.anchor[1], 1, 0, 0]);
    pushSegment(stems, mid, end, r * 0.8, col, [m.anchor[1], 1, 0, 0]);
  }
  const Nmax = fern ? (has(sp, /bolbitis/) ? 11 : has(sp, /narrow/) ? 16 : 13) : big ? 11 : 14;
  const N = Math.max(2, Math.round((2 + (Nmax - 2) * g) * rng.range(0.85, 1.15)));
  for (let i = 0; i < N; i++) {
    const u = rng.next();
    const at = add(add(rStart, rdir, rhizL * u), n, rhizR);
    const side = fern ? rng.range(-1, 1) : i % 2 === 0 ? 1 : -1;
    const lyaw = Math.atan2(dotp(rdir, t2), dotp(rdir, t1)) + Math.PI / 2 * side + rng.range(-0.6, 0.6);
    const age = i / N;
    // Ferns arch outward; anubias hold their blades fairly flat, facing the light.
    const pitch = fern ? rng.range(0.15, 0.85) : rng.range(0.3, 0.8);
    const { dir, bend } = dirAround(up, lyaw, pitch);
    const size = (0.4 + 0.6 * g) * rng.range(0.6, 1.05) * (age > 0.8 ? 0.7 : 1);
    const L = leafLen * size, W = leafW * size;
    const curv = fern ? rng.range(0.35, 0.95) : rng.range(0.3, 0.75);
    const c = tint(rng, 0.12, p.health, 0.8 + 0.3 * (1 - age));
    pushLeaf(leaves, at, dir, bend, W, L, c, [sway[0], sway[1], flex, ph + i * 0.5], [curv, rng.range(-0.3, 0.3), 0, 0]);
  }
}

function cross3(a: V3, b: V3): V3 {
  return [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
}
function dotp(a: V3, b: V3): number {
  return a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
}

// ---------------------------------------------------------------------------------------------
// Carpets & grasses
// ---------------------------------------------------------------------------------------------

export function genCarpet({ sp, p, m, ctx, rng, out }: GenArgs): void {
  const list = use(out, speciesLeaf(sp));
  const R = Math.max(0.015, m.spread / 2);
  // Underlayer: ground-hugging cards painted with densely packed leaves, so the carpet reads
  // as a closed mat between the individual 3D leaves.
  const matTex = { outline: 'carpet-mat' as const, width: 128, height: 128, base: sp.color, tip: sp.color2 ?? sp.color, seed: 31 };
  const mats = use(out, leafPart(`${sp.id}/mat`, matTex, { rows: 1, cols: 2 }, { transl: 0.2, roughness: 0.75, shadow: false }));
  const tile = 0.032;
  const nTiles = Math.round(((Math.PI * R * R) / (tile * tile)) * 1.7);
  const matNoise = new Noise3(p.seed ^ 77);
  for (let i = 0; i < nTiles; i++) {
    const a = rng.range(0, Math.PI * 2);
    const rr = Math.sqrt(rng.next()) * (R - tile * 0.3);
    const x = m.anchor[0] + Math.cos(a) * rr, z = m.anchor[2] + Math.sin(a) * rr;
    if (matNoise.noise(x * 40, z * 40, 0.7) < -0.35) continue;
    const yaw = rng.range(0, Math.PI * 2);
    const d: V3 = [Math.cos(yaw), 0, Math.sin(yaw)];
    const s = tile * rng.range(0.85, 1.25);
    const y = ctx.ground(x, z) + 0.0012 + rng.next() * 0.001;
    pushLeaf(mats, [x - d[0] * s * 0.5, y, z - d[2] * s * 0.5], d, scl(UP, -1), s, s, tint(rng, 0.1, p.health, 0.9), [m.anchor[1], 0.02, 0, 0], [0, 0, 0, 0]);
  }
  const leafLen = cm(sp.leafLength, 0.6);
  const leafW = cm(sp.leafWidth, sp.leafLength ?? 0.5);
  const Hc = Math.max(0.006, m.height);
  const area = Math.PI * R * R;
  const count = Math.min(3000, Math.round((area / (leafLen * leafW)) * 1.1 * ctx.density));
  const noise = new Noise3(p.seed);
  const flex = flexOf(sp);
  const ph = phase(rng);
  const upright = has(sp, /glossostigma/) ? 0.5 : 1;
  for (let i = 0; i < count; i++) {
    const a = rng.range(0, Math.PI * 2);
    const rr = Math.sqrt(rng.next());
    const edge = 1 + 0.22 * noise.noise(Math.cos(a) * 2, Math.sin(a) * 2, 0.5);
    const x = m.anchor[0] + Math.cos(a) * rr * R * edge;
    const z = m.anchor[2] + Math.sin(a) * rr * R * edge;
    // Clumpy cover: thin out in patches, denser toward the middle.
    const clump = noise.noise(x * 40, z * 40, 1.3) * 0.5 + 0.5;
    if (rng.next() > 0.35 + 0.65 * clump * (1.1 - rr * 0.4)) continue;
    const mound = Math.sqrt(Math.max(0, 1 - rr * rr)) * (0.7 + 0.3 * clump);
    const h = Hc * mound * rng.range(0.15, 1);
    const y = ctx.ground(x, z) + h;
    const yaw = rng.range(0, Math.PI * 2);
    const pitch = rng.range(0.7, 1.45) * upright + (1 - upright) * rng.range(0.3, 0.8);
    const { dir, bend } = dirAround(UP, yaw, pitch);
    const s = rng.range(0.75, 1.15);
    const depthAO = 0.42 + 0.58 * (h / Hc);
    const c = tint(rng, 0.14, p.health, depthAO);
    pushLeaf(list, [x, y, z], dir, bend, leafW * s, leafLen * s, c, [m.anchor[1], Hc + 0.01, flex, ph + x * 30], [rng.range(-0.3, 0.2), rng.range(-0.3, 0.3), 0, 0]);
  }
}

export function genGrass({ sp, p, m, ctx, rng, out }: GenArgs): void {
  const list = use(out, speciesLeaf(sp));
  const g = m.growth;
  const tall = sp.maxHeightCm > 20;
  const chain = has(sp, /helanthium|tenellum/);
  const microsword = has(sp, /lilaeopsis/);
  const tuftsMax = tall ? 4 : chain ? 5 : microsword ? 7 : 9;
  const perTuft = tall ? 28 : chain ? 7 : microsword ? 12 : 20;
  const tufts = Math.max(1, Math.round((1 + (tuftsMax - 1) * g) * rng.range(0.85, 1.15)));
  const R = Math.max(0.01, m.spread / 2);
  const leafLen = cm(sp.leafLength, sp.maxHeightCm * 0.9);
  const leafW = Math.max(0.0011, cm(sp.leafWidth, 0.1));
  const flex = flexOf(sp);
  const water = ctx.surfaceY - m.anchor[1];
  for (let t = 0; t < tufts; t++) {
    const rng = subRng(p.seed, t);
    const a = rng.range(0, Math.PI * 2);
    const rr = t === 0 ? 0 : Math.sqrt(rng.next()) * R;
    const cx = m.anchor[0] + Math.cos(a) * rr, cz = m.anchor[2] + Math.sin(a) * rr;
    const gy = ctx.ground(cx, cz);
    const n = Math.max(3, Math.round(perTuft * (0.5 + 0.5 * g) * rng.range(0.7, 1.2) * Math.min(1.2, ctx.density + 0.2)));
    const ph = phase(rng);
    for (let i = 0; i < n; i++) {
      const yaw = rng.range(0, Math.PI * 2);
      const pitch = rng.range(0.0, tall ? 0.18 : 0.42) * (0.6 + 0.4 * rng.next());
      const { dir, bend } = dirAround(UP, yaw, pitch);
      const L = leafLen * (0.4 + 0.6 * g) * rng.range(0.55, 1.02);
      const base: V3 = [cx + Math.cos(yaw) * rng.range(0, 0.004), gy - 0.002, cz + Math.sin(yaw) * rng.range(0, 0.004)];
      const c = tint(rng, 0.16, p.health, rng.range(0.78, 1.08));
      pushLeaf(list, base, dir, bend, leafW * rng.range(0.85, 1.2), L, c, [gy, Math.min(water, Math.max(0.02, L)), flex, ph + i * 0.13], [rng.range(0.15, tall ? 0.5 : 0.95), rng.range(-0.6, 0.6), 0, 0]);
    }
  }
}

// ---------------------------------------------------------------------------------------------
// Moss
// ---------------------------------------------------------------------------------------------

export function genMoss({ sp, p, m, ctx, rng, out }: GenArgs): void {
  const list = use(out, speciesLeaf(sp));
  const g = m.growth;
  const R = Math.max(0.015, m.spread / 2);
  const H = Math.max(0.006, m.height);
  const count = Math.round((80 + 420 * g) * ctx.density * Math.min(1.6, R / 0.06));
  const sprig = cm(sp.leafLength, 1.5);
  const christmas = has(sp, /montagnei/);
  const flame = has(sp, /flame/);
  const weeping = has(sp, /ferriei|weeping/);
  const phoenix = has(sp, /fissidens/);
  const flex = flexOf(sp);
  const ph = phase(rng);
  const host = m.hostId ? ctx.tank.decor.find((d) => d.id === m.hostId) : undefined;
  const pts = host
    ? sampleHostSurface(host, m.anchor, R, count, rng)
    : Array.from({ length: count }, () => {
        const a = rng.range(0, Math.PI * 2);
        const rr = Math.sqrt(rng.next());
        const x = m.anchor[0] + Math.cos(a) * rr * R, z = m.anchor[2] + Math.sin(a) * rr * R * 0.8;
        const dome = Math.sqrt(Math.max(0, 1 - rr * rr));
        const y = ctx.ground(x, z) + H * dome * rng.range(0.1, 0.9);
        return { p: [x, y, z] as V3, n: norm([Math.cos(a) * rr, dome + 0.3, Math.sin(a) * rr]) };
      });
  for (const pt of pts) {
    const n = pt.n;
    const layer = rng.next();
    const base = add(pt.p, n, layer * H * 0.7);
    const rnd: V3 = [rng.range(-1, 1), rng.range(-1, 1), rng.range(-1, 1)];
    let dir: V3;
    let curv = rng.range(-0.3, 0.5), twist = rng.range(-0.4, 0.4);
    if (christmas) {
      const [t1] = basis(n);
      dir = norm(add(add(scl(n, 0.3), t1, Math.cos(layer * 20)), rnd, 0.6));
      curv = rng.range(-0.15, 0.15);
    } else if (flame) {
      dir = norm(add(add(scl(n, 0.45), UP, 0.8), rnd, 0.25));
      twist = rng.range(1.5, 3.5);
      curv = rng.range(0.2, 0.6);
    } else if (weeping) {
      dir = norm(add(add(scl(n, 0.5), UP, -0.55), rnd, 0.3));
      curv = rng.range(0.3, 0.7);
    } else if (phoenix) {
      dir = norm(add(add(scl(n, 1), UP, 0.3), rnd, 0.3));
    } else {
      dir = norm(add(n, rnd, 0.95));
    }
    const s = rng.range(0.55, 1.25);
    const L = sprig * s * (0.6 + 0.4 * g);
    const c = tint(rng, 0.16, p.health, 0.5 + 0.5 * layer);
    pushLeaf(list, base, dir, rnd, L * 0.55, L, c, [m.anchor[1] - 0.02, Math.max(0.04, H * 3), flex, ph + layer * 3], [curv, twist, 0, 0]);
  }
}

// ---------------------------------------------------------------------------------------------
// Floating plants
// ---------------------------------------------------------------------------------------------

export function genFloating({ sp, p, m, ctx, rng, out }: GenArgs): void {
  const look = leafLook(sp);
  const leaves = use(out, leafPart(`${sp.id}/leaf`, look.tex, { rows: look.rows, cup: look.cup, fold: 0.02 }, { transl: look.transl, roughness: look.roughness }));
  const lemna = has(sp, /lemna/);
  const riccia = has(sp, /riccia/);
  const pistia = has(sp, /pistia/);
  const salvinia = has(sp, /salvinia/);
  const phyl = has(sp, /phyllanthus/);
  const rootCol = phyl ? (sp.color2 ?? '#a03a2a') : salvinia ? '#6a5236' : pistia ? '#3a3226' : '#d8d4c4';
  const roots = riccia
    ? null
    : use(out, leafPart(`${sp.id}/root`, { outline: salvinia || pistia ? 'feathery-root' : 'root', width: 64, height: 256, base: rootCol, tip: rootCol, seed: 3 }, { rows: 6, fold: 0 }, { transl: 0.5, roughness: 0.6, shadow: false }));
  const g = m.growth;
  const R = Math.max(0.02, m.spread / 2);
  const leafLen = cm(sp.leafLength, 2);
  const leafW = cm(sp.leafWidth, sp.leafLength ?? 2);
  const rosettes = lemna ? Math.round((25 + 220 * g) * ctx.density) : riccia ? Math.round((12 + 60 * g) * ctx.density) : Math.max(1, Math.round((pistia ? 1 + 2 * g : salvinia ? 3 + 10 * g : 1 + 7 * g) * rng.range(0.85, 1.15)));
  const y = ctx.surfaceY - 0.0055;
  const flex = flexOf(sp);
  const rootLen = pistia ? 0.12 : lemna ? 0.012 : salvinia ? 0.03 : phyl ? 0.04 : 0.09;
  for (let r = 0; r < rosettes; r++) {
    const rng = subRng(p.seed, r);
    // Colonies spread as loose clusters.
    const a = rng.range(0, Math.PI * 2);
    const rr = r === 0 ? 0 : Math.min(1, Math.abs(rng.normal(0, 0.5))) * R;
    const cx = m.anchor[0] + Math.cos(a) * rr, cz = m.anchor[2] + Math.sin(a) * rr * 0.8;
    const ph = phase(rng);
    const nLeaves = lemna ? rng.int(1, 3) : riccia ? rng.int(3, 6) : pistia ? rng.int(6, 9) : salvinia ? 2 : rng.int(3, 6);
    const yaw0 = rng.range(0, Math.PI * 2);
    for (let i = 0; i < nLeaves; i++) {
      const yaw = yaw0 + (i / nLeaves) * Math.PI * 2 + rng.range(-0.3, 0.3);
      // Floating leaves lie flat; water lettuce rosettes stand a little.
      const pitch = pistia ? rng.range(1.0, 1.3) : rng.range(1.42, 1.56);
      const { dir, bend } = dirAround(UP, yaw, pitch);
      const s = (0.5 + 0.5 * g) * rng.range(0.7, 1.1);
      const L = leafLen * s, W = leafW * s;
      const base: V3 = [cx, y - (pistia ? 0.006 : 0), cz];
      const c = tint(rng, 0.12, p.health, rng.range(0.85, 1.1));
      pushLeaf(leaves, base, dir, bend, W, L, c, [y, 0.05, flex * 0.1, ph], [pistia ? rng.range(-0.6, -0.2) : rng.range(-0.25, 0.05), 0, 0, 0]);
    }
    if (roots) {
      const nRoots = lemna ? 1 : pistia ? rng.int(8, 14) : salvinia ? rng.int(2, 4) : rng.int(3, 8);
      for (let i = 0; i < nRoots; i++) {
        const L = rootLen * (0.4 + 0.6 * g) * rng.range(0.5, 1.1);
        const d = norm([rng.range(-0.15, 0.15), -1, rng.range(-0.15, 0.15)]);
        const base: V3 = [cx + rng.range(-0.004, 0.004), y - 0.001, cz + rng.range(-0.004, 0.004)];
        pushLeaf(roots, base, d, [rng.range(-1, 1), 0, rng.range(-1, 1)], L * (salvinia || pistia ? 0.35 : 0.12), L, tint(rng, 0.15, 1), [y, -Math.max(0.01, L), 0.9, ph + i], [rng.range(-0.3, 0.3), rng.range(-1, 1), 0, 0]);
      }
    }
  }
  out.proxy = { a: [m.anchor[0], y - rootLen, m.anchor[2]], b: [m.anchor[0], y, m.anchor[2]], r: Math.max(0.03, R * 0.8) };
}

// ---------------------------------------------------------------------------------------------
// Lilies (tiger lotus, banana plant) and bulbs (aponogeton, barclaya)
// ---------------------------------------------------------------------------------------------

export function genLily({ sp, p, m, ctx, rng, out }: GenArgs): void {
  const leaves = use(out, speciesLeaf(sp));
  const stems = use(out, stemPart());
  const bulbs = use(out, spherePart('matte'));
  const g = m.growth;
  const leafLen = cm(sp.leafLength, 10);
  const leafW = cm(sp.leafWidth, 8);
  const flex = flexOf(sp);
  const ph = phase(rng);
  const banana = has(sp, /nymphoides/);
  // Bulb / tuber, half buried.
  const bulbR = banana ? 0.006 : 0.012;
  if (banana) {
    for (let i = 0; i < 5; i++) {
      const a = (i / 5) * Math.PI * 2;
      const b: V3 = [m.anchor[0] + Math.cos(a) * 0.006, m.anchor[1] + 0.003, m.anchor[2] + Math.sin(a) * 0.006];
      pushInst(bulbs, b, [Math.cos(a) * 0.4, 1, Math.sin(a) * 0.4], [Math.cos(a), 0, Math.sin(a)], 0.004, 0.011, 0.004, lin('#8a9a5a'), [m.anchor[1], 1, 0, 0]);
    }
  } else {
    pushInst(bulbs, [m.anchor[0], m.anchor[1] - bulbR * 0.25, m.anchor[2]], UP, [1, 0, 0], bulbR, bulbR * 0.8, bulbR, lin('#5a4030'), [m.anchor[1], 1, 0, 0]);
  }
  const water = ctx.surfaceY - m.anchor[1];
  const N = Math.max(2, Math.round((2 + 7 * g) * rng.range(0.85, 1.15)));
  const subH = Math.min(water * 0.7, m.height * 0.6);
  for (let i = 0; i < N; i++) {
    const yaw = p.rotationY + i * GOLDEN;
    const pitch = rng.range(0.25, 0.85);
    const { dir, bend } = dirAround(UP, yaw, pitch);
    const L = Math.max(leafLen * 1.4, subH * rng.range(0.45, 1.0)) * (0.5 + 0.5 * g);
    const W = leafW * (0.6 + 0.4 * g) * rng.range(0.85, 1.1);
    pushLeaf(leaves, add(m.anchor, UP, 0.006), dir, bend, W, L, tint(rng, 0.14, p.health, rng.range(0.85, 1.1)), [m.anchor[1], Math.max(0.05, subH), flex, ph + i], [rng.range(0.7, 1.3), rng.range(-0.2, 0.2), 0, 0]);
  }
  // Floating pads reach the surface on long, thin petioles once the plant is established.
  const pads = g > 0.85 ? 2 : g > 0.55 ? 1 : 0;
  if (pads) {
    const padTex = { ...leafLook(sp).tex, outline: 'heart' as const, petiole: 0, base: mixHex(sp.color, '#4a6a2c', 0.55), tip: mixHex(sp.color, '#5a7a34', 0.5), veins: 'palmate' as const, spots: undefined, height: 128, width: 128 };
    const padPart = use(out, leafPart(`${sp.id}/pad`, padTex, { rows: 2, cup: -0.04 }, { transl: 0.2, roughness: 0.3 }));
    for (let i = 0; i < pads; i++) {
      const a = rng.range(0, Math.PI * 2);
      const r = rng.range(0.04, 0.12);
      const D = (banana ? 0.06 : 0.11) * rng.range(0.8, 1.15);
      const center: V3 = [m.anchor[0] + Math.cos(a) * r, ctx.surfaceY - 0.006, m.anchor[2] + Math.sin(a) * r];
      const top: V3 = [center[0], center[1] - 0.004, center[2]];
      // Petiole sags slightly in a gentle curve.
      const mid: V3 = [(m.anchor[0] + top[0]) / 2 + rng.range(-0.02, 0.02), (m.anchor[1] + top[1]) / 2, (m.anchor[2] + top[2]) / 2 + rng.range(-0.02, 0.02)];
      const sway: Inst['s'] = [m.anchor[1], Math.max(0.05, water), flex * 0.5, ph + i];
      pushSegment(stems, m.anchor, mid, 0.0015, lin('#6a4a34'), sway);
      pushSegment(stems, mid, top, 0.0014, lin('#6a4a34'), sway);
      const yaw = rng.range(0, Math.PI * 2);
      const dir: V3 = [Math.cos(yaw), 0, Math.sin(yaw)];
      const base = add(center, dir, -D / 2);
      pushLeaf(padPart, base, dir, scl(UP, -1), D, D, tint(rng, 0.1, p.health), sway, [0, 0, 0, 0]);
    }
  }
}

function mixHex(a: string, b: string, t: number): string {
  const pa = parseInt(a.slice(1), 16), pb = parseInt(b.slice(1), 16);
  const ch = (s: number) => Math.round(((pa >> s) & 255) * (1 - t) + ((pb >> s) & 255) * t);
  return `#${((ch(16) << 16) | (ch(8) << 8) | ch(0)).toString(16).padStart(6, '0')}`;
}

export function genBulb({ sp, p, m, ctx, rng, out }: GenArgs): void {
  const leaves = use(out, speciesLeaf(sp));
  const bulbs = use(out, spherePart('matte'));
  const g = m.growth;
  const leafLen = cm(sp.leafLength, 30);
  const leafW = cm(sp.leafWidth, 3);
  const flex = flexOf(sp);
  const ph = phase(rng);
  const water = ctx.surfaceY - m.anchor[1];
  pushInst(bulbs, [m.anchor[0], m.anchor[1] - 0.003, m.anchor[2]], UP, [1, 0, 0], 0.011, 0.009, 0.011, lin('#4a3626'), [m.anchor[1], 1, 0, 0]);
  const N = Math.max(3, Math.round((3 + 11 * g) * rng.range(0.85, 1.15)));
  for (let i = 0; i < N; i++) {
    const a = i / N;
    const yaw = p.rotationY + i * GOLDEN + rng.range(-0.2, 0.2);
    const pitch = rng.range(0.12, 0.6) + (1 - a) * 0.2;
    const { dir, bend } = dirAround(UP, yaw, pitch);
    const L = leafLen * (0.35 + 0.65 * g) * rng.range(0.6, 1.05);
    pushLeaf(leaves, add(m.anchor, UP, 0.006), dir, bend, leafW * rng.range(0.85, 1.1), L, tint(rng, 0.12, p.health, 0.85 + 0.25 * a), [m.anchor[1], Math.min(water, Math.max(0.05, m.height)), flex, ph + i * 0.7], [rng.range(0.4, 1.1), rng.range(-0.7, 0.7), 0, 0]);
  }
}

// ---------------------------------------------------------------------------------------------
// Marimo
// ---------------------------------------------------------------------------------------------

export function genBall({ sp, p, m, rng, out }: GenArgs): void {
  const r = Math.max(0.01, m.height / 2);
  const ico = icosphere(4);
  const noise = new Noise3(p.seed);
  const gb = new GeoBuilder();
  const base = lin(sp.color), hi = lin(sp.color2 ?? sp.color);
  const center: V3 = [m.anchor[0], m.anchor[1] + r * 0.88, m.anchor[2]];
  for (let k = 0; k < ico.p.length; k += 3) {
    const ux = ico.p[k], uy = ico.p[k + 1], uz = ico.p[k + 2];
    const bump = 1 + 0.035 * noise.fbm(ux * 3, uy * 3, uz * 3, 3) - (uy < -0.6 ? (uy + 0.6) * 0.25 : 0);
    const pos: V3 = [center[0] + ux * r * bump, center[1] + uy * r * bump, center[2] + uz * r * bump];
    const t = noise.fbm(ux * 5 + 2, uy * 5, uz * 5, 2) * 0.5 + 0.5;
    const ao = 0.55 + 0.45 * smoothstep(-0.9, 0.3, uy);
    const c = mixRGB(base, hi, t).map((v) => v * ao) as RGB;
    gb.vertex(pos, [ux, uy, uz], undefined, c, [ux * r, uy * r, uz * r]);
    gb.attr('aSway', 4, [m.anchor[1], 1, 0, 0]);
  }
  for (let k = 0; k < ico.i.length; k += 3) gb.tri(ico.i[k], ico.i[k + 1], ico.i[k + 2]);
  const mat = new MeshStandardMaterial({ vertexColors: true, roughness: 1, metalness: 0 });
  const sel = { value: 0 };
  patchSurfaceDetail(mat, { freq: 900, bump: 0.00035, ridge: 0.3, albedoVar: 0.25, roughVar: 0 });
  patchPlant(mat, { translucency: 0.15, selUniform: sel });
  applyUnderwater(mat);
  const mesh = new Mesh(gb.build(), mat);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  out.meshes.push(mesh);
  out.selUniforms.push(sel);
  out.proxy = { a: center, b: center, r: r * 1.1 };
  void rng;
}

// ---------------------------------------------------------------------------------------------
// Marine macroalgae
// ---------------------------------------------------------------------------------------------

export function genMacroalgae(args: GenArgs): void {
  const { sp, p, m, ctx, rng, out } = args;
  const g = m.growth;
  const flex = flexOf(sp);
  const ph = phase(rng);
  const H = Math.max(0.03, m.height);
  if (has(sp, /chaeto/)) {
    // A springy tangle: squiggle cards in an ellipsoid volume.
    const list = use(out, speciesLeaf(sp));
    const n = Math.round((40 + 160 * g) * ctx.density);
    const R = m.spread / 2;
    for (let i = 0; i < n; i++) {
      const u: V3 = norm([rng.range(-1, 1), rng.range(-1, 1), rng.range(-1, 1)]);
      const rr = Math.cbrt(rng.next());
      const c: V3 = [m.anchor[0] + u[0] * rr * R, m.anchor[1] + H * 0.5 + u[1] * rr * H * 0.5, m.anchor[2] + u[2] * rr * R * 0.8];
      const d = norm([rng.range(-1, 1), rng.range(-1, 1), rng.range(-1, 1)]);
      const L = cm(sp.leafLength, 6) * rng.range(0.6, 1.2);
      pushLeaf(list, c, d, [rng.range(-1, 1), rng.range(-1, 1), rng.range(-1, 1)], L, L, tint(rng, 0.2, p.health, 0.6 + 0.4 * rr), [m.anchor[1], H, flex * 0.5, ph], [rng.range(-1, 1), rng.range(-1, 1), 0, 0]);
    }
    return;
  }
  if (has(sp, /racemosa|halimeda/)) {
    // Runners with upright stalks bearing grapes / calcified coins.
    const stems = use(out, stemPart());
    const grapes = has(sp, /halimeda/) ? use(out, speciesLeaf(sp)) : use(out, spherePart('glossy'));
    const n = Math.round(3 + 9 * g);
    const col = lin(sp.color);
    for (let i = 0; i < n; i++) {
      const a = rng.range(0, Math.PI * 2), rr = Math.sqrt(rng.next()) * m.spread * 0.45;
      const x = m.anchor[0] + Math.cos(a) * rr, z = m.anchor[2] + Math.sin(a) * rr;
      let pos: V3 = [x, (m.hostId ? m.anchor[1] : ctx.ground(x, z)) - 0.002, z];
      const hs = H * rng.range(0.4, 1.0);
      let d: V3 = norm([rng.range(-0.3, 0.3), 1, rng.range(-0.3, 0.3)]);
      const steps = Math.max(3, Math.round(hs / 0.008));
      for (let s = 0; s < steps; s++) {
        const next = add(pos, d, hs / steps);
        pushSegment(stems, pos, next, 0.0012, mulRGB(col, [0.85, 0.9, 0.75]), [m.anchor[1], H, flex, ph + i]);
        const t = s / steps;
        if (t > 0.25) {
          for (let k = 0; k < 3; k++) {
            const o = norm([rng.range(-1, 1), rng.range(-0.3, 0.6), rng.range(-1, 1)]);
            if (has(sp, /halimeda/)) {
              const L = cm(sp.leafLength, 1.2);
              pushLeaf(grapes, add(next, o, 0.003), o, UP, L, L, tint(rng, 0.15, p.health), [m.anchor[1], H, flex, ph + i], [0, 0, 0, 0]);
            } else {
              const r = rng.range(0.0022, 0.0034);
              pushInst(grapes, add(next, o, 0.003 + r), UP, [1, 0, 0], r, r, r, mulRGB(col, tint(rng, 0.15, p.health)), [m.anchor[1], H, flex, ph + i]);
            }
          }
        }
        d = norm([d[0] + rng.range(-0.15, 0.15), d[1], d[2] + rng.range(-0.15, 0.15)]);
        pos = next;
      }
    }
    return;
  }
  if (has(sp, /gracilaria|ogo/)) {
    // Bushy red cylindrical thalli: a unique branching mesh that sways as a whole.
    out.meshes.push(...branchingThallus(args));
    return;
  }
  // Blades: caulerpa prolifera / sertularioides on runners, dragon's breath & sea lettuce sheets.
  const list = use(out, speciesLeaf(sp));
  const runners = has(sp, /caulerpa/);
  const n = Math.round((runners ? 5 : 4) + (runners ? 12 : 8) * g);
  const leafLen = cm(sp.leafLength, 8);
  const leafW = cm(sp.leafWidth, 2);
  for (let i = 0; i < n; i++) {
    const a = rng.range(0, Math.PI * 2);
    const rr = runners ? Math.sqrt(rng.next()) * m.spread * 0.45 : rng.range(0, 0.01);
    const x = m.anchor[0] + Math.cos(a) * rr, z = m.anchor[2] + Math.sin(a) * rr;
    const base: V3 = [x, (m.hostId ? m.anchor[1] : ctx.ground(x, z)) - 0.001, z];
    const yaw = rng.range(0, Math.PI * 2);
    const { dir, bend } = dirAround(m.normal, yaw, rng.range(0.05, runners ? 0.4 : 0.7));
    const L = leafLen * (0.4 + 0.6 * g) * rng.range(0.6, 1.1);
    pushLeaf(list, base, dir, bend, leafW * rng.range(0.8, 1.2), L, tint(rng, 0.14, p.health), [m.anchor[1], H, flex, ph + i], [rng.range(0.1, 0.6), rng.range(-0.8, 0.8), 0, 0]);
  }
}

/** Shared tiny branching-skeleton generator for soft algae, corals and gorgonians. */
export interface Sprig {
  pts: V3[];
  r: number[];
  depth: number;
}

export function growSprigs(rng: Rng, start: V3, up: V3, opts: { trunks: number; len: number; r0: number; tipR: number; spread: number; branchProb: number; angle: [number, number]; depth: number; wander: number; upBias: number; planar?: V3; step?: number; maxSprigs?: number }): Sprig[] {
  const out: Sprig[] = [];
  // Branching is exponential: cap the total so a dense sea plume stays a few thousand triangles.
  const maxSprigs = opts.maxSprigs ?? 90;
  let budget = maxSprigs - opts.trunks;
  const grow = (p0: V3, d0: V3, len: number, r0: number, depth: number) => {
    const step = opts.step ?? Math.max(0.004, len / 10);
    const n = Math.max(2, Math.ceil(len / step));
    const pts: V3[] = [p0];
    const rs: number[] = [r0];
    let d = d0;
    let p = p0;
    const kids: { at: V3; d: V3; len: number; r: number }[] = [];
    for (let i = 1; i <= n; i++) {
      const t = i / n;
      d = norm(add(add(d, [rng.range(-1, 1), rng.range(-1, 1), rng.range(-1, 1)], opts.wander), up, opts.upBias));
      if (opts.planar) d = norm(add(d, opts.planar, -dotp(d, opts.planar)));
      p = add(p, d, len / n);
      pts.push(p);
      const r = Math.max(opts.tipR, r0 * (1 - 0.6 * t));
      rs.push(r);
      if (depth < opts.depth && i < n && budget > 0 && rng.chance(opts.branchProb)) {
        budget--;
        let axis = norm(cross3(d, [rng.range(-1, 1), rng.range(-1, 1), rng.range(-1, 1)]));
        if (opts.planar) axis = opts.planar;
        const ang = rng.range(opts.angle[0], opts.angle[1]) * (rng.chance(0.5) ? 1 : -1);
        const c = Math.cos(ang), s = Math.sin(ang);
        const cd = cross3(axis, d);
        const nd = norm(add(add(scl(d, c), cd, s), axis, dotp(axis, d) * (1 - c)));
        kids.push({ at: p, d: nd, len: len * (1 - t) * 0.75 + len * 0.15, r: r * 0.8 });
      }
    }
    out.push({ pts, r: rs, depth });
    for (const k of kids) grow(k.at, k.d, k.len, k.r, depth + 1);
  };
  for (let i = 0; i < opts.trunks; i++) {
    const a = (i / opts.trunks) * Math.PI * 2 + rng.range(-0.4, 0.4);
    const [t1, t2] = basis(up);
    let o = norm(add(scl(t1, Math.cos(a)), t2, Math.sin(a)));
    if (opts.planar) o = norm(add(o, opts.planar, -dotp(o, opts.planar)));
    const d = norm(add(scl(up, 1), o, opts.spread * rng.range(0.6, 1.2)));
    grow(start, d, opts.len * rng.range(0.75, 1.1), opts.r0, 0);
  }
  return out;
}

function branchingThallus({ sp, p, m, rng, out }: GenArgs): Mesh[] {
  const g = m.growth;
  const H = Math.max(0.03, m.height);
  const sprigs = growSprigs(rng, m.anchor, m.normal, { trunks: Math.round(4 + 6 * g), len: H * 0.7, r0: 0.0016, tipR: 0.0009, spread: 0.9, branchProb: 0.32, angle: [0.4, 0.9], depth: 3, wander: 0.25, upBias: 0.12 });
  const base = lin(sp.color), tip = lin(sp.color2 ?? sp.color);
  const geo = sprigMesh(sprigs, (t, depth) => mixRGB(base, tip, Math.min(1, t * 0.5 + depth * 0.2)), [m.anchor[1], H, flexOf(sp), rng.range(0, 6.28)], 5);
  const sel = { value: 0 };
  const mat = new MeshStandardMaterial({ vertexColors: true, roughness: 0.45, metalness: 0 });
  patchPlant(mat, { translucency: 0.5, selUniform: sel });
  applyUnderwater(mat);
  const mesh = new Mesh(geo, mat);
  mesh.castShadow = true;
  out.selUniforms.push(sel);
  void p;
  return [mesh];
}

/** Tube mesh for sprigs with per-vertex color and the plant sway attribute. */
export function sprigMesh(sprigs: Sprig[], color: (t: number, depth: number, around: number) => RGB, sway: [number, number, number, number], radialIn: number, capTips = true): BufferGeometry {
  const gb = new GeoBuilder();
  for (const s of sprigs) {
    const n = s.pts.length;
    if (n < 2) continue;
    // Hair-thin sprigs need fewer sides.
    const radial = s.r[0] < 0.0015 ? Math.min(radialIn, 3) : s.r[0] < 0.003 ? Math.min(radialIn, 5) : radialIn;
    const T: V3[] = s.pts.map((_, i) => norm([s.pts[Math.min(n - 1, i + 1)][0] - s.pts[Math.max(0, i - 1)][0], s.pts[Math.min(n - 1, i + 1)][1] - s.pts[Math.max(0, i - 1)][1], s.pts[Math.min(n - 1, i + 1)][2] - s.pts[Math.max(0, i - 1)][2]]));
    let N0 = basis(T[0])[0];
    const starts: number[] = [];
    for (let i = 0; i < n; i++) {
      const t = T[i];
      N0 = norm(add(N0, t, -dotp(N0, t)));
      const B = cross3(t, N0);
      starts.push(gb.count);
      for (let a = 0; a <= radial; a++) {
        const th = (a / radial) * Math.PI * 2;
        const dir = norm(add(scl(N0, Math.cos(th)), B, Math.sin(th)));
        const pos = add(s.pts[i], dir, s.r[i]);
        gb.vertex(pos, dir, [a / radial, i / (n - 1)], color(i / (n - 1), s.depth, a / radial), [th * s.r[i], i * 0.01, s.depth]);
        gb.attr('aSway', 4, sway);
      }
    }
    for (let i = 0; i < n - 1; i++) {
      for (let a = 0; a < radial; a++) {
        const v0 = starts[i] + a, v1 = v0 + 1, v2 = starts[i + 1] + a, v3 = v2 + 1;
        gb.tri(v0, v1, v2);
        gb.tri(v1, v3, v2);
      }
    }
    if (capTips) {
      const tipP = add(s.pts[n - 1], T[n - 1], s.r[n - 1]);
      const tip = gb.vertex(tipP, T[n - 1], [0.5, 1], color(1, s.depth, 0), [0, n * 0.01, s.depth]);
      gb.attr('aSway', 4, sway);
      for (let a = 0; a < radial; a++) gb.tri(starts[n - 1] + a, starts[n - 1] + a + 1, tip);
    }
  }
  return gb.build();
}

