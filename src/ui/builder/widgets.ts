/**
 * Builder-specific controls: groups of choice cards (radio semantics, arrow keys, roving focus)
 * and a dimension field (slider + number box in the keeper's units).
 */
import { domId, h, setAttr, setText, type Child } from '../dom';
import type { Units } from '../format';
import { displayRange, fromDisplayLength, lengthUnit, toDisplayLength } from './tankMath';

export interface CardGroup<T extends string> {
  el: HTMLElement;
  set(value: T | null): void;
  button(value: T): HTMLButtonElement | undefined;
}

export interface CardItem<T extends string> {
  value: T;
  content: Child[];
  title?: string;
  /** Extra classes (e.g. 'is-dim' for a choice that suits the tank less well). */
  cls?: string;
  label?: string;
}

/**
 * Mutually exclusive cards (role="radiogroup"). Arrow keys move and choose, as with native radios;
 * only the chosen card is in the tab order.
 */
export function cardGroup<T extends string>(aria: string, cls: string, items: CardItem<T>[], value: T | null, onPick: (v: T) => void): CardGroup<T> {
  const el = h('div', { class: `aqb-cards ${cls}`, role: 'radiogroup', 'aria-label': aria });
  const buttons = new Map<T, HTMLButtonElement>();
  let cur = value;
  const sync = () => {
    const anyOn = cur !== null && buttons.has(cur);
    let first = true;
    for (const [v, b] of buttons) {
      const on = v === cur;
      setAttr(b, 'aria-checked', String(on));
      b.tabIndex = on || (!anyOn && first) ? 0 : -1;
      first = false;
    }
  };
  items.forEach((it, i) => {
    const b = h('button', { type: 'button', role: 'radio', class: `aqb-card ${it.cls ?? ''}`, title: it.title, 'aria-label': it.label }, ...it.content);
    b.addEventListener('click', () => {
      if (cur !== it.value) {
        cur = it.value;
        sync();
      }
      onPick(it.value);
    });
    b.addEventListener('keydown', (e) => {
      const d = e.key === 'ArrowRight' || e.key === 'ArrowDown' ? 1 : e.key === 'ArrowLeft' || e.key === 'ArrowUp' ? -1 : 0;
      if (!d) return;
      e.preventDefault();
      const next = items[(i + d + items.length) % items.length];
      const nb = buttons.get(next.value)!;
      nb.focus();
      nb.click();
    });
    buttons.set(it.value, b);
    el.append(b);
  });
  sync();
  return {
    el,
    set(v) {
      cur = v;
      sync();
    },
    button: (v) => buttons.get(v),
  };
}

export interface DimField {
  el: HTMLElement;
  /** Reflect the model (value and limits) without fighting the keeper's input. */
  sync(cm: number, limits: [number, number]): void;
}

/** Width/depth/height: a slider and a number box, in cm or inches. Values reach `onSet` in cm. */
export function dimField(label: string, hint: string, units: Units, cm: number, limits: [number, number], onSet: (cm: number) => void): DimField {
  const id = domId('dim');
  const unit = lengthUnit(units);
  const step = units === 'imperial' ? 0.5 : 1;
  const [lo, hi] = displayRange(limits, units);
  const v0 = toDisplayLength(cm, units);
  const range = h('input', { type: 'range', class: 'aq-range', min: lo, max: hi, step, value: v0, 'aria-label': `${label} (${unit})` });
  const num = h('input', { type: 'number', id, class: 'aqb-num', min: lo, max: hi, step, value: v0, inputmode: 'decimal', enterkeyhint: 'next' });
  const paint = () => {
    const t = (Number(range.value) - Number(range.min)) / (Number(range.max) - Number(range.min) || 1);
    range.style.setProperty('--fill', `${(t * 100).toFixed(1)}%`);
  };
  paint();
  range.addEventListener('input', () => {
    num.value = range.value;
    paint();
    onSet(fromDisplayLength(Number(range.value), units));
  });
  // Typing: follow along live while the number is in range; settle (clamp) on change/blur.
  num.addEventListener('input', () => {
    const v = Number(num.value);
    if (num.value !== '' && Number.isFinite(v) && v >= Number(num.min) && v <= Number(num.max)) {
      range.value = String(v);
      paint();
      onSet(fromDisplayLength(v, units));
    }
  });
  num.addEventListener('change', () => {
    const v = Number(num.value);
    onSet(fromDisplayLength(Number.isFinite(v) && num.value !== '' ? v : Number(range.value), units));
  });
  const el = h(
    'div',
    { class: 'aqb-dim' },
    h('label', { class: 'aqb-dim-label', for: id }, h('span', { class: 'aq-field-label' }, label), h('span', { class: 'aq-hint' }, hint)),
    range,
    h('span', { class: 'aqb-num-wrap' }, num, h('span', { class: 'aqb-num-unit', 'aria-hidden': 'true' }, unit)),
  );
  return {
    el,
    sync(cmNow, lim) {
      const [a, b] = displayRange(lim, units);
      if (Number(range.min) !== a) range.min = num.min = String(a);
      if (Number(range.max) !== b) range.max = num.max = String(b);
      const v = toDisplayLength(cmNow, units);
      if (Number(range.value) !== v) range.value = String(v);
      if (document.activeElement !== num && Number(num.value) !== v) num.value = String(v);
      paint();
    },
  };
}

/** A label/value pair in a readout grid. */
export function stat(label: string): { el: HTMLElement; set(value: string, sub?: string): void } {
  const value = h('span', { class: 'aqb-stat-value' });
  const sub = h('span', { class: 'aqb-stat-sub' });
  return {
    el: h('div', { class: 'aqb-stat' }, h('span', { class: 'aqb-stat-label' }, label), value, sub),
    set(v, s = '') {
      setText(value, v);
      setText(sub, s);
    },
  };
}

/** Coalesce repaints to one per animation frame. */
export function frameBatch(fn: () => void): () => void {
  let raf = 0;
  return () => {
    if (raf) return;
    raf = requestAnimationFrame(() => {
      raf = 0;
      fn();
    });
  };
}
