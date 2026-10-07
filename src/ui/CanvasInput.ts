/**
 * Pointer, wheel and touch handling on the tank canvas, routed by the current tool:
 *  - view:  click a fish → info card (during a tour the camera stays with it); click empty water
 *           → deselect (following carries on: the chip at the top stops it);
 *           double-click/tap on the glass → a gentle tap (fish startle); on an animal → follow it;
 *  - feed:  click → drop a pinch at the surface above that point;
 *  - scape: delegated to ScapeTool (place, select, drag, rotate, resize).
 * In every mode: wheel / trackpad pinch zoom toward the cursor; two fingers pinch-zoom toward
 * their centre and pan together; a quick two-finger tap returns to the whole tank; drag pans the
 * view (one finger or left-drag on empty water, right/middle-drag) with a gentle glide on release
 * — in portrait on a phone the tank is much wider than the screen, so a swipe is how you look
 * along it. Every view change goes through the ViewRouter (follow / tour aware).
 *
 * A double-tap stays "tap the glass" rather than a zoom: it is the one way to interact with the
 * fish physically, and a double-tap zoom would fire on every knock. Pinch, the + / − buttons and
 * the two-finger tap cover zooming instead.
 */
import { Plane, Vector3 } from 'three';
import { tankBounds } from '../core/tankGeometry';
import type { UIHost } from './context';
import { setClass } from './dom';
import type { ScapeTool } from './ScapeTool';
import { pinchMove, wheelSteps, ZOOM_STEP_RATIO, type PinchMove, type PinchPoints, type ViewRouter } from './ViewControls';

export type Mode = 'view' | 'feed' | 'scape';

interface Pt {
  x: number;
  y: number;
  type: string;
}

const CLICK_SLOP = 6;
/** Fingers wobble more than a mouse: a tap may drift this far before it becomes a swipe. */
const TOUCH_SLOP = 10;
const CLICK_MS = 600;
const DOUBLE_TAP_MS = 320;
/** Glide after a released swipe: velocity decays with this time constant (s); below MIN it stops. */
const GLIDE_TAU = 0.3;
const GLIDE_MIN_PX_S = 40;
/** A flick never coasts faster than this (px/s): the glide stays a soft drift, even zoomed in. */
const GLIDE_MAX_PX_S = 1800;
/** Two fingers down and up this quickly, without travelling, are a tap (back to the whole tank). */
const TWO_FINGER_TAP_MS = 280;
/** …and their centre and spread together drift less than this (px). */
const TWO_FINGER_TAP_SLOP = 20;

/**
 * When an input event happened (ms, performance.now() time base). Taps are timed by their events,
 * not by when a busy main thread got round to them.
 */
function at(e: Event): number {
  const t = e.timeStamp;
  return Number.isFinite(t) && t > 0 ? t : performance.now();
}

/** A Safari trackpad pinch (WebKit GestureEvent). */
interface GestureLike extends UIEvent {
  scale: number;
  clientX: number;
  clientY: number;
}

