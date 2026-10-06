/**
 * Step 3: the aquascape style. Each card has a small drawn vignette; styles designed for more
 * water than the tank holds are dimmed with a note (still choosable). Choosing one fills in its
 * suggested substrate, background, chemistry and equipment for the steps that follow.
 */
import { h } from '../../dom';
import { formatLiters } from '../../format';
import { art, styleVignette } from '../art';
import { cardGroup } from '../widgets';
import type { StepEnv, StepView } from './types';

export function styleStep(env: StepEnv): StepView {
  const m = env.model;
  const water = m.spec.water;
  const styles = env.styles(water);
  const liters = m.liters;
  const empty = h('p', { class: 'aq-empty' }, 'No styles are available for this water yet — your tank will start with bare substrate.');
  const group = cardGroup<string>(
    'Style',
    'aqb-cards-style',
    styles.map((s) => {
      const small = (s.minLiters ?? 0) > liters;
      return {
        value: s.id,
        cls: small ? 'is-dim' : '',
        content: [
          art(styleVignette(s.id, s.name, water), 'aqb-card-art'),
          h('span', { class: 'aqb-card-title' }, s.name),
          h('span', { class: 'aqb-card-text' }, s.description),
          small ? h('span', { class: 'aqb-card-note' }, `Designed for ${formatLiters(s.minLiters!, env.units)} or more — yours holds ${formatLiters(liters, env.units)}.`) : null,
        ],
      };
    }),
    m.spec.aquascape,
    (id) => {
      const s = styles.find((q) => q.id === id) ?? null;
      if (s && s.id !== m.spec.aquascape) {
        m.applyStyle(s);
        env.changed();
      }
    },
  );
  return {
    title: 'Choose a style',
    lead: 'The layout of hardscape and plants. Its suggestions carry into the next steps — you can still change any of them.',
    el: h('div', { class: 'aqb-step-style' }, styles.length ? group.el : empty),
  };
}
