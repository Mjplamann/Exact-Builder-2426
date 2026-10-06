/**
 * Procedural species portraits as small SVGs, built from the same BodyPlan + Appearance data the
 * 3D renderer uses: body depth & proportions, tail shape, fins, eye, and the main color patterns.
 * Used as the tasteful placeholder in the catalog until (or unless) the fish renderer provides a
 * real 3D thumbnail. Pure string generation, cached per species.
 */
import type { CaudalShape, FinSpec, Pattern, Species } from '../core/types';

const W = 160;
const H = 100;
const CY = 50;

const cache = new Map<string, string>();

export function silhouetteDataUrl(sp: Species): string {
  let url = cache.get(sp.id);
  if (!url) {
    url = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(silhouetteSvg(sp))}`;
    cache.set(sp.id, url);
  }
  return url;
}

export function silhouetteSvg(sp: Species): string {
  const a = sp.body.archetype;
  switch (a) {
    case 'shrimp':
      return shrimpSvg(sp);
    case 'snail':
      return snailSvg(sp);
    case 'crab':
    case 'hermit-crab':
      return crabSvg(sp);
    case 'crayfish':
      return crayfishSvg(sp);
    case 'starfish':
    case 'brittle-star':
      return starSvg(sp, a === 'brittle-star');
    case 'urchin':
      return urchinSvg(sp);
    default:
      break;
  }
  if (sp.group === 'shrimp') return shrimpSvg(sp);
  if (sp.group === 'snail') return snailSvg(sp);
  if (sp.group === 'crab') return crabSvg(sp);
  if (sp.group === 'crayfish') return crayfishSvg(sp);
  if (sp.group === 'starfish') return starSvg(sp, false);
  if (sp.group === 'urchin') return urchinSvg(sp);
  return fishSvg(sp);
}

// ---------------------------------------------------------------------------------------------
// Color helpers
// ---------------------------------------------------------------------------------------------

function hex(c: string | undefined, fallback: string): string {
  return c && /^#[0-9a-f]{6}$/i.test(c) ? c : fallback;
}

function mix(a: string, b: string, t: number): string {
  const pa = parseInt(a.slice(1), 16);
  const pb = parseInt(b.slice(1), 16);
  const ch = (shift: number) => {
    const x = (pa >> shift) & 255;
    const y = (pb >> shift) & 255;
    return Math.round(x + (y - x) * t);
  };
  return `#${((ch(16) << 16) | (ch(8) << 8) | ch(0)).toString(16).padStart(6, '0')}`;
}

const n = (v: number) => (Math.round(v * 10) / 10).toString();

function svgWrap(body: string, defs = ''): string {
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}"><defs>${defs}</defs>${body}</svg>`;
}

// ---------------------------------------------------------------------------------------------
// Fish
// ---------------------------------------------------------------------------------------------

/** Rough per-archetype defaults for portraits when the species omits a value. */
const DEEP: Partial<Record<string, number>> = {
  discus: 0.85, angelfish: 0.62, 'marine-angel': 0.6, 'dwarf-angel': 0.5, butterflyfish: 0.6, 'butterflyfish-fw': 0.3,
  'moorish-idol': 0.75, tang: 0.6, batfish: 0.8, piranha: 0.5, pacu: 0.6, 'fancy-goldfish': 0.6, gourami: 0.45,
  mono: 0.8, scat: 0.65, sunfish: 0.48, hatchetfish: 0.48, cichlid: 0.45, frontosa: 0.42, oscar: 0.45, 'dwarf-cichlid': 0.38,
  barb: 0.38, clownfish: 0.4, damselfish: 0.45, chromis: 0.42, triggerfish: 0.5, filefish: 0.55, boxfish: 0.45,
  cowfish: 0.42, puffer: 0.42, 'marine-puffer': 0.42, kuhli: 0.08, eel: 0.08, moray: 0.1, 'garden-eel': 0.06,
  'spiny-eel': 0.1, pipefish: 0.05, needlefish: 0.07, gar: 0.12, knifefish: 0.18, bichir: 0.13, arowana: 0.25,
  pencilfish: 0.17, danio: 0.2, rasbora: 0.24, otocinclus: 0.2, corydoras: 0.33, pleco: 0.24, loach: 0.2,
  botia: 0.3, halfbeak: 0.13, dartfish: 0.18, 'marine-goby': 0.2, goby: 0.2, blenny: 0.2, jawfish: 0.22,
  dragonet: 0.22, seahorse: 0.3, lionfish: 0.36, wrasse: 0.28, 'fairy-wrasse': 0.27, anthias: 0.33,
};

