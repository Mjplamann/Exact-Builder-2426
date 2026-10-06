/**
 * Pure plant placement metrics shared by the renderer and the collider/cover builder, so the
 * anemone that a clownfish swims to is exactly where its oral disc is drawn.
 */
import type { PlantInstance, PlantSpecies, TankState } from '../core/types';
import { substrateHeight, tankBounds } from '../core/tankGeometry';
import { hostAnchor, type V3 } from './shapes';

export interface PlantMetrics {
  /** World-space base of the plant (crown / holdfast / rhizome center). */
  anchor: V3;
  /** Surface normal at the anchor (world; up for substrate). */
  normal: V3;
  /** Current height (m) — growth-scaled. For floating plants: root depth. */
  height: number;
  /** Current spread / diameter (m). */
  spread: number;
  /** Growth fraction actually used (clamped). */
  growth: number;
  /** Decor id this plant grows on (resolved, existing). */
  hostId?: string;
}

/** Growth clamped to the documented range. */
export function plantGrowth(p: Pick<PlantInstance, 'growth'>): number {
  const g = Number.isFinite(p.growth) ? p.growth : 0.5;
  return Math.min(1.25, Math.max(0.05, g));
}

/** How tall a plant of this form stands relative to its listed max height at a given growth. */
function heightAt(sp: PlantSpecies, g: number): number {
  const H = sp.maxHeightCm / 100;
  switch (sp.form) {
    case 'carpet':
    case 'moss':
      return H * (0.45 + 0.55 * g);
    case 'floating':
      return H;
    case 'ball':
      return H * (0.6 + 0.4 * g);
    default:
      return H * (0.18 + 0.82 * g);
  }
}

function spreadAt(sp: PlantSpecies, g: number): number {
  const S = sp.spreadCm / 100;
  switch (sp.form) {
    case 'carpet':
    case 'moss':
    case 'floating':
    case 'zoanthid':
    case 'soft-coral':
      return S * (0.25 + 0.75 * g);
    default:
      return S * (0.35 + 0.65 * g);
  }
}

export function plantMetrics(sp: PlantSpecies, p: PlantInstance, tank: TankState): PlantMetrics {
  const g = plantGrowth(p);
  const height = heightAt(sp, g);
  const spread = spreadAt(sp, g);
  const [x, , z] = p.position;
  const b = tankBounds(tank);
  if (sp.form === 'floating') {
    return { anchor: [x, b.surfaceY - 0.002, z], normal: [0, 1, 0], height, spread, growth: g };
  }
  if (p.attachedTo) {
    const host = tank.decor.find((d) => d.id === p.attachedTo);
    if (host) {
      const a = hostAnchor(host, x, z);
      return { anchor: a.p, normal: a.n, height, spread, growth: g, hostId: host.id };
    }
  }
  return { anchor: [x, substrateHeight(tank, x, z), z], normal: [0, 1, 0], height, spread, growth: g };
}

/** Height of an anemone's oral disc above its anchor (fraction of plant height). */
export const ANEMONE_DISC_FRAC = 0.72;

/** World position of an anemone's oral disc center (where clownfish host). */
export function anemoneDisc(m: PlantMetrics): V3 {
  const up = m.normal[1] > 0.3 ? m.normal : ([m.normal[0] * 0.4, 0.8, m.normal[2] * 0.4] as V3);
  const l = Math.hypot(up[0], up[1], up[2]) || 1;
  const h = m.height * ANEMONE_DISC_FRAC;
  return [m.anchor[0] + (up[0] / l) * h, m.anchor[1] + (up[1] / l) * h, m.anchor[2] + (up[2] / l) * h];
}
