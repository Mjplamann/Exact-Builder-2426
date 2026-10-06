/**
 * Care: water-test readouts against healthy ranges, maintenance actions, stocking, and every
 * piece of equipment (heater, filter, lights with their schedule and color, CO₂, auto-feeder).
 */
import type { Equipment, FoodKind } from '../../core/types';
import { FOOD_LIST } from '../../data/foods';
import type { DeepPartial } from '../../app/AppApi';
import type { Panel, UIHost } from '../context';
import { button, section, select, slider, stepper, toggle } from '../controls';
import { clear, h, setClass, setStyle, setText, throttle } from '../dom';
import {
  formatDuration,
  formatHour,
  formatRange,
  formatTemp,
  formatTempRange,
  kelvinToHex,
  oxygenSaturationMgL,
} from '../format';
import { icon, type IconName } from '../icons';
import type { HealthLevel, ParamKey } from '../waterHealth';

interface Tile {
  key: ParamKey;
  el: HTMLElement;
  value: HTMLElement;
  note: HTMLElement;
}

const FILTER_TYPES: { value: Equipment['filter']['type']; label: string }[] = [
  { value: 'canister', label: 'Canister' },
  { value: 'hang-on-back', label: 'Hang-on-back' },
  { value: 'internal', label: 'Internal' },
  { value: 'sponge', label: 'Sponge (air-driven)' },
  { value: 'sump', label: 'Sump' },
];

export class CarePanel implements Panel {
  readonly id = 'care' as const;
  readonly title = 'Care';
  readonly el: HTMLElement;
  private tiles: Tile[] = [];
  private lastChange!: HTMLElement;
  private algaeNote!: HTMLElement;
  private stockBar!: HTMLElement;
  private stockText!: HTMLElement;
  private equipEl: HTMLElement;
  private syncers: (() => void)[] = [];
  private setEquip: (patch: DeepPartial<Equipment>) => void;

  constructor(private host: UIHost) {
    const app = host.app;
    // Equipment changes are cheap but fire per slider step: coalesce to ~12 Hz.
    this.setEquip = throttle((patch: DeepPartial<Equipment>) => app.setEquipment(patch), 80);
    this.equipEl = h('div');
    this.el = h('div', { class: 'aq-care' }, this.buildTests(), this.buildMaintenance(), this.buildStocking(), this.equipEl);
    this.buildEquipment();
    app.world.events.on('tank-reset', () => this.buildEquipment());
  }

  // ------------------------------------------------------------------------------------------
  // Water tests
  // ------------------------------------------------------------------------------------------

  private buildTests(): HTMLElement {
    const grid = h('div', { class: 'aq-tests' });
    const make = (key: ParamKey, label: string, ic: IconName) => {
      const value = h('span', { class: 'aq-test-value' });
      const note = h('span', { class: 'aq-test-note' });
      const el = h('div', { class: 'aq-test', 'data-param': key }, h('span', { class: 'aq-test-label' }, icon(ic, 14), label), value, note);
      this.tiles.push({ key, el, value, note });
      grid.append(el);
    };
    make('temperature', 'Temperature', 'thermometer');
    make('ph', 'pH', 'drop');
    make('ammonia', 'Ammonia', 'warning');
    make('nitrite', 'Nitrite', 'drop');
    make('nitrate', 'Nitrate', 'leaf');
    make('gh', 'GH', 'layers');
    make('kh', 'KH', 'layers');
    make('salinity', 'Salinity', 'drop');
    make('oxygen', 'Oxygen', 'bubbles');
    make('cycle', 'Nitrogen cycle', 'filter');
    this.lastChange = h('span', { class: 'aq-hint' });
    return section('Water tests', grid, h('div', { class: 'aq-tests-foot' }, this.lastChange));
  }

