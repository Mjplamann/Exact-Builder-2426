/**
 * Pointer, wheel and touch handling on the tank canvas, routed by the current tool:
 *  - view:  click a fish → info card; click empty water → deselect & stop following;
 *           double-click/tap on the glass → a gentle tap (fish startle);
 *  - feed:  click → drop a pinch at the surface above that point;
 *  - scape: delegated to ScapeTool (place, select, drag, rotate, resize).
 * In every mode: wheel / pinch zoom, right-drag / two-finger drag pan.
 */
import { Plane, Vector3 } from 'three';
import { tankBounds } from '../core/tankGeometry';
import type { UIHost } from './context';
import { setClass } from './dom';
import type { ScapeTool } from './ScapeTool';

export type Mode = 'view' | 'feed' | 'scape';

interface Pt {
  x: number;
  y: number;
  type: string;
}

const CLICK_SLOP = 6;
const CLICK_MS = 600;
const DOUBLE_TAP_MS = 320;

export class CanvasInput {
  mode: Mode = 'view';
  private canvas: HTMLCanvasElement;
  private pointers = new Map<number, Pt>();
  private down: { id: number; x: number; y: number; t: number; button: number; scapeDrag: boolean } | null = null;
  private panning: { id: number; x: number; y: number } | null = null;
  private pinch: { d: number; mx: number; my: number } | null = null;
  private lastTap = { t: 0, x: 0, y: 0 };
  private hoverTimer = 0;
  private hoverPos = { x: 0, y: 0 };
  private plane = new Plane(new Vector3(0, 0, 1), 0);
  private hit = new Vector3();
  /** Visual feedback for feeding clicks. */
  onFeedAt: (x: number, y: number) => void = () => {};

  constructor(
    private host: UIHost,
    private scape: ScapeTool,
  ) {
    this.canvas = host.app.engine.renderer.domElement;
    const c = this.canvas;
    c.addEventListener('pointerdown', (e) => this.onDown(e));
    c.addEventListener('pointermove', (e) => this.onMove(e));
    c.addEventListener('pointerup', (e) => this.onUp(e));
    c.addEventListener('pointercancel', (e) => this.onCancel(e));
    c.addEventListener('pointerleave', () => this.setCursor('default'));
    c.addEventListener('wheel', (e) => this.onWheel(e), { passive: false });
    c.addEventListener('dblclick', (e) => this.onDouble(e.clientX, e.clientY));
    c.addEventListener('contextmenu', (e) => e.preventDefault());
  }

  setMode(m: Mode): void {
    this.mode = m;
    setClass(this.canvas, 'aq-cursor-feed', m === 'feed');
    this.setCursor('default');
  }

  private setCursor(kind: 'default' | 'pointer' | 'grab' | 'grabbing' | 'place'): void {
    const c = this.canvas;
    setClass(c, 'aq-cursor-pointer', kind === 'pointer');
    setClass(c, 'aq-cursor-grab', kind === 'grab');
    setClass(c, 'aq-cursor-grabbing', kind === 'grabbing');
    setClass(c, 'aq-cursor-place', kind === 'place');
  }

  // ------------------------------------------------------------------------------------------

  private onDown(e: PointerEvent): void {
    this.pointers.set(e.pointerId, { x: e.clientX, y: e.clientY, type: e.pointerType });
    if (this.pointers.size === 2) {
      // Second finger: switch to pinch/pan; cancel any pending tap or drag.
      this.down = null;
      this.startPinch();
      return;
    }
    if (e.button === 1 || e.button === 2) {
      this.panning = { id: e.pointerId, x: e.clientX, y: e.clientY };
      this.canvas.setPointerCapture(e.pointerId);
      this.setCursor('grabbing');
      return;
    }
    if (e.button !== 0) return;
    let scapeDrag = false;
    if (this.mode === 'scape') {
      scapeDrag = this.scape.pointerDown(e);
      if (scapeDrag) {
        this.canvas.setPointerCapture(e.pointerId);
        this.setCursor('grabbing');
      }
    }
    this.down = { id: e.pointerId, x: e.clientX, y: e.clientY, t: performance.now(), button: e.button, scapeDrag };
  }

  private onMove(e: PointerEvent): void {
    const p = this.pointers.get(e.pointerId);
    if (p) {
      p.x = e.clientX;
      p.y = e.clientY;
    }
    if (this.pinch && this.pointers.size >= 2) return this.movePinch();
    if (this.panning && e.pointerId === this.panning.id) {
      const dx = e.clientX - this.panning.x;
      const dy = e.clientY - this.panning.y;
      this.panning.x = e.clientX;
      this.panning.y = e.clientY;
      this.pan(dx, dy);
      return;
    }
    if (this.down?.scapeDrag) {
      this.scape.pointerMove(e);
      return;
    }
    if (e.pointerType === 'mouse' && !e.buttons) {
      this.hoverPos.x = e.clientX;
      this.hoverPos.y = e.clientY;
      if (!this.hoverTimer) this.hoverTimer = window.setTimeout(() => this.hover(), 110);
    }
  }

