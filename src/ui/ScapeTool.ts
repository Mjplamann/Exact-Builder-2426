/**
 * Aquascape editing on the canvas: place the armed hardscape/plant where you click on the
 * substrate (epiphytes attach to the wood or stone you click), select items, drag them along the
 * substrate (their burial depth is preserved and attached plants travel with their host), rotate
 * with the wheel, resize with shift+wheel, and a small floating toolbar for the selection.
 */
import { Vector3 } from 'three';
import type { DecorItem, DecorKind, PlantInstance, PlantSpecies } from '../core/types';
import { substrateHeight, tankBounds } from '../core/tankGeometry';
import { DECOR_CATALOG } from '../decor/catalog';
import type { UIHost } from './context';
import { iconButton } from './controls';
import { h, setText, throttle } from './dom';

interface Selection {
  kind: 'decor' | 'plant';
  item: DecorItem | PlantInstance;
  name: string;
}

export type Armed =
  | { type: 'decor'; kind: DecorKind; variant: string; name: string }
  | { type: 'plant'; id: string; name: string; placement: PlantSpecies['placement'] };

interface DragState {
  kind: 'decor' | 'plant';
  id: string;
  pointerId: number;
  x0: number;
  y0: number;
  moved: boolean;
  /** Item base minus the substrate point under the cursor at grab time (xz). */
  offX: number;
  offZ: number;
  /** Burial depth/height above the substrate, preserved while moving. */
  dy: number;
  start: [number, number, number];
  last: [number, number, number];
}

const ROT_STEP = Math.PI / 12; // 15°
const NO_COVER = { right: 0, bottom: 0 };
const MIN_SCALE = 0.3;
const MAX_SCALE = 3;

export class ScapeTool {
  active = false;
  armed: Armed | null = null;
  /** Notified when arming/selection changes (panel highlights, hint text). */
  onChange: () => void = () => {};

  private toolbar: HTMLElement;
  private tbName: HTMLElement;
  private tbScaleBtns: HTMLElement[] = [];
  private drag: DragState | null = null;
  private v = new Vector3();
  private canvas: HTMLCanvasElement;
  private pendingRot = 0;
  private pendingScale = 1;
  private applyDrag: (id: string, kind: 'decor' | 'plant', pos: [number, number, number]) => void;
  private applyWheel: () => void;
  private warnedSubstrate = false;
  private sel: Selection | null = null;
  /** Canvas rect cached on resize (no layout reads per frame). */
  private rect = { left: 0, top: 0, width: 1, height: 1 };
  private tbX = -1;
  private tbY = -1;

  constructor(
    private host: UIHost,
    layer: HTMLElement,
  ) {
    this.canvas = host.app.engine.renderer.domElement;
    this.tbName = h('span', { class: 'aq-tb-name' });
    const app = host.app;
    const rot = (d: number) => () => this.rotateSelection(d);
    const sc = (f: number) => () => this.scaleSelection(f);
    const smaller = iconButton('shrink', 'Smaller ( [ )', sc(1 / 1.12), 'aq-icon-btn aq-tb-btn');
    const larger = iconButton('grow', 'Larger ( ] )', sc(1.12), 'aq-icon-btn aq-tb-btn');
    this.tbScaleBtns = [smaller, larger];
    this.toolbar = h(
      'div',
      { class: 'aq-scape-toolbar', role: 'toolbar', 'aria-label': 'Selected item', hidden: true },
      this.tbName,
      h('span', { class: 'aq-tb-sep' }),
      iconButton('rotate', 'Rotate (R)', rot(ROT_STEP), 'aq-icon-btn aq-tb-btn'),
      smaller,
      larger,
      iconButton('reshape', 'New shape (N)', () => this.reshapeSelection(), 'aq-icon-btn aq-tb-btn'),
      iconButton('trash', 'Remove (Delete)', () => this.deleteSelection(), 'aq-icon-btn aq-tb-btn aq-tb-danger'),
    );
    layer.append(this.toolbar);

    // Moving rebuilds colliders & meshes downstream — 15 Hz is smooth enough and cheap.
    this.applyDrag = throttle((id: string, kind: 'decor' | 'plant', pos: [number, number, number]) => {
      if (kind === 'decor') app.updateDecor(id, { position: pos });
      else app.updatePlant(id, { position: pos, attachedTo: undefined });
    }, 66);
    this.applyWheel = throttle(() => {
      const sel = this.selected();
      if (!sel) return;
      if (sel.kind === 'decor') {
        const d = sel.item as DecorItem;
        const scale = Math.min(MAX_SCALE, Math.max(MIN_SCALE, d.scale * this.pendingScale));
        app.updateDecor(d.id, { rotation: [d.rotation[0], d.rotation[1] + this.pendingRot, d.rotation[2]], scale });
      } else {
        const p = sel.item as PlantInstance;
        app.updatePlant(p.id, { rotationY: p.rotationY + this.pendingRot });
      }
      this.pendingRot = 0;
      this.pendingScale = 1;
    }, 50);

    const ev = app.world.events;
    ev.on('selection-changed', () => {
      this.refreshSelection();
      this.onChange();
    });
    ev.on('decor-changed', () => this.refreshSelection());
    ev.on('plants-changed', () => this.refreshSelection());
    ev.on('tank-reset', () => this.refreshSelection());
    const measure = () => {
      const r = this.canvas.getBoundingClientRect();
      this.rect = { left: r.left, top: r.top, width: r.width || 1, height: r.height || 1 };
      this.tbX = -1;
    };
    measure();
    window.addEventListener('resize', measure);
  }

