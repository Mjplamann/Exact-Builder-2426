import {
  AdditiveBlending,
  BufferAttribute,
  DoubleSide,
  InstancedBufferAttribute,
  InstancedBufferGeometry,
  Matrix4,
  Mesh,
  ShaderMaterial,
  type DirectionalLight,
  type Texture,
} from 'three';
import type { TankState } from '../../core/types';
import { tankBounds } from '../../core/tankGeometry';
import { Rng } from '../../core/rng';
import { UW_PARS_GLSL, uwUniforms } from './glsl';
import { FX_LAYER } from './TankShell';

/** Segments along each beam (its length fade and widening are smooth at this count). */
const SEGMENTS = 10;

/**
 * Light beams ("god rays"): a handful of soft, slanted shafts streaming down from points where
 * the surface ripples focus the lamp's light, each living ~10–20 s (fading in, drifting with the
 * surface current, fading out) before reappearing elsewhere.
 *
 * Geometry: each beam is a camera-facing ribbon (instanced, fully animated on the GPU — no CPU
 * work per frame). Its axis is the line from the fixture's virtual source (a lamp h above the
 * water appears n·h above it from below) through the surface point, so beams fan out and slant
 * away from the emitters like real shafts. A beam is a few mm wide where it leaves the surface
 * and widens and fades with depth (energy spreads; light is scattered out of it); it flickers
 * with the ripple focusing above it, is shadowed by leaves/wood under the lamp, fades out
 * toward the back glass and scales with suspended matter (turbidity). Being real geometry it is
 * depth-tested against the scene: plants and fish in front hide it; it never paints the backdrop
 * as a uniform curtain.
 */
export class GodRays {
  readonly mesh: Mesh<InstancedBufferGeometry, ShaderMaterial>;
  private material: ShaderMaterial;
  private count = 24;
  private shadowMatrix = new Matrix4();

  constructor() {
    this.material = new ShaderMaterial({
      name: 'env.godRays',
      uniforms: {
        ...uwUniforms(),
        uIntensity: { value: 1 },
        uShadowMap: { value: null as Texture | null },
        uShadowMatrix: { value: this.shadowMatrix },
        uUseShadow: { value: 0 },
      },
      vertexShader: /* glsl */ `
        #define UW_VERTEX
        ${UW_PARS_GLSL}
        attribute vec4 aSeed;      // per-beam random numbers
        attribute float aIndex;
        uniform float uIntensity;
        varying vec3 vWorld;
        varying vec2 vRib;         // x: −1..1 across, y: distance along the beam (m)
        varying float vLen;
        varying float vI;
        varying float vW;

        vec2 hash22(vec2 p) {
          vec3 p3 = fract(vec3(p.xyx) * vec3(0.1031, 0.1030, 0.0973));
          p3 += dot(p3, p3.yzx + 33.33);
          return fract((p3.xx + p3.yz) * p3.zy);
        }

        void main() {
          // Life cycle: each beam lives one period, then reappears at a new random spot.
          float period = mix(10.0, 19.0, aSeed.x);
          float tt = uwTime / period + aSeed.y;
          float cycle = floor(tt);
          float ph = fract(tt);
          vec2 h = hash22(vec2(aIndex * 7.13 + 1.7, cycle * 3.71 + aSeed.z * 13.0));
          vec2 h2 = hash22(vec2(cycle * 1.31 + 0.5, aIndex * 2.9 + aSeed.w * 17.0));
          float life = smoothstep(0.0, 0.3, ph) * (1.0 - smoothstep(0.62, 1.0, ph));

          // Surface spot (drifts with the current over its life).
          vec2 lim = vec2(uwTankHalf.x - 0.05, uwTankHalf.z);
          vec2 anchor = vec2((h.x * 2.0 - 1.0) * lim.x, mix(-lim.y + 0.06, lim.y - 0.03, h.y));
          anchor += uwCurrent * (ph * period * 0.25);
          // The LED emitter that feeds this beam: somewhere along the bar (which spans ~85% of
          // the tank), usually not straight above the spot — so beams slant by different angles,
          // like the crossing shafts under a real multi-emitter fixture. Seen from below, a lamp
          // h ≈ 25 cm above the water appears n·h up.
          const float HV = 0.34;
          float ex = clamp(anchor.x + (h2.x - 0.5) * 0.5, -0.85 * uwTankHalf.x, 0.85 * uwTankHalf.x);
          vec3 src = vec3(ex, uwSurfaceY + HV, 0.25 * uwTankHalf.z);
          vec3 top = vec3(anchor.x, uwSurfaceY - 0.002, anchor.y);
          vec3 dir = normalize(top - src);

          // Length: fades over ~15–35 cm, never into the substrate.
          float len = min(mix(0.14, 0.36, h2.y), (uwSurfaceY - 0.06) * 0.8);
          float s = position.y * len;
          vec3 P = top + dir * s;
          // Width: a few mm to ~1.5 cm at the surface, spreading with depth.
          float w0 = mix(0.003, 0.014, aSeed.z * aSeed.z);
          float w = w0 + s * mix(0.04, 0.09, h.x);
          vec3 V = normalize(P - uwCameraPos);
          vec3 across = normalize(cross(dir, V));
          P += across * position.x * w * 2.2;

          // Flicker with the ripple focusing above the spot; brighter where the lens is strong.
          float f = textureLod(uwCausticMap, anchor * (1.0 / 0.23) + uwCausticDrift.xy * 0.3, 2.0).g / UW_CAUSTIC_MEAN;
          float focus = 0.35 + 0.65 * smoothstep(0.6, 1.6, f);
          // Fewer, stronger beams: a wide spread of strengths; fade toward the back glass.
          float strength = mix(0.25, 1.0, aSeed.w * aSeed.w);
          float back = smoothstep(0.04, 0.22, anchor.y + uwTankHalf.z);
          float edge = smoothstep(0.0, 0.05, uwTankHalf.x - abs(P.x));
          // Energy conservation across the widening: intensity ∝ w0 / w.
          vI = life * focus * strength * back * edge * (w0 / w) * uIntensity;
          vRib = vec2(position.x, s);
          vLen = len;
          vW = w;
          vWorld = P;
          gl_Position = projectionMatrix * viewMatrix * vec4(P, 1.0);
        }`,
      fragmentShader: /* glsl */ `
        ${UW_PARS_GLSL}
        uniform sampler2D uShadowMap;
        uniform mat4 uShadowMatrix;
        uniform float uUseShadow;
        varying vec3 vWorld;
        varying vec2 vRib;
        varying float vLen;
        varying float vI;
        varying float vW;
        void main() {
          float light = uwDaylight + uwMoonlight * 0.05;
          if (vI <= 1e-4 || light <= 0.002) discard;
          // Soft Gaussian profile across, short fade-in under the surface, exponential fade along.
          float across = exp(-vRib.x * vRib.x * 4.8);
          float along = smoothstep(0.0, 0.035, vRib.y) * exp(-vRib.y / (vLen * 0.5)) * (1.0 - smoothstep(0.7, 1.0, vRib.y / vLen));
          float lit = 1.0;
          if (uUseShadow > 0.5) {
            vec4 sc = uShadowMatrix * vec4(vWorld, 1.0);
            sc.xyz /= sc.w;
            if (sc.x > 0.0 && sc.x < 1.0 && sc.y > 0.0 && sc.y < 1.0) lit = mix(1.0, step(sc.z - 0.004, texture2D(uShadowMap, sc.xy).r), 0.92);
          }
          float scatter = 0.3 + uwTurbidity * 2.2;
          vec3 lamp = uwLightColor * uwDaylight + vec3(0.1, 0.24, 1.0) * uwMoonlight * 0.05;
          vec3 col = lamp * uwWaterTint * (across * along * vI * lit * scatter * 0.38);
          col *= uwTransmittance(vWorld);
          gl_FragColor = vec4(col, 1.0);
          #include <tonemapping_fragment>
          #include <colorspace_fragment>
        }`,
      transparent: true,
      depthWrite: false,
      blending: AdditiveBlending,
      side: DoubleSide,
    });
    this.mesh = new Mesh(new InstancedBufferGeometry(), this.material);
    this.mesh.layers.set(FX_LAYER);
    this.mesh.renderOrder = 5;
    this.mesh.frustumCulled = false;
    this.mesh.name = 'env.godRays';
    this.mesh.userData.castShadow = false;
    this.rebuild();
  }

