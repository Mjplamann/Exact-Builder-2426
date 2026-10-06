/**
 * Small drawn illustrations for the tank builder and menu, as SVG strings (no external images):
 * the three waters, proportional tank outlines, a to-scale preview beside a person, style
 * vignettes and a substrate cross-section. Only numbers and fixed colors go into the markup —
 * never text the keeper typed.
 */
import type { TankSize, WaterType } from '../../core/types';

let uid = 0;
/** Gradient ids must be unique per document. */
const nextId = (p: string) => `${p}${(uid += 1)}`;
const n1 = (v: number) => (Math.round(v * 10) / 10).toString();

// ---------------------------------------------------------------------------------------------
// Line glyphs (24 × 24, same hand as icons.ts) for the tank menu
// ---------------------------------------------------------------------------------------------

const GLYPHS = {
  freshwater: '<path d="M12 4c2.8 3.4 5 6.2 5 9.2a5 5 0 0 1-10 0c0-3 2.2-5.8 5-9.2z"/>',
  brackish: '<path d="M12 4c2.8 3.4 5 6.2 5 9.2a5 5 0 0 1-10 0c0-3 2.2-5.8 5-9.2z"/><path d="M7.3 13.4c1.6-1 3.1-1 4.7 0s3.1 1 4.7 0"/>',
  marine: '<path d="M3 9.5c1.5-1.4 3-1.4 4.5 0s3 1.4 4.5 0 3-1.4 4.5 0 3 1.4 4.5 0"/><path d="M3 14.5c1.5-1.4 3-1.4 4.5 0s3 1.4 4.5 0 3-1.4 4.5 0 3 1.4 4.5 0"/>',
  more: '<circle cx="6" cy="12" r="1.3" fill="currentColor" stroke="none"/><circle cx="12" cy="12" r="1.3" fill="currentColor" stroke="none"/><circle cx="18" cy="12" r="1.3" fill="currentColor" stroke="none"/>',
  pencil: '<path d="M5 19l1-4.2L15.6 5.2a2 2 0 0 1 2.9 0l.3.3a2 2 0 0 1 0 2.9L9.2 18 5 19z"/><path d="M13.8 7l3.2 3.2"/>',
  copy: '<rect x="8.5" y="8.5" width="11" height="11" rx="2"/><path d="M15.5 8.5V6.4a1.9 1.9 0 0 0-1.9-1.9H6.4a1.9 1.9 0 0 0-1.9 1.9v7.2a1.9 1.9 0 0 0 1.9 1.9h2.1"/>',
  tank: '<rect x="3.5" y="6.5" width="17" height="12" rx="1.6"/><path d="M3.5 9.5c2.1-1 4.2-1 6.3 0s4.2 1 6.3 0 3.3-.8 4.4-.4"/><path d="M5.5 16.2c2.2-1.2 4.5-1.6 7-1.1"/>',
  arrowRight: '<path d="M5 12h13.5"/><path d="M13 6.5L18.5 12 13 17.5"/>',
} as const;

export type GlyphName = keyof typeof GLYPHS;

const glyphCache = new Map<string, SVGSVGElement>();

/** A fresh line glyph element (aria-hidden; label the control instead). */
export function glyph(name: GlyphName, size = 18, cls = 'aq-icon'): SVGSVGElement {
  const key = `${name}:${size}:${cls}`;
  let tpl = glyphCache.get(key);
  if (!tpl) {
    const wrap = document.createElement('div');
    wrap.innerHTML = `<svg class="${cls}" width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">${GLYPHS[name]}</svg>`;
    tpl = wrap.firstChild as SVGSVGElement;
    glyphCache.set(key, tpl);
  }
  return tpl.cloneNode(true) as SVGSVGElement;
}

/** An element holding an SVG string (art is static markup made here, never user text). */
export function art(svg: string, cls: string): HTMLElement {
  const el = document.createElement('span');
  el.className = cls;
  el.setAttribute('aria-hidden', 'true');
  el.innerHTML = svg;
  return el;
}

// ---------------------------------------------------------------------------------------------
// Water scenes
// ---------------------------------------------------------------------------------------------

const WATER_TONES: Record<WaterType, [string, string]> = {
  freshwater: ['#3c7a72', '#0f2d2b'],
  brackish: ['#66704c', '#16302f'],
  marine: ['#2f7cb4', '#0a2541'],
};

