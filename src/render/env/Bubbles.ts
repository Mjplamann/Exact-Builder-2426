import {
  CustomBlending,
  InstancedBufferAttribute,
  InstancedBufferGeometry,
  Mesh,
  OneFactor,
  OneMinusSrcAlphaFactor,
  PlaneGeometry,
  ShaderMaterial,
  DynamicDrawUsage,
} from 'three';
import type { World } from '../../core/world';
import { tankBounds } from '../../core/tankGeometry';
import { Rng } from '../../core/rng';
import { UW_PARS_GLSL, uwUniforms } from './glsl';

const CAPACITY = 640;
/** Bubbles released per second per air stone (a fine "curtain"). */
const RATE = 45;
/** Atmospheric pressure (Pa), water density, g. */
const P0 = 101325, RHO = 1000, G = 9.81;

/** Terminal rise speed (m/s) of an air bubble of diameter d (m) in tap water (Clift, Grace & Weber). */
function riseSpeed(d: number): number {
  const mm = d * 1000;
  if (mm < 1) return 0.1 * mm; // Stokes-ish regime, contaminated surface
  if (mm < 2) return 0.1 + (mm - 1) * 0.1; // 1 mm ≈ 10 cm/s, 2 mm ≈ 20 cm/s
  if (mm < 3) return 0.2 + (mm - 2) * 0.03; // peaks ≈ 23 cm/s
  return Math.max(0.21, 0.23 - (mm - 3) * 0.01);
}

/**
 * Air-stone bubble streams. CPU-simulated (a few hundred particles), drawn as one instanced
 * draw of camera-facing sprites shaded like real bubbles: a transparent core, a bright rim from
 * total internal reflection at the bubble wall, a lamp catch-light and a focused glint below.
 *
 * Physics: diameters 1–4 mm, terminal rise speed from size, zig-zag/spiral wobble above ~1.5 mm
 * (Strouhal ≈ 0.15), slight growth as the hydrostatic pressure drops, drift with the current,
 * a brief rest at the surface (longer in salt water, which stabilises the film), then a pop
 * that starts a ring ripple on the surface.
 */
export class Bubbles {
  readonly mesh: Mesh<InstancedBufferGeometry, ShaderMaterial>;
  private geo: InstancedBufferGeometry;
  private posR: InstancedBufferAttribute;
  private params: InstancedBufferAttribute;
  // Structure-of-arrays simulation state.
  private n = 0;
  private x = new Float32Array(CAPACITY);
  private y = new Float32Array(CAPACITY);
  private z = new Float32Array(CAPACITY);
  private ox = new Float32Array(CAPACITY);
  private oz = new Float32Array(CAPACITY);
  private r0 = new Float32Array(CAPACITY);
  private y0 = new Float32Array(CAPACITY);
  private phase = new Float32Array(CAPACITY);
  private freq = new Float32Array(CAPACITY);
  private amp = new Float32Array(CAPACITY);
  private spiral = new Uint8Array(CAPACITY);
  /** 0 rising, 1 resting at the surface, 2 popped ring. */
  private state = new Uint8Array(CAPACITY);
  private timer = new Float32Array(CAPACITY);
  private emitAcc: number[] = [];
  private rng = new Rng(9001);
  /** Called when a bubble pops: (x, z, strength). */
  onPop: ((x: number, z: number, strength: number) => void) | null = null;
  /** Airstones found this frame: x, z, count (for surface boil). */
  readonly stones: { x: number; z: number }[] = [];
  private stonePool: { x: number; z: number }[] = [];

