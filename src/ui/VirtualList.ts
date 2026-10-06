/**
 * A fixed-row-height virtualized list. Only the rows in (and just around) the viewport exist in
 * the DOM; they are recycled while scrolling and positioned with transforms, so 2000+ items
 * scroll as smoothly as 20. Container size comes from a ResizeObserver (no layout reads on scroll).
 */
export interface VirtualListOpts<T> {
  rowHeight: number;
  overscan?: number;
  className?: string;
  ariaLabel?: string;
  createRow(): HTMLElement;
  /** Fill a (recycled) row for `item`. Only called when the row's item changes or on refresh(). */
  bindRow(row: HTMLElement, item: T, index: number): void;
  /** Called after each render with the visible index range (for lazy work like thumbnails). */
  onRange?(first: number, last: number): void;
}

interface Slot<T> {
  el: HTMLElement;
  /** Index shown in the current render (−1 = unused). */
  index: number;
  /** Index the row is currently translated to (avoids redundant style writes). */
  pos: number;
  item: T | undefined;
}

export class VirtualList<T> {
  readonly el: HTMLElement;
  private spacer: HTMLElement;
  private slots: Slot<T>[] = [];
  private items: readonly T[] = [];
  private viewH = 0;
  private scrollTop = 0;
  private raf = 0;
  private ro: ResizeObserver;

  constructor(private o: VirtualListOpts<T>) {
    this.el = document.createElement('div');
    this.el.className = `aq-vlist ${o.className ?? ''}`;
    this.el.setAttribute('role', 'list');
    if (o.ariaLabel) this.el.setAttribute('aria-label', o.ariaLabel);
    this.el.tabIndex = -1;
    this.spacer = document.createElement('div');
    this.spacer.className = 'aq-vlist-spacer';
    this.el.append(this.spacer);
    this.el.addEventListener(
      'scroll',
      () => {
        this.scrollTop = this.el.scrollTop;
        this.schedule();
      },
      { passive: true },
    );
    this.ro = new ResizeObserver((entries) => {
      const h = entries[0]?.contentRect.height ?? 0;
      if (Math.abs(h - this.viewH) > 0.5) {
        this.viewH = h;
        this.schedule();
      }
    });
    this.ro.observe(this.el);
  }

  get length(): number {
    return this.items.length;
  }

  setItems(items: readonly T[], resetScroll = false): void {
    this.items = items;
    this.spacer.style.height = `${items.length * this.o.rowHeight}px`;
    for (const s of this.slots) s.item = undefined; // force rebind
    if (resetScroll) {
      this.el.scrollTop = 0;
      this.scrollTop = 0;
    }
    this.render();
  }

  /** Re-bind every visible row (e.g. data they show changed). */
  refresh(): void {
    for (const s of this.slots) s.item = undefined;
    this.render();
  }

  /** Visible slice (for lazy loaders). */
  forEachVisible(fn: (row: HTMLElement, item: T, index: number) => void): void {
    for (const s of this.slots) if (s.item !== undefined && s.index >= 0) fn(s.el, s.item, s.index);
  }

  private schedule(): void {
    if (this.raf) return;
    this.raf = requestAnimationFrame(() => {
      this.raf = 0;
      this.render();
    });
  }

  private render(): void {
    const rh = this.o.rowHeight;
    const over = this.o.overscan ?? 4;
    const n = this.items.length;
    const viewH = this.viewH || 600;
    const first = Math.max(0, Math.floor(this.scrollTop / rh) - over);
    const last = Math.min(n - 1, Math.ceil((this.scrollTop + viewH) / rh) + over);
    const need = Math.max(0, last - first + 1);
    while (this.slots.length < need) {
      const el = this.o.createRow();
      el.classList.add('aq-vrow');
      el.setAttribute('role', 'listitem');
      el.style.height = `${rh}px`;
      this.el.append(el);
      this.slots.push({ el, index: -1, pos: -1, item: undefined });
    }
    // Keep each index on a stable slot (index mod pool size) so rows don't swap content while scrolling.
    const pool = this.slots.length;
    for (let i = 0; i < pool; i++) this.slots[i].index = -1;
    for (let idx = first; idx <= last; idx++) {
      const slot = this.slots[idx % pool];
      const item = this.items[idx];
      if (slot.pos !== idx) {
        slot.el.style.transform = `translateY(${idx * rh}px)`;
        slot.pos = idx;
      }
      if (slot.item !== item) {
        this.o.bindRow(slot.el, item, idx);
        slot.item = item;
      }
      slot.index = idx;
      if (slot.el.hidden) slot.el.hidden = false;
    }
    for (const s of this.slots) {
      if (s.index === -1 && !s.el.hidden) {
        s.el.hidden = true;
        s.item = undefined;
      }
    }
    this.o.onRange?.(first, last);
  }

  dispose(): void {
    this.ro.disconnect();
    if (this.raf) cancelAnimationFrame(this.raf);
  }
}