function waterBg(water: WaterType, w: number, h: number, tannin = false): { defs: string; body: string } {
  const id = nextId('wbg');
  const [top, bottom] = tannin ? ['#7a5a2e', '#20160c'] : WATER_TONES[water];
  const defs =
    `<linearGradient id="${id}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${top}"/><stop offset="1" stop-color="${bottom}"/></linearGradient>`;
  const rays = `<path d="M${w * 0.18} 0h${w * 0.12}L${w * 0.2} ${h}h-${w * 0.1}z" fill="#fff" opacity=".05"/><path d="M${w * 0.55} 0h${w * 0.08}L${w * 0.58} ${h}h-${w * 0.07}z" fill="#fff" opacity=".04"/>`;
  return { defs, body: `<rect width="${w}" height="${h}" fill="url(#${id})"/>${rays}` };
}

function sand(w: number, h: number, y: number, color: string): string {
  return `<path d="M0 ${y + 3}Q${w * 0.25} ${y - 3} ${w * 0.5} ${y + 1}T${w} ${y - 1}V${h}H0z" fill="${color}"/><path d="M0 ${y + 3}Q${w * 0.25} ${y - 3} ${w * 0.5} ${y + 1}T${w} ${y - 1}" fill="none" stroke="#fff" stroke-opacity=".12"/>`;
}

function tetra(x: number, y: number, s = 1, flip = false): string {
  return `<g transform="translate(${x} ${y}) scale(${flip ? -s : s} ${s})"><path d="M0 0c4-3.2 10-3.2 14 0-4 3.2-10 3.2-14 0z" fill="#dfe9ea"/><path d="M13.4 0l4.2-3.2v6.4z" fill="#dfe9ea" opacity=".85"/><path d="M2.5-.6h9.5" stroke="#5fd0f0" stroke-width="1.3"/><path d="M4.5 1.1h8" stroke="#e2584e" stroke-width="1.1"/><circle cx="2.6" cy="-.5" r=".7" fill="#1a2224"/></g>`;
}

function clownfish(x: number, y: number, s = 1): string {
  return `<g transform="translate(${x} ${y}) scale(${s})"><path d="M0 0c5-4.4 13-4.4 18 0-5 4.4-13 4.4-18 0z" fill="#f08a3c"/><path d="M17.5 0l5-4v8z" fill="#f08a3c"/><path d="M4.5-3.1v6.2M10-3.4v6.8M15.2-2.2v4.4" stroke="#fbf6ef" stroke-width="1.8"/><circle cx="2.6" cy="-.6" r=".8" fill="#1a1a1a"/></g>`;
}

function sword(x: number, y: number, hgt: number, color: string): string {
  const l = (dx: number, hh: number, c: string) =>
    `<path d="M${x} ${y}C${x + dx * 0.2} ${y - hh * 0.5} ${x + dx * 0.9} ${y - hh * 0.8} ${x + dx} ${y - hh}C${x + dx * 0.4} ${y - hh * 0.75} ${x + dx * 0.05} ${y - hh * 0.4} ${x} ${y}z" fill="${c}"/>`;
  return l(-hgt * 0.45, hgt * 0.8, color) + l(hgt * 0.5, hgt * 0.85, color) + l(-hgt * 0.15, hgt, '#4f9a5c') + l(hgt * 0.2, hgt * 0.95, color);
}

function ribbons(x: number, y: number, hgt: number, color: string, n = 5): string {
  let d = '';
  for (let i = 0; i < n; i++) {
    const bx = x + i * 3.2;
    d += `<path d="M${bx} ${y}C${bx - 2} ${y - hgt * 0.4} ${bx + 3} ${y - hgt * 0.7} ${bx + (i % 2 ? 4 : -2)} ${y - hgt * (0.8 + (i % 3) * 0.08)}" stroke="${color}" stroke-width="1.6" fill="none" stroke-linecap="round"/>`;
  }
  return d;
}

function roots(w: number, color: string): string {
  return `<g fill="none" stroke="${color}" stroke-linecap="round"><path d="M${w * 0.05} 0C${w * 0.1} ${30} ${w * 0.18} ${56} ${w * 0.12} ${84}" stroke-width="3.4"/><path d="M${w * 0.16} 0C${w * 0.2} ${24} ${w * 0.32} ${48} ${w * 0.3} ${82}" stroke-width="2.6"/><path d="M${w * 0.24} 0C${w * 0.32} ${18} ${w * 0.46} ${36} ${w * 0.44} ${80}" stroke-width="2"/><path d="M${w * 0.18} ${40}C${w * 0.24} ${52} ${w * 0.2} ${66} ${w * 0.22} ${82}" stroke-width="1.4"/></g>`;
}

