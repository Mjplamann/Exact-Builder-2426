/**
 * The species catalog — the heart of the app. Search and filter 2000+ species, browse a
 * virtualized list with lazily rendered portraits, read an accurate natural-history profile,
 * check compatibility with the current tank, and add animals. A second tab lists the tank's
 * inhabitants grouped by species, with ages and a gentle rehome action.
 */
import type { FishEntity, OrganismGroup, Species, Temperament, WaterType, Zone } from '../../core/types';
import { GROUPS, TEMPERAMENTS, ZONES } from '../../core/enums';
import { waterLiters } from '../../core/tankGeometry';
import type { CompatibilityReport } from '../../sim/LifeSim';
import type { Panel, UIHost } from '../context';
import { button, confirmButton, iconButton, segmented, select, stepper, tabs } from '../controls';
import { clear, debounce, h, prefs, setClass, setText } from '../dom';
import {
  formatAge,
  formatCount,
  formatLength,
  formatLifespan,
  formatLiters,
  formatMonths,
  formatRange,
  formatTempRange,
  plural,
  pluralName,
} from '../format';
import { icon } from '../icons';
import {
  ACTIVITY_LABELS,
  DIET_PHRASES,
  GROUP_LABELS,
  REPRO_PHRASES,
  TEMPERAMENT_LABELS,
  TEMPERAMENT_SHORT,
  TRAIT_PHRASES,
  ZONE_LABELS,
  ZONE_SHORT,
  socialPhrase,
} from '../phrases';
import { VirtualList } from '../VirtualList';

type SortKey = 'name' | 'size-asc' | 'size-desc';
type Tab = 'catalog' | 'tank';

interface Filters {
  query: string;
  water: WaterType | 'all';
  group: OrganismGroup | 'all';
  family: string;
  temperament: Temperament | 'all';
  zone: Zone | 'all';
  /** Slider position 0..100 (100 = any size). */
  size: number;
  fits: boolean;
  sort: SortKey;
}

interface RowParts {
  btn: HTMLButtonElement;
  img: HTMLImageElement;
  name: HTMLElement;
  sci: HTMLElement;
  size: HTMLElement;
  chip: HTMLElement;
  compat: HTMLElement;
  count: HTMLElement;
  sid: string;
}

const ROW_H = 68;
const THUMB = 128;
const BIG_THUMB = 256;
const MIN_LEN = 1;

const WATER_OPTS: { value: WaterType | 'all'; label: string }[] = [
  { value: 'freshwater', label: 'Fresh' },
  { value: 'brackish', label: 'Brackish' },
  { value: 'marine', label: 'Marine' },
  { value: 'all', label: 'All' },
];

const COMPAT_WORDS: Record<CompatibilityReport['level'], { title: string; text: string }> = {
  good: { title: 'Should settle in well', text: 'Suits your water and gets along with the current inhabitants.' },
  caution: { title: 'Possible, with some care', text: 'It can work, but keep an eye on the points below.' },
  bad: { title: 'Not a good match for this tank', text: 'It would likely struggle here, or trouble its tankmates.' },
};

export class FishPanel implements Panel {
  readonly id = 'fish' as const;
  readonly title = 'Fish & invertebrates';
  readonly selfScroll = true;
  readonly el: HTMLElement;

  private tab: Tab = 'catalog';
  private tabBar: ReturnType<typeof tabs<Tab>>;
  private catalogEl: HTMLElement;
  private listView: HTMLElement;
  private detailEl: HTMLElement;
  private tankEl: HTMLElement;
  private list: VirtualList<Species>;
  private rows = new Map<HTMLElement, RowParts>();
  private results: Species[] = [];
  private f: Filters;
  private maxLenAll = 100;
  private compatCache = new Map<string, CompatibilityReport>();
  private counts = new Map<string, number>();
  private detailSpecies: Species | null = null;
  private detailRefresh: (() => void) | null = null;
  private expanded = new Set<string>();
  private dirtyTank = true;

