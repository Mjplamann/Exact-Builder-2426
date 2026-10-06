/**
 * Step 2: shape and size. Shape cards (proportional outlines) set starting dimensions; width,
 * depth and height then fine-tune it in the keeper's units, with live volume, filled weight,
 * footprint, a to-scale preview beside a person and a few honest notes.
 */
import type { TankShape } from '../../../app/tankTypes';
import { h, setText } from '../../dom';
import { formatLength, formatLiters } from '../../format';
import { SUBSTRATES } from '../../scapeArt';
import { art, fillScaleLabels, scalePreview, tankOutline } from '../art';
import {
  filledWeight,
  footprintM2,
  formatArea,
  formatDims,
  formatVolumeBoth,
  formatWeight,
  glassThicknessMm,
  limitsFor,
  sizeNotes,
  type Axis,
} from '../tankMath';
import { cardGroup, dimField, frameBatch, stat } from '../widgets';
import type { StepEnv, StepView } from './types';

const SHAPE_ORDER: Exclude<TankShape, 'custom'>[] = ['nano', 'cube', 'standard', 'long', 'tall'];

export function sizeStep(env: StepEnv): StepView {
  const m = env.model;
  const units = env.units;
  const shapes = env.host.app.shapeSizes();
  const sand = () => SUBSTRATES.find((s) => s.value === m.spec.substrate && s.value !== 'bare')?.color ?? '#b49c78';

  const describe = h('p', { class: 'aqb-shape-desc aq-hint', 'aria-live': 'polite' });
  const customArt = h('span', { class: 'aqb-shape-art' });
  const customDims = h('span', { class: 'aqb-shape-dims' });
  const items = [
    ...SHAPE_ORDER.map((id) => {
      const sh = shapes[id];
      return {
        value: id as TankShape,
        title: sh.description,
        content: [
          art(tankOutline(sh.size), 'aqb-shape-art'),
          h('span', { class: 'aqb-card-title' }, sh.label),
          h('span', { class: 'aqb-shape-dims' }, formatLiters((sh.size.widthCm * sh.size.depthCm * sh.size.heightCm) / 1000, units)),
        ],
      };
    }),
    { value: 'custom' as TankShape, title: 'Your own dimensions', content: [customArt, h('span', { class: 'aqb-card-title' }, 'Custom'), customDims] },
  ];
  const group = cardGroup<TankShape>('Shape', 'aqb-cards-shape', items, m.spec.shape, (v) => {
    m.setShape(v);
    syncDims();
    env.changed();
    repaint();
  });

  const dimDefs: [Axis, string, string][] = [
    ['width', 'Width', 'left to right'],
    ['depth', 'Depth', 'front to back'],
    ['height', 'Height', 'bottom to rim'],
  ];
  const lim = () => limitsFor(m.spec.shape);
  const fields = dimDefs.map(([axis, label, hint]) => {
    const cm = axis === 'width' ? m.spec.size.widthCm : axis === 'depth' ? m.spec.size.depthCm : m.spec.size.heightCm;
    const f = dimField(label, hint, units, cm, lim()[axis], (v) => {
      m.setDim(axis, v);
      group.set(m.spec.shape);
      env.changed();
      repaint();
    });
    return { axis, f };
  });
  const syncDims = () => {
    const s = m.spec.size;
    for (const { axis, f } of fields) f.sync(axis === 'width' ? s.widthCm : axis === 'depth' ? s.depthCm : s.heightCm, lim()[axis]);
  };

  const volume = stat('Volume');
  const weight = stat('Filled weight');
  const footprint = stat('Footprint');
  const glass = stat('Glass');
  const preview = h('div', { class: 'aqb-scale', role: 'img' });
  const notes = h('ul', { class: 'aqb-notes' });

  const repaint = frameBatch(() => {
    const s = m.spec;
    const fill = { size: s.size, substrate: s.substrate, substrateDepthFrontCm: s.substrateDepthFrontCm ?? 0, substrateDepthBackCm: s.substrateDepthBackCm ?? 0 };
    const wt = filledWeight(fill, m.sg);
    volume.set(formatVolumeBoth(m.liters, units), `≈ ${formatLiters(m.netLiters, units)} of water once the substrate is in`);
    weight.set(`≈ ${formatWeight(wt.total, units)}`, `water ${formatWeight(wt.water, units)} · glass ${formatWeight(wt.glass, units)} · substrate ${formatWeight(wt.substrate, units)}`);
    footprint.set(`${formatLength(s.size.widthCm, units)} × ${formatLength(s.size.depthCm, units)}`, formatArea(footprintM2(s.size), units));
    glass.set(`${glassThicknessMm(s.size.heightCm)} mm panes`, 'thicker as the water gets deeper');
    customArt.innerHTML = tankOutline(s.size);
    setText(customDims, formatLiters(m.liters, units));
    setText(describe, s.shape === 'custom' ? 'Your own dimensions — anything from a desktop tank to a living-room centrepiece.' : shapes[s.shape].description + (s.shape === 'nano' ? ' Nano lets you go smaller than other shapes.' : ''));
    preview.innerHTML = scalePreview(s.size, sand());
    fillScaleLabels(preview, { width: formatLength(s.size.widthCm, units), height: formatLength(s.size.heightCm, units), person: units === 'imperial' ? '5 ft 7 in' : '1.7 m' });
    preview.setAttribute('aria-label', `To scale: a ${formatDims(s.size, units)} tank on its stand beside a person 1.7 m tall`);
    notes.replaceChildren(...sizeNotes(fill, s.shape, m.sg, units).map((n) => h('li', null, n)));
  });
  repaint();

  return {
    title: 'Shape and size',
    lead: 'Start from a shape, then make it yours. Bigger tanks are steadier — and heavier.',
    el: h(
      'div',
      { class: 'aqb-step-size' },
      group.el,
      describe,
      h('div', { class: 'aqb-size-grid' }, h('div', { class: 'aqb-dims' }, ...fields.map((x) => x.f.el)), h('div', { class: 'aqb-stats' }, volume.el, weight.el, footprint.el, glass.el)),
      preview,
      notes,
    ),
  };
}
