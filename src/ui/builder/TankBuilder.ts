/**
 * The guided tank builder: a calm full-screen sheet over the dimmed tank, one step at a time.
 * A progress line, a row of chips for the choices so far (each jumps back to its step), Back /
 * Next (Enter), Esc or ✕ to leave (asking first once something was chosen), swipes between steps
 * on phones. The plan is a `TankSpec` held in memory; "Create tank" hands it to the app and fades
 * into the new tank.
 */
import type { WaterType } from '../../core/types';
import type { AquascapeInfo } from '../../app/tankTypes';
import type { UIHost } from '../context';
import { iconButton } from '../controls';
import { h, prefersReducedMotion, setAttr, setClass, setText } from '../dom';
import { formatLiters, formatTemp } from '../format';
import { SUBSTRATES } from '../scapeArt';
import { fadeThrough, usingKeyboard } from './fade';
import { animalsLabel, waterLabel } from './labels';
import { BuilderModel, STEPS, STEP_NAMES, stepIssue, type StepId } from './model';
import { formatDims } from './tankMath';
import { frameBatch } from './widgets';
import { animalsStep } from './steps/animals';
import { cycleStep } from './steps/cycle';
import { equipmentStep } from './steps/equipment';
import { lookStep } from './steps/look';
import { reviewStep } from './steps/review';
import { sizeStep } from './steps/size';
import { startStep } from './steps/start';
import { styleStep } from './steps/style';
import type { StepEnv, StepView } from './steps/types';
import { waterStep } from './steps/water';

/** The numbered steps (the start choice comes before step 1). */
const NUMBERED = STEPS.filter((s) => s !== 'start');

const MAKERS: Record<StepId, (env: StepEnv) => StepView> = {
  start: startStep,
  water: waterStep,
  size: sizeStep,
  style: styleStep,
  look: lookStep,
  equipment: equipmentStep,
  cycle: cycleStep,
  animals: animalsStep,
  review: reviewStep,
};

const FILTER_SHORT: Record<string, string> = { canister: 'Canister', 'hang-on-back': 'Hang-on-back', internal: 'Internal filter', sponge: 'Sponge filter', sump: 'Sump' };

const FOCUSABLE = 'button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), a[href], [tabindex]:not([tabindex="-1"])';

export interface BuilderOptions {
  /** Where focus goes back to when the builder closes. */
  returnFocus?: HTMLElement | null;
  /** Open on the ready-made tanks rather than the step-by-step path. */
  start?: 'build' | 'preset';
}

export class TankBuilder {
  readonly el: HTMLElement;
  /** Called once the builder has gone (closed or created). */
  onClosed?: () => void;

  private sheet: HTMLElement;
  private progressCount: HTMLElement;
  private progressName: HTMLElement;
  private bar: HTMLElement;
  private segs: HTMLElement[] = [];
  private chipsEl: HTMLElement;
  private body: HTMLElement;
  private content: HTMLElement;
  private titleEl: HTMLElement;
  private leadEl: HTMLElement;
  private stepHost: HTMLElement;
  private backBtn: HTMLButtonElement;
  private nextBtn: HTMLButtonElement;
  private nextText: HTMLElement;
  private issueEl: HTMLElement;

  private model: BuilderModel;
  private env: StepEnv;
  private step: StepId = 'start';
  /** Furthest step reached (chips offer the ones before it). */
  private reached = 0;
  private view: StepView | null = null;
  private stylesCache = new Map<WaterType, AquascapeInfo[]>();
  private confirmEl: HTMLElement | null = null;
  private closed = false;
  private returnFocus: HTMLElement | null;
  private readonly keyCapture = (e: KeyboardEvent) => this.onKeyCapture(e);
  private readonly refreshChrome = frameBatch(() => this.syncChrome());

