/**
 * Close-up camera controls: the quiet zoom cluster (− / readout / + / whole tank, and Tour), the
 * follow / tour chip at the top, and the single place every view gesture is routed through
 * (wheel, pinch, drag, keys, buttons, the fish card), so following, touring and zooming stay
 * consistent. The App and camera own the mechanics; the router decides what an input means:
 *  - zooming while following frames the animal tighter or looser (the camera keeps it within
 *    what the lens can reach); zooming, panning or opening a panel ends a tour on the current shot;
 *  - picking an animal during a tour hands the camera to it;
 *  - the chip's ✕ and Esc end the tour and give the view back; Esc then stops following.
 *
 * `ViewRouter` holds the routing (no DOM, unit-tested); `ViewControls` adds the cluster and chip.
 * Everything goes through the AppApi view methods; `app.world` is only read.
 */
import type { AppApi } from '../app/AppApi';
import type { Species } from '../core/types';
import type { PanelId, UIHost } from './context';
import { h, setAttr, setClass, setText } from './dom';
import { icon } from './icons';

// ------------------------------------------------------------------------------------------
// Gesture maths (pure)
// ------------------------------------------------------------------------------------------

/** Zoom ratio of one `zoomBy` step (one mouse-wheel notch). Pinch maths relies on it. */
export const ZOOM_STEP_RATIO = 1.12;
const LN_STEP = Math.log(ZOOM_STEP_RATIO);
/** A button press or a + / − key: three notches (≈1.4×), so 1× → 8× takes six presses. */
export const BUTTON_STEPS = 3;
/** Wheel pixels per step: one mouse notch is ~100 px in Chromium, Safari and Firefox (3 lines). */
const WHEEL_PX_PER_STEP = 100;
const WHEEL_LINE_PX = 33;
const WHEEL_PAGE_PX = 400;
/**
 * Trackpad pinches arrive as ctrl+wheel with deltas of a few px per event: ten times the gain of a
 * scroll, which keeps the tank under the fingers (Chromium scales pages by e^(−Δ/100) per event).
 */
const PINCH_WHEEL_GAIN = 10;
/** Largest zoom change a single wheel event may make (momentum flings send huge deltas). */
const MAX_WHEEL_STEPS = 2;
/** Arrow keys look around by this fraction of the visible half-size per press (auto-repeat glides). */
const KEY_PAN = 0.12;
/** Below this the view counts as the whole tank (the camera eases, so allow a hair of slack). */
const CLOSE_ZOOM = 1.02;

export interface WheelLike {
  deltaY: number;
  deltaMode: number;
  ctrlKey: boolean;
}

/**
 * A wheel event → zoom steps (+ = closer). A mouse notch is one step; trackpads send many small
 * deltas, so their zoom is smooth and fractional; ctrl+wheel (a trackpad pinch) is more sensitive.
 */
export function wheelSteps(e: WheelLike): number {
  const unit = e.deltaMode === 1 ? WHEEL_LINE_PX : e.deltaMode === 2 ? WHEEL_PAGE_PX : 1;
  const steps = ((-e.deltaY * unit) / WHEEL_PX_PER_STEP) * (e.ctrlKey ? PINCH_WHEEL_GAIN : 1);
  if (!Number.isFinite(steps) || steps === 0) return 0;
  return Math.max(-MAX_WHEEL_STEPS, Math.min(MAX_WHEEL_STEPS, steps));
}

/** Two touch points (client px). */
export interface PinchPoints {
  ax: number;
  ay: number;
  bx: number;
  by: number;
}

export interface PinchMove {
  /** Zoom steps that keep the content under the fingers (+ = spread = closer). */
  steps: number;
  /** The new pinch centre: zoom anchors here. */
  cx: number;
  cy: number;
  /** How far the centre travelled (px): a two-finger drag pans by this. */
  dx: number;
  dy: number;
  /** Change of finger spread (px), for telling a two-finger tap from a pinch. */
  ds: number;
}

/** Two fingers moved from `prev` to `cur`: the zoom and pan that keep the tank under them. */
export function pinchMove(prev: PinchPoints, cur: PinchPoints, out: PinchMove = { steps: 0, cx: 0, cy: 0, dx: 0, dy: 0, ds: 0 }): PinchMove {
  const d0 = Math.hypot(prev.ax - prev.bx, prev.ay - prev.by);
  const d1 = Math.hypot(cur.ax - cur.bx, cur.ay - cur.by);
  // Fingers almost on top of each other give no usable ratio.
  out.steps = d0 > 8 && d1 > 8 ? Math.log(d1 / d0) / LN_STEP : 0;
  out.cx = (cur.ax + cur.bx) / 2;
  out.cy = (cur.ay + cur.by) / 2;
  out.dx = out.cx - (prev.ax + prev.bx) / 2;
  out.dy = out.cy - (prev.ay + prev.by) / 2;
  out.ds = d1 - d0;
  return out;
}