export class CanvasInput {
  mode: Mode = 'view';
  private canvas: HTMLCanvasElement;
  private pointers = new Map<number, Pt>();
  private down: { id: number; x: number; y: number; t: number; button: number; scapeDrag: boolean } | null = null;
  private panning: { id: number; x: number; y: number; t: number; vx: number; vy: number; glide: boolean } | null = null;
  /** Release velocity of the last swipe (px/s), decayed in frame(). */
  private glide = { vx: 0, vy: 0 };
  /** When the last touch tap ended (a browser dblclick right after a manual double-tap is a duplicate). */
  private lastTouchUp = 0;
  /** Two-finger gesture: the pair's ids, their last positions, when it began and how far it travelled (px). */
  private pinch: { a: number; b: number; prev: PinchPoints; t0: number; travel: number } | null = null;
  private pinchCur: PinchPoints = { ax: 0, ay: 0, bx: 0, by: 0 };
  private pinchOut: PinchMove = { steps: 0, cx: 0, cy: 0, dx: 0, dy: 0, ds: 0 };
  /** Safari trackpad pinch in progress: its last cumulative scale. */
  private gesture: number | null = null;
  /** Last touch/pen activity (ms): WebKit also reports touch pinches as gesture events — ignore those. */
  private lastTouchAt = -1e9;
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
    private view: ViewRouter,
  ) {
    this.canvas = host.app.engine.renderer.domElement;
    const c = this.canvas;
    c.addEventListener('pointerdown', (e) => this.onDown(e));
    c.addEventListener('pointermove', (e) => this.onMove(e));
    c.addEventListener('pointerup', (e) => this.onUp(e));
    c.addEventListener('pointercancel', (e) => this.onCancel(e));
    c.addEventListener('pointerleave', () => this.setCursor('default'));
    c.addEventListener('wheel', (e) => this.onWheel(e), { passive: false });
    // Safari (macOS) reports trackpad pinches as gesture events rather than ctrl+wheel.
    const nonPassive = { passive: false } as AddEventListenerOptions;
    c.addEventListener('gesturestart', (e) => this.onGesture(e as GestureLike, true), nonPassive);
    c.addEventListener('gesturechange', (e) => this.onGesture(e as GestureLike, false), nonPassive);
    c.addEventListener('gestureend', () => (this.gesture = null));
    c.addEventListener('dblclick', (e) => {
      // Touch double-taps are handled in onUp; ignore the browser's duplicate.
      if (at(e) - this.lastTouchUp < 700) return;
      this.onDouble(e.clientX, e.clientY);
    });
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
    if (e.pointerType !== 'mouse') this.lastTouchAt = at(e);
    this.glide.vx = this.glide.vy = 0;
    if (this.pointers.size === 2) {
      // Second finger: switch to pinch/pan; cancel any pending tap, swipe or item drag.
      if (this.down?.scapeDrag) this.scape.cancelDrag();
      this.down = null;
      this.panning = null;
      this.startPinch(at(e));
      return;
    }
    if (e.button === 1 || e.button === 2) {
      this.startPan(e.pointerId, e.clientX, e.clientY, false, at(e));
      return;
    }
    if (e.button !== 0) return;
    let scapeDrag = false;
    if (this.mode === 'scape') {
      scapeDrag = this.scape.pointerDown(e);
      if (scapeDrag) {
        try {
          this.canvas.setPointerCapture(e.pointerId);
        } catch {
          /* synthetic pointer */
        }
        this.setCursor('grabbing');
      }
    }
    this.down = { id: e.pointerId, x: e.clientX, y: e.clientY, t: at(e), button: e.button, scapeDrag };
  }

  private onMove(e: PointerEvent): void {
    const p = this.pointers.get(e.pointerId);
    if (p) {
      p.x = e.clientX;
      p.y = e.clientY;
      if (e.pointerType !== 'mouse') this.lastTouchAt = at(e);
    }
    if (this.pinch && this.pointers.size >= 2) return this.movePinch();
    const pn = this.panning;
    if (pn && e.pointerId === pn.id) {
      const dx = e.clientX - pn.x;
      const dy = e.clientY - pn.y;
      const now = at(e);
      const dt = Math.max(1, now - pn.t) / 1000;
      // Smoothed release velocity (px/s) for the glide.
      const k = Math.min(1, dt / 0.06);
      pn.vx += (dx / dt - pn.vx) * k;
      pn.vy += (dy / dt - pn.vy) * k;
      pn.x = e.clientX;
      pn.y = e.clientY;
      pn.t = now;
      this.pan(dx, dy);
      return;
    }
    if (this.down?.scapeDrag) {
      this.scape.pointerMove(e);
      return;
    }
    const d = this.down;
    if (d && d.id === e.pointerId && !this.pinch) {
      // A press on empty water that travels becomes a swipe/drag of the view (no click).
      const slop = e.pointerType === 'mouse' ? CLICK_SLOP : TOUCH_SLOP;
      if (Math.hypot(e.clientX - d.x, e.clientY - d.y) > slop) {
        this.down = null;
        this.startPan(e.pointerId, d.x, d.y, true, d.t);
        this.onMove(e);
      }
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
    const pc = this.pinch;
    if (pc) {
      if (e.pointerId !== pc.a && e.pointerId !== pc.b) return;
      if (this.pointers.size >= 2) {
        // A third finger was down: carry on with the remaining pair.
        this.startPinch(at(e));
        return;
      }
      this.pinch = null;
      if (at(e) - pc.t0 < TWO_FINGER_TAP_MS && pc.travel < TWO_FINGER_TAP_SLOP) {
        // A quick two-finger tap: back to the whole tank.
        if (this.view.isClose()) this.view.reset();
        return;
      }
      // One finger stays down: it keeps looking around (unless an animal is being followed — a
      // pinch only reframed it, and the lagging finger must not let go of it).
      const rest = this.pointers.entries().next().value;
      if (rest && !this.host.app.world.follow) this.startPan(rest[0], rest[1].x, rest[1].y, true, at(e));
      return;
    }
    const pn = this.panning;
    if (pn && e.pointerId === pn.id) {
      this.panning = null;
      this.setCursor('default');
      // Let a swipe coast to a stop — unless the finger rested before lifting.
      if (pn.glide && at(e) - pn.t < 90) {
        const v = Math.hypot(pn.vx, pn.vy);
        const k = v > GLIDE_MAX_PX_S ? GLIDE_MAX_PX_S / v : 1;
        this.glide.vx = pn.vx * k;
        this.glide.vy = pn.vy * k;
      }
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
    if (moved > CLICK_SLOP || at(e) - d.t > CLICK_MS) return;
    this.click(e.clientX, e.clientY);
    if (e.pointerType !== 'mouse') {
      // Manual double-tap (dblclick is unreliable on touch). Timed by the events themselves: the
      // first tap opens the animal's card, and that work must not eat into the double-tap window.
      const now = at(e);
      this.lastTouchUp = now;
      if (now - this.lastTap.t < DOUBLE_TAP_MS && Math.hypot(e.clientX - this.lastTap.x, e.clientY - this.lastTap.y) < 30) {
        this.onDouble(e.clientX, e.clientY);
        this.lastTap.t = 0;
      } else this.lastTap = { t: now, x: e.clientX, y: e.clientY };
    }
  }

  private onCancel(e: PointerEvent): void {
    this.pointers.delete(e.pointerId);
    if (this.pinch && this.pointers.size < 2) this.pinch = null;
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
      // Picking an animal during a tour hands the camera to it.
      this.view.picked(hit.id);
      // The second tap of a double-tap must not replay the card's entrance.
      if (app.world.selection.fishId !== hit.id || this.host.openPanelId) this.host.showFish(hit.id);
    } else if (app.world.selection.fishId || app.world.selection.decorId || app.world.selection.plantId) {
      // Tapping the water puts the card away; it never stops the camera (a tap may only be meant
      // to bring the controls back).
      app.select({});
    }
  }

  /** Double-click / double-tap: on an animal, follow it; elsewhere a gentle knock on the front glass. */
  private onDouble(x: number, y: number): void {
    if (this.mode !== 'view') return;
    const app = this.host.app;
    const hit = app.pickAt(x, y);
    if (hit.kind === 'fish') {
      this.view.follow(hit.id);
      return;
    }
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

  private startPan(id: number, x: number, y: number, glide: boolean, t = performance.now()): void {
    this.panning = { id, x, y, t, vx: 0, vy: 0, glide };
    try {
      this.canvas.setPointerCapture(id);
    } catch {
      /* synthetic or already-released pointer */
    }
    if (this.hoverTimer) {
      clearTimeout(this.hoverTimer);
      this.hoverTimer = 0;
    }
    this.setCursor('grabbing');
  }

  /** Per frame (from UI.update): the soft glide after a swipe. No allocations. */
  frame(dt: number): void {
    const g = this.glide;
    if (g.vx === 0 && g.vy === 0) return;
    if (Math.hypot(g.vx, g.vy) < GLIDE_MIN_PX_S || this.panning || this.pinch) {
      g.vx = g.vy = 0;
      return;
    }
    const step = Math.min(0.1, Math.max(0, dt));
    this.pan(g.vx * step, g.vy * step);
    const decay = Math.exp(-step / GLIDE_TAU);
    g.vx *= decay;
    g.vy *= decay;
  }

  private onWheel(e: WheelEvent): void {
    e.preventDefault();
    if (this.mode === 'scape' && !e.ctrlKey && this.scape.wheel(e)) return;
    // Safari may echo its own pinch gesture as ctrl+wheel; the gesture handler has it.
    if (this.gesture !== null) return;
    const steps = wheelSteps(e);
    if (steps) this.view.zoom(steps, e.clientX, e.clientY);
  }

  /** Safari trackpad pinch: `scale` is cumulative since the gesture began. */
  private onGesture(e: GestureLike, start: boolean): void {
    e.preventDefault();
    // On touch screens WebKit fires these alongside the pointers the pinch code already follows.
    if (this.pointers.size || at(e) - this.lastTouchAt < 600) return;
    const s = e.scale > 0 ? e.scale : 1;
    if (start || this.gesture === null) {
      this.gesture = s;
      return;
    }
    const steps = Math.log(s / this.gesture) / Math.log(ZOOM_STEP_RATIO);
    this.gesture = s;
    if (Number.isFinite(steps) && Math.abs(steps) > 1e-3) this.view.zoom(steps, e.clientX, e.clientY);
  }

  /** Screen-pixel drag → view pan (the tank follows the pointer). */
  private pan(dxPx: number, dyPx: number): void {
    this.view.pan(dxPx, dyPx);
  }

  private startPinch(now: number): void {
    const it = this.pointers.entries();
    const [a, pa] = it.next().value as [number, Pt];
    const [b, pb] = it.next().value as [number, Pt];
    // A pair that changes mid-gesture (a third finger) is no longer a tap.
    const t0 = this.pinch ? -Infinity : now;
    this.pinch = { a, b, prev: { ax: pa.x, ay: pa.y, bx: pb.x, by: pb.y }, t0, travel: 0 };
  }

  /**
   * Two fingers: pan with their centre, then zoom about it so the tank stays under them. While
   * following, a pinch only reframes the animal (a pan would let go of it).
   */
  private movePinch(): void {
    const p = this.pinch!;
    const a = this.pointers.get(p.a);
    const b = this.pointers.get(p.b);
    if (!a || !b) return;
    const cur = this.pinchCur;
    cur.ax = a.x;
    cur.ay = a.y;
    cur.bx = b.x;
    cur.by = b.y;
    const m = pinchMove(p.prev, cur, this.pinchOut);
    p.travel += Math.abs(m.dx) + Math.abs(m.dy) + Math.abs(m.ds);
    // Zoom about where the fingers' centre WAS, then carry that spot along with them: the first
    // step anchors what was under the fingers when they landed, and every later step keeps that
    // same spot under them (the camera moves the anchor with each pan) — browsers report each
    // finger's move separately, so the centre jitters by half a step between events.
    if (Math.abs(m.steps) > 1e-3) this.view.zoom(Math.max(-3, Math.min(3, m.steps)), m.cx - m.dx, m.cy - m.dy);
    if ((m.dx || m.dy) && !this.host.app.world.follow) this.pan(m.dx, m.dy);
    p.prev.ax = cur.ax;
    p.prev.ay = cur.ay;
    p.prev.bx = cur.bx;
    p.prev.by = cur.by;
  }
}
