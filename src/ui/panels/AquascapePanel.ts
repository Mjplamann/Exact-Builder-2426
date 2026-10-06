/**
 * Aquascape: a palette of hardscape and plants/corals for the tank's water (click one, then click
 * the substrate to place it), the substrate & its slope, the background, and starting a new tank
 * (size, water type, or a ready-made preset — with a confirm step, since it replaces the tank).
 */
import type { PlantSpecies, WaterType } from '../../core/types';
import { DECOR_CATALOG, type DecorVariant } from '../../decor/catalog';
import { TANK_SIZES } from '../../sim/tankFactory';
import type { Panel, UIHost } from '../context';
import { confirmButton, section, segmented, slider, tabs } from '../controls';
import { clear, debounce, h, prefersReducedMotion, setClass, throttle } from '../dom';
import { formatLength, formatLiters } from '../format';
import { icon } from '../icons';
import { BACKGROUNDS, SUBSTRATES, decorColor, decorGlyph, plantGlyph } from '../scapeArt';
import type { ScapeTool } from '../ScapeTool';

type Tab = 'hardscape' | 'plants' | 'tank';

const KIND_LABELS: Record<string, string> = {
  rock: 'Stone',
  driftwood: 'Wood',
  cave: 'Caves',
  pebbles: 'Pebbles',
  'leaf-litter': 'Leaf litter',
  shell: 'Shells',
  airstone: 'Air',
  'coral-skeleton': 'Coral rubble',
};

const PLACEMENT_LABELS: Record<PlantSpecies['placement'], string> = {
  foreground: 'Foreground & carpets',
  midground: 'Midground',
  background: 'Background',
  epiphyte: 'On wood & stone',
  floating: 'Floating',
};

const LIGHT_LABEL: Record<PlantSpecies['light'], string> = { low: 'Low light', medium: 'Medium light', high: 'High light' };

export class AquascapePanel implements Panel {
  readonly id = 'scape' as const;
  readonly title = 'Aquascape';
  readonly el: HTMLElement;
  /** On phones the sheet lowers to a slim bar while placing, so the substrate is in view. */
  readonly peekable = true;
  private tab: Tab = 'hardscape';
  private tabBar: ReturnType<typeof tabs<Tab>>;
  private views: Record<Tab, HTMLElement>;
  private paletteButtons: { el: HTMLButtonElement; key: string }[] = [];
  private plantQuery = '';
  private hint: HTMLElement;
  private renderedFor: WaterType | null = null;

  constructor(
    private host: UIHost,
    private tool: ScapeTool,
  ) {
    this.tabBar = tabs<Tab>('Aquascape', [
      { id: 'hardscape', label: 'Hardscape' },
      { id: 'plants', label: host.app.world.tank.water === 'marine' ? 'Corals & algae' : 'Plants' },
      { id: 'tank', label: 'Tank' },
    ], this.tab, (t) => this.setTab(t));
    this.views = {
      hardscape: h('div', { class: 'aq-scape-view' }),
      plants: h('div', { class: 'aq-scape-view', hidden: true }),
      tank: h('div', { class: 'aq-scape-view', hidden: true }),
    };
    this.hint = h('p', { class: 'aq-scape-hint' });
    this.el = h('div', { class: 'aq-scape' }, this.tabBar.el, this.hint, this.views.hardscape, this.views.plants, this.views.tank);
    let wasArmed = false;
    tool.onChange = () => {
      this.syncArmed();
      // Phones: the sheet covers the substrate — picking an item lowers it out of the way.
      const armed = !!tool.armed;
      if (armed && !wasArmed && host.isMobile && host.openPanelId === 'scape') host.setSheetPeek?.(true);
      wasArmed = armed;
    };
    host.app.world.events.on('tank-reset', () => {
      this.renderedFor = null;
      if (host.openPanelId === 'scape') this.renderAll();
    });
  }

  private setTab(t: Tab): void {
    this.tab = t;
    this.tabBar.set(t);
    for (const k of Object.keys(this.views) as Tab[]) this.views[k].hidden = k !== t;
    this.hint.hidden = t === 'tank';
    if (t === 'tank') this.tool.arm(null);
  }

  private renderAll(): void {
    const water = this.host.app.world.tank.water;
    this.renderedFor = water;
    this.tabBar.setLabel('plants', water === 'marine' ? 'Corals & algae' : 'Plants');
    this.paletteButtons = [];
    this.renderHardscape();
    this.renderPlants();
    this.renderTank();
    this.syncArmed();
  }

