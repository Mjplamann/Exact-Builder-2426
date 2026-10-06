/**
 * Step 4: substrate and background swatches, and the substrate's slope (front and back depth),
 * with a cross-section that redraws as the sliders move.
 */
import type { BackgroundKind, SubstrateKind } from '../../../core/types';
import { slider } from '../../controls';
import { h, setText } from '../../dom';
import { formatLength } from '../../format';
import { BACKGROUNDS, SUBSTRATES } from '../../scapeArt';
import { slopeSection } from '../art';
import { slopeLimits } from '../model';
import { cardGroup, frameBatch } from '../widgets';
import type { StepEnv, StepView } from './types';

/** A drawable color for a background swatch's CSS (gradients use their first stop). */
function backdropColor(css: string): string {
  return /#[0-9a-f]{6}/i.exec(css)?.[0] ?? '#0b1418';
}

export function lookStep(env: StepEnv): StepView {
  const m = env.model;
  const s = m.spec;
  const units = env.units;

  const subNote = h('p', { class: 'aq-hint aqb-swatch-note', 'aria-live': 'polite' });
  const subs = cardGroup<SubstrateKind>(
    'Substrate',
    'aqb-swatches',
    SUBSTRATES.map((x) => {
      const suits = x.water.includes(s.water);
      return {
        value: x.value,
        cls: suits ? '' : 'is-dim',
        title: `${x.label} — ${x.note}${suits ? '' : ' (unusual for this water)'}`,
        content: [h('span', { class: `aq-swatch-chip${x.value === 'bare' ? ' is-bare' : ''}`, style: { background: x.color } }), h('span', { class: 'aq-swatch-label' }, x.label)],
      };
    }),
    s.substrate,
    (v) => {
      m.setSubstrate(v);
      env.changed();
      paint();
    },
  );
  const bgs = cardGroup<BackgroundKind>(
    'Background',
    'aqb-swatches',
    BACKGROUNDS.map((b) => ({
      value: b.value,
      title: b.label,
      content: [h('span', { class: 'aq-swatch-chip', style: { background: b.css } }), h('span', { class: 'aq-swatch-label' }, b.label)],
    })),
    s.background,
    (v) => {
      m.setBackground(v);
      env.changed();
      paint();
    },
  );

  const lim = slopeLimits(s.size.heightCm);
  const front = slider({
    label: 'Depth at the front',
    min: 0,
    max: lim.front,
    step: 0.5,
    value: s.substrateDepthFrontCm ?? 0,
    format: (v) => formatLength(v, units),
    onInput: (v) => {
      m.setSlope({ front: v });
      env.changed();
      paint();
    },
  });
  const back = slider({
    label: 'Depth at the back',
    min: 0,
    max: lim.back,
    step: 0.5,
    value: s.substrateDepthBackCm ?? 0,
    format: (v) => formatLength(v, units),
    onInput: (v) => {
      m.setSlope({ back: v });
      env.changed();
      paint();
    },
    hint: 'A slope rising toward the back gives the scape depth; keep the front shallow so the glass stays clean.',
  });
  const section = h('div', { class: 'aqb-section-art', role: 'img', 'aria-label': 'Cross-section of the substrate slope' });

  const paint = frameBatch(() => {
    const sub = SUBSTRATES.find((x) => x.value === m.spec.substrate);
    const bg = BACKGROUNDS.find((x) => x.value === m.spec.background);
    setText(subNote, sub ? `${sub.label}: ${sub.note}${sub.water.includes(m.spec.water) ? '.' : ' — unusual for this water.'}` : '');
    section.innerHTML = slopeSection({
      heightCm: m.spec.size.heightCm,
      front: m.spec.substrateDepthFrontCm ?? 0,
      back: m.spec.substrateDepthBackCm ?? 0,
      sand: sub && sub.value !== 'bare' ? sub.color : 'transparent',
      backdrop: backdropColor(bg?.css ?? ''),
      bare: m.spec.substrate === 'bare',
    });
    const bare = m.spec.substrate === 'bare';
    front.input.disabled = bare;
    back.input.disabled = bare;
  });
  paint();

  return {
    title: 'Substrate and background',
    lead: 'What the floor is made of and what you see through the back glass.',
    el: h(
      'div',
      { class: 'aqb-step-look' },
      h('h3', { class: 'aq-sec-title' }, 'Substrate'),
      subs.el,
      subNote,
      h('h3', { class: 'aq-sec-title' }, 'Background'),
      bgs.el,
      h('h3', { class: 'aq-sec-title' }, 'Slope'),
      h('div', { class: 'aqb-slope' }, h('div', { class: 'aqb-slope-controls' }, front.el, back.el), section),
    ),
  };
}