  enter(): void {
    this.active = true;
    this.onChange();
  }

  exit(): void {
    this.active = false;
    this.armed = null;
    this.drag = null;
    const sel = this.host.app.world.selection;
    if (sel.decorId || sel.plantId) this.host.app.select({});
    this.toolbar.hidden = true;
    this.onChange();
  }

  arm(a: Armed | null): void {
    this.armed = a;
    this.onChange();
  }

  // ------------------------------------------------------------------------------------------
  // Selection helpers
  // ------------------------------------------------------------------------------------------

  /** The selected decor item or plant (cached; refreshed on selection/decor/plant events). */
  selected(): Selection | null {
    return this.sel;
  }

  private refreshSelection(): void {
    const w = this.host.app.world;
    const s = w.selection;
    this.sel = null;
    if (s.decorId) {
      const d = w.tank.decor.find((x) => x.id === s.decorId);
      if (d) this.sel = { kind: 'decor', item: d, name: DECOR_CATALOG.find((c) => c.kind === d.kind && c.variant === d.variant)?.name ?? d.variant };
    } else if (s.plantId) {
      const p = w.tank.plants.find((x) => x.id === s.plantId);
      if (p) this.sel = { kind: 'plant', item: p, name: w.plants.get(p.speciesId)?.commonName ?? 'Plant' };
    }
    if (this.sel) setText(this.tbName, this.sel.name);
    for (const b of this.tbScaleBtns) (b as HTMLButtonElement).disabled = this.sel?.kind !== 'decor';
    this.tbX = -1;
  }

  hasSelection(): boolean {
    return !!this.selected();
  }

  rotateSelection(d: number): void {
    this.pendingRot += d;
    this.applyWheel();
  }

  scaleSelection(f: number): void {
    if (this.selected()?.kind !== 'decor') return;
    this.pendingScale *= f;
    this.applyWheel();
  }

  reshapeSelection(): void {
    const sel = this.selected();
    if (!sel) return;
    const seed = Math.floor(Math.random() * 2 ** 31);
    if (sel.kind === 'decor') this.host.app.updateDecor(sel.item.id, { seed });
    else this.host.app.updatePlant(sel.item.id, { seed });
  }

  deleteSelection(): void {
    const sel = this.selected();
    if (!sel) return;
    if (sel.kind === 'decor') this.host.app.removeDecor(sel.item.id);
    else this.host.app.removePlant(sel.item.id);
    this.host.app.select({});
  }

  // ------------------------------------------------------------------------------------------
  // Canvas interaction (called by CanvasInput while in aquascape mode)
  // ------------------------------------------------------------------------------------------

  private pick(x: number, y: number) {
    const app = this.host.app;
    try {
      return app.decorRenderer.pick(app.engine.rayFromScreen(x, y));
    } catch {
      return null;
    }
  }

  /** Cursor hint for hovering. */
  cursorAt(x: number, y: number): 'grab' | 'place' | 'default' {
    if (this.armed) return 'place';
    return this.pick(x, y) ? 'grab' : 'default';
  }