  // ------------------------------------------------------------------------------------------
  // Palette
  // ------------------------------------------------------------------------------------------

  private paletteItem(key: string, glyph: string, name: string, sub: string, title: string, onPick: () => void): HTMLButtonElement {
    const sw = h('span', { class: 'aq-swatch' });
    sw.innerHTML = glyph;
    const b = h('button', { type: 'button', class: 'aq-pal-item', title, 'aria-pressed': 'false' }, sw, h('span', { class: 'aq-pal-text' }, h('span', { class: 'aq-pal-name' }, name), sub ? h('span', { class: 'aq-pal-sub' }, sub) : null));
    b.addEventListener('click', onPick);
    this.paletteButtons.push({ el: b, key });
    return b;
  }

  private renderHardscape(): void {
    const v = this.views.hardscape;
    clear(v);
    const water = this.host.app.world.tank.water;
    const units = this.host.app.world.settings.units;
    const groups = new Map<string, DecorVariant[]>();
    for (const d of DECOR_CATALOG) {
      if (!d.water.includes(water)) continue;
      const g = groups.get(d.kind);
      if (g) g.push(d);
      else groups.set(d.kind, [d]);
    }
    if (!groups.size) v.append(h('p', { class: 'aq-empty' }, 'No hardscape available for this water type yet.'));
    for (const [kind, list] of groups) {
      const grid = h('div', { class: 'aq-pal-grid' });
      for (const d of list) {
        const notes: string[] = [];
        if (d.tannins) notes.push('tints water');
        if (d.buffersPh) notes.push('raises pH');
        grid.append(
          this.paletteItem(`d:${d.kind}:${d.variant}`, decorGlyph(d.kind, decorColor(d.kind, d.variant)), d.name, `~${formatLength(d.size * 100, units)}${notes.length ? ` · ${notes.join(', ')}` : ''}`, d.description, () => {
            const key = `d:${d.kind}:${d.variant}`;
            this.tool.arm(this.isArmed(key) ? null : { type: 'decor', kind: d.kind, variant: d.variant, name: d.name });
          }),
        );
      }
      v.append(h('h3', { class: 'aq-sec-title' }, KIND_LABELS[kind] ?? kind), grid);
    }
  }

  private renderPlants(): void {
    const v = this.views.plants;
    clear(v);
    const water = this.host.app.world.tank.water;
    const all = this.host.app.world.plants.forWater(water);
    const search = h('input', { type: 'search', class: 'aq-search-input', placeholder: `Search ${all.length} ${water === 'marine' ? 'corals & algae' : 'plants'}`, 'aria-label': 'Search plants', value: this.plantQuery });
    const listEl = h('div');
    const fill = () => {
      clear(listEl);
      // Remove old plant entries from the highlight registry.
      this.paletteButtons = this.paletteButtons.filter((p) => !p.key.startsWith('p:'));
      const q = this.plantQuery.toLowerCase().trim();
      const list = q ? all.filter((p) => `${p.commonName} ${p.scientificName}`.toLowerCase().includes(q)) : all;
      const order: PlantSpecies['placement'][] = ['foreground', 'midground', 'background', 'epiphyte', 'floating'];
      for (const pl of order) {
        const items = list.filter((p) => p.placement === pl);
        if (!items.length) continue;
        const grid = h('div', { class: 'aq-pal-grid' });
        for (const p of items) {
          grid.append(
            this.paletteItem(`p:${p.id}`, plantGlyph(p), p.commonName, `${LIGHT_LABEL[p.light]} · ${p.growthCmPerWeek >= 3 ? 'fast' : p.growthCmPerWeek >= 1 ? 'moderate' : 'slow'} growth`, `${p.scientificName} — ${p.description}`, () => {
              const key = `p:${p.id}`;
              this.tool.arm(this.isArmed(key) ? null : { type: 'plant', id: p.id, name: p.commonName, placement: p.placement });
            }),
          );
        }
        listEl.append(h('h3', { class: 'aq-sec-title' }, PLACEMENT_LABELS[pl]), grid);
      }
      if (!list.length) listEl.append(h('p', { class: 'aq-empty' }, all.length ? 'Nothing matches that search.' : 'No plants are available for this water type yet.'));
      this.syncArmed();
    };
    search.addEventListener('input', debounce(() => {
      this.plantQuery = search.value;
      fill();
    }, 120));
    v.append(h('div', { class: 'aq-search' }, icon('search', 16), search), listEl);
    fill();
  }

  private isArmed(key: string): boolean {
    const a = this.tool.armed;
    if (!a) return false;
    return (a.type === 'decor' ? `d:${a.kind}:${a.variant}` : `p:${a.id}`) === key;
  }