/**
 * A drag of (dx, dy) screen px → `panBy` fractions of the visible half-size. The view moves
 * against the drag, so the tank follows the finger.
 */
export function dragToPan(dxPx: number, dyPx: number, width: number, height: number, out = { x: 0, y: 0 }): { x: number; y: number } {
  out.x = -dxPx / Math.max(1, width / 2);
  out.y = dyPx / Math.max(1, height / 2);
  return out;
}

/** "3.2×" when zoomed in, '' at the whole-tank view. */
export function zoomLabel(zoom: number): string {
  if (!(zoom >= 1.05)) return '';
  return zoom < 9.95 ? `${zoom.toFixed(1)}×` : `${Math.round(zoom)}×`;
}

export type ViewKeyAction = 'zoom-in' | 'zoom-out' | 'reset' | 'tour' | 'follow' | 'pan-left' | 'pan-right' | 'pan-up' | 'pan-down';

/**
 * Keyboard → view action, or null to leave the key to the rest of the UI. `close`: zoomed in,
 * following or touring; `fishSelected`: an animal's card is open (F follows it, otherwise F feeds).
 */
export function viewKeyAction(key: string, ctx: { close: boolean; fishSelected: boolean }): ViewKeyAction | null {
  switch (key) {
    case '+':
    case '=':
      return 'zoom-in';
    case '-':
    case '_':
      return 'zoom-out';
    case '0':
      return ctx.close ? 'reset' : null;
    case 't':
    case 'T':
      return 'tour';
    case 'f':
    case 'F':
      return ctx.fishSelected ? 'follow' : null;
    case 'ArrowLeft':
      return ctx.close ? 'pan-left' : null;
    case 'ArrowRight':
      return ctx.close ? 'pan-right' : null;
    case 'ArrowUp':
      return ctx.close ? 'pan-up' : null;
    case 'ArrowDown':
      return ctx.close ? 'pan-down' : null;
    default:
      return null;
  }
}

// ------------------------------------------------------------------------------------------
// Routing (no DOM)
// ------------------------------------------------------------------------------------------

export type ViewApp = Pick<AppApi, 'world' | 'follow' | 'zoomBy' | 'getZoom' | 'panBy' | 'resetView' | 'setTour' | 'isTouring'>;

/** Screen size in CSS px (read live; `window` in the app). */
export interface Viewport {
  readonly innerWidth: number;
  readonly innerHeight: number;
}

export class ViewRouter {
  /** Before a tour starts: clear the stage (close panels, put the card away). */
  onTourStart: () => void = () => {};
  private panOut = { x: 0, y: 0 };

  constructor(
    private app: ViewApp,
    private viewport: Viewport,
  ) {}

  /** Closer than the whole tank: zoomed in, following or touring. */
  isClose(): boolean {
    const app = this.app;
    return !!app.world.follow || app.isTouring() || app.getZoom().zoom > CLOSE_ZOOM;
  }

  /**
   * Zoom by wheel-notch steps (+ = closer), toward a screen point when given. While following,
   * this frames the animal tighter or looser; during a tour it takes over the current shot.
   */
  zoom(steps: number, clientX?: number, clientY?: number): void {
    if (!steps || !Number.isFinite(steps)) return;
    this.app.zoomBy(steps, clientX, clientY);
  }

  /** Look around: a drag of (dx, dy) screen px. Ends a tour and lets go of a followed animal. */
  pan(dxPx: number, dyPx: number): void {
    if (!dxPx && !dyPx) return;
    const p = dragToPan(dxPx, dyPx, this.viewport.innerWidth, this.viewport.innerHeight, this.panOut);
    this.app.panBy(p.x, p.y);
  }

  /** Back to the whole tank (stops following and touring). */
  reset(): void {
    this.app.resetView();
  }

  /** Follow an animal, framed by the camera to suit its size (null = stop). Ends a tour. */
  follow(fishId: string | null): void {
    this.app.follow(fishId);
  }

  /** The Follow button / F: follow this animal, or stop if you already are (a tour hands it over). */
  toggleFollow(fishId: string): void {
    this.follow(this.app.world.follow === fishId && !this.app.isTouring() ? null : fishId);
  }

