/**
 * Step 0: build a tank step by step (the default), or set up one of the ready-made tanks.
 */
import { h, prefersReducedMotion } from '../../dom';
import { icon } from '../../icons';
import { art, glyph, styleVignette } from '../art';
import { waterLabel } from '../labels';
import { cardGroup } from '../widgets';
import type { StepEnv, StepView } from './types';

export function startStep(env: StepEnv): StepView {
  const presets = env.host.app.presets();
  const list = h('div', { class: 'aqb-presets', hidden: env.cache.startMode !== 'preset' });
  for (const p of presets) {
    const go = h('button', { type: 'button', class: 'aq-btn aq-btn-ghost aqb-preset-go', 'aria-label': `Set up ${p.name}` }, h('span', null, 'Set up this tank'), glyph('arrowRight', 16));
    go.addEventListener('click', () => env.usePreset(p.id, p.name));
    list.append(
      h(
        'article',
        { class: 'aqb-preset' },
        art(styleVignette(p.id, p.name, p.water), 'aqb-preset-art'),
        h(
          'div',
          { class: 'aqb-preset-text' },
          h('div', { class: 'aqb-preset-head' }, h('h3', { class: 'aqb-preset-name' }, p.name), h('span', { class: `aqb-water-chip is-${p.water}` }, waterLabel(p.water))),
          h('p', { class: 'aqb-preset-desc' }, p.description),
          go,
        ),
      ),
    );
  }

  const modes = cardGroup<'build' | 'preset'>(
    'How to start',
    'aqb-cards-start',
    [
      {
        value: 'build',
        content: [
          h('span', { class: 'aqb-start-icon' }, icon('layers', 22)),
          h('span', { class: 'aqb-card-title' }, 'Build step by step'),
          h('span', { class: 'aqb-card-text' }, 'Water, size and shape, style, equipment and the first inhabitants — a few calm minutes.'),
        ],
      },
      {
        value: 'preset',
        content: [
          h('span', { class: 'aqb-start-icon' }, icon('sparkle', 22)),
          h('span', { class: 'aqb-card-title' }, 'Start from a ready-made tank'),
          h('span', { class: 'aqb-card-text' }, 'A finished aquascape with a community that belongs together, ready to watch.'),
        ],
      },
    ],
    env.cache.startMode,
    (v) => {
      env.cache.startMode = v;
      list.hidden = v !== 'preset';
      env.changed();
      // Bring the first ready-made tanks into view when they open below the fold.
      if (v === 'preset')
        requestAnimationFrame(() => {
          const body = list.closest<HTMLElement>('.aqb-body');
          if (!body) return;
          const top = list.getBoundingClientRect().top - body.getBoundingClientRect().top;
          if (top > body.clientHeight * 0.55) body.scrollTo({ top: body.scrollTop + top - body.clientHeight * 0.3, behavior: prefersReducedMotion() ? 'auto' : 'smooth' });
        });
    },
  );

  return {
    title: 'A new tank',
    lead: 'It joins your collection: your other tanks keep living while you are away from them.',
    el: h('div', { class: 'aqb-step-start' }, modes.el, list),
  };
}
