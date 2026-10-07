/**
 * The tank name (top left) opens the keeper's collection: every tank with its water, size,
 * volume, animals and when it was last watched. Choose one to switch (a soft dip to dark; the app
 * greets you with what happened while it was unwatched), or open a tank's actions (⋯, or a long
 * press on touch screens) to rename it inline, duplicate it or delete it after a clear
 * confirmation. "New tank…" opens the guided builder. A popover on desktop, a bottom sheet on
 * phones; arrow keys, Enter and Esc work throughout. Kept in sync through 'tanks-changed'.
 */
import './builder.css';
import type { TankSummary } from '../app/tankTypes';
import type { UIHost } from './context';
import { iconButton } from './controls';
import { h, prefersReducedMotion, setAttr, setText } from './dom';
import { icon } from './icons';
import { glyph, type GlyphName } from './builder/art';
import { builderOpen, openTankBuilder, setBuilderLayer } from './builder';
import { fadeThrough, fading, usingKeyboard } from './builder/fade';
import { animalsLabel, deleteMessage, lastWatched, tankLine, waterLabel } from './builder/labels';
import { MAX_NAME_LENGTH } from './builder/model';

const LONG_PRESS_MS = 520;

export class TankMenu {
  /** The trigger: the tank's name and a small chevron. */
  readonly el: HTMLButtonElement;
  private nameEl: HTMLElement;
  private root: HTMLElement | null = null;
  private menu: HTMLElement | null = null;
  private countEl: HTMLElement | null = null;
  private dialog: HTMLElement | null = null;
  private tanks: TankSummary[] = [];
  /** Tank whose actions are showing / being renamed. */
  private expanded: string | null = null;
  private renaming: string | null = null;
  /** Abandons the open rename field (Esc). */
  private cancelRename: (() => void) | null = null;
  /** A long press opened the actions: swallow the click that follows the lift. */
  private suppressClick = false;
  /** A duplicate or delete is under way (a second tap must not copy or delete twice). */
  private acting = false;
  private readonly keyCapture = (e: KeyboardEvent) => this.onKeyCapture(e);

  constructor(
    private host: UIHost,
    private layer: HTMLElement,
  ) {
    setBuilderLayer(layer);
    usingKeyboard();
    this.nameEl = h('span', { class: 'aqm-trigger-name' });
    this.el = h('button', { type: 'button', class: 'aq-tankname aqm-trigger', 'aria-haspopup': 'menu', 'aria-expanded': 'false', title: 'Your tanks' }, this.nameEl, icon('chevron', 14, 'aq-icon aqm-chev'));
    this.el.addEventListener('click', () => (this.root ? this.close(true) : this.open()));
    this.el.addEventListener('keydown', (e) => {
      if ((e.key === 'ArrowDown' || e.key === 'ArrowUp') && !this.root) {
        e.preventDefault();
        this.open();
      }
    });
    host.app.world.events.on('tanks-changed', () => this.onTanksChanged());
    this.refresh();
  }

  /** The menu, a dialog, the builder or a tank change is in progress (the chrome must not fade). */
  get busy(): boolean {
    return !!this.root || !!this.dialog || builderOpen() || fading();
  }

  /** ~4 Hz from the UI: keep the name current (cheap no-op when unchanged). */
  refresh(): void {
    setText(this.nameEl, this.host.app.world.tank.name);
  }

  /** Esc from the UI shell (when focus is outside the menu): close the innermost layer. */
  onEscape(): boolean {
    if (this.dialog) {
      this.closeDialog();
      return true;
    }
    if (this.root) {
      this.close(true);
      return true;
    }
    return false;
  }

  openBuilder(): void {
    this.close(false);
    openTankBuilder(this.host, { returnFocus: this.el });
  }

  // ------------------------------------------------------------------------------------------
  // Open / close
  // ------------------------------------------------------------------------------------------

