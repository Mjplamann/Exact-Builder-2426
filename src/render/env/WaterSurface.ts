import {
  HalfFloatType,
  LinearFilter,
  Matrix4,
  Mesh,
  PerspectiveCamera,
  Plane,
  PlaneGeometry,
  ShaderMaterial,
  Vector2,
  Vector3,
  Vector4,
  WebGLRenderTarget,
  type Scene,
  type WebGLRenderer,
} from 'three';
import type { TankState } from '../../core/types';
import { tankBounds } from '../../core/tankGeometry';
import { GLOBALS } from '../globals';
import { NOISE_GLSL, UW_PARS_GLSL, uwUniforms } from './glsl';
import { FX_LAYER } from './TankShell';

/** Max simultaneous ring ripples (bubble pops, food landing). */
const MAX_RIPPLES = 24;
/** Max airstone "boil" zones. */
const MAX_BOILS = 4;

/**
 * The underside of the water surface, seen from below through the front glass at a grazing
 * angle. Beyond the critical angle (48.6° from the normal) water→air reflection is total, so the
 * band at the top of the tank is a rippling mirror of the tank itself: here a real planar
 * reflection (scene re-rendered from the mirrored camera, cropped to the band's rows so only
 * the visible part costs anything). Where steep ripples tilt the surface into the Snell window,
 * the bright lamp-lit air flashes through — the sparkle of a live surface.
 */
export class WaterSurface {
  readonly mesh: Mesh<PlaneGeometry, ShaderMaterial>;
  private material: ShaderMaterial;
  private target: WebGLRenderTarget | null = null;
  private mirrorCam = new PerspectiveCamera();
  private textureMatrix = new Matrix4();
  private ripples: Vector4[] = [];
  private rippleHead = 0;
  private boils: Vector4[] = [];
  private scale = 0;
  private time = 0;

  // scratch
  private v3 = new Vector3();
  private v3b = new Vector3();
  private plane = new Plane();
  private clip = new Vector4();
  private q = new Vector4();
  private ndc = new Vector3();
  private drawSize = new Vector2();