  /** Number of beams alive at once (quality). 0 disables them. */
  setSlices(n: number): void {
    this.count = Math.max(0, Math.round(n));
    this.mesh.visible = this.count > 0;
    this.rebuild();
  }

  /** Beams adapt to the tank in the shader; nothing to rebuild per tank. */
  build(tank: TankState): void {
    void tankBounds(tank);
  }

  private rebuild(): void {
    const n = Math.max(1, this.count);
    // Ribbon: (SEGMENTS + 1) × 2 vertices, x = −1/1 across, y = 0..1 along.
    const pos = new Float32Array((SEGMENTS + 1) * 2 * 3);
    const idx: number[] = [];
    for (let i = 0; i <= SEGMENTS; i++) {
      const y = Math.pow(i / SEGMENTS, 1.4); // denser near the surface where the beam is bright
      pos.set([-1, y, 0, 1, y, 0], i * 6);
      if (i < SEGMENTS) {
        const a = i * 2;
        idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2);
      }
    }
    const rng = new Rng(7311);
    const seeds = new Float32Array(n * 4);
    const index = new Float32Array(n);
    for (let i = 0; i < n; i++) {
      for (let k = 0; k < 4; k++) seeds[i * 4 + k] = rng.next();
      index[i] = i;
    }
    const geo = new InstancedBufferGeometry();
    geo.setAttribute('position', new BufferAttribute(pos, 3));
    geo.setIndex(idx);
    geo.setAttribute('aSeed', new InstancedBufferAttribute(seeds, 4));
    geo.setAttribute('aIndex', new InstancedBufferAttribute(index, 1));
    geo.instanceCount = this.count;
    this.mesh.geometry.dispose();
    this.mesh.geometry = geo;
  }

  setIntensity(k: number): void {
    this.material.uniforms.uIntensity.value = k;
  }

  /** Per frame: the key light's shadow map for beam occlusion (disabled when shadows are off). */
  setShadow(light: DirectionalLight, enabled: boolean): void {
    const u = this.material.uniforms;
    const tex = light.shadow.map?.depthTexture ?? null;
    u.uUseShadow.value = enabled && tex ? 1 : 0;
    u.uShadowMap.value = tex;
    this.shadowMatrix.copy(light.shadow.matrix);
  }

  dispose(): void {
    this.mesh.geometry.dispose();
    this.material.dispose();
  }
}
