/**
 * Small accessible form controls in the glass style: switch, segmented choice, slider, select,
 * stepper, buttons with an inline two-step confirm. Each returns its element plus a `set()` to
 * reflect external state without re-creating DOM.
 */
import { domId, h, setAttr, setText, type Child } from './dom';
import { icon, type IconName } from './icons';

export interface Control<T> {
  el: HTMLElement;
  set(value: T): void;
}

/** On/off switch (role="switch"). */
export function toggle(label: string, value: boolean, onChange: (v: boolean) => void, hint?: string): Control<boolean> {
  const id = domId('sw');
  const btn = h('button', {
    class: 'aq-switch',
    type: 'button',
    role: 'switch',
    id,
    'aria-checked': String(value),
  });
  btn.append(h('span', { class: 'aq-switch-knob' }));
  const lab = h('label', { class: 'aq-field-label', for: id }, label);
  const el = h('div', { class: 'aq-field aq-field-switch' }, h('div', { class: 'aq-field-text' }, lab, hint ? h('div', { class: 'aq-hint' }, hint) : null), btn);
  let cur = value;
  btn.addEventListener('click', () => {
    cur = !cur;
    btn.setAttribute('aria-checked', String(cur));
    onChange(cur);
  });
  return {
    el,
    set(v) {
      cur = v;
      btn.setAttribute('aria-checked', String(v));
    },
  };
}

export interface SegOption<T extends string | number> {
  value: T;
  label: string;
  title?: string;
}

/** A row of mutually exclusive choices (radiogroup), arrow-key navigable. */
export function segmented<T extends string | number>(
  aria: string,
  options: SegOption<T>[],
  value: T,
  onChange: (v: T) => void,
  cls = '',
): Control<T> {
  const el = h('div', { class: `aq-seg ${cls}`, role: 'radiogroup', 'aria-label': aria });
  const buttons: HTMLButtonElement[] = [];
  let cur = value;
  const sync = () => {
    options.forEach((o, i) => {
      const on = o.value === cur;
      buttons[i].setAttribute('aria-checked', String(on));
      buttons[i].tabIndex = on ? 0 : -1;
    });
  };
  options.forEach((o, i) => {
    const b = h('button', { type: 'button', role: 'radio', class: 'aq-seg-btn', title: o.title }, o.label);
    b.addEventListener('click', () => {
      if (cur === o.value) return;
      cur = o.value;
      sync();
      onChange(o.value);
    });
    b.addEventListener('keydown', (e) => {
      const d = e.key === 'ArrowRight' || e.key === 'ArrowDown' ? 1 : e.key === 'ArrowLeft' || e.key === 'ArrowUp' ? -1 : 0;
      if (!d) return;
      e.preventDefault();
      const j = (i + d + options.length) % options.length;
      buttons[j].focus();
      buttons[j].click();
    });
    buttons.push(b);
    el.append(b);
  });
  sync();
  return {
    el,
    set(v) {
      cur = v;
      sync();
    },
  };
}

export interface SliderOpts {
  label: string;
  min: number;
  max: number;
  step: number;
  value: number;
  format: (v: number) => string;
  /** Fires continuously while dragging (throttle expensive work yourself). */
  onInput?: (v: number) => void;
  /** Fires when the user lets go. */
  onChange?: (v: number) => void;
  hint?: string;
}

export function slider(o: SliderOpts): Control<number> & { input: HTMLInputElement } {
  const id = domId('rng');
  const out = h('output', { class: 'aq-slider-value', for: id }, o.format(o.value));
  const input = h('input', {
    type: 'range',
    id,
    class: 'aq-range',
    min: o.min,
    max: o.max,
    step: o.step,
    value: o.value,
    // Screen readers announce the formatted value ("25.5 °C"), not the raw number.
    'aria-valuetext': o.format(o.value),
  });
  const paint = () => {
    const t = (Number(input.value) - o.min) / (o.max - o.min || 1);
    input.style.setProperty('--fill', `${(t * 100).toFixed(1)}%`);
  };
  paint();
  input.addEventListener('input', () => {
    const v = Number(input.value);
    setText(out, o.format(v));
    input.setAttribute('aria-valuetext', o.format(v));
    paint();
    o.onInput?.(v);
  });
  input.addEventListener('change', () => o.onChange?.(Number(input.value)));
  const el = h(
    'div',
    { class: 'aq-field aq-field-slider' },
    h('div', { class: 'aq-field-row' }, h('label', { class: 'aq-field-label', for: id }, o.label), out),
    input,
    o.hint ? h('div', { class: 'aq-hint' }, o.hint) : null,
  );
  return {
    el,
    input,
    set(v) {
      if (document.activeElement === input) return; // don't fight the user's thumb
      input.value = String(v);
      setText(out, o.format(v));
      setAttr(input, 'aria-valuetext', o.format(v));
      paint();
    },
  };
}

export function select<T extends string>(
  aria: string,
  options: { value: T; label: string }[],
  value: T,
  onChange: (v: T) => void,
  cls = '',
): Control<T> & { setOptions(opts: { value: T; label: string }[], value: T): void } {
  const sel = h('select', { class: `aq-select ${cls}`, 'aria-label': aria });
  const fill = (opts: { value: T; label: string }[], v: T) => {
    sel.textContent = '';
    for (const o of opts) {
      const opt = h('option', { value: o.value }, o.label);
      if (o.value === v) opt.selected = true;
      sel.append(opt);
    }
  };
  fill(options, value);
  sel.addEventListener('change', () => onChange(sel.value as T));
  const el = h('div', { class: 'aq-select-wrap' }, sel, icon('chevron', 14, 'aq-select-caret'));
  return {
    el,
    set(v) {
      sel.value = v;
    },
    setOptions: fill,
  };
}