  setTour(on: boolean): void {
    const app = this.app;
    if (on === app.isTouring()) return;
    if (on) {
      this.onTourStart();
      app.setTour(true);
      return;
    }
    // Ending the tour yourself returns the view to you (picking an animal keeps the camera on it).
    app.setTour(false);
    if (app.world.follow) app.follow(null);
  }

  toggleTour(): void {
    this.setTour(!this.app.isTouring());
  }

  /** An animal was picked on the glass: during a tour the camera stays with your choice. */
  picked(fishId: string): void {
    if (this.app.isTouring()) this.follow(fishId);
  }

  /** Esc: leave the tour, else stop following. True if it did something. */
  escape(): boolean {
    if (this.app.isTouring()) {
      this.setTour(false);
      return true;
    }
    if (this.app.world.follow) {
      this.app.follow(null);
      return true;
    }
    return false;
  }

  /** Keyboard shortcuts (see viewKeyAction). True if the key was used. */
  key(key: string): boolean {
    const sel = this.app.world.selection.fishId;
    const action = viewKeyAction(key, { close: this.isClose(), fishSelected: !!sel && this.app.world.fishById.has(sel) });
    switch (action) {
      case null:
        return false;
      case 'zoom-in':
        this.zoom(BUTTON_STEPS);
        break;
      case 'zoom-out':
        this.zoom(-BUTTON_STEPS);
        break;
      case 'reset':
        this.reset();
        break;
      case 'tour':
        this.toggleTour();
        break;
      case 'follow':
        this.toggleFollow(sel!);
        break;
      case 'pan-left':
        this.app.panBy(-KEY_PAN, 0);
        break;
      case 'pan-right':
        this.app.panBy(KEY_PAN, 0);
        break;
      case 'pan-up':
        this.app.panBy(0, KEY_PAN);
        break;
      case 'pan-down':
        this.app.panBy(0, -KEY_PAN);
        break;
    }
    return true;
  }
}

// ------------------------------------------------------------------------------------------
// On-screen controls
// ------------------------------------------------------------------------------------------

/** Two glyphs the shared icon set doesn't have, drawn in the same 24 px / 1.5 px line style. */
const GLYPHS = {
  /** A small film camera: the documentary tour. */
  camera: '<rect x="3" y="7.2" width="12.3" height="9.6" rx="2.2"/><path d="M15.3 10.6l5.2-2.9v8.6l-5.2-2.9"/>',
  /** Four corners: the whole tank. */
  frame: '<path d="M4.5 9V6.2c0-.9.8-1.7 1.7-1.7H9M15 4.5h2.8c.9 0 1.7.8 1.7 1.7V9M19.5 15v2.8c0 .9-.8 1.7-1.7 1.7H15M9 19.5H6.2c-.9 0-1.7-.8-1.7-1.7V15"/>',
} as const;

const glyphCache = new Map<string, SVGSVGElement>();
function glyph(name: keyof typeof GLYPHS, size: number): SVGSVGElement {
  const key = `${name}:${size}`;
  let tpl = glyphCache.get(key);
  if (!tpl) {
    const wrap = document.createElement('div');
    wrap.innerHTML = `<svg class="aq-icon" width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">${GLYPHS[name]}</svg>`;
    tpl = wrap.firstChild as SVGSVGElement;
    glyphCache.set(key, tpl);
  }
  return tpl.cloneNode(true) as SVGSVGElement;
}

/** Catalog portrait size (shares the thumbnail cache with the fish panel). */
const THUMB = 128;
/** How often the readout and chip follow the camera (s). Event-driven changes apply at once. */
const SYNC_SECONDS = 0.1;

function ctlButton(cls: string, label: string, tip: string, keys: string | undefined, onClick: () => void, ...content: (Node | string)[]): HTMLButtonElement {
  const b = h('button', { type: 'button', class: cls, 'aria-label': label, 'data-tip': tip, 'aria-keyshortcuts': keys }, ...content);
  b.addEventListener('click', onClick);
  return b;
}

export class ViewControls {
  readonly router: ViewRouter;
  /** The zoom & tour cluster (bottom-right; above the dock on phones). */
  readonly el: HTMLElement;
  /** "Following …" / "Tour · …" (top centre). */
  readonly chip: HTMLElement;
  private zoomIn: HTMLButtonElement;
  private zoomOut: HTMLButtonElement;
  private readout: HTMLElement;
  private resetBtn: HTMLButtonElement;
  private tourBtn: HTMLButtonElement;
  private chipThumb: HTMLElement;
  private chipImg: HTMLImageElement;
  private chipCam: SVGSVGElement;
  private chipKicker: HTMLElement;
  private chipName: HTMLElement;
  private chipWider: HTMLButtonElement;
  private chipCloser: HTMLButtonElement;
  private chipStop: HTMLButtonElement;