const DEFAULT_TAIL: Partial<Record<string, CaudalShape>> = {
  kuhli: 'continuous', eel: 'continuous', moray: 'continuous', 'garden-eel': 'continuous', 'spiny-eel': 'continuous',
  knifefish: 'pointed', discus: 'rounded', angelfish: 'emarginate', betta: 'veil', 'fancy-goldfish': 'double',
  corydoras: 'forked', pleco: 'truncate', goby: 'rounded', 'marine-goby': 'rounded', blenny: 'rounded', tang: 'lunate',
  swordtail: 'sword', livebearer: 'rounded', molly: 'truncate', cichlid: 'truncate', 'dwarf-cichlid': 'rounded',
  gourami: 'emarginate', clownfish: 'rounded', puffer: 'rounded', 'marine-puffer': 'rounded', boxfish: 'rounded',
  cowfish: 'rounded', seahorse: 'none', pipefish: 'fan', lionfish: 'rounded', stingray: 'none', ray: 'none',
};

function fishSvg(sp: Species): string {
  const b = sp.body;
  const look = sp.look;
  const arche = b.archetype;
  const caudal = b.caudal?.shape ?? DEFAULT_TAIL[arche] ?? 'forked';
  const tailFrac = caudal === 'none' || caudal === 'continuous' ? 0.02 : Math.min(0.55, Math.max(0.14, b.caudal?.size ?? (caudal === 'veil' || caudal === 'halfmoon' || caudal === 'delta' || caudal === 'double' ? 0.45 : 0.24)));
  let depth = Math.min(0.95, Math.max(0.05, b.depth ?? DEEP[arche] ?? 0.3));
  const swordExtra = caudal === 'sword' ? 0.35 : 0;

  // Fit body + tail into the frame, leaving room for tall fins on deep-bodied species.
  let Lb = (W - 26) / (1 + tailFrac + swordExtra);
  const maxD = 62;
  if (depth * Lb > maxD) Lb = maxD / depth;
  const D = depth * Lb;
  const x0 = (W - Lb * (1 + tailFrac + swordExtra)) / 2;
  const xp = x0 + Lb;
  const xm = x0 + Lb * Math.min(0.6, Math.max(0.25, b.depthPos ?? 0.4));
  const pedFrac = b.peduncle ?? (caudal === 'continuous' ? 0.15 : 0.38);
  const P = Math.max(1.5, D * pedFrac);
  const arch = (b.backArch ?? 0) * D * 0.08 + (b.hump ?? 0) * D * 0.12;
  const belly = 1 + (b.belly ?? 0.3) * 0.12;
  const snout = b.snout ?? 'rounded';
  const tip = snout === 'pointed' || snout === 'elongate' || snout === 'beak' || snout === 'tubular' ? 0.18 : snout === 'blunt' ? 0.55 : 0.36;
  const mouthY = b.mouth === 'superior' ? -D * 0.12 : b.mouth === 'inferior' || b.mouth === 'sucker' ? D * 0.12 : 0;
  const sy = CY + mouthY * 0.6;

  const halfAt = (x: number, top: boolean): number => {
    if (x <= xm) {
      const t = (xm - x) / Math.max(1, xm - x0);
      const e = Math.sqrt(Math.max(0, 1 - t * t * (1 - tip * 0.3)));
      return (D / 2) * e * (top ? 1 : belly) + (top ? arch * e : 0);
    }
    const t = (x - xm) / Math.max(1, xp - xm);
    const s = t * t * (3 - 2 * t);
    return ((D / 2) * (top ? 1 : belly) + (top ? arch : 0)) * (1 - s) + (P / 2) * s;
  };

  const topY = CY - D / 2 - arch;
  const botY = CY + (D / 2) * belly;
  const bodyPath =
    `M${n(x0)},${n(sy)}` +
    ` C${n(x0)},${n(sy - D * tip)} ${n(xm - (xm - x0) * 0.6)},${n(topY)} ${n(xm)},${n(topY)}` +
    ` C${n(xm + (xp - xm) * 0.45)},${n(topY)} ${n(xp - (xp - xm) * 0.3)},${n(CY - P / 2)} ${n(xp)},${n(CY - P / 2)}` +
    ` L${n(xp)},${n(CY + P / 2)}` +
    ` C${n(xp - (xp - xm) * 0.3)},${n(CY + P / 2)} ${n(xm + (xp - xm) * 0.45)},${n(botY)} ${n(xm)},${n(botY)}` +
    ` C${n(xm - (xm - x0) * 0.6)},${n(botY)} ${n(x0)},${n(sy + D * tip)} ${n(x0)},${n(sy)}Z`;

  const base = hex(look.base, '#9aa7a8');
  const dorsalC = hex(look.dorsal, mix(base, '#1b2226', 0.35));
  const ventralC = hex(look.ventral, mix(base, '#f2f2ee', 0.35));
  const finC = hex(look.fin, base);
  const finOp = Math.min(0.85, Math.max(0.3, (look.finOpacity ?? 0.4) * 1.1));
  const fins = look.fins ?? {};
  const finColor = (k: keyof NonNullable<typeof look.fins>) => hex(fins[k]?.color, finC);
  const finOpacity = (k: keyof NonNullable<typeof look.fins>) => Math.min(0.9, Math.max(0.28, (fins[k]?.opacity ?? finOp) * 1.05));

  const parts: string[] = [];

  // Tail
  if (caudal !== 'none' && caudal !== 'continuous') {
    parts.push(`<path d="${tailPath(caudal, xp, P, D, tailFrac * Lb)}" fill="${finColor('caudal')}" fill-opacity="${n(finOpacity('caudal'))}"/>`);
  }

  // Dorsal / anal / second dorsal fins
  const finPoly = (spec: FinSpec, top: boolean) => {
    const xs = x0 + spec.start * Lb;
    const xe = x0 + Math.max(spec.start + 0.02, spec.end) * Lb;
    const hgt = Math.min(36, spec.height * Lb * (spec.shape === 'sail' ? 1.15 : 1));
    const sgn = top ? -1 : 1;
    const ys = CY + sgn * halfAt(xs, top) - sgn * 1.2;
    const ye = CY + sgn * halfAt(xe, top) - sgn * 1.2;
    const trail = (spec.trail ?? 0) * Lb;
    const peakX = spec.shape === 'falcate' || spec.shape === 'pointed' ? xs + (xe - xs) * 0.25 : xs + (xe - xs) * 0.4;
    const backX = spec.shape === 'flowing' || spec.shape === 'filament' ? xe + trail * 0.8 + (xe - xs) * 0.3 : xe + (xe - xs) * 0.12;
    const backY = ye + sgn * hgt * (spec.shape === 'flowing' || spec.shape === 'filament' ? 0.75 : spec.shape === 'sail' ? 0.85 : 0.35);
    return `M${n(xs)},${n(ys)} Q${n(peakX - (peakX - xs) * 0.2)},${n(ys + sgn * hgt * 1.05)} ${n(peakX)},${n(ys + sgn * hgt)} Q${n((peakX + backX) / 2)},${n((ys + sgn * hgt + backY) / 2 + sgn * 2)} ${n(backX)},${n(backY)} L${n(xe)},${n(ye)}Z`;
  };
  const isFishLike = depth > 0.1;
  const dorsal = b.dorsal === null ? null : b.dorsal ?? (isFishLike ? { start: 0.42, end: 0.6, height: 0.12 } : null);
  const anal = b.anal === null ? null : b.anal ?? (isFishLike ? { start: 0.62, end: 0.8, height: 0.08 } : null);
  if (dorsal) parts.push(`<path d="${finPoly(dorsal, true)}" fill="${finColor('dorsal')}" fill-opacity="${n(finOpacity('dorsal'))}"/>`);
  if (b.dorsal2) parts.push(`<path d="${finPoly(b.dorsal2, true)}" fill="${finColor('dorsal')}" fill-opacity="${n(finOpacity('dorsal'))}"/>`);
  if (anal) parts.push(`<path d="${finPoly(anal, false)}" fill="${finColor('anal')}" fill-opacity="${n(finOpacity('anal'))}"/>`);
  if (caudal === 'continuous') {
    // Eel-like: one low fin fringe along the back half and around the tail.
    const xs = x0 + Lb * 0.45;
    parts.push(`<path d="M${n(xs)},${n(CY - halfAt(xs, true))} Q${n(xp)},${n(CY - P - 3)} ${n(xp + 6)},${n(CY)} Q${n(xp)},${n(CY + P + 3)} ${n(xs + Lb * 0.1)},${n(CY + halfAt(xs + Lb * 0.1, false))}Z" fill="${finC}" fill-opacity="${n(finOp * 0.8)}"/>`);
  }
  if (b.adipose) {
    const xa = x0 + Lb * 0.84;
    const ya = CY - halfAt(xa, true);
    parts.push(`<path d="M${n(xa - 3)},${n(ya + 0.8)} Q${n(xa)},${n(ya - 4.5)} ${n(xa + 3)},${n(ya + 0.5)}Z" fill="${finC}" fill-opacity="${n(finOp)}"/>`);
  }

  // Body with vertical shading gradient and patterns clipped to the body.
  const grad = `<linearGradient id="g" x1="0" y1="${n(topY)}" x2="0" y2="${n(botY)}" gradientUnits="userSpaceOnUse"><stop offset="0" stop-color="${dorsalC}"/><stop offset="0.45" stop-color="${base}"/><stop offset="1" stop-color="${ventralC}"/></linearGradient>`;
  const sheen = `<linearGradient id="s" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#fff" stop-opacity="${n(0.1 + (look.metallic ?? 0) * 0.25)}"/><stop offset="0.5" stop-color="#fff" stop-opacity="0"/><stop offset="1" stop-color="#000" stop-opacity="0.18"/></linearGradient>`;
  const clip = `<clipPath id="c"><path d="${bodyPath}"/></clipPath>`;
  parts.push(`<path d="${bodyPath}" fill="url(#g)"/>`);
  const pat = (look.patterns ?? []).slice(0, 8).map((p) => patternSvg(p, x0, Lb, halfAt)).join('');
  if (pat) parts.push(`<g clip-path="url(#c)">${pat}</g>`);
  parts.push(`<path d="${bodyPath}" fill="url(#s)"/>`);

  // Pectoral fin (translucent, behind the gill) and gill line.
  const headL = (b.headLength ?? 0.26) * Lb;
  const gx = x0 + headL;
  if (isFishLike) {
    parts.push(`<path d="M${n(gx)},${n(CY - D * 0.12)} Q${n(gx - 1.5)},${n(CY + D * 0.08)} ${n(gx + 1)},${n(CY + D * 0.24)}" fill="none" stroke="#000" stroke-opacity="0.18" stroke-width="1"/>`);
    const pl = Math.max(5, (b.pectoral?.height ?? 0.16) * Lb);
    parts.push(`<path d="M${n(gx + 2)},${n(CY + D * 0.05)} Q${n(gx + pl * 0.6)},${n(CY + D * 0.02)} ${n(gx + pl)},${n(CY + D * 0.12)} Q${n(gx + pl * 0.5)},${n(CY + D * 0.22)} ${n(gx + 2)},${n(CY + D * 0.12)}Z" fill="${finColor('pectoral')}" fill-opacity="${n(finOpacity('pectoral') * 0.8)}"/>`);
  }

  // Barbels
  if ((b.barbels ?? 0) > 0) {
    const bl = Math.max(4, (b.barbelLength ?? 0.12) * Lb);
    parts.push(`<path d="M${n(x0 + 2)},${n(sy + 1)} q${n(-bl * 0.5)},${n(bl * 0.3)} ${n(-bl * 0.4)},${n(bl * 0.7)}" fill="none" stroke="${mix(base, '#000', 0.2)}" stroke-width="0.9" stroke-opacity="0.7"/>`);
  }

  // Eye with a catch-light.
  const er = Math.max(1.6, Math.min(8, (b.eyeSize ?? 0.3) * headL * 0.5));
  const ex = x0 + headL * 0.42;
  const ey = CY - Math.min(D * 0.14, halfAt(ex, true) * 0.35) + mouthY * 0.2;
  const iris = hex(look.eye, '#c9b98a');
  parts.push(`<circle cx="${n(ex)}" cy="${n(ey)}" r="${n(er)}" fill="${iris}"/><circle cx="${n(ex - er * 0.08)}" cy="${n(ey)}" r="${n(er * 0.62)}" fill="#0b0d0e"/><circle cx="${n(ex - er * 0.35)}" cy="${n(ey - er * 0.35)}" r="${n(Math.max(0.5, er * 0.2))}" fill="#fff" fill-opacity="0.85"/>`);

  return svgWrap(parts.join(''), grad + sheen + clip);
}

