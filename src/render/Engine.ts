import {
  ACESFilmicToneMapping,
  Color,
  Group,
  MathUtils,
  Mesh,
  BasicShadowMap,
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
import { substrateHeight, tankBounds } from '../core/tankGeometry';
import { GLOBALS } from './globals';
import { Bubbles } from './env/Bubbles';
import { CameraRig, MAX_ZOOM, type FollowSubject } from './env/CameraRig';
import { Caustics } from './env/Caustics';
import { GodRays } from './env/GodRays';
import { Lighting } from './env/Lighting';
import { Motes } from './env/Motes';
import { PostFX, type DofParams } from './env/PostFX';
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
  /** Light beams alive at once. */
  rays: number;
  reflection: number;
  substrateTexture: number;
  frontReflections: boolean;
  /** Soft-shadow taps: blocker search, filter. */
  shadowTaps: [number, number];
  /**
   * Drawing-buffer pixel budget. The effective pixel ratio is the smallest of the device ratio,
   * `dpr`, and what fits this budget — so a phone (few CSS pixels, 3× screen) renders sharply at
   * ~2× while a large desktop monitor stays at ~1× for the same GPU cost.
   */
  maxPixels: number;
  /** Depth-of-field gather taps (half resolution) for close-ups; 0 = no depth of field. */
  dofTaps: number;
}

export type { FollowSubject };

export const QUALITY_PRESETS: Record<Quality, QualityPreset> = {
  low: { maxPixels: 1.2e6, dpr: 1.5, shadows: false, shadowMap: 1024, post: false, msaa: 0, bloom: false, caustics: 256, motes: 110, rays: 10, reflection: 0, substrateTexture: 256, frontReflections: false, shadowTaps: [4, 4], dofTaps: 0 },
  medium: { maxPixels: 2.3e6, dpr: 2, shadows: true, shadowMap: 1024, post: true, msaa: 2, bloom: true, caustics: 512, motes: 220, rays: 16, reflection: 0.35, substrateTexture: 512, frontReflections: true, shadowTaps: [6, 8], dofTaps: 16 },
  high: { maxPixels: 3.4e6, dpr: 2, shadows: true, shadowMap: 2048, post: true, msaa: 4, bloom: true, caustics: 512, motes: 360, rays: 24, reflection: 0.5, substrateTexture: 512, frontReflections: true, shadowTaps: [10, 14], dofTaps: 22 },
  ultra: { maxPixels: 6e6, dpr: 3, shadows: true, shadowMap: 4096, post: true, msaa: 4, bloom: true, caustics: 1024, motes: 600, rays: 32, reflection: 0.75, substrateTexture: 512, frontReflections: true, shadowTaps: [12, 16], dofTaps: 28 },
};

/** A zoom gesture keeps its anchor while input keeps coming within this long (ms). */
const ANCHOR_HOLD_MS = 400;

/** Moonlight LEDs (linear), for the veil color. */
const MOON = new Color(0.1, 0.24, 1.0);