  constructor(
    private host: UIHost,
    private layer: HTMLElement,
    opts: BuilderOptions = {},
  ) {
    const app = host.app;
    this.returnFocus = opts.returnFocus ?? null;
    this.stylesCache.set('freshwater', app.aquascapes('freshwater'));
    this.model = new BuilderModel(app.shapeSizes(), this.stylesCache.get('freshwater')!, app.listTanks().map((t) => t.name));
    this.env = {
      host,
      model: this.model,
      units: app.world.settings.units,
      changed: () => this.refreshChrome(),
      goto: (s) => this.goto(s),
      next: () => this.next(),
      usePreset: (id, name) => this.usePreset(id, name),
      styles: (w = this.model.spec.water) => {
        let list = this.stylesCache.get(w);
        if (!list) this.stylesCache.set(w, (list = app.aquascapes(w)));
        return list;
      },
      cache: { suggestions: new Map(), pickerQuery: '', startMode: opts.start ?? 'build' },
    };

    // Header: progress and close.
    this.progressCount = h('span', { class: 'aqb-progress-count' });
    this.progressName = h('span', { class: 'aqb-progress-name' });
    this.bar = h('div', { class: 'aqb-bar', role: 'progressbar', 'aria-valuemin': 1, 'aria-valuemax': NUMBERED.length, 'aria-label': 'Progress' });
    for (let i = 0; i < NUMBERED.length; i++) {
      const seg = h('span', { class: 'aqb-seg' });
      this.segs.push(seg);
      this.bar.append(seg);
    }
    const close = iconButton('close', 'Close the tank builder', () => this.requestClose(), 'aq-icon-btn aqb-close');
    this.chipsEl = h('nav', { class: 'aqb-chips', 'aria-label': 'Your choices so far' });
    // The chips wrap onto their own line (or share the progress line on short screens).
    const head = h('header', { class: 'aqb-head' }, h('div', { class: 'aqb-progress' }, h('div', { class: 'aqb-progress-text' }, this.progressCount, this.progressName), this.bar), this.chipsEl, close);

    // Body: the step.
    this.titleEl = h('h2', { class: 'aqb-title', id: 'aqb-title', tabindex: '-1' });
    this.leadEl = h('p', { class: 'aqb-lead' });
    this.stepHost = h('div', { class: 'aqb-step' });
    this.content = h('div', { class: 'aqb-content' }, this.titleEl, this.leadEl, this.stepHost);
    this.body = h('div', { class: 'aqb-body' }, this.content);

    // Footer: Back · issue · Next.
    this.backBtn = h('button', { type: 'button', class: 'aq-btn aq-btn-ghost aqb-back' });
    this.backBtn.addEventListener('click', () => this.back());
    this.nextText = h('span', null, 'Next');
    this.nextBtn = h('button', { type: 'button', class: 'aq-btn aq-btn-primary aqb-next' }, this.nextText, h('kbd', { class: 'aqb-enter', 'aria-hidden': 'true' }, '↵'));
    this.nextBtn.addEventListener('click', () => this.next());
    this.issueEl = h('p', { class: 'aqb-issue', role: 'status', 'aria-live': 'polite' });
    const foot = h('footer', { class: 'aqb-foot' }, this.backBtn, this.issueEl, this.nextBtn);

    this.sheet = h('div', { class: 'aqb-sheet', role: 'dialog', 'aria-modal': 'true', 'aria-labelledby': 'aqb-title', tabindex: '-1' }, head, this.body, foot);
    const scrim = h('div', { class: 'aqb-scrim' });
    scrim.addEventListener('click', () => this.requestClose());
    this.el = h('div', { class: 'aqb' }, scrim, this.sheet);

    this.el.addEventListener('keydown', (e) => this.onKey(e));
    this.wireSwipe();
    layer.append(this.el);
    window.addEventListener('keydown', this.keyCapture, true);
    this.show('start', 0);
    requestAnimationFrame(() => requestAnimationFrame(() => this.el.classList.add('is-in')));
  }

  // ------------------------------------------------------------------------------------------
  // Steps
  // ------------------------------------------------------------------------------------------

