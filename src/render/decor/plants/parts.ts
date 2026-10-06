/**
 * Instanced plant parts: each part is one shared geometry + material (+ shadow depth material),
 * drawn as one InstancedMesh for every plant that uses it. Parts are keyed per species
 * (textured leaves, tentacles) or shared across species (stems, bulbs, grapes, bubbles).
 */
import {
  BufferGeometry, Color, DoubleSide, FrontSide, MeshDepthMaterial, MeshStandardMaterial, RGBADepthPacking,
  type Material, type Side, type Texture,
} from 'three';
import { applyUnderwater } from '../../underwater';
import { patchPlant } from '../shaders';
import { leafStrip, tentacle, unitCylinder, unitSphere, disc } from '../geom';
import { leafTexture, type LeafTexSpec } from '../textures';

export interface PartDef {
  key: string;
  geometry: BufferGeometry;
  material: Material;
  depth?: Material;
  bend: boolean;
  castShadow: boolean;
}

const parts = new Map<string, PartDef>();

export function getPart(key: string, make: () => Omit<PartDef, 'key'>): PartDef {
  let p = parts.get(key);
  if (!p) {
    p = { key, ...make() };
    parts.set(key, p);
  }
  return p;
}

export interface PlantMatOptions {
  map?: Texture;
  bend: boolean;
  transl: number;
  roughness: number;
  fluor?: Color;
  side?: Side;
  alphaTest?: number;
  color?: Color;
  emissive?: Color;
  metalness?: number;
  transparent?: boolean;
  opacity?: number;
}

/** A lit plant material with sway/bend/translucency and the underwater look, plus its depth twin. */
export function plantMaterial(o: PlantMatOptions): { material: MeshStandardMaterial; depth: MeshDepthMaterial } {
  const m = new MeshStandardMaterial({
    map: o.map ?? null,
    color: o.color ?? new Color(1, 1, 1),
    roughness: o.roughness,
    metalness: o.metalness ?? 0,
    side: o.side ?? DoubleSide,
    alphaTest: o.map ? o.alphaTest ?? 0.45 : 0,
    transparent: o.transparent ?? false,
    opacity: o.opacity ?? 1,
  });
  if (o.map) m.alphaToCoverage = true;
  if (o.emissive) m.emissive = o.emissive;
  patchPlant(m, { bend: o.bend, translucency: o.transl, fluor: o.fluor });
  applyUnderwater(m);
  const d = new MeshDepthMaterial({ depthPacking: RGBADepthPacking, map: o.map ?? null, alphaTest: o.map ? 0.5 : 0, side: o.side ?? DoubleSide });
  patchPlant(d, { bend: o.bend, depthOnly: true });
  return { material: m, depth: d };
}

/** Textured leaf strip part for a species (or a species' secondary organ). */
export function leafPart(key: string, tex: LeafTexSpec, geo: { rows: number; fold?: number; ruffle?: number; ruffleFreq?: number; cup?: number; cols?: number }, mat: { transl: number; roughness: number; fluor?: Color; shadow?: boolean }): PartDef {
  return getPart(key, () => {
    const map = leafTexture(tex);
    const { material, depth } = plantMaterial({ map, bend: true, transl: mat.transl, roughness: mat.roughness, fluor: mat.fluor });
    return { geometry: leafStrip(geo), material, depth, bend: true, castShadow: mat.shadow ?? true };
  });
}

/** Shared untextured stem/rhizome/root cylinder (instance color carries the hue). */
export function stemPart(): PartDef {
  return getPart('shared/stem', () => {
    const { material, depth } = plantMaterial({ bend: false, transl: 0.3, roughness: 0.55, side: FrontSide });
    return { geometry: unitCylinder(6, 1), material, depth, bend: false, castShadow: true };
  });
}

/** Shared sphere (bulbs, caulerpa grapes, ricordea bubbles, bubble-coral vesicles). */
export function spherePart(kind: 'matte' | 'glossy' | 'vesicle'): PartDef {
  return getPart(`shared/sphere-${kind}`, () => {
    const { material, depth } = plantMaterial({
      bend: false,
      transl: kind === 'vesicle' ? 0.8 : 0.2,
      roughness: kind === 'matte' ? 0.8 : kind === 'vesicle' ? 0.18 : 0.3,
      side: FrontSide,
      fluor: kind === 'vesicle' ? new Color(0.25, 0.35, 0.3) : kind === 'glossy' ? new Color(0.5, 0.8, 0.3) : undefined,
    });
    return { geometry: unitSphere(kind === 'matte' ? 2 : 2), material, depth, bend: false, castShadow: kind !== 'vesicle' };
  });
}

/** Tentacle / polyp part with an optional tip; fluorescent tips under blue light. */
export function tentaclePart(key: string, shape: Parameters<typeof tentacle>[0], mat: { transl: number; roughness: number; fluor?: Color; shadow?: boolean }): PartDef {
  return getPart(key, () => {
    const { material, depth } = plantMaterial({ bend: true, transl: mat.transl, roughness: mat.roughness, fluor: mat.fluor, side: FrontSide });
    return { geometry: tentacle(shape), material, depth, bend: true, castShadow: mat.shadow ?? false };
  });
}

/** Disc part (mushroom coral, oral disc, lily pad) — profile baked per key. */
export function discPart(key: string, profile: (r: number, th: number) => number, mat: { map?: Texture; transl: number; roughness: number; fluor?: Color }): PartDef {
  return getPart(key, () => {
    const { material, depth } = plantMaterial({ map: mat.map, bend: false, transl: mat.transl, roughness: mat.roughness, fluor: mat.fluor, side: DoubleSide });
    return { geometry: disc(8, 28, profile, true), material, depth, bend: false, castShadow: true };
  });
}

export function disposeParts(): void {
  for (const p of parts.values()) {
    p.geometry.dispose();
    p.material.dispose();
    p.depth?.dispose();
  }
  parts.clear();
}
