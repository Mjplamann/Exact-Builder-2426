/**
 * Step 6: a seeded, mature filter (fish can move in today) or a fishless cycle from scratch —
 * with a short explanation of the nitrogen cycle the choice is about.
 */
import { h } from '../../dom';
import { icon } from '../../icons';
import { cardGroup } from '../widgets';
import type { StepEnv, StepView } from './types';

export function cycleStep(env: StepEnv): StepView {
  const m = env.model;
  const group = cardGroup<'mature' | 'fishless'>(
    'Filter',
    'aqb-cards-cycle',
    [
      {
        value: 'mature',
        content: [
          h('span', { class: 'aqb-start-icon' }, icon('filter', 22)),
          h('span', { class: 'aqb-card-title' }, 'Seeded, mature filter'),
          h('span', { class: 'aqb-card-text' }, 'Media from an established tank, already full of nitrifying bacteria: fish can move in today.'),
        ],
      },
      {
        value: 'fishless',
        content: [
          h('span', { class: 'aqb-start-icon' }, icon('calendar', 22)),
          h('span', { class: 'aqb-card-title' }, 'Fishless cycle'),
          h('span', { class: 'aqb-card-text' }, 'The realistic way: a dose of ammonia feeds the new bacteria; over 4–6 weeks it falls, nitrite rises and falls. Add fish once both test at zero.'),
        ],
      },
    ],
    m.spec.cycled ? 'mature' : 'fishless',
    (v) => {
      m.setCycled(v === 'mature');
      env.changed();
    },
  );

  const link = (name: string, sub: string) => h('li', { class: 'aqb-ncycle-step' }, h('span', { class: 'aqb-ncycle-name' }, name), h('span', { class: 'aqb-ncycle-sub' }, sub));
  const explain = h(
    'section',
    { class: 'aqb-ncycle', 'aria-label': 'The nitrogen cycle' },
    h('h3', { class: 'aq-sec-title' }, 'The nitrogen cycle'),
    h('ol', { class: 'aqb-ncycle-chain' }, link('Fish & food', 'waste and leftovers'), link('Ammonia', 'toxic'), link('Nitrite', 'toxic'), link('Nitrate', 'mostly harmless')),
    h(
      'p',
      { class: 'aqb-ncycle-text' },
      'Fish waste and uneaten food break down into ammonia. One group of bacteria living in the filter turns it into nitrite, another into nitrate, which plants take up and water changes remove. A new filter has almost none of these bacteria — they take weeks to grow.',
    ),
  );

  return {
    title: 'The filter',
    lead: 'Is the filter ready for fish on day one, or will you let it mature first?',
    el: h('div', { class: 'aqb-step-cycle' }, group.el, explain),
  };
}
