/**
 * Pure numbers for the tank builder (no DOM): unit conversion, volumes, glass, filled weight,
 * filter turnover and the gentle notes the size step shows. Everything works in centimeters and
 * liters internally; only the display helpers know about imperial units.
 */
import type { SubstrateKind, TankSize, WaterType } from '../../core/types';
import { waterLiters } from '../../core/tankGeometry';
import type { TankShape } from '../../app/tankTypes';
import { formatCount, formatLiters, type Units } from '../format';

export const CM_PER_IN = 2.54;
export const L_PER_USGAL = 3.785411784;
export const LB_PER_KG = 2.2046226218;
/** Where an unheated tank settles (the life sim's room swings ~21–23 °C over the day). */
export const ROOM_TEMP_C = 22;
/** Float glass: 2.5 kg per square meter per millimeter of thickness. */
const GLASS_KG_PER_M2_MM = 2.5;
/** Wet sand and gravel: ~1.5 kg per liter. */
const SUBSTRATE_KG_PER_L = 1.5;

export type Axis = 'width' | 'depth' | 'height';
export type SizeLimits = Record<Axis, [number, number]>;

/** Sensible bounds for a home aquarium (cm). */
export const SIZE_LIMITS: SizeLimits = { width: [30, 300], depth: [20, 120], height: [20, 120] };
/** Nano tanks may be smaller (and stay small: past these, it is simply a tank). */
export const NANO_LIMITS: SizeLimits = { width: [20, 90], depth: [15, 60], height: [15, 60] };

export function limitsFor(shape: TankShape): SizeLimits {
  return shape === 'nano' ? NANO_LIMITS : SIZE_LIMITS;
}

const AXIS_KEY: Record<Axis, keyof TankSize> = { width: 'widthCm', depth: 'depthCm', height: 'heightCm' };

export function axisValue(size: TankSize, axis: Axis): number {
  return size[AXIS_KEY[axis]];
}

/** Whole centimeters, inside the shape's limits. */
export function clampDim(cm: number, axis: Axis, shape: TankShape): number {
  const [lo, hi] = limitsFor(shape)[axis];
  if (!Number.isFinite(cm)) return lo;
  return Math.min(hi, Math.max(lo, Math.round(cm)));
}

export function clampSize(size: TankSize, shape: TankShape): TankSize {
  return {
    widthCm: clampDim(size.widthCm, 'width', shape),
    depthCm: clampDim(size.depthCm, 'depth', shape),
    heightCm: clampDim(size.heightCm, 'height', shape),
  };
}

export function withAxis(size: TankSize, axis: Axis, cm: number): TankSize {
  return { ...size, [AXIS_KEY[axis]]: cm };
}

// ---------------------------------------------------------------------------------------------
// Units
// ---------------------------------------------------------------------------------------------

/** A length as the keeper reads it: whole centimeters, or inches to the half inch. */
export function toDisplayLength(cm: number, units: Units): number {
  return units === 'imperial' ? Math.round((cm / CM_PER_IN) * 2) / 2 : Math.round(cm);
}

/** A typed or slid length back to whole centimeters. */
export function fromDisplayLength(v: number, units: Units): number {
  return Math.round(units === 'imperial' ? v * CM_PER_IN : v);
}

export function lengthUnit(units: Units): string {
  return units === 'imperial' ? 'in' : 'cm';
}

/** Slider/input bounds in display units (inches rounded inward to the half inch). */
export function displayRange(range: [number, number], units: Units): [number, number] {
  if (units !== 'imperial') return range;
  return [Math.ceil((range[0] / CM_PER_IN) * 2) / 2, Math.floor((range[1] / CM_PER_IN) * 2) / 2];
}

/** "120 × 50 × 50 cm" (width × depth × height) / "47 × 20 × 20 in". */
export function formatDims(size: TankSize, units: Units): string {
  const f = (cm: number) => {
    const v = toDisplayLength(cm, units);
    return v % 1 ? v.toFixed(1) : String(v);
  };
  return `${f(size.widthCm)} × ${f(size.depthCm)} × ${f(size.heightCm)} ${lengthUnit(units)}`;
}

