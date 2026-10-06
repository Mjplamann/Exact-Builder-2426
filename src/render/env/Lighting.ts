import {
  AmbientLight,
  Color,
  DirectionalLight,
  HemisphereLight,
  Matrix4,
  Object3D,
  Vector3,
  type Scene,
} from 'three';
import type { EnvState, TankState } from '../../core/types';
import { tankBounds } from '../../core/tankGeometry';
import { GLOBALS } from '../globals';

/**
 * Lighting rig of a planted/reef tank:
 *  - key:  the LED bar's main emitters above the water, slightly in front of center (so shadows
 *          fall a little toward the back, as with a real fixture). Casts the soft shadow map,
 *          fitted tightly to the tank. At night the same light becomes the blue "moonlight" LEDs.
 *  - fill: the bar's other emitters from a slightly different angle — softens shadows the way a
 *          long multi-emitter fixture does (partial shadows, never black holes).
 *  - hemi: light scattered by the water from above (sky term) and bounced off the substrate
 *          (ground term — white sand lifts the undersides of fish, aqua-soil does not).
 *  - room: faint ambient room light leaking through the glass.
 * Intensities follow world.env (which already ramps sunrise/sunset) with a short extra
 * smoothing so on/off switches never pop.
 */

/** Blue moonlight LEDs (≈460 nm), linear RGB. */
const MOON_COLOR = new Color(0.1, 0.24, 1.0);
/** Warm-ish room light, linear RGB. */
const ROOM_COLOR = new Color(1.0, 0.78, 0.58);
/** Peak irradiance scale of the main bar at the surface (tuned with ACES exposure 1). */
const KEY_INTENSITY = 5.0;
const FILL_INTENSITY = 1.1;
const MOON_INTENSITY = 0.7;

export class Lighting {
  readonly key: DirectionalLight;
  readonly fill: DirectionalLight;
  readonly hemi: HemisphereLight;
  readonly room: AmbientLight;
  /** Unit vector toward the key light. */
  readonly keyDir = new Vector3(0.1, 1, 0.22).normalize();
  readonly fillDir = new Vector3(-0.22, 1, 0.12).normalize();

  private substrateAlbedo = new Color(0.5, 0.45, 0.38);
  private smoothed = { day: -1, moon: 0, room: 0 };
  private lightColor = new Color(1, 1, 1);
  private tmpColor = new Color();
  private tmpColor2 = new Color();
  private m = new Matrix4();
  private v = new Vector3();
  private center = new Vector3();

  constructor(scene: Scene) {
    this.key = new DirectionalLight(0xffffff, KEY_INTENSITY);
    this.key.name = 'env.key';
    this.key.castShadow = true;
    this.key.shadow.camera.up.set(0, 0, -1); // stable basis for a near-vertical light
    this.key.shadow.bias = -0.0003;
    this.key.shadow.normalBias = 0.0012;
    this.key.shadow.radius = 5;
    // Density right under an occluder; the soft-shadow lookup fades it further with occluder
    // distance (water scattering), see UW_SHADOW_PARS_GLSL.
    this.key.shadow.intensity = 0.88;
    this.fill = new DirectionalLight(0xffffff, FILL_INTENSITY);
    this.fill.name = 'env.fill';
    this.hemi = new HemisphereLight(0xffffff, 0x886f55, 0.5);
    this.hemi.name = 'env.hemi';
    this.room = new AmbientLight(ROOM_COLOR, 0.02);
    this.room.name = 'env.room';
    scene.add(this.key, this.key.target, this.fill, this.fill.target, this.hemi, this.room);
    GLOBALS.uLightDir.value.copy(this.keyDir);
  }

  /** Average albedo (linear) of the floor, for the bounce term. */
  setSubstrateAlbedo(c: Color): void {
    this.substrateAlbedo.copy(c);
  }

  setShadows(enabled: boolean, mapSize: number): void {
    this.key.castShadow = enabled;
    if (this.key.shadow.mapSize.x !== mapSize) {
      this.key.shadow.mapSize.set(mapSize, mapSize);
      this.key.shadow.map?.dispose();
      this.key.shadow.map = null;
    }
    // (Penumbrae are computed in meters by the soft-shadow lookup, independent of resolution.)
  }