  /** Primary button down on the canvas. Returns true when it starts a (potential) drag of an item. */
  pointerDown(e: PointerEvent): boolean {
    if (this.armed) return false;
    const hit = this.pick(e.clientX, e.clientY);
    if (!hit) return false;
    const app = this.host.app;
    const w = app.world;
    const item = hit.kind === 'decor' ? w.tank.decor.find((d) => d.id === hit.id) : w.tank.plants.find((p) => p.id === hit.id);
    if (!item) return false;
    if (hit.kind === 'decor') app.select({ decorId: hit.id });
    else app.select({ plantId: hit.id });
    const sp = app.substratePointAt(e.clientX, e.clientY);
    const pos = item.position;
    const ground = substrateHeight(w.tank, pos[0], pos[2]);
    this.drag = {
      kind: hit.kind,
      id: hit.id,
      pointerId: e.pointerId,
      x0: e.clientX,
      y0: e.clientY,
      moved: false,
      offX: sp ? pos[0] - sp[0] : 0,
      offZ: sp ? pos[2] - sp[2] : 0,
      dy: hit.kind === 'plant' && w.plants.get((item as PlantInstance).speciesId)?.placement === 'floating' ? NaN : pos[1] - ground,
      start: [pos[0], pos[1], pos[2]],
      last: [pos[0], pos[1], pos[2]],
    };
    return true;
  }

  pointerMove(e: PointerEvent): void {
    const d = this.drag;
    if (!d || e.pointerId !== d.pointerId) return;
    if (!d.moved && Math.hypot(e.clientX - d.x0, e.clientY - d.y0) < 4) return;
    d.moved = true;
    const app = this.host.app;
    const t = app.world.tank;
    const sp = app.substratePointAt(e.clientX, e.clientY);
    if (!sp) return;
    const b = tankBounds(t);
    const m = 0.02;
    const x = Math.min(b.halfW - m, Math.max(-b.halfW + m, sp[0] + d.offX));
    const z = Math.min(b.halfD - m, Math.max(-b.halfD + m, sp[2] + d.offZ));
    const ground = substrateHeight(t, x, z);
    // Attached epiphytes are set down on the substrate when dragged off their host.
    const y = Number.isNaN(d.dy) ? d.start[1] : d.kind === 'plant' ? ground : ground + d.dy;
    d.last = [x, y, z];
    this.applyDrag(d.id, d.kind, d.last);
  }

  /** Returns true if this was a drag (so the click handler should not run). */
  pointerUp(e: PointerEvent): boolean {
    const d = this.drag;
    if (!d || e.pointerId !== d.pointerId) return false;
    this.drag = null;
    if (!d.moved) return true; // selection already happened on pointer-down
    (this.applyDrag as unknown as { flush(): void }).flush();
    if (d.kind === 'decor') this.carryAttached(d.id, d.start, d.last);
    return true;
  }

  /** Move epiphytes attached to a decor item by the same offset as their host. */
  private carryAttached(decorId: string, from: [number, number, number], to: [number, number, number]): void {
    const app = this.host.app;
    const dx = to[0] - from[0];
    const dy = to[1] - from[1];
    const dz = to[2] - from[2];
    if (Math.abs(dx) + Math.abs(dy) + Math.abs(dz) < 1e-5) return;
    for (const p of app.world.tank.plants) {
      if (p.attachedTo !== decorId) continue;
      app.updatePlant(p.id, { position: [p.position[0] + dx, p.position[1] + dy, p.position[2] + dz] });
    }
  }

  /**
   * Abandon an item drag without a click (e.g. a second finger turned it into a pinch): keep
   * whatever position was reached and bring attached epiphytes along.
   */
  cancelDrag(): void {
    const d = this.drag;
    if (!d) return;
    this.drag = null;
    if (!d.moved) return;
    (this.applyDrag as unknown as { flush(): void }).flush();
    if (d.kind === 'decor') this.carryAttached(d.id, d.start, d.last);
  }

  isDragging(): boolean {
    return !!this.drag?.moved;
  }

  /** A click (no drag) in aquascape mode: place the armed item, or select/deselect. */
  click(x: number, y: number): void {
    const app = this.host.app;
    const a = this.armed;
    if (!a) {
      const hit = this.pick(x, y);
      if (!hit) app.select({});
      return;
    }
    if (a.type === 'decor') {
      const p = app.substratePointAt(x, y);
      if (!p) return this.substrateHint();
      const item = app.addDecor(a.kind, a.variant, [p[0], p[2]]);
      app.select({ decorId: item.id });
      return;
    }
    let placed: PlantInstance | null = null;
    if (a.placement === 'epiphyte') {
      const hit = this.pick(x, y);
      if (hit && hit.kind === 'decor') {
        placed = app.addPlant(a.id, [hit.point.x, hit.point.z], hit.id);
        if (placed) app.updatePlant(placed.id, { position: [hit.point.x, hit.point.y, hit.point.z] });
      }
    }
    if (!placed) {
      const p = app.substratePointAt(x, y) ?? (a.placement === 'floating' ? app.surfacePointAt(x, y) : null);
      if (!p) return this.substrateHint();
      placed = app.addPlant(a.id, [p[0], p[2]]);
      if (placed && a.placement === 'epiphyte' && !this.warnedSubstrate) {
        this.warnedSubstrate = true;
        this.host.toast(`Tip: epiphytes grow best tied to wood or stone — ${this.host.isTouch ? 'tap' : 'click'} a piece of hardscape to attach them.`, 'info');
      }
    }
    if (placed) app.select({ plantId: placed.id });
  }