  constructor() {
    const quad = new PlaneGeometry(2, 2);
    this.geo = new InstancedBufferGeometry();
    this.geo.index = quad.index;
    this.geo.setAttribute('position', quad.getAttribute('position'));
    this.geo.setAttribute('uv', quad.getAttribute('uv'));
    this.posR = new InstancedBufferAttribute(new Float32Array(CAPACITY * 4), 4).setUsage(DynamicDrawUsage);
    this.params = new InstancedBufferAttribute(new Float32Array(CAPACITY * 4), 4).setUsage(DynamicDrawUsage);
    this.geo.setAttribute('aPosR', this.posR);
    this.geo.setAttribute('aParams', this.params);
    this.geo.instanceCount = 0;
    const material = new ShaderMaterial({
      name: 'env.bubbles',
      uniforms: { ...uwUniforms(), uPixelScale: { value: 800 } },
      vertexShader: /* glsl */ `
        attribute vec4 aPosR;     // xyz, radius (m)
        attribute vec4 aParams;   // kind (0 bubble, 1 ring), age01, alpha, wobble squash
        uniform float uPixelScale;
        varying vec2 vUv;
        varying vec4 vParams;
        varying vec3 vWorld;
        varying float vSmall;
        void main() {
          vUv = position.xy;
          vParams = aParams;
          vWorld = aPosR.xyz;
          vec4 mv = viewMatrix * vec4(aPosR.xyz, 1.0);
          float r = aPosR.w;
          vec2 corner = position.xy;
          if (aParams.x > 0.5) {
            // Ring lying on the surface, seen from below at a grazing angle: a flat ellipse.
            r *= 1.0 + aParams.y * 5.0;
            corner.y *= 0.22;
          } else {
            // Larger bubbles are oblate and wobble.
            corner.y *= 1.0 - aParams.w;
          }
          // Sub-pixel bubbles: draw at least ~1.6 px and spread their light (no shimmering).
          float rpx = r * uPixelScale / max(-mv.z, 0.01);
          float grow = max(1.0, 1.6 / max(rpx, 1e-3));
          vSmall = clamp((3.0 - rpx) / 2.0, 0.0, 1.0);
          vParams.z /= grow; // (not grow²: glints and bloom make tiny bubbles read brighter than their area)
          mv.xy += corner * r * grow;
          gl_Position = projectionMatrix * mv;
        }`,
      fragmentShader: /* glsl */ `
        ${UW_PARS_GLSL}
        varying vec2 vUv;
        varying vec4 vParams;
        varying vec3 vWorld;
        varying float vSmall;
        void main() {
          vec3 lamp = uwLightColor * uwDaylight + vec3(0.1, 0.24, 1.0) * uwMoonlight * 0.3;
          vec3 env = uwVeilColor * 4.0 + lamp * 0.45;   // what the bubble wall mirrors
          vec3 T = uwTransmittance(vWorld);
          vec3 rgb;
          float a;
          if (vParams.x > 0.5) {
            float d = length(vUv);
            float ring = exp(-pow((d - 0.82) / 0.09, 2.0));
            float fade = (1.0 - vParams.y) * vParams.z;
            rgb = env * ring * fade * 1.3;
            a = ring * fade * 0.5;
          } else {
            vec2 q = vUv;
            float d = length(q);
            if (d > 1.0) discard;
            // Wall: TIR makes the outer rim a bright mirror; just inside it a darker refraction band.
            float rim = smoothstep(0.7, 0.93, d) * (1.0 - smoothstep(0.93, 1.0, d));
            float band = smoothstep(0.45, 0.8, d) * (1.0 - rim);
            // Catch-light of the lamp (upper left) and the light focused by the bubble (lower right).
            vec2 h = q - vec2(-0.33, 0.42);
            float spec = exp(-dot(h, h) * 55.0);
            vec2 f = q - vec2(0.22, -0.5);
            float focus = exp(-dot(f, f) * 22.0) * 0.45;
            rgb = env * rim * 1.3 + lamp * (spec * 4.0 + focus);
            a = rim * 0.75 + band * 0.22 + spec * 0.6 + focus * 0.2;
            // Tiny bubbles read as soft silvery points.
            float pt = 1.0 - d * d;
            rgb = mix(rgb, (env * 1.4 + lamp * 0.9) * pt, vSmall);
            a = mix(a, pt * 0.7, vSmall);
            rgb *= vParams.z;
            a *= vParams.z;
          }
          gl_FragColor = vec4(rgb * T, a);
          #include <tonemapping_fragment>
          #include <colorspace_fragment>
        }`,
      transparent: true,
      depthWrite: false,
      blending: CustomBlending,
      blendSrc: OneFactor,
      blendDst: OneMinusSrcAlphaFactor,
      blendSrcAlpha: OneFactor,
      blendDstAlpha: OneMinusSrcAlphaFactor,
    });
    this.mesh = new Mesh(this.geo, material);
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = 7;
    this.mesh.name = 'env.bubbles';
    this.mesh.userData.castShadow = false;
  }