  // Filter controls (kept to re-sync after resets / tank changes)
  private searchInput!: HTMLInputElement;
  private waterSeg!: ReturnType<typeof segmented<WaterType | 'all'>>;
  private fitsBtn!: HTMLButtonElement;
  private moreBtn!: HTMLButtonElement;
  private moreEl!: HTMLElement;
  private groupSel!: ReturnType<typeof select<string>>;
  private familySel!: ReturnType<typeof select<string>>;
  private tempSel!: ReturnType<typeof select<string>>;
  private zoneSel!: ReturnType<typeof select<string>>;
  private sortSel!: ReturnType<typeof select<string>>;
  private sizeInput!: HTMLInputElement;
  private sizeOut!: HTMLElement;
  private metaCount!: HTMLElement;
  private resetBtn!: HTMLButtonElement;
  private emptyEl!: HTMLElement;

  constructor(private host: UIHost) {
    const app = host.app;
    for (const s of app.world.species.all) this.maxLenAll = Math.max(this.maxLenAll, s.adultLengthCm);
    this.f = this.defaultFilters();

    this.tabBar = tabs<Tab>('Fish panel', [
      { id: 'catalog', label: 'Catalog' },
      { id: 'tank', label: 'In your tank' },
    ], this.tab, (t) => this.setTab(t));

    this.list = new VirtualList<Species>({
      rowHeight: ROW_H,
      overscan: 5,
      ariaLabel: 'Species',
      createRow: () => this.createRow(),
      bindRow: (row, sp) => this.bindRow(row, sp),
      onRange: () => this.loadVisibleThumbs(),
    });

    this.listView = h('div', { class: 'aq-catalog-list' }, this.buildFilters(), this.list.el);
    this.emptyEl = h('div', { class: 'aq-empty', hidden: true }, 'No species match these filters.');
    this.listView.append(this.emptyEl);
    this.detailEl = h('div', { class: 'aq-detail', hidden: true });
    this.catalogEl = h('div', { class: 'aq-catalog' }, this.listView, this.detailEl);
    this.tankEl = h('div', { class: 'aq-intank aq-scroll', hidden: true });
    this.el = h('div', { class: 'aq-fish-panel' }, this.tabBar.el, this.catalogEl, this.tankEl);

    const ev = app.world.events;
    const stockChanged = () => {
      this.compatCache.clear();
      this.recount();
      this.dirtyTank = true;
      if (host.openPanelId === 'fish') this.onStockChanged();
    };
    ev.on('fish-added', stockChanged);
    ev.on('fish-removed', stockChanged);
    ev.on('fish-died', stockChanged);
    ev.on('fish-born', stockChanged);
    ev.on('tank-reset', () => {
      // A new tank may hold different water: follow it.
      this.f.water = app.world.tank.water;
      this.waterSeg.set(this.f.water);
      this.rebuildFamilies();
      stockChanged();
      this.applyFilters(true);
    });
    ev.on('tank-settings-changed', () => this.compatCache.clear());
    this.recount();
    this.rebuildFamilies();
    this.applyFilters(true);
  }

  private defaultFilters(): Filters {
    return {
      query: '',
      water: this.host.app.world.tank.water,
      group: 'all',
      family: '',
      temperament: 'all',
      zone: 'all',
      size: 100,
      fits: false,
      sort: prefs.get<SortKey>('catalogSort', 'name'),
    };
  }

  // ------------------------------------------------------------------------------------------
  // Filters
  // ------------------------------------------------------------------------------------------

