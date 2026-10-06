import {
  ACESFilmicToneMapping,
  Color,
  Group,
  MathUtils,
  Mesh,
  PCFShadowMap,
  PerspectiveCamera,
  Ray,
  Scene,
  SRGBColorSpace,
  Vector2,
  Vector3,
  WebGLRenderer,
  type Object3D,
} from 'three';
import type { BackgroundKind, Quality, SubstrateKind, TankSize } from '../core/types';
import type { World } from '../core/world';
import { tankBounds } from '../core/tankGeometry';
import { GLOBALS } from './globals';
import { Bubbles } from './env/Bubbles';
import { CameraRig } from './env/CameraRig';
import { Caustics } from './env/Caustics';
import { GodRays } from './env/GodRays';
import { Lighting } from './env/Lighting';
import { Motes } from './env/Motes';
import { PostFX } from './env/PostFX';
import { Substrate } from './env/Substrate';
import { FX_LAYER, TankShell } from './env/TankShell';
import { WaterSurface } from './env/WaterSurface';

/** Per-quality knobs. Pixel ratio is capped at the device's own. */
interface QualityPreset {
  dpr: number;
  shadows: boolean;
  shadowMap: number;
  post: boolean;
  msaa: number;
  bloom: boolean;
  caustics: number;
  motes: number;
  rays: number;
  reflection: number;
  substrateTexture: number;
  frontReflections: boolean;
}

export const QUALITY_PRESETS: Record<Quality, QualityPreset> = {
  low: { dpr: 1, shadows: false, shadowMap: 1024, post: false, msaa: 0, bloom: false, caustics: 256, motes: 110, rays: 4, reflection: 0, substrateTexture: 256, frontReflections: false },
  medium: { dpr: 1, shadows: true, shadowMap: 1024, post: true, msaa: 2, bloom: true, caustics: 512, motes: 220, rays: 6, reflection: 0.35, substrateTexture: 512, frontReflections: true },
  high: { dpr: 1.5, shadows: true, shadowMap: 2048, post: true, msaa: 4, bloom: true, caustics: 512, motes: 360, rays: 9, reflection: 0.5, substrateTexture: 512, frontReflections: true },
  ultra: { dpr: 2, shadows: true, shadowMap: 4096, post: true, msaa: 4, bloom: true, caustics: 1024, motes: 600, rays: 13, reflection: 0.75, substrateTexture: 512, frontReflections: true },
};

/** Moonlight LEDs (linear), for the veil color. */
const MOON = new Color(0.1, 0.24, 1.0);

/**
 * Owns the WebGL renderer, scene, camera, lighting, water/environment effects and post-processing.
 *
 * OWNER: environment module. Public API (used by other modules): `scene`, `camera`, `contents`,
 * `renderer`, `globals`, `update`, `render`, `resize`, `rebuildTank`, `setQuality`, `setFocus`,
 * `nudgeView`, `rayFromScreen`.
 *
 * Conventions for content added under `contents`:
 *  - Meshes cast shadows automatically (the Engine enables `castShadow` on every mesh it finds
 *    under `contents`) unless `object.userData.castShadow === false`. `receiveShadow` is left to
 *    the owner (the substrate always receives).
 *  - Lit materials must go through `applyUnderwater(material)`.
 *  - Objects on layer 1 (FX_LAYER) are not mirrored in the water surface.
 */
export class Engine {
  readonly renderer: WebGLRenderer;
  readonly scene: Scene;
  readonly camera: PerspectiveCamera;
  /** Add tank contents (fish, decor, plants, food) under this group. */
  readonly contents: Group;
  readonly globals = GLOBALS;

  private canvas: HTMLCanvasElement;
  private world: World;
  private rig: CameraRig;
  private lighting: Lighting;
  private caustics: Caustics | null = null;
  private substrate = new Substrate();
  private shell = new TankShell();
  private surface = new WaterSurface();
  private rays = new GodRays();
  private motes = new Motes();
  private bubbles = new Bubbles();
  private post: PostFX | null = null;
  private quality: Quality = 'high';
  /** Current quality level. */
  get qualityLevel(): Quality {
    return this.quality;
  }
  private preset: QualityPreset = QUALITY_PRESETS.high;
  private qualityApplied = false;
  private dt = 1 / 60;
  private exposure = 1;
  private shadowScanTimer = 0;
  private builtFor: { size: TankSize; substrate: SubstrateKind; background: BackgroundKind; depthF: number; depthB: number; seed: number } | null = null;
  private size = new Vector2();
  private tmpColor = new Color();
  private tmpV = new Vector3();
  private unsubscribe: (() => void)[] = [];