function corals(x: number, y: number): string {
  return (
    `<path d="M${x - 26} ${y}c2-14 14-22 30-20 14 2 22 10 24 20z" fill="#8a6d63"/>` +
    `<g stroke="#b18be0" stroke-width="2.4" stroke-linecap="round" fill="none"><path d="M${x - 10} ${y - 16}v-10l-5-6M${x - 10} ${y - 24}l5-7M${x - 10} ${y - 20}l-7-3"/></g>` +
    `<ellipse cx="${x + 10}" cy="${y - 19}" rx="7" ry="3.4" fill="#e48aa0"/><ellipse cx="${x + 10}" cy="${y - 19.5}" rx="2" ry="1" fill="#f7c7d3"/>` +
    `<circle cx="${x + 2}" cy="${y - 20}" r="4.6" fill="#7fbf8a"/><path d="M${x - 1} ${y - 21}q3 2 6 0M${x - 1} ${y - 19}q3 2 6 0" stroke="#4f8f5c" fill="none"/>` +
    `<path d="M${x + 20} ${y - 8}q-2-10 3-14M${x + 23} ${y - 8}q2-9-1-15M${x + 26} ${y - 8}q3-7 1-12" stroke="#f0b35a" stroke-width="1.8" fill="none" stroke-linecap="round"/>`
  );
}

/** A small scene for each water type (160 × 96). */
export function waterScene(water: WaterType): string {
  const W = 160;
  const H = 96;
  const bg = waterBg(water, W, H);
  let body = bg.body;
  if (water === 'freshwater') {
    body += sand(W, H, 80, '#b39b77');
    body += sword(40, 82, 46, '#3f8a55') + ribbons(118, 82, 64, '#5aa86a', 6) + sword(76, 84, 26, '#5e9f60');
    body += tetra(84, 34, 1) + tetra(104, 44, 0.8) + tetra(66, 48, 0.75, true);
  } else if (water === 'brackish') {
    body += roots(W, '#5a3f2a') + sand(W, H, 82, '#bba886');
    body += `<g transform="translate(96 46)"><path d="M0 0c6-6 16-6 22 0-6 6-16 6-22 0z" fill="#cfd6cf"/><path d="M21.6 0l5-4.4v8.8z" fill="#cfd6cf"/><path d="M6-4.3v8.6M12-4.6v9.2" stroke="#3a3f3a" stroke-width="1.6" opacity=".7"/><circle cx="3" cy="-.8" r=".9" fill="#1b1d1b"/></g>`;
    body += `<g transform="translate(120 76)"><ellipse rx="5" ry="2.4" fill="#e5c45a"/><path d="M-2-2.2v4.4M1.4-2.3v4.6" stroke="#2a2410" stroke-width="1.4"/></g>`;
  } else {
    body += sand(W, H, 84, '#e6ddc9') + corals(46, 84) + corals(126, 86);
    body += clownfish(78, 38, 1) + clownfish(100, 50, 0.7);
  }
  return `<svg viewBox="0 0 ${W} ${H}" preserveAspectRatio="xMidYMid slice" aria-hidden="true" focusable="false"><defs>${bg.defs}</defs>${body}</svg>`;
}

// ---------------------------------------------------------------------------------------------
// Tank outlines & scale
// ---------------------------------------------------------------------------------------------

