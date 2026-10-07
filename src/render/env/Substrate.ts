import {
  BufferAttribute,
  BufferGeometry,
  Color,
  Group,
  Mesh,
  MeshPhysicalMaterial,
  MeshStandardMaterial,
  PlaneGeometry,
  Vector2,
} from 'three';
import type { SubstrateKind, TankState } from '../../core/types';
import { substrateHeight, tankBounds } from '../../core/tankGeometry';
import { addShaderPatch } from '../materialPatch';
import { applyUnderwater } from '../underwater';
import { NOISE_GLSL } from './glsl';
import { substrateTextures, type SubstrateTextures } from './substrateTextures';

/**
 * The tank floor: a heightfield following `substrateHeight()` (the shared source of truth),
 * its cross-section pressed against the front glass, or a bare glass bottom.
 *
 * Detail textures are procedural (see substrateTextures.ts). Repetition is hidden by
 * height-blending two differently rotated/scaled samplings under a slow noise mask, plus
 * large-scale tonal variation (grain sorting by the current, mulm patches).
 */

/** Anti-tiling replacement of map/roughness/normal/ao sampling (needs map, normalMap, roughnessMap, aoMap). */
function antiTilingPatch(material: MeshStandardMaterial, macroScale: number, macroAmp: number, macroTint: Color): void {
  const uniforms = {
    uSubMacro: { value: new Vector2(macroScale, macroAmp) },
    uSubMacroTint: { value: macroTint.clone() },
  };
  addShaderPatch(
    material,
    'substrate-detail',
    (shader) => {
      Object.assign(shader.uniforms, uniforms);
      let fs = shader.fragmentShader;
      fs = fs.replace(
        'void main() {',
        `uniform vec2 uSubMacro;\nuniform vec3 uSubMacroTint;\n${NOISE_GLSL}\nvoid main() {`,
      );
      fs = fs.replace(
        '#include <map_fragment>',
        /* glsl */ `
  // [substrate] two rotated samplings, height-blended under a slow mask (no visible tiling).
  vec2 subUvA = vMapUv;
  vec2 subUvB = mat2(-0.5, 0.866, -0.866, -0.5) * vMapUv * 0.83 + vec2(0.37, 0.71);
  float subMask = uwNoise(vMapUv * 0.29 + 3.7) * 0.72 + uwNoise(vMapUv * 0.93 + 1.3) * 0.28;
  vec4 subA = texture2D(map, subUvA);
  vec4 subB = texture2D(map, subUvB);
  float subHA = subA.a + (1.0 - subMask) * 1.6;
  float subHB = subB.a + subMask * 1.6;
  float subTop = max(subHA, subHB) - 0.2;
  float subWA = max(subHA - subTop, 0.0), subWB = max(subHB - subTop, 0.0);
  float subWN = 1.0 / max(subWA + subWB, 1e-4);
  subWA *= subWN; subWB *= subWN;
  vec4 sampledDiffuseColor = subA * subWA + subB * subWB;
  // Macro variation: brightness patches with a slight tint toward fines/mulm.
  float subMacro = uwFbm(vMapUv * uSubMacro.x + 7.1) - 0.5;
  sampledDiffuseColor.rgb *= (1.0 + subMacro * 2.0 * uSubMacro.y) * mix(vec3(1.0), uSubMacroTint, clamp(-subMacro * 2.5, 0.0, 1.0));
  // [substrate] close-ups: sand grains are only 3–6 texels across, so at 4–8× zoom bilinear
  // magnification melts them into a soft speckle. Where a texel spans more than ~1.3 px, the
  // grain outlines are re-sharpened from the height channel against its local mean (a mask
  // with a one-pixel edge: crisp grains, dark interstices) and the crowns turn glossy like
  // single wet grains. Whole-tank views never take the branch.
  vec2 subFw = fwidth(vMapUv * vec2(textureSize(map, 0)));
  float subTexPx = 1.0 / max(max(subFw.x, subFw.y), 1e-4);
  float subMag = smoothstep(1.3, 3.0, subTexPx);
  float subH = subA.a * subWA + subB.a * subWB;
  float subHw = max(fwidth(subH), 1e-3);
  float subCrown = 0.0;
  if (subMag > 0.001) {
    float subMean = textureLod(map, subUvA, 2.2).a * subWA + textureLod(map, subUvB, 2.2).a * subWB;
    float subDh = subH - subMean;
    float subEdge = smoothstep(-subHw, subHw, subDh + 0.25 * subHw);
    sampledDiffuseColor.rgb *= mix(1.0, 0.8 + 0.26 * subEdge, subMag);
    subCrown = subMag * smoothstep(0.5, 3.0, subDh / subHw);
  }
  diffuseColor *= sampledDiffuseColor;`,
      );
      fs = fs.replace(
        '#include <roughnessmap_fragment>',
        /* glsl */ `
  float roughnessFactor = roughness;
  vec4 subOrm = texture2D(roughnessMap, subUvA) * subWA + texture2D(roughnessMap, subUvB) * subWB;
  roughnessFactor *= subOrm.g;
  roughnessFactor *= 1.0 - 0.45 * subCrown;`,
      );
      fs = fs.replace(
        '#include <normal_fragment_maps>',
        /* glsl */ `
  #ifdef USE_NORMALMAP_TANGENTSPACE
    vec3 subNA = texture2D(normalMap, subUvA).xyz * 2.0 - 1.0;
    vec3 subNB = texture2D(normalMap, subUvB).xyz * 2.0 - 1.0;
    subNB.xy = mat2(-0.5, -0.866, 0.866, -0.5) * subNB.xy; // back into A's tangent frame
    vec3 mapN = normalize(subNA * subWA + subNB * subWB);
    mapN.xy *= normalScale;
    normal = normalize(tbn * mapN);
  #endif`,
      );
      fs = fs.replace(
        '#include <aomap_fragment>',
        /* glsl */ `
  #ifdef USE_AOMAP
    float ambientOcclusion = (subOrm.r - 1.0) * aoMapIntensity + 1.0;
    reflectedLight.indirectDiffuse *= ambientOcclusion;
    #if defined( USE_ENVMAP ) && defined( STANDARD )
      float dotNV = saturate( dot( geometryNormal, geometryViewDir ) );
      reflectedLight.indirectSpecular *= computeSpecularOcclusion( dotNV, ambientOcclusion, material.roughness );
    #endif
  #endif`,
      );
      shader.fragmentShader = fs;
    },
    50,
  );
}