  private show(step: StepId, dir: number): void {
    this.view?.dispose?.();
    this.step = step;
    this.reached = Math.max(this.reached, STEPS.indexOf(step));
    const view = MAKERS[step](this.env);
    this.view = view;
    setText(this.titleEl, view.title);
    setText(this.leadEl, view.lead ?? '');
    this.leadEl.hidden = !view.lead;
    this.stepHost.replaceChildren(view.el);
    this.body.scrollTop = 0;
    this.sheet.dataset.step = step;
    // A short slide in the direction of travel (just a fade with reduced motion).
    const c = this.content;
    c.classList.remove('is-from-next', 'is-from-prev');
    if (dir) {
      c.classList.add(dir > 0 ? 'is-from-next' : 'is-from-prev');
      requestAnimationFrame(() => requestAnimationFrame(() => c.classList.remove('is-from-next', 'is-from-prev')));
    }
    this.syncChrome();
    if (this.sheet.contains(document.activeElement) || dir) this.titleEl.focus({ preventScroll: true });
    else this.sheet.focus({ preventScroll: true });
    requestAnimationFrame(() => {
      if (this.view === view && !this.closed) view.onShown?.();
    });
  }

  private goto(step: StepId): void {
    if (step === this.step) return;
    this.show(step, Math.sign(STEPS.indexOf(step) - STEPS.indexOf(this.step)));
  }

  private next(): void {
    if (this.closed || this.confirmEl) return;
    if (this.step === 'start' && this.env.cache.startMode === 'preset') return;
    const issue = stepIssue(this.step, this.model.spec);
    if (issue) {
      setText(this.issueEl, issue);
      return;
    }
    if (this.step === 'review') {
      void this.create();
      return;
    }
    this.show(STEPS[STEPS.indexOf(this.step) + 1], 1);
  }

  private back(): void {
    if (this.closed) return;
    if (this.step === 'start') return this.requestClose();
    this.show(STEPS[STEPS.indexOf(this.step) - 1], -1);
  }

  /** Progress line, chips and footer for the current step and spec. */
  private syncChrome(): void {
    const n = NUMBERED.indexOf(this.step as (typeof NUMBERED)[number]);
    if (n < 0) {
      setText(this.progressCount, 'New tank');
      setText(this.progressName, '');
    } else {
      setText(this.progressCount, `Step ${n + 1} of ${NUMBERED.length}`);
      setText(this.progressName, STEP_NAMES[this.step]);
    }
    this.bar.hidden = n < 0;
    setAttr(this.bar, 'aria-valuenow', String(Math.max(1, n + 1)));
    setAttr(this.bar, 'aria-valuetext', n < 0 ? 'Getting started' : `Step ${n + 1} of ${NUMBERED.length}: ${STEP_NAMES[this.step]}`);
    this.segs.forEach((s, i) => {
      setClass(s, 'is-done', i < n);
      setClass(s, 'is-current', i === n);
    });
    this.renderChips();

    setText(this.backBtn, this.step === 'start' ? 'Cancel' : 'Back');
    const preset = this.step === 'start' && this.env.cache.startMode === 'preset';
    setText(this.nextText, this.step === 'review' ? 'Create tank' : preset ? 'Pick a tank above' : this.step === 'start' ? 'Begin' : 'Next');
    this.nextBtn.disabled = preset;
    setClass(this.nextBtn, 'is-create', this.step === 'review');
    const issue = stepIssue(this.step, this.model.spec);
    setText(this.issueEl, issue ?? '');
  }

  private chipValue(step: StepId): string {
    const m = this.model;
    const s = m.spec;
    const units = this.env.units;
    switch (step) {
      case 'water':
        return waterLabel(s.water);
      case 'size':
        return `${formatDims(s.size, units)} · ${formatLiters(m.liters, units)}`;
      case 'style':
        return m.style?.name ?? 'Bare substrate';
      case 'look':
        return SUBSTRATES.find((x) => x.value === s.substrate)?.label ?? s.substrate;
      case 'equipment': {
        const eq = m.equipment;
        return `${FILTER_SHORT[eq.filter.type] ?? eq.filter.type} · ${eq.heater.on ? formatTemp(eq.heater.targetC, units, eq.heater.targetC % 1 ? 1 : 0) : 'unheated'}`;
      }
      case 'cycle':
        return s.cycled ? 'Mature filter' : 'Fishless cycle';
      case 'animals':
        return animalsLabel(m.animals);
      default:
        return '';
    }
  }