  /** Pixels per meter at 1 m distance (drawing-buffer height / (2·tan(fov/2))). */
  setPixelScale(v: number): void {
    this.mesh.material.uniforms.uPixelScale.value = v;
  }

  clear(): void {
    this.n = 0;
    this.geo.instanceCount = 0;
  }

  private spawn(sx: number, sy: number, sz: number, spread: number): void {
    if (this.n >= CAPACITY) return;
    const i = this.n++;
    const rng = this.rng;
    // Diameter 1–4 mm, most around 1.5–2.5 mm (fine air stone).
    const d = 0.001 + 0.003 * Math.pow(rng.next(), 1.8);
    this.r0[i] = d / 2;
    this.x[i] = this.ox[i] = sx + (rng.next() - 0.5) * spread;
    this.z[i] = this.oz[i] = sz + (rng.next() - 0.5) * spread * 0.4;
    this.y[i] = this.y0[i] = sy;
    this.phase[i] = rng.next() * Math.PI * 2;
    const v = riseSpeed(d);
    // Path instability above ~1.5 mm: zig-zag or spiral with amplitude ~ d, Strouhal ≈ 0.15.
    const unstable = d > 0.0015 ? Math.min(1, (d - 0.0015) / 0.001) : 0;
    this.freq[i] = (0.15 * v) / d;
    this.amp[i] = unstable * d * (0.6 + rng.next() * 0.6);
    this.spiral[i] = rng.next() < 0.4 ? 1 : 0;
    this.state[i] = 0;
    this.timer[i] = 0;
  }

  private kill(i: number): void {
    const j = --this.n;
    if (i === j) return;
    this.x[i] = this.x[j]; this.y[i] = this.y[j]; this.z[i] = this.z[j];
    this.ox[i] = this.ox[j]; this.oz[i] = this.oz[j];
    this.r0[i] = this.r0[j]; this.y0[i] = this.y0[j];
    this.phase[i] = this.phase[j]; this.freq[i] = this.freq[j]; this.amp[i] = this.amp[j];
    this.spiral[i] = this.spiral[j]; this.state[i] = this.state[j]; this.timer[i] = this.timer[j];
  }