function tailPath(shape: CaudalShape, xp: number, P: number, D: number, T: number): string {
  const top = CY - P / 2;
  const bot = CY + P / 2;
  let Hh = Math.max(P * 0.9, D * 0.42);
  const xe = xp + T;
  switch (shape) {
    case 'truncate':
      return `M${n(xp)},${n(top)} L${n(xe)},${n(CY - Hh)} Q${n(xe + 1.5)},${n(CY)} ${n(xe)},${n(CY + Hh)} L${n(xp)},${n(bot)}Z`;
    case 'emarginate':
      return `M${n(xp)},${n(top)} L${n(xe)},${n(CY - Hh)} Q${n(xp + T * 0.8)},${n(CY)} ${n(xe)},${n(CY + Hh)} L${n(xp)},${n(bot)}Z`;
    case 'rounded':
    case 'fan':
    case 'round-flowing':
    case 'spade':
      return `M${n(xp)},${n(top)} C${n(xp + T * 0.45)},${n(CY - Hh * 1.05)} ${n(xe)},${n(CY - Hh * 0.75)} ${n(xe)},${n(CY)} C${n(xe)},${n(CY + Hh * 0.75)} ${n(xp + T * 0.45)},${n(CY + Hh * 1.05)} ${n(xp)},${n(bot)}Z`;
    case 'pointed':
      return `M${n(xp)},${n(top)} Q${n(xp + T * 0.45)},${n(CY - Hh * 0.55)} ${n(xe)},${n(CY)} Q${n(xp + T * 0.45)},${n(CY + Hh * 0.55)} ${n(xp)},${n(bot)}Z`;
    case 'lunate':
      Hh = Math.max(Hh, D * 0.5);
      return `M${n(xp)},${n(top)} Q${n(xp + T * 0.45)},${n(CY - Hh * 0.45)} ${n(xe + 2)},${n(CY - Hh * 1.1)} Q${n(xp + T * 0.45)},${n(CY)} ${n(xe + 2)},${n(CY + Hh * 1.1)} Q${n(xp + T * 0.45)},${n(CY + Hh * 0.45)} ${n(xp)},${n(bot)}Z`;
    case 'veil':
    case 'delta':
    case 'halfmoon':
    case 'crowntail':
    case 'double': {
      Hh = Math.max(Hh, D * (shape === 'halfmoon' ? 0.85 : 0.6));
      const droop = shape === 'veil' ? Hh * 0.45 : 0;
      return `M${n(xp)},${n(top)} C${n(xp + T * 0.3)},${n(CY - Hh * 1.1)} ${n(xe)},${n(CY - Hh * 0.9 + droop)} ${n(xe)},${n(CY + droop * 0.5)} C${n(xe)},${n(CY + Hh * 0.9 + droop)} ${n(xp + T * 0.3)},${n(CY + Hh * 1.1 + droop * 0.4)} ${n(xp)},${n(bot)}Z`;
    }
    case 'sword':
      return `M${n(xp)},${n(top)} L${n(xe)},${n(CY - Hh * 0.9)} Q${n(xe + 1)},${n(CY)} ${n(xe)},${n(CY + Hh * 0.4)} L${n(xe + T * 1.4)},${n(CY + Hh * 0.75)} L${n(xe)},${n(CY + Hh * 0.95)} L${n(xp)},${n(bot)}Z`;
    case 'lyre':
      return `M${n(xp)},${n(top)} Q${n(xp + T * 0.6)},${n(CY - Hh * 0.6)} ${n(xe + T * 0.25)},${n(CY - Hh * 1.2)} Q${n(xp + T * 0.55)},${n(CY)} ${n(xe + T * 0.25)},${n(CY + Hh * 1.2)} Q${n(xp + T * 0.6)},${n(CY + Hh * 0.6)} ${n(xp)},${n(bot)}Z`;
    case 'deeply-forked':
    case 'forked':
    default: {
      const notch = shape === 'deeply-forked' ? 0.3 : 0.55;
      return `M${n(xp)},${n(top)} Q${n(xp + T * 0.55)},${n(CY - Hh * 0.55)} ${n(xe)},${n(CY - Hh)} Q${n(xp + T * 0.75)},${n(CY - Hh * 0.35)} ${n(xp + T * notch)},${n(CY)} Q${n(xp + T * 0.75)},${n(CY + Hh * 0.35)} ${n(xe)},${n(CY + Hh)} Q${n(xp + T * 0.55)},${n(CY + Hh * 0.55)} ${n(xp)},${n(bot)}Z`;
    }
  }
}