  private renderChips(): void {
    const chips: HTMLElement[] = [];
    for (const step of NUMBERED) {
      if (step === 'review') continue;
      const i = STEPS.indexOf(step);
      // Choices made so far: steps already passed (and the current one once it has been passed before).
      if (i > this.reached || (i === this.reached && step === this.step)) continue;
      const b = h('button', { type: 'button', class: 'aqb-chip', 'aria-current': step === this.step ? 'step' : undefined, 'aria-label': `${STEP_NAMES[step]}: ${this.chipValue(step)}. Edit`, title: STEP_NAMES[step] }, this.chipValue(step));
      b.addEventListener('click', () => this.goto(step));
      chips.push(b);
    }
    this.chipsEl.replaceChildren(...chips);
    this.chipsEl.hidden = !chips.length;
  }

  // ------------------------------------------------------------------------------------------
  // Finishing
  // ------------------------------------------------------------------------------------------

  /** Create the tank and fade into it (the builder stays if creating fails). */
  private async create(): Promise<void> {
    const spec = this.model.toSpec();
    await this.leaveInto(() => this.host.app.createTank(spec), () => {
      this.host.toast(spec.cycled ? `Welcome to “${spec.name}”.` : `Welcome to “${spec.name}”. The filter is cycling — test the water in Care every few days.`, 'success');
    });
  }

  private async usePreset(id: string, name: string): Promise<void> {
    await this.leaveInto(() => this.host.app.loadPreset(id), () => this.host.toast(`Welcome to “${name}” — your other tanks keep living in the tank menu.`, 'success'));
  }

  private async leaveInto(work: () => unknown, done: () => void): Promise<void> {
    if (this.closed) return;
    let ok = false;
    this.el.classList.add('is-leaving');
    await fadeThrough(
      this.layer,
      () => {
        work();
        ok = true;
      },
      () => {
        if (ok) this.destroy(false);
        else this.el.classList.remove('is-leaving');
      },
    );
    if (ok) done();
    else this.host.toast('Sorry — that tank could not be set up.', 'warning');
  }

  /** Leave, asking first when something has been chosen. */
  private requestClose(): void {
    if (this.closed) return;
    if (this.model.changed || this.reached >= 2) this.showConfirm();
    else this.close();
  }

  private showConfirm(): void {
    if (this.confirmEl) return;
    const keep = h('button', { type: 'button', class: 'aq-btn aq-btn-primary' }, 'Keep building');
    const leave = h('button', { type: 'button', class: 'aq-btn aq-btn-ghost' }, 'Leave');
    keep.addEventListener('click', () => this.hideConfirm());
    leave.addEventListener('click', () => this.close());
    const el = h(
      'div',
      { class: 'aqb-confirm', role: 'alertdialog', 'aria-modal': 'true', 'aria-labelledby': 'aqb-confirm-t', 'aria-describedby': 'aqb-confirm-d' },
      h(
        'div',
        { class: 'aqb-confirm-card aq-glass' },
        h('h3', { id: 'aqb-confirm-t' }, 'Leave the builder?'),
        h('p', { id: 'aqb-confirm-d' }, 'The new tank won’t be created, and the choices you made will be lost.'),
        h('div', { class: 'aqb-confirm-actions' }, leave, keep),
      ),
    );
    el.addEventListener('pointerdown', (e) => e.target === el && this.hideConfirm());
    this.confirmEl = el;
    this.el.append(el);
    requestAnimationFrame(() => el.classList.add('is-in'));
    keep.focus({ preventScroll: true });
  }

  private hideConfirm(): void {
    const el = this.confirmEl;
    if (!el) return;
    this.confirmEl = null;
    el.remove();
    this.titleEl.focus({ preventScroll: true });
  }

