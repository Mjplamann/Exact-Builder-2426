import { AdditiveBlending, BufferAttribute, BufferGeometry, DoubleSide, Mesh, ShaderMaterial } from 'three';
import type { TankState } from '../../core/types';
import { tankBounds } from '../../core/tankGeometry';
import { NOISE_GLSL, UW_PARS_GLSL, uwUniforms } from './glsl';
import { FX_LAYER } from './TankShell';

/**
 * Soft light shafts slanting down from the surface: a stack of additive slices parallel to the
 * front glass. Each fragment looks up the shaft field where its light ray crossed the surface
 * (`uwShaft`), so consecutive slices agree and the streaks read as volumes aligned with the
 * light. Strongest just under the surface, fading with depth, only in daylight, and scaled by
 * how much suspended matter there is to scatter light (turbidity).
 */
export class GodRays {
  readonly mesh: Mesh<BufferGeometry, ShaderMaterial>;
  private material: ShaderMaterial;
  private slices = 8;
  private tank: TankState | null = null;

  constructor() {
    this.material = new ShaderMaterial({
      name: 'env.godRays',
      uniforms: { ...uwUniforms(), uSliceGain: { value: 1 / 8 }, uIntensity: { value: 1 } },
      vertexShader: /* glsl */ `
        varying vec3 vWorld;
        void main() {
          vec4 wp = modelMatrix * vec4(position, 1.0);
          vWorld = wp.xyz;
          gl_Position = projectionMatrix * viewMatrix * wp;
        }`,
      fragmentShader: /* glsl */ `
        ${UW_PARS_GLSL}
        ${NOISE_GLSL}
        uniform float uSliceGain;
        uniform float uIntensity;
        varying vec3 vWorld;
        void main() {
          vec3 p = vWorld;
          float depth = uwSurfaceY - p.y;
          float light = uwDaylight + uwMoonlight * 0.05;
          if (depth <= 0.0 || light <= 0.002) discard;
          float s = uwShaft(p, 2.1);
          // Streaks: only the brightest part of the (blurred) field — a few soft, distinct shafts,
          // not a curtain.
          float streak = pow(max(s - 1.3, 0.0), 1.6) * 3.0;
          // Shafts come and go in broad patches.
          vec2 sA = uwSurfaceEntry(p, uwLightDir);
          float patchy = smoothstep(0.35, 0.85, uwNoise(sA * 2.6 + vec2(uwTime * 0.021, -uwTime * 0.013)));
          // Depth: develop over the first cm, fade over ~25 cm (scattered + spread out).
          float fade = smoothstep(0.0, 0.02, depth) * exp(-depth / 0.25);
          // Keep clear of the glass walls.
          float edge = smoothstep(0.0, 0.03, uwTankHalf.x - abs(p.x)) * smoothstep(0.0, 0.02, uwTankHalf.z - abs(p.z));
          float scatter = 0.35 + uwTurbidity * 2.5;
          vec3 lamp = uwLightColor * uwDaylight + vec3(0.1, 0.24, 1.0) * uwMoonlight * 0.05;
          vec3 col = lamp * uwWaterTint * streak * patchy * fade * edge * scatter * uSliceGain * uIntensity * 0.018;
          col *= uwTransmittance(p);
          gl_FragColor = vec4(col, 1.0);
          #include <tonemapping_fragment>
          #include <colorspace_fragment>
        }`,
      transparent: true,
      depthWrite: false,
      blending: AdditiveBlending,
      side: DoubleSide,
    });
    this.mesh = new Mesh(new BufferGeometry(), this.material);
    this.mesh.layers.set(FX_LAYER);
    this.mesh.renderOrder = 5;
    this.mesh.frustumCulled = false;
    this.mesh.name = 'env.godRays';
    this.mesh.userData.castShadow = false;
  }

  setSlices(n: number): void {
    this.slices = n;
    this.mesh.visible = n > 0;
    if (this.tank) this.build(this.tank);
  }

  build(tank: TankState): void {
    this.tank = tank;
    const n = this.slices;
    const b = tankBounds(tank);
    const pos = new Float32Array(Math.max(1, n) * 4 * 3);
    const idx: number[] = [];
    for (let i = 0; i < n; i++) {
      // Slices spread over the depth with a little jitter so they never line up with the camera.
      const z = -b.halfD * 0.92 + ((i + 0.5) / n) * b.halfD * 1.84;
      const v = i * 4;
      pos.set([-b.halfW, 0, z, b.halfW, 0, z, b.halfW, b.surfaceY, z, -b.halfW, b.surfaceY, z], v * 3);
      idx.push(v, v + 1, v + 2, v, v + 2, v + 3);
    }
    this.mesh.geometry.dispose();
    const geo = new BufferGeometry();
    geo.setAttribute('position', new BufferAttribute(pos, 3));
    geo.setIndex(idx);
    this.mesh.geometry = geo;
    // Normalize so the total brightness does not depend on the slice count.
    this.material.uniforms.uSliceGain.value = n > 0 ? 6 / n : 0;
  }

  setIntensity(k: number): void {
    this.material.uniforms.uIntensity.value = k;
  }

  dispose(): void {
    this.mesh.geometry.dispose();
    this.material.dispose();
  }
}
