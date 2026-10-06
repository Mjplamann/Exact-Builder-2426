/**
 * Small color helpers for the texture painters. Painting happens in sRGB space (authored hex
 * colors are sRGB and artists expect perceptual blends); textures are uploaded as sRGB.
 */

export type RGB = [number, number, number];

/** "#rrggbb" → [r, g, b] in 0..1 (sRGB). Falls back to mid grey on malformed input. */
export function hex(c: string | undefined, fallback: RGB = [0.6, 0.6, 0.6]): RGB {
  if (!c || c.length < 7 || c[0] !== '#') return [fallback[0], fallback[1], fallback[2]];
  const n = parseInt(c.slice(1, 7), 16);
  if (!Number.isFinite(n)) return [fallback[0], fallback[1], fallback[2]];
  return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255];
}

export function mix(a: RGB, b: RGB, t: number): RGB {
  return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
}

export function scale(a: RGB, k: number): RGB {
  return [a[0] * k, a[1] * k, a[2] * k];
}

export function luma(c: RGB): number {
  return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
}

/** Move saturation toward grey (t < 0) or away from it (t > 0). */
export function saturate(c: RGB, t: number): RGB {
  const l = luma(c);
  return [clamp01(l + (c[0] - l) * (1 + t)), clamp01(l + (c[1] - l) * (1 + t)), clamp01(l + (c[2] - l) * (1 + t))];
}

export function clamp01(v: number): number {
  return v < 0 ? 0 : v > 1 ? 1 : v;
}

export function rgbToHsl(c: RGB): RGB {
  const [r, g, b] = c;
  const max = Math.max(r, g, b), min = Math.min(r, g, b);
  const l = (max + min) / 2;
  if (max === min) return [0, 0, l];
  const d = max - min;
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
  let h: number;
  if (max === r) h = (g - b) / d + (g < b ? 6 : 0);
  else if (max === g) h = (b - r) / d + 2;
  else h = (r - g) / d + 4;
  return [h / 6, s, l];
}

export function hslToRgb(hsl: RGB): RGB {
  const [h, s, l] = hsl;
  if (s === 0) return [l, l, l];
  const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
  const p = 2 * l - q;
  const f = (t: number) => {
    if (t < 0) t += 1;
    if (t > 1) t -= 1;
    if (t < 1 / 6) return p + (q - p) * 6 * t;
    if (t < 1 / 2) return q;
    if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6;
    return p;
  };
  return [f(h + 1 / 3), f(h), f(h - 1 / 3)];
}

/** sRGB → linear (for uniforms that feed lighting directly). */
export function srgbToLinear(v: number): number {
  return v <= 0.04045 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
}