  private t = 0;
  private lastPanel: PanelId | null = null;
  private chipSpecies = '';
  /** Zoom readout cache (tenths), so the DOM is only touched when the shown value changes. */
  private shownZoom = -1;

  constructor(
    private host: UIHost,
    layer: HTMLElement,
  ) {
    const app = host.app;
    this.router = new ViewRouter(app, window);
    this.router.onTourStart = () => {
      host.openPanel(null);
      host.stopFeeding();
      if (app.world.selection.fishId || app.world.selection.decorId || app.world.selection.plantId) app.select({});
    };
    const r = this.router;

    // Cluster: [whole tank] [Tour] [+ · 3.2× · −]. It grows upward from the bottom edge, so the
    // whole-tank button appearing on top never moves the zoom buttons under a finger.
    this.resetBtn = ctlButton('aq-viewctl-btn aq-viewctl-reset aq-glass', 'Back to the whole tank', 'Whole tank  ·  0', '0', () => r.reset(), glyph('frame', 20));
    this.resetBtn.hidden = true;
    this.tourBtn = ctlButton(
      'aq-viewctl-btn aq-viewctl-tour aq-glass',
      'Tour: the camera drifts between animals',
      'Tour  ·  T',
      'T',
      () => r.toggleTour(),
      glyph('camera', 20),
      h('span', { class: 'aq-viewctl-label', 'aria-hidden': 'true' }, 'Tour'),
    );
    this.tourBtn.setAttribute('aria-pressed', 'false');
    this.zoomIn = ctlButton('aq-viewctl-btn', 'Zoom in', 'Closer  ·  +', '+', () => r.zoom(BUTTON_STEPS), icon('plus', 18));
    this.zoomOut = ctlButton('aq-viewctl-btn', 'Zoom out', 'Wider  ·  −', '-', () => r.zoom(-BUTTON_STEPS), icon('minus', 18));
    this.readout = h('span', { class: 'aq-viewctl-zoom', 'aria-hidden': 'true' });
    this.el = h(
      'div',
      { class: 'aq-viewctl aq-chrome', role: 'group', 'aria-label': 'View' },
      this.resetBtn,
      this.tourBtn,
      h('div', { class: 'aq-viewctl-zoompill aq-glass' }, this.zoomIn, this.readout, this.zoomOut),
    );

    // Chip: [portrait] Following Neon tetra [−] [+] [✕]
    this.chipImg = h('img', { class: 'aq-viewchip-img', alt: '', width: 50, height: 32, decoding: 'async' });
    this.chipCam = glyph('camera', 18);
    this.chipThumb = h('span', { class: 'aq-viewchip-thumb', 'aria-hidden': 'true' }, this.chipImg);
    this.chipKicker = h('span', { class: 'aq-viewchip-kicker' });
    this.chipName = h('span', { class: 'aq-viewchip-name' });
    this.chipWider = ctlButton('aq-viewchip-btn', 'Frame it wider', 'Wider  ·  −', '-', () => r.zoom(-BUTTON_STEPS), icon('minus', 16));
    this.chipCloser = ctlButton('aq-viewchip-btn', 'Frame it closer', 'Closer  ·  +', '+', () => r.zoom(BUTTON_STEPS), icon('plus', 16));
    this.chipStop = ctlButton('aq-viewchip-btn aq-viewchip-stop', 'Stop following', 'Stop following  ·  Esc', 'Escape', () => (app.isTouring() ? r.setTour(false) : r.follow(null)), icon('close', 16));
    this.chip = h(
      'div',
      { class: 'aq-viewchip aq-glass aq-chrome', role: 'group', 'aria-label': 'Camera', hidden: true },
      this.chipThumb,
      h('span', { class: 'aq-viewchip-text', 'aria-live': 'polite' }, this.chipKicker, ' ', this.chipName),
      this.chipWider,
      this.chipCloser,
      this.chipStop,
    );
    layer.append(this.chip, this.el);
    setClass(this.el, 'has-card', !!app.world.selection.fishId);

    const ev = app.world.events;
    ev.on('view-changed', () => this.sync());
    // Phones: the animal's card takes the space above the dock, so the cluster steps aside.
    ev.on('selection-changed', (s) => setClass(this.el, 'has-card', !!s.fishId));
    ev.on('tank-reset', () => this.sync());
    this.sync();
  }

