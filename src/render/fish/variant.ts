import {
  DynamicDrawUsage,
  InstancedBufferAttribute,
  InstancedMesh,
  type BufferGeometry,
  type Texture,
} from 'three';
import type { FishEntity, Sex, Species } from '../../core/types';
import { resolveBody, resolveLook, type ResolvedBody } from './archetypes';
import { buildFishGeometry, lodFor, type FishGeometryInfo } from './fishGeometry';
import { createFishMaterials, swimUniforms, type FishMaterials } from './fishMaterial';
import { buildInvertebrate } from './invertebrates';
import { buildSeahorse } from './seahorse';
import { swimParams } from './swim';
import { atlasSizeFor, paintFishAtlas, type FishTextures } from './textures';

/**
 * One render variant = one species × visually distinct sex. Owns the geometry (body + fins),
 * the painted atlas, the materials and two InstancedMeshes (opaque body, translucent fins) that
 * share every per-instance attribute buffer.
 */

export interface VariantOptions {
  envMap: Texture | null;
  underwater: boolean;
  thumbnail?: boolean;
}

export interface VariantShape {
  geoBody: BufferGeometry;
  geoFins: BufferGeometry;
  info: FishGeometryInfo;
}

const LIVEBEARER_ARCH = new Set(['livebearer', 'molly', 'swordtail', 'halfbeak']);

export class FishVariant {
  readonly key: string;
  readonly species: Species;
  readonly sex: Sex;
  readonly body: ResolvedBody;
  readonly info: FishGeometryInfo;
  readonly tex: FishTextures;
  readonly mats: FishMaterials;
  bodyMesh!: InstancedMesh;
  finMesh!: InstancedMesh;
  capacity = 0;
  /** Animals currently drawn by this variant (set by FishRenderer.sync). */
  members: FishEntity[] = [];
  /** Instance attribute arrays (shared by both meshes). */
  aA!: InstancedBufferAttribute;
  aB!: InstancedBufferAttribute;
  aLook!: InstancedBufferAttribute;
  aState!: InstancedBufferAttribute;
  private geoBody: BufferGeometry;
  private geoFins: BufferGeometry;
  private opts: VariantOptions;

  constructor(key: string, species: Species, sex: Sex, opts: VariantOptions) {
    this.key = key;
    this.species = species;
    this.sex = sex;
    this.opts = opts;
    const body = (this.body = resolveBody(species, sex));
    const look = resolveLook(species, sex);
    const scale = sex === 'male' ? species.male?.lengthScale ?? 1 : sex === 'female' ? species.female?.lengthScale ?? 1 : 1;
    const adult = species.adultLengthCm * scale;
    const night = !opts.thumbnail && species.traits?.includes('night-coloration');
    const N = atlasSizeFor(adult, !!opts.thumbnail);

    let shape: VariantShape;
    let tex: FishTextures;
    if (body.kind === 'fish' || body.kind === 'ray') {
      const elongated = body.depth < 0.13 || species.locomotion === 'anguilliform';
      const g = buildFishGeometry(body, lodFor(adult, elongated, opts.thumbnail ? 'thumb' : 'tank'));
      shape = { geoBody: g.body, geoFins: g.fins, info: g.info };
      tex = paintFishAtlas(species, body, look, g.info.profile!, N, { night });
    } else if (body.kind === 'seahorse') {
      const g = buildSeahorse(body, opts.thumbnail ? 1.3 : adult < 8 ? 0.8 : 1);
      shape = { geoBody: g.body, geoFins: g.fins, info: g.info };
      tex = paintFishAtlas(species, body, look, g.info.profile!, N, { night });
    } else {
      const g = buildInvertebrate(species, body, look, opts.thumbnail ? 1.3 : adult < 3 ? 0.75 : 1);
      shape = { geoBody: g.body, geoFins: g.fins, info: g.info };
      tex = g.paint(N);
    }
    this.info = shape.info;
    this.geoBody = shape.geoBody;
    this.geoFins = shape.geoFins;
    this.tex = tex;
    const swim = swimParams(species, body);
    const discHalf = body.kind === 'ray' ? body.width * 0.5 * shape.info.slLocal : 1;
    const isFish = body.kind === 'fish' || body.kind === 'seahorse' || body.kind === 'ray';
    this.mats = createFishMaterials(species, look, tex, swimUniforms(swim, shape.info, discHalf), opts.envMap, {
      underwater: opts.underwater,
      livebearer: species.reproduction === 'livebearer' || LIVEBEARER_ARCH.has(body.archetype),
      skin: {
        scaleCols: isFish && body.skin === 'scaled' && body.scaleSize > 0.02 ? 62 - 40 * body.scaleSize : 0,
        depth: body.depth,
        adultCm: adult,
        invertebrate: !isFish,
        opercleX: shape.info.profile?.head.opercleX,
      },
    });
    this.allocate(4);
  }

