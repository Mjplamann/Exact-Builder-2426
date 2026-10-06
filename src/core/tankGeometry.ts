import type { TankState } from './types';

/**
 * Pure geometry of the tank interior. Shared by renderer (substrate mesh), behavior (floor
 * avoidance), decor placement and food settling, so everyone agrees where the bottom is.
 */
export interface TankBounds {
  /** Interior half-width (x), height (y) and half-depth (z) in meters. */
  halfW: number;
  height: number;
  halfD: number;
  /** Water surface height (m). */
  surfaceY: number;
}

/** Gap between the water surface and the rim (m). */
export const SURFACE_GAP_M = 0.025;

export function tankBounds(tank: Pick<TankState, 'size'>): TankBounds {
  const halfW = tank.size.widthCm / 200;
  const height = tank.size.heightCm / 100;
  const halfD = tank.size.depthCm / 200;
  return { halfW, height, halfD, surfaceY: height - SURFACE_GAP_M };
}

/** Value-noise helpers (deterministic, cheap) for gentle substrate undulation. */
function hash2(ix: number, iz: number, seed: number): number {
  let h = Math.imul(ix, 374761393) ^ Math.imul(iz, 668265263) ^ Math.imul(seed, 2147483647);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}
function smooth(t: number) {
  return t * t * (3 - 2 * t);
}
function valueNoise(x: number, z: number, seed: number): number {
  const ix = Math.floor(x), iz = Math.floor(z);
  const fx = smooth(x - ix), fz = smooth(z - iz);
  const a = hash2(ix, iz, seed), b = hash2(ix + 1, iz, seed);
  const c = hash2(ix, iz + 1, seed), d = hash2(ix + 1, iz + 1, seed);
  return (a + (b - a) * fx) * (1 - fz) + (c + (d - c) * fx) * fz;
}

/**
 * Substrate surface height (m) at world x,z: slope from back (deeper) to front, plus a little
 * natural undulation. Returns 0 for a bare-bottom tank.
 */
export function substrateHeight(tank: Pick<TankState, 'size' | 'substrate' | 'substrateDepthFrontCm' | 'substrateDepthBackCm' | 'seed'>, x: number, z: number): number {
  if (tank.substrate === 'bare') return 0;
  const { halfW, halfD } = tankBounds(tank);
  const tz = Math.min(1, Math.max(0, (z + halfD) / (2 * halfD))); // 0 back → 1 front
  const base = (tank.substrateDepthBackCm + (tank.substrateDepthFrontCm - tank.substrateDepthBackCm) * smooth(tz)) / 100;
  const n =
    (valueNoise(x * 6, z * 6, tank.seed) - 0.5) * 0.012 +
    (valueNoise(x * 17, z * 17, tank.seed + 7) - 0.5) * 0.004;
  // Fade undulation toward the glass so the substrate meets it cleanly.
  const edge = Math.min(1, (halfW - Math.abs(x)) / 0.04, (halfD - Math.abs(z)) / 0.04);
  return Math.max(0.004, base + n * Math.max(0, edge));
}

/** Clamp a point into the swimmable volume with a margin (m) from glass, substrate and surface. */
export function clampToWater(
  tank: TankState,
  p: [number, number, number],
  margin = 0.01,
): [number, number, number] {
  const b = tankBounds(tank);
  const x = Math.min(b.halfW - margin, Math.max(-b.halfW + margin, p[0]));
  const z = Math.min(b.halfD - margin, Math.max(-b.halfD + margin, p[2]));
  const floor = substrateHeight(tank, x, z) + margin;
  const y = Math.min(b.surfaceY - margin, Math.max(floor, p[1]));
  return [x, y, z];
}

/** Tank water volume in liters (interior, minus a rough substrate volume). */
export function waterLiters(tank: Pick<TankState, 'size' | 'substrateDepthFrontCm' | 'substrateDepthBackCm' | 'substrate'>): number {
  const { widthCm: w, heightCm: h, depthCm: d } = tank.size;
  const sub = tank.substrate === 'bare' ? 0 : (tank.substrateDepthFrontCm + tank.substrateDepthBackCm) / 2;
  return Math.max(1, (w * d * (h - 2.5 - sub)) / 1000);
}