  constructor() {
    for (let i = 0; i < MAX_RIPPLES; i++) this.ripples.push(new Vector4(0, 0, -100, 0));
    for (let i = 0; i < MAX_BOILS; i++) this.boils.push(new Vector4(0, 0, 0.05, 0));
    this.material = new ShaderMaterial({
      name: 'env.waterSurface',
      uniforms: {
        ...uwUniforms(),
        uRefl: { value: null },
        uReflMatrix: { value: this.textureMatrix },
        uHasRefl: { value: 0 },
        uRipples: { value: this.ripples },
        uBoils: { value: this.boils },
        uAgitation: { value: 1 },
        uWaveTime: { value: 0 },
      },
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
        uniform sampler2D uRefl;
        uniform mat4 uReflMatrix;
        uniform float uHasRefl;
        uniform vec4 uRipples[${MAX_RIPPLES}];
        uniform vec4 uBoils[${MAX_BOILS}];
        uniform float uAgitation;
        uniform float uWaveTime;
        varying vec3 vWorld;

        // Capillary–gravity ripple: slope of A·sin(k·x − ωt), ω² = g k + (σ/ρ) k³.
        vec2 wave(vec2 x, vec2 dir, float lambda, float amp, float t) {
          float k = 6.2831853 / lambda;
          float w = sqrt(9.81 * k + 7.3e-5 * k * k * k);
          float ph = dot(dir, x) * k - w * t;
          return dir * (amp * k * cos(ph));
        }

        // Surface slope (dh/dx, dh/dz).
        vec2 slope(vec2 x) {
          float t = uWaveTime;
          vec2 cur = length(uwCurrent) > 1e-4 ? normalize(uwCurrent) : vec2(1.0, 0.0);
          vec2 perp = vec2(-cur.y, cur.x);
          float a = uAgitation;
          vec2 g = vec2(0.0);
          // Wind-free tank: ripples come from the filter outflow (mostly downstream) and reflections off the glass.
          g += wave(x, normalize(cur + perp * 0.3), 0.071, 0.00055 * a, t);
          g += wave(x, normalize(cur - perp * 0.5), 0.043, 0.0003 * a, t);
          g += wave(x, normalize(perp + cur * 0.2), 0.057, 0.00025 * a, t);
          g += wave(x, normalize(-cur + perp * 0.7), 0.029, 0.00014 * a, t);
          g += wave(x, normalize(cur * 0.6 - perp), 0.019, 0.00008 * a, t);
          // Small-scale chop.
          vec2 n = x * 38.0 + cur * t * 0.6;
          g += (vec2(uwNoise(n), uwNoise(n + 17.3)) - 0.5) * 0.05 * a;
          // Airstone boil: a churning patch where the bubble curtain breaks the surface.
          for (int i = 0; i < ${MAX_BOILS}; i++) {
            vec4 b = uBoils[i];
            if (b.w <= 0.0) continue;
            vec2 d = x - b.xy;
            float f = exp(-dot(d, d) / (b.z * b.z));
            vec2 m = x * 90.0 + vec2(t * 3.1, -t * 2.3);
            g += (vec2(uwNoise(m), uwNoise(m + 31.7)) - 0.5) * 0.5 * f * b.w;
            g += d / max(length(d), 1e-3) * f * 0.06 * b.w * sin(length(d) * 260.0 - t * 30.0);
          }
          // Ring ripples (pops, food landing): a damped packet expanding at ~0.23 m/s.
          for (int i = 0; i < ${MAX_RIPPLES}; i++) {
            vec4 r = uRipples[i];
            float age = uwTime - r.z;
            if (age < 0.0 || age > 2.5 || r.w <= 0.0) continue;
            vec2 d = x - r.xy;
            float dist = length(d);
            float front = 0.012 + 0.23 * age;
            float s = dist - front;
            float env = exp(-s * s / 0.00012) * exp(-age * 2.2) / (1.0 + dist * 25.0);
            g += d / max(dist, 1e-4) * env * r.w * cos(s * 420.0) * 1.6;
          }
          return g;
        }

        void main() {
          vec3 p = vWorld;
          vec2 g = slope(p.xz);
          vec3 n = normalize(vec3(-g.x, 1.0, -g.y));        // up-facing surface normal
          vec3 V = normalize(p - uwCameraPos);               // from eye toward the surface (upward)
          float cosI = abs(dot(V, n));
          float sinI = sqrt(max(0.0, 1.0 - cosI * cosI));
          // Water→air: total internal reflection beyond sin θ = 1/1.333.
          float tir = smoothstep(0.735, 0.765, sinI);
          // Fresnel inside the Snell window (rarely seen from the front).
          float r0 = 0.02;
          float fres = r0 + (1.0 - r0) * pow(1.0 - cosI, 5.0);
          float refl = max(tir, fres);

          vec3 lamp = uwLightColor * uwDaylight + vec3(0.1, 0.24, 1.0) * uwMoonlight * 0.25;
          vec3 T = uwTransmittance(p);
          // Slope along the view direction tips the mirror toward brighter (upper, lit) or darker
          // (deeper) water: the rippling light/dark banding of a live TIR band.
          vec2 vxz = normalize(V.xz + 1e-5);
          float tilt = dot(g, vxz);
          vec3 mirrored;
          if (uHasRefl > 0.5) {
            vec4 rp = uReflMatrix * vec4(p, 1.0);
            // Ripples smear the mirror image mostly vertically (the band is seen nearly edge-on).
            vec2 ruv = rp.xy / rp.w + g * vec2(0.012, 0.09);
            mirrored = texture2D(uRefl, ruv).rgb;
          } else {
            // Without a reflection pass: the mirrored upper water column (veil, brighter near the front).
            float near = clamp((p.z + uwTankHalf.z) / (2.0 * uwTankHalf.z), 0.0, 1.0);
            mirrored = uwVeil(uwVeilColor * (0.6 + 0.5 * near) + lamp * 0.02, p);
          }
          mirrored *= clamp(1.0 + tilt * 2.2, 0.7, 1.35);
          // Lamp-lit air through the Snell window (only where steep ripples open it).
          vec3 sky = T * (lamp * 1.6 + uwVeilColor);
          vec3 col = mix(sky, mirrored, refl);
          // The surface's own shimmer: light focused by the ripples right at the surface film,
          // seen as thin bright moving lines on the silver band.
          float lines = texture2D(uwCausticMap, p.xz * vec2(1.0 / 0.16, 1.0 / 0.09) + uwCausticDrift.xy * 1.2).r / UW_CAUSTIC_MEAN;
          float shimmer = pow(max(lines - 1.6, 0.0), 1.5);
          col += T * (lamp * (0.008 + 0.006 * shimmer) + uwVeilColor * (0.12 + 0.05 * shimmer));
          gl_FragColor = vec4(col, 1.0);
          #include <tonemapping_fragment>
          #include <colorspace_fragment>
        }`,
    });
    this.mesh = new Mesh(new PlaneGeometry(1, 1), this.material);
    this.mesh.rotation.x = Math.PI / 2; // normal points down, toward the viewer below
    this.mesh.layers.set(FX_LAYER);
    this.mesh.name = 'env.waterSurface';
    this.mesh.userData.castShadow = false;
  }

  build(tank: TankState): void {
    const b = tankBounds(tank);
    this.mesh.geometry.dispose();
    this.mesh.geometry = new PlaneGeometry(2 * b.halfW, 2 * b.halfD);
    this.mesh.position.set(0, b.surfaceY, 0);
    this.mesh.updateMatrixWorld();
  }

  /** Render-target scale relative to the screen (0 disables the real reflection). */
  setReflectionScale(scale: number): void {
    this.scale = scale;
    if (scale <= 0 && this.target) {
      this.target.dispose();
      this.target = null;
    }
    this.material.uniforms.uHasRefl.value = 0;
  }

  /** Start a ring ripple at (x, z) with a relative strength (1 ≈ a pellet landing). */
  addRipple(x: number, z: number, strength: number): void {
    const r = this.ripples[this.rippleHead];
    r.set(x, z, GLOBALS.uTime.value, strength);
    this.rippleHead = (this.rippleHead + 1) % MAX_RIPPLES;
  }

  /** Airstone boil zones: (x, z, radius, strength) for up to 4 stones; unused set w = 0. */
  setBoil(i: number, x: number, z: number, radius: number, strength: number): void {
    if (i < MAX_BOILS) this.boils[i].set(x, z, radius, strength);
  }

  update(dt: number, agitation: number): void {
    this.time += dt;
    this.material.uniforms.uWaveTime.value = this.time;
    this.material.uniforms.uAgitation.value = agitation;
  }

  /**
   * Render the mirrored scene for the visible band of the surface. Call before the main render;
   * temporarily moves GLOBALS.uCameraPos to the mirrored eye and lifts uVeilCeiling so materials
   * compute the full folded water path (object → surface → front glass).
   */
  renderReflection(renderer: WebGLRenderer, scene: Scene, camera: PerspectiveCamera, surfaceY: number, halfW: number, halfD: number): void {
    const u = this.material.uniforms;
    if (this.scale <= 0) {
      u.uHasRefl.value = 0;
      return;
    }
    // Screen rows covered by the surface rectangle.
    let yMin = Infinity, yMax = -Infinity;
    for (let i = 0; i < 4; i++) {
      this.ndc.set(i & 1 ? halfW : -halfW, surfaceY, i & 2 ? halfD : -halfD).project(camera);
      if (this.ndc.z > 1) continue;
      yMin = Math.min(yMin, this.ndc.y);
      yMax = Math.max(yMax, this.ndc.y);
    }
    yMin = Math.max(-1, yMin - 0.04);
    yMax = Math.min(1, yMax + 0.02);
    if (!(yMax > yMin)) {
      u.uHasRefl.value = 0;
      return;
    }
    const size = renderer.getDrawingBufferSize(this.drawSize);
    const fullW = Math.max(1, Math.floor(size.x));
    const fullH = Math.max(1, Math.floor(size.y));
    // Band height in pixels (bucketed so the target is rarely reallocated).
    const bandPx = Math.ceil(((yMax - yMin) / 2) * fullH / 32) * 32;
    const tw = Math.max(16, Math.round(fullW * this.scale));
    const th = Math.max(16, Math.round(bandPx * this.scale));
    if (!this.target || this.target.width !== tw || this.target.height !== th) {
      this.target?.dispose();
      this.target = new WebGLRenderTarget(tw, th, { type: HalfFloatType, magFilter: LinearFilter, minFilter: LinearFilter, generateMipmaps: false });
      this.target.texture.name = 'env.surfaceReflection';
      u.uRefl.value = this.target.texture;
    }
    const topPx = Math.max(0, Math.floor(((1 - yMax) / 2) * fullH));

    // Mirror camera (proper rotation; image is flipped in x only, rows are unchanged).
    const mc = this.mirrorCam;
    mc.fov = camera.fov;
    mc.aspect = camera.aspect;
    mc.near = camera.near;
    mc.far = camera.far;
    mc.layers.set(0);
    const eye = this.v3.setFromMatrixPosition(camera.matrixWorld);
    mc.position.set(eye.x, 2 * surfaceY - eye.y, eye.z);
    const fwd = this.v3b.set(0, 0, -1).transformDirection(camera.matrixWorld);
    fwd.y = -fwd.y;
    mc.up.set(0, 1, 0).transformDirection(camera.matrixWorld);
    mc.up.y = -mc.up.y;
    mc.lookAt(mc.position.x + fwd.x, mc.position.y + fwd.y, mc.position.z + fwd.z);
    mc.setViewOffset(fullW, fullH, 0, topPx, fullW, bandPx);
    mc.updateProjectionMatrix();
    mc.updateMatrixWorld();

    this.textureMatrix.set(0.5, 0, 0, 0.5, 0, 0.5, 0, 0.5, 0, 0, 0.5, 0.5, 0, 0, 0, 1);
    this.textureMatrix.multiply(mc.projectionMatrix).multiply(mc.matrixWorldInverse);

    // Oblique near plane = the water surface (Lengyel), so nothing above it leaks in.
    this.plane.setFromNormalAndCoplanarPoint(this.v3.set(0, -1, 0), this.v3b.set(0, surfaceY, 0));
    this.plane.applyMatrix4(mc.matrixWorldInverse);
    this.clip.set(this.plane.normal.x, this.plane.normal.y, this.plane.normal.z, this.plane.constant);
    const pm = mc.projectionMatrix.elements;
    this.q.set((Math.sign(this.clip.x) + pm[8]) / pm[0], (Math.sign(this.clip.y) + pm[9]) / pm[5], -1, (1 + pm[10]) / pm[14]);
    this.clip.multiplyScalar(2 / this.clip.dot(this.q));
    pm[2] = this.clip.x;
    pm[6] = this.clip.y;
    pm[10] = this.clip.z + 1;
    pm[14] = this.clip.w;
    mc.projectionMatrixInverse.copy(mc.projectionMatrix).invert();

    // Render with the folded-path veil.
    const camPos = GLOBALS.uCameraPos.value;
    const prevCam = this.v3.copy(camPos);
    const prevCeil = GLOBALS.uVeilCeiling.value;
    camPos.copy(mc.position);
    GLOBALS.uVeilCeiling.value = 1e3;
    const prevTarget = renderer.getRenderTarget();
    renderer.setRenderTarget(this.target);
    renderer.render(scene, mc);
    renderer.setRenderTarget(prevTarget);
    camPos.copy(prevCam);
    GLOBALS.uVeilCeiling.value = prevCeil;
    u.uHasRefl.value = 1;
  }

  dispose(): void {
    this.target?.dispose();
    this.mesh.geometry.dispose();
    this.material.dispose();
  }
}