/** A tank drawn in oblique projection, fitted to the box (proportions exact). */
export function tankOutline(size: TankSize, opts: { w?: number; h?: number; sand?: string } = {}): string {
  const VW = opts.w ?? 120;
  const VH = opts.h ?? 80;
  const pad = 6;
  const { widthCm: w, depthCm: d, heightCm: h } = size;
  const dx = d * 0.38;
  const dy = d * 0.24;
  const s = Math.min((VW - pad * 2) / (w + dx), (VH - pad * 2) / (h + dy));
  const fw = w * s;
  const fh = h * s;
  const ox = dx * s;
  const oy = dy * s;
  const x0 = (VW - fw - ox) / 2;
  const y0 = (VH - fh - oy) / 2 + oy;
  const water = y0 + fh * 0.08;
  const sandH = Math.max(2, fh * 0.12);
  const id = nextId('tko');
  return (
    `<svg viewBox="0 0 ${VW} ${VH}" aria-hidden="true" focusable="false"><defs><linearGradient id="${id}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="currentColor" stop-opacity=".22"/><stop offset="1" stop-color="currentColor" stop-opacity=".07"/></linearGradient></defs>` +
    // Water: top surface and front face.
    `<path d="M${n1(x0)} ${n1(water)}l${n1(ox)} -${n1(oy)}h${n1(fw)}l-${n1(ox)} ${n1(oy)}z" fill="currentColor" fill-opacity=".1"/>` +
    `<rect x="${n1(x0)}" y="${n1(water)}" width="${n1(fw)}" height="${n1(y0 + fh - water)}" fill="url(#${id})"/>` +
    `<rect x="${n1(x0)}" y="${n1(y0 + fh - sandH)}" width="${n1(fw)}" height="${n1(sandH)}" fill="${opts.sand ?? '#b49c78'}" fill-opacity=".55"/>` +
    // Hidden back edges, then the visible frame.
    `<path d="M${n1(x0 + ox)} ${n1(y0 - oy)}v${n1(fh)}h${n1(fw)}M${n1(x0)} ${n1(y0 + fh)}l${n1(ox)} -${n1(oy)}" fill="none" stroke="currentColor" stroke-opacity=".28" stroke-dasharray="2 2.5"/>` +
    `<path d="M${n1(x0)} ${n1(y0)}l${n1(ox)} -${n1(oy)}h${n1(fw)}l-${n1(ox)} ${n1(oy)}M${n1(x0 + fw + ox)} ${n1(y0 - oy)}v${n1(fh)}l-${n1(ox)} ${n1(oy)}" fill="none" stroke="currentColor" stroke-opacity=".75" stroke-linejoin="round"/>` +
    `<rect x="${n1(x0)}" y="${n1(y0)}" width="${n1(fw)}" height="${n1(fh)}" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linejoin="round"/>` +
    `</svg>`
  );
}

/**
 * The tank on its stand (or a desk, for small tanks) next to a 1.7 m person, all to scale, with
 * the width and height marked (their text goes in with `fillScaleLabels`).
 */
export function scalePreview(size: TankSize, sandColor = '#b49c78'): string {
  const VW = 360;
  const VH = 190;
  const ground = VH - 26;
  const { widthCm: w, heightCm: h } = size;
  const small = w <= 60 && h <= 45;
  const standH = small ? 74 : 72;
  const standW = small ? Math.max(w + 40, 100) : w + 4;
  const personW = 44;
  const gap = 36;
  const totalW = personW + gap + Math.max(standW, w);
  const totalH = Math.max(172, standH + h) + 8;
  const s = Math.min((VW - 52) / totalW, (ground - 10) / totalH);
  const left = (VW - totalW * s) / 2 - 8;
  const px = left;
  const sx = left + (personW + gap) * s;
  const tx = sx + ((standW - w) / 2) * s;
  const ty = ground - (standH + h) * s;
  const id = nextId('sp');
  // Person (cm, y up from the floor), drawn with y flipped.
  const person =
    `<g transform="translate(${n1(px)} ${ground}) scale(${s.toFixed(4)})" fill="currentColor" fill-opacity=".22">` +
    `<circle cx="22" cy="-159" r="10.5"/>` +
    `<path d="M7-144c0-4 3-6 7-6h16c4 0 7 2 7 6l-1 50h-4.5l-1.5 92h-6.5L22-82l-2.5 80H13l-1.5-92H7z"/></g>`;
  const stand = small
    ? `<g fill="currentColor" fill-opacity=".14"><rect x="${n1(sx)}" y="${n1(ground - standH * s)}" width="${n1(standW * s)}" height="${n1(4 * s)}" rx="1"/><rect x="${n1(sx + 4 * s)}" y="${n1(ground - (standH - 4) * s)}" width="${n1(4 * s)}" height="${n1((standH - 4) * s)}"/><rect x="${n1(sx + (standW - 8) * s)}" y="${n1(ground - (standH - 4) * s)}" width="${n1(4 * s)}" height="${n1((standH - 4) * s)}"/></g>`
    : `<rect x="${n1(sx)}" y="${n1(ground - standH * s)}" width="${n1(standW * s)}" height="${n1(standH * s)}" rx="2" fill="currentColor" fill-opacity=".12"/><path d="M${n1(sx + (standW * s) / 2)} ${n1(ground - standH * s + 6)}v${n1(standH * s - 12)}" stroke="currentColor" stroke-opacity=".18"/>`;
  const tw = w * s;
  const th = h * s;
  const tank =
    `<defs><linearGradient id="${id}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#5fb7b0" stop-opacity=".45"/><stop offset="1" stop-color="#1f5a63" stop-opacity=".55"/></linearGradient></defs>` +
    `<rect x="${n1(tx)}" y="${n1(ty + th * 0.06)}" width="${n1(tw)}" height="${n1(th * 0.94)}" fill="url(#${id})"/>` +
    `<rect x="${n1(tx)}" y="${n1(ty + th * 0.86)}" width="${n1(tw)}" height="${n1(th * 0.14)}" fill="${sandColor}" fill-opacity=".8"/>` +
    `<rect x="${n1(tx)}" y="${n1(ty)}" width="${n1(tw)}" height="${n1(th)}" fill="none" stroke="currentColor" stroke-opacity=".85" stroke-width="1.3"/>`;
  // Dimension marks.
  const my = ground + 13;
  const hx = tx + tw + 8;
  const marks =
    `<g stroke="currentColor" stroke-opacity=".45"><path d="M${n1(tx)} ${my - 4}v8M${n1(tx + tw)} ${my - 4}v8M${n1(tx)} ${my}h${n1(tw)}"/>` +
    `<path d="M${n1(hx - 4)} ${n1(ty)}h8M${n1(hx - 4)} ${n1(ty + th)}h8M${n1(hx)} ${n1(ty)}v${n1(th)}"/></g>` +
    `<g fill="currentColor" fill-opacity=".8" font-size="10.5" font-family="system-ui, sans-serif">` +
    `<text x="${n1(tx + tw / 2)}" y="${my + 12}" text-anchor="middle" data-l="w"></text>` +
    `<text x="${n1(hx + 6)}" y="${n1(ty + th / 2 + 4)}" data-l="h"></text>` +
    `<text x="${n1(px + 22 * s)}" y="${n1(ground - 172 * s - 6)}" text-anchor="middle" data-l="p"></text></g>`;
  const floor = `<path d="M8 ${ground}H${VW - 8}" stroke="currentColor" stroke-opacity=".25"/>`;
  return `<svg viewBox="0 0 ${VW} ${VH}" aria-hidden="true" focusable="false">${floor}${person}${stand}${tank}${marks}</svg>`;
}

