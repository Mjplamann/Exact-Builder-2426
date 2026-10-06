import type { AppApi } from '../app/AppApi';
import { TIME_SCALES } from '../core/clock';
import type { FoodKind, Species } from '../core/types';
import { FOODS } from '../data/foods';
import { CanvasInput, type Mode } from './CanvasInput';
import type { Panel, PanelId, UIHost } from './context';
import { iconButton } from './controls';
import { h, isTyping, prefs, setAttr, setClass, setText } from './dom';
import { FishCard } from './FishCard';
import { foodIcon } from './foodIcons';
import { formatSimClock, formatSimDate, timeScaleLabel } from './format';
import { icon, type IconName } from './icons';
import { Notifier } from './Notifier';
import { bestFood } from './panels/FeedPanel';
import { AquascapePanel } from './panels/AquascapePanel';
import { CarePanel } from './panels/CarePanel';
import { FeedPanel } from './panels/FeedPanel';
import { FishPanel } from './panels/FishPanel';
import { JournalPanel } from './panels/JournalPanel';
import { SettingsPanel } from './panels/SettingsPanel';
import { TimePanel } from './panels/TimePanel';
import { ScapeTool } from './ScapeTool';
import { ThumbnailLoader } from './thumbs';
import { Toasts, type ToastLevel } from './Toasts';
import { assessWater, computeNeeds, healthLabel, type TankNeeds, type WaterAssessment } from './waterHealth';

/**
 * The feeding cursor: thumb and finger pinched together over three falling flakes, with a dark
 * halo so it reads over bright water. Hotspot at the flakes.
 */
const PINCH_CURSOR = (() => {
  const strokes = '<path d="M10 3.5c-2.6 3-3 7 .2 10.4"/><path d="M21.8 3.5c2.6 3 3 7-.2 10.4"/><path d="M10.2 13.9c2.4 1.5 9 1.5 11.4 0"/>';
  const flakes = '<circle cx="16" cy="19.5" r="1.25"/><circle cx="13.4" cy="23.6" r="1"/><circle cx="18.4" cy="25.2" r="1"/>';
  const svg =
    `<svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 32 32">` +
    `<g fill="none" stroke="#000" stroke-opacity=".45" stroke-width="3.4" stroke-linecap="round">${strokes}</g>` +
    `<g fill="none" stroke="#f4fbfb" stroke-width="1.6" stroke-linecap="round">${strokes}</g>` +
    `<g fill="#000" fill-opacity=".45" stroke="#000" stroke-opacity=".45" stroke-width="1.6">${flakes}</g><g fill="#f4fbfb">${flakes}</g></svg>`;
  return `url("data:image/svg+xml,${encodeURIComponent(svg)}") 16 20, crosshair`;
})();

/** Seconds of stillness before the chrome fades away. */
const IDLE_SECONDS = 3.5;
const CORAL_FORMS = new Set(['soft-coral', 'mushroom-coral', 'zoanthid', 'lps-coral', 'sps-coral', 'gorgonian', 'anemone']);

const DOCK: { id: PanelId; label: string; icon: IconName; key: string }[] = [
  { id: 'fish', label: 'Fish', icon: 'fish', key: 'C' },
  { id: 'feed', label: 'Feed', icon: 'feed', key: 'F' },
  { id: 'scape', label: 'Aquascape', icon: 'aquascape', key: 'A' },
  { id: 'care', label: 'Care', icon: 'care', key: '' },
  { id: 'time', label: 'Time', icon: 'time', key: 'Space' },
  { id: 'journal', label: 'Journal', icon: 'journal', key: 'J' },
  { id: 'settings', label: 'Settings', icon: 'settings', key: '' },
];

const SHORTCUTS: [string, string][] = [
  ['C', 'Fish catalog'],
  ['F', 'Feed (last food, anywhere)'],
  ['A', 'Aquascape'],
  ['J', 'Journal'],
  ['Space', 'Pause / resume time'],
  ['1 – 4', 'Speed of time'],
  ['H', 'Hide the interface'],
  ['Esc', 'Close, stop, deselect'],
  ['Scroll', 'Zoom (rotate in Aquascape)'],
  ['Right-drag', 'Pan the view'],
  ['Double-click', 'Tap on the glass'],
  ['R  [  ]  N  Del', 'Rotate, resize, reshape, remove (Aquascape)'],
  ['?', 'This list'],
];