export function usGallons(liters: number): number {
  return liters / L_PER_USGAL;
}

/** "300 L · 79 US gal" — both, the keeper's units first. */
export function formatVolumeBoth(liters: number, units: Units): string {
  const l = `${formatCount(liters)} L`;
  const g = `${formatCount(usGallons(liters))} US gal`;
  return units === 'imperial' ? `${g} · ${l}` : `${l} · ${g}`;
}

export function formatWeight(kg: number, units: Units): string {
  if (units === 'imperial') return `${formatCount(kg * LB_PER_KG)} lb`;
  return kg >= 1000 ? `${(kg / 1000).toFixed(kg >= 10_000 ? 0 : 1)} t` : `${formatCount(kg)} kg`;
}

/** Floor area: "0.60 m²" / "6.5 sq ft". */
export function formatArea(m2: number, units: Units): string {
  if (units === 'imperial') return `${(m2 * 10.7639).toFixed(1)} sq ft`;
  return `${m2.toFixed(2)} m²`;
}

// ---------------------------------------------------------------------------------------------
// Volume & weight
// ---------------------------------------------------------------------------------------------

/** Nominal (gross) volume, the way tanks are sold. */
export function grossLiters(size: TankSize): number {
  return (size.widthCm * size.depthCm * size.heightCm) / 1000;
}

export interface Fill {
  size: TankSize;
  substrate: SubstrateKind;
  substrateDepthFrontCm: number;
  substrateDepthBackCm: number;
}

/** Water actually held once the substrate is in and the level sits below the rim (as the app counts it). */
export function netLiters(f: Fill): number {
  return waterLiters(f);
}

/**
 * Glass for an open-topped tank by height, from the usual float-glass tables (safety factor ≈3.8):
 * the deeper the water, the higher the pressure on the bottom of the panes.
 */
export function glassThicknessMm(heightCm: number): number {
  if (heightCm <= 25) return 4;
  if (heightCm <= 30) return 5;
  if (heightCm <= 40) return 6;
  if (heightCm <= 50) return 8;
  if (heightCm <= 60) return 10;
  if (heightCm <= 70) return 12;
  if (heightCm <= 85) return 15;
  if (heightCm <= 100) return 19;
  return 25;
}

/** Bottom + front/back + two ends (no lid), in m². */
export function glassAreaM2(size: TankSize): number {
  const { widthCm: w, depthCm: d, heightCm: h } = size;
  return (w * d + 2 * w * h + 2 * d * h) / 10_000;
}

export function glassKg(size: TankSize): number {
  return GLASS_KG_PER_M2_MM * glassThicknessMm(size.heightCm) * glassAreaM2(size);
}

export function substrateLiters(f: Fill): number {
  if (f.substrate === 'bare') return 0;
  return (f.size.widthCm * f.size.depthCm * ((f.substrateDepthFrontCm + f.substrateDepthBackCm) / 2)) / 1000;
}

/** Typical specific gravity for the water type (used when the style sets none). */
export function defaultSG(water: WaterType): number {
  return water === 'marine' ? 1.025 : water === 'brackish' ? 1.008 : 1;
}

export interface Weight {
  water: number;
  glass: number;
  substrate: number;
  total: number;
}

/** Filled weight (kg): water × SG + glass + substrate (stand, rock and lid not included). */
export function filledWeight(f: Fill, sg: number): Weight {
  const water = netLiters(f) * sg;
  const glass = glassKg(f.size);
  const substrate = substrateLiters(f) * SUBSTRATE_KG_PER_L;
  return { water, glass, substrate, total: water + glass + substrate };
}

export function footprintM2(size: TankSize): number {
  return (size.widthCm * size.depthCm) / 10_000;
}

/**
 * Calm observations about the chosen size and shape (most relevant first): small volumes,
 * reach, swimming room, weight.
 */