  update(world: World, dt: number): void {
    const tank = world.tank;
    const b = tankBounds(tank);
    const surf = b.surfaceY;
    const cur = world.env.current;
    const cx = cur.dir[0] * cur.speed, cz = cur.dir[2] * cur.speed;
    const marine = tank.water !== 'freshwater';

    // Emit from every air stone (read live; decor changes are picked up immediately).
    this.stones.length = 0;
    let si = 0;
    for (const d of tank.decor) {
      if (d.kind !== 'airstone') continue;
      if (this.emitAcc.length <= si) this.emitAcc.push(this.rng.next());
      const len = 0.04 * d.scale; // cylinder stone ~4 cm long
      this.emitAcc[si] += RATE * Math.max(0.5, d.scale) * dt;
      const ry = d.rotation[1];
      while (this.emitAcc[si] >= 1) {
        this.emitAcc[si] -= 1;
        const along = (this.rng.next() - 0.5) * len;
        this.spawn(d.position[0] + Math.cos(ry) * along, d.position[1] + 0.012 * d.scale, d.position[2] - Math.sin(ry) * along, 0.006);
      }
      if (this.stonePool.length <= si) this.stonePool.push({ x: 0, z: 0 });
      const s = this.stonePool[si];
      s.x = d.position[0];
      s.z = d.position[2];
      this.stones.push(s);
      si++;
    }

    const pos = this.posR.array as Float32Array;
    const par = this.params.array as Float32Array;
    let w = 0;
    for (let i = 0; i < this.n; i++) {
      const st = this.state[i];
      if (st === 0) {
        // Rising.
        const depth = Math.max(0, surf - this.y[i]);
        const depth0 = Math.max(0, surf - this.y0[i]);
        // Boyle: volume ∝ 1/pressure → radius ∝ p^(-1/3).
        const r = this.r0[i] * Math.cbrt((P0 + RHO * G * depth0) / (P0 + RHO * G * depth));
        const v = riseSpeed(2 * r);
        this.y[i] += v * dt;
        // The plume is entrained by the current as it rises (stronger nearer the outflow at the top).
        const ent = 0.35 + 0.65 * (1 - depth / surf);
        this.ox[i] += cx * ent * dt;
        this.oz[i] += cz * ent * dt;
        this.phase[i] += this.freq[i] * Math.PI * 2 * dt;
        const a = this.amp[i];
        const s = Math.sin(this.phase[i]);
        this.x[i] = this.ox[i] + a * s;
        this.z[i] = this.oz[i] + (this.spiral[i] ? a * Math.cos(this.phase[i]) : a * 0.3 * s);
        if (this.y[i] >= surf - r) {
          this.y[i] = surf - r;
          this.state[i] = 1;
          // Fresh water: films drain in a fraction of a second; salt stabilises them (foam).
          this.timer[i] = (marine ? 0.6 + this.rng.next() * 2.5 : 0.05 + this.rng.next() * 0.35);
        }
        const squash = Math.min(0.25, Math.max(0, (2 * r - 0.0015) * 120)) * (0.75 + 0.25 * Math.sin(this.phase[i] * 2));
        pos[w * 4] = this.x[i]; pos[w * 4 + 1] = this.y[i]; pos[w * 4 + 2] = this.z[i]; pos[w * 4 + 3] = r;
        par[w * 4] = 0; par[w * 4 + 1] = 0; par[w * 4 + 2] = Math.min(1, (this.y[i] - this.y0[i]) / 0.01 + 0.2); par[w * 4 + 3] = squash;
        w++;
      } else if (st === 1) {
        // Resting at the surface, drifting with the flow.
        this.timer[i] -= dt;
        this.x[i] += cx * dt;
        this.z[i] += cz * dt;
        const r = this.r0[i] * 1.02;
        pos[w * 4] = this.x[i]; pos[w * 4 + 1] = surf - r * 0.6; pos[w * 4 + 2] = this.z[i]; pos[w * 4 + 3] = r;
        par[w * 4] = 0; par[w * 4 + 1] = 0; par[w * 4 + 2] = 1; par[w * 4 + 3] = 0.15;
        w++;
        if (this.timer[i] <= 0) {
          this.state[i] = 2;
          this.timer[i] = 0;
          this.onPop?.(this.x[i], this.z[i], 0.15 + this.r0[i] * 400);
        }
      } else {
        // Popped: a tiny ring expanding on the surface.
        this.timer[i] += dt / 0.45;
        if (this.timer[i] >= 1) {
          this.kill(i);
          i--;
          continue;
        }
        pos[w * 4] = this.x[i]; pos[w * 4 + 1] = surf - 0.0005; pos[w * 4 + 2] = this.z[i]; pos[w * 4 + 3] = this.r0[i];
        par[w * 4] = 1; par[w * 4 + 1] = this.timer[i]; par[w * 4 + 2] = 0.8; par[w * 4 + 3] = 0;
        w++;
      }
      // Leave the tank: walls (current pushes bubbles there).
      if (Math.abs(this.x[i]) > b.halfW - 0.003 || Math.abs(this.z[i]) > b.halfD - 0.003) {
        this.x[i] = Math.max(-b.halfW + 0.003, Math.min(b.halfW - 0.003, this.x[i]));
        this.z[i] = Math.max(-b.halfD + 0.003, Math.min(b.halfD - 0.003, this.z[i]));
        this.ox[i] = this.x[i];
        this.oz[i] = this.z[i];
      }
    }
    this.geo.instanceCount = w;
    if (w > 0) {
      this.posR.addUpdateRange(0, w * 4);
      this.params.addUpdateRange(0, w * 4);
      this.posR.needsUpdate = true;
      this.params.needsUpdate = true;
    }
    this.mesh.visible = w > 0;
  }

  dispose(): void {
    this.geo.dispose();
    this.mesh.material.dispose();
  }
}