/**
 * The calm, auto-hiding interface: species catalog (search/filter, thumbnails, compatibility),
 * feeding tool, decor & plant editor (place/drag/rotate/scale/delete), care panel (water tests,
 * water change, glass cleaning, equipment, light schedule), time controls, fish info card,
 * journal, settings, notifications, keyboard shortcuts.
 *
 * Everything goes through the AppApi facade; `app.world` is only read.
 */
export class UI implements UIHost {
  readonly thumbs: ThumbnailLoader;
  needs: TankNeeds;
  water: WaterAssessment;
  lastFood: FoodKind;

  private layer: HTMLElement;
  private toasts: Toasts;
  private notifier: Notifier;
  private card: FishCard;
  private scape: ScapeTool;
  private input: CanvasInput;

  // Chrome
  private topLeft!: HTMLElement;
  private nameBtn!: HTMLButtonElement;
  private nameInput!: HTMLInputElement;
  private glyphEl!: HTMLElement;
  private glyphName: IconName | '' = '';
  private dateEl!: HTMLElement;
  private speedEl!: HTMLElement;
  private healthBtn!: HTMLButtonElement;
  private healthLabelEl!: HTMLElement;
  private statsEl!: HTMLElement;
  private dock!: HTMLElement;
  private dockBtns = new Map<PanelId, HTMLButtonElement>();
  private modeHint!: HTMLElement;
  private shortcutsEl: HTMLElement | null = null;

  // Panels
  private panelEl!: HTMLElement;
  private panelTitle!: HTMLElement;
  private panelBody!: HTMLElement;
  private panels = new Map<PanelId, Panel>();
  private current: Panel | null = null;

  // State
  private feeding: FoodKind | null = null;
  private idle = false;
  private manualHidden = false;
  private lastActivity = performance.now();
  private lastPointer = { x: -1, y: -1 };
  private overUI = false;
  private mobileQuery: MediaQueryList;
  private t4 = 0;
  private t1 = 1;
  private frames = 0;
  private fpsT0 = performance.now();
  private fps = 0;
  private needsDirty = true;
  /** Updates seen so far (the idle clock starts after the first frame has been presented). */
  private updates = 0;

  constructor(
    private root: HTMLElement,
    readonly app: AppApi,
  ) {
    this.thumbs = new ThumbnailLoader(app.fishRenderer);
    this.mobileQuery = matchMedia('(max-width: 640px)');
    this.lastFood = prefs.get<FoodKind | null>('lastFood', null) ?? bestFood(app.world.fish, app.world.tank.water);
    if (!FOODS[this.lastFood]) this.lastFood = 'flakes';
    this.needs = computeNeeds(app.world.fish, app.world.tank.water);
    this.water = assessWater(app.world.tank.waterParams, app.world.tank.water, this.needs);

    root.classList.add('aq-root');
    this.layer = root;
    document.documentElement.style.setProperty('--aq-cursor-feed', PINCH_CURSOR);
    this.buildChrome();
    this.buildPanelHost();
    this.toasts = new Toasts(this.layer);
    this.notifier = new Notifier(app.world, (m, l) => this.toast(m, l));
    this.scape = new ScapeTool(this, this.layer);
    this.card = new FishCard(this, this.layer);
    this.input = new CanvasInput(this, this.scape);
    this.input.onFeedAt = (x, y) => this.ripple(x, y);

    this.wireEvents();
    this.wireActivity();
    this.applySettings();
    this.refreshChrome();
  }

  // ------------------------------------------------------------------------------------------
  // UIHost
  // ------------------------------------------------------------------------------------------

  get isMobile(): boolean {
    return this.mobileQuery.matches;
  }

  get openPanelId(): PanelId | null {
    return this.current?.id ?? null;
  }

  get feedingKind(): FoodKind | null {
    return this.feeding;
  }

  toast(message: string, level: ToastLevel = 'info'): void {
    this.toasts.show(message, level);
  }

