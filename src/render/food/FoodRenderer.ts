import {
  BufferAttribute,
  BufferGeometry,
  Color,
  DoubleSide,
  DynamicDrawUsage,
  Euler,
  InstancedBufferAttribute,
  InstancedMesh,
  Matrix4,
  MeshStandardMaterial,
  NormalBlending,
  Points,
  Quaternion,
  ShaderMaterial,
  Vector3,
} from 'three';
import type { FoodParticle, FoodType } from '../../core/types';
import type { World } from '../../core/world';
import { FOODS, FOOD_LIST } from '../../data/foods';
import type { FoodRT } from '../../behavior/FoodSystem';
import type { Engine } from '../Engine';
import { GLOBALS } from '../globals';
import { addShaderPatch } from '../materialPatch';
import { applyUnderwater } from '../underwater';
import { buildFoodGeometry, hexToRgb, type FoodShape } from './foodGeometry';

/**
 * Draws food particles (flakes, pellets, wafers, worms, live brine shrimp...) with instancing:
 * one InstancedMesh per food shape (all kinds sharing a shape share a draw call), plus a point
 * cloud for phytoplankton. Materials are lit MeshStandardMaterials patched with
 * `applyUnderwater`; bloodworms and live crustaceans wriggle and nori waves in a tiny vertex
 * patch. Soaked flakes darken; food left too long turns grey with fungus.
 *
 * OWNER: behavior module (with the food physics).
 */

const MESH_SHAPES: FoodShape[] = ['flake', 'pellet', 'stick', 'wafer', 'worm', 'shrimp', 'flea', 'sheet', 'slice', 'insect'];

interface Batch {
  shape: FoodShape;
  mesh: InstancedMesh;
  material: MeshStandardMaterial;
  geometry: BufferGeometry;
  /** Per-instance (phase, amplitude, angular frequency) for the wriggle patch. */
  anim: InstancedBufferAttribute;
  capacity: number;
  count: number;
}

const MAT_OPTS: Record<FoodShape, { roughness: number; opacity?: number; side?: boolean; vertexColors?: boolean }> = {
  flake: { roughness: 0.8, side: true },
  pellet: { roughness: 0.55 },
  stick: { roughness: 0.6 },
  wafer: { roughness: 0.85 },
  worm: { roughness: 0.35 },
  shrimp: { roughness: 0.35, opacity: 0.82 },
  flea: { roughness: 0.4, opacity: 0.72 },
  sheet: { roughness: 0.5, side: true },
  slice: { roughness: 0.5, vertexColors: true },
  insect: { roughness: 0.5 },
  cloud: { roughness: 1 },
};

/** Vertex wriggle per shape (local space, before the instance matrix). */
const WRIGGLE: Partial<Record<FoodShape, string>> = {
  worm: `
    float wwv = sin(uTime * aAnim.z + aAnim.x + aw * 7.0);
    transformed.y += aAnim.y * wwv * (0.35 + 0.65 * abs(aw * 2.0 - 1.0));
    transformed.z += aAnim.y * 0.6 * cos(uTime * aAnim.z * 0.7 + aAnim.x + aw * 5.0) * abs(aw * 2.0 - 1.0);`,
  shrimp: `
    float tail = pow(1.0 - aw, 2.0);
    transformed.y += aAnim.y * sin(uTime * aAnim.z + aAnim.x) * tail;
    transformed.z += aAnim.y * 0.4 * sin(uTime * aAnim.z * 0.5 + aAnim.x) * aw * (1.0 - aw);`,
  sheet: `
    float hang = 1.0 - aw;
    transformed.z += aAnim.y * hang * sin(uTime * aAnim.z + aAnim.x + position.x * 5.0 - aw * 3.0);
    transformed.x += aAnim.y * 0.3 * hang * sin(uTime * aAnim.z * 0.6 + aAnim.x);`,
};

const _m = new Matrix4();
const _q = new Quaternion();
const _e = new Euler(0, 0, 0, 'YXZ');
const _p = new Vector3();
const _s = new Vector3();
const _c = new Color();