  /** Place lights and fit the shadow frustum tightly around the tank interior. */
  fit(tank: TankState): void {
    const b = tankBounds(tank);
    this.center.set(0, b.height / 2, 0);
    const dist = b.height + 1.0;
    this.key.position.copy(this.center).addScaledVector(this.keyDir, dist);
    this.key.target.position.copy(this.center);
    this.fill.position.copy(this.center).addScaledVector(this.fillDir, dist);
    this.fill.target.position.copy(this.center);
    this.key.updateMatrixWorld();
    this.key.target.updateMatrixWorld();
    this.fill.updateMatrixWorld();
    this.fill.target.updateMatrixWorld();

    // Light-space bounds of the 8 tank corners (same basis three.js uses for the shadow camera).
    const cam = this.key.shadow.camera;
    this.m.lookAt(this.key.position, this.center, cam.up);
    const ex = this.v.set(0, 0, 0);
    let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity, minD = Infinity, maxD = -Infinity;
    const e = this.m.elements;
    for (let i = 0; i < 8; i++) {
      const x = i & 1 ? b.halfW : -b.halfW;
      const y = i & 2 ? b.height : 0;
      const z = i & 4 ? b.halfD : -b.halfD;
      ex.set(x - this.key.position.x, y - this.key.position.y, z - this.key.position.z);
      const lx = ex.x * e[0] + ex.y * e[1] + ex.z * e[2];
      const ly = ex.x * e[4] + ex.y * e[5] + ex.z * e[6];
      const lz = -(ex.x * e[8] + ex.y * e[9] + ex.z * e[10]);
      minX = Math.min(minX, lx); maxX = Math.max(maxX, lx);
      minY = Math.min(minY, ly); maxY = Math.max(maxY, ly);
      minD = Math.min(minD, lz); maxD = Math.max(maxD, lz);
    }
    const pad = 0.01;
    cam.left = minX - pad;
    cam.right = maxX + pad;
    cam.bottom = minY - pad;
    cam.top = maxY + pad;
    cam.near = Math.max(0.01, minD - 0.05);
    cam.far = maxD + 0.05;
    cam.updateProjectionMatrix();
    this.key.shadow.needsUpdate = true;
    // Metric frame of the shadow map for the soft-shadow lookup (penumbra in meters → uv).
    GLOBALS.uShadowFrame.value.set(cam.right - cam.left, cam.top - cam.bottom, cam.far - cam.near, 0.25);
  }

  /**
   * Perceived lamp color: the eye (or a camera's white balance) adapts about halfway to the
   * lamp, so a 14000 K reef light reads cool white-blue rather than deep blue, and a 2300 K
   * sunrise warm rather than orange. Partial von Kries adaptation in linear RGB; luminance is
   * kept (with a floor, since blue-heavy lamps are rated by PAR, not lumens).
   */
  static perceivedLightColor(rgb: readonly number[], out: Color, adapt = 0.5): Color {
    const lum = (r: number, g: number, b: number) => 0.2126 * r + 0.7152 * g + 0.0722 * b;
    const L = Math.max(1e-4, lum(rgb[0], rgb[1], rgb[2]));
    const k = 1 - adapt;
    const r = Math.pow(rgb[0] / L, k), g = Math.pow(rgb[1] / L, k), b = Math.pow(rgb[2] / L, k);
    const n = Math.max(1e-4, lum(r, g, b));
    const target = Math.max(L, 0.88);
    return out.setRGB((r / n) * target, (g / n) * target, (b / n) * target);
  }

  /** Per frame: drive intensities/colors from the environment. */
  update(env: EnvState, dt: number): void {
    const s = this.smoothed;
    const k = s.day < 0 ? 1 : 1 - Math.exp(-dt / 1.2);
    if (s.day < 0) s.day = env.daylight;
    s.day += (env.daylight - s.day) * k;
    s.moon += (env.moonlight - s.moon) * k;
    s.room += (env.roomLight - s.room) * k;
    const day = s.day, moon = s.moon, room = s.room;
    Lighting.perceivedLightColor(env.lightColor, this.lightColor);

    // Key: daylight bar crossfades into the blue moon LEDs.
    const keyCol = this.tmpColor.copy(this.lightColor).multiplyScalar(day * KEY_INTENSITY);
    keyCol.add(this.tmpColor2.copy(MOON_COLOR).multiplyScalar(moon * MOON_INTENSITY));
    const keyI = Math.max(keyCol.r, keyCol.g, keyCol.b);
    this.key.intensity = keyI;
    if (keyI > 1e-6) this.key.color.copy(keyCol).multiplyScalar(1 / keyI);
    // (castShadow stays constant: toggling it would recompile every material at dusk.)

    this.fill.color.copy(this.lightColor);
    this.fill.intensity = day * FILL_INTENSITY + moon * 0.08;

    // Hemisphere: water-scattered sky light from above; bounce from the floor below.
    const tint = GLOBALS.uWaterTint.value;
    this.hemi.color
      .copy(this.lightColor)
      // Light scattered down by the water is a little greener/bluer than the lamp.
      .multiply(this.tmpColor2.setRGB(0.55 + 0.4 * tint.r, 0.55 + 0.42 * tint.g, 0.55 + 0.45 * tint.b))
      .multiplyScalar(day * 0.75)
      .add(this.tmpColor.copy(MOON_COLOR).multiplyScalar(moon * 0.16));
    this.hemi.groundColor
      .copy(this.substrateAlbedo)
      .multiply(this.lightColor)
      .multiplyScalar(day * 0.9)
      .add(this.tmpColor.copy(MOON_COLOR).multiplyScalar(moon * 0.03));
    this.hemi.intensity = 1;

    this.room.color.copy(ROOM_COLOR);
    // Room light leaking in: a little by day, almost nothing in a dark room at night (it would
    // otherwise tint the blue moonlight purple).
    this.room.intensity = 0.002 + room * (0.006 + 0.03 * Math.min(1, day));
  }

  /** Overall light level 0..1+ (for exposure adaptation and the veil). */
  get level(): number {
    return this.smoothed.day + this.smoothed.moon * 0.12 + this.smoothed.room * 0.02;
  }
  get day(): number {
    return Math.max(0, this.smoothed.day);
  }
  get moon(): number {
    return this.smoothed.moon;
  }
  get roomLevel(): number {
    return this.smoothed.room;
  }
  get color(): Color {
    return this.lightColor;
  }

  dispose(): void {
    this.key.shadow.map?.dispose();
    for (const o of [this.key, this.fill, this.hemi, this.room] as Object3D[]) o.removeFromParent();
  }
}