/** Put the (already formatted) lengths into a scale preview as text nodes. */
export function fillScaleLabels(root: Element, labels: { width: string; height: string; person: string }): void {
  const set = (k: string, v: string) => {
    const t = root.querySelector(`[data-l="${k}"]`);
    if (t) t.textContent = v;
  };
  set('w', labels.width);
  set('h', labels.height);
  set('p', labels.person);
}

/**
 * Side cross-section (a schematic: the height is to scale with the substrate, the depth is not):
 * background on the back glass, the substrate slope, water above, "back" and "front" marked.
 */
export function slopeSection(o: { heightCm: number; front: number; back: number; sand: string; backdrop: string; bare: boolean }): string {
  const VW = 240;
  const VH = 112;
  const x0 = 34;
  const dw = 178;
  const y0 = 8;
  const hh = 74;
  const s = hh / o.heightCm;
  const bottom = y0 + hh;
  const back = o.bare ? 0 : o.back * s;
  const front = o.bare ? 0 : o.front * s;
  // Smoothstep slope from back (left) to front (right), as the renderer draws it.
  let path = `M${x0} ${bottom}`;
  for (let i = 0; i <= 16; i++) {
    const t = i / 16;
    const k = t * t * (3 - 2 * t);
    path += `L${n1(x0 + dw * t)} ${n1(bottom - (back + (front - back) * k))}`;
  }
  path += `L${x0 + dw} ${bottom}z`;
  const surface = y0 + Math.min(hh * 0.08, 2.5 * s);
  return (
    `<svg viewBox="0 0 ${VW} ${VH}" aria-hidden="true" focusable="false">` +
    `<rect x="${x0 - 11}" y="${y0}" width="8" height="${hh}" rx="1.5" fill="${o.backdrop}" stroke="currentColor" stroke-opacity=".25"/>` +
    `<rect x="${x0}" y="${n1(surface)}" width="${dw}" height="${n1(bottom - surface)}" fill="#4fa4a8" fill-opacity=".14"/>` +
    `<path d="${path}" fill="${o.sand}" stroke="#fff" stroke-opacity=".15"/>` +
    `<path d="M${x0} ${y0}V${bottom}H${x0 + dw}V${y0}" fill="none" stroke="currentColor" stroke-opacity=".7" stroke-width="1.3"/>` +
    `<g fill="currentColor" fill-opacity=".55" font-size="10" font-family="system-ui, sans-serif"><text x="${x0 - 11}" y="${bottom + 16}">back</text><text x="${x0 + dw}" y="${bottom + 16}" text-anchor="end">front glass</text></g>` +
    `</svg>`
  );
}