  startFeeding(kind: FoodKind): void {
    this.feeding = kind;
    this.lastFood = kind;
    prefs.set('lastFood', kind);
    this.setMode('feed');
    const f = FOODS[kind];
    const text = this.modeHint.querySelector('.aq-modehint-text')!;
    const ic = this.modeHint.querySelector('.aq-food-icon');
    ic?.replaceWith(foodIcon(f));
    setText(text, `Click over the tank to drop a pinch of ${f.name.toLowerCase()}`);
    this.modeHint.hidden = false;
    this.panels.get('feed')?.refresh?.();
    (this.panels.get('feed') as FeedPanel | undefined)?.sync();
  }

  stopFeeding(): void {
    if (!this.feeding) return;
    this.feeding = null;
    this.modeHint.hidden = true;
    if (this.input.mode === 'feed') this.setMode(this.current?.id === 'scape' ? 'scape' : 'view');
    (this.panels.get('feed') as FeedPanel | undefined)?.sync();
  }

  showFish(fishId: string): void {
    this.app.select({ fishId });
    if (this.isMobile && this.current) this.openPanel(null);
  }

  showSpecies(sp: Species): void {
    this.openPanel('fish');
    (this.panels.get('fish') as FishPanel | undefined)?.showSpecies(sp);
  }

  showShortcuts(): void {
    if (this.shortcutsEl) return this.hideShortcuts();
    const close = iconButton('close', 'Close', () => this.hideShortcuts(), 'aq-icon-btn aq-shortcuts-close');
    const list = h('dl', { class: 'aq-shortcuts-list' }, ...SHORTCUTS.map(([k, v]) => h('div', { class: 'aq-shortcut' }, h('dt', null, ...k.split(/\s{2}/).map((x) => h('kbd', { class: 'aq-kbd' }, x))), h('dd', null, v))));
    const card = h('div', { class: 'aq-shortcuts-card aq-glass', tabindex: '-1' }, h('div', { class: 'aq-shortcuts-head' }, h('h2', null, 'Keyboard shortcuts'), close), list);
    const el = h('div', { class: 'aq-shortcuts', role: 'dialog', 'aria-modal': 'true', 'aria-label': 'Keyboard shortcuts' }, card);
    el.addEventListener('pointerdown', (e) => {
      if (e.target === el) this.hideShortcuts();
    });
    this.layer.append(el);
    this.shortcutsEl = el;
    requestAnimationFrame(() => requestAnimationFrame(() => el.classList.add('is-in')));
    card.focus({ preventScroll: true });
  }

  private hideShortcuts(): void {
    const el = this.shortcutsEl;
    if (!el) return;
    this.shortcutsEl = null;
    el.classList.remove('is-in');
    setTimeout(() => el.remove(), 400);
  }

  // ------------------------------------------------------------------------------------------
  // Chrome: tank name & time (top-left), water health & stats (top-right), dock
  // ------------------------------------------------------------------------------------------

