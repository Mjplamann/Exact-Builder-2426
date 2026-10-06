import { AdditiveBlending, BufferAttribute, BufferGeometry, Points, ShaderMaterial, Vector3 } from 'three';
import { Rng } from '../../core/rng';
import { UW_PARS_GLSL, uwUniforms } from './glsl';
import { FX_LAYER } from './TankShell';

/**
 * Suspended particulates: a few hundred specks of detritus and micro-plankton (0.05–0.3 mm)
 * drifting with the filter current, sinking slowly (~0.5 mm/s) and wandering by turbulent
 * diffusion. Entirely GPU-animated (no per-frame CPU work): positions wrap inside the water
 * volume, faded near the walls so the wrap is invisible. They are only visible where light
 * catches them (in the shafts) and blur into soft discs when close to the eye (out of focus).
 */
export class Motes {
  readonly points: Points<BufferGeometry, ShaderMaterial>;
  private material: ShaderMaterial;
  /** CPU-integrated drift (so changing current never makes motes jump). */
  private drift = new Vector3();

  constructor() {
    this.material = new ShaderMaterial({
      name: 'env.motes',
      uniforms: {
        ...uwUniforms(),
        uDrift: { value: this.drift },
        uPixelScale: { value: 800 },
        uFocusDist: { value: 1.2 },
        uVisibility: { value: 1 },
      },
      vertexShader: /* glsl */ `
        #define UW_VERTEX
        ${UW_PARS_GLSL}
        attribute vec4 aSeed;
        uniform vec3 uDrift;
        uniform float uPixelScale;
        uniform float uFocusDist;
        uniform float uVisibility;
        varying vec3 vColor;
        varying float vAlpha;
        void main() {
          vec3 lo = vec3(-uwTankHalf.x, 0.0, -uwTankHalf.z) + 0.01;
          vec3 size = vec3(2.0 * uwTankHalf.x, uwSurfaceY, 2.0 * uwTankHalf.z) - 0.02;
          float t = uwTime;
          float s = aSeed.w * 6.2831853;
          // Turbulent wander: a few mm on 5–20 s time scales.
          vec3 wander = vec3(
            sin(t * 0.31 + s) + 0.6 * sin(t * 0.77 + s * 3.1),
            0.7 * sin(t * 0.23 + s * 2.3) + 0.4 * sin(t * 0.61 + s * 5.7),
            sin(t * 0.27 + s * 1.7) + 0.6 * sin(t * 0.69 + s * 4.3)) * 0.004;
          vec3 p = lo + aSeed.xyz * size + uDrift * (0.6 + 0.8 * aSeed.w) + wander;
          p = lo + mod(p - lo, size);
          vec4 mv = viewMatrix * vec4(p, 1.0);
          gl_Position = projectionMatrix * mv;
          // Apparent distance (the projection includes the refraction at the front glass).
          float dist = gl_Position.w;
          // Physical size 0.05–0.3 mm → sub-pixel; draw ≥1.2 px and spread energy when larger.
          float sizeM = mix(0.00005, 0.0003, aSeed.w * aSeed.w);
          float px = sizeM * uPixelScale / dist;
          // Circle of confusion (shallow depth of field of the eye/lens focused mid-tank).
          float coc = abs(dist - uFocusDist) / dist * uPixelScale * 0.0045;
          float ps = max(1.2, px + coc);
          gl_PointSize = ps;
          float energy = max(px, 1.0) * max(px, 1.0) / (ps * ps);
          // Light: catches the shafts; a faint glow from the ambient water light.
          float depth = uwSurfaceY - p.y;
          // Specks flare where they drift through a light beam (that is what makes beams visible).
          float beam = uwBeams(p);
          vec3 lamp = uwLightColor * uwDaylight + vec3(0.1, 0.24, 1.0) * uwMoonlight * 0.2;
          vec3 lit = lamp * uwDepthAtten(depth) * (0.25 + 2.5 * beam) + uwVeilColor * 1.5;
          // Fade near walls, floor and surface so wrapping is never seen.
          vec3 e = min(p - lo, lo + size - p);
          float edge = smoothstep(0.0, 0.03, min(min(e.x, e.y), e.z));
          vColor = lit * uwTransmittance(p);
          vAlpha = energy * edge * uVisibility * (0.35 + 0.65 * fract(aSeed.w * 7.31));
        }`,
      fragmentShader: /* glsl */ `
        varying vec3 vColor;
        varying float vAlpha;
        void main() {
          vec2 c = gl_PointCoord * 2.0 - 1.0;
          float r2 = dot(c, c);
          if (r2 > 1.0) discard;
          float a = vAlpha * (1.0 - r2) * (1.0 - r2);
          gl_FragColor = vec4(vColor * a * 0.6, 1.0);
          #include <tonemapping_fragment>
          #include <colorspace_fragment>
        }`,
      transparent: true,
      depthWrite: false,
      blending: AdditiveBlending,
    });
    this.points = new Points(new BufferGeometry(), this.material);
    this.points.layers.set(FX_LAYER);
    this.points.frustumCulled = false;
    this.points.renderOrder = 6;
    this.points.name = 'env.motes';
    this.points.userData.castShadow = false;
    this.setCount(300);
  }

  setCount(n: number): void {
    const rng = new Rng(4242);
    const seeds = new Float32Array(n * 4);
    for (let i = 0; i < n * 4; i++) seeds[i] = rng.next();
    const geo = new BufferGeometry();
    geo.setAttribute('aSeed', new BufferAttribute(seeds, 4));
    // Points need a position attribute for the draw range; values are unused.
    geo.setAttribute('position', new BufferAttribute(new Float32Array(n * 3), 3));
    this.points.geometry.dispose();
    this.points.geometry = geo;
    this.points.visible = n > 0;
  }

  /**
   * @param current filter current (xz, m/s)
   * @param cloudiness 0 crystal clear .. 1 cloudy (more and brighter motes)
   * @param pixelScale drawing-buffer height / (2·tan(fov/2)) — projects meters at 1 m to pixels
   */
  update(dt: number, cx: number, cz: number, cloudiness: number, pixelScale: number, focusDist: number): void {
    // Motes ride the bulk flow at a fraction of the outflow speed, and settle slowly.
    this.drift.x += cx * 0.3 * dt;
    this.drift.z += cz * 0.3 * dt;
    this.drift.y -= 0.0005 * dt;
    const u = this.material.uniforms;
    u.uPixelScale.value = pixelScale;
    u.uFocusDist.value = focusDist;
    u.uVisibility.value = 0.55 + cloudiness * 2.5;
  }

  dispose(): void {
    this.points.geometry.dispose();
    this.material.dispose();
  }
}
