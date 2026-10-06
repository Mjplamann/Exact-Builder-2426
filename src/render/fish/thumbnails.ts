import {
  AmbientLight,
  Color,
  DataUtils,
  DirectionalLight,
  HalfFloatType,
  HemisphereLight,
  Matrix4,
  PerspectiveCamera,
  Quaternion,
  Scene,
  Vector3,
  WebGLRenderTarget,
  type Texture,
  type WebGLRenderer,
} from 'three';
import type { Sex, Species } from '../../core/types';
import { GLOBALS } from '../globals';
import { sexMatters } from './archetypes';
import { FishVariant } from './variant';

/**
 * Catalog portraits: a 3/4 side view of one animal on a transparent background, lit like an
 * underwater studio (soft key from above-front, cool fill, gentle rim). Renders with the shared
 * WebGL renderer into a half-float target and tone-maps on the CPU, so the main canvas is
 * untouched. Typical cost after the first shader compile: a few ms per portrait.
 */
export class ThumbnailRenderer {
  private renderer: WebGLRenderer;
  private scene = new Scene();
  private camera = new PerspectiveCamera(24, 1, 0.01, 20);
  private rt: WebGLRenderTarget | null = null;
  private rtSize = 0;
  private envMap: Texture | null;
  private canvas: HTMLCanvasElement | null = null;
  private buf16: Uint16Array | null = null;

  constructor(renderer: WebGLRenderer, envMap: Texture | null) {
    this.renderer = renderer;
    this.envMap = envMap;
    const key = new DirectionalLight(new Color(1, 0.97, 0.92), 2.6);
    key.position.set(0.6, 2.2, 1.6);
    const fill = new DirectionalLight(new Color(0.65, 0.8, 1), 0.7);
    fill.position.set(-1.5, 0.2, 1.4);
    const rim = new DirectionalLight(new Color(0.75, 0.9, 1), 1.3);
    rim.position.set(-0.4, 1.2, -2);
    const hemi = new HemisphereLight(new Color(0.75, 0.86, 0.95), new Color(0.2, 0.18, 0.15), 0.55);
    this.scene.add(key, fill, rim, hemi, new AmbientLight(0xffffff, 0.08));
  }

  /** Render a portrait; returns a PNG data URL ('' if rendering is unavailable). */
  render(species: Species, size: number): string {
    const sex: Sex = sexMatters(species, 'male') ? 'male' : 'unknown';
    const v = new FishVariant(`thumb:${species.id}`, species, sex, { envMap: this.envMap, underwater: false, thumbnail: true });
    try {
      return this.renderVariant(v, size);
    } finally {
      v.dispose();
    }
  }