/** Linear-space base colors per food kind (cached). */
const COLORS = new Map<string, { a: [number, number, number]; b: [number, number, number] }>();
function colorsOf(type: FoodType) {
  let c = COLORS.get(type.kind);
  if (!c) {
    const lin = (v: [number, number, number]) => v.map((x) => Math.pow(x, 2.2)) as [number, number, number];
    const a = lin(hexToRgb(type.color));
    c = { a, b: type.color2 ? lin(hexToRgb(type.color2)) : a };
    COLORS.set(type.kind, c);
  }
  return c;
}

function hash01(n: number): number {
  let h = Math.imul(n ^ 0x9e3779b9, 0x85ebca6b);
  h ^= h >>> 13;
  h = Math.imul(h, 0xc2b2ae35);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

/** Shape → batch slot. */
const SLOT = new Map<FoodShape, number>(MESH_SHAPES.map((s, i) => [s, i]));

export class FoodRenderer {
  private batches: Batch[] = [];
  private counts = new Int32Array(MESH_SHAPES.length);
  private cloud: Points;
  private cloudGeo: BufferGeometry;
  private cloudMat: ShaderMaterial;
  private cloudCap = 0;

  constructor(private engine: Engine) {
    for (const shape of MESH_SHAPES) {
      const type = FOOD_LIST.find((f) => f.shape === shape);
      this.batches.push(this.makeBatch(shape, type, 64));
    }
    // Phytoplankton: soft green puffs.
    this.cloudGeo = new BufferGeometry();
    this.cloudMat = new ShaderMaterial({
      uniforms: {
        uScale: { value: 800 },
        // (Color() from a hex string is already converted to the linear working space.)
        uColor: { value: new Color(FOODS.phytoplankton.color) },
        uLight: { value: 1 },
      },
      vertexShader: /* glsl */ `
        attribute float aAlpha;
        attribute float aSize;
        uniform float uScale;
        varying float vAlpha;
        void main() {
          vec4 mv = modelViewMatrix * vec4(position, 1.0);
          gl_Position = projectionMatrix * mv;
          gl_PointSize = clamp(aSize * uScale / max(0.05, -mv.z), 1.0, 256.0);
          vAlpha = aAlpha;
        }`,
      fragmentShader: /* glsl */ `
        uniform vec3 uColor;
        uniform float uLight;
        varying float vAlpha;
        void main() {
          float r = length(gl_PointCoord - 0.5) * 2.0;
          float a = 1.0 - smoothstep(0.0, 1.0, r);
          // A lit suspension of microalgae scatters light: a soft, slightly milky green.
          gl_FragColor = vec4(uColor * (0.5 + 1.1 * uLight) + 0.015 * uLight, a * a * vAlpha);
          #include <tonemapping_fragment>
          #include <colorspace_fragment>
        }`,
      transparent: true,
      depthWrite: false,
      blending: NormalBlending,
    });
    this.cloud = new Points(this.cloudGeo, this.cloudMat);
    this.cloud.frustumCulled = false;
    this.cloud.renderOrder = 5;
    this.ensureCloud(256);
    engine.contents.add(this.cloud);
  }

  private makeBatch(shape: FoodShape, type: FoodType | undefined, capacity: number, old?: Batch): Batch {
    const geometry = old?.geometry ?? buildFoodGeometry(shape, type);
    let material = old?.material;
    if (!material) {
      const o = MAT_OPTS[shape];
      material = new MeshStandardMaterial({
        color: 0xffffff,
        roughness: o.roughness,
        metalness: 0,
        transparent: o.opacity !== undefined,
        opacity: o.opacity ?? 1,
        vertexColors: !!o.vertexColors,
      });
      if (o.side) material.side = DoubleSide;
      const code = WRIGGLE[shape];
      if (code) {
        addShaderPatch(
          material,
          `food-wriggle-${shape}`,
          (shader) => {
            shader.uniforms.uTime = GLOBALS.uTime;
            shader.vertexShader = shader.vertexShader
              .replace('#include <common>', '#include <common>\nuniform float uTime;\nattribute float aw;\nattribute vec3 aAnim;')
              .replace('#include <begin_vertex>', `#include <begin_vertex>\n${code}`);
          },
          -10,
        );
      }
      applyUnderwater(material);
    }
    const mesh = new InstancedMesh(geometry, material, capacity);
    mesh.instanceMatrix.setUsage(DynamicDrawUsage);
    const colors = new InstancedBufferAttribute(new Float32Array(capacity * 3), 3);
    colors.setUsage(DynamicDrawUsage);
    mesh.instanceColor = colors;
    const anim = new InstancedBufferAttribute(new Float32Array(capacity * 3), 3);
    anim.setUsage(DynamicDrawUsage);
    geometry.setAttribute('aAnim', anim);
    mesh.count = 0;
    mesh.frustumCulled = false;
    mesh.castShadow = false;
    mesh.receiveShadow = false;
    mesh.name = `food-${shape}`;
    if (old) {
      this.engine.contents.remove(old.mesh);
      old.mesh.dispose();
    }
    this.engine.contents.add(mesh);
    return { shape, mesh, material, geometry, anim, capacity, count: 0 };
  }

  private ensureCloud(n: number): void {
    if (n <= this.cloudCap) return;
    const cap = Math.max(256, Math.ceil(n * 1.5));
    this.cloudCap = cap;
    const pos = new BufferAttribute(new Float32Array(cap * 3), 3).setUsage(DynamicDrawUsage);
    const alpha = new BufferAttribute(new Float32Array(cap), 1).setUsage(DynamicDrawUsage);
    const size = new BufferAttribute(new Float32Array(cap), 1).setUsage(DynamicDrawUsage);
    this.cloudGeo.setAttribute('position', pos);
    this.cloudGeo.setAttribute('aAlpha', alpha);
    this.cloudGeo.setAttribute('aSize', size);
    this.cloudGeo.setDrawRange(0, 0);
  }

  update(world: World, dt: number): void {
    void dt;
    const food = world.food;
    // Pass 1: count per shape (grow buffers if needed).
    this.counts.fill(0);
    let clouds = 0;
    for (let i = 0; i < food.length; i++) {
      const type = FOODS[food[i].kind];
      if (!type || food[i].state === 'eaten') continue;
      if (type.shape === 'cloud') clouds++;
      else this.counts[SLOT.get(type.shape) ?? 1]++;
    }
    for (let si = 0; si < MESH_SHAPES.length; si++) {
      const need = this.counts[si];
      let b = this.batches[si];
      if (need > b.capacity) {
        b = this.makeBatch(MESH_SHAPES[si], undefined, Math.ceil(need * 1.5), b);
        this.batches[si] = b;
      }
      b.count = 0;
    }
    this.ensureCloud(clouds);

    // Pass 2: write instances.
    const sim = world.clock.simTime;
    const posA = this.cloudGeo.getAttribute('position') as BufferAttribute;
    const alphaA = this.cloudGeo.getAttribute('aAlpha') as BufferAttribute;
    const sizeA = this.cloudGeo.getAttribute('aSize') as BufferAttribute;
    let ci = 0;
    for (let i = 0; i < food.length; i++) {
      const f = food[i];
      const type = FOODS[f.kind];
      if (!type || f.state === 'eaten') continue;
      const r = f as Partial<FoodRT>;
      if (type.shape === 'cloud') {
        posA.setXYZ(ci, f.pos[0], f.pos[1], f.pos[2]);
        const age = f.age;
        // Puffs swell as the dose mixes in, and fade as it disperses (~1–2 min).
        alphaA.setX(ci, 0.07 * (r.alpha ?? Math.exp(-age / 55)) * Math.min(1, age * 3));
        sizeA.setX(ci, Math.min(0.07, 0.02 + age * 0.0008));
        ci++;
        continue;
      }
      const b = this.batches[SLOT.get(type.shape) ?? 1];
      const k = b.count++;
      this.writeInstance(b, k, f, type, r, sim);
    }
    for (let si = 0; si < this.batches.length; si++) {
      const b = this.batches[si];
      b.mesh.count = b.count;
      if (b.count > 0) {
        b.mesh.instanceMatrix.needsUpdate = true;
        if (b.mesh.instanceColor) b.mesh.instanceColor.needsUpdate = true;
        b.anim.needsUpdate = true;
      }
      b.mesh.visible = b.count > 0;
    }
    this.cloudGeo.setDrawRange(0, ci);
    if (ci > 0) {
      posA.needsUpdate = true;
      alphaA.needsUpdate = true;
      sizeA.needsUpdate = true;
      const cam = this.engine.camera;
      const hPx = this.engine.renderer.domElement.height || 900;
      this.cloudMat.uniforms.uScale.value = hPx / (2 * Math.tan((cam.fov * Math.PI) / 360));
      this.cloudMat.uniforms.uLight.value = 0.25 + 0.75 * world.env.daylight + 0.2 * world.env.moonlight;
    }
    this.cloud.visible = ci > 0;
  }

  private writeInstance(b: Batch, k: number, f: FoodParticle, type: FoodType, r: Partial<FoodRT>, sim: number): void {
    // Transform.
    _e.set(f.rot[0], f.rot[1], f.rot[2], 'YXZ');
    _q.setFromEuler(_e);
    _p.set(f.pos[0], f.pos[1], f.pos[2]);
    const s = f.sizeM;
    _s.set(s * (r.sx ?? 1), s * (r.sy ?? 1), s * (r.sz ?? 1));
    _m.compose(_p, _q, _s);
    b.mesh.setMatrixAt(k, _m);

    // Color: per-particle mix of the two product colors, soaking & decay.
    const cols = colorsOf(type);
    const h = hash01(f.seed);
    const mix = type.shape === 'flake' ? (h < 0.6 ? h * 0.3 : 0.6 + h * 0.4) : type.color2 ? h * 0.5 : 0;
    let cr = cols.a[0] + (cols.b[0] - cols.a[0]) * mix;
    let cg = cols.a[1] + (cols.b[1] - cols.a[1]) * mix;
    let cb = cols.a[2] + (cols.b[2] - cols.a[2]) * mix;
    const bright = 0.88 + 0.24 * hash01(f.seed ^ 0x5bd1);
    cr *= bright;
    cg *= bright;
    cb *= bright;
    const soak = r.soak ?? 0;
    if (type.shape === 'flake' || type.shape === 'pellet' || type.shape === 'stick') {
      const d = 1 - 0.25 * soak;
      cr *= d;
      cg *= d;
      cb *= d;
    }
    if (r.dead && (type.shape === 'shrimp' || type.shape === 'flea')) {
      // Dead Artemia/Daphnia turn pale and opaque.
      cr = cr * 0.7 + 0.25;
      cg = cg * 0.7 + 0.22;
      cb = cb * 0.7 + 0.18;
    }
    if (type.shape === 'slice') {
      cr = cg = cb = 0.95;
    }
    if (f.state === 'settled' && f.settledAtSim !== undefined) {
      // Uneaten food grows a grey fungal fuzz before it rots away.
      const prog = (sim - f.settledAtSim) / (type.decayHours * 3_600_000);
      const fz = Math.min(1, Math.max(0, (prog - 0.45) / 0.55));
      const w = 0.5 * fz * fz;
      cr += (0.55 - cr) * w;
      cg += (0.54 - cg) * w;
      cb += (0.5 - cb) * w;
    }
    _c.setRGB(cr, cg, cb);
    b.mesh.setColorAt(k, _c);

    // Wriggle.
    let amp = 0, freq = 0;
    if (type.shape === 'worm') {
      amp = f.state === 'settled' ? 0.012 : 0.04;
      freq = f.state === 'settled' ? 1.2 : 2.6;
    } else if (type.shape === 'shrimp') {
      if (f.state === 'swimming') {
        amp = 0.06;
        freq = 32;
      }
    } else if (type.shape === 'sheet') {
      amp = 0.02;
      freq = 1.3;
    }
    b.anim.setXYZ(k, (f.seed % 1000) * 0.0063, amp, freq);
  }

  dispose(): void {
    for (const b of this.batches) {
      this.engine.contents.remove(b.mesh);
      b.mesh.dispose();
      b.geometry.dispose();
      b.material.dispose();
    }
    this.batches.length = 0;
    this.engine.contents.remove(this.cloud);
    this.cloudGeo.dispose();
    this.cloudMat.dispose();
  }
}