  constructor(canvas: HTMLCanvasElement, world: World) {
    this.canvas = canvas;
    this.world = world;
    this.renderer = new WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance', stencil: false });
    this.renderer.outputColorSpace = SRGBColorSpace;
    this.renderer.toneMapping = ACESFilmicToneMapping;
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = PCFShadowMap;
    // Shadows are re-rendered once per frame by whichever pass renders first (see render()).
    this.renderer.shadowMap.autoUpdate = false;

    this.scene = new Scene();
    this.scene.background = new Color(0x010304);
    this.rig = new CameraRig(1);
    this.camera = this.rig.camera;
    this.camera.layers.enable(FX_LAYER);

    this.contents = new Group();
    this.contents.name = 'tank-contents';
    this.scene.add(this.contents);

    this.lighting = new Lighting(this.scene);
    this.scene.add(this.substrate.group, this.shell.group, this.surface.mesh, this.rays.mesh, this.motes.points, this.bubbles.mesh);

    // Surface ripples from popping bubbles and food landing.
    this.bubbles.onPop = (x, z, s) => this.surface.addRipple(x, z, s);
    this.unsubscribe.push(
      world.events.on('food-dropped', ({ at, count }) => this.surface.addRipple(at[0], at[2], 0.8 + 0.3 * Math.min(4, count))),
      // A knock on the glass sends a faint shiver across the surface from the front pane.
      world.events.on('tap-glass', ({ at, strength }) => this.surface.addRipple(at[0], GLOBALS.uTankHalf.value.z - 0.005, 0.4 * strength)),
    );

    this.setQuality(world.settings.quality);
    this.rebuildTank(world);
    this.resize();
  }

  // ------------------------------------------------------------------------------------------
  // Tank & quality
  // ------------------------------------------------------------------------------------------

  /** Rebuild tank-dependent scenery (glass, substrate, backdrop, water surface) after size/substrate/background change. */
  rebuildTank(world: World): void {
    this.world = world;
    const t = world.tank;
    const b = tankBounds(t);
    GLOBALS.uTankHalf.value.set(b.halfW, b.height, b.halfD);
    GLOBALS.uSurfaceY.value = b.surfaceY;
    GLOBALS.uVeilCeiling.value = b.surfaceY;

    const prev = this.builtFor;
    const sizeChanged = !prev || prev.size.widthCm !== t.size.widthCm || prev.size.heightCm !== t.size.heightCm || prev.size.depthCm !== t.size.depthCm;
    const floorChanged = sizeChanged || !prev || prev.substrate !== t.substrate || prev.depthF !== t.substrateDepthFrontCm || prev.depthB !== t.substrateDepthBackCm || prev.seed !== t.seed;
    if (floorChanged) this.buildSubstrate();
    this.shell.build(t);
    this.surface.build(t);
    this.rays.build(t);
    this.lighting.fit(t);
    this.bubbles.clear();
    this.builtFor = { size: { ...t.size }, substrate: t.substrate, background: t.background, depthF: t.substrateDepthFrontCm, depthB: t.substrateDepthBackCm, seed: t.seed };
    this.frameCamera();
    if (sizeChanged) this.rig.snap();
  }

  private buildSubstrate(): void {
    const aniso = Math.min(8, this.renderer.capabilities.getMaxAnisotropy());
    this.substrate.build(this.world.tank, this.preset.substrateTexture, aniso);
    this.lighting.setSubstrateAlbedo(this.substrate.meanAlbedo);
  }

