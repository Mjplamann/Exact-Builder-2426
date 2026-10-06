/**
 * Step 8: name the tank and look over every choice, with a way back to each step.
 */
import { h } from '../../dom';
import { formatFlow, formatHour, formatLength, formatTemp, plural } from '../../format';
import { BACKGROUNDS, SUBSTRATES } from '../../scapeArt';
import { animalsLabel, waterLabel } from '../labels';
import { MAX_NAME_LENGTH, STEP_NAMES, type StepId } from '../model';
import { formatDims, formatVolumeBoth, photoperiod } from '../tankMath';
import type { StepEnv, StepView } from './types';

const FILTER_NAMES: Record<string, string> = { canister: 'Canister', 'hang-on-back': 'Hang-on-back', internal: 'Internal', sponge: 'Sponge', sump: 'Sump' };

export function reviewStep(env: StepEnv): StepView {
  const { model: m, units } = env;
  const s = m.spec;
  const eq = m.equipment;

  const input = h('input', { type: 'text', class: 'aqb-name-input', id: 'aqb-name', maxlength: MAX_NAME_LENGTH, value: s.name, autocomplete: 'off', spellcheck: 'false', enterkeyhint: 'done' });
  input.addEventListener('input', () => {
    m.setName(input.value);
    env.changed();
  });

  const styleName = m.style?.name ?? 'Bare substrate';
  const sub = SUBSTRATES.find((x) => x.value === s.substrate)?.label ?? s.substrate;
  const bg = BACKGROUNDS.find((x) => x.value === s.background)?.label ?? s.background;
  const slope = s.substrate === 'bare' ? 'bare glass' : `${formatLength(s.substrateDepthFrontCm ?? 0, units)} at the front, ${formatLength(s.substrateDepthBackCm ?? 0, units)} at the back`;
  const species = new Set(s.stock.map((q) => q.speciesId)).size;
  const animals = s.stock.length ? `${animalsLabel(m.animals)} of ${species} ${plural(species, 'species', 'species')}` : s.cycled ? 'None yet — add them from the Fish panel' : 'None while the filter cycles';
  const rows: [StepId, string, string][] = [
    ['water', 'Water', waterLabel(s.water)],
    ['size', 'Size', `${formatDims(s.size, units)} · ${formatVolumeBoth(m.liters, units)}`],
    ['style', 'Style', styleName],
    ['look', 'Substrate', `${sub} · ${slope} · ${bg.toLowerCase()} background`],
    [
      'equipment',
      'Equipment',
      [
        `${FILTER_NAMES[eq.filter.type] ?? eq.filter.type} filter, ${formatFlow(eq.filter.flowLph, units)}`,
        eq.heater.on ? `heater at ${formatTemp(eq.heater.targetC, units)}` : 'no heater',
        `lights ${formatHour(eq.lights.onHour)}–${formatHour(eq.lights.offHour)} (${photoperiod(eq.lights.onHour, eq.lights.offHour)} h)`,
        eq.co2 && s.water === 'freshwater' ? 'CO₂' : '',
        eq.autoFeeder.enabled ? 'auto-feeder' : '',
      ]
        .filter(Boolean)
        .join(' · '),
    ],
    ['cycle', 'Filter', s.cycled ? 'Seeded and mature — ready for fish' : 'Fishless cycle — about 4–6 weeks'],
    ['animals', 'Animals', animals],
  ];

  const list = h('dl', { class: 'aqb-review' });
  for (const [step, label, value] of rows) {
    const edit = h('button', { type: 'button', class: 'aq-link aqb-edit', 'aria-label': `Edit ${STEP_NAMES[step].toLowerCase()}` }, 'Edit');
    edit.addEventListener('click', () => env.goto(step));
    list.append(h('div', { class: 'aqb-review-row' }, h('dt', null, label), h('dd', null, value), edit));
  }

  return {
    title: 'Name and review',
    lead: 'One last look. Your new tank opens as soon as it is created.',
    el: h(
      'div',
      { class: 'aqb-step-review' },
      h('div', { class: 'aqb-name' }, h('label', { class: 'aq-field-label', for: 'aqb-name' }, 'Name'), input),
      list,
    ),
    onShown: () => {
      // Desktop: straight into the name. Phones: leave the keyboard down until asked.
      if (!env.host.isTouch) input.focus({ preventScroll: true });
    },
  };
}