/** Map a body-space pattern (x 0..1 snout→tail base, y −1 belly..+1 back) into the portrait. */
function patternSvg(p: Pattern, x0: number, Lb: number, halfAt: (x: number, top: boolean) => number): string {
  const X = (x: number) => x0 + x * Lb;
  const Y = (x: number, y: number) => {
    const xx = X(x);
    return y >= 0 ? CY - y * halfAt(xx, true) : CY - y * halfAt(xx, false);
  };
  const col = hex((p as { color?: string }).color, '#000000');
  switch (p.type) {
    case 'region': {
      const xa = p.x0 ?? 0;
      const xb = p.x1 ?? 1;
      const ya = p.y0 ?? -1;
      const yb = p.y1 ?? 1;
      const steps = 6;
      let d = '';
      for (let i = 0; i <= steps; i++) {
        const x = xa + ((xb - xa) * i) / steps;
        d += `${i ? 'L' : 'M'}${n(X(x))},${n(Y(x, yb))}`;
      }
      for (let i = steps; i >= 0; i--) {
        const x = xa + ((xb - xa) * i) / steps;
        d += `L${n(X(x))},${n(Y(x, ya))}`;
      }
      return `<path d="${d}Z" fill="${col}" fill-opacity="0.85"/>`;
    }
    case 'stripe': {
      const xa = p.x0 ?? 0.1;
      const xb = p.x1 ?? 1;
      const steps = 8;
      let d = '';
      for (let i = 0; i <= steps; i++) {
        const x = xa + ((xb - xa) * i) / steps;
        d += `${i ? 'L' : 'M'}${n(X(x))},${n(Y(x, p.y))}`;
      }
      const mid = (xa + xb) / 2;
      const w = Math.max(1, Math.abs(Y(mid, p.y + p.width / 2) - Y(mid, p.y - p.width / 2)));
      return `<path d="${d}" fill="none" stroke="${col}" stroke-width="${n(w)}" stroke-linecap="round" stroke-opacity="${p.iridescent ? 0.95 : 0.85}"/>`;
    }
    case 'bars': {
      const xa = p.x0 ?? 0.2;
      const xb = p.x1 ?? 0.9;
      let out = '';
      for (let i = 0; i < Math.min(14, p.count); i++) {
        const x = xa + ((xb - xa) * (i + 0.5)) / p.count;
        const w = Math.max(1, p.width * Lb * 0.5);
        const slant = (p.slant ?? 0) * 6;
        out += `<path d="M${n(X(x) + slant)},${n(Y(x, p.y1 ?? 1.05))} L${n(X(x) - slant)},${n(Y(x, p.y0 ?? -1.05))}" stroke="${col}" stroke-width="${n(w)}" stroke-opacity="0.8"/>`;
      }
      return out;
    }
    case 'blotch':
      return `<ellipse cx="${n(X(p.x))}" cy="${n(Y(p.x, p.y))}" rx="${n(Math.max(1, p.rx * Lb))}" ry="${n(Math.max(1, p.ry * halfAt(X(p.x), p.y >= 0)))}" fill="${col}" fill-opacity="0.9"${p.ring ? ` stroke="${hex(p.ring, col)}" stroke-width="1.2"` : ''}/>`;
    case 'mask': {
      const x = 0.12;
      return `<path d="M${n(X(x))},${n(Y(x, 1.1))} L${n(X(x))},${n(Y(x, -1.1))}" stroke="${col}" stroke-width="${n(Math.max(1.5, p.width * Lb))}" stroke-opacity="0.85"/>`;
    }
    case 'spots':
    case 'speckle': {
      // Deterministic sprinkle (golden-angle sequence) — a hint of the pattern, not a census.
      const count = Math.min(26, Math.round((p.density ?? 10) * (p.type === 'speckle' ? 0.15 : 0.6)) + 4);
      const r = p.type === 'speckle' ? 0.8 : Math.max(0.9, (p as { size?: number }).size ? (p as { size: number }).size * Lb * 0.4 : 1.4);
      const xa = (p as { x0?: number }).x0 ?? 0.1;
      const xb = (p as { x1?: number }).x1 ?? 0.95;
      const ya = (p as { y0?: number }).y0 ?? -0.8;
      const yb = (p as { y1?: number }).y1 ?? 0.8;
      let out = '';
      for (let i = 0; i < count; i++) {
        const fx = (i * 0.618034) % 1;
        const fy = (i * 0.754877) % 1;
        const x = xa + (xb - xa) * fx;
        const y = ya + (yb - ya) * fy;
        out += `<circle cx="${n(X(x))}" cy="${n(Y(x, y))}" r="${n(Math.min(4, r))}" fill="${col}" fill-opacity="0.75"/>`;
      }
      return out;
    }
    case 'chevrons':
    case 'lines': {
      const count = Math.min(7, p.count);
      let out = '';
      for (let i = 0; i < count; i++) {
        const y = -0.7 + (1.4 * (i + 0.5)) / count;
        out += `<path d="M${n(X(0.2))},${n(Y(0.2, y))} L${n(X(0.95))},${n(Y(0.95, y))}" stroke="${col}" stroke-width="0.9" stroke-opacity="0.5"/>`;
      }
      return out;
    }
    default:
      return '';
  }
}