  private buildChrome(): void {
    this.nameBtn = h('button', { type: 'button', class: 'aq-tankname', title: 'Rename the tank' });
    this.nameBtn.addEventListener('click', () => this.startRenameTank());
    this.nameInput = h('input', { type: 'text', class: 'aq-tankname-input', maxlength: 40, 'aria-label': 'Tank name', hidden: true });
    this.nameInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') this.commitRenameTank();
      else if (e.key === 'Escape') {
        e.stopPropagation();
        this.endRenameTank();
      }
    });
    this.nameInput.addEventListener('blur', () => !this.nameInput.hidden && this.commitRenameTank());
    this.glyphEl = h('span', { class: 'aq-glyph', 'aria-hidden': 'true' });
    this.dateEl = h('span', { class: 'aq-date' });
    this.speedEl = h('button', { type: 'button', class: 'aq-speed', hidden: true, title: 'Change the speed of time' });
    this.speedEl.addEventListener('click', () => this.openPanel('time'));
    this.topLeft = h(
      'header',
      { class: 'aq-topleft aq-chrome' },
      this.nameBtn,
      this.nameInput,
      h('div', { class: 'aq-clockline' }, this.glyphEl, this.dateEl, this.speedEl),
    );

    this.healthLabelEl = h('span', { class: 'aq-health-label' });
    this.healthBtn = h('button', { type: 'button', class: 'aq-health is-good', 'data-health': 'good' }, h('span', { class: 'aq-health-dot', 'aria-hidden': 'true' }), this.healthLabelEl);
    this.healthBtn.addEventListener('click', () => this.togglePanel('care'));
    this.statsEl = h('div', { class: 'aq-stats-readout', hidden: true, 'aria-hidden': 'true' });
    const topRight = h('div', { class: 'aq-topright aq-chrome' }, this.statsEl, this.healthBtn);

    this.dock = h('nav', { class: 'aq-dock aq-chrome aq-glass', 'aria-label': 'Aquarium tools' });
    for (const d of DOCK) {
      const b = h(
        'button',
        { type: 'button', class: 'aq-dock-btn', 'data-panel': d.id, 'aria-label': d.label, 'aria-expanded': 'false', 'aria-keyshortcuts': d.key === 'Space' ? undefined : d.key || undefined, 'data-tip': d.key && d.key !== 'Space' ? `${d.label}  ·  ${d.key}` : d.label },
        icon(d.icon, 22),
        h('span', { class: 'aq-dock-label' }, d.label),
      );
      b.addEventListener('click', () => this.togglePanel(d.id));
      this.dockBtns.set(d.id, b);
      this.dock.append(b);
    }

    const done = h('button', { type: 'button', class: 'aq-btn aq-btn-ghost aq-btn-small' }, 'Done');
    done.addEventListener('click', () => this.stopFeeding());
    this.modeHint = h(
      'div',
      { class: 'aq-modehint aq-glass', hidden: true, role: 'status' },
      h('span', { class: 'aq-food-icon' }),
      h('span', { class: 'aq-modehint-text' }),
      h('span', { class: 'aq-modehint-key' }, h('kbd', { class: 'aq-kbd' }, 'Esc')),
      done,
    );

    this.layer.append(this.topLeft, topRight, this.dock, this.modeHint);
  }

  private startRenameTank(): void {
    this.nameInput.value = this.app.world.tank.name;
    this.nameBtn.hidden = true;
    this.nameInput.hidden = false;
    this.nameInput.focus();
    this.nameInput.select();
  }

  private commitRenameTank(): void {
    const v = this.nameInput.value.trim();
    this.endRenameTank();
    if (v && v !== this.app.world.tank.name) this.app.setTankLook({ name: v });
    this.refreshChrome();
  }

  private endRenameTank(): void {
    this.nameInput.hidden = true;
    this.nameBtn.hidden = false;
  }

  /** ~4 Hz: name, date/time, day-night glyph, speed. */
  private refreshChrome(): void {
    const w = this.app.world;
    setText(this.nameBtn, w.tank.name);
    const t = w.clock.simTime;
    setText(this.dateEl, `${formatSimDate(t)} · ${formatSimClock(t)}`);
    const d = w.env.daylight;
    const glyph: IconName = d > 0.45 ? 'sun' : d > 0.02 ? 'dawn' : 'moon';
    if (glyph !== this.glyphName) {
      this.glyphName = glyph;
      this.glyphEl.replaceChildren(icon(glyph, 14));
      this.glyphEl.title = glyph === 'sun' ? 'Lights on' : glyph === 'dawn' ? 'Lights dimming' : 'Night';
    }
    const paused = w.clock.paused;
    const scale = w.clock.timeScale;
    const speed = paused ? 'Paused' : scale !== 1 ? timeScaleLabel(scale) : '';
    setText(this.speedEl, speed);
    if (this.speedEl.hidden !== !speed) this.speedEl.hidden = !speed;
    setClass(this.speedEl, 'is-paused', paused);
    setClass(this.root, 'is-night', w.env.isNight);
  }

  /** ~1 Hz: water health & warnings. */
  private refreshHealth(): void {
    const w = this.app.world;
    if (this.needsDirty) {
      this.needsDirty = false;
      let reef = false;
      for (const p of w.tank.plants) {
        const sp = w.plants.get(p.speciesId);
        if (sp && CORAL_FORMS.has(sp.form)) {
          reef = true;
          break;
        }
      }
      this.needs = computeNeeds(w.fish, w.tank.water, reef);
    }
    this.water = assessWater(w.tank.waterParams, w.tank.water, this.needs);
    const lvl = this.water.level;
    const label = healthLabel(lvl);
    const issue = this.water.issues[0]?.text;
    setAttr(this.healthBtn, 'data-health', lvl);
    setClass(this.healthBtn, 'is-good', lvl === 'good');
    setClass(this.healthBtn, 'is-caution', lvl === 'caution');
    setClass(this.healthBtn, 'is-bad', lvl === 'bad');
    setText(this.healthLabelEl, issue && lvl !== 'good' ? issue : label);
    setAttr(this.healthBtn, 'aria-label', `${label}${issue ? ` — ${issue}` : ''}. Open care.`);
    this.notifier.check(this.needs, w.settings.units);
  }

  private refreshStats(): void {
    if (!this.app.world.settings.showStats) return;
    const r = this.app.engine.renderer.info.render;
    const tris = r.triangles >= 1e6 ? `${(r.triangles / 1e6).toFixed(1)}M` : `${Math.round(r.triangles / 1000)}k`;
    setText(this.statsEl, `${Math.round(this.fps)} fps · ${this.app.world.fish.length} animals · ${r.calls} draws · ${tris} tris`);
  }

  // ------------------------------------------------------------------------------------------
  // Panels
  // ------------------------------------------------------------------------------------------

  private buildPanelHost(): void {
    this.panelTitle = h('h2', { class: 'aq-panel-title', tabindex: '-1' });
    const close = iconButton('close', 'Close panel', () => this.openPanel(null), 'aq-icon-btn aq-panel-close');
    this.panelBody = h('div', { class: 'aq-panel-body' });
    this.panelEl = h('aside', { class: 'aq-panel aq-glass', role: 'region', 'aria-label': 'Panel', 'aria-hidden': 'true' }, h('header', { class: 'aq-panel-head' }, this.panelTitle, close), this.panelBody);
    this.panelEl.inert = true;
    this.layer.append(this.panelEl);
  }

  private makePanel(id: PanelId): Panel {
    switch (id) {
      case 'fish':
        return new FishPanel(this);
      case 'feed':
        return new FeedPanel(this);
      case 'scape':
        return new AquascapePanel(this, this.scape);
      case 'care':
        return new CarePanel(this);
      case 'time':
        return new TimePanel(this);
      case 'journal':
        return new JournalPanel(this);
      case 'settings':
        return new SettingsPanel(this, () => {
          this.openPanel('scape');
          (this.panels.get('scape') as AquascapePanel | undefined)?.showNewTank();
        });
    }
  }

  private togglePanel(id: PanelId): void {
    this.openPanel(this.current?.id === id ? null : id);
  }

  openPanel(id: PanelId | null): void {
    const prev = this.current;
    if (prev?.id === id) return;
    if (prev) {
      prev.onClose?.();
      this.dockBtns.get(prev.id)?.setAttribute('aria-expanded', 'false');
      setClass(this.dockBtns.get(prev.id)!, 'is-active', false);
    }
    // Any other tool ends the feeding pinch (on phones the feed sheet closes itself while feeding).
    if (id && id !== 'feed') this.stopFeeding();
    this.current = null;
    if (!id) {
      this.panelEl.classList.remove('is-open');
      this.panelEl.setAttribute('aria-hidden', 'true');
      this.panelEl.inert = true;
      setClass(this.root, 'has-panel', false);
      if (this.input.mode === 'scape') this.setMode('view');
      if (this.panelEl.contains(document.activeElement)) (document.activeElement as HTMLElement).blur();
      return;
    }
    let p = this.panels.get(id);
    if (!p) {
      p = this.makePanel(id);
      this.panels.set(id, p);
    }
    this.current = p;
    setText(this.panelTitle, p.title);
    this.panelEl.setAttribute('aria-label', p.title);
    this.panelEl.dataset.panel = id;
    setClass(this.panelBody, 'is-self-scroll', !!p.selfScroll);
    if (this.panelBody.firstChild !== p.el) this.panelBody.replaceChildren(p.el);
    if (!p.selfScroll) this.panelBody.scrollTop = 0;
    this.panelEl.classList.add('is-open');
    this.panelEl.setAttribute('aria-hidden', 'false');
    this.panelEl.inert = false;
    setClass(this.root, 'has-panel', true);
    const btn = this.dockBtns.get(id);
    btn?.setAttribute('aria-expanded', 'true');
    if (btn) setClass(btn, 'is-active', true);
    if (id === 'scape') this.setMode('scape');
    else if (this.input.mode === 'scape') this.setMode(this.feeding ? 'feed' : 'view');
    p.onOpen?.();
    this.wake();
  }

  private setMode(m: Mode): void {
    this.input.setMode(m);
    setAttr(this.root, 'data-mode', m);
  }

  // ------------------------------------------------------------------------------------------
  // Events, activity & keyboard
  // ------------------------------------------------------------------------------------------

  private wireEvents(): void {
    const ev = this.app.world.events;
    const stock = () => (this.needsDirty = true);
    ev.on('fish-added', stock);
    ev.on('fish-removed', stock);
    ev.on('fish-died', stock);
    ev.on('fish-born', stock);
    ev.on('plants-changed', stock);
    ev.on('tank-reset', () => {
      this.needsDirty = true;
      this.stopFeeding();
      this.refreshChrome();
    });
    ev.on('tank-settings-changed', () => this.refreshChrome());
    ev.on('time-scale-changed', () => {
      this.refreshChrome();
      this.current?.refresh?.();
    });
    ev.on('settings-changed', () => this.applySettings());
    this.mobileQuery.addEventListener('change', () => setClass(this.root, 'is-mobile', this.isMobile));
    setClass(this.root, 'is-mobile', this.isMobile);
  }

  private applySettings(): void {
    const s = this.app.world.settings;
    this.statsEl.hidden = !s.showStats;
    if (!s.uiAutoHide) this.wake();
    for (const p of this.panels.values()) p.onSettingsChanged?.();
    this.current?.refresh?.();
  }

  private wireActivity(): void {
    const onMove = (e: PointerEvent) => {
      // Ignore synthetic moves (layout changing under a still cursor) — they would make the
      // chrome flicker back the moment it faded out.
      if (Math.abs(e.clientX - this.lastPointer.x) < 2 && Math.abs(e.clientY - this.lastPointer.y) < 2) return;
      this.lastPointer.x = e.clientX;
      this.lastPointer.y = e.clientY;
      this.overUI = e.target !== this.app.engine.renderer.domElement;
      this.wake();
    };
    window.addEventListener('pointermove', onMove, { passive: true });
    window.addEventListener('pointerdown', () => this.wake(), { passive: true, capture: true });
    window.addEventListener('wheel', () => this.wake(), { passive: true });
    window.addEventListener('keydown', (e) => this.onKey(e));
    window.addEventListener('blur', () => (this.overUI = false));
  }

  /** Any user activity: bring the chrome back softly. */
  private wake(): void {
    this.lastActivity = performance.now();
    if (this.idle) {
      this.idle = false;
      setClass(this.root, 'is-idle', false);
      document.body.classList.remove('aq-idle');
    }
  }

  private canIdle(): boolean {
    const s = this.app.world.settings;
    if (!s.uiAutoHide || this.current || this.shortcutsEl || this.overUI) return false;
    if (this.input.mode !== 'view') return false;
    if (!this.nameInput.hidden) return false;
    const a = document.activeElement;
    if (a && a !== document.body && this.layer.contains(a) && isTyping(a)) return false;
    return true;
  }

  private onKey(e: KeyboardEvent): void {
    this.wake();
    if (e.defaultPrevented) return;
    if (e.key === 'Escape') {
      this.escape();
      return;
    }
    if (e.ctrlKey || e.metaKey || e.altKey) return;
    if (isTyping(e.target)) return;
    if (this.current?.id === 'scape' && this.scape.key(e)) {
      e.preventDefault();
      return;
    }
    const k = e.key;
    const onControl = (e.target as HTMLElement | null)?.closest?.('button, [role="radio"], [role="tab"], [role="switch"], a');
    switch (k) {
      case 'h':
      case 'H':
        this.setManualHidden(!this.manualHidden);
        break;
      case 'f':
      case 'F':
        this.app.feed(this.feeding ?? this.lastFood);
        break;
      case ' ':
        if (onControl) return; // Space activates the focused button instead
        this.app.setPaused(!this.app.world.clock.paused);
        this.toast(this.app.world.clock.paused ? 'Time paused — biology rests; the fish still swim.' : 'Time flows again.', 'info');
        this.refreshChrome();
        this.current?.refresh?.();
        break;
      case '1':
      case '2':
      case '3':
      case '4': {
        const t = TIME_SCALES[Number(k) - 1];
        if (!t) return;
        this.app.setTimeScale(t.value);
        if (this.app.world.clock.paused) this.app.setPaused(false);
        this.toast(`Time: ${t.label.toLowerCase()}`, 'info');
        break;
      }
      case 'c':
      case 'C':
        this.togglePanel('fish');
        break;
      case 'a':
      case 'A':
        this.togglePanel('scape');
        break;
      case 'j':
      case 'J':
        this.togglePanel('journal');
        break;
      case '?':
        this.showShortcuts();
        break;
      default:
        return;
    }
    e.preventDefault();
  }

  /** Esc unwinds one layer at a time, innermost first. */
  private escape(): void {
    const app = this.app;
    if (this.shortcutsEl) return this.hideShortcuts();
    if (this.card.onEscape()) return;
    if (!this.nameInput.hidden) return this.endRenameTank();
    if (this.manualHidden) return this.setManualHidden(false);
    if (this.feeding) return this.stopFeeding();
    if (this.current) {
      if (this.current.onEscape?.()) return;
      this.openPanel(null);
      return;
    }
    if (app.world.follow) return app.follow(null);
    const s = app.world.selection;
    if (s.fishId || s.decorId || s.plantId) app.select({});
  }

  private setManualHidden(on: boolean): void {
    this.manualHidden = on;
    setClass(this.root, 'is-hidden', on);
    if (on) {
      this.openPanel(null);
      this.toast('Interface hidden — press H to bring it back.', 'info');
    }
  }

  /** Soft expanding ring where a pinch of food was dropped. */
  private ripple(x: number, y: number): void {
    const r = h('span', { class: 'aq-ripple', style: { left: `${x}px`, top: `${y}px` } });
    this.layer.append(r);
    setTimeout(() => r.remove(), 1000);
  }

  // ------------------------------------------------------------------------------------------
  // Public API (unchanged signatures)
  // ------------------------------------------------------------------------------------------

  /** Called every frame; refresh live readouts at a modest rate. */
  update(dt: number): void {
    // FPS from wall-clock frame count (dt is clamped by the app).
    this.frames++;
    const now = performance.now();
    if (this.updates < 2) {
      // The very first frame can take seconds (shader compilation). Start the idle countdown
      // once the tank is actually on screen, so the controls are always seen on arrival.
      this.updates++;
      this.lastActivity = now;
    }
    if (now - this.fpsT0 >= 1000) {
      this.fps = (this.frames * 1000) / (now - this.fpsT0);
      this.frames = 0;
      this.fpsT0 = now;
      this.refreshStats();
    }
    if (this.input.mode === 'scape') this.scape.frame();

    this.t4 += dt;
    if (this.t4 >= 0.25) {
      this.t4 = 0;
      this.refreshChrome();
      if (this.card.visible) this.card.refresh();
      this.current?.refresh?.();
      if (!this.idle && !this.manualHidden && this.canIdle() && now - this.lastActivity > IDLE_SECONDS * 1000) {
        this.idle = true;
        setClass(this.root, 'is-idle', true);
        document.body.classList.add('aq-idle');
      }
    }
    this.t1 += dt;
    if (this.t1 >= 1) {
      this.t1 = 0;
      this.refreshHealth();
    }
  }

  /** Show a one-off message (e.g. the catch-up summary after being away). */
  showWelcomeBack(text: string): void {
    if (text) this.toasts.showWelcome(text);
  }
}