  private renderVariant(v: FishVariant, size: number): string {
    const r = this.renderer;
    const ss = Math.round(size * (size < 200 ? 1.5 : 1)); // supersample small portraits
    if (!this.rt || this.rtSize !== ss) {
      this.rt?.dispose();
      this.rt = new WebGLRenderTarget(ss, ss, { type: HalfFloatType, samples: 4, depthBuffer: true });
      this.rtSize = ss;
    }
    // Pose: 3/4 view, head toward the viewer's right and slightly toward the camera.
    const kind = v.body.kind;
    const isFish = kind === 'fish' || kind === 'seahorse' || kind === 'ray';
    const yaw = kind === 'ray' || kind === 'starfish' || kind === 'brittle-star' || kind === 'urchin' ? -0.5 : -0.42;
    const q = new Quaternion().setFromAxisAngle(new Vector3(0, 1, 0), yaw);
    const m = new Matrix4().compose(new Vector3(), q, new Vector3(1, 1, 1));
    v.bodyMesh.setMatrixAt(0, m);
    v.bodyMesh.instanceMatrix.needsUpdate = true;
    v.bodyMesh.count = 1;
    v.finMesh.count = 1;
    // A relaxed swimming pose: gentle S-curve, fins spread.
    v.aA.setXYZW(0, 1.9, isFish ? 0.22 : 0.3, 0, 0.6);
    v.aB.setXYZW(0, 0.25, 0.05, 1.2, 0);
    v.aLook.setXYZW(0, 0, 1, 1, 0);
    v.aState.setXYZW(0, 0, 0, 0, 0.37);
    for (const a of [v.aA, v.aB, v.aLook, v.aState]) a.needsUpdate = true;
    v.mats.setLight(1, 0);
    this.scene.add(v.bodyMesh, v.finMesh);

    // Frame: bounding box of body + fins in the posed orientation.
    v.bodyMesh.geometry.computeBoundingBox();
    v.finMesh.geometry.computeBoundingBox();
    const box = v.bodyMesh.geometry.boundingBox!.clone().union(v.finMesh.geometry.boundingBox!);
    box.applyMatrix4(m);
    const c = box.getCenter(new Vector3());
    const sz = box.getSize(new Vector3());
    const elev = kind === 'starfish' || kind === 'brittle-star' || kind === 'urchin' || kind === 'crab' ? 0.55 : 0.18;
    const fov = (this.camera.fov * Math.PI) / 180;
    const radius = Math.max(sz.x * 0.55, sz.y * 0.6, sz.z * 0.45, 0.05);
    const dist = (radius / Math.tan(fov / 2)) * 1.08;
    this.camera.position.set(c.x, c.y + Math.sin(elev) * dist, c.z + Math.cos(elev) * dist);
    this.camera.lookAt(c);
    this.camera.updateProjectionMatrix();

    const prevTarget = r.getRenderTarget();
    const prevClear = r.getClearColor(new Color());
    const prevAlpha = r.getClearAlpha();
    const prevUW = GLOBALS.uUnderwater?.value;
    if (GLOBALS.uUnderwater) GLOBALS.uUnderwater.value = 0;
    try {
      r.setRenderTarget(this.rt);
      r.setClearColor(0x000000, 0);
      r.clear(true, true, true);
      r.render(this.scene, this.camera);
      const n = ss * ss * 4;
      if (!this.buf16 || this.buf16.length !== n) this.buf16 = new Uint16Array(n);
      r.readRenderTargetPixels(this.rt, 0, 0, ss, ss, this.buf16);
    } finally {
      r.setRenderTarget(prevTarget);
      r.setClearColor(prevClear, prevAlpha);
      if (GLOBALS.uUnderwater && prevUW !== undefined) GLOBALS.uUnderwater.value = prevUW;
      this.scene.remove(v.bodyMesh, v.finMesh);
    }
    return this.encode(this.buf16!, ss, size);
  }

  /** Linear premultiplied half floats → tone-mapped sRGB PNG (downsampled to `size`). */
  private encode(src: Uint16Array, ss: number, size: number): string {
    if (typeof document === 'undefined') return '';
    if (!this.canvas) this.canvas = document.createElement('canvas');
    const cv = this.canvas;
    cv.width = size;
    cv.height = size;
    const ctx = cv.getContext('2d');
    if (!ctx) return '';
    const img = ctx.createImageData(size, size);
    const d = img.data;
    const k = ss / size;
    const aces = (x: number) => {
      // Narkowicz ACES approximation, gently exposed.
      x *= 0.95;
      return Math.min(1, Math.max(0, (x * (2.51 * x + 0.03)) / (x * (2.43 * x + 0.59) + 0.14)));
    };
    const enc = (x: number) => (x <= 0.0031308 ? 12.92 * x : 1.055 * Math.pow(x, 1 / 2.4) - 0.055);
    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        // Box filter the supersampled block; the target is bottom-up.
        let r = 0, g = 0, b = 0, a = 0, cnt = 0;
        const sx0 = Math.floor(x * k), sx1 = Math.max(sx0 + 1, Math.floor((x + 1) * k));
        const sy0 = Math.floor(y * k), sy1 = Math.max(sy0 + 1, Math.floor((y + 1) * k));
        for (let sy = sy0; sy < sy1; sy++) {
          const row = (ss - 1 - sy) * ss;
          for (let sx = sx0; sx < sx1; sx++) {
            const i = (row + sx) * 4;
            r += DataUtils.fromHalfFloat(src[i]);
            g += DataUtils.fromHalfFloat(src[i + 1]);
            b += DataUtils.fromHalfFloat(src[i + 2]);
            a += DataUtils.fromHalfFloat(src[i + 3]);
            cnt++;
          }
        }
        r /= cnt;
        g /= cnt;
        b /= cnt;
        a = Math.min(1, Math.max(0, a / cnt));
        const o = (y * size + x) * 4;
        if (a < 1e-3) {
          d[o + 3] = 0;
          continue;
        }
        // Un-premultiply (blending wrote color·alpha over a transparent clear).
        d[o] = Math.round(enc(aces(r / a)) * 255);
        d[o + 1] = Math.round(enc(aces(g / a)) * 255);
        d[o + 2] = Math.round(enc(aces(b / a)) * 255);
        d[o + 3] = Math.round(a * 255);
      }
    }
    ctx.putImageData(img, 0, 0);
    return cv.toDataURL('image/png');
  }

  dispose(): void {
    this.rt?.dispose();
    this.rt = null;
  }
}