// ---------------------------------------------------------------------------------------------
// Invertebrates
// ---------------------------------------------------------------------------------------------

function shrimpSvg(sp: Species): string {
  const base = hex(sp.look.base, '#c8b8a0');
  const dark = mix(base, '#000', 0.25);
  const op = 1 - Math.min(0.6, (sp.look.translucency ?? 0) * 0.6);
  // Curved, segmented body facing left: head/carapace, abdomen arching down to a tail fan.
  const body =
    `<path d="M38,52 C40,38 62,32 82,36 C104,40 120,48 126,60 C129,67 124,72 117,70 C112,62 102,56 88,55 C74,55 64,60 52,60 C44,60 37,58 38,52Z" fill="${base}" fill-opacity="${n(op)}"/>` +
    `<path d="M117,70 L131,77 L124,66 L134,66 L126,60Z" fill="${base}" fill-opacity="${n(op * 0.9)}"/>` +
    [92, 102, 110].map((x) => `<path d="M${x},${x < 100 ? 37 : 42} q4,10 1,${x < 100 ? 19 : 17}" stroke="${dark}" stroke-opacity="0.35" fill="none"/>`).join('') +
    `<path d="M40,50 C24,44 12,38 4,24 M42,48 C30,40 22,36 14,20 M40,55 C28,60 18,62 10,58" stroke="${dark}" stroke-width="0.9" fill="none" stroke-opacity="0.75"/>` +
    [50, 58, 66, 74, 82].map((x) => `<path d="M${x},59 l-2,13" stroke="${dark}" stroke-width="0.9" stroke-opacity="0.6"/>`).join('') +
    `<circle cx="44" cy="47" r="2.4" fill="#111"/><circle cx="43.3" cy="46.2" r=".7" fill="#fff"/>`;
  return svgWrap(body);
}