  private substrateHint(): void {
    if (this.warnedSubstrate) return;
    this.warnedSubstrate = true;
    this.host.toast(`${this.host.isTouch ? 'Tap' : 'Click'} on the substrate to place it.`, 'info');
  }

  /** Wheel over the canvas: rotate (or resize with shift) the selection. Returns true if used. */
  wheel(e: WheelEvent): boolean {
    if (!this.selected()) return false;
    const raw = e.deltaY || e.deltaX; // shift+wheel becomes horizontal in some browsers
    const delta = raw * (e.deltaMode === 1 ? 16 : 1);
    if (e.shiftKey) {
      if (this.selected()?.kind !== 'decor') return true;
      this.pendingScale *= Math.exp(-delta * 0.0015);
    } else this.pendingRot += delta * 0.004;
    this.applyWheel();
    return true;
  }

  /** Editing keys while in aquascape mode. Returns true when handled. */
  key(e: KeyboardEvent): boolean {
    if (!this.selected()) return false;
    switch (e.key) {
      case 'r':
      case 'R':
        this.rotateSelection(e.shiftKey ? -ROT_STEP : ROT_STEP);
        return true;
      case '[':
        this.scaleSelection(1 / 1.12);
        return true;
      case ']':
        this.scaleSelection(1.12);
        return true;
      case 'Delete':
      case 'Backspace':
        this.deleteSelection();
        return true;
      case 'n':
      case 'N':
        this.reshapeSelection();
        return true;
      default:
        return false;
    }
  }

  // ------------------------------------------------------------------------------------------
  // Per-frame: keep the toolbar above the selected item
  // ------------------------------------------------------------------------------------------

  frame(): void {
    const sel = this.active ? this.sel : null;
    if (!sel) {
      if (!this.toolbar.hidden) this.toolbar.hidden = true;
      return;
    }
    const app = this.host.app;
    const w = app.world;
    const pos = sel.item.position;
    let top = 0.08;
    if (sel.kind === 'decor') {
      const d = sel.item as DecorItem;
      let size = 0.12;
      for (const c of DECOR_CATALOG) if (c.kind === d.kind && c.variant === d.variant) size = c.size;
      top = size * d.scale * 0.6;
    } else {
      const p = sel.item as PlantInstance;
      const sp = w.plants.get(p.speciesId);
      top = sp ? Math.min(tankBounds(w.tank).height * 0.8, (sp.maxHeightCm / 100) * Math.max(0.2, p.growth) * 0.8) : 0.08;
    }
    this.v.set(pos[0], pos[1] + top, pos[2]).project(app.engine.camera);
    if (this.v.z > 1) {
      if (!this.toolbar.hidden) this.toolbar.hidden = true;
      return;
    }
    const r = this.rect;
    const sx = r.left + ((this.v.x + 1) / 2) * r.width;
    const sy = r.top + ((1 - this.v.y) / 2) * r.height;
    // Stay clear of the open panel (side sheet on desktop, bottom sheet on phones) — the toolbar
    // would otherwise slide underneath it. Half-width 150 px covers the toolbar on any screen.
    const cover = this.host.coveredInsets?.() ?? NO_COVER;
    const half = Math.min(150, (window.innerWidth - cover.right) / 2);
    const x = Math.round(Math.min(window.innerWidth - cover.right - half, Math.max(half, sx)));
    const y = Math.round(Math.min(window.innerHeight - Math.max(140, cover.bottom + 12), Math.max(80, sy - 14)));
    if (this.toolbar.hidden) this.toolbar.hidden = false;
    if (x !== this.tbX || y !== this.tbY) {
      this.tbX = x;
      this.tbY = y;
      this.toolbar.style.transform = `translate3d(${x}px, ${y}px, 0) translate(-50%, -100%)`;
    }
  }
}