// ---------------------------------------------------------------------------------------------
// Style vignettes
// ---------------------------------------------------------------------------------------------

function stones(list: [number, number, number, string][]): string {
  return list.map(([x, y, r, c]) => `<path d="M${x - r} ${y}c${r * 0.2}-${r * 1.1} ${r * 0.8}-${r * 1.5} ${r * 1.1}-${r * 1.45} ${r * 0.5} 0 ${r * 0.8} ${r * 0.7} ${r * 0.9} ${r * 1.45}z" fill="${c}"/><path d="M${x - r * 0.4} ${y - r * 0.8}l${r * 0.5}-${r * 0.3}" stroke="#fff" stroke-opacity=".2"/>`).join('');
}

function carpet(w: number, y: number, color: string): string {
  let d = `<path d="M0 ${y}`;
  for (let x = 0; x <= w; x += 8) d += `Q${x + 4} ${y - 4} ${x + 8} ${y}`;
  d += `V${y + 12}H0z" fill="${color}"/>`;
  return d;
}

function stems(x: number, y: number, hgt: number, color: string, wdt = 14): string {
  return `<path d="M${x} ${y}c0-${hgt * 0.6} ${wdt * 0.1}-${hgt} ${wdt / 2}-${hgt} ${wdt * 0.4} 0 ${wdt / 2} ${hgt * 0.4} ${wdt / 2} ${hgt}z" fill="${color}"/><path d="M${x + wdt * 0.25} ${y}v-${hgt * 0.85}" stroke="#000" stroke-opacity=".12"/>`;
}

function leafLitter(w: number, y: number): string {
  let d = '';
  for (let i = 0; i < 9; i++) {
    const x = 8 + ((i * 37) % (w - 16));
    d += `<ellipse cx="${x}" cy="${y + (i % 3)}" rx="4" ry="1.6" fill="${i % 2 ? '#7a4a22' : '#94602e'}" transform="rotate(${(i * 23) % 40 - 20} ${x} ${y})"/>`;
  }
  return d;
}

function floaters(w: number): string {
  let d = '';
  for (let i = 0; i < 7; i++) {
    const x = 10 + i * (w / 7);
    d += `<ellipse cx="${x}" cy="4" rx="5" ry="1.8" fill="#6fae5a"/><path d="M${x} 5.5v${6 + (i % 3) * 4}" stroke="#c9b48a" stroke-opacity=".5"/>`;
  }
  return d;
}

type Motif = 'amazon' | 'iwagumi' | 'dutch' | 'rocks' | 'blackwater' | 'shrimp' | 'goldfish' | 'nature' | 'reef' | 'liverock' | 'mangrove' | 'seagrass' | 'shells' | 'stream' | 'empty' | 'planted';

/** Which drawing suits a style (known ids first, then hints in the id/name, then the water). */
export function motifFor(id: string, name: string, water: WaterType): Motif {
  const known: Record<string, Motif> = {
    amazon: 'amazon',
    iwagumi: 'iwagumi',
    dutch: 'dutch',
    malawi: 'rocks',
    blackwater: 'blackwater',
    'nano-shrimp': 'shrimp',
    goldfish: 'goldfish',
    nature: 'nature',
    reef: 'reef',
    'nano-reef': 'reef',
    fowlr: 'liverock',
    mangrove: 'mangrove',
    'brackish-rock': 'shells',
    empty: 'empty',
  };
  if (known[id]) return known[id];
  const t = `${id} ${name}`.toLowerCase();
  if (/mangrove|estuar|delta/.test(t)) return 'mangrove';
  if (/seagrass|lagoon|grass bed|meadow/.test(t)) return 'seagrass';
  if (/tanganyika|shell/.test(t)) return 'shells';
  if (/fowlr|fish.only|live.rock/.test(t)) return 'liverock';
  if (/reef|coral|soft/.test(t)) return 'reef';
  if (/amazon|sword|flooded/.test(t)) return 'amazon';
  if (/nature|tree/.test(t)) return 'nature';
  if (/black|igarap|tea|peat/.test(t)) return 'blackwater';
  if (/stream|river|hill|rapid|torrent/.test(t)) return 'stream';
  if (/rock|malawi|rift|cichlid|mbuna|victoria/.test(t)) return 'rocks';
  if (/shrimp|nano|moss/.test(t)) return 'shrimp';
  if (/iwagumi|stone/.test(t)) return 'iwagumi';
  if (/dutch|stem/.test(t)) return 'dutch';
  if (/goldfish|pond|temperate|coldwater/.test(t)) return 'goldfish';
  if (/bare|empty/.test(t)) return 'empty';
  return water === 'marine' ? 'reef' : water === 'brackish' ? 'mangrove' : 'planted';
}