  /** (Re)allocate instance buffers and meshes for at least `n` animals. */
  ensureCapacity(n: number, onReplace: (oldMeshes: InstancedMesh[], fresh: InstancedMesh[]) => void): void {
    if (n <= this.capacity) return;
    const old = [this.bodyMesh, this.finMesh];
    this.allocate(Math.max(n, Math.ceil(this.capacity * 1.6)));
    onReplace(old, [this.bodyMesh, this.finMesh]);
  }

  private allocate(cap: number): void {
    this.capacity = cap;
    const mk = (size: number) => {
      const a = new InstancedBufferAttribute(new Float32Array(cap * size), size);
      a.setUsage(DynamicDrawUsage);
      return a;
    };
    for (const g of [this.geoBody, this.geoFins]) {
      for (const k of ['iAnimA', 'iAnimB', 'iLook', 'iState']) if (g.getAttribute(k)) g.deleteAttribute(k);
    }
    this.aA = mk(4);
    this.aB = mk(4);
    this.aLook = mk(4);
    this.aState = mk(4);
    for (const g of [this.geoBody, this.geoFins]) {
      g.setAttribute('iAnimA', this.aA);
      g.setAttribute('iAnimB', this.aB);
      g.setAttribute('iLook', this.aLook);
      g.setAttribute('iState', this.aState);
    }
    this.bodyMesh?.dispose();
    this.finMesh?.dispose();
    const bodyMesh = new InstancedMesh(this.geoBody, this.mats.body, cap);
    const finMesh = new InstancedMesh(this.geoFins, this.mats.fins, cap);
    bodyMesh.instanceMatrix.setUsage(DynamicDrawUsage);
    finMesh.instanceMatrix = bodyMesh.instanceMatrix;
    bodyMesh.customDepthMaterial = this.mats.depth;
    bodyMesh.castShadow = !this.opts.thumbnail;
    bodyMesh.receiveShadow = false;
    finMesh.castShadow = false;
    bodyMesh.frustumCulled = false;
    finMesh.frustumCulled = false;
    bodyMesh.count = 0;
    finMesh.count = 0;
    bodyMesh.name = `fish:${this.key}`;
    finMesh.name = `fins:${this.key}`;
    // Translucent bodies draw before their fins; fins last among the animals.
    bodyMesh.renderOrder = this.mats.body.transparent ? 1 : 0;
    finMesh.renderOrder = 2;
    this.bodyMesh = bodyMesh;
    this.finMesh = finMesh;
  }

  /** Stable per-individual look jitter from the color seed (hue, value, saturation). */
  static individual(colorSeed: number, out: Float32Array, o: number): void {
    let h = Math.imul((colorSeed | 0) ^ 0x9e3779b9, 0x85ebca6b);
    h = Math.imul(h ^ (h >>> 13), 0xc2b2ae35);
    h = (h ^ (h >>> 16)) >>> 0;
    const r1 = ((h & 1023) / 1023) * 2 - 1;
    const r2 = (((h >>> 10) & 1023) / 1023) * 2 - 1;
    const r3 = (((h >>> 20) & 1023) / 1023) * 2 - 1;
    out[o] = r1 * 0.05; // hue (rad) ≈ ±3°
    out[o + 1] = 1 + r2 * 0.06; // brightness
    out[o + 2] = 1 + r3 * 0.07; // saturation
  }

  dispose(): void {
    this.bodyMesh.removeFromParent();
    this.finMesh.removeFromParent();
    this.bodyMesh.dispose();
    this.finMesh.dispose();
    this.geoBody.dispose();
    this.geoFins.dispose();
    this.mats.dispose();
    this.tex.dispose();
  }
}

