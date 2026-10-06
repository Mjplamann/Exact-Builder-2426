/**
 * Texture-atlas layout shared by geometry (UVs) and the painters. One atlas per render variant:
 * width = 2N, height = N (N = 128 … 512).
 *
 *   ┌────────────────────────────── body (x 0 snout → 1 tail base, y +1 back at top) ─────────┐
 *   ├────────────┬────────────┬────────────┬────────────┐
 *   │            │  dorsal    │  dorsal2   │  pectoral  │
 *   │  caudal    ├────────────┼────────────┼──────┬─────┤
 *   │            │  anal      │  pelvic    │ eye  │adip.│
 *   └────────────┴────────────┴────────────┴──────┴─────┘
 *
 * Texture `flipY` is false, so v = 0 is the first (top) row of the painted buffer.
 * Each cell is painted over its full pixel rect with clamped coordinates, so mip-map filtering
 * at cell borders only ever sees the cell's own edge colors.
 */

export interface Cell {
  /** Rect in UV units. */
  x: number;
  y: number;
  w: number;
  h: number;
  /** Inset (fraction of the cell) kept free of geometry UVs. */
  ix: number;
  iy: number;
}

const cell = (x: number, y: number, w: number, h: number, ix: number, iy: number): Cell => ({ x, y, w, h, ix, iy });

export const ATLAS = {
  body: cell(0, 0, 1, 0.5, 0.004, 0.025),
  caudal: cell(0, 0.5, 0.25, 0.5, 0.03, 0.03),
  dorsal: cell(0.25, 0.5, 0.25, 0.25, 0.03, 0.05),
  anal: cell(0.25, 0.75, 0.25, 0.25, 0.03, 0.05),
  dorsal2: cell(0.5, 0.5, 0.25, 0.25, 0.03, 0.05),
  pelvic: cell(0.5, 0.75, 0.25, 0.25, 0.03, 0.05),
  pectoral: cell(0.75, 0.5, 0.25, 0.25, 0.03, 0.05),
  eye: cell(0.75, 0.75, 0.125, 0.25, 0.05, 0.05),
  adipose: cell(0.875, 0.75, 0.125, 0.25, 0.05, 0.05),
} as const;

export type CellName = keyof typeof ATLAS;

/** Body pattern coords (x 0..1, y −1 belly..+1 back) → atlas UV. */
export function bodyUV(x: number, y: number, out: [number, number] = [0, 0]): [number, number] {
  const c = ATLAS.body;
  const cx = Math.min(1, Math.max(0, x));
  const cy = Math.min(1, Math.max(0, 1 - (y + 1) / 2));
  out[0] = c.x + c.w * (c.ix + (1 - 2 * c.ix) * cx);
  out[1] = c.y + c.h * (c.iy + (1 - 2 * c.iy) * cy);
  return out;
}

/** Fin coords (x 0 base..1 tip, y −1..1 across) → atlas UV inside `cell`. */
export function cellUV(c: Cell, x: number, y: number, out: [number, number] = [0, 0]): [number, number] {
  const cx = Math.min(1, Math.max(0, x));
  const cy = Math.min(1, Math.max(0, (y + 1) / 2));
  out[0] = c.x + c.w * (c.ix + (1 - 2 * c.ix) * cx);
  out[1] = c.y + c.h * (c.iy + (1 - 2 * c.iy) * cy);
  return out;
}

/** Inverse of the cell mapping for a pixel center: returns local coords in [0,1]² (clamped). */
export function cellLocal(c: Cell, u: number, v: number, out: [number, number] = [0, 0]): [number, number] {
  out[0] = Math.min(1, Math.max(0, ((u - c.x) / c.w - c.ix) / (1 - 2 * c.ix)));
  out[1] = Math.min(1, Math.max(0, ((v - c.y) / c.h - c.iy) / (1 - 2 * c.iy)));
  return out;
}