/** The cross-section at the front glass is lit only by light seeping down between grains. */
function crossSectionPatch(material: MeshStandardMaterial): void {
  addShaderPatch(
    material,
    'substrate-section',
    (shader) => {
      shader.vertexShader = shader.vertexShader
        .replace('void main() {', 'attribute float aTop;\nvarying float vSubDepth;\nvoid main() {')
        .replace('#include <begin_vertex>', '#include <begin_vertex>\n  vSubDepth = max(aTop - position.y, 0.0);');
      shader.fragmentShader = shader.fragmentShader
        .replace('void main() {', 'varying float vSubDepth;\nvoid main() {')
        .replace(
          '#include <lights_fragment_end>',
          /* glsl */ `#include <lights_fragment_end>
  {
    // Light diffusing down through the grain pack: ~1 cm e-folding for direct light.
    float subLit = exp(-vSubDepth / 0.011);
    reflectedLight.directDiffuse *= 0.1 + 0.9 * subLit;
    reflectedLight.directSpecular *= subLit;
    reflectedLight.indirectDiffuse *= 0.35 + 0.65 * exp(-vSubDepth / 0.035);
  }`,
        );
    },
    60,
  );
}

export class Substrate {
  readonly group = new Group();
  /** Mean albedo (linear) for the bounce light; dark for a bare bottom. */
  readonly meanAlbedo = new Color(0.05, 0.05, 0.05);
  private meshes: Mesh[] = [];
  private kind: SubstrateKind | null = null;

  constructor() {
    this.group.name = 'env.substrate';
  }

  build(tank: TankState, textureSize: number, anisotropy: number): void {
    this.clear();
    const b = tankBounds(tank);
    this.kind = tank.substrate;
    if (tank.substrate === 'bare') {
      this.buildBare(b.halfW, b.halfD);
      return;
    }
    const tex = substrateTextures(tank.substrate, textureSize, anisotropy);
    this.meanAlbedo.copy(tex.meanAlbedo);
    const top = this.buildTop(tank, tex);
    const front = this.buildFront(tank, tex);
    this.group.add(top, front);
    this.meshes.push(top, front);
  }

  private makeMaterial(tex: SubstrateTextures): MeshStandardMaterial {
    const s = tex.spec;
    const m = new MeshStandardMaterial({
      map: tex.albedo,
      normalMap: tex.normal,
      normalScale: new Vector2(s.normalScale, s.normalScale),
      roughnessMap: tex.orm,
      aoMap: tex.orm,
      aoMapIntensity: 1,
      roughness: 1,
      metalness: 0,
    });
    // Macro features ~25 cm across regardless of the tile size.
    antiTilingPatch(m, s.tile / 0.25, s.macroAmp, new Color(...s.macroTint));
    return m;
  }