export function sizeNotes(f: Fill, shape: TankShape, sg: number, units: Units): string[] {
  const { widthCm: w, depthCm: d, heightCm: h } = f.size;
  const liters = grossLiters(f.size);
  const notes: string[] = [];
  if (liters < 40)
    notes.push(`Under ${formatLiters(40, units)} the water changes quickly and stocking is limited — think shrimp, snails and a few tiny fish.`);
  const cube = shape === 'cube' || (Math.max(w, d, h) <= Math.min(w, d, h) * 1.25 && liters >= 40);
  if (cube) notes.push('A cube has no long swimming runs — lovely for slow, small or territorial fish rather than fast schools.');
  else if (w >= h * 2.6 && w >= 100) notes.push('Long and shallow: plenty of swimming length and surface for gas exchange — great for active schools.');
  if (h > 60) notes.push('At this height you will be reaching in up to the shoulder — long tweezers and scissors help, and so does a step.');
  if (d < 30 && w >= 80) notes.push('A narrow tank leaves little room to build depth into the scape.');
  const kg = filledWeight(f, sg).total;
  if (kg > 450) notes.push(`Filled, it weighs about ${formatWeight(kg, units)} — set it on a purpose-built stand, ideally near a load-bearing wall.`);
  else if (liters >= 200) notes.push('Bigger tanks are steadier, not harder: the water forgives small mistakes.');
  return notes;
}

// ---------------------------------------------------------------------------------------------
// Filter turnover
// ---------------------------------------------------------------------------------------------

export interface TurnoverAdvice {
  /** Comfortable range, in tank volumes per hour. */
  lo: number;
  hi: number;
  text: string;
}

/** How much filter flow suits the water type and style (volumes per hour of the gross volume). */
export function turnoverAdvice(water: WaterType, aquascape: string): TurnoverAdvice {
  if (water === 'marine') return { lo: 8, hi: 15, text: 'Reefs like 8–15× the volume an hour; powerheads add the rest of the circulation.' };
  if (aquascape === 'nano-shrimp') return { lo: 3, hi: 5, text: 'Shrimp prefer gentle water: 3–5× an hour, ideally through a sponge.' };
  if (aquascape === 'blackwater') return { lo: 3, hi: 5, text: 'Igarapés are still forest pools: 3–5× an hour, gently.' };
  if (aquascape === 'goldfish') return { lo: 6, hi: 10, text: 'Goldfish are messy eaters: 6–10× an hour keeps the water clear.' };
  if (aquascape === 'malawi') return { lo: 6, hi: 10, text: 'Mbuna carry a heavy bioload: 6–10× an hour.' };
  if (water === 'brackish') return { lo: 4, hi: 8, text: 'Estuary fish are happy at 4–8× the volume an hour.' };
  return { lo: 4, hi: 6, text: 'Most community tanks do well at 4–6× the volume an hour.' };
}

export function turnover(flowLph: number, size: TankSize): number {
  return flowLph / Math.max(1, grossLiters(size));
}

export function turnoverWord(t: number, a: TurnoverAdvice): 'Gentle' | 'Just right' | 'Strong' {
  return t < a.lo * 0.9 ? 'Gentle' : t > a.hi * 1.15 ? 'Strong' : 'Just right';
}

/** Flow slider bounds (L/h) for a tank, matching the care panel's. */
export function flowRange(size: TankSize, water: WaterType): [number, number] {
  const l = grossLiters(size);
  return [Math.max(20, Math.round((l * 2) / 10) * 10), Math.max(200, Math.round((l * (water === 'marine' ? 20 : 12)) / 10) * 10)];
}

// ---------------------------------------------------------------------------------------------
// Light
// ---------------------------------------------------------------------------------------------

/** Hours the lights are on (handles schedules that run past midnight). */
export function photoperiod(onHour: number, offHour: number): number {
  return (((offHour - onHour) % 24) + 24) % 24;
}