  /** Close without creating anything. */
  close(): void {
    if (this.closed) return;
    this.destroy(true);
  }

  private destroy(animate: boolean): void {
    if (this.closed) return;
    this.closed = true;
    window.removeEventListener('keydown', this.keyCapture, true);
    this.view?.dispose?.();
    this.view = null;
    const el = this.el;
    const hadFocus = el.contains(document.activeElement);
    if (animate && !prefersReducedMotion()) {
      el.classList.remove('is-in');
      setTimeout(() => el.remove(), 340);
    } else el.remove();
    if (hadFocus) {
      if (this.returnFocus?.isConnected && usingKeyboard()) this.returnFocus.focus({ preventScroll: true });
      else (document.activeElement as HTMLElement | null)?.blur?.();
    }
    this.onClosed?.();
  }

  // ------------------------------------------------------------------------------------------
  // Keyboard & gestures
  // ------------------------------------------------------------------------------------------

  /** Window capture: Esc leaves (or dismisses the question), Tab stays inside, nothing reaches the tank. */
  private onKeyCapture(e: KeyboardEvent): void {
    if (this.closed) return;
    if (e.key === 'Escape') {
      e.preventDefault();
      e.stopPropagation();
      if (this.confirmEl) this.hideConfirm();
      else this.requestClose();
      return;
    }
    if (e.key === 'Tab') this.trapTab(e);
    if (!this.el.contains(e.target as Node)) e.stopPropagation();
  }

  /** Enter moves on (unless it belongs to the focused control); keys never reach the tank's shortcuts. */
  private onKey(e: KeyboardEvent): void {
    e.stopPropagation();
    if (e.key !== 'Enter' || e.isComposing || e.shiftKey || e.altKey || e.ctrlKey || e.metaKey || this.confirmEl) return;
    const t = e.target as HTMLElement;
    if (t.closest('button, a, select, textarea, [role="radio"], [role="switch"], [contenteditable="true"]')) return;
    if (t instanceof HTMLInputElement) {
      if (t.dataset.enter === 'ignore') return;
      // Settle a typed number before moving on.
      if (t.type === 'number') t.dispatchEvent(new Event('change'));
    }
    e.preventDefault();
    this.next();
  }

  private trapTab(e: KeyboardEvent): void {
    const root = this.confirmEl ?? this.sheet;
    const items = [...root.querySelectorAll<HTMLElement>(FOCUSABLE)].filter((x) => x.getClientRects().length > 0);
    if (!items.length) return;
    const first = items[0];
    const last = items[items.length - 1];
    const a = document.activeElement;
    if (!a || !root.contains(a)) {
      e.preventDefault();
      first.focus();
    } else if (e.shiftKey && (a === first || a === root)) {
      e.preventDefault();
      last.focus();
    } else if (!e.shiftKey && a === last) {
      e.preventDefault();
      first.focus();
    }
  }

  /** Phones: a decisive horizontal swipe on the step moves to the next or previous step. */
  private wireSwipe(): void {
    let s: { id: number; x: number; y: number; t: number } | null = null;
    this.body.addEventListener('pointerdown', (e) => {
      if (e.pointerType !== 'touch' || this.confirmEl) return;
      if ((e.target as Element).closest('input, select, textarea, .aqb-noswipe, .aqb-chips')) return;
      s = { id: e.pointerId, x: e.clientX, y: e.clientY, t: performance.now() };
    });
    const end = (e: PointerEvent, cancelled: boolean) => {
      const d = s;
      if (!d || d.id !== e.pointerId) return;
      s = null;
      if (cancelled) return;
      const dx = e.clientX - d.x;
      const dy = e.clientY - d.y;
      if (Math.abs(dx) < 70 || Math.abs(dx) < Math.abs(dy) * 2 || performance.now() - d.t > 700) return;
      if (dx < 0) this.next();
      else if (this.step !== 'start') this.back();
    };
    this.body.addEventListener('pointerup', (e) => end(e, false));
    this.body.addEventListener('pointercancel', (e) => end(e, true));
  }
}