  private buildTop(tank: TankState, tex: SubstrateTextures): Mesh {
    const b = tankBounds(tank);
    const nx = Math.min(260, Math.max(24, Math.ceil((2 * b.halfW) / 0.009)));
    const nz = Math.min(110, Math.max(12, Math.ceil((2 * b.halfD) / 0.009)));
    const geo = new PlaneGeometry(2 * b.halfW, 2 * b.halfD, nx, nz);
    geo.rotateX(-Math.PI / 2);
    const pos = geo.getAttribute('position') as BufferAttribute;
    const uv = geo.getAttribute('uv') as BufferAttribute;
    const tile = tex.spec.tile;
    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i), z = pos.getZ(i);
      pos.setY(i, substrateHeight(tank, x, z));
      uv.setXY(i, x / tile, -z / tile);
    }
    geo.computeVertexNormals();
    geo.computeBoundingSphere();
    const mat = this.makeMaterial(tex);
    applyUnderwater(mat);
    const mesh = new Mesh(geo, mat);
    mesh.name = 'env.substrate.top';
    mesh.receiveShadow = true;
    mesh.userData.castShadow = false;
    return mesh;
  }

  private buildFront(tank: TankState, tex: SubstrateTextures): Mesh {
    const b = tankBounds(tank);
    const nx = Math.min(260, Math.max(24, Math.ceil((2 * b.halfW) / 0.009)));
    const z = b.halfD - 0.0004;
    const tile = tex.spec.tile;
    const verts = new Float32Array((nx + 1) * 2 * 3);
    const uvs = new Float32Array((nx + 1) * 2 * 2);
    const nrm = new Float32Array((nx + 1) * 2 * 3);
    const tops = new Float32Array((nx + 1) * 2);
    // Tilted normal: the rounded tops of grains face the light, not the glass.
    const ny = 0.5, nz = Math.sqrt(1 - ny * ny);
    for (let i = 0; i <= nx; i++) {
      const x = -b.halfW + (2 * b.halfW * i) / nx;
      const h = substrateHeight(tank, x, b.halfD);
      for (let k = 0; k < 2; k++) {
        const vi = i * 2 + k;
        const y = k === 0 ? 0 : h;
        verts.set([x, y, z], vi * 3);
        uvs.set([x / tile, y / tile], vi * 2);
        nrm.set([0, ny, nz], vi * 3);
        tops[vi] = h;
      }
    }
    const idx: number[] = [];
    for (let i = 0; i < nx; i++) {
      const a = i * 2, bb = i * 2 + 1, c = (i + 1) * 2, d = (i + 1) * 2 + 1;
      idx.push(a, c, bb, bb, c, d);
    }
    const geo = new BufferGeometry();
    geo.setAttribute('position', new BufferAttribute(verts, 3));
    geo.setAttribute('normal', new BufferAttribute(nrm, 3));
    geo.setAttribute('uv', new BufferAttribute(uvs, 2));
    geo.setAttribute('aTop', new BufferAttribute(tops, 1));
    geo.setIndex(idx);
    geo.computeBoundingSphere();
    const mat = this.makeMaterial(tex);
    crossSectionPatch(mat);
    applyUnderwater(mat);
    const mesh = new Mesh(geo, mat);
    mesh.name = 'env.substrate.front';
    mesh.receiveShadow = true;
    mesh.userData.castShadow = false;
    return mesh;
  }

  /** Bare-bottom tank: the glass floor over a dark stand mat (still catches caustics and shadows). */
  private buildBare(halfW: number, halfD: number): void {
    this.meanAlbedo.setRGB(0.012, 0.013, 0.014);
    const geo = new PlaneGeometry(2 * halfW, 2 * halfD);
    geo.rotateX(-Math.PI / 2);
    const mat = new MeshPhysicalMaterial({ color: new Color(0.014, 0.016, 0.017), roughness: 0.12, metalness: 0, ior: 1.52, specularIntensity: 1 });
    applyUnderwater(mat);
    const mesh = new Mesh(geo, mat);
    mesh.position.y = 0.0005;
    mesh.name = 'env.substrate.bare';
    mesh.receiveShadow = true;
    mesh.userData.castShadow = false;
    this.group.add(mesh);
    this.meshes.push(mesh);
  }

  private clear(): void {
    for (const m of this.meshes) {
      m.geometry.dispose();
      (m.material as MeshStandardMaterial).dispose(); // textures are cached and shared
      m.removeFromParent();
    }
    this.meshes.length = 0;
  }

  get currentKind(): SubstrateKind | null {
    return this.kind;
  }

  dispose(): void {
    this.clear();
  }
}