function snailSvg(sp: Species): string {
  const shell = hex(sp.look.base, '#6b4a2a');
  const foot = hex(sp.look.ventral, mix(shell, '#d8cbb0', 0.6));
  const band = hex(sp.look.dorsal, mix(shell, '#000', 0.35));
  const body =
    `<path d="M28,74 C40,66 112,66 132,74 C126,79 40,80 28,74Z" fill="${foot}"/>` +
    `<path d="M30,70 C24,62 26,58 22,52 M34,68 C32,60 34,56 32,50" stroke="${foot}" stroke-width="2.2" stroke-linecap="round" fill="none"/>` +
    `<circle cx="84" cy="48" r="28" fill="${shell}"/>` +
    `<path d="M84,48 m0,-6 a6,6 0 1,1 -6,6 a12,12 0 1,1 12,12 a18,18 0 1,1 -18,-18 a24,24 0 1,1 24,24" stroke="${band}" stroke-width="2" fill="none" stroke-opacity="0.7"/>` +
    `<ellipse cx="74" cy="34" rx="10" ry="5" fill="#fff" fill-opacity="0.12"/>`;
  return svgWrap(body);
}

function crabSvg(sp: Species): string {
  const c = hex(sp.look.base, '#a0522d');
  const d = mix(c, '#000', 0.3);
  const legs = [-1, 1]
    .map((s) => [0, 1, 2, 3].map((i) => `<path d="M${80 + s * 18},${56 + i * 3} q${s * 16},${-6 + i * 4} ${s * 26},${10 + i * 5}" stroke="${d}" stroke-width="3" fill="none" stroke-linecap="round"/>`).join(''))
    .join('');
  const body =
    legs +
    `<path d="M62,46 q-14,-10 -22,-4 q-6,6 4,10 q8,2 18,0Z M98,46 q14,-10 22,-4 q6,6 -4,10 q-8,2 -18,0Z" fill="${c}"/>` +
    `<ellipse cx="80" cy="54" rx="26" ry="16" fill="${c}"/>` +
    `<ellipse cx="80" cy="48" rx="18" ry="6" fill="#fff" fill-opacity="0.1"/>` +
    `<circle cx="73" cy="40" r="2.2" fill="#111"/><circle cx="87" cy="40" r="2.2" fill="#111"/>`;
  return svgWrap(body);
}