/**
 * Owns the WebGL renderer, scene, camera, lighting, water/environment effects and post-processing.
 *
 * OWNER: environment module. Public API (used by other modules): `scene`, `camera`, `contents`,
 * `renderer`, `globals`, `update`, `render`, `resize`, `rebuildTank`, `setQuality`,
 * `rayFromScreen`, and the view API (`follow`, `setFollowFill`, `zoomBy`, `setZoom`, `getZoom`,
 * `panBy`, `resetView`; `setFocus`/`nudgeView` remain for older callers).
 *
 * The camera is a standard perspective camera placed at the refraction-corrected eye (see
 * CameraRig): `project()`, `unproject()` and raycasts from it are true world-space lines of sight
 * through the front glass, so they line up with what is drawn.
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
  private firstUpdate = true;
  /** Surface agitation (flow + air stones) driving how fast caustics evolve. */
  private causticAgitation = 1;
  private shadowScanTimer = 0;
  /** The post chain has captured at least one frame (back-glass reflection source). */
  private ghostReady = false;
  private builtFor: { id: string; size: TankSize; substrate: SubstrateKind; background: BackgroundKind; depthF: number; depthB: number; seed: number } | null = null;
  private size = new Vector2();
  private tmpColor = new Color();
  private tmpV = new Vector3();
  private dof: DofParams = { amount: 0, focus: 1, scale: 0, near: 0.1, far: 2, cameraNear: 0.03, cameraFar: 12 };
  private unsubscribe: (() => void)[] = [];

  constructor(canvas: HTMLCanvasElement, world: World) {
    this.canvas = canvas;
    this.world = world;
    this.renderer = new WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance', stencil: false });
    this.renderer.outputColorSpace = SRGBColorSpace;
    this.renderer.toneMapping = ACESFilmicToneMapping;
    this.renderer.shadowMap.enabled = true;
    // Raw depth shadow map: every lit material filters it with the water-aware soft-shadow
    // lookup injected by applyUnderwater (PCSS; see env/glsl.ts).
    this.renderer.shadowMap.type = BasicShadowMap;
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
    this.ghostReady = false; // the last frame showed another tank
    this.builtFor = { id: t.id, size: { ...t.size }, substrate: t.substrate, background: t.background, depthF: t.substrateDepthFrontCm, depthB: t.substrateDepthBackCm, seed: t.seed };
    // Another tank (or a resized one) opens on its whole-tank view: a cut, like walking up to it,
    // never a glide from wherever the last tank's close-up was.
    const otherTank = sizeChanged || prev?.id !== t.id;
    if (otherTank) {
      this.rig.resetView();
      this.anchor.valid = false;
      this.refocusT = -1;
    }
    this.frameCamera();
    if (otherTank) this.rig.snap();
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
    this.applyPixelRatio();
    this.renderer.shadowMap.enabled = p.shadows;
    this.lighting.setShadows(p.shadows, p.shadowMap);
    GLOBALS.uShadowTaps.value.set(p.shadowTaps[0], p.shadowTaps[1]);
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
    this.ghostReady = false;
    this.resize();
  }

  /** Pixel ratio = min(device, preset cap, what fits the preset's pixel budget). */
  private applyPixelRatio(): void {
    const w = this.canvas.clientWidth || window.innerWidth;
    const h = this.canvas.clientHeight || window.innerHeight;
    const budget = Math.sqrt(this.preset.maxPixels / Math.max(1, w * h));
    const dpr = Math.max(1, Math.min(window.devicePixelRatio || 1, this.preset.dpr, budget));
    if (Math.abs(this.renderer.getPixelRatio() - dpr) > 0.01) this.renderer.setPixelRatio(dpr);
  }

  resize(): void {
    const w = this.canvas.clientWidth || window.innerWidth;
    const h = this.canvas.clientHeight || window.innerHeight;
    this.applyPixelRatio();
    this.renderer.setSize(w, h, false);
    this.renderer.getDrawingBufferSize(this.size);
    if (this.preset.post) {
      if (!this.post) {
        this.post = new PostFX(this.renderer, this.scene, this.camera, { msaa: this.preset.msaa, bloom: this.preset.bloom, bloomScale: 0.5, dofTaps: this.preset.dofTaps });
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
    // Shadow softness follows the source: the daylight bar is a long, wide emitter (soft,
    // elongated penumbrae); the moonlight is a couple of small LEDs (crisper, fainter shadows).
    const dayW = day / Math.max(1e-3, day + moon * 0.6);
    GLOBALS.uShadowSoft.value.set(MathUtils.lerp(0.09, 0.24, dayW), MathUtils.lerp(0.05, 0.1, dayW), 0.002, MathUtils.lerp(0.9, 0.75, dayW));

    // Veil: light scattered toward the eye by the water itself. Its hue is the light after a
    // typical path through the water (red absorbed first), so it reads blue-green — or amber
    // when tannins stain the water.
    const tint = GLOBALS.uWaterTint.value;
    const veil = GLOBALS.uVeilColor.value;
    veil.copy(GLOBALS.uLightColor.value).multiplyScalar(day * 0.23);
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

    // Camera. It sits at the refraction-corrected (virtual) eye through which every in-water
    // line of sight passes (see CameraRig), which is also the eye for water path lengths.
    this.rig.drift = world.settings.cameraDrift;
    this.rig.update(dt);
    if (this.refocusT >= 0) {
      this.refocusT -= dt;
      if (this.refocusT < 0) this.refocus();
    }
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
    // Motes blur like everything else around the lens's focus (the followed animal, the zoom anchor).
    this.motes.update(dt, GLOBALS.uCurrent.value.x, GLOBALS.uCurrent.value.y, t.waterParams.cloudiness ?? 0, pixelScale, this.rig.focusDistance);
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
    // Someone may have reset the projection (resize): re-apply the field of view + lens shift.
    this.rig.applyProjection();
    this.caustics?.render(r, this.dt, this.causticAgitation);
    r.shadowMap.needsUpdate = true;
    this.rays.setShadow(this.lighting.key, this.preset.shadows);
    const b = GLOBALS.uTankHalf.value;
    // The back-glass reflection of the interior samples the previous frame (post chain only, once
    // one has been captured for this tank); never in the mirrored surface pass, whose screen
    // mapping differs.
    GLOBALS.uGhost.value = 0;
    this.surface.renderReflection(r, this.scene, this.camera, GLOBALS.uSurfaceY.value, b.x, b.z, this.rig.projShiftY);
    const post = this.preset.post ? this.post : null;
    if (post) {
      GLOBALS.uPrevFrame.value = post.prevFrame;
      GLOBALS.uGhost.value = this.ghostReady ? 1 : 0;
      // Depth of field for close-ups: focus, lens and depth range from the rig (see CameraRig).
      const rig = this.rig;
      const d = this.dof;
      d.amount = this.preset.dofTaps > 0 ? rig.dofAmount : 0;
      d.focus = rig.focusDistance;
      d.scale = rig.dofScale * d.amount;
      d.near = rig.glassDistance;
      d.far = rig.backDistance;
      d.cameraNear = this.camera.near;
      d.cameraFar = this.camera.far;
      post.render(this.exposure, GLOBALS.uTime.value, d);
    } else {
      r.render(this.scene, this.camera);
    }
    this.ghostReady = !!post;
  }

  // ------------------------------------------------------------------------------------------
  // Camera API
  // ------------------------------------------------------------------------------------------

  /**
   * World-space ray through a point in client (CSS pixel) coordinates: the true path of that
   * line of sight inside the water (refraction at the front glass included — the camera sits at
   * the refraction-corrected eye, see CameraRig), so it hits exactly what is drawn there.
   */
  rayFromScreen(clientX: number, clientY: number): Ray {
    const rect = this.canvas.getBoundingClientRect();
    const nx = ((clientX - rect.left) / Math.max(1, rect.width)) * 2 - 1;
    const ny = -((clientY - rect.top) / Math.max(1, rect.height)) * 2 + 1;
    this.rig.applyProjection();
    const origin = new Vector3().setFromMatrixPosition(this.camera.matrixWorld);
    const dir = this.tmpV.set(nx, ny, 0.5).unproject(this.camera).sub(origin).normalize();
    return new Ray(origin, dir.clone());
  }

  // ------------------------------------------------------------------------------------------
  // View API (zoom / pan / follow). The optics and motion live in CameraRig.
  // ------------------------------------------------------------------------------------------

  /** Zoom anchor of the current gesture (re-picked when the pointer moves or after a pause). */
  private anchor = { x: 0, y: 0, time: -1e9, point: new Vector3(), valid: false };
  /** What lies under a client point (from the App, via zoomBy): zoom anchors and autofocus. */
  private picker: ((clientX: number, clientY: number) => Vector3 | null) | null = null;
  /** Seconds until the lens refocuses on the frame centre (after a zoom or pan without an anchor); < 0 = none. */
  private refocusT = -1;
  /** Where to autofocus (client px) when `valid`; else the frame centre. */
  private refocusPoint = { x: 0, y: 0, valid: false };

  /**
   * Follow a moving subject (its arrays are read every frame — pass live references, refreshed in
   * place). Calling again glides to the new subject over 2–4 s. `fill` = fraction of the screen
   * width the subject should span (0.05–0.6; default by size: ~0.22 small fish … ~0.3 larger).
   * null eases back to the previous free view; `hold` keeps the current framing instead (the
   * keeper grabbed the view).
   */
  follow(subject: FollowSubject | null, opts: { fill?: number; hold?: boolean } = {}): void {
    this.rig.follow(subject, opts);
  }

  /** Change how tightly the followed subject is framed (smoothly). */
  setFollowFill(fill: number): void {
    this.rig.setFollowFill(fill);
  }

  /**
   * Zoom by wheel-notch steps (+ closer, ×1.12 each; fractional for trackpads and pinch),
   * optionally toward a screen point: the thing under it stays under it. `pickAnchor` may return
   * the true-space point under a client position (fish, plant, decor); otherwise the tank's
   * own geometry is used. While following, zoom frames the subject tighter or looser.
   */
  zoomBy(steps: number, anchorClientX?: number, anchorClientY?: number, pickAnchor?: (clientX: number, clientY: number) => Vector3 | null): void {
    if (pickAnchor) this.picker = pickAnchor;
    if (anchorClientX === undefined || anchorClientY === undefined || this.rig.isFollowing) {
      this.rig.zoomBy(steps);
      this.refocusSoon();
      return;
    }
    const rect = this.canvas.getBoundingClientRect();
    const nx = ((anchorClientX - rect.left) / Math.max(1, rect.width)) * 2 - 1;
    const ny = -((anchorClientY - rect.top) / Math.max(1, rect.height)) * 2 + 1;
    // One pick per gesture: while the pointer stays put, the anchored point stays under it.
    const a = this.anchor;
    const now = performance.now();
    if (!a.valid || now - a.time > ANCHOR_HOLD_MS || Math.hypot(anchorClientX - a.x, anchorClientY - a.y) > 8) {
      const picked = pickAnchor?.(anchorClientX, anchorClientY) ?? null;
      a.valid = picked ? !!a.point.copy(picked) : this.anchorInTank(this.rayFromScreen(anchorClientX, anchorClientY), a.point);
      a.x = anchorClientX;
      a.y = anchorClientY;
    }
    a.time = now;
    if (a.valid) {
      // The lens focuses on the anchor (CameraRig.zoomBy); no centre autofocus over it.
      this.rig.zoomBy(steps, nx, ny, a.point);
      this.refocusT = -1;
    } else {
      this.rig.zoomBy(steps);
      this.refocusSoon();
    }
  }

  /**
   * Autofocus once the view has settled: on the frame centre (like a camera's centre AF point), or
   * where the fingers are when they carried a zoom anchor along (`at`, client px).
   */
  private refocusSoon(at?: { x: number; y: number }): void {
    if (this.rig.isFollowing) return;
    this.refocusT = 0.35;
    this.refocusPoint.valid = !!at;
    if (at) {
      this.refocusPoint.x = at.x;
      this.refocusPoint.y = at.y;
    }
  }

  private refocus(): void {
    if (this.rig.isFollowing || this.rig.targetZoom < 1.3) return;
    const rect = this.canvas.getBoundingClientRect();
    const rp = this.refocusPoint;
    const inside = rp.valid && rp.x > rect.left && rp.x < rect.right && rp.y > rect.top && rp.y < rect.bottom;
    const x = inside ? rp.x : rect.left + rect.width / 2;
    const y = inside ? rp.y : rect.top + rect.height / 2;
    const p = this.picker?.(x, y) ?? (this.anchorInTank(this.rayFromScreen(x, y), this.tmpV) ? this.tmpV : null);
    if (p) this.rig.focusAt(p.z);
  }

  /**
   * Where a line of sight first meets the tank's own surfaces (substrate, back/side glass, water
   * surface): the depth of whatever is under the pointer when nothing else was picked.
   */
  private anchorInTank(ray: Ray, out: Vector3): boolean {
    const tank = this.world.tank;
    const b = tankBounds(tank);
    const o = ray.origin;
    const d = ray.direction;
    if (d.z >= -1e-6) return false;
    const t0 = Math.max(0, (b.halfD - o.z) / d.z);
    let t1 = (-b.halfD - o.z) / d.z;
    if (d.x > 1e-6) t1 = Math.min(t1, (b.halfW - o.x) / d.x);
    else if (d.x < -1e-6) t1 = Math.min(t1, (-b.halfW - o.x) / d.x);
    if (d.y > 1e-6) t1 = Math.min(t1, (b.surfaceY - o.y) / d.y);
    else if (d.y < -1e-6) t1 = Math.min(t1, -o.y / d.y);
    if (!(t1 > t0)) return false;
    const below = (t: number) => o.y + d.y * t <= substrateHeight(tank, o.x + d.x * t, o.z + d.z * t);
    let lo = t0;
    let hi = t1;
    const steps = 48;
    for (let i = 1; i <= steps; i++) {
      const t = t0 + ((t1 - t0) * i) / steps;
      if (below(t)) {
        hi = t;
        for (let k = 0; k < 10; k++) {
          const m = (lo + hi) / 2;
          if (below(m)) hi = m;
          else lo = m;
        }
        break;
      }
      lo = t;
    }
    out.copy(d).multiplyScalar(hi).add(o);
    return true;
  }

  /** Absolute zoom (1 = whole tank … 8). While following, scales the framing to match. */
  setZoom(zoom: number): void {
    this.rig.setZoom(zoom);
    this.refocusSoon();
  }

  /** The TARGET zoom (what the view is heading for): 1 = the whole tank framed; `max` = closest telephoto framing. */
  getZoom(): { zoom: number; min: number; max: number } {
    return { zoom: this.rig.targetZoom, min: 1, max: MAX_ZOOM };
  }

  /** Current (animated) zoom, for indicators that follow the motion. */
  get zoomLevel(): number {
    return this.rig.zoom;
  }

  /** Pan by fractions of the visible half-width/height (positive = view moves right/up). Ignored while following. */
  panBy(dx: number, dy: number): void {
    if (this.rig.isFollowing || !(Number.isFinite(dx) && Number.isFinite(dy))) return;
    this.rig.panBy(dx, dy);
    const a = this.anchor;
    if (a.valid && performance.now() - a.time < ANCHOR_HOLD_MS) {
      // Part of a pinch (or a drag right after a zoom): the anchored point travels with the
      // fingers, so the next zoom step keeps it under them instead of picking something new, and
      // the lens stays on it.
      const rect = this.canvas.getBoundingClientRect();
      a.x -= MathUtils.clamp(dx, -1, 1) * rect.width * 0.5;
      a.y += MathUtils.clamp(dy, -1, 1) * rect.height * 0.5;
      a.time = performance.now();
      // A pinch keeps the lens on its anchor (that point is still under the fingers); a long
      // drag onward refocuses on whatever is under the finger once it rests.
      this.refocusSoon(a);
      return;
    }
    this.refocusSoon();
  }

  /** Back to the whole-tank view (stops following). `gentle`: a slow documentary pull-back. */
  resetView(opts: { gentle?: boolean } = {}): void {
    this.rig.follow(null);
    this.rig.resetView(!!opts.gentle);
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
    this.refocusSoon();
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