  private buildFilters(): HTMLElement {
    const app = this.host.app;
    this.searchInput = h('input', {
      type: 'search',
      class: 'aq-search-input',
      placeholder: `Search ${formatCount(app.world.species.size)} species`,
      'aria-label': 'Search species by common name, scientific name or family',
      autocomplete: 'off',
      spellcheck: 'false',
    });
    const onSearch = debounce(() => {
      this.f.query = this.searchInput.value;
      this.applyFilters(true);
    }, 110);
    this.searchInput.addEventListener('input', onSearch);
    this.searchInput.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && this.searchInput.value) {
        e.stopPropagation();
        this.searchInput.value = '';
        this.f.query = '';
        this.applyFilters(true);
      } else if (e.key === 'ArrowDown') {
        e.preventDefault();
        (this.list.el.querySelector('.aq-vrow:not([hidden]) button') as HTMLElement | null)?.focus();
      }
    });
    const search = h('div', { class: 'aq-search' }, icon('search', 16), this.searchInput);

    this.waterSeg = segmented('Water type', WATER_OPTS, this.f.water, (v) => {
      this.f.water = v;
      this.f.family = '';
      this.rebuildFamilies();
      this.applyFilters(true);
    }, 'aq-seg-small');

    this.fitsBtn = h('button', { type: 'button', class: 'aq-chip-toggle', 'aria-pressed': 'false', title: 'Only species whose minimum tank size fits yours' }, icon('check', 14), h('span', null, 'Fits my tank'));
    this.fitsBtn.addEventListener('click', () => {
      this.f.fits = !this.f.fits;
      this.fitsBtn.setAttribute('aria-pressed', String(this.f.fits));
      this.applyFilters(true);
    });

    this.moreBtn = h('button', { type: 'button', class: 'aq-chip-toggle', 'aria-expanded': 'false' }, icon('settings', 14), h('span', null, 'Filters'));
    this.moreBtn.addEventListener('click', () => {
      const open = this.moreEl.hidden;
      this.moreEl.hidden = !open;
      this.moreBtn.setAttribute('aria-expanded', String(open));
    });

    this.sortSel = select<string>('Sort by', [
      { value: 'name', label: 'A–Z' },
      { value: 'size-asc', label: 'Smallest' },
      { value: 'size-desc', label: 'Largest' },
    ], this.f.sort, (v) => {
      this.f.sort = v as SortKey;
      prefs.set('catalogSort', v);
      this.applyFilters(true);
    }, 'aq-select-small');

    this.groupSel = select<string>('Animal group', [
      { value: 'all', label: 'All animals' },
      ...GROUPS.map((g) => ({ value: g, label: GROUP_LABELS[g].many })),
    ], 'all', (v) => {
      this.f.group = v as OrganismGroup | 'all';
      this.f.family = '';
      this.rebuildFamilies();
      this.applyFilters(true);
    });
    this.familySel = select<string>('Family', [{ value: '', label: 'All families' }], '', (v) => {
      this.f.family = v;
      this.applyFilters(true);
    });
    this.tempSel = select<string>('Temperament', [
      { value: 'all', label: 'Any temperament' },
      ...TEMPERAMENTS.map((t) => ({ value: t, label: TEMPERAMENT_LABELS[t] })),
    ], 'all', (v) => {
      this.f.temperament = v as Temperament | 'all';
      this.applyFilters(true);
    });
    this.zoneSel = select<string>('Swimming level', [
      { value: 'all', label: 'Any level' },
      ...ZONES.filter((z) => z !== 'all').map((z) => ({ value: z, label: ZONE_LABELS[z] })),
    ], 'all', (v) => {
      this.f.zone = v as Zone | 'all';
      this.applyFilters(true);
    });

    this.sizeInput = h('input', { type: 'range', class: 'aq-range', min: 0, max: 100, step: 1, value: 100, 'aria-label': 'Maximum adult size' });
    this.sizeOut = h('output', { class: 'aq-slider-value' }, 'Any size');
    const onSize = debounce(() => this.applyFilters(true), 90);
    this.sizeInput.addEventListener('input', () => {
      this.f.size = Number(this.sizeInput.value);
      this.paintSize();
      onSize();
    });
    this.paintSize();

    this.moreEl = h(
      'div',
      { class: 'aq-filters-more', hidden: true },
      h('div', { class: 'aq-filter-grid' }, this.groupSel.el, this.familySel.el, this.tempSel.el, this.zoneSel.el),
      h('div', { class: 'aq-field aq-field-slider' }, h('div', { class: 'aq-field-row' }, h('span', { class: 'aq-field-label' }, 'Adult size up to'), this.sizeOut), this.sizeInput),
    );

    this.metaCount = h('span', { class: 'aq-results-count', 'aria-live': 'polite' });
    this.resetBtn = h('button', { type: 'button', class: 'aq-link', hidden: true }, 'Reset filters');
    this.resetBtn.addEventListener('click', () => this.resetFilters());

    return h(
      'div',
      { class: 'aq-catalog-head' },
      search,
      this.waterSeg.el,
      h('div', { class: 'aq-filter-row' }, this.fitsBtn, this.moreBtn, h('span', { class: 'aq-flex' }), this.sortSel.el),
      this.moreEl,
      h('div', { class: 'aq-results-meta' }, this.metaCount, this.resetBtn),
    );
  }

  private sizeLimit(): number {
    if (this.f.size >= 100) return Infinity;
    return MIN_LEN * Math.pow(this.maxLenAll / MIN_LEN, this.f.size / 100);
  }

  private paintSize(): void {
    const lim = this.sizeLimit();
    const units = this.host.app.world.settings.units;
    setText(this.sizeOut, Number.isFinite(lim) ? formatLength(lim, units) : 'Any size');
    this.sizeInput.style.setProperty('--fill', `${this.f.size}%`);
  }

  private resetFilters(): void {
    const sort = this.f.sort;
    this.f = this.defaultFilters();
    this.f.sort = sort;
    this.searchInput.value = '';
    this.waterSeg.set(this.f.water);
    this.fitsBtn.setAttribute('aria-pressed', 'false');
    this.groupSel.set('all');
    this.tempSel.set('all');
    this.zoneSel.set('all');
    this.sizeInput.value = '100';
    this.paintSize();
    this.rebuildFamilies();
    this.applyFilters(true);
  }

  private rebuildFamilies(): void {
    const set = new Set<string>();
    for (const s of this.host.app.world.species.all) {
      if (this.f.water !== 'all' && s.water !== this.f.water) continue;
      if (this.f.group !== 'all' && s.group !== this.f.group) continue;
      set.add(s.family);
    }
    const fams = [...set].sort();
    this.familySel.setOptions([{ value: '', label: `All families (${fams.length})` }, ...fams.map((f) => ({ value: f, label: f }))], this.f.family);
  }

  private activeFilterCount(): number {
    let n = 0;
    if (this.f.group !== 'all') n++;
    if (this.f.family) n++;
    if (this.f.temperament !== 'all') n++;
    if (this.f.zone !== 'all') n++;
    if (this.f.size < 100) n++;
    return n;
  }

  private applyFilters(resetScroll: boolean): void {
    const app = this.host.app;
    const lim = this.sizeLimit();
    const res = app.world.species.search(this.f.query, {
      water: this.f.water,
      group: this.f.group,
      family: this.f.family || undefined,
      temperament: this.f.temperament,
      zone: this.f.zone,
      maxLengthCm: Number.isFinite(lim) ? lim : undefined,
      maxTankLiters: this.f.fits ? waterLiters(app.world.tank) : undefined,
    });
    if (this.f.sort === 'size-asc') res.sort((a, b) => a.adultLengthCm - b.adultLengthCm);
    else if (this.f.sort === 'size-desc') res.sort((a, b) => b.adultLengthCm - a.adultLengthCm);
    this.results = res;
    this.host.thumbs.cancelPending();
    this.list.setItems(res, resetScroll);
    this.emptyEl.hidden = res.length > 0;
    setText(this.metaCount, `${formatCount(res.length)} ${plural(res.length, 'species', 'species')}`);
    const extra = this.activeFilterCount();
    setText(this.moreBtn.querySelector('span')!, extra ? `Filters · ${extra}` : 'Filters');
    const dirty = extra > 0 || this.f.fits || !!this.f.query || this.f.water !== app.world.tank.water;
    this.resetBtn.hidden = !dirty;
  }

  // ------------------------------------------------------------------------------------------
  // Rows
  // ------------------------------------------------------------------------------------------

  private createRow(): HTMLElement {
    const img = h('img', { class: 'aq-srow-img', alt: '', decoding: 'async', draggable: 'false', width: 72, height: 46 });
    const name = h('span', { class: 'aq-srow-name' });
    const sci = h('span', { class: 'aq-srow-sci' });
    const size = h('span', { class: 'aq-srow-size' });
    const chip = h('span', { class: 'aq-chip' });
    const compat = h('span', { class: 'aq-compat-dot', 'aria-hidden': 'true' });
    const count = h('span', { class: 'aq-srow-count' });
    const btn = h(
      'button',
      { type: 'button', class: 'aq-srow' },
      h('span', { class: 'aq-srow-thumb' }, img),
      h('span', { class: 'aq-srow-text' }, name, sci),
      h('span', { class: 'aq-srow-meta' }, h('span', { class: 'aq-srow-meta-top' }, count, size), h('span', { class: 'aq-srow-meta-bottom' }, compat, chip)),
    );
    const row = h('div', null, btn);
    const parts: RowParts = { btn, img, name, sci, size, chip, compat, count, sid: '' };
    btn.addEventListener('click', () => {
      const sp = this.host.app.world.species.get(parts.sid);
      if (sp) this.openDetail(sp);
    });
    btn.addEventListener('keydown', (e) => {
      if (e.key !== 'ArrowDown' && e.key !== 'ArrowUp') return;
      e.preventDefault();
      const idx = this.results.findIndex((s) => s.id === parts.sid);
      const next = idx + (e.key === 'ArrowDown' ? 1 : -1);
      if (next < 0) return this.searchInput.focus();
      if (next >= this.results.length) return;
      const top = next * ROW_H;
      const el = this.list.el;
      if (top < el.scrollTop) el.scrollTop = top;
      else if (top + ROW_H > el.scrollTop + el.clientHeight) el.scrollTop = top + ROW_H - el.clientHeight;
      requestAnimationFrame(() => {
        for (const p of this.rows.values()) if (p.sid === this.results[next].id) p.btn.focus();
      });
    });
    this.rows.set(row, parts);
    return row;
  }

  private bindRow(row: HTMLElement, sp: Species): void {
    const p = this.rows.get(row)!;
    const units = this.host.app.world.settings.units;
    p.sid = sp.id;
    const t = this.host.thumbs.immediate(sp, THUMB);
    if (p.img.src !== t.url) p.img.src = t.url;
    setClass(p.img, 'is-real', t.real);
    setText(p.name, sp.commonName);
    setText(p.sci, sp.scientificName);
    setText(p.size, formatLength(sp.adultLengthCm, units));
    setText(p.chip, TEMPERAMENT_SHORT[sp.temperament]);
    p.chip.className = `aq-chip aq-chip-${sp.temperament}`;
    const n = this.counts.get(sp.id) ?? 0;
    setText(p.count, n ? `${n} in tank` : '');
    const c = this.compat(sp);
    p.compat.className = `aq-compat-dot is-${c.level}`;
    p.btn.setAttribute(
      'aria-label',
      `${sp.commonName}, ${sp.scientificName}. ${formatLength(sp.adultLengthCm, units)}, ${TEMPERAMENT_LABELS[sp.temperament]}. ${COMPAT_WORDS[c.level].title}.${n ? ` ${n} in your tank.` : ''}`,
    );
    p.btn.title = COMPAT_WORDS[c.level].title;
  }

  private loadVisibleThumbs = debounce(() => {
    this.list.forEachVisible((row, sp) => {
      const p = this.rows.get(row);
      if (!p || p.img.classList.contains('is-real')) return;
      this.host.thumbs.request(sp, THUMB, (url) => {
        if (p.sid !== sp.id) return;
        p.img.src = url;
        p.img.classList.add('is-real');
      });
    });
  }, 140);

  private compat(sp: Species): CompatibilityReport {
    let c = this.compatCache.get(sp.id);
    if (!c) {
      c = this.compatibility(sp);
      this.compatCache.set(sp.id, c);
    }
    return c;
  }

  /** LifeSim's report, plus hard limits the UI enforces itself (wrong water, tank too small). */
  private compatibility(sp: Species): CompatibilityReport & { blocked?: string } {
    const app = this.host.app;
    let rep: CompatibilityReport;
    try {
      rep = app.compatibility(sp.id);
    } catch {
      rep = { level: 'good', issues: [] };
    }
    const issues = [...rep.issues];
    let level = rep.level;
    const tank = app.world.tank;
    const units = app.world.settings.units;
    let blocked: string | undefined;
    if (sp.water !== tank.water) {
      const marineMismatch = sp.water === 'marine' || tank.water === 'marine';
      const msg = `Needs ${sp.water} water — your tank is ${tank.water}`;
      if (!issues.some((i) => /water/i.test(i))) issues.unshift(msg);
      if (marineMismatch) {
        level = 'bad';
        blocked = sp.water === 'marine' ? 'This is a marine animal — set up a marine tank to keep it.' : 'This animal cannot live in salt water.';
      } else if (level === 'good') level = 'caution';
    }
    const liters = waterLiters(tank);
    if (sp.minTankLiters > liters * 1.05 && !issues.some((i) => /tank|liter|litre|space/i.test(i))) {
      issues.push(`Needs at least ${formatLiters(sp.minTankLiters, units)} — your tank holds ${formatLiters(liters, units)}`);
      if (level === 'good') level = sp.minTankLiters > liters * 2 ? 'bad' : 'caution';
    }
    return { level, issues, blocked };
  }

  private recount(): void {
    this.counts.clear();
    for (const f of this.host.app.world.fish) this.counts.set(f.species.id, (this.counts.get(f.species.id) ?? 0) + 1);
    const total = this.host.app.world.fish.length;
    this.tabBar.setLabel('tank', total ? `In your tank · ${total}` : 'In your tank');
  }

  private onStockChanged(): void {
    this.list.refresh();
    this.detailRefresh?.();
    if (this.tab === 'tank') this.renderTank();
  }

  // ------------------------------------------------------------------------------------------
  // Tabs & detail
  // ------------------------------------------------------------------------------------------

  private setTab(t: Tab): void {
    this.tab = t;
    this.tabBar.set(t);
    this.catalogEl.hidden = t !== 'catalog';
    this.tankEl.hidden = t !== 'tank';
    if (t === 'tank' && this.dirtyTank) this.renderTank();
  }

  showSpecies(sp: Species): void {
    this.setTab('catalog');
    this.openDetail(sp);
  }

  private openDetail(sp: Species): void {
    this.detailSpecies = sp;
    clear(this.detailEl);
    this.detailEl.append(this.buildDetail(sp));
    this.listView.hidden = true;
    this.detailEl.hidden = false;
    this.detailEl.scrollTop = 0;
    (this.detailEl.querySelector('.aq-detail-back') as HTMLElement | null)?.focus({ preventScroll: true });
  }

  private closeDetail(): void {
    const sid = this.detailSpecies?.id;
    this.detailSpecies = null;
    this.detailRefresh = null;
    this.detailEl.hidden = true;
    this.listView.hidden = false;
    clear(this.detailEl);
    // Return focus to the row we came from when it's still rendered.
    requestAnimationFrame(() => {
      for (const p of this.rows.values()) if (p.sid === sid) p.btn.focus({ preventScroll: true });
    });
  }

  private buildDetail(sp: Species): HTMLElement {
    const app = this.host.app;
    const units = app.world.settings.units;
    const back = h('button', { type: 'button', class: 'aq-detail-back aq-link' }, icon('back', 16), h('span', null, 'All species'));
    back.addEventListener('click', () => this.closeDetail());

    const big = this.host.thumbs.immediate(sp, BIG_THUMB);
    const img = h('img', { class: `aq-portrait-img${big.real ? ' is-real' : ''}`, src: big.url, alt: `${sp.commonName} portrait`, decoding: 'async' });
    if (!big.real)
      this.host.thumbs.request(sp, BIG_THUMB, (url) => {
        if (this.detailSpecies !== sp) return;
        img.src = url;
        img.classList.add('is-real');
      });

    const female = sp.female?.lengthScale;
    const male = sp.male?.lengthScale;
    const sizeNote = male && female && Math.abs(male - female) > 0.08 ? (male > female ? ' (males larger)' : ' (females larger)') : '';

    const fact = (label: string, value: string) => h('div', { class: 'aq-fact' }, h('dt', null, label), h('dd', null, value));
    const facts = h(
      'dl',
      { class: 'aq-facts' },
      fact('Native to', sp.region),
      fact('Adult size', `${formatLength(sp.adultLengthCm, units)}${sizeNote}`),
      fact('Lifespan', formatLifespan(sp.lifespanYears)),
      fact('Mature at', formatMonths(sp.maturityMonths)),
      fact('Temperature', formatTempRange(sp.tempC, units)),
      fact('pH', formatRange(sp.ph)),
      sp.dGH ? fact('Hardness', `${formatRange(sp.dGH, 0)} dGH`) : null,
      fact('Minimum tank', formatLiters(sp.minTankLiters, units)),
      fact('Temperament', TEMPERAMENT_LABELS[sp.temperament]),
      fact('Lives', ZONE_LABELS[sp.zone]),
      fact('Social', socialPhrase(sp)),
      fact('Active', ACTIVITY_LABELS[sp.activity]),
      fact('Diet', DIET_PHRASES[sp.diet]),
      fact('Breeding', REPRO_PHRASES[sp.reproduction]),
    );

    const traits = sp.traits.length ? h('ul', { class: 'aq-traits' }, ...sp.traits.map((t) => h('li', null, TRAIT_PHRASES[t] ?? t))) : null;

    // Compatibility + add, refreshed when the stock changes while the page is open.
    const compatBox = h('div', { class: 'aq-compat' });
    const inTank = h('span', { class: 'aq-detail-intank' });
    let qty = Math.max(1, Math.min(60, sp.groupSize || 1));
    const qtyCtl = stepper('animals', qty, 1, 60, (v) => (qty = v));
    const add = button('Add to tank', () => {
      app.addFish(sp.id, qty);
      const name = qty === 1 ? sp.commonName : pluralName(sp.commonName);
      this.host.toast(`${qty} ${name} added — they’ll explore their new home for a while.`, 'success');
    }, { icon: 'plus', variant: 'primary', cls: 'aq-add-btn' });

    const renderCompat = () => {
      const c = this.compat(sp) as CompatibilityReport & { blocked?: string };
      clear(compatBox);
      compatBox.className = `aq-compat is-${c.level}`;
      compatBox.append(
        h('div', { class: 'aq-compat-head' }, h('span', { class: `aq-compat-dot is-${c.level}`, 'aria-hidden': 'true' }), h('strong', null, COMPAT_WORDS[c.level].title)),
        h('p', { class: 'aq-compat-text' }, c.issues.length ? COMPAT_WORDS[c.level].text : COMPAT_WORDS.good.text),
        c.issues.length ? h('ul', { class: 'aq-compat-issues' }, ...c.issues.slice(0, 6).map((i) => h('li', null, i))) : null,
      );
      add.disabled = !!c.blocked;
      add.title = c.blocked ?? '';
      const n = this.counts.get(sp.id) ?? 0;
      setText(inTank, c.blocked ? c.blocked : n ? `${n} already in your tank` : sp.groupSize > 1 ? `Recommended group: ${sp.groupSize}+` : 'Best kept singly');
    };
    renderCompat();
    this.detailRefresh = renderCompat;

    const chips = h(
      'div',
      { class: 'aq-chips' },
      h('span', { class: 'aq-chip' }, sp.water === 'freshwater' ? 'Freshwater' : sp.water === 'marine' ? 'Marine' : 'Brackish'),
      h('span', { class: 'aq-chip' }, sp.family),
      h('span', { class: `aq-chip aq-chip-${sp.temperament}` }, TEMPERAMENT_LABELS[sp.temperament]),
      h('span', { class: 'aq-chip' }, ZONE_SHORT[sp.zone]),
      sp.availability && sp.availability !== 'common' ? h('span', { class: 'aq-chip' }, sp.availability === 'rare' ? 'Rare in the hobby' : 'Uncommon') : null,
    );

    return h(
      'div',
      { class: 'aq-detail-inner' },
      h('div', { class: 'aq-detail-scroll aq-scroll' },
        back,
        h('div', { class: 'aq-portrait' }, img),
        h('h2', { class: 'aq-detail-name' }, sp.commonName),
        h('p', { class: 'aq-detail-sci' }, sp.scientificName),
        chips,
        h('p', { class: 'aq-detail-desc' }, sp.description),
        compatBox,
        h('h3', { class: 'aq-sec-title' }, 'At a glance'),
        facts,
        traits ? h('h3', { class: 'aq-sec-title' }, 'Behavior') : null,
        traits,
      ),
      h('div', { class: 'aq-detail-foot' }, h('div', { class: 'aq-detail-foot-row' }, qtyCtl.el, add), inTank),
    );
  }

  // ------------------------------------------------------------------------------------------
  // In your tank
  // ------------------------------------------------------------------------------------------

  private renderTank(): void {
    this.dirtyTank = false;
    const app = this.host.app;
    const units = app.world.settings.units;
    const now = app.world.clock.simTime;
    const groups = new Map<string, FishEntity[]>();
    for (const f of app.world.fish) {
      const g = groups.get(f.species.id);
      if (g) g.push(f);
      else groups.set(f.species.id, [f]);
    }
    const sorted = [...groups.values()].sort((a, b) => b.length - a.length || a[0].species.commonName.localeCompare(b[0].species.commonName));
    const scroll = this.tankEl.scrollTop;
    clear(this.tankEl);
    const total = app.world.fish.length;
    if (!total) {
      this.tankEl.append(
        h('div', { class: 'aq-empty' }, h('p', null, 'Your tank has no animals yet.'), button('Browse the catalog', () => this.setTab('catalog'), { variant: 'primary' })),
      );
      return;
    }
    this.tankEl.append(h('p', { class: 'aq-intank-summary' }, `${formatCount(total)} ${plural(total, 'animal')} · ${sorted.length} ${plural(sorted.length, 'species', 'species')}`));
    for (const list of sorted) {
      const sp = list[0].species;
      const ages = list.map((f) => now - f.state.bornAt);
      const minA = Math.min(...ages);
      const maxA = Math.max(...ages);
      const ageText = formatAge(minA) === formatAge(maxA) ? formatAge(minA) : `${formatAge(minA)} – ${formatAge(maxA)}`;
      const open = this.expanded.has(sp.id);
      const thumb = this.host.thumbs.immediate(sp, THUMB);
      const img = h('img', { class: `aq-srow-img${thumb.real ? ' is-real' : ''}`, src: thumb.url, alt: '', width: 72, height: 46 });
      if (!thumb.real) this.host.thumbs.request(sp, THUMB, (url) => ((img.src = url), img.classList.add('is-real')));
      const head = h(
        'button',
        { type: 'button', class: 'aq-group-head', 'aria-expanded': String(open) },
        h('span', { class: 'aq-srow-thumb' }, img),
        h('span', { class: 'aq-srow-text' }, h('span', { class: 'aq-srow-name' }, sp.commonName), h('span', { class: 'aq-srow-sub' }, ageText)),
        h('span', { class: 'aq-group-count' }, `${list.length}`),
        icon('chevron', 16, 'aq-group-caret'),
      );
      const body = h('div', { class: 'aq-group-body', hidden: !open });
      head.addEventListener('click', () => {
        const o = !this.expanded.has(sp.id);
        if (o) this.expanded.add(sp.id);
        else this.expanded.delete(sp.id);
        head.setAttribute('aria-expanded', String(o));
        body.hidden = !o;
      });
      list.sort((a, b) => a.state.bornAt - b.state.bornAt);
      list.forEach((f, i) => {
        const s = f.state;
        const sex = s.sex === 'male' ? '♂' : s.sex === 'female' ? '♀' : '';
        const label = s.name ?? `${sp.commonName} ${i + 1}`;
        const view = h('button', { type: 'button', class: 'aq-ind-main', title: 'Show in the tank' },
          h('span', { class: 'aq-ind-name' }, label, sex ? h('span', { class: 'aq-ind-sex', 'aria-label': s.sex }, ` ${sex}`) : null),
          h('span', { class: 'aq-ind-sub' }, `${formatAge(now - s.bornAt)} · ${formatLength(s.lengthCm, units)}${s.generation > 0 ? ` · born here` : ''}`),
        );
        view.addEventListener('click', () => this.host.showFish(s.id));
        const rehome = confirmButton('Rehome', 'Confirm', () => app.removeFish(s.id), { variant: 'quiet', cls: 'aq-btn-small', title: `Rehome ${label} to another keeper` });
        body.append(h('div', { class: 'aq-ind' }, view, rehome));
      });
      const info = iconButton('info', `About ${sp.commonName}`, () => this.showSpecies(sp), 'aq-icon-btn aq-btn-small');
      body.append(h('div', { class: 'aq-group-foot' }, info, h('span', { class: 'aq-hint' }, 'Rehoming passes an animal on to another keeper.')));
      this.tankEl.append(h('div', { class: 'aq-group' }, head, body));
    }
    this.tankEl.scrollTop = scroll;
  }

  // ------------------------------------------------------------------------------------------
  // Panel lifecycle
  // ------------------------------------------------------------------------------------------

  onOpen(): void {
    if (this.dirtyTank && this.tab === 'tank') this.renderTank();
    this.list.refresh();
    this.paintSize();
    if (this.tab === 'catalog' && !this.detailSpecies && !this.host.isMobile) {
      requestAnimationFrame(() => this.searchInput.focus({ preventScroll: true }));
    }
  }

  onEscape(): boolean {
    if (this.detailSpecies) {
      this.closeDetail();
      return true;
    }
    return false;
  }

  /** Open on the "In your tank" tab (used by the fish card). */
  showTankTab(): void {
    this.setTab('tank');
  }
}