/** − value + stepper. */
export function stepper(aria: string, value: number, min: number, max: number, onChange: (v: number) => void, format = (v: number) => String(v)): Control<number> {
  let cur = value;
  const out = h('output', { class: 'aq-stepper-value', 'aria-live': 'polite' }, format(cur));
  const dec = iconButton('minus', `Fewer ${aria}`, () => change(-1), 'aq-icon-btn aq-stepper-btn');
  const inc = iconButton('plus', `More ${aria}`, () => change(1), 'aq-icon-btn aq-stepper-btn');
  const sync = () => {
    setText(out, format(cur));
    dec.disabled = cur <= min;
    inc.disabled = cur >= max;
  };
  const change = (d: number) => {
    const next = Math.min(max, Math.max(min, cur + d));
    if (next === cur) return;
    cur = next;
    sync();
    onChange(cur);
  };
  const el = h('div', { class: 'aq-stepper', role: 'group', 'aria-label': aria }, dec, out, inc);
  sync();
  return {
    el,
    set(v) {
      cur = v;
      sync();
    },
  };
}

export function iconButton(name: IconName, label: string, onClick: (e: MouseEvent) => void, cls = 'aq-icon-btn'): HTMLButtonElement {
  const b = h('button', { type: 'button', class: cls, 'aria-label': label, title: label }, icon(name, 18));
  b.addEventListener('click', onClick);
  return b;
}

export function button(
  label: string,
  onClick: (e: MouseEvent) => void,
  opts: { icon?: IconName; variant?: 'primary' | 'ghost' | 'quiet' | 'danger'; title?: string; cls?: string } = {},
): HTMLButtonElement {
  const b = h(
    'button',
    { type: 'button', class: `aq-btn aq-btn-${opts.variant ?? 'ghost'} ${opts.cls ?? ''}`, title: opts.title },
    opts.icon ? icon(opts.icon, 16) : null,
    h('span', null, label),
  );
  b.addEventListener('click', onClick);
  return b;
}

/**
 * A button that asks once more before doing something irreversible: the first press turns it
 * into "Confirm …" for a few seconds; the second press acts. No modal dialogs.
 */
export function confirmButton(
  label: string,
  confirmLabel: string,
  onConfirm: () => void,
  opts: { icon?: IconName; variant?: 'primary' | 'ghost' | 'quiet' | 'danger'; cls?: string; title?: string } = {},
): HTMLButtonElement {
  const text = h('span', null, label);
  const b = h(
    'button',
    { type: 'button', class: `aq-btn aq-btn-${opts.variant ?? 'ghost'} ${opts.cls ?? ''}`, title: opts.title ?? label },
    opts.icon ? icon(opts.icon, 16) : null,
    text,
  );
  let armed = false;
  let timer: ReturnType<typeof setTimeout> | null = null;
  const reset = () => {
    armed = false;
    b.classList.remove('is-confirming');
    text.textContent = label;
  };
  b.addEventListener('click', () => {
    if (!armed) {
      armed = true;
      b.classList.add('is-confirming');
      text.textContent = confirmLabel;
      timer = setTimeout(reset, 4000);
      return;
    }
    if (timer) clearTimeout(timer);
    reset();
    onConfirm();
  });
  b.addEventListener('blur', () => {
    if (armed) {
      if (timer) clearTimeout(timer);
      // Let a click that caused the blur land first.
      setTimeout(reset, 150);
    }
  });
  return b;
}

/** A titled section of a panel. */
export function section(title: string | null, ...children: Child[]): HTMLElement {
  return h('section', { class: 'aq-sec' }, title ? h('h3', { class: 'aq-sec-title' }, title) : null, ...children);
}

/** Tabs (role=tablist) with arrow-key navigation. Returns the tab bar and a setter. */
export function tabs<T extends string>(
  aria: string,
  items: { id: T; label: string }[],
  active: T,
  onSelect: (id: T) => void,
): Control<T> & { setLabel(id: T, label: string): void } {
  const el = h('div', { class: 'aq-tabs', role: 'tablist', 'aria-label': aria });
  const btns = new Map<T, HTMLButtonElement>();
  let cur = active;
  const sync = () => {
    for (const [id, b] of btns) {
      const on = id === cur;
      b.setAttribute('aria-selected', String(on));
      b.tabIndex = on ? 0 : -1;
    }
  };
  items.forEach((it, i) => {
    const b = h('button', { type: 'button', role: 'tab', class: 'aq-tab', 'data-tab': it.id }, it.label);
    b.addEventListener('click', () => {
      cur = it.id;
      sync();
      onSelect(it.id);
    });
    b.addEventListener('keydown', (e) => {
      const d = e.key === 'ArrowRight' ? 1 : e.key === 'ArrowLeft' ? -1 : 0;
      if (!d) return;
      e.preventDefault();
      const next = items[(i + d + items.length) % items.length];
      btns.get(next.id)!.focus();
      btns.get(next.id)!.click();
    });
    btns.set(it.id, b);
    el.append(b);
  });
  sync();
  return {
    el,
    set(id) {
      cur = id;
      sync();
    },
    setLabel(id, label) {
      const b = btns.get(id);
      if (b) setText(b, label);
    },
  };
}