/** A small scene evoking an aquascape style (160 × 90). */
export function styleVignette(id: string, name: string, water: WaterType): string {
  const W = 160;
  const H = 90;
  const m = motifFor(id, name, water);
  const bg = waterBg(water, W, H, m === 'blackwater');
  let b = bg.body;
  switch (m) {
    case 'amazon':
      b += roots(W, '#4e3622') + sand(W, H, 76, '#b39b77') + leafLitter(W, 79) + sword(70, 78, 38, '#3f8a55') + sword(122, 78, 30, '#4c9558') + floaters(W) + tetra(92, 34, 0.8);
      break;
    case 'iwagumi':
      b += sand(W, H, 78, '#a49a8a') + carpet(W, 74, '#5fae4f') + stones([[64, 76, 20, '#7d878f'], [100, 77, 12, '#6f787f'], [124, 78, 8, '#858d93']]) + ribbons(26, 74, 18, '#7cc062', 6);
      break;
    case 'dutch':
      b += sand(W, H, 80, '#3b2f26') + stems(8, 80, 52, '#3f8a4a', 18) + stems(28, 80, 40, '#c4573c', 16) + stems(46, 80, 58, '#7fbf56', 18) + stems(66, 80, 30, '#9b5a8f', 16) + stems(84, 80, 50, '#2f7a44', 18) + stems(104, 80, 36, '#e08a3c', 16) + stems(122, 80, 56, '#5aa060', 18) + stems(142, 80, 32, '#b4d070', 14);
      break;
    case 'rocks':
      b += sand(W, H, 80, '#e2d6bd') + stones([[40, 80, 26, '#d4ccbb'], [92, 82, 22, '#c9c0ad'], [70, 62, 14, '#ddd5c4'], [132, 82, 18, '#cfc6b3']]) + `<ellipse cx="40" cy="72" rx="5" ry="3.4" fill="#2a2a26" opacity=".55"/><ellipse cx="94" cy="74" rx="4" ry="2.8" fill="#2a2a26" opacity=".5"/>` + `<g transform="translate(108 40)"><path d="M0 0c4-3.4 11-3.4 15 0-4 3.4-11 3.4-15 0z" fill="#3d7fd8"/><path d="M14.6 0l4-3v6z" fill="#3d7fd8"/><path d="M4-2.6v5.2M8-3v6" stroke="#1b2f6a" stroke-width="1.2"/></g><g transform="translate(56 30)"><path d="M0 0c4-3.4 11-3.4 15 0-4 3.4-11 3.4-15 0z" fill="#f2cf3a"/><path d="M14.6 0l4-3v6z" fill="#f2cf3a"/></g>`;
      break;
    case 'blackwater':
      b += roots(W, '#2f2015') + sand(W, H, 78, '#5a4630') + leafLitter(W, 80) + leafLitter(W - 30, 77) + floaters(W) + tetra(104, 44, 0.75);
      break;
    case 'shrimp':
      b += sand(W, H, 80, '#3b2f26') + `<path d="M24 78c10-14 30-22 56-24 18-1 30-8 40-18" stroke="#6d4a30" stroke-width="5" fill="none" stroke-linecap="round"/><path d="M50 62c8-8 22-12 34-10 12 2 24-4 32-14" stroke="#4d8a3a" stroke-width="9" fill="none" stroke-linecap="round" opacity=".85"/>` + stones([[128, 80, 10, '#5d5650']]) + `<g transform="translate(70 76)"><path d="M0 0c3-3 8-3.4 11-1-2 2.4-7 3-11 1z" fill="#d9483a"/><path d="M0 0l-4-3M0 0l-5-1" stroke="#d9483a" stroke-width=".7"/></g><g transform="translate(100 70) scale(-.8 .8)"><path d="M0 0c3-3 8-3.4 11-1-2 2.4-7 3-11 1z" fill="#d9483a"/></g>`;
      break;
    case 'goldfish':
      b += sand(W, H, 80, '#a8957d') + stones([[30, 82, 12, '#a0988a'], [120, 82, 15, '#8f877a'], [56, 84, 7, '#b3aa9b']]) + sword(90, 82, 24, '#3f7a4a') + `<g transform="translate(58 40)"><path d="M0 0c5-6 16-7 22-1-5 6-16 7-22 1z" fill="#f0902e"/><path d="M21 .5c4-4 10-6 13-4-2 3-2 6 0 9-4 1-9-1-13-5z" fill="#f3a548" opacity=".85"/><circle cx="4" cy="-.8" r="1" fill="#1b1b1b"/></g>`;
      break;
    case 'nature':
      b += sand(W, H, 80, '#3b2f26') + carpet(W, 77, '#62a84e') + `<path d="M80 80c2-14 0-26-6-36M80 64c6-8 14-12 22-12M76 52c-8-4-16-4-22 0" stroke="#6b4a2e" stroke-width="3" fill="none" stroke-linecap="round"/><ellipse cx="78" cy="38" rx="30" ry="14" fill="#3f8a3a" opacity=".9"/><ellipse cx="100" cy="46" rx="14" ry="7" fill="#4d9a40"/><ellipse cx="56" cy="46" rx="12" ry="6" fill="#4d9a40"/>` + stones([[36, 80, 10, '#8a6e4c'], [124, 80, 12, '#7d6446']]);
      break;
    case 'reef':
      b += sand(W, H, 82, '#e6ddc9') + corals(52, 82) + corals(118, 84) + clownfish(84, 34, 0.9);
      break;
    case 'liverock':
      b +=
        sand(W, H, 82, '#e6ddc9') +
        `<path d="M8 84c4-22 20-34 38-30 10-14 30-14 40 0 14-6 28 2 30 14 10 0 18 8 20 16z" fill="#a07a66"/><path d="M58 84c2-12 8-18 16-18s14 6 16 18z" fill="#0b2541" opacity=".85"/>` +
        `<g transform="translate(96 30)"><path d="M0 0c6-8 16-9 22-2-6 7-16 8-22 2z" fill="#3b78c8"/><path d="M6-5c3-6 9-8 12-6M6 5c3 6 9 8 12 6" stroke="#f2c84a" stroke-width="1.6" fill="none"/><path d="M21.5-.5l5-4v8z" fill="#f2c84a"/><circle cx="3.6" cy="-1" r=".9" fill="#111"/></g>`;
      break;
    case 'seagrass':
      b += sand(W, H, 80, '#ddd2b8') + ribbons(10, 80, 44, '#4f9a5a', 8) + ribbons(58, 80, 38, '#5aa864', 7) + ribbons(106, 80, 46, '#4f9a5a', 8) + clownfish(70, 30, 0.6);
      break;
    case 'mangrove':
      b += roots(W, '#5a3f2a') + sand(W, H, 80, '#bba886') + `<g transform="translate(110 54)"><path d="M0 0c5-5 14-5 19 0-5 5-14 5-19 0z" fill="#cfd6cf"/><path d="M18.6 0l4.4-3.8v7.6z" fill="#cfd6cf"/><circle cx="2.6" cy="-.6" r=".8" fill="#1b1d1b"/></g>`;
      break;
    case 'shells':
      b += sand(W, H, 80, '#e2d6bd') + stones([[118, 82, 20, '#cfc6b3']]) + `<g fill="#d8c6a3" stroke="#8a7a5a" stroke-opacity=".5"><path d="M30 80c0-6 4-9 8-9 3 0 5 2 5 5 0 2-2 4-4 4z"/><path d="M58 82c0-5 3-8 7-8 3 0 4 2 4 4s-1 4-4 4z"/><path d="M80 80c0-4 3-7 6-7 2 0 4 2 4 4 0 1-1 3-3 3z"/></g>`;
      break;
    case 'stream':
      b += sand(W, H, 80, '#9a9182') + stones([[24, 82, 12, '#8f877a'], [60, 83, 9, '#a0988a'], [98, 82, 13, '#857d70'], [138, 83, 9, '#9a9182']]) + `<g stroke="#fff" stroke-opacity=".18" fill="none"><path d="M10 30h40M40 44h56M90 26h50"/></g>` + tetra(66, 38, 0.8) + tetra(96, 50, 0.7);
      break;
    case 'empty':
      b += sand(W, H, 74, water === 'marine' ? '#e6ddc9' : '#b39b77');
      break;
    default:
      b += sand(W, H, 80, '#3b2f26') + sword(44, 82, 40, '#3f8a55') + ribbons(96, 80, 54, '#5aa86a', 7) + sword(130, 82, 26, '#4c9558') + tetra(70, 34, 0.8);
  }
  return `<svg viewBox="0 0 ${W} ${H}" preserveAspectRatio="xMidYMid slice" aria-hidden="true" focusable="false"><defs>${bg.defs}</defs>${b}</svg>`;
}
