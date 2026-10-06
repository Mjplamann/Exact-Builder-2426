import {
  ACESFilmicToneMapping,
  AmbientLight,
  Color,
  DirectionalLight,
  Group,
  PCFSoftShadowMap,
  PerspectiveCamera,
  Ray,
  Scene,
  SRGBColorSpace,
  Vector2,
  Vector3,
  WebGLRenderer,
} from 'three';
import type { Quality } from '../core/types';
import type { World } from '../core/world';
import { tankBounds } from '../core/tankGeometry';
import { GLOBALS } from './globals';

/**
 * Owns the WebGL renderer, scene, camera, lighting, water/environment effects and post-processing.
 *
 * OWNER: environment module. The public API below is the contract other modules rely on; the
 * implementation is a minimal placeholder (flat lights, no water effects) until replaced.
 */
export class Engine {
  readonly renderer: WebGLRenderer;
  readonly scene: Scene;
  readonly camera: PerspectiveCamera;
  /** Add tank contents (fish, decor, plants, food) under this group. */
  readonly contents: Group;
  readonly globals = GLOBALS;

  private sun: DirectionalLight;
  private ambient: AmbientLight;
  private canvas: HTMLCanvasElement;
  private focus: Vector3 | null = null;

  constructor(canvas: HTMLCanvasElement, world: World) {
    this.canvas = canvas;
    this.renderer = new WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
    this.renderer.outputColorSpace = SRGBColorSpace;
    this.renderer.toneMapping = ACESFilmicToneMapping;
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = PCFSoftShadowMap;
    this.scene = new Scene();
    this.scene.background = new Color(0x02070a);
    this.camera = new PerspectiveCamera(38, 1, 0.05, 20);
    this.contents = new Group();
    this.contents.name = 'tank-contents';
    this.scene.add(this.contents);

    this.sun = new DirectionalLight(0xffffff, 2.5);
    this.sun.castShadow = true;
    this.scene.add(this.sun, this.sun.target);
    this.ambient = new AmbientLight(0x6688aa, 0.6);
    this.scene.add(this.ambient);

    this.rebuildTank(world);
    this.setQuality(world.settings.quality);
    this.resize();
  }

  /** Rebuild tank-dependent scenery (glass, substrate, backdrop, water surface) after size/substrate/background change. */
  rebuildTank(world: World): void {
    const b = tankBounds(world.tank);
    GLOBALS.uTankHalf.value.set(b.halfW, b.height, b.halfD);
    GLOBALS.uSurfaceY.value = b.surfaceY;
    this.sun.position.set(0.2, b.height + 1.5, 0.3);
    this.sun.target.position.set(0, 0, 0);
    this.frameCamera(world);
  }

  setQuality(q: Quality): void {
    const dpr = Math.min(window.devicePixelRatio || 1, q === 'ultra' ? 2 : q === 'high' ? 1.5 : 1);
    this.renderer.setPixelRatio(dpr);
  }

  resize(): void {
    const w = this.canvas.clientWidth || window.innerWidth;
    const h = this.canvas.clientHeight || window.innerHeight;
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
  }

  private lastWorld: World | null = null;
  private frameCamera(world: World): void {
    this.lastWorld = world;
    const b = tankBounds(world.tank);
    const vfov = (this.camera.fov * Math.PI) / 180;
    const distForHeight = b.height / 2 / Math.tan(vfov / 2);
    const hfov = 2 * Math.atan(Math.tan(vfov / 2) * this.camera.aspect);
    const distForWidth = b.halfW / Math.tan(hfov / 2);
    const d = Math.min(distForHeight, distForWidth) * 0.98;
    this.camera.position.set(0, b.height / 2, b.halfD + d);
    this.camera.lookAt(0, b.height / 2, 0);
  }

  /** Per-frame environment update (lights by time of day, caustics, particles, bubbles, camera drift). */
  update(world: World, dt: number): void {
    GLOBALS.uTime.value += dt;
    GLOBALS.uDaylight.value = world.env.daylight;
    GLOBALS.uMoonlight.value = world.env.moonlight;
    this.sun.intensity = 0.2 + 2.6 * world.env.daylight;
    this.ambient.intensity = 0.15 + 0.5 * world.env.daylight + 0.2 * world.env.moonlight;
    if (this.lastWorld !== world || this.camera.aspect !== this.camera.aspect) this.frameCamera(world);
    GLOBALS.uCameraPos.value.copy(this.camera.position);
    void this.focus;
  }

  render(): void {
    this.renderer.render(this.scene, this.camera);
  }

  /** World-space ray through a point in client (CSS pixel) coordinates. */
  rayFromScreen(clientX: number, clientY: number): Ray {
    const rect = this.canvas.getBoundingClientRect();
    const ndc = new Vector2(((clientX - rect.left) / rect.width) * 2 - 1, -((clientY - rect.top) / rect.height) * 2 + 1);
    const origin = this.camera.position.clone();
    const dir = new Vector3(ndc.x, ndc.y, 0.5).unproject(this.camera).sub(origin).normalize();
    return new Ray(origin, dir);
  }

  /** Smoothly move the camera to keep `target` in view (fish follow), or back to the tank view when null. */
  setFocus(target: Vector3 | null): void {
    this.focus = target ? target.clone() : null;
  }

  /** Gentle user-driven view adjustment: pan (dx, dy in −1..1) and zoom (dz > 0 = closer). */
  nudgeView(dx: number, dy: number, dz: number): void {
    void dx;
    void dy;
    void dz;
  }

  dispose(): void {
    this.renderer.dispose();
  }
}
