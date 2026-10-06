/**
 * Step 1: freshwater, brackish or saltwater — each with a small scene and one plain sentence.
 */
import type { WaterType } from '../../../core/types';
import { h } from '../../dom';
import { art, waterScene } from '../art';
import { waterLabel } from '../labels';
import { cardGroup } from '../widgets';
import type { StepEnv, StepView } from './types';

const WATER_TEXT: Record<WaterType, string> = {
  freshwater: 'Rivers, lakes and forest streams: planted scapes, tetras, rasboras, cichlids and shrimp. The gentlest place to begin.',
  brackish: 'Where rivers meet the sea: mangrove roots, archerfish, mollies and bumblebee gobies, in lightly salted water (SG about 1.005–1.012).',
  marine: 'Reefs and lagoons: corals, clownfish, gobies and cleaner shrimp. Needs steady salinity, strong light and patience.',
};

export function waterStep(env: StepEnv): StepView {
  const m = env.model;
  const group = cardGroup<WaterType>(
    'Water',
    'aqb-cards-water',
    (['freshwater', 'brackish', 'marine'] as const).map((w) => ({
      value: w,
      content: [art(waterScene(w), 'aqb-card-art'), h('span', { class: 'aqb-card-title' }, waterLabel(w)), h('span', { class: 'aqb-card-text' }, WATER_TEXT[w])],
    })),
    m.spec.water,
    (w) => {
      if (w === m.spec.water) return;
      m.setWater(w, env.styles(w));
      env.changed();
    },
  );
  return {
    title: 'Which water?',
    lead: 'Everything else follows from this: the styles, the substrate, the equipment and who can live there.',
    el: h('div', { class: 'aqb-step-water' }, group.el),
  };
}