  private paintTests(): void {
    const app = this.host.app;
    const wp = app.world.tank.waterParams;
    const water = app.world.tank.water;
    const units = app.world.settings.units;
    const a = this.host.water;
    const now = app.world.clock.simTime;
    const ideal = (k: ParamKey, fmt: (r: [number, number]) => string) => {
      const r = a.params[k].ideal;
      return r ? `ideal ${fmt(r)}` : '';
    };
    for (const t of this.tiles) {
      const p = a.params[t.key];
      let v = '';
      let note = '';
      let hidden = false;
      switch (t.key) {
        case 'temperature':
          v = formatTemp(wp.temperatureC, units);
          note = p.note ?? ideal('temperature', (r) => formatTempRange(r, units));
          break;
        case 'ph':
          v = wp.ph.toFixed(1);
          note = p.note ?? ideal('ph', (r) => formatRange(r));
          break;
        case 'ammonia':
          v = `${wp.ammonia.toFixed(2)} mg/L`;
          note = p.note ?? '';
          break;
        case 'nitrite':
          v = `${wp.nitrite.toFixed(2)} mg/L`;
          note = ideal('nitrite', (r) => `< ${r[1]}`);
          break;
        case 'nitrate':
          v = `${Math.round(wp.nitrate)} mg/L`;
          note = ideal('nitrate', (r) => `< ${r[1]}`);
          break;
        case 'gh':
          hidden = water === 'marine';
          v = `${Math.round(wp.gh)} dGH`;
          note = ideal('gh', (r) => `${formatRange(r, 0)} dGH`);
          break;
        case 'kh':
          v = `${Math.round(wp.kh)} dKH`;
          note = ideal('kh', (r) => `${formatRange(r, 0)} dKH`);
          break;
        case 'salinity':
          hidden = water === 'freshwater';
          v = `${wp.salinitySG.toFixed(3)} SG`;
          note = ideal('salinity', (r) => `${r[0].toFixed(3)}–${r[1].toFixed(3)}`);
          break;
        case 'oxygen': {
          const mg = oxygenSaturationMgL(wp.temperatureC, wp.salinitySG) * wp.oxygen;
          v = `${mg.toFixed(1)} mg/L`;
          note = `${Math.round(wp.oxygen * 100)}% of saturation`;
          break;
        }
        case 'cycle':
          v = p.note ?? '';
          note = `bacteria ${Math.round(Math.min(1.5, wp.bacteria) * 100)}% of need`;
          break;
      }
      if (t.el.hidden !== hidden) t.el.hidden = hidden;
      setText(t.value, v);
      setText(t.note, note);
      setLevel(t.el, p.level);
    }
    setText(this.lastChange, `Last water change ${formatDuration(Math.max(0, now - wp.lastWaterChange))} ago`);
    const algae = wp.glassAlgae;
    setText(this.algaeNote, algae < 0.05 ? 'Glass is clear' : algae < 0.3 ? 'A light film of algae' : algae < 0.6 ? 'Visible algae on the glass' : 'The glass is green with algae');
  }

  // ------------------------------------------------------------------------------------------
  // Maintenance & stocking
  // ------------------------------------------------------------------------------------------

  private buildMaintenance(): HTMLElement {
    const app = this.host.app;
    const wc = (f: number) =>
      button(`${Math.round(f * 100)}%`, () => {
        app.waterChange(f);
        this.host.toast(`Changed ${Math.round(f * 100)}% of the water with fresh, conditioned water.`, 'success');
      }, { cls: 'aq-btn-wc', title: `Replace ${Math.round(f * 100)}% of the water` });
    this.algaeNote = h('span', { class: 'aq-hint' });
    return section(
      'Maintenance',
      h('div', { class: 'aq-field aq-field-inline' }, h('span', { class: 'aq-field-label' }, 'Water change'), h('div', { class: 'aq-btn-row' }, wc(0.1), wc(0.25), wc(0.5))),
      h('div', { class: 'aq-btn-grid' },
        h('div', { class: 'aq-action' }, button('Clean the glass', () => {
          app.cleanGlass();
          this.host.toast('The glass is crystal clear again.', 'success');
        }, { icon: 'glass' }), this.algaeNote),
        h('div', { class: 'aq-action' }, button('Trim plants', () => {
          app.trimPlants();
          this.host.toast('Trimmed the plants back to shape.', 'success');
        }, { icon: 'scissors' }), h('span', { class: 'aq-hint' }, 'Cut back overgrown stems')),
      ),
    );
  }

  private buildStocking(): HTMLElement {
    this.stockBar = h('span', { class: 'aq-meter-fill' });
    this.stockText = h('span', { class: 'aq-hint' });
    return section('Stocking', h('div', { class: 'aq-meter', role: 'img', 'aria-label': 'Stocking level' }, this.stockBar, h('span', { class: 'aq-meter-tick', style: { left: '80%' } })), this.stockText);
  }

  private paintStocking(): void {
    let r = 0;
    try {
      r = this.host.app.stocking().ratio;
    } catch {
      r = 0;
    }
    const level: HealthLevel = r < 0.8 ? 'good' : r <= 1 ? 'caution' : 'bad';
    setStyle(this.stockBar, 'transform', `scaleX(${Math.min(1, Math.max(0.005, r / 1.25)).toFixed(3)})`);
    setLevel(this.stockBar, level);
    const pct = Math.round(r * 100);
    setText(
      this.stockText,
      r < 0.01
        ? 'No animals yet.'
        : r < 0.5
          ? `Lightly stocked (${pct}% of capacity) — room to grow.`
          : r < 0.8
            ? `Comfortably stocked (${pct}% of capacity).`
            : r <= 1
              ? `Fully stocked (${pct}%) — keep up with water changes.`
              : `Overstocked (${pct}%) — the filter can’t keep up; consider rehoming some animals.`,
    );
  }