  open(): void {
    if (this.root || fading() || builderOpen()) return;
    const sheet = this.host.isMobile;
    this.countEl = h('span', { class: 'aqm-head-count' });
    this.menu = h('div', { class: 'aqm-menu', role: 'menu', id: 'aqm-menu', 'aria-labelledby': 'aqm-title' });
    this.menu.addEventListener('keydown', (e) => this.onMenuKey(e));
    const head = h('div', { class: 'aqm-head' }, h('span', { class: 'aqm-head-title', id: 'aqm-title' }, 'Your tanks'), this.countEl, h('span', { class: 'aq-flex' }));
    if (sheet) head.append(iconButton('close', 'Close', () => this.close(true), 'aq-icon-btn aqm-close'));
    const panel = h('div', { class: 'aqm-panel aq-glass' }, head, this.menu);
    const scrim = h('div', { class: 'aqm-scrim' });
    scrim.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      this.close(false);
    });
    const root = h('div', { class: `aqm${sheet ? ' is-sheet' : ''}` }, scrim, panel);
    // Keys inside the menu never reach the tank's shortcuts.
    root.addEventListener('keydown', (e) => e.stopPropagation());
    if (sheet) this.wireSheetSwipe(head, panel);
    else {
      // Hang below the name and the clock line (one layout read, on open).
      const r = this.el.getBoundingClientRect();
      const top = Math.round((this.el.parentElement ?? this.el).getBoundingClientRect().bottom + 8);
      panel.style.top = `${top}px`;
      panel.style.left = `${Math.max(8, Math.round(r.left - 6))}px`;
      panel.style.maxHeight = `${Math.max(180, window.innerHeight - top - 16)}px`;
    }
    this.root = root;
    this.expanded = null;
    this.renaming = null;
    this.render();
    this.layer.append(root);
    setAttr(this.el, 'aria-expanded', 'true');
    setAttr(this.el, 'aria-controls', 'aqm-menu');
    window.addEventListener('keydown', this.keyCapture, true);
    requestAnimationFrame(() => requestAnimationFrame(() => root.classList.add('is-in')));
    const cur = this.menu.querySelector<HTMLElement>('.aqm-item[aria-checked="true"]') ?? this.menu.querySelector<HTMLElement>('[data-nav]');
    cur?.focus({ preventScroll: true });
    // With many tanks the open one may be far down the list: bring it into view.
    const menu = this.menu;
    if (cur && menu.scrollHeight > menu.clientHeight) {
      const r = cur.getBoundingClientRect();
      const m = menu.getBoundingClientRect();
      menu.scrollTop = Math.max(0, menu.scrollTop + r.top - m.top - (m.height - r.height) / 2);
    }
  }

  close(focusTrigger: boolean): void {
    const root = this.root;
    if (!root) return;
    this.root = null;
    this.menu = null;
    this.expanded = null;
    this.renaming = null;
    window.removeEventListener('keydown', this.keyCapture, true);
    setAttr(this.el, 'aria-expanded', 'false');
    const hadFocus = root.contains(document.activeElement);
    root.inert = true;
    root.classList.remove('is-in');
    setTimeout(() => root.remove(), prefersReducedMotion() ? 0 : 280);
    if (focusTrigger && usingKeyboard()) this.el.focus({ preventScroll: true });
    else if (hadFocus) (document.activeElement as HTMLElement | null)?.blur?.();
  }

  private onTanksChanged(): void {
    this.refresh();
    if (!this.root || this.renaming) return;
    // Re-render in place, keeping focus on the same tank where possible.
    const a = document.activeElement as HTMLElement | null;
    const id = a?.closest<HTMLElement>('.aqm-row')?.dataset.id;
    const kind = a?.classList.contains('aqm-more') ? '.aqm-more' : '.aqm-item';
    const had = !!a && !!this.menu?.contains(a);
    this.render();
    if (had) (this.menu?.querySelector<HTMLElement>(`.aqm-row[data-id="${CSS.escape(id ?? '')}"] ${kind}`) ?? this.menu?.querySelector<HTMLElement>('[data-nav]'))?.focus({ preventScroll: true });
  }

  // ------------------------------------------------------------------------------------------
  // Rows
  // ------------------------------------------------------------------------------------------

  private render(): void {
    const menu = this.menu;
    if (!menu) return;
    this.tanks = this.host.app.listTanks();
    if (this.expanded && !this.tanks.some((t) => t.id === this.expanded)) this.expanded = null;
    const units = this.host.app.world.settings.units;
    const rows = this.tanks.map((t) => this.row(t, units));
    const add = h('button', { type: 'button', role: 'menuitem', class: 'aqm-new', tabindex: '-1', 'data-nav': '' }, icon('plus', 18), h('span', null, 'New tank…'));
    add.addEventListener('click', () => this.openBuilder());
    menu.replaceChildren(...rows, h('div', { class: 'aqm-sep', role: 'separator' }), add);
    if (this.countEl) setText(this.countEl, String(this.tanks.length));
  }

  private row(t: TankSummary, units: 'metric' | 'imperial'): HTMLElement {
    const row = h('div', { class: `aqm-row${t.current ? ' is-current' : ''}`, role: 'group', 'aria-label': t.name, 'data-id': t.id });
    const more = h('button', { type: 'button', role: 'menuitem', class: 'aqm-more', tabindex: '-1', 'aria-haspopup': 'true', 'aria-expanded': 'false', 'aria-label': `Rename, duplicate or delete ${t.name}`, title: 'Rename, duplicate or delete' }, glyph('more', 18));
    more.addEventListener('click', () => this.toggleActions(t.id));
    const main =
      this.renaming === t.id
        ? this.renameForm(t)
        : (() => {
            const item = h(
              'button',
              { type: 'button', role: 'menuitemradio', class: 'aqm-item', tabindex: '-1', 'aria-checked': String(t.current), 'data-nav': '' },
              h('span', { class: `aqm-glyph is-${t.water}`, title: waterLabel(t.water) }, glyph(t.water as GlyphName, 20)),
              h(
                'span',
                { class: 'aqm-text' },
                h('span', { class: 'aqm-name' }, t.name),
                h('span', { class: 'aqm-sub' }, `${waterLabel(t.water)} · ${tankLine(t, units)}`),
                h('span', { class: 'aqm-sub' }, `${animalsLabel(t.animals)} · ${lastWatched(t)}`),
              ),
              t.current ? h('span', { class: 'aqm-open' }, 'Open') : null,
            );
            item.addEventListener('click', () => {
              if (this.suppressClick) {
                this.suppressClick = false;
                return;
              }
              void this.choose(t);
            });
            this.wireLongPress(item, t.id);
            return item;
          })();
    row.append(h('div', { class: 'aqm-row-main' }, main, this.renaming === t.id ? null : more));
    if (this.expanded === t.id) {
      row.classList.add('is-expanded');
      more.setAttribute('aria-expanded', 'true');
      row.append(this.actions(t));
    }
    return row;
  }

  private actions(t: TankSummary): HTMLElement {
    const only = this.tanks.length <= 1;
    const act = (g: GlyphName | 'trash', label: string, fn: () => void, cls = '') => {
      const b = h('button', { type: 'button', role: 'menuitem', class: `aqm-act ${cls}`, tabindex: '-1', 'data-nav': '' }, g === 'trash' ? icon('trash', 16) : glyph(g, 16), h('span', null, label));
      b.addEventListener('click', fn);
      return b;
    };
    const del = act('trash', 'Delete…', () => !only && this.confirmDelete(t), 'is-danger');
    if (only) {
      del.setAttribute('aria-disabled', 'true');
      del.title = 'Your only tank can’t be deleted';
    }
    return h(
      'div',
      { class: 'aqm-actions', role: 'group', 'aria-label': `Actions for ${t.name}` },
      act('pencil', 'Rename', () => this.startRename(t.id)),
      act('copy', 'Duplicate', () => void this.duplicate(t)),
      del,
      only ? h('p', { class: 'aqm-actions-note' }, 'Your only tank can’t be deleted — add another first.') : null,
    );
  }

  /** Show or hide one tank's actions in place (the row under the finger stays put). */
  private toggleActions(id: string, focusFirst = false): void {
    const menu = this.menu;
    if (!menu) return;
    const prev = this.expanded;
    if (prev) {
      const r = menu.querySelector<HTMLElement>(`.aqm-row[data-id="${CSS.escape(prev)}"]`);
      r?.classList.remove('is-expanded');
      r?.querySelector('.aqm-actions')?.remove();
      r?.querySelector('.aqm-more')?.setAttribute('aria-expanded', 'false');
      this.expanded = null;
      if (prev === id) return;
    }
    const t = this.tanks.find((q) => q.id === id);
    const row = menu.querySelector<HTMLElement>(`.aqm-row[data-id="${CSS.escape(id)}"]`);
    if (!t || !row) return;
    this.expanded = id;
    row.classList.add('is-expanded');
    row.querySelector('.aqm-more')?.setAttribute('aria-expanded', 'true');
    const acts = this.actions(t);
    row.append(acts);
    if (focusFirst) acts.querySelector<HTMLElement>('[data-nav]')?.focus({ preventScroll: true });
    acts.scrollIntoView({ block: 'nearest' });
  }

  private wireLongPress(item: HTMLElement, id: string): void {
    let timer = 0;
    let start: { x: number; y: number } | null = null;
    const cancel = () => {
      clearTimeout(timer);
      start = null;
    };
    item.addEventListener('pointerdown', (e) => {
      this.suppressClick = false;
      if (e.pointerType === 'mouse') return;
      start = { x: e.clientX, y: e.clientY };
      timer = window.setTimeout(() => {
        start = null;
        this.suppressClick = true;
        if (this.expanded !== id) this.toggleActions(id);
      }, LONG_PRESS_MS);
    });
    item.addEventListener('pointermove', (e) => {
      if (start && Math.hypot(e.clientX - start.x, e.clientY - start.y) > 10) cancel();
    });
    item.addEventListener('pointerup', cancel);
    item.addEventListener('pointercancel', cancel);
    // No system context menu / callout on a long press.
    item.addEventListener('contextmenu', (e) => e.preventDefault());
  }

  // ------------------------------------------------------------------------------------------
  // Actions
  // ------------------------------------------------------------------------------------------

  private async choose(t: TankSummary): Promise<void> {
    if (t.current) return this.close(true);
    this.close(true);
    // The app shows its own "while you were away" summary once the tank has caught up.
    await fadeThrough(this.layer, () => this.host.app.switchTank(t.id));
  }

  private startRename(id: string): void {
    this.expanded = null;
    this.renaming = id;
    this.render();
    const input = this.menu?.querySelector<HTMLInputElement>('.aqm-rename-input');
    input?.focus({ preventScroll: true });
    input?.select();
  }

  private renameForm(t: TankSummary): HTMLElement {
    const input = h('input', { type: 'text', class: 'aqm-rename-input', value: t.name, maxlength: MAX_NAME_LENGTH, 'aria-label': `New name for ${t.name}`, autocomplete: 'off', spellcheck: 'false', enterkeyhint: 'done' });
    let done = false;
    const finish = (save: boolean) => {
      if (done) return;
      done = true;
      this.cancelRename = null;
      const v = input.value.trim();
      this.renaming = null;
      if (save && v && v !== t.name) {
        // The app emits 'tanks-changed'; render now too so the row never shows a stale form.
        // (Only pull focus back if the keeper hasn't moved on while a cloud copy was fetched.)
        void this.host.app.renameTank(t.id, v).then(() => {
          const a = document.activeElement;
          if (!a || a === document.body || a.closest(`.aqm-row[data-id="${CSS.escape(t.id)}"]`)) this.focusRow(t.id);
        });
      }
      this.render();
      this.focusRow(t.id);
    };
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        finish(true);
      }
    });
    input.addEventListener('blur', () => finish(true));
    const save = iconButton('check', 'Save the name', () => finish(true), 'aq-icon-btn aqm-rename-save');
    // Keep focus in the field while the save button is pressed (blur would save first anyway).
    save.addEventListener('pointerdown', (e) => e.preventDefault());
    this.cancelRename = () => finish(false);
    return h('div', { class: 'aqm-rename' }, h('span', { class: `aqm-glyph is-${t.water}` }, glyph(t.water as GlyphName, 20)), input, save);
  }

  private focusRow(id: string): void {
    this.menu?.querySelector<HTMLElement>(`.aqm-row[data-id="${CSS.escape(id)}"] .aqm-item`)?.focus({ preventScroll: true });
  }

  private async duplicate(t: TankSummary): Promise<void> {
    if (this.acting) return;
    this.acting = true;
    this.expanded = null;
    let id: string | null = null;
    try {
      id = await this.host.app.duplicateTank(t.id);
    } finally {
      this.acting = false;
    }
    if (!id) {
      this.host.toast('That tank could not be copied right now.', 'warning');
      return;
    }
    this.render();
    this.focusRow(id);
    this.host.toast(`Copied “${t.name}” — the copy lives on by itself.`, 'success');
  }

  private confirmDelete(t: TankSummary): void {
    if (this.dialog) return;
    const next = t.current ? this.tanks.filter((q) => q.id !== t.id).sort((a, b) => b.lastSavedReal - a.lastSavedReal)[0] : undefined;
    const keep = h('button', { type: 'button', class: 'aq-btn aq-btn-ghost' }, 'Keep it');
    const del = h('button', { type: 'button', class: 'aq-btn aq-btn-danger' }, icon('trash', 16), h('span', null, 'Delete tank'));
    keep.addEventListener('click', () => this.closeDialog());
    del.addEventListener('click', () => void this.delete(t));
    const card = h(
      'div',
      { class: 'aqm-dialog-card aq-glass' },
      h('h2', { class: 'aqm-dialog-title', id: 'aqm-del-t' }, 'Delete this tank?'),
      h('p', { class: 'aqm-dialog-text', id: 'aqm-del-d' }, deleteMessage(t)),
      next ? h('p', { class: 'aq-hint' }, `“${next.name}” will open in its place.`) : null,
      h('div', { class: 'aqm-dialog-actions' }, keep, del),
    );
    const el = h('div', { class: 'aqm-dialog', role: 'alertdialog', 'aria-modal': 'true', 'aria-labelledby': 'aqm-del-t', 'aria-describedby': 'aqm-del-d' }, card);
    el.addEventListener('pointerdown', (e) => e.target === el && this.closeDialog());
    el.addEventListener('keydown', (e) => {
      e.stopPropagation();
      if (e.key === 'Tab') {
        // Two buttons: Tab moves between them and stays inside.
        e.preventDefault();
        (document.activeElement === keep ? del : keep).focus();
      }
    });
    if (this.root) this.root.inert = true;
    this.dialog = el;
    this.layer.append(el);
    requestAnimationFrame(() => requestAnimationFrame(() => el.classList.add('is-in')));
    keep.focus({ preventScroll: true });
  }

  private closeDialog(): void {
    const el = this.dialog;
    if (!el) return;
    this.dialog = null;
    el.remove();
    if (this.root) {
      this.root.inert = false;
      this.menu?.querySelector<HTMLElement>('.aqm-act.is-danger')?.focus({ preventScroll: true });
    }
  }

  private async delete(t: TankSummary): Promise<void> {
    this.closeDialog();
    if (this.acting) return;
    this.acting = true;
    let ok: boolean | undefined;
    try {
      if (t.current) {
        // Its replacement opens: fade through, as for any switch.
        this.close(true);
        ok = await fadeThrough(this.layer, () => this.host.app.deleteTank(t.id));
      } else {
        ok = await this.host.app.deleteTank(t.id);
        this.focusRow(this.host.app.currentTankId());
      }
    } finally {
      this.acting = false;
    }
    this.host.toast(ok ? `Deleted “${t.name}”.` : `“${t.name}” could not be deleted right now.`, ok ? 'info' : 'warning');
  }

  // ------------------------------------------------------------------------------------------
  // Keyboard & gestures
  // ------------------------------------------------------------------------------------------

  /** Window capture while open: Esc closes the innermost layer first. */
  private onKeyCapture(e: KeyboardEvent): void {
    if (e.key !== 'Escape') return;
    e.preventDefault();
    e.stopPropagation();
    if (this.dialog) return this.closeDialog();
    if (this.renaming) {
      const id = this.renaming;
      this.cancelRename?.();
      return this.focusRow(id);
    }
    if (this.expanded) {
      const id = this.expanded;
      this.toggleActions(id);
      this.menu?.querySelector<HTMLElement>(`.aqm-row[data-id="${CSS.escape(id)}"] .aqm-more`)?.focus({ preventScroll: true });
      return;
    }
    this.close(true);
  }

  /** Arrow keys walk the tanks (and open actions); → / ← step between a tank and its ⋯. */
  private onMenuKey(e: KeyboardEvent): void {
    const menu = this.menu;
    const t = e.target as HTMLElement;
    if (!menu || t.tagName === 'INPUT') return;
    const nav = [...menu.querySelectorAll<HTMLElement>('[data-nav]')];
    const row = t.closest<HTMLElement>('.aqm-row');
    const from = t.classList.contains('aqm-more') ? (row?.querySelector<HTMLElement>('.aqm-item') ?? t) : t;
    const i = nav.indexOf(from);
    const go = (j: number) => nav[(j + nav.length) % nav.length]?.focus({ preventScroll: false });
    switch (e.key) {
      case 'ArrowDown':
        go(i + 1);
        break;
      case 'ArrowUp':
        go(i - 1);
        break;
      case 'Home':
        go(0);
        break;
      case 'End':
        go(nav.length - 1);
        break;
      case 'ArrowRight':
        if (t.classList.contains('aqm-item')) row?.querySelector<HTMLElement>('.aqm-more')?.focus();
        else if (t.classList.contains('aqm-more') && row?.dataset.id) this.toggleActions(row.dataset.id, this.expanded !== row.dataset.id);
        else return;
        break;
      case 'ArrowLeft':
        if (t.classList.contains('aqm-more')) row?.querySelector<HTMLElement>('.aqm-item')?.focus();
        else if (t.classList.contains('aqm-act')) row?.querySelector<HTMLElement>('.aqm-more')?.focus();
        else return;
        break;
      case 'Tab':
        this.close(true);
        break;
      default:
        return;
    }
    e.preventDefault();
  }

  /** Phones: pull the sheet down by its header to close it. */
  private wireSheetSwipe(head: HTMLElement, panel: HTMLElement): void {
    let drag: { id: number; y: number } | null = null;
    head.addEventListener('pointerdown', (e) => {
      if ((e.target as Element).closest('button')) return;
      drag = { id: e.pointerId, y: e.clientY };
      try {
        head.setPointerCapture(e.pointerId);
      } catch {
        /* synthetic pointer */
      }
    });
    head.addEventListener('pointermove', (e) => {
      if (!drag || drag.id !== e.pointerId) return;
      const dy = Math.max(0, e.clientY - drag.y);
      panel.style.transform = dy > 4 ? `translateY(${Math.round(dy - 4)}px)` : '';
    });
    const end = (e: PointerEvent) => {
      if (!drag || drag.id !== e.pointerId) return;
      const dy = e.clientY - drag.y;
      drag = null;
      if (dy > 70) this.close(false);
      else panel.style.transform = '';
    };
    head.addEventListener('pointerup', end);
    head.addEventListener('pointercancel', end);
  }
}