  /** Highlight the armed palette item and update the hint line. */
  private syncArmed(): void {
    for (const p of this.paletteButtons) {
      const on = this.isArmed(p.key);
      setClass(p.el, 'is-active', on);
      p.el.setAttribute('aria-pressed', String(on));
    }
    const a = this.tool.armed;
    const sel = this.tool.selected();
    const touch = !!this.host.isTouch;
    const click = touch ? 'Tap' : 'Click';
    const stop = touch ? '' : ' · Esc to stop';
    let text: string;
    if (a) {
      text =
        a.type === 'plant' && a.placement === 'epiphyte'
          ? `${click} a piece of wood or stone to attach ${a.name}${stop}.`
          : `${click} the substrate to place ${a.name}. Keep ${touch ? 'tapping' : 'clicking'} to add more${stop}.`;
    } else if (sel) {
      text = touch
        ? sel.kind === 'decor'
          ? 'Drag to move · use the buttons above it to rotate, resize, reshape or remove'
          : 'Drag to move · use the buttons above it to rotate, reshape or remove'
        : sel.kind === 'decor'
          ? 'Drag to move · scroll to rotate · shift+scroll to resize · R, [ ], N, Delete'
          : 'Drag to move · scroll to rotate · N for a new shape · Delete';
    } else
      text = touch
        ? 'Pick an item, then tap the tank to place it. Tap anything already in the tank to move or change it.'
        : 'Pick an item below, then click in the tank to place it. Click anything already in the tank to move or change it.';
    this.hint.textContent = text;
  }

  // ------------------------------------------------------------------------------------------
  // Tank: substrate, slope, background, new tank & presets
  // ------------------------------------------------------------------------------------------