  private onUp(e: PointerEvent): void {
    this.pointers.delete(e.pointerId);
    if (this.pinch) {
      if (this.pointers.size < 2) this.pinch = null;
      return;
    }
    if (this.panning && e.pointerId === this.panning.id) {
      this.panning = null;
      this.setCursor('default');
      return;
    }
    const d = this.down;
    this.down = null;
    if (!d || d.id !== e.pointerId) return;
    if (d.scapeDrag) {
      // A press on an item already selected it (pointer-down); a drag moved it. No click either way.
      this.scape.pointerUp(e);
      this.setCursor('grab');
      return;
    }
    const moved = Math.hypot(e.clientX - d.x, e.clientY - d.y);
    if (moved > CLICK_SLOP || performance.now() - d.t > CLICK_MS) return;
    this.click(e.clientX, e.clientY);
    if (e.pointerType !== 'mouse') {
      // Manual double-tap (dblclick is unreliable on touch).
      const now = performance.now();
      if (now - this.lastTap.t < DOUBLE_TAP_MS && Math.hypot(e.clientX - this.lastTap.x, e.clientY - this.lastTap.y) < 30) {
        this.onDouble(e.clientX, e.clientY);
        this.lastTap.t = 0;
      } else this.lastTap = { t: now, x: e.clientX, y: e.clientY };
    }
  }

  private onCancel(e: PointerEvent): void {
    this.pointers.delete(e.pointerId);
    if (this.pointers.size < 2) this.pinch = null;
    if (this.panning?.id === e.pointerId) this.panning = null;
    if (this.down?.id === e.pointerId) {
      if (this.down.scapeDrag) this.scape.pointerUp(e);
      this.down = null;
    }
  }

  // ------------------------------------------------------------------------------------------

  private click(x: number, y: number): void {
    const app = this.host.app;
    if (this.mode === 'feed') {
      const kind = this.host.feedingKind;
      if (!kind) return;
      const p = app.surfacePointAt(x, y);
      if (!p) return;
      app.feed(kind, p, 1);
      this.host.lastFood = kind;
      this.onFeedAt(x, y);
      return;
    }
    if (this.mode === 'scape') {
      this.scape.click(x, y);
      return;
    }
    const hit = app.pickAt(x, y);
    if (hit.kind === 'fish') {
      this.host.showFish(hit.id);
    } else {
      if (app.world.follow) app.follow(null);
      if (app.world.selection.fishId || app.world.selection.decorId || app.world.selection.plantId) app.select({});
    }
  }

  /** Double-click / double-tap: a gentle knock on the front glass. */
  private onDouble(x: number, y: number): void {
    if (this.mode !== 'view') return;
    const app = this.host.app;
    const b = tankBounds(app.world.tank);
    const ray = app.engine.rayFromScreen(x, y);
    this.plane.set(this.plane.normal.set(0, 0, 1), -b.halfD);
    const p = ray.intersectPlane(this.plane, this.hit);
    if (!p || Math.abs(p.x) > b.halfW || p.y < 0 || p.y > b.height) return;
    app.tapGlass([p.x, p.y, b.halfD]);
  }

  private hover(): void {
    this.hoverTimer = 0;
    if (this.down || this.panning || this.pinch) return;
    const { x, y } = this.hoverPos;
    const app = this.host.app;
    if (this.mode === 'scape') {
      this.setCursor(this.scape.cursorAt(x, y));
      return;
    }
    if (this.mode === 'feed') return;
    let over = false;
    try {
      over = !!app.fishRenderer.pick(app.engine.rayFromScreen(x, y), app.world);
    } catch {
      over = false;
    }
    this.setCursor(over ? 'pointer' : 'default');
  }

  // ------------------------------------------------------------------------------------------
  // Zoom & pan
  // ------------------------------------------------------------------------------------------

  private onWheel(e: WheelEvent): void {
    e.preventDefault();
    if (this.mode === 'scape' && !e.ctrlKey && this.scape.wheel(e)) return;
    // Engine.nudgeView zoom is in wheel "notches" (≈12 % each). A mouse notch is ~100 px of
    // deltaY; trackpads send many small deltas (smooth zoom); a trackpad pinch arrives as
    // ctrl+wheel with deltas of a few px.
    const unit = e.deltaMode === 1 ? 33 : e.deltaMode === 2 ? 400 : 1;
    const px = e.deltaY * unit;
    const notches = e.ctrlKey ? -px * 0.025 : -px / 100;
    const dz = Math.max(-2, Math.min(2, notches));
    if (dz) this.host.app.engine.nudgeView(0, 0, dz);
  }

  /**
   * Screen-pixel drag → view pan. nudgeView takes fractions of the visible half-size, positive =
   * camera right/up; the camera moves opposite to the drag so the content follows the pointer.
   */
  private pan(dxPx: number, dyPx: number): void {
    const halfW = (window.innerWidth || 2) / 2;
    const halfH = (window.innerHeight || 2) / 2;
    this.host.app.engine.nudgeView(-dxPx / halfW, dyPx / halfH, 0);
  }

  private startPinch(): void {
    const [a, b] = [...this.pointers.values()];
    this.pinch = { d: Math.hypot(a.x - b.x, a.y - b.y) || 1, mx: (a.x + b.x) / 2, my: (a.y + b.y) / 2 };
  }

  private movePinch(): void {
    const it = this.pointers.values();
    const a = it.next().value as Pt;
    const b = it.next().value as Pt;
    const p = this.pinch!;
    const d = Math.hypot(a.x - b.x, a.y - b.y) || 1;
    const mx = (a.x + b.x) / 2;
    const my = (a.y + b.y) / 2;
    // Spread ratio → notches of 12 % so the content stays under the fingers.
    const dz = Math.log(d / p.d) / Math.log(1.12);
    if (Math.abs(dz) > 0.001) this.host.app.engine.nudgeView(0, 0, Math.max(-2, Math.min(2, dz)));
    this.pan(mx - p.mx, my - p.my);
    p.d = d;
    p.mx = mx;
    p.my = my;
  }
}