  setQuality(q: Quality): void {
    const p = QUALITY_PRESETS[q] ?? QUALITY_PRESETS.high;
    // App calls this on every settings change (sound, units…): only rebuild when it matters.
    if (this.qualityApplied && q === this.quality) return;
    this.qualityApplied = true;
    const prev = this.preset;
    this.quality = q;
    this.preset = p;
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, p.dpr));
    this.renderer.shadowMap.enabled = p.shadows;
    this.lighting.setShadows(p.shadows, p.shadowMap);
    if (!this.caustics || this.caustics.target.width !== p.caustics) {
      this.caustics?.dispose();
      this.caustics = new Caustics(p.caustics);
    }
    this.motes.setCount(p.motes);
    this.rays.setSlices(p.rays);
    this.surface.setReflectionScale(p.reflection);
    if (this.builtFor && prev.substrateTexture !== p.substrateTexture) this.buildSubstrate();
    this.post?.dispose();
    this.post = null;
    this.resize();
  }

  resize(): void {
    const w = this.canvas.clientWidth || window.innerWidth;
    const h = this.canvas.clientHeight || window.innerHeight;
    this.renderer.setSize(w, h, false);
    this.renderer.getDrawingBufferSize(this.size);
    if (this.preset.post) {
      if (!this.post) {
        this.post = new PostFX(this.renderer, this.scene, this.camera, { msaa: this.preset.msaa, bloom: this.preset.bloom, bloomScale: 0.5 });
      }
      this.post.setSize(this.size.x, this.size.y);
    }
    this.frameCamera();
  }

  private frameCamera(): void {
    const w = this.canvas.clientWidth || window.innerWidth;
    const h = this.canvas.clientHeight || window.innerHeight;
    this.rig.frame(this.world.tank, Math.max(0.1, w / Math.max(1, h)));
  }

  // ------------------------------------------------------------------------------------------
  // Per frame
  // ------------------------------------------------------------------------------------------

  /** Per-frame environment update (lights by time of day, caustics, particles, bubbles, camera drift). */
  update(world: World, dt: number): void {
    if (world !== this.world || this.needsRebuild(world)) this.rebuildTank(world);
    this.dt = dt;
    const env = world.env;
    const t = world.tank;
    const b = tankBounds(t);

    // Lights and shared uniforms.
    this.lighting.update(env, dt);
    const day = this.lighting.day;
    const moon = this.lighting.moon;
    const room = this.lighting.roomLevel;
    GLOBALS.uTime.value += dt;
    GLOBALS.uDaylight.value = day;
    GLOBALS.uMoonlight.value = moon;
    GLOBALS.uLightColor.value.copy(this.lighting.color);
    GLOBALS.uWaterTint.value.setRGB(env.waterTint[0], env.waterTint[1], env.waterTint[2]);
    GLOBALS.uTurbidity.value = env.turbidity;
    GLOBALS.uSurfaceY.value = env.surfaceY || b.surfaceY;
    GLOBALS.uVeilCeiling.value = GLOBALS.uSurfaceY.value;
    GLOBALS.uTankHalf.value.set(b.halfW, b.height, b.halfD);
    const cur = env.current;
    GLOBALS.uCurrent.value.set(cur.dir[0] * cur.speed, cur.dir[2] * cur.speed);

    // Veil: light scattered toward the eye by the water itself. Its hue is the light after a
    // typical path through the water (red absorbed first), so it reads blue-green — or amber
    // when tannins stain the water.
    const tint = GLOBALS.uWaterTint.value;
    const veil = GLOBALS.uVeilColor.value;
    veil.copy(GLOBALS.uLightColor.value).multiplyScalar(day * 0.2);
    veil.add(this.tmpColor.copy(MOON).multiplyScalar(moon * 0.03));
    veil.add(this.tmpColor.setRGB(0.9, 0.75, 0.6).multiplyScalar(room * 0.004));
    veil.multiply(this.tmpColor.setRGB(tint.r * tint.r * 0.62, tint.g * tint.g * 0.95, tint.b * tint.b * 1.0));
    veil.multiplyScalar(0.6 + Math.min(2, env.turbidity * 2.5));

    // Caustics drift with the surface current; agitation from flow + air stones.
    const stones = this.bubbles.stones.length;
    const agitation = MathUtils.clamp(0.55 + cur.speed * 7 + stones * 0.15, 0.4, 1.8);
    const drift = GLOBALS.uCausticDrift.value;
    drift.x += (GLOBALS.uCurrent.value.x * dt) / 0.13 * 0.3;
    drift.y += (GLOBALS.uCurrent.value.y * dt) / 0.13 * 0.3;
    drift.z += (GLOBALS.uCurrent.value.x * dt) / 0.17 * 0.22 - dt * 0.004;
    drift.w += (GLOBALS.uCurrent.value.y * dt) / 0.17 * 0.22 + dt * 0.003;
    this.causticAgitation = agitation;

    // Camera.
    this.rig.drift = world.settings.cameraDrift;
    this.rig.update(dt);
    GLOBALS.uCameraPos.value.copy(this.camera.position);

    // Bubbles, surface, motes, glass.
    this.bubbles.update(world, dt);
    for (let i = 0; i < 4; i++) {
      const s = this.bubbles.stones[i];
      if (s) this.surface.setBoil(i, s.x, s.z, 0.035, 1);
      else this.surface.setBoil(i, 0, 0, 0.03, 0);
    }
    this.surface.update(dt, agitation);
    const pixelScale = this.size.y / (2 * Math.tan(MathUtils.degToRad(this.camera.fov) / 2));
    this.bubbles.setPixelScale(pixelScale);
    const focusDist = this.camera.position.z; // distance to the tank's mid-depth plane
    this.motes.update(dt, GLOBALS.uCurrent.value.x, GLOBALS.uCurrent.value.y, t.waterParams.cloudiness ?? 0, pixelScale, focusDist);
    this.rays.setIntensity(1);
    // Backlights (frosted/gradient films) run on the light timer.
    this.shell.update(t, room, Math.max(day, 0.0), this.preset.frontReflections);

    // Exposure: a little eye adaptation so a moonlit tank is dark but readable.
    const level = this.lighting.level;
    const target = MathUtils.clamp(Math.pow(0.12 + 0.88 * Math.min(1, level), -0.33), 1, 2.0);
    if (this.firstUpdate) this.exposure = target;
    this.exposure += (target - this.exposure) * (1 - Math.exp(-dt / 2.5));
    this.firstUpdate = false;
    this.renderer.toneMappingExposure = this.exposure;

    // Shadow casting for contents (see class doc), refreshed a few times per second.
    this.shadowScanTimer -= dt;
    if (this.shadowScanTimer <= 0) {
      this.shadowScanTimer = 0.5;
      this.contents.traverse(this.enableShadow);
    }
  }

  private causticAgitation = 1;
  private firstUpdate = true;

  private enableShadow = (o: Object3D): void => {
    if ((o as Mesh).isMesh && o.userData.castShadow !== false && !o.castShadow) o.castShadow = true;
  };

  private needsRebuild(world: World): boolean {
    const p = this.builtFor;
    const t = world.tank;
    return (
      !p ||
      p.size.widthCm !== t.size.widthCm ||
      p.size.heightCm !== t.size.heightCm ||
      p.size.depthCm !== t.size.depthCm ||
      p.substrate !== t.substrate ||
      p.background !== t.background ||
      p.depthF !== t.substrateDepthFrontCm ||
      p.depthB !== t.substrateDepthBackCm
    );
  }

  render(): void {
    const r = this.renderer;
    this.caustics?.render(r, this.dt, this.causticAgitation);
    r.shadowMap.needsUpdate = true;
    const b = GLOBALS.uTankHalf.value;
    this.surface.renderReflection(r, this.scene, this.camera, GLOBALS.uSurfaceY.value, b.x, b.z);
    if (this.post && this.preset.post) {
      r.toneMapping = ACESFilmicToneMapping;
      this.post.render(this.exposure, GLOBALS.uTime.value);
    } else {
      r.render(this.scene, this.camera);
    }
  }

  // ------------------------------------------------------------------------------------------
  // Camera API
  // ------------------------------------------------------------------------------------------

  /** World-space ray through a point in client (CSS pixel) coordinates. */
  rayFromScreen(clientX: number, clientY: number): Ray {
    const rect = this.canvas.getBoundingClientRect();
    const nx = ((clientX - rect.left) / Math.max(1, rect.width)) * 2 - 1;
    const ny = -((clientY - rect.top) / Math.max(1, rect.height)) * 2 + 1;
    this.camera.updateMatrixWorld();
    const origin = new Vector3().setFromMatrixPosition(this.camera.matrixWorld);
    const dir = this.tmpV.set(nx, ny, 0.5).unproject(this.camera).sub(origin).normalize();
    return new Ray(origin, dir.clone());
  }

  /** Smoothly move the camera to keep `target` in view (fish follow), or back to the tank view when null. */
  setFocus(target: Vector3 | null): void {
    this.rig.setFocus(target);
  }

  /**
   * Gentle user-driven view adjustment: pan (dx, dy in −1..1) and zoom (dz > 0 = closer).
   * dx/dy are fractions of the visible half-width/height (e.g. drag delta / half the screen
   * size); dz is in wheel notches (≈12 % per notch). Clamped to stay within the front glass.
   */
  nudgeView(dx: number, dy: number, dz: number): void {
    this.rig.nudge(dx, dy, dz);
  }

  dispose(): void {
    for (const u of this.unsubscribe) u();
    this.post?.dispose();
    this.caustics?.dispose();
    this.substrate.dispose();
    this.shell.dispose();
    this.surface.dispose();
    this.rays.dispose();
    this.motes.dispose();
    this.bubbles.dispose();
    this.lighting.dispose();
    this.renderer.dispose();
  }
}
