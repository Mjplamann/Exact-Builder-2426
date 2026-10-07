/**
 * Step 5: equipment, prefilled for the size and style — filter type and flow (with turnover
 * guidance), heater, light schedule and colour, CO₂ for planted freshwater, and the auto-feeder.
 */
import type { Equipment } from '../../../core/types';
import { slider, toggle } from '../../controls';
import { h, setClass, setText } from '../../dom';
import { formatFlow, formatHour, formatTemp, formatTempRange, kelvinToHex } from '../../format';
import { icon, type IconName } from '../../icons';
import { ROOM_TEMP_C, flowRange, photoperiod, turnover, turnoverAdvice, turnoverWord } from '../tankMath';
import { cardGroup } from '../widgets';
import type { StepEnv, StepView } from './types';

type FilterType = Equipment['filter']['type'];

const FILTERS: { value: FilterType; label: string; text: string }[] = [
  { value: 'canister', label: 'Canister', text: 'Quiet and strong, hidden in the stand' },
  { value: 'hang-on-back', label: 'Hang-on-back', text: 'Simple, easy to service' },
  { value: 'internal', label: 'Internal', text: 'Compact, for small tanks' },
  { value: 'sponge', label: 'Sponge', text: 'Gentle and fry-safe, air-driven' },
  { value: 'sump', label: 'Sump', text: 'Big and reef tanks: room for everything' },
];

/** Styles where injected CO₂ earns its keep. */
const PLANTED = new Set(['amazon', 'iwagumi', 'dutch', 'nature', 'nano-shrimp']);

function head(name: IconName, title: string): HTMLElement {
  return h('h3', { class: 'aq-sec-title aqb-eq-head' }, icon(name, 15), title);
}