  /** Esc (after panels and dialogs): leave the tour, else stop following. */
  escape(): boolean {
    return this.router.escape();
  }

  /** Global shortcuts (+ − 0 T F arrows). Menus and dialogs keep their keys; panels keep the arrows. */
  key(e: KeyboardEvent): boolean {
    const t = e.target as HTMLElement | null;
    if (t?.closest?.('[role="menu"], [role="dialog"], [role="listbox"]')) return false;
    if (e.key.startsWith('Arrow') && t?.closest?.('.aq-panel, [role="radio"], [role="tab"], [role="slider"], input, select, textarea')) return false;
    return this.router.key(e.key);
  }

  /** Per frame (from UI.update): follow the camera at a modest rate; DOM writes only on change. */
  update(dt: number): void {
    this.t += dt;
    if (this.t < SYNC_SECONDS) return;
    this.t = 0;
    // Opening a panel is a change of activity: the tour ends and the camera stays where it is.
    const panel = this.host.openPanelId;
    if (panel !== this.lastPanel) {
      this.lastPanel = panel;
      if (panel && this.host.app.isTouring()) this.host.app.setTour(false);
    }
    this.sync();
  }

  private sync(): void {
    const app = this.host.app;
    const id = app.world.follow;
    const touring = app.isTouring();
    // The target zoom (what the camera is heading for); while following, that of the framing.
    const z = app.getZoom();

    // Cluster. While an animal is followed, + and − reframe it (see ViewRouter.zoom).
    const tenths = Math.round(z.zoom * 10);
    if (tenths !== this.shownZoom) {
      this.shownZoom = tenths;
      setText(this.readout, zoomLabel(z.zoom));
    }
    const close = !!id || touring || z.zoom > CLOSE_ZOOM;
    if (this.resetBtn.hidden === close) this.resetBtn.hidden = !close;
    const atMax = z.zoom >= z.max - 0.01;
    const atMin = z.zoom <= z.min + 0.01;
    if (this.zoomIn.disabled !== atMax) this.zoomIn.disabled = atMax;
    if (this.zoomOut.disabled !== atMin) this.zoomOut.disabled = atMin;
    setAttr(this.tourBtn, 'aria-pressed', String(touring));
    setClass(this.tourBtn, 'is-on', touring);

    // Chip
    const show = touring || !!id;
    if (this.chip.hidden === show) this.chip.hidden = !show;
    if (!show) {
      this.chipSpecies = '';
      return;
    }
    const f = id ? app.world.fishById.get(id) : undefined;
    const following = !!f && !touring;
    setText(this.chipKicker, touring ? 'Tour ·' : 'Following');
    setText(this.chipName, f ? (f.state.name ?? f.species.commonName) : 'the whole tank');
    setAttr(this.chip, 'title', f?.state.name ? f.species.commonName : null);
    setClass(this.chip, 'is-tour', touring);
    if (this.chipWider.hidden === following) this.chipWider.hidden = !following;
    if (this.chipCloser.hidden === following) this.chipCloser.hidden = !following;
    if (this.chipWider.disabled !== atMin) this.chipWider.disabled = atMin;
    if (this.chipCloser.disabled !== atMax) this.chipCloser.disabled = atMax;
    setAttr(this.chipStop, 'aria-label', touring ? 'End the tour' : 'Stop following');
    setAttr(this.chipStop, 'data-tip', touring ? 'End the tour  ·  Esc' : 'Stop following  ·  Esc');
    this.showPortrait(f?.species);
  }

  /** The followed animal's catalog portrait (silhouette until the real one is ready), or the camera. */
  private showPortrait(species: Species | undefined): void {
    const key = species?.id ?? '';
    if (key === this.chipSpecies) return;
    this.chipSpecies = key;
    if (!species) {
      this.chipThumb.replaceChildren(this.chipCam);
      return;
    }
    const t = this.host.thumbs.immediate(species, THUMB);
    this.chipImg.src = t.url;
    setClass(this.chipImg, 'is-real', t.real);
    this.chipThumb.replaceChildren(this.chipImg);
    if (!t.real)
      this.host.thumbs.request(
        species,
        THUMB,
        (url) => {
          if (this.chipSpecies !== key) return;
          this.chipImg.src = url;
          this.chipImg.classList.add('is-real');
        },
        'viewchip',
      );
  }
}