  // ------------------------------------------------------------------------------------------
  // Equipment
  // ------------------------------------------------------------------------------------------

  private buildEquipment(): void {
    const app = this.host.app;
    const eq = () => app.world.tank.equipment;
    const units = () => app.world.settings.units;
    clear(this.equipEl);
    this.syncers = [];
    const e = eq();
    const marine = app.world.tank.water === 'marine';

    // Heater
    const heaterOn = toggle('Heater', e.heater.on, (v) => app.setEquipment({ heater: { on: v } }));
    const heatTarget = slider({
      label: 'Target temperature',
      min: 18,
      max: 32,
      step: 0.5,
      value: e.heater.targetC,
      format: (v) => formatTemp(v, units()),
      onInput: (v) => this.setEquip({ heater: { targetC: v } }),
      hint: this.host.needs.animals ? `Your animals are comfortable at ${formatTempRange(this.host.needs.tempC, units())}` : undefined,
    });
    this.syncers.push(() => {
      heaterOn.set(eq().heater.on);
      heatTarget.set(eq().heater.targetC);
    });

    // Filter
    const filterOn = toggle('Filter running', e.filter.on, (v) => {
      app.setEquipment({ filter: { on: v } });
      if (!v) this.host.toast('Filter off — oxygen will slowly fall and waste will build up.', 'warning');
    });
    const filterType = select('Filter type', FILTER_TYPES, e.filter.type, (v) => app.setEquipment({ filter: { type: v } }));
    const liters = (app.world.tank.size.widthCm * app.world.tank.size.heightCm * app.world.tank.size.depthCm) / 1000;
    const flow = slider({
      label: 'Flow',
      min: Math.round(liters * 2),
      max: Math.round(liters * 12),
      step: 10,
      value: e.filter.flowLph,
      format: (v) => `${Math.round(v)} L/h · ${(v / liters).toFixed(1)}× tank/hour`,
      onInput: (v) => this.setEquip({ filter: { flowLph: v } }),
      hint: marine ? 'Reefs like 8–15× turnover per hour.' : 'Most community tanks do well at 4–6× per hour.',
    });
    this.syncers.push(() => {
      filterOn.set(eq().filter.on);
      filterType.set(eq().filter.type);
      flow.set(eq().filter.flowLph);
    });

    // Lights
    const l = e.lights;
    const onH = slider({ label: 'Lights on', min: 4, max: 14, step: 0.25, value: l.onHour, format: formatHour, onInput: (v) => this.setEquip({ lights: { onHour: v } }) });
    const offH = slider({ label: 'Lights off', min: 14, max: 24, step: 0.25, value: l.offHour, format: formatHour, onInput: (v) => this.setEquip({ lights: { offHour: v } }) });
    const photo = h('span', { class: 'aq-hint' });
    const paintPhoto = () => {
      const L = eq().lights;
      const hrs = Math.max(0, L.offHour - L.onHour);
      setText(photo, `${hrs.toFixed(hrs % 1 ? 1 : 0)} hours of light a day${hrs > 10 ? ' — long days feed algae' : hrs < 6 ? ' — plants may struggle' : ''}`);
    };
    paintPhoto();
    const intensity = slider({ label: 'Intensity', min: 0.1, max: 1, step: 0.01, value: l.intensity, format: (v) => `${Math.round(v * 100)}%`, onInput: (v) => this.setEquip({ lights: { intensity: v } }) });
    const swatch = h('span', { class: 'aq-kelvin-swatch' });
    const kelvin = slider({
      label: 'Color temperature',
      min: 4000,
      max: 20000,
      step: 100,
      value: l.colorTempK,
      format: (v) => `${Math.round(v).toLocaleString()} K`,
      onInput: (v) => {
        swatch.style.background = kelvinToHex(v);
        this.setEquip({ lights: { colorTempK: v } });
      },
      hint: marine ? '10,000–20,000 K: the blue of reef water' : '5,500–7,500 K: daylight that flatters plants',
    });
    swatch.style.background = kelvinToHex(l.colorTempK);
    kelvin.el.querySelector('.aq-field-row')!.prepend(swatch);
    const ramp = slider({ label: 'Sunrise & sunset', min: 0, max: 120, step: 5, value: l.rampMinutes, format: (v) => (v ? `${v} min` : 'Instant'), onInput: (v) => this.setEquip({ lights: { rampMinutes: v } }) });
    const moon = toggle('Moonlight', l.moonlight, (v) => app.setEquipment({ lights: { moonlight: v } }), 'A faint blue glow after dark');
    onH.input.addEventListener('input', paintPhoto);
    offH.input.addEventListener('input', paintPhoto);
    this.syncers.push(() => {
      const L = eq().lights;
      onH.set(L.onHour);
      offH.set(L.offHour);
      intensity.set(L.intensity);
      kelvin.set(L.colorTempK);
      ramp.set(L.rampMinutes);
      moon.set(L.moonlight);
      paintPhoto();
    });

    // CO2
    const co2 = toggle('CO₂ injection', e.co2, (v) => app.setEquipment({ co2: v }), marine ? 'Not used in reef tanks' : 'Lush plant growth; lowers pH slightly during the light period');

    // Auto-feeder
    const af = e.autoFeeder;
    const afOn = toggle('Auto-feeder', af.enabled, (v) => app.setEquipment({ autoFeeder: { enabled: v } }), 'Feeds on schedule, even while you’re away');
    const foods = FOOD_LIST.filter((f) => f.buoyancy !== 'live-swimming' && f.buoyancy !== 'clip').map((f) => ({ value: f.kind, label: f.name }));
    const afFood = select<FoodKind>('Auto-feeder food', foods, af.food, (v) => app.setEquipment({ autoFeeder: { food: v } }));
    const afPinches = stepper('pinches', af.pinches, 1, 5, (v) => app.setEquipment({ autoFeeder: { pinches: v } }), (v) => `${v} ${v === 1 ? 'pinch' : 'pinches'}`);
    const times = h('div', { class: 'aq-times' });
    const renderTimes = () => {
      clear(times);
      const hours = [...eq().autoFeeder.hours].sort((a, b) => a - b);
      for (const hr of hours) {
        const chip = h('button', { type: 'button', class: 'aq-time-chip', 'aria-label': `Remove feeding at ${formatHour(hr)}` }, formatHour(hr), icon('close', 12));
        chip.addEventListener('click', () => {
          app.setEquipment({ autoFeeder: { hours: hours.filter((x) => x !== hr) } });
          renderTimes();
        });
        times.append(chip);
      }
      if (hours.length < 4) {
        const opts = [{ value: '', label: 'Add time…' }];
        for (let x = 6; x <= 22; x += 0.5) if (!hours.includes(x)) opts.push({ value: String(x), label: formatHour(x) });
        const add = select<string>('Add feeding time', opts, '', (v) => {
          if (!v) return;
          app.setEquipment({ autoFeeder: { hours: [...hours, Number(v)].sort((a, b) => a - b) } });
          renderTimes();
        }, 'aq-select-small');
        times.append(add.el);
      }
    };
    renderTimes();
    this.syncers.push(() => {
      co2.set(eq().co2);
      afOn.set(eq().autoFeeder.enabled);
      afFood.set(eq().autoFeeder.food);
      afPinches.set(eq().autoFeeder.pinches);
    });

    this.equipEl.append(
      section('Heater', heaterOn.el, heatTarget.el),
      section('Filter', filterOn.el, h('div', { class: 'aq-field aq-field-inline' }, h('span', { class: 'aq-field-label' }, 'Type'), filterType.el), flow.el),
      section('Lighting', onH.el, offH.el, photo, intensity.el, kelvin.el, ramp.el, moon.el),
      section(marine ? 'Extras' : 'Plants', co2.el),
      section('Auto-feeder', afOn.el, h('div', { class: 'aq-field aq-field-inline' }, h('span', { class: 'aq-field-label' }, 'Food'), afFood.el), h('div', { class: 'aq-field aq-field-inline' }, h('span', { class: 'aq-field-label' }, 'Amount'), afPinches.el), h('div', { class: 'aq-field' }, h('span', { class: 'aq-field-label' }, 'Times'), times)),
    );
  }

  refresh(): void {
    this.paintTests();
    this.paintStocking();
  }

  onSettingsChanged(): void {
    for (const s of this.syncers) s();
  }

  onOpen(): void {
    for (const s of this.syncers) s();
    this.refresh();
  }
}

function setLevel(el: HTMLElement, level: HealthLevel): void {
  setClass(el, 'is-good', level === 'good');
  setClass(el, 'is-caution', level === 'caution');
  setClass(el, 'is-bad', level === 'bad');
}