function crayfishSvg(sp: Species): string {
  const c = hex(sp.look.base, '#8b3a2a');
  const d = mix(c, '#000', 0.3);
  const body =
    `<path d="M50,48 C40,34 26,32 16,36 C26,40 34,44 40,50Z M50,56 C40,66 26,70 16,66 C26,62 34,58 40,52Z" fill="${c}"/>` +
    `<ellipse cx="68" cy="52" rx="22" ry="11" fill="${c}"/>` +
    `<path d="M88,46 C104,44 118,46 126,50 C118,56 104,58 88,58Z" fill="${c}"/>` +
    `<path d="M126,50 l12,-8 l2,10 l-2,10 l-12,-8Z" fill="${c}" fill-opacity="0.9"/>` +
    [96, 106, 116].map((x) => `<path d="M${x},46 v12" stroke="${d}" stroke-opacity="0.4"/>`).join('') +
    `<path d="M48,48 C36,38 20,30 6,30 M48,50 C36,46 20,44 4,46" stroke="${d}" stroke-width="0.9" fill="none"/>` +
    `<circle cx="52" cy="47" r="2" fill="#111"/>`;
  return svgWrap(body);
}

function starSvg(sp: Species, brittle: boolean): string {
  const c = hex(sp.look.base, '#c0603a');
  const pts: string[] = [];
  const cx = 80;
  const cy = 50;
  if (brittle) {
    let arms = '';
    for (let i = 0; i < 5; i++) {
      const a = (i / 5) * Math.PI * 2 - Math.PI / 2;
      const ex = cx + Math.cos(a) * 44;
      const ey = cy + Math.sin(a) * 40;
      const mx = cx + Math.cos(a + 0.4) * 26;
      const my = cy + Math.sin(a + 0.4) * 24;
      arms += `<path d="M${cx},${cy} Q${n(mx)},${n(my)} ${n(ex)},${n(ey)}" stroke="${c}" stroke-width="3.2" stroke-linecap="round" fill="none"/>`;
    }
    return svgWrap(`${arms}<circle cx="${cx}" cy="${cy}" r="10" fill="${c}"/>`);
  }
  for (let i = 0; i < 10; i++) {
    const a = (i / 10) * Math.PI * 2 - Math.PI / 2;
    const r = i % 2 === 0 ? 42 : 15;
    pts.push(`${n(cx + Math.cos(a) * r)},${n(cy + Math.sin(a) * r * 0.95)}`);
  }
  return svgWrap(`<polygon points="${pts.join(' ')}" fill="${c}" stroke="${mix(c, '#000', 0.2)}" stroke-linejoin="round" stroke-width="3"/>`);
}

function urchinSvg(sp: Species): string {
  const c = hex(sp.look.base, '#3a2a4a');
  let spines = '';
  for (let i = 0; i < 36; i++) {
    const a = (i / 36) * Math.PI * 2;
    const r = 26 + ((i * 7) % 5) * 4;
    spines += `<path d="M80,52 L${n(80 + Math.cos(a) * r * 1.3)},${n(52 + Math.sin(a) * r)}" stroke="${c}" stroke-width="1.2"/>`;
  }
  return svgWrap(`${spines}<ellipse cx="80" cy="54" rx="22" ry="16" fill="${c}"/>`);
}