export function equipmentStep(env: StepEnv): StepView {
  const m = env.model;
  const units = env.units;
  const eq = m.equipment;
  const water = m.spec.water;
  const advice = turnoverAdvice(water, m.spec.aquascape);

  // Filter
  const filterType = cardGroup<FilterType>(
    'Filter type',
    'aqb-cards-filter',
    FILTERS.map((f) => ({ value: f.value, content: [h('span', { class: 'aqb-card-title' }, f.label), h('span', { class: 'aqb-card-text' }, f.text)] })),
    eq.filter.type,
    (v) => {
      m.setFilter({ type: v });
      env.changed();
    },
  );
  const [fmin, fmax] = flowRange(m.spec.size, water);
  const turnChip = h('span', { class: 'aqb-turn' });
  const flow = slider({
    label: 'Flow',
    min: fmin,
    max: Math.max(fmax, eq.filter.flowLph),
    step: 10,
    value: eq.filter.flowLph,
    format: (v) => `${formatFlow(v, units)} · ${turnover(v, m.spec.size).toFixed(1)}× an hour`,
    onInput: (v) => {
      m.setFilter({ flowLph: v });
      paintTurn();
      env.changed();
    },
    hint: advice.text,
  });
  flow.el.querySelector('.aq-field-row')?.append(turnChip);
  const paintTurn = () => {
    const word = turnoverWord(turnover(m.equipment.filter.flowLph, m.spec.size), advice);
    setText(turnChip, word);
    setClass(turnChip, 'is-good', word === 'Just right');
  };
  paintTurn();

  // Heater
  const heatHint = h('p', { class: 'aq-hint aqb-field-note' });
  const target = slider({
    label: 'Target temperature',
    min: 18,
    max: 32,
    step: 0.5,
    value: eq.heater.targetC,
    format: (v) => formatTemp(v, units),
    onInput: (v) => {
      m.setHeater({ targetC: v });
      paintHeat();
      env.changed();
    },
  });
  const heater = toggle('Heater', eq.heater.on, (on) => {
    m.setHeater({ on });
    target.el.hidden = !on;
    paintHeat();
    env.changed();
  });
  target.el.hidden = !eq.heater.on;
  const tropical = formatTempRange([24, 27], units);
  const paintHeat = () => {
    const h = m.equipment.heater;
    setText(
      heatHint,
      h.on && h.targetC < ROOM_TEMP_C
        ? `Heaters only heat: set below the room (about ${formatTemp(ROOM_TEMP_C, units, 0)}), the water simply stays at room temperature.`
        : h.on
        ? water === 'marine'
          ? `Reefs live at ${tropical}, and steadiness matters more than the exact number.`
          : `Tropical fish want ${tropical}; a few degrees cooler suits hillstream and subtropical species.`
        : `Unheated, the water follows the room (about ${formatTemp(ROOM_TEMP_C, units, 0)}) — right for goldfish, white clouds and other temperate fish.`,
    );
  };
  paintHeat();

  // Lights
  const L = eq.lights;
  const photo = h('p', { class: 'aq-hint aqb-field-note' });
  const paintPhoto = () => {
    const hrs = photoperiod(m.equipment.lights.onHour, m.equipment.lights.offHour);
    setText(photo, `${hrs % 1 ? hrs.toFixed(1) : hrs} hours of light a day${hrs > 10 ? ' — long days feed algae' : hrs < 6 ? ' — plants may struggle' : ' — a natural rhythm'}.`);
  };
  const onH = slider({ label: 'Lights on', min: 4, max: 14, step: 0.25, value: L.onHour, format: formatHour, onInput: (v) => (m.setLights({ onHour: v }), paintPhoto(), env.changed()) });
  const offH = slider({ label: 'Lights off', min: 14, max: 24, step: 0.25, value: L.offHour, format: formatHour, onInput: (v) => (m.setLights({ offHour: v }), paintPhoto(), env.changed()) });
  paintPhoto();
  const swatch = h('span', { class: 'aq-kelvin-swatch', style: { background: kelvinToHex(L.colorTempK) } });
  const kelvin = slider({
    label: 'Colour of the light',
    min: 4000,
    max: 20000,
    step: 100,
    value: L.colorTempK,
    format: (v) => `${Math.round(v).toLocaleString()} K`,
    onInput: (v) => {
      swatch.style.background = kelvinToHex(v);
      m.setLights({ colorTempK: v });
      env.changed();
    },
    hint: water === 'marine' ? '10,000–20,000 K: the blue-white of reef water.' : '5,500–7,500 K: daylight that flatters plants and fish.',
  });
  kelvin.el.querySelector('.aq-field-row')?.prepend(swatch);

  // CO₂ (planted freshwater) & feeder
  const planted = water === 'freshwater';
  const co2 = toggle(
    'CO₂ injection',
    eq.co2,
    (on) => {
      m.setCo2(on);
      env.changed();
    },
    PLANTED.has(m.spec.aquascape) ? 'Lusher, faster plant growth for this planted style — keep an eye on the fish at the end of the day.' : 'Mostly for densely planted tanks; this style does fine without it.',
  );
  const feeder = toggle(
    'Auto-feeder',
    eq.autoFeeder.enabled,
    (on) => {
      m.setFeeder(on);
      env.changed();
    },
    'Feeds a small portion twice a day, so the tank is fine while you are away.',
  );

  return {
    title: 'Equipment',
    lead: 'Prefilled for your tank and style — adjust anything you like.',
    el: h(
      'div',
      { class: 'aqb-step-equipment' },
      h('section', { class: 'aqb-eq' }, head('filter', 'Filter'), filterType.el, flow.el),
      h('section', { class: 'aqb-eq' }, head('thermometer', 'Heater'), heater.el, target.el, heatHint),
      h('section', { class: 'aqb-eq' }, head('bulb', 'Lights'), h('div', { class: 'aqb-two' }, onH.el, offH.el), photo, kelvin.el),
      h('section', { class: 'aqb-eq' }, head('sparkle', 'Extras'), planted ? co2.el : null, feeder.el),
    ),
  };
}