  private renderTank(): void {
    const v = this.views.tank;
    clear(v);
    const app = this.host.app;
    const t = app.world.tank;
    const units = app.world.settings.units;

    // Substrate
    const subGrid = h('div', { class: 'aq-swatch-grid', role: 'radiogroup', 'aria-label': 'Substrate' });
    const subBtns: { value: string; el: HTMLButtonElement }[] = [];
    const syncSub = () => subBtns.forEach((b) => b.el.setAttribute('aria-checked', String(b.value === app.world.tank.substrate)));
    for (const s of SUBSTRATES) {
      const suits = s.water.includes(t.water);
      const b = h('button', { type: 'button', role: 'radio', class: `aq-swatch-btn${suits ? '' : ' is-unsuited'}`, title: `${s.label} — ${s.note}${suits ? '' : ' (unusual for this water)'}`, 'aria-checked': 'false' },
        h('span', { class: `aq-swatch-chip${s.value === 'bare' ? ' is-bare' : ''}`, style: { background: s.color } }),
        h('span', { class: 'aq-swatch-label' }, s.label),
      );
      b.addEventListener('click', () => {
        app.setTankLook({ substrate: s.value });
        syncSub();
      });
      subBtns.push({ value: s.value, el: b });
      subGrid.append(b);
    }
    syncSub();

    // Slope: substrate depth at the front and back glass.
    const maxDepth = Math.round(t.size.heightCm * 0.35);
    const look = throttle((patch: Parameters<typeof app.setTankLook>[0]) => app.setTankLook(patch), 220);
    const front = slider({ label: 'Depth at the front', min: 0, max: Math.min(15, maxDepth), step: 0.5, value: t.substrateDepthFrontCm, format: (x) => formatLength(x, units), onInput: (x) => look({ substrateDepthFrontCm: x }), onChange: () => look.flush() });
    const back = slider({ label: 'Depth at the back', min: 0, max: maxDepth, step: 0.5, value: t.substrateDepthBackCm, format: (x) => formatLength(x, units), onInput: (x) => look({ substrateDepthBackCm: x }), onChange: () => look.flush(), hint: 'A slope rising toward the back gives depth to the scape.' });

    // Background
    const bgGrid = h('div', { class: 'aq-swatch-grid', role: 'radiogroup', 'aria-label': 'Background' });
    const bgBtns: { value: string; el: HTMLButtonElement }[] = [];
    const syncBg = () => bgBtns.forEach((b) => b.el.setAttribute('aria-checked', String(b.value === app.world.tank.background)));
    for (const bg of BACKGROUNDS) {
      const b = h('button', { type: 'button', role: 'radio', class: 'aq-swatch-btn', 'aria-checked': 'false', title: bg.label },
        h('span', { class: 'aq-swatch-chip', style: { background: bg.css } }),
        h('span', { class: 'aq-swatch-label' }, bg.label),
      );
      b.addEventListener('click', () => {
        app.setTankLook({ background: bg.value });
        syncBg();
      });
      bgBtns.push({ value: bg.value, el: b });
      bgGrid.append(b);
    }
    syncBg();

    // New tank
    let size = TANK_SIZES.find((s) => s.size.widthCm === t.size.widthCm && s.size.heightCm === t.size.heightCm) ?? TANK_SIZES[2];
    let water: WaterType = t.water;
    const sizeGroup = h('div', { class: 'aq-size-list', role: 'radiogroup', 'aria-label': 'Tank size' });
    const sizeBtns: { id: string; el: HTMLButtonElement }[] = [];
    const syncSize = () => sizeBtns.forEach((b) => b.el.setAttribute('aria-checked', String(b.id === size.id)));
    for (const s of TANK_SIZES) {
      const [name, dims] = s.label.split(' · ');
      const liters = (s.size.widthCm * s.size.heightCm * s.size.depthCm) / 1000;
      const dimText = units === 'imperial'
        ? `${Math.round(s.size.widthCm / 2.54)}×${Math.round(s.size.heightCm / 2.54)}×${Math.round(s.size.depthCm / 2.54)} in`
        : dims ?? '';
      const b = h('button', { type: 'button', role: 'radio', class: 'aq-size', 'aria-checked': 'false' },
        h('span', { class: 'aq-size-name' }, name),
        h('span', { class: 'aq-size-dims' }, `${dimText} · ${formatLiters(liters, units)}`),
      );
      b.addEventListener('click', () => {
        size = s;
        syncSize();
      });
      sizeBtns.push({ id: s.id, el: b });
      sizeGroup.append(b);
    }
    syncSize();
    const waterSeg = segmented<WaterType>('Water', [
      { value: 'freshwater', label: 'Freshwater' },
      { value: 'brackish', label: 'Brackish' },
      { value: 'marine', label: 'Marine' },
    ], water, (w) => (water = w));
    const create = confirmButton('Set up an empty tank', 'Replace my current tank', () => {
      app.newTank({ size: size.size, water });
      this.host.toast('A fresh, empty tank — the filter is already seeded and ready.', 'success');
    }, { icon: 'plusCircle', variant: 'primary' });

    // Presets
    const presets = h('div', { class: 'aq-presets' });
    for (const p of app.presets()) {
      const load = confirmButton('Set up', 'Replace my tank', () => {
        app.loadPreset(p.id);
        this.host.toast(`Welcome to “${p.name}”.`, 'success');
      }, { variant: 'ghost', cls: 'aq-btn-small' });
      presets.append(
        h('div', { class: 'aq-preset' },
          h('div', { class: 'aq-preset-head' }, h('span', { class: 'aq-preset-name' }, p.name), h('span', { class: 'aq-chip' }, p.water === 'marine' ? 'Marine' : p.water === 'brackish' ? 'Brackish' : 'Freshwater')),
          h('p', { class: 'aq-preset-desc' }, p.description),
          load,
        ),
      );
    }

    v.append(
      section('Substrate', subGrid),
      section('Slope', front.el, back.el),
      section('Background', bgGrid),
      section('Ready-made tanks', h('p', { class: 'aq-hint' }, 'Complete aquascapes with their inhabitants. Setting one up replaces your current tank.'), presets),
      section('New empty tank', sizeGroup, h('div', { class: 'aq-field' }, h('span', { class: 'aq-field-label' }, 'Water'), waterSeg.el), create),
    );
  }

  /** Jump straight to the "new tank" controls (from Settings). */
  showNewTank(): void {
    this.setTab('tank');
    requestAnimationFrame(() => {
      const secs = this.views.tank.querySelectorAll('.aq-sec');
      (secs[secs.length - 2] as HTMLElement | undefined)?.scrollIntoView({ block: 'start', behavior: prefersReducedMotion() ? 'auto' : 'smooth' });
    });
  }

  onSettingsChanged(): void {
    this.renderedFor = null;
    if (this.host.openPanelId === 'scape') this.renderAll();
  }

  onOpen(): void {
    if (this.renderedFor !== this.host.app.world.tank.water) this.renderAll();
    this.tool.enter();
    this.syncArmed();
  }

  onClose(): void {
    this.tool.exit();
  }

  onEscape(): boolean {
    if (this.tool.armed) {
      this.tool.arm(null);
      return true;
    }
    if (this.tool.selected()) {
      this.host.app.select({});
      return true;
    }
    return false;
  }
}
